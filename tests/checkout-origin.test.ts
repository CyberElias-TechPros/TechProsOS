// @vitest-environment node
/**
 * Paystack checkout must work without registering a domain anywhere: the callback_url is
 * sent per transaction, so the customer returns to whichever allow-listed host they started
 * on (apex, www, or a vercel.app alias). These tests pin that behaviour AND the security
 * boundary — an unlisted or missing Origin must never become a redirect target.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { configFromEnv, requestOrigin, type ServerConfig } from '../server/config';
import { initializeCheckout } from '../server/integrations';
import type { Database } from '../server/db';

const base = {
  APP_MODE: 'live', APP_URL: 'https://techpros.com.ng',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  CRON_SECRET: 'x'.repeat(40), PAYSTACK_SECRET_KEY: 'sk_test_not_real',
};
const req = (origin?: string) => new Request('https://techpros.com.ng/api/x', { headers: origin ? { Origin: origin } : {} });

describe('APP_ALLOWED_ORIGINS parsing', () => {
  it('always trusts APP_URL even when the list is empty', () => {
    expect(configFromEnv(base).allowedOrigins).toEqual(['https://techpros.com.ng']);
  });
  it('accepts a comma-separated list and trims whitespace', () => {
    const c = configFromEnv({ ...base, APP_ALLOWED_ORIGINS: ' https://www.techpros.com.ng , https://techpros-one.vercel.app ' });
    expect(c.allowedOrigins).toEqual(['https://techpros.com.ng', 'https://www.techpros.com.ng', 'https://techpros-one.vercel.app']);
  });
  it('de-duplicates APP_URL if it is repeated in the list', () => {
    expect(configFromEnv({ ...base, APP_ALLOWED_ORIGINS: 'https://techpros.com.ng,https://techpros.com.ng/' }).allowedOrigins)
      .toEqual(['https://techpros.com.ng']);
  });
  it('rejects paths, queries and fragments — bare origins only', () => {
    for (const v of ['https://evil.test/path', 'https://evil.test/?a=1', 'https://evil.test/#f'])
      expect(() => configFromEnv({ ...base, APP_ALLOWED_ORIGINS: v })).toThrow(/bare origins/);
  });
  it('rejects a malformed entry rather than silently dropping it', () => {
    expect(() => configFromEnv({ ...base, APP_ALLOWED_ORIGINS: 'not-a-url' })).toThrow(/invalid URL/);
  });
  it('allows http for local development but not on Vercel live', () => {
    expect(configFromEnv({ ...base, APP_MODE: 'demo', APP_URL: 'http://localhost:5173', APP_ALLOWED_ORIGINS: 'http://localhost:4173' }).allowedOrigins)
      .toContain('http://localhost:4173');
    expect(() => configFromEnv({ ...base, VERCEL: '1', APP_ALLOWED_ORIGINS: 'http://insecure.test' })).toThrow(/HTTPS/);
  });
});

describe('requestOrigin', () => {
  const config: ServerConfig = configFromEnv({ ...base, APP_ALLOWED_ORIGINS: 'https://techpros-one.vercel.app' });
  it('returns the browser origin when it is allow-listed', () => {
    expect(requestOrigin(req('https://techpros-one.vercel.app'), config)).toBe('https://techpros-one.vercel.app');
  });
  it('falls back to APP_URL for an unlisted origin (no open redirect)', () => {
    expect(requestOrigin(req('https://evil.test'), config)).toBe('https://techpros.com.ng');
  });
  it('falls back to APP_URL when the header is absent', () => {
    expect(requestOrigin(req(), config)).toBe('https://techpros.com.ng');
  });
  it('is exact-match: lookalike hosts and suffix tricks are rejected', () => {
    for (const o of ['https://techpros-one.vercel.app.evil.test', 'https://eviltechpros-one.vercel.app', 'http://techpros-one.vercel.app'])
      expect(requestOrigin(req(o), config)).toBe('https://techpros.com.ng');
  });
});

describe('initializeCheckout callback target', () => {
  const config = configFromEnv({ ...base, APP_ALLOWED_ORIGINS: 'https://techpros-one.vercel.app' });
  let body: Record<string, unknown> = {};
  const db = {
    query: async () => ({ rows: [{ recipient: 'owner@example.test', expected_amount: '1950000', kind: 'subscription', entity_id: 'starter', tenant_id: 't1' }], rowCount: 1 }),
  } as unknown as Database;

  beforeEach(() => {
    body = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc123' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the customer to the Vercel host without any Paystack domain setup', async () => {
    const url = await initializeCheckout(db, config, 'ref-1', 'https://techpros-one.vercel.app');
    expect(url).toBe('https://checkout.paystack.com/abc123');
    expect(body.callback_url).toBe('https://techpros-one.vercel.app/app/admin?billing=verify&reference=ref-1');
    expect((body.metadata as { cancel_action: string }).cancel_action).toBe('https://techpros-one.vercel.app/app/admin?billing=cancelled');
  });
  it('defaults to APP_URL when no origin is supplied', async () => {
    await initializeCheckout(db, config, 'ref-2');
    expect(body.callback_url).toBe('https://techpros.com.ng/app/admin?billing=verify&reference=ref-2');
  });
  it('refuses to build a callback for an unlisted origin', async () => {
    await initializeCheckout(db, config, 'ref-3', 'https://evil.test');
    expect(body.callback_url).toBe('https://techpros.com.ng/app/admin?billing=verify&reference=ref-3');
    expect((body.metadata as { cancel_action: string }).cancel_action).not.toContain('evil.test');
  });
  it('URL-encodes the reference so it cannot inject extra query params', async () => {
    await initializeCheckout(db, config, 'a&billing=paid#x', 'https://techpros-one.vercel.app');
    expect(body.callback_url).toBe('https://techpros-one.vercel.app/app/admin?billing=verify&reference=a%26billing%3Dpaid%23x');
  });
});
