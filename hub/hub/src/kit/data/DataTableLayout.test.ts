import { describe, expect, it } from 'vitest';
import { type ColumnSpec, columnFloor, formatSort, headerWidth, pageSlice, parseSort, planColumns, planList, tableFits } from './DataTableLayout';

// Kind 2, Name 1, Location 1, CPU 4, Cores 2, RAM 2,
// Disk 3, Delivery 3, From 1.
const MARKET: ColumnSpec[] = [
  { id: 'kind', priority: 2, pinned: false, width: '96px' },
  { id: 'name', priority: 1, pinned: true },
  { id: 'location', priority: 1, pinned: false, width: '140px' },
  { id: 'cpu', priority: 4, pinned: false, width: '140px' },
  { id: 'cores', priority: 2, pinned: false, width: '72px', headerMin: 76 },
  { id: 'ram', priority: 2, pinned: false, width: '72px' },
  { id: 'disk', priority: 3, pinned: false, width: '88px' },
  { id: 'delivery', priority: 3, pinned: false, width: '110px' },
  { id: 'from', priority: 1, pinned: false, width: '96px' },
];

describe('planColumns', () => {
  it('keeps every column when they fit and fills the room exactly', () => {
    const plan = planColumns(MARKET, 1400);
    expect(plan.visible).toHaveLength(9);
    expect(plan.dropped).toEqual([]);
    expect(Object.values(plan.widths).reduce((a, b) => a + b, 0)).toBe(1400);
    // The flexible name column takes the spare room.
    expect(plan.widths.name).toBeGreaterThan(220);
  });

  it('drops one column at a time, lowest priority and rightmost first', () => {
    // Floors: 96+220+140+140+76+72+88+110+96 = 1038. 900 must lose 138+: CPU (p4) alone does it.
    expect(planColumns(MARKET, 900).dropped).toEqual(['cpu']);
    // 700 (a side-mode table): CPU, then Delivery (p3, rightmost), then Disk.
    const plan = planColumns(MARKET, 700);
    expect(plan.dropped).toEqual(['cpu', 'delivery', 'disk']);
    expect(plan.visible).toEqual(['kind', 'name', 'location', 'cores', 'ram', 'from']);
  });

  it('gives up priority-1 columns last and never the pinned one', () => {
    const plan = planColumns(MARKET, 300);
    expect(plan.visible).toContain('name');
    expect(plan.dropped.indexOf('location')).toBeGreaterThan(plan.dropped.indexOf('kind'));
  });

  it('never cuts a header: the floor is at least the header width', () => {
    expect(columnFloor({ id: 'cores', priority: 2, pinned: false, width: '48px', headerMin: 76 })).toBe(76);
    const plan = planColumns(MARKET, 1038);
    expect(plan.widths.cores).toBeGreaterThanOrEqual(76);
  });

  it('keeps the pinned column at 220 or more while anything else shows', () => {
    for (const room of [500, 640, 800, 1000]) {
      const plan = planColumns(MARKET, room);
      if (plan.visible.length > 1) expect(plan.widths.name).toBeGreaterThanOrEqual(220);
    }
  });

  it('grows percentage columns toward their share before flexible ones', () => {
    const plan = planColumns(
      [
        { id: 'a', priority: 1, pinned: true },
        { id: 'b', priority: 2, pinned: false, width: '30%' },
      ],
      1000,
    );
    expect(plan.widths.b).toBe(300);
    expect(plan.widths.a).toBe(700);
  });

  it('shows everything before the width is known', () => {
    expect(planColumns(MARKET, Number.POSITIVE_INFINITY).visible).toHaveLength(9);
  });
});

describe('headerWidth', () => {
  it('grows with the label and the sort icon', () => {
    expect(headerWidth('Cores', true)).toBeGreaterThan(headerWidth('Cores', false));
    expect(headerWidth('Last result', false)).toBeGreaterThan(headerWidth('On', false));
  });
});

describe('planList', () => {
  it('uses the pinned column, the status column and the next values by priority', () => {
    const l = planList([
      { id: 'name', role: undefined, priority: 1, pinned: true },
      { id: 'realm', role: undefined, priority: 3, pinned: false },
      { id: 'server', role: undefined, priority: 2, pinned: false },
      { id: 'state', role: 'status', priority: 1, pinned: false },
      { id: 'actions', role: false, priority: 1, pinned: false },
    ]);
    expect(l).toEqual({ lead: undefined, primary: 'name', status: 'state', meta: ['server', 'realm'] });
  });

  it('follows explicit roles: primary, lead and meta in their order', () => {
    const l = planList([
      { id: 'dot', role: 'lead', priority: 1, pinned: false },
      { id: 'kind', role: 'meta', priority: 3, pinned: false },
      { id: 'title', role: 'primary', priority: 1, pinned: false },
      { id: 'msg', role: 'meta', priority: 2, pinned: false },
      { id: 'when', role: 'status', priority: 1, pinned: false },
      { id: 'other', role: undefined, priority: 1, pinned: false },
    ]);
    expect(l).toEqual({ lead: 'dot', primary: 'title', status: 'when', meta: ['kind', 'msg'] });
  });

  it('keeps at most three meta values', () => {
    const cols = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, role: undefined, priority: 2, pinned: i === 0 }));
    expect(planList(cols).meta).toEqual(['b', 'c', 'd']);
  });
});

describe('sort in the URL', () => {
  const known = new Set(['name', 'size']);
  it('reads and writes name / -name', () => {
    expect(parseSort('-size', known)).toEqual([{ id: 'size', desc: true }]);
    expect(parseSort('name', known)).toEqual([{ id: 'name', desc: false }]);
    expect(formatSort([{ id: 'size', desc: true }])).toBe('-size');
    expect(formatSort([])).toBeUndefined();
  });
  it('ignores an unknown column', () => {
    expect(parseSort('-bogus', known)).toEqual([]);
  });
});

describe('pageSlice', () => {
  it('slices and clamps', () => {
    expect(pageSlice(312, 50, 1)).toEqual({ page: 1, pages: 7, start: 0, end: 50 });
    expect(pageSlice(312, 50, 7)).toEqual({ page: 7, pages: 7, start: 300, end: 312 });
    expect(pageSlice(312, 50, 99).page).toBe(7);
    expect(pageSlice(0, 50, 3)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
  });
});

describe('tableFits (list switch on fit)', () => {
  const cols: ColumnSpec[] = [
    { id: 'name', priority: 1, pinned: true },
    { id: 'state', priority: 1, pinned: false, width: '120px' },
    { id: 'server', priority: 2, pinned: false, width: '170px' },
    { id: 'created', priority: 3, pinned: false, width: '140px' },
  ];
  it('stays a table while name, status and the next column fit', () => {
    expect(tableFits(cols, 220 + 120 + 170, 'state')).toBe(true);
    expect(tableFits(cols, 220 + 120 + 169, 'state')).toBe(false);
  });
  it('a narrow three-column table in Settings stays a table at 570', () => {
    const three: ColumnSpec[] = [
      { id: 'name', priority: 1, pinned: true },
      { id: 'kind', priority: 2, pinned: false, width: '100px' },
      { id: 'added', priority: 2, pinned: false, width: '120px' },
    ];
    expect(tableFits(three, 570)).toBe(true);
  });
  it('without a status column takes the next two by priority', () => {
    expect(tableFits(cols, 220 + 120 + 1)).toBe(true);
    expect(tableFits(cols, 300)).toBe(false);
    expect(tableFits([], 10)).toBe(true);
    expect(tableFits(cols, Number.POSITIVE_INFINITY)).toBe(true);
  });
});
