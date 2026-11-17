// The pane foot's "computer · realm" line when the shell does not list the computer (computers still loading, or a
// computer outside the list): it shows the realm alone, never a dangling " · Personal" (pages/ai/parts/Pane.pure.ts
// whereLine; the chat header in Main.tsx uses the same line).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { whereLine } from './parts/Pane.pure';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test('whereLine drops the name and its separator when the computer has no name', () => {
  const t = (_k: 'foot.where', v: { computer: string; realm: string }) => `${v.computer} · ${v.realm}`;
  expect(whereLine(t, 'atlas', 'Personal')).toBe('atlas · Personal');
  expect(whereLine(t, '', 'Personal')).toBe('Personal');
});

test('the foot shows the realm alone while the computers are loading', async () => {
  const s = await renderPage({ page: 'ai', fx: 'loading', path: '/ai', cols: 80, rows: 24, settleMs: 3000 });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  const rows = s.frame.split('\n');
  expect(rows.filter((r) => /^\s*· Personal/.test(r))).toEqual([]);
  expect(rows.some((r) => /^\s*Personal\b/.test(r))).toBe(true);
}, 120_000);
