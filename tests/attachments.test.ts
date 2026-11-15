// @vitest-environment node
/**
 * Attachments were fully implemented server-side (magic-byte validation, size/count caps,
 * tenant scoping, audited download) but had no UI and no way to remove a file. These tests
 * cover the removal boundary and the widened entity support, because deletion is the part
 * that can leak or destroy across tenants if the scope check is wrong.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embeddedDatabase, migrate, type Database } from '../server/db';
import { handleApi } from '../server/api';
import type { ServerConfig } from '../server/config';
import { deliverOutbox } from '../server/integrations';
import type { DataSet } from '../src/platform/types';

let db: Database;
const sink: NonNullable<ServerConfig['testEmailSink']> = [];
const config: ServerConfig = {
  mode: 'live', appUrl: 'https://app.test', allowedOrigins: ['https://app.test'], databaseUrl: 'embedded-test',
  encryptionKey: Buffer.alloc(32, 7), cronSecret: 'test-cron-secret-'.padEnd(40, 'x'), secureCookies: true, testEmailSink: sink,
};
const origin = 'https://app.test';
type Session = { cookie: string; csrf: string };

async function call(path: string, method = 'GET', body?: unknown, session?: Session) {
  const h: Record<string, string> = { Origin: origin };
  if (session) { h.Cookie = session.cookie; h['X-CSRF-Token'] = session.csrf; }
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return handleApi(new Request(`${origin}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), { db, config, clientIp: '198.51.100.77' });
}
const json = async (r: Response) => await r.json() as Record<string, any>;
function sessionFrom(res: Response): Session {
  const cookies = res.headers.getSetCookie();
  return { cookie: cookies.map(c => c.split(';')[0]).join('; '), csrf: cookies.find(c => c.startsWith('tp_csrf='))!.split(';')[0].split('=')[1] };
}
async function registerAndVerify(email: string, orgName: string) {
  const res = await call('/api/auth/register', 'POST', {
    orgName, industry: 'Technology', city: 'Lagos', plan: 'professional', type: 'organisation',
    ownerName: 'Attachment Owner', ownerEmail: email, ownerPhone: '+2348000000001',
    password: 'Correct-Horse-Battery-42', branches: [{ name: 'HQ', city: 'Lagos' }], departments: ['ICT'], consent: true,
  });
  expect(res.status).toBe(202);
  await deliverOutbox(db, config);
  const mail = [...sink].reverse().find(m => m.to === email && m.subject.includes('Verify'))!;
  const token = new URL(mail.text.match(/https:\/\/app\.test\/verify-email\?token=[a-f0-9]{64}/)![0]).searchParams.get('token');
  const verified = await call('/api/auth/verify-email', 'POST', { token });
  expect(verified.status).toBe(200);
  return { session: sessionFrom(verified), ...(await json(verified)) as { tenantId: string; user: { id: string } } };
}
async function workspace(s: Session) { const r = await call('/api/workspace', 'GET', undefined, s); expect(r.status).toBe(200); return await json(r) as { data: DataSet; revision: number }; }
async function command(s: Session, body: unknown) {
  const rev = (await workspace(s)).revision;
  return call('/api/commands', 'POST', { revision: rev, command: body }, s);
}
// A minimal valid PNG so the server's magic-byte check passes.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex').toString('base64');

let alice: Awaited<ReturnType<typeof registerAndVerify>>;
let bob: Awaited<ReturnType<typeof registerAndVerify>>;
let ticketId: string;

beforeAll(async () => {
  db = await embeddedDatabase(); await migrate(db);
  alice = await registerAndVerify('alice-attach@example.test', 'Alice Attachments Ltd');
  bob = await registerAndVerify('bob-attach@example.test', 'Bob Separate Ltd');
  const created = await command(alice.session, { type: 'ticket.create', input: { kind: 'incident', title: 'Printer failure', description: 'Tray 2 jams repeatedly', category: 'Printing', impact: 'medium', urgency: 'medium' } });
  expect(created.status).toBe(200);
  ticketId = (await json(created)).result.id;
}, 40000);
afterAll(async () => { await db?.close(); });

async function upload(s: Session, entityId: string, name = 'screenshot.png') {
  return call('/api/attachments', 'POST', { entityId, name, mime: 'image/png', contentBase64: PNG }, s);
}

describe('attachment upload', () => {
  it('attaches a validated file to a ticket and lists it in the workspace snapshot', async () => {
    const res = await upload(alice.session, ticketId);
    expect(res.status).toBe(201);
    const { id } = await json(res);
    const w = await workspace(alice.session);
    const meta = w.data.attachments.find(a => a.id === id);
    expect(meta).toBeTruthy();
    expect(meta!.entityId).toBe(ticketId);
    expect(meta!.name).toBe('screenshot.png');
    expect(meta!.size).toBeGreaterThan(0);
  });

  it('refuses a file whose bytes do not match the declared type', async () => {
    const res = await call('/api/attachments', 'POST', { entityId: ticketId, name: 'fake.png', mime: 'image/png', contentBase64: Buffer.from('not a png at all').toString('base64') }, alice.session);
    expect(res.status).toBe(422);
  });

  it('refuses an unsupported type', async () => {
    const res = await call('/api/attachments', 'POST', { entityId: ticketId, name: 'evil.svg', mime: 'image/svg+xml', contentBase64: PNG }, alice.session);
    expect(res.status).toBe(422);
  });

  it('will not attach to another tenant\u2019s record', async () => {
    const res = await upload(bob.session, ticketId);
    expect(res.status).toBe(404);
  });
});

describe('attachment download authorisation', () => {
  it('serves the file to a member of the owning tenant', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'mine.png'));
    const res = await call(`/api/attachments/${id}`, 'GET', undefined, alice.session);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses a download from a different tenant', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'private.png'));
    expect((await call(`/api/attachments/${id}`, 'GET', undefined, bob.session)).status).toBe(404);
  });

  it('refuses an unauthenticated download', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'auth.png'));
    expect((await call(`/api/attachments/${id}`)).status).toBe(401);
  });
});

describe('attachment removal', () => {
  it('lets the uploader remove their own attachment and frees a slot', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'removable.png'));
    const res = await call(`/api/attachments/${id}`, 'DELETE', undefined, alice.session);
    expect(res.status).toBe(200);
    const w = await workspace(alice.session);
    expect(w.data.attachments.some(a => a.id === id)).toBe(false);
    // The blob must go too, not just the metadata.
    const blob = await db.query('SELECT 1 FROM attachment_blobs WHERE id=$1', [id]);
    expect(blob.rows).toHaveLength(0);
  });

  it('audits the removal', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'audited.png'));
    await call(`/api/attachments/${id}`, 'DELETE', undefined, alice.session);
    const w = await workspace(alice.session);
    expect(w.data.auditLogs.some(a => a.action === 'attachment.removed' && a.entityId === id)).toBe(true);
  });

  it('refuses removal by a different tenant', async () => {
    const { id } = await json(await upload(alice.session, ticketId, 'not-yours.png'));
    expect((await call(`/api/attachments/${id}`, 'DELETE', undefined, bob.session)).status).toBe(404);
    expect((await workspace(alice.session)).data.attachments.some(a => a.id === id)).toBe(true);
  });

  it('refuses unauthenticated removal', async () => {
    const { id } = await json(await upload(alice.session, ticketId, ' guarded.png'));
    expect((await call(`/api/attachments/${id}`, 'DELETE')).status).toBe(401);
  });

  it('returns 404 for an unknown attachment id', async () => {
    expect((await call(`/api/attachments/${crypto.randomUUID()}`, 'DELETE', undefined, alice.session)).status).toBe(404);
  });

  it('bumps the workspace revision so other sessions refresh', async () => {
    const before = (await workspace(alice.session)).revision;
    const { id } = await json(await upload(alice.session, ticketId, 'rev.png'));
    await call(`/api/attachments/${id}`, 'DELETE', undefined, alice.session);
    expect((await workspace(alice.session)).revision).toBeGreaterThan(before);
  });
});

describe('attachment count cap', () => {
  it('caps a record at ten files and reports a distinct code', async () => {
    const created = await command(alice.session, { type: 'ticket.create', input: { kind: 'request', title: 'Cap test', description: 'Testing the attachment ceiling', category: 'Testing', impact: 'low', urgency: 'low' } });
    const cappedTicket = (await json(created)).result.id;
    for (let i = 0; i < 10; i++) expect((await upload(alice.session, cappedTicket, `f${i}.png`)).status).toBe(201);
    const overflow = await upload(alice.session, cappedTicket, 'one-too-many.png');
    expect(overflow.status).toBe(409);
    expect((await json(overflow)).error.code).toBe('LIMIT_REACHED');
    // Removing one frees exactly one slot.
    const w = await workspace(alice.session);
    const victim = w.data.attachments.find(a => a.entityId === cappedTicket)!;
    await call(`/api/attachments/${victim.id}`, 'DELETE', undefined, alice.session);
    expect((await upload(alice.session, cappedTicket, 'fits-now.png')).status).toBe(201);
  });
});
