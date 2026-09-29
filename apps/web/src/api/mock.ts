import type {
  ActivityLogDto,
  BackupDto,
  DashboardStats,
  InstanceDetailDto,
  InstanceDto,
  InstanceResources,
  NodeDto,
  Page,
  StudentDto,
} from "@myma/types";

const now = new Date();
const offset = (minutes: number) =>
  new Date(now.getTime() - minutes * 60000).toISOString();

const ids = {
  sandi: "11111111-1111-1111-1111-111111111111",
  budi: "22222222-2222-2222-2222-222222222222",
  rina: "33333333-3333-3333-3333-333333333333",
  nodeSg: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  nodeJk: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  sandiLms: "10000000-0000-0000-0000-000000000001",
  budiLms: "10000000-0000-0000-0000-000000000002",
  rinaLms: "10000000-0000-0000-0000-000000000003",
  testLms: "10000000-0000-0000-0000-000000000004",
  newLms: "10000000-0000-0000-0000-000000000005",
  failedLms: "10000000-0000-0000-0000-000000000006",
};

export const students: StudentDto[] = [
  {
    id: ids.sandi,
    name: "Sandi Wijaya",
    email: "sandi@myma.id",
    status: "ACTIVE",
    created_at: offset(60 * 24 * 30),
    updated_at: offset(60 * 24 * 30),
  },
  {
    id: ids.budi,
    name: "Budi Santoso",
    email: "budi@myma.id",
    status: "ACTIVE",
    created_at: offset(60 * 24 * 14),
    updated_at: offset(60 * 24 * 14),
  },
  {
    id: ids.rina,
    name: "Rina Kusuma",
    email: "rina@myma.id",
    status: "SUSPENDED",
    created_at: offset(60 * 24 * 7),
    updated_at: offset(60 * 24 * 2),
  },
];

export const nodes: NodeDto[] = [
  {
    id: ids.nodeSg,
    name: "sg-01",
    hostname: "sg-01.myma.id",
    ip_address: "128.199.10.42",
    agent_url: "https://agent.sg-01.myma.id",
    status: "ACTIVE",
    cpu_total: 8,
    memory_total: 16 * 1024 ** 3,
    storage_total: 200 * 1024 ** 3,
    cpu_used: 2.4,
    memory_used: 6.2 * 1024 ** 3,
    storage_used: 48 * 1024 ** 3,
    created_at: offset(60 * 24 * 45),
    updated_at: offset(5),
  },
  {
    id: ids.nodeJk,
    name: "jk-01",
    hostname: "jk-01.myma.id",
    ip_address: "103.150.13.88",
    agent_url: "https://agent.jk-01.myma.id",
    status: "ACTIVE",
    cpu_total: 4,
    memory_total: 8 * 1024 ** 3,
    storage_total: 120 * 1024 ** 3,
    cpu_used: 0.8,
    memory_used: 2.1 * 1024 ** 3,
    storage_used: 14 * 1024 ** 3,
    created_at: offset(60 * 24 * 20),
    updated_at: offset(15),
  },
];

export const instances: InstanceDto[] = [
  {
    id: ids.sandiLms,
    student_id: ids.sandi,
    node_id: ids.nodeSg,
    hostname: "sandi.myma.id",
    docker_project: "sandi-lms",
    moodle_version: "4.5.1",
    database_name: "sandi_lms",
    status: "ACTIVE",
    cpu_limit: 1.5,
    memory_limit: 2 * 1024 ** 3,
    storage_limit: 30 * 1024 ** 3,
    storage_used: 8.4 * 1024 ** 3,
    provision_error: null,
    created_at: offset(60 * 24 * 5),
    updated_at: offset(20),
    last_backup_at: offset(60 * 6),
  },
  {
    id: ids.budiLms,
    student_id: ids.budi,
    node_id: ids.nodeSg,
    hostname: "budi.myma.id",
    docker_project: "budi-lms",
    moodle_version: "4.5.1",
    database_name: "budi_lms",
    status: "ACTIVE",
    cpu_limit: 1,
    memory_limit: 2 * 1024 ** 3,
    storage_limit: 20 * 1024 ** 3,
    storage_used: 4.1 * 1024 ** 3,
    provision_error: null,
    created_at: offset(60 * 24 * 2),
    updated_at: offset(60 * 2),
    last_backup_at: offset(60 * 12),
  },
  {
    id: ids.rinaLms,
    student_id: ids.rina,
    node_id: ids.nodeJk,
    hostname: "rina.myma.id",
    docker_project: "rina-lms",
    moodle_version: "4.4.5",
    database_name: "rina_lms",
    status: "STOPPED",
    cpu_limit: 1,
    memory_limit: 2 * 1024 ** 3,
    storage_limit: 20 * 1024 ** 3,
    storage_used: 3.8 * 1024 ** 3,
    provision_error: null,
    created_at: offset(60 * 24 * 4),
    updated_at: offset(60 * 5),
    last_backup_at: offset(60 * 24 * 3),
  },
  {
    id: ids.newLms,
    student_id: ids.sandi,
    node_id: ids.nodeSg,
    hostname: "pro-1.myma.id",
    docker_project: "pro-1-lms",
    moodle_version: "4.5.1",
    database_name: "pro_1_lms",
    status: "PROVISIONING",
    cpu_limit: 1,
    memory_limit: 2 * 1024 ** 3,
    storage_limit: 20 * 1024 ** 3,
    storage_used: 0,
    provision_error: null,
    created_at: offset(2),
    updated_at: offset(2),
    last_backup_at: null,
  },
  {
    id: ids.failedLms,
    student_id: ids.budi,
    node_id: ids.nodeJk,
    hostname: "failed.myma.id",
    docker_project: "failed-lms",
    moodle_version: "4.5.1",
    database_name: "failed_lms",
    status: "FAILED",
    cpu_limit: 1,
    memory_limit: 2 * 1024 ** 3,
    storage_limit: 20 * 1024 ** 3,
    storage_used: 0,
    provision_error: "MOODLE_INSTALL: database connection timed out",
    created_at: offset(60 * 24 * 1),
    updated_at: offset(60 * 3),
    last_backup_at: null,
  },
];

function makeResources(instanceId: string): InstanceResources[] {
  return [
    {
      id: crypto.randomUUID(),
      instance_id: instanceId,
      node_id: ids.nodeSg,
      cpu_usage: 0.4,
      memory_usage: 780 * 1024 ** 2,
      storage_usage: 8 * 1024 ** 3,
      db_size: 320 * 1024 ** 2,
      recorded_at: offset(15),
    },
    {
      id: crypto.randomUUID(),
      instance_id: instanceId,
      node_id: ids.nodeSg,
      cpu_usage: 0.6,
      memory_usage: 920 * 1024 ** 2,
      storage_usage: 8.4 * 1024 ** 3,
      db_size: 340 * 1024 ** 2,
      recorded_at: offset(5),
    },
  ];
}

export const instanceDetails: InstanceDetailDto[] = instances.map((instance) => {
  const student = students.find((s) => s.id === instance.student_id);
  const node = nodes.find((n) => n.id === instance.node_id);
  return {
    ...instance,
    student,
    node,
    resources: makeResources(instance.id),
  };
});

export const backups: BackupDto[] = [
  {
    id: "b0000000-0000-0000-0000-000000000001",
    instance_id: ids.sandiLms,
    node_id: ids.nodeSg,
    timestamp: offset(60 * 6),
    size: 1.2 * 1024 ** 3,
    storage_location: `backups/${ids.sandiLms}/2026-09-29-0100.tar.gz`,
    status: "COMPLETED",
    created_at: offset(60 * 6),
  },
  {
    id: "b0000000-0000-0000-0000-000000000002",
    instance_id: ids.budiLms,
    node_id: ids.nodeSg,
    timestamp: offset(60 * 12),
    size: 890 * 1024 ** 2,
    storage_location: `backups/${ids.budiLms}/2026-09-28-1900.tar.gz`,
    status: "COMPLETED",
    created_at: offset(60 * 12),
  },
  {
    id: "b0000000-0000-0000-0000-000000000003",
    instance_id: ids.failedLms,
    node_id: ids.nodeJk,
    timestamp: offset(30),
    size: 0,
    storage_location: `backups/${ids.failedLms}/incomplete.tar.gz`,
    status: "FAILED",
    created_at: offset(30),
  },
];

export const activityLogs: ActivityLogDto[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    actor: "system",
    action: "instance.provision_completed",
    instance_id: ids.sandiLms,
    node_id: ids.nodeSg,
    status: "success",
    error: null,
    metadata: "{}",
    timestamp: offset(60 * 24 * 5),
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    actor: "admin@myma.id",
    action: "instance.created",
    instance_id: ids.budiLms,
    node_id: ids.nodeSg,
    status: "success",
    error: null,
    metadata: "{}",
    timestamp: offset(60 * 24 * 2),
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    actor: "system",
    action: "instance.provision_failed",
    instance_id: ids.failedLms,
    node_id: ids.nodeJk,
    status: "error",
    error: "MOODLE_INSTALL: database connection timed out",
    metadata: "{}",
    timestamp: offset(60 * 3),
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    actor: "admin@myma.id",
    action: "instance.stopped",
    instance_id: ids.rinaLms,
    node_id: ids.nodeJk,
    status: "success",
    error: null,
    metadata: "{}",
    timestamp: offset(60 * 5),
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    actor: "system",
    action: "node.health_checked",
    instance_id: null,
    node_id: ids.nodeSg,
    status: "success",
    error: null,
    metadata: "{}",
    timestamp: offset(5),
  },
  {
    id: "a0000000-0000-0000-0000-000000000006",
    actor: "system",
    action: "instance.backup_completed",
    instance_id: ids.sandiLms,
    node_id: ids.nodeSg,
    status: "success",
    error: null,
    metadata: "{}",
    timestamp: offset(60 * 6),
  },
];

export const stats: DashboardStats = {
  total_instances: instances.length,
  active: instances.filter((i) => i.status === "ACTIVE").length,
  provisioning: instances.filter((i) => i.status === "PROVISIONING").length,
  stopped: instances.filter((i) => i.status === "STOPPED").length,
  failed: instances.filter((i) => i.status === "FAILED").length,
  total_students: students.length,
  total_nodes: nodes.length,
  total_storage_bytes: instances.reduce(
    (sum, instance) => sum + instance.storage_used,
    0
  ),
};

function toPage<T>(items: T[]): Page<T> {
  return {
    items,
    total: items.length,
    offset: 0,
    limit: items.length,
  };
}

export function getMockData() {
  return {
    students,
    studentsPage: toPage(students),
    nodes,
    nodesPage: toPage(nodes),
    instancesPage: toPage(instances),
    instanceDetails,
    backups,
    backupsPage: toPage(backups),
    activityPage: toPage(activityLogs),
    stats,
  };
}
