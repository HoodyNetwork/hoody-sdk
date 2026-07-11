/**
 * prepareChatsDir — idempotent bootstrap for ~/.hoody/chats/.
 *
 * Must be called before any atomic fs.open(path, 'wx', 0o600) write under
 * ~/.hoody/chats/. Creates the directory with 0o700 perms if missing.
 * No-op if the directory already exists.
 *
 * Called from run.ts before any session/banner/acceptance file is touched.
 */
export declare function prepareChatsDir(): Promise<string>;
/** Reset the cache — unit-test only. */
export declare function _resetCacheForTests(): void;
