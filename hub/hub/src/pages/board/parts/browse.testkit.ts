// Test helpers for Add a program's computer step: its rows are tiles (grid rows) under one kind at a time, the kinds
// in a rail (a strip on a phone). A tile is looked for in the open kind first, then in each other kind in turn, so a
// test names the tile it presses and not where it sits.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import strings from '../strings.en.json';

const S = strings as Record<string, string>;
type Name = string | RegExp;

/** The kinds' rail (or strip). */
export const kindsRail = () => screen.queryByRole('group', { name: S['browse.kinds'] }) ?? screen.queryByRole('tablist', { name: S['browse.kinds'] });
const kindButtons = () => {
  const rail = kindsRail();
  return rail ? [...within(rail).queryAllByRole('button'), ...within(rail).queryAllByRole('tab')] : [];
};
/** The kinds' names, in order. */
export const kindNames = () => kindButtons().map((b) => b.textContent ?? '');
/** Open a kind by its name. */
export function toKind(name: Name) {
  const b = kindButtons().find((x) => (typeof name === 'string' ? x.textContent === name : name.test(x.textContent ?? '')));
  if (!b) throw new Error(`no kind ${String(name)}: ${kindNames().join(', ')}`);
  fireEvent.click(b);
}
// The picker's own kinds (the launcher's Apps and Recent are opened by name: toKind).
const OWN = ['browse.tab.all', 'browse.tab.programs', 'browse.tab.ports', 'browse.tab.bots', 'browse.tab.addresses'].map((k) => S[k]!);
const ownKinds = () => kindButtons().filter((b) => OWN.some((w) => (b.textContent ?? '').startsWith(w)));
/** The tile of that name: in the open kind, else the first of the picker's own kinds that has it (which is left open). */
export function queryTile(name: Name): HTMLElement | null {
  const here = screen.queryByRole('row', { name });
  if (here) return here;
  for (let i = 0; i < ownKinds().length; i++) {
    const b = ownKinds()[i];
    if (!b) continue;
    fireEvent.click(b);
    const found = screen.queryByRole('row', { name });
    if (found) return found;
  }
  return null;
}
export function tile(name: Name): HTMLElement {
  const found = queryTile(name);
  if (!found) throw new Error(`no tile ${String(name)} in ${ownKinds().map((b) => b.textContent).join(', ') || 'no kinds'}`);
  return found;
}
export async function findTile(name: Name, timeout = 4000): Promise<HTMLElement> {
  let found: HTMLElement | null = null;
  await waitFor(() => { found = tile(name); }, { timeout, interval: 200 });
  return found!;
}
/** The names of the tiles the open kind shows, in order. */
export const tileNames = () => screen.queryAllByRole('row').map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '');
/** The titles of the open kind's section cards, in order. */
export const cardTitles = () => screen.queryAllByRole('heading').map((h) => h.textContent ?? '').filter((x) => / · \d+$/.test(x));
