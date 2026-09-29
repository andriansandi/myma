import { describe, it, expect } from "vitest";
import { err } from "@myma/types";
import { ProvisioningService } from "../src/services/provisioning.js";
import { createFakeDeps, FakeAgentService, FakeDnsProvider, FakeInstanceRepository } from "./fakes.js";
import type { CreateInstanceInput } from "@myma/types";

async function setupNodeAndStudent(deps: ReturnType<typeof createFakeDeps>) {
  const student = await deps.repos.students.create({ name: "Sandi", email: "sandi@example.com" });
  const node = await deps.repos.nodes.create({
    name: "Node",
    hostname: "node.myma.id",
    ip_address: "192.0.2.1",
    agent_url: "https://agent.node.myma.id",
    agent_key_id: "key",
    cpu_total: 4,
    memory_total: 16_000_000_000,
    storage_total: 100_000_000_000,
  });
  if (!student.ok || !node.ok) throw new Error("setup failed");
  return { student: student.value, node: node.value };
}

function instanceInput(nodeId: string, studentId: string): CreateInstanceInput {
  return {
    student_id: studentId,
    node_id: nodeId,
    hostname: "sandi.myma.id",
    moodle_version: "4.5.1",
    cpu_limit: 1,
    memory_limit: 1_000_000_000,
    storage_limit: 10_000_000_000,
  };
}

describe("ProvisioningService", () => {
  it("provisions an instance to ACTIVE and logs completion", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 } });
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    const result = await service.provision(instanceInput(node.id, student.id));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ACTIVE");

    const logs = await deps.repos.activityLogs.list({ instance_id: result.value.id });
    expect(logs.ok).toBe(true);
    if (!logs.ok) return;
    const actions = logs.value.items.map((l) => l.action);
    expect(actions).toContain("instance.created");
    expect(actions).toContain("instance.provision_started");
    expect(actions).toContain("instance.provision_completed");

    expect((deps.dns as unknown as FakeDnsProvider).records).toContainEqual({
      hostname: "sandi.myma.id",
      target: "192.0.2.1",
    });
  });

  it("does not persist generated secrets", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 } });
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    await service.provision(instanceInput(node.id, student.id));
    const fakeInstances = deps.repos.instances as unknown as FakeInstanceRepository;
    const instance = Array.from(fakeInstances.instances.values())[0];
    expect(instance).toBeDefined();
    if (!instance) throw new Error("instance not created");
    expect(JSON.stringify(instance)).not.toContain("password");

    const activity = await deps.repos.activityLogs.list({ instance_id: instance.id });
    expect(activity.ok).toBe(true);
    if (!activity.ok) return;
    for (const log of activity.value.items) {
      expect(log.metadata).not.toContain("password");
    }
  });

  it("fails gracefully and records provision_error", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 2 } });
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    (deps.agent as unknown as FakeAgentService).createInstance = async () =>
      err("AGENT_ERROR", "docker exploded");

    const result = await service.provision(instanceInput(node.id, student.id));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROVISIONING_ERROR");

    const fakeInstances = deps.repos.instances as unknown as FakeInstanceRepository;
    const instance = Array.from(fakeInstances.instances.values())[0];
    if (!instance) throw new Error("instance not created");
    expect(instance.status).toBe("FAILED");
    expect(instance.provision_error).toContain("docker exploded");

    const logs = await deps.repos.activityLogs.list({ instance_id: instance.id });
    expect(logs.ok).toBe(true);
    if (!logs.ok) return;
    expect(logs.value.items.some((l) => l.action === "instance.provision_failed")).toBe(true);
  });

  it("is idempotent for an in-flight or active instance", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 } });
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    const first = await service.provision(instanceInput(node.id, student.id));
    expect(first.ok).toBe(true);
    const input = instanceInput(node.id, student.id);
    const second = await service.provision(input);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);

    const list = await deps.repos.instances.list();
    expect(list.ok && list.value.total).toBe(1);
  });

  it("retries a FAILED instance", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 } });
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    const first = await service.provision(instanceInput(node.id, student.id));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await deps.repos.instances.updateStatus(first.value.id, "FAILED");

    const retry = await service.provision(instanceInput(node.id, student.id));
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.id).toBe(first.value.id);
    expect(retry.value.status).toBe("ACTIVE");
  });

  it("marks instance FAILED when DNS fails and retries DNS on subsequent provision", async () => {
    const deps = createFakeDeps({ provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 } });
    const fakeDns = deps.dns as unknown as FakeDnsProvider;
    fakeDns.shouldFailCreate = true;
    const { node, student } = await setupNodeAndStudent(deps);
    const service = new ProvisioningService(deps);

    const first = await service.provision(instanceInput(node.id, student.id));
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.code).toBe("DNS_ERROR");

    const fakeInstances = deps.repos.instances as unknown as FakeInstanceRepository;
    const instance = Array.from(fakeInstances.instances.values())[0];
    if (!instance) throw new Error("instance not created");
    expect(instance.status).toBe("FAILED");
    expect(instance.provision_error).toContain("simulated DNS provider failure");

    const logs = await deps.repos.activityLogs.list({ instance_id: instance.id });
    expect(logs.ok).toBe(true);
    if (!logs.ok) return;
    expect(logs.value.items.some((l) => l.action === "instance.provision_failed")).toBe(true);

    // Retry after DNS recovers should succeed and be idempotent (single DNS record).
    fakeDns.shouldFailCreate = false;
    const retry = await service.provision(instanceInput(node.id, student.id));
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.status).toBe("ACTIVE");
    expect(fakeDns.records).toHaveLength(1);
  });
});
