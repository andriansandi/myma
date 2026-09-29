/**
 * MyMA domain enums — the single source of truth for status values.
 * Values are string literals stored directly in D1.
 */

export const STUDENT_STATUS = ["ACTIVE", "SUSPENDED"] as const;
export type StudentStatus = (typeof STUDENT_STATUS)[number];

export const NODE_STATUS = ["ACTIVE", "DRAINING", "OFFLINE"] as const;
export type NodeStatus = (typeof NODE_STATUS)[number];

export const INSTANCE_STATUS = [
  "PROVISIONING",
  "ACTIVE",
  "STOPPED",
  "SUSPENDED",
  "FAILED",
  "DELETING",
  "DELETED",
] as const;
export type InstanceStatus = (typeof INSTANCE_STATUS)[number];

export const BACKUP_STATUS = ["RUNNING", "COMPLETED", "FAILED"] as const;
export type BackupStatus = (typeof BACKUP_STATUS)[number];

export const USER_ROLE = ["admin"] as const;
export type UserRole = (typeof USER_ROLE)[number];

/**
 * Activity actions recorded in `activity_logs`. No secrets are ever included.
 */
export const ACTIVITY_ACTION = [
  "instance.created",
  "instance.provision_started",
  "instance.provision_completed",
  "instance.provision_failed",
  "instance.started",
  "instance.stopped",
  "instance.restarted",
  "instance.reset",
  "instance.backup_started",
  "instance.backup_completed",
  "instance.restored",
  "instance.deleted",
  "node.registered",
  "node.health_checked",
  "student.created",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTION)[number];

export const ACTIVITY_STATUS = ["success", "error"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];

export const AUTH_PROVIDER = [
  "none",
  "clerk",
  "cloudflare_access",
  "auth0",
] as const;
export type AuthProvider = (typeof AUTH_PROVIDER)[number];