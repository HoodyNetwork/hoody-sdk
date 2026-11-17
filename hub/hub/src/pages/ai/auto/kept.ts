// The stores of the Automations changes (loops, TODOs), kept by the context they were made in (account,
// realm generation, computer ids) and what they are about, so leaving a detail and coming back shows the same outcome
// while a change is out or unknown, and useHeld shows it where a row that went away was. A store that holds nothing
// and is not shown is dropped; one whose context moved on is replaced by a fresh one.
import { alive, capture, type Ctx } from '@core';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

export interface KeptStore<V> {
  readonly ctx: Ctx;
  holds(): boolean;
  view(): V;
  subscribe(fn: () => void): () => void;
}

interface Kept {
  store: KeptStore<unknown>;
  mounted: number;
}
const kept = new Map<string, Kept>();
const ctxKey = (c: Ctx) => [c.account ?? '', c.gen, c.target?.project.id ?? '', c.target?.container.id ?? ''].join('\n');

/** The kept store for `key` under the current context, made with `make` when there is none alive. */
export function useKept<S extends KeptStore<unknown>>(key: string, make: (ctx: Ctx) => S): S {
  const full = `${ctxKey(capture())}\n${key}`;
  const entry = useMemo(() => {
    const had = kept.get(full);
    if (had && alive(had.store.ctx)) return had;
    const fresh: Kept = { store: make(capture()), mounted: 0 };
    kept.set(full, fresh);
    return fresh;
    // make is the caller's recipe for this key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  useEffect(() => {
    kept.set(full, entry);
    entry.mounted++;
    for (const [k, e] of kept) if (e !== entry && e.mounted === 0 && (!e.store.holds() || !alive(e.store.ctx))) kept.delete(k);
    return () => {
      entry.mounted--;
      if (entry.mounted === 0 && !entry.store.holds()) kept.delete(full);
    };
  }, [full, entry]);
  return entry.store as S;
}

/** The kept store for `key` under the current context when one is alive, never made: the change of a loop whose row is
 *  gone (deleted, or a replace whose answer was lost) stays reachable where its row was. */
export function useHeld<S extends KeptStore<unknown>>(key: string): S | null {
  const full = `${ctxKey(capture())}\n${key}`;
  const had = kept.get(full);
  const entry = had && alive(had.store.ctx) ? had : null;
  useEffect(() => {
    if (!entry) return;
    entry.mounted++;
    return () => {
      entry.mounted--;
      if (entry.mounted === 0 && !entry.store.holds()) kept.delete(full);
    };
  }, [full, entry]);
  return entry ? (entry.store as S) : null;
}

/** Tests: every kept store dropped (a page's tests share one context). */
export function resetKeptForTests(): void {
  kept.clear();
}

export function useView<V>(store: KeptStore<V>): V {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}
