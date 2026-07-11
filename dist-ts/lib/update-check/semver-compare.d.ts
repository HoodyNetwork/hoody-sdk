/**
 * Thin wrapper around `semver` so the rest of the module has a flat,
 * side-effect-free API surface. Pre-release ordering follows semver spec:
 *   `1.3.0-dev` < `1.3.0` (prerelease is always behind its release).
 */
export type Relation = 'up-to-date' | 'behind' | 'ahead' | 'unparseable';
/**
 * Compare an installed version against a latest-released version.
 *
 * `unparseable` is returned iff EITHER side fails semver.parse(); callers
 * should surface this as an error (not a banner state).
 */
export declare function compareVersions(installed: string, latest: string): Relation;
/** Validate a version string parses under strict semver. */
export declare function isValidSemver(v: string): boolean;
