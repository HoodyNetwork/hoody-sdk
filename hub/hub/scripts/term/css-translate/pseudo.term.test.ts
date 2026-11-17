// ::before / ::after: the selector plan (selectors.ts `pseudo`), the content parser (pseudo.ts) and the table rows
// (module.ts PseudoRule / ChildRule.pseudo), plus the accounting: a generated box's declarations are never layout
// lost by its host class.
import { describe, expect, test } from 'bun:test';
import { buildTable } from '../css-translate';
import { translateModule } from './module';
import { parseContent } from './pseudo';
import { envFor, WIDTH_CLASSES } from './queries';
import { planSelector } from './selectors';

const M = 'pages/x/X.module.css';
const id = (n: string): string => `${M}#${n}`;
const mod = (css: string) => {
  const r = translateModule(M, css, envFor(WIDTH_CLASSES.narrow!), { get: () => undefined });
  return (n: string) => r.entries.find((e) => e.id === id(n))!;
};

describe('selector plan', () => {
  test('a pseudo-element ending the subject is cut off and the rest planned as usual', () => {
    expect(planSelector('.a::before', M)).toMatchObject({ kind: 'base', cls: 'a', pseudo: 'before', specificity: [0, 1, 1] });
    expect(planSelector('.a:after', M)).toMatchObject({ kind: 'base', cls: 'a', pseudo: 'after' });
    expect(planSelector(".a[data-x='1']::after", M)).toMatchObject({ kind: 'variant', cls: 'a', pseudo: 'after', when: { self: { attrs: [{ name: 'data-x' }] } } });
    expect(planSelector('.a:not(:last-child)::after', M)).toMatchObject({ kind: 'variant', pseudo: 'after', when: { self: { not: [{ pseudo: ['last-child'] }] } } });
    expect(planSelector('.p > .a::before', M)).toMatchObject({ kind: 'variant', cls: 'a', pseudo: 'before', when: { ancestors: [{ classes: [id('p')], direct: true }] } });
    expect(planSelector('.list li::before', M)).toMatchObject({ kind: 'child-rule', cls: 'list', pseudo: 'before', direct: false, match: { tags: ['li'] } });
    // With `+`: the previous sibling is the element's, the box is still the last compound's.
    expect(planSelector('.a + .b::after', M)).toMatchObject({ kind: 'variant', cls: 'b', pseudo: 'after', when: { self: { prev: { classes: [id('a')] } } } });
    expect(planSelector('.a', M)).not.toHaveProperty('pseudo');
  });
  test('still dropped: other pseudo-elements, one that is not last, and a rule dropped for another reason (it keeps the side)', () => {
    expect(planSelector('.a::placeholder', M)).toMatchObject({ kind: 'dropped', reason: 'pseudo-element' });
    expect(planSelector('.a::selection', M)).toMatchObject({ kind: 'dropped', reason: 'pseudo-element' });
    expect(planSelector('.a::before .b', M)).toMatchObject({ kind: 'dropped', reason: 'pseudo-element' });
    expect(planSelector('.a:hover::after', M)).toMatchObject({ kind: 'dropped', reason: 'interaction', pseudo: 'after' });
    expect(planSelector('.a:has(b)::after', M)).toMatchObject({ kind: 'dropped', reason: 'has', pseudo: 'after' });
    expect(planSelector(':root::before', M)).toMatchObject({ kind: 'dropped' });
  });
});

describe('content', () => {
  test('strings, escapes, alt text, none', () => {
    expect(parseContent(`'$ '`)).toEqual(['$ ']);
    expect(parseContent(`"·"`)).toEqual(['·']);
    expect(parseContent(`''`)).toEqual([]);
    expect(parseContent(`""`)).toEqual([]);
    expect(parseContent(`'·' / ''`)).toEqual(['·']);
    expect(parseContent(`'\\2022  x' "\\""`)).toEqual(['\u2022 x', '"']);
    expect(parseContent('none')).toBe('none');
    expect(parseContent('normal')).toBe('none');
  });
  test('undecidable at build time: null', () => {
    for (const v of [`'(' attr(data-n) ')'`, `counter(code) '.'`, 'url(x.svg)', 'open-quote', 'var(--x)', `'a' / counter(c)`, '/ "x"', '']) expect(parseContent(v)).toBeNull();
  });
});

describe('table rows', () => {
  test('a pseudo rule lands on its class with content and its own style, in cascade order', () => {
    const e = mod(`.a { color: red } .a::before { content: '> '; font-weight: 700 } .a[data-on]::before { content: none } .a::after { content: ''; position: absolute; inset: 0 }`)('a');
    expect(e.pseudo?.map((r) => [r.side, r.selector, r.content])).toEqual([['before', '.a::before', ['> ']], ['after', '.a::after', []], ['before', '.a[data-on]::before', 'none']]);
    expect(e.pseudo![0]!.text).toEqual({ bold: true });
    expect(e.pseudo![1]!.style).toMatchObject({ position: 'absolute', top: 0, left: 0 });
    expect(e.pseudo![2]!.when).toEqual({ self: { attrs: [{ name: 'data-on' }] } });
    expect(e.pseudo![0]!.outcomes.find((o) => o.decl.startsWith('content'))).toMatchObject({ kind: 'translated' });
  });
  test('a child rule keeps its pseudo side and never styles the child itself', () => {
    const r = mod(`.list li::before { content: '• '; color: gray }`)('list').childRules!;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ selector: '.list li::before', match: { tags: ['li'] }, pseudo: { side: 'before', content: ['• '] } });
  });
  test('the host class loses no layout to its generated box: full, where the old policy said partial', () => {
    const e = mod(`.card { display: flex } .card::before { content: ''; position: absolute; inset-block: 0; width: 2px } .card:hover::after { inset: 0; width: 4px }`)('card');
    expect(e.status).toBe('full');
    expect(e.notes ?? []).toEqual([]);
    expect(e.outcomes.filter((o) => o.kind === 'dropped').map((o) => o.detail)).toEqual(['::after box, interaction: :hover', '::after box, interaction: :hover']);
  });
  test('undecidable content drops the rule, with the reason on the class', () => {
    const e = mod(`.line::before { content: counter(code) '.'; min-width: 20px }`)('line');
    expect(e.pseudo).toBeUndefined();
    expect(e.outcomes.map((o) => [o.kind, o.detail])).toEqual([
      ['dropped', `::before box, pseudo-content: counter(code) '.' cannot be decided at build time`],
      ['dropped', `::before box, pseudo-content: counter(code) '.' cannot be decided at build time`],
    ]);
    expect(e.status).toBe('empty');
  });
  test('a query that is false for the width class applies nothing', () => {
    const e = mod(`@media (width >= 4000px) { .a::before { content: 'wide' } }`)('a');
    expect(e.pseudo).toBeUndefined();
    expect(e.outcomes.map((o) => o.kind)).toEqual(['not-applied']);
  });
});

describe('the tree', () => {
  test('the text boxes in hub/src are in the table', () => {
    const { table } = buildTable({ width: 'narrow' });
    const first = (cid: string) => table.classes[cid]?.pseudo?.[0];
    expect(first('kit/data/Ids.module.css#prompt')).toMatchObject({ side: 'before', content: ['$ '] });
    expect(first('kit/data/DataTable.module.css#listItem')).toMatchObject({ side: 'before', content: ['·'] });
    expect(first('pages/computers/parts/parts.module.css#headItem')).toMatchObject({ side: 'before', content: ['·'], style: { position: 'absolute' } });
    // Secret's line numbers are a counter: dropped with its reason, never half-drawn.
    expect(table.classes['kit/forms/Secret.module.css#lineItem']?.pseudo).toBeUndefined();
    // No class is partial only because of its generated box any more.
    const lost = Object.values(table.classes).flatMap((e) => e.outcomes).filter((o) => o.kind === 'dropped' && /\(layout\)/.test(o.detail ?? '') && /::(before|after) box/.test(o.detail ?? ''));
    expect(lost).toEqual([]);
  }, 120_000);
});
