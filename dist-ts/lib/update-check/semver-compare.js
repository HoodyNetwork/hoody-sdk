/**
 * Thin wrapper around `semver` so the rest of the module has a flat,
 * side-effect-free API surface. Pre-release ordering follows semver spec:
 *   `1.3.0-dev` < `1.3.0` (prerelease is always behind its release).
 */
import * as semver from 'semver';
/**
 * Compare an installed version against a latest-released version.
 *
 * `unparseable` is returned iff EITHER side fails semver.parse(); callers
 * should surface this as an error (not a banner state).
 */
export function compareVersions(installed, latest) {
    const i = semver.parse(installed);
    const l = semver.parse(latest);
    if (!i || !l)
        return 'unparseable';
    if (i.compare(l) === 0)
        return 'up-to-date';
    return i.compare(l) > 0 ? 'ahead' : 'behind';
}
/** Validate a version string parses under strict semver. */
export function isValidSemver(v) {
    return semver.valid(v) !== null;
}
