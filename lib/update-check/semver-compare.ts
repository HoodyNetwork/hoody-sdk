/**
 * Thin wrapper around `semver` so the rest of the module has a flat,
 * side-effect-free API surface. Pre-release ordering follows semver spec:
 *   `1.3.0-dev` < `1.3.0` (prerelease is always behind its release).
 */

import * as semver from 'semver';

export type Relation = 'up-to-date' | 'behind' | 'ahead' | 'unparseable';

/**
 * Compare an installed version against a latest-released version.
 *
 * `unparseable` is returned iff EITHER side fails semver.parse(); callers
 * should surface this as an error (not a banner state).
 */
export function compareVersions(installed: string, latest: string): Relation {
  const i = semver.parse(installed);
  const l = semver.parse(latest);
  if (!i || !l) return 'unparseable';
  if (i.compare(l) === 0) return 'up-to-date';
  return i.compare(l) > 0 ? 'ahead' : 'behind';
}

/** Whether `latest` is a higher MAJOR version than `installed` (a breaking update). False when either does not parse. */
export function isMajorUpdate(installed: string, latest: string): boolean {
  const i = semver.parse(installed);
  const l = semver.parse(latest);
  return !!i && !!l && l.major > i.major;
}

/**
 * The majors an update from `installed` to `latest` crosses, ascending: `1.9.0` to `3.1.0` crosses 2 and 3, `2.3.0` to
 * `2.9.0` crosses none. Empty when either side does not parse or `latest` is not a higher major.
 */
export function crossedMajors(installed: string, latest: string): number[] {
  const i = semver.parse(installed);
  const l = semver.parse(latest);
  if (!i || !l || l.major <= i.major) return [];
  const out: number[] = [];
  for (let m = i.major + 1; m <= l.major; m++) out.push(m);
  return out;
}

/** Validate a version string parses under strict semver. */
export function isValidSemver(v: string): boolean {
  return semver.valid(v) !== null;
}
