import { describe, it, expect } from "vitest";
import { createApp } from "../src/routes.js";
import { createFakeDeps } from "./fakes.js";

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

describe("API routes", () => {
  it("health is accessible without auth", async () => {
    const deps = createFakeDeps();
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 401 for unauthenticated requests", async () => {
    const deps = createFakeDeps({ authMode: "strict" });
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/students");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for invalid body", async () => {
    const deps = createFakeDeps({ authMode: "strict" });
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/students", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a student", async () => {
    const deps = createFakeDeps({ authMode: "strict" });
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/students", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sandi", email: "sandi@example.com" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; email: string };
    expect(body.name).toBe("Sandi");
    expect(body.email).toBe("sandi@example.com");
  });

  it("creates and provisions an instance", async () => {
    const deps = createFakeDeps({
      authMode: "strict",
      provisioningConfig: { pollIntervalMs: 0, maxAttempts: 5 },
    });
    const { node, student } = await setupNodeAndStudent(deps);
    const app = createApp(deps.env, deps);

    const res = await app.request("/api/instances", {
      method: "POST",
      headers: { Authorization: "Bearer dev", "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: student.id,
        node_id: node.id,
        hostname: "sandi.myma.id",
        moodle_version: "4.5.1",
        cpu_limit: 1,
        memory_limit: 1_000_000_000,
        storage_limit: 10_000_000_000,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; hostname: string };
    expect(body.status).toBe("ACTIVE");
    expect(body.hostname).toBe("sandi.myma.id");
  });
});
