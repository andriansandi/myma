import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { ActivityAction, AppError, InstanceStatus, Result } from "@myma/types";
import { err } from "@myma/types";
import { paginationSchema, instanceStatusFilterSchema } from "@myma/validation";
import type { Deps, Env } from "./env.js";
import { createDeps } from "./env.js";
import { toErrorResponse } from "./error.js";
import type { AuthUser } from "./auth.js";
import { SessionAuth } from "./auth.js";
import { z } from "zod";
import { StudentService } from "./services/student.js";
import { NodeService } from "./services/node.js";
import { InstanceService } from "./services/instance.js";
import { ProvisioningService } from "./services/provisioning.js";
import { BackupService } from "./services/backup.js";
import { DashboardService } from "./services/dashboard.js";
import { ActivityService } from "./activity.js";

export function createApp(env: Env, deps?: Deps): Hono {
  const app = new Hono();
  const resolvedDeps = deps ?? createDeps(env);

  app.use(
    "/api/*",
    cors({
      origin: (origin) => {
        // Dashboard origin + Cloudflare preview/dev origins.
        if (!origin) return "*";
        if (
          origin === "https://myma.kodr.site" ||
          origin.endsWith(".pages.dev") ||
          origin.endsWith(".workers.dev") ||
          origin.startsWith("http://localhost:")
        ) {
          return origin;
        }
        return "https://myma.kodr.site";
      },
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.onError((error, c) => {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      500,
    );
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  const api = new Hono<{ Variables: { user: AuthUser } }>();

  const loginSchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(8),
  });

  api.post("/auth/login", async (c) => {
    const body = await c.req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(
        { code: "VALIDATION_ERROR", message: parsed.error.message, details: { issues: parsed.error.issues } },
        c,
      );
    }

    const auth = resolvedDeps.auth as SessionAuth;
    const result = await auth.login(parsed.data.email, parsed.data.password);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.use(requireAuth(resolvedDeps));

  api.post("/auth", async (c) => {
    const result = await resolvedDeps.auth.getCurrentUser(c.req.raw.headers);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.get("/students", async (c) => {
    const result = await new StudentService(resolvedDeps).list();
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.post("/students", async (c) => {
    const body = await c.req.json();
    const result = await new StudentService(resolvedDeps).create(body);
    if (result.ok) return c.json(result.value, 201);
    return toErrorResponse(result.error, c);
  });

  api.get("/nodes", async (c) => {
    const result = await new NodeService(resolvedDeps).list();
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.post("/nodes", async (c) => {
    const body = await c.req.json();
    const result = await new NodeService(resolvedDeps).create(body);
    if (result.ok) return c.json(result.value, 201);
    return toErrorResponse(result.error, c);
  });

  api.get("/instances", async (c) => {
    const status = parseStatus(c.req.query("status"));
    const page = parsePagination(c);
    if (!status.ok) return toErrorResponse(status.error, c);
    if (!page.ok) return toErrorResponse(page.error, c);

    const result = await new InstanceService(resolvedDeps).list({
      status: status.value,
      ...page.value,
    });
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.post("/instances", async (c) => {
    const body = await c.req.json();
    const result = await new ProvisioningService(resolvedDeps).provision(body);
    if (result.ok) return c.json(result.value, 201);
    return toErrorResponse(result.error, c);
  });

  api.get("/instances/:id", async (c) => {
    const id = getParam(c, "id");
    if (id === undefined) return toErrorResponse(validationError("id is required"), c);
    const result = await new InstanceService(resolvedDeps).getById(id);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.post("/instances/:id/start", async (c) => handleLifecycle(c, resolvedDeps, "start"));
  api.post("/instances/:id/stop", async (c) => handleLifecycle(c, resolvedDeps, "stop"));
  api.post("/instances/:id/restart", async (c) => handleLifecycle(c, resolvedDeps, "restart"));
  api.post("/instances/:id/reset", async (c) => handleLifecycle(c, resolvedDeps, "reset"));
  api.post("/instances/:id/backup", async (c) => {
    const id = getParam(c, "id");
    if (id === undefined) return toErrorResponse(validationError("id is required"), c);
    const result = await new BackupService(resolvedDeps).backup(id);
    if (result.ok) return c.json(result.value, 201);
    return toErrorResponse(result.error, c);
  });
  api.post("/instances/:id/restore", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { backup_id?: string };
    if (!body.backup_id) {
      return toErrorResponse(validationError("backup_id is required"), c);
    }
    const result = await new BackupService(resolvedDeps).restore(id, body.backup_id);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });
  api.delete("/instances/:id", async (c) => {
    const id = getParam(c, "id");
    if (id === undefined) return toErrorResponse(validationError("id is required"), c);
    const result = await new ProvisioningService(resolvedDeps).delete(id);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.get("/backups", async (c) => {
    const page = parsePagination(c);
    if (!page.ok) return toErrorResponse(page.error, c);
    const result = await new BackupService(resolvedDeps).list(page.value);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.get("/activity", async (c) => {
    const page = parsePagination(c);
    if (!page.ok) return toErrorResponse(page.error, c);
    const filter = {
      instance_id: c.req.query("instance_id"),
      node_id: c.req.query("node_id"),
      action: c.req.query("action") as ActivityAction | undefined,
      ...page.value,
    };
    const result = await new ActivityService(resolvedDeps.repos.activityLogs).list(filter);
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  api.get("/stats", async (c) => {
    const result = await new DashboardService(resolvedDeps).stats();
    if (result.ok) return c.json(result.value);
    return toErrorResponse(result.error, c);
  });

  app.route("/api", api);
  return app;
}

function requireAuth(deps: Deps): MiddlewareHandler {
  return async (c, next) => {
    const result = await deps.auth.getCurrentUser(c.req.raw.headers);
    if (result.ok) {
      c.set("user", result.value);
      await next();
    } else {
      return toErrorResponse(result.error, c);
    }
  };
}

async function handleLifecycle(
  c: Context,
  deps: Deps,
  action: "start" | "stop" | "restart" | "reset",
): Promise<Response> {
  const id = getParam(c, "id");
  if (id === undefined) return toErrorResponse(validationError("id is required"), c);
  const service = new ProvisioningService(deps);
  let result;
  switch (action) {
    case "start":
      result = await service.start(id);
      break;
    case "stop":
      result = await service.stop(id);
      break;
    case "restart":
      result = await service.restart(id);
      break;
    case "reset":
      result = await service.reset(id);
      break;
  }
  if (result.ok) return c.json(result.value);
  return toErrorResponse(result.error, c);
}

function parseStatus(raw: string | undefined): Result<InstanceStatus | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const parsed = instanceStatusFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
  }
  return { ok: true, value: parsed.data };
}

function validationError(message: string): AppError {
  return { code: "VALIDATION_ERROR", message };
}

function getParam(c: Context, name: string): string | undefined {
  const value = c.req.param(name);
  return value;
}

function parsePagination(c: Context): Result<{ limit: number; offset: number }> {
  const parsed = paginationSchema.safeParse({
    offset: c.req.query("offset"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
  }
  return {
    ok: true,
    value: { offset: parsed.data.offset, limit: parsed.data.limit },
  };
}
