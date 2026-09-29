/**
 * Result type + error model used across services and repositories.
 * Keep the error mapping to stable codes in ONE place (here).
 */
import type { ErrorCode } from "./dto.js";

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<T> {
  return { ok: false, error: { code, message, details } };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T>(r: Result<T>): r is { ok: false; error: AppError } {
  return !r.ok;
}

/** Wraps an unknown throwable into an AppError for consistent envelopes. */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return e as AppError;
  }
  const message = e instanceof Error ? e.message : String(e);
  return { code: "INTERNAL_ERROR", message };
}