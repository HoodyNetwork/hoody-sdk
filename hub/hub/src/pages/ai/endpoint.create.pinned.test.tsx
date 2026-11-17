// An endpoint create's calls (its plan read, the send, Check again, the leave toast's Check again included) go to the
// step's own computer, or nowhere. A create on A whose answer was lost, checked
// while core shows B, must never read B (a B endpoint with that id would free A's create with no proof about A).
import { act, cleanup, render, screen, userEvent, waitFor } from '@app/testing';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointCreate } from './parts/EndpointStep';
import { shownComputer } from './shownGate';
import strings from './strings.en.json';
import type { Settled } from './types';

const A = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const B = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };

let reads: string[];
let creates: number;
let api: Api;

beforeEach(() => {
  boot();
  setTarget(A);
  reads = [];
  creates = 0;
  const over: Partial<Api> = {
    providers: () => Promise.resolve(ok({ providers: [] })),
    customCreate: () => { creates += 1; return Promise.resolve(lost); },
    provider: () => { reads.push(shownComputer()); return Promise.resolve(lost); },
  };
  api = new Proxy(over as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
});
afterEach(() => {
  cleanup();
  setTarget(null);
});

describe('an endpoint create stays on the computer it was drawn for', () => {
  it("Check again after core moved to B reads nothing from B; back on A it reads A", async () => {
    const m = { computer: { id: 'c1', name: 'atlas' }, target: A, realm: null, accounts: [] };
    const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve(null), alive: () => true };
    const ctx = { m, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
    render(<AiProvider value={ctx}><EndpointCreate onCreated={() => undefined} /></AiProvider>);
    await userEvent.type(screen.getByLabelText(new RegExp(strings['ep.name'])), 'My endpoint');
    await userEvent.type(screen.getByLabelText(new RegExp(strings['ep.address'])), 'https://x.example/v1');
    await userEvent.type(screen.getByLabelText(new RegExp(strings['ep.models'])), 'm1');
    await userEvent.click(screen.getByRole('button', { name: strings['ep.add'] }));
    await waitFor(() => expect(creates).toBeGreaterThan(0));
    const check = await screen.findByRole('button', { name: /Check again/ });
    const before = reads.length;
    // Core now shows B; this step's render still names A (the press lands before React draws again).
    act(() => setTarget(B));
    await userEvent.click(check);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(reads.slice(before), 'nothing read from B').toEqual([]);
    // Control: back on A, the same Check again reads A.
    act(() => setTarget(A));
    await userEvent.click(await screen.findByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(reads.slice(before)).toEqual(['p1\nc1']));
  });
});
