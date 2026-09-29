/**
 * HMAC request authentication middleware for the MyMA Agent API.
 *
 * Enforces:
 *  - presence of X-Myma-Key-Id, X-Myma-Timestamp, X-Myma-Nonce, X-Myma-Signature
 *  - timestamp within ±clockSkewSeconds (default 300 s)
 *  - nonce not seen before (in-memory, capped in size)
 *  - correct HMAC-SHA256 signature for the configured key id
 *  - per-key-id rate limit (default 60 req/min)
 *
 * GET /v1/health is the only unauthenticated route.
 */
import type { MiddlewareHandler } from "hono";
import {
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  verifySignature,
} from "./signing.js";

export interface AuthConfig {
  expectedKeyId: string;
  expectedKey: string;
  clockSkewSeconds?: number;
  maxNonceEntries?: number;
  rateLimitRequestsPerMinute?: number;
}

const UNAUTHORIZED = { error: { code: "UNAUTHORIZED", message: "unauthorized" } } as const;
const FORBIDDEN = { error: { code: "FORBIDDEN", message: "forbidden" } } as const;
const RATE_LIMITED = {
  error: { code: "FORBIDDEN", message: "rate limit exceeded" },
} as const;
const STALE = { error: { code: "FORBIDDEN", message: "timestamp outside allowed window" } } as const;
const REPLAY = { error: { code: "FORBIDDEN", message: "nonce replay detected" } } as const;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function createAuthMiddleware(config: AuthConfig): MiddlewareHandler {
  const clockSkew = config.clockSkewSeconds ?? 300;
  const maxNonceEntries = config.maxNonceEntries ?? 10_000;
  const rateLimitRpm = config.rateLimitRequestsPerMinute ?? 60;
  const nonces = new Map<string, number>();
  const rateLimits = new Map<string, RateLimitBucket>();

  const pruneNonces = (): void => {
    const now = Math.floor(Date.now() / 1000);
    for (const [nonce, seenAt] of nonces.entries()) {
      if (now - seenAt > clockSkew) nonces.delete(nonce);
    }
    while (nonces.size > maxNonceEntries) {
      const oldest = nonces.keys().next().value;
      if (oldest !== undefined) nonces.delete(oldest);
    }
  };

  const checkRateLimit = (keyId: string): boolean => {
    const now = Math.floor(Date.now() / 1000);
    let bucket = rateLimits.get(keyId);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60 };
      rateLimits.set(keyId, bucket);
    }
    if (bucket.count >= rateLimitRpm) return false;
    bucket.count += 1;
    return true;
  };

  return async (c, next) => {
    if (c.req.path === "/v1/health") return await next();

    const headers = c.req.raw.headers;
    const keyId = headers.get(HEADER_KEY_ID);
    const timestamp = headers.get(HEADER_TIMESTAMP);
    const nonce = headers.get(HEADER_NONCE);
    const signature = headers.get(HEADER_SIGNATURE);

    if (!keyId || !timestamp || !nonce || !signature) {
      return c.json(UNAUTHORIZED, 401);
    }

    if (keyId !== config.expectedKeyId) {
      return c.json(FORBIDDEN, 403);
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      return c.json(STALE, 403);
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - tsNum) > clockSkew) {
      return c.json(STALE, 403);
    }

    pruneNonces();
    if (nonces.has(nonce)) {
      return c.json(REPLAY, 403);
    }

    let rawBody = "";
    try {
      rawBody = await c.req.raw.clone().text();
    } catch {
      rawBody = "";
    }

    const valid = verifySignature({
      key: config.expectedKey,
      method: c.req.method,
      path: c.req.path,
      body: rawBody,
      headers: {
        [HEADER_KEY_ID]: keyId,
        [HEADER_TIMESTAMP]: timestamp,
        [HEADER_NONCE]: nonce,
        [HEADER_SIGNATURE]: signature,
      },
    });

    if (!valid) {
      return c.json(FORBIDDEN, 403);
    }

    // Only consume rate-limit budget for cryptographically authenticated requests.
    if (!checkRateLimit(keyId)) {
      return c.json(RATE_LIMITED, 403);
    }

    nonces.set(nonce, tsNum);
    return await next();
  };
}
