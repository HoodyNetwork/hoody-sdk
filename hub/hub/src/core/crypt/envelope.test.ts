// envelope.test.ts: sealing over real WebCrypto; the AAD binds every slot field even under one slot key.
import { describe, expect, it } from 'vitest';
import { asEnvelope, deriveSlotKey, newBaseKey, newKeyId, seal, unseal, type Slot } from './envelope';

const A: Slot = { account: 'u1', part: 'aaaaaaaaaaaaaaaaaaaaaaa1', key: 'hub_boards_v1' };

describe('envelope', () => {
  it('round trip; the envelope is {v, k, iv, ct} only, with a 96-bit IV, and holds no plaintext', async () => {
    const base = await newBaseKey(), id = newKeyId();
    const k = await deriveSlotKey(base, A);
    const e = await seal(k, A, id, '{"name":"Ops"}');
    expect(Object.keys(e).sort()).toEqual(['ct', 'iv', 'k', 'v']);
    expect(atob(e.iv)).toHaveLength(12);
    expect(JSON.stringify(e)).not.toContain('Ops');
    expect(asEnvelope(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(await unseal(k, A, e)).toBe('{"name":"Ops"}');
  });

  it('with the same slot key, a different account, part, pref key or key id in the AAD does not open', async () => {
    const base = await newBaseKey(), id = newKeyId();
    const k = await deriveSlotKey(base, A);
    const e = await seal(k, A, id, '1');
    expect(await unseal(k, { ...A, account: 'u2' }, e)).toBeNull();
    expect(await unseal(k, { ...A, part: 'all' }, e)).toBeNull();
    expect(await unseal(k, { ...A, key: 'hub_home_v1' }, e)).toBeNull();
    expect(await unseal(k, A, { ...e, k: newKeyId() })).toBeNull();
  });

  it('each slot derives its own key: another slot, or another base key, does not open', async () => {
    const base = await newBaseKey(), id = newKeyId();
    const e = await seal(await deriveSlotKey(base, A), A, id, '1');
    expect(await unseal(await deriveSlotKey(base, { ...A, part: 'all' }), A, e)).toBeNull();
    expect(await unseal(await deriveSlotKey(await newBaseKey(), A), A, e)).toBeNull();
  });

  it('slot keys are non-extractable, and malformed envelopes are not envelopes', async () => {
    const k = await deriveSlotKey(await newBaseKey(), A);
    expect(k.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', k)).rejects.toBeTruthy();
    const e = await seal(k, A, newKeyId(), '1');
    for (const bad of [null, [], { ...e, x: 1 }, { ...e, v: 2 }, { ...e, k: 'short' }, { ...e, iv: btoa('12345678901') }, { ...e, ct: 'not base64!' }]) {
      expect(asEnvelope(bad)).toBeNull();
    }
  });
});
