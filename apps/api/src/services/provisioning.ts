import { createInstanceSchema } from "@myma/validation";
import type {
  ActivityAction,
  CreateInstanceRequest,
  CreateInstanceInput,
  Instance,
  InstanceStatus,
  Result,
  VpsNode,
} from "@myma/types";
import { err, ok } from "@myma/types";
import { nowIso } from "../utils.js";
import type { Deps } from "../env.js";
import { InstanceService } from "./instance.js";

export class ProvisioningService {
  constructor(private readonly deps: Deps) {}

  async provision(raw: unknown): Promise<Result<Instance>> {
    const parsed = createInstanceSchema.safeParse(raw);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const existing = await this.deps.repos.instances.getByHostname(input.hostname);
    if (existing.ok) {
      const status = existing.value.status;
      if (status !== "FAILED" && status !== "DELETING" && status !== "DELETED") {
        return ok(existing.value);
      }
      // Retry a previously failed instance.
      await this.deps.repos.instances.update(existing.value.id, {
        docker_project: input.docker_project ?? slugFromHostname(input.hostname),
      });
      await this.deps.repos.instances.updateStatus(existing.value.id, "PROVISIONING");
      await this.deps.repos.instances.update(existing.value.id, { provision_error: null });
      return this.runProvisioning(existing.value, input);
    }

    const createResult = await new InstanceService(this.deps).create(input);
    if (!createResult.ok) return createResult;

    await this.log(createResult.value, "instance.created", "success");
    return this.runProvisioning(createResult.value, input);
  }

  async start(instanceId: string): Promise<Result<Instance>> {
    return this.agentAction(instanceId, "start", "ACTIVE");
  }

  async stop(instanceId: string): Promise<Result<Instance>> {
    return this.agentAction(instanceId, "stop", "STOPPED");
  }

  async restart(instanceId: string): Promise<Result<Instance>> {
    return this.agentAction(instanceId, "restart", "ACTIVE");
  }

  async reset(instanceId: string): Promise<Result<Instance>> {
    const instanceRes = await this.deps.repos.instances.getById(instanceId);
    if (!instanceRes.ok) return instanceRes;
    const instance = instanceRes.value;

    const nodeRes = await this.deps.repos.nodes.getById(instance.node_id);
    if (!nodeRes.ok) return nodeRes;
    const node = nodeRes.value;

    const request = await this.buildAgentRequest(instance, node);
    if (!request.ok) return request;

    const resetRes = await this.deps.agent.reset(node, instanceId, request.value);
    if (!resetRes.ok) {
      await this.fail(instance, "AGENT_RESET", resetRes.error.message);
      return resetRes;
    }

    await this.log(instance, "instance.reset", "success");
    const updated = await this.deps.repos.instances.updateStatus(instanceId, "PROVISIONING");
    return updated;
  }

  async delete(instanceId: string): Promise<Result<Instance>> {
    const instanceRes = await this.deps.repos.instances.getById(instanceId);
    if (!instanceRes.ok) return instanceRes;
    const instance = instanceRes.value;

    const nodeRes = await this.deps.repos.nodes.getById(instance.node_id);
    if (!nodeRes.ok) return nodeRes;
    const node = nodeRes.value;

    await this.deps.repos.instances.updateStatus(instanceId, "DELETING");
    const deleteRes = await this.deps.agent.delete(node, instanceId);
    if (!deleteRes.ok) {
      await this.deps.repos.instances.updateStatus(instanceId, "FAILED");
      await this.log(instance, "instance.deleted", "error", deleteRes.error.message);
      return deleteRes;
    }

    await this.deps.repos.instances.updateStatus(instanceId, "DELETED");
    await this.log(instance, "instance.deleted", "success");
    return this.deps.repos.instances.getById(instanceId);
  }

  private async runProvisioning(instance: Instance, input: CreateInstanceInput): Promise<Result<Instance>> {
    const nodeRes = await this.deps.repos.nodes.getById(input.node_id);
    if (!nodeRes.ok) {
      return this.fail(instance, "NODE_LOOKUP", nodeRes.error.message);
    }
    const node = nodeRes.value;

    const request = await this.buildAgentRequest(instance, node);
    if (!request.ok) {
      return this.fail(instance, "BUILD_REQUEST", request.error.message);
    }

    await this.log(instance, "instance.provision_started", "success");

    const createRes = await this.deps.agent.createInstance(node, request.value);
    if (!createRes.ok) {
      return this.fail(instance, "AGENT_CREATE", createRes.error.message);
    }

    const pollRes = await this.pollUntilActive(node, instance.id);
    if (!pollRes.ok) {
      return this.fail(instance, "AGENT_POLL", pollRes.error.message);
    }

    const dns = await this.deps.dns.createRecord(input.hostname, node.ip_address);
    if (!dns.ok) {
      await this.fail(instance, "dns", dns.error.message);
      return err("DNS_ERROR", dns.error.message);
    }

    const active = await this.deps.repos.instances.updateStatus(instance.id, "ACTIVE");
    if (!active.ok) return active;

    await this.log(instance, "instance.provision_completed", "success");
    return active;
  }

  private async buildAgentRequest(
    instance: Instance,
    node: VpsNode,
  ): Promise<Result<CreateInstanceRequest>> {
    const studentRes = await this.deps.repos.students.getById(instance.student_id);
    if (!studentRes.ok) {
      return studentRes;
    }

    return ok({
      instance_id: instance.id,
      docker_project: instance.docker_project,
      hostname: instance.hostname,
      moodle_version: instance.moodle_version,
      database_name: instance.database_name,
      cpu_limit: instance.cpu_limit,
      memory_limit: instance.memory_limit,
      storage_limit: instance.storage_limit,
      db_host: node.ip_address,
      db_port: 3306,
      db_password: generatePassword(32),
      moodle_admin_user: "admin",
      moodle_admin_password: generatePassword(32),
      moodle_admin_email: studentRes.value.email,
    });
  }

  private async pollUntilActive(node: VpsNode, instanceId: string): Promise<Result<void>> {
    const config = this.deps.provisioningConfig ?? { pollIntervalMs: 5000, maxAttempts: 120 };
    const intervalMs = config.pollIntervalMs;
    const maxAttempts = config.maxAttempts;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await this.sleep(intervalMs);
      }

      const statusRes = await this.deps.agent.getStatus(node, instanceId);
      if (!statusRes.ok) {
        return err("PROVISIONING_ERROR", statusRes.error.message);
      }

      const status = statusRes.value.status;
      if (status === "ACTIVE" || status === "RUNNING") {
        return ok(undefined);
      }
      if (status === "FAILED") {
        return err("PROVISIONING_ERROR", "agent reported instance as failed");
      }
    }

    return err("PROVISIONING_ERROR", "provisioning timed out");
  }

  private actionToLogAction(action: "start" | "stop" | "restart"): ActivityAction {
    switch (action) {
      case "start":
        return "instance.started";
      case "stop":
        return "instance.stopped";
      case "restart":
        return "instance.restarted";
    }
  }

  private async agentAction(
    instanceId: string,
    action: "start" | "stop" | "restart",
    targetStatus: InstanceStatus,
  ): Promise<Result<Instance>> {
    const instanceRes = await this.deps.repos.instances.getById(instanceId);
    if (!instanceRes.ok) return instanceRes;
    const instance = instanceRes.value;

    const nodeRes = await this.deps.repos.nodes.getById(instance.node_id);
    if (!nodeRes.ok) return nodeRes;
    const node = nodeRes.value;

    const actionRes = await this.deps.agent[action](node, instanceId);
    if (!actionRes.ok) {
      await this.log(instance, this.actionToLogAction(action), "error", actionRes.error.message);
      return actionRes;
    }

    const updated = await this.deps.repos.instances.updateStatus(instanceId, targetStatus);
    if (!updated.ok) return updated;

    await this.log(instance, this.actionToLogAction(action), "success");
    return updated;
  }

  private async fail(instance: Instance, failedStep: string, message: string): Promise<Result<Instance>> {
    const errorText = `${failedStep}: ${message}`;
    await this.deps.repos.instances.update(instance.id, { provision_error: errorText });
    const updated = await this.deps.repos.instances.updateStatus(instance.id, "FAILED");
    await this.log(instance, "instance.provision_failed", "error", errorText);
    if (!updated.ok) return updated;
    return err("PROVISIONING_ERROR", message, { failed_step: failedStep });
  }

  private async log(
    instance: Instance,
    action: ActivityAction,
    status: "success" | "error",
    error?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.repos.activityLogs.append({
      actor: "system",
      action,
      instance_id: instance.id,
      node_id: instance.node_id,
      status,
      error: error ?? null,
      metadata: JSON.stringify({
        hostname: instance.hostname,
        docker_project: instance.docker_project,
        moodle_version: instance.moodle_version,
        ...metadata,
      }),
      timestamp: nowIso(),
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function slugFromHostname(hostname: string): string {
  return hostname.split(".")[0] ?? hostname;
}

function generatePassword(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, length);
}
