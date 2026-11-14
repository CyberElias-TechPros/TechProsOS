/**
 * Which routes may render without a resolved backend session.
 *
 * The marketing surface is static: it must survive an unconfigured deployment or a database
 * outage. Auth and workspace routes genuinely need a session, so only those get the
 * connection/setup gate. Gating everything means one missing env var takes the public
 * pricing and landing pages down too.
 */
export const PUBLIC_PREFIXES = ['/', '/pricing', '/free-tools'] as const;

export function isPublicRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PREFIXES.some(p => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)));
}
