// Files' row menu, the three entries that hand a folder to a program. Each press passes the landing fence of
// pages/apps/links.ts first, which must not read window.location.href (TERM_GLOBAL) inside the key handler; the app
// launcher's scroll cue (launch/FindPane.tsx MoreBelow) must not ask `typeof IntersectionObserver` in an effect.
//
// | # | Press | Expected |
// |---|---|---|
// | 1 | ⋯ → Open with… | its drawer opens on the folder |
// | 2 | ⋯ → Launch an app here… | the launcher opens, list and all |
// | 3 | ⋯ → Open terminal here… | leaves for the Board with the terminal to add |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): { role: string; name: string } | null => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }));
  return n ? { role: n.role, name: n.name } : null;
};
/** The first row's menu (`.`), then Down to the item, then Enter; waits for `want` (what the item opens is loaded on
 *  first use, a few turns after the press when this file is not the first in the process). */
async function pick(p: PageSession, item: string, want: string): Promise<string> {
  await p.keys.press('.');
  for (let i = 0; i < 14 && focused(p)?.name !== item; i++) await p.keys.press('down');
  expect(focused(p)).toEqual({ role: 'menuitem', name: item });
  await p.keys.press('enter');
  let frame = await p.settle();
  for (let i = 0; i < 30 && !frame.includes(want); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await p.settle(); }
  return frame;
}
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}
async function files(): Promise<PageSession> {
  const p = await renderPage({ page: 'files', cols: 120, rows: 40 });
  await p.settle();
  return p;
}

test('Open with… opens its drawer on the folder', async () => {
  s = await files();
  const frame = await pick(s, 'Open with…', 'Open “bin” with');
  clean(s);
  expect(frame).toContain('Open “bin” with');
  expect(frame).toContain('Open terminal here');
}, 240_000);

test('Launch an app here… opens the launcher, list and all', async () => {
  s = await files();
  const frame = await pick(s, 'Launch an app here…', 'Find an app');
  clean(s);
  expect(frame).toContain('Launch an app in “bin”');
  expect(frame).toContain('Find an app');
}, 240_000);

test('Open terminal here… leaves for the Board with the terminal to add', async () => {
  s = await files();
  const frame = await pick(s, 'Open terminal here…', 'Board');
  clean(s);
  expect(frame).toContain('Board');
  expect(frame).not.toContain('The folders on your computers.');
}, 240_000);
