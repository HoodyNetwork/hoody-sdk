// Vitest: DataTable presentation="icons", the classic folder grid. Each row is a tile (its
// `list: 'lead'` cell drawn large, the primary cell under it, the row menu); a click selects, a double click or Enter
// opens, a right click or `.` opens the same row menu as the list; arrows move in 2D by the measured column count, Home
// and End go to the ends. The presentation switch can offer List / Icons with the page's own words.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { PresentationSwitch, usePresentation, type Presentation } from './Presentation';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  kind: string;
  size: string;
}
const ROWS: Row[] = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `item-${i}`, kind: i % 2 ? 'file' : 'folder', size: `${i} KB` }));
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('kind', { id: 'art', header: 'Kind icon', cell: (c) => <span data-testid="art">{c.getValue()}</span>, meta: { list: 'lead', table: false } }),
  col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } }),
  col.accessor('size', { header: 'Size' }),
];
const actions = (r: Row) => [
  { id: 'open', label: `Open ${r.name}`, onAction: () => undefined },
  '-' as const,
  { id: 'rename', label: 'Rename', onAction: () => undefined },
];

const tiles = () => screen.getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
// jsdom lays nothing out: give the tiles the tops of a grid `perRow` wide.
function layOut(perRow: number) {
  tiles().forEach((t, i) => Object.defineProperty(t, 'offsetTop', { configurable: true, value: Math.floor(i / perRow) * 120 }));
}
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute('data-row-id');
const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

describe('icons presentation', () => {
  it('draws each row as a tile: the lead cell large, the name under it, the row menu; no other field', () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" actions={actions} />);
    const all = tiles();
    expect(all).toHaveLength(7);
    const t0 = within(all[0]!);
    expect(t0.getByTestId('art').textContent).toBe('folder');
    expect(t0.getByText('item-0')).toBeTruthy();
    expect(t0.queryByText('0 KB')).toBeNull();
    expect(t0.getByRole('button', { name: /actions/i })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Files' })).toBeTruthy();
  });

  it('moves in two dimensions by the measured column count, and Home / End go to the ends', async () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" />);
    layOut(3);
    tiles()[0]!.focus();
    press('ArrowDown');
    await frame();
    expect(focused()).toBe('r3');
    press('ArrowRight');
    await frame();
    expect(focused()).toBe('r4');
    press('ArrowUp');
    await frame();
    expect(focused()).toBe('r1');
    press('ArrowLeft');
    await frame();
    expect(focused()).toBe('r0');
    press('End');
    await frame();
    expect(focused()).toBe('r6');
    press('ArrowUp');
    await frame();
    expect(focused()).toBe('r3');
    press('Home');
    await frame();
    expect(focused()).toBe('r0');
    // A wider grid: four per row.
    layOut(4);
    press('ArrowDown');
    await frame();
    expect(focused()).toBe('r4');
    // Down on the last line (r4..r6) has no line below: focus stays, never sideways.
    press('ArrowDown');
    await frame();
    expect(focused()).toBe('r4');
    // Up on the first line has no line above: focus stays.
    press('Home');
    await frame();
    press('ArrowRight');
    await frame();
    press('ArrowUp');
    await frame();
    expect(focused()).toBe('r1');
    // Down from a column past the end of a shorter last line goes to that line's last tile.
    press('ArrowRight');
    await frame();
    press('ArrowRight');
    await frame();
    expect(focused()).toBe('r3');
    press('ArrowDown');
    await frame();
    expect(focused()).toBe('r6');
  });

  it('Shift + up / down select the tile that takes the focus, at the grid edges too', async () => {
    function Picking() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
      return <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" selectable selectedIds={selected} onSelectionChange={setSelected} />;
    }
    render(<Picking />);
    layOut(4);
    const picked = () => tiles().filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.getAttribute('data-row-id'));
    tiles()[3]!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', shiftKey: true });
    await frame();
    expect(focused()).toBe('r6');
    expect(picked()).toEqual(['r3', 'r6']);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', shiftKey: true });
    await frame();
    expect(focused()).toBe('r6');
    expect(picked()).toEqual(['r3', 'r6']);
  });

  it('a click selects, a double click or Enter opens', async () => {
    const onRowAction = vi.fn();
    function Picker() {
      const [sel, setSel] = useState<Set<string>>(new Set());
      return (
        <>
          <output>{[...sel].join(',')}</output>
          <DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" selectable selectedIds={sel} onSelectionChange={setSel} onRowAction={onRowAction} />
        </>
      );
    }
    render(<Picker />);
    await userEvent.click(within(tiles()[1]!).getByText('item-1'));
    expect(document.querySelector('output')?.textContent).toBe('r1');
    expect(onRowAction).not.toHaveBeenCalled();
    await userEvent.click(within(tiles()[2]!).getByText('item-2'));
    expect(document.querySelector('output')?.textContent).toBe('r2');
    fireEvent.click(within(tiles()[4]!).getByText('item-4'), { ctrlKey: true });
    expect(document.querySelector('output')?.textContent).toBe('r2,r4');
    await userEvent.dblClick(within(tiles()[3]!).getByText('item-3'));
    expect(onRowAction).toHaveBeenCalledTimes(1);
    expect(onRowAction.mock.calls[0]![0]).toMatchObject({ id: 'r3' });
    tiles()[5]!.focus();
    press('Enter');
    expect(onRowAction).toHaveBeenCalledTimes(2);
    expect(onRowAction.mock.calls[1]![0]).toMatchObject({ id: 'r5' });
  });

  it('a right click opens the same row menu as the list', async () => {
    const { unmount } = render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" actions={actions} />);
    const listRow = screen.getAllByRole('row').find((r) => r.getAttribute('data-row-id') === 'r2')!;
    await userEvent.click(within(listRow).getByRole('button', { name: /actions/i }));
    const listItems = (await screen.findAllByRole('menuitem')).map((m) => m.textContent);
    await userEvent.keyboard('{Escape}');
    unmount();
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" actions={actions} />);
    fireEvent.contextMenu(within(tiles()[2]!).getByText('item-2'));
    const iconItems = (await screen.findAllByRole('menuitem')).map((m) => m.textContent);
    expect(iconItems).toEqual(listItems);
    expect(iconItems[0]).toContain('Open item-2');
  });

  it('is never virtual, even past 200 rows', () => {
    const many = Array.from({ length: 230 }, (_, i) => ({ id: `m${i}`, name: `m-${i}`, kind: 'file', size: '1 KB' }));
    render(<DataTable label="Files" data={many} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" />);
    expect(tiles()).toHaveLength(230);
  });
});

describe('icons share the cards\' toolbar, and cards keep their own behaviour', () => {
  const chip = { id: 'kind', label: 'Kind', options: [{ value: 'file', label: 'File' }], value: undefined, onChange: () => undefined };
  it('icons keep the filter chips and offer the Sort by menu, as cards do', async () => {
    render(<DataTable label="Files" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="icons" filters={[chip]} sortParam={false} noViewMenu />);
    expect(screen.getByRole('button', { name: /^Kind$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    const order = () => tiles().map((r) => r.getAttribute('data-row-id'));
    await userEvent.click(screen.getByRole('button', { name: 'Sort by' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Name/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sort by' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Name/ }));
    expect(order()[0]).toBe('r6');
  });

  it('a card still opens on a click (no tile picking), and up / down still move one card', async () => {
    const onRowAction = vi.fn();
    const onSelectionChange = vi.fn();
    render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" selectable selectedIds={new Set()} onSelectionChange={onSelectionChange} onRowAction={onRowAction} />);
    await userEvent.click(within(tiles()[1]!).getByText('item-1'));
    expect(onRowAction).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).not.toHaveBeenCalled();
    layOut(3);
    tiles()[0]!.focus();
    press('ArrowDown');
    await frame();
    expect(focused()).toBe('r1');
  });

  it('the table offers the page\'s own presentation items wherever its switch sits, and reports the pick', async () => {
    const change = vi.fn();
    render(
      <DataTable
        label="Files"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        presentation="list"
        presentChoice={{ value: 'list', onChange: change, items: [{ id: 'list', label: 'List', icon: 'menu' }, { id: 'icons', label: 'Icons', icon: 'apps' }] }}
      />,
    );
    const radio = screen.queryByRole('radio', { name: 'Icons' });
    if (radio) await userEvent.click(radio);
    else {
      await userEvent.click(screen.getByRole('button', { name: 'View options' }));
      expect(screen.queryByRole('menuitemradio', { name: 'Cards' })).toBeNull();
      await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Icons' }));
    }
    expect(screen.queryByRole('radio', { name: 'Cards' })).toBeNull();
    expect(change).toHaveBeenCalledWith('icons');
  });

  // The toolbar does not fit itself while rows are selected (the bulk bar stands in for the search), so a switch left in
  // the row would sit over the bulk actions on a narrow page: it waits in the view menu until the selection clears.
  it('while rows are selected the switch waits in the view menu, and comes back when they clear', async () => {
    const change = vi.fn();
    function Picking() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
      return (
        <DataTable
          label="Files"
          data={ROWS}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          presentation="table"
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          bulkActions={() => <button type="button">Delete selected</button>}
          presentChoice={{ value: 'list', onChange: change, items: [{ id: 'list', label: 'List', icon: 'menu' }, { id: 'icons', label: 'Icons', icon: 'apps' }] }}
        />
      );
    }
    render(<Picking />);
    expect(screen.getByRole('radio', { name: 'Icons' })).toBeTruthy();
    const row = screen.getByText('item-1').closest('tr') as HTMLElement;
    fireEvent.focus(row);
    fireEvent.keyDown(row, { key: 'x' });
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Icons' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'View options' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Icons' }));
    expect(change).toHaveBeenCalledWith('icons');
    await userEvent.click(screen.getByRole('button', { name: /^Clear/ }));
    expect(screen.getByRole('radio', { name: 'Icons' })).toBeTruthy();
  });
});

describe('List / Icons switch', () => {
  const KEY = 'hub.v3.table.present.files-test';
  afterEach(() => localStorage.removeItem(KEY));
  function Probe() {
    const [value, set] = usePresentation('files-test', 'list', ['list', 'icons']);
    return (
      <>
        <output>{value}</output>
        <PresentationSwitch
          value={value}
          onChange={set}
          items={[
            { id: 'list', label: 'List', icon: 'menu' },
            { id: 'icons', label: 'Icons', icon: 'apps' },
          ]}
        />
      </>
    );
  }
  it('offers the page\'s own items, and keeps Icons (a page that allows it)', async () => {
    render(<Probe />);
    expect(screen.queryByRole('radio', { name: 'Cards' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Icons' }));
    expect(document.querySelector('output')?.textContent).toBe('icons' satisfies Presentation);
    expect(localStorage.getItem(KEY)).toBe('icons');
  });
  it('a list that does not allow Icons reads a stored Icons as its fallback (Cards / List pages unchanged)', () => {
    localStorage.setItem(KEY, 'icons');
    function Plain() {
      const [value] = usePresentation('files-test', 'list');
      return <output>{value}</output>;
    }
    render(<Plain />);
    expect(document.querySelector('output')?.textContent).toBe('list');
  });
});
