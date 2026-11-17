/**
 * Exec Dynamic Cache — File-based persistent cache for CLI.
 *
 * CLI processes exit after every command, so in-memory caching is useless.
 * Discovery results are persisted to disk at:
 *   ~/.hoody/cache/exec-scripts/<computerId>.json
 *
 * TTL: 5 minutes by default.
 * Stale files older than 24 hours are pruned on any cache access.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
// ─── Constants ───────────────────────────────────────────────────────────────
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
function getCacheDir() {
    return join(homedir(), '.hoody', 'cache', 'exec-scripts');
}
/**
 * The cache directory, for its owner only, or undefined when it cannot be made so. Every directory this creates,
 * `~/.hoody` included, is created 0700: the script lists name a computer's scripts and their parameters, and
 * `~/.hoody` also holds the saved sign-in.
 */
function ensureCacheDir() {
    const dir = getCacheDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // lstat, not stat: a symlinked cache directory would send the chmod and the write somewhere else.
    const st = lstatSync(dir);
    if (!st.isDirectory())
        return undefined;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid())
        return undefined;
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0)
        chmodSync(dir, 0o700);
    return dir;
}
function getCacheFilePath(computerId) {
    // Collision-safe sanitisation: a naive char-replace would map `my:computer`
    // and `my_computer` to the same filename, causing silent cross-computer
    // cache poisoning. Keep the original id when filesystem-safe, otherwise
    // fall back to a short SHA-256 of the raw id so every distinct
    // computerId maps to a distinct file.
    const SAFE_RE = /^[a-zA-Z0-9_-]+$/;
    if (SAFE_RE.test(computerId) && computerId.length > 0 && computerId.length <= 128) {
        return join(getCacheDir(), `${computerId}.json`);
    }
    const hash = createHash('sha256').update(computerId).digest('hex').slice(0, 32);
    return join(getCacheDir(), `h_${hash}.json`);
}
// ─── Public API ──────────────────────────────────────────────────────────────
/**
 * Read discovery cache from disk.
 * Returns undefined if cache doesn't exist or is expired.
 */
export function readFileCache(computerId, ttlMs = DEFAULT_TTL_MS) {
    // Opportunistic prune — keeps the on-disk cache dir bounded without a
    // dedicated sweep task.
    // Prune failures are already swallowed inside pruneStaleCache.
    pruneStaleCache();
    const filePath = getCacheFilePath(computerId);
    if (!existsSync(filePath))
        return undefined;
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const cache = JSON.parse(raw);
        if (cache.version !== CACHE_VERSION)
            return undefined;
        // Cross-check that the cache is actually for this computer — defends
        // against hash collisions and migrated cache files left on disk.
        // A cache file written before the rename names the computer `containerId`; it is the same record.
        const cachedFor = cache.computerId ?? cache.containerId;
        if (cachedFor !== computerId)
            return undefined;
        const fetchedAt = new Date(cache.fetchedAt).getTime();
        if (Number.isNaN(fetchedAt))
            return undefined;
        const effectiveTtl = cache.ttlMs || ttlMs;
        if (Date.now() - fetchedAt > effectiveTtl)
            return undefined;
        if (cache.computerId === undefined) {
            const { containerId: _old, ...rest } = cache;
            return { ...rest, computerId };
        }
        return cache;
    }
    catch {
        return undefined;
    }
}
/**
 * Write discovery results to disk cache.
 */
export function writeFileCache(computerId, scripts, ttlMs = DEFAULT_TTL_MS) {
    // Nothing is saved into a directory that is not the owner's alone.
    if (ensureCacheDir() === undefined)
        return;
    // Opportunistic prune — keeps the on-disk cache dir bounded without a
    // dedicated sweep task.
    pruneStaleCache();
    const filePath = getCacheFilePath(computerId);
    const cache = {
        version: CACHE_VERSION,
        computerId,
        fetchedAt: new Date().toISOString(),
        ttlMs,
        scripts,
    };
    // Created new beside its place, readable by its owner only, then moved in whole.
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
        writeFileSync(tmp, JSON.stringify(cache, null, 2), { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
        renameSync(tmp, filePath);
    }
    catch (err) {
        try {
            unlinkSync(tmp);
        }
        catch { /* nothing to clean */ }
        throw err;
    }
}
/**
 * Delete the cache file for a computer.
 */
export function deleteFileCache(computerId) {
    const filePath = getCacheFilePath(computerId);
    try {
        if (existsSync(filePath))
            unlinkSync(filePath);
    }
    catch {
        // Ignore — file may have been deleted concurrently
    }
}
/**
 * Prune cache files older than 24 hours.
 * Called opportunistically on cache access.
 */
export function pruneStaleCache() {
    const dir = getCacheDir();
    if (!existsSync(dir))
        return;
    try {
        const files = readdirSync(dir);
        const now = Date.now();
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
            const filePath = join(dir, file);
            try {
                const raw = readFileSync(filePath, 'utf-8');
                const cache = JSON.parse(raw);
                const fetchedAt = new Date(cache.fetchedAt).getTime();
                if (Number.isNaN(fetchedAt) || now - fetchedAt > PRUNE_AGE_MS) {
                    unlinkSync(filePath);
                }
            }
            catch {
                // Corrupted file — remove it
                try {
                    unlinkSync(filePath);
                }
                catch { /* ignore */ }
            }
        }
    }
    catch {
        // Cache dir inaccessible — ignore
    }
}
