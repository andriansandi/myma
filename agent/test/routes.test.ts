/**
 * Integration tests for the MyMA Agent HTTP API.
 *
 * Uses fake Docker engine / database admin / Moodle source / installer so no
 * Docker daemon or git is required.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentCreateInstanceInput } from "@myma/validation";
import { createAuthMiddleware } from "../src/auth.js";
import { FakeDatabaseAdmin } from "../src/db.js";
import { FakeDockerEngine } from "../src/docker.js";
import { FakeMoodleInstaller, FakeMoodleSource } from "../src/moodle.js";
import { createApp } from "../src/routes.js";
import { signRequest } from "../src/signing.js";

const keyId = "agent-test-key";
const key = crypto.randomBytes(32).toString("hex");

const COMPOSE_TEMPLATE = [
  'name: "{{PROJECT}}"',
  "services:",
  "  moodle:",
  '    image: "myma/moodle-frankenphp:{{MOODLE_VERSION}}"',
  '    container_name: "moodle-{{PROJECT}}"',
  "    env_file: [\".env\"]",
  "    networks:",
  "      - myma-infra",
  "      - default",
  "    labels:",
  '      - "traefik.http.routers.{{PROJECT}}.rule=Host(`{{HOSTNAME}}`)"',
  '      - "traefik.http.routers.{{PROJECT}}.tls.certresolver=le"',
  "    deploy:",
  "      resources:",
  "        limits:",
  '          cpus: "{{CPU_LIMIT}}"',
  '          memory: "{{MEM_LIMIT}}"',
  '    mem_limit: "{{MEM_LIMIT}}"',
  "networks:",
  "  myma-infra:",
  "    external: true",
  "volumes:",
  "  moodledata-{{PROJECT}}:",
  "    driver: local",
  "",
].join("\n");

function buildTestApp() {
  const instancesDir = `/tmp/myma-agent-test-${crypto.randomUUID()}`;
  const docker = new FakeDockerEngine();
  const db = new FakeDatabaseAdmin();
  const authMiddleware = createAuthMiddleware({ expectedKeyId: keyId, expectedKey: key });
  const moodleSource = new FakeMoodleSource();
  const moodleInstaller = new FakeMoodleInstaller();
  const app = createApp({
    docker,
    db,
    authMiddleware,
    instancesDir,
    composeTemplate: COMPOSE_TEMPLATE,
    moodleSource,
    moodleInstaller,
    redisHost: "redis",
    redisPort: 6379,
  });
  return { app, docker, db, moodleSource, moodleInstaller, instancesDir };
}

function signedRequest(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: object,
  opts?: { key?: string; timestamp?: number; nonce?: string },
) {
  const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
  const headers = signRequest({
    key: opts?.key ?? key,
    keyId,
    method,
    path,
    body: bodyString,
    timestamp: opts?.timestamp !== undefined ? String(opts.timestamp) : undefined,
    nonce: opts?.nonce,
  });
  return app.request(path, {
    method,
    headers: { ...headers },
    body: bodyString,
  });
}

const createBody = (id?: string): AgentCreateInstanceInput => ({
  instance_id: id ?? crypto.randomUUID(),
  docker_project: "student-alpha",
  hostname: "alpha.myma.id",
  moodle_version: "4.5.1",
  database_name: "student_alpha_db",
  cpu_limit: 0.5,
  memory_limit: 512 * 1024 * 1024,
  storage_limit: 10 * 1024 * 1024 * 1024,
  db_host: "mariadb",
  db_port: 3306,
  db_password: crypto.randomBytes(24).toString("hex"),
  moodle_admin_user: "admin",
  moodle_admin_password: crypto.randomBytes(24).toString("hex"),
  moodle_admin_email: "admin@alpha.myma.id",
});

describe("routes", () => {
  it("GET /v1/health is unauthenticated and returns ok", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; version: string; docker_ok: boolean; uptime_s: number };
    expect(json.status).toBe("ok");
    expect(typeof json.version).toBe("string");
    expect(typeof json.uptime_s).toBe("number");
  });

  it("rejects unsigned requests to authenticated routes", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/v1/instances/some-id/status");
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects requests signed with the wrong key", async () => {
    const { app } = buildTestApp();
    const res = await signedRequest(app, "GET", "/v1/instances/some-id/status", undefined, {
      key: "wrong-key",
    });
    expect(res.status).toBe(403);
  });

  it("rejects replayed nonces", async () => {
    const { app } = buildTestApp();
    const nonce = crypto.randomBytes(16).toString("base64url");
    const path = "/v1/instances/some-id/status";
    const first = await signedRequest(app, "GET", path, undefined, { nonce });
    expect(first.status).toBe(404);
    const second = await signedRequest(app, "GET", path, undefined, { nonce });
    expect(second.status).toBe(403);
  });

  it("rejects stale timestamps", async () => {
    const { app } = buildTestApp();
    const stale = Math.floor(Date.now() / 1000) - 400;
    const res = await signedRequest(app, "GET", "/v1/instances/some-id/status", undefined, {
      timestamp: stale,
    });
    expect(res.status).toBe(403);
  });

  it("creates an instance and returns a job", async () => {
    const { app } = buildTestApp();
    const body = createBody();
    const res = await signedRequest(app, "POST", "/v1/instances", body);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { job_id: string; status: string };
    expect(json.job_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.status).toBe("queued");
  });

  it("create-instance is idempotent by instance_id", async () => {
    const { app } = buildTestApp();
    const id = crypto.randomUUID();
    const body = createBody(id);
    const first = await signedRequest(app, "POST", "/v1/instances", body);
    expect(first.status).toBe(202);
    const firstJson = (await first.json()) as { job_id: string };

    const second = await signedRequest(app, "POST", "/v1/instances", body);
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { job_id: string };
    expect(secondJson.job_id).toBe(firstJson.job_id);
  });

  it("provisions: checkout source, create moodledata volume, install Moodle", async () => {
    const { app, docker, moodleSource, moodleInstaller, instancesDir } = buildTestApp();
    const body = createBody();
    const res = await signedRequest(app, "POST", "/v1/instances", body);
    expect(res.status).toBe(202);

    // Poll until provisioning completes.
    let statusJson: { status: string; running: boolean } | undefined;
    for (let i = 0; i < 50; i++) {
      const s = await signedRequest(app, "GET", `/v1/instances/${body.instance_id}/status`);
      statusJson = (await s.json()) as { status: string; running: boolean };
      if (statusJson.status === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(statusJson?.status).toBe("ACTIVE");
    expect(statusJson?.running).toBe(true);

    expect(docker.hasVolume(`moodledata-${body.docker_project}`)).toBe(true);

    expect(moodleSource.calls.length).toBe(1);
    expect(moodleSource.calls[0]?.version).toBe(body.moodle_version);
    expect(moodleSource.calls[0]?.targetPath).toBe(
      path.join(instancesDir, body.docker_project, "moodle"),
    );

    expect(moodleInstaller.calls.length).toBe(1);
    expect(moodleInstaller.calls[0]?.project).toBe(body.docker_project);
    expect(moodleInstaller.calls[0]?.container).toBe(`moodle-${body.docker_project}`);

    const composePath = path.join(instancesDir, body.docker_project, "compose.yml");
    const compose = await fs.readFile(composePath, "utf-8");
    expect(compose).toContain(`image: "myma/moodle-frankenphp:${body.moodle_version}"`);
    expect(compose).toContain(`traefik.http.routers.${body.docker_project}.rule=Host(\`${body.hostname}\`)`);
    expect(compose).toContain("myma-infra:\n    external: true");
    expect(compose).toContain("certresolver=le");
  });

  it("reset uses stored record identities, not request body identities", async () => {
    const { app, db, moodleSource, moodleInstaller, instancesDir } = buildTestApp();
    const id = crypto.randomUUID();
    const initial = createBody(id);
    await signedRequest(app, "POST", "/v1/instances", initial);

    let statusJson: { status: string; running: boolean } | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await signedRequest(app, "GET", `/v1/instances/${id}/status`);
      statusJson = (await res.json()) as { status: string; running: boolean };
      if (statusJson.status === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(statusJson?.status).toBe("ACTIVE");

    const reset = {
      ...initial,
      docker_project: "other-project",
      database_name: "other_db",
      moodle_version: "4.4.0",
      db_password: "new-password-from-worker",
    };
    const resetRes = await signedRequest(app, "POST", `/v1/instances/${id}/reset`, reset);
    expect(resetRes.status).toBe(200);

    for (let i = 0; i < 50; i++) {
      const res = await signedRequest(app, "GET", `/v1/instances/${id}/status`);
      statusJson = (await res.json()) as { status: string; running: boolean };
      if (statusJson.status === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(statusJson?.status).toBe("ACTIVE");

    expect(db.resetCalls.length).toBe(1);
    expect(db.resetCalls[0]?.database).toBe(initial.database_name);
    expect(db.resetCalls[0]?.password).toBe("new-password-from-worker");

    const lastCheckout = moodleSource.calls.at(-1);
    expect(lastCheckout?.version).toBe(initial.moodle_version);
    expect(lastCheckout?.targetPath).toBe(
      path.join(instancesDir, initial.docker_project, "moodle"),
    );

    const lastInstall = moodleInstaller.calls.at(-1);
    expect(lastInstall?.project).toBe(initial.docker_project);
    expect(lastInstall?.container).toBe(`moodle-${initial.docker_project}`);
  });

  it("reports instance status and metrics", async () => {
    const { app, docker } = buildTestApp();
    const body = createBody();
    await signedRequest(app, "POST", "/v1/instances", body);

    let statusJson: { status: string; running: boolean } | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await signedRequest(app, "GET", `/v1/instances/${body.instance_id}/status`);
      statusJson = (await res.json()) as { status: string; running: boolean };
      if (statusJson.status === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(statusJson?.status).toBe("ACTIVE");
    expect(statusJson?.running).toBe(true);

    docker.setMetrics(body.docker_project, 12.5, 64 * 1024 * 1024);
    const metricsRes = await signedRequest(app, "GET", `/v1/instances/${body.instance_id}/metrics`);
    const metrics = (await metricsRes.json()) as {
      cpu_usage: number;
      memory_usage: number;
    };
    expect(metrics.cpu_usage).toBe(12.5);
    expect(metrics.memory_usage).toBe(64 * 1024 * 1024);
  });

  it("returns 404 for unknown instance status", async () => {
    const { app } = buildTestApp();
    const res = await signedRequest(app, "GET", `/v1/instances/${crypto.randomUUID()}/status`);
    expect(res.status).toBe(404);
  });
});
