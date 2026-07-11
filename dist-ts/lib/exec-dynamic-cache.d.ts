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
import type { DiscoveredScript, DiscoveryCache } from './exec-dynamic-discovery.js';
/**
 * Read discovery cache from disk.
 * Returns undefined if cache doesn't exist or is expired.
 */
export declare function readFileCache(containerId: string, ttlMs?: number): DiscoveryCache | undefined;
/**
 * Write discovery results to disk cache.
 */
export declare function writeFileCache(containerId: string, scripts: DiscoveredScript[], ttlMs?: number): void;
/**
 * Delete the cache file for a container.
 */
export declare function deleteFileCache(containerId: string): void;
/**
 * Prune cache files older than 24 hours.
 * Called opportunistically on cache access.
 */
export declare function pruneStaleCache(): void;
