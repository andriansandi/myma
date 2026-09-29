/**
 * Repository contracts for the MyMA D1 data layer.
 *
 * All mutating methods return `Result<T>` from `@myma/types`. Implementations
 * live in `./d1/*.ts` and are thin wrappers around Cloudflare D1.
 */
import type {
  ActivityAction,
  ActivityLogDto,
  ActivityStatus,
  AuthProvider,
  Backup,
  BackupDto,
  BackupStatus,
  CreateInstanceInput,
  CreateStudentInput,
  DashboardStats,
  Instance,
  InstanceDto,
  InstanceResources,
  InstanceStatus,
  NodeStatus,
  Page,
  RegisterNodeInput,
  Result,
  Student,
  StudentDto,
  StudentStatus,
  User,
  UserRole,
  VpsNode,
} from "@myma/types";

/* -------------------------------------------------------------------------- */
/* Shared input types                                                         */
/* -------------------------------------------------------------------------- */

export interface CreateUserInput {
  email: string;
  name: string;
  auth_provider: AuthProvider;
  external_id: string | null;
  role: UserRole;
}

export interface UpdateNodeInput {
  name?: string;
  hostname?: string;
  ip_address?: string;
  agent_url?: string;
  agent_key_id?: string;
}

export interface UpdateInstanceInput {
  hostname?: string;
  docker_project?: string;
  moodle_version?: string;
  database_name?: string;
  cpu_limit?: number;
  memory_limit?: number;
  storage_limit?: number;
  last_backup_at?: string | null;
  provision_error?: string | null;
}

export interface InstanceListFilter {
  status?: InstanceStatus;
  student_id?: string;
  node_id?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityListFilter {
  instance_id?: string;
  node_id?: string;
  action?: ActivityAction;
  limit?: number;
  offset?: number;
}

export interface CreateInstanceResourcesInput {
  instance_id: string;
  node_id: string;
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  db_size: number;
  recorded_at: string;
}

export interface CreateBackupInput {
  instance_id: string;
  node_id: string;
  timestamp: string;
  size: number;
  storage_location: string;
  status?: BackupStatus;
}

export interface CreateActivityLogInput {
  actor: string;
  action: ActivityAction;
  instance_id?: string | null;
  node_id?: string | null;
  status: ActivityStatus;
  error?: string | null;
  metadata?: string;
  timestamp: string;
}

/* -------------------------------------------------------------------------- */
/* Repository interfaces                                                      */
/* -------------------------------------------------------------------------- */

export interface StudentRepository {
  create(input: CreateStudentInput): Promise<Result<Student>>;
  list(): Promise<Result<StudentDto[]>>;
  getById(id: string): Promise<Result<Student>>;
  updateStatus(id: string, status: StudentStatus): Promise<Result<Student>>;
}

export interface NodeRepository {
  create(input: RegisterNodeInput): Promise<Result<VpsNode>>;
  list(): Promise<Result<VpsNode[]>>;
  getById(id: string): Promise<Result<VpsNode>>;
  update(id: string, input: UpdateNodeInput): Promise<Result<VpsNode>>;
  updateStatus(id: string, status: NodeStatus): Promise<Result<VpsNode>>;
  updateUsage(
    id: string,
    usage: { cpu_used: number; memory_used: number; storage_used: number },
  ): Promise<Result<VpsNode>>;
}

export interface InstanceRepository {
  create(input: CreateInstanceInput): Promise<Result<Instance>>;
  list(filter?: InstanceListFilter): Promise<Result<Page<InstanceDto>>>;
  getById(id: string): Promise<Result<Instance>>;
  getByHostname(hostname: string): Promise<Result<Instance>>;
  update(id: string, input: UpdateInstanceInput): Promise<Result<Instance>>;
  updateStatus(id: string, status: InstanceStatus): Promise<Result<Instance>>;
  countByStatus(): Promise<Result<Record<InstanceStatus, number>>>;
}

export interface InstanceResourcesRepository {
  insert(input: CreateInstanceResourcesInput): Promise<Result<InstanceResources>>;
  latestForInstance(instanceId: string): Promise<Result<InstanceResources | null>>;
  listForInstance(
    instanceId: string,
    filter?: { limit?: number; offset?: number },
  ): Promise<Result<Page<InstanceResources>>>;
}

export interface BackupUpdateInput {
  status?: BackupStatus;
  size?: number;
}

export interface BackupRepository {
  create(input: CreateBackupInput): Promise<Result<Backup>>;
  getById(id: string): Promise<Result<Backup>>;
  listForInstance(
    instanceId: string,
    filter?: { limit?: number; offset?: number },
  ): Promise<Result<Page<BackupDto>>>;
  updateStatus(id: string, status: BackupStatus): Promise<Result<Backup>>;
  update(id: string, input: BackupUpdateInput): Promise<Result<Backup>>;
  list(filter?: { limit?: number; offset?: number }): Promise<Result<Page<BackupDto>>>;
}

export interface ActivityLogRepository {
  append(input: CreateActivityLogInput): Promise<Result<ActivityLogDto>>;
  list(filter?: ActivityListFilter): Promise<Result<Page<ActivityLogDto>>>;
}

export interface UserRepository {
  getByExternalId(externalId: string): Promise<Result<User | null>>;
  upsert(input: CreateUserInput): Promise<Result<User>>;
}

export interface DashboardRepository {
  stats(): Promise<Result<DashboardStats>>;
}

export type { Page };
