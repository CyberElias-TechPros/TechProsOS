/**
 * Failure surfaces. Before this work a render error anywhere in the tree blanked the whole app
 * with no recovery, an unknown URL silently redirected home (so a stale link looked like a bug),
 * and connectivity loss was only discovered when a submit failed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { NotFound } from '../src/pages/NotFound';
import { isPublicRoute } from '../src/platform/routes';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Boom({ label }: { label: string }): JSX.Element { throw new Error(`render failed: ${label}`); }

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>healthy content</p></ErrorBoundary>);
    expect(screen.getByText('healthy content')).toBeTruthy();
  });

  it('catches a render error and shows a recoverable message instead of a blank screen', () => {
    // React logs the error to console even when caught; silence it for this assertion only.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom label="widget" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('offers a way back to the dashboard, not just a retry loop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MemoryRouter><ErrorBoundary><Boom label="nav" /></ErrorBoundary></MemoryRouter>);
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toBeTruthy();
  });

  it('re-fails while the broken child is still mounted, then recovers once it is replaced', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary><Boom label="first" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    // Retrying an unchanged broken child must not pretend to succeed.
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('alert')).toBeTruthy();
    // Once the cause is gone (e.g. a fresh chunk loaded), retry renders the children again.
    rerender(<ErrorBoundary><p>recovered</p></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not expose the raw stack trace to the user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom label="secret-internal-detail" /></ErrorBoundary>);
    expect(screen.queryByText(/secret-internal-detail/)).toBeNull();
  });
});

describe('NotFound', () => {
  it('states the path that was not found and offers navigation', () => {
    render(<MemoryRouter initialEntries={['/app/typo-here']}><NotFound /></MemoryRouter>);
    expect(screen.getByText(/page not found/i)).toBeTruthy();
    expect(screen.getByText('/app/typo-here')).toBeTruthy();
    expect(screen.getByRole('link', { name: /home/i })).toBeTruthy();
  });
});

describe('legal routes are public', () => {
  it('serves terms and privacy without a session, since consent links to them pre-signup', () => {
    expect(isPublicRoute('/terms')).toBe(true);
    expect(isPublicRoute('/privacy')).toBe(true);
  });
  it('still gates the workspace and auth surfaces', () => {
    expect(isPublicRoute('/app/overview')).toBe(false);
    expect(isPublicRoute('/login')).toBe(false);
  });
  it('does not treat a prefix collision as public', () => {
    expect(isPublicRoute('/termsofuse-admin')).toBe(false);
    expect(isPublicRoute('/privacyish')).toBe(false);
  });
});
