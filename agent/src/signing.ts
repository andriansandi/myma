/**
 * HMAC-SHA256 request signing for the MyMA Agent API.
 *
 * Canonical string:
 *   method + "\n" +
 *   path + "\n" +
 *   timestamp + "\n" +
 *   nonce + "\n" +
 *   sha256(body)
 *
 * Where sha256(body) is the lowercase hex digest of the raw request body
 * (empty string for requests with no body).
 *
 * Headers:
 *   X-Myma-Key-Id:     key identifier (must match the key used for signing)
 *   X-Myma-Timestamp:  unix seconds as a decimal string
 *   X-Myma-Nonce:      random 128-bit value, base64url encoded
 *   X-Myma-Signature:  lowercase hex HMAC-SHA256 of the canonical string
 */
import crypto from "node:crypto";

export interface SignRequestInput {
  key: string;
  method: string;
  path: string;
  body?: string | Uint8Array | null;
  timestamp?: string;
  nonce?: string;
}

export interface SignedRequestHeaders {
  "X-Myma-Key-Id": string;
  "X-Myma-Timestamp": string;
  "X-Myma-Nonce": string;
  "X-Myma-Signature": string;
}

const HEADER_KEY_ID = "X-Myma-Key-Id";
const HEADER_TIMESTAMP = "X-Myma-Timestamp";
const HEADER_NONCE = "X-Myma-Nonce";
const HEADER_SIGNATURE = "X-Myma-Signature";

function bodyToString(body: string | Uint8Array | null | undefined): string {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  return new TextDecoder().decode(body);
}

export function sha256Hex(body: string | Uint8Array | null | undefined): string {
  const data = bodyToString(body);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function buildCanonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string | Uint8Array | null | undefined,
): string {
  return [method.toUpperCase(), path, timestamp, nonce, sha256Hex(body)].join("\n");
}

export function sign(
  key: string,
  canonicalString: string,
): string {
  return crypto.createHmac("sha256", key).update(canonicalString).digest("hex");
}

export function signRequest(
  input: SignRequestInput & { keyId: string },
): SignedRequestHeaders {
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? crypto.randomBytes(16).toString("base64url");
  const canonicalString = buildCanonicalString(
    input.method,
    input.path,
    timestamp,
    nonce,
    input.body ?? "",
  );
  const signature = sign(input.key, canonicalString);
  return {
    [HEADER_KEY_ID]: input.keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

export interface VerifySignatureInput {
  key: string;
  method: string;
  path: string;
  body?: string | Uint8Array | null;
  headers: {
    [HEADER_KEY_ID]?: string | undefined;
    [HEADER_TIMESTAMP]?: string | undefined;
    [HEADER_NONCE]?: string | undefined;
    [HEADER_SIGNATURE]?: string | undefined;
  };
}

export function verifySignature(input: VerifySignatureInput): boolean {
  const timestamp = input.headers[HEADER_TIMESTAMP];
  const nonce = input.headers[HEADER_NONCE];
  const providedSignature = input.headers[HEADER_SIGNATURE];

  if (!timestamp || !nonce || !providedSignature) return false;

  const canonicalString = buildCanonicalString(
    input.method,
    input.path,
    timestamp,
    nonce,
    input.body ?? "",
  );
  const expectedSignature = sign(input.key, canonicalString);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );
  } catch {
    return false;
  }
}

export {
  HEADER_KEY_ID,
  HEADER_TIMESTAMP,
  HEADER_NONCE,
  HEADER_SIGNATURE,
};
