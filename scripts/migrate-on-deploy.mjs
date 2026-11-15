/**
 * Apply pending migrations during a Vercel production build.
 *
 * Why here: the build container has unrestricted egress and already receives DATABASE_URL
 * and DATABASE_CA_CERT, so no extra CI secret or manual step is needed. `migrate()` takes a
 * Postgres advisory transaction lock and records versions in schema_migrations, so concurrent
 * or repeated builds are safe and it is a no-op once the schema is current.
 *
 * A database outage must not block shipping frontend/function fixes, so a failure here is
 * loud but non-fatal: it prints a banner in the build log, and GET /api/ready stays
 * { ok: false, migrations: 0 } until the schema is actually applied. Readiness — not the
 * build exit code — is the authoritative signal.
 */
import { spawnSync } from 'node:child_process';

const isProduction = process.env.VERCEL_ENV === 'production';
const hasDatabase = Boolean(process.env.DATABASE_URL);

if (!isProduction || !hasDatabase) {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'local'}, DATABASE_URL ${hasDatabase ? 'set' : 'absent'}).`);
  process.exit(0);
}

console.log('[migrate] applying pending migrations…');
const result = spawnSync('npm', ['run', 'db:migrate'], { stdio: 'inherit', env: process.env });

if (result.status === 0) {
  console.log('[migrate] schema is up to date.');
  process.exit(0);
}

console.error('');
console.error('****************************************************************************');
console.error(`* MIGRATION FAILED (exit ${result.status ?? 'signal ' + result.signal}). The deploy will continue, but the`);
console.error('* database schema is NOT current. GET /api/ready will report ok:false.');
console.error('* Fix the database connection, then redeploy to apply migrations.');
console.error('****************************************************************************');
console.error('');
process.exit(0);
