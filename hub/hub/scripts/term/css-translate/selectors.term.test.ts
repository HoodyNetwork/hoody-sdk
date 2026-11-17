// Selector policy (selectors.ts) and query policy (queries.ts): one test per decision.
import { describe, expect, test } from 'bun:test';
import { envFor, evalContainer, evalMedia, WIDTH_CLASSES } from './queries';
import { planSelector, type Plan } from './selectors';

const M = 'pages/x/X.module.css';
const id = (n: string): string => `${M}#${n}`;
const plan = (s: string): Plan => planSelector(s, M);

describe('base and variants', () => {
  test('single class → base', () => {
    expect(plan('.row')).toMatchObject({ kind: 'base', cls: 'row', specificity: [0, 1, 0] });
  });
  test('compound classes → variant on the last class', () => {
    expect(plan('.wrap.g1')).toMatchObject({ kind: 'variant', cls: 'g1', policy: 'compound', when: { self: { classes: [id('wrap')] } } });
  });
  test('attribute on the subject → attr variant', () => {
    expect(plan(".list[data-visitor='off']")).toMatchObject({
      kind: 'variant',
      cls: 'list',
      policy: 'attr',
      when: { self: { attrs: [{ name: 'data-visitor', op: '=', value: 'off' }] } },
    });
    expect(plan('.tab[aria-selected="true"]')).toMatchObject({ policy: 'attr' });
  });
  test('structural pseudo → structural variant', () => {
    expect(plan('.item:first-child')).toMatchObject({ kind: 'variant', policy: 'structural', when: { self: { pseudo: ['first-child'] } } });
    expect(plan('.item:nth-child(2n)')).toMatchObject({ when: { self: { pseudo: ['nth-child(2n)'] } } });
  });
  test('`+`: the compound before it is the previous sibling, never an ancestor', () => {
    expect(plan('.row + .row')).toMatchObject({ kind: 'variant', cls: 'row', policy: 'structural', when: { self: { prev: { classes: [id('row')] } } } });
    expect((plan('.row + .row') as { when: { ancestors?: unknown } }).when.ancestors).toBeUndefined();
    // A child rule keeps the parent as its context: `.foot > .note + *` = .foot's children whose previous sibling is a .note.
    expect(plan('.foot > .note + *')).toMatchObject({ kind: 'child-rule', cls: 'foot', direct: true, match: { prev: { classes: [id('note')] } } });
    expect(plan('.ctx > * + *')).toMatchObject({ kind: 'child-rule', cls: 'ctx', direct: true, match: { prev: {} } });
    // Chains nest, and the context before the first sibling stays an ancestor.
    expect(plan('.p .a + .b + .c')).toMatchObject({ kind: 'variant', cls: 'c', when: { self: { prev: { classes: [id('b')], prev: { classes: [id('a')] } } }, ancestors: [{ classes: [id('p')] }] } });
  });
  test('state pseudo → state variant', () => {
    expect(plan('.btn:disabled')).toMatchObject({ kind: 'variant', policy: 'state', when: { self: { pseudo: ['disabled'] } } });
  });
  test(':not() of simple conditions', () => {
    expect(plan('.item:not(:last-child)')).toMatchObject({ kind: 'variant', when: { self: { not: [{ pseudo: ['last-child'] }] } } });
    expect(plan('.item:not(.on)')).toMatchObject({ when: { self: { not: [{ classes: [id('on')] }] } } });
  });
  test('tag on the subject is a condition', () => {
    expect(plan('button.chip')).toMatchObject({ kind: 'variant', cls: 'chip', when: { self: { tags: ['button'] } } });
  });
  test('descendant and child contexts → ancestors, innermost first', () => {
    expect(plan(".list[data-cols='mid'] .row")).toMatchObject({
      kind: 'variant',
      cls: 'row',
      policy: 'descendant',
      when: { ancestors: [{ classes: [id('list')], attrs: [{ name: 'data-cols', value: 'mid' }] }] },
    });
    expect(plan('.a > .b .c')).toMatchObject({ cls: 'c', policy: 'child', when: { ancestors: [{ classes: [id('b')] }, { classes: [id('a')], direct: true }] } });
  });
  test('density context is kept as an ancestor attribute', () => {
    expect(plan("[data-density='compact'] .row")).toMatchObject({ kind: 'variant', when: { ancestors: [{ attrs: [{ name: 'data-density' }] }] } });
  });
  test('dark theme context is stripped (dark is the default); :global form too', () => {
    expect(plan(":root[data-hx-theme='dark'] .drawer")).toMatchObject({ kind: 'base', cls: 'drawer', specificity: [0, 3, 0] });
    expect(plan(":global(:root[data-hx-theme='dark']) .tiles")).toMatchObject({ kind: 'base', cls: 'tiles' });
  });
  test('global classes as context become global: ids', () => {
    expect(plan(':global(.dark) .x')).toMatchObject({ kind: 'variant', when: { ancestors: [{ classes: ['global:dark'] }] } });
  });
});

describe('child rules', () => {
  test('class-less subject right after a class → child rule on that class', () => {
    expect(plan('.list > li')).toMatchObject({ kind: 'child-rule', cls: 'list', direct: true, match: { tags: ['li'] } });
    expect(plan('.prose p')).toMatchObject({ kind: 'child-rule', cls: 'prose', direct: false, match: { tags: ['p'] } });
    expect(plan('.row > *')).toMatchObject({ kind: 'child-rule', cls: 'row', match: {} });
    expect(plan('.row > :first-child')).toMatchObject({ kind: 'child-rule', match: { pseudo: ['first-child'] } });
    expect(plan(".list[data-x='1'] > span")).toMatchObject({ kind: 'child-rule', cls: 'list', when: { self: { attrs: [{ name: 'data-x' }] } } });
  });
  test('a class-less subject further from a class → child rule on the nearest class, the compounds between as its path', () => {
    expect(plan('.a ul li')).toEqual({ kind: 'child-rule', cls: 'a', direct: false, match: { tags: ['li'] }, path: [{ tags: ['ul'] }], when: {}, specificity: [0, 1, 2] });
    expect(plan('.crumbs li > svg')).toMatchObject({ kind: 'child-rule', cls: 'crumbs', direct: false, match: { tags: ['svg'] }, path: [{ tags: ['li'], direct: true }] });
    expect(plan('.fab > button > :first-child')).toMatchObject({ cls: 'fab', direct: true, match: { pseudo: ['first-child'] }, path: [{ tags: ['button'], direct: true }] });
    expect(plan('.t tbody tr')).toMatchObject({ cls: 't', direct: false, path: [{ tags: ['tbody'] }] });
    // Innermost first; the nearest class is the context, classes further out stay ancestors of the context.
    expect(plan('.p > .a > ul > li span')).toMatchObject({ cls: 'a', direct: true, match: { tags: ['span'] }, path: [{ tags: ['li'] }, { tags: ['ul'], direct: true }], when: { ancestors: [{ classes: [id('p')], direct: true }] } });
    expect(plan(".inline [data-chip] > [data-chip-label] > span")).toMatchObject({ cls: 'inline', path: [{ attrs: [{ name: 'data-chip-label' }], direct: true }, { attrs: [{ name: 'data-chip' }], direct: true }] });
    // A plain child rule has no path.
    expect(plan('.list > li')).not.toHaveProperty('path');
  });
  test('a class-less subject with no class anywhere before it is dropped', () => {
    expect(plan('ul li')).toMatchObject({ kind: 'dropped', reason: 'no-class-subject', attributedTo: [] });
    expect(plan(':global(.g) ul li')).toMatchObject({ kind: 'dropped', reason: 'no-class-subject' });
  });
});

describe(':is() / :where() lists', () => {
  test('a list on the subject → `any`: one alternative must hold', () => {
    expect(plan('.x:is(.a, .b)')).toMatchObject({ kind: 'variant', cls: 'x', when: { self: { any: [[{ classes: [id('a')] }, { classes: [id('b')] }]] } } });
    expect(plan('.x:where([data-a], [data-b]):is(a, button)')).toMatchObject({ when: { self: { any: [[{ attrs: [{ name: 'data-a' }] }, { attrs: [{ name: 'data-b' }] }], [{ tags: ['a'] }, { tags: ['button'] }]] } } });
  });
  test('a list as the whole subject → child rule matching any alternative', () => {
    expect(plan('.wrap > :is(a, button)')).toMatchObject({ kind: 'child-rule', cls: 'wrap', direct: true, match: { any: [[{ tags: ['a'] }, { tags: ['button'] }]] } });
    expect(plan('.inner:not(.stacked) > :is(.one, .two)')).toMatchObject({ kind: 'child-rule', cls: 'inner', match: { any: [[{ classes: [id('one')] }, { classes: [id('two')] }]] }, when: { self: { not: [{ classes: [id('stacked')] }] } } });
    expect(plan(".inline :is(a[href], button):not([data-chip])")).toMatchObject({ kind: 'child-rule', cls: 'inline', direct: false, match: { any: [[{ tags: ['a'], attrs: [{ name: 'href' }] }, { tags: ['button'] }]], not: [{ attrs: [{ name: 'data-chip' }] }] } });
  });
  test('a list in a context, in :not() and in a path', () => {
    expect(plan(':is(.a, .b) .x')).toMatchObject({ kind: 'variant', cls: 'x', when: { ancestors: [{ any: [[{ classes: [id('a')] }, { classes: [id('b')] }]] }] } });
    expect(plan('.x:not(:is(.a, .b))')).toMatchObject({ when: { self: { not: [{ any: [[{ classes: [id('a')] }, { classes: [id('b')] }]] }] } } });
    expect(plan('.item :is(h2, h3) > button')).toMatchObject({ kind: 'child-rule', cls: 'item', direct: false, match: { tags: ['button'] }, path: [{ any: [[{ tags: ['h2'] }, { tags: ['h3'] }]], direct: true }] });
  });
  test('specificity: :is() counts its most specific alternative, :where() nothing', () => {
    expect(plan('.x:is(.a, li)')).toMatchObject({ specificity: [0, 2, 0] });
    expect(plan('.x:where(.a, li)')).toMatchObject({ specificity: [0, 1, 0] });
    expect(plan('.w > :is(a, button)')).toMatchObject({ specificity: [0, 1, 1] });
  });
  test('one alternative is folded in as before', () => {
    expect(plan('.x:is(.a)')).toEqual({ kind: 'variant', cls: 'x', when: { self: { classes: [id('a')] } }, specificity: [0, 2, 0], policy: 'compound' });
  });
  test('still dropped: a combinator inside an alternative; an interaction state inside one', () => {
    expect(plan('.x:is(.a .b, .c)')).toMatchObject({ kind: 'dropped', reason: 'is-list' });
    expect(plan('.x:is(:focus-visible, [data-focus-visible])')).toMatchObject({ kind: 'dropped', reason: 'interaction' });
  });
});

describe('dropped', () => {
  const reason = (s: string): string | undefined => {
    const p = plan(s);
    return p.kind === 'dropped' ? p.reason : undefined;
  };
  test('interaction states anywhere', () => {
    expect(reason('.row:hover')).toBe('interaction');
    expect(reason('.row:focus-visible')).toBe('interaction');
    expect(reason('.row:hover .actions')).toBe('interaction');
    expect(reason('.box:focus-within')).toBe('interaction');
    expect(reason('.x:not(:hover)')).toBe('interaction');
  });
  test('pseudo-elements', () => {
    // ::before / ::after ending the subject are planned (pseudo.term.test.ts); every other pseudo-element is dropped.
    expect(plan('.pending::after')).toMatchObject({ kind: 'base', cls: 'pending', pseudo: 'after' });
    expect(reason('.a::before > .b')).toBe('pseudo-element');
    expect(reason('.field::placeholder')).toBe('pseudo-element');
    expect(reason('.scroller::-webkit-scrollbar')).toBe('pseudo-element');
  });
  test(':has, siblings, rtl, light theme, lists', () => {
    expect(reason('.card:has(table)')).toBe('has');
    expect(reason('.a ~ .b')).toBe('sibling');
    expect(reason('.a:hover + .b')).toBe('interaction');
    expect(reason('.chev:dir(rtl)')).toBe('rtl');
    expect(reason(":root[data-hx-theme='light'] .x")).toBe('light-theme');
    expect(reason(':root[data-hx-perf] .dot')).toBe('light-theme');
    expect(reason('.x:is(.a > .b, .c)')).toBe('is-list');
  });
  test('global subject', () => {
    expect(reason('.a :global(.b)')).toBe('global-subject');
  });
  test('dropped rules are attributed to the subject class', () => {
    expect(plan('.row:hover')).toMatchObject({ attributedTo: [id('row')] });
  });
  test('the :root rule', () => {
    expect(plan(':root')).toEqual({ kind: 'root' });
  });
});

describe('query policy', () => {
  const narrow = envFor(WIDTH_CLASSES.narrow!);
  const wide = envFor(WIDTH_CLASSES.wide!);
  test('width conditions take the narrow branch by default', () => {
    expect(evalMedia('(width < 768px)', narrow).value).toBe(true);
    expect(evalMedia('(width < 768px)', wide).value).toBe(false);
    expect(evalContainer('content (width < 600px)', narrow)).toMatchObject({ value: true, name: 'content' });
    expect(evalContainer('(max-width: 640px)', narrow).value).toBe(true);
    expect(evalContainer('bot-pane (min-width: 1000px)', narrow).value).toBe(false);
    expect(evalContainer('ytiles (768px <= width < 840px)', envFor(WIDTH_CLASSES.medium!)).value).toBe(true);
    expect(evalContainer('(width < 300px)', narrow).value).toBe(false);
    expect(evalContainer('(width <= 440px)', narrow).value).toBe(false);
    expect(evalContainer('(width < 480px)', narrow).value).toBe(true);
  });
  test('terminal features', () => {
    expect(evalMedia('(pointer: coarse)', narrow).value).toBe(false);
    expect(evalMedia('(hover: none)', narrow).value).toBe(true);
    expect(evalMedia('(pointer: coarse), (hover: none)', narrow).value).toBe(true);
    expect(evalMedia('(hover: hover) and (pointer: fine)', narrow).value).toBe(false);
    expect(evalMedia('not (pointer: coarse)', narrow).value).toBe(true);
    expect(evalMedia('(prefers-reduced-motion: reduce)', narrow).value).toBe(true);
    expect(evalMedia('(forced-colors: active)', narrow).value).toBe(false);
    expect(evalMedia('(width < 768px) and (pointer: coarse)', narrow).value).toBe(false);
  });
  test('unknown features are false and reported', () => {
    const r = evalMedia('(scripting: enabled)', narrow);
    expect(r.value).toBe(false);
    expect(r.unknown).toEqual(['scripting: enabled']);
  });
});
