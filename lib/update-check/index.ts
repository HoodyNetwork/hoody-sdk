/**
 * hoody-sdk/update-check — minisign-verified version check.
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

import {
  parsePublicKey,
  parseSignature,
  verifyMessage,
  extractVersionFromTrustedComment,
  validateFreshness,
  MinisignVerificationError,
} from './minisign.js';
import { fetchWithRetry, fetchOnce, FetchError, BACKGROUND_TOTAL_TIMEOUT_MS } from './fetcher.js';
import { compareVersions, type Relation } from './semver-compare.js';
import {
  readCache, writeCache, isFresh, cleanupStaleTmpFiles,
  type UpdateCheckCache, DEFAULT_TTL_SECONDS,
} from './cache.js';

export * from './minisign.js';
export * from './fetcher.js';
export * from './cache.js';
export * from './banner.js';
export * from './platform.js';
export * from './domain.js';
export { compareVersions, isValidSemver, type Relation } from './semver-compare.js';

/** Default User-Agent for CDN traffic distinction. */
export const DEFAULT_USER_AGENT = 'hoody-update-check/1';

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

export type UpdateCheckErrorKind =
  | 'network'
  | 'http'
  | 'parse'
  | 'signature'
  | 'freshness'
  | 'pubkey'
  | 'version-mismatch'
  | 'unparseable-version';

/** Full check: fetch → verify → compare. Does NOT write the cache. */
export async function checkForUpdate(
  opts: CheckForUpdateOptions,
): Promise<CheckForUpdateResult> {
  const baseUrl = opts.baseUrl;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const nowMs = opts.nowMs ?? Date.now();
  const installed = opts.installedVersion;

  // Parse pubkey first — misconfigured build should fail before any network.
  let pubkey;
  try {
    pubkey = parsePublicKey(opts.pinnedPubkey);
  } catch (e) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'pubkey',
      errorMessage: `pinned public key is invalid: ${(e as Error).message}`,
      notAfter: null,
    };
  }

  // Parse optional previous-generation pubkey (rotation fallback). Empty
  // string = no fallback. If supplied but malformed, treat as no fallback —
  // a bad rotation key should NOT prevent the primary check from working.
  let pubkeyPrevious: ReturnType<typeof parsePublicKey> | null = null;
  const prevRaw = (opts.pinnedPubkeyPrevious ?? '').trim();
  if (prevRaw.length > 0) {
    try {
      pubkeyPrevious = parsePublicKey(prevRaw);
    } catch {
      pubkeyPrevious = null;
    }
  }

  const channelUrl = `${baseUrl}/channel.json`;
  const minisigUrl = `${baseUrl}/channel.json.minisig`;
  const fetchOpts = { fetch: opts.fetch, userAgent };

  let channelRes, minisigRes;
  try {
    if (opts.mode === 'background') {
      [channelRes, minisigRes] = await Promise.all([
        fetchOnce(channelUrl, BACKGROUND_TOTAL_TIMEOUT_MS, fetchOpts),
        fetchOnce(minisigUrl, BACKGROUND_TOTAL_TIMEOUT_MS, fetchOpts),
      ]);
    } else {
      [channelRes, minisigRes] = await Promise.all([
        fetchWithRetry(channelUrl, fetchOpts),
        fetchWithRetry(minisigUrl, fetchOpts),
      ]);
    }
  } catch (e) {
    const err = e as FetchError;
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: err.kind === 'http' ? 'http' : 'network',
      errorMessage: err.message,
      notAfter: null,
    };
  }

  // Parse JSON before verifying signatures so "malformed JSON" is
  // distinguishable in error output. Signature check still happens.
  let channel: { latest?: string; issued_at?: string; not_after?: string };
  try {
    channel = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(channelRes.body));
  } catch (e) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'parse',
      errorMessage: `channel.json is not valid JSON: ${(e as Error).message}`,
      notAfter: null,
    };
  }

  let trustedComment: string;
  // Track which key verified so we can enforce the version
  // floor on the rotation-fallback path (and ONLY on that path).
  let verifiedByPrevious = false;
  try {
    const sig = parseSignature(new TextDecoder('utf-8', { fatal: true }).decode(minisigRes.body));
    try {
      trustedComment = verifyMessage(channelRes.body, sig, pubkey);
    } catch (primaryErr) {
      // Primary key failed. If a previous-generation key is baked in, try
      // it as the rotation fallback. This lets binaries built during a
      // key rotation accept signatures from EITHER key while servers are
      // still using the old one (before the rotation tick catches up).
      if (pubkeyPrevious !== null) {
        trustedComment = verifyMessage(channelRes.body, sig, pubkeyPrevious);
        verifiedByPrevious = true;
      } else {
        throw primaryErr;
      }
    }
  } catch (e) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'signature',
      errorMessage: (e as MinisignVerificationError).message,
      notAfter: null,
    };
  }

  // Cross-check: trusted_comment version MUST equal channel.latest.
  let trustedVersion: string;
  try {
    trustedVersion = extractVersionFromTrustedComment(trustedComment);
  } catch (e) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'signature',
      errorMessage: (e as MinisignVerificationError).message,
      notAfter: null,
    };
  }
  const channelLatest = typeof channel.latest === 'string' ? channel.latest.trim() : '';
  if (!channelLatest) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'parse',
      errorMessage: 'channel.json has no .latest field',
      notAfter: null,
    };
  }
  if (trustedVersion !== channelLatest) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'version-mismatch',
      errorMessage:
        `signature trusted_comment says version=${trustedVersion} ` +
        `but channel.json .latest is ${channelLatest}`,
      notAfter: null,
    };
  }
  // Require the EXACT trusted_comment format
  // (`hoody-cdn bin version=<channelLatest>`) to match the server-side
  // and client-side (install.sh) enforcement. A loose
  // regex previously accepted any comment containing "version=X" which
  // violated the cross-validator binding invariant.
  const expectedComment = `hoody-cdn bin version=${channelLatest}`;
  if (trustedComment !== expectedComment) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'signature',
      errorMessage:
        `signature trusted_comment ${JSON.stringify(trustedComment)} does not ` +
        `match expected ${JSON.stringify(expectedComment)}`,
      notAfter: null,
    };
  }

  // Rotation-fallback downgrade defense. If the signature
  // verified via the `previous` key, refuse any `latest` strictly less
  // than the baked version floor. A stale `previous` slot left in
  // `trustedDomains[X]` (operator forgot to clear it after a rotation
  // cycle) is otherwise a full update-channel takeover for any binary
  // coerced to domain X via HOODY_DOMAIN: attacker re-signs an OLDER
  // (vulnerable) channel.json with the compromised previous-key. The
  // `expectedComment` check above already binds `trustedComment` to
  // `channelLatest`, so it's enough to compare `channelLatest` to the
  // baked floor here.
  if (verifiedByPrevious && opts.versionFloor) {
    const cmp = compareVersions(opts.versionFloor, channelLatest);
    if (cmp === 'behind') {                                            // floor BEHIND latest = OK (latest >= floor)
      // accepted
    } else if (cmp === 'unparseable') {
      return {
        installedVersion: installed,
        latestVersion: channelLatest,
        relation: 'error',
        error: 'signature',
        errorMessage: `version-floor compare failed (floor=${opts.versionFloor} latest=${channelLatest})`,
        notAfter: null,
      };
    } else {                                                           // 'same' or 'ahead' → latest <= floor
      // 'same' is OK (latest == floor); reject only strict downgrade.
      if (cmp === 'ahead') {
        return {
          installedVersion: installed,
          latestVersion: channelLatest,
          relation: 'error',
          error: 'signature',
          errorMessage:
            `signature verified via rotation-fallback (previous) key but channel.json ` +
            `latest=${channelLatest} is below baked version floor=${opts.versionFloor}. ` +
            `Refusing to accept a downgrade signed by the previous-generation key.`,
          notAfter: null,
        };
      }
    }
  }

  // Freshness (not_after + issued_at sanity; no max-window cap).
  try {
    validateFreshness(channel.issued_at, channel.not_after, nowMs);
  } catch (e) {
    return {
      installedVersion: installed,
      latestVersion: null,
      relation: 'error',
      error: 'freshness',
      errorMessage: (e as MinisignVerificationError).message,
      notAfter: channel.not_after ?? null,
    };
  }

  const rel = compareVersions(installed, channelLatest);
  if (rel === 'unparseable') {
    return {
      installedVersion: installed,
      latestVersion: channelLatest,
      relation: 'error',
      error: 'unparseable-version',
      errorMessage: `cannot compare installed=${installed} against latest=${channelLatest}`,
      notAfter: channel.not_after ?? null,
    };
  }
  return {
    installedVersion: installed,
    latestVersion: channelLatest,
    relation: rel,
    error: null,
    errorMessage: null,
    notAfter: channel.not_after ?? null,
  };
}

/**
 * Run a check and write the result to the cache file. Always returns; never
 * throws. Intended for banner-showing invocations (bare `hoody`, `--help`)
 * where the caller wants cache freshness without surfacing errors.
 */
export async function refreshCache(
  opts: CheckForUpdateOptions,
  customCachePath?: string,
): Promise<CheckForUpdateResult> {
  const result = await checkForUpdate(opts);
  const cache = resultToCache(result);
  await writeCache(cache, customCachePath);
  return result;
}

/** Convert a check result into the on-disk cache shape. */
export function resultToCache(
  result: CheckForUpdateResult,
  nowMs: number = Date.now(),
): UpdateCheckCache {
  const status =
    result.relation === 'up-to-date' ? 'up-to-date'
    : result.relation === 'behind' ? 'behind'
    : result.relation === 'ahead' ? 'ahead'
    : 'error';
  return {
    checked_at: new Date(nowMs).toISOString(),
    latest_version: result.latestVersion,
    status,
    error: result.errorMessage,
    ttl_seconds: DEFAULT_TTL_SECONDS,
    not_after: result.notAfter,
  };
}

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

export function startPreAction(opts: PreActionOptions): PreActionResult {
  if (opts.optOut) {
    return { cache: null, refreshPromise: null };
  }
  cleanupStaleTmpFiles(opts.cacheDir);
  const cache = readCache(opts.cachePath);
  const needsRefresh = cache === null || !isFresh(cache, opts.nowMs);
  let refreshPromise: Promise<void> | null = null;
  if (needsRefresh) {
    refreshPromise = refreshCache(
      { ...opts, mode: 'background' },
      opts.cachePath,
    ).then(() => undefined, () => undefined);
  }
  return { cache, refreshPromise };
}
