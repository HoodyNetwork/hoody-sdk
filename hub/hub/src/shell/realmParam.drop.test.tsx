// The shell takes ?open_realm= out of the address as it is
// when it drops it, never by writing back the address it read. A page that changed the address meanwhile keeps its
// change: the Board drops an Add link at once (its replace to /board), and the realm cleanup must not put the link back
// (taken again as a new entry, a second tile); a param another hook set after the shell read the address stays.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserHistory, createHashHistory, createMemoryHistory, RouterProvider, useBlocker, useRouter } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { type ReactElement, StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchParam } from '@kit/nav';
import { definePage, type PageManifest } from '@kit/page';
import type * as ToastModule from '@kit/states/Toast';
import { buildRouter, createHubHashHistory } from '../app/router';
import boardStrings from '../pages/board/strings.en.json';
import { useAddLinks } from '../pages/board/parts/BoardView';
import { useKeepPage } from './pageHost';

const ctl = vi.hoisted(() => ({
  selected: 'all',
  pinned: null as string | null,
  list: null as string[] | null,
  loaded: [] as string[],
  loadFails: false,
  loadWait: null as null | Promise<unknown>,
  loads: 0,
  switches: [] as string[],
  switchTo: null as null | ((id: string) => Promise<boolean>),
  // Core's pending switch (its token), the revision that moves on every start, and the switches cancelled.
  current: 0,
  token: 0,
  rev: 0,
  cancels: [] as string[],
  // load() falling back from a stored realm the list no longer has (core's own: no revision move).
  fallback: false,
  mounts: [] as string[],
  toasts: [] as { title: string; body?: string; tone?: string }[],
}));
vi.mock('@kit/states/Toast', async (importOriginal) => {
  const real = await importOriginal<typeof ToastModule>();
  return {
    ...real,
    showToast: (c: { title: string; body?: string; tone?: string }, ms?: number) => {
      ctl.toasts.push(c);
      return real.showToast(c as never, ms);
    },
  };
});
vi.mock('@core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRealms: () => ({ selected: ctl.selected, pinned: ctl.pinned, rows: [] }),
}));
vi.mock('@core/shell', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  realmList: () => ctl.list,
  loadRealms: async () => {
    ctl.loads += 1;
    if (ctl.loadWait) await ctl.loadWait;
    if (ctl.loadFails) throw new Error('offline');
    ctl.list = ctl.loaded;
    if (ctl.fallback) ctl.selected = 'all';
    return ctl.list;
  },
  // Core's rules: a start moves the revision; the newest switch supersedes an older pending one, and
  // a cancelled one never commits (both resolve false, silently).
  beginSwitch: (id: string) => {
    ctl.switches.push(id);
    const me = ++ctl.token;
    ctl.current = me;
    ctl.rev += 1;
    const done = (ctl.switchTo ? ctl.switchTo(id) : Promise.resolve(true)).then((ok) => {
      if (ctl.current !== me) return false;
      ctl.current = 0;
      if (ok) ctl.selected = id;
      return ok;
    });
    return {
      done,
      cancel: () => {
        if (ctl.current !== me) return;
        ctl.current = 0;
        ctl.cancels.push(id);
      },
    };
  },
  switchRevision: () => ctl.rev,
  snapshot: () => ({ realm: ctl.selected }),
}));
const ID = '6a00000000000000000000c1';
const ID2 = '6a00000000000000000000c2';
const CID = 'c0a7150000000000000000a1';
const taken: number[] = [];
// Every history a test made: a hash history listens on the window until it is destroyed.
const histories: { destroy: () => void }[] = [];

function Board() {
  useKeepPage(true);
  const adds = useAddLinks();
  const last = adds.queue.at(-1)?.n;
  if (last !== undefined && !taken.includes(last)) taken.push(last);
  return <h1 data-hub-title tabIndex={-1}>Board</h1>;
}
// A page that sets a param of its own when a link with open_realm reaches it while it is shown (its effect runs in the
// same commit as the shell's, before it: the shell is its ancestor).
function Mark() {
  const [asked] = useSearchParam('open_realm');
  const [, setX] = useSearchParam('x');
  useEffect(() => {
    if (asked !== undefined) setX('1', { replace: true });
  }, [asked, setX]);
  return <h1 data-hub-title tabIndex={-1}>Mark</h1>;
}
// A page that, when a link with open_realm reaches it while shown, asks for another value of the same param in that
// commit (a newer request): the shell's drop of the older value must leave the newer one alone.
function Swap() {
  const [asked, setAsked] = useSearchParam('open_realm');
  useEffect(() => {
    if (asked === ID) setAsked('later', { replace: true });
  }, [asked, setAsked]);
  return <h1 data-hub-title tabIndex={-1}>Swap</h1>;
}
function Plain() {
  return <h1 data-hub-title tabIndex={-1}>Plain</h1>;
}
// A shown page that moves on to HOP.to (once) when a link with open_realm for the shown realm reaches it.
const HOP = { to: '' };
function Hop() {
  const [asked] = useSearchParam('open_realm');
  const router = useRouter();
  useEffect(() => {
    if (asked === ID && HOP.to) {
      const to = HOP.to;
      HOP.to = '';
      void router.navigate({ href: to } as never);
    }
  }, [asked, router]);
  return <h1 data-hub-title tabIndex={-1}>Hop</h1>;
}
// Hop behind the router's own leave guard (useBlocker with a resolver, as the Hub's LeaveGuard), answered "leave" by
// an effect the moment it asks: the held move is let go just before the shell's cleanup runs.
function HeldHop() {
  const b = useBlocker({ shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname, withResolver: true, enableBeforeUnload: false });
  useEffect(() => {
    if (b.status === 'blocked') b.proceed();
  }, [b]);
  return <Hop />;
}
const page = (id: string, C: () => ReactElement, strings: Record<string, string>): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: C }), status: 'ready', sensitive: false, strings });
const PAGES = [page('board', Board, boardStrings as Record<string, string>), page('mark', Mark, { title: 'Mark' }), page('swap', Swap, { title: 'Swap' }), page('hop', Hop, { title: 'Hop' }), page('other', Plain, { title: 'Other' }), page('keys', Hop, { title: 'Keys' }), page('held', HeldHop, { title: 'Held' })];

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
async function open(path: string, o: { hash?: boolean; strict?: boolean; loadFirst?: boolean } = {}) {
  if (o.hash) window.history.replaceState(null, '', '/#' + path);
  const history = o.hash ? createHashHistory() : createMemoryHistory({ initialEntries: [path] });
  histories.push(history);
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history });
  await act(async () => {
    if (o.loadFirst) await router.load();
    const app = <QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>;
    render(o.strict ? <StrictMode>{app}</StrictMode> : app);
    await router.load();
  });
  await settle();
  return router;
}

beforeEach(() => {
  Object.assign(ctl, { selected: ID, pinned: null, list: [ID], loaded: [ID], loadFails: false, loadWait: null, loads: 0, switches: [], switchTo: null, current: 0, token: 0, rev: 0, cancels: [], fallback: false, mounts: [], toasts: [] });
  taken.length = 0;
  HOP.to = '';
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  // A hash-history test leaves its listeners on the window and its entry (and its key) in the window's history.
  for (const h of histories.splice(0)) h.destroy();
  window.history.replaceState(null, '', '/');
});

describe('the realm cleanup keeps what pages changed in the address', () => {
  it('an Add link carrying the realm shown, to a Board already shown: one tile, and the address ends as /board', async () => {
    const router = await open('/board');
    await act(async () => { await router.navigate({ href: `/board?add=terminal-3&cid=${CID}&open_realm=${ID}` } as never); });
    await settle();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(taken).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/board');
    expect(router.state.location.search).toEqual({});
  });

  it('a param a shown page sets in the same commit stays when the shell drops its own', async () => {
    const router = await open('/mark?tab=a');
    await act(async () => { await router.navigate({ href: `/mark?tab=a&open_realm=${ID}` } as never); });
    await settle();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(router.state.location.pathname).toBe('/mark');
    expect(router.state.location.search).toEqual({ tab: 'a', x: '1' });
  });

  it('a newer value of the param, set before the shell drops the older one, stays', async () => {
    const router = await open('/swap?tab=a');
    await act(async () => { await router.navigate({ href: `/swap?tab=a&open_realm=${ID}` } as never); });
    await settle();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(router.state.location.pathname).toBe('/swap');
    expect(router.state.location.search).toEqual({ tab: 'a', open_realm: 'later' });
  });
});

// The cleanup acts only on the committed location (the history's entry),
// never on a navigation still pending or held by a leave guard, and replaces exactly that entry. A shown page that
// moves on in the same commit the link reaches it (its effect runs before the shell's) starts such a navigation.
describe('the realm cleanup beside a navigation started in the same commit', () => {
  const loc = (r: Awaited<ReturnType<typeof open>>) => ({ path: r.state.location.pathname, search: r.state.location.search, hash: r.state.location.hash });
  const reach = async (r: Awaited<ReturnType<typeof open>>, href: string) => {
    await act(async () => { await r.navigate({ href } as never); });
    await settle();
    await settle();
  };
  const back = async (r: Awaited<ReturnType<typeof open>>) => {
    await act(async () => { r.history.back(); await new Promise((x) => setTimeout(x, 20)); });
    await settle();
  };
  // A leave guard: it holds the page's own move to /other until the test answers (true refuses it, false lets it go);
  // any later navigation goes through at once (it is not the move the person was asked about).
  function guard(r: Awaited<ReturnType<typeof open>>) {
    let answer: (refuse: boolean) => void = () => undefined;
    const held = new Promise<boolean>((x) => { answer = x; });
    const asked: string[] = [];
    let first = true;
    r.history.block({
      blockerFn: ({ nextLocation }) => {
        asked.push(nextLocation.href);
        if (nextLocation.pathname !== '/other' || !first) return false;
        first = false;
        return held;
      },
      enableBeforeUnload: false,
    });
    const decide = async (refuse: boolean) => {
      await act(async () => { answer(refuse); await new Promise((x) => setTimeout(x, 20)); });
      await settle();
      await settle();
    };
    return { asked, decide };
  }

  it('a guarded move to another path, refused: nothing of it lands on the page, and the param still leaves', async () => {
    HOP.to = '/other?tab=new#new';
    const router = await open('/hop');
    const g = guard(router);
    await reach(router, `/hop?open_realm=${ID}`);
    await g.decide(true);
    expect(ctl.switches).toEqual([]);
    expect(loc(router)).toEqual({ path: '/hop', search: {}, hash: '' });
    // The guard's move was never read or repeated, and the cleanup's own replace (same page, past guards) never asked.
    expect(g.asked).toEqual([`/hop?open_realm=${ID}`, '/other?tab=new#new']);
  });

  it('a guarded move that carries the param, let go: the new entry loses the param, and Back returns to the page', async () => {
    HOP.to = `/other?open_realm=${ID}&tab=new#new`;
    const router = await open('/hop');
    const g = guard(router);
    await reach(router, `/hop?open_realm=${ID}`);
    await g.decide(false);
    expect(loc(router)).toEqual({ path: '/other', search: { tab: 'new' }, hash: 'new' });
    await back(router);
    expect(loc(router)).toEqual({ path: '/hop', search: {}, hash: '' });
  });

  it('a move that carries the param past a guard that lets it go at once: Back still returns to the page', async () => {
    HOP.to = `/other?open_realm=${ID}&tab=new#new`;
    const router = await open('/hop');
    // A guard that answers at once still answers after the commit that started the move (the router awaits it).
    router.history.block({ blockerFn: () => false, enableBeforeUnload: false });
    await reach(router, `/hop?open_realm=${ID}`);
    expect(loc(router)).toEqual({ path: '/other', search: { tab: 'new' }, hash: 'new' });
    await back(router);
    expect(loc(router)).toEqual({ path: '/hop', search: {}, hash: '' });
  });

  it('after a switch, a move a page starts as the switch ends (guarded, carrying the param): Back returns to the page', async () => {
    ctl.selected = ID2;
    ctl.list = [ID, ID2];
    ctl.loaded = [ID, ID2];
    const router = await open('/hop');
    // A guard that lets every move go, a task later (as a confirm answered at once would).
    router.history.block({ blockerFn: () => new Promise<boolean>((x) => setTimeout(() => x(false), 0)), enableBeforeUnload: false });
    // Something moves the page on as the switch ends: the cleanup that follows the switch finds the router idle, with
    // the move still waiting on the guard.
    ctl.switchTo = () => {
      void router.navigate({ href: `/other?open_realm=${ID}&tab=new#new` } as never);
      return Promise.resolve(true);
    };
    await reach(router, `/hop?open_realm=${ID}`);
    await settle();
    expect(ctl.switches).toEqual([ID]);
    expect(loc(router)).toEqual({ path: '/other', search: { tab: 'new' }, hash: 'new' });
    await back(router);
    expect(loc(router)).toEqual({ path: '/hop', search: {}, hash: '' });
  });

  it('onto a Keys share link that contradicts itself: its share leaves with the param; Back returns to the page', async () => {
    HOP.to = `/keys/shared?open_realm=${ID}&realm=${ID2}&share=1#anchor`;
    const router = await open('/hop');
    await reach(router, `/hop?open_realm=${ID}`);
    expect(loc(router)).toEqual({ path: '/keys/shared', search: { realm: ID2 }, hash: 'anchor' });
    await back(router);
    expect(loc(router).path).toBe('/hop');
  });

  it("off the Keys share route: another page's share stays", async () => {
    HOP.to = `/other?open_realm=${ID}&realm=${ID2}&share=1#anchor`;
    const router = await open('/keys/shared');
    await reach(router, `/keys/shared?open_realm=${ID}`);
    expect(loc(router)).toEqual({ path: '/other', search: { realm: ID2, share: '1' }, hash: 'anchor' });
  });

  // The router's own guard (resolver) lets the held move go just before the cleanup runs; the
  // cleanup's replace must not land after it and overwrite the new entry.
  it('the router guard lets a held move go as the cleanup runs: the move lands without the param; Back returns', async () => {
    HOP.to = `/other?open_realm=${ID}&tab=new#new`;
    const router = await open('/held');
    await reach(router, `/held?open_realm=${ID}`);
    await settle();
    expect(loc(router)).toEqual({ path: '/other', search: { tab: 'new' }, hash: 'new' });
    await back(router);
    expect(loc(router)).toEqual({ path: '/held', search: {}, hash: '' });
  });
});

// In the browser (the Hub's hash history), Back moves the browser's own entry first and a leave guard
// decides after; while it decides, the router still reads the page left. The cleanup must not replace then (it would
// overwrite the Back destination): it waits for the browser and the router to agree.
describe('the realm cleanup and a guarded browser Back (hash history)', () => {
  const where = () => window.location.hash;
  async function pending(o: { hash?: boolean } = { hash: true }) {
    ctl.selected = ID2;
    ctl.list = [ID, ID2];
    ctl.loaded = [ID, ID2];
    let finish: (ok: boolean) => void = () => undefined;
    ctl.switchTo = () => new Promise<boolean>((x) => { finish = x; });
    const router = await open('/other', o);
    await act(async () => { await router.navigate({ href: `/hop?open_realm=${ID}` } as never); });
    await settle();
    expect(ctl.switches).toEqual([ID]);
    let answer: (refuse: boolean) => void = () => undefined;
    const held = new Promise<boolean>((x) => { answer = x; });
    // The guard asks about the first Back only.
    let first = true;
    router.history.block({
      blockerFn: ({ action }) => {
        if (action !== 'BACK' || !first) return false;
        first = false;
        return held;
      },
      enableBeforeUnload: false,
    });
    // Back: the browser is on /other at once; the guard has not answered.
    await act(async () => { window.history.back(); await new Promise((x) => setTimeout(x, 20)); });
    // The switch ends now: the shell owes its cleanup while the guard decides.
    await act(async () => { finish(true); await new Promise((x) => setTimeout(x, 20)); });
    await settle();
    return { router, decide: async (refuse: boolean) => { await act(async () => { answer(refuse); await new Promise((x) => setTimeout(x, 40)); }); await settle(); await settle(); } };
  }

  it('while the guard decides nothing is replaced; refused, the page loses the param and the entry before it stays', async () => {
    const { router, decide } = await pending();
    expect(where()).toBe('#/other');
    // A browser returns from a refused Back later than the router resolves (happy-dom's go() is at once): only the
    // browser's own move can tell the cleanup that the page is back.
    const go = window.history.go.bind(window.history);
    const spy = vi.spyOn(window.history, 'go').mockImplementation((n?: number) => { setTimeout(() => go(n), 30); });
    await decide(true);
    await act(async () => { await new Promise((x) => setTimeout(x, 60)); });
    await settle();
    spy.mockRestore();
    expect(where()).toBe('#/hop');
    expect(router.state.location.search).toEqual({});
    await act(async () => { window.history.back(); await new Promise((x) => setTimeout(x, 40)); });
    await settle();
    expect(where()).toBe('#/other');
  });

  it('let go: the Back destination stays as it was', async () => {
    const { router, decide } = await pending();
    await decide(false);
    expect(where()).toBe('#/other');
    expect(router.state.location.pathname).toBe('/other');
    expect(router.state.location.search).toEqual({});
  });
});

// An entry the browser holds without a key (made before the router, or outside it) is a
// Back or Forward destination too. While a guard holds the move, the router and its history still read the page left
// (one key) and the browser's entry has none: nothing may be replaced.
describe('the realm cleanup and a guarded Back or Forward to a keyless entry', () => {
  for (const kind of ['hash', 'browser'] as const) {
    for (const dir of ['back', 'forward'] as const) {
      it(`${kind} history, ${dir}: while the guard decides the keyless entry stays; let go, it is where the person lands`, async () => {
        const url = (p: string) => (kind === 'hash' ? '/#' + p : p);
        const shown = () => (kind === 'hash' ? window.location.hash.slice(1) : window.location.pathname + window.location.search);
        const hop = `/hop?open_realm=${ID}`;
        // The keyless /other is before the page for a Back, after it for a Forward. The page's own entry carries its
        // key already (as the history would give it): happy-dom's replaceState drops the entries after the current
        // one, so the history's own keying would remove a Forward destination.
        const keyed = { __TSR_index: 0, key: 'page', __TSR_key: 'page' };
        if (dir === 'back') {
          window.history.replaceState(null, '', url('/other'));
          window.history.pushState(keyed, '', url(hop));
        } else {
          window.history.replaceState(keyed, '', url(hop));
          window.history.pushState(null, '', url('/other'));
          await act(async () => { window.history.back(); await new Promise((x) => setTimeout(x, 20)); });
        }
        expect(shown()).toBe(hop);
        ctl.selected = ID2;
        ctl.list = [ID, ID2];
        ctl.loaded = [ID, ID2];
        let finish: (ok: boolean) => void = () => undefined;
        ctl.switchTo = () => new Promise<boolean>((x) => { finish = x; });
        const history = kind === 'hash' ? createHashHistory() : createBrowserHistory();
        histories.push(history);
        const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history });
        await act(async () => {
          render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
          await router.load();
        });
        await settle();
        expect(ctl.switches).toEqual([ID]);
        let answer: (refuse: boolean) => void = () => undefined;
        const held = new Promise<boolean>((x) => { answer = x; });
        // The guard holds the first move, whatever TanStack calls it: a keyless entry reads as index 0, so a Back or
        // Forward onto it is a 'GO' to the history.
        let first = true;
        router.history.block({
          blockerFn: () => {
            if (!first) return false;
            first = false;
            return held;
          },
          enableBeforeUnload: false,
        });
        await act(async () => { window.history[dir](); await new Promise((x) => setTimeout(x, 20)); });
        expect(shown()).toBe('/other');
        // The switch ends while the guard decides: the cleanup is owed and must not take the keyless entry for the page.
        await act(async () => { finish(true); await new Promise((x) => setTimeout(x, 20)); });
        await settle();
        await settle();
        expect(shown()).toBe('/other');
        await act(async () => { answer(false); await new Promise((x) => setTimeout(x, 40)); });
        await settle();
        await settle();
        expect(shown()).toBe('/other');
        expect(router.state.location.pathname).toBe('/other');
      });
    }
  }

  it("which histories are the browser's: the Hub's and TanStack's browser history write its entries, a memory history does not", () => {
    // realmParam's browserBacked reads this field; a router upgrade that drops it must fail here, not turn the check off.
    const hub = createHubHashHistory();
    const browser = createBrowserHistory();
    const memory = createMemoryHistory({ initialEntries: ['/'] });
    histories.push(hub, browser, memory);
    expect(typeof hub._ignoreNextBeforeUnload).toBe('function');
    expect(typeof browser._ignoreNextBeforeUnload).toBe('function');
    expect(memory._ignoreNextBeforeUnload).toBeUndefined();
  });
});

// StrictMode runs the cleanup effect twice; a debt left by the first run is checked again.
it('StrictMode, a router already idle: a link for the realm shown still loses its param', async () => {
  const router = await open(`/plainpage?x=1&open_realm=${ID}`.replace('/plainpage', '/other'), { strict: true, loadFirst: true });
  await settle();
  expect(ctl.switches).toEqual([]);
  expect(router.state.location.pathname).toBe('/other');
  expect(router.state.location.search).toEqual({ x: '1' });
});
