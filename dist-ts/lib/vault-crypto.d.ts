/**
 * Vault Crypto — End-to-end client-side encryption for Hoody Vault.
 *
 * Architecture:
 *   Dual-backend design: tries WebCrypto (hardware-accelerated, browser/Node)
 *   first, falls back to pure-JS @noble/ciphers + @noble/hashes when
 *   SubtleCrypto is unavailable or throws. Both backends produce identical
 *   AES-256-GCM + PBKDF2-SHA-512 output and can cross-decrypt each other.
 *
 * Envelope format:
 *   encrypt() returns a self-contained JSON string (EncryptedEnvelope) that
 *   stores algorithm, KDF params, salt, IV, ciphertext, and optional hints
 *   (`impl`, `rng`). decrypt() reads this envelope, auto-selects backend,
 *   and falls back to the alternative if the preferred one fails.
 *
 * Random number generation:
 *   fillRandomBytes() cascades through four CSPRNG sources:
 *   globalThis.crypto -> node:crypto.webcrypto -> node:crypto.randomFillSync/randomBytes
 *   -> pseudo-random fallback (ChaCha20 seeded from best-effort entropy).
 *   The `RandomSource` field on the envelope records which source was used
 *   so consumers can audit randomness quality.
 *
 * The envelope format stays compatible across backends.
 */
/**
 * Typed error class for vault-crypto failures. Parity with
 * LockCryptoError in cli/local-lock/crypto.ts so consumers can branch on
 * `err instanceof VaultCryptoError` (or the stable `.name` string) instead
 * of duck-typing against plain `Error` message strings.
 *
 * `cause` preserves the underlying backend error so a `.cause` chain stays
 * available for diagnostics without embedding it in the user-facing message.
 */
export declare class VaultCryptoError extends Error {
    readonly kind: 'invalid-envelope' | 'unsupported-version' | 'invalid-kdf' | 'decrypt-failed';
    constructor(kind: VaultCryptoError['kind'], message: string, options?: {
        cause?: unknown;
    });
}
/** Which AES-GCM implementation was used: native WebCrypto or pure-JS @noble. */
type CryptoBackend = 'webcrypto' | 'noble-js';
/** Which CSPRNG source was used to generate salt/IV. Recorded in the envelope for audit. */
type RandomSource = 'webcrypto' | 'node-crypto' | 'pseudo-random';
/** Self-contained encrypted envelope stored as the vault value */
export interface EncryptedEnvelope {
    /** Format version (currently 1) */
    _enc: number;
    /** Encryption algorithm */
    alg: string;
    /** Key derivation function */
    kdf: string;
    /** KDF hash function */
    hash: string;
    /** KDF iteration count */
    iter: number;
    /** Salt (base64) */
    salt: string;
    /** IV / nonce (base64) */
    iv: string;
    /** Ciphertext (base64) */
    ct: string;
    /** Optional implementation backend hint */
    impl?: CryptoBackend;
    /** Optional randomness source hint */
    rng?: RandomSource;
}
/**
 * Encrypt a plaintext string with a password.
 *
 * Strategy: try-webcrypto-then-noble.
 *   1. Generate fresh random salt (SALT_BYTES) and IV (IV_BYTES).
 *   2. If SubtleCrypto is available, attempt WebCrypto encryption.
 *   3. If WebCrypto fails or is unavailable, fall back to @noble AES-GCM.
 *   4. Pack everything into a self-contained EncryptedEnvelope JSON string.
 *
 * The envelope contains all parameters needed for decryption (algorithm, KDF,
 * iterations, salt, IV, ciphertext) plus optional `impl` and `rng` hints.
 * This makes each encrypted value fully portable — no external key storage.
 */
export declare function encrypt(plaintext: string, password: string): Promise<string>;
/**
 * Decrypt an encrypted envelope string with a password.
 *
 * Strategy: respects the `impl` backend hint in the envelope (to avoid
 * unnecessary WebCrypto round-trips when the data was encrypted with noble),
 * but auto-falls back to the alternative backend if the preferred one throws.
 * This handles cross-environment scenarios (encrypted in browser, decrypted
 * in Node CLI, or vice versa).
 */
export declare function decrypt(envelopeStr: string, password: string): Promise<string>;
/**
 * Check if a vault value string is an encrypted envelope
 */
export declare function isEncrypted(value: string): boolean;
/**
 * Parse an encrypted envelope to inspect its parameters (without decrypting)
 */
export declare function parseEnvelope(value: string): EncryptedEnvelope;
export {};
