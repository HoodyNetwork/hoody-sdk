/**
 * prepareChatsDir — idempotent bootstrap for ~/.hoody/chats/.
 *
 * Must be called before any atomic fs.open(path, 'wx', 0o600) write under
 * ~/.hoody/chats/. Creates the directory with 0o700 perms if missing.
 * No-op if the directory already exists.
 *
 * Called from run.ts before any session/banner/acceptance file is touched.
 */

import { mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { hoodyHomeDir } from './home-dir.js';

let cached: string | undefined;

/**
 * Create `~/.hoody/chats` (mode 0700) when it is missing and return its path. The result is cached
 * for the process, so later calls touch no disk. A failed `chmod` (Windows, non-POSIX filesystems)
 * is ignored; a failed `mkdir` rejects.
 */
export async function prepareChatsDir(): Promise<string> {
  if (cached) return cached;
  const dir = join(hoodyHomeDir(), '.hoody', 'chats');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // chmod is a no-op if perms already match; wraps Windows/ENOSYS silently.
  try {
    await chmod(dir, 0o700);
  } catch {
    /* Windows or non-POSIX filesystem — best-effort */
  }
  cached = dir;
  return dir;
}

/** Reset the cache — unit-test only. */
export function _resetCacheForTests(): void {
  cached = undefined;
}
