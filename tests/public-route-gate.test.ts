import { describe, expect, it } from 'vitest';
import { isPublicRoute } from '../src/platform/routes';

/**
 * Regression: the setup/connection gate used to wrap every route, so a missing env var or an
 * unreachable database replaced the public landing and pricing pages with an error card.
 */
describe('public route gate', () => {
  it('renders marketing routes without a backend session', () => {
    for (const path of ['/', '/pricing', '/free-tools']) expect(isPublicRoute(path)).toBe(true);
  });

  it('tolerates trailing slashes', () => {
    for (const path of ['/pricing/', '/free-tools/', '//']) expect(isPublicRoute(path)).toBe(true);
  });

  it('gates every workspace route', () => {
    for (const path of ['/app', '/app/overview', '/app/finance', '/app/admin', '/app/admin/audit']) {
      expect(isPublicRoute(path)).toBe(false);
    }
  });

  it('gates every auth route', () => {
    for (const path of ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password', '/accept-invitation']) {
      expect(isPublicRoute(path)).toBe(false);
    }
  });

  it('does not let a prefix collision smuggle a guarded route through', () => {
    for (const path of ['/pricing-admin', '/free-tools-secret', '/application', '/appx']) {
      expect(isPublicRoute(path)).toBe(false);
    }
  });
});
