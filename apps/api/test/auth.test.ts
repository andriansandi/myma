import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { signSession, verifySession } from "../src/auth/session.js";
import { SessionAuth } from "../src/auth.js";
import { FakeUserRepository } from "./fakes.js";

describe("password helpers", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "a-very-secret-key";

  it("round-trips a valid token", async () => {
    const payload = { sub: "user-1", email: "admin@myma.local", role: "admin" as const, exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signSession(payload, secret);
    const verified = await verifySession(token, secret);
    expect(verified).toEqual({ sub: "user-1", email: "admin@myma.local", role: "admin" });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(
      { sub: "user-1", email: "admin@myma.local", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    );
    const tampered = token.slice(0, -5) + "00000";
    const verified = await verifySession(tampered, secret);
    expect(verified).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(
      { sub: "user-1", email: "admin@myma.local", role: "admin", exp: Math.floor(Date.now() / 1000) - 1 },
      secret,
    );
    const verified = await verifySession(token, secret);
    expect(verified).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(
      { sub: "user-1", email: "admin@myma.local", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    );
    const verified = await verifySession(token, "different-secret");
    expect(verified).toBeNull();
  });
});

describe("SessionAuth", () => {
  const secret = "session-secret";

  async function createUser() {
    const users = new FakeUserRepository();
    const passwordHash = await hashPassword("password123");
    const result = await users.createWithPassword({
      email: "admin@myma.local",
      name: "Admin",
      auth_provider: "none",
      external_id: null,
      role: "admin",
      password_hash: passwordHash,
    });
    if (!result.ok) throw new Error("failed to create user");
    return { users, user: result.value };
  }

  it("logs in with correct credentials", async () => {
    const { users, user } = await createUser();
    const auth = new SessionAuth({ users, secret });

    const result = await auth.login("admin@myma.local", "password123");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.user).toEqual({ id: user.id, email: user.email, name: user.name, role: "admin" });
    expect(result.value.token).toMatch(/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/);
  });

  it("rejects wrong password with the same message as unknown email", async () => {
    const { users } = await createUser();
    const auth = new SessionAuth({ users, secret });

    const wrong = await auth.login("admin@myma.local", "wrong-password");
    expect(wrong.ok).toBe(false);
    if (wrong.ok) return;
    expect(wrong.error.code).toBe("UNAUTHORIZED");
    expect(wrong.error.message).toBe("Invalid email or password");

    const unknown = await auth.login("nobody@myma.local", "password123");
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error.code).toBe("UNAUTHORIZED");
    expect(unknown.error.message).toBe("Invalid email or password");
  });

  it("rejects a user without a password_hash", async () => {
    const users = new FakeUserRepository();
    await users.createWithPassword({
      email: "legacy@myma.local",
      name: "Legacy",
      auth_provider: "none",
      external_id: null,
      role: "admin",
      password_hash: null,
    });
    const auth = new SessionAuth({ users, secret });

    const result = await auth.login("legacy@myma.local", "password123");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("Invalid email or password");
  });

  it("getCurrentUser accepts a valid Bearer token", async () => {
    const { users } = await createUser();
    const auth = new SessionAuth({ users, secret });
    const login = await auth.login("admin@myma.local", "password123");
    if (!login.ok) throw new Error("login failed");

    const result = await auth.getCurrentUser(new Headers({ Authorization: `Bearer ${login.value.token}` }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("admin@myma.local");
  });

  it("getCurrentUser rejects missing or invalid tokens", async () => {
    const { users } = await createUser();
    const auth = new SessionAuth({ users, secret });

    const missing = await auth.getCurrentUser(new Headers());
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.message).toBe("Authentication required");

    const invalid = await auth.getCurrentUser(new Headers({ Authorization: "Bearer invalid-token" }));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.message).toBe("Authentication required");
  });
});
