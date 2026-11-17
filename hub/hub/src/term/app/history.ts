// history.ts: the terminal router's history. TanStack's memory history runs navigation blockers (useBlocker: kit
// LeaveGuard, Drawer's unsaved-work guard) only when `typeof document !== "undefined"` (@tanstack/history
// tryNavigation), so in a terminal every push and replace would go through without asking and a person would lose what
// they typed. This wrapper keeps its own blocker list and asks every blocker before a push or replace, exactly as the
// browser history does (same blocker arguments, same "any true blocks"); back/forward/go are not blocked there either.
// A navigation with `ignoreBlocker` passes, as on the web. Blocked: nothing changes and onBlocked is not needed (the
// blocker itself showed the question). The order of navigations is kept: a second push while a blocker is still
// asking waits behind it. A navigation asks the blockers registered when it STARTS (the browser history reads its list
// at that moment too), each one only if it is still registered when its turn comes, or was taken off in the very tick
// the navigation started: a blocker put on and taken off around one navigate call is asked by that navigation, and one
// whose page has left since (nobody is there to answer its question) is not.
import { createMemoryHistory, parseHref, type HistoryState, type NavigationBlocker, type RouterHistory } from '@tanstack/history';

export function createTermHistory(initial: string): RouterHistory {
  const inner = createMemoryHistory({ initialEntries: [initial] });
  let blockers: NavigationBlocker[] = [];
  let queue: Promise<void> = Promise.resolve();
  // Navigations started in the current tick, each with the blockers taken off before the tick ended.
  const starting = new Set<Set<NavigationBlocker>>();

  const asks = async (asked: readonly NavigationBlocker[], offAtStart: ReadonlySet<NavigationBlocker>, type: 'PUSH' | 'REPLACE', path: string, state: HistoryState | undefined): Promise<boolean> => {
    const nextLocation = parseHref(path, state as never);
    for (const b of asked) {
      if (!blockers.includes(b) && !offAtStart.has(b)) continue;
      if (await b.blockerFn({ currentLocation: located(), nextLocation, action: type })) return true;
    }
    return false;
  };

  const guarded = (type: 'PUSH' | 'REPLACE', run: (path: string, state: HistoryState | undefined, o?: { ignoreBlocker?: boolean }) => void) =>
    (path: string, state?: HistoryState, o?: { ignoreBlocker?: boolean }): void => {
      if (o?.ignoreBlocker || blockers.length === 0) { run(path, state, o); return; }
      const asked = [...blockers];
      const offAtStart = new Set<NavigationBlocker>();
      starting.add(offAtStart);
      queueMicrotask(() => { starting.delete(offAtStart); });
      queue = queue.then(async () => {
        let blocked = false;
        try { blocked = await asks(asked, offAtStart, type, path, state); } catch { blocked = true; }
        if (!blocked) run(path, state, o);
      });
    };

  // Everything else is the memory history's own (subscribe, back, go, notify, ...); location and length stay live.
  const h: Record<string, unknown> = {};
  for (const k of Object.keys(inner)) {
    if (k === 'location' || k === 'length') continue;
    const v = (inner as unknown as Record<string, unknown>)[k];
    h[k] = v;
  }
  // Every location says "no router hash scroll": TanStack's scroll restoration would otherwise answer a #hash with
  // document.getElementById(hash) (router-core scroll-restoration.js, onRendered), a strict-global trap that exited the
  // Hub. It reads the flag from the location state, which a navigate sets (true by default) and the
  // first entry lacks, so it is forced here, on every location. The terminal's own anchor jump is HashAnchor (router.tsx).
  const seen = new WeakMap<object, RouterHistory['location']>();
  const located = (): RouterHistory['location'] => {
    const l = inner.location;
    let out = seen.get(l);
    if (!out) { out = { ...l, state: { ...l.state, __hashScrollIntoViewOptions: false } as never }; seen.set(l, out); }
    return out;
  };
  Object.defineProperty(h, 'location', { get: located, enumerable: true });
  Object.defineProperty(h, 'length', { get: () => inner.length, enumerable: true });
  h.push = guarded('PUSH', (p, s, o) => inner.push(p, s as never, o as never));
  h.replace = guarded('REPLACE', (p, s, o) => inner.replace(p, s as never, o as never));
  h.block = (blocker: NavigationBlocker) => {
    blockers = [...blockers, blocker];
    return () => {
      blockers = blockers.filter((b) => b !== blocker);
      for (const off of starting) off.add(blocker);
    };
  };
  return h as unknown as RouterHistory;
}
