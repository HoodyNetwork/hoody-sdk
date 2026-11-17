// Scripts, "Try it" on an open script. The press shows the Test tab and asks it to put
// the keyboard on Send; TestTab waited a frame for that (requestAnimationFrame in an effect): TERM_GLOBAL, and
// "This page could not be drawn" in place of the script.
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

test('Try it shows the Test tab with its request, and the page stays', async () => {
  s = await renderPage({ page: 'scripts', cols: 120, rows: 40 });
  await s.settle();
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, /^Try it$/);
  await s.keys.press('enter');
  const frame = await s.settle();
  clean(s);
  expect(frame).toContain('▸Test');
  expect(frame).toContain('Send one request to the script as it is saved');
}, 240_000);
