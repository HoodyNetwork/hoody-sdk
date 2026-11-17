// The Agent dock's first-use suggestions. A suggestion puts its words in the composer and
// moves the keyboard there on the next frame (AskPanel.tsx `fill`: requestAnimationFrame): TERM_GLOBAL in the key
// handler, the words in the box but the keyboard left on the suggestion. A terminal has no frames: a timer does it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { focusedNode, semanticsOf } from '../term/prim/semantics';

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

test('a first-use suggestion fills the composer and puts the keyboard at its end', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  await s.settle();
  await tabTo(s, /^Ask$/);
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, /^What's running here\?/);
  await s.keys.press('enter');
  await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(focused(s)).toEqual({ role: 'textbox', name: 'Message to your agent' });
  await s.keys.type(' now');
  expect(await s.settle()).toContain('ports. now');
  // The dock's open state outlives the render (kit/ask.ts keeps it for the process): close it for the next test file.
  await tabTo(s, /^Close Agent$/);
  await s.keys.press('enter');
  expect(await s.settle()).not.toContain('Close Agent');
}, 240_000);
