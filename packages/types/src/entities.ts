/**
 * MyMA domain entities — shapes as persisted in D1.
 * Ids are UUIDv4 strings; timestamps are ISO-8601 UTC strings.
 */
import type {
  ActivityAction,
  ActivityStatus,
  AuthProvider,
  BackupStatus,
  InstanceStatus,
  NodeStatus,
  StudentStatus,
  UserRole,
} from "./enums.js";

export interface User {
  id: string;
  email: string;
  name: string;
  auth_provider: AuthProvider;
  external_id: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface VpsNode {
  id: string;
  name: string;
  hostname: string;
  ip_address: string;
  agent_url: string;
  agent_key_id: string;
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

export interface Instance {
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

export interface InstanceResources {
  id: string;
  instance_id: string;
  node_id: string;
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  db_size: number;
  recorded_at: string;
}

export interface Backup {
  id: string;
  instance_id: string;
  node_id: string;
  timestamp: string;
  size: number;
  storage_location: string;
  status: BackupStatus;
  created_at: string;
}

export interface ActivityLog {
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

/** A single provisioning step, for surfacing progress and failure detail. */
export interface ProvisionStep {
  step: string;
  status: ActivityStatus;
  error: string | null;
  timestamp: string;
}