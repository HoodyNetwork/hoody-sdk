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
import { gcm } from '@noble/ciphers/aes.js';
import { rngChacha20 } from '@noble/ciphers/chacha.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha512 } from '@noble/hashes/sha2.js';
/**
 * Typed error class for vault-crypto failures. Parity with
 * LockCryptoError in cli/local-lock/crypto.ts so consumers can branch on
 * `err instanceof VaultCryptoError` (or the stable `.name` string) instead
 * of duck-typing against plain `Error` message strings.
 *
 * `cause` preserves the underlying backend error so a `.cause` chain stays
 * available for diagnostics without embedding it in the user-facing message.
 */
export class VaultCryptoError extends Error {
    kind;
    constructor(kind, message, options) {
        super(message, options);
        this.name = 'VaultCryptoError';
        this.kind = kind;
    }
}
const ALGORITHM = 'AES-GCM';
const ALGORITHM_LABEL = 'AES-GCM-256';
const KEY_BITS = 256;
const KEY_BYTES = KEY_BITS / 8;
/** 96-bit IV/nonce — NIST SP 800-38D mandates exactly 96 bits for GCM to avoid internal length-block hashing. */
const IV_BYTES = 12;
/** 256-bit salt — ensures KDF output is unique even for identical passwords. */
const SALT_BYTES = 32;
/**
 * PBKDF2 iteration count. 600,000 follows OWASP 2023 guidelines for SHA-512-based
 * PBKDF2 to resist offline brute-force on modern GPUs.
 */
const KDF_ITERATIONS = 600_000;
/**
 * Hard upper bound on `envelope.iter` accepted from untrusted envelopes.
 * Guards against DoS where a crafted envelope sets `iter: 1e15` and PBKDF2
 * stalls the process for minutes/hours.
 */
const KDF_ITERATIONS_MAX = 10_000_000;
const KDF_ITERATIONS_MIN = 100_000;
const KDF_HASH = 'SHA-512';
/** Envelope format version. Increment if the envelope schema changes in a breaking way. Currently 1. */
const FORMAT_VERSION = 1;
/** Ensures the pseudo-random fallback console.warn is only shown once per process. */
let insecureRandomWarningShown = false;
/** Persistent entropy pool for the pseudo-random fallback — updated after every use (forward secrecy). */
let fallbackEntropyPool = new Uint8Array(32);
/** Monotonic counter mixed into entropy collection to ensure each call produces unique material. */
let fallbackCounter = 0;
/**
 * Dynamically load Node.js `node:crypto` module at runtime.
 *
 * Uses `Function('require')` constructor trick to obtain `require` without
 * triggering static analysis in bundlers (webpack, esbuild, Vite). Bundlers
 * see `Function(...)` as opaque and skip the require, allowing the SDK to
 * ship as a browser bundle without node:crypto being included or erroring.
 * In Node.js at runtime, Function('require') returns the actual require function.
 */
function loadNodeCrypto() {
    try {
        // Prevent static require analysis in browser bundles.
        const loader = Function('try { return require; } catch { return null; }')();
        if (!loader)
            return null;
        return loader('node:crypto');
    }
    catch {
        return null;
    }
}
/**
 * Resolve SubtleCrypto from the runtime environment.
 *
 * Dual-path resolution:
 *   1. Browser / modern Node 19+: `globalThis.crypto.subtle` is available directly.
 *   2. Older Node (<19): load `node:crypto` dynamically and use its `.webcrypto.subtle`.
 * Returns null if neither path provides SubtleCrypto (triggers noble-js fallback).
 */
function tryGetSubtle() {
    if (typeof globalThis.crypto?.subtle !== 'undefined') {
        return globalThis.crypto.subtle;
    }
    const nodeCrypto = loadNodeCrypto();
    if (nodeCrypto?.webcrypto?.subtle) {
        return nodeCrypto.webcrypto.subtle;
    }
    return null;
}
/**
 * Fill a buffer with cryptographically random bytes using the best available source.
 *
 * Four-tier CSPRNG fallback cascade:
 *   1. globalThis.crypto.getRandomValues (browser, Deno, modern Node)
 *   2. node:crypto.webcrypto.getRandomValues (older Node with webcrypto shim)
 *   3. node:crypto.randomFillSync / randomBytes (traditional Node API)
 *   4. fillPseudoRandomBytes (ChaCha20-based PRNG seeded from best-effort entropy)
 *
 * Returns the `RandomSource` tag so the envelope records which tier was used.
 * Tier 4 emits a one-time console.warn to alert developers about weak randomness.
 */
function fillRandomBytes(buffer) {
    if (typeof globalThis.crypto?.getRandomValues !== 'undefined') {
        globalThis.crypto.getRandomValues(buffer);
        return 'webcrypto';
    }
    const nodeCrypto = loadNodeCrypto();
    if (nodeCrypto?.webcrypto?.getRandomValues) {
        nodeCrypto.webcrypto.getRandomValues(buffer);
        return 'node-crypto';
    }
    if (nodeCrypto?.randomFillSync) {
        nodeCrypto.randomFillSync(buffer);
        return 'node-crypto';
    }
    if (nodeCrypto?.randomBytes) {
        buffer.set(nodeCrypto.randomBytes(buffer.length));
        return 'node-crypto';
    }
    // Last-resort fallback for unsupported environments.
    // Still not cryptographically guaranteed, but stronger than raw Math.random() bytes.
    fillPseudoRandomBytes(buffer);
    if (!insecureRandomWarningShown && typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[hoody-sdk] vault-crypto is using pseudo-random fallback (no system CSPRNG available). ' +
            'Run in a secure context/runtime for strong cryptographic randomness.');
        insecureRandomWarningShown = true;
    }
    return 'pseudo-random';
}
/**
 * Convert Uint8Array to base64 string
 */
function toBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
/**
 * Convert base64 string to Uint8Array
 */
function fromBase64(b64) {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}
function encodeBigInt64(value) {
    const out = new Uint8Array(8);
    const view = new DataView(out.buffer);
    view.setBigUint64(0, BigInt.asUintN(64, value), false);
    return out;
}
/**
 * Collect best-effort entropy from all available environmental sources.
 *
 * Concatenates: Date.now, performance.now, process.hrtime, navigator fingerprint,
 * screen dimensions, location.href, 64 bytes of Math.random, the current
 * fallbackEntropyPool, and a monotonic counter. The resulting byte array is
 * then hashed by the caller (SHA-512) to produce a uniform seed.
 *
 * None of these sources are individually cryptographically strong, but their
 * combination raises the bar significantly above raw Math.random() for the
 * pseudo-random fallback tier.
 */
function collectBestEffortEntropy() {
    const chunks = [];
    const encoder = new TextEncoder();
    chunks.push(encodeBigInt64(BigInt(Date.now())));
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        chunks.push(encodeBigInt64(BigInt(Math.floor(performance.now() * 1000))));
    }
    if (typeof process !== 'undefined' &&
        typeof process.hrtime?.bigint === 'function') {
        chunks.push(encodeBigInt64(process.hrtime.bigint()));
    }
    if (typeof navigator !== 'undefined') {
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            String(navigator.hardwareConcurrency ?? ''),
            String(navigator.platform ?? ''),
        ].join('|');
        chunks.push(encoder.encode(fingerprint));
    }
    if (typeof screen !== 'undefined') {
        chunks.push(encoder.encode(`${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth}`));
    }
    if (typeof location !== 'undefined') {
        chunks.push(encoder.encode(`${location.href}|${location.origin}`));
    }
    const mathSample = new Uint8Array(64);
    for (let i = 0; i < mathSample.length; i++) {
        mathSample[i] = Math.floor(Math.random() * 256);
    }
    chunks.push(mathSample);
    chunks.push(fallbackEntropyPool);
    chunks.push(encodeBigInt64(BigInt(fallbackCounter++)));
    return concatBytes(chunks);
}
/**
 * Last-resort pseudo-random byte generator using a forward-secure hash chain.
 *
 * 1. Collect environmental entropy -> SHA-512 hash -> first 32 bytes = ChaCha20 seed.
 * 2. ChaCha20 stream cipher (via @noble/ciphers rngChacha20) generates the requested bytes.
 * 3. Update fallbackEntropyPool by hashing the old pool + remaining seed bytes + output +
 *    buffer length, ensuring forward secrecy: compromising the current state does not
 *    reveal previous outputs.
 */
function fillPseudoRandomBytes(buffer) {
    const seedMaterial = sha512(collectBestEffortEntropy());
    const seed = seedMaterial.slice(0, 32);
    const stream = rngChacha20(seed).randomBytes(buffer.length);
    buffer.set(stream);
    const poolUpdate = sha512(concatBytes([
        fallbackEntropyPool,
        seedMaterial.slice(32),
        stream,
        encodeBigInt64(BigInt(buffer.length)),
    ]));
    fallbackEntropyPool = poolUpdate.slice(0, 32);
}
/**
 * Derive an AES-256-GCM CryptoKey from a password using WebCrypto PBKDF2.
 *
 * The key is marked as non-extractable and usable only for encrypt/decrypt,
 * enforced by the WebCrypto API. This is the preferred backend when available
 * because the browser/OS can use hardware-accelerated AES-NI.
 */
async function deriveKeyWebCrypto(subtle, password, salt, iterations) {
    const keyMaterial = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({
        name: 'PBKDF2',
        salt: salt,
        iterations,
        hash: KDF_HASH,
    }, keyMaterial, { name: ALGORITHM, length: KEY_BITS }, false, ['encrypt', 'decrypt']);
}
/**
 * Derive a raw 32-byte AES key from a password using @noble/hashes PBKDF2-SHA-512.
 *
 * Pure-JS fallback — produces the same key bytes as deriveKeyWebCrypto given
 * identical inputs, ensuring cross-backend compatibility (encrypt with WebCrypto,
 * decrypt with noble, or vice versa).
 */
function deriveKeyNoble(password, salt, iterations) {
    return pbkdf2(sha512, new TextEncoder().encode(password), salt, {
        c: iterations,
        dkLen: KEY_BYTES,
    });
}
async function encryptWebCrypto(subtle, plaintext, password, salt, iv, iterations) {
    const key = await deriveKeyWebCrypto(subtle, password, salt, iterations);
    const ciphertextBuffer = await subtle.encrypt({ name: ALGORITHM, iv: iv }, key, new TextEncoder().encode(plaintext));
    return new Uint8Array(ciphertextBuffer);
}
function encryptNoble(plaintext, password, salt, iv, iterations) {
    const key = deriveKeyNoble(password, salt, iterations);
    return gcm(key, iv).encrypt(new TextEncoder().encode(plaintext));
}
async function decryptWebCrypto(subtle, ciphertext, password, salt, iv, iterations) {
    const key = await deriveKeyWebCrypto(subtle, password, salt, iterations);
    const plaintextBuffer = await subtle.decrypt({ name: ALGORITHM, iv: iv }, key, ciphertext);
    return new TextDecoder().decode(plaintextBuffer);
}
function decryptNoble(ciphertext, password, salt, iv, iterations) {
    const key = deriveKeyNoble(password, salt, iterations);
    const plaintext = gcm(key, iv).decrypt(ciphertext);
    return new TextDecoder().decode(plaintext);
}
function inferRngSource(...sources) {
    if (sources.includes('pseudo-random'))
        return 'pseudo-random';
    if (sources.includes('node-crypto'))
        return 'node-crypto';
    return 'webcrypto';
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
export async function encrypt(plaintext, password) {
    const salt = new Uint8Array(SALT_BYTES);
    const saltSource = fillRandomBytes(salt);
    const iv = new Uint8Array(IV_BYTES);
    const ivSource = fillRandomBytes(iv);
    const iterations = KDF_ITERATIONS;
    const subtle = tryGetSubtle();
    let backend = 'noble-js';
    let ciphertext;
    if (subtle) {
        try {
            ciphertext = await encryptWebCrypto(subtle, plaintext, password, salt, iv, iterations);
            backend = 'webcrypto';
        }
        catch {
            ciphertext = encryptNoble(plaintext, password, salt, iv, iterations);
            backend = 'noble-js';
        }
    }
    else {
        ciphertext = encryptNoble(plaintext, password, salt, iv, iterations);
        backend = 'noble-js';
    }
    const envelope = {
        _enc: FORMAT_VERSION,
        alg: ALGORITHM_LABEL,
        kdf: 'PBKDF2',
        hash: KDF_HASH,
        iter: iterations,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ct: toBase64(ciphertext),
        impl: backend,
        rng: inferRngSource(saltSource, ivSource),
    };
    return JSON.stringify(envelope);
}
/**
 * Decrypt an encrypted envelope string with a password.
 *
 * Strategy: respects the `impl` backend hint in the envelope (to avoid
 * unnecessary WebCrypto round-trips when the data was encrypted with noble),
 * but auto-falls back to the alternative backend if the preferred one throws.
 * This handles cross-environment scenarios (encrypted in browser, decrypted
 * in Node CLI, or vice versa).
 */
export async function decrypt(envelopeStr, password) {
    let envelope;
    try {
        envelope = JSON.parse(envelopeStr);
    }
    catch {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope (invalid JSON)');
    }
    if (!envelope._enc || !envelope.salt || !envelope.iv || !envelope.ct) {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope (missing required fields)');
    }
    if (envelope._enc !== FORMAT_VERSION) {
        throw new VaultCryptoError('unsupported-version', `Unsupported encryption format version: ${envelope._enc}`);
    }
    let salt;
    let iv;
    let ciphertext;
    try {
        salt = fromBase64(envelope.salt);
        iv = fromBase64(envelope.iv);
        ciphertext = fromBase64(envelope.ct);
    }
    catch {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope (malformed base64)');
    }
    // Expected sizes: salt 32B, iv 12B (AES-GCM standard). Lenient bases64 decoders
    // accept oversized/undersized inputs that would otherwise produce a weak key or
    // undefined decrypt behavior — reject explicitly.
    if (salt.length < 16 || iv.length !== 12 || ciphertext.length === 0) {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope (invalid salt/iv/ct length)');
    }
    let iterations = envelope.iter ?? KDF_ITERATIONS;
    if (!Number.isInteger(iterations) || iterations < KDF_ITERATIONS_MIN || iterations > KDF_ITERATIONS_MAX) {
        throw new VaultCryptoError('invalid-kdf', `Invalid PBKDF2 iteration count: ${iterations}`);
    }
    const subtle = tryGetSubtle();
    // Respect hint, but still auto-fallback across both backends.
    const preferNoble = envelope.impl === 'noble-js';
    // Capture the last backend error so the unified decrypt-failed
    // error exposes it via `cause` for diagnostics.
    let lastErr;
    try {
        if (preferNoble) {
            return decryptNoble(ciphertext, password, salt, iv, iterations);
        }
        if (!subtle) {
            return decryptNoble(ciphertext, password, salt, iv, iterations);
        }
        return await decryptWebCrypto(subtle, ciphertext, password, salt, iv, iterations);
    }
    catch (err) {
        lastErr = err;
        try {
            if (!preferNoble && subtle) {
                return decryptNoble(ciphertext, password, salt, iv, iterations);
            }
            if (subtle) {
                return await decryptWebCrypto(subtle, ciphertext, password, salt, iv, iterations);
            }
        }
        catch (fallbackErr) {
            lastErr = fallbackErr;
        }
    }
    throw new VaultCryptoError('decrypt-failed', 'Decryption failed: wrong password or corrupted data', { cause: lastErr });
}
/**
 * Check if a vault value string is an encrypted envelope
 */
export function isEncrypted(value) {
    if (!value || !value.startsWith('{'))
        return false;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed._enc === 'number';
    }
    catch {
        return false;
    }
}
/**
 * Parse an encrypted envelope to inspect its parameters (without decrypting)
 */
export function parseEnvelope(value) {
    // SyntaxError from JSON.parse is also an invalid-envelope failure
    // and should surface as a VaultCryptoError so consumers only need to catch
    // one class, not `VaultCryptoError || SyntaxError`.
    let envelope;
    try {
        envelope = JSON.parse(value);
    }
    catch (err) {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope (invalid JSON)', { cause: err });
    }
    if (envelope === null || typeof envelope !== 'object' || typeof envelope._enc !== 'number') {
        throw new VaultCryptoError('invalid-envelope', 'Value is not an encrypted envelope');
    }
    return envelope;
}
