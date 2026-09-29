export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toBytes(input: string | Uint8Array | null | undefined): Uint8Array {
  if (input === null || input === undefined) {
    return new Uint8Array(0);
  }
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  return input;
}

export async function sha256Hex(
  input: string | Uint8Array | null | undefined,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacHex(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string | Uint8Array | null | undefined,
  key: string,
): Promise<string> {
  const bodyDigest = await sha256Hex(body);
  const canonical = [method.toUpperCase(), path, timestamp, nonce, bodyDigest].join("\n");
  return hmacHex(canonical, key);
}
