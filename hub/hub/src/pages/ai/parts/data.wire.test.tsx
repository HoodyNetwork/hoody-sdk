// The chat list's reads on the real core over a fake fetch (the agent's real answer shapes and the realm
// each request carries): a realm-pinned agent's fallback sends no realm, a waiting chat outside the loaded pages is read
// from GET /sessions/{id}'s { session } envelope, waiting chats past the per-read bound stay reachable, and a hidden
// page starts no read.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { startTransition, Suspense, useState } from 'react';
import { queryClient } from '@core';
import { boot, calls, onFetch, settle, TARGET, R1, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SLOW_MS, STATE_MS, useChats, type ChatsAt, type ChatsFeed, type ChatsRead } from './data';
// The shell's observer, mounted beside the list as shell/live.tsx mounts it.
import { chatTickedPlace, useChatAttention } from '@core/chat-attention';

const path = (u: string) => new URL(u).pathname.replace(/^\/api\/v1\/agent/, '');
const realmOf = (u: string) => new URL(u).searchParams.get('realm');
const of = (p: string) => calls.filter((c) => path(c.url) === p);
/** The session walk's gap now (coverage.logic sources): the first session source not complete, null when the walk is. */
const sessionGap = (r: ChatsRead) => r.sources.find((x) => x.kind === 'sessions' && x.state !== 'complete')?.state ?? null;
/** Lets the reads in flight settle. Under fake timers it fires the zero timers that are due and drains microtasks
 *  without moving the clock (settle()'s setTimeout(0) would wait for the clock), so only the test's own
 *  advanceTimersByTimeAsync moves time past a poll. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0); else await settle(); });
};

const row = (id: string, o: Record<string, unknown> = {}) => ({ id, realm: R1, first_message: `chat ${id}`, cwd: '/home/ada', started_at: '2026-10-01T00:00:00Z', ...o });
let sessions: Array<Record<string, unknown>> = [];
let gates: Array<Record<string, unknown>> = [];
let pinned = false;
let gatesDown = false;
let sessionsDown = false;
let tokens = { sessions: 't1', gates: 't1' };
let changesDelay = 0;
let sessionsDelay = 0;
let gatesDelay = 0;
/** Omitted gates come off the front of a page (default: the end). */
let omitFront = false;
/** Gates a page leaves out, by page number (meta.omitted). */
let omittedOn: Record<number, number> = {};
/** The second computer's gates (TARGET2): its own waiting chats, all off its pages. */
let gates2: Array<Record<string, unknown>> = [];
const TARGET2 = { ...TARGET, container: { ...TARGET.container, id: 'c2' } };
const byIdDefault = (id: string): Reply => {
  const s = sessions.find((x) => x.id === id) ?? offPage.find((x) => x.id === id);
  // The agent's GET /sessions/{id}: the row inside `session`, beside attached/started.
  return s ? { status: 200, body: { session: s, attached: false } } : { status: 404, body: { error: 'session not found', code: 'not_found' } };
};
let byId = byIdDefault;
/** Sessions the agent holds that no list page answered (the test's sessions list stays short). */
let offPage: Array<Record<string, unknown>> = [];
/** GET /bots rows (names for the Bot tags). */
let botsList: Array<Record<string, unknown>> = [];
/** GET /sessions answers by page (limit/page) instead of the whole list. */
let paged = false;
/** GET /bots/{id}/delegates answers, by Bot id. */
let delegatesBy: Record<string, string[]> = {};

const second = (c: Call) => new URL(c.url).hostname.startsWith('p1-c2-');
function handle(c: Call): Reply {
  const p = path(c.url);
  const realm = realmOf(c.url);
  if (pinned && realm === 'all' && (p === '/sessions' || p === '/gates')) return { status: 400, body: { error: 'pinned', code: 'realm_scope_unsupported' } };
  if (p === '/sessions') {
    if (sessionsDown) return { status: 500, body: { error: 'boom', code: 'internal' } };
    const all = second(c) ? [] : sessions;
    const q = new URL(c.url).searchParams;
    const limit = Number(q.get('limit') || 50), page = Number(q.get('page') || 1);
    const items = paged ? all.slice((page - 1) * limit, page * limit) : all;
    return { status: 200, body: { items, meta: { total: all.length } }, delayMs: sessionsDelay };
  }
  if (p === '/gates') {
    if (gatesDown) return { status: 500, body: { error: 'boom', code: 'internal' } };
    const all = second(c) ? gates2 : gates;
    const q = new URL(c.url).searchParams;
    const limit = Number(q.get('limit') || 100), page = Number(q.get('page') || 1);
    const window = all.slice((page - 1) * limit, page * limit);
    const omitted = Math.min(omittedOn[page] ?? 0, window.length);
    const items = omitFront ? window.slice(omitted) : window.slice(0, window.length - omitted);
    return { status: 200, body: { items, meta: { total: all.length, page, limit, omitted } }, delayMs: gatesDelay };
  }
  if (p === '/bots') return { status: 200, body: { items: botsList, meta: { total: botsList.length } } };
  const dl = /^\/bots\/([^/]+)\/delegates$/.exec(p);
  if (dl) {
    const items = (delegatesBy[decodeURIComponent(dl[1]!)] ?? []).map((sid) => ({ session_id: sid }));
    return { status: 200, body: { items, meta: { total: items.length } } };
  }
  if (p === '/changes') return { status: 200, body: { scope: 's', tokens: second(c) ? { sessions: 'x1', gates: 'x1' } : { ...tokens } }, delayMs: changesDelay };
  if (p === '/sessions/cwds') return { status: 200, body: { cwds: [] } };
  const st = /^\/sessions\/([^/]+)\/state$/.exec(p);
  if (st) return { status: 200, body: { state: 'idle' } };
  const one = /^\/sessions\/([^/]+)$/.exec(p);
  if (one) return byId(decodeURIComponent(one[1]!));
  return { status: 404, body: {} };
}

let got: ChatsRead | null = null;
function Probe({ at }: { at: ChatsAt }) {
  got = useChats(at);
  return null;
}
async function mount(realm: string, target = TARGET) {
  const at: ChatsAt = { target, realm };
  const r = render(<QueryClientProvider client={queryClient}><Probe at={at} /></QueryClientProvider>);
  await flush();
  return async (next: ChatsAt) => {
    r.rerender(<QueryClientProvider client={queryClient}><Probe at={next} /></QueryClientProvider>);
    await flush();
  };
}
let hidden = false;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  sessions = [row('s-1'), row('s-2')];
  gates = [];
  offPage = [];
  botsList = [];
  paged = false;
  delegatesBy = {};
  pinned = false;
  gatesDown = false;
  sessionsDown = false;
  tokens = { sessions: 't1', gates: 't1' };
  changesDelay = 0;
  sessionsDelay = 0;
  gatesDelay = 0;
  omitFront = false;
  omittedOn = {};
  gates2 = [];
  hidden = false;
  got = null;
  byId = byIdDefault;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  onFetch(handle);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  delete (document as { visibilityState?: string }).visibilityState;
});

describe('a realm-pinned agent (realm=all refused)', () => {
  it('the fallback lists send no realm at all: every realm=all read is refused, the plain listing answers', async () => {
    boot();
    onFetch(handle);
    pinned = true;
    await mount('all');
    expect(of('/sessions').some((c) => realmOf(c.url) === 'all')).toBe(true);
    const plain = of('/sessions').filter((c) => realmOf(c.url) === null);
    expect(plain.length).toBeGreaterThan(0);
    expect(of('/gates').some((c) => realmOf(c.url) === null)).toBe(true);
    expect(got!.rows?.map((r) => r.sid).sort()).toEqual(['s-1', 's-2']);
    expect(got!.error).toBeNull();
    // The plain listing pages by last activity too.
    for (const c of plain) expect(new URL(c.url).searchParams.get('order')).toBe('last_active');
  });
});

describe('a waiting chat outside the loaded pages', () => {
  it('is read from the { session } envelope and listed under Needs you', async () => {
    offPage = [row('s-far', { name: 'Far away chat' })];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(of('/sessions/s-far')).toHaveLength(1);
    const far = got!.rows?.find((r) => r.sid === 's-far');
    expect(far?.group).toBe('needs');
    expect(far?.title).toBe('Far away chat');
    expect(got!.needs).toBe(1);
  });

  it('21 waiting chats off the pages: 20 read, "and more" offered; Show more waiting reads the 21st', async () => {
    offPage = Array.from({ length: 21 }, (_, i) => row(`w-${i}`));
    gates = offPage.map((s, i) => ({ gate_id: `g${i}`, session_id: s.id, realm: R1, kind: 'confirm' }));
    await mount(R1);
    const reads = () => calls.filter((c) => /^\/sessions\/w-\d+$/.test(path(c.url)));
    expect(reads()).toHaveLength(20);
    expect(got!.needs).toBe(20);
    expect(got!.gatesMore).toBe(true);
    expect(got!.moreGates).toBeTypeOf('function');
    await act(async () => { got!.moreGates!(); });
    await flush();
    expect(reads()).toHaveLength(21);
    expect(got!.needs).toBe(21);
    expect(got!.gatesMore).toBe(false);
  });

  it('a waiting chat whose own read fails leaves Needs you incomplete (never a sure count)', async () => {
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    byId = (id) => (id === 's-far' ? { status: 500, body: { error: 'boom', code: 'internal' } } : { status: 404, body: {} });
    await mount(R1);
    expect(got!.needs).toBe(0);
    expect(got!.gatesError).not.toBeNull();
  });
});

describe('a failed gates refresh', () => {
  it('keeps the waiting chats known before (never drops them to zero) and sets gatesError', async () => {
    gates = [{ gate_id: 'g1', session_id: 's-1', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(got!.needs).toBe(1);
    gatesDown = true;
    await act(async () => { got!.refetch(); });
    await flush();
    expect(got!.gatesError).not.toBeNull();
    expect(got!.needs).toBe(1);
  });
});

describe('a hidden page', () => {
  it('starts no list read while hidden; showing the page reads them', async () => {
    hidden = true;
    await mount(R1);
    expect(calls.filter((c) => c.url.includes('/api/v1/agent/'))).toHaveLength(0);
    hidden = false;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(of('/sessions').length).toBeGreaterThan(0);
    expect(of('/gates').length).toBeGreaterThan(0);
    expect(of('/changes').length).toBeGreaterThan(0);
  });
});

describe('a failed gates read', () => {
  it('is an error of Needs you, not zero waiting: gatesError set, the sessions still listed', async () => {
    gatesDown = true;
    await mount(R1);
    expect(got!.rows?.length).toBe(2);
    expect(got!.gatesError).not.toBeNull();
  });

  it('is read again within the slow interval although the change feed answers and its tokens never move', async () => {
    vi.useFakeTimers();
    try {
      gatesDown = true;
      gates = [{ gate_id: 'g1', session_id: 's-1', realm: R1, kind: 'confirm' }];
      await mount(R1);
      const before = of('/gates').length;
      expect(got!.gatesError).not.toBeNull();
      gatesDown = false;
      await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_MS + 10); });
      await flush();
      expect(of('/gates').length).toBeGreaterThan(before);
      expect(got!.gatesError).toBeNull();
      expect(got!.needs).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});

describe('a waiting chat answered gone', () => {
  it('a waiting chat that answers 404 after an earlier answer is dropped (gone), not kept as waiting', async () => {
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(got!.needs).toBe(1);
    offPage = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(of('/sessions/s-far').length).toBeGreaterThan(1);
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    expect(got!.needs).toBe(0);
  });
});

describe('a change-feed answer that arrives while the page is hidden', () => {
  it('re-lists nothing while hidden; the moved lists are read when the page is shown', async () => {
    vi.useFakeTimers();
    try {
      await mount(R1);
      expect(of('/changes')).toHaveLength(1);
      const s0 = of('/sessions').length;
      tokens = { sessions: 't2', gates: 't2' };
      changesDelay = 3000;
      // Up to the next feed poll only (its answer is still out: 3 s).
      for (let i = 0; i < 200 && of('/changes').length < 2; i++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(of('/changes')).toHaveLength(2);
      expect(of('/sessions')).toHaveLength(s0);
      const s1 = of('/sessions').length, g1 = of('/gates').length;
      hidden = true;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
      await flush();
      expect(of('/sessions')).toHaveLength(s1);
      expect(of('/gates')).toHaveLength(g1);
      changesDelay = 0;
      // A read the test asks for right before showing. The lists are read on show; the exact count below tells the held
      // re-list's release from the plain re-read that enabling them does.
      await act(async () => { got!.refetch(); });
      await flush();
      const s2 = of('/sessions').length, g2 = of('/gates').length;
      hidden = false;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await flush();
      // Showing the page enables each list's read (one read), and the held re-list is a second, restarting it
      // (refetch cancels the one in flight): two reads a list. Without the held re-list it is one (the next test).
      expect(of('/sessions').length - s2).toBe(2);
      expect(of('/gates').length - g2).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);

  it('a page hidden and shown with no token move reads each list once (the held re-list adds nothing)', async () => {
    vi.useFakeTimers();
    try {
      await mount(R1);
      hidden = true;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await flush();
      const s1 = of('/sessions').length, g1 = of('/gates').length;
      hidden = false;
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      await flush();
      expect(of('/sessions').length - s1).toBe(1);
      expect(of('/gates').length - g1).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});

describe('Show more waiting reads at most one gates page a press', () => {
  it('a later page that left gates out: only that page is read again, never the pages before it', async () => {
    gates = Array.from({ length: 150 }, (_, i) => ({ gate_id: `g${i}`, session_id: 's-1', realm: R1, kind: 'confirm' }));
    omittedOn = { 2: 1 };
    await mount(R1);
    const page = (n: number) => of('/gates').filter((c) => new URL(c.url).searchParams.get('page') === String(n)).length;
    expect(page(1)).toBe(1);
    await act(async () => { got!.moreGates!(); });
    await flush();
    expect(page(2)).toBe(1);
    expect(got!.gatesMore).toBe(true);
    const p1 = page(1);
    await act(async () => { got!.moreGates!(); });
    await flush();
    expect(page(2)).toBe(2);
    expect(page(1)).toBe(p1);
  });
});

describe('a new place starts with its own bounds from its first render', () => {
  it("returning to a computer never reads past 20 waiting chats because another computer's limit grew", async () => {
    offPage = [...Array.from({ length: 30 }, (_, i) => row(`b-${i}`)), ...Array.from({ length: 30 }, (_, i) => row(`a-${i}`))];
    gates = Array.from({ length: 30 }, (_, i) => ({ gate_id: `gb${i}`, session_id: `b-${i}`, realm: R1, kind: 'confirm' }));
    gates2 = Array.from({ length: 30 }, (_, i) => ({ gate_id: `ga${i}`, session_id: `a-${i}`, realm: R1, kind: 'confirm' }));
    const B: ChatsAt = { target: TARGET, realm: R1 };
    const A: ChatsAt = { target: TARGET2, realm: R1 };
    const go = await mount(R1);
    const bReads = () => new Set(calls.filter((c) => /^\/sessions\/b-\d+$/.test(path(c.url))).map((c) => path(c.url))).size;
    expect(bReads()).toBe(20);
    await go(A);
    await act(async () => { got!.moreGates!(); });
    await flush();
    await go(B);
    expect(bReads()).toBe(20);
  });
});

describe('the change-feed baseline belongs to one place', () => {
  it("another computer's first feed answer is its baseline: it re-lists nothing (no compare with the last place's tokens)", async () => {
    const go = await mount(R1);
    expect(of('/changes')).toHaveLength(1);
    const onA = (p: string) => calls.filter((c) => second(c) && path(c.url) === p).length;
    await go({ target: TARGET2, realm: R1 });
    expect(onA('/changes')).toBe(1);
    expect(onA('/sessions')).toBe(1);
    expect(onA('/gates')).toBe(1);
  });
});

describe('a chat answered gone stays gone', () => {
  it('200, then 404 (dropped), then a 500: the chat does not come back (not counted)', async () => {
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(got!.needs).toBe(1);
    offPage = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    byId = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(of('/sessions/s-far').length).toBeGreaterThan(2);
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    expect(got!.needs).toBe(0);
  });
});

describe('one Show more waiting press starts at most 20 chat reads', () => {
  it('a press that re-reads a page which left gates out does not also widen the chat-read bound', async () => {
    offPage = Array.from({ length: 60 }, (_, i) => row(`w-${i}`));
    gates = offPage.map((x, i) => ({ gate_id: `g${i}`, session_id: x.id, realm: R1, kind: 'confirm' }));
    omittedOn = { 1: 20 };
    omitFront = true;
    await mount(R1);
    const read = () => new Set(calls.filter((c) => /^\/sessions\/w-\d+$/.test(path(c.url))).map((c) => path(c.url)));
    expect(read().size).toBe(20);
    const before = read();
    omittedOn = {};
    await act(async () => { got!.moreGates!(); });
    await flush();
    const started = [...read()].filter((k) => !before.has(k));
    expect(started.length).toBeLessThanOrEqual(20);
  });
});

describe('a gone chat stays gone across place switches', () => {
  it('200, 404, 500 on one computer, then another computer and back: the chat does not come back', async () => {
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    const go = await mount(R1);
    expect(got!.needs).toBe(1);
    offPage = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    byId = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    await go({ target: TARGET2, realm: R1 });
    await go({ target: TARGET, realm: R1 });
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    expect(got!.needs).toBe(0);
  });

  it('a later 200 brings the chat back, and a failed refresh after it keeps it', async () => {
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    await mount(R1);
    offPage = [];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(false);
    offPage = [row('s-far')];
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(true);
    byId = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(true);
  });
});

describe('an abandoned render records no gone chat', () => {
  it("a suspended transition to a computer whose chat answered 404, then back: that computer's later 500 keeps the chat", async () => {
    const B: ChatsAt = { target: TARGET, realm: R1 };
    const A: ChatsAt = { target: TARGET2, realm: R1 };
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    const never = new Promise<never>(() => {});
    let holding = false;
    /** While holding, suspends forever on B, so a transition to B renders the hook there and is never committed. */
    function Hold({ at }: { at: ChatsAt }): null {
      if (holding && at.target === B.target) throw never;
      return null;
    }
    let move: (next: ChatsAt) => void = () => {};
    function Host() {
      const [at, setAt] = useState<ChatsAt>(B);
      move = setAt;
      return <Suspense fallback={null}><Probe at={at} /><Hold at={at} /></Suspense>;
    }
    render(<QueryClientProvider client={queryClient}><Host /></QueryClientProvider>);
    await flush();
    expect(got!.needs).toBe(1);
    await act(async () => { move(A); });
    await flush();
    // B's chat now answers 404 while B is not shown (its cached read keeps the 200's data).
    offPage = [];
    await act(async () => { await queryClient.refetchQueries({ type: 'all' }); });
    await flush();
    const reads = of('/sessions/s-far').length;
    holding = true;
    act(() => { startTransition(() => move(B)); });
    await flush();
    // The render of B ran (it read the cached 404) but suspended: A is still shown, nothing of B committed.
    expect(of('/sessions/s-far').length).toBe(reads);
    await act(async () => { move(A); });
    await flush();
    holding = false;
    byId = () => ({ status: 500, body: { error: 'boom', code: 'internal' } });
    await act(async () => { await queryClient.refetchQueries({ type: 'all' }); });
    await flush();
    await act(async () => { move(B); });
    await flush();
    // B's latest answer is a 500 and B never committed its 404: its last answer stays (an abandoned render records nothing).
    expect(got!.rows?.some((r) => r.sid === 's-far')).toBe(true);
    expect(got!.needs).toBe(1);
  });
});

// Rows carry state, pending_gate and origin; paged reads ask for last-active order.
describe('rows with state, pending gate and origin', () => {
  const recent = () => new Date(Date.now() - 60_000).toISOString();
  const origin = (o: Record<string, unknown> = {}) => ({ kind: 'bot', bot_uid: 'u-juno', bot_id: 'juno', realm: R1, ...o });

  it('paged session reads ask for order=last_active', async () => {
    await mount(R1);
    const q = of('/sessions').map((c) => new URL(c.url).searchParams);
    expect(q.length).toBeGreaterThan(0);
    for (const p of q) expect(p.get('order')).toBe('last_active');
  });

  it('rows with state: no state read and no delegate read; the marks and the Bot tag come from the rows', async () => {
    botsList = [{ id: 'juno', uid: 'u-juno', name: 'Juno', realm: R1, session_id: '' }];
    sessions = [
      row('s-run', { state: 'running', last_request_at: recent() }),
      row('s-wait', { state: 'parked', pending_gate: true, last_request_at: recent() }),
      row('s-del', { state: 'idle', last_request_at: recent(), origin: origin({ ref: 'w1' }) }),
      row('s-own', { state: 'idle', last_request_at: recent(), origin: origin() }),
    ];
    await mount(R1);
    expect(calls.filter((c) => /\/state$/.test(path(c.url)))).toHaveLength(0);
    expect(calls.filter((c) => /\/delegates$/.test(path(c.url)))).toHaveLength(0);
    const by = Object.fromEntries((got!.rows ?? []).map((r) => [r.sid, r]));
    expect(Object.keys(by).sort()).toEqual(['s-del', 's-run', 's-wait']);
    expect(by['s-run']!.mark).toBe('running');
    expect(by['s-wait']).toMatchObject({ group: 'needs', mark: 'needs' });
    expect(by['s-del']!.bot).toBe('Juno');
    expect(got!.needs).toBe(1);
  });

  it('a chat that moves to the front during the walk: the repeated row re-lists the pages before Show more ends', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    await mount(R1);
    expect(got!.rows).toHaveLength(50);
    // s-51 becomes active: it moves to the front, so page 2 now repeats s-50 and s-51 is on no page read so far.
    sessions = [sessions[50]!, ...sessions.slice(0, 50)];
    await act(async () => got!.loadMore!());
    await flush();
    expect(new Set(got!.rows!.map((r) => r.sid)).size).toBe(51);
    expect(got!.rows!.map((r) => r.sid)).toContain('s-51');
    expect(got!.loaded).toBe(51);
    expect(got!.loadMore).toBeUndefined();
  });

  it('while the re-list runs, Show more is not offered (no read of an empty later page)', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    await mount(R1);
    sessions = [sessions[50]!, ...sessions.slice(0, 50)];
    // Page 2 answers at once (the repeat); the re-list's reads take a while.
    let page2 = 0;
    const keep = handle;
    onFetch((c) => {
      const q = new URL(c.url).searchParams;
      if (path(c.url) !== '/sessions') return keep(c);
      if (q.get('page') === '2' && page2++ === 0) return keep(c);
      return { ...keep(c), delayMs: 3000 };
    });
    await act(async () => got!.loadMore!());
    await flush();
    expect(got!.loaded).toBe(50);
    expect(got!.loadMore).toBeUndefined();
    await vi.waitFor(() => expect(got!.loaded).toBe(51), { timeout: 8000 });
    expect(got!.loadMore).toBeUndefined();
  }, 20_000);

  it('a page that keeps repeating a row: at most two re-lists, then Show more stays offered (distinct chats < total)', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    await mount(R1);
    // Page 2 always repeats s-50 (s-51 never shows): the repair gives up and Show more is offered again.
    const keep = handle;
    onFetch((c) => {
      const q = new URL(c.url).searchParams;
      if (path(c.url) === '/sessions' && q.get('page') === '2') return { status: 200, body: { items: [sessions[49]], meta: { total: 51 } } };
      return keep(c);
    });
    const before = of('/sessions').length;
    await act(async () => got!.loadMore!());
    await flush();
    // Page 2 once, then two re-lists of both pages.
    expect(of('/sessions').length - before).toBe(5);
    expect(got!.loaded).toBe(50);
    expect(got!.loadMore).toBeDefined();
  });

  it('past the repair, an empty later page below the total ends the walk: no further Show more, the gap stays (Try again)', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    await mount(R1);
    // Page 2 always repeats s-50 and every later page is empty, the total still 51.
    const keep = handle;
    onFetch((c) => {
      const q = new URL(c.url).searchParams;
      if (path(c.url) === '/sessions' && Number(q.get('page')) >= 2) return { status: 200, body: { items: q.get('page') === '2' ? [sessions[49]] : [], meta: { total: 51 } } };
      return keep(c);
    });
    await act(async () => got!.loadMore!());
    await flush();
    expect(sessionGap(got!)).toBe('more');
    await act(async () => got!.loadMore!());
    await flush();
    expect(sessionGap(got!)).toBe('failed');
    expect(got!.loadMore).toBeUndefined();
    const pages = of('/sessions').length;
    await flush();
    expect(of('/sessions').length).toBe(pages);
    await act(async () => got!.refetch());
    await flush();
    expect(of('/sessions').length).toBeGreaterThan(pages);
  });

  it('a waiting chat read by itself shows the one chat a further page holds: the count stays above the rows', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    gates = [{ gate_id: 'g1', session_id: 's-51', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(got!.rows).toHaveLength(51);
    expect(got!.loaded).toBe(50);
    expect(sessionGap(got!)).toBe('more');
    expect(got!.loadMore).toBeDefined();
    expect(got!.shown!).toBeGreaterThan(got!.rows!.length);
  });

  it('while the last allowed re-list is still in flight, Show more is not offered; it returns once that re-list settles', async () => {
    paged = true;
    sessions = Array.from({ length: 51 }, (_, i) => row(`s-${i + 1}`, { state: 'idle' }));
    await mount(R1);
    // Page 2 always repeats s-50; its first read answers at once, every re-list read takes a while.
    let page2 = 0;
    const keep = handle;
    onFetch((c) => {
      const q = new URL(c.url).searchParams;
      if (path(c.url) !== '/sessions') return keep(c);
      const r = q.get('page') === '2' ? { status: 200, body: { items: [sessions[49]], meta: { total: 51 } } } : keep(c);
      return q.get('page') === '2' && page2++ === 0 ? r : { ...r, delayMs: 1500 };
    });
    const before = of('/sessions').length;
    await act(async () => got!.loadMore!());
    // Page 2 once, the first re-list (2 reads), then the second and last re-list has started (2 more reads).
    await vi.waitFor(() => expect(of('/sessions').length - before).toBe(5), { timeout: 8000 });
    expect(got!.loadMore).toBeUndefined();
    await vi.waitFor(() => expect(got!.loadMore).toBeDefined(), { timeout: 8000 });
    expect(of('/sessions').length - before).toBe(5);
    expect(got!.loaded).toBe(50);
  }, 20_000);

  it('an older waiting chat read by itself keeps its delegate read and Bot tag while the pages carry state', async () => {
    botsList = [{ id: 'juno', uid: 'u-juno', name: 'Juno', realm: R1, session_id: '' }];
    delegatesBy = { juno: ['s-far'] };
    sessions = [row('s-1', { state: 'idle' })];
    offPage = [row('s-far')];
    gates = [{ gate_id: 'g1', session_id: 's-far', realm: R1, kind: 'confirm' }];
    await mount(R1);
    expect(of('/bots/juno/delegates').length).toBeGreaterThan(0);
    const far = got!.rows!.find((r) => r.sid === 's-far');
    expect(far).toMatchObject({ group: 'needs', bot: 'Juno', rowState: false });
  });

  it('rows without state (an older agent): the bounded state reads and the delegate reads stay', async () => {
    botsList = [{ id: 'juno', uid: 'u-juno', name: 'Juno', realm: R1, session_id: '' }];
    sessions = [row('s-old', { last_request_at: recent() })];
    await mount(R1);
    expect(of('/sessions/s-old/state').length).toBeGreaterThan(0);
    expect(calls.filter((c) => /\/delegates$/.test(path(c.url))).length).toBeGreaterThan(0);
  });
});

// A caller holding its own change feed (the All computers list's GET /changes/stream) replaces the polled one.
function FeedProbe({ at, feed }: { at: ChatsAt; feed: ChatsFeed }) {
  got = useChats(at, { feed });
  return null;
}

describe('useChats with a change feed the caller holds', () => {
  it('sends no GET /changes; a token moved by the feed re-lists that list, as a polled answer would', async () => {
    const at: ChatsAt = { target: TARGET, realm: R1 };
    const view = (feed: ChatsFeed) => <QueryClientProvider client={queryClient}><FeedProbe at={at} feed={feed} /></QueryClientProvider>;
    const r = render(view({ tokens: { scope: 's', tokens: { sessions: 't1', gates: 't1' } }, live: true }));
    await flush();
    expect(of('/changes')).toHaveLength(0);
    expect(of('/sessions')).toHaveLength(1);
    expect(got?.rows?.map((x) => x.sid)).toEqual(expect.arrayContaining(['s-1', 's-2']));
    r.rerender(view({ tokens: { scope: 's', tokens: { sessions: 't2', gates: 't1' } }, live: true }));
    await flush();
    expect(of('/sessions')).toHaveLength(2);
    expect(of('/gates')).toHaveLength(1);
    expect(of('/changes')).toHaveLength(0);
  });
});

// The state reads' 30-minute window follows the clock (kit useNow, ticking with the state reads): a chat leaves it as time
// passes, without any list moving.
describe('the state window follows time', () => {
  it('a chat last active 29 minutes ago is state-read until it is past 30 minutes, then never again', async () => {
    vi.useFakeTimers();
    try {
      sessions = [row('s-old', { last_request_at: new Date(Date.now() - 29 * 60_000).toISOString() })];
      await mount(R1);
      const reads = () => of('/sessions/s-old/state').length;
      expect(reads()).toBeGreaterThan(0);
      // Still inside the window: the read repeats each state interval.
      const inside = reads();
      await act(async () => { await vi.advanceTimersByTimeAsync(STATE_MS + 10); });
      await flush();
      expect(reads()).toBeGreaterThan(inside);
      // Past the edge, plus one tick for the clock to see it; after that no further read.
      await act(async () => { await vi.advanceTimersByTimeAsync(45_000 + STATE_MS + 10); });
      await flush();
      const left = reads();
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * STATE_MS + 10); });
      await flush();
      expect(reads()).toBe(left);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});

describe('the AI page leaves gates page 1 to the shell observer only for the place it ticks', () => {
  it("another computer's list keeps its own slow re-read of gates page 1 while the observer ticks the top bar's computer", async () => {
    vi.useFakeTimers();
    try {
      gatesDown = true;
      function Observer() { useChatAttention(); return null; }
      render(<QueryClientProvider client={queryClient}><Observer /></QueryClientProvider>);
      await mount(R1, TARGET2);
      // The observer ticks a place (the top bar's computer), and it is not the second computer's.
      expect(chatTickedPlace()).not.toBeNull();
      expect(chatTickedPlace()).not.toContain(TARGET2.container.id);
      const second2 = () => of('/gates').filter(second).length;
      const before = second2();
      expect(before).toBeGreaterThan(0);
      expect(got!.gatesError).not.toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_MS + 10); });
      await flush();
      expect(second2(), "the second computer's gates page 1 is read again on the slow interval").toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
