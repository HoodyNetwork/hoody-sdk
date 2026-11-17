// Computers, a desktop being stopped: the Desktop tab said "Stopping desktop 1…" twice in the terminal. A labelled
// Spinner sat before the same words (those were aria-hidden on the web; the terminal draws both, and its Spinner draws its
// label, kit/states/Spinner.term.tsx). The spinner is only the mark and the words are the status: once on the line, and
// as the status's name. 120x40: the tab's line is whole at that width.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
async function until(ok: () => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok() && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
const times = (line: string, word: string) => line.split(word).length - 1;
const one = (k: 'desktop.more' | 'desktop.stopping') => strings[k].replace('{{n}}', '1');
const found = (role: Role, name: string | RegExp) => queryAllByRole(tree(), role, { name });

test('120x40: a desktop being stopped is said once', async () => {
  // desktopStopSlow: the display stop answers after 60 s, a long timer the driver holds, so the tab stays on its line.
  s = await renderPage({ page: 'computers', fx: 'desktopStopSlow', path: '/computers?sel=atlas.00a1&tab=desktop', cols: 120, rows: 40, settleMs: 2000 });
  await until(() => found('button', one('desktop.more')).length > 0);
  const more = found('button', one('desktop.more')).at(-1);
  expect(more, s.frame).toBeDefined();
  act(more!, 'press');
  await s.settle();
  const stopItem = new RegExp(`^${strings['desktop.stop']}`);
  await until(() => found('menuitem' as Role, stopItem).length > 0);
  const item = found('menuitem' as Role, stopItem).at(-1);
  expect(item, s.frame).toBeDefined();
  act(item!, 'press');
  await s.settle();
  // The confirmation ("Stop desktop 1?") and its Stop desktop.
  await until(() => found('button', strings['desktop.stop']).length > 0);
  const go = found('button', strings['desktop.stop']).at(-1);
  expect(go, s.frame).toBeDefined();
  act(go!, 'press');
  await s.settle();
  const word = one('desktop.stopping');
  const f = await until(() => s!.frame.includes(word));
  const lines = f.split('\n').filter((l) => l.includes(word));
  expect(lines.length, f).toBeGreaterThan(0);
  expect(lines.map((l) => times(l, word)), f).toEqual(lines.map(() => 1));
  expect(found('status', new RegExp(word)).length, f).toBeGreaterThan(0);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(f).not.toContain('could not be drawn');
}, 180_000);
