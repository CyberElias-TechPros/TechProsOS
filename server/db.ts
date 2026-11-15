import pg from 'pg';
import type { ConnectionOptions } from 'node:tls';
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
    // A parameterless multi-statement string (each migration is one DDL batch) goes over the
    // simple query protocol, and node-postgres returns an ARRAY of results — one per statement —
    // instead of a single result. Reading `.rows` off that array yields undefined. Collapse to
    // the last statement's result, matching the PGlite wrapper below.
    const r = await this.client.query(sql, params.length ? params : undefined);
    const last = Array.isArray(r) ? r[r.length - 1] : r;
    return { rows: (last?.rows ?? []) as T[], rowCount: last?.rowCount ?? last?.rows?.length ?? 0 };
  }
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const pool = this.client as pg.Pool; const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await fn(new PgDatabase(client)); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async close(): Promise<void> { if (this.client instanceof pg.Pool) await this.client.end(); }
}
/** Accept a PEM inline, with escaped newlines, or base64-encoded (how most dashboards store it). */
export function normaliseCaCert(raw: string): string {
  const trimmed = raw.trim();
  const unescaped = trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
  const pem = unescaped.includes('-----BEGIN') ? unescaped : Buffer.from(trimmed, 'base64').toString('utf8');
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) throw new Error('DATABASE_CA_CERT must be a PEM certificate (inline, escaped-newline, or base64)');
  return pem.endsWith('\n') ? pem : `${pem}\n`;
}
/**
 * node-postgres merges the parsed connection string OVER the options object, so any `sslmode`
 * in the URL silently discards an explicit `ssl` object — including a private CA. Providers like
 * Aiven sign with their own project CA, so we strip sslmode from the URL and express the intent
 * as an explicit `ssl` object instead. See docs/DEPLOYMENT.md.
 */
export function resolvePgConnection(url: string, caCert?: string): { connectionString: string; ssl?: ConnectionOptions } {
  const parsed = new URL(url);
  const mode = (parsed.searchParams.get('sslmode') ?? '').toLowerCase();
  for (const key of ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
  const ca = caCert ? normaliseCaCert(caCert) : undefined;
  let ssl: ConnectionOptions | undefined;
  if (mode === 'disable' && !ca) ssl = undefined;
  else if (mode === 'no-verify') ssl = { rejectUnauthorized: false };
  else if (mode === 'verify-ca') ssl = { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined };
  else if (ca || ['require', 'verify-full', 'verify-ca', 'prefer'].includes(mode)) ssl = { ca, rejectUnauthorized: true };
  return { connectionString: parsed.toString(), ssl };
}
/**
 * Wrap an already-constructed pg Pool/PoolClient. Exported so the result-normalisation
 * behaviour (single result vs the array pg returns for multi-statement SQL) can be tested
 * without a live database.
 */
export function postgresLike(client: pg.Pool | pg.PoolClient): Database { return new PgDatabase(client); }
let pool: pg.Pool | undefined;
export function postgres(url: string, options: { caCert?: string; max?: number } = {}): Database {
  const max = Math.max(1, Math.min(options.max ?? 3, 20));
  pool ??= new pg.Pool({ ...resolvePgConnection(url, options.caCert), max, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 10000, statement_timeout: 15000, application_name: 'techpros-one' });
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
