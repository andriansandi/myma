import { describe, it, expect, beforeEach } from "vitest";
import {
  D1StudentRepository,
  D1NodeRepository,
  D1InstanceRepository,
  D1InstanceResourcesRepository,
  D1BackupRepository,
  D1ActivityLogRepository,
  D1UserRepository,
  D1DashboardRepository,
  runMigrations,
  migrations,
  type D1Database,
  type D1ExecResult,
  type D1PreparedStatement,
  type D1Result,
} from "../src/index.js";

/* -------------------------------------------------------------------------- */
/* Tiny fake D1                                                               */
/* -------------------------------------------------------------------------- */

interface PreparedCall {
  sql: string;
  values: unknown[];
}

class FakeStatement implements D1PreparedStatement {
  constructor(
    private readonly parent: FakeD1,
    readonly sql: string,
    private call: PreparedCall,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.call.values.push(...values);
    return this;
  }

  async first<T>(_colName?: string): Promise<T | null> {
    return this.parent.popFirst<T>(this.sql, this.call);
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.parent.popAll<T>(this.sql, this.call);
  }

  async run(): Promise<D1Result> {
    return this.parent.popRun(this.sql, this.call);
  }

  async raw<T>(): Promise<T[]> {
    const res = await this.all<T>();
    return (res.results ?? []) as T[];
  }
}

class FakeD1 implements D1Database {
  execCalls: Array<{ sql: string; result?: D1ExecResult }> = [];
  preparedCalls: PreparedCall[] = [];
  private execQueue: D1ExecResult[] = [];
  private firstQueue: unknown[] = [];
  private allQueue: Array<{ results: unknown[] }> = [];
  private runQueue: Array<D1Result> = [];

  prepare(sql: string): D1PreparedStatement {
    const call: PreparedCall = { sql, values: [] };
    return new FakeStatement(this, sql, call);
  }

  queueFirst<T>(value: T | null): void {
    this.firstQueue.push(value);
  }

  queueAll<T>(results: T[]): void {
    this.allQueue.push({ results });
  }

  queueRun(result: D1Result = { success: true }): void {
    this.runQueue.push(result);
  }

  queueExec(result: D1ExecResult = { count: 1, duration: 0 }): void {
    this.execQueue.push(result);
  }

  private recordCall(call: PreparedCall): void {
    this.preparedCalls.push({ sql: call.sql, values: [...call.values] });
  }

  popFirst<T>(sql: string, call: PreparedCall): T | null {
    if (this.firstQueue.length === 0) {
      throw new Error(`No first() result queued for: ${sql}`);
    }
    this.recordCall(call);
    return this.firstQueue.shift() as T | null;
  }

  popAll<T>(sql: string, call: PreparedCall): D1Result<T> {
    if (this.allQueue.length === 0) {
      throw new Error(`No all() result queued for: ${sql}`);
    }
    this.recordCall(call);
    return this.allQueue.shift() as D1Result<T>;
  }

  popRun(sql: string, call: PreparedCall): D1Result {
    if (this.runQueue.length === 0) {
      throw new Error(`No run() result queued for: ${sql}`);
    }
    this.recordCall(call);
    return this.runQueue.shift() as D1Result;
  }

  async exec(sql: string): Promise<D1ExecResult> {
    const result = this.execQueue.shift();
    this.execCalls.push({ sql, result });
    if (!result) {
      throw new Error(`No exec() result queued for: ${sql}`);
    }
    return result;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function expectUuid(value: string): void {
  expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

function expectIsoTimestamp(value: string): void {
  expect(new Date(value).toISOString()).toBe(value);
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("D1StudentRepository", () => {
  let db: FakeD1;
  let repo: D1StudentRepository;

  beforeEach(() => {
    db = new FakeD1();
    repo = new D1StudentRepository(db as D1Database);
  });

  it("creates a student with generated id, status and timestamps", async () => {
    db.queueRun({ success: true });

    const result = await repo.create({ name: "Test", email: "test@example.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectUuid(result.value.id);
    expect(result.value.name).toBe("Test");
    expect(result.value.email).toBe("test@example.com");
    expect(result.value.status).toBe("ACTIVE");
    expectIsoTimestamp(result.value.created_at);
    expect(result.value.created_at).toBe(result.value.updated_at);
  });

  it("returns NOT_FOUND when a student is missing", async () => {
    db.queueFirst(null);

    const result = await repo.getById("missing-id");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("maps a returned row to a Student", async () => {
    const row = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Sandi",
      email: "sandi@example.com",
      status: "ACTIVE" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    db.queueFirst(row);

    const result = await repo.getById(row.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(row);
  });

  it("lists all students", async () => {
    const rows = [
      { id: "1", name: "A", email: "a@b.com", status: "ACTIVE" as const, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    ];
    db.queueAll(rows);

    const result = await repo.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.email).toBe("a@b.com");
  });

  it("updates a student's status and timestamp", async () => {
    const updatedRow = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test",
      email: "test@example.com",
      status: "SUSPENDED" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };

    db.queueRun({ success: true });
    db.queueFirst(updatedRow);

    const result = await repo.updateStatus(updatedRow.id, "SUSPENDED");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("SUSPENDED");
  });
});

describe("D1NodeRepository", () => {
  let db: FakeD1;
  let repo: D1NodeRepository;

  beforeEach(() => {
    db = new FakeD1();
    repo = new D1NodeRepository(db as D1Database);
  });

  it("creates a node with zero usage and ACTIVE status", async () => {
    db.queueRun({ success: true });

    const result = await repo.create({
      name: "Node A",
      hostname: "node-a.myma.id",
      ip_address: "10.0.0.1",
      agent_url: "https://agent.node-a.myma.id",
      agent_key_id: "key-1",
      cpu_total: 4,
      memory_total: 16_000_000_000,
      storage_total: 500_000_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectUuid(result.value.id);
    expect(result.value.status).toBe("ACTIVE");
    expect(result.value.cpu_used).toBe(0);
    expect(result.value.memory_used).toBe(0);
    expect(result.value.storage_used).toBe(0);
  });

  it("updates only provided fields", async () => {
    const updatedRow = {
      id: "nid",
      name: "Node A2",
      hostname: "node-a.myma.id",
      ip_address: "10.0.0.1",
      agent_url: "https://agent.node-a.myma.id",
      agent_key_id: "key-1",
      status: "ACTIVE" as const,
      cpu_total: 4,
      memory_total: 16_000_000_000,
      storage_total: 500_000_000_000,
      cpu_used: 0,
      memory_used: 0,
      storage_used: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };

    db.queueRun({ success: true });
    db.queueFirst(updatedRow);

    const result = await repo.update("nid", { name: "Node A2" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Node A2");
    const updateCall = db.preparedCalls.find((c) => c.sql.includes("UPDATE vps_nodes"));
    expect(updateCall).toBeDefined();
    expect(updateCall?.values).toContain("Node A2");
  });
});

describe("D1InstanceRepository", () => {
  let db: FakeD1;
  let repo: D1InstanceRepository;

  beforeEach(() => {
    db = new FakeD1();
    repo = new D1InstanceRepository(db as D1Database);
  });

  it("creates an instance with generated defaults", async () => {
    db.queueRun({ success: true });

    const result = await repo.create({
      student_id: "550e8400-e29b-41d4-a716-446655440000",
      node_id: "660e8400-e29b-41d4-a716-446655440000",
      hostname: "student.myma.id",
      moodle_version: "4.5.1",
      cpu_limit: 1,
      memory_limit: 2_000_000_000,
      storage_limit: 20_000_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectUuid(result.value.id);
    expect(result.value.status).toBe("PROVISIONING");
    expect(result.value.docker_project).toBe("student");
    expect(result.value.database_name).toMatch(/^moodle_/);
    expect(result.value.storage_used).toBe(0);
    expect(result.value.provision_error).toBeNull();
    expect(result.value.last_backup_at).toBeNull();
  });

  it("lists instances with status filter and pagination", async () => {
    db.queueFirst({ total: 1 });
    db.queueAll([
      {
        id: "i1",
        student_id: "s1",
        node_id: "n1",
        hostname: "a.myma.id",
        docker_project: "a",
        moodle_version: "4.5.1",
        database_name: "moodle_i1",
        status: "ACTIVE" as const,
        cpu_limit: 1,
        memory_limit: 1_000_000_000,
        storage_limit: 10_000_000_000,
        storage_used: 0,
        provision_error: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        last_backup_at: null,
      },
    ]);

    const result = await repo.list({ status: "ACTIVE" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.limit).toBe(20);
    expect(result.value.offset).toBe(0);

    const listCall = db.preparedCalls.find((c) => c.sql.includes("SELECT * FROM instances") && c.sql.includes("ORDER BY created_at DESC"));
    expect(listCall).toBeDefined();
    expect(listCall?.values).toContain("ACTIVE");
    expect(listCall?.values).toContain(20);
    expect(listCall?.values).toContain(0);
  });

  it("counts instances by status returning zero for missing keys", async () => {
    db.queueAll([{ status: "ACTIVE" as const, count: 3 }]);

    const result = await repo.countByStatus();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ACTIVE).toBe(3);
    expect(result.value.PROVISIONING).toBe(0);
    expect(result.value.SUSPENDED).toBe(0);
    expect(result.value.DELETING).toBe(0);
  });
});

describe("D1InstanceResourcesRepository", () => {
  it("returns the latest resource snapshot", async () => {
    const db = new FakeD1();
    const repo = new D1InstanceResourcesRepository(db as D1Database);
    const row = {
      id: "r1",
      instance_id: "i1",
      node_id: "n1",
      cpu_usage: 0.5,
      memory_usage: 100_000,
      storage_usage: 200_000,
      db_size: 50_000,
      recorded_at: "2026-01-01T00:00:00.000Z",
    };
    db.queueFirst(row);

    const result = await repo.latestForInstance("i1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.cpu_usage).toBe(0.5);
  });
});

describe("D1BackupRepository", () => {
  it("defaults status to RUNNING", async () => {
    const db = new FakeD1();
    const repo = new D1BackupRepository(db as D1Database);
    db.queueRun({ success: true });

    const result = await repo.create({
      instance_id: "i1",
      node_id: "n1",
      timestamp: "2026-01-01T00:00:00.000Z",
      size: 1_000,
      storage_location: "backups/i1/2026-01-01.tar.gz",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("RUNNING");
  });
});

describe("D1ActivityLogRepository", () => {
  it("defaults metadata to '{}'", async () => {
    const db = new FakeD1();
    const repo = new D1ActivityLogRepository(db as D1Database);
    db.queueRun({ success: true });

    const result = await repo.append({
      actor: "system",
      action: "instance.created",
      instance_id: "i1",
      status: "success",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata).toBe("{}");
    expect(result.value.instance_id).toBe("i1");
    const insertCall = db.preparedCalls.find((c) => c.sql.includes("INSERT INTO activity_logs"));
    expect(insertCall?.values).toContain("{}");
  });
});

describe("D1UserRepository", () => {
  it("upsert inserts a new user by email", async () => {
    const db = new FakeD1();
    const repo = new D1UserRepository(db as D1Database);
    db.queueFirst(null);
    db.queueRun({ success: true });

    const result = await repo.upsert({
      email: "admin@example.com",
      name: "Admin",
      auth_provider: "clerk",
      external_id: "ext-1",
      role: "admin",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectUuid(result.value.id);
    expect(result.value.role).toBe("admin");
  });
});

describe("D1DashboardRepository", () => {
  it("aggregates dashboard stats", async () => {
    const db = new FakeD1();
    const repo = new D1DashboardRepository(db as D1Database);

    db.queueAll([
      { status: "ACTIVE" as const, count: 2 },
      { status: "PROVISIONING" as const, count: 1 },
    ]);
    db.queueFirst({ total: 3 });
    db.queueFirst({ total: 5 });
    db.queueFirst({ total: 1 });
    db.queueFirst({ total: 1_000_000 });

    const result = await repo.stats();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total_instances).toBe(3);
    expect(result.value.active).toBe(2);
    expect(result.value.provisioning).toBe(1);
    expect(result.value.failed).toBe(0);
    expect(result.value.total_students).toBe(5);
    expect(result.value.total_nodes).toBe(1);
    expect(result.value.total_storage_bytes).toBe(1_000_000);
  });
});

describe("runMigrations", () => {
  it("creates _migrations and applies pending migrations", async () => {
    const db = new FakeD1();
    db.queueExec({ count: 0, duration: 0 }); // create _migrations
    db.queueAll([]);
    // one exec (schema) + one run (record) per pending migration
    for (const _migration of migrations) {
      db.queueExec({ count: 0, duration: 0 });
      db.queueRun({ success: true });
    }

    await runMigrations(db as D1Database);

    expect(db.execCalls).toHaveLength(1 + migrations.length);
    expect(db.execCalls[0]?.sql).toContain("_migrations");
    expect(migrations.map((m) => m.name)).toEqual(["0001_init", "0002_add_password_hash"]);
  });
});
