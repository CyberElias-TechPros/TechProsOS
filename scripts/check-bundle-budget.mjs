import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dir = 'dist/assets';
const files = readdirSync(dir).filter(f => f.endsWith('.js'));
// Initial graph = entry + vendor + db/platform + motion (shell). Charts/anim are route-deferred.
const initial = files.filter(f => /^(index|vendor|db|motion)-.*\.js$/.test(f));
let total = 0;
for (const f of initial) { const size = gzipSync(readFileSync(join(dir, f))).length; total += size; console.log(`${f}: ${(size / 1024).toFixed(2)} KB gzip`); }
console.log(`Initial JS total: ${(total / 1024).toFixed(2)} KB gzip`);
if (total > 300 * 1024) { console.error('FAIL: initial JS exceeds 300 KB gzip budget'); process.exit(1); }
console.log('PASS: initial JS within budget');
