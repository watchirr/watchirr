declare module "pg" {
  export class Pool {
    constructor(config?: { connectionString?: string; max?: number });
    query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
  const pg: { Pool: typeof Pool };
  export default pg;
}
