// Vitest: useModelCatalogue's reads and setup attempts. Every
// read is a held promise the test answers, so the order of answers is the test's: an older seq never wins, an
// answer from another account, realm, generation or computer is dropped, an ended attempt has no effect, background
// evidence settles only a live attempt it started after, and the words of each settlement are the chooser's.
import { act, render, renderHook } from '@app/testing';
import { Activity, memo, StrictMode, startTransition, Suspense, useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump, setIdentity, setRealm, startLoggingOut, type Target } from '@core/ctx';
import { boot, OTHER, UID } from '@core/test/env';
import type { CatalogueReader } from '@core/providers/read';
import type { Outcome, Settled } from '@core/providers/types';
import { settleAttempt, useModelCatalogue, type AttemptResult, type CatalogueOptions, type CatalogueReads, type ModelCatalogue } from './useModelCatalogue';

const ERR: Outcome = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const no: Settled<unknown> = { ok: false, err: ERR };
const st = (state: string) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });

const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };

/** One computer's answer: the provider states, the ready list, and which read fails. */
interface Answer {
  openai?: 'ready' | 'needs_key';
  ready?: string[];
  fail?: 'providers' | 'ready';
  /** An older agent: no provider status. */
  legacy?: boolean;
}
const READY_FREE = ['hoody-ai/hoody-free'];
function bodies(a: Answer) {
  const s = (x: string) => (a.legacy ? {} : { status: st(x) });
  return {
    providers: { providers: [
      { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', ...s('ready') },
      { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', ...s(a.openai ?? 'needs_key') },
    ] },
    models: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }, { spec: 'openai/gpt-4o' }] },
    ready: { models: (a.ready ?? READY_FREE).map((spec) => ({ spec })) },
  };
}

/** A read the test answers: `answer(a)` settles it. */
interface Held {
  target: Target;
  answer(a: Answer): Promise<void>;
  throws(): Promise<void>;
}
function harness() {
  const held: Held[] = [];
  const acp = vi.fn(() => Promise.resolve(ok({ report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models: [] } }) as never));
  const reads = (target: Target): CatalogueReads => {
    let settle!: (a: Answer | null) => void;
    const gate = new Promise<Answer | null>((res) => { settle = res; });
    const after = <T,>(pick: (a: Answer) => T): Promise<T> => gate.then((a) => { if (!a) throw new Error('network'); return pick(a); });
    held.push({
      target,
      answer: async (a) => { await act(async () => { settle(a); await gate; await Promise.resolve(); }); await flush(); },
      throws: async () => { await act(async () => { settle(null); }); await flush(); },
    });
    const catalogue = {
      providers: () => after((a) => (a.fail === 'providers' ? no : ok(bodies(a).providers))),
      models: (q: { ready?: boolean } = {}) => after((a) => (q.ready ? (a.fail === 'ready' ? no : ok(bodies(a).ready)) : ok(bodies(a).models))),
      auth: () => Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } })),
    } as unknown as CatalogueReader;
    return { catalogue, acp };
  };
  return { held, acp, reads };
}

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

function mount(o: Partial<CatalogueOptions> = {}, target: Target | null = A, strict = false) {
  const h = harness();
  let clock = 1000;
  let opts: Partial<CatalogueOptions> = o;
  let t0 = target;
  const props = () => ({ t: t0, o: { reads: h.reads, now: () => clock, ...opts } });
  const r = renderHook((p: { t: Target | null; o: CatalogueOptions }) => useModelCatalogue(p.t, p.o), { initialProps: props(), reactStrictMode: strict });
  return {
    ...h,
    ...r,
    get cur(): ModelCatalogue { return r.result.current; },
    at(n: number) { clock = n; },
    move(t: Target | null) { t0 = t; r.rerender(props()); },
    set(next: Partial<CatalogueOptions>) { opts = { ...o, ...next }; r.rerender(props()); },
  };
}

const okPart = (c: ModelCatalogue) => (c.evidence?.catalogue.state === 'ok' ? c.evidence.catalogue.value : null);

beforeEach(() => { boot(); });
afterEach(() => { vi.useRealTimers(); });

describe('useModelCatalogue: reads', () => {
  it('reads on mount and shows the evidence of today\'s scope', async () => {
    const m = mount();
    expect(m.held).toHaveLength(1);
    expect(m.cur.evidence).toBeNull();
    expect(m.cur.reading).toBe(true);
    await m.held[0]!.answer({});
    expect(m.cur.evidence?.seq).toBe(1);
    expect(m.cur.evidence?.scope.computer).toBe('p1|c1|sv1');
    expect(m.cur.evidence?.scope.account).toBe(UID);
    expect(okPart(m.cur)?.ready).toBe('ok');
    expect(m.cur.reading).toBe(false);
  });

  it('no computer: no scope, no read', () => {
    const m = mount({}, null);
    expect(m.cur.scope).toBeNull();
    expect(m.held).toHaveLength(0);
  });

  it('an older seq never wins: a read of the same computer that started first and answers last is dropped', async () => {
    const m = mount();
    m.move(B);
    m.move(A);
    expect(m.held.map((x) => x.target.container.id)).toEqual(['c1', 'c2', 'c1']);
    await m.held[2]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.evidence?.seq).toBe(3);
    await m.held[0]!.answer({});
    expect(m.cur.evidence?.seq).toBe(3);
    expect(okPart(m.cur)?.cat.readySpecs).toHaveProperty(['openai/gpt-5']);
  });

  it('a trigger while a read runs reads once more after it, never twice at once', async () => {
    const m = mount();
    act(() => { m.cur.retry(); m.cur.retry(); });
    expect(m.held).toHaveLength(1);
    await m.held[0]!.answer({});
    expect(m.held).toHaveLength(2);
    await m.held[1]!.answer({});
    expect(m.held).toHaveLength(2);
    expect(m.cur.evidence?.seq).toBe(2);
  });

  it.each([
    ['another computer', (m: ReturnType<typeof mount>) => m.move(B)],
    ['another realm', () => setRealm('aaaaaaaaaaaaaaaaaaaaaaa1')],
    ['another generation', () => bump('switch')],
    ['another account', () => setIdentity({ id: OTHER, banned: false })],
    ['sign-out started (same scope, context dead)', () => startLoggingOut()],
  ])('an answer after %s is dropped', async (name, change) => {
    const m = mount();
    act(() => { change(m); });
    await m.held[0]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.evidence).toBeNull();
    // Sign-out reads nothing new; a shown account that differs from the stored session's is dead for the new read too.
    if (name.startsWith('sign-out') || name === 'another account') return;
    // The new scope's own read fails: the dropped answer was never kept, so nothing older stands in for it.
    expect(m.held).toHaveLength(2);
    await m.held[1]!.answer({ fail: 'providers' });
    expect(m.cur.evidence?.seq).toBe(2);
    expect(m.cur.evidence?.catalogue.state).toBe('failed');
    expect(m.cur.failedAt).toBeNull();
  });

  it('a scope change drops the evidence and reads the new scope', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    expect(m.cur.evidence).not.toBeNull();
    m.move(B);
    expect(m.cur.evidence).toBeNull();
    expect(m.held).toHaveLength(2);
    await m.held[1]!.answer({});
    expect(m.cur.evidence?.scope.computer).toBe('p1|c2|sv1');
  });

  it('after a scope change, a failed first read is the new scope\'s failure, never the old scope\'s evidence', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    m.move(B);
    await m.held[1]!.answer({ fail: 'providers' });
    expect(m.cur.evidence?.catalogue.state).toBe('failed');
    expect(m.cur.evidence?.scope.computer).toBe('p1|c2|sv1');
    expect(m.cur.failedAt).toBeNull();
  });

  it('a failed background read keeps the evidence with its age', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    const first = m.cur.evidence;
    m.at(61_000);
    act(() => { m.cur.retry(); });
    await m.held[1]!.answer({ fail: 'providers' });
    expect(m.cur.evidence).toBe(first);
    expect(m.cur.evidence?.at).toBe(1000);
    expect(m.cur.failedAt).toBe(61_000);
    act(() => { m.cur.retry(); });
    await m.held[2]!.answer({});
    expect(m.cur.failedAt).toBeNull();
    expect(m.cur.evidence?.seq).toBe(3);
  });

  it('with no evidence yet, a failed read is a settled failed part, never loading', async () => {
    const m = mount();
    await m.held[0]!.answer({ fail: 'providers' });
    expect(m.cur.evidence?.catalogue.state).toBe('failed');
    expect(m.cur.failedAt).toBeNull();
  });

  it('a read that throws settles as failed too', async () => {
    const m = mount();
    await m.held[0]!.throws();
    expect(m.cur.evidence?.catalogue.state).toBe('failed');
  });

  it('the Claude Code part is read only when the caller offers it', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    expect(m.acp).not.toHaveBeenCalled();
    expect(m.cur.evidence?.claude).toBeNull();
    const c = mount({ claude: true });
    await c.held[0]!.answer({});
    expect(c.acp).toHaveBeenCalledTimes(1);
    expect(c.cur.evidence?.claude).toEqual({ state: 'ok', value: expect.objectContaining({ state: 'ready' }) });
  });

  it('returning to the tab reads again at most once per 10 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(100_000);
    const m = mount();
    await m.held[0]!.answer({});
    const back = async () => { act(() => { window.dispatchEvent(new Event('focus')); }); await flush(); };
    await back();
    expect(m.held).toHaveLength(2);
    await m.held[1]!.answer({});
    vi.setSystemTime(109_999);
    await back();
    expect(m.held).toHaveLength(2);
    vi.setSystemTime(110_000);
    await back();
    expect(m.held).toHaveLength(3);
  });
});

describe('useModelCatalogue: a pressed Try again', () => {
  const press = (m: ReturnType<typeof mount>) => act(async () => { m.cur.pressRetry(); });

  it('pending from the press until its read answers, then nothing', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    expect(m.cur.retrying).toBe(false);
    await press(m);
    expect(m.held).toHaveLength(2);
    expect(m.cur.retrying).toBe(true);
    await m.held[1]!.answer({});
    expect(m.cur.retrying).toBe(false);
    expect(m.cur.reading).toBe(false);
  });

  it('a read nobody pressed for shows no pending', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    await act(async () => { m.cur.retry(); });
    expect(m.cur.reading).toBe(true);
    expect(m.cur.retrying).toBe(false);
  });

  it('a press during a silent read stays pending through the queued read it asked for', async () => {
    const m = mount();
    await press(m);
    expect(m.held).toHaveLength(1);
    expect(m.cur.retrying).toBe(true);
    await m.held[0]!.answer({});
    expect(m.held).toHaveLength(2);
    expect(m.cur.retrying).toBe(true);
    await m.held[1]!.answer({});
    expect(m.cur.retrying).toBe(false);
  });

  it('a second press during a pressed read stays pending through the queued read it asked for', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    await press(m);
    expect(m.held).toHaveLength(2);
    await press(m);
    expect(m.held).toHaveLength(2);
    expect(m.cur.retrying).toBe(true);
    await m.held[1]!.answer({});
    expect(m.held).toHaveLength(3);
    expect(m.cur.reading).toBe(true);
    expect(m.cur.retrying).toBe(true);
    await m.held[2]!.answer({});
    expect(m.cur.retrying).toBe(false);
  });

  it('a silent trigger during a pressed read ends pending with that read, not the queued one', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    await press(m);
    await act(async () => { m.cur.retry(); });
    await m.held[1]!.answer({});
    expect(m.held).toHaveLength(3);
    expect(m.cur.reading).toBe(true);
    expect(m.cur.retrying).toBe(false);
    await m.held[2]!.answer({});
    expect(m.cur.retrying).toBe(false);
  });

  it('another computer ends the pending state, and the old read answering leaves it off', async () => {
    const m = mount();
    await m.held[0]!.answer({});
    await press(m);
    expect(m.cur.retrying).toBe(true);
    act(() => { m.move(B); });
    expect(m.cur.retrying).toBe(false);
    await act(async () => { m.cur.retry(); });
    await m.held[1]!.answer({});
    expect(m.cur.retrying).toBe(false);
  });

  it('a press with no computer starts nothing and shows nothing', async () => {
    const m = mount({}, null);
    await press(m);
    expect(m.held).toHaveLength(0);
    expect(m.cur.retrying).toBe(false);
  });
});

describe('useModelCatalogue: visits own their reads', () => {
  it('A, B, back to A; the first A read answers before the second: dropped, and a failed second read keeps nothing of it', async () => {
    const m = mount();
    m.move(B);
    m.move(A);
    expect(m.held.map((x) => x.target.container.id)).toEqual(['c1', 'c2', 'c1']);
    await m.held[0]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.evidence).toBeNull();
    await m.held[2]!.answer({ fail: 'providers' });
    expect(m.cur.evidence?.seq).toBe(3);
    expect(m.cur.evidence?.catalogue.state).toBe('failed');
    expect(m.cur.failedAt).toBeNull();
  });

  it('under StrictMode a mount reads once, and that read answers', async () => {
    const m = mount({}, A, true);
    expect(m.held).toHaveLength(1);
    await m.held[0]!.answer({});
    expect(m.cur.evidence?.seq).toBe(1);
    expect(m.held).toHaveLength(1);
  });

  it('under StrictMode each visit reads once (A, B, A: three reads), and only the current visit\'s read lands', async () => {
    const m = mount({}, A, true);
    m.move(B);
    m.move(A);
    expect(m.held.map((x) => x.target.container.id)).toEqual(['c1', 'c2', 'c1']);
    await m.held[0]!.answer({});
    await m.held[1]!.answer({});
    expect(m.cur.evidence).toBeNull();
    await m.held[2]!.answer({});
    expect(m.cur.evidence?.seq).toBe(3);
  });

  it('turning the Claude offer on is a new visit; the read without Claude never lands', async () => {
    const m = mount();
    m.set({ claude: true });
    expect(m.held).toHaveLength(2);
    await m.held[0]!.answer({});
    expect(m.cur.evidence).toBeNull();
    await m.held[1]!.answer({});
    expect(m.cur.evidence?.claude).toEqual({ state: 'ok', value: expect.objectContaining({ state: 'ready' }) });
  });

  it('at the commit that shows another computer, the old attempt is dead and hidden, even to a child\'s layout effect', async () => {
    const h = harness();
    const seen: Array<{ computer: string; alive: boolean; setup: number | null }> = [];
    let handle: ReturnType<ModelCatalogue['attempt']> | null = null;
    let open: ModelCatalogue['attempt'] | null = null;
    function Probe({ cat }: { cat: ModelCatalogue }) {
      // A child's layout effect runs before its parent's: the earliest point of the commit.
      useLayoutEffect(() => {
        if (handle) seen.push({ computer: cat.scope?.computer ?? '', alive: handle.alive(), setup: cat.setup?.id ?? null });
      });
      return null;
    }
    function Host({ t }: { t: Target }) {
      const cat = useModelCatalogue(t, { reads: h.reads });
      open = cat.attempt;
      return <Probe cat={cat} />;
    }
    const r = render(<StrictMode><Host t={A} /></StrictMode>);
    await h.held[0]!.answer({});
    act(() => { handle = open!({ provider: 'openai', intent: 'browse' }); });
    expect(handle!.alive()).toBe(true);
    seen.length = 0;
    r.rerender(<StrictMode><Host t={B} /></StrictMode>);
    const first = seen.find((x) => x.computer === 'p1|c2|sv1');
    expect(first).toEqual({ computer: 'p1|c2|sv1', alive: false, setup: null });
    expect(seen.every((x) => !x.alive && x.setup === null)).toBe(true);
  });
});

describe('useModelCatalogue: effects that disconnect and abandoned renders (under StrictMode)', () => {
  function activityHost(h: ReturnType<typeof harness>) {
    const box: { cat: ModelCatalogue | null } = { cat: null };
    function Host() {
      box.cat = useModelCatalogue(A, { reads: h.reads });
      return null;
    }
    const tree = (mode: 'visible' | 'hidden') => <StrictMode><Activity mode={mode}><Host /></Activity></StrictMode>;
    const r = render(tree('visible'));
    return { box, show: (mode: 'visible' | 'hidden') => act(() => { r.rerender(tree(mode)); }) };
  }

  it('hidden while the first read is out, answered while hidden, shown again: one new read, then evidence', async () => {
    const h = harness();
    const a = activityHost(h);
    a.show('hidden');
    await h.held[0]!.answer({});
    a.show('visible');
    expect(h.held).toHaveLength(2);
    expect(a.box.cat!.reading).toBe(true);
    await h.held[1]!.answer({});
    expect(a.box.cat!.evidence?.seq).toBe(2);
    expect(a.box.cat!.reading).toBe(false);
  });

  it('an attempt hidden by Activity ends, and its view is gone when shown again', async () => {
    const h = harness();
    const a = activityHost(h);
    await h.held[0]!.answer({});
    let at!: ReturnType<ModelCatalogue['attempt']>;
    const onSettle = vi.fn();
    act(() => { at = a.box.cat!.attempt({ provider: 'openai', intent: 'browse', onSettle }); });
    expect(a.box.cat!.setup?.result.kind).toBe('checking');
    a.show('hidden');
    await h.held[1]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    a.show('visible');
    expect(at.alive()).toBe(false);
    expect(a.box.cat!.setup).toBeNull();
    for (const x of h.held.slice(2)) await x.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(onSettle).not.toHaveBeenCalled();
    expect(a.box.cat!.reading).toBe(false);
  });

  it('a read still out when Activity shows the hook again is kept: no second read, its answer lands', async () => {
    const h = harness();
    const a = activityHost(h);
    a.show('hidden');
    a.show('visible');
    expect(h.held).toHaveLength(1);
    await h.held[0]!.answer({});
    expect(a.box.cat!.evidence?.seq).toBe(1);
  });

  it('a transition to another computer that suspends and is abandoned leaves the committed attempt alive', async () => {
    const h = harness();
    const never = new Promise<never>(() => undefined);
    let open: ModelCatalogue['attempt'] | null = null;
    let setT: (t: Target) => void = () => undefined;
    function Child({ t }: { t: Target }) {
      if (t === B) throw never;
      return null;
    }
    const Host = memo(function Host({ t }: { t: Target }) {
      const cat = useModelCatalogue(t, { reads: h.reads });
      open = cat.attempt;
      return <Child t={t} />;
    });
    function Root() {
      const [t, set] = useState<Target>(A);
      setT = set;
      return <Suspense fallback={<p>loading</p>}><Host t={t} /></Suspense>;
    }
    render(<StrictMode><Root /></StrictMode>);
    await h.held[0]!.answer({});
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = open!({ provider: 'openai', intent: 'browse' }); });
    expect(at.alive()).toBe(true);
    // B renders the hook, then suspends below it; the transition keeps A on screen.
    await act(async () => { startTransition(() => setT(B)); await Promise.resolve(); });
    // Back to A: the memoized host bails out, so the hook does not render again.
    await act(async () => { setT(A); await Promise.resolve(); });
    expect(at.alive()).toBe(true);
    let next!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { next = open!({ provider: 'openai', intent: 'browse' }); });
    expect(next.alive()).toBe(true);
  });
});

describe('useModelCatalogue: the computer address is part of the visit', () => {
  it('a computer whose address arrives after the first render reads again at the address', async () => {
    const bare: Target = { project: { id: 'p1' }, container: { id: 'c1' } };
    const m = mount({}, bare);
    await m.held[0]!.throws();
    expect(m.held).toHaveLength(1);
    m.move(A);
    expect(m.held).toHaveLength(2);
    expect(m.held[1]!.target.container.server_name).toBe('sv1');
    await m.held[1]!.answer({});
    expect(m.cur.evidence?.scope.computer).toBe('p1|c1|sv1');
    expect(okPart(m.cur)?.ready).toBe('ok');
  });

  it('the same computer on another server is another visit: the first server\'s evidence never shows', async () => {
    const m = mount();
    await m.held[0]!.answer({ openai: 'ready' });
    m.move({ project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv2' } });
    expect(m.cur.evidence).toBeNull();
    expect(m.held).toHaveLength(2);
    expect(m.held[1]!.target.container.server_name).toBe('sv2');
  });
});

describe('useModelCatalogue: an abandoned render changes no option (under StrictMode, with Activity)', () => {
  /** StrictMode > Activity > Suspense > memo host whose child suspends on the `next` options: a transition there is abandoned. */
  function optsHost(first: CatalogueOptions, next: CatalogueOptions) {
    const never = new Promise<never>(() => undefined);
    const box: { cat: ModelCatalogue | null } = { cat: null };
    let setO: (o: CatalogueOptions) => void = () => undefined;
    function Child({ o }: { o: CatalogueOptions }) {
      if (o === next) throw never;
      return null;
    }
    const Host = memo(function Host({ o }: { o: CatalogueOptions }) {
      box.cat = useModelCatalogue(A, o);
      return <Child o={o} />;
    });
    function Root({ mode }: { mode: 'visible' | 'hidden' }) {
      const [o, set] = useState<CatalogueOptions>(first);
      setO = set;
      return <Activity mode={mode}><Suspense fallback={<p>loading</p>}><Host o={o} /></Suspense></Activity>;
    }
    const tree = (mode: 'visible' | 'hidden') => <StrictMode><Root mode={mode} /></StrictMode>;
    const r = render(tree('visible'));
    return {
      box,
      show: (mode: 'visible' | 'hidden') => act(() => { r.rerender(tree(mode)); }),
      abandonNext: async () => {
        await act(async () => { startTransition(() => setO(next)); await Promise.resolve(); });
        await act(async () => { setO(first); await Promise.resolve(); });
      },
    };
  }

  it('an abandoned render that offers Claude leaves the committed visit without it: Try again reads no Claude part', async () => {
    const h = harness();
    const first: CatalogueOptions = { reads: h.reads };
    const a = optsHost(first, { reads: h.reads, claude: true });
    a.show('hidden');
    a.show('visible');
    for (const x of [...h.held]) await x.answer({});
    const before = h.held.length;
    await a.abandonNext();
    expect(h.held).toHaveLength(before);
    act(() => { a.box.cat!.retry(); });
    expect(h.held.length).toBeGreaterThan(before);
    for (const x of h.held) await x.answer({});
    expect(h.acp).not.toHaveBeenCalled();
    expect(a.box.cat!.evidence?.claude).toBeNull();
  });

  it("an abandoned render with other reads leaves the committed reads: Try again reads through the committed caller's reads", async () => {
    const h = harness();
    const other = harness();
    const first: CatalogueOptions = { reads: h.reads };
    const a = optsHost(first, { reads: other.reads });
    a.show('hidden');
    a.show('visible');
    for (const x of [...h.held]) await x.answer({});
    const before = h.held.length;
    await a.abandonNext();
    act(() => { a.box.cat!.retry(); });
    expect(other.held).toHaveLength(0);
    expect(h.held.length).toBe(before + 1);
  });
});

describe('useModelCatalogue: setup attempts', () => {
  async function ready() {
    const m = mount();
    await m.held[0]!.answer({});
    return m;
  }

  it('the attempt reads itself and settles: chosen when the remembered model is ready', async () => {
    const m = await ready();
    const seen: AttemptResult[] = [];
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose', onSettle: (r) => seen.push(r) }); });
    expect(at.minSeq).toBe(2);
    expect(m.held).toHaveLength(2);
    expect(m.cur.setup?.result).toEqual({ kind: 'checking' });
    expect(at.alive()).toBe(true);
    await m.held[1]!.answer({ openai: 'ready', ready: ['hoody-ai/hoody-free', 'openai/gpt-5'] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'chosen', choice: { kind: 'model', spec: 'openai/gpt-5', readiness: 'ready', consent: false, seq: 2 } });
    expect(m.cur.setup?.result.kind).toBe('chosen');
    // A chosen model settles once.
    expect(at.alive()).toBe(false);
    act(() => { m.cur.retry(); });
    await m.held[2]!.answer({ openai: 'ready', ready: ['hoody-ai/hoody-free', 'openai/gpt-5'] });
    expect(seen).toHaveLength(1);
    act(() => { at.end(); });
    expect(m.cur.setup).toBeNull();
  });

  it('providers and models read but the ready read failed: unconfirmed ("Key saved. Couldn\'t confirm readiness.")', async () => {
    const m = await ready();
    act(() => { m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose' }); });
    await m.held[1]!.answer({ openai: 'ready', fail: 'ready' });
    expect(m.cur.setup?.result).toEqual({ kind: 'unconfirmed' });
  });

  it('an older agent (no trusted list): unconfirmed', async () => {
    const m = await ready();
    act(() => { m.cur.attempt({ provider: 'openai', intent: 'browse' }); });
    await m.held[1]!.answer({ legacy: true });
    expect(m.cur.setup?.result).toEqual({ kind: 'unconfirmed' });
  });

  it('still needs setup: the step stays, and nothing is chosen', async () => {
    const m = await ready();
    const onSettle = vi.fn();
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose', onSettle }); });
    await m.held[1]!.answer({ openai: 'needs_key' });
    expect(m.cur.setup?.result).toEqual({ kind: 'still_needs' });
    expect(onSettle).toHaveBeenCalledWith({ kind: 'still_needs' });
    expect(at.alive()).toBe(true);
  });

  it('its own read failed and nothing newer settled it: read_failed; a newer read then settles it', async () => {
    const m = await ready();
    act(() => { m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose' }); });
    await m.held[1]!.answer({ fail: 'providers' });
    expect(m.cur.setup?.result).toEqual({ kind: 'read_failed' });
    act(() => { m.cur.retry(); });
    await m.held[2]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.setup?.result.kind).toBe('chosen');
  });

  it('a failed read never undoes a settled result', async () => {
    const m = await ready();
    act(() => { m.cur.attempt({ provider: 'openai', intent: 'browse' }); });
    await m.held[1]!.answer({ openai: 'needs_key' });
    act(() => { m.cur.retry(); });
    await m.held[2]!.answer({ fail: 'providers' });
    expect(m.cur.setup?.result).toEqual({ kind: 'still_needs' });
  });

  it('background evidence older than the attempt never settles it, and only a read started after does', async () => {
    const m = mount();
    const onSettle = vi.fn();
    // The mount read (seq 1) is still out when the key is saved.
    act(() => { m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose', onSettle }); });
    expect(m.cur.setup?.minSeq).toBe(2);
    expect(m.held).toHaveLength(1);
    await m.held[0]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.evidence?.seq).toBe(1);
    expect(onSettle).not.toHaveBeenCalled();
    expect(m.cur.setup?.result).toEqual({ kind: 'checking' });
    expect(m.held).toHaveLength(2);
    await m.held[1]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'chosen' }));
  });

  it('background evidence with no attempt neither chooses nor opens anything', async () => {
    const m = await ready();
    act(() => { m.cur.retry(); });
    await m.held[1]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(m.cur.setup).toBeNull();
  });

  it.each([
    ['Back during confirmation', (m: ReturnType<typeof mount>, at: { end(): void }) => act(() => { at.end(); })],
    ['another pick', (m: ReturnType<typeof mount>) => act(() => { m.cur.attempt({ provider: 'hoody-ai', intent: 'browse' }); })],
    ['a scope change', (m: ReturnType<typeof mount>) => m.move(B)],
    ['unmount', (m: ReturnType<typeof mount>) => m.unmount()],
  ])('%s: the attempt has no effect', async (name, end) => {
    const m = await ready();
    const onSettle = vi.fn();
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = m.cur.attempt({ provider: 'openai', spec: 'openai/gpt-5', intent: 'choose', onSettle }); });
    end(m, at);
    expect(at.alive()).toBe(false);
    for (const h of m.held.slice(1)) await h.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(onSettle).not.toHaveBeenCalled();
    if (name !== 'unmount' && name !== 'another pick') expect(m.cur.setup).toBeNull();
    if (name === 'another pick') expect(m.cur.setup?.provider).toBe('hoody-ai');
  });

  it('a generation change makes the attempt dead before any re-render', async () => {
    const m = await ready();
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = m.cur.attempt({ provider: 'openai', intent: 'browse' }); });
    bump('switch');
    expect(at.alive()).toBe(false);
  });
});

describe('settleAttempt: the settlement table', () => {
  async function evidenceOf(a: Answer) {
    const m = mount();
    await m.held[0]!.answer(a);
    return m.cur.evidence!;
  }
  it.each<[string, Answer, { spec?: string; intent: 'choose' | 'browse' }, AttemptResult['kind']]>([
    ['not_yet: the provider has ready models, not the remembered one', { openai: 'ready', ready: ['openai/gpt-4o'] }, { spec: 'openai/gpt-5', intent: 'choose' }, 'not_yet'],
    ['ready_now: browse, a model of the provider is ready', { openai: 'ready', ready: ['openai/gpt-4o'] }, { intent: 'browse' }, 'ready_now'],
    ['none_ready: the trusted list holds none of the provider', { openai: 'ready', ready: READY_FREE }, { intent: 'browse' }, 'none_ready'],
    ['none_ready for choose too', { openai: 'ready', ready: READY_FREE }, { spec: 'openai/gpt-5', intent: 'choose' }, 'none_ready'],
    ['choose without a model is browse', { openai: 'ready', ready: ['openai/gpt-4o'] }, { intent: 'choose' }, 'ready_now'],
    ['a ready spec the models read lacks still counts (the whole trusted list)', { openai: 'ready', ready: ['openai/gpt-9'] }, { intent: 'browse' }, 'ready_now'],
    ['browse never chooses, even with a ready model remembered', { openai: 'ready', ready: ['openai/gpt-5'] }, { spec: 'openai/gpt-5', intent: 'browse' }, 'ready_now'],
    ['still_needs wins over a failed ready read', { openai: 'needs_key', fail: 'ready' }, { intent: 'browse' }, 'still_needs'],
  ])('%s', async (_n, a, at, kind) => {
    expect(settleAttempt(await evidenceOf(a), { provider: 'openai', ...at }).kind).toBe(kind);
  });
});

describe('useModelCatalogue: an abandoned render moves no computer or scope (under StrictMode, with Activity)', () => {
  /** StrictMode > Activity > Suspense > memo host whose child suspends on B: a transition to B is abandoned. */
  function abandonHost(h: ReturnType<typeof harness>) {
    const never = new Promise<never>(() => undefined);
    const box: { cat: ModelCatalogue | null } = { cat: null };
    let setT: (t: Target) => void = () => undefined;
    function Child({ t }: { t: Target }) {
      if (t === B) throw never;
      return null;
    }
    const Host = memo(function Host({ t }: { t: Target }) {
      box.cat = useModelCatalogue(t, { reads: h.reads });
      return <Child t={t} />;
    });
    function Root({ mode }: { mode: 'visible' | 'hidden' }) {
      const [t, set] = useState<Target>(A);
      setT = set;
      return <Activity mode={mode}><Suspense fallback={<p>loading</p>}><Host t={t} /></Suspense></Activity>;
    }
    const tree = (mode: 'visible' | 'hidden') => <StrictMode><Root mode={mode} /></StrictMode>;
    const r = render(tree('visible'));
    return {
      box,
      show: (mode: 'visible' | 'hidden') => act(() => { r.rerender(tree(mode)); }),
      /** B renders the hook and suspends below it; then back to A, where the memoized host bails out. */
      abandonB: async () => {
        await act(async () => { startTransition(() => setT(B)); await Promise.resolve(); });
        await act(async () => { setT(A); await Promise.resolve(); });
      },
    };
  }

  it('after Activity hide/show, a pending confirmation still settles ready_now after an abandoned B transition', async () => {
    const h = harness();
    const a = abandonHost(h);
    a.show('hidden');
    await h.held[0]!.answer({});
    a.show('visible');
    expect(h.held).toHaveLength(2);
    await h.held[1]!.answer({});
    const onSettle = vi.fn();
    let at!: ReturnType<ModelCatalogue['attempt']>;
    act(() => { at = a.box.cat!.attempt({ provider: 'openai', intent: 'browse', onSettle }); });
    expect(h.held).toHaveLength(3);
    await a.abandonB();
    await h.held[2]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(at.alive()).toBe(true);
    expect(a.box.cat!.setup?.result.kind).toBe('ready_now');
    expect(onSettle).toHaveBeenCalledWith({ kind: 'ready_now' });
    expect(a.box.cat!.reading).toBe(false);
    expect(a.box.cat!.evidence?.seq).toBe(3);
  });

  it('after Activity hide/show and an abandoned B transition, a new attempt reads the committed computer c1 and settles', async () => {
    const h = harness();
    const a = abandonHost(h);
    a.show('hidden');
    await h.held[0]!.answer({});
    a.show('visible');
    await h.held[1]!.answer({});
    await a.abandonB();
    expect(h.held).toHaveLength(2);
    const onSettle = vi.fn();
    act(() => { a.box.cat!.attempt({ provider: 'openai', intent: 'browse', onSettle }); });
    expect(h.held).toHaveLength(3);
    expect(h.held[2]!.target.container.id).toBe('c1');
    await h.held[2]!.answer({ openai: 'ready', ready: ['openai/gpt-5'] });
    expect(a.box.cat!.setup?.result.kind).toBe('ready_now');
    expect(onSettle).toHaveBeenCalledWith({ kind: 'ready_now' });
  });
});
