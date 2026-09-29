import type {
  ActivityLogDto,
  BackupDto,
  CreateInstanceInput,
  CreateStudentInput,
  DashboardStats,
  InstanceDetailDto,
  InstanceDto,
  NodeDto,
  Page,
  RegisterNodeInput,
  StudentDto,
} from "@myma/types";
import { getMockData } from "./mock.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const MOCK_LATENCY_MS = 360;

function getAuthHeader(): Record<string, string> {
  // Placeholder: will be replaced once server-side auth is wired.
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("myma:token") ?? undefined
      : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isErrorEnvelope(value: unknown): value is {
  error: { code: string; message: string; details?: Record<string, unknown> };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object" &&
    (value as { error: { code?: unknown } }).error.code !== undefined &&
    (value as { error: { message?: unknown } }).error.message !== undefined
  );
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...options?.headers,
    },
  });

  const body = await response.json() as unknown;

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        body.error.details
      );
    }
    throw new ApiError("INTERNAL_ERROR", "Unexpected API failure");
  }

  return body as T;
}

function mockDelay<T>(value: T): Promise<T> {
  return wait(MOCK_LATENCY_MS).then(() => value);
}

const mocks = getMockData();

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function getDashboardStats(): Promise<DashboardStats> {
  if (USE_MOCK) return mockDelay(mocks.stats);
  return apiFetch<DashboardStats>("/stats");
}

/* ------------------------------------------------------------------ */
/* Instances                                                           */
/* ------------------------------------------------------------------ */

export function listInstances(): Promise<Page<InstanceDto>> {
  if (USE_MOCK) return mockDelay(mocks.instancesPage);
  return apiFetch<Page<InstanceDto>>("/instances");
}

export function getInstance(id: string): Promise<InstanceDetailDto> {
  if (USE_MOCK) {
    const found = mocks.instanceDetails.find((item) => item.id === id);
    if (!found) return Promise.reject(new ApiError("NOT_FOUND", "Instance not found"));
    return mockDelay(found);
  }
  return apiFetch<InstanceDetailDto>(`/instances/${encodeURIComponent(id)}`);
}

export function createInstance(input: CreateInstanceInput): Promise<InstanceDto> {
  if (USE_MOCK) {
    const created: InstanceDto = {
      id: crypto.randomUUID(),
      student_id: input.student_id,
      node_id: input.node_id,
      hostname: input.hostname,
      docker_project: input.docker_project ?? input.hostname.replace(/\./g, "-"),
      moodle_version: input.moodle_version,
      database_name: `${input.hostname.replace(/[^a-z0-9]/g, "_")}_lms`,
      status: "PROVISIONING",
      cpu_limit: input.cpu_limit,
      memory_limit: input.memory_limit,
      storage_limit: input.storage_limit,
      storage_used: 0,
      provision_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_backup_at: null,
    };
    return mockDelay(created);
  }
  return apiFetch<InstanceDto>("/instances", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}/start`, {
    method: "POST",
  });
}

export function stopInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
}

export function restartInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}/restart`, {
    method: "POST",
  });
}

export function resetInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}/reset`, {
    method: "POST",
  });
}

export function backupInstance(id: string): Promise<BackupDto> {
  if (USE_MOCK) {
    const instance = mocks.instancesPage.items.find((item) => item.id === id);
    const backup: BackupDto = {
      id: crypto.randomUUID(),
      instance_id: id,
      node_id: instance?.node_id ?? (mocks.nodes[0]?.id ?? ""),
      timestamp: new Date().toISOString(),
      size: 124_000_000,
      storage_location: `backups/${id}/manual.tar.gz`,
      status: "RUNNING",
      created_at: new Date().toISOString(),
    };
    return mockDelay(backup);
  }
  return apiFetch<BackupDto>(`/instances/${encodeURIComponent(id)}/backup`, {
    method: "POST",
  });
}

export function restoreInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
}

export function deleteInstance(id: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/instances/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export function listStudents(): Promise<Page<StudentDto>> {
  if (USE_MOCK) return mockDelay(mocks.studentsPage);
  return apiFetch<Page<StudentDto>>("/students");
}

export function createStudent(input: CreateStudentInput): Promise<StudentDto> {
  if (USE_MOCK) {
    const created: StudentDto = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return mockDelay(created);
  }
  return apiFetch<StudentDto>("/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export function listNodes(): Promise<Page<NodeDto>> {
  if (USE_MOCK) return mockDelay(mocks.nodesPage);
  return apiFetch<Page<NodeDto>>("/nodes");
}

export function registerNode(input: RegisterNodeInput): Promise<NodeDto> {
  if (USE_MOCK) {
    const created: NodeDto = {
      id: crypto.randomUUID(),
      name: input.name,
      hostname: input.hostname,
      ip_address: input.ip_address,
      agent_url: input.agent_url,
      status: "ACTIVE",
      cpu_total: input.cpu_total,
      memory_total: input.memory_total,
      storage_total: input.storage_total,
      cpu_used: 0,
      memory_used: 0,
      storage_used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return mockDelay(created);
  }
  return apiFetch<NodeDto>("/nodes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export function listBackups(): Promise<Page<BackupDto>> {
  if (USE_MOCK) return mockDelay(mocks.backupsPage);
  return apiFetch<Page<BackupDto>>("/backups");
}

export function restoreBackup(backupId: string): Promise<void> {
  if (USE_MOCK) return mockDelay(undefined);
  return apiFetch<void>(`/backups/${encodeURIComponent(backupId)}/restore`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------ */
/* Activity logs                                                       */
/* ------------------------------------------------------------------ */

export interface ActivityFilters {
  action?: string;
  status?: string;
  instanceId?: string;
}

export function listActivity(filters?: ActivityFilters): Promise<Page<ActivityLogDto>> {
  if (USE_MOCK) {
    let items = mocks.activityPage.items;
    if (filters?.action) {
      items = items.filter((item) => item.action === filters.action);
    }
    if (filters?.status) {
      items = items.filter((item) => item.status === filters.status);
    }
    if (filters?.instanceId) {
      items = items.filter((item) => item.instance_id === filters.instanceId);
    }
    return mockDelay({ ...mocks.activityPage, items, total: items.length });
  }

  const params = new URLSearchParams();
  if (filters?.action) params.set("action", filters.action);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.instanceId) params.set("instance_id", filters.instanceId);
  const query = params.toString();
  return apiFetch<Page<ActivityLogDto>>(`/activity${query ? `?${query}` : ""}`);
}
