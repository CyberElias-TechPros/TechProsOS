import pg from 'pg';
import { MIGRATIONS } from './schema';
import type { PGliteInterface, Transaction } from '@electric-sql/pglite';
export interface QueryResult<T = Record<string, unknown>> { rows: T[]; rowCount: number }
export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
class PgDatabase implements Database {
  constructor(private client: pg.Pool | pg.PoolClient) {}
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const r = await this.client.query(sql, params); return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
  }
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const pool = this.client as pg.Pool; const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await fn(new PgDatabase(client)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async close(): Promise<void> { if (this.client instanceof pg.Pool) await this.client.end(); }
}
let pool: pg.Pool | undefined;
export function postgres(url: string): Database {
  pool ??= new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 7000, idleTimeoutMillis: 15000,
    statement_timeout: 15000, application_name: 'techpros-one', ssl: /sslmode=(require|verify-full)/.test(url) ? { rejectUnauthorized: true } : undefined });
  return new PgDatabase(pool);
}
/** PGlite is the same PostgreSQL engine in WASM, for local development/tests only. */
export async function embeddedDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite(dataDir);
  const wrap = (c: PGliteInterface | Transaction): Database => ({
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      if (!params.length) { const results = await c.exec(sql); const r = results[results.length - 1]; return { rows: (r?.rows ?? []) as T[], rowCount: r?.affectedRows ?? r?.rows.length ?? 0 }; }
      const r = await c.query(sql, params); return { rows: r.rows as T[], rowCount: r.affectedRows ?? r.rows.length };
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>) { return client.transaction(async tx => fn(wrap(tx))); },
    async close() { await client.close(); },
  });
  return wrap(client);
}
export async function migrate(db: Database): Promise<number> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version)); let count = 0;
  for (const migration of MIGRATIONS) if (!applied.has(migration.version)) {
    await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(721901)');
      const exists = await tx.query('SELECT 1 FROM schema_migrations WHERE version=$1', [migration.version]);
      if (exists.rows.length) return;
      await tx.query(migration.sql); await tx.query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]); count++;
    });
  }
  return count;
}
