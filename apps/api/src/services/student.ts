import { createStudentSchema } from "@myma/validation";
import type { Page, Result, Student, StudentDto } from "@myma/types";
import { err, ok } from "@myma/types";
import type { Deps } from "../env.js";

export class StudentService {
  constructor(private readonly deps: Deps) {}

  async create(raw: unknown): Promise<Result<Student>> {
    const parsed = createStudentSchema.safeParse(raw);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", parsed.error.message, { issues: parsed.error.issues });
    }
    return this.deps.repos.students.create(parsed.data);
  }

  async list(): Promise<Result<Page<StudentDto>>> {
    const result = await this.deps.repos.students.list();
    if (!result.ok) return result;
    const items = result.value;
    return ok({
      items,
      total: items.length,
      offset: 0,
      limit: items.length,
    });
  }

  getById(id: string): Promise<Result<Student>> {
    return this.deps.repos.students.getById(id);
  }
}
