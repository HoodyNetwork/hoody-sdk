/**
 * SSH Key Helpers
 *
 * Modern SSH key utilities centered on Ed25519.
 *
 * - `generateEd25519SshKeyPair()` uses pure-JS Ed25519 (tweetnacl).
 * - `formatEd25519SshPublicKey()` is crypto-free and can run in plain HTML contexts.
 *
 * SSH wire format reference (RFC 4253 Section 6.6):
 *   An SSH public key blob is a sequence of length-prefixed strings:
 *
 *     [uint32 len]["ssh-ed25519"][uint32 len][32-byte raw public key]
 *
 *   Each field is preceded by a big-endian uint32 giving its byte length.
 *   The OpenSSH one-line format is: `ssh-ed25519 <base64(keyBlob)> [comment]`
 *
 * Ed25519 secret key layout (NaCl/tweetnacl convention):
 *   The 64-byte secretKey is `seed (32 bytes) || publicKey (32 bytes)`.
 *   The first 32 bytes are the private seed; the last 32 are a copy of the
 *   public key, appended for signing convenience.
 */
declare const SSH_ED25519_ALGORITHM = "ssh-ed25519";
export type SshPublicKeyInput = Uint8Array | ArrayBuffer | ArrayBufferView | string;
export type Ed25519SeedInput = Uint8Array | ArrayBuffer | ArrayBufferView | string;
export interface GenerateEd25519SshKeyPairOptions {
    /** Optional comment appended to the public key line */
    comment?: string;
    /**
     * Optional deterministic 32-byte seed.
     *
     * When provided, key generation does not require a random source.
     */
    seed?: Ed25519SeedInput;
    /**
     * Allow fallback to Math.random() when secure randomness is unavailable.
     * Use only for local testing/prototyping.
     */
    allowInsecureRandom?: boolean;
}
export interface GeneratedEd25519SshKeyPair {
    algorithm: typeof SSH_ED25519_ALGORITHM;
    /** OpenSSH public key format: `ssh-ed25519 AAAA... [comment]` */
    publicKey: string;
    /** Raw Ed25519 public key bytes (32 bytes) */
    publicKeyRaw: Uint8Array;
    /** Ed25519 private seed (32 bytes) */
    privateKeySeed: Uint8Array;
    /** Ed25519 private seed as base64 */
    privateKeySeedBase64: string;
    /** Ed25519 secret key (64 bytes) */
    privateKeySecret: Uint8Array;
    /** Ed25519 secret key as base64 */
    privateKeySecretBase64: string;
    /** How randomness was sourced */
    randomSource: 'seed' | 'secure-random' | 'insecure-random';
}
export interface ParsedEd25519SshPublicKey {
    algorithm: typeof SSH_ED25519_ALGORITHM;
    publicKeyRaw: Uint8Array;
    keyBlob: Uint8Array;
    comment?: string;
}
/**
 * Format a raw Ed25519 public key into OpenSSH public key line format.
 *
 * This function is crypto-free and works in non-HTTPS/plain HTML contexts.
 *
 * @param publicKey - Raw 32-byte key, base64 raw key, base64 SSH key blob, or full `ssh-ed25519 ...` line
 * @param comment - Optional comment appended to output
 */
export declare function formatEd25519SshPublicKey(publicKey: SshPublicKeyInput, comment?: string): string;
/**
 * Parse an OpenSSH Ed25519 public key line.
 */
export declare function parseEd25519SshPublicKey(publicKey: string): ParsedEd25519SshPublicKey;
/**
 * Generate a modern Ed25519 SSH key pair.
 *
 * Works in non-HTTPS contexts through pure-JS Ed25519 implementation.
 *
 * The returned `privateKeySecret` is 64 bytes following the NaCl convention:
 *   bytes [0..31]  = seed (the private scalar input)
 *   bytes [32..63] = copy of the public key
 * The `privateKeySeed` field extracts just the first 32-byte seed portion.
 */
export declare function generateEd25519SshKeyPair(options?: GenerateEd25519SshKeyPairOptions): GeneratedEd25519SshKeyPair;
export {};
