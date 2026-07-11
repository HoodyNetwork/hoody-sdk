/**
 * Local JSON cache at `<xdg>/hoody/update-check.json` (0600).
 *
 * Contract:
 *   - Never throw on read failure: missing/corrupt cache returns `null`.
 *   - Atomic write via temp-file + rename, with Windows EPERM/EBUSY retry.
 *   - No `current_version` field — banner compares `latest_version` against
 *     the baked HOODY_VERSION constant at render time (PLAN-v3 §Cache schema).
 *   - Opportunistic tmp cleanup on startup: delete `*.tmp.*` older than 10 min.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type CacheStatus = 'up-to-date' | 'behind' | 'ahead' | 'error';

export interface UpdateCheckCache {
  checked_at: string;           // ISO-8601 UTC
  latest_version: string | null;
  status: CacheStatus;
  error: string | null;
  ttl_seconds: number;
  not_after: string | null;     // ISO-8601 UTC, from signed channel.json
}

export const CACHE_FILENAME = 'update-check.json';
export const DEFAULT_TTL_SECONDS = 300;
export const TMP_CLEANUP_MAX_AGE_MS = 10 * 60 * 1000;  // 10 min
const RENAME_RETRY_WINDOWS_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

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
 * HOME env override is respected (Bun's os.homedir() ignores HOME per the
 * session's bun-homedir-ignores-HOME note; tests rely on HOME override).
 */
export function cacheDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const xdg = env.XDG_CACHE_HOME;
  if (typeof xdg === 'string' && xdg.length > 0 && path.isAbsolute(xdg)) {
    return path.join(xdg, 'hoody');
  }
  if (platform === 'linux') {
    return path.join(homeDir(env), '.cache', 'hoody');
  }
  if (platform === 'darwin') {
    return path.join(homeDir(env), 'Library', 'Caches', 'hoody');
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    // Require LOCALAPPDATA to be absolute — use path.win32.isAbsolute so
    // a Windows-style drive path like `C:\Users\u\AppData\Local` is
    // correctly recognized even when this code is running under a POSIX
    // test harness. A relative path here (extremely unusual, but possible
    // in tampered envs) would produce a cache rooted at CWD, silently
    // polluting wherever the CLI was launched from. Fall through to the
    // ~/.hoody fallback instead.
    if (typeof local === 'string' && local.length > 0 && path.win32.isAbsolute(local)) {
      return path.win32.join(local, 'hoody');
    }
  }
  return path.join(homeDir(env), '.hoody');
}

export function cachePath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(cacheDir(platform, env), CACHE_FILENAME);
}

/**
 * Read the cache file if it exists and parses as JSON. Never throws —
 * returns `null` on any failure (missing, malformed, unreadable).
 */
export function readCache(customPath?: string): UpdateCheckCache | null {
  const filePath = customPath ?? cachePath();
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null
      || typeof parsed.checked_at !== 'string'
      || typeof parsed.status !== 'string'
    ) {
      return null;
    }
    // Full schema validation. Pre-fix the function did
    // `parsed as UpdateCheckCache` after checking only two fields, letting
    // `ttl_seconds` as a STRING (e.g. `"999999"`) flow into `isFresh()` and
    // be compared against a number via JS coercion, yielding wrong freshness
    // decisions.
    const validStatuses: CacheStatus[] = ['up-to-date', 'behind', 'ahead', 'error'];
    if (!validStatuses.includes(parsed.status as CacheStatus)) return null;
    if (
      parsed.latest_version !== null &&
      typeof parsed.latest_version !== 'string'
    ) return null;
    if (parsed.error !== null && typeof parsed.error !== 'string') return null;
    if (parsed.not_after !== null && typeof parsed.not_after !== 'string') return null;
    if (
      typeof parsed.ttl_seconds !== 'number' ||
      !Number.isFinite(parsed.ttl_seconds) ||
      parsed.ttl_seconds < 0
    ) return null;
    return parsed as UpdateCheckCache;
  } catch {
    return null;
  }
}

/**
 * Atomic write: temp file in same directory → fs.rename(tmp, final).
 * POSIX rename silently replaces; modern Windows uses MOVEFILE_REPLACE_EXISTING
 * but may EPERM/EBUSY under AV/indexer contention → retry up to 3 times.
 *
 * Never throws — cache write failure is silent (next run retries).
 */
export async function writeCache(
  data: UpdateCheckCache,
  customPath?: string,
): Promise<void> {
  const filePath = customPath ?? cachePath();
  const dir = path.dirname(filePath);

  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return;  // cannot create directory; abandon silently
  }

  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {
    return;
  }

  let lastErr: NodeJS.ErrnoException | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      lastErr = err;
      if (
        process.platform === 'win32'
        && err.code !== undefined
        && RENAME_RETRY_WINDOWS_ERRORS.has(err.code)
        && attempt < 2
      ) {
        await sleep(50 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  // Best-effort cleanup; don't surface errors.
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  void lastErr;  // Intentionally discarded: cache failure is not fatal.
}

/** Opportunistically delete old temp files left behind by crashed writes. */
export function cleanupStaleTmpFiles(
  customDir?: string,
  maxAgeMs: number = TMP_CLEANUP_MAX_AGE_MS,
  nowMs: number = Date.now(),
): void {
  const dir = customDir ?? cacheDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const prefix = `${CACHE_FILENAME}.tmp.`;
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (nowMs - st.mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
      }
    } catch {
      /* ignore — another process may have cleaned it up */
    }
  }
}

/** Is the cache fresh enough to avoid a refresh fetch? */
export function isFresh(
  cache: UpdateCheckCache,
  nowMs: number = Date.now(),
  ttlSeconds: number = cache.ttl_seconds ?? DEFAULT_TTL_SECONDS,
): boolean {
  const checkedAtMs = Date.parse(cache.checked_at);
  if (!Number.isFinite(checkedAtMs)) return false;
  // Reject future checked_at timestamps. A cache file with
  // a future date would otherwise satisfy the TTL comparison forever, silently
  // suppressing update notifications. Allow a small skew (60s) to tolerate
  // clock drift across machines syncing via NTP.
  const SKEW_MS = 60_000;
  if (checkedAtMs > nowMs + SKEW_MS) return false;
  return (nowMs - checkedAtMs) / 1000 <= ttlSeconds;
}

/** Is the cache STILL WITHIN the signed `not_after` window? */
export function isSignedStillValid(
  cache: UpdateCheckCache,
  nowMs: number = Date.now(),
): boolean {
  if (!cache.not_after) return false;
  const notAfterMs = Date.parse(cache.not_after);
  if (!Number.isFinite(notAfterMs)) return false;
  return nowMs <= notAfterMs;
}

// ─── internal ───────────────────────────────────────────────────────────────

function homeDir(env: NodeJS.ProcessEnv): string {
  // Bun's os.homedir() ignores process.env.HOME (session memory note:
  // bun-homedir-ignores-HOME.md). Respect HOME explicitly so tests can
  // redirect.
  if (typeof env.HOME === 'string' && env.HOME.length > 0) return env.HOME;
  if (typeof env.USERPROFILE === 'string' && env.USERPROFILE.length > 0) return env.USERPROFILE;
  return os.homedir();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
