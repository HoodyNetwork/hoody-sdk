/**
 * Minisign signature verification — BLAKE2b-512 prehash + pure Ed25519.
 *
 * Implements the VERIFY side of jedisct1's minisign signature format:
 *   https://jedisct1.github.io/minisign/
 *
 * The signing side (producing `SHA256SUMS.minisig` + `channel.json.minisig`)
 * lives in hoody-cdn's deploy script. We only ever VERIFY here.
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
/** Clock-skew tolerance when validating `issued_at` against local time. */
export declare const ISSUED_AT_FUTURE_SKEW_SECONDS = 300;
export declare class MinisignVerificationError extends Error {
    constructor(message: string);
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
export declare function parsePublicKey(input: string): MinisignPubKey;
/** Parse a minisign signature file (4 lines). */
export declare function parseSignature(input: string): MinisignSignature;
/**
 * Verify a minisign signature over `message` using the supplied pubkey.
 * Throws MinisignVerificationError on any failure. Returns the parsed
 * trusted_comment string on success so callers can cross-check scope
 * (e.g. that the `version=X.Y.Z` inside matches the expected release).
 */
export declare function verifyMessage(message: Uint8Array, sig: MinisignSignature, pub: MinisignPubKey): string;
/**
 * Extract `version=<semver>` from a trusted_comment string. Throws if the
 * pattern is absent or malformed. The returned string is fed into a semver
 * library by the caller; we do not validate semver here.
 */
export declare function extractVersionFromTrustedComment(trustedComment: string): string;
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
export declare function validateFreshness(issuedAtIso: string | undefined, notAfterIso: string | undefined, nowMs?: number): void;
