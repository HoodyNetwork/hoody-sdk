/**
 * @hoody-ai/hoody-sdk/update-check — minisign-verified version check.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ Trust chain (multi-domain)                                              │
 * │                                                                         │
 * │   build-time: package.json.version + admin trustedDomains JSON         │
 * │                → bake-domains.ts → generated/domains.ts                │
 * │                → bun build --compile                                   │
 * │                                                                        │
 * │   runtime: hoody update / hoody check-update                           │
 * │     → selectDomain (flag → env → config-file → fail-closed)            │
 * │     → lookupTrustedDomain in HOODY_PINNED_DOMAINS (hasOwnProperty)     │
 * │     → fetch https://install.<domain>/channel.json (+ .minisig)         │
 * │     → verify Ed25519 over BLAKE2b-512 prehash                          │
 * │     → verify global_sig over (main_sig || trusted_comment_utf8)        │
 * │     → assert trusted_comment version == channel.latest                 │
 * │     → assert issued_at / not_after freshness                           │
 * │     → semver-compare baked HOODY_VERSION vs channel.latest             │
 * │     → return result (status + latest_version + error)                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * The verifier itself is domain-agnostic: callers pass `baseUrl`, `pinnedPubkey`,
 * and (optionally) `pinnedPubkeyPrevious` after running selectDomain +
 * lookupTrustedDomain at the CLI boundary. This keeps the verifier reusable
 * by any future SDK consumer that wants to verify a different update channel.
 *
 * Public API:
 *   - checkForUpdate(options) — runs the full verify → compare flow
 *   - refreshCache(options) — like checkForUpdate, writes result to cache
 *   - readCache, writeCache — low-level accessors (re-exports)
 *   - renderBanner, boundedWait — banner helpers (re-exports)
 *   - selectDomain, lookupTrustedDomain — domain selection (re-exports)
 */
import { type Relation } from './semver-compare.js';
import { type UpdateCheckCache } from './cache.js';
export * from './minisign.js';
export * from './fetcher.js';
export * from './cache.js';
export * from './banner.js';
export * from './platform.js';
export * from './domain.js';
export { compareVersions, isValidSemver, type Relation } from './semver-compare.js';
/** Default User-Agent for CDN traffic distinction. */
export declare const DEFAULT_USER_AGENT = "hoody-update-check/1";
export interface CheckForUpdateOptions {
    /** Base URL for fetching channel.json + .minisig. Caller derives this from
     *  the selected domain via `installUrlFor(domain)` (or supplies a test URL). */
    baseUrl: string;
    /** Installed version, typically the baked HOODY_VERSION. */
    installedVersion: string;
    /** Base64 pubkey for the selected domain. Caller resolves via
     *  `lookupTrustedDomain(HOODY_PINNED_DOMAINS, domain)`. */
    pinnedPubkey: string;
    /**
     * Optional second-generation pubkey for rotation fallback. When the
     * primary verification fails, we re-run verification against this key.
     * Empty string means "no fallback". Key rotation can otherwise strand
     * users with old baked keys — this path lets a binary
     * built during the rotation window accept signatures from EITHER key.
     */
    pinnedPubkeyPrevious?: string;
    /**
     * Version floor. checkForUpdate refuses any channel.json
     * whose `latest` is strictly less than this value, EVEN if the signature
     * verifies (including via the rotation-fallback `previous` key). Stops a
     * compromised previous-key from signing-and-serving a downgrade. Caller
     * passes the baked HOODY_VERSION_FLOOR. When omitted, no floor enforced
     * (legacy callers / tests).
     */
    versionFloor?: string;
    /** Override fetch for testing. */
    fetch?: typeof fetch;
    /** Retry profile: foreground (3 attempts w/ backoff) or background (1 shot). */
    mode?: 'foreground' | 'background';
    /** Inject current time for tests. */
    nowMs?: number;
    /** User-Agent header. */
    userAgent?: string;
}
export interface CheckForUpdateResult {
    installedVersion: string;
    latestVersion: string | null;
    relation: Relation | 'error';
    error: UpdateCheckErrorKind | null;
    errorMessage: string | null;
    /** Freshness bound from the signed channel.json (null on error). */
    notAfter: string | null;
}
export type UpdateCheckErrorKind = 'network' | 'http' | 'parse' | 'signature' | 'freshness' | 'pubkey' | 'version-mismatch' | 'unparseable-version';
/** Full check: fetch → verify → compare. Does NOT write the cache. */
export declare function checkForUpdate(opts: CheckForUpdateOptions): Promise<CheckForUpdateResult>;
/**
 * Run a check and write the result to the cache file. Always returns; never
 * throws. Intended for banner-showing invocations (bare `hoody`, `--help`)
 * where the caller wants cache freshness without surfacing errors.
 */
export declare function refreshCache(opts: CheckForUpdateOptions, customCachePath?: string): Promise<CheckForUpdateResult>;
/** Convert a check result into the on-disk cache shape. */
export declare function resultToCache(result: CheckForUpdateResult, nowMs?: number): UpdateCheckCache;
/**
 * Entry point for the invocation-time pre-action hook: read the cache, and
 * (if stale AND opt-out NOT set) start an async refresh. The refresh is NOT
 * awaited — the caller decides whether to bound-wait for it.
 */
export interface PreActionOptions extends Omit<CheckForUpdateOptions, 'mode'> {
    /** Skip cache read, refresh, banner entirely. */
    optOut?: boolean;
    /** Custom cache path (tests). */
    cachePath?: string;
    /** Custom cache dir for cleanup-on-start (tests). */
    cacheDir?: string;
}
export interface PreActionResult {
    cache: UpdateCheckCache | null;
    /** Promise for the in-flight refresh (or null if no refresh was kicked off). */
    refreshPromise: Promise<void> | null;
}
export declare function startPreAction(opts: PreActionOptions): PreActionResult;
