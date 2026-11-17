// The terminal program view's title: the program (or port, or script) and, when the route's handle names a computer of
// the account's own list, that computer's name from the list. Nothing of the route is echoed: the handle is
// only looked up (`<name>.<last 4 of the id>`, links.ts handleOf), a script's route is never shown (free route text),
// and an unlisted handle gives the program's name alone. In the Board's own words (tile.name / tile.port / tile.script).
import type { ViewRef } from '../links';
import type { T } from './text';

type S = (key: 'term.view.title', vars: { name: string; computer: string }) => string;

/** A computer as the shell lists it (ShellComputer: id + name). */
export interface ListedComputer { readonly id: string; readonly name: string }

const listedOf = (handle: string, known: readonly ListedComputer[]): ListedComputer | undefined =>
  known.find((x) => typeof x?.id === 'string' && /^[0-9a-f]{24}$/.test(x.id) && typeof x.name === 'string' && x.name !== '' && `${x.name}.${x.id.slice(-4)}` === handle);

export function programViewTitle(target: ViewRef, t: T, s: S, known: readonly ListedComputer[]): string {
  const name = 'program' in target
    ? t('tile.name', { program: target.program, session: target.session })
    : target.protocol === 'exec' ? t('tile.script') : t('tile.port', { port: target.port });
  const c = listedOf(target.handle, known);
  return c ? s('term.view.title', { name, computer: c.name }) : name;
}

/** True when the hand-off's web address opens this view itself: a program or HTTP port view of a listed computer
 *  (the rule of kit states/handoff.pure.ts pageRoute). A script view, or a handle no listed computer has (or no list
 *  yet), carries the Board alone, so the hand-off must name the Board, not the program. */
export function viewTravels(target: ViewRef, known: readonly ListedComputer[]): boolean {
  return !('protocol' in target && target.protocol === 'exec') && listedOf(target.handle, known) !== undefined;
}
