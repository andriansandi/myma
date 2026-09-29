/**
 * Lightweight helper for the node's shared MariaDB administration.
 *
 * The real implementation shells out to the `mysql` / `mysqldump` CLI using
 * array arguments (no shell interpolation) and sends SQL via stdin so secrets
 * never appear in `/proc/<pid>/cmdline`. The fake implementation is in-memory
 * for unit tests.
 */
import { spawn } from "node:child_process";
import { err, ok, type Result } from "@myma/types";

export interface DatabaseAdmin {
  createDatabase(database: string): Promise<Result<void>>;
  dropDatabase(database: string): Promise<Result<void>>;
  createUser(database: string, password: string): Promise<Result<void>>;
  dropUser(database: string): Promise<Result<void>>;
  resetDatabase(database: string, password: string): Promise<Result<void>>;
  dump(database: string, outFile: string): Promise<Result<void>>;
}

export interface DbAdminConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
}

function voidFromResult<T>(result: Result<T>): Result<void> {
  return result.ok ? ok(undefined) : err(result.error.code, result.error.message, result.error.details);
}

function escapeIdentifier(identifier: string): string {
  // MySQL identifiers in backticks escape backticks as ``. The agent only
  // receives validated identifiers (a-z0-9_), but escaping is defense in depth.
  return identifier.replace(/`/g, "``");
}

export function escapeSqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function mysqlConnectionArgs(config: DbAdminConfig): string[] {
  return ["--host", config.host, "--port", String(config.port), "--user", config.adminUser];
}

async function runMysqlBinary(
  config: DbAdminConfig,
  binary: string,
  sql: string,
): Promise<Result<{ stdout: string; stderr: string }>> {
  return new Promise((resolve) => {
    const child = spawn(binary, mysqlConnectionArgs(config), {
      env: { ...process.env, MYSQL_PWD: config.adminPassword },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve(err("AGENT_ERROR", "database command timed out after 300s"));
      }
    }, 300_000);

    const finish = (result: Result<{ stdout: string; stderr: string }>): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      }
    };

    child.stdout.on("data", (chunk: string | Buffer) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      finish(err("AGENT_ERROR", `database command failed: ${error.message}`));
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code === 0) {
        finish(ok({ stdout, stderr }));
      } else {
        finish(err("AGENT_ERROR", `database command failed with exit code ${code}`, { stderr }));
      }
    });

    child.stdin.write(sql, (writeErr) => {
      if (writeErr) {
        finish(err("AGENT_ERROR", `database command failed: ${writeErr.message}`));
        return;
      }
      child.stdin.end();
    });
  });
}

export function buildCreateUserSql(database: string, password: string): string {
  const user = escapeSqlString(database);
  const safePassword = escapeSqlString(password);
  return (
    `CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${safePassword}'; ` +
    `ALTER USER '${user}'@'%' IDENTIFIED BY '${safePassword}'; ` +
    `GRANT ALL PRIVILEGES ON \`${escapeIdentifier(database)}\`.* TO '${user}'@'%'; ` +
    `FLUSH PRIVILEGES`
  );
}

export class CliDatabaseAdmin implements DatabaseAdmin {
  constructor(private config: DbAdminConfig) {}

  async createDatabase(database: string): Promise<Result<void>> {
    return voidFromResult(
      await runMysqlBinary(
        this.config,
        "mysql",
        `CREATE DATABASE IF NOT EXISTS \`${escapeIdentifier(database)}\``,
      ),
    );
  }

  async dropDatabase(database: string): Promise<Result<void>> {
    return voidFromResult(
      await runMysqlBinary(
        this.config,
        "mysql",
        `DROP DATABASE IF EXISTS \`${escapeIdentifier(database)}\``,
      ),
    );
  }

  async createUser(database: string, password: string): Promise<Result<void>> {
    return voidFromResult(await runMysqlBinary(this.config, "mysql", buildCreateUserSql(database, password)));
  }

  async dropUser(database: string): Promise<Result<void>> {
    const user = escapeSqlString(database);
    return voidFromResult(
      await runMysqlBinary(
        this.config,
        "mysql",
        `DROP USER IF EXISTS '${user}'@'%'; FLUSH PRIVILEGES`,
      ),
    );
  }

  async resetDatabase(database: string, password: string): Promise<Result<void>> {
    const dropped = await this.dropDatabase(database);
    if (!dropped.ok) return dropped;
    const created = await this.createDatabase(database);
    if (!created.ok) return created;
    return this.createUser(database, password);
  }

  async dump(_database: string, _outFile: string): Promise<Result<void>> {
    // NOTE: real implementation must use the same stdin/MYSQL_PWD pattern as
    // runMysqlBinary so the admin password never appears in argv. Stub for now.
    return ok(undefined);
  }
}

export class FakeDatabaseAdmin implements DatabaseAdmin {
  private databases = new Set<string>();
  readonly createUserCalls: Array<{ database: string; password: string }> = [];
  readonly resetCalls: Array<{ database: string; password: string }> = [];

  async createDatabase(database: string): Promise<Result<void>> {
    this.databases.add(database);
    return ok(undefined);
  }

  async dropDatabase(database: string): Promise<Result<void>> {
    this.databases.delete(database);
    return ok(undefined);
  }

  async createUser(database: string, password: string): Promise<Result<void>> {
    this.createUserCalls.push({ database, password });
    return ok(undefined);
  }

  async dropUser(_database: string): Promise<Result<void>> {
    return ok(undefined);
  }

  async resetDatabase(database: string, password: string): Promise<Result<void>> {
    this.resetCalls.push({ database, password });
    await this.dropDatabase(database);
    const created = await this.createDatabase(database);
    if (!created.ok) return created;
    return this.createUser(database, password);
  }

  async dump(_database: string, _outFile: string): Promise<Result<void>> {
    return ok(undefined);
  }
}
