/**
 * Banner rendering + bounded-wait wrapper for banner-showing invocations.
 *
 * Banner shows ONLY on:
 *   - Bare `hoody` (root command, no subcommand)
 *   - `hoody [anything] --help` (Commander's --help path)
 *
 * NEVER on other subcommand output — keeps `hoody computers list --json | jq` clean.
 *
 * Cases:
 *   1. Cache status = 'error' OR cache expired (now > not_after) → just version
 *   2. Cache missing → just version (first-ever invocation)
 *   3. status = 'up-to-date' → just version
 *   4. status = 'behind' → version + "A new version (X) is available. Run: hoody update"
 *      (an update that crosses a release with a migration guide, or a new MAJOR version, adds a breaking-update line
 *      that points at each guide it crosses, or at the changelog when a crossed major has none: see MIGRATION_GUIDES)
 *   5. status = 'ahead' → version + "(ahead of release channel)"
 */
import type { UpdateCheckCache } from './cache.js';
/**
 * The migration guides shipped in the package, each with the release it was written for (`since`). An update crosses
 * a guide when the installed version is below `since` and the available one is at or above it: the 2026-10 names
 * guide covers the renames released in 1.0.1, so 1.0.0 to 1.0.1 (or to 2.0.0) is sent to it and 1.0.1 to 1.2.0 is
 * not. Crossing a guide makes the update a breaking one even within a major. A crossed major with no guide of its own
 * (no row whose `since` has that major) is sent to the changelog as well. Add a row when a release ships its guide.
 */
export declare const MIGRATION_GUIDES: ReadonlyArray<{
    since: string;
    guide: string;
}>;
/**
 * What an update tells the reader to read: the guides it crosses, and the changelog as well when a crossed major has
 * no guide (1.0.0 to 3.0.0 crosses the 1.0.1 guide and majors 2 and 3, which have none), or alone when no guide is
 * crossed. `breaking` is true for a major update and for one that crosses a guide.
 */
export declare function migrationAdvice(installed: string, latest: string): {
    guides: string[];
    changelog: boolean;
    breaking: boolean;
    text: string;
    short: string;
};
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
