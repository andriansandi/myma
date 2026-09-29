import type { InstanceStatus } from "@myma/types";
import { Badge } from "./Badge.js";

const statusConfig: Record<
  InstanceStatus,
  { label: string; variant: "warning" | "success" | "neutral" | "info" | "danger" }
> = {
  PROVISIONING: { label: "Provisioning", variant: "warning" },
  ACTIVE: { label: "Active", variant: "success" },
  STOPPED: { label: "Stopped", variant: "neutral" },
  SUSPENDED: { label: "Suspended", variant: "info" },
  FAILED: { label: "Failed", variant: "danger" },
  DELETING: { label: "Deleting", variant: "warning" },
  DELETED: { label: "Deleted", variant: "neutral" },
};

export interface StatusBadgeProps {
  status: InstanceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
