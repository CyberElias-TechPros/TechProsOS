/** Local API dev server. Production uses Vercel Functions (api/[...path].ts). */
import { createServer } from 'node:http';
import { handleApi } from './api';
import { configFromEnv } from './config';
const config = configFromEnv(); const port = Number(process.env.API_PORT ?? 8787);
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const url = `${config.appUrl}${req.url ?? '/'}`;
  const request = new Request(url, { method: req.method ?? 'GET', headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const response = await handleApi(request, { config, clientIp: req.socket.remoteAddress ?? 'unknown' });
  const out: Record<string, string | string[]> = {}; response.headers.forEach((v, k) => { out[k] = v; }); const cookies = response.headers.getSetCookie(); if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out); res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port, '0.0.0.0', () => console.log(`TechPros API (${config.mode}) listening on http://0.0.0.0:${port}`));
