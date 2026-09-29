/**
 * Zod schemas for every input to the control-plane API and the agent API.
 * A single source of truth — services import these, never hand-roll parsing.
 */
import { z } from "zod";
import { INSTANCE_STATUS, NODE_STATUS } from "@myma/types";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const email = z.string().trim().email().max(254);
const uuid = z.string().uuid();

/** Hostname label of a Moodle instance, e.g. `sandi.myma.id`. */
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?!-)([a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}$/,
    "hostname must be a valid DNS name",
  )
  .max(253);

/** Docker project slug — lowercase alphanumeric + hyphens. */
export const dockerProjectSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, "invalid docker project slug");

/** Resource limits, in the units the rest of the system uses. */
export const cpuLimitSchema = z.number().min(0.1).max(32);
export const memoryLimitSchema = z
  .number()
  .int()
  .min(64 * 1024 * 1024)
  .max(256 * 1024 * 1024 * 1024);
export const storageLimitSchema = z
  .number()
  .int()
  .min(1024 * 1024 * 1024)
  .max(10 * 1024 * 1024 * 1024 * 1024);

export const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export const createStudentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email,
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export const registerNodeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  hostname: hostnameSchema,
  ip_address: z.string().ip(),
  agent_url: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), {
      message: "agent_url must use https (TLS is required)",
    }),
  agent_key_id: z.string().min(1).max(200),
  cpu_total: z.number().min(1).max(256),
  memory_total: z.number().int().min(1),
  storage_total: z.number().int().min(1),
});
export type RegisterNodeInput = z.infer<typeof registerNodeSchema>;

/* ------------------------------------------------------------------ */
/* Instances                                                           */
/* ------------------------------------------------------------------ */

export const createInstanceSchema = z.object({
  student_id: uuid,
  node_id: uuid,
  hostname: hostnameSchema,
  moodle_version: z
    .string()
    .regex(/^\d+\.\d+(\.\d+)?$/, "moodle_version must be like 4.5.1"),
  cpu_limit: cpuLimitSchema,
  memory_limit: memoryLimitSchema,
  storage_limit: storageLimitSchema,
  docker_project: dockerProjectSchema.optional(),
});
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;

/** Status filter for instance listing. */
export const instanceStatusFilterSchema = z
  .enum(INSTANCE_STATUS)
  .optional()
  .default("ACTIVE");

export const nodeStatusFilterSchema = z.enum(NODE_STATUS).optional();

/* ------------------------------------------------------------------ */
/* Agent request schemas (shared contract with the agent)              */
/* ------------------------------------------------------------------ */

export const agentCreateInstanceSchema = z.object({
  instance_id: uuid,
  docker_project: dockerProjectSchema,
  hostname: hostnameSchema,
  moodle_version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  database_name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/, "database_name must be lowercase a-z0-9_"),
  cpu_limit: cpuLimitSchema,
  memory_limit: memoryLimitSchema,
  storage_limit: storageLimitSchema,
  db_host: z.string().min(1),
  db_port: z.number().int().min(1).max(65535),
  db_password: z.string().min(16),
  moodle_admin_user: z.string().regex(/^[a-z0-9._-]{3,64}$/),
  moodle_admin_password: z.string().min(12),
  moodle_admin_email: email,
});
export type AgentCreateInstanceInput = z.infer<typeof agentCreateInstanceSchema>;