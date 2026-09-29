export interface SessionPayload {
  sub: string;
  email: string;
  role: "admin";
  exp: number;
}

function stringToBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToString(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return atob(padded);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const signature = await hmacHex(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySession(
  token: string,
  secret: string,
): Promise<Omit<SessionPayload, "exp"> | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlToString(encodedPayload)) as SessionPayload;
    if (!payload.sub || !payload.email || payload.role !== "admin" || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    const expectedSignature = await hmacHex(encodedPayload, secret);
    if (!constantTimeEqual(hexToBytes(providedSignature), hexToBytes(expectedSignature))) {
      return null;
    }

    const { exp: _exp, ...result } = payload;
    void _exp;
    return result;
  } catch {
    return null;
  }
}
