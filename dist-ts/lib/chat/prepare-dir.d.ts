/**
 * prepareChatsDir — idempotent bootstrap for ~/.hoody/chats/.
 *
 * Must be called before any atomic fs.open(path, 'wx', 0o600) write under
 * ~/.hoody/chats/. Creates the directory with 0o700 perms if missing.
 * No-op if the directory already exists.
 *
 * Called from run.ts before any session/banner/acceptance file is touched.
 */
/**
 * Create `~/.hoody/chats` (mode 0700) when it is missing and return its path. The result is cached
 * for the process, so later calls touch no disk. A failed `chmod` (Windows, non-POSIX filesystems)
 * is ignored; a failed `mkdir` rejects.
 */
export declare function prepareChatsDir(): Promise<string>;
/** Reset the cache — unit-test only. */
export declare function _resetCacheForTests(): void;
