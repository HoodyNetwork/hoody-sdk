// Vitest: density never changes a control's height through tokens; a compact table picks its row actions' size itself
// and asks for xs (its touch press built in), while a table at the default density keeps them sm, the kit's row button
// (`--btn-h-sm`). The size is the kit Button's own (no table CSS sizes the ⋯), so the row's controls and the control
// matrix agree.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type RowActionEntry } from './DataTable';

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
const noop = () => undefined;
const ENTRIES: RowActionEntry[] = [
  { id: 'open', label: 'Open computer', rowOpen: true, onAction: noop },
  { id: 'start', label: 'Start computer', short: 'Start', icon: 'play', inline: true, onAction: noop },
  { id: 'term', label: 'Open terminal', icon: 'terminal', hover: true, onAction: noop },
  { id: 'del', label: 'Delete', icon: 'trash', tone: 'danger', hover: true, onAction: noop },
  '-',
  { id: 'copy', label: 'Copy address', icon: 'copy', onAction: noop },
];

function setCoarse(on: boolean) {
  const hit = (q: string) => on && (q.includes('coarse') || q.includes('hover: none'));
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: hit(q), media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })),
  );
}
afterEach(() => vi.unstubAllGlobals());

const row = () => screen.getByText('alpha').closest('tr') as HTMLTableRowElement;
const btn = (name: string) => within(row()).getByRole('button', { name });
/** The kit size class a button carries (CSS modules are not scoped under vitest). */
const sizeOf = (el: HTMLElement) => ['xs', 'sm', 'md', 'toolbar'].filter((c) => el.classList.contains(c));

describe('a table row draws its actions at the size its density asks for', () => {
  for (const density of ['normal', 'compact'] as const) {
    const want = density === 'compact' ? 'xs' : 'sm';
    it(`${density}, fine pointer: the inline verb, the hover icons and the ⋯ are ${want}`, () => {
      setCoarse(false);
      render(<DataTable label="Things" presentation="table" density={density} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => ENTRIES} />);
      for (const name of ['Start computer', 'Open terminal', 'Delete', 'Row actions']) expect(sizeOf(btn(name)), name).toEqual([want]);
    });
    it(`${density}, coarse pointer: the open chevron and the ⋯ are ${want}`, () => {
      setCoarse(true);
      render(<DataTable label="Things" presentation="table" density={density} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => ENTRIES} />);
      for (const name of ['Open computer', 'Row actions']) expect(sizeOf(btn(name)), name).toEqual([want]);
      // The wrap names the size, so the CSS can keep xs touch presses apart.
      expect(btn('Open computer').closest('[data-row-size]')?.getAttribute('data-row-size')).toBe(want);
    });
    it(`${density}, a row with only menu actions: its ⋯ is ${want} too`, () => {
      setCoarse(false);
      render(<DataTable label="Things" presentation="table" density={density} data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => [{ id: 'copy', label: 'Copy', onAction: noop }]} />);
      expect(sizeOf(btn('Row actions'))).toEqual([want]);
    });
  }

  it('a danger hover icon says so by tone: the danger look, with the size kept', () => {
    setCoarse(false);
    render(<DataTable label="Things" presentation="table" density="compact" data={DATA} columns={COLUMNS} getRowId={(r) => r.id} actions={() => ENTRIES} />);
    expect(btn('Delete').classList.contains('danger')).toBe(true);
  });
});

describe('no table CSS sizes the row ⋯: the kit size is the one drawn', () => {
  const KIT = path.join(import.meta.dirname, '..');
  const read = (f: string) => readFileSync(path.join(KIT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('DataTable.module.css sets no width or height on .rowMore, and --more-h-table is gone', () => {
    const css = read('data/DataTable.module.css');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/\.rowMore\b/.test(m[1]!)) expect(m[2], m[1]!.trim()).not.toMatch(/(^|[;\s])(width|height|min-width|min-height|inline-size|block-size)\s*:/);
    expect(css).not.toMatch(/--more-h-table/);
    expect(read('tokens.css')).not.toMatch(/--more-h-table/);
  });
  it('xs row controls stand apart by the reach of their touch presses: (--touch-min - --ctl-h-xs), at least --sp-half', () => {
    const css = read('data/DataTable.module.css');
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === ".rowActionsWrap[data-row-size='xs']");
    expect(rule![2]!.replace(/\s+/g, ' ').trim()).toBe('gap: max(var(--sp-half), calc(var(--touch-min) - var(--ctl-h-xs)));');
    // A rail's word and its ⋯ sit in two grid cells --rail-gap apart: the end cell adds what the gap lacks.
    const rail = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === ".rail .listGrid > .rowActionsWrap[data-row-size='xs']");
    expect(rail![2]!.replace(/\s+/g, ' ').trim()).toBe('margin-inline-start: max(0px, calc((var(--touch-min) - var(--ctl-h-xs)) / 2 - var(--rail-gap)));');
  });
});
