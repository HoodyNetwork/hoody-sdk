// A held key save of an own endpoint that was deleted elsewhere (another tab, the agent itself) is read back by the page's
// pass over endpoints the list no longer shows, like a held edit: an endpoint that does not exist holds no key, so the
// agent's not_found lets the save go. Any other answer keeps it.
import { heldAttempts, holdAttempt } from '@core';
import { act, render, waitFor } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Api } from './api';
import { useSettleGoneEdits } from './endpointEditHold';
import type { Settled } from './types';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const gone: Settled<unknown> = { ok: false, err: { kind: 'failed', code: 'not_found', status: 404, retryAfter: null, details: {} } };
const EP_LOCK = 'ai.credential:p1/c1/my-ep';
const OTHER = [{ id: 'anthropic' }];

let answer: Settled<unknown>;
let reads: string[];
let api: Api;

function Reader({ read, accounts }: { read: number; accounts: { id: string }[] }) {
  useSettleGoneEdits(accounts, read, api);
  return null;
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function heldSave(): Promise<void> {
  const got = await holdAttempt(EP_LOCK, { by: 'ai.key-save', identity: { project: 'p1', computer: 'c1', provider: 'my-ep' } });
  if (!got.ok) throw new Error(`not held: ${got.code}`);
  got.hold.sent();
}

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
  reads = [];
  answer = gone;
  api = { provider: (id: string) => { reads.push(id); return Promise.resolve(answer); } } as unknown as Api;
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('a held key save of an endpoint the list no longer shows', () => {
  it('is let go when the agent answers that the endpoint does not exist', async () => {
    await heldSave();
    render(<Reader read={1} accounts={OTHER} />);
    await waitFor(() => expect(heldAttempts(EP_LOCK)).toEqual([]));
    expect(reads).toEqual(['my-ep']);
  });

  it('stays on any other answer', async () => {
    answer = lost;
    await heldSave();
    render(<Reader read={1} accounts={OTHER} />);
    await settle();
    expect(reads).toEqual(['my-ep']);
    expect(heldAttempts(EP_LOCK)).toHaveLength(1);
  });

  it('is not read while the list still shows the endpoint', async () => {
    await heldSave();
    render(<Reader read={1} accounts={[{ id: 'my-ep' }]} />);
    await settle();
    expect(reads).toEqual([]);
    expect(heldAttempts(EP_LOCK)).toHaveLength(1);
  });
});
