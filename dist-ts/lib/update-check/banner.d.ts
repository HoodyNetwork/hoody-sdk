/**
 * Banner rendering + bounded-wait wrapper for banner-showing invocations.
 *
 * Banner shows ONLY on:
 *   - Bare `hoody` (root command, no subcommand)
 *   - `hoody [anything] --help` (Commander's --help path)
 *
 * NEVER on other subcommand output — keeps `hoody list --json | jq` clean.
 *
 * Cases:
 *   1. Cache status = 'error' OR cache expired (now > not_after) → just version
 *   2. Cache missing → just version (first-ever invocation)
 *   3. status = 'up-to-date' → just version
 *   4. status = 'behind' → version + "A new version (X) is available. Run: hoody update"
 *   5. status = 'ahead' → version + "(ahead of release channel)"
 */
import type { UpdateCheckCache } from './cache.js';
export interface BannerContext {
    /** Current baked version (HOODY_VERSION). */
    installedVersion: string;
    /** Cached result from a prior successful check, or null. */
    cache: UpdateCheckCache | null;
    /** Current time (injectable for tests). */
    nowMs?: number;
}
export interface BannerFormat {
    /** For bare `hoody` — two-line banner with current version + update line. */
    bareBanner: string;
    /** For --help — single-line suffix appended after normal help text. */
    helpSuffix: string;
}
/** Produce both banner variants from a context. */
export declare function renderBanner(ctx: BannerContext): BannerFormat;
/**
 * Race `work` against a timeout. Returns the work's result if it completes
 * first, `undefined` otherwise. Unlike Promise.race, this does NOT cancel
 * the work when the timeout wins — the work continues running so the cache
 * can be populated for the next invocation.
 */
export declare function boundedWait<T>(work: Promise<T>, timeoutMs: number): Promise<T | undefined>;
