// Home "Your realms" in a terminal (RealmsCard.term.tsx, and the compat grid under it).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | An item spanning every track of an auto-fit grid (`grid-column: 1 / -1`) is a line of its own, as wide as the grid (the All realms row shrank to its icon and shared the first realm's line) | 'a spanning item of an auto-fit grid takes its own line' |
// | 2 | Two realms sit side by side only where both keep name, count and Showing whole; else one per line ("Per… 3 computers Showing" at 240x67) | 'columns', 'WxH: every realm row is whole' |
import { afterAll, afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import h from './parts/home.module.css';
import { realmColumns, realmRowCells } from './parts/realmsLayout';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a spanning item of an auto-fit grid takes its own line', async () => {
  installStyleTable(160);
  try {
    const item = (name: string, all = false) => (
      <li key={name} className={all ? h.realmAll : undefined}><button type="button" className={h.realmRow}><span className={h.realmName}>{name}</span><span className={h.realmCount}>3 computers</span></button></li>
    );
    const t = await drawTest(<FocusRoot><Box dir="column" width={90}><ul className={h.realms}>{[item('All realms', true), item('Personal'), item('Acme client')]}</ul></Box></FocusRoot>, { width: 90, height: 8 });
    for (let i = 0; i < 6; i++) await t.renderOnce();
    const rows = t.captureCharFrame().split('\n');
    t.renderer.destroy();
    const y = rows.findIndex((x) => x.includes('All realms'));
    expect(y).toBeGreaterThan(-1);
    expect(rows[y]).not.toContain('Personal');
    // The others still share a line (two fit in 90 cells).
    const p = rows.findIndex((x) => x.includes('Personal'));
    expect(p).toBeGreaterThan(y);
    expect(rows[p]).toContain('Acme client');
  } finally { setStyleTable(null); }
});

test('columns: two only when the widest row fits in half the card', () => {
  const rows = [realmRowCells(['Personal', '3 computers', 'Showing']), realmRowCells(['Acme client', '3 computers'])];
  expect(rows).toEqual([32, 27]);
  expect(realmColumns(62, rows)).toBe(1);
  expect(realmColumns(66, rows)).toBe(1);
  expect(realmColumns(67, rows)).toBe(2);
  expect(realmColumns(0, rows)).toBe(1);
  expect(realmColumns(200, [32])).toBe(1);
});

// Tall frames: the cards the pages give Home (page widgets) can put this one below the first screen. What is checked is
// each realm row at that width (240 columns: the width the split row was seen at, then at 67 rows).
for (const [cols, rows] of [[80, 220], [120, 160], [240, 120]] as const) {
  test(`${cols}x${rows}: every realm row is whole`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    const all = (await s.settle()).split('\n');
    // From the card's title on: another card above it may name a realm too.
    const from = all.findIndex((l) => l.includes('Your realms'));
    expect(from).toBeGreaterThan(-1);
    const lines = all.slice(from);
    const line = (word: string) => lines.find((l) => l.includes(word)) ?? '';
    expect(line('All realms')).not.toContain('Personal');
    // "Showing" sits before the count: every row's count then ends in the same column (it trailed the count and pushed it left).
    expect(line('█ Personal')).toMatch(/Personal\s+Showing 3 computers/);
    expect(line('█ Personal').indexOf('3 computers')).toBe(line('█ Acme client').indexOf('3 computers'));
    expect(line('█ Acme client')).toMatch(/Acme client\s+3 computers/);
    expect(line('█ Lab')).toMatch(/Lab\s+2 computers/);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
afterAll(() => setStyleTable(null));
