// crypt/envelope.ts: the WebCrypto half of the encrypted account preferences (cryptStore.ts holds the contract).
//
//   - A base key is 32 random bytes imported as a non-extractable HKDF key; the bytes are zeroed right after the
//     import, so only the CryptoKey object exists (kept in IndexedDB by crypt/vault.ts).
//   - Each slot (account, part, pref key) derives its own AES-256-GCM key: HKDF-SHA-256, salt = the context label,
//     info = [label, account, part, key]. One realm's or one setting's key never opens another's. part is '' for an
//     account-wide pref (a stored part is never empty), else the realm id ('all' included) or the computer id.
//   - AAD = [label, format version, account, part, key, key id]: an envelope copied to another slot, or
//     relabelled with another key id, fails to decrypt.
//   - The envelope is {v:1, k, iv, ct}: key id, a fresh 96-bit IV per write, ciphertext+tag, base64. Nothing else.
// Nothing here logs: keys, IVs and values never reach a log line.

export const LABEL = 'hoody-hub/prefs/v1';
export const FORMAT = 1;

export interface Slot {
  readonly account: string;
  /** '' for scope 'account'; the realm id ('all' included) or the computer id otherwise. */
  readonly part: string;
  readonly key: string;
}

export interface Envelope { readonly v: 1; readonly k: string; readonly iv: string; readonly ct: string }

const KEY_ID = /^[A-Za-z0-9_-]{22}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const utf8 = new TextEncoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('CRYPTO_UNAVAILABLE');
  return s;
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !B64.test(text)) return null;
  try {
    const s = atob(text), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch { return null; }
}

/** A fresh key id: 16 random bytes, base64url. */
export function newKeyId(): string {
  return toB64(globalThis.crypto.getRandomValues(new Uint8Array(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isKeyId(v: unknown): v is string { return typeof v === 'string' && KEY_ID.test(v); }

/** A new base key: non-extractable HKDF, usable only to derive. The random bytes are zeroed once imported. */
export async function newBaseKey(): Promise<CryptoKey> {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  try { return await subtle().importKey('raw', raw, 'HKDF', false, ['deriveKey']); } finally { raw.fill(0); }
}

const info = (s: Slot): Uint8Array<ArrayBuffer> => utf8.encode(JSON.stringify([LABEL, s.account, s.part, s.key]));
const aad = (s: Slot, keyId: string): Uint8Array<ArrayBuffer> => utf8.encode(JSON.stringify([LABEL, FORMAT, s.account, s.part, s.key, keyId]));

/** The slot's AES-GCM key under a base key: non-extractable. */
export function deriveSlotKey(base: CryptoKey, s: Slot): Promise<CryptoKey> {
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(LABEL), info: info(s) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** A stored value as an envelope; anything else (old plaintext, a foreign shape) is null. */
export function asEnvelope(v: unknown): Envelope | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const ks = Object.keys(o);
  if (ks.length !== 4 || o.v !== FORMAT || !isKeyId(o.k) || typeof o.iv !== 'string' || typeof o.ct !== 'string') return null;
  const iv = fromB64(o.iv), ct = fromB64(o.ct);
  if (!iv || iv.length !== 12 || !ct || ct.length < 16) return null;
  return { v: 1, k: o.k, iv: o.iv, ct: o.ct };
}

/** True when the value has the envelope's outer shape (v:1 plus k/iv/ct), valid or not: never old plaintext. */
export function looksSealed(v: unknown): boolean {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.v === FORMAT && 'k' in o && 'iv' in o && 'ct' in o;
}

/** JSON text of a value, sealed for its slot under key `keyId` with a fresh IV. */
export async function seal(slotKey: CryptoKey, s: Slot, keyId: string, text: string): Promise<Envelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(s, keyId), tagLength: 128 }, slotKey, utf8.encode(text)));
  return { v: 1, k: keyId, iv: toB64(iv), ct: toB64(ct) };
}

/** The JSON text inside an envelope, or null when it does not open for this slot (wrong slot, key, tamper). */
export async function unseal(slotKey: CryptoKey, s: Slot, e: Envelope): Promise<string | null> {
  const iv = fromB64(e.iv), ct = fromB64(e.ct);
  if (!iv || !ct) return null;
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aad(s, e.k), tagLength: 128 }, slotKey, ct);
    return new TextDecoder('utf-8', { fatal: true }).decode(pt);
  } catch { return null; }
}

/** SHA-256 of a string, base64: how the vault remembers which sign-in a rotation was made for. */
export async function digest(text: string): Promise<string> {
  return toB64(new Uint8Array(await subtle().digest('SHA-256', utf8.encode(text))));
}
