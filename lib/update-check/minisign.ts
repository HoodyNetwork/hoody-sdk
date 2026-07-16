/**
 * Minisign signature verification — BLAKE2b-512 prehash + pure Ed25519.
 *
 * Implements the VERIFY side of jedisct1's minisign signature format:
 *   https://jedisct1.github.io/minisign/
 *
 * The signing side (producing `SHA256SUMS.minisig` + `channel.json.minisig`)
 * is produced by the Hoody release signing process. We only ever VERIFY here.
 *
 * Signature file (4 lines):
 *   untrusted comment: signature from minisign secret key
 *   <base64 main_record>         ← 74 bytes: algo(2="ED") || key_id(8) || sig(64)
 *   trusted comment: hoody-cdn bin version=1.3.0
 *   <base64 global_signature>    ← 64 bytes: Ed25519 sig over (main_sig_64 || trusted_comment_utf8)
 *
 * Public key file (2 lines):
 *   untrusted comment: minisign public key ABCD1234
 *   <base64 pubkey_record>       ← 42 bytes: algo(2="Ed") || key_id(8) || pubkey(32)
 *
 * Algorithm bytes (critical — easy to get wrong):
 *   - Public key: always "Ed" (0x45 0x64)
 *   - Signature: "ED" (0x45 0x44) for prehashed Ed25519 (what we accept)
 *     vs "Ed" (0x45 0x64) for legacy pure Ed25519 (rejected — never signed this way)
 *
 * Verification flow:
 *   1. Parse pubkey → require algo == "Ed"
 *   2. Parse sig → require algo == "ED"
 *   3. Key-ID match between sig and pubkey
 *   4. digest = BLAKE2b-512(message)
 *   5. ed25519.verify(main_sig, digest, pubkey_material)
 *   6. ed25519.verify(global_sig, main_sig || trusted_comment_utf8, pubkey_material)
 *   7. Parse trusted_comment, extract version=X.Y.Z, assert matches channel.latest
 *   8. Freshness: validate issued_at/not_after ordering + not_after > now
 */

import nacl from 'tweetnacl';
import { blake2b } from '@noble/hashes/blake2.js';

/** Clock-skew tolerance when validating `issued_at` against local time. */
export const ISSUED_AT_FUTURE_SKEW_SECONDS = 300;

/** Expected byte length of a decoded minisign public key record. */
const PUBKEY_LENGTH = 42;

/** Expected byte length of a decoded minisign main signature record. */
const MAIN_RECORD_LENGTH = 74;

/** Expected byte length of the global signature (Ed25519 raw sig). */
const GLOBAL_SIG_LENGTH = 64;

/** Expected byte length of the pure Ed25519 signature inside main_record. */
const MAIN_SIG_LENGTH = 64;

/** Prehashed-Ed25519 algo bytes: 'E', 'D' — minisign `-H` / default. */
const SIG_ALGO_PREHASHED = [0x45, 0x44] as const;

/** Legacy pure-Ed25519 algo bytes: 'E', 'd' — rejected on signatures. */
const SIG_ALGO_LEGACY_PURE = [0x45, 0x64] as const;

/** Pubkey algo bytes: always 'E', 'd' — any other value is a hard error. */
const PUBKEY_ALGO = [0x45, 0x64] as const;

export class MinisignVerificationError extends Error {
  constructor(message: string) {
    super(`minisign verification: ${message}`);
    this.name = 'MinisignVerificationError';
  }
}

export interface MinisignPubKey {
  /** 8-byte key identifier. */
  keyId: Uint8Array;
  /** 32-byte Ed25519 public key material. */
  pubkey: Uint8Array;
}

export interface MinisignSignature {
  /** 8-byte key identifier from the signature record. */
  keyId: Uint8Array;
  /** 64-byte Ed25519 signature over BLAKE2b-512(message). */
  mainSig: Uint8Array;
  /** Plain-text trusted comment (without the `"trusted comment: "` prefix). */
  trustedComment: string;
  /** 64-byte Ed25519 signature over `mainSig || trusted_comment_utf8`. */
  globalSig: Uint8Array;
}

/** Parse a base64-encoded minisign public-key BLOB (single line, no comment).
 *  Accepts either the full file body (2 lines) or just the base64 line. */
export function parsePublicKey(input: string): MinisignPubKey {
  const line = extractBase64Line(input, /^(?:untrusted comment:|$)/m);
  const bytes = tryBase64Decode(line, 'public key');
  if (bytes.length !== PUBKEY_LENGTH) {
    throw new MinisignVerificationError(
      `pubkey record must be ${PUBKEY_LENGTH} bytes, got ${bytes.length}`
    );
  }
  if (bytes[0] !== PUBKEY_ALGO[0] || bytes[1] !== PUBKEY_ALGO[1]) {
    throw new MinisignVerificationError(
      `pubkey algo bytes must be "Ed" (0x45 0x64), got 0x${toHex(bytes[0]!)} 0x${toHex(bytes[1]!)}`
    );
  }
  return {
    keyId: bytes.subarray(2, 10),
    pubkey: bytes.subarray(10, 42),
  };
}

/** Parse a minisign signature file (4 lines). */
export function parseSignature(input: string): MinisignSignature {
  // Normalize line endings; strip trailing newlines but preserve internal.
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  // Trim trailing empty lines.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  if (lines.length !== 4) {
    throw new MinisignVerificationError(
      `signature file must have exactly 4 non-empty lines, got ${lines.length}`
    );
  }
  const [untrustedLine, mainB64, trustedLine, globalB64] = lines as [
    string, string, string, string,
  ];
  if (!/^untrusted comment:/i.test(untrustedLine)) {
    throw new MinisignVerificationError(
      `line 1 must start with "untrusted comment:", got: ${untrustedLine.slice(0, 40)}`
    );
  }
  if (!/^trusted comment:/i.test(trustedLine)) {
    throw new MinisignVerificationError(
      `line 3 must start with "trusted comment:", got: ${trustedLine.slice(0, 40)}`
    );
  }

  const mainRecord = tryBase64Decode(mainB64, 'main signature record');
  if (mainRecord.length !== MAIN_RECORD_LENGTH) {
    throw new MinisignVerificationError(
      `main record must be ${MAIN_RECORD_LENGTH} bytes, got ${mainRecord.length}`
    );
  }
  // Reject legacy pure Ed25519 signatures explicitly — we never sign that way.
  if (mainRecord[0] === SIG_ALGO_LEGACY_PURE[0] && mainRecord[1] === SIG_ALGO_LEGACY_PURE[1]) {
    throw new MinisignVerificationError(
      `signature uses legacy pure Ed25519 ("Ed"); only prehashed ("ED") is accepted`
    );
  }
  if (mainRecord[0] !== SIG_ALGO_PREHASHED[0] || mainRecord[1] !== SIG_ALGO_PREHASHED[1]) {
    throw new MinisignVerificationError(
      `signature algo bytes must be "ED" (0x45 0x44), got 0x${toHex(mainRecord[0]!)} 0x${toHex(mainRecord[1]!)}`
    );
  }

  const globalSig = tryBase64Decode(globalB64, 'global signature');
  if (globalSig.length !== GLOBAL_SIG_LENGTH) {
    throw new MinisignVerificationError(
      `global signature must be ${GLOBAL_SIG_LENGTH} bytes, got ${globalSig.length}`
    );
  }

  // Strip the "trusted comment: " prefix; keep the remainder EXACTLY as
  // the signer saw it (no trailing whitespace trim — it's part of the
  // signed bytes).
  const trustedComment = trustedLine.replace(/^trusted comment:\s?/i, '');

  return {
    keyId: mainRecord.subarray(2, 10),
    mainSig: mainRecord.subarray(10, 74),
    trustedComment,
    globalSig,
  };
}

/**
 * Verify a minisign signature over `message` using the supplied pubkey.
 * Throws MinisignVerificationError on any failure. Returns the parsed
 * trusted_comment string on success so callers can cross-check scope
 * (e.g. that the `version=X.Y.Z` inside matches the expected release).
 */
export function verifyMessage(
  message: Uint8Array,
  sig: MinisignSignature,
  pub: MinisignPubKey,
): string {
  // 1. Key-ID must match between signature and pubkey.
  if (!bytesEqual(sig.keyId, pub.keyId)) {
    throw new MinisignVerificationError(
      `key-id mismatch: sig=${toHexBytes(sig.keyId)} pub=${toHexBytes(pub.keyId)}`
    );
  }

  // 2. Main signature: verify against BLAKE2b-512(message).
  const digest = blake2b(message, { dkLen: 64 });
  if (!nacl.sign.detached.verify(digest, sig.mainSig, pub.pubkey)) {
    throw new MinisignVerificationError('main signature failed Ed25519 verification');
  }

  // 3. Global signature: verify over (mainSig || trusted_comment_utf8).
  //    NOT the full 74-byte main_record — just the 64-byte signature.
  const trustedBytes = new TextEncoder().encode(sig.trustedComment);
  const globalInput = new Uint8Array(MAIN_SIG_LENGTH + trustedBytes.length);
  globalInput.set(sig.mainSig, 0);
  globalInput.set(trustedBytes, MAIN_SIG_LENGTH);
  if (!nacl.sign.detached.verify(globalInput, sig.globalSig, pub.pubkey)) {
    throw new MinisignVerificationError('global signature failed Ed25519 verification');
  }

  return sig.trustedComment;
}

/**
 * Extract `version=<semver>` from a trusted_comment string. Throws if the
 * pattern is absent or malformed. The returned string is fed into a semver
 * library by the caller; we do not validate semver here.
 */
export function extractVersionFromTrustedComment(trustedComment: string): string {
  const match = trustedComment.match(/\bversion=(\S+)/);
  if (!match) {
    throw new MinisignVerificationError(
      `trusted comment does not contain "version=X.Y.Z": ${JSON.stringify(trustedComment)}`
    );
  }
  return match[1]!;
}

/**
 * Validate channel-json freshness fields against the current wall-clock time.
 *
 * Throws MinisignVerificationError on any of:
 *   - issued_at or not_after missing / unparseable
 *   - issued_at in the future beyond ISSUED_AT_FUTURE_SKEW_SECONDS
 *   - not_after <= issued_at
 *   - now > not_after (expired)
 *
 * No max-validity-window cap: operator chooses `not_after`. Set it far in
 * the future (e.g. year 9999) for zero mandatory re-sign cadence.
 */
export function validateFreshness(
  issuedAtIso: string | undefined,
  notAfterIso: string | undefined,
  nowMs: number = Date.now(),
): void {
  // Treat empty / whitespace-only strings as "missing". `!undefined` is
  // true but `!""` is ALSO true — belt-and-suspenders: also trim + length.
  // Empty-string not_after would otherwise skip the check.
  const issuedClean = typeof issuedAtIso === 'string' ? issuedAtIso.trim() : '';
  const notAfterClean = typeof notAfterIso === 'string' ? notAfterIso.trim() : '';
  if (!issuedClean) throw new MinisignVerificationError('channel.json missing issued_at');
  if (!notAfterClean) throw new MinisignVerificationError('channel.json missing not_after');
  issuedAtIso = issuedClean;
  notAfterIso = notAfterClean;

  const issuedAt = Date.parse(issuedAtIso);
  const notAfter = Date.parse(notAfterIso);
  if (!Number.isFinite(issuedAt)) {
    throw new MinisignVerificationError(`issued_at is not a valid ISO timestamp: ${issuedAtIso}`);
  }
  if (!Number.isFinite(notAfter)) {
    throw new MinisignVerificationError(`not_after is not a valid ISO timestamp: ${notAfterIso}`);
  }

  if (issuedAt > nowMs + ISSUED_AT_FUTURE_SKEW_SECONDS * 1000) {
    throw new MinisignVerificationError(
      `issued_at is in the future (now=${new Date(nowMs).toISOString()}, issued_at=${issuedAtIso})`
    );
  }
  if (notAfter <= issuedAt) {
    throw new MinisignVerificationError(
      `not_after (${notAfterIso}) must be strictly after issued_at (${issuedAtIso})`
    );
  }
  if (nowMs > notAfter) {
    throw new MinisignVerificationError(
      `channel.json expired (not_after=${notAfterIso}, now=${new Date(nowMs).toISOString()})`
    );
  }
}

// ─── internal helpers ───────────────────────────────────────────────────────

function extractBase64Line(input: string, skipPattern: RegExp): string {
  const trimmed = input.trim();
  if (!trimmed.includes('\n')) return trimmed;
  const lines = trimmed.split('\n');
  for (const line of lines) {
    if (!skipPattern.test(line) && line.trim().length > 0) {
      return line.trim();
    }
  }
  throw new MinisignVerificationError('no base64 line found');
}

function tryBase64Decode(s: string, label: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  // Strict base64 shape: only A-Z, a-z, 0-9, +, /, =. Buffer.from('abc!', 'base64')
  // silently ignores the '!' and returns bytes — a trust-chain review must
  // reject garbage before decoding.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new MinisignVerificationError(`${label} is not valid base64: malformed characters or length`);
  }
  try {
    return Uint8Array.from(Buffer.from(clean, 'base64'));
  } catch (e) {
    throw new MinisignVerificationError(`${label} is not valid base64: ${(e as Error).message}`);
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function toHexBytes(b: Uint8Array): string {
  return Array.from(b, x => toHex(x)).join('');
}
