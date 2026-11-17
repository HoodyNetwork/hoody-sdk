// AI → New chat in the terminal: the first message may be as long as the chat engine takes and no longer. Past it the
// message box shows its count over the limit and Send is off, as on the web.
// Keys (120x40, fixtures): Tab to the message box, type.
import { afterEach, expect, test } from 'bun:test';
import { MAX_TEXT } from '@ask/io';
// Page-driving helpers for the terminal Hub.
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { focusedNode, queryAllByRole, semanticsOf, type SemNode } from '../../../../src/term/prim/semantics';

const tree = (s: PageSession): SemNode[] => {
  const r = s.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const focused = (s: PageSession) => focusedNode(tree(s));
const send = (s: PageSession): SemNode => {
  const b = queryAllByRole(tree(s), 'button', { name: /^Send/ });
  expect(b.length).toBeGreaterThan(0);
  return b[0]!;
};
async function tabTo(s: PageSession, role: string, max = 160): Promise<void> {
  for (let i = 0; i < max && focused(s)?.role !== role; i++) await s.keys.press('tab');
  expect(focused(s)?.role ?? '(nothing focused)').toBe(role);
}

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('AI new chat: one character past the chat engine\'s limit turns Send off and shows the count over it; at the limit Send is on', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/new', cols: 120, rows: 40 });
  await s.settle();
  await tabTo(s, 'textbox');
  await s.keys.type('a'.repeat(MAX_TEXT));
  await s.settle();
  expect(send(s).states.disabled ?? false).toBe(false);
  await s.keys.type('a');
  await s.settle();
  expect(send(s).states.disabled).toBe(true);
  const n = (MAX_TEXT + 1).toLocaleString('en-US');
  const max = MAX_TEXT.toLocaleString('en-US');
  expect(s.frame).toContain(`${n} / ${max}`);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
