import { ok, err, type Result, type ActivityLogDto, type Page } from "@myma/types";
import type { D1Database } from "./types.js";
import type { ActivityLogRepository, ActivityListFilter, CreateActivityLogInput } from "../repositories.js";
import { newId } from "../utils.js";

interface ActivityLogRow {
  id: string;
  actor: string;
  action: string;
  instance_id: string | null;
  node_id: string | null;
  status: string;
  error: string | null;
  metadata: string;
  timestamp: string;
}

function rowToActivityLog(row: ActivityLogRow): ActivityLogDto {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action as ActivityLogDto["action"],
    instance_id: row.instance_id,
    node_id: row.node_id,
    status: row.status as ActivityLogDto["status"],
    error: row.error,
    metadata: row.metadata,
    timestamp: row.timestamp,
  };
}

export class D1ActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly db: D1Database) {}

  async append(input: CreateActivityLogInput): Promise<Result<ActivityLogDto>> {
    const log: ActivityLogDto = {
      id: newId(),
      actor: input.actor,
      action: input.action,
      instance_id: input.instance_id ?? null,
      node_id: input.node_id ?? null,
      status: input.status,
      error: input.error ?? null,
      metadata: input.metadata ?? "{}",
      timestamp: input.timestamp,
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO activity_logs (
            id, actor, action, instance_id, node_id, status, error, metadata, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          log.id,
          log.actor,
          log.action,
          log.instance_id,
          log.node_id,
          log.status,
          log.error,
          log.metadata,
          log.timestamp,
        )
        .run();
      return ok(log);
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async list(filter: ActivityListFilter = {}): Promise<Result<Page<ActivityLogDto>>> {
    const { where, params } = buildActivityFilter(filter);
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as total FROM activity_logs ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    const { results } = await this.db
      .prepare(`SELECT * FROM activity_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all<ActivityLogRow>();

    return ok({
      items: (results ?? []).map(rowToActivityLog),
      total,
      offset,
      limit,
    });
  }
}

function buildActivityFilter(filter: ActivityListFilter): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.instance_id !== undefined) {
    conditions.push("instance_id = ?");
    params.push(filter.instance_id);
  }
  if (filter.node_id !== undefined) {
    conditions.push("node_id = ?");
    params.push(filter.node_id);
  }
  if (filter.action !== undefined) {
    conditions.push("action = ?");
    params.push(filter.action);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
