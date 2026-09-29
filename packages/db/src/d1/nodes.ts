import { ok, err, type Result, type VpsNode, type NodeStatus, type RegisterNodeInput } from "@myma/types";
import type { D1Database } from "./types.js";
import type { NodeRepository, UpdateNodeInput } from "../repositories.js";
import { newId, nowIso } from "../utils.js";

interface NodeRow {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  agent_url: string;
  agent_key_id: string;
  status: NodeStatus;
  cpu_total: number;
  memory_total: number;
  storage_total: number;
  cpu_used: number;
  memory_used: number;
  storage_used: number;
  created_at: string;
  updated_at: string;
}

function rowToNode(row: NodeRow): VpsNode {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ip_address: row.ip_address,
    agent_url: row.agent_url,
    agent_key_id: row.agent_key_id,
    status: row.status,
    cpu_total: row.cpu_total,
    memory_total: row.memory_total,
    storage_total: row.storage_total,
    cpu_used: row.cpu_used,
    memory_used: row.memory_used,
    storage_used: row.storage_used,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class D1NodeRepository implements NodeRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: RegisterNodeInput): Promise<Result<VpsNode>> {
    const id = newId();
    const now = nowIso();
    const node: VpsNode = {
      id,
      name: input.name,
      hostname: input.hostname,
      ip_address: input.ip_address,
      agent_url: input.agent_url,
      agent_key_id: input.agent_key_id,
      status: "ACTIVE",
      cpu_total: input.cpu_total,
      memory_total: input.memory_total,
      storage_total: input.storage_total,
      cpu_used: 0,
      memory_used: 0,
      storage_used: 0,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO vps_nodes (
            id, name, hostname, ip_address, agent_url, agent_key_id, status,
            cpu_total, memory_total, storage_total,
            cpu_used, memory_used, storage_used, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          node.id,
          node.name,
          node.hostname,
          node.ip_address,
          node.agent_url,
          node.agent_key_id,
          node.status,
          node.cpu_total,
          node.memory_total,
          node.storage_total,
          node.cpu_used,
          node.memory_used,
          node.storage_used,
          node.created_at,
          node.updated_at,
        )
        .run();
      return ok(node);
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async list(): Promise<Result<VpsNode[]>> {
    const { results } = await this.db
      .prepare("SELECT * FROM vps_nodes ORDER BY created_at DESC")
      .all<NodeRow>();
    return ok((results ?? []).map(rowToNode));
  }

  async getById(id: string): Promise<Result<VpsNode>> {
    const row = await this.db.prepare("SELECT * FROM vps_nodes WHERE id = ?").bind(id).first<NodeRow>();
    if (!row) {
      return err("NOT_FOUND", `Node ${id} not found`);
    }
    return ok(rowToNode(row));
  }

  async update(id: string, input: UpdateNodeInput): Promise<Result<VpsNode>> {
    const setFields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      setFields.push("name = ?");
      values.push(input.name);
    }
    if (input.hostname !== undefined) {
      setFields.push("hostname = ?");
      values.push(input.hostname);
    }
    if (input.ip_address !== undefined) {
      setFields.push("ip_address = ?");
      values.push(input.ip_address);
    }
    if (input.agent_url !== undefined) {
      setFields.push("agent_url = ?");
      values.push(input.agent_url);
    }
    if (input.agent_key_id !== undefined) {
      setFields.push("agent_key_id = ?");
      values.push(input.agent_key_id);
    }

    if (setFields.length === 0) {
      return this.getById(id);
    }

    values.push(nowIso(), id);

    await this.db
      .prepare(`UPDATE vps_nodes SET ${setFields.join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...values)
      .run();

    return this.getById(id);
  }

  async updateStatus(id: string, status: NodeStatus): Promise<Result<VpsNode>> {
    await this.db
      .prepare("UPDATE vps_nodes SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, nowIso(), id)
      .run();
    return this.getById(id);
  }

  async updateUsage(
    id: string,
    usage: { cpu_used: number; memory_used: number; storage_used: number },
  ): Promise<Result<VpsNode>> {
    await this.db
      .prepare("UPDATE vps_nodes SET cpu_used = ?, memory_used = ?, storage_used = ?, updated_at = ? WHERE id = ?")
      .bind(usage.cpu_used, usage.memory_used, usage.storage_used, nowIso(), id)
      .run();
    return this.getById(id);
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
