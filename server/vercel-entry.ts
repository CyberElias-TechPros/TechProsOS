/**
 * Vercel serverless handler. Bundled to server-dist/vercel.mjs by scripts/build-api.mjs
 * and re-exported by the tracked api/index.mjs stub. Kept out of api/ so Vercel never
 * compiles the source with its own tsconfig.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from './api';
import { configFromEnv } from './config';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > 4_500_000) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large' } }));
      return;
    }
    chunks.push(b);
  }
  const cfg = configFromEnv();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  const request = new Request(`${cfg.appUrl}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';
  const response = await handleApi(request, { config: cfg, clientIp: ip });
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => { out[key] = value; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}
