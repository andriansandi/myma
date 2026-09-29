/**
 * Entrypoint for the MyMA VPS Agent.
 *
 * Wires the Hono app, authentication middleware, Docker engine, database
 * admin, Moodle source checkout, Moodle installer, and HTTP server. In test
 * mode fake implementations are used automatically.
 */
import fs from "node:fs/promises";
import { serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { createAuthMiddleware } from "./auth.js";
import { CliDatabaseAdmin, FakeDatabaseAdmin, type DatabaseAdmin } from "./db.js";
import { CliDockerEngine, FakeDockerEngine, type DockerEngine } from "./docker.js";
import { createApp } from "./routes.js";
import {
  DockerMoodleInstaller,
  FakeMoodleInstaller,
  GitMoodleSource,
  FakeMoodleSource,
  type MoodleInstaller,
  type MoodleSource,
} from "./moodle.js";

const IS_TEST = process.env.NODE_ENV === "test";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function createDockerEngine(instancesDir: string): DockerEngine {
  if (IS_TEST) return new FakeDockerEngine();
  return new CliDockerEngine({ instancesDir });
}

function createDbAdmin(): DatabaseAdmin {
  if (IS_TEST) return new FakeDatabaseAdmin();
  const host = getEnv("MARIADB_HOST", "mariadb");
  const port = Number(getEnv("MARIADB_PORT", "3306"));
  const adminUser = getEnv("MARIADB_ROOT_USER", "root");
  const adminPassword = getEnv("MARIADB_ROOT_PASSWORD");
  return new CliDatabaseAdmin({ host, port, adminUser, adminPassword });
}

function createMoodleSource(): MoodleSource {
  if (IS_TEST) return new FakeMoodleSource();
  return new GitMoodleSource();
}

function createMoodleInstaller(docker: DockerEngine): MoodleInstaller {
  if (IS_TEST) return new FakeMoodleInstaller();
  return new DockerMoodleInstaller(docker);
}

async function loadComposeTemplate(): Promise<string> {
  if (IS_TEST) {
    // Minimal valid template so test-mode createApp calls succeed.
    return [
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
      "    deploy:",
      "      resources:",
      "        limits:",
      '          cpus: "{{CPU_LIMIT}}"',
      '          memory: "{{MEM_LIMIT}}"',
      '    mem_limit: "{{MEM_LIMIT}}"',
      "networks:",
      "  myma-infra:",
      "    external: true",
      "",
    ].join("\n");
  }
  const templatePath = getEnv(
    "MYMA_COMPOSE_TEMPLATE",
    "/opt/myma/infra/moodle/compose.template.yml",
  );
  return fs.readFile(templatePath, "utf-8");
}

async function buildApp(): Promise<ReturnType<typeof createApp>> {
  const keyId = getEnv("AGENT_KEY_ID");
  const key = getEnv("AGENT_KEY");
  const instancesDir = getEnv("MYMA_INSTANCES_DIR", "/opt/myma/instances");
  const authMiddleware: MiddlewareHandler = createAuthMiddleware({ expectedKeyId: keyId, expectedKey: key });
  const docker = createDockerEngine(instancesDir);

  return createApp({
    docker,
    db: createDbAdmin(),
    authMiddleware,
    instancesDir,
    composeTemplate: await loadComposeTemplate(),
    moodleSource: createMoodleSource(),
    moodleInstaller: createMoodleInstaller(docker),
    redisHost: getEnv("REDIS_HOST", "redis"),
    redisPort: Number(getEnv("REDIS_PORT", "6379")),
  });
}

export async function createServer(): Promise<ReturnType<typeof createApp>> {
  return buildApp();
}

async function main(): Promise<void> {
  const app = await buildApp();
  const port = Number(getEnv("MYMA_AGENT_PORT", "3000"));

  const server = serve({ fetch: app.fetch, port }, (info) => {
    const address = typeof info === "string" ? info : `${info.address}:${info.port}`;
    // eslint-disable-next-line no-console
    console.log(`MyMA Agent listening on ${address}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (!IS_TEST) {
  void main();
}
