// The Tunnels page's queries and computer read (split out of data.ts so the terminal build shares them; the notes are at
// the top of data.ts). One query object each (defineQuery at module scope), never re-created. data.ts re-exports the
// public names and keeps useTunnels; overviewQ, sessionsQ and healthQ are for data.ts.
import { computerState, defineQuery, fixtureComputer, fixtureModeActive, programRoutes, useCurrentComputer, type ProgramOverviewWire, type Target } from '@core';
import { useShellData } from '@kit';
import { parseBindings, parseHealth, parseSessions, parseTunnels, tunnelProgram, type ProgramGate } from './logic';
import { routes } from './routes';

/** The live view's poll while the program runs. */
export const POLL_MS = 15_000;
/** The overview's poll (the daemon itself: reading it never wakes the tunnel program). */
export const OVERVIEW_MS = 30_000;

export interface Computer {
  id: string;
  name: string;
  /** How other pages address it in a URL: the name and the last four hex of the id (never the full id). */
  handle: string;
  running: boolean;
}

/** The shown computer (the shell's), as Programs reads it. With none shown, `read` carries the shell's computer list
 *  state ('loading' | 'unknown'; absent = known): until the list is known, no computer chosen is not yet "none". */
export function useComputer(): { data: Computer | null; target: Target | null; read?: 'loading' | 'unknown' } {
  const target = useCurrentComputer();
  const shell = useShellData();
  if (!target) return shell.computersRead ? { data: null, target, read: shell.computersRead } : { data: null, target };
  const id = target.container.id;
  const row = shell.computers.find((c) => c.id === id);
  const handle = (name: string) => (name ? `${name}.${id.slice(-4)}` : '');
  if (row) return { data: { id, name: row.name, handle: handle(row.name), running: row.running ?? true }, target };
  // Fixture mode only (live-ends / live-pages guards): a live page never reads the fixture world, in any build.
  const w = fixtureModeActive() ? fixtureComputer(id) : undefined;
  return { data: { id, name: w?.name ?? '', handle: handle(w?.name ?? ''), running: w ? computerState(w.status) === 'running' : true }, target };
}

// The daemon is program index 1; the same key as Programs' overview read (one cache entry, each page its own select).
export const overviewQ = defineQuery<ProgramOverviewWire, ProgramGate>(programRoutes.overview, { input: () => ({ index: 1 }), select: tunnelProgram });
export const tunnelsQ = defineQuery(routes.tunnels, { select: parseTunnels });
export const sessionsQ = defineQuery(routes.sessions, { select: parseSessions });
export const bindingsQ = defineQuery(routes.bindings, { select: parseBindings });
export const healthQ = defineQuery(routes.health, { select: parseHealth, staleTime: 5 * 60_000 });

// When each reconnecting listener was first seen in this tab (the kit gives no time of its own), per computer and row.
const seen = new Map<string, number>();
const SEEN_MAX = 2000;

/** When this computer first saw a row; a new row gets the current time. */
export function firstSeen(computer: string, rowId: string, now = Date.now()): number {
  const k = `${computer}|${rowId}`;
  const at = seen.get(k);
  if (at !== undefined) return at;
  if (seen.size >= SEEN_MAX) seen.delete(seen.keys().next().value as string);
  seen.set(k, now);
  return now;
}
