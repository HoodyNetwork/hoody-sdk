// Vitest: `openRow` opens a row from outside (Schedules' See output opens a run in History). Once per seq: an expandable
// row is expanded, scrolled to the top and its toggle focused; `onRowOpened(seq)` answers, also for a row that is not
// shown. The same seq again does nothing.
import { act, render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Run { id: string; name: string; out: string }
const col = createColumnHelper<Run>();
const COLUMNS = [col.accessor('name', { header: 'Run' })];
const DATA: Run[] = [{ id: 'r1', name: 'first', out: 'out one' }, { id: 'r2', name: 'second', out: 'out two' }, { id: 'r3', name: 'third', out: 'out three' }];
const scrolled = vi.fn();
const original = Element.prototype.scrollIntoView;
beforeEach(() => { scrolled.mockClear(); Element.prototype.scrollIntoView = scrolled; });
afterEach(() => { Element.prototype.scrollIntoView = original; });
const frame = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

function table(openRow: { id: string; seq: number } | undefined, onRowOpened: (seq: number) => void) {
  return (
    <DataTable label="Runs" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} bare fill={false}
      canExpand={(r) => r.id !== 'r3'} renderExpanded={(r) => <p>{r.out}</p>}
      {...(openRow ? { openRow } : {})} onRowOpened={onRowOpened} />
  );
}

describe('DataTable openRow', () => {
  it('expands the row, scrolls it to the top and focuses its toggle, once per seq', async () => {
    const done = vi.fn();
    const v = render(table(undefined, done));
    expect(screen.queryByText('out two')).toBeNull();
    v.rerender(table({ id: 'r2', seq: 1 }, done));
    await frame();
    expect(screen.getByText('out two')).toBeTruthy();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenLastCalledWith(1);
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.calls[0]![0]).toMatchObject({ block: 'start' });
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute('aria-expanded')).toBe('true');
    expect(focused.closest('tr')?.getAttribute('data-row-id')).toBe('r2');
    // The same seq again: nothing more.
    v.rerender(table({ id: 'r2', seq: 1 }, done));
    await frame();
    expect(done).toHaveBeenCalledTimes(1);
    expect(scrolled).toHaveBeenCalledTimes(1);
    // A new seq for an open row keeps it open and brings it back.
    v.rerender(table({ id: 'r2', seq: 2 }, done));
    await frame();
    expect(screen.getByText('out two')).toBeTruthy();
    expect(done).toHaveBeenLastCalledWith(2);
    expect(scrolled).toHaveBeenCalledTimes(2);
  });

  it('a row not shown is answered at once and opens nothing', async () => {
    const done = vi.fn();
    const v = render(table(undefined, done));
    v.rerender(table({ id: 'gone', seq: 7 }, done));
    await frame();
    expect(done).toHaveBeenCalledWith(7);
    expect(scrolled).not.toHaveBeenCalled();
    expect(screen.queryByText(/^out /)).toBeNull();
  });
});
