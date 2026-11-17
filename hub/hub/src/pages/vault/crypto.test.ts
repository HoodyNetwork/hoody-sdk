// crypto.ts: the vault envelope, interoperable with the SDK (lib/vault-crypto.ts), the CLI and the agent
// (its own vault crypto). Vectors come from the real SDK and Go encoders (crypto.vectors.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVELOPE, VaultCryptoError, decrypt, encrypt, isEncrypted, parseEnvelope } from './crypto';
import { agentPinned, goBomVector, goVectors, sdkVectors, type Vector } from './crypto.vectors';

beforeEach(() => {
  // happy-dom leaves isSecureContext undefined; a real Hub page is always a secure context.
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function edit(envelope: string, change: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(envelope) as Record<string, unknown>;
  change(o);
  return JSON.stringify(o);
}
async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof VaultCryptoError ? e.kind : 'other:' + String(e);
  }
}
const base = sdkVectors[0] as Vector;

describe('decrypts envelopes made elsewhere', () => {
  it.each(sdkVectors.map((v, i) => [i, v] as const))('SDK vector %i', async (_i, v) => {
    expect(await decrypt(v.envelope, v.password)).toBe(v.plaintext);
  });
  it.each(goVectors.map((v, i) => [i, v] as const))('Go vector %i', async (_i, v) => {
    expect(await decrypt(v.envelope, v.password)).toBe(v.plaintext);
  });
  it('the SDK fixture the agent pins', async () => {
    expect(await decrypt(agentPinned.envelope, agentPinned.password)).toBe(agentPinned.plaintext);
  });
  it('a Go value starting with U+FEFF keeps it, as Go does', async () => {
    const out = await decrypt(goBomVector.envelope, goBomVector.password);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe(goBomVector.plaintext);
  });
});

describe('encrypt', () => {
  it('makes the SDK envelope shape with the SDK defaults', async () => {
    const env = await encrypt('hello vault', 'pw-encrypt-shape');
    const o = JSON.parse(env) as Record<string, unknown>;
    expect(Object.keys(o)).toEqual(['_enc', 'alg', 'kdf', 'hash', 'iter', 'salt', 'iv', 'ct', 'impl', 'rng']);
    expect(o).toMatchObject({ _enc: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2', hash: 'SHA-512', iter: 600000, impl: 'webcrypto', rng: 'webcrypto' });
    expect(atob(o.salt as string)).toHaveLength(32);
    expect(atob(o.iv as string)).toHaveLength(12);
    // GCM appends a 16-byte tag.
    expect(atob(o.ct as string)).toHaveLength(new TextEncoder().encode('hello vault').length + 16);
    expect(await decrypt(env, 'pw-encrypt-shape')).toBe('hello vault');
  });
  it('a leading U+FEFF survives the round trip', async () => {
    const plain = '\ufeff\ufeffkept';
    expect(await decrypt(await encrypt(plain, 'pw'), 'pw')).toBe(plain);
  });
  it('round-trips the vector plaintexts (empty, unicode, long)', async () => {
    for (const v of sdkVectors) {
      const env = await encrypt(v.plaintext, v.password);
      expect(await decrypt(env, v.password)).toBe(v.plaintext);
    }
  });
  it('uses a fresh salt and iv every time', async () => {
    const a = JSON.parse(await encrypt('same', 'same-pw')) as Record<string, string>;
    const b = JSON.parse(await encrypt('same', 'same-pw')) as Record<string, string>;
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('no strong randomness, no encryption', () => {
  it('refuses outside a secure context', async () => {
    vi.stubGlobal('isSecureContext', false);
    expect(await kindOf(encrypt('x', 'pw'))).toBe('unavailable');
  });
  it('refuses without crypto.getRandomValues, and never falls back to anything else', async () => {
    const real = globalThis.crypto;
    const random = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', { subtle: real.subtle });
    expect(await kindOf(encrypt('x', 'pw'))).toBe('unavailable');
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
  it('refuses without crypto.subtle', async () => {
    const real = globalThis.crypto;
    const getRandomValues = vi.fn((a: Uint8Array<ArrayBuffer>) => real.getRandomValues(a));
    vi.stubGlobal('crypto', { getRandomValues });
    expect(await kindOf(encrypt('x', 'pw'))).toBe('unavailable');
    expect(getRandomValues).not.toHaveBeenCalled();
  });
  it('decrypt needs crypto.subtle too (unavailable, not "wrong password")', async () => {
    vi.stubGlobal('crypto', {});
    expect(await kindOf(decrypt(base.envelope, base.password))).toBe('unavailable');
  });
  it('a subtle without the methods it needs is unavailable', async () => {
    const real = globalThis.crypto;
    for (const missing of ['importKey', 'deriveKey', 'encrypt', 'decrypt'] as const) {
      const subtle = { importKey: real.subtle.importKey.bind(real.subtle), deriveKey: real.subtle.deriveKey.bind(real.subtle), encrypt: real.subtle.encrypt.bind(real.subtle), decrypt: real.subtle.decrypt.bind(real.subtle), [missing]: undefined };
      vi.stubGlobal('crypto', { subtle, getRandomValues: real.getRandomValues.bind(real) });
      expect(await kindOf(decrypt(base.envelope, base.password)), missing).toBe('unavailable');
      expect(await kindOf(encrypt('x', 'pw')), missing).toBe('unavailable');
    }
  });
  it.each(['NotSupportedError', 'InvalidAccessError', 'TypeError'])('a decrypt that fails with %s is unavailable, not "wrong password"', async (name) => {
    const real = globalThis.crypto;
    const fail = (): Promise<never> => Promise.reject(Object.assign(new Error('x'), { name }));
    const subtle = { importKey: real.subtle.importKey.bind(real.subtle), deriveKey: real.subtle.deriveKey.bind(real.subtle), encrypt: real.subtle.encrypt.bind(real.subtle), decrypt: fail };
    vi.stubGlobal('crypto', { subtle, getRandomValues: real.getRandomValues.bind(real) });
    expect(await kindOf(decrypt(base.envelope, base.password))).toBe('unavailable');
  });
  it('a decrypt that fails the tag check (OperationError) is a wrong password or damaged value', async () => {
    const real = globalThis.crypto;
    const fail = (): Promise<never> => Promise.reject(Object.assign(new Error('x'), { name: 'OperationError' }));
    const subtle = { importKey: real.subtle.importKey.bind(real.subtle), deriveKey: real.subtle.deriveKey.bind(real.subtle), encrypt: real.subtle.encrypt.bind(real.subtle), decrypt: fail };
    vi.stubGlobal('crypto', { subtle, getRandomValues: real.getRandomValues.bind(real) });
    expect(await kindOf(decrypt(base.envelope, base.password))).toBe('decrypt-failed');
  });
});

describe('decrypt checks, as the SDK and the agent do', () => {
  it('wrong password', async () => {
    expect(await kindOf(decrypt(base.envelope, base.password + '!'))).toBe('decrypt-failed');
  });
  it('a changed ciphertext byte', async () => {
    const env = edit(base.envelope, (o) => {
      const ct = atob(o.ct as string);
      o.ct = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
    });
    expect(await kindOf(decrypt(env, base.password))).toBe('decrypt-failed');
  });
  it('a changed salt or iv decrypts to nothing', async () => {
    const s = edit(base.envelope, (o) => { o.salt = btoa('\u0001'.repeat(32)); });
    const i = edit(base.envelope, (o) => { o.iv = btoa('\u0001'.repeat(12)); });
    expect(await kindOf(decrypt(s, base.password))).toBe('decrypt-failed');
    expect(await kindOf(decrypt(i, base.password))).toBe('decrypt-failed');
  });
  it.each([
    ['not JSON', 'not json'],
    ['missing _enc', edit(base.envelope, (o) => { delete o._enc; })],
    ['missing salt', edit(base.envelope, (o) => { delete o.salt; })],
    ['missing iv', edit(base.envelope, (o) => { delete o.iv; })],
    ['missing ct', edit(base.envelope, (o) => { delete o.ct; })],
    ['salt under 16 bytes', edit(base.envelope, (o) => { o.salt = btoa('s'.repeat(15)); })],
    ['iv of 11 bytes', edit(base.envelope, (o) => { o.iv = btoa('i'.repeat(11)); })],
    ['iv of 13 bytes', edit(base.envelope, (o) => { o.iv = btoa('i'.repeat(13)); })],
    ['malformed base64', edit(base.envelope, (o) => { o.ct = '***'; })],
    ['ct that decodes to nothing', edit(base.envelope, (o) => { o.ct = ' '; })],
  ])('%s is not an envelope', async (_label, env) => {
    expect(await kindOf(decrypt(env, base.password))).toBe('invalid-envelope');
  });
  it('a salt of 16 bytes is accepted as a shape (then fails as a wrong key)', async () => {
    const env = edit(base.envelope, (o) => { o.salt = btoa('s'.repeat(16)); });
    expect(await kindOf(decrypt(env, base.password))).toBe('decrypt-failed');
  });
  it('another format version', async () => {
    expect(await kindOf(decrypt(edit(base.envelope, (o) => { o._enc = 2; }), base.password))).toBe('unsupported-version');
  });
  it.each([
    ['99999', 99999],
    ['10000001', 10000001],
    ['a fraction', 600000.5],
    ['a string', '600000'],
    ['zero', 0],
    ['negative', -600000],
    ['huge', 1e15],
  ])('iteration count %s is refused before deriving', async (_label, iter) => {
    const derive = vi.spyOn(globalThis.crypto.subtle, 'deriveKey');
    expect(await kindOf(decrypt(edit(base.envelope, (o) => { o.iter = iter; }), base.password))).toBe('invalid-kdf');
    expect(derive).not.toHaveBeenCalled();
    derive.mockRestore();
  });
  it('the bounds themselves are accepted', async () => {
    for (const iter of [ENVELOPE.iterMin, ENVELOPE.iterMax]) {
      const v = edit(base.envelope, (o) => { o.iter = iter; });
      // Not the iteration the vector was made with, so the key is wrong: the count itself passed.
      expect(await kindOf(decrypt(v, base.password))).toBe('decrypt-failed');
    }
  });
  it('a missing or null iteration count means the SDK default (600000)', async () => {
    expect(await decrypt(edit(base.envelope, (o) => { delete o.iter; }), base.password)).toBe(base.plaintext);
    expect(await decrypt(edit(base.envelope, (o) => { o.iter = null; }), base.password)).toBe(base.plaintext);
  });
  it('the alg/kdf/hash/impl/rng labels never change what is computed', async () => {
    const env = edit(base.envelope, (o) => { o.alg = 'other'; o.kdf = 'other'; o.hash = 'SHA-1'; o.impl = 'noble-js'; o.rng = 'pseudo-random'; });
    expect(await decrypt(env, base.password)).toBe(base.plaintext);
  });
});

describe('isEncrypted and parseEnvelope', () => {
  it.each([
    ['{"_enc":1}', true],
    ['{"_enc":2,"x":1}', true],
    ['{"_enc":"1"}', false],
    ['{"enc":1}', false],
    [' {"_enc":1}', false],
    ['{not json', false],
    ['', false],
    ['plain value', false],
  ])('isEncrypted(%j) is %s', (value, want) => {
    expect(isEncrypted(value)).toBe(want);
  });
  it('isEncrypted is true for every vector', () => {
    for (const v of [...sdkVectors, ...goVectors, agentPinned]) expect(isEncrypted(v.envelope)).toBe(true);
  });
  it('parseEnvelope returns the fields and refuses anything else', () => {
    expect(parseEnvelope(base.envelope)).toMatchObject({ _enc: 1, iter: 600000 });
    for (const bad of ['x', 'null', '[]', '{"_enc":"1"}', '{}']) {
      expect(() => parseEnvelope(bad)).toThrow(VaultCryptoError);
    }
  });
});
