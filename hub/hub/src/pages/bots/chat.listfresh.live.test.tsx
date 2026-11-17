// Vitest on a live page: a chat app change or Pause all / Resume all reads the Bots list again. The list rows and the
// Bot's header carry what those changes move (how many groups wait to be let in, the chat apps set up, whether the
// Bot is paused), so they must not keep showing what was true before the change.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useBots, useChannelChange, useChannelsPause } from './data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

/** The agent as it answers: one computer, its Bots list, and every change ok. */
function serve() {
  onFetch((c) => {
    const u = new URL(c.url);
    if (c.method !== 'GET') {
      return { status: 200, body: { settings: { channels_paused: true }, effective: { channels_paused: { value: true, source: 'bot' } }, applied: 'live', warnings: [] } };
    }
    if (/\/computers$/.test(u.pathname)) return { status: 200, body: { data: { computers: [{ id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: 'sv1', realm_ids: [R1] }] } } };
    if (/\/bots$/.test(u.pathname)) return { status: 200, body: { items: [{ id: 'chief', uid: 'u1', name: 'Chief', realm_id: R1 }], meta: { total: 1 } } };
    return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
  });
}
const listReads = () => calls.filter((c) => c.method === 'GET' && /\/bots$/.test(new URL(c.url).pathname)).length;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

describe('the Bots list after a chat app change (live)', () => {
  it('Pause all reads the list again', async () => {
    serve();
    const h = renderHook(() => ({ bots: useBots(), pause: useChannelsPause({ botKey: KEY, uid: 'u1' }) }), { wrapper: CoreQueryProvider });
    await act(flush);
    const before = listReads();
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      await h.result.current.pause.run({ paused: true });
    });
    await act(flush);
    expect(listReads()).toBeGreaterThan(before);
  });

  it('a chat app change reads the list again', async () => {
    serve();
    const h = renderHook(() => ({ bots: useBots(), change: useChannelChange(KEY, 'u1') }), { wrapper: CoreQueryProvider });
    await act(flush);
    const before = listReads();
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      await h.result.current.change.run({ action: 'chatApprove', channelId: 'ch-1', target: 'g1', acknowledgeGroup: true });
    });
    await act(flush);
    expect(listReads()).toBeGreaterThan(before);
  });
});
