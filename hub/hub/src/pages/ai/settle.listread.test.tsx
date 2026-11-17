// The page reads back held changes no dialog or form can reach (useSettleUnlisted, useSettleGoneEdits) once per read of
// the accounts list: a new read time or other listed ids. The page model rebuilds `accounts` on every unrelated query
// update, so a new array with the same read and ids must read nothing more.
import { heldAttempts } from '@core';
import { render, waitFor, act } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { disconnectLock, sendDisconnect, useSettleUnlisted } from './disconnectHold';
import { editLock, sendEdit, useSettleGoneEdits } from './endpointEditHold';
import type { Account } from './logic';
import { shownComputer } from './shownGate';
import type { Settled } from './types';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const KEYACC: Account = { id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const OTHER: Account = { ...KEYACC, id: 'openai', prefix: 'openai', label: 'OpenAI' };
const AT = { project: 'p1', computer: 'c1' };
const EP = 'my-ep';

let auths = 0;
let providerReads = 0;
let api: Api;

function Readers({ accounts, read }: { accounts: Account[]; read: number }) {
  useSettleUnlisted(AT, accounts, read, api);
  useSettleGoneEdits(accounts, read, api);
  return null;
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
  auths = 0;
  providerReads = 0;
  api = {
    keyDelete: vi.fn(async () => lost),
    customPatch: vi.fn(async () => lost),
    // The key stays stored and the endpoint reads back: nothing proves either change, both stay held.
    auth: vi.fn(async () => { auths++; return { ok: true, body: { auth: { api_key_stored: true } } }; }),
    provider: vi.fn(async () => { providerReads++; return lost; }),
  } as unknown as Api;
  // A held key removal of anthropic and a held edit of my-ep, each with its request answered.
  await sendDisconnect(api, AT, KEYACC, shownComputer());
  await sendEdit(api, AT, EP, { name: 'A', base_url: 'https://x.example/v1', models: ['m1'] }, { name: 'B', base_url: 'https://x.example/v1', models: ['m1'] });
  expect(heldAttempts(disconnectLock(AT, KEYACC.id, 'key')!)).toHaveLength(1);
  expect(heldAttempts(editLock(AT, EP)!)).toHaveLength(1);
  auths = 0;
  providerReads = 0;
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('the page reads unreachable holds back once per list read', () => {
  it('a re-render with a new array of the same read and ids reads nothing more; a new read reads once more', async () => {
    const view = render(<Readers accounts={[OTHER]} read={1} />);
    await waitFor(() => expect(auths).toBe(1));
    await waitFor(() => expect(providerReads).toBe(1));
    await settle();
    for (let i = 0; i < 3; i++) {
      view.rerender(<Readers accounts={[{ ...OTHER }]} read={1} />);
      await settle();
    }
    expect(auths, 'the removal: one read for that list read').toBe(1);
    expect(providerReads, 'the edit: one read for that list read').toBe(1);
    view.rerender(<Readers accounts={[{ ...OTHER }]} read={2} />);
    await waitFor(() => expect(auths).toBe(2));
    await waitFor(() => expect(providerReads).toBe(2));
  });

  it('other listed ids are a new list read too', async () => {
    const view = render(<Readers accounts={[OTHER]} read={1} />);
    await waitFor(() => expect(auths).toBe(1));
    await settle();
    view.rerender(<Readers accounts={[OTHER, { ...OTHER, id: 'mistral' }]} read={1} />);
    await waitFor(() => expect(auths).toBe(2));
  });
});
