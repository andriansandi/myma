import {
  ok,
  err,
  type Result,
  type Instance,
  type InstanceDto,
  type InstanceStatus,
  type CreateInstanceInput,
  type Page,
} from "@myma/types";
import type { D1Database } from "./types.js";
import type { InstanceRepository, InstanceListFilter, UpdateInstanceInput } from "../repositories.js";
import { newId, nowIso } from "../utils.js";

interface InstanceRow {
  id: string;
  student_id: string;
  node_id: string;
  hostname: string;
  docker_project: string;
  moodle_version: string;
  database_name: string;
  status: InstanceStatus;
  cpu_limit: number;
  memory_limit: number;
  storage_limit: number;
  storage_used: number;
  provision_error: string | null;
  created_at: string;
  updated_at: string;
  last_backup_at: string | null;
}

function rowToInstance(row: InstanceRow): Instance {
  return {
    id: row.id,
    student_id: row.student_id,
    node_id: row.node_id,
    hostname: row.hostname,
    docker_project: row.docker_project,
    moodle_version: row.moodle_version,
    database_name: row.database_name,
    status: row.status,
    cpu_limit: row.cpu_limit,
    memory_limit: row.memory_limit,
    storage_limit: row.storage_limit,
    storage_used: row.storage_used,
    provision_error: row.provision_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_backup_at: row.last_backup_at,
  };
}

function instanceToDto(instance: Instance): InstanceDto {
  return { ...instance };
}

export class D1InstanceRepository implements InstanceRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateInstanceInput): Promise<Result<Instance>> {
    const id = newId();
    const now = nowIso();
    const databaseName = `moodle_${id.replaceAll("-", "_")}`;
    const dockerProject = input.docker_project ?? input.hostname.split(".")[0] ?? id;

    const instance: Instance = {
      id,
      student_id: input.student_id,
      node_id: input.node_id,
      hostname: input.hostname,
      docker_project: dockerProject,
      moodle_version: input.moodle_version,
      database_name: databaseName,
      status: "PROVISIONING",
      cpu_limit: input.cpu_limit,
      memory_limit: input.memory_limit,
      storage_limit: input.storage_limit,
      storage_used: 0,
      provision_error: null,
      created_at: now,
      updated_at: now,
      last_backup_at: null,
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO instances (
            id, student_id, node_id, hostname, docker_project, moodle_version, database_name,
            status, cpu_limit, memory_limit, storage_limit, storage_used, provision_error,
            created_at, updated_at, last_backup_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          instance.id,
          instance.student_id,
          instance.node_id,
          instance.hostname,
          instance.docker_project,
          instance.moodle_version,
          instance.database_name,
          instance.status,
          instance.cpu_limit,
          instance.memory_limit,
          instance.storage_limit,
          instance.storage_used,
          instance.provision_error,
          instance.created_at,
          instance.updated_at,
          instance.last_backup_at,
        )
        .run();
      return ok(instance);
    } catch (e) {
      if (isUniqueConstraintError(e, "instances.hostname")) {
        return err("CONFLICT", "An instance with this hostname already exists");
      }
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async list(filter: InstanceListFilter = {}): Promise<Result<Page<InstanceDto>>> {
    const { where, params } = buildInstanceFilter(filter);
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as total FROM instances ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.db
      .prepare(`SELECT * FROM instances ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all<InstanceRow>();

    return ok({
      items: (results ?? []).map(rowToInstance).map(instanceToDto),
      total,
      offset,
      limit,
    });
  }

  async getById(id: string): Promise<Result<Instance>> {
    const row = await this.db.prepare("SELECT * FROM instances WHERE id = ?").bind(id).first<InstanceRow>();
    if (!row) {
      return err("NOT_FOUND", `Instance ${id} not found`);
    }
    return ok(rowToInstance(row));
  }

  async getByHostname(hostname: string): Promise<Result<Instance>> {
    const row = await this.db
      .prepare("SELECT * FROM instances WHERE hostname = ?")
      .bind(hostname)
      .first<InstanceRow>();
    if (!row) {
      return err("NOT_FOUND", `Instance ${hostname} not found`);
    }
    return ok(rowToInstance(row));
  }

  async update(id: string, input: UpdateInstanceInput): Promise<Result<Instance>> {
    const setParts: string[] = [];
    const values: unknown[] = [];

    if (input.hostname !== undefined) {
      setParts.push("hostname = ?");
      values.push(input.hostname);
    }
    if (input.docker_project !== undefined) {
      setParts.push("docker_project = ?");
      values.push(input.docker_project);
    }
    if (input.moodle_version !== undefined) {
      setParts.push("moodle_version = ?");
      values.push(input.moodle_version);
    }
    if (input.database_name !== undefined) {
      setParts.push("database_name = ?");
      values.push(input.database_name);
    }
    if (input.cpu_limit !== undefined) {
      setParts.push("cpu_limit = ?");
      values.push(input.cpu_limit);
    }
    if (input.memory_limit !== undefined) {
      setParts.push("memory_limit = ?");
      values.push(input.memory_limit);
    }
    if (input.storage_limit !== undefined) {
      setParts.push("storage_limit = ?");
      values.push(input.storage_limit);
    }
    if (input.last_backup_at !== undefined) {
      setParts.push("last_backup_at = ?");
      values.push(input.last_backup_at);
    }
    if (input.provision_error !== undefined) {
      setParts.push("provision_error = ?");
      values.push(input.provision_error);
    }

    if (setParts.length === 0) {
      return this.getById(id);
    }

    values.push(nowIso(), id);

    await this.db
      .prepare(`UPDATE instances SET ${setParts.join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...values)
      .run();

    return this.getById(id);
  }

  async updateStatus(id: string, status: InstanceStatus): Promise<Result<Instance>> {
    await this.db
      .prepare("UPDATE instances SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, nowIso(), id)
      .run();
    return this.getById(id);
  }

  async countByStatus(): Promise<Result<Record<InstanceStatus, number>>> {
    const { results } = await this.db
      .prepare("SELECT status, COUNT(*) as count FROM instances GROUP BY status")
      .all<{ status: InstanceStatus; count: number }>();

    const counts: Record<InstanceStatus, number> = {
      PROVISIONING: 0,
      ACTIVE: 0,
      STOPPED: 0,
      SUSPENDED: 0,
      FAILED: 0,
      DELETING: 0,
      DELETED: 0,
    };

    for (const row of results ?? []) {
      counts[row.status] = row.count;
    }

    return ok(counts);
  }
}

function buildInstanceFilter(filter: InstanceListFilter): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.status !== undefined) {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  if (filter.student_id !== undefined) {
    conditions.push("student_id = ?");
    params.push(filter.student_id);
  }
  if (filter.node_id !== undefined) {
    conditions.push("node_id = ?");
    params.push(filter.node_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function isUniqueConstraintError(e: unknown, column: string): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed") && e.message.includes(column);
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
