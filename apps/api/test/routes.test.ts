import { describe, it, expect } from "vitest";
import { hashPassword } from "../src/auth/password.js";
import { SessionAuth } from "../src/auth.js";
import { createApp } from "../src/routes.js";
import { createFakeDeps, FakeUserRepository } from "./fakes.js";

async function createSessionDeps() {
  const deps = createFakeDeps({ authMode: "strict" });
  const users = deps.repos.users as unknown as FakeUserRepository;
  const passwordHash = await hashPassword("password123");
  await users.createWithPassword({
    email: "admin@myma.local",
    name: "Admin",
    auth_provider: "none",
    external_id: null,
    role: "admin",
    password_hash: passwordHash,
  });
  deps.auth = new SessionAuth({ users, secret: deps.env.AUTH_SESSION_SECRET });
  return deps;
}

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

  it("lists students as a Page", async () => {
    const deps = createFakeDeps({ authMode: "strict" });
    await deps.repos.students.create({ name: "Sandi", email: "sandi@example.com" });
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/students", {
      headers: { Authorization: "Bearer dev" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number; offset: number; limit: number };
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(1);
  });

  it("returns dashboard stats", async () => {
    const deps = createFakeDeps({ authMode: "strict" });
    const app = createApp(deps.env, deps);
    const res = await app.request("/api/stats", {
      headers: { Authorization: "Bearer dev" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total_instances: number;
      active: number;
      total_students: number;
      total_nodes: number;
    };
    expect(typeof body.total_instances).toBe("number");
    expect(typeof body.active).toBe("number");
    expect(typeof body.total_students).toBe("number");
    expect(typeof body.total_nodes).toBe("number");
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

  it("POST /api/auth/login returns a token and user on valid credentials", async () => {
    const deps = await createSessionDeps();
    const app = createApp(deps.env, deps);

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@myma.local", password: "password123" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { email: string; role: string } };
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe("admin@myma.local");
    expect(body.user.role).toBe("admin");
  });

  it("POST /api/auth/login returns 401 on bad credentials", async () => {
    const deps = await createSessionDeps();
    const app = createApp(deps.env, deps);

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@myma.local", password: "wrong-password" }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid email or password");
  });

  it("protected routes reject session auth without a Bearer token", async () => {
    const deps = await createSessionDeps();
    const app = createApp(deps.env, deps);

    const res = await app.request("/api/students");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Authentication required");
  });
});
