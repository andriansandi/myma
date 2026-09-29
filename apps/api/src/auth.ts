import { err, ok, type Result } from "@myma/types";

export interface AuthUser {
  id: string;
  email: string;
  role: "admin";
}

export interface AuthService {
  getCurrentUser(headers: Headers): Promise<Result<AuthUser>>;
}

/**
 * Development auth: when ADMIN_AUTH_MODE is `none` the request is trusted as a
 * static admin identity. Any other mode is reserved for a real IdP and returns
 * UNAUTHORIZED until Clerk/Cloudflare Access/Auth0 integration is wired in.
 */
export class DevAuth implements AuthService {
  constructor(
    private readonly env: {
      ADMIN_AUTH_MODE: string;
      ENVIRONMENT: string;
    },
  ) {}

  async getCurrentUser(_headers: Headers): Promise<Result<AuthUser>> {
    const environment = this.env.ENVIRONMENT ?? "development";
    if (this.env.ADMIN_AUTH_MODE === "none" && environment !== "production") {
      return ok({ id: "dev-admin", email: "admin@myma.local", role: "admin" });
    }
    return err("UNAUTHORIZED", "Authentication required");
  }
}
