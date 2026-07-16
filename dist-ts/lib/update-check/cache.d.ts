/**
 * Local JSON cache at `<xdg>/hoody/update-check.json` (0600).
 *
 * Contract:
 *   - Never throw on read failure: missing/corrupt cache returns `null`.
 *   - Atomic write via temp-file + rename, with Windows EPERM/EBUSY retry.
 *   - No `current_version` field — banner compares `latest_version` against
 *     the baked HOODY_VERSION constant at render time.
 *   - Opportunistic tmp cleanup on startup: delete `*.tmp.*` older than 10 min.
 */
export type CacheStatus = 'up-to-date' | 'behind' | 'ahead' | 'error';
export interface UpdateCheckCache {
    checked_at: string;
    latest_version: string | null;
    status: CacheStatus;
    error: string | null;
    ttl_seconds: number;
    not_after: string | null;
}
export declare const CACHE_FILENAME = "update-check.json";
export declare const DEFAULT_TTL_SECONDS = 300;
export declare const TMP_CLEANUP_MAX_AGE_MS: number;
/**
 * Resolve the cache directory with full platform dispatch.
 *
 * Order:
 *   1. $XDG_CACHE_HOME (must be absolute, non-empty) — used on any platform
 *   2. ~/.cache/hoody on Linux
 *   3. ~/Library/Caches/hoody on macOS
 *   4. %LOCALAPPDATA%\hoody on Windows
 *   5. ~/.hoody fallback
 *
 * HOME env override is respected (Bun's os.homedir() ignores HOME;
 * tests rely on HOME override).
 */
export declare function cacheDir(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
export declare function cachePath(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
/**
 * Read the cache file if it exists and parses as JSON. Never throws —
 * returns `null` on any failure (missing, malformed, unreadable).
 */
export declare function readCache(customPath?: string): UpdateCheckCache | null;
/**
 * Atomic write: temp file in same directory → fs.rename(tmp, final).
 * POSIX rename silently replaces; modern Windows uses MOVEFILE_REPLACE_EXISTING
 * but may EPERM/EBUSY under AV/indexer contention → retry up to 3 times.
 *
 * Never throws — cache write failure is silent (next run retries).
 */
export declare function writeCache(data: UpdateCheckCache, customPath?: string): Promise<void>;
/** Opportunistically delete old temp files left behind by crashed writes. */
export declare function cleanupStaleTmpFiles(customDir?: string, maxAgeMs?: number, nowMs?: number): void;
/** Is the cache fresh enough to avoid a refresh fetch? */
export declare function isFresh(cache: UpdateCheckCache, nowMs?: number, ttlSeconds?: number): boolean;
/** Is the cache STILL WITHIN the signed `not_after` window? */
export declare function isSignedStillValid(cache: UpdateCheckCache, nowMs?: number): boolean;
