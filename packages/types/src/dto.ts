/**
 * API DTOs — request inputs and response shapes for the control-plane API.
 */
import type {
  ActivityAction,
  ActivityStatus,
  BackupStatus,
  InstanceStatus,
  NodeStatus,
  StudentStatus,
} from "./enums.js";
import type { InstanceResources } from "./entities.js";

/* ------------------------------------------------------------------ */
/* Error envelope                                                      */
/* ------------------------------------------------------------------ */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "AGENT_ERROR"
  | "DNS_ERROR"
  | "PROVISIONING_ERROR"
  | "INTERNAL_ERROR";

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export interface CreateStudentInput {
  name: string;
  email: string;
}

export interface StudentDto {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export interface RegisterNodeInput {
  name: string;
  hostname: string;
  ip_address: string;
  agent_url: string;
  agent_key_id: string;
  cpu_total: number;
  memory_total: number;
  storage_total: number;
}

export interface NodeDto {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  agent_url: string;
  status: NodeStatus;
  cpu_total: number;
  memory_total: number;
  storage_total: number;
  cpu_used: number;
  memory_used: number;
  storage_used: number;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Instances                                                           */
/* ------------------------------------------------------------------ */

export interface CreateInstanceInput {
  student_id: string;
  node_id: string;
  hostname: string;
  moodle_version: string;
  cpu_limit: number;
  memory_limit: number;
  storage_limit: number;
  /** Optional; defaults to a slug derived from the hostname label. */
  docker_project?: string;
}

export interface InstanceDto {
  id: string;
  student_id: string;
  node_id: string;
  hostname: string;
  docker_project: string;
  moodle_version: string;
  database_name: string;
  status: InstanceStatus;
  cpu_limit: number;
  memory_limit: number;
  storage_limit: number;
  storage_used: number;
  provision_error: string | null;
  created_at: string;
  updated_at: string;
  last_backup_at: string | null;
}

export interface InstanceDetailDto extends InstanceDto {
  student?: StudentDto;
  node?: NodeDto;
  resources?: InstanceResources[];
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export interface BackupDto {
  id: string;
  instance_id: string;
  node_id: string;
  timestamp: string;
  size: number;
  storage_location: string;
  status: BackupStatus;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export interface ActivityLogDto {
  id: string;
  actor: string;
  action: ActivityAction;
  instance_id: string | null;
  node_id: string | null;
  status: ActivityStatus;
  error: string | null;
  metadata: string;
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  total_instances: number;
  active: number;
  provisioning: number;
  stopped: number;
  failed: number;
  total_students: number;
  total_nodes: number;
  total_storage_bytes: number;
}

/* ------------------------------------------------------------------ */
/* Lists (pagination)                                                  */
/* ------------------------------------------------------------------ */

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}