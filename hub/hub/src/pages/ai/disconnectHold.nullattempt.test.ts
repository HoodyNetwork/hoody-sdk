// Check again proves a removal landed, but this tab has no handle on its hold (it belongs to another sender): the hold is
// still held, so the answer is busy and nothing is let go. Only a hold that is gone from the holds counts as done.
import { heldAttempts, holdAttempt } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { checkDisconnect, disconnectLock, type HeldDisconnect } from './disconnectHold';
import { shownComputer } from './shownGate';

const AT = { project: 'p1', computer: 'c1' };
const LOCK = () => disconnectLock(AT, 'anthropic', 'key')!;
let api: Api;

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
  api = { auth: vi.fn(async () => ({ ok: true, body: { auth: { api_key_stored: false, oauth_stored: false } } })) } as unknown as Api;
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('Check again with no handle on a hold that is still held', () => {
  it('answers busy and keeps the hold', async () => {
    const got = await holdAttempt(LOCK(), { by: 'other.sender', meta: { what: 'key' } });
    if (!got.ok) throw new Error(`not held: ${got.code}`);
    got.hold.sent();
    const h = heldAttempts(LOCK())[0]!;
    const held: HeldDisconnect = { id: h.id, what: 'key', metaVersion: h.metaVersion, inFlight: false };
    expect(await checkDisconnect(api, 'anthropic', held, shownComputer())).toBe('busy');
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('a hold already gone from the holds: removed', async () => {
    const held: HeldDisconnect = { id: 'gone-id', what: 'key', metaVersion: 1, inFlight: false };
    expect(await checkDisconnect(api, 'anthropic', held, shownComputer())).toBe('removed');
  });
});
