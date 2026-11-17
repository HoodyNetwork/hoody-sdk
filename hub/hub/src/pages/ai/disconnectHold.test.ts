// disconnectHold.ts: the hold of a disconnect whose outcome is unknown, on the lock of what it touches (a sign-in, or the
// provider's stored credential, which a key save takes too). The page's api sends each call to the computer
// shown at that moment, so every call of a disconnect (the removal, its read-back, Check again) goes to the computer the
// caller was shown or nowhere: a switch while the hold is taken sends nothing; a switch after the removal left never lets
// a read of the other computer settle the hold. A read that proves nothing (a list not read whole) never lets it go.
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { DISCONNECT_HOLD_BY, checkDisconnect, credentialLock, disconnectLock, heldDisconnectsAt, sendDisconnect, type HeldDisconnect } from './disconnectHold';
import type { Account } from './logic';
import { shownComputer } from './shownGate';
import type { Settled } from './types';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const KEYACC: Account = { id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const SIGNIN: Account = { ...KEYACC, via: 'signin' };
const ENDPOINT: Account = { id: 'my-endpoint', prefix: 'my-endpoint', label: 'My endpoint', ready: false, pay: 'unknown', custom: true, via: null, status: null };
const AT = { project: 'p1', computer: 'c1' };
const C1 = { project: { id: 'p1' }, container: { id: 'c1' } };
const C2 = { project: { id: 'p1' }, container: { id: 'c2' } };
const LOCK = () => disconnectLock(AT, KEYACC.id, 'key')!;

/** What GET auth shows: the key stays stored, and the sign-in signed in, until the removal lands. */
let stored = true;
let signedIn = true;
let signOuts = 0;
let deletes = 0;
let reads = 0;
/** The removal's answer: lost at once unless a test holds it. */
let answerDelete: () => Promise<Settled<unknown>>;
let api: Api;

/** The hold as the dialog reads it (held with no request out). */
function heldNow(lock: string): HeldDisconnect {
  const h = heldAttempts(lock)[0]!;
  return { id: h.id, what: 'key', metaVersion: h.metaVersion, inFlight: false };
}

beforeEach(() => {
  boot();
  setTarget(C1);
  stored = true;
  signedIn = true;
  signOuts = 0;
  deletes = 0;
  reads = 0;
  answerDelete = async () => lost;
  api = {
    keyDelete: vi.fn(() => { deletes++; return answerDelete(); }),
    signOut: vi.fn(async () => { signOuts++; return lost; }),
    auth: vi.fn(async () => { reads++; return { ok: true, body: { auth: { api_key_stored: stored, oauth_stored: signedIn } } }; }),
  } as unknown as Api;
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('disconnectHold: one hold per provider and computer', () => {
  it('its lock: one per project, computer, provider and what it touches (a sign-in, or the stored credential), with no realm', () => {
    // A key or endpoint removal takes the provider's credential lock, the one a key save takes (keySaveHold.ts).
    expect(LOCK()).toBe('ai.credential:p1/c1/anthropic');
    expect(credentialLock(AT, KEYACC.id)).toBe(LOCK());
    expect(disconnectLock(AT, KEYACC.id, 'endpoint')).toBe(LOCK());
    // A sign-out ends neither a key nor an endpoint: its own lock.
    expect(disconnectLock(AT, KEYACC.id, 'signin')).toBe('ai.signin:p1/c1/anthropic');
    expect(disconnectLock({ ...AT, project: 'p2' }, KEYACC.id, 'key')).not.toBe(LOCK());
    expect(disconnectLock({ ...AT, computer: 'c2' }, KEYACC.id, 'key')).not.toBe(LOCK());
    expect(disconnectLock(AT, 'my:endpoint', 'endpoint')).toBe('ai.credential:p1/c1/my:endpoint');
    expect(disconnectLock(AT, 'a b', 'key')).toBeNull();
  });

  it('a held disconnect refuses a second send of the same provider on that computer, from any caller', async () => {
    await sendDisconnect(api, AT, KEYACC, shownComputer());
    expect(deletes).toBe(1);
    expect(await sendDisconnect(api, AT, KEYACC, shownComputer())).toEqual({ state: 'held' });
    expect(deletes).toBe(1);
    expect(heldAttempts(LOCK())[0]?.by).toBe(DISCONNECT_HOLD_BY);
  });

  it('heldDisconnectsAt lists the holds of that computer only, each with its provider and lock family', async () => {
    await sendDisconnect(api, AT, KEYACC, shownComputer());
    expect(heldDisconnectsAt(AT).map((x) => [x.provider, x.family])).toEqual([['anthropic', 'credential']]);
    expect(heldDisconnectsAt({ ...AT, computer: 'c2' })).toEqual([]);
    expect(heldDisconnectsAt({ ...AT, project: 'p2' })).toEqual([]);
  });
});

describe('disconnectHold: a sign-out and a key removal of one provider are held apart', () => {
  it('a held sign-out refuses only another sign-out; the key removal of that provider still goes, and both stay held', async () => {
    expect(await sendDisconnect(api, AT, SIGNIN, shownComputer())).toEqual({ state: 'not_confirmed' });
    expect(signOuts).toBe(1);
    expect(await sendDisconnect(api, AT, SIGNIN, shownComputer())).toEqual({ state: 'held' });
    expect(signOuts).toBe(1);
    expect(await sendDisconnect(api, AT, KEYACC, shownComputer())).toEqual({ state: 'not_confirmed' });
    expect(deletes).toBe(1);
    expect(heldDisconnectsAt(AT).map((x) => [x.provider, x.family, x.held.what])).toEqual([['anthropic', 'signin', 'signin'], ['anthropic', 'credential', 'key']]);
  });
});

describe('disconnectHold: every call stays on the computer the caller was shown', () => {
  it('a computer switch while the hold is being taken sends nothing and leaves no hold', async () => {
    const send = sendDisconnect(api, AT, KEYACC, shownComputer());
    // The switch lands before holdAttempt answers.
    setTarget(C2);
    expect(await send).toEqual({ state: 'stale' });
    expect(deletes).toBe(0);
    expect(heldAttempts(LOCK())).toEqual([]);
  });

  it('a caller whose computer is no longer shown sends nothing and holds nothing', async () => {
    const on = shownComputer();
    setTarget(C2);
    expect(await sendDisconnect(api, AT, KEYACC, on)).toEqual({ state: 'stale' });
    expect(deletes).toBe(0);
    expect(heldAttempts(LOCK())).toEqual([]);
  });

  it('a switch after the removal left: its read-back goes nowhere and the hold stays for that computer', async () => {
    let answer: (r: Settled<unknown>) => void = () => undefined;
    answerDelete = () => new Promise((res) => { answer = res; });
    const send = sendDisconnect(api, AT, KEYACC, shownComputer());
    await expect.poll(() => deletes).toBe(1);
    // The other computer would read the key gone.
    setTarget(C2);
    stored = false;
    answer(lost);
    expect(await send).toEqual({ state: 'stale' });
    expect(reads).toBe(0);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('Check again from a computer no longer shown reads nothing and frees nothing', async () => {
    expect(await sendDisconnect(api, AT, KEYACC, shownComputer())).toEqual({ state: 'not_confirmed' });
    expect(reads).toBe(1);
    const on = shownComputer();
    setTarget(C2);
    stored = false;
    expect(await checkDisconnect(api, KEYACC.id, heldNow(LOCK()), on)).toBe('stale');
    expect(reads).toBe(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);
    // Back on that computer, the same Check again reads it gone and lets it go.
    setTarget(C1);
    expect(await checkDisconnect(api, KEYACC.id, heldNow(LOCK()), on)).toBe('removed');
    expect(heldAttempts(LOCK())).toEqual([]);
    expect(deletes).toBe(1);
  });
});

describe('disconnectHold: what Check again says', () => {
  it('read whole and still stored: present, and the hold stays', async () => {
    await sendDisconnect(api, AT, KEYACC, shownComputer());
    expect(await checkDisconnect(api, KEYACC.id, heldNow(LOCK()), shownComputer())).toBe('present');
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('a read that proves nothing: not confirmed, never present', async () => {
    await sendDisconnect(api, AT, KEYACC, shownComputer());
    api.auth = vi.fn(async () => lost);
    expect(await checkDisconnect(api, KEYACC.id, heldNow(LOCK()), shownComputer())).toBe('not_confirmed');
    api.auth = vi.fn(async () => ({ ok: true as const, body: { auth: {} } }));
    expect(await checkDisconnect(api, KEYACC.id, heldNow(LOCK()), shownComputer())).toBe('not_confirmed');
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('read gone while the removal may still be out: busy, and core keeps the hold', async () => {
    let answer: (r: Settled<unknown>) => void = () => undefined;
    answerDelete = () => new Promise((res) => { answer = res; });
    const send = sendDisconnect(api, AT, KEYACC, shownComputer());
    await expect.poll(() => deletes).toBe(1);
    stored = false;
    const [row] = heldDisconnectsAt(AT);
    expect(row?.held.inFlight).toBe(true);
    expect(await checkDisconnect(api, KEYACC.id, row!.held, shownComputer())).toBe('busy');
    expect(heldAttempts(LOCK())).toHaveLength(1);
    answer({ ok: true, body: {} });
    expect(await send).toEqual({ state: 'removed' });
    expect(heldAttempts(LOCK())).toEqual([]);
  });
});

describe('disconnectHold: an endpoint delete read back from a list', () => {
  const endpointApi = (body: unknown) => ({
    customDelete: vi.fn(async () => { deletes++; return lost; }),
    providers: vi.fn(async () => ({ ok: true, body })),
  }) as unknown as Api;

  it.each([
    ['no list at all', {}],
    ['a row with no id', { items: [{ id: 'other' }, { display_name: 'My endpoint' }] }],
  ])('a lost delete read back from %s keeps the hold', async (_name, body) => {
    expect(await sendDisconnect(endpointApi(body), AT, ENDPOINT, shownComputer())).toEqual({ state: 'not_confirmed' });
    expect(deletes).toBe(1);
    expect(heldAttempts(disconnectLock(AT, ENDPOINT.id, 'endpoint')!)).toHaveLength(1);
  });

  it('a lost delete read back from a whole list without it lets the hold go (control)', async () => {
    expect(await sendDisconnect(endpointApi({ items: [{ id: 'other' }] }), AT, ENDPOINT, shownComputer())).toEqual({ state: 'removed' });
    expect(heldAttempts(disconnectLock(AT, ENDPOINT.id, 'endpoint')!)).toEqual([]);
  });
});
