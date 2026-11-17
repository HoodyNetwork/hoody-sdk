// crypto.ts: the vault's client-side envelope (AES-256-GCM, key from PBKDF2-SHA-512), WebCrypto only.
//
// A pinned port of the SDK's lib/vault-crypto.ts (file sha256
// b5b7d107ba36729e148764c33b2dd5864f29262fd2972fe6989ce0e4829fea37), so values interoperate with the SDK,
// the CLI and the agent in both directions. Kept out of the port on purpose: the
// pure-JS backend, Node loading and the SDK's pseudo-random fallback. The only randomness is crypto.getRandomValues,
// in a secure context as the host answers it (hostEnv().secureContext: the browser's isSecureContext on the web, true
// in the terminal Hub); without them encrypt refuses ('unavailable').
// crypto.drift.test.ts reads the SDK file and fails when the constants below stop matching it; the vectors
// in crypto.vectors.ts come from the real SDK and Go encoders.
//
// Contract:
//   - encrypt(plaintext, password) returns the SDK envelope JSON (same fields, same order, iter 600000,
//     32-byte salt, 12-byte iv, ct = ciphertext + 16-byte tag), with impl and rng 'webcrypto'.
//   - encryptMany(plaintexts, password) returns one such envelope per value, in order, sharing one salt and one key
//     derivation, each with its own iv (not part of the SDK port: an export of many values; any decrypt reads each alone).
//   - isValidEnvelope(value) is true only when decrypt's own structural checks pass (what a decrypt could open with the
//     right password); isEncrypted is the SDK's looser marker test and does not prove that.
//   - decrypt(envelope, password) checks the envelope as the SDK does, before any key is derived: JSON
//     object; _enc, salt, iv and ct present; _enc 1; base64 that decodes; salt >= 16 bytes, iv exactly 12,
//     ct not empty; iter defaults to 600000 when missing or null and must be an integer in
//     [100000, 10000000]. alg, kdf, hash, impl and rng are labels only and never change what is computed.
//     The plaintext is returned byte for byte, a leading U+FEFF included (the agent's Go decrypt keeps it; the SDK's
//     default TextDecoder drops it, a known SDK difference). Only a failed tag check is 'decrypt-failed'; a
//     WebCrypto that cannot run the operation is 'unavailable'.
//   - Errors are VaultCryptoError with a fixed kind and a fixed message; no value, password or envelope is
//     ever put in an error, a log or a string this file builds.
import { hostEnv } from '@core';

/** The envelope constants the port shares with the SDK (pinned by crypto.drift.test.ts). */
export const ENVELOPE = Object.freeze({
  version: 1,
  alg: 'AES-GCM-256',
  kdf: 'PBKDF2',
  hash: 'SHA-512',
  iter: 600_000,
  iterMin: 100_000,
  iterMax: 10_000_000,
  saltBytes: 32,
  minSaltBytes: 16,
  ivBytes: 12,
  keyBits: 256,
  fields: Object.freeze(['_enc', 'alg', 'kdf', 'hash', 'iter', 'salt', 'iv', 'ct', 'impl', 'rng'] as const),
});

export type VaultCryptoErrorKind = 'invalid-envelope' | 'unsupported-version' | 'invalid-kdf' | 'decrypt-failed' | 'unavailable';

const MESSAGES: Readonly<Record<VaultCryptoErrorKind, string>> = {
  'invalid-envelope': 'Not an encrypted value.',
  'unsupported-version': 'This value was encrypted with a newer format.',
  'invalid-kdf': 'This encrypted value asks for an unsafe key setting.',
  'decrypt-failed': 'Wrong password, or the value is damaged.',
  unavailable: 'This browser cannot encrypt or decrypt here (it needs a secure connection with built-in cryptography).',
};

export class VaultCryptoError extends Error {
  readonly kind: VaultCryptoErrorKind;
  constructor(kind: VaultCryptoErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'VaultCryptoError';
    this.kind = kind;
  }
}

export interface EncryptedEnvelope {
  _enc: number;
  alg?: string;
  kdf?: string;
  hash?: string;
  iter?: number | null;
  salt: string;
  iv: string;
  ct: string;
  impl?: string;
  rng?: string;
}

/** WebCrypto, or null. Encrypt also needs a secure context (the host's answer, HostEnv.secureContext) and getRandomValues
 *  (no other source exists here). */
function webCrypto(forEncrypt: boolean): Crypto | null {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const s = c?.subtle;
  if (!s || typeof s !== 'object' || ['importKey', 'deriveKey', 'encrypt', 'decrypt'].some((m) => typeof (s as unknown as Record<string, unknown>)[m] !== 'function')) return null;
  if (forEncrypt && (!hostEnv().secureContext || typeof c.getRandomValues !== 'function')) return null;
  return c;
}

/** Whether encrypt and encryptMany can run here (else they refuse 'unavailable'). */
export function canEncrypt(): boolean {
  return webCrypto(true) !== null;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(c: Crypto, password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: ENVELOPE.hash },
    material,
    { name: 'AES-GCM', length: ENVELOPE.keyBits },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a value with a password into the SDK envelope (see the contract). */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const c = webCrypto(true);
  if (!c) throw new VaultCryptoError('unavailable');
  const salt = new Uint8Array(ENVELOPE.saltBytes);
  const iv = new Uint8Array(ENVELOPE.ivBytes);
  let ct: Uint8Array;
  try {
    c.getRandomValues(salt);
    c.getRandomValues(iv);
    const key = await deriveKey(c, password, salt, ENVELOPE.iter);
    ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  } catch {
    throw new VaultCryptoError('unavailable');
  }
  const envelope: Required<Omit<EncryptedEnvelope, 'iter'>> & { iter: number } = {
    _enc: ENVELOPE.version,
    alg: ENVELOPE.alg,
    kdf: ENVELOPE.kdf,
    hash: ENVELOPE.hash,
    iter: ENVELOPE.iter,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
    impl: 'webcrypto',
    rng: 'webcrypto',
  };
  return JSON.stringify(envelope);
}

/**
 * Encrypts many values under one password (a vault export): one random salt, the key derived once, a fresh random iv
 * per value (a repeated iv is drawn again). Each output is the same SDK envelope encrypt makes, so every decrypt (this
 * file's, the SDK's, the agent's) reads it alone from its own salt. Refusals and errors as encrypt.
 */
export async function encryptMany(plaintexts: readonly string[], password: string): Promise<string[]> {
  if (plaintexts.length === 0) return [];
  const c = webCrypto(true);
  if (!c) throw new VaultCryptoError('unavailable');
  const salt = new Uint8Array(ENVELOPE.saltBytes);
  const out: string[] = [];
  try {
    c.getRandomValues(salt);
    const key = await deriveKey(c, password, salt, ENVELOPE.iter);
    const saltB64 = toBase64(salt);
    const ivs = new Set<string>();
    for (const plaintext of plaintexts) {
      const iv = new Uint8Array(ENVELOPE.ivBytes);
      let ivB64: string;
      do {
        c.getRandomValues(iv);
        ivB64 = toBase64(iv);
      } while (ivs.has(ivB64));
      ivs.add(ivB64);
      const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
      out.push(
        JSON.stringify({
          _enc: ENVELOPE.version,
          alg: ENVELOPE.alg,
          kdf: ENVELOPE.kdf,
          hash: ENVELOPE.hash,
          iter: ENVELOPE.iter,
          salt: saltB64,
          iv: ivB64,
          ct: toBase64(ct),
          impl: 'webcrypto',
          rng: 'webcrypto',
        }),
      );
    }
  } catch {
    throw new VaultCryptoError('unavailable');
  }
  return out;
}

interface Checked {
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ct: Uint8Array<ArrayBuffer>;
  readonly iter: number;
}

/** The SDK's decrypt checks, in its order, before anything is derived. */
function check(envelopeStr: string): Checked {
  let o: unknown;
  try {
    o = JSON.parse(envelopeStr);
  } catch {
    throw new VaultCryptoError('invalid-envelope');
  }
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new VaultCryptoError('invalid-envelope');
  const e = o as Record<string, unknown>;
  if (!e._enc || !e.salt || !e.iv || !e.ct) throw new VaultCryptoError('invalid-envelope');
  if (e._enc !== ENVELOPE.version) throw new VaultCryptoError('unsupported-version');
  if (typeof e.salt !== 'string' || typeof e.iv !== 'string' || typeof e.ct !== 'string') throw new VaultCryptoError('invalid-envelope');
  let salt: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let ct: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(e.salt);
    iv = fromBase64(e.iv);
    ct = fromBase64(e.ct);
  } catch {
    throw new VaultCryptoError('invalid-envelope');
  }
  if (salt.length < ENVELOPE.minSaltBytes || iv.length !== ENVELOPE.ivBytes || ct.length === 0) throw new VaultCryptoError('invalid-envelope');
  const iter = e.iter ?? ENVELOPE.iter;
  if (typeof iter !== 'number' || !Number.isInteger(iter) || iter < ENVELOPE.iterMin || iter > ENVELOPE.iterMax) throw new VaultCryptoError('invalid-kdf');
  return { salt, iv, ct, iter };
}

/** Decrypt an envelope with a password (see the contract). */
export async function decrypt(envelopeStr: string, password: string): Promise<string> {
  const { salt, iv, ct, iter } = check(envelopeStr);
  const c = webCrypto(false);
  if (!c) throw new VaultCryptoError('unavailable');
  let key: CryptoKey;
  try {
    key = await deriveKey(c, password, salt, iter);
  } catch {
    throw new VaultCryptoError('unavailable');
  }
  let plain: ArrayBuffer;
  try {
    plain = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch (e) {
    // A wrong password and damaged data both fail the tag check, which WebCrypto reports as OperationError.
    // Anything else (NotSupportedError, InvalidAccessError, …) is this browser, not the value.
    throw new VaultCryptoError((e as { name?: unknown } | null)?.name === 'OperationError' ? 'decrypt-failed' : 'unavailable');
  }
  // ignoreBOM keeps a leading U+FEFF, as the agent's Go decrypt does (the default decoder would drop it).
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(plain);
}

/** True when the value is an encrypted envelope (the SDK's rule: starts with '{', JSON, numeric _enc). */
export function isEncrypted(value: string): boolean {
  if (!value || !value.startsWith('{')) return false;
  try {
    const o = JSON.parse(value) as unknown;
    return o !== null && typeof o === 'object' && typeof (o as { _enc?: unknown })._enc === 'number';
  } catch {
    return false;
  }
}

/** True only when decrypt's structural checks pass (see the contract); never derives a key or throws. */
export function isValidEnvelope(value: string): boolean {
  try {
    check(value);
    return true;
  } catch {
    return false;
  }
}

/** The envelope's fields without decrypting; VaultCryptoError('invalid-envelope') for anything else. */
export function parseEnvelope(value: string): EncryptedEnvelope {
  let o: unknown;
  try {
    o = JSON.parse(value);
  } catch {
    throw new VaultCryptoError('invalid-envelope');
  }
  if (o === null || typeof o !== 'object' || typeof (o as { _enc?: unknown })._enc !== 'number') throw new VaultCryptoError('invalid-envelope');
  return o as EncryptedEnvelope;
}
