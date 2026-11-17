// Home, reached by a press: browser globals read in a handler or in an effect after one.
// Strict globals catch a trap at mount; these ran only after a key.
//
// | # | Press | Web code | In a terminal without the guard |
// |---|---|---|---|
// | 1 | Enter on a starter chip | AskStrip.pick: requestAnimationFrame, then form.querySelector('input') | TERM_GLOBAL in the key handler: the words arrived, the keyboard stayed on the chip |
// | 2 | "What is Hoody?", then "Hide the welcome" | view.tsx effect: visibleHeaderControl() searches the document | TERM_GLOBAL in an effect: "This page could not be drawn" |
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
async function tabTo(p: PageSession, name: RegExp): Promise<void> {
  for (let i = 0; i < 160 && !name.test(focused(p)?.name ?? ''); i++) await p.keys.press('tab');
  expect(focused(p)?.name ?? '(nothing focused)').toMatch(name);
}
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}

test('a starter chip fills the Ask box and moves the keyboard to its end', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  await s.settle();
  await tabTo(s, /^Install the popular coding agents$/);
  await s.keys.press('enter');
  await s.settle();
  clean(s);
  expect(focused(s)).toMatchObject({ role: 'textbox' });
  // The cursor is at the end: typing continues the sentence.
  await s.keys.type(' now');
  expect(await s.settle()).toContain('the popular coding agents now');
}, 240_000);

test('hiding the welcome keeps the page', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  await s.settle();
  await tabTo(s, /^What is Hoody\?$/);
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, /^Hide the welcome$/);
  await s.keys.press('enter');
  const frame = await s.settle();
  clean(s);
  expect(frame).toContain('Good morning, Ada');
  expect(frame).not.toContain('HOW HOODY FITS TOGETHER');
  // The way back is drawn again.
  expect(frame).toContain('What is Hoody?');
}, 240_000);
