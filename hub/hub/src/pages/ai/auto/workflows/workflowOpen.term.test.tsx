// AI → Automations → Enter on a workflow row, in the terminal. WorkflowShown's source
// editor hooks the browser's unload (hookUnload, src/pages/ai/auto/workflows/Source.tsx:22: window.addEventListener)
// -> TERM_GLOBAL -> "This page could not be drawn".
// Keys (120x40, fixtures): Tab to "Automations", Enter, Enter (the first row, fix-ci, has the focus).
import { afterEach, expect, test } from 'bun:test';
// The terminal page-driving helpers.
import { renderPage, type PageSession } from '../../../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../../../../src/term/prim/semantics';

async function open(page: string, o: { path?: string; fx?: string; cols?: number; rows?: number } = {}): Promise<PageSession> {
  const s = await renderPage({ page, cols: o.cols ?? 120, rows: o.rows ?? 40, ...(o.path ? { path: o.path } : {}), ...(o.fx ? { fx: o.fx } : {}) });
  await s.settle();
  return s;
}
const focused = (s: PageSession): { role: string; name: string } | null => {
  const r = s.renderer as unknown as { root: never; stdin: never };
  const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }));
  return n ? { role: n.role, name: n.name } : null;
};
/** Tab until the focused node's name matches (and its role, when given). */
async function tabTo(s: PageSession, name: RegExp, role?: string, max = 160): Promise<void> {
  const hit = (): boolean => { const f = focused(s); return !!f && name.test(f.name) && (!role || f.role === role); };
  for (let i = 0; i < max && !hit(); i++) await s.keys.press('tab');
  expect(focused(s)?.name ?? '(nothing focused)').toMatch(name);
}
/** No trap, no page failure, no stop frame. */
function clean(s: PageSession): void {
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.frame).not.toContain('could not be drawn');
}

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('AI automations: opening a workflow draws its detail with no trap', async () => {
  s = await open('ai');
  await tabTo(s, /^Automations$/, 'link');
  await s.keys.press('enter');
  await s.settle();
  await s.keys.press('enter');
  const frame = await s.settle();
  clean(s);
  expect(frame).toContain('fix-ci');
}, 240_000);
