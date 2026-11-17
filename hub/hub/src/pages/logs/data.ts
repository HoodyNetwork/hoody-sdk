// The logs page's data. The controller reads everything through `LogsApi` (api.ts): core's declared routes in the
// Hub (`coreApi`), the fixture world in dev, shots and tests (`fixtureApi`, chosen by `__HUB_FIXTURES__`). The
// controller and the pure rules do not know which.
import { computerState, fixtureComputer, fixtureModeActive, partitioned, useCurrentComputer, pageFixtures } from '@core';
import { useShellData, type ShellData } from '@kit';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { coreApi, type LogsApi } from './api';
import { createLogs, type Computer, type Deps, type Logs, type PrefStore, type Prefs, type Snapshot } from './controller';
import type { Tx, ViewState } from './logic';
import { fixtureApiOf } from './fixtureApiSeam';
import type { World } from './world';
import { browserOnline, fileOriginPage, pageVisible } from './data.web';

// Fixture build only: the ship build (__HUB_FIXTURES__ false) holds no fixture module. The hooks below call it only in
// fixture MODE (`__HUB_FIXTURES__ && fixtureModeActive()`): a fixture build on a live transport (a terminal live mount, live tests) has no fixture side, and
// asking it throws FIXTURES_NOT_INSTALLED. Build constant and transport mode are both fixed for a page's life, so the
// hook order never changes between renders.
const source = __HUB_FIXTURES__ ? pageFixtures('logs')! : null;

export interface ComputerRead {
  data: Computer | null | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
  /** The failure is the shell's computer list (not read, or a page of a longer list): the page says that, never
   *  "couldn't reach the server" (the server may have answered). */
  listUnknown?: true;
}

/** The computer the page shows: the shell's selected one (core) in the Hub, the fixture state in dev, shots and tests. */
export function useComputer(): ComputerRead {
  const fxq = __HUB_FIXTURES__ && fixtureModeActive() ? source!.useQuery<Computer | null>('computer') : null;
  const target = useCurrentComputer();
  const shell = useShellData();
  if (fxq && !fxq.isError) return fxq;
  return liveComputer(target, shell);
}

/** The Hub's answer: a chosen computer is shown (its row's name and state once listed). With none chosen, an unknown
 *  list is never "none": loading → pending; not read → failed, Try again being the shell's read; a known list → null. */
export function liveComputer(target: { project: { id: string }; container: { id: string } } | null, shell: ShellData): ComputerRead {
  const done = { isPending: false, isError: false, refetch: () => undefined };
  if (!target) {
    if (shell.computers.length) return { data: null, ...done };
    if (shell.computersRead === 'loading') return { ...done, data: undefined, isPending: true };
    if (shell.computersRead === 'unknown') return { ...done, data: undefined, isError: true, listUnknown: true, refetch: () => shell.retryComputers?.() };
    return { data: null, ...done };
  }
  const id = target.container.id;
  const row = shell.computers.find((c) => c.id === id);
  // Fixture mode only (live-ends / live-pages guards): a live page never reads the fixture world, in any build.
  const w = fixtureModeActive() ? fixtureComputer(id) : undefined;
  return { ...done, data: { id, projectId: target.project.id, name: row?.name ?? w?.name ?? '', running: row ? (row.running ?? true) : w ? computerState(w.status) === 'running' : true, ...(row?.color ? { color: row.color } : {}) } };
}

function useWorld(): { data?: World; isError: boolean; isPending: boolean } {
  return __HUB_FIXTURES__ && fixtureModeActive() ? source!.useQuery<World>('world') : NO_WORLD;
}
const NO_WORLD = { data: undefined, isError: true, isPending: false };

/** The account's record for this computer (hub_logs_v1), kept per account and computer; a missing store keeps nothing. */
export function prefStore(computerId: string): PrefStore {
  let box: ReturnType<typeof partitioned> | null = null;
  try { box = partitioned('hub_logs_v1', { scope: 'account+computer', area: 'local', purge: true }); } catch { box = null; }
  const part = computerId.slice(0, 24);
  return {
    read(): Prefs { try { const v = box && box.get(part); return v && typeof v === 'object' ? (v as Prefs) : {}; } catch { return {}; } },
    write(p: Prefs): boolean { try { return !!box && box.set(p, part); } catch { return false; } },
  };
}

/** One controller per computer shown; ends with the view. `api` answers the reads (the world in fixtures). */
export function useLogs(computer: Computer | null | undefined, api: LogsApi | null, t: Tx, initial: ViewState): Logs | null {
  const [logs, setLogs] = useState<Logs | null>(null);
  const key = computer ? computer.id + (computer.running ? '+' : '-') : '';
  useEffect(() => {
    if (!computer || !api) { setLogs(null); return; }
    const deps: Deps = {
      api, computer, initial, prefs: prefStore(computer.id), t,
      visible: pageVisible, online: browserOnline, fileOrigin: fileOriginPage,
    };
    const l = createLogs(deps);
    setLogs(l);
    return () => { l.dispose(); setLogs((c) => (c === l ? null : c)); };
    // The controller lives as long as the computer and the api; the view and t reach it through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, api]);
  return logs;
}

const EMPTY: Snapshot | null = null;
export function useSnapshot(logs: Logs | null): Snapshot | null {
  return useSyncExternalStore(
    (fn) => (logs ? logs.subscribe(fn) : () => {}),
    () => (logs ? logs.get() : EMPTY),
    () => EMPTY,
  );
}

/** The seam to the network: core's routes in the Hub, the fixture world in dev, shots and tests. */
export function useLogsApi(): { api: LogsApi | null; pending: boolean; error: boolean } {
  const w = useWorld();
  // One api per page life: a refetch of the fixture answer must not restart the controller.
  const made = useRef<LogsApi | null>(null);
  if (!made.current && __HUB_FIXTURES__ && w.data) made.current = fixtureApiOf(w.data);
  if (!made.current && (!__HUB_FIXTURES__ || w.isError)) made.current = coreApi();
  return { api: made.current, pending: __HUB_FIXTURES__ && w.isPending && !made.current, error: false };
}
