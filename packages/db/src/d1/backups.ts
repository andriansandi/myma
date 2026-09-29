import { ok, err, type Result, type Backup, type BackupDto, type BackupStatus, type Page } from "@myma/types";
import type { D1Database } from "./types.js";
import type { BackupRepository, BackupUpdateInput, CreateBackupInput } from "../repositories.js";
import { newId, nowIso } from "../utils.js";

interface BackupRow {
  id: string;
  instance_id: string;
  node_id: string;
  timestamp: string;
  size: number;
  storage_location: string;
  status: BackupStatus;
  created_at: string;
}

function rowToBackup(row: BackupRow): Backup {
  return {
    id: row.id,
    instance_id: row.instance_id,
    node_id: row.node_id,
    timestamp: row.timestamp,
    size: row.size,
    storage_location: row.storage_location,
    status: row.status,
    created_at: row.created_at,
  };
}

function backupToDto(backup: Backup): BackupDto {
  return { ...backup };
}

export class D1BackupRepository implements BackupRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateBackupInput): Promise<Result<Backup>> {
    const backup: Backup = {
      id: newId(),
      instance_id: input.instance_id,
      node_id: input.node_id,
      timestamp: input.timestamp,
      size: input.size,
      storage_location: input.storage_location,
      status: input.status ?? "RUNNING",
      created_at: nowIso(),
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO backups (
            id, instance_id, node_id, timestamp, size, storage_location, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          backup.id,
          backup.instance_id,
          backup.node_id,
          backup.timestamp,
          backup.size,
          backup.storage_location,
          backup.status,
          backup.created_at,
        )
        .run();
      return ok(backup);
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async getById(id: string): Promise<Result<Backup>> {
    const row = await this.db.prepare("SELECT * FROM backups WHERE id = ?").bind(id).first<BackupRow>();
    if (!row) {
      return err("NOT_FOUND", `Backup ${id} not found`);
    }
    return ok(rowToBackup(row));
  }

  async listForInstance(
    instanceId: string,
    filter: { limit?: number; offset?: number } = {},
  ): Promise<Result<Page<BackupDto>>> {
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const countRow = await this.db
      .prepare("SELECT COUNT(*) as total FROM backups WHERE instance_id = ?")
      .bind(instanceId)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.db
      .prepare("SELECT * FROM backups WHERE instance_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?")
      .bind(instanceId, limit, offset)
      .all<BackupRow>();

    return ok({
      items: (results ?? []).map(rowToBackup).map(backupToDto),
      total,
      offset,
      limit,
    });
  }

  async updateStatus(id: string, status: BackupStatus): Promise<Result<Backup>> {
    await this.db.prepare("UPDATE backups SET status = ? WHERE id = ?").bind(status, id).run();
    return this.getById(id);
  }

  async update(id: string, input: BackupUpdateInput): Promise<Result<Backup>> {
    const setParts: string[] = [];
    const values: unknown[] = [];

    if (input.status !== undefined) {
      setParts.push("status = ?");
      values.push(input.status);
    }
    if (input.size !== undefined) {
      setParts.push("size = ?");
      values.push(input.size);
    }

    if (setParts.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    await this.db.prepare(`UPDATE backups SET ${setParts.join(", ")} WHERE id = ?`).bind(...values).run();
    return this.getById(id);
  }

  async list(filter: { limit?: number; offset?: number } = {}): Promise<Result<Page<BackupDto>>> {
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const countRow = await this.db
      .prepare("SELECT COUNT(*) as total FROM backups")
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.db
      .prepare("SELECT * FROM backups ORDER BY timestamp DESC LIMIT ? OFFSET ?")
      .bind(limit, offset)
      .all<BackupRow>();

    return ok({
      items: (results ?? []).map(rowToBackup).map(backupToDto),
      total,
      offset,
      limit,
    });
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
