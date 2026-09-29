import type { DashboardStats, Result } from "@myma/types";
import type { Deps } from "../env.js";

export class DashboardService {
  constructor(private readonly deps: Deps) {}

  stats(): Promise<Result<DashboardStats>> {
    return this.deps.repos.dashboard.stats();
  }
}
