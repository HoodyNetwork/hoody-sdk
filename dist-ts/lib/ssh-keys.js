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
import nacl from 'tweetnacl';
const SSH_ED25519_ALGORITHM = 'ssh-ed25519';
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SECRET_KEY_BYTES = 64;
function toUint8Array(input) {
    if (typeof input === 'string') {
        throw new Error('String input must be parsed separately');
    }
    if (input instanceof Uint8Array) {
        return input;
    }
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return new Uint8Array(input);
}
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
function fromBase64(value) {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(value, 'base64'));
    }
    const binary = atob(value);
    const output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        output[i] = binary.charCodeAt(i);
    }
    return output;
}
function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }
    return output;
}
function encodeUint32BE(value) {
    const out = new Uint8Array(4);
    const view = new DataView(out.buffer);
    view.setUint32(0, value, false);
    return out;
}
function encodeSshString(bytes) {
    return concatBytes([encodeUint32BE(bytes.length), bytes]);
}
function readUint32BE(buffer, offset) {
    if (offset + 4 > buffer.length) {
        throw new Error('Invalid SSH key blob: truncated length field');
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    return view.getUint32(0, false);
}
function readSshString(buffer, offset) {
    const length = readUint32BE(buffer, offset);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > buffer.length) {
        throw new Error('Invalid SSH key blob: truncated string value');
    }
    return {
        value: buffer.slice(valueStart, valueEnd),
        nextOffset: valueEnd,
    };
}
/**
 * Encode a raw 32-byte Ed25519 public key into the SSH wire-format key blob.
 *
 * Output layout:
 *   [uint32 11]["ssh-ed25519"][uint32 32][<32 raw key bytes>]
 *
 * This blob is then base64-encoded when producing the OpenSSH one-line format.
 */
function buildEd25519KeyBlob(publicKeyRaw) {
    if (publicKeyRaw.length !== ED25519_PUBLIC_KEY_BYTES) {
        throw new Error(`Ed25519 public key must be ${ED25519_PUBLIC_KEY_BYTES} bytes`);
    }
    const encoder = new TextEncoder();
    const algorithmBytes = encoder.encode(SSH_ED25519_ALGORITHM);
    return concatBytes([
        encodeSshString(algorithmBytes),
        encodeSshString(publicKeyRaw),
    ]);
}
/**
 * Decode an SSH wire-format key blob back into the raw 32-byte Ed25519 public key.
 *
 * Reads two length-prefixed strings from the blob:
 *  1. Algorithm identifier (must be "ssh-ed25519")
 *  2. Raw public key bytes (must be exactly 32 bytes)
 *
 * Rejects blobs with trailing bytes or mismatched algorithm.
 */
function parseEd25519KeyBlob(keyBlob) {
    const decoder = new TextDecoder();
    let offset = 0;
    const algorithmField = readSshString(keyBlob, offset);
    offset = algorithmField.nextOffset;
    const algorithm = decoder.decode(algorithmField.value);
    if (algorithm !== SSH_ED25519_ALGORITHM) {
        throw new Error(`Unsupported SSH public key algorithm: ${algorithm}`);
    }
    const keyField = readSshString(keyBlob, offset);
    offset = keyField.nextOffset;
    if (offset !== keyBlob.length) {
        throw new Error('Invalid SSH key blob: unexpected trailing bytes');
    }
    if (keyField.value.length !== ED25519_PUBLIC_KEY_BYTES) {
        throw new Error(`Invalid Ed25519 public key length: ${keyField.value.length}`);
    }
    return keyField.value;
}
/**
 * Normalize any supported Ed25519 public key representation into raw 32 bytes.
 *
 * Detection order for string inputs:
 *  1. Full OpenSSH line format: starts with "ssh-ed25519 " -> parse the SSH blob
 *  2. Other SSH algorithm prefixes (e.g. "ssh-rsa"): reject with descriptive error
 *  3. Base64 string: decode and check length
 *     a. If decoded length == 32: treat as raw key bytes
 *     b. Otherwise: treat as a base64-encoded SSH key blob and parse it
 *
 * For binary inputs (Uint8Array/ArrayBuffer): must be exactly 32 bytes.
 */
function normalizeEd25519PublicKey(input) {
    if (typeof input !== 'string') {
        const raw = toUint8Array(input);
        if (raw.length !== ED25519_PUBLIC_KEY_BYTES) {
            throw new Error(`Ed25519 public key must be ${ED25519_PUBLIC_KEY_BYTES} bytes`);
        }
        return raw;
    }
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('Public key input cannot be empty');
    }
    if (trimmed.startsWith(`${SSH_ED25519_ALGORITHM} `)) {
        return parseEd25519SshPublicKey(trimmed).publicKeyRaw;
    }
    if (trimmed.startsWith('ssh-')) {
        throw new Error(`Unsupported SSH key format "${trimmed.split(/\s+/, 1)[0]}". Expected "${SSH_ED25519_ALGORITHM}".`);
    }
    const decoded = fromBase64(trimmed);
    if (decoded.length === ED25519_PUBLIC_KEY_BYTES) {
        return decoded;
    }
    return parseEd25519KeyBlob(decoded);
}
function normalizeSeed(seed) {
    let bytes;
    if (typeof seed === 'string') {
        bytes = fromBase64(seed.trim());
    }
    else {
        bytes = toUint8Array(seed);
    }
    if (bytes.length !== ED25519_PUBLIC_KEY_BYTES) {
        throw new Error(`Ed25519 seed must be ${ED25519_PUBLIC_KEY_BYTES} bytes`);
    }
    return bytes;
}
function generateInsecureSeed() {
    const seed = new Uint8Array(ED25519_PUBLIC_KEY_BYTES);
    for (let i = 0; i < seed.length; i++) {
        seed[i] = Math.floor(Math.random() * 256);
    }
    return seed;
}
/**
 * Create an Ed25519 signing key pair via tweetnacl with a three-tier generation strategy:
 *
 *  1. Deterministic seed: if `options.seed` is provided, derive the key pair from it
 *     (no random source required, useful for reproducible testing).
 *  2. Secure random: call `nacl.sign.keyPair()` which uses the platform's CSPRNG
 *     (crypto.getRandomValues / Node crypto.randomBytes). This is the default path.
 *  3. Insecure fallback: if secure random throws (e.g. non-HTTPS browser context)
 *     AND `allowInsecureRandom` is true, generate a seed via Math.random().
 *     This path is for local dev/prototyping only.
 *
 * Returns the NaCl key pair plus a tag indicating which random source was used.
 */
function createEd25519KeyPair(options) {
    if (options.seed) {
        return {
            pair: nacl.sign.keyPair.fromSeed(normalizeSeed(options.seed)),
            randomSource: 'seed',
        };
    }
    try {
        return {
            pair: nacl.sign.keyPair(),
            randomSource: 'secure-random',
        };
    }
    catch (error) {
        if (options.allowInsecureRandom) {
            return {
                pair: nacl.sign.keyPair.fromSeed(generateInsecureSeed()),
                randomSource: 'insecure-random',
            };
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to generate key pair without secure randomness: ${message}. ` +
            'Provide a 32-byte seed or set allowInsecureRandom=true for non-production usage.');
    }
}
/**
 * Format a raw Ed25519 public key into OpenSSH public key line format.
 *
 * This function is crypto-free and works in non-HTTPS/plain HTML contexts.
 *
 * @param publicKey - Raw 32-byte key, base64 raw key, base64 SSH key blob, or full `ssh-ed25519 ...` line
 * @param comment - Optional comment appended to output
 */
export function formatEd25519SshPublicKey(publicKey, comment) {
    const publicKeyRaw = normalizeEd25519PublicKey(publicKey);
    const keyBlob = buildEd25519KeyBlob(publicKeyRaw);
    const normalizedComment = comment?.trim();
    return normalizedComment
        ? `${SSH_ED25519_ALGORITHM} ${toBase64(keyBlob)} ${normalizedComment}`
        : `${SSH_ED25519_ALGORITHM} ${toBase64(keyBlob)}`;
}
/**
 * Parse an OpenSSH Ed25519 public key line.
 */
export function parseEd25519SshPublicKey(publicKey) {
    const trimmed = publicKey.trim();
    const match = trimmed.match(/^(\S+)\s+(\S+)(?:\s+(.+))?$/);
    if (!match) {
        throw new Error('Invalid SSH public key format');
    }
    const algorithm = match[1];
    const blobBase64 = match[2];
    const comment = match[3]?.trim();
    if (!algorithm || algorithm !== SSH_ED25519_ALGORITHM) {
        throw new Error(`Unsupported SSH public key algorithm: ${algorithm}`);
    }
    if (!blobBase64) {
        throw new Error('Invalid SSH public key format');
    }
    const keyBlob = fromBase64(blobBase64);
    const publicKeyRaw = parseEd25519KeyBlob(keyBlob);
    const parsed = {
        algorithm: SSH_ED25519_ALGORITHM,
        publicKeyRaw,
        keyBlob,
    };
    if (comment) {
        parsed.comment = comment;
    }
    return parsed;
}
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
export function generateEd25519SshKeyPair(options = {}) {
    const { pair, randomSource } = createEd25519KeyPair(options);
    const publicRaw = new Uint8Array(pair.publicKey);
    const privateKeySecret = new Uint8Array(pair.secretKey);
    if (privateKeySecret.length !== ED25519_SECRET_KEY_BYTES) {
        throw new Error(`Unexpected Ed25519 secret key length: ${privateKeySecret.length}`);
    }
    const privateKeySeed = privateKeySecret.slice(0, ED25519_PUBLIC_KEY_BYTES);
    const publicKey = formatEd25519SshPublicKey(publicRaw, options.comment);
    return {
        algorithm: SSH_ED25519_ALGORITHM,
        publicKey,
        publicKeyRaw: publicRaw,
        privateKeySeed,
        privateKeySeedBase64: toBase64(privateKeySeed),
        privateKeySecret,
        privateKeySecretBase64: toBase64(privateKeySecret),
        randomSource,
    };
}
