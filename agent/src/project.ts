/**
 * Per-instance Docker Compose rendering and filesystem helpers.
 *
 * The agent reads the canonical Compose template from infra/moodle/compose.template.yml
 * at startup, replaces the documented {{TOKENS}}, and writes the rendered result
 * plus a companion .env file under /opt/myma/instances/<docker_project>/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentCreateInstanceInput } from "@myma/validation";

export interface ComposeInput extends AgentCreateInstanceInput {
  /** Hostname of the node's shared Redis. */
  redisHost?: string;
  /** Port of the node's shared Redis. */
  redisPort?: number;
}

export function formatMem(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}M`;
}

function escapeEnvValue(value: string): string {
  // .env files in Docker Compose support double-quoted values that escape
  // backslash, double-quote, and dollar characters; we wrap everything for safety.
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\$/g, () => "$$")}"`;
}

export function renderEnv(input: ComposeInput): string {
  const redisHost = input.redisHost ?? "redis";
  const redisPort = String(input.redisPort ?? 6379);
  const dbUser = input.database_name;

  return [
    `MOODLE_DB_HOST=${escapeEnvValue(input.db_host)}`,
    `MOODLE_DB_PORT=${escapeEnvValue(String(input.db_port))}`,
    `MOODLE_DB_NAME=${escapeEnvValue(input.database_name)}`,
    `MOODLE_DB_USER=${escapeEnvValue(dbUser)}`,
    `MOODLE_DB_PASSWORD=${escapeEnvValue(input.db_password)}`,
    `MOODLE_ADMIN_USER=${escapeEnvValue(input.moodle_admin_user)}`,
    `MOODLE_ADMIN_PASSWORD=${escapeEnvValue(input.moodle_admin_password)}`,
    `MOODLE_ADMIN_EMAIL=${escapeEnvValue(input.moodle_admin_email)}`,
    `REDIS_HOST=${escapeEnvValue(redisHost)}`,
    `REDIS_PORT=${escapeEnvValue(redisPort)}`,
    `HOSTNAME=${escapeEnvValue(input.hostname)}`,
    `MOODLE_CODE_PATH=${escapeEnvValue("/var/www/moodle")}`,
    `MOODLE_DATA_PATH=${escapeEnvValue("/var/www/moodledata")}`,
    "",
  ].join("\n");
}

export function toTemplateVars(
  input: ComposeInput,
  codePath: string,
): Record<string, string> {
  return {
    INSTANCE_ID: input.instance_id,
    HOSTNAME: input.hostname,
    PROJECT: input.docker_project,
    MOODLE_VERSION: input.moodle_version,
    MOODLE_CODE_PATH: codePath,
    DB_HOST: input.db_host,
    DB_PORT: String(input.db_port),
    DB_NAME: input.database_name,
    DB_USER: input.database_name,
    DB_PASS: input.db_password,
    REDIS_HOST: input.redisHost ?? "redis",
    REDIS_PORT: String(input.redisPort ?? 6379),
    CPU_LIMIT: String(input.cpu_limit),
    MEM_LIMIT: formatMem(input.memory_limit),
  };
}

export function substituteTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const placeholderPattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
  const keys = [...template.matchAll(placeholderPattern)].map((m) => m[1] ?? "");
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(vars, key));

  if (missing.length > 0) {
    throw new Error(`missing template variables: ${Array.from(new Set(missing)).join(", ")}`);
  }

  return template.replace(placeholderPattern, (_match, key: string) => vars[key] as string);
}

export async function writeProjectFiles(
  instancesDir: string,
  input: ComposeInput,
  template: string,
): Promise<void> {
  const dir = path.join(instancesDir, input.docker_project);
  const codePath = path.join(dir, "moodle");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.mkdir(codePath, { recursive: true, mode: 0o755 });

  const vars = toTemplateVars(input, codePath);
  const compose = substituteTemplate(template, vars);

  await Promise.all([
    fs.writeFile(path.join(dir, "compose.yml"), compose, { mode: 0o600 }),
    fs.writeFile(path.join(dir, ".env"), renderEnv(input), { mode: 0o600 }),
  ]);
}

export function composeFilePath(instancesDir: string, dockerProject: string): string {
  return path.join(instancesDir, dockerProject, "compose.yml");
}

export function moodleCodePath(instancesDir: string, dockerProject: string): string {
  return path.join(instancesDir, dockerProject, "moodle");
}
