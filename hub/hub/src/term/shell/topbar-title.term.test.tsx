// The top bar names the page only when the page draws no header of its own: a page with a page header (Vault) shows its
// name once, in the header; a page with none (AI, Board) keeps its name in the top bar, so no page is left untitled.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const topOf = async (page: string): Promise<{ top: string; rest: string }> => {
  s = await renderPage({ page, fx: null, cols: 120, rows: 40 });
  const lines = (await s.settle()).split('\n');
  return { top: lines[0]!, rest: lines.slice(1).join('\n') };
};

test('a page with a header: the name is in the header, not in the top bar', async () => {
  const { top, rest } = await topOf('vault');
  expect(top).toContain('HOODY');
  expect(top).not.toContain('Vault');
  expect(rest).toContain('Vault');
}, 180_000);

test('a page with no header (AI): the top bar keeps its name', async () => {
  const { top } = await topOf('ai');
  expect(top).toContain(' AI ');
}, 180_000);

test('a canvas page with no header (Board): the top bar keeps its name', async () => {
  const { top } = await topOf('board');
  expect(top).toContain('Board');
}, 180_000);

// One blank row between blocks, never two: Vault's toolbar (note, stats) and Bots' stat strip at 120x40.
const doubleBlanks = (frame: string): string[] => {
  const rows = frame.split('\n').slice(1, -1).map((l) => { const c = l.indexOf('│'); return (c >= 0 && c < 30 ? l.slice(c + 1) : l).replace(/[█░│▐▌]/g, '').trim(); });
  const out: string[] = [];
  let blank = 0, seen = false;
  for (const r of rows) { if (!r) { blank++; continue; } if (seen && blank >= 2) out.push(r); blank = 0; seen = true; }
  return out;
};

for (const page of ['vault', 'bots']) {
  test(`${page} 120x40: no two blank rows in a row between its blocks`, async () => {
    s = await renderPage({ page, fx: null, cols: 120, rows: 40 });
    const frame = await s.settle();
    expect(frame).toContain(page === 'vault' ? 'Entries here' : 'Working now');
    expect(doubleBlanks(frame).filter((r) => /Entries here|Working now|Search/.test(r))).toEqual([]);
  }, 180_000);
}

// A long page that scrolls its header away (Guide: the header scrolls with the page): while the header is on screen the
// top bar leaves the name out; once PageDown has taken the header out of view the top bar names the page; back at the
// top (Home) the header shows the name again and the top bar does not.
for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a header scrolled out of view puts the name in the top bar, and only then`, async () => {
    s = await renderPage({ page: 'guide', fx: null, cols, rows });
    const headerRow = (f: string[]): boolean => f.slice(1).some((l) => /(^|│) {1,3}Guide\b/.test(l));
    let f = (await s.settle()).split('\n');
    expect(headerRow(f)).toBe(true);
    expect(f[0]).not.toContain('Guide');
    for (let i = 0; i < 3; i++) { await s.keys.press('pagedown'); await s.settle(); }
    f = (await s.settle()).split('\n');
    expect(headerRow(f)).toBe(false);
    expect(f[0]).toContain('Guide');
    await s.keys.press('home');
    f = (await s.settle()).split('\n');
    expect(headerRow(f)).toBe(true);
    expect(f[0]).not.toContain('Guide');
  }, 180_000);
}
