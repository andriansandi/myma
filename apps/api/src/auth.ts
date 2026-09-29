import { err, ok, type Result } from "@myma/types";
import type { UserRepository } from "@myma/db";
import { verifyPassword } from "./auth/password.js";
import { signSession, verifySession } from "./auth/session.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "admin";
}

export interface AuthService {
  getCurrentUser(headers: Headers): Promise<Result<AuthUser>>;
}

export class SessionAuth implements AuthService {
  constructor(
    private readonly deps: {
      users: UserRepository;
      secret: string;
    },
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<Result<{ token: string; user: AuthUser & { name: string } }>> {
    const lookup = await this.deps.users.getByEmailWithPassword(email);
    if (!lookup.ok) return lookup;

    const record = lookup.value;
    if (!record || !record.password_hash) {
      return err("UNAUTHORIZED", "Invalid email or password");
    }

    const valid = await verifyPassword(password, record.password_hash);
    if (!valid) {
      return err("UNAUTHORIZED", "Invalid email or password");
    }

    const user = record.user;
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const payload = { sub: user.id, email: user.email, role: "admin" as const, exp };
    const token = await signSession(payload, this.deps.secret);

    return ok({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: "admin" },
    });
  }

  async getCurrentUser(headers: Headers): Promise<Result<AuthUser>> {
    const auth = headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      return err("UNAUTHORIZED", "Authentication required");
    }

    const session = await verifySession(token, this.deps.secret);
    if (!session) {
      return err("UNAUTHORIZED", "Authentication required");
    }

    return ok({ id: session.sub, email: session.email, role: session.role });
  }
}
