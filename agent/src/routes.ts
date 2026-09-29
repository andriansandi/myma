/**
 * MyMA Agent HTTP API.
 *
 * Exposes the explicit, authenticated lifecycle operations defined in
 * ARCHITECTURE.md §5. No generic command endpoint exists.
 */
import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { AgentHealthResponse, AgentInstanceStatus, AgentMetrics } from "@myma/types";
import { isErr } from "@myma/types";
import { agentCreateInstanceSchema } from "@myma/validation";
import type { AgentCreateInstanceInput } from "@myma/validation";
import type { DatabaseAdmin } from "./db.js";
import type { DockerEngine } from "./docker.js";
import type { MoodleInstaller, MoodleSource } from "./moodle.js";
import { moodleCodePath, writeProjectFiles } from "./project.js";

const VERSION = "0.1.0";
const STARTED_AT = new Date().toISOString();

export interface AgentDependencies {
  docker: DockerEngine;
  db: DatabaseAdmin;
  authMiddleware: MiddlewareHandler;
  instancesDir: string;
  composeTemplate: string;
  moodleSource: MoodleSource;
  moodleInstaller: MoodleInstaller;
  redisHost?: string;
  redisPort?: number;
  moodleImageBase?: string;
}

interface JobRecord {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  error?: string;
  result?: unknown;
}

interface InstanceRecord {
  instance_id: string;
  docker_project: string;
  database_name: string;
  moodle_version: string;
  hostname: string;
  status: string;
  running: boolean;
  job_id: string;
  created_at: string;
}

const backupRequestSchema = z.object({
  instance_id: z.string().uuid(),
  upload_url: z.string().url(),
  upload_headers: z.record(z.string()).default({}),
});

const restoreRequestSchema = z.object({
  instance_id: z.string().uuid(),
  download_url: z.string().url(),
});

function instanceVolumeName(dockerProject: string): string {
  return `moodledata-${dockerProject}`;
}

function containerName(dockerProject: string): string {
  return `moodle-${dockerProject}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createApp(deps: AgentDependencies): Hono {
  const app = new Hono();
  app.use(deps.authMiddleware);

  const instances = new Map<string, InstanceRecord>();
  const jobs = new Map<string, JobRecord>();

  function createJob(): JobRecord {
    const job: JobRecord = {
      job_id: crypto.randomUUID(),
      status: "queued",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    jobs.set(job.job_id, job);
    return job;
  }

  function updateJob(jobId: string, status: JobRecord["status"], error?: string, result?: unknown): void {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = status;
    job.updated_at = nowIso();
    if (error !== undefined) job.error = error;
    if (result !== undefined) job.result = result;
  }

  async function runCreate(jobId: string, input: AgentCreateInstanceInput): Promise<void> {
    try {
      await writeProjectFiles(deps.instancesDir, {
        ...input,
        redisHost: deps.redisHost,
        redisPort: deps.redisPort,
      }, deps.composeTemplate);

      const volumeName = instanceVolumeName(input.docker_project);
      const exists = await deps.docker.volumeExists(volumeName);
      if (isErr(exists)) throw new Error(exists.error.message);
      if (!exists.value) {
        const created = await deps.docker.createVolume(volumeName);
        if (isErr(created)) throw new Error(created.error.message);
      }

      const dbCreated = await deps.db.createDatabase(input.database_name);
      if (isErr(dbCreated)) throw new Error(dbCreated.error.message);

      const userCreated = await deps.db.createUser(input.database_name, input.db_password);
      if (isErr(userCreated)) throw new Error(userCreated.error.message);

      const projectCreated = await deps.docker.createProject(input.docker_project);
      if (isErr(projectCreated)) throw new Error(projectCreated.error.message);

      const codePath = moodleCodePath(deps.instancesDir, input.docker_project);
      const checkedOut = await deps.moodleSource.checkout(input.moodle_version, codePath);
      if (isErr(checkedOut)) throw new Error(checkedOut.error.message);

      const installed = await deps.moodleInstaller.install(
        input.docker_project,
        containerName(input.docker_project),
      );
      if (isErr(installed)) throw new Error(installed.error.message);

      const record = instances.get(input.instance_id);
      if (record) {
        record.status = "ACTIVE";
        record.running = true;
      }
      updateJob(jobId, "completed");
    } catch (e) {
      const record = instances.get(input.instance_id);
      if (record) record.status = "FAILED";
      updateJob(jobId, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function runDelete(jobId: string, record: InstanceRecord): Promise<void> {
    updateJob(jobId, "running");
    try {
      const removed = await deps.docker.removeProject(record.docker_project);
      if (isErr(removed)) throw new Error(removed.error.message);

      const volumeName = instanceVolumeName(record.docker_project);
      const volumeExists = await deps.docker.volumeExists(volumeName);
      if (isErr(volumeExists)) throw new Error(volumeExists.error.message);
      if (volumeExists.value) {
        const delVol = await deps.docker.removeVolume(volumeName);
        if (isErr(delVol)) throw new Error(delVol.error.message);
      }

      const dropUser = await deps.db.dropUser(record.database_name);
      if (isErr(dropUser)) throw new Error(dropUser.error.message);

      const dropDb = await deps.db.dropDatabase(record.database_name);
      if (isErr(dropDb)) throw new Error(dropDb.error.message);

      record.status = "DELETED";
      record.running = false;
      updateJob(jobId, "completed");
    } catch (e) {
      updateJob(jobId, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function runReset(jobId: string, record: InstanceRecord, input: AgentCreateInstanceInput): Promise<void> {
    updateJob(jobId, "running");
    try {
      const stopped = await deps.docker.stop(record.docker_project);
      if (isErr(stopped)) throw new Error(stopped.error.message);

      // Trust the stored record for identities; only the fresh DB password and
      // admin credentials may come from the request body.
      const resetDb = await deps.db.resetDatabase(record.database_name, input.db_password);
      if (isErr(resetDb)) throw new Error(resetDb.error.message);

      const codePath = moodleCodePath(deps.instancesDir, record.docker_project);
      const checkedOut = await deps.moodleSource.checkout(record.moodle_version, codePath);
      if (isErr(checkedOut)) throw new Error(checkedOut.error.message);

      const installed = await deps.moodleInstaller.install(
        record.docker_project,
        containerName(record.docker_project),
      );
      if (isErr(installed)) throw new Error(installed.error.message);

      const started = await deps.docker.start(record.docker_project);
      if (isErr(started)) throw new Error(started.error.message);

      record.status = "ACTIVE";
      record.running = true;
      updateJob(jobId, "completed");
    } catch (e) {
      record.status = "FAILED";
      updateJob(jobId, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function runRestore(jobId: string, record: InstanceRecord, _downloadUrl: string): Promise<void> {
    updateJob(jobId, "running");
    try {
      const stopped = await deps.docker.stop(record.docker_project);
      if (isErr(stopped)) throw new Error(stopped.error.message);

      // Real implementation would: download tarball, import DB, restore moodledata.
      const started = await deps.docker.start(record.docker_project);
      if (isErr(started)) throw new Error(started.error.message);

      record.status = "ACTIVE";
      record.running = true;
      updateJob(jobId, "completed");
    } catch (e) {
      record.status = "FAILED";
      updateJob(jobId, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  app.get("/v1/health", async (c) => {
    const dockerHealth = await deps.docker.status("myma-health-check");
    const response: AgentHealthResponse = {
      status: "ok",
      version: VERSION,
      docker_ok: dockerHealth.ok || false,
      uptime_s: Math.floor((Date.now() - new Date(STARTED_AT).getTime()) / 1000),
    };
    return c.json(response);
  });

  app.post("/v1/instances", async (c) => {
    const parsed = agentCreateInstanceSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "invalid body", details: parsed.error.format() } },
        400,
      );
    }
    const input = parsed.data;

    const existing = instances.get(input.instance_id);
    if (existing) {
      const job = jobs.get(existing.job_id);
      return c.json({ job_id: existing.job_id, status: job?.status ?? "unknown" }, 200);
    }

    const job = createJob();
    const record: InstanceRecord = {
      instance_id: input.instance_id,
      docker_project: input.docker_project,
      database_name: input.database_name,
      moodle_version: input.moodle_version,
      hostname: input.hostname,
      status: "PROVISIONING",
      running: false,
      job_id: job.job_id,
      created_at: nowIso(),
    };
    instances.set(input.instance_id, record);

    // Fire-and-forget async provisioning; idempotency is already recorded.
    void runCreate(job.job_id, input);

    return c.json({ job_id: job.job_id, status: job.status }, 202);
  });

  app.get("/v1/instances/:id/status", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const projectStatus = await deps.docker.status(record.docker_project);
    const projectMetrics = await deps.docker.metrics(record.docker_project);
    const running = projectStatus.ok ? projectStatus.value.running : record.running;
    const metrics = projectMetrics.ok
      ? projectMetrics.value
      : { cpu_usage: 0, memory_usage: 0 };
    record.running = running;

    const response: AgentInstanceStatus = {
      instance_id: record.instance_id,
      status: record.status,
      running,
      http_ok: running,
      containers: projectStatus.ok ? projectStatus.value.containers : [],
      metrics: {
        cpu_usage: metrics.cpu_usage,
        memory_usage: metrics.memory_usage,
        storage_usage: 0,
        db_size: 0,
      },
    };
    return c.json(response);
  });

  app.post("/v1/instances/:id/start", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const started = await deps.docker.start(record.docker_project);
    if (isErr(started)) {
      return c.json({ error: { code: "AGENT_ERROR", message: started.error.message } }, 502);
    }
    record.status = "ACTIVE";
    record.running = true;
    return c.json({ status: record.status });
  });

  app.post("/v1/instances/:id/stop", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const stopped = await deps.docker.stop(record.docker_project);
    if (isErr(stopped)) {
      return c.json({ error: { code: "AGENT_ERROR", message: stopped.error.message } }, 502);
    }
    record.status = "STOPPED";
    record.running = false;
    return c.json({ status: record.status });
  });

  app.post("/v1/instances/:id/restart", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const restarted = await deps.docker.restart(record.docker_project);
    if (isErr(restarted)) {
      return c.json({ error: { code: "AGENT_ERROR", message: restarted.error.message } }, 502);
    }
    record.status = "ACTIVE";
    record.running = true;
    return c.json({ status: record.status });
  });

  app.post("/v1/instances/:id/reset", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const parsed = agentCreateInstanceSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "invalid body", details: parsed.error.format() } },
        400,
      );
    }
    const input = parsed.data;

    const job = createJob();
    record.job_id = job.job_id;
    void runReset(job.job_id, record, input);

    return c.json({ job_id: job.job_id });
  });

  app.post("/v1/instances/:id/delete", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const job = createJob();
    record.job_id = job.job_id;
    void runDelete(job.job_id, record);

    return c.json({ job_id: job.job_id });
  });

  app.post("/v1/instances/:id/backup", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const parsed = backupRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "invalid body", details: parsed.error.format() } },
        400,
      );
    }
    const { upload_url, upload_headers } = parsed.data;
    const backupId = crypto.randomUUID();
    const size = 1024;

    try {
      // Real implementation would stream a tarball to the presigned URL.
      const response = await fetch(upload_url, {
        method: "PUT",
        headers: upload_headers,
        body: new Uint8Array(size),
      });
      if (!response.ok) {
        return c.json({ error: { code: "AGENT_ERROR", message: `upload failed: ${response.status}` } }, 502);
      }
    } catch (e) {
      return c.json(
        { error: { code: "AGENT_ERROR", message: e instanceof Error ? e.message : String(e) } },
        502,
      );
    }

    return c.json({ backup_id: backupId, size });
  });

  app.post("/v1/instances/:id/restore", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const parsed = restoreRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "invalid body", details: parsed.error.format() } },
        400,
      );
    }
    const { download_url } = parsed.data;

    const job = createJob();
    record.job_id = job.job_id;
    void runRestore(job.job_id, record, download_url);

    return c.json({ job_id: job.job_id });
  });

  app.get("/v1/instances/:id/metrics", async (c) => {
    const id = c.req.param("id");
    const record = instances.get(id);
    if (!record) return c.json({ error: { code: "NOT_FOUND", message: "instance not found" } }, 404);

    const metrics = await deps.docker.metrics(record.docker_project);
    const projectMetrics = metrics.ok ? metrics.value : { cpu_usage: 0, memory_usage: 0 };
    const response: AgentMetrics = {
      cpu_usage: projectMetrics.cpu_usage,
      memory_usage: projectMetrics.memory_usage,
      storage_usage: 0,
      db_size: 0,
    };
    return c.json(response);
  });

  return app;
}
