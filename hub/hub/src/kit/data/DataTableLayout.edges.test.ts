// A row's first cell starts 16 px in and its last ends 16 px in (DataTable.module.css),
// where the fit measure allows 12 a side. The planner gives that 4 px to the 'fit' column drawn first (start) and last
// (end), into its floor and its content, read after drops; a column alone takes both. Other columns take nothing (option B).
import { describe, expect, it } from 'vitest';
import { type ColumnSpec, EDGE_PAD, planColumns, tableFits } from './DataTableLayout';

const EDGES = { start: EDGE_PAD, end: EDGE_PAD };
const DATE = 179;

// Keys > Shared across all realms: Made (fit, default floor), Ends (fit, a measured date floor), Realm, Stop (260).
const SHARED: ColumnSpec[] = [
  { id: 'made', priority: 2, pinned: false, size: 'fit', content: 90 },
  { id: 'ends', priority: 1, pinned: false, size: 'fit', minWidth: DATE, content: 150 },
  { id: 'realm', priority: 1, pinned: false },
  { id: 'stop', priority: 1, pinned: false, width: '260px' },
];

describe('planColumns / tableFits: the edge cells\' padding', () => {
  it('no edges plans exactly as before; zero edges too', () => {
    for (const room of [400, 563, 700, 1200]) {
      expect(planColumns(SHARED, room, {})).toEqual(planColumns(SHARED, room));
      expect(planColumns(SHARED, room, { start: 0, end: 0, lead: 0 })).toEqual(planColumns(SHARED, room));
      expect(tableFits(SHARED, room, 'stop', {})).toBe(tableFits(SHARED, room, 'stop'));
    }
  });

  it('the first fit column takes the start pad in its floor: Made 124, so 4 px less room drops it', () => {
    const all = 124 + DATE + 120 + 260;
    expect(planColumns(SHARED, all, EDGES).dropped).toEqual([]);
    expect(planColumns(SHARED, all - 1, EDGES).dropped).toEqual(['made']);
  });

  it('after a drop the next fit column is first and takes the pad: Ends alone at the front holds its date + 4', () => {
    const room = DATE + 4 + 120 + 260;
    const plan = planColumns(SHARED, room, EDGES);
    expect(plan.visible).toEqual(['ends', 'realm', 'stop']);
    expect(plan.widths.ends).toBe(DATE + 4);
    // The list switch reads the same: Made (the name column, first) + Stop + Ends, the first padded.
    expect(tableFits(SHARED, 124 + 260 + DATE, 'stop', EDGES)).toBe(true);
    expect(tableFits(SHARED, 124 + 260 + DATE - 1, 'stop', EDGES)).toBe(false);
  });

  it('a non-fit column at an edge takes nothing (Stop last, Realm first)', () => {
    const cols: ColumnSpec[] = [{ id: 'realm', priority: 1, pinned: false }, ...SHARED.slice(1, 2), { id: 'stop', priority: 1, pinned: false, width: '260px' }];
    const room = 120 + DATE + 260;
    const plan = planColumns(cols, room, EDGES);
    expect(plan.dropped).toEqual([]);
    expect(plan.widths).toEqual({ realm: 120, ends: DATE, stop: 260 });
  });

  it('a fit column alone takes both pads: Ends only is its date + 8, and the list 1 px below', () => {
    const only: ColumnSpec[] = [SHARED[1]!];
    expect(tableFits(only, DATE + 8, undefined, EDGES)).toBe(true);
    expect(tableFits(only, DATE + 7, undefined, EDGES)).toBe(false);
    expect(planColumns(only, DATE + 8, EDGES).widths.ends).toBe(DATE + 8);
  });

  it('the last fit column takes the end pad, in its floor and its content (Made, Ends with Stop gone)', () => {
    const cols: ColumnSpec[] = SHARED.slice(0, 2);
    expect(tableFits(cols, 124 + DATE + 4, undefined, EDGES)).toBe(true);
    expect(tableFits(cols, 124 + DATE + 3, undefined, EDGES)).toBe(false);
    // Spare room: each grows to its content plus its edge pad, never past it; the rest goes to the first column.
    const wide: ColumnSpec[] = [
      { id: 'a', priority: 1, pinned: false, size: 'fill' },
      { id: 'b', priority: 1, pinned: false, size: 'fit', content: 150 },
    ];
    const plan = planColumns(wide, 600, EDGES);
    expect(plan.widths.b).toBe(150 + 4);
    expect(plan.widths.a).toBe(600 - 154);
  });

  it('a side the checkbox or actions cell holds is 0: no pad there', () => {
    const only: ColumnSpec[] = [SHARED[1]!];
    expect(tableFits(only, DATE + 4, undefined, { start: 0, end: EDGE_PAD })).toBe(true);
    expect(tableFits(only, DATE + 3, undefined, { start: 0, end: EDGE_PAD })).toBe(false);
    expect(tableFits(only, DATE + 4, undefined, { start: EDGE_PAD, end: 0 })).toBe(true);
    expect(tableFits(only, DATE, undefined, { start: 0, end: 0 })).toBe(true);
  });

  it('the lead (a stacked indent, an expand chevron) goes to the first kept fit column\'s content only, after drops', () => {
    const cols: ColumnSpec[] = [
      { id: 'x', priority: 3, pinned: false, size: 'fit', content: 100 },
      { id: 'y', priority: 1, pinned: false, size: 'fit', content: 80 },
      { id: 'z', priority: 1, pinned: false, size: 'fill' },
    ];
    // Room for y and z only: x drops, y is first, its content takes the start pad and the lead.
    const plan = planColumns(cols, 120 + 4 + 120, { start: EDGE_PAD, lead: 36 });
    expect(plan.visible).toEqual(['y', 'z']);
    // y's content is 80 + 4 + 36 = 120 (on the default floor, a fit column starts at its content); the fill takes the rest.
    expect(plan.widths.y).toBe(120);
    const wide = planColumns(cols.slice(1), 800, { start: EDGE_PAD, lead: 136 });
    expect(wide.widths.y).toBe(80 + 4 + 136);
  });

  it('tableFits pads the columns drawn at the ends in column order, not in the order it picks them', () => {
    const cols: ColumnSpec[] = [
      { id: 'a', priority: 2, pinned: false, size: 'fit', content: 50 },
      { id: 'name', priority: 1, pinned: true, size: 'fit', content: 100 },
    ];
    // a (first, start pad) + name (last, end pad): 120 + 4 + 220 + 4.
    expect(tableFits(cols, 348, undefined, EDGES)).toBe(true);
    expect(tableFits(cols, 347, undefined, EDGES)).toBe(false);
  });

  // The planner's drops decide which columns are drawn at the ends, so tableFits asks the
  // planner rather than padding the needed set on its own.
  it('tableFits agrees with the planner when a drop puts a fit column first: no table that has lost its status column', () => {
    const cols: ColumnSpec[] = [
      { id: 'a', priority: 2, pinned: false, size: 'fill' },
      { id: 'b', priority: 1, pinned: false, size: 'fit', content: 50 },
      { id: 'c', priority: 1, pinned: false, size: 'fill' },
      { id: 'd', priority: 1, pinned: false, width: '120px' },
    ];
    // The needed a, b, d have non-fit ends (360), but the planner drops a, then b is first (+4): b, c, d is 364.
    const plan = planColumns(cols, 360, EDGES);
    expect(plan.visible).not.toContain('d');
    expect(tableFits(cols, 360, 'd', EDGES), 'the planner dropped the status column').toBe(false);
    expect(planColumns(cols, 364, EDGES).visible).toEqual(['b', 'c', 'd']);
    expect(tableFits(cols, 364, 'd', EDGES)).toBe(true);
    expect(tableFits(cols, 363, 'd', EDGES)).toBe(false);
    // Without edges, the floors alone, as before: a, b, d fit 360 and the planner keeps b, c, d.
    expect(tableFits(cols, 360, 'd')).toBe(true);
    expect(planColumns(cols, 360).visible).toEqual(['b', 'c', 'd']);
  });

  it('tableFits agrees with the planner when a drop takes the fit column off an end: the survivors that fit are a table', () => {
    // Shared across all realms with Stop hidden: Made (fit) first, Ends, Can, Realm. Needed: Made and Ends (124 + 183 =
    // 307 if they were drawn alone), but the planner drops Can, then Made, and keeps Ends (first, +4) and Realm: 303.
    const cols: ColumnSpec[] = [SHARED[0]!, SHARED[1]!, { id: 'can', priority: 3, pinned: false }, SHARED[2]!];
    expect(planColumns(cols, 303, EDGES).visible).toEqual(['ends', 'realm']);
    expect(tableFits(cols, 303, undefined, EDGES)).toBe(true);
    expect(tableFits(cols, 302, undefined, EDGES)).toBe(false);
  });

  // Each condition of the padded rule on its own.
  it('tableFits keeps the status column when it is also the first column (the name fallback): no table without it', () => {
    const cols: ColumnSpec[] = [
      { id: 'status', priority: 2, pinned: false, size: 'fit', minWidth: 300 },
      { id: 'a', priority: 1, pinned: false, size: 'fill' },
      { id: 'b', priority: 1, pinned: false, size: 'fill' },
    ];
    // The planner drops status (priority 2) and keeps a and b at 240: the count passes, the status column is gone.
    expect(planColumns(cols, 240, EDGES).visible).toEqual(['a', 'b']);
    expect(tableFits(cols, 240, 'status', EDGES)).toBe(false);
    // Its own floor and pads (300 + 4 + 120 + 120): the planner keeps it, and the table fits.
    expect(planColumns(cols, 544, EDGES).visible).toEqual(['status', 'a', 'b']);
    expect(tableFits(cols, 544, 'status', EDGES)).toBe(true);
  });

  it('tableFits refuses a plan that dropped a distinct status column even when enough other columns survive', () => {
    const cols: ColumnSpec[] = [
      { id: 'name', priority: 1, pinned: true, size: 'fit', content: 50 },
      { id: 'a', priority: 1, pinned: false },
      { id: 'b', priority: 1, pinned: false },
      { id: 's', priority: 3, pinned: false },
    ];
    // At 464 the planner drops s (priority 3) and keeps name (pinned 220 + the start pad 4), a and b (120 each): three
    // columns, more than the needed set (name and s), so only the status check refuses.
    expect(planColumns(cols, 464, EDGES).visible).toEqual(['name', 'a', 'b']);
    expect(tableFits(cols, 464, 's', EDGES)).toBe(false);
    expect(tableFits(cols, 464, undefined, EDGES)).toBe(true);
  });

  it('tableFits refuses survivors whose padded floors pass the room (a pinned column the planner cannot drop)', () => {
    const cols: ColumnSpec[] = [{ id: 'name', priority: 1, pinned: true, size: 'fit', minWidth: 200 }];
    // Alone, it takes both pads: 208. The planner keeps it at any room.
    expect(planColumns(cols, 207, EDGES).visible).toEqual(['name']);
    expect(tableFits(cols, 207, undefined, EDGES)).toBe(false);
    expect(tableFits(cols, 208, undefined, EDGES)).toBe(true);
  });
});
