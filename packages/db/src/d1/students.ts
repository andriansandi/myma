import { ok, err, type Result, type Student, type StudentDto, type StudentStatus, type CreateStudentInput } from "@myma/types";
import type { D1Database } from "./types.js";
import type { StudentRepository } from "../repositories.js";
import { newId, nowIso } from "../utils.js";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class D1StudentRepository implements StudentRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateStudentInput): Promise<Result<Student>> {
    const id = newId();
    const createdAt = nowIso();
    const student: Student = {
      id,
      name: input.name,
      email: input.email,
      status: "ACTIVE",
      created_at: createdAt,
      updated_at: createdAt,
    };

    try {
      await this.db
        .prepare(
          `INSERT INTO students (id, name, email, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(student.id, student.name, student.email, student.status, student.created_at, student.updated_at)
        .run();
      return ok(student);
    } catch (e) {
      if (isUniqueConstraintError(e, "students.email")) {
        return err("CONFLICT", "A student with this email already exists");
      }
      return err("INTERNAL_ERROR", toErrorMessage(e));
    }
  }

  async list(): Promise<Result<StudentDto[]>> {
    const { results } = await this.db
      .prepare("SELECT * FROM students ORDER BY created_at DESC")
      .all<StudentRow>();
    return ok((results ?? []).map(rowToStudent));
  }

  async getById(id: string): Promise<Result<Student>> {
    const row = await this.db.prepare("SELECT * FROM students WHERE id = ?").bind(id).first<StudentRow>();
    if (!row) {
      return err("NOT_FOUND", `Student ${id} not found`);
    }
    return ok(rowToStudent(row));
  }

  async updateStatus(id: string, status: StudentStatus): Promise<Result<Student>> {
    const updatedAt = nowIso();
    const result = await this.db
      .prepare("UPDATE students SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, updatedAt, id)
      .run();

    if (!result.success) {
      return err("INTERNAL_ERROR", "Failed to update student status");
    }

    const row = await this.db.prepare("SELECT * FROM students WHERE id = ?").bind(id).first<StudentRow>();
    if (!row) {
      return err("NOT_FOUND", `Student ${id} not found`);
    }
    return ok(rowToStudent(row));
  }
}

function isUniqueConstraintError(e: unknown, column: string): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed") && e.message.includes(column);
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
