// Where a launch shows on a Board tile (a Placement), from its row and the core's handle. Pure: no reads, no sends.
//
// Contract, in plain words:
//   - Nothing while its Open is still in flight (the handle comes before the request leaves, so it proves
//     nothing yet), and nothing without a handle: no number is known.
//   - A terminal app is its terminal, a screen app its display, by the numbers in the handle (the run kit's
//     terminal N and display N are the Board's terminal and display tiles, session N).
//   - A web app is its web port (with its path) once a read gave the port while it starts or runs.
//   - An unknown outcome with a handle is placed too: a web app without a port as its terminal.
//     The tile then shows "may still be starting" (LaunchHold) until a read proves it.
//   - A launch that ended or never started is placed nowhere.
import type { OpenApp } from '../logic';
import type { StoredRow } from '../parts/recent';

export type Placement = { kind: 'terminal' | 'display'; session: number } | { kind: 'port'; port: number; path: string };

const LIVE_STATES: ReadonlySet<string> = new Set(['starting', 'started', 'running', 'ready']);

export interface Placements {
  /** Place it now. */
  now?: Placement;
  /** Its terminal, which can be placed instead (a web app whose page is not ready yet). */
  terminal?: Placement;
}

export function placementOf(row: Pick<OpenApp, 'state' | 'opensIn'>, run: StoredRow | undefined, opening = false): Placements {
  if (!run || opening) return {};
  const terminal: Placement = { kind: 'terminal', session: run.terminal_id };
  const live = LIVE_STATES.has(row.state);
  const unknown = row.state === 'unknown';
  if (!live && !unknown) return {};
  if (row.opensIn === 'terminal') return { now: terminal, terminal };
  if (row.opensIn === 'screen') return { now: { kind: 'display', session: run.display }, terminal };
  if (live && run.web) return { now: { kind: 'port', port: run.web.port, path: run.web.path }, terminal };
  return unknown ? { now: terminal, terminal } : { terminal };
}

/** The launch shown at a place on a computer: a terminal or display by number, or a web port. */
export function runAt(run: StoredRow, computer: string, p: Placement): boolean {
  if (run.computer.computer_id !== computer) return false;
  if (p.kind === 'terminal') return run.terminal_id === p.session;
  if (p.kind === 'display') return run.display === p.session;
  return p.kind === 'port' && !!run.web && run.web.port === p.port;
}
