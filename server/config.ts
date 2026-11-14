export type ServerConfig = {
  mode: 'demo' | 'live'; appUrl: string; databaseUrl?: string; databaseCa?: string; databasePoolMax?: number; encryptionKey?: Buffer;
  emailKey?: string; emailFrom?: string; paystackKey?: string; cronSecret?: string;
  secureCookies: boolean; testEmailSink?: { to: string; subject: string; text: string }[];
};
export const REQUIRED_LIVE = ['DATABASE_URL', 'APP_URL', 'DATA_ENCRYPTION_KEY', 'CRON_SECRET'] as const;
export function configFromEnv(env: Record<string, string | undefined> = process.env): ServerConfig {
  const mode = env.APP_MODE === 'demo' ? 'demo' : 'live';
  const key = env.DATA_ENCRYPTION_KEY ? Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64') : undefined;
  if (key && key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be base64-encoded 32 random bytes');
  const appUrl = env.APP_URL ?? 'http://localhost:5173';
  const url = new URL(appUrl);
  if (mode === 'live' && env.VERCEL && env.APP_URL && url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS on Vercel');
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters');
  const poolMax = env.DATABASE_POOL_MAX ? Number(env.DATABASE_POOL_MAX) : undefined;
  if (poolMax !== undefined && (!Number.isInteger(poolMax) || poolMax < 1)) throw new Error('DATABASE_POOL_MAX must be a positive integer');
  return { mode, appUrl: url.origin, databaseUrl: env.DATABASE_URL, databaseCa: env.DATABASE_CA_CERT, databasePoolMax: poolMax, encryptionKey: key,
    emailKey: env.RESEND_API_KEY, emailFrom: env.EMAIL_FROM, paystackKey: env.PAYSTACK_SECRET_KEY,
    cronSecret: env.CRON_SECRET, secureCookies: url.protocol === 'https:' };
}
export function missingConfig(c: ServerConfig): string[] {
  if (c.mode === 'demo') return [];
  return [...(!c.databaseUrl ? ['DATABASE_URL'] : []), ...(!c.encryptionKey ? ['DATA_ENCRYPTION_KEY'] : []), ...(!c.cronSecret ? ['CRON_SECRET'] : []), ...(!process.env.APP_URL && process.env.VERCEL ? ['APP_URL'] : [])];
}
export function publicConfig(c: ServerConfig) {
  return { mode: c.mode, setupRequired: missingConfig(c), features: { email: !!c.emailKey && !!c.emailFrom, billing: !!c.paystackKey, monitoring: true }, version: '1.0.0-rc.1' };
}
