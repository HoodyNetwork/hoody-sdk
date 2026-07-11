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
 * Validation: domain string must match RFC-1123 hostname rules (matches
 * server-side `validateDomainKey` in hoody-server-admin).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class DomainNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainNotConfiguredError';
  }
}

export class DomainInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainInvalidError';
  }
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

/** RFC-1123 hostname check. Same shape as the server-side validator. */
function validateDomain(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) throw new DomainInvalidError('domain is empty');
  if (lower.length > 253) throw new DomainInvalidError(`domain exceeds 253 chars: ${lower}`);
  const labelRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of lower.split('.')) {
    if (!labelRe.test(label)) throw new DomainInvalidError(`invalid label ${JSON.stringify(label)} in ${lower}`);
  }
  return lower;
}

/** Path to the persisted-domain config file for this platform. Uses
 *  platform-appropriate separators (path.win32 vs path.posix) so the result
 *  is correct even when called with a non-host platform (e.g. tests). */
export function configFilePath(opts: Pick<SelectDomainInputs, 'platform' | 'homedir' | 'appdata' | 'env'> = {}): string {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (platform === 'win32') {
    const appdata = opts.appdata ?? env.APPDATA;
    if (!appdata) {
      const home = opts.homedir ?? os.homedir();
      return path.win32.join(home, 'AppData', 'Roaming', 'hoody', 'domain');
    }
    return path.win32.join(appdata, 'hoody', 'domain');
  }
  const home = opts.homedir ?? os.homedir();
  return path.posix.join(home, '.config', 'hoody', 'domain');
}

/** Read the persisted domain (if any). Returns null if the file is missing
 *  (ENOENT — expected before first install). Re-throws other errno codes
 *  (EACCES, EISDIR, etc.) so misconfiguration surfaces loudly rather than
 *  silently falling through to "no domain configured". Throws
 *  DomainInvalidError if the file exists but contents fail validation.
 *
 *  Performance bound: cap the read at 4 KiB so a multi-MB attacker-controlled
 *  file doesn't induce churn on every CLI invocation (banner-hook runs every
 *  command). Valid hostname is ≤253 bytes; 4 KiB is the smallest power of two
 *  that comfortably covers any sane future format extension. */
function readConfigFile(filePath: string): string | null {
  const MAX_DOMAIN_FILE_BYTES = 4096;
  let buf: Buffer;
  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (stat.size > MAX_DOMAIN_FILE_BYTES) {
      throw new DomainInvalidError(`${filePath} exceeds ${MAX_DOMAIN_FILE_BYTES} bytes (got ${stat.size}); refusing to read`);
    }
    buf = Buffer.alloc(Math.min(stat.size, MAX_DOMAIN_FILE_BYTES));
    fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const trimmed = buf.toString('utf-8').trim();
  if (!trimmed) return null;
  return validateDomain(trimmed);
}

/** Verify install-time pubkey-fingerprint matches the binary's
 *  baked pubkey for the resolved domain. Defends against the install.sh ↔
 *  binary trust desync — an attacker compromising only the CDN that serves
 *  install.sh (without touching admin) could ship an installer pinning
 *  __DOMAIN__=hoody.com while the binary trusts a different domain's
 *  rotated previous-key.
 *
 *  install.sh writes `~/.config/hoody/domain.fingerprint` with the SHA-256
 *  hex fingerprint of the pubkey it pinned at install time; we compare to
 *  the SHA-256 of HOODY_PINNED_DOMAINS[domain].pubkey at every check. The
 *  fingerprint file is ADJACENT to (not embedded in) the legacy domain file
 *  so old binaries reading new config layouts still parse correctly.
 *
 *  Returns:
 *   - 'ok'           fingerprint file exists AND matches baked pubkey
 *   - 'absent'       fingerprint file does not exist (legacy install or
 *                    user manually edited domain file) — caller decides
 *                    whether to warn or fail
 *   - 'mismatch'     fingerprint file exists but disagrees with baked
 *                    pubkey — must fail-closed; this is the attack signal
 *   - 'unreadable'   fingerprint file open or read failed for a reason
 *                    other than ENOENT (EACCES, EISDIR, ELOOP, etc.).
 *                    Previously collapsed into 'absent',
 *                    which let an attacker who could chmod 000 the file
 *                    silently downgrade a 'mismatch' (fail-closed) into a
 *                    warn-and-continue. Callers should treat 'unreadable'
 *                    distinct from 'absent' — at least surface a louder
 *                    notice; ideally exit non-zero from the update path.
 */
export type FingerprintStatus = 'ok' | 'absent' | 'mismatch' | 'unreadable';

export function fingerprintForPubkey(pubkeyBase64: string): string {
  return crypto.createHash('sha256').update(Buffer.from(pubkeyBase64.trim(), 'base64')).digest('hex');
}

export function verifyConfigFingerprint(
  domainConfigPath: string,
  bakedPubkeyBase64: string,
): { status: FingerprintStatus; expected: string; actual: string | null } {
  const fpPath = `${domainConfigPath}.fingerprint`;
  const expected = fingerprintForPubkey(bakedPubkeyBase64);
  // Cap read at 4 KiB matching readConfigFile. A valid
  // fingerprint is 64 hex chars; 4 KiB is generous and bounds DoS via a
  // multi-MB attacker-planted file (banner-hook runs on every CLI invocation).
  // Split errno classes — ENOENT means the file does
  // not exist (legacy install / first run; expected); every OTHER errno is
  // 'unreadable' (chmod-000, EISDIR, ELOOP, ENAMETOOLONG, EACCES). 'absent'
  // is the silent-OK path that's been load-bearing for back-compat; merging
  // unreadable into it lets an attacker who can chmod the file downgrade
  // 'mismatch' to 'absent'. Distinct status preserves callers' choice.
  const MAX_FP_BYTES = 4096;
  let actualRaw: string;
  let fd: number;
  try {
    fd = fs.openSync(fpPath, 'r');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return { status: 'absent', expected, actual: null };
    process.stderr.write(`hoody: warning: ${fpPath} present but unreadable (${err.code}); cannot verify install-time fingerprint.\n`);
    return { status: 'unreadable', expected, actual: null };
  }
  try {
    const stat = fs.fstatSync(fd);
    if (stat.size > MAX_FP_BYTES) {
      return { status: 'mismatch', expected, actual: null };           // suspiciously-large file = treat as tampered
    }
    const buf = Buffer.alloc(Math.min(stat.size, MAX_FP_BYTES));
    fs.readSync(fd, buf, 0, buf.length, 0);
    actualRaw = buf.toString('utf-8');
  } catch (e) {
    // v10 tests: catch readSync/fstatSync failures (EISDIR when fd is a
    // directory, EIO under disk corruption, etc.) and bucket as
    // 'unreadable' rather than letting them propagate as uncaught
    // exceptions that would crash the binary on every CLI invocation.
    const err = e as NodeJS.ErrnoException;
    process.stderr.write(`hoody: warning: ${fpPath} present but read failed (${err.code ?? err.message}); cannot verify install-time fingerprint.\n`);
    return { status: 'unreadable', expected, actual: null };
  } finally {
    try { fs.closeSync(fd); } catch { /* fd may already be closed */ }
  }
  const actual = actualRaw.trim().toLowerCase();
  if (actual.length === 0) return { status: 'absent', expected, actual: null };
  if (!/^[0-9a-f]{64}$/.test(actual)) {
    return { status: 'mismatch', expected, actual };
  }
  return { status: actual === expected ? 'ok' : 'mismatch', expected, actual };
}

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
export function lookupTrustedDomain(
  map: Record<string, DomainTrustEntry>,
  domain: string,
): DomainTrustEntry {
  if (!Object.prototype.hasOwnProperty.call(map, domain)) {
    const trusted = Object.keys(map).sort().join(', ');
    throw new DomainNotConfiguredError(
      `binary does not trust domain ${JSON.stringify(domain)}; trusted domains: ${trusted || '(none)'}`,
    );
  }
  return map[domain]!;
}

/**
 * Resolve the active domain. Throws DomainNotConfiguredError if nothing is
 * set anywhere; throws DomainInvalidError if a value is set but malformed.
 *
 * The fail-closed behavior is intentional: a binary running with no domain
 * set is a misconfiguration, and the caller should surface a clear "reinstall
 * via curl install.<domain>/install.sh | sh" message.
 */
export function selectDomain(opts: SelectDomainInputs = {}): string {
  const env = opts.env ?? process.env;

  // 1. CLI flag.
  if (typeof opts.flag === 'string' && opts.flag.length > 0) {
    return validateDomain(opts.flag);
  }

  // 2. HOODY_DOMAIN env var.
  const envDomain = env.HOODY_DOMAIN;
  if (typeof envDomain === 'string' && envDomain.length > 0) {
    return validateDomain(envDomain);
  }

  // 3. Config file.
  const filePath = configFilePath(opts);
  const fileDomain = readConfigFile(filePath);
  if (fileDomain) return fileDomain;

  // 4. Fail-closed.
  throw new DomainNotConfiguredError(
    `no domain configured (no --domain flag, no HOODY_DOMAIN env, no ${filePath}). ` +
    `Reinstall via: curl https://install.<your-domain>/install.sh | sh\n` +
    `Note: --domain must be placed BEFORE the subcommand (e.g. ` +
    `\`hoody --domain hoody.com update\`, NOT \`hoody update --domain hoody.com\`).`,
  );
}
