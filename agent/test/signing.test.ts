/**
 * Unit tests for HMAC request signing.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  buildCanonicalString,
  sha256Hex,
  signRequest,
  verifySignature,
} from "../src/signing.js";

describe("signing", () => {
  const key = "a-very-secret-key-used-for-testing-only";
  const method = "POST";
  const path = "/v1/instances";
  const body = JSON.stringify({ instance_id: crypto.randomUUID() });

  it("signs and verifies a request", () => {
    const headers = signRequest({ key, keyId: "key-1", method, path, body });
    const valid = verifySignature({
      key,
      method,
      path,
      body,
      headers,
    });
    expect(valid).toBe(true);
  });

  it("rejects a signature made with a different key", () => {
    const headers = signRequest({ key, keyId: "key-1", method, path, body });
    const valid = verifySignature({
      key: "a-different-key",
      method,
      path,
      body,
      headers,
    });
    expect(valid).toBe(false);
  });

  it("rejects a signature when the body is altered", () => {
    const headers = signRequest({ key, keyId: "key-1", method, path, body });
    const valid = verifySignature({
      key,
      method,
      path,
      body: body.replace("}", ',"extra":1}'),
      headers,
    });
    expect(valid).toBe(false);
  });

  it("rejects a signature when the path is altered", () => {
    const headers = signRequest({ key, keyId: "key-1", method, path, body });
    const valid = verifySignature({
      key,
      method,
      path: "/v1/health",
      body,
      headers,
    });
    expect(valid).toBe(false);
  });

  it("rejects a signature when the nonce is altered", () => {
    const headers = signRequest({ key, keyId: "key-1", method, path, body });
    const forged = { ...headers, "X-Myma-Nonce": "forged" };
    const valid = verifySignature({ key, method, path, body, headers: forged });
    expect(valid).toBe(false);
  });

  it("verifies a request with an empty body", () => {
    const headers = signRequest({ key, keyId: "key-1", method: "GET", path: "/v1/health" });
    const valid = verifySignature({
      key,
      method: "GET",
      path: "/v1/health",
      headers,
    });
    expect(valid).toBe(true);
  });

  it("produces the documented canonical string", () => {
    const timestamp = "1700000000";
    const nonce = "abc123";
    const canonical = buildCanonicalString(method, path, timestamp, nonce, body);
    const expected = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${sha256Hex(body)}`;
    expect(canonical).toBe(expected);
  });
});
