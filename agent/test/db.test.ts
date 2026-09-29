/**
 * Unit tests for MariaDB admin helpers.
 */
import { describe, expect, it } from "vitest";
import { buildCreateUserSql, escapeSqlString } from "../src/db.js";

describe("escapeSqlString", () => {
  it("escapes single quotes", () => {
    expect(escapeSqlString("abc'def")).toBe("abc''def");
  });

  it("escapes backslashes", () => {
    expect(escapeSqlString("abc\\")).toBe("abc\\\\");
  });

  it("escapes a backslash before a quote", () => {
    expect(escapeSqlString("abc\\'")).toBe("abc\\\\''");
  });
});

describe("buildCreateUserSql", () => {
  it("contains CREATE USER IF NOT EXISTS, ALTER USER, GRANT and FLUSH", () => {
    const sql = buildCreateUserSql("student_alpha_db", "P@ssw0rd!");
    expect(sql).toContain("CREATE USER IF NOT EXISTS");
    expect(sql).toContain("ALTER USER");
    expect(sql).toContain("GRANT ALL PRIVILEGES");
    expect(sql).toContain("FLUSH PRIVILEGES");
  });

  it("escapes identifiers and passwords", () => {
    const sql = buildCreateUserSql("db`name", "pass'word");
    expect(sql).toContain("`db``name`");
    expect(sql).toContain("'pass''word'");
  });
});
