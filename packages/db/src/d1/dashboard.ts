import { ok, err, type Result, type DashboardStats, type InstanceStatus } from "@myma/types";
import type { D1Database } from "./types.js";
import type { DashboardRepository } from "../repositories.js";

interface StatusCountRow {
  status: InstanceStatus;
  count: number;
}

interface StorageSumRow {
  total: number | null;
}

interface EntityCountRow {
  total: number;
}

export class D1DashboardRepository implements DashboardRepository {
  constructor(private readonly db: D1Database) {}

  async stats(): Promise<Result<DashboardStats>> {
    try {
      const instances = await this.db
        .prepare("SELECT status, COUNT(*) as count FROM instances GROUP BY status")
        .all<StatusCountRow>();
      const totalInstances = await this.db
        .prepare("SELECT COUNT(*) as total FROM instances")
        .first<EntityCountRow>();
      const totalStudents = await this.db
        .prepare("SELECT COUNT(*) as total FROM students")
        .first<EntityCountRow>();
      const totalNodes = await this.db
        .prepare("SELECT COUNT(*) as total FROM vps_nodes")
        .first<EntityCountRow>();
      const storage = await this.db
        .prepare("SELECT SUM(storage_used) as total FROM instances")
        .first<StorageSumRow>();

      const byStatus = new Map<InstanceStatus, number>();
      for (const row of instances.results ?? []) {
        byStatus.set(row.status, row.count);
      }

      return ok({
        total_instances: totalInstances?.total ?? 0,
        active: byStatus.get("ACTIVE") ?? 0,
        provisioning: byStatus.get("PROVISIONING") ?? 0,
        stopped: byStatus.get("STOPPED") ?? 0,
        failed: byStatus.get("FAILED") ?? 0,
        total_students: totalStudents?.total ?? 0,
        total_nodes: totalNodes?.total ?? 0,
        total_storage_bytes: storage?.total ?? 0,
      });
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
