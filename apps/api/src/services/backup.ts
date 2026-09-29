import { ok, type Result } from "@myma/types";
import type { Backup, BackupDto, Instance, Page } from "@myma/types";
import type { Deps } from "../env.js";
import { nowIso } from "../utils.js";

export class BackupService {
  constructor(private readonly deps: Deps) {}

  async backup(instanceId: string): Promise<Result<Backup>> {
    const instanceRes = await this.deps.repos.instances.getById(instanceId);
    if (!instanceRes.ok) return instanceRes;
    const instance = instanceRes.value;

    const nodeRes = await this.deps.repos.nodes.getById(instance.node_id);
    if (!nodeRes.ok) return nodeRes;
    const node = nodeRes.value;

    const timestamp = nowIso();
    const storageLocation = `backups/${instanceId}/${timestamp}.tar.gz`;

    const running = await this.deps.repos.backups.create({
      instance_id: instanceId,
      node_id: node.id,
      timestamp,
      size: 0,
      storage_location: storageLocation,
      status: "RUNNING",
    });
    if (!running.ok) return running;

    await this.log(instance, "instance.backup_started", "success");

    const upload = await this.deps.storage.createUploadUrl(storageLocation);
    if (!upload.ok) {
      await this.deps.repos.backups.update(running.value.id, { status: "FAILED" });
      await this.log(instance, "instance.backup_started", "error", upload.error.message);
      return upload;
    }

    const agentRes = await this.deps.agent.backup(node, instanceId, upload.value.url, upload.value.headers);
    if (!agentRes.ok) {
      await this.deps.repos.backups.update(running.value.id, { status: "FAILED" });
      await this.log(instance, "instance.backup_started", "error", agentRes.error.message);
      return agentRes;
    }

    const completed = await this.deps.repos.backups.update(running.value.id, {
      status: "COMPLETED",
      size: agentRes.value.size,
    });
    if (!completed.ok) return completed;

    await this.log(instance, "instance.backup_completed", "success", undefined, {
      backup_id: running.value.id,
      size: agentRes.value.size,
      storage_location: storageLocation,
    });

    await this.deps.repos.instances.update(instanceId, { last_backup_at: timestamp });
    return completed;
  }

  list(filter?: { limit?: number; offset?: number }): Promise<Result<Page<BackupDto>>> {
    return this.deps.repos.backups.list(filter);
  }

  async restore(instanceId: string, backupId: string): Promise<Result<Instance>> {
    const instanceRes = await this.deps.repos.instances.getById(instanceId);
    if (!instanceRes.ok) return instanceRes;
    const instance = instanceRes.value;

    const backupRes = await this.deps.repos.backups.getById(backupId);
    if (!backupRes.ok) return backupRes;
    const backup = backupRes.value;

    const nodeRes = await this.deps.repos.nodes.getById(instance.node_id);
    if (!nodeRes.ok) return nodeRes;
    const node = nodeRes.value;

    const download = await this.deps.storage.createDownloadUrl(backup.storage_location);
    if (!download.ok) return download;

    const restoreRes = await this.deps.agent.restore(node, instanceId, download.value);
    if (!restoreRes.ok) {
      await this.log(instance, "instance.restored", "error", restoreRes.error.message);
      return restoreRes;
    }

    await this.log(instance, "instance.restored", "success", undefined, {
      backup_id: backupId,
      storage_location: backup.storage_location,
    });
    return ok(instance);
  }

  private async log(
    instance: Instance,
    action: "instance.backup_started" | "instance.backup_completed" | "instance.restored",
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
        ...metadata,
      }),
      timestamp: nowIso(),
    });
  }
}
