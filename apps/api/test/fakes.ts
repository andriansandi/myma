import {
  ok,
  err,
  type ActivityLogDto,
  type Backup,
  type BackupDto,
  type BackupStatus,
  type CreateInstanceInput,
  type CreateStudentInput,
  type DashboardStats,
  type Instance,
  type InstanceDto,
  type InstanceResources,
  type InstanceStatus,
  type NodeStatus,
  type Page,
  type RegisterNodeInput,
  type Result,
  type Student,
  type StudentDto,
  type StudentStatus,
  type User,
  type VpsNode,
} from "@myma/types";
import type {
  ActivityListFilter,
  ActivityLogRepository,
  BackupRepository,
  BackupUpdateInput,
  CreateActivityLogInput,
  CreateBackupInput,
  CreateInstanceResourcesInput,
  CreateUserInput,
  DashboardRepository,
  InstanceListFilter,
  InstanceRepository,
  InstanceResourcesRepository,
  NodeRepository,
  StudentRepository,
  UpdateInstanceInput,
  UpdateNodeInput,
  UserRepository,
  UserWithPassword,
} from "@myma/db";
import type { DnsProvider } from "../src/cloudflare.js";
import type { StorageService, StorageUpload } from "../src/storage.js";
import type { AuthService, AuthUser } from "../src/auth.js";
import type { AgentService } from "../src/agent.js";
import type {
  AgentBackupResponse,
  CreateInstanceRequest,
  AgentHealthResponse,
  AgentInstanceStatus,
  AgentJob,
  AgentMetrics,
} from "@myma/types";
import type { Deps, Env, Repos } from "../src/env.js";

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FakeStudentRepository implements StudentRepository {
  private students = new Map<string, Student>();

  async create(input: CreateStudentInput): Promise<Result<Student>> {
    const existing = Array.from(this.students.values()).find((s) => s.email === input.email);
    if (existing) return err("CONFLICT", "A student with this email already exists");
    const student: Student = { id: newId(), ...input, status: "ACTIVE", created_at: nowIso(), updated_at: nowIso() };
    this.students.set(student.id, student);
    return ok(student);
  }

  async list(): Promise<Result<StudentDto[]>> {
    const items = Array.from(this.students.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return ok(items);
  }

  async getById(id: string): Promise<Result<Student>> {
    const student = this.students.get(id);
    if (!student) return err("NOT_FOUND", `Student ${id} not found`);
    return ok(student);
  }

  async updateStatus(id: string, status: StudentStatus): Promise<Result<Student>> {
    const student = this.students.get(id);
    if (!student) return err("NOT_FOUND", `Student ${id} not found`);
    student.status = status;
    student.updated_at = nowIso();
    return ok(student);
  }
}

export class FakeNodeRepository implements NodeRepository {
  private nodes = new Map<string, VpsNode>();

  async create(input: RegisterNodeInput): Promise<Result<VpsNode>> {
    const node: VpsNode = {
      id: newId(),
      ...input,
      status: "ACTIVE",
      cpu_used: 0,
      memory_used: 0,
      storage_used: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.nodes.set(node.id, node);
    return ok(node);
  }

  async list(): Promise<Result<VpsNode[]>> {
    return ok(Array.from(this.nodes.values()));
  }

  async getById(id: string): Promise<Result<VpsNode>> {
    const node = this.nodes.get(id);
    if (!node) return err("NOT_FOUND", `Node ${id} not found`);
    return ok(node);
  }

  async update(id: string, input: UpdateNodeInput): Promise<Result<VpsNode>> {
    const node = this.nodes.get(id);
    if (!node) return err("NOT_FOUND", `Node ${id} not found`);
    Object.assign(node, input, { updated_at: nowIso() });
    return ok(node);
  }

  async updateStatus(id: string, status: NodeStatus): Promise<Result<VpsNode>> {
    const node = this.nodes.get(id);
    if (!node) return err("NOT_FOUND", `Node ${id} not found`);
    node.status = status;
    node.updated_at = nowIso();
    return ok(node);
  }

  async updateUsage(
    id: string,
    usage: { cpu_used: number; memory_used: number; storage_used: number },
  ): Promise<Result<VpsNode>> {
    const node = this.nodes.get(id);
    if (!node) return err("NOT_FOUND", `Node ${id} not found`);
    node.cpu_used = usage.cpu_used;
    node.memory_used = usage.memory_used;
    node.storage_used = usage.storage_used;
    node.updated_at = nowIso();
    return ok(node);
  }
}

export class FakeInstanceRepository implements InstanceRepository {
  instances = new Map<string, Instance>();

  async create(input: CreateInstanceInput): Promise<Result<Instance>> {
    const id = newId();
    const now = nowIso();
    const instance: Instance = {
      id,
      student_id: input.student_id,
      node_id: input.node_id,
      hostname: input.hostname,
      docker_project: input.docker_project ?? input.hostname.split(".")[0] ?? id,
      moodle_version: input.moodle_version,
      database_name: `moodle_${id.replaceAll("-", "_")}`,
      status: "PROVISIONING",
      cpu_limit: input.cpu_limit,
      memory_limit: input.memory_limit,
      storage_limit: input.storage_limit,
      storage_used: 0,
      provision_error: null,
      created_at: now,
      updated_at: now,
      last_backup_at: null,
    };
    this.instances.set(instance.id, instance);
    return ok(instance);
  }

  async list(filter: InstanceListFilter = {}): Promise<Result<Page<InstanceDto>>> {
    let items = Array.from(this.instances.values());
    if (filter.status) {
      items = items.filter((i) => i.status === filter.status);
    }
    if (filter.student_id) {
      items = items.filter((i) => i.student_id === filter.student_id);
    }
    if (filter.node_id) {
      items = items.filter((i) => i.node_id === filter.node_id);
    }
    items = items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    return ok({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
  }

  async getById(id: string): Promise<Result<Instance>> {
    const instance = this.instances.get(id);
    if (!instance) return err("NOT_FOUND", `Instance ${id} not found`);
    return ok(instance);
  }

  async getByHostname(hostname: string): Promise<Result<Instance>> {
    const instance = Array.from(this.instances.values()).find((i) => i.hostname === hostname);
    if (!instance) return err("NOT_FOUND", `Instance ${hostname} not found`);
    return ok(instance);
  }

  async update(id: string, input: UpdateInstanceInput): Promise<Result<Instance>> {
    const instance = this.instances.get(id);
    if (!instance) return err("NOT_FOUND", `Instance ${id} not found`);
    Object.assign(instance, input, { updated_at: nowIso() });
    return ok(instance);
  }

  async updateStatus(id: string, status: InstanceStatus): Promise<Result<Instance>> {
    const instance = this.instances.get(id);
    if (!instance) return err("NOT_FOUND", `Instance ${id} not found`);
    instance.status = status;
    instance.updated_at = nowIso();
    return ok(instance);
  }

  async countByStatus(): Promise<Result<Record<InstanceStatus, number>>> {
    const counts: Record<InstanceStatus, number> = {
      PROVISIONING: 0,
      ACTIVE: 0,
      STOPPED: 0,
      SUSPENDED: 0,
      FAILED: 0,
      DELETING: 0,
      DELETED: 0,
    };
    for (const instance of this.instances.values()) {
      counts[instance.status]++;
    }
    return ok(counts);
  }
}

export class FakeInstanceResourcesRepository implements InstanceResourcesRepository {
  private resources: InstanceResources[] = [];

  async insert(input: CreateInstanceResourcesInput): Promise<Result<InstanceResources>> {
    const resource: InstanceResources = { ...input, id: newId() };
    this.resources.push(resource);
    return ok(resource);
  }

  async latestForInstance(instanceId: string): Promise<Result<InstanceResources | null>> {
    const items = this.resources
      .filter((r) => r.instance_id === instanceId)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    return ok(items[0] ?? null);
  }

  async listForInstance(
    instanceId: string,
    filter: { limit?: number; offset?: number } = {},
  ): Promise<Result<Page<InstanceResources>>> {
    const items = this.resources
      .filter((r) => r.instance_id === instanceId)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    return ok({
      items: items.slice(offset, offset + limit),
      total: items.length,
      offset,
      limit,
    });
  }
}

export class FakeBackupRepository implements BackupRepository {
  private backups = new Map<string, Backup>();

  async create(input: CreateBackupInput): Promise<Result<Backup>> {
    const backup: Backup = {
      id: newId(),
      instance_id: input.instance_id,
      node_id: input.node_id,
      timestamp: input.timestamp,
      size: input.size,
      storage_location: input.storage_location,
      status: input.status ?? "RUNNING",
      created_at: nowIso(),
    };
    this.backups.set(backup.id, backup);
    return ok(backup);
  }

  async getById(id: string): Promise<Result<Backup>> {
    const backup = this.backups.get(id);
    if (!backup) return err("NOT_FOUND", `Backup ${id} not found`);
    return ok(backup);
  }

  async listForInstance(
    instanceId: string,
    filter: { limit?: number; offset?: number } = {},
  ): Promise<Result<Page<BackupDto>>> {
    const items = Array.from(this.backups.values())
      .filter((b) => b.instance_id === instanceId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    return ok({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
  }

  async updateStatus(id: string, status: BackupStatus): Promise<Result<Backup>> {
    return this.update(id, { status });
  }

  async update(id: string, input: BackupUpdateInput): Promise<Result<Backup>> {
    const backup = this.backups.get(id);
    if (!backup) return err("NOT_FOUND", `Backup ${id} not found`);
    if (input.status !== undefined) backup.status = input.status;
    if (input.size !== undefined) backup.size = input.size;
    return ok(backup);
  }

  async list(filter: { limit?: number; offset?: number } = {}): Promise<Result<Page<BackupDto>>> {
    const items = Array.from(this.backups.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    return ok({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
  }
}

export class FakeActivityLogRepository implements ActivityLogRepository {
  private logs: ActivityLogDto[] = [];

  async append(input: CreateActivityLogInput): Promise<Result<ActivityLogDto>> {
    const log: ActivityLogDto = {
      id: newId(),
      actor: input.actor,
      action: input.action,
      instance_id: input.instance_id ?? null,
      node_id: input.node_id ?? null,
      status: input.status,
      error: input.error ?? null,
      metadata: input.metadata ?? "{}",
      timestamp: input.timestamp,
    };
    this.logs.push(log);
    return ok(log);
  }

  async list(filter: ActivityListFilter = {}): Promise<Result<Page<ActivityLogDto>>> {
    let items = [...this.logs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    if (filter.instance_id) items = items.filter((l) => l.instance_id === filter.instance_id);
    if (filter.node_id) items = items.filter((l) => l.node_id === filter.node_id);
    if (filter.action) items = items.filter((l) => l.action === filter.action);
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;
    return ok({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
  }
}

export class FakeUserRepository implements UserRepository {
  private users: User[] = [];
  private passwordHashes = new Map<string, string>();

  async createWithPassword(
    input: CreateUserInput & { password_hash: string | null },
  ): Promise<Result<User>> {
    const existing = this.users.find((u) => u.email === input.email);
    if (existing) {
      return err("CONFLICT", "A user with this email already exists");
    }
    const user: User = { id: newId(), ...input, created_at: nowIso(), updated_at: nowIso() };
    this.users.push(user);
    if (input.password_hash) {
      this.passwordHashes.set(user.id, input.password_hash);
    }
    return ok(user);
  }

  async getByExternalId(externalId: string): Promise<Result<User | null>> {
    const user = this.users.find((u) => u.external_id === externalId);
    return ok(user ?? null);
  }

  async getByEmail(email: string): Promise<Result<User | null>> {
    const user = this.users.find((u) => u.email === email);
    return ok(user ?? null);
  }

  async getByEmailWithPassword(email: string): Promise<Result<UserWithPassword | null>> {
    const user = this.users.find((u) => u.email === email);
    if (!user) return ok(null);
    return ok({ user, password_hash: this.passwordHashes.get(user.id) ?? null });
  }

  async getById(id: string): Promise<Result<User>> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return err("NOT_FOUND", `User ${id} not found`);
    return ok(user);
  }

  async upsert(input: CreateUserInput): Promise<Result<User>> {
    const existing = this.users.find((u) => u.email === input.email);
    if (existing) {
      Object.assign(existing, input, { updated_at: nowIso() });
      return ok(existing);
    }
    const user: User = { id: newId(), ...input, created_at: nowIso(), updated_at: nowIso() };
    this.users.push(user);
    return ok(user);
  }
}

export class FakeDashboardRepository implements DashboardRepository {
  constructor(private readonly instances: FakeInstanceRepository, private readonly students: FakeStudentRepository, private readonly nodes: FakeNodeRepository) {}

  async stats(): Promise<Result<DashboardStats>> {
    const counts = await this.instances.countByStatus();
    if (!counts.ok) return counts;
    const nodeList = await this.nodes.list();
    if (!nodeList.ok) return nodeList;
    const studentList = await this.students.list();
    if (!studentList.ok) return studentList;
    const listResult = await this.instances.list();
    if (!listResult.ok) return listResult;
    const allInstances = listResult.value.items;
    return ok({
      total_instances: allInstances.length,
      active: counts.value.ACTIVE,
      provisioning: counts.value.PROVISIONING,
      stopped: counts.value.STOPPED,
      failed: counts.value.FAILED,
      total_students: studentList.value.length,
      total_nodes: nodeList.value.length,
      total_storage_bytes: allInstances.reduce((sum, i) => sum + i.storage_used, 0),
    });
  }
}

export class FakeAgentService {
  healthOk = true;
  statuses = new Map<string, string>();
  private provisionAttempts = new Map<string, number>();
  private backupSize = 1024;

  async healthCheck(_node: VpsNode): Promise<Result<AgentHealthResponse>> {
    if (!this.healthOk) return err("AGENT_ERROR", "agent health check failed");
    return ok({ status: "ok", version: "0.0.0", docker_ok: true, uptime_s: 0 });
  }

  async createInstance(_node: VpsNode, request: CreateInstanceRequest): Promise<Result<AgentJob>> {
    this.statuses.set(request.instance_id, "PROVISIONING");
    return ok({ job_id: `job-${request.instance_id}`, status: "queued" });
  }

  async getStatus(_node: VpsNode, instanceId: string): Promise<Result<AgentInstanceStatus>> {
    const current = this.statuses.get(instanceId) ?? "UNKNOWN";
    const count = (this.provisionAttempts.get(instanceId) ?? 0) + 1;
    this.provisionAttempts.set(instanceId, count);
    if (current === "PROVISIONING" && count >= 1) {
      this.statuses.set(instanceId, "ACTIVE");
    }
    const status = this.statuses.get(instanceId) ?? "UNKNOWN";
    return ok({
      instance_id: instanceId,
      status,
      running: status === "ACTIVE",
      http_ok: status === "ACTIVE",
      containers: [],
      metrics: { cpu_usage: 0, memory_usage: 0, storage_usage: 0, db_size: 0 },
    });
  }

  async start(_node: VpsNode, _instanceId: string): Promise<Result<{ status: string }>> {
    return ok({ status: "ACTIVE" });
  }

  async stop(_node: VpsNode, _instanceId: string): Promise<Result<{ status: string }>> {
    return ok({ status: "STOPPED" });
  }

  async restart(_node: VpsNode, _instanceId: string): Promise<Result<{ status: string }>> {
    return ok({ status: "ACTIVE" });
  }

  async reset(
    _node: VpsNode,
    instanceId: string,
    _request: CreateInstanceRequest,
  ): Promise<Result<{ job_id: string }>> {
    this.statuses.set(instanceId, "PROVISIONING");
    return ok({ job_id: `job-${instanceId}` });
  }

  async delete(_node: VpsNode, instanceId: string): Promise<Result<{ job_id: string }>> {
    this.statuses.set(instanceId, "DELETED");
    return ok({ job_id: `job-${instanceId}` });
  }

  async backup(
    _node: VpsNode,
    instanceId: string,
    _uploadUrl: string,
    _uploadHeaders: Record<string, string>,
  ): Promise<Result<AgentBackupResponse>> {
    return ok({ backup_id: `backup-${instanceId}`, size: this.backupSize });
  }

  async restore(_node: VpsNode, instanceId: string, _downloadUrl: string): Promise<Result<{ job_id: string }>> {
    this.statuses.set(instanceId, "ACTIVE");
    return ok({ job_id: `job-${instanceId}` });
  }

  async metrics(_node: VpsNode, _instanceId: string): Promise<Result<AgentMetrics>> {
    return ok({ cpu_usage: 0, memory_usage: 0, storage_usage: 0, db_size: 0 });
  }
}

export class FakeDnsProvider implements DnsProvider {
  records: { hostname: string; target: string }[] = [];
  shouldFailCreate = false;

  async createRecord(hostname: string, target: string): Promise<Result<void>> {
    if (this.shouldFailCreate) {
      return err("DNS_ERROR", "simulated DNS provider failure");
    }
    this.records = this.records.filter((r) => r.hostname !== hostname);
    this.records.push({ hostname, target });
    return ok(undefined);
  }

  async deleteRecord(hostname: string): Promise<Result<void>> {
    this.records = this.records.filter((r) => r.hostname !== hostname);
    return ok(undefined);
  }
}

export class FakeStorageService implements StorageService {
  uploads = new Map<string, StorageUpload>();

  async createUploadUrl(key: string): Promise<Result<StorageUpload>> {
    const upload: StorageUpload = { url: `https://fake-storage.example.com/${key}`, headers: {} };
    this.uploads.set(key, upload);
    return ok(upload);
  }

  async createDownloadUrl(key: string): Promise<Result<string>> {
    return ok(`https://fake-storage.example.com/${key}`);
  }
}

export class FakeAuthService implements AuthService {
  constructor(private readonly mode: "none" | "strict" = "none") {}

  async getCurrentUser(headers: Headers): Promise<Result<AuthUser>> {
    if (this.mode === "none") {
      return ok({ id: "dev-admin", email: "admin@myma.local", role: "admin" });
    }
    const auth = headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      return ok({ id: "admin", email: "admin@myma.local", role: "admin" });
    }
    return err("UNAUTHORIZED", "Authentication required");
  }
}

export interface FakeDepsOptions {
  authMode?: "none" | "strict";
  environment?: string;
  provisioningConfig?: { pollIntervalMs: number; maxAttempts: number };
}

export function createFakeDeps(options: FakeDepsOptions = {}): Deps {
  const students = new FakeStudentRepository();
  const nodes = new FakeNodeRepository();
  const instances = new FakeInstanceRepository();
  const backups = new FakeBackupRepository();
  const activityLogs = new FakeActivityLogRepository();
  const repos: Repos = {
    students,
    nodes,
    instances,
    instanceResources: new FakeInstanceResourcesRepository(),
    backups,
    activityLogs,
    users: new FakeUserRepository(),
    dashboard: new FakeDashboardRepository(instances, students, nodes),
  };

  const env: Env = {
    DB: {} as D1Database,
    BACKUPS: {} as R2Bucket,
    AGENT_KEY_ID: "test-key",
    AGENT_SIGNING_KEY: "test-secret",
    CLOUDFLARE_API_TOKEN: "test-token",
    CLOUDFLARE_ZONE_ID: "test-zone",
    MYMA_DOMAIN: "myma.id",
    ADMIN_AUTH_MODE: options.authMode ?? "none",
    ENVIRONMENT: options.environment ?? "development",
    AUTH_SESSION_SECRET: "test-session-secret",
  };

  return {
    env,
    repos,
    agent: new FakeAgentService() as unknown as AgentService,
    dns: new FakeDnsProvider(),
    storage: new FakeStorageService(),
    auth: new FakeAuthService(options.authMode ?? "none"),
    provisioningConfig: options.provisioningConfig,
  };
}
