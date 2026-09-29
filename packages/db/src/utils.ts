/** Generate a UUIDv4 using the Web Crypto API available in Workers and Node 20+. */
export function newId(): string {
  const webcrypto = (globalThis as { crypto?: { randomUUID(): string } }).crypto;
  if (!webcrypto) {
    throw new Error("crypto.randomUUID is not available");
  }
  return webcrypto.randomUUID();
}

/** Current UTC timestamp as an ISO-8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}
