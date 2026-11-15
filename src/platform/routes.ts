/**
 * Which routes may render without a resolved backend session.
 *
 * The marketing surface is static: it must survive an unconfigured deployment or a database
 * outage. Auth and workspace routes genuinely need a session, so only those get the
 * connection/setup gate. Gating everything means one missing env var takes the public
 * pricing and landing pages down too.
 */
// Terms and privacy must be reachable before signup: the consent checkbox links to them, and
// NDPA requires an accessible notice. Auth pages stay ungated by this list but render their own
// forms, so they are handled by the router rather than the connection gate.
export const PUBLIC_PREFIXES = ['/', '/pricing', '/free-tools', '/terms', '/privacy'] as const;

export function isPublicRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PREFIXES.some(p => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)));
}
