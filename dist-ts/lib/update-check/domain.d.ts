/**
 * domain.ts — runtime selection of which baked domain (in `HOODY_PINNED_DOMAINS`)
 * the binary should verify update channels against.
 *
 * Priority order (first match wins):
 *   1. CLI flag value (passed in by the caller — extracted from commander, NOT
 *      raw process.argv, so flag/value parsing is consistent with the rest of
 *      the CLI).
 *   2. `HOODY_DOMAIN` environment variable.
 *   3. Config file at `~/.config/hoody/domain` (POSIX) or
 *      `%APPDATA%\hoody\domain` (Windows).
 *   4. Fail-closed: throw `DomainNotConfiguredError`.
 *
 * Security model: multi-domain distribution. The env-var override is a
 * documented debugging affordance; default path is the config file written
 * by `install.sh` at install time.
 *
 * Validation: domain string must match RFC-1123 hostname rules (matches the
 * server-side domain-key validation).
 */
/** No domain is configured: no flag value, no `HOODY_DOMAIN`, and no domain config file. */
export declare class DomainNotConfiguredError extends Error {
    constructor(message: string);
}
/** A configured domain is not a valid host name. */
export declare class DomainInvalidError extends Error {
    constructor(message: string);
}
export interface SelectDomainInputs {
    /** Value from `--domain` CLI flag, parsed by commander (NOT raw argv). */
    flag?: string | null;
    /** Override env vars (test injection). Defaults to `process.env`. */
    env?: NodeJS.ProcessEnv;
    /** Override platform (test injection). Defaults to `process.platform`. */
    platform?: NodeJS.Platform;
    /** Override home dir (test injection). Defaults to `os.homedir()`. */
    homedir?: string;
    /** Override APPDATA (test injection, Windows only). Defaults to env.APPDATA. */
    appdata?: string;
}
/** Path to the persisted-domain config file for this platform. Uses
 *  platform-appropriate separators (path.win32 vs path.posix) so the result
 *  is correct even when called with a non-host platform (e.g. tests). */
export declare function configFilePath(opts?: Pick<SelectDomainInputs, 'platform' | 'homedir' | 'appdata' | 'env'>): string;
/** The outcome of {@link verifyConfigFingerprint}; each value is described there. */
export type FingerprintStatus = 'ok' | 'absent' | 'mismatch' | 'unreadable';
/** The fingerprint of a public key: SHA-256 of its decoded bytes, as lower-case hex. */
export declare function fingerprintForPubkey(pubkeyBase64: string): string;
/** Verify install-time pubkey-fingerprint matches the binary's
 *  baked pubkey for the resolved domain. Defends against the install.sh ↔
 *  binary trust desync — an attacker compromising only the CDN that serves
 *  install.sh (without touching admin) could ship an installer pinning
 *  __DOMAIN__=hoody.com while the binary trusts a different domain's
 *  rotated previous-key.
 *
 *  install.sh writes the fingerprint file beside `domainConfigPath`
 *  (`<path>.fingerprint`) with the SHA-256 hex fingerprint of the pubkey it
 *  pinned at install time; this compares it to the fingerprint of
 *  `bakedPubkeyBase64` at every check. The fingerprint file is ADJACENT to
 *  (not embedded in) the domain file so a binary that reads only the domain
 *  file still parses it correctly.
 *
 *  Never throws. Returns the status with the expected and the stored value:
 *   - 'ok'           fingerprint file exists AND matches baked pubkey
 *   - 'absent'       fingerprint file does not exist or is empty (an
 *                    install without one, or a user who edited the domain
 *                    file by hand) — caller decides whether to warn or fail
 *   - 'mismatch'     fingerprint file disagrees with baked pubkey, is too
 *                    large or is not 64 hex characters — must fail-closed;
 *                    this is the attack signal
 *   - 'unreadable'   fingerprint file open or read failed for a reason
 *                    other than ENOENT (EACCES, EISDIR, ELOOP, etc.); a
 *                    warning goes to stderr. It is kept apart from
 *                    'absent' so that making the file unreadable cannot
 *                    turn a 'mismatch' (fail-closed) into a
 *                    warn-and-continue. Callers should at least surface a
 *                    louder notice; ideally exit non-zero from the update path.
 */
export declare function verifyConfigFingerprint(domainConfigPath: string, bakedPubkeyBase64: string): {
    status: FingerprintStatus;
    expected: string;
    actual: string | null;
};
/** Per-domain trust entry shape (mirrors HOODY_PINNED_DOMAINS values). */
export interface DomainTrustEntry {
    pubkey: string;
    previous?: string;
}
/**
 * Look up the trust entry for a selected domain in the baked map. Uses
 * `Object.prototype.hasOwnProperty.call` to defend against prototype-pollution
 * probes (`__proto__`, `constructor`) that would otherwise return object
 * intrinsics and bypass the trust check.
 *
 * Throws DomainNotConfiguredError with the sorted list of trusted domains so
 * the caller can surface a helpful "reinstall" message.
 */
export declare function lookupTrustedDomain(map: Record<string, DomainTrustEntry>, domain: string): DomainTrustEntry;
/**
 * Resolve the active domain. Throws DomainNotConfiguredError if nothing is
 * set anywhere; throws DomainInvalidError if a value is set but malformed.
 *
 * The fail-closed behavior is intentional: a binary running with no domain
 * set is a misconfiguration, and the caller should surface a clear "reinstall
 * via curl install.<domain>/install.sh | sh" message.
 */
export declare function selectDomain(opts?: SelectDomainInputs): string;
