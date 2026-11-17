// Terminal CardGrid: cards are drawn in rows of ~32 columns (one a line when narrow); one Tab stop; ←/→ by one card,
// ↑/↓ by a drawn row, Home/End, a letter jumps to the next card starting with it, Enter picks the card under the
// cursor; `focusKey` puts the cursor there once it is drawn. The focused card's title carries ›, never colour alone.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { CardGrid } from './CardGrid';
import { PickCard } from './PickCard';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const ITEMS = ['Uptime Kuma', 'Gitea', 'n8n', 'Grafana', 'Ghost'].map((n) => ({ k: n.toLowerCase().replace(/\s/g, ''), t: n }));
const grid = (picked: string[], focusKey?: string) => (
  <CardGrid label="Programs" items={ITEMS} keyOf={(i) => i.k} textOf={(i) => i.t} renderCard={(i) => <PickCard title={i.t} line="A program" />} onPick={(k) => picked.push(k)} {...(focusKey ? { focusKey } : {})} />
);
const draw = async (node: React.ReactNode, w: number, h = 20) => {
  t = await drawTest(<FocusRoot><PaneSize>{node}</PaneSize></FocusRoot>, { width: w, height: h });
  return t.settle();
};

test('three cards a row at 100 columns, one a line at 40; the cursor card says so with ›', async () => {
  let f = await draw(grid([]), 100);
  const first = f.split('\n').find((l) => l.includes('Uptime Kuma'))!;
  expect(first).toContain('Gitea');
  expect(first).toContain('n8n');
  t!.renderer.destroy();
  f = await draw(grid([]), 40);
  expect(f.split('\n').find((l) => l.includes('Uptime Kuma'))).not.toContain('Gitea');
  t!.mockInput.pressTab();
  f = await t!.settle();
  expect(f).toContain('› Uptime Kuma');
});

test('arrows move by card and by drawn row; a letter jumps; Enter picks the cursor card', async () => {
  const picked: string[] = [];
  await draw(grid(picked), 100);
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressArrow('down'); await t!.settle(); // row 2: Grafana (3 a row)
  t!.mockInput.pressEnter(); await t!.settle();
  t!.mockInput.pressArrow('right'); await t!.settle(); // Ghost
  t!.mockInput.pressEnter(); await t!.settle();
  t!.mockInput.pressKey('g'); await t!.settle(); // the next card starting with g after Ghost: Gitea
  t!.mockInput.pressEnter(); await t!.settle();
  t!.mockInput.pressKey('u'); await t!.settle(); // Uptime Kuma
  t!.mockInput.pressEnter(); await t!.settle();
  expect(picked).toEqual(['grafana', 'ghost', 'gitea', 'uptimekuma']);
});

test('focusKey puts the cursor and the focus on that card once it is drawn', async () => {
  const picked: string[] = [];
  const f = await draw(grid(picked, 'n8n'), 100);
  expect(f).toContain('› n8n');
  t!.mockInput.pressEnter(); await t!.settle();
  expect(picked).toEqual(['n8n']);
});
