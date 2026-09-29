import { createInstanceSchema } from "@myma/validation";
import type { CreateInstanceInput, Instance, InstanceDto, InstanceStatus, Page, Result } from "@myma/types";
import { err } from "@myma/types";
import type { Deps } from "../env.js";
import type { InstanceListFilter } from "@myma/db";

export class InstanceService {
  constructor(private readonly deps: Deps) {}

  async create(raw: unknown): Promise<Result<Instance>> {
    const parsed = createInstanceSchema.safeParse(raw);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
    }
    const input: CreateInstanceInput = {
      ...parsed.data,
      docker_project: parsed.data.docker_project ?? slugFromHostname(parsed.data.hostname),
    };
    return this.deps.repos.instances.create(input);
  }

  list(filter?: InstanceListFilter): Promise<Result<Page<InstanceDto>>> {
    return this.deps.repos.instances.list(filter);
  }

  getById(id: string): Promise<Result<Instance>> {
    return this.deps.repos.instances.getById(id);
  }

  getByHostname(hostname: string): Promise<Result<Instance>> {
    return this.deps.repos.instances.getByHostname(hostname);
  }

  updateStatus(id: string, status: InstanceStatus): Promise<Result<Instance>> {
    return this.deps.repos.instances.updateStatus(id, status);
  }
}

function slugFromHostname(hostname: string): string {
  return hostname.split(".")[0] ?? hostname;
}
