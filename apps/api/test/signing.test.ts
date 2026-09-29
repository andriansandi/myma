import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { signRequest, sha256Hex, randomNonce, nowSeconds } from "../src/signing.js";

describe("signing", () => {
  it("produces a canonical string matching the agent's format", async () => {
    const key = "test-secret";
    const method = "POST";
    const path = "/v1/instances";
    const timestamp = "1700000000";
    const nonce = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const body = JSON.stringify({ instance_id: "550e8400-e29b-41d4-a716-446655440000" });

    const signature = await signRequest(method, path, timestamp, nonce, body, key);

    const bodyDigest = crypto.createHash("sha256").update(body).digest("hex");
    const canonicalString = [method, path, timestamp, nonce, bodyDigest].join("\n");
    const expected = crypto.createHmac("sha256", key).update(canonicalString).digest("hex");

    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes an empty body to the SHA-256 of the empty string", async () => {
    const digest = await sha256Hex("");
    expect(digest).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic for the same inputs and key", async () => {
    const sig1 = await signRequest("GET", "/v1/health", "123", "nonce", "", "k");
    const sig2 = await signRequest("GET", "/v1/health", "123", "nonce", "", "k");
    expect(sig1).toBe(sig2);
  });

  it("generates unique nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, randomNonce));
    expect(nonces.size).toBe(100);
  });

  it("returns a recent unix timestamp", () => {
    const before = Math.floor(Date.now() / 1000);
    const ts = nowSeconds();
    const after = Math.floor(Date.now() / 1000);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
