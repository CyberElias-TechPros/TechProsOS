// @vitest-environment node
/**
 * Guards for two defects that only ever appeared on Vercel, never in local checks:
 *
 * 1. The function bundle was written straight into api/ AND gitignored. Vercel discovers
 *    functions by globbing api/ before the build command runs, so the deployment shipped
 *    with zero functions and every /api/* request 404'd. api/index.mjs must stay tracked.
 * 2. node-postgres returns an ARRAY of results for a parameterless multi-statement string
 *    (each migration is one DDL batch), so `.rows` was undefined and migrating crashed with
 *    "Cannot read properties of undefined (reading 'length')".
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { embeddedDatabase, migrate } from '../server/db';

describe('Vercel function entrypoint', () => {
  it('api/index.mjs is tracked by git, not ignored', () => {
    // Vercel globs api/ before building; an untracked entrypoint means no function is created.
    const tracked = execFileSync('git', ['ls-files', 'api/index.mjs'], { encoding: 'utf8' }).trim();
    expect(tracked).toBe('api/index.mjs');
  });

  it('delegates to the generated bundle instead of inlining TypeScript', () => {
    const stub = readFileSync('api/index.mjs', 'utf8');
    expect(stub).toMatch(/from\s+'\.\.\/server-dist\/vercel\.mjs'/);
    expect(stub).toMatch(/export const config = \{ maxDuration: \d+ \}/);
    expect(stub).toMatch(/export default handler/);
    // Importing server/*.ts here would put it back under Vercel's nodenext compiler.
    expect(stub).not.toMatch(/from\s+'[^']*server\//);
  });

  it('builds the bundle outside api/ so discovery is not confused by it', () => {
    const script = readFileSync('scripts/build-api.mjs', 'utf8');
    expect(script).toMatch(/const OUT = 'server-dist\/vercel\.mjs'/);
    expect(existsSync('api/index.mjs')).toBe(true);
  });

  it('routes every /api path to the single function', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    // Outside Next.js, api/index.mjs maps only to /api/index; a rewrite is required.
    expect(config.rewrites[0]).toEqual({ source: '/api/(.*)', destination: '/api/index' });
    const spa = config.rewrites.find((r: { destination: string }) => r.destination === '/index.html');
    expect(spa.source).toContain('?!api/');
  });
});

describe('migrations over multi-statement DDL', () => {
  it('applies a batch containing several statements without crashing on .rows', async () => {
    const db = await embeddedDatabase();
    try {
      // migrate() runs each migration as one multi-statement string; this is the shape
      // that produced an array result and crashed the Postgres driver path on Vercel.
      const applied = await migrate(db);
      expect(applied).toBeGreaterThan(0);
      const tables = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='public'");
      expect(Number(tables.rows[0].count)).toBeGreaterThan(10);
      // Re-running is a no-op: the advisory lock and version table make it idempotent.
      expect(await migrate(db)).toBe(0);
    } finally { await db.close(); }
  });

  it('normalises an array-shaped driver result to the last statement', async () => {
    // Directly exercise the collapse logic the PgDatabase wrapper relies on, without
    // needing a live Postgres: a fake client returning the array shape pg produces.
    const { postgresLike } = await import('../server/db');
    const fake = { query: async () => ([{ rows: [], rowCount: 0 }, { rows: [{ ok: 1 }], rowCount: 1 }]) };
    const db = postgresLike(fake as never);
    const r = await db.query('CREATE TABLE a(i int); SELECT 1 AS ok');
    expect(r.rows).toEqual([{ ok: 1 }]);
    expect(r.rowCount).toBe(1);
  });

  it('tolerates a statement that returns no result object at all', async () => {
    const { postgresLike } = await import('../server/db');
    const db = postgresLike({ query: async () => ([undefined]) } as never);
    expect(await db.query('SET LOCAL statement_timeout = 0')).toEqual({ rows: [], rowCount: 0 });
  });
});
