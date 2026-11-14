import { describe, expect, it } from 'vitest';
import { parse } from 'pg-connection-string';
import { normaliseCaCert, resolvePgConnection } from '../server/db';
import { configFromEnv } from '../server/config';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBexample\n-----END CERTIFICATE-----';
const HOST = 'postgres://u:p@db.example.com:5432/defaultdb';

/**
 * Regression: node-postgres does Object.assign(config, parse(connectionString)), so an
 * `sslmode` left in the URL overwrites an explicit ssl object and silently drops a private CA.
 * Aiven/Supabase-style providers sign with their own CA, which then fails verification.
 */
describe('postgres TLS resolution', () => {
  it('strips sslmode so an explicit CA survives the pg merge', () => {
    const { connectionString, ssl } = resolvePgConnection(`${HOST}?sslmode=require`, PEM);
    expect(connectionString).not.toContain('sslmode');
    const merged = Object.assign({ connectionString, ssl }, parse(connectionString));
    expect((merged.ssl as { ca?: string }).ca).toContain('BEGIN CERTIFICATE');
    expect((merged.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(true);
  });

  it('verifies the certificate chain for require and verify-full', () => {
    for (const mode of ['require', 'verify-full']) {
      const { ssl } = resolvePgConnection(`${HOST}?sslmode=${mode}`);
      expect(ssl?.rejectUnauthorized).toBe(true);
    }
  });

  it('enables TLS when a CA is supplied even without sslmode', () => {
    const { ssl } = resolvePgConnection(HOST, PEM);
    expect(ssl?.rejectUnauthorized).toBe(true);
    expect(ssl?.ca).toBe(`${PEM}\n`);
  });

  it('leaves plain local connections unencrypted', () => {
    expect(resolvePgConnection(HOST).ssl).toBeUndefined();
    expect(resolvePgConnection(`${HOST}?sslmode=disable`).ssl).toBeUndefined();
  });

  it('keeps no-verify as an explicit, opt-in escape hatch', () => {
    expect(resolvePgConnection(`${HOST}?sslmode=no-verify`).ssl).toEqual({ rejectUnauthorized: false });
  });

  it('skips hostname checking only for verify-ca', () => {
    const { ssl } = resolvePgConnection(`${HOST}?sslmode=verify-ca`, PEM);
    expect(ssl?.rejectUnauthorized).toBe(true);
    expect(ssl?.checkServerIdentity?.('host', {} as never)).toBeUndefined();
  });

  it('does not leak other ssl query params into the URL', () => {
    const { connectionString } = resolvePgConnection(`${HOST}?sslmode=require&sslrootcert=/tmp/ca.pem&application_name=x`);
    expect(connectionString).not.toContain('sslrootcert');
    expect(connectionString).toContain('application_name=x');
  });

  it('preserves credentials, port and database through the round-trip', () => {
    const { connectionString } = resolvePgConnection(`${HOST}?sslmode=require`, PEM);
    const parsed = parse(connectionString);
    expect(parsed.user).toBe('u');
    expect(parsed.host).toBe('db.example.com');
    expect(parsed.port).toBe('5432');
    expect(parsed.database).toBe('defaultdb');
  });
});

describe('CA certificate normalisation', () => {
  it('accepts inline PEM', () => expect(normaliseCaCert(PEM)).toBe(`${PEM}\n`));
  it('accepts escaped newlines from a dashboard field', () => {
    expect(normaliseCaCert(PEM.replace(/\n/g, '\\n'))).toBe(`${PEM}\n`);
  });
  it('accepts base64-encoded PEM', () => {
    expect(normaliseCaCert(Buffer.from(PEM).toString('base64'))).toBe(`${PEM}\n`);
  });
  it('rejects junk rather than silently disabling verification', () => {
    expect(() => normaliseCaCert('not-a-certificate')).toThrow(/PEM certificate/);
  });
});

describe('database config', () => {
  const base = { APP_MODE: 'live', APP_URL: 'https://app.example.com', DATABASE_URL: HOST, DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), CRON_SECRET: 'x'.repeat(32) };

  it('reads the CA and pool size without treating them as required', () => {
    const c = configFromEnv({ ...base, DATABASE_CA_CERT: PEM, DATABASE_POOL_MAX: '2' });
    expect(c.databaseCa).toBe(PEM);
    expect(c.databasePoolMax).toBe(2);
  });

  it('rejects a non-positive or fractional pool size', () => {
    for (const value of ['0', '-1', '1.5', 'abc']) {
      expect(() => configFromEnv({ ...base, DATABASE_POOL_MAX: value })).toThrow(/DATABASE_POOL_MAX/);
    }
  });
});
