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
import type { CallableScript, CallableScriptsCache } from './exec-dynamic-discovery.js';
/**
 * Read discovery cache from disk.
 * Returns undefined if cache doesn't exist or is expired.
 */
export declare function readFileCache(computerId: string, ttlMs?: number): CallableScriptsCache | undefined;
/**
 * Write discovery results to disk cache.
 */
export declare function writeFileCache(computerId: string, scripts: CallableScript[], ttlMs?: number): void;
/**
 * Delete the cache file for a computer.
 */
export declare function deleteFileCache(computerId: string): void;
/**
 * Prune cache files older than 24 hours.
 * Called opportunistically on cache access.
 */
export declare function pruneStaleCache(): void;
