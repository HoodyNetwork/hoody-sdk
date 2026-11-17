// The API page in a terminal draws no "Download the endpoint list (JSON)".
//
// | # | Web | Terminal without the guard |
// |---|---|---|
// | 1 | The header button saves the catalog as a file (core save: an object URL and a link clicked in the document) | Drawn and reached by Tab. A press read `document` (core/kit-io.ts save): a strict-globals trap, which ends a live mount as a crash (term/app/lifecycle.ts). With core save refusing off a web page, the press says "The list is too large to save", which is not why |
//
// A terminal host saves no file (term/env/session.ts `files: null`); the host contract says callers leave the action
// out (core/host-env.ts `files`), as the Markdown viewer does. The header's other control and the page itself stay.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** The button's two labels (export.label, export.refused in strings.en.json). */
const EXPORT = /Download the endpoint list|too large to save/;

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the catalog is drawn and the header holds no file download`, async () => {
    s = await renderPage({ page: 'api', cols, rows });
    const frame = await s.settle();
    // Positive controls: the page drew its header and the loaded catalog (the button is drawn only once it loaded).
    expect(frame).toContain('Every endpoint of the Hoody API');
    expect(frame).toMatch(/\d+ endpoints/);
    expect(frame).not.toMatch(EXPORT);
    expect(flat(tree(s)).filter((n) => EXPORT.test(n.name ?? '')).map((n) => n.name)).toEqual([]);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}

test('Tab from the top reaches the endpoint search without passing a download button', async () => {
  s = await renderPage({ page: 'api', cols: 120, rows: 40 });
  await s.settle();
  const passed: string[] = [];
  for (let i = 0; i < 160 && focusedNode(tree(s))?.role !== 'searchbox'; i++) {
    await s.keys.press('tab');
    const n = focusedNode(tree(s));
    if (n) passed.push(`${n.role} ${n.name}`);
  }
  // Positive control: the walk went through the page header and on to the list's search field (after the header).
  expect(focusedNode(tree(s))?.role).toBe('searchbox');
  expect(passed.filter((x) => EXPORT.test(x))).toEqual([]);
  expect(s.trapsAt).toEqual([]);
}, 240_000);
