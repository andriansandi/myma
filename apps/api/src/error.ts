import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppError, ErrorCode } from "@myma/types";

const statusMap: Record<ErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  AGENT_ERROR: 502,
  DNS_ERROR: 502,
  PROVISIONING_ERROR: 500,
  INTERNAL_ERROR: 500,
};

export function toErrorResponse(error: AppError, c: Context): Response {
  return c.json({ error }, statusMap[error.code]);
}
