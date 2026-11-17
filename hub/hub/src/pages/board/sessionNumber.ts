// Which numbers "Open by number" accepts for a program in the Board picker.
//
// Contract, in plain words:
//   - The number opens exactly that instance (display-10 is display 10), never the next free one.
//   - sessionMax: the program's catalogue index range, capped at 9999 (terminal and display ids are valid only up
//     to 9999; above that the instance's host label is too long for the proxy anyway).
//   - A terminal or display number inside the run-open band (core RUN_BAND, 8001-9999) is where the Hub creates the
//     terminals and displays it launches apps into, and opening a missing one would create it. A display there is
//     always 'reserved': a listed terminal N does not prove display N runs (a display stops on its own while its
//     terminal keeps running, and a launch need not wait for its display), and nothing lists displays here. A terminal
//     there is 'unlisted' unless the computer's live terminal list names that number now (`listed`: termSessions
//     bandOf, read when the form opens). A saved tile or a recent is history, not proof; a read not answered yet, or
//     failed, proves nothing.
//   - Programs with one instance per computer (files, sqlite, notes) never reach this form.
import { inRunBand } from '@core';
import type { Catalog, TileProgram } from './embed/catalog';

export const SESSION_ID_MAX = 9999;

export function sessionMax(cat: Catalog, kit: TileProgram): number {
  const k = cat.kits[kit];
  const v = k?.defaultView ? cat.views[k.defaultView] : undefined;
  const max = v?.service ? cat.services[v.service]?.index?.max : undefined;
  return Math.min(typeof max === 'number' && max >= 1 ? max : SESSION_ID_MAX, SESSION_ID_MAX);
}

export type NumberProblem = 'range' | 'reserved' | 'unlisted' | null;

export function numberProblem(cat: Catalog, kit: TileProgram, n: number, listed: ReadonlySet<number> | null = null): NumberProblem {
  if (!Number.isInteger(n) || n < 1 || n > sessionMax(cat, kit)) return 'range';
  if (kit === 'display' && inRunBand(n)) return 'reserved';
  if (kit === 'terminal' && inRunBand(n) && !listed?.has(n)) return 'unlisted';
  return null;
}
