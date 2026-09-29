import { ok, err, type Result, type InstanceResources, type Page } from "@myma/types";
import type { D1Database } from "./types.js";
import type { InstanceResourcesRepository, CreateInstanceResourcesInput } from "../repositories.js";
import { newId } from "../utils.js";

interface InstanceResourcesRow {
  id: string;
  instance_id: string;
  node_id: string;
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  db_size: number;
  recorded_at: string;
}

function rowToInstanceResources(row: InstanceResourcesRow): InstanceResources {
  return {
    id: row.id,
    instance_id: row.instance_id,
    node_id: row.node_id,
    cpu_usage: row.cpu_usage,
    memory_usage: row.memory_usage,
    storage_usage: row.storage_usage,
    db_size: row.db_size,
    recorded_at: row.recorded_at,
  };
}

export class D1InstanceResourcesRepository implements InstanceResourcesRepository {
  constructor(private readonly db: D1Database) {}

  async insert(input: CreateInstanceResourcesInput): Promise<Result<InstanceResources>> {
    const resources: InstanceResources = { ...input, id: newId() };

    try {
      await this.db
        .prepare(
          `INSERT INTO instance_resources (
            id, instance_id, node_id, cpu_usage, memory_usage, storage_usage, db_size, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          resources.id,
          resources.instance_id,
          resources.node_id,
          resources.cpu_usage,
          resources.memory_usage,
          resources.storage_usage,
          resources.db_size,
          resources.recorded_at,
        )
        .run();
      return ok(resources);
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async latestForInstance(instanceId: string): Promise<Result<InstanceResources | null>> {
    const row = await this.db
      .prepare(
        `SELECT * FROM instance_resources
         WHERE instance_id = ?
         ORDER BY recorded_at DESC LIMIT 1`,
      )
      .bind(instanceId)
      .first<InstanceResourcesRow>();
    return ok(row ? rowToInstanceResources(row) : null);
  }

  async listForInstance(
    instanceId: string,
    filter: { limit?: number; offset?: number } = {},
  ): Promise<Result<Page<InstanceResources>>> {
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const countRow = await this.db
      .prepare("SELECT COUNT(*) as total FROM instance_resources WHERE instance_id = ?")
      .bind(instanceId)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM instance_resources
         WHERE instance_id = ?
         ORDER BY recorded_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(instanceId, limit, offset)
      .all<InstanceResourcesRow>();

    return ok({
      items: (results ?? []).map(rowToInstanceResources),
      total,
      offset,
      limit,
    });
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
