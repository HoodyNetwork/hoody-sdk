// Vitest (OP-A): DataTable drag and drop (drag.tsx). Rows drag the page's own
// type (the row alone, or every selected row), never from a checkbox or the menu; the frame and its rows take drops
// judged by rowTarget ('row' / 'body' / 'none') and accept; the target is marked and the hint shown and announced;
// a drop parses the payload (a bad one is dropped silently) or takes the regular files and counts folders; group
// headers and a nested table's rows are never this table's row targets; a stray file elsewhere on the page is refused.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { copyKeyName, isCopyDrag, useRefuseStrayFiles, type DropTarget, type RowDrag } from './drag';

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
  { id: 'd', name: 'logs', dir: true },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const TYPE = 'application/x-hoody-test-row';

type Store = Record<string, string>;
interface FakeTransfer {
  types: string[];
  dropEffect: string;
  effectAllowed: string;
  store: Store;
  items: unknown[];
  files: File[];
  getData: (t: string) => string;
  setData: (t: string, v: string) => void;
}
function transfer(types: string[], store: Store = {}, items: unknown[] = [], files: File[] = []): FakeTransfer {
  const dt: FakeTransfer = {
    types: [...types],
    dropEffect: 'unset',
    effectAllowed: 'all',
    store: { ...store },
    items,
    files,
    getData: (t) => dt.store[t] ?? '',
    setData: (t, v) => {
      dt.store[t] = v;
      if (!dt.types.includes(t)) dt.types.push(t);
    },
  };
  return dt;
}
/** A drag event with the modifiers and the pointer (jsdom has no DragEvent init for them). */
function fire(el: Element, type: string, dt: FakeTransfer, init: MouseEventInit = {}): MouseEvent {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 20, ...init });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}
const rowEl = (name: string) => screen.getByText(name).closest('[data-row-id]') as HTMLElement;
const frameEl = () => document.querySelector('[data-drop-frame]') as HTMLElement;
const hintText = () => document.querySelector('[data-drop-hint]')?.textContent ?? null;
const live = () => screen.getByRole('status').textContent;

function target(over: Partial<DropTarget<Row>> = {}): DropTarget<Row> & { onDrop: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn> } {
  return {
    types: [TYPE, 'Files'],
    rowTarget: (r) => (r.locked ? 'none' : r.dir ? 'row' : 'body'),
    accept: vi.fn(() => true),
    hint: (o, d) => `${d.copy ? 'Copy' : 'Move'} to ${o ? o.name : 'here'}`,
    onDrop: vi.fn(),
    ...over,
  } as DropTarget<Row> & { onDrop: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn> };
}
const DRAG: RowDrag<Row> = { type: TYPE, payload: (rows) => rows.map((r) => r.name), text: (rows) => rows.map((r) => r.name).join('\n'), canDrag: (r) => !r.locked };

afterEach(() => vi.restoreAllMocks());

describe('row drag', () => {
  it('a row starts a drag of the page type with its own payload and names for other apps', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} rowDrag={DRAG} />);
    const r = rowEl('notes.txt');
    expect(r.getAttribute('draggable')).toBe('true');
    const dt = transfer([]);
    const e = fire(r, 'dragstart', dt);
    expect(e.defaultPrevented).toBe(false);
    expect(JSON.parse(dt.store[TYPE]!)).toEqual(['notes.txt']);
    expect(dt.store['text/plain']).toBe('notes.txt');
    expect(dt.effectAllowed).toBe('copyMove');
  });

  it('a selected row drags every selected row; an unselected one drags itself alone', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} rowDrag={DRAG} selectable selectedIds={new Set(['a', 'd'])} onSelectionChange={() => undefined} />);
    const dt = transfer([]);
    fire(rowEl('logs'), 'dragstart', dt);
    expect(JSON.parse(dt.store[TYPE]!)).toEqual(['projects', 'logs']);
    const dt2 = transfer([]);
    fire(rowEl('notes.txt'), 'dragstart', dt2);
    expect(JSON.parse(dt2.store[TYPE]!)).toEqual(['notes.txt']);
  });

  it('never starts from the checkbox or the row menu; canDrag false makes no draggable row', () => {
    render(
      <DataTable
        label="Files"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        rowDrag={DRAG}
        selectable
        selectedIds={new Set()}
        onSelectionChange={() => undefined}
        actions={() => [{ id: 'x', label: 'Rename', onAction: () => undefined }]}
      />,
    );
    const r = rowEl('notes.txt');
    const box = within(r).getByRole('checkbox');
    fireEvent.mouseDown(box);
    const dt = transfer([]);
    expect(fire(r, 'dragstart', dt).defaultPrevented).toBe(true);
    expect(dt.store[TYPE]).toBeUndefined();
    const menu = within(r).getByRole('button', { name: /actions/i });
    fireEvent.mouseDown(menu);
    expect(fire(r, 'dragstart', transfer([])).defaultPrevented).toBe(true);
    // A press on the row's text afterwards drags again (the last press decides).
    fireEvent.mouseDown(within(r).getByText('notes.txt'));
    expect(fire(r, 'dragstart', transfer([])).defaultPrevented).toBe(false);
    expect(rowEl('system').hasAttribute('draggable')).toBe(false);
  });

  it('without rowDrag no row is draggable, and cards never are', () => {
    const { unmount } = render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(rowEl('projects').hasAttribute('draggable')).toBe(false);
    unmount();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} rowDrag={DRAG} presentation="cards" />);
    expect(rowEl('projects').hasAttribute('draggable')).toBe(false);
  });
});

describe('drop target', () => {
  it('over a folder row: accepted with that row, a move effect, the row marked, the hint shown and announced', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer([TYPE]);
    const e = fire(within(rowEl('projects')).getByText('projects'), 'dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
    expect(drop.accept).toHaveBeenLastCalledWith(ROWS[0], { types: [TYPE], copy: false });
    expect(rowEl('projects').hasAttribute('data-drop-over')).toBe(true);
    expect(frameEl().hasAttribute('data-drop-over')).toBe(false);
    expect(hintText()).toBe('Move to projects');
    expect(live()).toBe('Move to projects');
  });

  it('the copy key (Ctrl here, Option on Apple) makes a copy, in the effect, accept and the hint', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer([TYPE]);
    fire(rowEl('projects'), 'dragover', dt, { ctrlKey: true });
    expect(dt.dropEffect).toBe('copy');
    expect(drop.accept).toHaveBeenLastCalledWith(ROWS[0], { types: [TYPE], copy: true });
    expect(hintText()).toBe('Copy to projects');
    // Alt alone is not the copy key off Apple.
    fire(rowEl('projects'), 'dragover', dt, { altKey: true });
    expect(hintText()).toBe('Move to projects');
    expect(copyKeyName(true)).toBe('Option');
    expect(copyKeyName(false)).toBe('Ctrl');
    expect(isCopyDrag({ altKey: true, ctrlKey: false }, true)).toBe(true);
    expect(isCopyDrag({ altKey: false, ctrlKey: true }, true)).toBe(false);
  });

  it("over a file row ('body') the drop means the table's own place: over null, the frame marked", () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(drop.accept).toHaveBeenLastCalledWith(null, { types: [TYPE], copy: false });
    expect(frameEl().hasAttribute('data-drop-over')).toBe(true);
    expect(rowEl('notes.txt').hasAttribute('data-drop-over')).toBe(false);
    expect(hintText()).toBe('Move to here');
  });

  it("a 'none' row takes the drag over with no effect, never the body instead; nothing drops there", () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Move to projects');
    const dt = transfer([TYPE]);
    const e = fire(rowEl('system'), 'dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('none');
    expect(drop.accept).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBeNull();
    expect(live()).toBe('');
    const d = transfer([TYPE], { [TYPE]: '["x"]' });
    expect(fire(rowEl('system'), 'drop', d).defaultPrevented).toBe(true);
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('an unaccepted place gets no effect, no mark and no hint', () => {
    const drop = target({ accept: vi.fn((o: Row | null) => o !== null) });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer([TYPE]);
    fire(rowEl('notes.txt'), 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBeNull();
  });

  it('a drag with none of its types is not taken: no preventDefault, no accept', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer(['text/plain']);
    expect(fire(rowEl('projects'), 'dragover', dt).defaultPrevented).toBe(false);
    expect(fire(rowEl('projects'), 'drop', dt).defaultPrevented).toBe(false);
    expect(drop.accept).not.toHaveBeenCalled();
  });

  it('without drop the table takes nothing', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(document.querySelector('[data-drop-frame]')).toBeNull();
    expect(fire(rowEl('projects'), 'dragover', transfer(['Files'])).defaultPrevented).toBe(false);
  });

  it('leaving the frame clears the mark and the hint; moving between its children does not', () => {
    const drop = target();
    render(
      <div>
        <p>outside</p>
        <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />
      </div>,
    );
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    fire(rowEl('projects'), 'dragleave', transfer([TYPE]), { relatedTarget: rowEl('logs') });
    expect(rowEl('projects').hasAttribute('data-drop-over')).toBe(true);
    fire(rowEl('projects'), 'dragleave', transfer([TYPE]), { relatedTarget: screen.getByText('outside') });
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBeNull();
  });

  it('the hint sits beside the pointer', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target()} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]), { clientX: 100, clientY: 50 });
    expect((document.querySelector('[data-drop-hint]') as HTMLElement).style.transform).toBe('translate(114px, 64px)');
    fire(rowEl('logs'), 'dragover', transfer([TYPE]), { clientX: 120, clientY: 70 });
    expect((document.querySelector('[data-drop-hint]') as HTMLElement).style.transform).toBe('translate(134px, 84px)');
    // Moving within the same row changes no words, so nothing renders: the hint still follows the pointer.
    fire(rowEl('logs'), 'dragover', transfer([TYPE]), { clientX: 200, clientY: 90 });
    expect((document.querySelector('[data-drop-hint]') as HTMLElement).style.transform).toBe('translate(214px, 104px)');
  });
});

describe('drop', () => {
  it('a page payload is parsed and handed over with the row, asked again with the dropped type; the mark clears', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE, 'text/plain']));
    const dt = transfer([TYPE, 'text/plain'], { [TYPE]: '{"items":["a"]}' });
    const e = fire(rowEl('projects'), 'drop', dt, { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(drop.accept).toHaveBeenLastCalledWith(ROWS[0], { types: [TYPE], copy: true });
    expect(drop.onDrop).toHaveBeenCalledWith(ROWS[0], { type: TYPE, payload: { items: ['a'] } }, { types: [TYPE], copy: true });
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBeNull();
  });

  it('a payload that is not JSON is dropped silently, never thrown', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    // An error thrown in a React handler is reported on the window, not to the dispatcher: watch for it there.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fire(rowEl('projects'), 'drop', transfer([TYPE], { [TYPE]: '{not json' }));
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('without rowTarget every row means the body', () => {
    const drop = target({ rowTarget: undefined });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(drop.accept).toHaveBeenLastCalledWith(null, { types: [TYPE], copy: false });
    expect(frameEl().hasAttribute('data-drop-over')).toBe(true);
  });

  it('accept refusing at the drop drops nothing', () => {
    const drop = target({ accept: vi.fn(() => false) });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('projects'), 'drop', transfer([TYPE], { [TYPE]: '1' }));
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('files from the computer: the regular files are taken, folders only counted; a copy effect', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const over = transfer(['Files']);
    fire(rowEl('logs'), 'dragover', over);
    expect(over.dropEffect).toBe('copy');
    const a = new File(['x'], 'a.txt');
    const b = new File(['yy'], 'b.txt');
    const item = (f: File, dir: boolean) => ({ kind: 'file', getAsFile: () => f, webkitGetAsEntry: () => ({ isFile: !dir, isDirectory: dir }) });
    const dt = transfer(['Files'], {}, [item(a, false), item(new File([], 'folder'), true), item(b, false), { kind: 'string', getAsFile: () => null }]);
    fire(rowEl('logs'), 'drop', dt);
    expect(drop.onDrop).toHaveBeenCalledWith(ROWS[3], { type: 'Files', files: [a, b], folders: 1 }, { types: ['Files'], copy: false });
  });

  it('files without items (an older browser) come from the file list; an empty drop does nothing', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const a = new File(['x'], 'a.txt');
    fire(rowEl('notes.txt'), 'drop', transfer(['Files'], {}, [], [a]));
    expect(drop.onDrop).toHaveBeenCalledWith(null, { type: 'Files', files: [a], folders: 0 }, { types: ['Files'], copy: false });
    drop.onDrop.mockClear();
    fire(rowEl('notes.txt'), 'drop', transfer(['Files']));
    expect(drop.onDrop).not.toHaveBeenCalled();
  });

  it('an empty table is all body: a drop on its empty state lands with over null', () => {
    const drop = target();
    render(<DataTable label="Files" data={[]} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} empty={<p>Nothing here</p>} />);
    const at = screen.getByText('Nothing here');
    fire(at, 'dragover', transfer([TYPE]));
    expect(frameEl().hasAttribute('data-drop-over')).toBe(true);
    expect(hintText()).toBe('Move to here');
    fire(at, 'drop', transfer([TYPE], { [TYPE]: '[]' }));
    expect(drop.onDrop).toHaveBeenCalledWith(null, { type: TYPE, payload: [] }, { types: [TYPE], copy: false });
  });

  it('a group header is never a row target: over it the drop means the body', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} groupBy={(r) => (r.dir ? 'dirs' : undefined)} groups={[{ id: 'dirs', label: 'Folders' }]} />);
    const header = screen.getByText('Folders');
    fire(header, 'dragover', transfer([TYPE]));
    expect(drop.accept).toHaveBeenLastCalledWith(null, { types: [TYPE], copy: false });
    expect(frameEl().hasAttribute('data-drop-over')).toBe(true);
    fire(header, 'drop', transfer([TYPE], { [TYPE]: '1' }));
    expect(drop.onDrop).toHaveBeenLastCalledWith(null, { type: TYPE, payload: 1 }, { types: [TYPE], copy: false });
  });

  it("a nested table's row is not the outer table's row target", () => {
    const drop = target();
    // The same id as an outer folder row: still never the outer table's row.
    const inner = [{ id: 'a', name: 'inner-folder', dir: true }];
    render(
      <DataTable
        label="Outer"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        drop={drop}
        renderExpanded={() => <DataTable label="Inner" data={inner} columns={COLUMNS} getRowId={(r) => r.id} bare />}
        canExpand={(r) => r.id === 'a'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    fire(screen.getByText('inner-folder'), 'dragover', transfer([TYPE]));
    expect(drop.accept).toHaveBeenLastCalledWith(null, { types: [TYPE], copy: false });
  });
});

describe('a table nested in an expanded row', () => {
  const inner = [{ id: 'z', name: 'inner-folder', dir: true }, { id: 'y', name: 'inner-locked', dir: true, locked: true }];
  function nested(outer: DropTarget<Row>, innerDrop: DropTarget<Row>) {
    render(
      <DataTable
        label="Outer"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        drop={outer}
        renderExpanded={() => <DataTable label="Inner" data={inner} columns={COLUMNS} getRowId={(r) => r.id} drop={innerDrop} bare />}
        canExpand={(r) => r.id === 'a'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
  }

  it('a nested table that takes the drag owns it: one hint, one drop, never the outer body too', () => {
    const outer = target();
    const innerDrop = target({ hint: () => 'Inner hint' });
    nested(outer, innerDrop);
    // The outer table shows its own feedback first, then the pointer enters the nested table.
    fire(rowEl('logs'), 'dragover', transfer([TYPE]));
    expect(rowEl('logs').hasAttribute('data-drop-over')).toBe(true);
    const dt = transfer([TYPE]);
    fire(screen.getByText('inner-folder'), 'dragover', dt);
    expect(innerDrop.accept).toHaveBeenLastCalledWith(inner[0], { types: [TYPE], copy: false });
    expect(outer.accept).toHaveBeenCalledTimes(1);
    expect(rowEl('logs').hasAttribute('data-drop-over')).toBe(false);
    expect(Array.from(document.querySelectorAll('[data-drop-hint]')).map((h) => h.textContent)).toEqual(['Inner hint']);
    fire(screen.getByText('inner-folder'), 'drop', transfer([TYPE], { [TYPE]: '1' }));
    expect(innerDrop.onDrop).toHaveBeenCalledTimes(1);
    expect(outer.onDrop).not.toHaveBeenCalled();
  });

  it("a nested table's refusal stands: the outer table never takes it as its body", () => {
    const outer = target();
    const innerDrop = target();
    nested(outer, innerDrop);
    const dt = transfer([TYPE]);
    fire(screen.getByText('inner-locked'), 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(outer.accept).not.toHaveBeenCalled();
    fire(screen.getByText('inner-locked'), 'drop', transfer([TYPE], { [TYPE]: '1' }));
    expect(outer.onDrop).not.toHaveBeenCalled();
    expect(innerDrop.onDrop).not.toHaveBeenCalled();
  });

  it('a nested table that does not take the type leaves it to the outer body', () => {
    const outer = target();
    nested(outer, target({ types: ['Files'] }));
    fire(screen.getByText('inner-folder'), 'dragover', transfer([TYPE]));
    expect(outer.accept).toHaveBeenLastCalledWith(null, { types: [TYPE], copy: false });
  });

  it('cards take no drop at all, but a table taking files still refuses stray files page-wide', () => {
    const drop = target();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} presentation="cards" />);
    expect(document.querySelector('[data-drop-frame]')).toBeNull();
    const card = rowEl('system');
    expect(fire(card, 'dragover', transfer([TYPE])).defaultPrevented).toBe(false);
    fire(card, 'drop', transfer([TYPE], { [TYPE]: '1' }));
    expect(drop.accept).not.toHaveBeenCalled();
    expect(drop.onDrop).not.toHaveBeenCalled();
    const files = transfer(['Files']);
    expect(fire(card, 'dragover', files).defaultPrevented).toBe(true);
    expect(files.dropEffect).toBe('none');
  });

  it('moving across rows with the same words renders the table no more', () => {
    let renders = 0;
    const counted = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' }, cell: (c) => { if (c.row.id === 'a') renders++; return c.getValue(); } })];
    render(<DataTable label="Files" data={ROWS} columns={counted} getRowId={(r) => r.id} drop={target({ hint: () => 'Drop here' })} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    const after = renders;
    for (const name of ['logs', 'projects', 'notes.txt', 'logs', 'projects']) fire(rowEl(name), 'dragover', transfer([TYPE]));
    expect(renders).toBe(after);
    expect(rowEl('projects').hasAttribute('data-drop-over')).toBe(true);
    expect(rowEl('logs').hasAttribute('data-drop-over')).toBe(false);
  });

  it('drops turned off mid-drag (the drop prop gone, or cards) leave no mark and no hint behind', () => {
    const t = <D extends DropTarget<Row> | undefined>(drop: D, presentation?: 'cards') => <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} presentation={presentation} />;
    const marks = () => document.querySelectorAll('[data-drop-over]').length;
    const { rerender } = render(t(target()));
    const r = rowEl('projects');
    fire(r, 'dragover', transfer([TYPE]));
    expect(r.hasAttribute('data-drop-over')).toBe(true);
    expect(hintText()).toBe('Move to projects');
    // A page's ordinary rerender (a new drop object, drops still on) keeps both.
    rerender(t(target()));
    expect(r.hasAttribute('data-drop-over')).toBe(true);
    expect(hintText()).toBe('Move to projects');
    rerender(t(undefined));
    expect(r.hasAttribute('data-drop-over')).toBe(false);
    expect(hintText()).toBeNull();
    // Drops back on, still no drag event: no word of the old hint comes back.
    rerender(t(target()));
    expect(hintText()).toBeNull();
    expect(marks()).toBe(0);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(marks()).toBe(1);
    expect(hintText()).toBe('Move to projects');
    const marked = document.querySelector('[data-drop-over]') as HTMLElement;
    rerender(t(target(), 'cards'));
    expect(marked.hasAttribute('data-drop-over')).toBe(false);
    expect(marks()).toBe(0);
    expect(hintText()).toBeNull();
    // Back from cards with no drag event: still no old hint.
    rerender(t(target()));
    expect(hintText()).toBeNull();
    expect(marks()).toBe(0);
  });

  it('unmounting while marked leaves no mark behind', () => {
    const { unmount } = render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target()} />);
    const r = rowEl('projects');
    fire(r, 'dragover', transfer([TYPE]));
    expect(r.hasAttribute('data-drop-over')).toBe(true);
    unmount();
    expect(r.hasAttribute('data-drop-over')).toBe(false);
  });
});

describe('copies and refusal (Files rows dragged to the other pane)', () => {
  it('copies decides the drop effect when given: a copy without the key, a move with it; absent, the key decides as before', () => {
    const drop = target({ copies: (_o, d) => !d.copy });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer([TYPE]);
    fire(rowEl('projects'), 'dragover', dt);
    expect(dt.dropEffect).toBe('copy');
    fire(rowEl('projects'), 'dragover', dt, { ctrlKey: true });
    expect(dt.dropEffect).toBe('move');
    // Given, it decides for every type it takes (the page answers for OS files too).
    const files = transfer(['Files']);
    fire(rowEl('projects'), 'dragover', files, { ctrlKey: true });
    expect(files.dropEffect).toBe('move');
  });

  it('without copies, OS files copy and page rows move (unchanged)', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target()} />);
    const files = transfer(['Files']);
    fire(rowEl('projects'), 'dragover', files);
    expect(files.dropEffect).toBe('copy');
    const rows = transfer([TYPE]);
    fire(rowEl('projects'), 'dragover', rows);
    expect(rows.dropEffect).toBe('move');
  });

  it('a refused place with refusal words shows and announces them, marks nothing, takes no drop', () => {
    const drop = target({ accept: vi.fn(() => false), refusal: (o) => (o ? `Not into ${o.name}` : 'Not here') });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    const dt = transfer([TYPE]);
    const e = fire(rowEl('projects'), 'dragover', dt, { clientX: 100, clientY: 50 });
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('none');
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBe('Not into projects');
    expect(document.querySelector('[data-drop-hint]')).toHaveAttribute('data-drop-refused');
    expect((document.querySelector('[data-drop-hint]') as HTMLElement).style.transform).toBe('translate(114px, 64px)');
    expect(live()).toBe('Not into projects');
    fire(rowEl('notes.txt'), 'dragover', dt);
    expect(hintText()).toBe('Not here');
    fire(rowEl('notes.txt'), 'drop', transfer([TYPE], { [TYPE]: '["x"]' }));
    expect(drop.onDrop).not.toHaveBeenCalled();
    expect(hintText()).toBeNull();
  });

  it("refusal words never show over a 'none' row, nor when refusal says null; an accepting place drops the refused mark", () => {
    let take = false;
    const drop = target({ accept: vi.fn(() => take), refusal: () => 'Not here' });
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />);
    fire(rowEl('system'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBeNull();
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Not here');
    take = true;
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Move to here');
    expect(document.querySelector('[data-drop-hint]')).not.toHaveAttribute('data-drop-refused');
    expect(frameEl().hasAttribute('data-drop-over')).toBe(true);
    // refusal null: nothing shown, as without refusal.
    const quiet = target({ accept: vi.fn(() => false), refusal: () => null });
    render(<DataTable label="Other" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={quiet} />);
    const other = document.querySelectorAll('[data-drop-frame]')[1] as HTMLElement;
    fire(within(other).getByText('notes.txt'), 'dragover', transfer([TYPE]));
    expect(Array.from(document.querySelectorAll('[data-drop-hint]')).map((h) => h.textContent)).toEqual(['Move to here']);
  });

  it('the same refusal words while moving render the table no more (announced once on entering)', () => {
    let renders = 0;
    const counted = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' }, cell: (c) => { if (c.row.id === 'a') renders++; return c.getValue(); } })];
    render(<DataTable label="Files" data={ROWS} columns={counted} getRowId={(r) => r.id} drop={target({ accept: () => false, refusal: () => 'Not here' })} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    const after = renders;
    for (const name of ['logs', 'projects', 'notes.txt', 'logs']) fire(rowEl(name), 'dragover', transfer([TYPE]));
    expect(renders).toBe(after);
    expect(live()).toBe('Not here');
    fire(rowEl('projects'), 'dragleave', transfer([TYPE]), { relatedTarget: document.body });
    expect(hintText()).toBeNull();
    expect(live()).toBe('');
  });
});

describe('refusal words go away', () => {
  const refusing = (over: Partial<DropTarget<Row>> = {}) => target({ accept: vi.fn(() => false), refusal: () => 'Not here', ...over });
  const status = () => screen.getAllByRole('status')[0]!;

  it("refusal shown, then a 'none' row: the words and the announcement go", () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={refusing()} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Not here');
    expect(live()).toBe('Not here');
    const dt = transfer([TYPE]);
    fire(rowEl('system'), 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hintText()).toBeNull();
    expect(live()).toBe('');
    expect(document.querySelector('[data-drop-refused]')).toBeNull();
  });

  it('outer refusal shown, then a nested table that owns the spot: only the inner words remain', () => {
    const inner = [{ id: 'z', name: 'inner-folder', dir: true }];
    render(
      <DataTable
        label="Outer"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        drop={refusing()}
        renderExpanded={() => <DataTable label="Inner" data={inner} columns={COLUMNS} getRowId={(r) => r.id} drop={target({ hint: () => 'Inner hint' })} bare />}
        canExpand={(r) => r.id === 'a'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(Array.from(document.querySelectorAll('[data-drop-hint]')).map((h) => h.textContent)).toEqual(['Not here']);
    fire(screen.getByText('inner-folder'), 'dragover', transfer([TYPE]));
    expect(Array.from(document.querySelectorAll('[data-drop-hint]')).map((h) => h.textContent)).toEqual(['Inner hint']);
    expect(document.querySelector('[data-drop-refused]')).toBeNull();
    expect(screen.getAllByRole('status').map((x) => x.textContent)).toEqual(['', 'Inner hint']);
  });

  it('refusal shown, then drops turned off: the words and the announcement go, and do not come back', () => {
    const t = (drop: DropTarget<Row> | undefined) => <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={drop} />;
    const { rerender } = render(t(refusing()));
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Not here');
    rerender(t(undefined));
    expect(hintText()).toBeNull();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    rerender(t(refusing()));
    expect(hintText()).toBeNull();
    expect(live()).toBe('');
  });

  it('refusal shown, then unmounted: no hint is left on the page', () => {
    const { unmount } = render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={refusing()} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Not here');
    unmount();
    expect(document.querySelector('[data-drop-hint]')).toBeNull();
  });

  it('a refusal then an accepting place: the words switch, the refused mark goes, the announcement follows', () => {
    let take = false;
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={refusing({ accept: vi.fn(() => take) })} />);
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(live()).toBe('Not here');
    take = true;
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Move to projects');
    expect(live()).toBe('Move to projects');
    expect(document.querySelector('[data-drop-refused]')).toBeNull();
    // And back: refused again, marked refused again, nothing outlined.
    take = false;
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]));
    expect(hintText()).toBe('Not here');
    expect(document.querySelector('[data-drop-hint]')).toHaveAttribute('data-drop-refused');
    expect(document.querySelector('[data-drop-over]')).toBeNull();
  });

  it('the live region is written once per change of words, not per dragover; the hint follows the pointer with no render', () => {
    let words = 'Not here';
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={refusing({ refusal: () => words })} />);
    const region = status();
    const seen = new MutationObserver(() => undefined);
    seen.observe(region, { childList: true, characterData: true, subtree: true });
    fire(rowEl('notes.txt'), 'dragover', transfer([TYPE]), { clientX: 100, clientY: 50 });
    expect(seen.takeRecords().length).toBeGreaterThan(0);
    const hint = document.querySelector('[data-drop-hint]') as HTMLElement;
    // First frame: placed where the pointer is.
    expect(hint.style.transform).toBe('translate(114px, 64px)');
    for (const [x, y] of [[120, 60], [140, 70], [160, 80]] as const) {
      fire(rowEl('logs'), 'dragover', transfer([TYPE]), { clientX: x, clientY: y });
      expect(hint.style.transform).toBe(`translate(${x + 14}px, ${y + 14}px)`);
    }
    // Same words three more times: the live region is not touched, the same hint element moved.
    expect(seen.takeRecords()).toHaveLength(0);
    expect(document.querySelector('[data-drop-hint]')).toBe(hint);
    // Changed words: written once, and the hint keeps the pointer's place.
    words = 'Not this one';
    fire(rowEl('logs'), 'dragover', transfer([TYPE]), { clientX: 200, clientY: 90 });
    expect(seen.takeRecords().length).toBeGreaterThan(0);
    expect(live()).toBe('Not this one');
    expect((document.querySelector('[data-drop-hint]') as HTMLElement).style.transform).toBe('translate(214px, 104px)');
    fire(rowEl('logs'), 'dragover', transfer([TYPE]), { clientX: 210, clientY: 95 });
    expect(seen.takeRecords()).toHaveLength(0);
    seen.disconnect();
  });
});

describe('stray files on the page', () => {
  it('while a table takes files, a file dragged or dropped elsewhere is refused; never once none takes them', () => {
    const outside = () => document.body.querySelector('#outside') as HTMLElement;
    document.body.insertAdjacentHTML('beforeend', '<div id="outside">elsewhere</div>');
    const dt = transfer(['Files']);
    expect(fire(outside(), 'dragover', dt).defaultPrevented).toBe(false);
    const { unmount } = render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target()} />);
    const e = fire(outside(), 'dragover', dt);
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('none');
    expect(fire(outside(), 'drop', dt).defaultPrevented).toBe(true);
    // A page row drag outside is not touched.
    expect(fire(outside(), 'dragover', transfer([TYPE])).defaultPrevented).toBe(false);
    unmount();
    expect(fire(outside(), 'dragover', transfer(['Files'])).defaultPrevented).toBe(false);
    outside().remove();
  });

  it('a table that takes only its own type adds no page-wide refusal', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="outside2">elsewhere</div>');
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target({ types: [TYPE] })} />);
    const el = document.querySelector('#outside2') as HTMLElement;
    expect(fire(el, 'dragover', transfer(['Files'])).defaultPrevented).toBe(false);
    el.remove();
  });

  it('a page can keep the refusal on with no table mounted, alongside tables (counted, not stacked)', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="outside3">elsewhere</div>');
    const el = document.querySelector('#outside3') as HTMLElement;
    function Page({ table }: { table: boolean }) {
      useRefuseStrayFiles(true);
      return table ? <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} drop={target()} /> : <p>No folder</p>;
    }
    const { rerender, unmount } = render(<Page table={false} />);
    const dt = transfer(['Files']);
    expect(fire(el, 'dragover', dt).defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('none');
    expect(fire(el, 'drop', transfer(['Files'])).defaultPrevented).toBe(true);
    rerender(<Page table />);
    rerender(<Page table={false} />);
    // The table leaving does not take the page's refusal with it.
    expect(fire(el, 'dragover', transfer(['Files'])).defaultPrevented).toBe(true);
    unmount();
    expect(fire(el, 'dragover', transfer(['Files'])).defaultPrevented).toBe(false);
    el.remove();
  });
});

describe('what a drag shows from its start (files-drag): the rows dimmed, the pointer carrying the page\'s words', () => {
  /** Runs the frame callback that dims the rows (the dimming waits one frame after dragstart). */
  const frame = () => act(() => vi.advanceTimersToNextFrame());
  const withImage = (dt: FakeTransfer) => {
    const setDragImage = vi.fn((el: Element) => void (seen.text = el.textContent, seen.inPage = document.body.contains(el)));
    const seen: { text: string | null; inPage: boolean } = { text: null, inPage: false };
    Object.assign(dt, { setDragImage });
    return { setDragImage, seen };
  };
  const dimmed = () => Array.from(document.querySelectorAll('[data-dragging]')).map((el) => el.getAttribute('data-row-id'));

  it('preview gives the drag its picture: the words, on an element in the page only until the next task', () => {
    vi.useFakeTimers();
    try {
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={{ ...DRAG, preview: (rows) => (rows.length === 1 ? rows[0]!.name : `${rows.length} items`) }} />);
      const dt = transfer([]);
      const { setDragImage, seen } = withImage(dt);
      fire(rowEl('notes.txt'), 'dragstart', dt);
      expect(setDragImage).toHaveBeenCalledTimes(1);
      expect(seen).toEqual({ text: 'notes.txt', inPage: true });
      expect(document.querySelector('[data-drag-ghost]')?.getAttribute('aria-hidden')).toBe('true');
      act(() => void vi.advanceTimersByTime(1));
      expect(document.querySelector('[data-drag-ghost]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('without preview the browser keeps its own picture: setDragImage is never called', () => {
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={DRAG} />);
    const dt = transfer([]);
    const { setDragImage } = withImage(dt);
    fire(rowEl('notes.txt'), 'dragstart', dt);
    expect(setDragImage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-drag-ghost]')).toBeNull();
  });

  it('the dragged row is dimmed one frame after dragstart (never inside it) and until its dragend', () => {
    vi.useFakeTimers();
    try {
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={DRAG} />);
      fire(rowEl('notes.txt'), 'dragstart', transfer([]));
      expect(dimmed()).toEqual([]);
      frame();
      expect(dimmed()).toEqual(['b']);
      fire(rowEl('notes.txt'), 'dragend', transfer([]));
      expect(dimmed()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a selected row dims every selected row it carries, and the count is what the pointer carries', () => {
    vi.useFakeTimers();
    try {
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} getRowId={(r) => r.id} selectable selectedIds={new Set(['a', 'b'])} onSelectionChange={() => undefined} rowDrag={{ ...DRAG, preview: (rows) => `${rows.length} items` }} />);
      const dt = transfer([]);
      const { seen } = withImage(dt);
      fire(rowEl('notes.txt'), 'dragstart', dt);
      expect(seen.text).toBe('2 items');
      frame();
      expect(dimmed().sort()).toEqual(['a', 'b']);
    } finally {
      vi.useRealTimers();
    }
  });

  // A row out of the page keeps its dragend to itself (it never reaches the document): a dragend that does not bubble
  // stands for it here.
  const lone = (el: Element) => act(() => void el.dispatchEvent(new Event('dragend')));
  const ENDS: Record<string, (row: Element) => void> = {
    "the row's own dragend, never reaching the document": lone,
    "the document's drop": () => act(() => void document.body.dispatchEvent(new Event('drop', { bubbles: true }))),
    'the next press': () => act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))),
    'the window losing focus': () => act(() => void window.dispatchEvent(new Event('blur'))),
  };

  it('a drag ends at its row\'s own dragend (heard on the row, wherever it is), a drop, the next press or the window losing focus', () => {
    vi.useFakeTimers();
    try {
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={DRAG} />);
      for (const [name, end] of Object.entries(ENDS)) {
        const row = rowEl('notes.txt');
        fire(row, 'dragstart', transfer([]));
        frame();
        expect(dimmed()).toEqual(['b']);
        end(row);
        expect(dimmed(), name).toEqual([]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('an end before the dimming frame is seen too: the frame then dims nothing', () => {
    vi.useFakeTimers();
    try {
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={DRAG} />);
      for (const [name, end] of Object.entries(ENDS)) {
        const row = rowEl('notes.txt');
        fire(row, 'dragstart', transfer([]));
        end(row);
        frame();
        expect(dimmed(), name).toEqual([]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('onEnd tells the page the drag is over at the source row\'s dragend, even one the document never sees', () => {
    const onEnd = vi.fn();
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={{ ...DRAG, onEnd }} />);
    const row = rowEl('notes.txt');
    fire(row, 'dragstart', transfer([]));
    // Not at a drop (the drop's handlers still read the drag) nor at a press: the page has its own rules there.
    act(() => void document.body.dispatchEvent(new Event('drop', { bubbles: true })));
    expect(onEnd).not.toHaveBeenCalled();
    lone(row);
    expect(onEnd).toHaveBeenCalledTimes(1);
    lone(row);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('a row taken out of the page mid-drag, then Esc: its dragend, on the row alone, ends the dimming of every row it carried and tells the page', () => {
    vi.useFakeTimers();
    try {
      const onEnd = vi.fn();
      const table = (data: Row[]) => <DataTable label="Files" columns={COLUMNS} data={data} getRowId={(r) => r.id} selectable selectedIds={new Set(['a', 'b'])} onSelectionChange={() => undefined} rowDrag={{ ...DRAG, onEnd }} />;
      const { rerender } = render(table(ROWS));
      const row = rowEl('notes.txt');
      fire(row, 'dragstart', transfer([]));
      frame();
      expect(dimmed().sort()).toEqual(['a', 'b']);
      // A virtual list scrolled on: the dragged row leaves the page, the other carried row stays.
      rerender(table(ROWS.filter((r) => r.id !== 'b')));
      expect(document.body.contains(row)).toBe(false);
      expect(dimmed()).toEqual(['a']);
      // Esc: the browser sends dragend to the detached row; it bubbles only through its own detached tree.
      act(() => void row.dispatchEvent(new Event('dragend', { bubbles: true })));
      expect(dimmed()).toEqual([]);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a drag that ends with no event here (WebKit sends no dragend when nothing took the drop) is over once the pointer moves on with no drag event', () => {
    vi.useFakeTimers();
    try {
      const onEnd = vi.fn();
      render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowDrag={{ ...DRAG, onEnd }} />);
      const move = () => act(() => void document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })));
      fire(rowEl('notes.txt'), 'dragstart', transfer([]));
      frame();
      // Firefox's moves right after dragstart (the button held, however long), WebKit's one (none held), and a lone
      // move after a long rest: the drag lasts.
      const held = () => act(() => void document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1 })));
      held();
      act(() => void vi.advanceTimersByTime(1000));
      for (let i = 0; i < 6; i++) held();
      move();
      act(() => void vi.advanceTimersByTime(1000));
      move();
      expect(dimmed()).toEqual(['b']);
      // A drag event says the drag still lasts: the moves count again from there, and only past the lull.
      fire(document.body, 'dragover', transfer([]));
      move();
      move();
      move();
      expect(dimmed()).toEqual(['b']);
      expect(onEnd).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(400));
      move();
      expect(dimmed()).toEqual([]);
      expect(onEnd).toHaveBeenCalledTimes(1);
      move();
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a drag that ends elsewhere (Esc, with no dragleave here) leaves no mark and no hint on the table it was over', () => {
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} drop={target()} />);
    fire(rowEl('projects'), 'dragover', transfer([TYPE]));
    expect(rowEl('projects').hasAttribute('data-drop-over')).toBe(true);
    expect(hintText()).toBe('Move to projects');
    act(() => void document.body.dispatchEvent(new Event('dragend', { bubbles: true })));
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    expect(hintText()).toBeNull();
    expect(live()).toBe('');
  });

  it('the hint stays inside the window: near the end edge it is held there, so its words are not cut', () => {
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} drop={target()} />);
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    try {
      fire(rowEl('projects'), 'dragover', transfer([TYPE]), { clientX: 100, clientY: 50 });
      const hint = document.querySelector('[data-drop-hint]') as HTMLElement;
      expect(hint.style.transform).toBe('translate(114px, 64px)');
      fire(rowEl('projects'), 'dragover', transfer([TYPE]), { clientX: window.innerWidth - 20, clientY: 50 });
      expect(hint.style.transform).toBe(`translate(${window.innerWidth - 204}px, 64px)`);
    } finally {
      width.mockRestore();
    }
  });
});
