// Selector kinds the cascade (css-table.ts) decides from the translated table: `:is()` / `:where()` lists and child
// rules whose subject sits several compounds below the nearest class. Real CSS text through the translator, then the
// resolver against an element and its ancestors.
import { describe, expect, test } from 'bun:test';
import { translateModule } from '../../../scripts/term/css-translate/module';
import { envFor, WIDTH_CLASSES } from '../../../scripts/term/css-translate/queries';
import type { Table } from '../../../scripts/term/css-translate/types';
import { resolverFor } from './css-table';
import type { ElementInfo, StyleFrame, StyleResolver, TermStyle } from './style';

const M = 'pages/x/x.module.css';
const id = (n: string): string => `${M}#${n}`;
function resolver(css: string): StyleResolver {
  const r = translateModule(M, css, envFor(WIDTH_CLASSES.wide!), { get: () => undefined });
  return resolverFor({ version: 1, generated: '', widthClass: WIDTH_CLASSES.wide!, unitModel: {}, modules: { [M]: r.exports }, classes: Object.fromEntries(r.entries.map((e) => [e.id, e])) } as Table);
}
/** `tag.class[attr]` → an element; classes are module classes of M. */
function el(spec: string, place?: [number, number]): ElementInfo {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/.exec(spec)!;
  const attrs: Record<string, string> = {};
  for (const a of m[3]!.matchAll(/\[([\w-]+)\]/g)) attrs[a[1]!] = '';
  return { tag: m[1] || 'div', classes: m[2]!.split('.').filter(Boolean).map(id), attrs, empty: false, ...(place ? { index: place[0], count: place[1] } : {}) };
}
/** Style of the last element of `specs` (outermost first), every ancestor resolved first as dom.ts does. */
function styleAt(r: StyleResolver, ...specs: Array<string | ElementInfo>): TermStyle | undefined {
  let chain: StyleFrame[] = [];
  let st: TermStyle | undefined;
  for (const s of specs) {
    const info = typeof s === 'string' ? el(s) : s;
    st = r(info, chain);
    chain = [{ info, childRules: st?.childRules ?? [] }, ...chain];
  }
  return st;
}
const raw = (st: TermStyle | undefined): Record<string, unknown> => (st?.box?.raw ?? {}) as Record<string, unknown>;

describe(':is() / :where() lists', () => {
  test('on the subject: any alternative applies the rule, none leaves the base', () => {
    const r = resolver('.x { width: 80px } .x:is(.a, [data-b]) { width: 160px }');
    expect(raw(styleAt(r, 'div.x')).width).toBe(10);
    expect(raw(styleAt(r, 'div.x.a')).width).toBe(20);
    expect(raw(styleAt(r, 'div.x[data-b]')).width).toBe(20);
    expect(raw(styleAt(r, 'div.x[data-c]')).width).toBe(10);
  });
  test('as a class-less subject: the children that match one alternative', () => {
    const r = resolver('.wrap > :is(a, button) { width: 160px }');
    expect(raw(styleAt(r, 'div.wrap', 'a')).width).toBe(20);
    expect(raw(styleAt(r, 'div.wrap', 'button')).width).toBe(20);
    expect(raw(styleAt(r, 'div.wrap', 'span')).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.wrap', 'div', 'a')).width).toBeUndefined();
  });
  test('module classes as alternatives (`.inner > :is(.one, .two)`), with the context :not()', () => {
    const r = resolver('.one { width: 80px } .two { width: 80px } .inner:not(.stacked) > :is(.one, .two) { width: 160px }');
    expect(raw(styleAt(r, 'div.inner', 'div.one')).width).toBe(20);
    expect(raw(styleAt(r, 'div.inner', 'div.two')).width).toBe(20);
    expect(raw(styleAt(r, 'div.inner.stacked', 'div.two')).width).toBe(10);
  });
  test('in a context compound and inside :not()', () => {
    const r = resolver('.x { width: 80px } :is(.a, .b) .x { width: 160px } .y { width: 80px } .y:not(:is(.a, .b)) { width: 160px }');
    expect(raw(styleAt(r, 'div.b', 'div', 'div.x')).width).toBe(20);
    expect(raw(styleAt(r, 'div', 'div.x')).width).toBe(10);
    expect(raw(styleAt(r, 'div.y')).width).toBe(20);
    expect(raw(styleAt(r, 'div.y.a')).width).toBe(10);
  });
  test(':where() lists match the same and lose to an equal later single class (specificity 0)', () => {
    const r = resolver('.x:where(.a, .b) { width: 160px } .x { width: 80px }');
    expect(raw(styleAt(r, 'div.x.a')).width).toBe(10);
    const s = resolver('.x:is(.a, .b) { width: 160px } .x { width: 80px }');
    expect(raw(styleAt(s, 'div.x.a')).width).toBe(20);
  });
});

describe('a class-less subject several compounds below its class', () => {
  test('descendant then child: `.crumbs li > svg`', () => {
    const r = resolver('.crumbs li > svg { width: 160px }');
    expect(raw(styleAt(r, 'nav.crumbs', 'ol', 'li', 'svg')).width).toBe(20);
    expect(raw(styleAt(r, 'nav.crumbs', 'li', 'svg')).width).toBe(20);
    // Not a child of the li; not under an li at all; outside the context.
    expect(raw(styleAt(r, 'nav.crumbs', 'ol', 'li', 'span', 'svg')).width).toBeUndefined();
    expect(raw(styleAt(r, 'nav.crumbs', 'ol', 'svg')).width).toBeUndefined();
    expect(raw(styleAt(r, 'nav', 'ol', 'li', 'svg')).width).toBeUndefined();
  });
  test('two descendant steps: `.t tbody tr`, at any depth', () => {
    const r = resolver('.t tbody tr { width: 160px }');
    expect(raw(styleAt(r, 'table.t', 'tbody', 'tr')).width).toBe(20);
    expect(raw(styleAt(r, 'div.t', 'table', 'tbody', 'div', 'tr')).width).toBe(20);
    expect(raw(styleAt(r, 'table.t', 'thead', 'tr')).width).toBeUndefined();
    expect(raw(styleAt(r, 'table.t', 'tr')).width).toBeUndefined();
  });
  test('child steps all the way: `.fab > button > :first-child` needs each parent in place', () => {
    const r = resolver('.fab > button > :first-child { width: 160px }');
    expect(raw(styleAt(r, 'div.fab', 'button', el('span', [0, 2]))).width).toBe(20);
    expect(raw(styleAt(r, 'div.fab', 'button', el('span', [1, 2]))).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.fab', 'div', 'button', el('span', [0, 2]))).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.fab', 'button', 'i', el('span', [0, 2]))).width).toBeUndefined();
  });
  test('a list inside the path: `.item :is(h2, h3) > button`', () => {
    const r = resolver('.item :is(h2, h3) > button { width: 160px }');
    expect(raw(styleAt(r, 'div.item', 'h3', 'button')).width).toBe(20);
    expect(raw(styleAt(r, 'div.item', 'h4', 'button')).width).toBeUndefined();
  });
  test('the context state and its own ancestors still decide (`when`)', () => {
    const r = resolver('.p > .a[data-on] ul li { width: 160px }');
    expect(raw(styleAt(r, 'div.p', 'div.a[data-on]', 'ul', 'li')).width).toBe(20);
    expect(raw(styleAt(r, 'div.p', 'div.a', 'ul', 'li')).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.p', 'div', 'div.a[data-on]', 'ul', 'li')).width).toBeUndefined();
  });
  test('plain child rules reach as before: `>` the children only, a space every descendant', () => {
    const r = resolver('.list > li { width: 160px } .prose p { width: 80px }');
    expect(raw(styleAt(r, 'ul.list', 'li')).width).toBe(20);
    expect(raw(styleAt(r, 'ul.list', 'div', 'li')).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.prose', 'div', 'div', 'p')).width).toBe(10);
  });
});

describe('together with the `+` combinator', () => {
  test('a list before `+`, and `+` inside a path', () => {
    const r = resolver('.wrap > :is(a, button) + span { width: 160px } .box li + li > b { width: 80px }');
    const after = (tag: string): ElementInfo => ({ ...el('span', [1, 2]), prev: el(tag, [0, 2]) });
    expect(raw(styleAt(r, 'div.wrap', after('button'))).width).toBe(20);
    expect(raw(styleAt(r, 'div.wrap', after('i'))).width).toBeUndefined();
    expect(raw(styleAt(r, 'div.wrap', el('span', [0, 1]))).width).toBeUndefined();
    const second: ElementInfo = { ...el('li', [1, 2]), prev: el('li', [0, 2]) };
    expect(raw(styleAt(r, 'ul.box', second, 'b')).width).toBe(10);
    expect(raw(styleAt(r, 'ul.box', el('li', [0, 2]), 'b')).width).toBeUndefined();
  });
});

describe('table rows and cells', () => {
  test('`height` on a tr / td / th is a minimum (a wrapped cell is not cut); on anything else it is the height', () => {
    const r = resolver('.t tbody tr { height: 44px } .cell { height: 44px } .box { height: 96px }');
    const row = raw(styleAt(r, 'table.t', 'tbody', 'tr'));
    expect([row.height, row.minHeight]).toEqual([undefined, 1]);
    const cell = raw(styleAt(r, 'td.cell'));
    expect([cell.height, cell.minHeight]).toEqual([undefined, 1]);
    const box = raw(styleAt(r, 'div.box'));
    expect([box.height, box.minHeight]).toEqual([6, undefined]);
  });
});
