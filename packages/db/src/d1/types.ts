/**
 * Minimal runtime type contract for a Cloudflare D1 connection.
 * Keep this small and dependency-free; the real D1Database satisfies it
 * structurally.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
  run(): Promise<D1Result>;
}

export interface D1Result<T = unknown> {
  results?: T[] | undefined;
  success: boolean;
  meta?: object | undefined;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}
