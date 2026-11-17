// Vitest on the live Test send (the real useRunTest, core's real transport and locked change): the request goes to the script's
// own address and may have run, so an answer that never came back (network loss, timeout) holds the change as pending: one
// request only, the hold is shown (held), and a press meanwhile sends nothing. A refusal before the send, or an answer, is not
// that: it is shown as what it is and nothing is held.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump, setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET } from '@core/test/env';
import { useRunTest } from './data';

const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const sent = () => calls.filter((c) => /\/hello/.test(c.url));
const press = async (r: { current: ReturnType<typeof useRunTest> }, method: 'GET' | 'POST', body = '') => {
  let out: unknown;
  await act(async () => { out = await r.current.mutateAsync({ compId: 'c1', exec: 1, method, route: '/hello', body } as never); await flush(); });
  return out as { outcome: string; code?: string; data?: { status: number; body: string } };
};

beforeEach(() => {
  boot({ realm: R1 });
  setTarget(TARGET);
});

describe('Test send: an answer that never came back', () => {
  for (const method of ['GET', 'POST'] as const) {
    it(`a ${method} whose answer is lost is pending and held; pressing again sends nothing`, async () => {
      onFetch((c) => (/\/hello/.test(c.url) ? { network: true, status: 0 } : { status: 200, body: { data: {} } }));
      const { result } = renderHook(() => useRunTest('c1', 1));
      const first = await press(result, method, method === 'POST' ? '{"a":1}' : '');
      expect(first.outcome).toBe('pending');
      expect(sent()).toHaveLength(1);
      expect(result.current.held).toMatchObject({ compId: 'c1', method, route: '/hello' });
      const second = await press(result, method, method === 'POST' ? '{"a":1}' : '');
      expect(second.outcome).toBe('not_sent');
      expect(sent()).toHaveLength(1);
    });
  }

  it('a 404 is a done answer shown as it is, never held', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 404, text: 'no such route' } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const out = await press(result, 'GET');
    expect(out.outcome).toBe('done');
    expect(out.data?.status).toBe(404);
    expect(result.current.held).toBeNull();
  });

  it('a 5xx is shown and held (the request may not have run once)', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 502, text: 'bad gateway' } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const out = await press(result, 'GET');
    expect(out.outcome).toBe('pending');
    expect(out.data?.status).toBe(502);
    expect(result.current.held).not.toBeNull();
  });

  it('a POST whose answer is lost after the origin already answered a GET is still pending and held (the kit may call it preflight_refused, which proves nothing)', async () => {
    let lose = false;
    onFetch((c) => (/\/hello/.test(c.url) ? (lose ? { network: true, status: 0 } : { status: 200, text: 'hi' }) : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    expect((await press(result, 'GET')).outcome).toBe('done');
    lose = true;
    const out = await press(result, 'POST', '{"a":1}');
    expect(out.outcome).toBe('pending');
    expect(sent()).toHaveLength(2);
    expect(result.current.held).toMatchObject({ compId: 'c1', method: 'POST', route: '/hello' });
    expect((await press(result, 'POST', '{"a":1}')).outcome).toBe('not_sent');
    expect(sent()).toHaveLength(2);
  });

  it('a 5xx answer too large to read is held like any 5xx (it may not have run once)', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 502, text: 'x'.repeat(262144 + 10) } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const out = await press(result, 'GET');
    expect(out.outcome).toBe('pending');
    expect(out.code).toBe('HTTP_502');
    expect(result.current.held).not.toBeNull();
  });

  it('a 200 answer too large to read is held pending (an answer the kit could not use is an unknown outcome, C9); a second press sends nothing', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 200, text: 'x'.repeat(262144 + 10) } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const out = await press(result, 'POST', '{"a":1}');
    expect(out.outcome).toBe('pending');
    expect(result.current.held).toMatchObject({ method: 'POST', route: '/hello' });
    expect((await press(result, 'POST', '{"a":1}')).outcome).toBe('not_sent');
    expect(sent()).toHaveLength(1);
  });

  it('a 404 answer too large to read is a failure, not a hold (a 4xx is a definite refusal)', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 404, text: 'x'.repeat(262144 + 10) } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const out = await press(result, 'GET');
    expect(out.outcome).toBe('failed');
    expect(result.current.held).toBeNull();
  });

  it('a redirect answer is held pending: the script may have run before it redirected, and the kit never follows it', async () => {
    onFetch((c) => (/\/hello/.test(c.url) ? { status: 302, headers: { location: 'https://elsewhere.test/' }, text: '' } : { status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    expect((await press(result, 'GET')).outcome).toBe('pending');
    expect(result.current.held).toMatchObject({ method: 'GET', route: '/hello' });
    expect((await press(result, 'GET')).outcome).toBe('not_sent');
    expect(sent()).toHaveLength(1);
  });

  for (const how of ['abort', 'stale answer'] as const) {
    it(`a generation change after the send (${how}) leaves the request held pending, never failed or free to send again`, async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((r) => { release = r; });
      onFetch(async (c) => {
        if (!/\/hello/.test(c.url)) return { status: 200, body: { data: {} } };
        if (how === 'stale answer') { bump('switch'); await gate; return { status: 200, text: 'hi' }; }
        bump('switch');
        return { status: 200, text: 'hi', delayMs: 50 };
      });
      const { result } = renderHook(() => useRunTest('c1', 1));
      let out: { outcome: string } | undefined;
      await act(async () => { const p = result.current.mutateAsync({ compId: 'c1', exec: 1, method: 'GET', route: '/hello', body: '' } as never); await flush(); release?.(); out = (await p) as never; await flush(); });
      expect(out?.outcome).toBe('pending');
      expect(sent()).toHaveLength(1);
    });
  }

  it('a request body too large to send is refused before any send: not_sent, not held, no request goes out', async () => {
    onFetch(() => ({ status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const before = calls.length;
    const out = await press(result, 'POST', JSON.stringify({ a: 'x'.repeat((1 << 20) + 10) }));
    expect(out.outcome).toBe('not_sent');
    expect(calls.length).toBe(before);
    expect(result.current.held).toBeNull();
  });

  it('a request refused before any send (a route the kit does not allow) is not held and no request of any kind goes out', async () => {
    onFetch(() => ({ status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunTest('c1', 1));
    const before = calls.length;
    let out: { outcome: string } | undefined;
    await act(async () => { out = (await result.current.mutateAsync({ compId: 'c1', exec: 1, method: 'GET', route: '/api/v1/x', body: '' } as never)) as never; await flush(); });
    expect(out?.outcome).toBe('not_sent');
    expect(calls.length).toBe(before);
    expect(result.current.held).toBeNull();
  });
});
