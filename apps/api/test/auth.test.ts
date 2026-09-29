import { describe, it, expect } from "vitest";
import { DevAuth } from "../src/auth.js";

describe("DevAuth", () => {
  it("trusts the static dev admin when ADMIN_AUTH_MODE=none in development", async () => {
    const auth = new DevAuth({ ADMIN_AUTH_MODE: "none", ENVIRONMENT: "development" });
    const result = await auth.getCurrentUser(new Headers());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.role).toBe("admin");
  });

  it("rejects ADMIN_AUTH_MODE=none in production", async () => {
    const auth = new DevAuth({ ADMIN_AUTH_MODE: "none", ENVIRONMENT: "production" });
    const result = await auth.getCurrentUser(new Headers());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects any non-none mode", async () => {
    const auth = new DevAuth({ ADMIN_AUTH_MODE: "clerk", ENVIRONMENT: "development" });
    const result = await auth.getCurrentUser(new Headers());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});
