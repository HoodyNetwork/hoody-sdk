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
import { compareVersions } from './semver-compare.js';

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
export function renderBanner(ctx: BannerContext): BannerFormat {
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
  return {
    bareBanner:
      `hoody ${installedVersion}\n` +
      `A new version (${cache.latest_version}) is available. Run: hoody update`,
    helpSuffix:
      `hoody ${installedVersion}   •   Update available: ${cache.latest_version}. Run: hoody update`,
  };
}

/**
 * Race `work` against a timeout. Returns the work's result if it completes
 * first, `undefined` otherwise. Unlike Promise.race, this does NOT cancel
 * the work when the timeout wins — the work continues running so the cache
 * can be populated for the next invocation.
 */
export async function boundedWait<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  return await new Promise<T | undefined>(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    }, timeoutMs);
    work.then(
      value => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        // work rejected — allow the timeout to resolve as `undefined`;
        // we never surface fetch errors via the banner path.
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(undefined);
        }
      },
    );
  });
}
