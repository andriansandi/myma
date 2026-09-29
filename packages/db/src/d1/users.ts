import { ok, err, type Result, type User, type UserRole } from "@myma/types";
import type { D1Database } from "./types.js";
import type { UserRepository, CreateUserInput } from "../repositories.js";
import { newId, nowIso } from "../utils.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  auth_provider: string;
  external_id: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    auth_provider: row.auth_provider as User["auth_provider"],
    external_id: row.external_id,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async getByExternalId(externalId: string): Promise<Result<User | null>> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE external_id = ? LIMIT 1")
      .bind(externalId)
      .first<UserRow>();
    return ok(row ? rowToUser(row) : null);
  }

  async upsert(input: CreateUserInput): Promise<Result<User>> {
    const existing = await this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .bind(input.email)
      .first<UserRow>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE users
           SET name = ?, auth_provider = ?, external_id = ?, role = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(input.name, input.auth_provider, input.external_id, input.role, nowIso(), existing.id)
        .run();
      return this.getById(existing.id);
    }

    const id = newId();
    const now = nowIso();
    const user: User = {
      id,
      email: input.email,
      name: input.name,
      auth_provider: input.auth_provider,
      external_id: input.external_id,
      role: input.role,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO users (id, email, name, auth_provider, external_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(user.id, user.email, user.name, user.auth_provider, user.external_id, user.role, user.created_at, user.updated_at)
        .run();
      return ok(user);
    } catch (e) {
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  private async getById(id: string): Promise<Result<User>> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    if (!row) {
      return err("NOT_FOUND", `User ${id} not found`);
    }
    return ok(rowToUser(row));
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
