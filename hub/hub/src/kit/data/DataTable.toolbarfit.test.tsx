// Vitest: the DataTable toolbar fits ITSELF. It measures its own row, not the
// page region, and steps down only as far as it must: chips -> one Filters button -> no count -> Cards/List icons ->
// Cards/List and the secondary actions in the view menu -> Filters icon -> the page's end controls on a second row.
// Search keeps its least width (CSS); no label is cut; what an action says goes in its own line under the toolbar.
//
// jsdom has no layout, so the toolbar's widths are modelled: its box is `room`, and its one-row width is the sum of the
// controls it draws at their whole widths (the numbers below), as the browser reports through scrollWidth. The widths are
// synthetic (no flex gaps; one chips figure for any number of chips): these cases prove the fold's behaviour and order,
// not where it happens on a page. The real boundary, with real widths and gaps, is measured in toolbar.table-toolbar-px-row.spec.ts.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type ToolbarAction } from './DataTable';
import { toolbarSteps } from './DataTableLayout';
import type { FilterChip } from './FilterChips';
import { ListPaneContext } from '../layouts/pane';
import dt from './DataTable.module.css';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha' },
  { id: 'b', name: 'bravo' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];

const chip = (id: string, label: string): FilterChip => ({ id, label, options: [{ value: 'x', label: 'X' }], value: undefined, onChange: () => {} });
// Three chips: a fourth would keep them behind the Filters button at every width (CHIP_FACETS_MAX, DataTable.facetfold
// .test.tsx), so the room-driven fold below needs a table under that count.
const FILTERS = [chip('state', 'State'), chip('plan', 'Plan'), chip('server', 'Server')];

// Whole widths of what the row draws (px). Search counts at its least width (200). The Filters button and the icon
// buttons are 40 px toolbar controls; the Filters words button is 109 as the demo page measures it (12 px padding and an
// 8 px icon gap at the toolbar size); a chip starts with 12 px, not 8 (the chips figure was measured with 4 chips; it stays synthetic).
const W = { pad: 16, search: 200, chips: 436, filtersWords: 109, filtersIcon: 40, count: 110, presentLabels: 150, presentIcons: 64, switch: 140, action: 180, iconBtn: 40, end: 120 };

let room = 0;
// Extra width a chip's chosen value adds to the chips (a long value label).
let chipsExtra = 0;
type Cb = (entries: Array<{ target: Element; contentRect: { width: number } }>) => void;
const observers: Array<{ cb: Cb; el?: Element }> = [];

function toolbar(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-testid="tb"] .toolbar');
  if (!el) throw new Error('no toolbar');
  return el;
}

/** The toolbar's one-row width: what it draws now, each control whole. The second row (toolbarRow2) is not in it. */
function rowWidth(el: HTMLElement): number {
  let w = W.pad;
  if (el.querySelector('[data-hub-search]')) w += W.search;
  if (el.querySelector('[role="group"][aria-label="Filters"]')) w += W.chips + chipsExtra;
  const fb = Array.from(el.querySelectorAll('button')).find((b) => /^Filters/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
  if (fb) w += fb.getAttribute('aria-label') ? W.filtersIcon : W.filtersWords;
  const row1 = el.querySelector('.toolbarEnd');
  if (row1?.querySelector('.count')) w += W.count;
  const seg = row1?.querySelector('[role="radiogroup"]');
  if (seg) w += seg.classList.contains('iconOnly') ? W.presentIcons : W.presentLabels;
  w += (row1?.querySelectorAll('[role="switch"]').length ?? 0) * W.switch;
  for (const b of Array.from(row1?.querySelectorAll('button') ?? [])) {
    if (b.closest('[role="radiogroup"]')) continue;
    if (b.closest('[data-end]')) continue;
    w += b.textContent?.trim() ? W.action : W.iconBtn;
  }
  if (row1?.querySelector('[data-end]')) w += W.end;
  return w;
}

beforeEach(() => {
  observers.length = 0;
  room = 0;
  chipsExtra = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: Cb; el?: Element };
    constructor(cb: Cb) {
      this.o = { cb };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.el = el;
    }
    unobserve() {}
    disconnect() {
      this.o.el = undefined;
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('toolbar') && this.isConnected ? room : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('toolbar') ? Math.max(room, rowWidth(this)) : 0;
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

/** Resize the toolbar's box and tell its observers (the table's own scroll box stays wide: a table, not list rows). */
function resize(w: number) {
  room = w;
  act(() => {
    for (const o of observers) {
      const el = o.el;
      if (el) o.cb([{ target: el, contentRect: { width: el.classList.contains('toolbar') ? w : 1600 } }]);
    }
  });
}

function Table(p: { actions?: ToolbarAction[]; note?: React.ReactNode; end?: React.ReactNode; present?: boolean }) {
  return (
    <div data-testid="tb">
      <DataTable
        label="Things"
        data={ROWS}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        search
        filters={FILTERS}
        presentation="table"
        countLabel={(n) => `${n} things`}
        presentChoice={p.present === false ? undefined : { value: 'list', onChange: () => {} }}
        toolbarActions={p.actions}
        toolbarNote={p.note}
        toolbarEnd={p.end}
        onRefresh={() => {}}
      />
    </div>
  );
}

const ACTIONS: ToolbarAction[] = [
  { id: 'usage', label: 'Show usage', selected: false, onSelectedChange: () => {} },
  { id: 'explain', label: 'Explain everything', icon: 'sparkle', onPress: () => {} },
];

const seen = () => {
  const el = toolbar();
  return {
    chips: Boolean(el.querySelector('[role="group"][aria-label="Filters"]')),
    filtersButton: Boolean(within(el).queryByRole('button', { name: /^Filters/ })),
    count: Boolean(el.querySelector('.count')),
    switchInRow: Boolean(within(el).queryByRole('switch', { name: 'Show usage' })),
    presentInRow: Boolean(within(el).queryByRole('radiogroup')),
    menu: Boolean(within(el).queryByRole('button', { name: 'View options' })),
  };
};

describe('toolbarSteps: the order things move', () => {
  it('folds filters first, then the count, then the Cards/List words, then the menu, then the Filters words, then the end row', () => {
    const steps = toolbarSteps({ filters: true, chips: true, count: true, present: true, actions: true, end: true });
    expect(steps.map((s) => [s.filters, s.count, s.present, s.actions, s.endRow])).toEqual([
      ['chips', true, 'labels', 'inline', false],
      ['button', true, 'labels', 'inline', false],
      ['button', false, 'labels', 'inline', false],
      ['button', false, 'icons', 'inline', false],
      ['button', false, 'menu', 'menu', false],
      ['icon', false, 'menu', 'menu', false],
      ['icon', false, 'menu', 'menu', true],
    ]);
  });

  it('skips steps that would move nothing the toolbar holds', () => {
    expect(toolbarSteps({ filters: false, chips: true, count: true, present: false, actions: false, end: false })).toHaveLength(2);
    // List rows never show chips: the first step already has the Filters button.
    expect(toolbarSteps({ filters: true, chips: false, count: false, present: false, actions: false, end: false })[0]?.filters).toBe('button');
  });
});

describe('the toolbar measures its own row', () => {
  it('a roomy toolbar keeps chips, count, labelled Cards/List and the actions in the row', () => {
    render(<Table actions={ACTIONS} />);
    resize(1600);
    expect(seen()).toMatchObject({ chips: true, filtersButton: false, count: true, switchInRow: true, presentInRow: true });
    // An action with words is a toolbar word button, drawn in the toolbar type.
    expect(within(toolbar()).getByRole('button', { name: 'Explain everything' })).toHaveClass(dt.tbWords as string);
    // It is a toolbar control, as tall as the search field beside it, never a small button.
    expect(within(toolbar()).getByRole('button', { name: 'Explain everything' })).toHaveClass('toolbar');
    expect(within(toolbar()).getByRole('button', { name: 'Explain everything' })).not.toHaveClass('sm');
  });

  it('at about 1100 px of toolbar the chips fold into one Filters button before they would wrap; search and the rest keep their room', () => {
    render(<Table actions={ACTIONS} />);
    resize(1600);
    resize(1100);
    // 16+200+98+110+150+140+180+40+40 = 974 fits once the chips (436) fold.
    expect(seen()).toMatchObject({ chips: false, filtersButton: true, count: true, switchInRow: true, presentInRow: true });
    expect(toolbar().scrollWidth).toBeLessThanOrEqual(1100);
  });

  it('a 340 px list pane moves the switch, Cards/List and the action into the view menu; nothing is cut', async () => {
    render(<Table actions={ACTIONS} />);
    resize(340);
    // 16+200+40 (Filters icon)+40 (menu)+40 (reload) = 336.
    expect(seen()).toMatchObject({ chips: false, filtersButton: true, count: false, switchInRow: false, presentInRow: false, menu: true });
    expect(toolbar().scrollWidth).toBeLessThanOrEqual(340);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'View options' }));
    const menu = await screen.findByRole('menu', { name: 'View options' });
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Show usage' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Explain everything' })).toBeTruthy();
    expect(within(menu).getByRole('menuitemradio', { name: 'Cards' })).toBeTruthy();
  });

  it('growing again brings the controls back to the row', () => {
    render(<Table actions={ACTIONS} />);
    resize(340);
    expect(seen().switchInRow).toBe(false);
    resize(1600);
    expect(seen()).toMatchObject({ chips: true, switchInRow: true, presentInRow: true, count: true });
  });

  it('a page control that cannot go in a menu takes a second row of its own, last', () => {
    render(<Table end={<button type="button" data-end="">Deleted</button>} present={false} />);
    resize(330);
    const row2 = toolbar().querySelector('.toolbarRow2');
    expect(row2).not.toBeNull();
    expect(within(row2 as HTMLElement).getByRole('button', { name: 'Deleted' })).toBeTruthy();
    resize(1600);
    expect(toolbar().querySelector('.toolbarRow2')).toBeNull();
  });

  it('a menu action runs, and a switch in the menu flips', async () => {
    const press = vi.fn();
    const flip = vi.fn();
    render(<Table actions={[{ id: 'usage', label: 'Show usage', selected: false, onSelectedChange: flip }, { id: 'explain', label: 'Explain everything', icon: 'sparkle', onPress: press }]} />);
    resize(340);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'View options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Explain everything' }));
    expect(press).toHaveBeenCalledTimes(1);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'View options' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show usage' }));
    expect(flip).toHaveBeenCalledTimes(1);
    expect(flip).toHaveBeenCalledWith(true);
  });
});

describe('the fit follows the toolbar element itself', () => {
  function Shown({ rows }: { rows: Row[] }) {
    return (
      <div data-testid="tb">
        <DataTable label="Things" data={rows} columns={COLUMNS} getRowId={(r) => r.id} search filters={FILTERS} presentation="table" countLabel={(n) => `${n} things`} presentChoice={{ value: 'list', onChange: () => {} }} toolbarActions={ACTIONS} onRefresh={() => {}} />
      </div>
    );
  }

  it('a toolbar that appears after the first render (empty, then rows) still grows back', () => {
    room = 340;
    const r = render(<Shown rows={[]} />);
    r.rerender(<Shown rows={ROWS} />);
    expect(seen().switchInRow).toBe(false);
    resize(1600);
    expect(seen()).toMatchObject({ chips: true, switchInRow: true, presentInRow: true, count: true });
  });

  it('rows, then empty, then rows again: the new toolbar is the one watched', () => {
    room = 1600;
    const r = render(<Shown rows={ROWS} />);
    resize(340);
    expect(seen().switchInRow).toBe(false);
    r.rerender(<Shown rows={[]} />);
    r.rerender(<Shown rows={ROWS} />);
    resize(1600);
    expect(seen()).toMatchObject({ chips: true, switchInRow: true, presentInRow: true, count: true });
  });
});

describe('an open popup is never swapped out by the fit', () => {
  function Multi() {
    const [v, setV] = useState<string | undefined>(undefined);
    const f: FilterChip = {
      id: 'state',
      label: 'State',
      kind: 'multi',
      options: [
        { value: 'a', label: 'Running' },
        { value: 'b', label: 'Stopped' },
      ],
      value: v,
      onChange: (x) => {
        chipsExtra = x ? 200 : 0;
        setV(x);
      },
    };
    return (
      <div data-testid="tb">
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} search filters={[f]} presentation="table" countLabel={(n) => `${n} things`} onRefresh={() => {}} />
      </div>
    );
  }

  it('a choice that widens the chips keeps the open menu (and the next choice works); the fold waits until it closes', async () => {
    // Synthetic widths: 16+200+436+110+40+40 (reload, view menu) = 842 fits in 860; a chosen value adds 200 (the model's
    // chips figure stands for this one chip too). Behaviour only: the menu stays and the fold waits until it closes.
    room = 860;
    render(<Multi />);
    resize(860);
    expect(seen().chips).toBe(true);
    fireEvent.click(within(toolbar()).getByRole('button', { name: /State/ }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Running' }));
    expect(screen.getByRole('menu')).toBe(menu);
    expect(seen().chips).toBe(true);
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Stopped' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'Stopped' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(seen()).toMatchObject({ chips: false, filtersButton: true });
  });
});

describe('menu entries keep their state', () => {
  it('Cards/List are radio items and a switch is a checkbox item, each with aria-checked; a plain action stays a menuitem', async () => {
    render(<Table actions={[{ id: 'usage', label: 'Show usage', selected: true, onSelectedChange: () => {} }, { id: 'explain', label: 'Explain everything', icon: 'sparkle', onPress: () => {} }]} />);
    resize(340);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'View options' }));
    const menu = await screen.findByRole('menu', { name: 'View options' });
    expect(within(menu).getByRole('menuitemradio', { name: 'List' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Cards' }).getAttribute('aria-checked')).toBe('false');
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Show usage' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitem', { name: 'Explain everything' })).toBeTruthy();
  });

  it('choosing Cards in the menu calls onChange once with cards', async () => {
    const change = vi.fn();
    render(
      <div data-testid="tb">
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} search filters={FILTERS} presentation="table" countLabel={(n) => `${n} things`} presentChoice={{ value: 'list', onChange: change }} toolbarActions={ACTIONS} onRefresh={() => {}} />
      </div>,
    );
    resize(340);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'View options' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Cards' }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith('cards');
  });
});

describe('what an action says has its own line under the toolbar', () => {
  it('toolbarNote is drawn after the toolbar, never inside its row', () => {
    render(<Table actions={ACTIONS} note={<p role="status">The question did not reach the Agent.</p>} />);
    const note = screen.getByRole('status');
    expect(toolbar().contains(note)).toBe(false);
    expect(note.closest('.toolbarNote')).not.toBeNull();
  });
});

describe('Cards / List beside a detail', () => {
  it('is not offered where the pane forces list rows (the choice would change nothing)', () => {
    render(
      <ListPaneContext.Provider value={{ presentation: 'list' }}>
        <Table />
      </ListPaneContext.Provider>,
    );
    resize(1600);
    expect(within(toolbar()).queryByRole('radiogroup')).toBeNull();
  });
});
