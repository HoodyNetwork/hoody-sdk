// A link may carry ?open_realm=<24-hex id> on any hub route, and the shell switches to it
// (pages never switch the realm). The page under the link waits until the switch ends, so it never renders in the realm
// left. A realm the list lacks is looked up once more (one made a moment ago); still unknown, a notice and no switch.
// The param leaves the address with replace (other params and the hash stay; Back never repeats it) once the realm
// shown is the one it names; otherwise it stays for the page to judge. A pinned token session and a malformed value
// change nothing. The newest link owns the work: a newer link or leaving
// cancels the older link's switch in core, a switch started elsewhere is told by core's switchRevision, load()'s own
// fallback is not one, and a failure is the request's own (a later visit waits from its first render).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactElement, StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import type * as ToastModule from '@kit/states/Toast';
import { cancelSwitch } from './switchOp';

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
// The realm menu starting a switch (not through the hook): it supersedes a pending one; done, it commits.
function menu(id: string, done: boolean) {
  ctl.rev += 1;
  ctl.current = -1;
  if (done) {
    ctl.current = 0;
    ctl.selected = id;
  }
}

const ID = '6a00000000000000000000c1';
const NEW = '6a00000000000000000000c9';

function Home() {
  useEffect(() => {
    ctl.mounts.push(ctl.selected);
  }, []);
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
function Other() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Other
    </h1>
  );
}
const page = (id: string, C: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: C }), status: 'ready', sensitive: false, strings: { title: id } });
const PAGES = [page('home', Home), page('other', Other)];

async function open(path: string, strict = false) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  const app = (
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  await act(async () => {
    render(strict ? <StrictMode>{app}</StrictMode> : app);
    await router.load();
  });
  await settle();
  return router;
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
const home = () => screen.queryByRole('heading', { level: 1, name: 'Home' });
// The page area's wait (RealmWait); the switch line, not the wait itself, announces it.
const waiting = () => document.querySelector('[data-hub-realm-wait]');
const notice = () => ctl.toasts.find((x) => x.title.startsWith("Couldn't open realm ")) ?? null;
const deferred = () => {
  let done: (v: boolean) => void = () => {};
  const p = new Promise<boolean>((r) => (done = r));
  return { p, done };
};

beforeEach(() => {
  Object.assign(ctl, { selected: 'all', pinned: null, list: [ID], loaded: [ID], loadFails: false, loadWait: null, loads: 0, switches: [], switchTo: null, current: 0, token: 0, rev: 0, cancels: [], fallback: false, mounts: [], toasts: [] });
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('?open_realm=<id> on a hub route', () => {
  // The link's switch goes through the shell's switchOp, so the switch line's Cancel (and Esc) ends it.
  it("the switch line's cancel ends the link's switch at once: the page shows where it was, nothing commits, the param stays", async () => {
    const d = deferred();
    ctl.switchTo = () => d.p;
    const router = await open(`/home?open_realm=${ID}`);
    expect(waiting()).not.toBeNull();
    let cancelled = false;
    await act(async () => {
      cancelled = cancelSwitch();
    });
    await settle();
    expect(cancelled).toBe(true);
    expect(ctl.cancels).toEqual([ID]);
    expect(waiting()).toBeNull();
    expect(home()).not.toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    await act(async () => {
      d.done(true);
    });
    await settle();
    expect(ctl.selected).toBe('all');
    expect(router.state.location.search).toEqual({ open_realm: ID });
    expect(notice()).toBeNull();
  });

  it('a realm in the list: the page waits, the shell switches, then the page mounts once in the new realm', async () => {
    const d = deferred();
    ctl.switchTo = () => d.p;
    const router = await open(`/home?tab=a&open_realm=${ID}#part`);
    expect(ctl.switches).toEqual([ID]);
    expect(home()).toBeNull();
    expect(waiting()).not.toBeNull();
    expect(ctl.mounts).toEqual([]);
    // Kept while the switch runs.
    expect(router.state.location.search).toEqual({ tab: 'a', open_realm: ID });
    await act(async () => {
      d.done(true);
    });
    await settle();
    expect(home()).not.toBeNull();
    expect(waiting()).toBeNull();
    expect(ctl.mounts).toEqual([ID]);
    expect(notice()).toBeNull();
    // Dropped with replace once switched; the rest of the location stays.
    expect(router.state.location.search).toEqual({ tab: 'a' });
    expect(router.state.location.hash).toBe('part');
  });

  it('StrictMode runs the effect twice: one list read, one switch', async () => {
    ctl.list = [];
    ctl.loaded = [ID];
    await open(`/home?open_realm=${ID}`, true);
    expect(ctl.loads).toBe(1);
    expect(ctl.switches).toEqual([ID]);
    expect(home()).not.toBeNull();
  });

  it('a realm made a moment ago (not in the list yet): the list is read once more, then the switch', async () => {
    ctl.loaded = [ID, NEW];
    await open(`/home?open_realm=${NEW}`);
    expect(ctl.loads).toBe(1);
    expect(ctl.switches).toEqual([NEW]);
    expect(home()).not.toBeNull();
  });

  it('a realm the list still lacks: a notice, no switch, the page shows in the realm it was in', async () => {
    const router = await open(`/home?open_realm=${NEW}`);
    expect(ctl.loads).toBe(1);
    expect(ctl.switches).toEqual([]);
    expect(home()).not.toBeNull();
    // The title names the realm the link asked for (Toast.tsx copy policy).
    expect(notice()).toEqual({ tone: 'warn', title: expect.stringMatching(/^Couldn't open realm [^{}\s]+ from this link$/), body: 'Still showing All realms. Nothing was changed.' });
    // Kept: a page acting for the realm a link names sees that the realm shown is another one.
    expect(router.state.location.search).toEqual({ open_realm: NEW });
  });

  it('the list cannot be read: the same notice, no switch', async () => {
    ctl.loadFails = true;
    await open(`/home?open_realm=${NEW}`);
    expect(ctl.switches).toEqual([]);
    expect(home()).not.toBeNull();
    expect(notice()).not.toBeNull();
  });

  it('a switch core refuses: the page shows; core gives its own notice, the shell adds none', async () => {
    ctl.switchTo = async () => false;
    const router = await open(`/home?open_realm=${ID}`);
    expect(ctl.switches).toEqual([ID]);
    expect(home()).not.toBeNull();
    expect(notice()).toBeNull();
    expect(router.state.location.search).toEqual({ open_realm: ID });
  });

  it('a pinned token session: nothing switched, nothing waits, the param stays', async () => {
    ctl.pinned = '6a00000000000000000000d1';
    const router = await open(`/home?open_realm=${ID}`);
    expect(ctl.switches).toEqual([]);
    expect(ctl.loads).toBe(0);
    expect(home()).not.toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    expect(router.state.location.search).toEqual({ open_realm: ID });
  });

  it('the realm already shown: dropped, nothing switched, nothing waits', async () => {
    ctl.selected = ID;
    const router = await open(`/home?open_realm=${ID}`);
    expect(ctl.switches).toEqual([]);
    expect(home()).not.toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it.each(['All', 'ALL', 'all ', 'global', ID.toUpperCase(), ID.slice(1), `${ID}0`, ''])('a value that is not a realm id (%j): nothing, the param stays', async (v) => {
    const router = await open(`/home?keep=1&open_realm=${encodeURIComponent(v)}`);
    expect(ctl.switches).toEqual([]);
    expect(ctl.loads).toBe(0);
    expect(home()).not.toBeNull();
    expect(notice()).toBeNull();
    expect(router.state.location.search).toEqual({ keep: '1', open_realm: v });
  });

  // `all` asks for the All realms view (a Global folder's Open Connections). It is no list entry, so it
  // reads no list; the switch is the same startSwitch one, so the switch line's Cancel and a newer link still own it.
  it('open_realm=all from a realm: the page waits, the shell switches to All realms with no list read, then the page mounts once and the param leaves', async () => {
    ctl.selected = ID;
    ctl.list = null;
    const d = deferred();
    ctl.switchTo = () => d.p;
    const router = await open('/home?tab=a&open_realm=all#part');
    expect(ctl.switches).toEqual(['all']);
    expect(ctl.loads).toBe(0);
    expect(home()).toBeNull();
    expect(waiting()).not.toBeNull();
    expect(router.state.location.search).toEqual({ tab: 'a', open_realm: 'all' });
    await act(async () => {
      d.done(true);
    });
    await settle();
    expect(home()).not.toBeNull();
    expect(waiting()).toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    expect(ctl.selected).toBe('all');
    expect(notice()).toBeNull();
    expect(router.state.location.search).toEqual({ tab: 'a' });
    expect(router.state.location.hash).toBe('part');
  });

  it('open_realm=all when the list cannot be read still switches (it needs no list), with no notice', async () => {
    ctl.selected = ID;
    ctl.list = null;
    ctl.loadFails = true;
    await open('/home?open_realm=all');
    expect(ctl.switches).toEqual(['all']);
    expect(ctl.loads).toBe(0);
    expect(notice()).toBeNull();
    expect(home()).not.toBeNull();
  });

  it('open_realm=all while All realms is shown: dropped, nothing switched, nothing waits', async () => {
    const router = await open('/home?keep=1&open_realm=all');
    expect(ctl.switches).toEqual([]);
    expect(ctl.loads).toBe(0);
    expect(home()).not.toBeNull();
    expect(waiting()).toBeNull();
    expect(router.state.location.search).toEqual({ keep: '1' });
  });

  it('open_realm=all on a pinned token session: nothing switched, nothing waits, the param stays', async () => {
    ctl.selected = ID;
    ctl.pinned = '6a00000000000000000000d1';
    const router = await open('/home?open_realm=all');
    expect(ctl.switches).toEqual([]);
    expect(home()).not.toBeNull();
    expect(router.state.location.search).toEqual({ open_realm: 'all' });
  });

  it('open_realm=all goes through the shell switch: its Cancel ends it, nothing commits, the param stays; a refused switch leaves the param too', async () => {
    ctl.selected = ID;
    const d = deferred();
    ctl.switchTo = () => d.p;
    const router = await open('/home?open_realm=all');
    expect(waiting()).not.toBeNull();
    let cancelled = false;
    await act(async () => {
      cancelled = cancelSwitch();
    });
    await settle();
    expect(cancelled).toBe(true);
    expect(ctl.cancels).toEqual(['all']);
    expect(waiting()).toBeNull();
    await act(async () => {
      d.done(true);
    });
    await settle();
    expect(ctl.selected).toBe(ID);
    expect(router.state.location.search).toEqual({ open_realm: 'all' });
    cleanup();
    Object.assign(ctl, { switches: [], cancels: [], switchTo: async () => false, selected: ID });
    const again = await open('/home?open_realm=all');
    expect(ctl.switches).toEqual(['all']);
    expect(notice()).toBeNull();
    expect(again.state.location.search).toEqual({ open_realm: 'all' });
  });

  it('works on any route, and Back never repeats it', async () => {
    const router = await open('/home');
    await act(async () => {
      await router.navigate({ href: `/other?open_realm=${ID}` } as never);
    });
    await settle();
    expect(ctl.switches).toEqual([ID]);
    expect(screen.queryByRole('heading', { level: 1, name: 'Other' })).not.toBeNull();
    await act(async () => {
      router.history.back();
    });
    await settle();
    expect(router.state.location.pathname).toBe('/home');
    expect(ctl.switches).toEqual([ID]);
  });
});

// Two links in a row; the newest owns the switch, the notices and the wait.
describe('the newest ?open_realm= link owns the work', () => {
  const A = NEW; // needs the list read again
  const B = ID; // listed
  const to = async (router: Awaited<ReturnType<typeof open>>, href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
    await settle();
  };
  const reload = () => {
    let done: () => void = () => {};
    ctl.loadWait = new Promise<void>((r) => (done = r));
    ctl.loaded = [A, B];
    return () => act(async () => done());
  };

  it.each(['the older reload ends first', 'the newer switch ends first'])('an older link waiting on the list never switches (%s)', async (order) => {
    const endReload = reload();
    const sw = deferred();
    ctl.switchTo = () => sw.p;
    const router = await open(`/home?open_realm=${A}`);
    expect(waiting()).not.toBeNull();
    await to(router, `/home?open_realm=${B}`);
    expect(ctl.switches).toEqual([B]);
    if (order === 'the older reload ends first') {
      await endReload();
      await settle();
      expect(ctl.switches).toEqual([B]);
      expect(waiting()).not.toBeNull();
      await act(async () => sw.done(true));
    } else {
      await act(async () => sw.done(true));
      await settle();
      await endReload();
    }
    await settle();
    expect(ctl.switches).toEqual([B]);
    expect(ctl.selected).toBe(B);
    expect(waiting()).toBeNull();
    expect(home()).not.toBeNull();
    expect(notice()).toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it('an older switch still pending: the newer link supersedes it in core, and the wait ends with the newer one', async () => {
    const a = deferred();
    const b = deferred();
    ctl.loaded = ctl.list = [A, B];
    ctl.switchTo = (id) => (id === A ? a.p : b.p);
    const router = await open(`/home?open_realm=${A}`);
    await to(router, `/home?open_realm=${B}`);
    expect(ctl.switches).toEqual([A, B]);
    expect(ctl.cancels).toEqual([A]);
    // The cancelled one ends: it commits nothing, and the newer still owns the wait.
    await act(async () => a.done(true));
    await settle();
    expect(waiting()).not.toBeNull();
    await act(async () => b.done(true));
    await settle();
    expect(ctl.selected).toBe(B);
    expect(waiting()).toBeNull();
    expect(notice()).toBeNull();
  });

  it('an older switch is cancelled by a newer link that still waits on the list: it never commits, the newer link wins', async () => {
    const a = deferred();
    ctl.switchTo = (id) => (id === B ? a.p : Promise.resolve(true));
    // B (listed) first, then A, which needs the list read again.
    const router = await open(`/home?open_realm=${B}`);
    const endReload = reload();
    await to(router, `/home?open_realm=${A}`);
    expect(ctl.cancels).toEqual([B]);
    await act(async () => a.done(true));
    await settle();
    expect(ctl.selected).toBe('all');
    expect(router.state.location.search).toEqual({ open_realm: A });
    expect(waiting()).not.toBeNull();
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([B, A]);
    expect(ctl.selected).toBe(A);
    expect(waiting()).toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it('a newer link naming the realm shown, while an older switch is pending: the older switch is cancelled', async () => {
    const a = deferred();
    ctl.selected = B;
    ctl.loaded = ctl.list = [A, B];
    ctl.switchTo = (id) => (id === A ? a.p : Promise.resolve(true));
    const router = await open(`/home?open_realm=${A}`);
    expect(waiting()).not.toBeNull();
    await to(router, `/home?open_realm=${B}`);
    expect(ctl.switches).toEqual([A]);
    expect(ctl.cancels).toEqual([A]);
    expect(waiting()).toBeNull();
    await act(async () => a.done(true));
    await settle();
    expect(ctl.selected).toBe(B);
    expect(router.state.location.search).toEqual({});
  });

  it('a newer link naming the realm shown while the older one waits on the list: the older never switches', async () => {
    const endReload = reload();
    ctl.selected = B;
    const router = await open(`/home?open_realm=${A}`);
    await to(router, `/home?open_realm=${B}`);
    expect(waiting()).toBeNull();
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(ctl.selected).toBe(B);
    expect(notice()).toBeNull();
  });

  it('a switch started in the realm menu while a link waits on the list wins: the link neither switches nor warns', async () => {
    const endReload = reload();
    await open(`/home?open_realm=${A}`);
    expect(waiting()).not.toBeNull();
    // The menu's own switch (not through this hook) is pending in core.
    menu(B, false);
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(notice()).toBeNull();
    expect(waiting()).toBeNull();
  });

  it('a switch the realm menu finished while a link waited on the list wins too', async () => {
    const endReload = reload();
    await open(`/home?open_realm=${A}`);
    menu(B, true);
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(notice()).toBeNull();
  });
});

// Cancelling, a same-realm menu switch, core's own fallback, leaving, and a later visit after a failure.
describe('older work never lands', () => {
  const A = ID;
  const to = async (router: Awaited<ReturnType<typeof open>>, href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
    await settle();
  };
  const reload = () => {
    let done: () => void = () => {};
    ctl.loadWait = new Promise<void>((r) => (done = r));
    return () => act(async () => done());
  };

  it.each([`/home?open_realm=${NEW}`, '/home?open_realm=bad', '/other'])('a pending switch is cancelled by a newer link with nothing to switch, or by leaving (%s)', async (next) => {
    const a = deferred();
    ctl.switchTo = () => a.p;
    const router = await open(`/home?open_realm=${A}`);
    expect(waiting()).not.toBeNull();
    await to(router, next);
    expect(ctl.cancels).toEqual([A]);
    expect(waiting()).toBeNull();
    await act(async () => a.done(true));
    await settle();
    expect(ctl.selected).toBe('all');
  });

  it('leaving while a link waits on the list: no switch afterwards, nothing waits', async () => {
    const endReload = reload();
    ctl.loaded = [A, NEW];
    const router = await open(`/home?open_realm=${NEW}`);
    await to(router, '/other');
    expect(waiting()).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Other' })).not.toBeNull();
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(notice()).toBeNull();
  });

  it.each([false, true])('the realm menu choosing the realm an older link asked for wins over a newer link (menu done: %s)', async (done) => {
    const a = deferred();
    ctl.switchTo = () => a.p;
    const router = await open(`/home?open_realm=${A}`);
    const endReload = reload();
    ctl.loaded = [A, NEW];
    await to(router, `/home?open_realm=${NEW}`);
    menu(A, done);
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([A]);
    expect(waiting()).toBeNull();
    expect(notice()).toBeNull();
  });

  it("core's own fallback during the list read (the stored realm is gone) is not an outside switch: the link still switches", async () => {
    ctl.selected = '6a00000000000000000000f0';
    ctl.list = [];
    ctl.loaded = [A];
    ctl.fallback = true;
    await open(`/home?open_realm=${A}`);
    expect(ctl.switches).toEqual([A]);
    expect(ctl.selected).toBe(A);
  });

  it('a later visit to a link that failed waits from its first render and tries again', async () => {
    const router = await open(`/home?open_realm=${NEW}`);
    expect(notice()).not.toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    await to(router, '/other');
    const endReload = reload();
    ctl.loaded = [A, NEW];
    await to(router, `/home?open_realm=${NEW}`);
    // Home never mounted in the realm left: it waits from the first render.
    expect(waiting()).not.toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    await endReload();
    await settle();
    expect(ctl.switches).toEqual([NEW]);
    expect(ctl.mounts).toEqual(['all', NEW]);
  });

  it('a later visit to a hidden page\'s link that failed switches after the retry and never leaves the Hub', async () => {
    const replace = vi.fn();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, replace, assign } as Location);
    const router = await open(`/home?open_realm=${NEW}`);
    await to(router, '/other');
    const endReload = reload();
    ctl.loaded = [A, NEW];
    await to(router, `/computers?open_realm=${NEW}`);
    await endReload();
    await settle();
    expect(ctl.selected).toBe(NEW);
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/computers');
  });
});

// With no classic Hub, a deep link under a page this load hides stays in the Hub (the router's answer for it), after
// the realm it asks for; it never leaves for another Hub.
describe('?open_realm= on a link to a hidden page', () => {
  it('waits for the switch, then stays in the Hub', async () => {
    const replace = vi.fn();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, replace, assign } as Location);
    const d = deferred();
    ctl.switchTo = () => d.p;
    const router = await open(`/computers?open_realm=${ID}`);
    expect(ctl.switches).toEqual([ID]);
    expect(waiting()).not.toBeNull();
    await act(async () => d.done(true));
    await settle();
    expect(ctl.selected).toBe(ID);
    expect(waiting()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/computers');
  });
});

// open_realm (links.spec.ts:80): the shell's switch link has its own key, ?open_realm=<id>.
// A page's own ?realm= (the Computers Realm filter, Bots byRealm) is the page's: the shell never switches on it,
// never waits on it and never takes it out of the address.
describe("a page's own ?realm= filter", () => {
  it('is never a switch: no wait, no read, no notice, and it stays in the address', async () => {
    const router = await open(`/home?realm=${ID}`);
    expect(ctl.switches).toEqual([]);
    expect(ctl.loads).toBe(0);
    expect(waiting()).toBeNull();
    expect(home()).not.toBeNull();
    expect(ctl.mounts).toEqual(['all']);
    expect(router.state.location.search).toEqual({ realm: ID });
    expect(notice()).toBeNull();
  });

  it('a realm the list lacks, on another page with other params and a hash: still the page\'s, untouched', async () => {
    const router = await open(`/other?view=t&realm=${NEW}#x`);
    expect(ctl.switches).toEqual([]);
    expect(ctl.loads).toBe(0);
    expect(router.state.location.search).toEqual({ view: 't', realm: NEW });
    expect(router.state.location.hash).toBe('x');
    expect(notice()).toBeNull();
  });

  it('beside ?open_realm=: the shell switches to open_realm and drops only open_realm', async () => {
    ctl.list = [ID, NEW];
    ctl.loaded = [ID, NEW];
    const router = await open(`/home?realm=${ID}&open_realm=${NEW}`);
    expect(ctl.switches).toEqual([NEW]);
    expect(ctl.selected).toBe(NEW);
    expect(router.state.location.search).toEqual({ realm: ID });
  });

  it('beside ?open_realm= and another realm on a page other than the Keys share tab: share= and realm= stay', async () => {
    ctl.list = [ID, NEW];
    ctl.loaded = [ID, NEW];
    const router = await open(`/home?share=1&realm=${ID}&open_realm=${NEW}`);
    expect(ctl.switches).toEqual([NEW]);
    expect(router.state.location.search).toEqual({ share: '1', realm: ID });
  });

  it('?open_realm= naming the realm shown leaves at once and keeps the page filter', async () => {
    ctl.selected = ID;
    const router = await open(`/home?open_realm=${ID}&realm=${NEW}`);
    expect(ctl.switches).toEqual([]);
    expect(router.state.location.search).toEqual({ realm: NEW });
  });

  it("the shell's key is open_realm, and the Keys share link carries it (lockstep)", async () => {
    const { OPEN_REALM } = await import('./realmParam');
    const { links } = await import('../pages/keys/links');
    expect(OPEN_REALM).toBe('open_realm');
    expect(links.shareRealm(ID)).toBe(`/keys/shared?share=1&open_realm=${ID}`);
  });

  it("New realm's way on links by the shell's key (?realm= is only the Computers filter)", async () => {
    const { OPEN_REALM } = await import('./realmParam');
    const realms = await import('../pages/realms/links');
    expect(realms.OPEN_REALM_KEY).toBe(OPEN_REALM);
    expect(realms.computersIn(ID)).toBe(`/computers?open_realm=${ID}`);
    expect(realms.computersIn(ID, true)).toBe(`/computers?get=1&open_realm=${ID}`);
  });
});
