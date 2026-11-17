// Where the Hoody monorepo is, for the tests that compare the Hub with files of a sibling repository (the kits, the
// SDK, the docs, the API's sign-in page). Inside the monorepo those tests run; in a published copy of the Hub there is
// no sibling repository, monorepoRoot() is null and they are skipped.
import { join } from 'node:path';
import { findMonorepoRoot } from './monorepo-find';

export { findMonorepoRoot };

/** HOODY_MONOREPO when set; else the nearest ancestor of this file that holds the sibling repositories; else null. */
export function monorepoRoot(): string | null {
  return findMonorepoRoot(import.meta.dirname, process.env.HOODY_MONOREPO);
}

let said = false;
/**
 * A file or folder of a sibling repository: `override` (a test's own environment variable) when set, else `parts`
 * under the monorepo root. Null outside the monorepo: the caller skips its cross-repository tests, and the reason is
 * printed once.
 */
export function monorepoPath(override: string | undefined, ...parts: string[]): string | null {
  if (override) return override;
  const root = monorepoRoot();
  if (root) return join(root, ...parts);
  if (!said) console.error('cross-repository tests are skipped: this copy of the Hub is outside the Hoody monorepo (set HOODY_MONOREPO to its root to run them)');
  said = true;
  return null;
}
