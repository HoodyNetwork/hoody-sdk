// A manifest names its screens (sub-path patterns below the page's path)
// and the layout each screen other than the page's own takes; definePage refuses a malformed list, and matchScreen reads
// a sub-path against it. The anatomy rule (layout.screens) asks every manifest for `screens` and exempts the sub-path a
// view hands to matchScreen.
import { describe, expect, it } from 'vitest';
import { definePage, matchScreen, type PageManifest, type PageScreen } from '@kit';

const base = {
  id: 'demo',
  path: '/demo',
  title: 'title',
  layout: 'list-detail',
  load: () => Promise.resolve({ default: () => null }),
  status: 'hidden',
  sensitive: false,
  strings: { title: 'Demo' },
} as const satisfies Omit<PageManifest<{ title: string }>, 'screens'>;

const make = (extra: Partial<PageManifest<{ title: string }>>) => () => definePage({ ...base, ...extra });

describe('definePage: screens and subLayouts', () => {
  it('a manifest without screens still loads (the anatomy rule asks for them, the type does not yet)', () => {
    expect(make({})).not.toThrow();
  });

  it('keeps a well-formed list and its subLayouts', () => {
    const screens: PageScreen[] = [
      { id: 'list', path: '' },
      { id: 'item', path: ':id' },
      { id: 'ports', path: ':id/ports' },
      { id: 'new', path: 'new' },
    ];
    const m = make({ screens, subLayouts: { item: 'detail', ports: 'table' } })();
    expect(m.screens).toEqual(screens);
    expect(m.subLayouts).toEqual({ item: 'detail', ports: 'table' });
  });

  it.each([
    ['a bad screen id', [{ id: 'Item', path: ':id' }]],
    ['a repeated screen id', [{ id: 'a', path: '' }, { id: 'a', path: 'x' }]],
    ['a leading slash', [{ id: 'a', path: '/x' }]],
    ['an empty segment', [{ id: 'a', path: 'x//y' }]],
    ['a bad parameter name', [{ id: 'a', path: ':1d' }]],
    ['a repeated parameter name', [{ id: 'a', path: ':id/:id' }]],
    ['two screens of one shape', [{ id: 'a', path: ':id' }, { id: 'b', path: ':name' }]],
    ['two multi-segment screens of one shape', [{ id: 'a', path: ':id/ports' }, { id: 'b', path: ':name/ports' }]],
    ['a segment with characters a path cannot hold', [{ id: 'a', path: 'x y' }]],
  ] as const)('refuses %s', (_n, screens) => {
    expect(make({ screens })).toThrow(/screen/);
  });

  it("refuses an empty list: a page with no sub-paths declares one '' screen", () => {
    expect(make({ screens: [] })).toThrow(/screens is empty/);
    expect(make({ screens: [{ id: 'list', path: '' }] })).not.toThrow();
  });

  it("takes every page layout but 'custom' as a sub-layout", () => {
    const all = ['list-detail', 'table', 'detail', 'settings', 'dashboard', 'wizard', 'canvas'] as const;
    for (const layout of all) expect(make({ screens: [{ id: 'item', path: ':id' }], subLayouts: { item: layout } })).not.toThrow();
  });

  it.each([
    ['subLayouts without screens', undefined, { item: 'detail' }],
    ['a subLayout for a screen the list does not name', [{ id: 'item', path: ':id' }], { other: 'detail' }],
    ['an unknown layout', [{ id: 'item', path: ':id' }], { item: 'sideways' }],
    ["the retired 'custom' layout", [{ id: 'item', path: ':id' }], { item: 'custom' }],
    ['an own key named __proto__', [{ id: 'item', path: ':id' }], JSON.parse('{"__proto__": "detail"}')],
    ['an inherited key (not a plain object)', [{ id: 'item', path: ':id' }], Object.create({ item: 'detail' })],
    // Object.hasOwn coerces its key: a layout value that is not a string is refused before it is read
    ['a layout in an array', [{ id: 'item', path: ':id' }], { item: ['detail'] }],
    ['a boxed string layout', [{ id: 'item', path: ':id' }], { item: new String('detail') }],
    ['an object that turns into a layout name', [{ id: 'item', path: ':id' }], { item: { toString: (): string => 'detail' } }],
  ] as const)('refuses %s', (_n, screens, subLayouts) => {
    expect(make({ screens, subLayouts } as never)).toThrow(/subLayout/);
  });
});

it("subLayouts never take the retired 'custom' layout (a type error, before the runtime check)", () => {
  // @ts-expect-error 'custom' is not a sub-layout
  const bad: PageManifest['subLayouts'] = { item: 'custom' };
  expect(make({ screens: [{ id: 'item', path: ':id' }], subLayouts: bad })).toThrow(/subLayout/);
});

describe('matchScreen', () => {
  const screens: PageScreen[] = [
    { id: 'list', path: '' },
    { id: 'new', path: 'new' },
    { id: 'item', path: ':id' },
    { id: 'ports', path: ':id/ports' },
  ];

  it('the page path is the empty pattern', () => {
    expect(matchScreen([], screens)).toEqual({ id: 'list', params: {} });
  });

  it('reads parameters by name, a whole segment each', () => {
    expect(matchScreen(['abc'], screens)).toEqual({ id: 'item', params: { id: 'abc' } });
    expect(matchScreen(['abc', 'ports'], screens)).toEqual({ id: 'ports', params: { id: 'abc' } });
  });

  it('a literal segment wins over a parameter, whatever the order of the list', () => {
    expect(matchScreen(['new'], screens)).toEqual({ id: 'new', params: {} });
    expect(matchScreen(['new'], [...screens].reverse())).toEqual({ id: 'new', params: {} });
  });

  it('of several matches, the first segment where they differ decides: a literal there wins, in either list order', () => {
    const two: PageScreen[] = [
      { id: 'left', path: 'a/:x/:y' },
      { id: 'right', path: ':x/b/c' },
    ];
    expect(matchScreen(['a', 'b', 'c'], two)?.id).toBe('left');
    expect(matchScreen(['a', 'b', 'c'], [...two].reverse())?.id).toBe('left');
  });

  it('a list definePage would refuse (two of one shape) still answers: the earlier one', () => {
    const dup: PageScreen[] = [
      { id: 'first', path: ':id' },
      { id: 'second', path: ':name' },
    ];
    expect(matchScreen(['x'], dup)).toEqual({ id: 'first', params: { id: 'x' } });
  });

  it('the params are frozen own values', () => {
    const r = matchScreen(['abc'], screens)!;
    expect(Object.isFrozen(r.params)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(r.params, 'id')).toEqual({ value: 'abc', writable: false, enumerable: true, configurable: false });
  });

  it('no screen of that length or shape is null, never the nearest one', () => {
    expect(matchScreen(['abc', 'files'], screens)).toBeNull();
    expect(matchScreen(['abc', 'ports', 'x'], screens)).toBeNull();
    expect(matchScreen(['x'], [{ id: 'list', path: '' }])).toBeNull();
  });

  it('a parameter named like an Object member is an own value, and a segment is taken as given (useSubPath decoded it)', () => {
    const r = matchScreen(['a b'], [{ id: 'item', path: ':constructor' }]);
    expect(r).toEqual({ id: 'item', params: { constructor: 'a b' } });
    expect(Object.hasOwn(r!.params, 'constructor')).toBe(true);
    expect(matchScreen(['toString'], [{ id: 'item', path: ':id' }])?.params.id).toBe('toString');
  });
});
