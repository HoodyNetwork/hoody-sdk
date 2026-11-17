// New realm's Computers step draws each computer's colour mark
// before its name, through kit ComputerMark. rowsOf keeps the API's value as given; the mark normalises it, so a
// hostile value draws no mark and reaches no style, and a computer without one draws none.
// The mark and name are a fragment in the table's own cell, and rows are always looked up afresh (the table draws
// again on each page render and turns into the list once measured).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetRealmsWorld } from './fixtures';
import { rowsOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const id = (n: number) => `c0a71500000000000000000${n}`;

describe('New realm: the computer colour', () => {
  beforeEach(() => resetRealmsWorld());

  it('rowsOf keeps a string colour as given, and none when it is missing or not a string', () => {
    const rows = rowsOf([{ id: id(1), name: 'atlas', color: '#3b82f6' }, { id: id(2), name: 'cedar', color: 'red;x:url()' }, { id: id(3), name: 'dune' }, { id: id(4), name: 'ember', color: 7 }]);
    const of = (n: string) => rows.find((r) => r.name === n);
    expect(of('atlas')?.color).toBe('#3b82f6');
    expect(of('cedar')?.color).toBe('red;x:url()');
    expect(of('dune')).not.toHaveProperty('color');
    expect(of('ember')).not.toHaveProperty('color');
  });

  it('the Computers step draws atlas\'s and granite\'s marks, and none for cedar\'s hostile value', async () => {
    await renderPage(page, { path: '/realms/new', state: 'colours' });
    const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
    await userEvent.type(field, 'Studio');
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    // The table row that shows the name, looked up afresh until it is there (never a node held across a render).
    const rowOf = (name: string) => waitFor(() => {
      const r = screen.getByText(name).closest<HTMLElement>('[data-row-id]');
      expect(r, name).not.toBeNull();
      return r as HTMLElement;
    }, { timeout: T });
    const markOf = (row: HTMLElement) => row.querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;
    expect(markOf(await rowOf('atlas'))).toBe('#3B82F6');
    expect(markOf(await rowOf('granite'))).toBe('#FFFFFF');
    expect(markOf(await rowOf('cedar'))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style')).not.toContain('url(');
  }, 40000);

  describe('the Computers step as the table draws again and turns into the list', () => {
    // The table starts at an unmeasured width (a table, every column) and is laid out again each time its
    // ResizeObserver reports; this stand-in reports only when the test says so. 320 px still fits a narrower table
    // (DataTableLayout tableFits: the name and one more column, 120 px each, beside the 40 px check column);
    // 200 px fits no table, so the rows become the list.
    type Cb = (entries: Array<{ contentRect: { width: number } }>) => void;
    const cbs: Cb[] = [];
    const real = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
      cbs.length = 0;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        constructor(cb: Cb) { cbs.push(cb); }
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = real; });
    const report = (width: number) => act(() => { for (const cb of cbs) cb([{ contentRect: { width } }]); });
    // Looked up afresh every time, never held across a new render (as the suite's pick helpers do).
    const rowOf = (name: string) => waitFor(() => {
      const r = screen.getByText(name).closest<HTMLElement>('[data-row-id]');
      expect(r, name).not.toBeNull();
      return r as HTMLElement;
    }, { timeout: T });
    const isTable = () => document.querySelector('table colgroup') !== null;
    const markOf = (row: HTMLElement) => row.querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;

    it('a new render of the table keeps the name\'s node; the list draws the same marks', async () => {
      await renderPage(page, { path: '/realms/new', state: 'colours' });
      const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
      await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
      await userEvent.type(field, 'Studio');
      await userEvent.click(screen.getByRole('button', { name: strings.next }));
      await rowOf('granite');
      expect(isTable()).toBe(true);
      // The node that shows the name belongs to the table's own cell: a new render of the table (fewer columns, still
      // a table) keeps it. A cell that wraps the name in its own elements is mounted again on each render of the
      // page (the columns are made per render, and the table mounts a cell function as a component), which drops them.
      const held = screen.getByText('granite');
      report(320);
      expect(isTable()).toBe(true);
      expect(held.isConnected).toBe(true);
      expect(held.closest('[data-row-id]')).not.toBeNull();
      // 200 px: the list. Its rows are drawn anew (a node from the table is not kept), so the rows are looked up again.
      report(200);
      await waitFor(() => expect(isTable()).toBe(false), { timeout: T });
      expect((await rowOf('granite')).querySelectorAll('td')).toHaveLength(1);
      expect(markOf(await rowOf('atlas'))).toBe('#3B82F6');
      expect(markOf(await rowOf('granite'))).toBe('#FFFFFF');
      expect(markOf(await rowOf('cedar'))).toBeNull();
    }, 40000);
  });
});
