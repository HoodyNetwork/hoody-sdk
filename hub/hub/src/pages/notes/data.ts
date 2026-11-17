// The notes page's data. Live: the computer list goes through core (coreSource) and each computer's Notes through
// coreApi (api() to its Notes program). Under the fixture transport (hub:dev, hub:shots, tests) the same hooks
// answer from fixtures.ts. The rules are in logic.ts, the New note flow in flows.ts.
import { computerState, containersRoute, coreSource, fixtureModeActive, pageFixtures, stringOrEmpty as str } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Api, NotesApi } from './api';
import { coreApi } from './coreApi';
import { fixtureApiOf } from './fixtureApiSeam';
import { MAX_COMPUTERS } from './logic';
import type { Computer, Loaded } from './types';

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

export function toComputers(raw: unknown): Computer[] {
  const d = rec(rec(raw).data ?? raw);
  const rows = Array.isArray(d.computers) ? d.computers : Array.isArray(raw) ? raw : [];
  const out: Computer[] = [];
  for (const r of rows.map(rec)) {
    const id = str(r.id);
    if (!id) continue;
    const realms = Array.isArray(r.realm_ids) ? r.realm_ids.filter((x): x is string => typeof x === 'string') : [];
    out.push({ id, projectId: str(r.project_id), name: str(r.name) || id, ...(str(r.server_name) ? { serverName: str(r.server_name) } : {}), state: computerState(r.status), ...(typeof r.color === 'string' ? { color: r.color } : {}), ...(realms.length ? { realms } : {}) });
  }
  return out;
}

/** The list as the page reads it: a body without a list is a read error, and so is an EMPTY first page of a longer list (a computer
 *  may be on a later page): neither is "no computers" (the page would say Get a computer). A non-empty page lists what it holds. */
function readComputers(raw: unknown): Computer[] {
  const d = rec(rec(raw).data ?? raw);
  if (!Array.isArray(d.computers) && !Array.isArray(raw)) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
  const out = toComputers(raw);
  const pages = rec(d.pagination).totalPages;
  const rows = Array.isArray(d.computers) ? d.computers.length : out.length;
  if (rows === 0 && (typeof pages === 'number' && pages > 1)) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
  return out;
}

const source = coreSource(
  'notes',
  { reads: { computers: { route: containersRoute, input: () => ({ query: { page: 1, limit: 100 } }), staleTime: 15_000, select: readComputers } } } as never,
  // The ship build (__HUB_FIXTURES__ false) holds no fixture module: the fallback is given only in a fixture build,
  // the only build where coreSource answers from it (fixtureModeActive needs __HUB_FIXTURES__).
  pageFixtures('notes'),
);

/** The account's computers in the shown realm. */
export function useComputers() {
  return source.useQuery<Computer[]>('computers');
}

export const useApi = (): NotesApi => useMemo(() => (fixtureModeActive() ? fixtureApiOf() : coreApi()), []);

/** The computers whose Notes the page reads: the first MAX_COMPUTERS, in the list's order. */
export const shownOf = (all: readonly Computer[] | undefined): Computer[] => (all ?? []).slice(0, MAX_COMPUTERS);

export interface Notes {
  loads: Readonly<Record<string, Loaded>>;
  /** Read one computer's Notes again. */
  reload(c: Computer): void;
  reloadAll(): void;
}

/** Each running computer's Notes, read once when the list arrives and again on request. */
export function useNotes(shown: readonly Computer[], api: Api): Notes {
  const [loads, setLoads] = useState<Record<string, Loaded>>({});
  const gen = useRef(0);
  const set = useCallback((id: string, v: Loaded) => setLoads((p) => ({ ...p, [id]: v })), []);
  const run = useCallback(
    (c: Computer) => {
      const g = gen.current;
      // A list already shown stays while it is read again: the open note and its frame stay with it. Only a computer
      // with no list yet (or one whose last read failed) shows as being read.
      setLoads((p) => (p[c.id]?.state === 'ok' ? p : { ...p, [c.id]: { state: 'loading' } }));
      void api.load(c).then((r) => {
        if (g !== gen.current) return;
        set(c.id, r ?? { state: 'cantTell' });
      });
    },
    [api, set],
  );
  const key = shown.map((c) => `${c.id}:${c.state}`).join(',');
  const latest = useRef(shown);
  latest.current = shown;
  const shownLoads = useRef(loads);
  shownLoads.current = loads;
  useEffect(() => {
    const g = gen;
    g.current++;
    // Another set of computers (one started, stopped or joined): a list already shown stays, with the open note and its frame.
    // Only a running computer's shown list is kept; one with none, or whose read was still out (its answer is no longer this
    // generation's) or failed, is read now.
    const running = latest.current.filter((c) => c.state === 'running');
    const kept: Record<string, Loaded> = {};
    for (const c of running) {
      const was = shownLoads.current[c.id];
      if (was?.state === 'ok') kept[c.id] = was;
    }
    setLoads(kept);
    for (const c of running) if (!kept[c.id]) run(c);
    return () => {
      g.current++;
    };
  }, [key, run]);
  const reload = useCallback((c: Computer) => run(c), [run]);
  const reloadAll = useCallback(() => {
    for (const c of latest.current) if (c.state === 'running') run(c);
  }, [run]);
  return { loads, reload, reloadAll };
}
