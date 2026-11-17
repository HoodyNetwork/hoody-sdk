import { describe, expect, it } from 'vitest';
import { arrange, filterItems, groupItems, orderItems, type PickerItem, toggled } from './pickerLogic';

const ITEMS: PickerItem[] = [
  { id: 'a1', label: 'Café Realm', description: 'Paris', facts: '3 computers' },
  { id: 'b2', label: 'Ünits', group: 'Shared' },
  { id: 'c3', label: 'Plain', group: 'Shared', description: 'north south' },
  { id: 'd4', label: 'Last', group: 'Mine' },
];

describe('filterItems', () => {
  it('leaves everything for a blank query', () => {
    expect(filterItems(ITEMS, '   ')).toHaveLength(4);
  });
  it('folds case and accents', () => {
    expect(filterItems(ITEMS, 'CAFE').map((i) => i.id)).toEqual(['a1']);
    expect(filterItems(ITEMS, 'units').map((i) => i.id)).toEqual(['b2']);
  });
  it('wants every word, in any order, over label, description, facts, group and id', () => {
    expect(filterItems(ITEMS, 'south north').map((i) => i.id)).toEqual(['c3']);
    expect(filterItems(ITEMS, 'paris computers').map((i) => i.id)).toEqual(['a1']);
    expect(filterItems(ITEMS, 'shared').map((i) => i.id)).toEqual(['b2', 'c3']);
    expect(filterItems(ITEMS, 'd4').map((i) => i.id)).toEqual(['d4']);
    expect(filterItems(ITEMS, 'paris south')).toEqual([]);
  });
});

describe('orderItems', () => {
  it('puts the first-picked rows on top and keeps the order inside each half', () => {
    expect(orderItems(ITEMS, new Set(['c3', 'a1'])).map((i) => i.id)).toEqual(['a1', 'c3', 'b2', 'd4']);
  });
  it('changes nothing for an empty set', () => {
    expect(orderItems(ITEMS, new Set()).map((i) => i.id)).toEqual(['a1', 'b2', 'c3', 'd4']);
  });
});

describe('groupItems', () => {
  it('puts ungrouped rows first, then groups by first appearance', () => {
    const g = groupItems(ITEMS);
    expect(g.map((x) => x.title)).toEqual([null, 'Shared', 'Mine']);
    expect(g[1]?.rows.map((i) => i.id)).toEqual(['b2', 'c3']);
  });
});

describe('toggled', () => {
  it('single picks the row', () => {
    expect(toggled('single', ['x'], 'y', 0)).toEqual({ next: ['y'], blocked: false });
    expect(toggled('single', ['x'], 'x', 0)).toEqual({ next: ['x'], blocked: false });
  });
  it('multi ticks and unticks', () => {
    expect(toggled('multi', ['x'], 'y', 0)).toEqual({ next: ['x', 'y'], blocked: false });
    expect(toggled('multi', ['x', 'y'], 'x', 0)).toEqual({ next: ['y'], blocked: false });
  });
  it('multi never goes under the minimum', () => {
    expect(toggled('multi', ['x'], 'x', 1)).toEqual({ next: ['x'], blocked: true });
    expect(toggled('multi', ['x', 'y'], 'x', 1)).toEqual({ next: ['y'], blocked: false });
  });
});

describe('arrange', () => {
  const rows: PickerItem[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', group: 'Y' },
    { id: 'c', label: 'C', group: 'X' },
    { id: 'd', label: 'D', group: 'Y' },
  ];
  const flat = (first: string[]) => arrange(rows, new Set(first)).flatMap((g) => g.rows.map((i) => i.id));
  it('without picks: ungrouped first, then groups by first appearance', () => {
    expect(flat([])).toEqual(['a', 'b', 'd', 'c']);
  });
  it('a section holding a picked row comes before the rest, and its picked row leads it', () => {
    expect(flat(['c'])).toEqual(['c', 'a', 'b', 'd']);
    expect(flat(['d'])).toEqual(['d', 'b', 'a', 'c']);
  });
  it('picked in the ungrouped section keeps it on top', () => {
    expect(flat(['a'])).toEqual(['a', 'b', 'd', 'c']);
  });
});
