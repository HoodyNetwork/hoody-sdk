// AI → New chat → "Ask the agent" (the "Do it every day" ask) calls
// requestAnimationFrame in askDaily (src/pages/ai/new/NewChat.tsx) must not raise TERM_GLOBAL inside the key handler, which would leave the prompt
// in the box with the focus and caret never moved to it, and a trap in the session's receipt (exit non-zero).
// Keys (120x40, fixtures): Tab to "New chat", Enter, Tab to "Ask the agent", Enter.
import { afterEach, expect, test } from 'bun:test';
// Page-driving helpers for the terminal Hub.
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../../../src/term/prim/semantics';

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

test('AI new chat: "Ask the agent" puts the prompt in the box with no trap and focuses the message box', async () => {
  s = await open('ai');
  await tabTo(s, /^New chat$/, 'link');
  await s.keys.press('enter');
  await tabTo(s, /^Ask the agent$/);
  await s.keys.press('enter');
  await s.settle();
  clean(s);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(focused(s)).toMatchObject({ role: 'textbox' });
}, 240_000);
