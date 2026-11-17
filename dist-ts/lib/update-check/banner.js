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
import { compareVersions, crossedMajors, isMajorUpdate } from './semver-compare.js';
/**
 * The migration guides shipped in the package, each with the release it was written for (`since`). An update crosses
 * a guide when the installed version is below `since` and the available one is at or above it: the 2026-10 names
 * guide covers the renames released in 1.0.1, so 1.0.0 to 1.0.1 (or to 2.0.0) is sent to it and 1.0.1 to 1.2.0 is
 * not. Crossing a guide makes the update a breaking one even within a major. A crossed major with no guide of its own
 * (no row whose `since` has that major) is sent to the changelog as well. Add a row when a release ships its guide.
 */
export const MIGRATION_GUIDES = [
    { since: '1.0.1', guide: 'docs/MIGRATION-2026-10-NAMES.md' },
];
/** Whether an update from `installed` to `latest` crosses into `since`: installed below it, latest at or above it. */
function crossesInto(installed, latest, since) {
    if (compareVersions(installed, since) !== 'behind')
        return false;
    const rel = compareVersions(latest, since);
    return rel === 'up-to-date' || rel === 'ahead';
}
/** The major of a guide's `since`, or NaN when it does not parse. */
function majorOf(v) {
    return Number(/^(\d+)\./.exec(v)?.[1] ?? NaN);
}
/**
 * What an update tells the reader to read: the guides it crosses, and the changelog as well when a crossed major has
 * no guide (1.0.0 to 3.0.0 crosses the 1.0.1 guide and majors 2 and 3, which have none), or alone when no guide is
 * crossed. `breaking` is true for a major update and for one that crosses a guide.
 */
export function migrationAdvice(installed, latest) {
    const crossedGuides = MIGRATION_GUIDES.filter((g) => crossesInto(installed, latest, g.since));
    const guides = crossedGuides.map((g) => g.guide);
    const changelog = crossedMajors(installed, latest).some((m) => !crossedGuides.some((g) => majorOf(g.since) === m));
    const breaking = isMajorUpdate(installed, latest) || guides.length > 0;
    const text = guides.length > 0
        ? `${guides.join(' and ')} (in the hoody-sdk package)${changelog ? ' and the changelog' : ''}`
        : 'the changelog';
    const short = guides.length > 0 ? `${guides.join(' and ')}${changelog ? ' and the changelog' : ''}` : 'read the changelog';
    return { guides, changelog, breaking, text, short };
}
/** Produce both banner variants from a context. */
export function renderBanner(ctx) {
    const { installedVersion, cache } = ctx;
    const nowMs = ctx.nowMs ?? Date.now();
    // Degraded cases: no cache, error, or expired → show version only.
    if (!cache || cache.status === 'error' || !cache.latest_version) {
        return {
            bareBanner: `hoody ${installedVersion}`,
            helpSuffix: `hoody ${installedVersion}`,
        };
    }
    if (cache.not_after) {
        const notAfterMs = Date.parse(cache.not_after);
        if (Number.isFinite(notAfterMs) && nowMs > notAfterMs) {
            return {
                bareBanner: `hoody ${installedVersion}`,
                helpSuffix: `hoody ${installedVersion}`,
            };
        }
    }
    // Compare baked version vs cached latest. Note: we don't trust
    // cache.status directly — recompute to defend against a cache written
    // by a prior binary version.
    const rel = compareVersions(installedVersion, cache.latest_version);
    if (rel === 'up-to-date' || rel === 'unparseable') {
        return {
            bareBanner: `hoody ${installedVersion}`,
            helpSuffix: `hoody ${installedVersion}`,
        };
    }
    if (rel === 'ahead') {
        return {
            bareBanner: `hoody ${installedVersion} (ahead of release channel)`,
            helpSuffix: `hoody ${installedVersion} (ahead of release channel)`,
        };
    }
    // behind
    const advice = migrationAdvice(installedVersion, cache.latest_version);
    if (advice.breaking) {
        const major = isMajorUpdate(installedVersion, cache.latest_version);
        return {
            bareBanner: `hoody ${installedVersion}\n` +
                `A new version (${cache.latest_version}) is available. Run: hoody update\n` +
                `${major ? 'This is a major update with breaking changes' : 'This update has breaking changes'}: read ${advice.text} first.`,
            helpSuffix: `hoody ${installedVersion}   •   Update available: ${cache.latest_version} (${major ? 'major update, ' : ''}breaking changes: ${advice.short}). Run: hoody update`,
        };
    }
    return {
        bareBanner: `hoody ${installedVersion}\n` +
            `A new version (${cache.latest_version}) is available. Run: hoody update`,
        helpSuffix: `hoody ${installedVersion}   •   Update available: ${cache.latest_version}. Run: hoody update`,
    };
}
/**
 * Race `work` against a timeout. Returns the work's result if it completes
 * first, `undefined` otherwise. Unlike Promise.race, this does NOT cancel
 * the work when the timeout wins — the work continues running so the cache
 * can be populated for the next invocation.
 */
export async function boundedWait(work, timeoutMs) {
    return await new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(undefined);
            }
        }, timeoutMs);
        work.then(value => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(value);
            }
        }, () => {
            // work rejected — allow the timeout to resolve as `undefined`;
            // we never surface fetch errors via the banner path.
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(undefined);
            }
        });
    });
}
