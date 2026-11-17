import { describe, expect, it } from 'vitest';
import { compareValues, facetCounts, fold, formatFilter, matchesSearch, optionsFromRows, parseFilter, passesFilter, runPipeline, sortRows } from './DataTableViewLogic';

describe('search', () => {
  it('folds case and accents', () => {
    expect(fold('Ünïcode Café ÅSA')).toBe('unicode cafe asa');
    expect(matchesSearch(['Café Noir'], 'cafe')).toBe(true);
    expect(matchesSearch(['cafe noir'], 'CAFÉ')).toBe(true);
  });
  it('needs every word, in any order, across fields', () => {
    expect(matchesSearch(['atlas', 'Singapore'], 'sing atl')).toBe(true);
    expect(matchesSearch(['atlas', 'Singapore'], 'atlas frankfurt')).toBe(false);
    expect(matchesSearch(['atlas', null, undefined, 42], '42')).toBe(true);
  });
  it('matches everything on an empty query', () => {
    expect(matchesSearch([], '   ')).toBe(true);
  });
  it('never matches across two fields joined', () => {
    expect(matchesSearch(['ab', 'cd'], 'bc')).toBe(false);
  });
});

describe('filters in the URL', () => {
  it('parses and formats single, multi and range', () => {
    expect(parseFilter('single', 'running')).toEqual({ kind: 'single', value: 'running' });
    expect(parseFilter('multi', 'a,b,,a')).toEqual({ kind: 'multi', values: ['a', 'b'] });
    expect(parseFilter('range', '2..8')).toEqual({ kind: 'range', min: 2, max: 8 });
    expect(parseFilter('range', '2..')).toEqual({ kind: 'range', min: 2, max: undefined });
    expect(parseFilter('range', '..8')).toEqual({ kind: 'range', min: undefined, max: 8 });
    expect(parseFilter('range', '8..2')).toEqual({ kind: 'range', min: 2, max: 8 });
    expect(formatFilter({ kind: 'range', min: 2 })).toBe('2..');
    expect(formatFilter({ kind: 'multi', values: ['a', 'b'] })).toBe('a,b');
    expect(formatFilter({ kind: 'multi', values: [] })).toBeUndefined();
  });
  it('reads malformed values as no filter', () => {
    expect(parseFilter('range', 'abc')).toBeUndefined();
    expect(parseFilter('range', '..')).toBeUndefined();
    expect(parseFilter('single', '')).toBeUndefined();
    expect(parseFilter('multi', ',,')).toBeUndefined();
  });
  it('passes rows by kind', () => {
    expect(passesFilter('running', { kind: 'single', value: 'running' })).toBe(true);
    expect(passesFilter(['a', 'b'], { kind: 'single', value: 'b' })).toBe(true);
    expect(passesFilter('c', { kind: 'multi', values: ['a', 'b'] })).toBe(false);
    expect(passesFilter(['x', 'b'], { kind: 'multi', values: ['a', 'b'] })).toBe(true);
    expect(passesFilter(4, { kind: 'range', min: 2, max: 8 })).toBe(true);
    expect(passesFilter(8, { kind: 'range', max: 8 })).toBe(true);
    expect(passesFilter(9, { kind: 'range', max: 8 })).toBe(false);
    expect(passesFilter(undefined, { kind: 'range', min: 0 })).toBe(false);
    expect(passesFilter(undefined, undefined)).toBe(true);
  });
});

describe('sort', () => {
  it('orders naturally and keeps empty values last both ways', () => {
    const rows = ['web-10', '', 'web-2', 'Web-1', undefined] as const;
    expect(sortRows(rows, (r) => r, false)).toEqual(['Web-1', 'web-2', 'web-10', '', undefined]);
    expect(sortRows(rows, (r) => r, true)).toEqual(['web-10', 'web-2', 'Web-1', '', undefined]);
  });
  it('compares numbers and dates by value and is stable', () => {
    expect(compareValues(9, 10)).toBeLessThan(0);
    expect(compareValues(new Date(2), new Date(1))).toBeGreaterThan(0);
    const rows = [
      { k: 1, n: 'a' },
      { k: 1, n: 'b' },
      { k: 0, n: 'c' },
    ];
    expect(sortRows(rows, (r) => r.k, false).map((r) => r.n)).toEqual(['c', 'a', 'b']);
  });
});

describe('pipeline', () => {
  const rows = [
    { name: 'atlas', state: 'running', ram: 8, realms: ['p'] },
    { name: 'borealis', state: 'running', ram: 4, realms: ['a'] },
    { name: 'cedar', state: 'stopped', ram: 4, realms: ['p', 'a'] },
    { name: 'Dune', state: 'creating', ram: 2, realms: ['l'] },
  ];
  const spec = {
    search: (r: (typeof rows)[number]) => [r.name, r.state],
    filters: [
      { id: 'state', value: (r: (typeof rows)[number]) => r.state },
      { id: 'realm', value: (r: (typeof rows)[number]) => r.realms },
      { id: 'ram', value: (r: (typeof rows)[number]) => r.ram },
    ],
    sortValue: (id: string) => (id === 'ram' ? (r: (typeof rows)[number]) => r.ram : (r: (typeof rows)[number]) => r.name),
  };
  it('searches, filters and sorts together', () => {
    expect(runPipeline(rows, spec, { q: 'RUN', filters: {} }).map((r) => r.name)).toEqual(['atlas', 'borealis']);
    expect(runPipeline(rows, spec, { filters: { realm: { kind: 'multi', values: ['a'] } }, sort: { id: 'name', desc: true } }).map((r) => r.name)).toEqual(['cedar', 'borealis']);
    expect(runPipeline(rows, spec, { filters: { ram: { kind: 'range', max: 4 } }, sort: { id: 'ram', desc: false } }).map((r) => r.name)).toEqual(['Dune', 'borealis', 'cedar']);
  });
  it('lists options with counts', () => {
    expect(optionsFromRows(rows, (r) => r.realms)).toEqual([
      { value: 'a', count: 2 },
      { value: 'l', count: 1 },
      { value: 'p', count: 2 },
    ]);
  });
  it('counts each option against the search and every other filter, never its own', () => {
    const state = { q: 'a', filters: { state: { kind: 'single', value: 'stopped' } as const, ram: { kind: 'range', max: 4 } as const } };
    // q 'a' keeps atlas, borealis, cedar and Dune (state 'creating'); ram <= 4 drops atlas; state is not applied to its own counts.
    expect(Object.fromEntries(facetCounts(rows, spec, state, 'state'))).toEqual({ running: 1, stopped: 1, creating: 1 });
    // realm counts see the state filter too: only cedar is left.
    expect(Object.fromEntries(facetCounts(rows, spec, state, 'realm'))).toEqual({ p: 1, a: 1 });
    expect(facetCounts(rows, spec, state, 'nope').size).toBe(0);
  });
});
