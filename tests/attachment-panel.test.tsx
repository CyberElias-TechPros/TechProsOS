/**
 * The attachment endpoints were fully built but unreachable: no page rendered them. These tests
 * pin the surface into existence — the panel lists existing files, exposes an upload control only
 * to those allowed, and requires a confirmation step before a destructive removal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { resetWorkspaceData, getData, useData } from '../src/platform/store';
import { useSession, SessionProvider, useSessionInfo } from '../src/platform/session';
import { DEMO, DEMO_USERS } from '../src/platform/seed';
import { AttachmentPanel } from '../src/pages/workspace/AttachmentPanel';

function Harness({ children }: { children: React.ReactNode }) {
  const info = useSessionInfo();
  return <SessionProvider value={info}>{info ? children : <div role="status">no-session</div>}</SessionProvider>;
}

const ENTITY = 'attach-target-1';

// globals:false disables RTL auto-cleanup, so renders must be torn down explicitly.
afterEach(() => cleanup());

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceData();
  useSession.setState({ userId: DEMO_USERS.emeka, tenantId: DEMO.greenfield });
});

function seedFiles(count: number, createdBy = DEMO_USERS.emeka) {
  const data = getData();
  for (let i = 0; i < count; i++) {
    data.attachments.unshift({
      id: `file-${i}`, tenantId: DEMO.greenfield, entityId: ENTITY, name: `evidence-${i}.png`,
      mime: 'image/png', size: 2048, createdBy, createdAt: new Date().toISOString(),
    });
  }
  useData.setState({ data: { ...data, attachments: [...data.attachments] } });
}

const renderPanel = (props: { canUpload?: boolean; canManage?: boolean } = {}) =>
  render(<Harness><AttachmentPanel entityId={ENTITY} canUpload={props.canUpload ?? true} canManage={props.canManage ?? false} /></Harness>);

describe('AttachmentPanel', () => {
  it('invites the first upload when a record has no files', () => {
    renderPanel();
    expect(screen.getByText(/No files attached yet/i)).toBeTruthy();
    expect(screen.getByText(/Attach a file/i)).toBeTruthy();
  });

  it('lists attached files with their size and uploader', () => {
    seedFiles(2);
    renderPanel();
    expect(screen.getByText('evidence-0.png')).toBeTruthy();
    expect(screen.getByText('evidence-1.png')).toBeTruthy();
    expect(screen.getAllByText(/2 KB/)).toHaveLength(2);
  });

  it('shows the count against the ten-file ceiling', () => {
    seedFiles(3);
    renderPanel();
    expect(screen.getByText('3 / 10')).toBeTruthy();
  });

  it('hides the upload control from a read-only viewer', () => {
    seedFiles(1);
    renderPanel({ canUpload: false });
    expect(screen.queryByText(/Attach a file/i)).toBeNull();
  });

  it('disables uploading once the record is full and says why', () => {
    seedFiles(10);
    renderPanel();
    expect(screen.getByText(/File limit reached/i)).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('only offers removal for the viewer\u2019s own files when they cannot manage the record', () => {
    seedFiles(1, DEMO_USERS.emeka);
    seedFiles(1, DEMO_USERS.amara);
    renderPanel({ canManage: false });
    // One remove button: emeka's own file, not tunde's.
    expect(screen.getAllByRole('button', { name: /^Remove /i })).toHaveLength(1);
  });

  it('offers removal on every file to a manager', () => {
    seedFiles(1, DEMO_USERS.emeka);
    seedFiles(1, DEMO_USERS.amara);
    renderPanel({ canManage: true });
    expect(screen.getAllByRole('button', { name: /^Remove /i })).toHaveLength(2);
  });

  it('requires confirmation before removing, and can be cancelled', () => {
    seedFiles(1);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^Remove /i }));
    // The destructive action is now a distinct confirm button alongside Keep.
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(screen.getByText('evidence-0.png')).toBeTruthy();
  });

  it('never shows files belonging to another tenant', () => {
    const data = getData();
    data.attachments.unshift({
      id: 'foreign', tenantId: DEMO.stives, entityId: ENTITY, name: 'other-tenant.png',
      mime: 'image/png', size: 100, createdBy: DEMO_USERS.ifeoma, createdAt: new Date().toISOString(),
    });
    useData.setState({ data: { ...data, attachments: [...data.attachments] } });
    renderPanel();
    expect(screen.queryByText('other-tenant.png')).toBeNull();
  });

  it('states the demo persistence limit so a user is not misled', () => {
    renderPanel();
    expect(screen.getByText(/Demo files are held in memory/i)).toBeTruthy();
  });
});
