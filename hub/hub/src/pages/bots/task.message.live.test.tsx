// Vitest on a live page: a message about a task goes to the Bot once. It names the task, carries one Idempotency-Key, and a lost answer is
// "may have been sent": nothing is sent again from that hold, and the words of the first send are the only ones that ever left.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, useMessageTask } from './data';
import { TASK_MESSAGE_MAX, taskMessageText } from './logic';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const posts = () => calls.filter((c) => c.method === 'POST' && /\/bots\/[^/]+\/messages$/.test(new URL(c.url).pathname));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

describe('what is sent', () => {
  it('the text leads with the task and its session, and keeps the words as typed', () => {
    expect(taskMessageText({ title: 'Read deploy log', sessionId: '9a1be4c07d2f4c11' }, '  raise the limit to 2 GB  ')).toBe('For the task “Read deploy log” (session 9a1be4c07d2f4c11): raise the limit to 2 GB');
  });
  it('the title is outside text: made plain, scrubbed and cut', () => {
    const text = taskMessageText({ title: 'a\u0000b sk-abcdefghijklmnop1234 ' + 'x'.repeat(200), sessionId: 's1' }, 'hi');
    expect(text).not.toMatch(/sk-abcdefghijklmnop1234|\u0000/);
    expect(text.length).toBeLessThan(160);
  });
  it('the form cap is far under what the agent takes (64 KiB)', () => {
    expect(TASK_MESSAGE_MAX).toBeLessThanOrEqual(8000);
  });
});

describe('the send', () => {
  it('posts the words once to the Bot with an Idempotency-Key, and says it was done', async () => {
    onFetch((c) => (c.method === 'POST' ? { status: 202, body: { message_id: 'm1', state: 'accepted' } } : { status: 200, body: { data: {} } }));
    const h = renderHook(() => useMessageTask(KEY, 's1', []), { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'For the task “t” (session s1): go' });
    });
    await act(flush);
    expect(h.result.current.outcome).toBe('done');
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body).toEqual({ text: 'For the task “t” (session s1): go' });
    expect(posts()[0]?.headers['idempotency-key']).toBeTruthy();
  });

  it('a lost answer is unknown, and a second press with other words sends nothing more', async () => {
    onFetch((c) => (c.method === 'POST' ? { status: 0, network: true } : { status: 200, body: { data: {} } }));
    const h = renderHook(() => useMessageTask(KEY, 's1', []), { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'first words' });
    });
    await act(flush);
    expect(h.result.current.outcome).toBe('pending');
    const before = posts().length;
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'other words' });
    });
    await act(flush);
    expect(posts()).toHaveLength(before);
    expect(h.result.current.outcome).toBe('pending');
  });

  it('a held message about one task is that task\'s pending state only, and a dismiss frees only its own', async () => {
    let n = 0;
    onFetch((c) => {
      if (c.method !== 'POST') return { status: 200, body: { data: {} } };
      n += 1;
      return n === 1 ? { status: 0, network: true } : { status: 202, body: { message_id: 'm2', state: 'accepted' } };
    });
    const h = renderHook(() => ({ a: useMessageTask(KEY, 's1', []), b: useMessageTask(KEY, 's2', []) }), { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await h.result.current.a.run({ sessionId: 's1', text: 'one' });
    });
    await act(flush);
    expect(h.result.current.a.outcome).toBe('pending');
    // The other task shows nothing pending, and dismissing there frees nothing of the first.
    expect(h.result.current.b.outcome).toBe('idle');
    act(() => h.result.current.b.dismiss());
    await act(flush);
    expect(h.result.current.a.outcome).toBe('pending');
    await act(async () => {
      await h.result.current.b.run({ sessionId: 's2', text: 'two' });
    });
    await act(flush);
    expect(posts().map((c) => c.body.text)).toEqual(['one', 'two']);
    expect(h.result.current.b.outcome).toBe('done');
    // Only its own dismiss frees the first.
    act(() => h.result.current.a.dismiss());
    await act(flush);
    expect(h.result.current.a.outcome).not.toBe('pending');
  });

  it('a message the Bot dropped unposted is answered as dropped with its reason, and a new send is a new message', async () => {
    let n = 0;
    onFetch((c) => (c.method === 'POST' ? (++n === 1 ? { status: 202, body: { message_id: 'm1', state: 'dropped', reason: 'access_revoked' } } : { status: 202, body: { message_id: 'm2', state: 'posted', turn_id: 't1' } }) : { status: 200, body: { data: {} } }));
    const h = renderHook(() => useMessageTask(KEY, 's1', []), { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'words' });
    });
    await act(flush);
    expect(h.result.current.outcome).toBe('done');
    expect(h.result.current.data).toEqual({ queued: false, dropped: 'access_revoked' });
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'words' });
    });
    await act(flush);
    expect(posts()).toHaveLength(2);
    expect(posts()[1]?.headers['idempotency-key']).not.toBe(posts()[0]?.headers['idempotency-key']);
    expect(h.result.current.data).toEqual({ queued: false });
  });

  it('a refused message is failed, not unknown', async () => {
    onFetch((c) => (c.method === 'POST' ? { status: 403, body: { error: { code: 'forbidden', message: 'no' } } } : { status: 200, body: { data: {} } }));
    const h = renderHook(() => useMessageTask(KEY, 's1', []), { wrapper: CoreQueryProvider });
    await act(flush);
    await act(async () => {
      await h.result.current.run({ sessionId: 's1', text: 'words' });
    });
    await act(flush);
    expect(h.result.current.outcome).toBe('failed');
  });
});
