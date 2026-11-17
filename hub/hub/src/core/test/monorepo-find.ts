// The search for the Hoody monorepo root, kept apart from monorepo.ts so that a script loaded as CommonJS (the live
// browser harness) can use it too: this file reads no module metadata.
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A folder is the monorepo root when it holds both of these folders. */
const SIBLINGS = ['hoody-kit', 'hoody-sdk-generator'];
/** One stat of the name: nothing inside a sibling repository is listed or read to find the root. */
const isFolder = (path: string): boolean => statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;

/** `env` when set; else the first of `from` and its ancestors that holds every sibling; else null. */
export function findMonorepoRoot(from: string, env: string | undefined, exists: (path: string) => boolean = isFolder): string | null {
  if (env) return env;
  for (let dir = from; ; ) {
    if (SIBLINGS.every((s) => exists(join(dir, s)))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
