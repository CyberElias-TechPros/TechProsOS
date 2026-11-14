import { postgres, migrate } from '../server/db';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required. Set it in your shell or deployment environment; never commit it.'); process.exit(1); }
const db = postgres(url);
try { const count = await migrate(db); console.log(`Migrations complete: ${count} applied.`); }
finally { await db.close(); }
