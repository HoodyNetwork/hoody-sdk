// One computer's catalogue as one immutable bundle: a single query per
// computer whose run reads providers, models and the ready list together (readCatalogue, plus the probes on an
// agent without provider status), so a model is ready only by the ready list of the same run. The caller reads only
// the bundle: never the parts from separate caches.
//   - Key: core's prefix (account, realm, generation: a bump drops it) + the computer (its Target). Another
//     computer is another query, so its earlier bundle never shows here.
//   - Every read of a run is bound to its key, never to whatever is current when the read starts: the run captures
//     the context for the key's own Target (core's capture) and hands it, with TanStack's abort signal, to the
//     reader (core's api() then sends nothing for a dead context or an aborted signal). A run whose captured
//     account, realm or generation is not its key's sends nothing; a run whose context died or whose signal was
//     aborted while it read gives no bundle. A run that started late (a fetch paused while offline) still reads
//     its own computer.
//   - The run consumes the abort signal: when the last observer leaves (another computer, unmount), TanStack
//     cancels the run and its answer is dropped.
//   - A failed ready read keeps providers and models and omits ready membership (the snapshot's `ready` is
//     'failed'). A failed providers or models read fails the run: the query's error, with the previous bundle of
//     the same computer kept as its data (TanStack keeps data on error), so the caller shows both.
//   - Not retried (core reads never are); a refetch while a run is out either restarts it (data held) or waits for
//     it: either way one run makes the bundle.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { alive, capture, type Ctx, type Target } from '../ctx';
import { prefix, queryClient, useCore } from '../query';
import { providersApi } from './call';
import type { Outcome, Settled } from './types';
import { readCatalogue, type CatalogueReader, type Part, type Snapshot } from './read';

export interface CatalogueBundle {
  /** Always ok here (a failed run is the query's error). */
  snap: Snapshot;
  /** The providers answer of the same run (the AI page's accounts read its raw rows). */
  providers: unknown;
}

/** A failed run: the failed part's outcome. */
export class CatalogueFailed extends Error {
  constructor(readonly err: Outcome) {
    super('catalogue read failed');
  }
}

/** A run that no longer belongs to its key (its context died or it was cancelled): it gives no bundle. */
export class CatalogueStale extends Error {
  constructor() {
    super('catalogue read no longer current');
  }
}

/** What a run binds its reader to: the captured context of the key's computer and the run's abort signal. */
export interface BundleBinding {
  readonly ctx: Ctx;
  readonly signal: AbortSignal;
}

/** The reader of one run, bound to that run's context and signal. */
export type BundleReader = (b: BundleBinding) => CatalogueReader;

/** The real reader: core's providers Api, every call sent under the run's own context (its computer, account,
 *  realm and generation) and abort signal. */
export const boundReader: BundleReader = ({ ctx, signal }) => providersApi(ctx.target ?? undefined, { ctx, signal });

/** One run: the bundle, or CatalogueFailed. */
export async function readBundle(api: CatalogueReader, wanted: readonly string[] = []): Promise<CatalogueBundle> {
  let raw: unknown = null;
  const reader: CatalogueReader = {
    ...api,
    providers: async (): Promise<Settled<unknown>> => {
      const p = await api.providers();
      if (p.ok) raw = p.body;
      return p;
    },
  };
  const part: Part<Snapshot> = await readCatalogue(reader, wanted);
  if (part.state !== 'ok') throw new CatalogueFailed(part.state === 'failed' ? part.err : { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} });
  return { snap: part.value, providers: raw };
}

const KEY = 'providers.catalogue-bundle';

type BundleKey = readonly [string, string | null, string, number, string, Target | null];

/** One run of the key's query, bound to that key (see the file comment). */
export async function runBundle(key: BundleKey, signal: AbortSignal, readerFor: BundleReader): Promise<CatalogueBundle> {
  const [, account, realm, gen, , target] = key;
  if (!target) throw new CatalogueStale();
  const ctx = capture(target);
  if (ctx.account !== account || ctx.realm !== realm || ctx.gen !== gen || !alive(ctx)) throw new CatalogueStale();
  const bundle = await readBundle(readerFor({ ctx, signal }));
  if (signal.aborted || !alive(ctx)) throw new CatalogueStale();
  return bundle;
}

/** The bundle of `computer` (null: nothing is asked). `readerFor` builds each run's reader from that run's
 *  binding (default: core's providers Api). */
export function useCatalogueBundle(computer: Target | null, readerFor: BundleReader = boundReader): UseQueryResult<CatalogueBundle, CatalogueFailed | Error> {
  const s = useCore();
  const key: BundleKey = [...prefix(s), KEY, computer];
  return useQuery<CatalogueBundle, CatalogueFailed | Error>(
    {
      queryKey: key,
      queryFn: ({ signal, queryKey }) => runBundle(queryKey as unknown as BundleKey, signal, readerFor),
      enabled: computer !== null,
      retry: false,
    },
    queryClient,
  );
}
