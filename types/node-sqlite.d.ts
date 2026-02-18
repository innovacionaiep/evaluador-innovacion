declare module "node:sqlite" {
  interface StatementSync {
    run(...args: unknown[]): { lastInsertRowid: number };
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  }
  class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
  export { DatabaseSync };
}
