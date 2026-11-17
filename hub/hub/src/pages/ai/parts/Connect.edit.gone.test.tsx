// A held endpoint edit whose endpoint the page's list no longer shows (removed here, in another tab or on the computer) has
// lost its form, which opens only from the endpoint's row. The page draws the disconnect dialog all the time, so it reads
// such a hold back on each list read, and lets it go on the agent's answer that the endpoint does not exist.
import { cleanup, render, waitFor } from '@app/testing';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Api } from '../api';
import { editLock, sendEdit } from '../endpointEditHold';
import type { Saved } from '../flows-endpoint';
import type { Account } from '../logic';
import type { Settled } from '../types';
import { DisconnectDialog } from './Connect';
import { AiProvider, type AiCtx } from './ctx';

const AT = { project: 'p1', computer: 'c1' };
const EP = 'my-ep';
const LOCK = () => editLock(AT, EP)!;
const BEFORE: Saved = { name: 'My endpoint', base_url: 'https://x.example/v1', models: ['m1'] };
const AFTER: Saved = { name: 'Renamed', base_url: 'https://x.example/v1', models: ['m1'] };
const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
/** The agent's answer for an endpoint it does not have. */
const gone: Settled<unknown> = { ok: false, err: { kind: 'failed', code: 'not_found', status: 404, retryAfter: null, details: {} } };
const KEYACC: Account = { id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const EPACC: Account = { ...KEYACC, id: EP, prefix: EP, label: 'My endpoint', custom: true };

let patches = 0;
let reads = 0;
let readAnswer: Settled<unknown>;
let api: Api;

/** The page's context on computer c1; `accounts` is what its last read of the list showed. */
function ctx(accounts: Account[]): AiCtx {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } },
    realm: null, defaults: null, models: [], bots: null, accounts,
  };
  return { m, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
}
/** The dialog as the page draws it, closed: no account picked. */
const draw = (accounts: Account[]) => <AiProvider value={ctx(accounts)}><DisconnectDialog account={null} onClose={() => undefined} /></AiProvider>;

/** An edit whose PATCH and read-back were both lost: held by core, its request answered. */
async function heldEdit(): Promise<void> {
  readAnswer = lost;
  expect(await sendEdit(api, AT, EP, BEFORE, AFTER)).toEqual({ state: 'not_confirmed' });
  expect(heldAttempts(LOCK())).toHaveLength(1);
  reads = 0;
}

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } });
  patches = 0;
  reads = 0;
  api = {
    customPatch: () => {
      patches += 1;
      return Promise.resolve(lost);
    },
    provider: () => {
      reads += 1;
      return Promise.resolve(readAnswer);
    },
  } as unknown as Api;
});
afterEach(() => {
  cleanup();
  setTarget(null);
  resetAttempts();
});

describe('an endpoint edit held after its endpoint left the list', () => {
  it("the page reads it back on its list read and lets it go on the agent's 404; nothing is sent", async () => {
    await heldEdit();
    readAnswer = gone;
    render(draw([KEYACC]));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    expect(reads).toBe(1);
    expect(patches).toBe(1);
  });

  it('a list that still shows the endpoint leaves the reading to its form (control)', async () => {
    await heldEdit();
    readAnswer = gone;
    render(draw([KEYACC, EPACC]));
    expect(reads).toBe(0);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });
});
