import { ok, type Result } from "@myma/types";
import type { ActivityLogDto, Page } from "@myma/types";
import type { ActivityLogRepository, CreateActivityLogInput } from "@myma/db";

const ALLOWED_METADATA_KEYS = [
  "hostname",
  "instance_id",
  "node_id",
  "student_id",
  "moodle_version",
  "docker_project",
  "database_name",
  "status",
  "action",
  "size",
  "storage_location",
  "backup_id",
];

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const key of ALLOWED_METADATA_KEYS) {
    if (key in metadata) {
      cleaned[key] = metadata[key];
    }
  }
  return cleaned;
}

export class ActivityService {
  constructor(private readonly repo: ActivityLogRepository) {}

  async list(filter?: Parameters<ActivityLogRepository["list"]>[0]): Promise<Result<Page<ActivityLogDto>>> {
    return this.repo.list(filter);
  }

  async append(input: CreateActivityLogInput): Promise<Result<ActivityLogDto | null>> {
    const metadata = input.metadata ? (JSON.parse(input.metadata) as Record<string, unknown>) : {};
    const cleaned = sanitizeMetadata(metadata);
    const result = await this.repo.append({
      ...input,
      metadata: JSON.stringify(cleaned),
    });
    if (result.ok) return ok(result.value);
    // Activity logging must never fail the caller.
    return ok(null);
  }
}
