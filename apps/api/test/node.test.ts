import { describe, it, expect } from "vitest";
import { NodeService } from "../src/services/node.js";
import { createFakeDeps, FakeAgentService } from "./fakes.js";

describe("NodeService", () => {
  it("registers an ACTIVE node when the agent is healthy", async () => {
    const deps = createFakeDeps();
    const service = new NodeService(deps);

    const result = await service.create({
      name: "Node A",
      hostname: "node-a.myma.id",
      ip_address: "192.0.2.1",
      agent_url: "https://agent.node-a.myma.id",
      agent_key_id: "key-a",
      cpu_total: 4,
      memory_total: 16_000_000_000,
      storage_total: 100_000_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ACTIVE");

    const logs = await deps.repos.activityLogs.list({ action: "node.registered" });
    expect(logs.ok && logs.value.items.length).toBe(1);
  });

  it("registers an OFFLINE node when the agent health check fails", async () => {
    const deps = createFakeDeps();
    (deps.agent as unknown as FakeAgentService).healthOk = false;
    const service = new NodeService(deps);

    const result = await service.create({
      name: "Node B",
      hostname: "node-b.myma.id",
      ip_address: "192.0.2.2",
      agent_url: "https://agent.node-b.myma.id",
      agent_key_id: "key-b",
      cpu_total: 2,
      memory_total: 8_000_000_000,
      storage_total: 50_000_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("OFFLINE");
  });

  it("create() response does not expose agent_key_id", async () => {
    const deps = createFakeDeps();
    const service = new NodeService(deps);

    const result = await service.create({
      name: "Node C",
      hostname: "node-c.myma.id",
      ip_address: "192.0.2.3",
      agent_url: "https://agent.node-c.myma.id",
      agent_key_id: "secret-key",
      cpu_total: 2,
      memory_total: 8_000_000_000,
      storage_total: 50_000_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("agent_key_id");
    expect(JSON.stringify(result.value)).not.toContain("secret-key");
  });

  it("list() returns a Page of NodeDto without agent_key_id", async () => {
    const deps = createFakeDeps();
    await deps.repos.nodes.create({
      name: "Node D",
      hostname: "node-d.myma.id",
      ip_address: "192.0.2.4",
      agent_url: "https://agent.node-d.myma.id",
      agent_key_id: "secret-key",
      cpu_total: 2,
      memory_total: 8_000_000_000,
      storage_total: 50_000_000_000,
    });
    const service = new NodeService(deps);

    const result = await service.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.total).toBe(1);
    expect(result.value.items[0]).not.toHaveProperty("agent_key_id");
  });
});
