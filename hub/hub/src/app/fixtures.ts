// The fake transport for hub:dev, hub:shots, page specs and Vitest.
//
// Each page's fixtures.ts default-exports defineFixtures({ default, states }); a state maps the
// keys its data.ts reads to canned answers. The current state comes from the URL (?fx=<state>,
// ?fxl=<latency>) or the dev toolbar. Production builds compile none of this: the glob below sits
// behind __HUB_FIXTURES__, which the build defines false.
//
// Two fixture formats: core's transport (fixtures mode) is booted by app/core-boot.ts with the core-format rules
// of the visible pages (loadCoreRules), including a table state's `rules` key. Page data.ts files
// that read through fixtureSource() from here use keyed answers; both
// formats work.
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { FixtureRule } from '@core';
import type { OutcomeKind } from '@kit/outcome';
import { hostEnv } from '@core/host-env';
import { installFixtureSeam } from '@core/fixture-seam';
import type { FallbackSource } from '@core/source';
import kitGallery from '@kit/gallery/page';
import demoPage from '../pages/demo/page';
import { installDevPages } from './pages';

export type FixtureErrorKind = 'server' | 'network' | 'forbidden' | 'not_found' | 'bad_request';

export type QueryAnswer =
  | { data: unknown; delayMs?: number }
  | { error: FixtureErrorKind; delayMs?: number }
  | { pending: true };

export type MutationAnswer = { outcome: OutcomeKind; data?: unknown; code?: string; delayMs?: number };

/**
 * An old-format state: keyed answers for fixtureSource. `rules` (optional) adds core-format rules
 * to the same state, e.g. core's lifecycleFixtures, so one state can feed both transports.
 */
export type FixtureState = {
  readonly rules?: readonly FixtureRule[];
  readonly [key: string]: QueryAnswer | MutationAnswer | readonly FixtureRule[] | undefined;
};

export interface Fixtures<S extends Readonly<Record<string, FixtureState>> = Readonly<Record<string, FixtureState>>> {
  default: keyof S & string;
  states: S;
}

export function defineFixtures<const S extends Readonly<Record<string, FixtureState>>>(fixtures: Fixtures<S>): Fixtures<S> {
  if (!(fixtures.default in fixtures.states)) throw new Error(`defineFixtures: default "${fixtures.default}" is not a state`);
  return fixtures;
}

// ── Current state (URL + dev toolbar) ───────────────────────────────────────────────

export type Latency = 'instant' | 'normal' | 'slow' | 'late';
export const LATENCY_MS: Record<Latency, number> = { instant: 0, normal: 180, slow: 2500, late: 8000 };

interface FxState {
  state: string | null;
  latency: Latency;
}

function initial(): FxState {
  let state: string | null = null;
  let latency: Latency = 'normal';
  // The page's own address only where the Hub is a page (hostEnv; never `window` itself): the terminal starts in the
  // default state and its runner picks the state (bootTermFixtures({ fx })).
  const at = hostEnv().browserPage ? hostEnv().pageAddress : null;
  if (!at) return { state, latency };
  try {
    const q = new URLSearchParams(at.search);
    state = q.get('fx');
    const l = q.get('fxl');
    if (l === 'instant' || l === 'normal' || l === 'slow' || l === 'late') latency = l;
  } catch {
    /* not a browser */
  }
  return { state, latency };
}

let current: FxState = initial();
const listeners = new Set<() => void>();

export const fixtureStore = {
  get: (): FxState => current,
  set(next: Partial<FxState>): void {
    current = { ...current, ...next };
    for (const l of listeners) l();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useFixtureState(): FxState {
  return useSyncExternalStore(fixtureStore.subscribe, fixtureStore.get, fixtureStore.get);
}

// ── Loading a page's fixtures ───────────────────────────────────────────────────────

const loaders: Record<string, () => Promise<{ default: Fixtures }>> = __HUB_FIXTURES__
  ? import.meta.glob<{ default: Fixtures }>('../pages/*/fixtures.ts')
  : {};

/** Each page's fixtures load once: the import is cached anyway, this keeps every later call (one per fixture answer) off the
 *  loader. A load that fails is not kept, so the next call tries again. */
const loaded = new Map<string, Promise<Fixtures | null>>();

export async function loadFixtures(pageId: string): Promise<Fixtures | null> {
  let fx = loaded.get(pageId);
  if (!fx) {
    const load = loaders[`../pages/${pageId}/fixtures.ts`];
    const p: Promise<Fixtures | null> = load ? load().then((m) => m.default) : Promise.resolve(null);
    p.catch(() => { if (loaded.get(pageId) === p) loaded.delete(pageId); });
    loaded.set(pageId, p);
    fx = p;
  }
  return fx;
}

/**
 * A page's fixtures may keep a fake server's memory for the session (notices marked read, entries made): a module that
 * does exports `resetFixtureServer()`. On the web a session is a page load, so the memory starts empty by itself. A host
 * that boots fixtures more than once in one process (the terminal: every test render, every golden shot) calls this at
 * each boot, so a notice one shot marks read is unread again in the next shot.
 */
export async function resetFixtureServers(pageIds: readonly string[]): Promise<void> {
  for (const id of pageIds) {
    const load = loaders[`../pages/${id}/fixtures.ts`] as unknown as (() => Promise<{ resetFixtureServer?: () => void }>) | undefined;
    if (load) (await load()).resetFixtureServer?.();
  }
}

/**
 * Page ids in the order their rules load: the page the URL hash names first, the rest as given. The
 * whole-Hub run shows every page and core takes the first matching rule, so another page's default
 * (Home's and Guide's answer GET /computers for one realm) must not shadow the page being opened.
 * Decided once at boot: a later in-app move to another page keeps the order it booted with.
 */
export function bootPageOrder(pageIds: readonly string[], hash: string): string[] {
  const here = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return pageIds.includes(here) ? [here, ...pageIds.filter((id) => id !== here)] : [...pageIds];
}

/**
 * The core-format rules (core's defineFixtures: a state is a list of reply() rules) of these pages
 * for one fixture state; a page without that state gives its default. Old-format fixtures (keyed
 * answers for fixtureSource) give nothing here: fixtureSource still answers them. Both formats live
 * side by side until every data.ts uses core's defineQuery.
 */
export async function loadCoreRules(pageIds: readonly string[], state: string | null): Promise<FixtureRule[]> {
  // Pages that have the asked state put their rules first: core takes the first matching rule, so
  // another visible page's default (the whole-Hub run shows every page) never shadows that state.
  const named: FixtureRule[] = [];
  const rest: FixtureRule[] = [];
  for (const id of pageIds) {
    const fx = (await loadFixtures(id)) as unknown as { default: string; states: Record<string, unknown> } | null;
    if (!fx) continue;
    const has = state !== null && state in fx.states;
    (has ? named : rest).push(...stateRules(has ? fx.states[state] : fx.states[fx.default]));
  }
  return [...named, ...rest];
}

/** The core-format rules of one state: a core-format state is its rules; a table state's are its `rules` key. */
export function stateRules(state: unknown): FixtureRule[] {
  if (Array.isArray(state)) return state as FixtureRule[];
  const rules = (state as { rules?: unknown } | null | undefined)?.rules;
  return Array.isArray(rules) ? (rules as FixtureRule[]) : [];
}

/** The keyed answer of a table state; the `rules` key is core's, never an answer. */
export function stateAnswer(state: FixtureState | undefined, key: string): QueryAnswer | MutationAnswer | undefined {
  if (key === 'rules') return undefined;
  const ans = state?.[key];
  return ans === undefined || Array.isArray(ans) ? undefined : (ans as QueryAnswer | MutationAnswer);
}

export class FixtureError extends Error {
  constructor(readonly kind: FixtureErrorKind | 'missing') {
    super(`fixture ${kind}`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}

function never(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)));
}

async function answer(pageId: string, key: string, fx: FxState): Promise<QueryAnswer | MutationAnswer> {
  const fixtures = await loadFixtures(pageId);
  if (!fixtures) throw new FixtureError('missing');
  const state = fixtures.states[fx.state ?? ''] ?? fixtures.states[fixtures.default];
  const ans = stateAnswer(state, key);
  if (!ans) throw new FixtureError('missing');
  return ans;
}

/** Results of a fixture mutation: the C9 outcome and the optional answer body. */
export interface FixtureMutationResult<T> {
  outcome: OutcomeKind;
  data?: T;
  code?: string;
}

/**
 * The data source of one page. `useQuery(key)` answers from the current state's `key` entry;
 * `useMutation(key)` resolves with that entry's outcome and never retries.
 */
export function fixtureSource(pageId: string) {
  return {
    useQuery<T>(key: string): UseQueryResult<T, FixtureError> {
      const fx = useFixtureState();
      return useQuery<T, FixtureError>({
        queryKey: ['fx', pageId, key, fx.state, fx.latency],
        retry: false,
        queryFn: async ({ signal }) => {
          const ans = await answer(pageId, key, fx);
          if ('pending' in ans) return never(signal);
          await sleep(ans.delayMs ?? LATENCY_MS[fx.latency], signal);
          if ('error' in ans) throw new FixtureError(ans.error);
          if ('data' in ans) return ans.data as T;
          throw new FixtureError('missing');
        },
      });
    },
    useMutation<T, V = void>(key: string): UseMutationResult<FixtureMutationResult<T>, FixtureError, V> {
      const fx = useFixtureState();
      return useMutation<FixtureMutationResult<T>, FixtureError, V>({
        retry: false,
        mutationFn: async () => {
          const ans = await answer(pageId, key, fx);
          if (!('outcome' in ans)) throw new FixtureError('missing');
          await sleep(ans.delayMs ?? LATENCY_MS[fx.latency]);
          const result: FixtureMutationResult<T> = { outcome: ans.outcome };
          if (ans.data !== undefined) result.data = ans.data as T;
          if (ans.code !== undefined) result.code = ans.code;
          return result;
        },
      });
    },
  };
}

// Gated on the build constant so a web build (fixtures off) folds the calls and keeps neither dev page.
if (__HUB_FIXTURES__) {
  // The dev-only pages (demo, kit gallery): app/pages.ts lists them only once this fixture module loaded.
  installDevPages({ demo: demoPage, gallery: kitGallery });
  // Page data modules reach fixtureSource through the seam (pageFixtures), never by importing this fixture module.
  installFixtureSeam({
    page: (pageId) => fixtureSource(pageId) as unknown as FallbackSource,
    errorKind: (e) => (e instanceof FixtureError ? e.kind : null),
    latency: () => fixtureStore.get().latency,
  });
}
