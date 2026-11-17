// crypto.ts encryptMany: many values under one password for an export. One salt, one
// derived key, a fresh iv per value; every output is the ordinary SDK envelope, so the existing decrypt (and the SDK's and
// the agent's, which derive from each envelope's own salt) reads it unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVELOPE, VaultCryptoError, decrypt, encryptMany } from './crypto';
import { agentPinned, goBomVector, sdkVectors } from './crypto.vectors';

beforeEach(() => {
  // happy-dom leaves isSecureContext undefined; a real Hub page is always a secure context.
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof VaultCryptoError ? e.kind : 'other:' + String(e);
  }
}

const PW = 'export-pw ✓';
const plain = [...sdkVectors.map((v) => v.plaintext), goBomVector.plaintext, agentPinned.plaintext, 'same', 'same'];

describe('encryptMany', () => {
  it('every output decrypts through the existing decrypt to its own value, in order', async () => {
    const out = await encryptMany(plain, PW);
    expect(out).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) expect(await decrypt(out[i] as string, PW)).toBe(plain[i]);
  });

  it('each output is the SDK envelope: the same fields in the same order, iter 600000, webcrypto labels', async () => {
    for (const env of await encryptMany(['a', ''], PW)) {
      const o = JSON.parse(env) as Record<string, unknown>;
      expect(Object.keys(o)).toEqual([...ENVELOPE.fields]);
      expect(o).toMatchObject({ _enc: 1, alg: ENVELOPE.alg, kdf: ENVELOPE.kdf, hash: ENVELOPE.hash, iter: 600_000, impl: 'webcrypto', rng: 'webcrypto' });
      expect(atob(o.salt as string)).toHaveLength(ENVELOPE.saltBytes);
      expect(atob(o.iv as string)).toHaveLength(ENVELOPE.ivBytes);
    }
  });

  it('one salt for the export, a different iv for every value (equal values give different ciphertexts)', async () => {
    const out = (await encryptMany(Array.from({ length: 64 }, () => 'same'), PW)).map((e) => JSON.parse(e) as Record<string, string>);
    expect(new Set(out.map((o) => o.salt)).size).toBe(1);
    expect(new Set(out.map((o) => o.iv)).size).toBe(64);
    expect(new Set(out.map((o) => o.ct)).size).toBe(64);
  });

  it('a second export gets a new salt', async () => {
    const [a] = await encryptMany(['x'], PW);
    const [b] = await encryptMany(['x'], PW);
    expect((JSON.parse(a as string) as { salt: string }).salt).not.toBe((JSON.parse(b as string) as { salt: string }).salt);
  });

  it('derives the key once, however many values', async () => {
    const derive = vi.spyOn(globalThis.crypto.subtle, 'deriveKey');
    await encryptMany(['a', 'b', 'c', 'd'], PW);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('a repeated random iv is drawn again, never reused', async () => {
    const real = globalThis.crypto;
    let call = 0;
    // salt, then the iv of value 0, then the same iv again for value 1 (forced), then a fresh one.
    const fixed = new Uint8Array(ENVELOPE.ivBytes).fill(7);
    const getRandomValues = (a: Uint8Array<ArrayBuffer>) => {
      call++;
      if (a.length === ENVELOPE.ivBytes && (call === 2 || call === 3)) {
        a.set(fixed);
        return a;
      }
      return real.getRandomValues(a);
    };
    vi.stubGlobal('crypto', { subtle: real.subtle, getRandomValues });
    const out = (await encryptMany(['a', 'b'], PW)).map((e) => JSON.parse(e) as Record<string, string>);
    expect(out[0]?.iv).not.toBe(out[1]?.iv);
    expect(await decrypt(JSON.stringify(out[1]), PW)).toBe('b');
  });

  it('nothing to encrypt derives nothing', async () => {
    const derive = vi.spyOn(globalThis.crypto.subtle, 'deriveKey');
    expect(await encryptMany([], PW)).toEqual([]);
    expect(derive).not.toHaveBeenCalled();
  });

  it('refuses outside a secure context, or without getRandomValues, with no output and no fallback', async () => {
    vi.stubGlobal('isSecureContext', false);
    expect(await kindOf(encryptMany(['x'], PW))).toBe('unavailable');
    vi.stubGlobal('isSecureContext', true);
    const random = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', { subtle: globalThis.crypto.subtle });
    expect(await kindOf(encryptMany(['x'], PW))).toBe('unavailable');
    expect(random).not.toHaveBeenCalled();
  });

  it('a WebCrypto failure is unavailable, and its error carries no value or password', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'encrypt').mockRejectedValue(new Error('secret-value ' + PW));
    let err: unknown;
    try {
      await encryptMany(['secret-value'], PW);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(VaultCryptoError);
    expect((err as VaultCryptoError).kind).toBe('unavailable');
    expect(String((err as Error).message)).not.toContain('secret-value');
    expect(String((err as Error).message)).not.toContain(PW);
  });
});
