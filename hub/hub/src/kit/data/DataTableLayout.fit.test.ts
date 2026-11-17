// "Measured columns + tooltip": 'fit' columns take their content's width and no more, a 'fill'
// column takes the rest, the widths still add up to the room (no fixed table width), and nothing changes for a table
// that declares no size.
import { describe, expect, it } from 'vitest';
import { type ColumnSpec, CELL_PAD, FIT_MAX, FIT_ROWS, columnFloor, fitWidth, planColumns, tableFits } from './DataTableLayout';

const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

// An inbox: Message is the long text, Type and When are short.
const INBOX: ColumnSpec[] = [
  { id: 'title', priority: 1, pinned: true, size: 'fit', content: 180 },
  { id: 'message', priority: 2, pinned: false, size: 'fill' },
  { id: 'type', priority: 3, pinned: false, size: 'fit', content: 84 },
  { id: 'when', priority: 2, pinned: false, size: 'fit', content: 96 },
];

describe('planColumns: fit and fill', () => {
  it('fit columns take their content, the fill column the rest, and the sum is the room', () => {
    for (const room of [1350, 2400]) {
      const plan = planColumns(INBOX, room);
      expect(plan.dropped).toEqual([]);
      expect(plan.widths.type).toBe(84);
      expect(plan.widths.when).toBe(96);
      expect(sum(plan.widths)).toBe(room);
      expect(plan.widths.message).toBeGreaterThan(Math.max(plan.widths.type ?? 0, plan.widths.when ?? 0, plan.widths.title ?? 0));
    }
  });

  it('the pinned fit column keeps its 220 floor even when its content is shorter', () => {
    expect(planColumns(INBOX, 1350).widths.title).toBe(220);
  });

  it('a fit column never grows past its content while a fill column can take the rest', () => {
    const plan = planColumns(INBOX, 4000);
    expect(plan.widths.type).toBe(84);
    expect(plan.widths.message).toBe(4000 - 220 - 84 - 96);
  });

  it('with too little spare, the narrowest gaps close first and the rest share what is left', () => {
    const cols: ColumnSpec[] = [
      { id: 'a', priority: 1, pinned: false, size: 'fit', content: 130 },
      { id: 'b', priority: 1, pinned: false, size: 'fit', content: 300 },
      { id: 'c', priority: 1, pinned: false, size: 'fit', content: 300 },
    ];
    // Floors 120 each = 360; spare 100: a's gap (10) closes, b and c split the other 90.
    const plan = planColumns(cols, 460);
    expect(plan.widths.a).toBe(130);
    expect(plan.widths.b).toBe(165);
    expect(sum(plan.widths)).toBe(460);
  });

  it('fit columns are served before the fill column', () => {
    // At the floors (220 + 3 x 120) nothing drops; type and when take their content, and what their floors leave goes to message.
    const plan = planColumns(INBOX, 220 + 120 + 120 + 120);
    expect(plan.widths.type).toBe(84);
    expect(plan.widths.when).toBe(96);
    expect(plan.widths.message).toBe(120 + (120 - 84) + (120 - 96));
  });

  it('without a fill column the spare goes to the unsized columns, as before', () => {
    const plan = planColumns(
      [
        { id: 'name', priority: 1, pinned: true },
        { id: 'type', priority: 2, pinned: false, size: 'fit', content: 80 },
      ],
      1000,
    );
    expect(plan.widths.type).toBe(80);
    expect(plan.widths.name).toBe(920);
  });

  it('a table of fit columns only still fills the room: its first column takes the rest, as an all-fixed table does', () => {
    const plan = planColumns(
      [
        { id: 'a', priority: 1, pinned: false, size: 'fit', content: 100 },
        { id: 'b', priority: 1, pinned: false, size: 'fit', content: 100 },
      ],
      600,
    );
    expect(sum(plan.widths)).toBe(600);
  });

  it('a fit column keeps the default floor whatever its content (drop and list-switch points never move), its header too', () => {
    for (const content of [0, 60, 119, 120, 400]) expect(columnFloor({ id: 't', priority: 2, pinned: false, size: 'fit', content })).toBe(120);
    expect(columnFloor({ id: 't', priority: 2, pinned: false, size: 'fit', content: 60, headerMin: 140 })).toBe(140);
    // A declared minWidth wins: the one way a page lowers a fit column's floor.
    expect(columnFloor({ id: 't', priority: 2, pinned: false, size: 'fit', content: 60, minWidth: 100 })).toBe(100);
  });

  it('loaded text never changes tableFits or what drops', () => {
    const at = (content: number): ColumnSpec[] => [
      { id: 'name', priority: 1, pinned: true },
      { id: 'other', priority: 2, pinned: false },
      { id: 'status', priority: 2, pinned: false, size: 'fit', content },
    ];
    for (const room of [400, 440, 459, 460, 500]) {
      const want = tableFits(at(120), room, 'status');
      for (const content of [0, 40, 80, 119, 300]) {
        expect(tableFits(at(content), room, 'status'), `${room}/${content}`).toBe(want);
        expect(planColumns(at(content), room).dropped, `${room}/${content}`).toEqual(planColumns(at(120), room).dropped);
      }
    }
    expect(tableFits(at(80), 440, 'status')).toBe(false);
  });

  it('a short fit column on the default floor still takes just its content; the rest of its floor goes to the fill column', () => {
    const plan = planColumns(INBOX, 1350);
    expect(plan.widths.type).toBe(84);
    expect(sum(plan.widths)).toBe(1350);
  });

  it('the rounding pixel goes to a fit column still below its content, never to one already at it', () => {
    const cols: ColumnSpec[] = [
      { id: 'a', priority: 1, pinned: false, size: 'fit', content: 130 },
      { id: 'b', priority: 1, pinned: false, size: 'fit', content: 300 },
      { id: 'c', priority: 1, pinned: false, size: 'fit', content: 300 },
    ];
    const plan = planColumns(cols, 461);
    expect(plan.widths.a).toBe(130);
    expect((plan.widths.b ?? 0) + (plan.widths.c ?? 0)).toBe(331);
    expect(sum(plan.widths)).toBe(461);
  });

  it('several leftover pixels go out one at a time, round-robin, never past a target', () => {
    const four: ColumnSpec[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, priority: 1, pinned: false, size: 'fit', content: 130 }));
    const plan = planColumns(four, 519);
    expect(['a', 'b', 'c', 'd'].map((id) => plan.widths[id])).toEqual([130, 130, 130, 129]);
    const three: ColumnSpec[] = [
      { id: 'a', priority: 1, pinned: false, size: 'fit', content: 130 },
      { id: 'b', priority: 1, pinned: false, size: 'fit', content: 300 },
      { id: 'c', priority: 1, pinned: false, size: 'fit', content: 300 },
    ];
    expect(planColumns(three, 461).widths).toEqual({ a: 130, b: 166, c: 165 });
  });

  it('property: no fit column ever passes its content while another fit column is still below its own, and the sum is the room', () => {
    // A seeded generator: the same 4000 tables every run.
    let seed = 0x5eed1105;
    const rnd = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % n;
    };
    for (let run = 0; run < 4000; run++) {
      // Every second table is tight: fit columns only, few distinct contents, a room just under their total, so
      // water-filling leaves several columns on one fractional level and flooring leaves several pixels to hand out
      // (an earlier rounding failed 40 of these).
      const tight = run % 2 === 1;
      const n = (tight ? 2 : 1) + rnd(tight ? 5 : 6);
      const cols: ColumnSpec[] = Array.from({ length: n }, (_, i) => {
        if (tight) return { id: `c${i}`, priority: 1, pinned: false, size: 'fit', content: 120 + 10 * rnd(3) };
        const kind = rnd(4);
        const c: ColumnSpec = { id: `c${i}`, priority: 1 + rnd(4), pinned: i === 0 && rnd(3) === 0 };
        if (kind < 3) Object.assign(c, { size: 'fit', content: 20 + rnd(300) });
        else if (rnd(2) === 0) c.size = 'fill';
        if (rnd(5) === 0) c.minWidth = 40 + rnd(200);
        return c;
      });
      const need = cols.reduce((t, c) => t + Math.max(c.content ?? 0, columnFloor(c)), 0);
      const room = (tight ? need - 1 - rnd(n * 4) : 100 + rnd(2400)) + (rnd(2) === 0 ? 0.5 : 0);
      const plan = planColumns(cols, room);
      const fits = cols.filter((c) => c.size === 'fit' && plan.visible.includes(c.id));
      // A fit column's target: its content, or its own floor when that floor is declared (minWidth) or pinned (220).
      const target = (c: ColumnSpec) => (c.minWidth !== undefined || c.pinned ? Math.max(c.content ?? 0, columnFloor(c)) : (c.content ?? 0));
      const over = fits.some((c) => (plan.widths[c.id] ?? 0) > target(c));
      const under = fits.some((c) => (plan.widths[c.id] ?? 0) <= (c.content ?? 0) - 1);
      expect(over && under, JSON.stringify({ cols, room, w: plan.widths })).toBe(false);
      // (A lone unpinned column wider than the room is dropped, leaving nothing: the older rule, not judged here.)
      if (plan.visible.length > 0 && room >= plan.visible.reduce((t, id) => t + columnFloor(cols.find((c) => c.id === id)!), 0)) {
        expect(sum(plan.widths), JSON.stringify({ cols, room })).toBe(Math.floor(room));
      }
    }
  });

  it('drops by priority as before when even the floors do not fit, and the list switch reads the same floors', () => {
    // The floors read 120 for every unpinned column, short content or not.
    const plan = planColumns(INBOX, 220 + 120 + 120 + 10);
    expect(plan.dropped).toEqual(['type']);
    expect(tableFits(INBOX, 220 + 120 + 96)).toBe(true);
    expect(tableFits(INBOX, 300)).toBe(false);
  });

  it('a column moved to fit keeps its declared px width or minWidth as its floor (same drop and list-switch points)', () => {
    expect(columnFloor({ id: 'when', priority: 2, pinned: false, width: '112px', size: 'fit', content: 60 })).toBe(112);
    expect(columnFloor({ id: 'when', priority: 2, pinned: false, minWidth: 90, size: 'fit', content: 400 })).toBe(90);
    const old: ColumnSpec[] = [
      { id: 'name', priority: 1, pinned: true },
      { id: 'type', priority: 3, pinned: false, width: '100px' },
      { id: 'when', priority: 2, pinned: false, width: '112px' },
    ];
    const moved = old.map((c) => (c.pinned ? c : { ...c, size: 'fit' as const, content: 80 }));
    for (const room of [300, 400, 432, 500]) {
      expect(planColumns(moved, room).dropped).toEqual(planColumns(old, room).dropped);
      expect(tableFits(moved, room, 'when')).toBe(tableFits(old, room, 'when'));
    }
  });

  it('a fit column wider in content than its px floor grows to its content', () => {
    const plan = planColumns(
      [
        { id: 'name', priority: 1, pinned: true },
        { id: 'type', priority: 2, pinned: false, width: '100px', size: 'fit', content: 150 },
      ],
      1000,
    );
    expect(plan.widths.type).toBe(150);
    expect(plan.widths.name).toBe(850);
  });

  it('the pinned column in a room smaller than its floor takes the room, as before (no hscroll is added)', () => {
    const plan = planColumns([{ id: 'name', priority: 1, pinned: true, size: 'fill' }, { id: 'x', priority: 2, pinned: false, size: 'fit', content: 80 }], 100);
    expect(plan.visible).toEqual(['name']);
    expect(plan.widths.name).toBe(100);
  });

  it('grow: 0 everywhere shares the spare evenly instead of losing it', () => {
    const plan = planColumns(
      [
        { id: 'a', priority: 1, pinned: false, grow: 0 },
        { id: 'b', priority: 1, pinned: false, grow: 0 },
      ],
      500,
    );
    expect(plan.widths).toEqual({ a: 250, b: 250 });
  });

  it('the rounding remainder never lands on a fit column', () => {
    const plan = planColumns(
      [
        { id: 'a', priority: 1, pinned: false, size: 'fit', content: 300 },
        { id: 'b', priority: 1, pinned: false, size: 'fill' },
        { id: 'c', priority: 1, pinned: false, size: 'fill' },
      ],
      1001,
    );
    expect(plan.widths.a).toBe(300);
    expect(sum(plan.widths)).toBe(1001);
  });

  it("an explicit 'fixed' on a px column plans exactly as no size", () => {
    const old: ColumnSpec[] = [
      { id: 'name', priority: 1, pinned: true },
      { id: 'a', priority: 2, pinned: false, width: '140px' },
      { id: 'b', priority: 3, pinned: false, width: '96px' },
      { id: 'c', priority: 2, pinned: false, width: '20%' },
    ];
    const fixed = old.map((c) => (c.width?.endsWith('px') ? { ...c, size: 'fixed' as const } : c));
    for (const room of [500, 900, 1350, 2400]) expect(planColumns(fixed, room)).toEqual(planColumns(old, room));
  });
});

describe('fitWidth: measured from the data', () => {
  it('is the widest text plus the cell padding, capped', () => {
    const short = fitWidth(['ab']);
    const long = fitWidth(['ab', 'a much longer piece of text']);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(CELL_PAD);
    expect(fitWidth(['x'.repeat(500)])).toBe(FIT_MAX);
    expect(fitWidth(['x'.repeat(500)], { max: 200 })).toBe(200);
  });

  it('adds the extra width of an icon or dot beside the text', () => {
    expect(fitWidth(['ok'], { extra: 20 })).toBe(fitWidth(['ok']) + 20);
  });

  it('reads at most FIT_ROWS texts', () => {
    const many = Array.from({ length: FIT_ROWS }, () => 'a');
    expect(fitWidth([...many, 'x'.repeat(40)])).toBe(fitWidth(many));
  });

  it('nothing to measure is the padding alone', () => {
    expect(fitWidth([])).toBe(CELL_PAD);
    expect(fitWidth(['', ''])).toBe(CELL_PAD);
  });
});
