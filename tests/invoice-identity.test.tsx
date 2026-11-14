/**
 * Invoice identity must come from the tenant record, never from hardcoded placeholders.
 * A wrong account number on a customer invoice is a real financial defect, not a cosmetic one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { resetWorkspaceData, getData, useData } from '../src/platform/store';
import { useSession, SessionProvider, useSessionInfo } from '../src/platform/session';
import { DEMO, DEMO_USERS } from '../src/platform/seed';
import { commandSchema } from '../src/platform/contracts';
import Finance from '../src/pages/workspace/Finance';

function Harness({ children }: { children: React.ReactNode }) {
  const info = useSessionInfo();
  return <SessionProvider value={info}>{info ? children : <div role="status">no-session</div>}</SessionProvider>;
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceData();
  useSession.setState({ userId: DEMO_USERS.emeka, tenantId: DEMO.greenfield });
});

function patchTenant(patch: Record<string, unknown>) {
  const data = getData();
  const tenant = data.tenants.find(t => t.id === DEMO.greenfield)!;
  Object.assign(tenant, patch);
  useData.setState({ data: { ...data, tenants: [...data.tenants] } });
}

function openFirstInvoice() {
  render(<Harness><Finance /></Harness>);
  const trigger = screen.getAllByRole('button', { name: /^View invoice /i })[0];
  fireEvent.click(trigger);
}

describe('invoice payment identity', () => {
  it('never prints the old placeholder bank account', () => {
    patchTenant({ bankDetails: undefined });
    openFirstInvoice();
    expect(screen.queryByText(/GTBank 0123456789/)).toBeNull();
    expect(screen.queryByText(/TechPros Services Ltd/)).toBeNull();
  });

  it('asks for bank details instead of inventing them when unset', () => {
    patchTenant({ bankDetails: undefined });
    openFirstInvoice();
    expect(screen.getByText(/Bank details are not set/i)).toBeTruthy();
  });

  it('prints the tenant’s own bank details once configured', () => {
    patchTenant({ bankDetails: { bank: 'Zenith Bank', accountName: 'DELGRA LTD', accountNumber: '1013456789' }, accountsEmail: 'accounts@delgra.ng' });
    openFirstInvoice();
    expect(screen.getByText(/Zenith Bank 1013456789/)).toBeTruthy();
    expect(screen.getByText(/DELGRA LTD/)).toBeTruthy();
    expect(screen.getByText(/accounts@delgra\.ng/)).toBeTruthy();
  });

  it('uses the registered legal name, RC and TIN from the tenant record', () => {
    patchTenant({ legalName: 'DELGRA LTD', tradingName: 'TechPros', rcNumber: '9379032', tin: '2623201957708' });
    openFirstInvoice();
    expect(screen.getByText(/RC 9379032/)).toBeTruthy();
    expect(screen.getByText(/TIN 2623201957708/)).toBeTruthy();
  });
});

describe('tenant.update contract', () => {
  const base = { type: 'tenant.update' as const };

  it('accepts the invoice identity fields', () => {
    const parsed = commandSchema.parse({ ...base, legalName: 'DELGRA LTD', tradingName: 'TechPros', rcNumber: '9379032', tin: '2623201957708', address: 'Ikeja, Lagos', website: 'techpros.com.ng', supportEmail: 'support@techpros.com.ng', accountsEmail: 'accounts@techpros.com.ng' });
    expect(parsed).toMatchObject({ legalName: 'DELGRA LTD', rcNumber: '9379032' });
  });

  it('still enforces a 10-digit NUBAN', () => {
    expect(() => commandSchema.parse({ ...base, bankDetails: { bank: 'GTBank', accountName: 'DELGRA LTD', accountNumber: '123' } })).toThrow(/10-digit/);
  });

  it('rejects a non-numeric RC number and a malformed accounts email', () => {
    expect(() => commandSchema.parse({ ...base, rcNumber: 'RC-9379032' })).toThrow();
    expect(() => commandSchema.parse({ ...base, accountsEmail: 'not-an-email' })).toThrow();
  });

  it('rejects unknown fields so the patch cannot smuggle privileged state', () => {
    expect(() => commandSchema.parse({ ...base, plan: 'enterprise' })).toThrow();
    expect(() => commandSchema.parse({ ...base, subscriptionStatus: 'active' })).toThrow();
  });
});
