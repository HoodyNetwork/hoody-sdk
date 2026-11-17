// Vitest: the side inspector follows the keyboard's active row after a short wait. The wait reads the list pane's
// follow when it ends, not when it began: Down then Esc inside the wait closes the inspector for good, and a
// handler replaced inside the wait is the one called.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { ListPaneContext } from '../layouts/pane';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'beta' },
  { id: 'c', name: 'gamma' },
];

let setOpen: (open: boolean) => void = () => undefined;
let setHandler: (f: { fn: (id: string) => void }) => void = () => undefined;
function Harness({ first }: { first: (id: string) => void }) {
  const [open, so] = useState(true);
  const [handler, sh] = useState({ fn: first });
  setOpen = so;
  setHandler = sh;
  return (
    <ListPaneContext.Provider value={{ list: true, ...(open ? { follow: handler.fn } : {}) }}>
      <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />
    </ListPaneContext.Provider>
  );
}

const firstRow = () => screen.getByText('alpha').closest('tr') as HTMLElement;

describe('DataTable follow: the wait reads the live pane', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('follows the next row after the wait', () => {
    const follow = vi.fn();
    render(<Harness first={follow} />);
    fireEvent.keyDown(firstRow(), { key: 'ArrowDown' });
    act(() => vi.advanceTimersByTime(200));
    expect(follow).toHaveBeenCalledTimes(1);
    expect(follow).toHaveBeenCalledWith('b');
  });

  it('Down then the detail closes inside the wait: nothing reopens it', () => {
    const follow = vi.fn();
    render(<Harness first={follow} />);
    fireEvent.keyDown(firstRow(), { key: 'ArrowDown' });
    act(() => vi.advanceTimersByTime(50));
    act(() => setOpen(false));
    act(() => vi.advanceTimersByTime(200));
    expect(follow).not.toHaveBeenCalled();
  });

  it('a follow replaced inside the wait: the new one is called', () => {
    const before = vi.fn();
    const after = vi.fn();
    render(<Harness first={before} />);
    fireEvent.keyDown(firstRow(), { key: 'ArrowDown' });
    act(() => vi.advanceTimersByTime(50));
    act(() => setHandler({ fn: after }));
    act(() => vi.advanceTimersByTime(200));
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledWith('b');
  });
});
