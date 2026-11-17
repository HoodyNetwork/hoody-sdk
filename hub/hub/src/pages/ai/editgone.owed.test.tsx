// A held edit skipped by the page's pass while its request was out
// is owed one read once that request answers, not only at the next list read. One read, not one per hold movement.
import { heldAttempts } from '@core';
import { act, render, waitFor } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Api } from './api';
import { editLock, sendEdit, useSettleGoneEdits } from './endpointEditHold';
import type { Settled } from './types';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const gone: Settled<unknown> = { ok: false, err: { kind: 'failed', code: 'not_found', status: 404, retryAfter: null, details: {} } };
const AT = { project: 'p1', computer: 'c1' };
const EP = 'my-ep';
const OTHER = [{ id: 'anthropic' }];

let reads = 0;
let answerPatch: (r: Settled<unknown>) => void = () => undefined;
let api: Api;

function Reader({ read }: { read: number }) {
  useSettleGoneEdits(OTHER, read, api);
  return null;
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
  reads = 0;
  api = {
    customPatch: () => new Promise<Settled<unknown>>((res) => { answerPatch = res; }),
    provider: () => { reads += 1; return Promise.resolve(lost); },
  } as unknown as Api;
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('a held edit skipped while its request was out', () => {
  it('is read once when its request answers (gone: let go), and not again on later hold movements', async () => {
    const sent = sendEdit(api, AT, EP, { name: 'A', base_url: 'https://x.example/v1', models: ['m1'] }, { name: 'B', base_url: 'https://x.example/v1', models: ['m1'] });
    await waitFor(() => expect(heldAttempts(editLock(AT, EP)!)).toHaveLength(1));
    render(<Reader read={1} />);
    await settle();
    expect(reads, 'skipped while out').toBe(0);
    // The PATCH answer is lost. The edit's own read-back is lost too, so the hold stays, answered. Every later read finds
    // the endpoint gone.
    api.provider = () => { reads += 1; return Promise.resolve(reads === 1 ? lost : gone); };
    await act(async () => { answerPatch(lost); await sent; });
    await waitFor(() => expect(heldAttempts(editLock(AT, EP)!), 'the owed read let it go').toEqual([]));
    await settle();
    expect(reads, 'its own read-back, then one owed read').toBe(2);
  });
});
