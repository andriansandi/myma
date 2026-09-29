/**
 * Unit tests for HMAC auth middleware rate-limit behavior.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { Hono } from "hono";
import { createAuthMiddleware } from "../src/auth.js";
import { signRequest } from "../src/signing.js";

const keyId = "test-key";
const key = crypto.randomBytes(32).toString("hex");

function buildApp(rateLimitRpm: number) {
  const app = new Hono();
  app.use(createAuthMiddleware({ expectedKeyId: keyId, expectedKey: key, rateLimitRequestsPerMinute: rateLimitRpm }));
  app.get("/v1/protected", (c) => c.json({ ok: true }));
  return app;
}

function signedRequest(app: ReturnType<typeof buildApp>, path: string, signatureKey?: string) {
  const headers = signRequest({ key: signatureKey ?? key, keyId, method: "GET", path });
  return app.request(path, { method: "GET", headers: { ...headers } });
}

function invalidRequest(app: ReturnType<typeof buildApp>, path: string) {
  return signedRequest(app, path, "wrong-key");
}

describe("rate limiting", () => {
  it("does not consume budget on invalid-signature requests", async () => {
    const app = buildApp(1);
    const path = "/v1/protected";

    // Three invalid requests should not exhaust the per-minute budget.
    for (let i = 0; i < 3; i++) {
      const res = await invalidRequest(app, path);
      expect(res.status).toBe(403);
    }

    // The first valid request must still succeed.
    const valid = await signedRequest(app, path);
    expect(valid.status).toBe(200);
  });

  it("does consume budget on valid-signature requests", async () => {
    const app = buildApp(1);
    const path = "/v1/protected";

    const first = await signedRequest(app, path);
    expect(first.status).toBe(200);

    const second = await signedRequest(app, path);
    expect(second.status).toBe(403);
    const body = (await second.json()) as { error: { message: string } };
    expect(body.error.message).toBe("rate limit exceeded");
  });
});
