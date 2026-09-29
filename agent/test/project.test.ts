/**
 * Unit tests for the Compose-template substitution and env rendering helpers.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import type { AgentCreateInstanceInput } from "@myma/validation";
import {
  formatMem,
  renderEnv,
  substituteTemplate,
  toTemplateVars,
} from "../src/project.js";

const input: AgentCreateInstanceInput = {
  instance_id: crypto.randomUUID(),
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
};

describe("substituteTemplate", () => {
  it("replaces every defined token", () => {
    const template = "{{PROJECT}} {{HOSTNAME}} {{CPU_LIMIT}} {{MEM_LIMIT}}";
    const vars = { PROJECT: "a", HOSTNAME: "b", CPU_LIMIT: "1", MEM_LIMIT: "512M" };
    expect(substituteTemplate(template, vars)).toBe("a b 1 512M");
  });

  it("throws if a token is missing", () => {
    const template = "{{PROJECT}} {{MISSING}}";
    expect(() => substituteTemplate(template, { PROJECT: "a" })).toThrow("MISSING");
  });

  it("throws for unknown leftover placeholders", () => {
    const template = "{{PROJECT}} {{UNKNOWN}}";
    expect(() => substituteTemplate(template, { PROJECT: "a" })).toThrow("UNKNOWN");
  });
});

describe("toTemplateVars", () => {
  it("produces all 14 canonical tokens with correct formatting", () => {
    const codePath = "/opt/myma/instances/student-alpha/moodle";
    const vars = toTemplateVars({ ...input, redisHost: "redis", redisPort: 6379 }, codePath);

    expect(vars.INSTANCE_ID).toBe(input.instance_id);
    expect(vars.HOSTNAME).toBe(input.hostname);
    expect(vars.PROJECT).toBe(input.docker_project);
    expect(vars.MOODLE_VERSION).toBe(input.moodle_version);
    expect(vars.MOODLE_CODE_PATH).toBe(codePath);
    expect(vars.DB_HOST).toBe(input.db_host);
    expect(vars.DB_PORT).toBe(String(input.db_port));
    expect(vars.DB_NAME).toBe(input.database_name);
    expect(vars.DB_USER).toBe(input.database_name);
    expect(vars.DB_PASS).toBe(input.db_password);
    expect(vars.REDIS_HOST).toBe("redis");
    expect(vars.REDIS_PORT).toBe("6379");
    expect(vars.CPU_LIMIT).toBe(String(input.cpu_limit));
    expect(vars.MEM_LIMIT).toBe("512M");
  });
});

describe("formatMem", () => {
  it("rounds bytes to the nearest megabyte", () => {
    expect(formatMem(512 * 1024 * 1024)).toBe("512M");
    expect(formatMem(1024 * 1024 * 1024)).toBe("1024M");
  });
});

describe("renderEnv", () => {
  it("emits the canonical keys and double-quote escapes values", () => {
    const env = renderEnv({ ...input, redisHost: "redis", redisPort: 6379 });

    expect(env).toContain(`MOODLE_DB_HOST="${input.db_host}"`);
    expect(env).toContain(`MOODLE_DB_PORT="${input.db_port}"`);
    expect(env).toContain(`MOODLE_DB_NAME="${input.database_name}"`);
    expect(env).toContain(`MOODLE_DB_USER="${input.database_name}"`);
    expect(env).toContain(`MOODLE_DB_PASSWORD="${input.db_password}"`);
    expect(env).toContain(`MOODLE_ADMIN_USER="${input.moodle_admin_user}"`);
    expect(env).toContain(`MOODLE_ADMIN_PASSWORD="${input.moodle_admin_password}"`);
    expect(env).toContain(`MOODLE_ADMIN_EMAIL="${input.moodle_admin_email}"`);
    expect(env).toContain(`REDIS_HOST="redis"`);
    expect(env).toContain(`REDIS_PORT="6379"`);
    expect(env).toContain(`HOSTNAME="${input.hostname}"`);
    expect(env).toContain(`MOODLE_CODE_PATH="/var/www/moodle"`);
    expect(env).toContain(`MOODLE_DATA_PATH="/var/www/moodledata"`);
  });

  it("escapes dollar signs to prevent host env interpolation", () => {
    const env = renderEnv({
      ...input,
      db_password: "pa$$w0rd",
      moodle_admin_password: "admin$secret",
    });
    expect(env).toContain(`MOODLE_DB_PASSWORD="pa$$$$w0rd"`);
    expect(env).toContain(`MOODLE_ADMIN_PASSWORD="admin$$secret"`);
  });
});
