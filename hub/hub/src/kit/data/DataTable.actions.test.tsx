// Vitest: an action is never twice in one row. splitActions decides, once per row and state, what is
// drawn (the inline verb, at most two hover icons), what the ⋯ menu lists, and which action is the row's open; the
// renderer draws exactly that split. rowOpen runs on a row click, Enter and (coarse pointer) the chevron, and is never a
// button or a menu item. `short` is the inline button's visible text; its label stays the accessible name.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createColumnHelper } from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { DataTable, splitActions, type RowActionEntry, type RowActionState } from './DataTable';
import { useDataView } from './DataTableView';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const DATA: Row[] = [{ id: 'a', name: 'alpha' }];
const rowOf = () => screen.getByText('alpha').closest('tr') as HTMLTableRowElement;

const noop = () => undefined;
function entries(on: Partial<Record<'open' | 'start' | 'term' | 'files' | 'logs' | 'copy' | 'del', () => void>> = {}): RowActionEntry[] {
  return [
    { id: 'open', label: 'Open computer', rowOpen: true, onAction: on.open ?? noop },
    { id: 'start', label: 'Start computer', short: 'Start', icon: 'play', inline: true, onAction: on.start ?? noop },
    { id: 'term', label: 'Open terminal', icon: 'terminal', hover: true, onAction: on.term ?? noop },
    { id: 'files', label: 'Open files', icon: 'files', hover: true, onAction: on.files ?? noop },
    // A third hover icon: two at most are drawn, the rest stay in ⋯.
    { id: 'logs', label: 'Open logs', icon: 'logs', hover: true, onAction: on.logs ?? noop },
    '-',
    { id: 'copy', label: 'Copy address', icon: 'copy', onAction: on.copy ?? noop },
    '-',
    { id: 'del', label: 'Delete', icon: 'trash', tone: 'danger', onAction: on.del ?? noop },
  ];
}
const ids = (list: readonly RowActionEntry[]) => list.map((e) => (e === '-' ? '-' : e.id));

describe('splitActions: every state of the matrix', () => {
  const presentations = ['table', 'list', 'cards'] as const;
  const pointers = ['fine', 'coarse'] as const;
  const focus = [
    { rowFocused: true, hovered: false },
    { rowFocused: false, hovered: true },
    { rowFocused: false, hovered: false },
  ] as const;
  for (const presentation of presentations)
    for (const pointer of pointers)
      for (const f of focus) {
        const state: RowActionState = { presentation, pointer, ...f };
        const hoverDrawn = presentation === 'table' && pointer === 'fine' && (f.rowFocused || f.hovered);
        it(`${presentation} · ${pointer} · ${f.rowFocused ? 'focused' : f.hovered ? 'hovered' : 'neither'}`, () => {
          const split = splitActions(entries(), state);
          const shown = split.shown.map((a) => a.id);
          expect(split.rowOpen?.id).toBe('open');
          expect(shown).toEqual(hoverDrawn ? ['start', 'term', 'files'] : ['start']);
          const menu = ids(split.menu);
          // Never twice: nothing drawn, and not the open, is in the menu; everything else is.
          for (const id of [...shown, 'open']) expect(menu).not.toContain(id);
          const rest = ['term', 'files', 'logs', 'copy', 'del'].filter((id) => !shown.includes(id));
          expect(menu.filter((e) => e !== '-')).toEqual(rest);
          // Separators are cleaned: none leading, trailing or doubled.
          expect(menu[0]).not.toBe('-');
          expect(menu[menu.length - 1]).not.toBe('-');
          expect(menu.join(',')).not.toMatch(/-,-/);
        });
      }

  it('a menu left with only separators is empty, so no ⋯ is drawn', () => {
    const split = splitActions([{ id: 'start', label: 'Start', inline: true, onAction: noop }, '-', { id: 'open', label: 'Open', rowOpen: true, onAction: noop }, '-'], {
      presentation: 'table',
      pointer: 'fine',
      rowFocused: false,
      hovered: false,
    });
    expect(split.menu).toEqual([]);
  });

  it('a hover action without an icon is never drawn, so it stays in the menu', () => {
    const split = splitActions([{ id: 'x', label: 'Plain', hover: true, onAction: noop }], { presentation: 'table', pointer: 'fine', rowFocused: true, hovered: true });
    expect(split.shown).toEqual([]);
    expect(ids(split.menu)).toEqual(['x']);
  });
});

/** Pointer media for useMedia: 'coarse' (a phone), 'nohover' (a fine pointer that cannot hover), or a mouse. */
function setCoarse(on: boolean | 'nohover') {
  const hit = (q: string) => (on === 'nohover' ? q.includes('hover: none') : on && (q.includes('coarse') || q.includes('hover: none')));
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: hit(q), media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })),
  );
}
afterEach(() => vi.unstubAllGlobals());

async function openMenu(row: HTMLElement) {
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}
const menuNames = (menu: HTMLElement) => within(menu).queryAllByRole('menuitem').map((m) => m.textContent ?? '');
const rowButtonNames = (row: HTMLElement) =>
  within(row)
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    .filter((n) => n !== 'Row actions');

describe('DataTable draws the split: nothing drawn is repeated in ⋯', () => {
  it('table, fine pointer: inline verb by its short text, two hover icons, the rest in ⋯; the open is neither', async () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const row = rowOf();
    const inline = within(row).getByRole('button', { name: 'Start computer' });
    expect(inline.textContent).toContain('Start');
    expect(inline.textContent).not.toContain('Start computer');
    const drawn = rowButtonNames(row);
    expect(drawn).toEqual(expect.arrayContaining(['Start computer', 'Open terminal', 'Open files']));
    expect(drawn.join('|')).not.toMatch(/Open computer/);
    const menu = menuNames(await openMenu(row));
    expect(menu.some((n) => n.startsWith('Open logs'))).toBe(true);
    expect(menu.some((n) => n.startsWith('Copy address'))).toBe(true);
    for (const name of [...drawn, 'Open computer']) expect(menu.some((n) => n.startsWith(name))).toBe(false);
  });

  it('table, coarse pointer: hover icons are not drawn and move to ⋯; the open is a chevron, still not in ⋯', async () => {
    setCoarse(true);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const row = rowOf();
    expect(within(row).queryByRole('button', { name: 'Open terminal' })).toBeNull();
    const chevron = within(row).getByRole('button', { name: 'Open computer' });
    expect(chevron.closest('[data-row-open]')).not.toBeNull();
    const menu = menuNames(await openMenu(row));
    expect(menu.some((n) => n.startsWith('Open terminal'))).toBe(true);
    expect(menu.some((n) => n.startsWith('Open computer'))).toBe(false);
    expect(menu.some((n) => n.startsWith('Start computer'))).toBe(false);
  });

  it('a fine pointer that cannot hover splits as touch: no hover icons, they are in ⋯, the open is a chevron', async () => {
    setCoarse('nohover');
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const row = rowOf();
    expect(within(row).queryByRole('button', { name: 'Open terminal' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Open computer' }).closest('[data-row-open]')).not.toBeNull();
    const menu = menuNames(await openMenu(row));
    expect(menu.some((n) => n.startsWith('Open terminal'))).toBe(true);
    expect(menu.some((n) => n.startsWith('Open files'))).toBe(true);
  });

  it('the stylesheet hides hover icons without hover, and keeps them shown while the row\'s ⋯ is open', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'DataTable.module.css'), 'utf8');
    expect(css).toMatch(/@media \(pointer: coarse\), \(hover: none\) \{\s*\.rowActions \{\s*display: none;/);
    const reveal = css.slice(0, css.indexOf('opacity: 1;', css.indexOf('.tr:hover .rowActions')));
    expect(reveal).toContain(".tr:has([data-row-menu] [aria-expanded='true']) .rowActions");
  });

  it('list: no hover icons are drawn; they are listed in ⋯ once', async () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="list" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const row = rowOf();
    expect(rowButtonNames(row)).toEqual(['Start computer']);
    const menu = menuNames(await openMenu(row));
    expect(menu.filter((n) => n.startsWith('Open terminal'))).toHaveLength(1);
    expect(menu.some((n) => n.startsWith('Start computer'))).toBe(false);
  });

  it('a row whose split leaves an empty menu draws no ⋯', () => {
    setCoarse(false);
    render(
      <DataTable
        label="Things"
        presentation="table"
        data={DATA}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        actions={() => [{ id: 'start', label: 'Start', inline: true, onAction: noop }, '-']}
      />,
    );
    expect(within(rowOf()).queryByRole('button', { name: 'Row actions' })).toBeNull();
  });

  it('without short the inline button shows its label and carries no separate aria-label', () => {
    setCoarse(false);
    render(
      <DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => [{ id: 'start', label: 'Start', inline: true, onAction: noop }]} />,
    );
    const b = within(rowOf()).getByRole('button', { name: 'Start' });
    expect(b.textContent).toContain('Start');
    expect(b).not.toHaveAttribute('aria-label');
  });

  it('label in name: the accessible name contains the visible short text, in the kit and in the gallery caller', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const inline = within(rowOf()).getByRole('button', { name: 'Start computer' });
    const visible = (inline.textContent ?? '').trim();
    expect(visible.length).toBeGreaterThan(0);
    expect(inline.getAttribute('aria-label')).toContain(visible);
    // The gallery builds label from short with act.verbOf; the template must keep the verb whole.
    const here = dirname(fileURLToPath(import.meta.url));
    const strings = JSON.parse(readFileSync(join(here, '../gallery/table.strings.en.json'), 'utf8')) as Record<string, string>;
    expect(strings['act.verbOf']).toContain('{{verb}}');
  });
});

describe('a short inline button shows its whole label as its tooltip', () => {
  it('a pointer over it shows the label; without short, or a short equal to the label, no tooltip is added', async () => {
    setCoarse(false);
    const { unmount } = render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    const inline = within(rowOf()).getByRole('button', { name: 'Start computer' });
    await userEvent.hover(inline);
    expect(await screen.findByRole('tooltip', {}, { timeout: 3000 })).toHaveTextContent('Start computer');
    await userEvent.unhover(inline);
    unmount();
    for (const a of [
      { id: 'start', label: 'Start', inline: true, onAction: noop },
      { id: 'start', label: 'Start', short: 'Start', inline: true, onAction: noop },
    ]) {
      const r = render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(x) => x.id} actions={() => [a]} />);
      const b = within(rowOf()).getByRole('button', { name: 'Start' });
      await userEvent.hover(b);
      await new Promise((ok) => setTimeout(ok, 900));
      // Still over the button, past the delay: no tooltip.
      expect(screen.queryByRole('tooltip')).toBeNull();
      await userEvent.unhover(b);
      r.unmount();
    }
  });
});

describe('rowOpen: the row is the open', () => {
  it('a click and Enter run it; the row says it opens', async () => {
    setCoarse(false);
    const open = vi.fn();
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries({ open })} />);
    const row = rowOf();
    expect(row).toHaveAttribute('data-row-opens');
    fireEvent.click(row);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(row, { key: 'Enter' });
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  });

  it('it wins over a view-less table with nothing else to open, in list too', async () => {
    setCoarse(false);
    const open = vi.fn();
    render(<DataTable label="Things" presentation="list" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries({ open })} />);
    fireEvent.click(rowOf());
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  });

  it('the coarse chevron runs it once, without also opening through the row', async () => {
    setCoarse(true);
    const open = vi.fn();
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries({ open })} />);
    await userEvent.click(within(rowOf()).getByRole('button', { name: 'Open computer' }));
    await act(async () => undefined);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a disabled rowOpen opens nothing', async () => {
    setCoarse(false);
    const open = vi.fn();
    render(
      <DataTable
        label="Things"
        presentation="table"
        data={DATA}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        actions={() => [{ id: 'open', label: 'Open', rowOpen: true, isDisabled: true, onAction: open }]}
      />,
    );
    expect(rowOf()).not.toHaveAttribute('data-row-opens');
    expect(rowOf().className).not.toMatch(/clickable/);
    fireEvent.click(rowOf());
    fireEvent.keyDown(rowOf(), { key: 'Enter' });
    await act(async () => undefined);
    expect(open).not.toHaveBeenCalled();
  });

  it('on a fine pointer the row accessible description is the label of its open, in table and list', () => {
    setCoarse(false);
    for (const presentation of ['table', 'list'] as const) {
      const { unmount } = render(<DataTable label="Things" presentation={presentation} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
      expect(rowOf()).toHaveAccessibleDescription('Open computer');
      // Never shown, never in the row's own text.
      expect(rowOf().textContent).not.toContain('Open computer');
      unmount();
    }
  });

  it('no description for a disabled rowOpen, nor on a coarse pointer (the chevron names it there)', () => {
    setCoarse(false);
    const { unmount } = render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => [{ id: 'open', label: 'Open', rowOpen: true, isDisabled: true, onAction: noop }]} />);
    expect(rowOf()).not.toHaveAttribute('aria-describedby');
    unmount();
    setCoarse(true);
    render(<DataTable label="Things" presentation="table" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => entries()} />);
    expect(rowOf()).not.toHaveAttribute('aria-describedby');
    expect(within(rowOf()).getByRole('button', { name: 'Open computer' })).toBeTruthy();
  });

  it('a disabled rowOpen never falls back to onRowAction-like view opens: a click on a view table opens nothing', async () => {
    setCoarse(false);
    const open = vi.fn();
    const viewOpen = vi.fn();
    function Page() {
      const view = useDataView({ rows: DATA, columns: COLUMNS, getRowId: (r) => r.id });
      return <DataTable label="Things" presentation="table" columns={COLUMNS} view={{ ...view, open: viewOpen }} actions={() => [{ id: 'open', label: 'Open', rowOpen: true, isDisabled: true, onAction: open }]} />;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/'] }) });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    fireEvent.click(rowOf());
    fireEvent.keyDown(rowOf(), { key: 'Enter' });
    await act(async () => undefined);
    expect(open).not.toHaveBeenCalled();
    expect(viewOpen).not.toHaveBeenCalled();
  });
});

describe('dev assertions', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(noop);
  it('two rowOpen actions on a row throw', () => {
    const e = quiet();
    expect(() =>
      render(
        <DataTable
          label="Things"
          data={DATA}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          actions={() => [
            { id: 'a', label: 'A', rowOpen: true, onAction: noop },
            { id: 'b', label: 'B', rowOpen: true, onAction: noop },
          ]}
        />,
      ),
    ).toThrow(/2 rowOpen actions/);
    e.mockRestore();
  });

  it('rowOpen beside an onRowAction throws', () => {
    const e = quiet();
    expect(() =>
      render(<DataTable label="Things" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} onRowAction={noop} actions={() => [{ id: 'a', label: 'A', rowOpen: true, onAction: noop }]} />),
    ).toThrow(/drop onRowAction/);
    e.mockRestore();
  });

  it('rowOpen in a table whose row click picks throws', () => {
    const e = quiet();
    for (const selectable of ['pick', 'pickOne'] as const)
      expect(() =>
        render(<DataTable label="Things" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} selectable={selectable} actions={() => [{ id: 'a', label: 'A', rowOpen: true, onAction: noop }]} />),
      ).toThrow(/row click picks/);
    e.mockRestore();
  });

  it('one rowOpen on its own is fine (control)', () => {
    expect(() => render(<DataTable label="Things" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => [{ id: 'a', label: 'A', rowOpen: true, onAction: noop }]} />)).not.toThrow();
  });
});
