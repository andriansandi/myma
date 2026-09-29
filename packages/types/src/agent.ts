/**
 * MyMA Agent API contract types — shared between the Worker (`AgentService`)
 * and the VPS agent (`@myma/agent`). These are the wire shapes, not DB rows.
 */

export interface AgentHealthResponse {
  status: "ok";
  version: string;
  docker_ok: boolean;
  uptime_s: number;
}

export interface ContainerState {
  name: string;
  status: string;
  running: boolean;
}

export interface AgentMetrics {
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  db_size: number;
}

export interface AgentInstanceStatus {
  instance_id: string;
  status: string;
  running: boolean;
  http_ok: boolean;
  containers: ContainerState[];
  metrics: AgentMetrics;
}

export interface CreateInstanceRequest {
  instance_id: string;
  docker_project: string;
  hostname: string;
  moodle_version: string;
  database_name: string;
  cpu_limit: number;
  memory_limit: number;
  storage_limit: number;
  /** Connection details for the node's shared MariaDB (sent over TLS, HMAC-signed). */
  db_host: string;
  db_port: number;
  /** Generated per-instance DB password — never persisted on the control plane. */
  db_password: string;
  /** Moodle admin account to be created during install. */
  moodle_admin_user: string;
  moodle_admin_password: string;
  moodle_admin_email: string;
}

export interface AgentJob {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
}

export interface AgentBackupRequest {
  instance_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
}

export interface AgentBackupResponse {
  backup_id: string;
  size: number;
}

export interface AgentRestoreRequest {
  instance_id: string;
  download_url: string;
}

/** Statuses understood by the agent for a given instance. */
export type AgentInstanceStatusValue =
  | "PROVISIONING"
  | "ACTIVE"
  | "STOPPED"
  | "FAILED"
  | "DELETED"
  | "UNKNOWN";