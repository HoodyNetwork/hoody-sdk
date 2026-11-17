// Computers in a terminal offers no `c` page key: the shortcuts sheet never lists a key that does nothing ("Copy its
// terminal link" copied nothing). The menus' Copy terminal URL copies the link.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { livePageShortcuts } from '../../shell/pageShortcuts.pure';
import { copiesOf } from '../../term/prim/testing';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('120x40: with a computer open, no plain c key is offered, and a press copies nothing', async () => {
  s = await renderPage({ page: 'computers', cols: 120, rows: 40, path: '/computers?sel=atlas.00a1' });
  await s.settle();
  const copied = copiesOf(s.renderer);
  // The page's own keys are listed (t opens the terminal), so the list read is the page's.
  expect(livePageShortcuts().some((k) => k.key === 't')).toBe(true);
  expect(livePageShortcuts().filter((k) => k.key === 'c' && !k.mods?.length)).toEqual([]);
  await s.keys.press('c');
  expect(copied).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.trapsAt).toEqual([]);
}, 240_000);
