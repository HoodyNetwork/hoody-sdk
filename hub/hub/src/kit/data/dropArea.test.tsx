// Vitest: DropArea (drag.tsx), a drop target that is no table, around one. The area takes every spot the table
// leaves to it: outside the table, and the table's body when the DropTarget says bodyByArea (one mark for "this
// place"); the table keeps its rows ('row' marked on the row, 'none' refused there). A drop on the area lands with
// over null; a portal's events (a dialog the page opened) are never the area's.
import { act, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { DropArea, type DropTarget } from './drag';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  dir: boolean;
  locked?: boolean;
}
const ROWS: Row[] = [
  { id: 'a', name: 'projects', dir: true },
  { id: 'b', name: 'notes.txt', dir: false },
  { id: 'c', name: 'system', dir: true, locked: true },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const TYPE = 'application/x-hoody-test-row';

interface FakeTransfer {
  types: string[];
  dropEffect: string;
  store: Record<string, string>;
  items: unknown[];
  files: File[];
  getData: (t: string) => string;
}
function transfer(types: string[], store: Record<string, string> = {}): FakeTransfer {
  const dt: FakeTransfer = { types: [...types], dropEffect: 'unset', store: { ...store }, items: [], files: [], getData: (t) => dt.store[t] ?? '' };
  return dt;
}
function fire(el: Element, type: string, dt: FakeTransfer): MouseEvent {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}
const rowEl = (name: string) => screen.getByText(name).closest('[data-row-id]') as HTMLElement;
const hintText = () => document.querySelector('[data-drop-hint]')?.textContent ?? null;

function target(over: Partial<DropTarget<Row>> = {}) {
  return {
    types: [TYPE],
    rowTarget: (r: Row) => (r.locked ? 'none' : r.dir ? 'row' : 'body'),
    accept: vi.fn(() => true),
    hint: (o: Row | null) => `Move to ${o ? o.name : 'here'}`,
    onDrop: vi.fn(),
    ...over,
  } as DropTarget<Row> & { onDrop: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn> };
}

function Area({ drop, portal = false }: { drop: DropTarget<Row>; portal?: boolean }) {
  return (
    <DropArea drop={drop}>
      <p>The bar</p>
      <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />
      <div data-testid="room">Room below</div>
      {portal && createPortal(<div data-testid="dialog">A dialog</div>, document.body)}
    </DropArea>
  );
}
const areaEl = () => document.querySelector('[data-drop-frame]') as HTMLElement;
const tableFrame = () => areaEl().querySelector('[data-drop-frame]') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('DropArea', () => {
  it('the room outside the table takes the drag: the area marked, the hint shown, a drop lands with over null', () => {
    const drop = target({ bodyByArea: true });
    render(<Area drop={drop} />);
    const dt = transfer([TYPE]);
    const e = fire(screen.getByTestId('room'), 'dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
    expect(areaEl()).toHaveAttribute('data-drop-over');
    expect(hintText()).toBe('Move to here');
    const d = transfer([TYPE], { [TYPE]: '"x"' });
    expect(fire(screen.getByText('The bar'), 'drop', d).defaultPrevented).toBe(true);
    expect(drop.onDrop).toHaveBeenCalledTimes(1);
    expect(drop.onDrop.mock.calls[0]![0]).toBeNull();
    expect(drop.onDrop.mock.calls[0]![1]).toEqual({ type: TYPE, payload: 'x' });
    expect(areaEl()).not.toHaveAttribute('data-drop-over');
  });

  it("with bodyByArea the table's body is the area's: a file row marks the area, never the table frame; one drop", () => {
    const drop = target({ bodyByArea: true });
    render(<Area drop={drop} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(areaEl()).toHaveAttribute('data-drop-over');
    expect(tableFrame()).not.toHaveAttribute('data-drop-over');
    expect(rowEl('notes.txt')).not.toHaveAttribute('data-drop-over');
    expect(document.querySelectorAll('[data-drop-hint]')).toHaveLength(1);
    fire(rowEl('notes.txt'), 'drop', transfer([TYPE], { [TYPE]: '"x"' }));
    expect(drop.onDrop).toHaveBeenCalledTimes(1);
    expect(drop.onDrop.mock.calls[0]![0]).toBeNull();
  });

  it('the table keeps its rows: a folder row is marked and takes the drop into itself; the area shows nothing', () => {
    const drop = target({ bodyByArea: true });
    render(<Area drop={drop} />);
    fire(screen.getByTestId('room'), 'dragover', transfer([TYPE]));
    expect(areaEl()).toHaveAttribute('data-drop-over');
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(rowEl('projects')).toHaveAttribute('data-drop-over');
    expect(areaEl()).not.toHaveAttribute('data-drop-over');
    expect(document.querySelectorAll('[data-drop-hint]')).toHaveLength(1);
    expect(hintText()).toBe('Move to projects');
    fire(rowEl('projects'), 'drop', transfer([TYPE], { [TYPE]: '"x"' }));
    expect(drop.onDrop).toHaveBeenCalledTimes(1);
    expect(drop.onDrop.mock.calls[0]![0]).toEqual(ROWS[0]);
  });

  it("a 'none' row stays refused: never the area's body instead, nothing drops", () => {
    const drop = target({ bodyByArea: true });
    render(<Area drop={drop} />);
    const dt = transfer([TYPE]);
    const e = fire(rowEl('system'), 'dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('none');
    expect(document.querySelectorAll('[data-drop-over]')).toHaveLength(0);
    fire(rowEl('system'), 'drop', transfer([TYPE], { [TYPE]: '"x"' }));
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('without bodyByArea the table keeps its body as before: its frame marked, the area quiet', () => {
    const drop = target();
    render(<Area drop={drop} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(tableFrame()).toHaveAttribute('data-drop-over');
    expect(areaEl()).not.toHaveAttribute('data-drop-over');
    fire(rowEl('notes.txt'), 'drop', transfer([TYPE], { [TYPE]: '"x"' }));
    expect(drop.onDrop).toHaveBeenCalledTimes(1);
  });

  it("a portal's events (a dialog the page opened) are never the area's: no effect, no mark, no drop", () => {
    const drop = target({ bodyByArea: true });
    render(<Area drop={drop} portal />);
    const dt = transfer([TYPE]);
    const e = fire(screen.getByTestId('dialog'), 'dragover', dt);
    expect(e.defaultPrevented).toBe(false);
    expect(areaEl()).not.toHaveAttribute('data-drop-over');
    fire(screen.getByTestId('dialog'), 'drop', transfer([TYPE], { [TYPE]: '"x"' }));
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('a refused place says why beside the pointer and marks nothing', () => {
    const drop = target({ bodyByArea: true, accept: vi.fn(() => false), refusal: () => 'Already here' });
    render(<Area drop={drop} />);
    const dt = transfer([TYPE]);
    fire(screen.getByTestId('room'), 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hintText()).toBe('Already here');
    expect(document.querySelector('[data-drop-hint]')).toHaveAttribute('data-drop-refused');
    expect(document.querySelectorAll('[data-drop-over]')).toHaveLength(0);
  });
});
