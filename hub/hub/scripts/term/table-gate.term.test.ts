// The table gate of the page goldens (table-gate.ts, wired in goldens.ts): a table fault on a page fails the gate
// unless the page allowance's `tableFaults` lists its size|kind; a listed row that no longer happens fails too;
// --update only shrinks.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
// This file pins the fixture clock (freezeClock in a test): it gives the real clock back to the next file of the process.
afterAll(async () => { (await import('./clock')).thawClock(); });
import { tableProblems } from './table-gate';

const hit = (kind: string, cols = 80, rows = 24) => ({ cols, rows, kind, case: 'default', path: 'table #1 > text', detail: 'd (y 7)' });

describe('tableProblems', () => {
  test('a fault with no row fails, naming page, size, case and row; a listed one passes', () => {
    const j = tableProblems('p', 'f', [hit('table-wrap-cut'), hit('table-misaligned', 120, 40)], ['80x24|table-wrap-cut'], { complete: true, update: false });
    expect(j.problems.map((x) => x.rule)).toEqual(['table-misaligned']);
    expect(j.problems[0]!.message).toContain('"p" at 120x40, case "default"');
    expect(j.problems[0]!.message).toContain('(y 7)');
    expect(j.problems[0]!.fix).toContain('src/kit/data/DataTable.term.tsx');
    expect(j.seen.sort()).toEqual(['120x40|table-misaligned', '80x24|table-wrap-cut']);
  });
  test('a listed row that no longer happens is stale: only on a run that drew every case, never under --update', () => {
    const allowed = ['80x24|table-wrap-cut'];
    expect(tableProblems('p', 'f', [], allowed, { complete: true, update: false }).problems.map((x) => x.rule)).toEqual(['table-allowance-stale']);
    expect(tableProblems('p', 'f', [], allowed, { complete: false, update: false }).problems).toEqual([]);
    expect(tableProblems('p', 'f', [], allowed, { complete: true, update: true }).problems).toEqual([]);
  });
  test('a malformed row fails instead of passing', () => {
    expect(tableProblems('p', 'f', [], ['p|80x24|misaligned'], { complete: true, update: false }).problems.map((x) => x.rule)).toEqual(['table-allowance-malformed']);
  });
});

test('a misaligned table on a real page fails the page gate with its page, size and kind; listed, it passes; --update shrinks', async () => {
  const { runPageGoldens } = await import('./goldens');
  const { renderPage } = await import('./render');
  const { freezeClock } = await import('./clock');
  freezeClock();
  const cache = path.join(import.meta.dir, '..', '..', '.term-cache');
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.mkdtempSync(path.join(cache, 'table-gate-'));
  const allow = (rows: string[]) => fs.writeFileSync(path.join(dir, 'allowance.json'), JSON.stringify({ crashes: [], placeholders: [], holes: [], traps: [], domRefused: [], domUnsupported: [], consoleErrors: [], tableFaults: rows, untranslatable: 0 }));
  let broken = 0;
  let breakIt = true;
  // The page draws as usual; then one body cell is re-marked as another column's, so it no longer starts where that
  // column's header does (what a cell and header drifting apart looks like to the check).
  const render: Parameters<typeof runPageGoldens>[1]['render'] = async (o) => {
    const s = await renderPage(o);
    if (!breakIt) return s;
    type N = { x: number; width: number; height: number; __tableMark?: { role: string; col?: string }; getChildren?(): N[] };
    const cells: N[] = [];
    const walk = (n: N): void => { if (n.__tableMark?.role === 'cell' && n.width > 0 && n.height > 0) cells.push(n); for (const k of n.getChildren?.() ?? []) walk(k); };
    walk((s.renderer as unknown as { root: N }).root);
    const a = cells[0];
    const b = a && cells.find((c) => c.__tableMark!.col !== a.__tableMark!.col && c.x !== a.x);
    if (a && b) { a.__tableMark = { role: 'cell', col: b.__tableMark!.col }; broken++; }
    return s;
  };
  try {
    allow([]);
    const r = await runPageGoldens('demo', { update: false, strict: false, render, dir });
    expect(broken).toBeGreaterThan(0);
    const table = r.problems.filter((p) => p.rule === 'table-misaligned');
    expect(table.length).toBeGreaterThan(0);
    expect(table.map((p) => p.message).join('\n')).toMatch(/"demo" at (80x24|120x40), case "[^"]+": table #\d+ at \d+,\d+ > column /);
    expect(r.tableSeen).toContain('80x24|table-misaligned');
    // Listed (a reviewed row), the same fault passes.
    allow(r.tableSeen ?? []);
    const again = await runPageGoldens('demo', { update: false, strict: false, render, dir });
    expect(again.problems.filter((p) => p.rule.startsWith('table-'))).toEqual([]);
    // Fixed, the listed rows are stale and fail; --update drops them.
    breakIt = false;
    const fixed = await runPageGoldens('demo', { update: false, strict: false, render, dir });
    expect(fixed.problems.filter((p) => p.rule === 'table-allowance-stale').length).toBeGreaterThan(0);
    await runPageGoldens('demo', { update: true, strict: false, render, dir });
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'allowance.json'), 'utf8')) as { tableFaults: string[] };
    expect(after.tableFaults.filter((k) => k.endsWith('table-misaligned'))).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 900_000);
