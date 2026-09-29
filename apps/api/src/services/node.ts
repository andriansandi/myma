import { registerNodeSchema } from "@myma/validation";
import type { NodeDto, NodeStatus, Page, Result, VpsNode } from "@myma/types";
import { err, ok } from "@myma/types";
import type { Deps } from "../env.js";
import { nowIso } from "../utils.js";

export class NodeService {
  constructor(private readonly deps: Deps) {}

  async create(raw: unknown): Promise<Result<NodeDto>> {
    const parsed = registerNodeSchema.safeParse(raw);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const health = await this.deps.agent.healthCheck({
      id: "",
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
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    const createResult = await this.deps.repos.nodes.create(input);
    if (!createResult.ok) return createResult;

    const node = createResult.value;
    if (!health.ok) {
      await this.deps.repos.nodes.updateStatus(node.id, "OFFLINE");
    }

    await this.logNodeEvent(node, health.ok ? "success" : "error", health.ok ? undefined : health.error.message);
    const latest = await this.deps.repos.nodes.getById(node.id);
    if (!latest.ok) return latest;
    return ok(toNodeDto(latest.value));
  }

  async list(): Promise<Result<Page<NodeDto>>> {
    const result = await this.deps.repos.nodes.list();
    if (!result.ok) return result;
    const items = result.value.map(toNodeDto);
    return ok({
      items,
      total: items.length,
      offset: 0,
      limit: items.length,
    });
  }

  getById(id: string): Promise<Result<VpsNode>> {
    return this.deps.repos.nodes.getById(id);
  }

  updateStatus(id: string, status: NodeStatus): Promise<Result<VpsNode>> {
    return this.deps.repos.nodes.updateStatus(id, status);
  }

  updateUsage(
    id: string,
    usage: { cpu_used: number; memory_used: number; storage_used: number },
  ): Promise<Result<VpsNode>> {
    return this.deps.repos.nodes.updateUsage(id, usage);
  }

  private async logNodeEvent(
    node: VpsNode,
    status: "success" | "error",
    error?: string,
  ): Promise<void> {
    await this.deps.repos.activityLogs.append({
      actor: "system",
      action: "node.registered",
      node_id: node.id,
      status,
      error: error ?? null,
      metadata: JSON.stringify({
        hostname: node.hostname,
        agent_url: node.agent_url,
        node_status: node.status,
      }),
      timestamp: nowIso(),
    });
  }
}

function toNodeDto(node: VpsNode): NodeDto {
  const { agent_key_id: _omit, ...dto } = node;
  void _omit;
  return dto;
}
