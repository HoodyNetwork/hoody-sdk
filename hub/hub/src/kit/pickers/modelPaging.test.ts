// The model chooser's render budget: fixed pages, replacement pages, every view under 250 rows.
import { describe, expect, it } from 'vitest';
import { PAGE, VIEW_MAX, VIEW_ROWS, pageOf, paged, pager } from './modelPaging';

describe('render budget', () => {
  it('each view at full pages stays at or under 250 rows', () => {
    expect(VIEW_ROWS).toBe(250);
    expect(VIEW_MAX).toEqual({ ready: 69, directory: 82, drillIn: 101, search: 53 });
    for (const n of Object.values(VIEW_MAX)) expect(n).toBeLessThanOrEqual(VIEW_ROWS);
  });
  it('the page sizes are fixed', () => {
    expect(PAGE).toMatchObject({ attention: 24, connected: 24, suggested: 5, all: 24, drillIn: 100, searchReady: 10, searchSetupProviders: 4, searchPerProvider: 5 });
  });
});

describe('pager', () => {
  it('positions: "25–48 of 200", first and last pages, empty', () => {
    expect(pager(200, 24, 1)).toEqual({ page: 1, pages: 9, size: 24, total: 200, from: 25, to: 48, hasPrev: true, hasNext: true });
    expect(pager(200, 24, 8)).toMatchObject({ from: 193, to: 200, hasPrev: true, hasNext: false });
    expect(pager(5, 24, 0)).toMatchObject({ pages: 1, from: 1, to: 5, hasPrev: false, hasNext: false });
    expect(pager(0, 24, 0)).toMatchObject({ pages: 1, from: 0, to: 0, hasPrev: false, hasNext: false });
  });
  it('a page out of range is clamped (a list that shrank keeps a page); bad input is safe', () => {
    expect(pager(30, 24, 7).page).toBe(1);
    expect(pager(30, 24, -3).page).toBe(0);
    expect(pager(30, 24, Number.NaN).page).toBe(0);
    expect(pager(30, 0, 0).size).toBe(1);
  });
  it('pageOf replaces rows (never appends) and every row is on exactly one page', () => {
    const rows = Array.from({ length: 53 }, (_, i) => i);
    const seen: number[] = [];
    const pg = pager(rows.length, 24, 0);
    for (let p = 0; p < pg.pages; p++) {
      const page = pageOf(rows, 24, p);
      expect(page.length).toBeLessThanOrEqual(24);
      seen.push(...page);
    }
    expect(seen).toEqual(rows);
    expect(pageOf(rows, 24, 99)).toEqual(rows.slice(48));
    expect(pageOf([], 24, 0)).toEqual([]);
  });
  it('paged: a section gets a pager only past its page', () => {
    expect(paged(24, 24)).toBe(false);
    expect(paged(25, 24)).toBe(true);
  });
});
