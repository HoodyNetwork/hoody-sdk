// Vitest ("Slanted close"): a table drawn from a width plan marks its scroller data-x 'fit'
// (no horizontal bar), since the plan's widths always add up to the room: the planner drops columns, then scales even
// pinned floors wider than the room down to it, so there is no sideways overflow for an edge cue to show. And a framed
// table that is no rail and sits in no card carries data-table-cut and draws the kit's cut edge (mark 'table').
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';
import { CardScope } from '../layouts/CardEdge';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  title: string;
  message: string;
  type: string;
}
const rows: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, title: `Item ${i}`, message: `Message ${i}`, type: 'ok' }));
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary', minWidth: 240 } }),
  col.accessor('message', { header: 'Message', meta: { size: 'fill', pinned: true, minWidth: 240 } }),
  col.accessor('type', { header: 'Type', meta: { size: 'fit', pinned: true } }),
];

type Cb = (entries: { target: Element; contentRect: { width: number } }[]) => void;
const observers: { cb: Cb; el?: Element }[] = [];
beforeEach(() => {
  observers.length = 0;
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
});
afterEach(() => cleanup());

function width(w: number) {
  act(() => {
    for (const o of observers) if (o.el) o.cb([{ target: o.el, contentRect: { width: w } }]);
  });
}
/** The scroller: the table's own parent (DataTable's .scroll). */
const box = () => document.querySelector('table')!.parentElement as HTMLElement;
const frame = () => document.querySelector('[data-table-frame]') as HTMLElement;
/** Planned widths only: the checkbox column is sized by its class (the +40 below), not inline. */
const sum = () => [...document.querySelectorAll('colgroup col')].reduce((n, c) => n + (Number.parseFloat((c as HTMLElement).style.width) || 0), 0);

describe('DataTable: no sideways overflow from a width plan', () => {
  it('no flag before the first measure', () => {
    render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    expect(box().hasAttribute('data-x')).toBe(false);
  });

  it("the widths add up to the room at every width, floors wider than the room included, and the flag is 'fit'", () => {
    render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    for (const room of [1350, 900, 300]) {
      width(room);
      expect(sum(), `widths at ${room}`).toBeLessThanOrEqual(room);
      expect(box().getAttribute('data-x')).toBe('fit');
    }
    cleanup();
    render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" selectable />);
    width(300);
    expect(sum()).toBeGreaterThan(0);
    expect(sum() + 40).toBeLessThanOrEqual(300);
    expect(box().getAttribute('data-x')).toBe('fit');
  });

  it('on a coarse pointer the plan reserves the 44 px check column it draws (.colCheck, --touch-min), not 40', () => {
    const noop = () => undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({ matches: q.includes('coarse') || q.includes('hover: none'), media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })),
    );
    try {
      render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" selectable />);
      width(300);
      expect(sum()).toBeGreaterThan(0);
      expect(sum() + 44).toBeLessThanOrEqual(300);
      expect(box().getAttribute('data-x')).toBe('fit');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('an auto table that cannot fit turns into a list, and a list carries no flag', () => {
    render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} />);
    width(300);
    expect(box().hasAttribute('data-x')).toBe(false);
  });
});

describe('DataTable: the slanted close', () => {
  it('a framed table carries data-table-cut and draws the cut edge', () => {
    render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} />);
    expect(frame().hasAttribute('data-table-cut')).toBe(true);
    expect(frame().querySelector(':scope > [data-table-edge]')).not.toBeNull();
  });

  it("a cut frame's footer keeps the slant clear at its end, and forced colors keep a square system frame", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, 'DataTable.module.css'), 'utf8');
    // One selector of the list: anything but a brace or a top-level comma (a comma inside :not(…) belongs to its selector).
    const clear = /((?:\.wrap\[data-table-cut\](?:[^{,(]|\([^)]*\))*,\s*)*\.wrap\[data-table-cut\](?:[^{,(]|\([^)]*\))*)\{\s*padding-inline-end: var\(--table-cut-clear\);/.exec(css)?.[1] ?? '';
    for (const sel of ['> .footer', '.tr > .tdActions', '.list .tr > .listCell', '.groupNoteRow > td', '.groupRow.groupRowEnd > td']) expect(clear, sel).toContain(sel);
    const edge = readFileSync(join(here, '../layouts/CardEdge.module.css'), 'utf8');
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(edge)?.[1] ?? '';
    expect(forced).toMatch(/\[data-table-cut\]\[data-table-cut\]\) \{\s*border-color: canvastext;\s*clip-path: none;/);
    expect(forced).toMatch(/\[data-table-cut\]\) > \.edge \{\s*display: none;/);
    // Right to left the cut moves to the inline end (bottom left) with its line, at no added weight.
    expect(edge).toMatch(/\[data-table-cut\]\[data-table-cut\]:where\(:dir\(rtl\)\)\) \{\s*clip-path: polygon\(0 0, 100% 0, 100% 100%, var\(--table-cut\) 100%, 0 calc\(100% - var\(--table-cut\)\)\);/);
    expect(edge).toMatch(/\[data-table-cut\]:where\(:dir\(rtl\)\)\) > \.edge \{\s*transform: scaleX\(-1\);/);
    expect(edge.indexOf(':dir(rtl)')).toBeLessThan(edge.indexOf('@media (forced-colors: active)'));
  });

  it("a cut frame's actions column carries the slant's clearance (14 px more than a square frame's)", () => {
    const acts = () => [{ id: 'del', label: 'Delete item', onAction: () => undefined }];
    const actionsCol = () => Number.parseFloat((document.querySelector('colgroup col:last-child') as HTMLElement).style.width);
    const { unmount } = render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} actions={acts} presentation="table" />);
    width(1350);
    expect(frame().hasAttribute('data-table-cut')).toBe(true);
    const cutW = actionsCol();
    unmount();
    render(
      <CardScope>
        <DataTable label="Inside" data={rows} columns={COLUMNS} getRowId={(r) => r.id} actions={acts} presentation="table" />
      </CardScope>,
    );
    width(1350);
    expect(cutW - actionsCol()).toBe(14);
  });

  it('a bare table and a table inside a card stay square (a rail: the pw spec)', () => {
    const { unmount } = render(<DataTable label="Inbox" data={rows} columns={COLUMNS} getRowId={(r) => r.id} bare />);
    expect(document.querySelector('[data-table-cut], [data-table-edge]')).toBeNull();
    unmount();
    render(
      <CardScope>
        <DataTable label="Inside" data={rows} columns={COLUMNS} getRowId={(r) => r.id} />
      </CardScope>,
    );
    expect(document.querySelector('[data-table-cut], [data-table-edge]')).toBeNull();
  });
});
