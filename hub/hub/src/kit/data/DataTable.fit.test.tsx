// Vitest ("Measured columns + tooltip"): DataTable sizes 'fit' columns from the data (every row,
// not only the drawn ones), a 'fill' column takes the rest, and the widths add up to the table's own width; a cut-off
// cell gets a native title with its shown text (an id masked) when the pointer comes in, and loses it once it fits.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { useSyncExternalStore } from 'react';
import { DataTable } from './DataTable';
import { CELL_PAD, EDGE_PAD, fitWidth, headerWidth, textWidth } from './DataTableLayout';
import { statusPillMetrics } from './pillMetrics';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  title: string;
  message: string;
  type: string;
  n: number;
}
const ID = '64a1f0c2b9e8d7a6f5e4d3c2';
const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i}`, title: `Item ${i}`, message: `Message ${i}`, type: i === count - 1 ? 'a much longer type word' : 'ok', n: i }));
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
  col.accessor('message', { header: 'Message', meta: { size: 'fill' } }),
  col.accessor('type', { header: 'Type', meta: { size: 'fit' } }),
  col.accessor('n', { header: 'N', meta: { size: 'fit', align: 'end', mono: true } }),
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
/** The colgroup's px widths, in column order. */
const cols = () => [...document.querySelectorAll('colgroup col')].map((c) => Number.parseFloat((c as HTMLElement).style.width));

describe('DataTable: measured columns', () => {
  it('a fit column is its longest text, the fill column takes the rest, and the widths add up to the room', () => {
    const data = rows(5);
    render(<DataTable label="Inbox" data={data} columns={COLUMNS} getRowId={(r) => r.id} />);
    for (const room of [1350, 2400]) {
      width(room);
      const [title, message, type, n] = cols();
      expect(type).toBe(fitWidth(data.map((r) => r.type)));
      expect(n).toBeGreaterThanOrEqual(fitWidth(data.map((r) => String(r.n)), { mono: true }));
      expect((title ?? 0) + (message ?? 0) + (type ?? 0) + (n ?? 0)).toBe(room);
      expect(message).toBeGreaterThan(Math.max(title ?? 0, type ?? 0, n ?? 0));
    }
  });

  it('measures every row, not only the drawn ones (the long text is in the last of 400 virtual rows)', () => {
    const data = rows(400);
    render(<DataTable label="Inbox" data={data} columns={COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    expect(cols()[2]).toBe(fitWidth(['a much longer type word']));
  });

  it('a fit column that draws its own cell measures fitText, the words it shows, not its raw value', () => {
    const data = rows(3);
    const custom = [
      col.accessor('title', { header: 'Title', meta: { pinned: true } }),
      col.accessor('type', { header: 'Type', meta: { size: 'fit', fitText: (r) => `Kind: ${r.type}` }, cell: (c) => <b>Kind: {c.getValue()}</b> }),
    ];
    render(<DataTable label="Custom" data={data} columns={custom} getRowId={(r) => r.id} />);
    width(1350);
    // Type is the last cell (no row actions): the kit adds its wider end, 4 px.
    expect(cols()[1]).toBe(fitWidth(data.map((r) => `Kind: ${r.type}`)) + EDGE_PAD);
  });

  it('a pill column measures its words in the pill\'s own type and box (fitMetrics), not the cell font', () => {
    const data = rows(3);
    const pill = statusPillMetrics(true);
    const words = (r: Row) => (r.type === 'ok' ? 'Running' : 'Stopped by the owner');
    const pills = [
      col.accessor('title', { header: 'Title', meta: { pinned: true } }),
      col.accessor('type', { header: 'State', meta: { size: 'fit', fitText: words, fitMetrics: pill }, cell: (c) => <b>{words(c.row.original)}</b> }),
    ];
    render(<DataTable label="Pills" data={data} columns={pills} getRowId={(r) => r.id} />);
    width(1350);
    const want = textWidth(data.map(words), { ...pill, pad: (pill.pad ?? 0) + CELL_PAD, max: 320 }) + EDGE_PAD;
    expect(cols()[1]).toBe(want);
    // The pill's caps, tracking and box make it wider than the same words in the cell font.
    expect(want).toBeGreaterThan(fitWidth(data.map(words)) + EDGE_PAD);
  });

  it('a pill column with short pills still keeps its whole header (the header floor wins over fitMetrics)', () => {
    const data = rows(3);
    const pill = statusPillMetrics(true);
    const label = 'Last known state';
    const pills = [
      col.accessor('title', { header: 'Title', meta: { pinned: true } }),
      col.accessor('type', { header: label, meta: { size: 'fit', fitText: () => 'Up', fitMetrics: pill }, cell: () => <b>Up</b> }),
    ];
    render(<DataTable label="Pills" data={data} columns={pills} getRowId={(r) => r.id} />);
    width(1350);
    const pillOnly = textWidth(['Up'], { ...pill, pad: (pill.pad ?? 0) + CELL_PAD, max: 320 }) + EDGE_PAD;
    expect(headerWidth(label, true)).toBeGreaterThan(pillOnly);
    expect(cols()[1]).toBeGreaterThanOrEqual(headerWidth(label, true));
  });

  it('a fit column that draws its own cell without fitText is a dev error (its value is not what it shows)', () => {
    const bad = [col.accessor('title', { header: 'Title', meta: { pinned: true } }), col.accessor('type', { header: 'Type', meta: { size: 'fit' }, cell: (c) => <i>{c.getValue()}</i> })];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<DataTable label="Bad" data={rows(2)} columns={bad} getRowId={(r) => r.id} />)).toThrow(/fitText/);
  });

  it('empty values and an empty table measure the padding alone, never an error', () => {
    const empty = [col.accessor('title', { header: 'Title', meta: { pinned: true } }), col.accessor('type', { header: 'Type', meta: { size: 'fit' } })];
    render(<DataTable label="Empty" data={[{ id: 'e', title: 'x', message: '', type: '', n: 0 }]} columns={empty} getRowId={(r) => r.id} />);
    width(1350);
    expect(cols()).toHaveLength(2);
    cleanup();
    expect(() => render(<DataTable label="None" data={[]} columns={empty} getRowId={(r) => r.id} />)).not.toThrow();
  });

  it('a new sort never moves the widths (measured in data order)', () => {
    const data = rows(5);
    render(<DataTable label="Inbox" data={data} columns={COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const before = cols();
    fireEvent.click(document.querySelector('thead th:nth-child(3) button')!);
    expect(cols()).toEqual(before);
  });

  it('a fit column with no text to measure is a dev error', () => {
    const bad = [col.accessor('title', { header: 'Title', meta: { pinned: true } }), col.display({ id: 'x', header: 'X', meta: { size: 'fit' }, cell: () => 'x' })];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<DataTable label="Bad" data={rows(2)} columns={bad} getRowId={(r) => r.id} />)).toThrow(/size 'fit'/);
  });
});

/** Make `el` read as cut (its text wider than its box) or not. */
function cutAs(el: Element, isCut: boolean) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => (isCut ? 180 : 100) });
}
const cell = (text: string) => [...document.querySelectorAll('tbody td')].find((td) => td.textContent?.includes(text)) as HTMLElement;

describe('DataTable: cut-off cell tooltip', () => {
  const one = (message: string): Row[] => [{ id: 'r0', title: 'One', message, type: 'ok', n: 1 }];
  const TIP_COLUMNS = [
    col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
    col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: (c) => <span>{c.getValue()}</span> }),
  ];

  it('a cut cell gets its whole shown text as title; one that fits gets none, and loses it once it fits', () => {
    render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A long message');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('A long message that is cut at its end');
    cutAs(td, false);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('the inner box that is cut counts too (a span with its own ellipsis)', () => {
    render(<DataTable label="Inbox" data={one('Inner cut text')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('Inner cut text');
    cutAs(td, false);
    cutAs(td.querySelector('span')!, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('Inner cut text');
  });

  it('a cell holding a program id shows the mask in its title, never the id', () => {
    render(<DataTable label="Inbox" data={one(`started program ${ID} on the box`)} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('started program');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title') ?? '').not.toMatch(/[0-9a-f]{12}/i);
    expect(td.getAttribute('title')).toBe('••••');
  });

  it('a cell with a control gets no title (the control names itself)', () => {
    const withButton = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: (c) => <button type="button">{c.getValue()}</button> }),
    ];
    render(<DataTable label="Inbox" data={one('Press this long button label')} columns={withButton} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('Press this');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('a cut link carries its own tooltip, so its cell gets none', () => {
    render(<DataTable label="Inbox" data={one('https://docs.example.com/a/very/long/path/that/is/cut')} columns={[TIP_COLUMNS[0]!, col.accessor('message', { header: 'Message', meta: { size: 'fill' } })]} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('docs.example.com');
    cutAs(td, false);
    cutAs(td.querySelector('a')!, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('a cut cell that holds a link gets none either, even when the cell itself is the cut box', () => {
    const withLink = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: (c) => <a href="/files/a">{c.getValue()}</a> }),
    ];
    render(<DataTable label="Inbox" data={one('An ordinary link that is cut at its end')} columns={withLink} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('An ordinary link');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  for (const [what, el] of [
    ['a role=link', <span key="link" role="link" tabIndex={0}>A role link whose text is cut at its end</span>],
    ['an element with an ARIA description (its own tooltip)', <span key="described" aria-describedby="tip-1">A described text that is cut at its end</span>],
  ] as const) {
    it(`a cut cell that holds ${what} gets no second tooltip`, () => {
      const cols = [
        col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
        col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: () => el }),
      ];
      render(<DataTable label="Inbox" data={one('x')} columns={cols} getRowId={(r) => r.id} />);
      width(1350);
      const td = cell('whose text is cut') ?? cell('described text');
      cutAs(td, true);
      fireEvent.pointerEnter(td, { pointerType: 'mouse' });
      expect(td.hasAttribute('title')).toBe(false);
    });
  }

  it('a cell that updates on its own (no table render) under a still pointer: the title follows its text', async () => {
    let text = 'A first long text of a live cell';
    const subs = new Set<() => void>();
    const Live = () => <span>{useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => text)}</span>;
    const live = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: () => <Live /> }),
    ];
    render(<DataTable label="Inbox" data={one('x')} columns={live} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A first long text');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('A first long text of a live cell');
    await act(async () => {
      text = 'A second long text of a live cell';
      for (const f of subs) f();
    });
    expect(td.getAttribute('title')).toBe('A second long text of a live cell');
    fireEvent.pointerLeave(td, { pointerType: 'mouse' });
    await act(async () => {
      text = 'A third long text';
      for (const f of subs) f();
    });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('a title another renderer put over the helper\'s own is theirs: never overwritten, never removed', () => {
    render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A long message');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('A long message that is cut at its end');
    td.setAttribute('title', 'Their own title');
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('Their own title');
    fireEvent.pointerLeave(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('Their own title');
  });

  it('a child that becomes an owner during hover (gains aria-describedby) takes the title away', async () => {
    let described = false;
    const subs = new Set<() => void>();
    const Live = () => {
      const on = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => described);
      return <span aria-describedby={on ? 'tip-2' : undefined}>A long text that gains its own description</span>;
    };
    const live = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: () => <Live /> }),
    ];
    render(<DataTable label="Inbox" data={one('x')} columns={live} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('gains its own description');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('A long text that gains its own description');
    await act(async () => {
      described = true;
      for (const f of subs) f();
    });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('unmounting the table during hover, before any resize delivery, disconnects both observers at once', () => {
    const made: { disconnected: boolean }[] = [];
    const RealMO = window.MutationObserver;
    window.MutationObserver = class extends RealMO {
      private rec = { disconnected: false };
      constructor(cb: MutationCallback) {
        super(cb);
        made.push(this.rec);
      }
      override disconnect() {
        this.rec.disconnected = true;
        super.disconnect();
      }
    };
    try {
      const { unmount } = render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
      width(1350);
      const td = cell('A long message');
      cutAs(td, true);
      const before = observers.length;
      const mosBefore = made.length;
      fireEvent.pointerEnter(td, { pointerType: 'mouse' });
      const ros = observers.slice(before);
      const mos = made.slice(mosBefore);
      expect(ros.length).toBeGreaterThan(0);
      expect(mos.length).toBeGreaterThan(0);
      expect(ros.every((o) => o.el !== undefined)).toBe(true);
      unmount();
      // No ResizeObserver callback ran in between: the table's own cleanup stopped them.
      expect(ros.every((o) => o.el === undefined)).toBe(true);
      expect(mos.every((m) => m.disconnected)).toBe(true);
    } finally {
      window.MutationObserver = RealMO;
    }
  });

  it('touch never gets a title (a tap fires pointerenter; a tooltip would only cover)', () => {
    render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A long message');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'touch' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('leaving takes the title away', () => {
    render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A long message');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(true);
    fireEvent.pointerLeave(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('under a still pointer, a resize that makes the text fit takes the title away, and new text updates it', () => {
    const { rerender } = render(<DataTable label="Inbox" data={one('First long message text')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('First long');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('First long message text');
    rerender(<DataTable label="Inbox" data={one('Second long message text')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    expect(td.getAttribute('title')).toBe('Second long message text');
    cutAs(td, false);
    width(2400);
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('an element with its own native title keeps its tooltip (a <time> with the full date)', () => {
    const withTime = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'When', meta: { size: 'fill' }, cell: (c) => <time title="5 November 2026, 17:00">{c.getValue()}</time> }),
    ];
    render(<DataTable label="Inbox" data={one('two hours ago, a long relative time')} columns={withTime} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('two hours ago');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.hasAttribute('title')).toBe(false);
  });

  it('an id split by a newline, a tab or a hidden element still masks the whole title', () => {
    const half = ID.slice(0, 12);
    const rest = ID.slice(12);
    const split = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', {
        header: 'Message',
        meta: { size: 'fill' },
        cell: (c) => (
          <span>
            run {half}
            {c.getValue()}
            <span style={{ display: 'none' }}>{rest}</span>
          </span>
        ),
      }),
    ];
    for (const sep of ['\n', '\t', '']) {
      render(<DataTable label="Inbox" data={one(sep)} columns={split} getRowId={(r) => r.id} />);
      width(1350);
      const td = cell(half);
      cutAs(td, true);
      fireEvent.pointerEnter(td, { pointerType: 'mouse' });
      expect(td.getAttribute('title')).toBe('••••');
      cleanup();
    }
  });

  it('an id joined only once hidden text is left out masks the title too, and no bidi control reaches it', () => {
    const half = ID.slice(0, 12);
    const rest = ID.slice(12);
    const joined = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', {
        header: 'Message',
        meta: { size: 'fill' },
        cell: () => (
          <span>
            run {half}
            <span style={{ display: 'none' }}>x</span>
            {rest}
          </span>
        ),
      }),
    ];
    render(<DataTable label="Inbox" data={one('')} columns={joined} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell(half);
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('••••');
    cleanup();
    const bidi = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', { header: 'Message', meta: { size: 'fill' }, cell: () => <span>{'plain \u202Ewords'}</span> }),
    ];
    render(<DataTable label="Inbox" data={one('')} columns={bidi} getRowId={(r) => r.id} />);
    width(1350);
    const td2 = cell('words');
    cutAs(td2, true);
    fireEvent.pointerEnter(td2, { pointerType: 'mouse' });
    expect(td2.getAttribute('title')).toBe('plain words');
  });

  it('hidden text is left out of the title (what the cell shows, not what it hides)', () => {
    const lead = [
      col.accessor('title', { header: 'Title', meta: { pinned: true, list: 'primary' } }),
      col.accessor('message', {
        header: 'Message',
        meta: { size: 'fill' },
        cell: (c) => (
          <span>
            <span style={{ display: 'none' }}>GET</span>
            {c.getValue()}
          </span>
        ),
      }),
    ];
    render(<DataTable label="Inbox" data={one('A visible long message')} columns={lead} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A visible');
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.getAttribute('title')).toBe('A visible long message');
  });

  it('the title adds no name: the cell reads its own text before and after', () => {
    render(<DataTable label="Inbox" data={one('A long message that is cut at its end')} columns={TIP_COLUMNS} getRowId={(r) => r.id} />);
    width(1350);
    const td = cell('A long message');
    const before = td.textContent;
    cutAs(td, true);
    fireEvent.pointerEnter(td, { pointerType: 'mouse' });
    expect(td.textContent).toBe(before);
    expect(td.hasAttribute('aria-label')).toBe(false);
    expect(td.hasAttribute('aria-describedby')).toBe(false);
    expect(td.hasAttribute('tabindex')).toBe(false);
  });
});
