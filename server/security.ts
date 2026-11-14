import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
const derive = (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> => new Promise((resolve, reject) => scrypt(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key)));
export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const randomToken = (): string => randomBytes(32).toString('hex');
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error('Password must contain 12–128 characters');
  const salt = randomBytes(16).toString('hex'); const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }) as Buffer;
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const key = await derive(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31]; return out;
}
function unbase32(value: string): Buffer {
  let bits = 0, acc = 0; const out: number[] = [];
  for (const c of value.toUpperCase().replace(/=+$/, '')) { const n = ALPHABET.indexOf(c); if (n < 0) throw new Error('Invalid authenticator secret'); acc = (acc << 5) | n; bits += 5; if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export const newTotpSecret = (): string => base32(randomBytes(20));
function totp(secret: string, step: number): string {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', unbase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, nowMs: number, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null; const current = Math.floor(nowMs / 30000);
  for (const step of [current, current - 1, current + 1]) if (step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  return null;
}
export function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}
export function decrypt(value: string, key: Buffer): string {
  const [iv, tag, data] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex')); decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}
export function newRecoveryCodes(): string[] { return Array.from({ length: 10 }, () => randomBytes(8).toString('hex').match(/.{4}/g)!.join('-')); }
export function safeEqualHex(a: string, b: string): boolean { return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
export function cookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) { try { result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* Ignore malformed cookie pairs; they cannot authenticate. */ } } }
  return result;
}
export function cookie(name: string, value: string, secure: boolean, maxAge: number): string { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`; }
export function csrfCookie(value: string, secure: boolean): string { return `tp_csrf=${value}; Path=/; SameSite=Lax; Max-Age=43200${secure ? '; Secure' : ''}`; }
