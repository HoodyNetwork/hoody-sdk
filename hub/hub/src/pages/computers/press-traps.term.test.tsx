// Computers, reached by a press: browser globals read in a handler.
//
// | # | Press | Web code | In a terminal before the fix |
// |---|---|---|---|
// | 1 | An open computer, Ctrl+K, "Back to the list" (the page's Esc key, run from the palette) | view.tsx: requestAnimationFrame, then document.querySelector for the row | TERM_GLOBAL in the palette's run |
// | 2 | Network → Use it in your browser → Firefox → Download proxy.pac | ConnectProxy.tsx DownloadPac: document.createElement('a') | TERM_GLOBAL in the key handler: nothing saved, nothing said |
//
// 2: a terminal cannot save a file to the device (core/host-env.ts `files`): the step offers the file's text to copy.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const focused = (p: PageSession): { role: string; name: string } | null => {
  const n = focusedNode(tree(p));
  return n ? { role: n.role, name: n.name } : null;
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
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

test('"Back to the list" from the palette closes the computer with no trap', async () => {
  s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1', cols: 120, rows: 40 });
  expect(await s.settle()).toContain('‹ Computers');
  await s.keys.press('k', { ctrl: true });
  await s.settle();
  await s.keys.type('back');
  expect(await s.settle()).toContain('Back to the list');
  await s.keys.press('enter');
  const frame = await s.settle();
  clean(s);
  expect(frame).toContain('8 computers');
  expect(frame).not.toContain('‹ Computers');
}, 240_000);

test('the Firefox proxy file is offered as text to copy, and the press traps nothing', async () => {
  s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1&tab=network', cols: 120, rows: 40 });
  await s.settle();
  const open = flat(tree(s)).find((n) => n.role === 'button' && n.name === 'Use it in your browser');
  expect(open).toBeDefined();
  act(getByRef(tree(s), open!.ref)!, 'press');
  expect(await s.settle()).toContain('Save the proxy file to your computer.');
  await tabTo(s, /proxy\.pac$/);
  expect(focused(s)?.name).toBe('Copy proxy.pac');
  await s.keys.press('enter');
  await s.settle();
  clean(s);
  expect(s.frame).not.toContain('Download proxy.pac');
}, 240_000);
