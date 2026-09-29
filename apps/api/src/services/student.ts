import { createStudentSchema } from "@myma/validation";
import type { Result, Student, StudentDto } from "@myma/types";
import { err } from "@myma/types";
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

  list(): Promise<Result<StudentDto[]>> {
    return this.deps.repos.students.list();
  }

  getById(id: string): Promise<Result<Student>> {
    return this.deps.repos.students.getById(id);
  }
}
