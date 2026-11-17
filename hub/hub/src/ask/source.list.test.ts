// The provider's `list` reads one computer's chat list in one realm over that computer's
// shared agent connection and opens no engine; rows are newest first, titled as Recent titles them (C.titleOf), each a reference
// `open` takes. A computer the page cannot name, a failed read or an answer that is not a list rejects (never "no chats").
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __made?: string[] };
      (g.__made ??= []).push(t.container.id);
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'] }, realClock);
      return real.withFixtureDest(g.__fake, t.container.id);
    },
  };
});

import './data';
import { computerHandle } from '@core';
import { AskEngine } from './engine';
import { FakeAgent } from './fake';
import * as C from './conv';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
afterEach(async () => {
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  const g = globalThis as { __fake?: unknown; __made?: unknown };
  delete g.__fake;
  delete g.__made;
});
const fakeAgent = (): FakeAgent => (globalThis as { __fake?: FakeAgent }).__fake!;
const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const LONG = 'Please build me a small dashboard that shows the CPU and memory of every computer, refreshed every few seconds';

// The read sources (./source) pull in the kit: loaded once here, so the first test never spends its time limit on the cold
// transform.
beforeAll(async () => { await import('./source'); }, 180_000);

describe('askConversations.list(account, at, realm)', () => {
  it("reads the shown computer's chats in the realm asked, newest first, titled as Recent, and opens no engine", async () => {
    w = world();
    const { askConversations } = await import('./source');
    const opened = vi.spyOn(AskEngine.prototype, 'open');
    await askConversations.list!(ACCOUNT, AT, 'global'); // makes the computer's agent connection for that realm
    const read = vi.spyOn(fakeAgent(), 'sessions').mockResolvedValue({ items: [
      { id: 'old', first_message: 'Fix the login page', last_request_at: '2026-11-01T10:00:00Z' },
      { id: 'none' },
      { id: 'new', first_message: LONG, last_request_at: '2026-11-05T10:00:00Z' },
      { id: '', first_message: 'no id' },
      'junk',
    ], meta: { total: 5 } } as never);
    const rows = await askConversations.list!(ACCOUNT, AT, 'global');
    expect(read).toHaveBeenCalledWith('global');
    expect(rows).toEqual([
      { ref: { computer: HANDLE, realm: 'global', sid: 'new' }, title: C.titleOf(LONG), at: Date.parse('2026-11-05T10:00:00Z') },
      { ref: { computer: HANDLE, realm: 'global', sid: 'old' }, title: 'Fix the login page', at: Date.parse('2026-11-01T10:00:00Z') },
      { ref: { computer: HANDLE, realm: 'global', sid: 'none' }, title: null, at: null },
    ]);
    expect(opened).not.toHaveBeenCalled();
    // One connection for the computer in that realm (the registry's slot), shared by both reads.
    expect((globalThis as { __made?: string[] }).__made).toEqual([AT.id]);
  });

  it('rejects for a computer the page cannot name, a failed read, and an answer that is not a list', async () => {
    w = world();
    const { askConversations } = await import('./source');
    await expect(askConversations.list!(ACCOUNT, { ...AT, name: '' }, REALM)).rejects.toThrow();
    await expect(askConversations.list!('', AT, REALM)).rejects.toThrow();
    await askConversations.list!(ACCOUNT, AT, REALM);
    vi.spyOn(fakeAgent(), 'sessions').mockRejectedValueOnce({ status: 503, code: 'unavailable' });
    await expect(askConversations.list!(ACCOUNT, AT, REALM)).rejects.toMatchObject({ status: 503 });
    vi.spyOn(fakeAgent(), 'sessions').mockResolvedValueOnce({ error: 'nope' } as never);
    await expect(askConversations.list!(ACCOUNT, AT, REALM)).rejects.toThrow('not a chat list');
  });

  // Where the read goes and what it opens.
  it("reads on the computer the page's directory names for the handle, over `at`; with no directory entry, on `at`", async () => {
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    const made = () => (globalThis as { __made?: string[] }).__made ?? [];
    // The directory resolves the handle to another computer (moved, or the page knows better): the read goes there.
    R.setComputerDirectory({ resolve: (h) => (h === HANDLE ? { project: 'p-dir', id: 'c-dir', name: 'atlas' } : null), handleOf: () => null });
    await askConversations.list!(ACCOUNT, AT, REALM);
    expect(made()).toEqual(['c-dir']);
    // A handle the directory does not know: `at`, the computer the page shows, names it.
    const AT2 = { project: slot.project, id: 'c0a7150000000000000000b2', name: 'birch' };
    await askConversations.list!(ACCOUNT, AT2, REALM);
    expect(made()).toEqual(['c-dir', AT2.id]);
  });

  it('opens no stream and makes no session: every call the agent hears, from the first read on, is the list read', async () => {
    w = world();
    const { askConversations } = await import('./source');
    // The agent is made inside the first read (the shared connection): its own log, which every AgentIO request but alive()
    // writes, is read whole, so whatever the connection's creation or either read sends shows. alive() and the tests' own
    // reattach() write no row, so they are spied on separately.
    const alive = vi.spyOn(FakeAgent.prototype, 'alive');
    const reattach = vi.spyOn(FakeAgent.prototype, 'reattach');
    await askConversations.list!(ACCOUNT, AT, REALM);
    await askConversations.list!(ACCOUNT, AT, 'global');
    await new Promise((r) => setTimeout(r, 30));
    expect(fakeAgent().log.map(([m, a]) => [m, a[0]])).toEqual([['sessions', REALM], ['sessions', 'global']]);
    expect(alive).not.toHaveBeenCalled();
    expect(reattach).not.toHaveBeenCalled();
  });
});
