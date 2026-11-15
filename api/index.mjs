/**
 * Vercel function entrypoint — tracked in git on purpose.
 *
 * Vercel discovers functions by globbing api/ BEFORE running the build command, so this file
 * must exist in the repository. The actual server is bundled by scripts/build-api.mjs into
 * server-dist/vercel.mjs during the build, and imported here once it exists.
 *
 * Do not inline the server here: Vercel would compile it with its own nodenext TypeScript
 * settings and reject the extensionless relative imports used throughout server/.
 */
import handler from '../server-dist/vercel.mjs';

export const config = { maxDuration: 60 };

export default handler;
