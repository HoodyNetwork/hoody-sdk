// An InfoTip in a table cell cut its words instead of wrapping: on AI > Agents at 80x24 the
// "Where" tip of a Hoody-owned agent showed "Hoody owns this agent. Only its" in a one-line box. The cell's OneLine
// (TableClip) reached the tip's Text through React context, so it never wrapped. A layer now ends the OneLine at its
// panel (prim/Overlay.ts). This drives the real page at 80x24 and reads the drawn tip.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; const n = focusedNode(semanticsOf({ root: r.root, stdin: r.stdin })); return n ? { role: n.role, name: n.name } : null; };

test('AI agents at 80x24: the Where tip of a Hoody-owned agent wraps inside its box, every word shown', async () => {
  s = await renderPage({ page: 'ai', cols: 80, rows: 24 });
  await s.settle();
  for (let i = 0; i < 160 && !(focused()?.role === 'link' && focused()?.name === 'Agents'); i++) await s.keys.press('tab');
  expect(focused()?.name).toBe('Agents');
  await s.keys.press('enter');
  await s.settle();
  for (let i = 0; i < 40 && focused()?.name !== 'About Where: Product-owned'; i++) await s.keys.press('tab');
  expect(focused()?.name).toBe('About Where: Product-owned');
  await new Promise((r) => setTimeout(r, 100));
  await s.settle();
  const lines = s.frame.split('\n');
  const top = lines.findIndex((l) => l.includes('About Where: Product-owned'));
  expect(top).toBeGreaterThanOrEqual(0);
  // The box from its top edge to its bottom edge, in the tip's columns.
  const left = lines[top]!.indexOf('┌');
  const bottom = lines.findIndex((l, i) => i > top && l[left] === '└');
  expect(bottom).toBeGreaterThan(top);
  const inside = lines.slice(top + 1, bottom).map((l) => l.slice(left + 1, l.indexOf('│', left + 1)).trim()).join(' ');
  expect(inside).toBe('Hoody owns this agent. Only its model can change.');
  // Every line of the box stays inside the screen.
  for (const l of lines.slice(top, bottom + 1)) expect(l.trimEnd().length).toBeLessThanOrEqual(80);
  expect(s.failures).toEqual([]);
}, 240_000);
