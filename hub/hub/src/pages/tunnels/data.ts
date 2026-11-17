// The Tunnels page's data, on core (defineQuery): live in the Hub, core's fixture transport in dev, shots and tests.
//
// The gate: the daemon's program overview first. hoody-tunnel not listed → not installed;
// stopped → no kit read at all (the lazy program would start for it); running → the tunnel program's three reads,
// read again together every 15 s while the overview says running and the tab is shown. Opening the page or Refresh may
// wake a program that was stopped meanwhile: accepted (the lazy wake is intended).
//
// The rows shown are one snapshot: the first complete read, then only a refresh whose three reads all answered and
// parsed (logic nextSnapshot). The three reads are refetched together by one poll, never by three timers of their own:
// timers reset on each answer and drift apart, and a drifted refresh would mix a newer read with an older one.
import { POLL_MS, OVERVIEW_MS, overviewQ, tunnelsQ, sessionsQ, bindingsQ, healthQ } from './data.pure';
export { POLL_MS, OVERVIEW_MS, useComputer, tunnelsQ, bindingsQ, firstSeen } from './data.pure';
export type { Computer } from './data.pure';
import { capture, hostEnv } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nextSnapshot, type Read, type Snapshot } from './logic';

const readOf = <T,>(q: { data: T | undefined; isSuccess: boolean; isFetching: boolean; dataUpdatedAt: number }): Read<T> => ({
  data: q.data,
  ok: q.isSuccess,
  fetching: q.isFetching,
  at: q.dataUpdatedAt,
});

/** The gate, the live reads and the snapshot shown. `on`: a running computer is shown; `computer`: its id. */
export function useTunnels(on: boolean, computer: string) {
  const overview = overviewQ.use(undefined, { enabled: on, refetchInterval: on ? OVERVIEW_MS : false });
  const running = on && overview.data === 'running';
  // No timer of their own: the poll below refetches the three together.
  const live = { enabled: running } as const;
  const tunnels = tunnelsQ.use(undefined, live);
  const sessions = sessionsQ.use(undefined, live);
  const bindings = bindingsQ.use(undefined, live);
  const health = healthQ.use(undefined, { enabled: running });

  const [kept, setKept] = useState<{ computer: string; snap: Snapshot } | null>(null);
  const prev = kept?.computer === computer ? kept.snap : null;
  // The first complete read for this computer (all three settled, answered and parsed).
  const first = prev ? null : nextSnapshot(null, readOf(tunnels), readOf(sessions), readOf(bindings));
  useEffect(() => {
    if (first) setKept({ computer, snap: first });
  }, [first, computer]);

  // One refresh generation: the three reads together; only the newest generation commits, and only when all three
  // answered and parsed. Nothing when no computer is shown, or another one is, by the time it answers.
  const gen = useRef(0);
  const pull = useCallback(async () => {
    const own = capture().target?.container.id;
    if (!own || own !== computer) return;
    const g = ++gen.current;
    const [t, s, b] = await Promise.all([tunnels.refetch(), sessions.refetch(), bindings.refetch()]);
    if (g !== gen.current || capture().target?.container.id !== own) return;
    setKept((k) => {
      const p = k?.computer === own ? k.snap : null;
      const n = nextSnapshot(p, readOf(t), readOf(s), readOf(b));
      return n && n !== p ? { computer: own, snap: n } : k;
    });
  }, [computer, tunnels, sessions, bindings]);
  const pullRef = useRef(pull);
  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!hostEnv().visible()) return;
      void pullRef.current();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [running, computer]);

  // Refresh / Try again: the overview again, then the program's reads only if it still says running.
  const refresh = useCallback(async () => {
    if (!capture().target) return;
    const o = await overview.refetch();
    if (o.data !== 'running' || !capture().target) return;
    await pull();
  }, [overview, pull]);
  const snap = prev ?? first;
  return useMemo(() => ({ overview, tunnels, sessions, bindings, health, refresh, snap }), [overview, tunnels, sessions, bindings, health, refresh, snap]);
}
