/**
 * Exec Dynamic Cache — File-based persistent cache for CLI.
 *
 * CLI processes exit after every command, so in-memory caching is useless.
 * Discovery results are persisted to disk at:
 *   ~/.hoody/cache/exec-scripts/<containerId>.json
 *
 * TTL: 5 minutes by default.
 * Stale files older than 24 hours are pruned on any cache access.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveredScript, DiscoveryCache } from './exec-dynamic-discovery.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000;        // 5 minutes
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000;    // 24 hours

function getCacheDir(): string {
  return join(homedir(), '.hoody', 'cache', 'exec-scripts');
}

function ensureCacheDir(): string {
  const dir = getCacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCacheFilePath(containerId: string): string {
  // Collision-safe sanitisation: a naive char-replace would map `my:container`
  // and `my_container` to the same filename, causing silent cross-container
  // cache poisoning. Keep the original id when filesystem-safe, otherwise
  // fall back to a short SHA-256 of the raw id so every distinct
  // containerId maps to a distinct file.
  const SAFE_RE = /^[a-zA-Z0-9_-]+$/;
  if (SAFE_RE.test(containerId) && containerId.length > 0 && containerId.length <= 128) {
    return join(getCacheDir(), `${containerId}.json`);
  }
  const hash = createHash('sha256').update(containerId).digest('hex').slice(0, 32);
  return join(getCacheDir(), `h_${hash}.json`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read discovery cache from disk.
 * Returns undefined if cache doesn't exist or is expired.
 */
export function readFileCache(containerId: string, ttlMs = DEFAULT_TTL_MS): DiscoveryCache | undefined {
  // Opportunistic prune — keeps the on-disk cache dir bounded without a
  // dedicated sweep task.
  // Prune failures are already swallowed inside pruneStaleCache.
  pruneStaleCache();

  const filePath = getCacheFilePath(containerId);
  if (!existsSync(filePath)) return undefined;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const cache = JSON.parse(raw) as DiscoveryCache;

    if (cache.version !== CACHE_VERSION) return undefined;
    // Cross-check that the cache is actually for this container — defends
    // against hash collisions and migrated cache files left on disk.
    if (cache.containerId !== containerId) return undefined;

    const fetchedAt = new Date(cache.fetchedAt).getTime();
    if (Number.isNaN(fetchedAt)) return undefined;

    const effectiveTtl = cache.ttlMs || ttlMs;
    if (Date.now() - fetchedAt > effectiveTtl) return undefined;

    return cache;
  } catch {
    return undefined;
  }
}

/**
 * Write discovery results to disk cache.
 */
export function writeFileCache(containerId: string, scripts: DiscoveredScript[], ttlMs = DEFAULT_TTL_MS): void {
  ensureCacheDir();
  // Opportunistic prune — keeps the on-disk cache dir bounded without a
  // dedicated sweep task.
  pruneStaleCache();

  const filePath = getCacheFilePath(containerId);

  const cache: DiscoveryCache = {
    version: CACHE_VERSION,
    containerId,
    fetchedAt: new Date().toISOString(),
    ttlMs,
    scripts,
  };

  writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Delete the cache file for a container.
 */
export function deleteFileCache(containerId: string): void {
  const filePath = getCacheFilePath(containerId);
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore — file may have been deleted concurrently
  }
}

/**
 * Prune cache files older than 24 hours.
 * Called opportunistically on cache access.
 */
export function pruneStaleCache(): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) return;

  try {
    const files = readdirSync(dir);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(dir, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const cache = JSON.parse(raw) as DiscoveryCache;
        const fetchedAt = new Date(cache.fetchedAt).getTime();
        if (Number.isNaN(fetchedAt) || now - fetchedAt > PRUNE_AGE_MS) {
          unlinkSync(filePath);
        }
      } catch {
        // Corrupted file — remove it
        try { unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
  } catch {
    // Cache dir inaccessible — ignore
  }
}
