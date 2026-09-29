import type {
  ActivityLogRepository,
  BackupRepository,
  DashboardRepository,
  InstanceRepository,
  InstanceResourcesRepository,
  NodeRepository,
  StudentRepository,
  UserRepository,
} from "@myma/db";
import {
  D1ActivityLogRepository,
  D1BackupRepository,
  D1DashboardRepository,
  D1InstanceRepository,
  D1InstanceResourcesRepository,
  D1NodeRepository,
  D1StudentRepository,
  D1UserRepository,
} from "@myma/db";
import { AgentService } from "./agent.js";
import { CloudflareDnsProvider, type DnsProvider } from "./cloudflare.js";
import { R2StorageService, type StorageService } from "./storage.js";
import { DevAuth, type AuthService } from "./auth.js";

/**
 * Cloudflare Worker bindings and secrets for the control-plane API.
 */
export interface Env {
  DB: D1Database;
  BACKUPS: R2Bucket;
  AGENT_KEY_ID: string;
  AGENT_SIGNING_KEY: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  MYMA_DOMAIN: string;
  ADMIN_AUTH_MODE: string;
  ENVIRONMENT: string;
}

export interface Repos {
  students: StudentRepository;
  nodes: NodeRepository;
  instances: InstanceRepository;
  instanceResources: InstanceResourcesRepository;
  backups: BackupRepository;
  activityLogs: ActivityLogRepository;
  users: UserRepository;
  dashboard: DashboardRepository;
}

export interface ProvisioningConfig {
  pollIntervalMs: number;
  maxAttempts: number;
}

export interface Deps {
  env: Env;
  repos: Repos;
  agent: AgentService;
  dns: DnsProvider;
  storage: StorageService;
  auth: AuthService;
  provisioningConfig?: ProvisioningConfig;
}

export function createDeps(env: Env, config?: ProvisioningConfig): Deps {
  const repos: Repos = {
    students: new D1StudentRepository(env.DB),
    nodes: new D1NodeRepository(env.DB),
    instances: new D1InstanceRepository(env.DB),
    instanceResources: new D1InstanceResourcesRepository(env.DB),
    backups: new D1BackupRepository(env.DB),
    activityLogs: new D1ActivityLogRepository(env.DB),
    users: new D1UserRepository(env.DB),
    dashboard: new D1DashboardRepository(env.DB),
  };

  return {
    env,
    repos,
    agent: new AgentService(env),
    dns: new CloudflareDnsProvider(env),
    storage: new R2StorageService(env),
    auth: new DevAuth(env),
    provisioningConfig: config,
  };
}
