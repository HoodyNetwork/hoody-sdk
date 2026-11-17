// The Files reader decides from page 1 of the computer list only: it hides
// only when page 1 is the whole list, so the later pages Files itself walks (core useComputersAll, up to ALL_PAGES_MAX)
// are never read for Jump to. The walk is made to throw here: the reader still answers.
import { renderPage, screen } from '@app/testing';
import type * as Core from '@core';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import useFilesSearchHide, { filesHide, firstPageList, realmRows } from './searchHide';

vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  useComputersAll: () => {
    throw new Error('Jump to walked every page of the computer list');
  },
}));

describe('Files in Jump to reads page 1 only', () => {
  it('counts only the rows Files lists in the realm (core realm rule), never rows without an id', () => {
    const A = 'a'.repeat(24);
    const B = 'b'.repeat(24);
    const rows = [{ id: 'c1', realm_ids: [A] }, { id: 'c2', realm_ids: [B] }, { id: '' }, null];
    expect(realmRows(rows, A)).toBe(1);
    expect(realmRows(rows, 'all')).toBe(2);
    expect(realmRows([{ id: 'c2', realm_ids: [B] }], A)).toBe(0);
  });

  it('hides only when page 1 is the whole list: an empty page 1 with more pages, no answer, or a failed read hides nothing', () => {
    const A = 'a'.repeat(24);
    expect(filesHide(firstPageList({ data: { rows: [], complete: true }, isError: false }, A))).toEqual({ only: ['?tab=transfers'] });
    expect(filesHide(firstPageList({ data: { rows: [], complete: false }, isError: false }, A))).toBeNull();
    expect(filesHide(firstPageList({ isError: false }, A))).toBeNull();
    expect(filesHide(firstPageList({ data: { rows: [], complete: true }, isError: true }, A))).toBeNull();
  });

  it('a page 1 the walk refuses (a row without a string id) is a failed read, never an empty list: nothing hidden', () => {
    // Files keeps its earlier rows on such a refresh (core power.ts readPage throws BAD_LIST) and still draws its tabs.
    const A = 'a'.repeat(24);
    const bad: unknown[][] = [[{ name: 'no id' }], [{ id: '' }], [null], [{ id: 7 }], [{ id: 'c1', realm_ids: ['b'.repeat(24)] }, { id: '' }]];
    for (const rows of bad) {
      const list = firstPageList({ data: { rows, complete: true }, isError: false }, A);
      expect(list, JSON.stringify(rows)).toEqual({ rows: null, failed: true, complete: false });
      expect(filesHide(list)).toBeNull();
    }
  });

  const Probe = () => <output>{JSON.stringify(useFilesSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    ['none', JSON.stringify({ only: ['?tab=transfers'] })],
    ['', 'null'],
  ])('state "%s": %s', async (state, want) => {
    await renderPage(probe, state ? { state } : {});
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
