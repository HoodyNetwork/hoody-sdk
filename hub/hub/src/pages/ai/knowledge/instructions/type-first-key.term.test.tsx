// On AI > Knowledge > Instructions the first keystroke in the text must not trip a TERM_GLOBAL
// trap at held.ts window.addEventListener('beforeunload') (an edit that holds work arms the leave prompt). held.ts
// arms it through hostEnv().onLifecycle; this drives the whole page: focus the text, type, no trap, the letter is drawn.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): { role: string; name: string } | null => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }));
  return n ? { role: n.role, name: n.name } : null;
};

test('typing into the instructions text arms the leave prompt with no trap', async () => {
  s = await renderPage({ page: 'ai', cols: 120, rows: 40, path: '/ai/knowledge/instructions' });
  await s.settle();
  for (let i = 0; i < 40 && focused(s)?.name !== 'Instructions text'; i++) await s.keys.press('tab');
  expect(focused(s)).toMatchObject({ name: 'Instructions text' });
  await s.keys.type('Q');
  const frame = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  expect(frame).not.toContain('could not be drawn');
  expect(frame).toContain('Q');
}, 240_000);
