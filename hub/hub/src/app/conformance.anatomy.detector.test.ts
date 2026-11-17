// The layout detector (scripts/lint/anatomy.cjs) against fixtures: every static mutant of the layout rules must
// hit, every control must stay clean. Each mutant is also scanned with its rule switched off (`disabled`): the hit must
// vanish, which proves the fixture is caught by that rule and by nothing else (the red half of red-first).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/** The slice of a TypeScript node the localDecl tests read (the compiler is the detector's own, never imported here). */
type TsNode = { escapedText?: unknown; text?: string; getChildren(sf?: unknown): TsNode[]; getText(sf?: unknown): string };
type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Detector = {
  RULES: string[];
  CSS_RULES: string[];
  scan(files: Record<string, string>, opts?: { disabled?: string[] }): { hits: Hit[]; counts: Record<string, number> };
  lintHits(srcDir: string, rel: string, source?: string): Hit[];
  localDecl?: (id: TsNode) => TsNode | null;
  createProject(files: Record<string, string>): { sourceOf(file: string): TsNode };
};
const D = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;
// This file judges the layout.* family only: the ui.* family (anatomy-ui.cjs) has its own fixtures in
// conformance.anatomy.ui.test.ts, so its hits are left out of every scan here.
const isLayout = (rule: string) => rule.startsWith('layout.');
const A: Detector = {
  ...D,
  RULES: D.RULES.filter(isLayout),
  scan: (files, opts) => {
    const r = D.scan(files, opts);
    return { ...r, hits: r.hits.filter((h) => isLayout(h.rule)), counts: Object.fromEntries(Object.entries(r.counts).filter(([k]) => isLayout(k))) };
  },
  lintHits: (srcDir, rel, source) => D.lintHits(srcDir, rel, source).filter((h) => isLayout(h.rule)),
};

const KIT: Record<string, string> = {
  'kit/index.ts': [
    "export { Panel, PageFrame } from './layouts/Layouts';",
    "export * from './layouts/anatomy/Section';",
    "export * from './controls/Button';",
    "export * from './states/States';",
    "export * from './data/ItemList';",
    "export * from './overlays/Overlays';",
    "export * from './misc/Misc';",
  ].join('\n'),
  'kit/layouts/Layouts.tsx': 'export function Panel(p: any) { return <section>{p.children}</section>; }\nexport function Section(p: any) { return <section>{p.children}</section>; }\nexport function PageFrame(p: any) { return <div>{p.children}</div>; }',
  'kit/layouts/anatomy/Section.tsx': 'export function Section(p: any) { return <section>{p.children}</section>; }',
  'kit/controls/Button.tsx': 'export function Button(p: any) { return <button />; }',
  'kit/states/States.tsx': 'export function EmptyState(p: any) { return <div />; }',
  'kit/data/ItemList.tsx': 'export function ItemList(p: any) { return <ul />; }',
  'kit/misc/Misc.tsx': [
    'export function Visual(p: any) { return <figure>{p.children}</figure>; }',
    'export function SettingRow(p: any) { return <div>{p.label}</div>; }',
    'export function DataTable(p: any) { return <table />; }',
    'export function ConversationView(p: any) { return <div>{p.pane}</div>; }',
    'export function IdChip(p: any) { return <span />; }',
    'export function Icon(p: any) { return <span />; }',
  ].join('\n'),
  'kit/overlays/Overlays.tsx': 'export function Drawer(p: any) { return <aside>{p.children}</aside>; }\nexport function ConfirmDialog(p: any) { return <div />; }\nexport function Dialog(p: any) { return <div />; }',
};

function scan(page: string, extra: Record<string, string> = {}, disabled: string[] = []) {
  const r = A.scan({ ...KIT, ...extra, 'pages/x/view.tsx': page }, { disabled });
  // the FAQ explanation rules have their own fixtures (conformance.anatomy.explain.test.ts); here only the layout rules are judged
  return r.hits.filter((h) => h.file.startsWith('pages/') && !h.rule.startsWith('layout.explain'));
}
const rulesOf = (hits: Hit[]) => [...new Set(hits.map((h) => h.rule))].sort();

/** The mutant is caught by `rule`, and only that rule (plus `also`) reports it; switched off, the rule's hits are gone. */
function mutant(name: string, rule: string, page: string, extra: Record<string, string> = {}, also: string[] = []) {
  it(`mutant: ${name}`, () => {
    const hits = scan(page, extra);
    expect(rulesOf(hits), 'rules that fired').toEqual([rule, ...also].sort());
    const off = scan(page, extra, [rule]);
    expect(off.some((h) => h.rule === rule), 'rule switched off').toBe(false);
  });
}

const SECTION_OK = "import { Section, ItemList } from '@kit';\nexport function V() { return <Section title=\"a\" state={s}><ItemList items={[]} /></Section>; }";

describe('anatomy detector: controls', () => {
  it('a strict Section with a state around an ItemList is clean', () => {
    expect(scan(SECTION_OK)).toEqual([]);
  });
  it('the 25 layout rule ids are the base layout rules, the FAQ rules and looseFaqLink, bandsPerSection, drawerOl; every other id is ui.*', () => {
    expect(A.RULES).toHaveLength(25);
    expect(D.RULES.filter((r) => !isLayout(r)).every((r) => r.startsWith('ui.'))).toBe(true);
  });
});

describe('anatomy detector: static mutants', () => {
  mutant('prose div + Button inside a valid Section', 'layout.text', "import { Section, Button } from '@kit';\nexport function V() { return <Section title=\"a\"><div>Some prose here</div><Button>go</Button></Section>; }");

  for (const cls of ['actions', 'toolbar', 'cluster']) {
    mutant(`action wrapper renamed to .${cls}`, 'layout.actionRow', `import { Button } from '@kit';\nexport function V() { return <div className={s.${cls}}><Button>a</Button><Button>b</Button></div>; }`);
  }
  mutant('wrapper padding/gap written inline', 'layout.inlineSpacing', "export function V() { return <div style={{ padding: 8, gap: '4px' }} />; }");

  mutant('import { Panel as Box } from @kit', 'layout.legacy', "import { Panel as Box } from '@kit';\nexport function V() { return <Box /> ; }");
  mutant('a page module re-exporting Panel', 'layout.legacy', "import { Box } from './barrel';\nexport function V() { return <Box />; }", { 'pages/x/barrel.ts': "export { Panel as Box } from '@kit';" });
  mutant('a re-export chain two modules deep', 'layout.legacy', "import { Crate } from './a';\nexport function V() { return <Crate />; }", {
    'pages/x/a.ts': "export * from './b';",
    'pages/x/b.ts': "export { Box as Crate } from './c';",
    'pages/x/c.ts': "export { Panel as Box } from '@kit';",
  });
  mutant('const T = "h3" used as a tag', 'layout.heading', "const T = 'h3';\nexport function V() { return <T>x</T>; }", {}, ['layout.localChrome']);
  mutant("createElement('p', null, text)", 'layout.text', "import { createElement } from 'react';\nexport function V() { return createElement('p', null, 'x'); }");
  mutant("createElement('h2')", 'layout.heading', "import { createElement } from 'react';\nexport function V() { return createElement('h2', null); }");
  mutant('as="h2" on a kit component', 'layout.heading', "import { Button } from '@kit';\nexport function V() { return <Button as=\"h2\" />; }");

  mutant('page data-hub-a (literal)', 'layout.marker', "export function V() { return <div data-hub-a=\"1\" />; }");
  mutant('page data-hub-a (object spread)', 'layout.marker', "export function V() { return <div {...{ 'data-hub-a': 1 }} />; }");
  mutant('page data-hub-a (spread of a local const)', 'layout.marker', "const attrs = { 'data-hub-a': 1 };\nexport function V() { return <div {...attrs} />; }");
  mutant("createElement props with data-hub-a", 'layout.marker', "import { createElement } from 'react';\nexport function V() { return createElement('div', { 'data-hub-a': 1 }); }");

  mutant('a Section with an ItemList and no state', 'layout.stateMissing', "import { Section, ItemList } from '@kit';\nexport function V() { return <Section title=\"a\"><ItemList items={[]} /></Section>; }");

  it('mutant: a barrel EmptyState in a page (state outside a Section)', () => {
    const hits = scan("import { EmptyState } from '@kit';\nexport function V() { return <EmptyState title=\"none\" />; }");
    expect(rulesOf(hits)).toEqual(['layout.state']);
  });
});

describe('anatomy detector: the list-detail pane state', () => {
  // ListDetailPage and DetailPage take the strict Section's `state` (SectionState data): the kit draws the state, so a
  // page names no EmptyState. The old way, an EmptyState written into the `list` slot or as DetailPage children, stays a
  // layout.state hit. Judged with the real registry (kit/layouts/anatomy slots.ts: ListDetailPage.list is a `pane`).
  const LD = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport * from './layouts/ListDetailPage';\nexport { DetailPage } from './layouts/Detail';`,
    'kit/layouts/ListDetailPage.tsx': 'export function ListDetailPage(p: any) { return <div>{p.list}{p.detail}</div>; }',
    'kit/layouts/Detail.tsx': 'export function DetailPage(p: any) { return <div>{p.children}</div>; }',
  };
  const loadRegistry = (D as unknown as { loadRegistry(dir: string): unknown }).loadRegistry;
  const realScan = D.scan as (files: Record<string, string>, opts: { registry: unknown; disabled?: string[] }) => { hits: Hit[] };
  const registry = loadRegistry(path.join(import.meta.dirname, '../kit/layouts/anatomy'));
  const judge = (page: string, disabled: string[] = []) =>
    realScan({ ...KIT, ...LD, 'pages/x/view.tsx': page }, { registry, disabled }).hits.filter((h) => isLayout(h.rule) && h.file.startsWith('pages/') && !h.rule.startsWith('layout.explain'));
  const page = (imp: string, jsx: string) => `import { ${imp} } from '@kit';\nexport function V() { return ${jsx}; }`;

  it('a ListDetailPage with a state and a table in its list is clean', () => {
    expect(judge(page('ListDetailPage, DataTable', "<ListDetailPage state={{ kind: 'notHere', title: 'Pick a realm', body: 'b' }} list={<DataTable rows={[]} />} detail={null} />"))).toEqual([]);
  });
  it('a DetailPage with a state is clean', () => {
    expect(judge(page('DetailPage', "<DetailPage header={{ title: 'a' }} state={{ kind: 'notHere', title: 'Pick a realm', body: 'b' }} />"))).toEqual([]);
  });
  for (const [name, src] of [
    ['an EmptyState written into a ListDetailPage list slot', page('ListDetailPage, EmptyState', '<ListDetailPage list={<EmptyState title="Pick a realm" />} detail={null} />')],
    ['an EmptyState as DetailPage children', page('DetailPage, EmptyState', "<DetailPage header={{ title: 'a' }}><EmptyState title=\"Pick a realm\" /></DetailPage>")],
  ] as const) {
    it(`mutant: ${name}`, () => {
      expect(rulesOf(judge(src))).toEqual(['layout.state']);
      expect(judge(src, ['layout.state'])).toEqual([]);
    });
  }
});

describe('anatomy detector: CSS mutants', () => {
  const css = (text: string, page = "import { Button } from '@kit';\nimport s from './v.module.css';\nexport function V() { return <Button className={s.card}>x</Button>; }") => {
    const r = A.scan({ ...KIT, 'pages/x/view.tsx': page, 'pages/x/v.module.css': text });
    return r.hits.filter((h) => h.file.endsWith('.css'));
  };
  it('wrapper margin is a hit; a zero margin and auto are not', () => {
    expect(rulesOf(css('.card { margin-block-end: var(--sp-4); }'))).toEqual(['layout.cssMargin']);
    expect(css('.card { margin: 0; margin-inline: auto; }')).toEqual([]);
  });
  it('a heading font token is a hit', () => {
    expect(rulesOf(css('.card { font-size: var(--fs-xl); }'))).toEqual(['layout.cssType']);
  });
  it('--pad-card override is a hit', () => {
    expect(rulesOf(css('.card { --pad-card: 4px; }'))).toEqual(['layout.cssReach']);
  });
  it('descendant CSS below a class passed to a kit component is a hit; below a plain class it is not', () => {
    expect(rulesOf(css('.card .inner { color: var(--hx-ink); }'))).toEqual(['layout.cssReach']);
    expect(rulesOf(css('.card > button { color: var(--hx-ink); }'))).toEqual(['layout.cssReach']);
    expect(css('.plain .inner { color: var(--hx-ink); }')).toEqual([]);
  });
  it('a selector on a kit marker or :global() is a hit', () => {
    expect(rulesOf(css('.card [data-hub-heading] { color: red; }'))).toEqual(['layout.cssReach']);
    expect(rulesOf(css(':global(.rc-x) { color: red; }'))).toEqual(['layout.cssReach']);
  });
  it('each CSS rule vanishes when switched off', () => {
    for (const [rule, text] of [
      ['layout.cssMargin', '.card { margin-block-end: var(--sp-4); }'],
      ['layout.cssType', '.card { font-size: var(--fs-xl); }'],
      ['layout.cssReach', '.card { --pad-card: 4px; }'],
    ] as const) {
      const r = A.scan({ ...KIT, 'pages/x/view.tsx': "import { Button } from '@kit';\nimport s from './v.module.css';\nexport function V() { return <Button className={s.card}>x</Button>; }", 'pages/x/v.module.css': text }, { disabled: [rule] });
      expect(r.hits.filter((h) => h.file.endsWith('.css'))).toEqual([]);
    }
  });
});

describe('anatomy detector: layout.cssGap', () => {
  const TOKENS = ':root { --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-6: 24px; --gap-line: var(--sp-1); --gap-block: var(--sp-3); }';
  const PAGE = 'export function V() { return null; }';
  const gapHits = (text: string, extra: Record<string, string> = { 'kit/tokens.css': TOKENS }, disabled: string[] = []) =>
    A.scan({ ...KIT, ...extra, 'pages/x/view.tsx': PAGE, 'pages/x/v.module.css': text }, { disabled }).hits.filter((h) => h.rule === 'layout.cssGap');
  const n = (text: string) => gapHits(text).length;
  const ROW = 'display: flex; flex-direction: row;';

  it('is registered as a CSS rule', () => {
    expect(A.RULES).toContain('layout.cssGap');
    expect(A.CSS_RULES).toContain('layout.cssGap');
  });
  it('a row-gap, or the first value of gap, over --sp-2 is a hit; the column gap alone is not', () => {
    expect(n('.a { row-gap: var(--sp-6); }')).toBe(1);
    expect(n('.a { gap: var(--sp-6); }')).toBe(1);
    expect(n('.a { gap: 24px; }')).toBe(1);
    expect(n('.a { gap: var(--sp-6) var(--sp-1); }')).toBe(1);
    expect(n('.a { gap: var(--sp-1) var(--sp-6); }')).toBe(0);
    expect(n('.a { column-gap: var(--sp-6); }')).toBe(0);
    expect(n('.a { gap: 0; row-gap: 12px; }')).toBe(1);
  });
  it('every gap declaration is its own site, with its line', () => {
    const hits = gapHits('.a { gap: 24px; }\n.b { row-gap: 32px; }');
    expect(hits.map((h) => h.line)).toEqual([1, 2]);
    expect(n('.a { gap: 24px; row-gap: 32px; }')).toBe(2);
  });
  it('the small steps pass by name and by value', () => {
    for (const v of ['var(--sp-1)', 'var(--sp-2)', 'var(--sp-0)', 'var(--gap-line)', 'var(--gap-block)', '8px', '0', 'normal', 'calc(4px + 4px)', 'min(var(--sp-6), var(--sp-2))', 'var(--unknown, 4px)']) {
      expect(n(`.a { gap: ${v}; }`), v).toBe(0);
    }
  });
  it('anything over the step, or that does not resolve, is a hit', () => {
    for (const v of ['var(--sp-3)', '9px', 'calc(var(--sp-2) + 1px)', 'max(var(--sp-1), var(--sp-6))', '1em', 'var(--unknown)', 'calc(var(--unknown) * 2)', 'inherit', '1.5rem']) {
      expect(n(`.a { gap: ${v}; }`), v).toBe(1);
    }
  });
  it("the module's own custom property is resolved", () => {
    expect(n('.a { --g: 6px; gap: var(--g); }')).toBe(0);
    expect(n('.a { --g: 24px; gap: var(--g); }')).toBe(1);
  });
  it("a custom property resolves only from the gap's own rule, unconditionally and without !important; anything else is unresolved and counted", () => {
    expect(n('.a { --g: 24px; gap: var(--g); } .b { --g: 4px; }')).toBe(1);
    expect(n('.a { --g: 4px; gap: var(--g); } .b { --g: 24px; }')).toBe(0);
    expect(n('.a { --g: 4px; gap: var(--g); } .a { --g: 24px; }')).toBe(1);
    expect(n('.a { --g: 24px; gap: var(--g); } .a { --g: 4px; }')).toBe(1);
    expect(n('.a { --g: 24px; --g: 4px; gap: var(--g); }')).toBe(0);
    expect(n('.a { --g: 4px; gap: var(--g); @media (width < 400px) { --g: 24px; } }')).toBe(1);
    expect(n('.a { --g: 4px !important; gap: var(--g); } .b { --g: 24px; }')).toBe(1);
    expect(n('.a { --g: 4px !important; gap: var(--g); }')).toBe(1);
    expect(n('.b { --g: 4px; } .a { gap: var(--g); }')).toBe(1);
    expect(n('.a { --g: 4px; } .b { gap: var(--g, 24px); }')).toBe(1);
    expect(n(':root { --g: 4px; } .a { gap: var(--g); }')).toBe(1);
    expect(n('@media (width < 400px) { .a { --g: 4px; } } .a { gap: var(--g, 24px); }')).toBe(1);
    expect(n('@media (width < 400px) { .a { --g: 4px; gap: var(--g); } }')).toBe(1);
  });
  it('a variable holding the whole gap shorthand is read through its first value', () => {
    expect(n('.a { --g: 4px 24px; gap: var(--g); }')).toBe(0);
    expect(n('.a { --g: 24px 4px; gap: var(--g); }')).toBe(1);
    expect(n('.a { gap: var(--missing, 4px 24px); }')).toBe(0);
    expect(n('.a { gap: var(--missing, 24px 4px); }')).toBe(1);
    expect(n('.a { --a: var(--b); --b: 4px 24px; gap: var(--a); }')).toBe(0);
    expect(n('.a { --a: var(--b); --b: 24px 4px; gap: var(--a); }')).toBe(1);
  });
  it('the step is --sp-2 as the token file has it', () => {
    const own = (sp2: string) => gapHits('.a { gap: 10px; }', { 'kit/tokens.css': `:root { --sp-2: ${sp2}; }` }).length;
    expect(own('8px')).toBe(1);
    expect(own('12px')).toBe(0);
    expect(() => gapHits('.a { gap: 10px; }', { 'kit/tokens.css': ':root { --sp-1: 4px; }' })).toThrow(/--sp-2/);
    expect(() => gapHits('.a { color: red; }', { 'kit/tokens.css': ':root { --sp-1: 4px; }' })).not.toThrow();
  });
  it('without kit/tokens.css a token is read by name only', () => {
    expect(gapHits('.a { gap: var(--sp-1); }', {})).toEqual([]);
    expect(gapHits('.a { gap: var(--sp-6); }', {})).toHaveLength(1);
  });

  describe('a gap proven horizontal is not counted', () => {
    it.each([
      [`.a { ${ROW} gap: var(--sp-6); }`],
      ['.a { display: inline-flex; flex-direction: row-reverse; gap: var(--sp-6); }'],
      ['.a { display: flex; flex-flow: row; gap: var(--sp-6); }'],
      ['.a { display: flex; flex-flow: row wrap; flex-wrap: nowrap; gap: var(--sp-6); }'],
      ['.a { display: flex; flex-direction: row; flex-wrap: nowrap !important; flex-wrap: wrap; gap: var(--sp-6); }'],
      ['.a { display: flex; flex-direction: row !important; flex-direction: column; gap: var(--sp-6); }'],
    ])('%s', (css) => {
      expect(n(css)).toBe(0);
    });
  });
  describe("the gap's own rule must prove it", () => {
    it.each([
      ['no display', '.a { flex-direction: row; gap: var(--sp-6); }'],
      ['no explicit direction', '.a { display: flex; gap: var(--sp-6); }'],
      ['grid', '.a { display: grid; flex-direction: row; gap: var(--sp-6); }'],
      ['column', '.a { display: flex; flex-direction: column; gap: var(--sp-6); }'],
      ['wrap', `.a { ${ROW} flex-wrap: wrap; gap: var(--sp-6); }`],
      ['wrap-reverse', `.a { ${ROW} flex-wrap: wrap-reverse; gap: var(--sp-6); }`],
      ['the shorthand after a row direction wraps', `.a { ${ROW} flex-flow: row wrap; gap: var(--sp-6); }`],
      ['flex-flow column', '.a { display: flex; flex-flow: column; gap: var(--sp-6); }'],
      ['flex-flow wrap means row wrap', '.a { display: flex; flex-flow: wrap; gap: var(--sp-6); }'],
      ['a variable direction', '.a { display: flex; flex-direction: var(--dir); gap: var(--sp-6); }'],
      ['a variable shorthand', '.a { display: flex; flex-flow: var(--f); gap: var(--sp-6); }'],
      ['an inherited direction', '.a { display: flex; flex-direction: inherit; gap: var(--sp-6); }'],
      ['the important wrap wins over a later shorthand', `.a { ${ROW} flex-wrap: wrap !important; flex-flow: row nowrap; gap: var(--sp-6); }`],
      ['the important column wins over a later row', '.a { display: flex; flex-direction: column !important; flex-direction: row; gap: var(--sp-6); }'],
      ['a flow property written in a condition nested in the rule', `.a { ${ROW} gap: var(--sp-6); @media (width < 400px) { flex-direction: column; } }`],
      ['a flow property nested in a condition with no flow outside', `.a { gap: var(--sp-6); @media (width < 400px) { ${ROW} } }`],
      ['a gap in a container block whose own rule has no flex', `.a { ${ROW} } @container (width < 600px) { .a { gap: var(--sp-6); } }`],
    ])('%s', (_name, css) => {
      expect(n(css)).toBe(1);
    });
  });
  describe('no other rule in the module may change the layout', () => {
    it.each([
      ['a column class beside it', '.b { flex-direction: column; }'],
      ['a wrapping class', '.b { flex-wrap: wrap; }'],
      ['a flex-flow class', '.b { flex-flow: column wrap; }'],
      ['a grid class', '.b { display: grid; }'],
      ['display none', '.b { display: none; }'],
      ['a grid class in a container block', '@container (width < 600px) { .b { display: grid; } }'],
      ['a column class in a media block', '@media (width < 600px) { .b { flex-direction: column; } }'],
      ['the same class turning column in a container block', '@container (width < 600px) { .a { flex-direction: column; } }'],
    ])('%s', (_name, other) => {
      expect(n(`.a { ${ROW} gap: var(--sp-6); } ${other}`)).toBe(1);
    });
    it('a module whose only flex rule is the row passes; other rules with no layout properties do not matter', () => {
      expect(n(`.a { ${ROW} gap: var(--sp-6); } .b { color: red; padding: 0; }`)).toBe(0);
    });
  });
  it('is scanned in page CSS only, and the rule can be switched off', () => {
    const css = '.a { gap: 24px; }';
    expect(A.scan({ ...KIT, 'shell/x.module.css': css, 'kit/layouts/x.module.css': css }).hits.filter((h) => h.rule === 'layout.cssGap')).toEqual([]);
    expect(gapHits(css, { 'kit/tokens.css': TOKENS }, ['layout.cssGap'])).toEqual([]);
  });
});

describe('anatomy detector: scopes and sites', () => {
  it('main content and two drawers in one file get three distinct scopes', () => {
    const hits = scan("import { Drawer, Section } from '@kit';\nexport function V() { return <div><Section title=\"m\"><p>x</p></Section><Drawer overlayId=\"a\"><p>a1</p></Drawer><Drawer overlayId=\"b\"><p>b1</p></Drawer></div>; }");
    expect(hits.filter((h) => h.rule === 'layout.text').map((h) => h.scope).sort()).toEqual(['main', 'overlay:a', 'overlay:b']);
  });
  it('a wrapper component rendered only inside a ConfirmDialog resolves to its overlay scope', () => {
    const hits = scan("import { ConfirmDialog } from '@kit';\nfunction Body() { return <p>sure</p>; }\nexport function V() { return <ConfirmDialog overlayId=\"del\"><Body /></ConfirmDialog>; }");
    expect(hits.filter((h) => h.rule === 'layout.text').map((h) => h.scope)).toEqual(['overlay:del']);
  });
  it('a page wrapper around the confirmation (forwarder) keeps the overlay id of the render site', () => {
    const hits = scan(
      "import { ConfirmDialog } from '@kit';\nfunction Del(p: any) { return <ConfirmDialog overlayId={p.id}><p>sure</p></ConfirmDialog>; }\nexport function V() { return <div><Del id=\"drop\" /></div>; }",
    );
    const t = hits.filter((h) => h.rule === 'layout.text').map((h) => h.scope);
    expect(t).toEqual(['overlay:drop']);
  });
  it('a component used both in main and in a drawer stays in main', () => {
    const hits = scan("import { Drawer } from '@kit';\nfunction Row() { return <p>r</p>; }\nexport function V() { return <div><Row /><Drawer overlayId=\"a\"><Row /></Drawer></div>; }");
    expect(hits.filter((h) => h.rule === 'layout.text').map((h) => h.scope)).toEqual(['main']);
  });
  it('a Dialog without a literal overlayId is a layout.overlayId hit', () => {
    expect(rulesOf(scan("import { Dialog } from '@kit';\nexport function V() { return <Dialog open />; }"))).toContain('layout.overlayId');
    expect(scan("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId=\"x\" />; }").filter((h) => h.rule === 'layout.overlayId')).toEqual([]);
  });
  it('one offending element in a row template rendered 50 times is one site', () => {
    const hits = scan('export function V() { return <div>{Array.from({ length: 50 }).map((_, i) => <p key={i}>hi</p>)}</div>; }');
    expect(hits.filter((h) => h.rule === 'layout.text')).toHaveLength(1);
  });
  it('a second offending sibling in the same row template counts again', () => {
    const hits = scan('export function V() { return <div>{rows.map((r) => <div key={r}><p>hi</p><p>there</p></div>)}</div>; }');
    expect(hits.filter((h) => h.rule === 'layout.text')).toHaveLength(2);
  });
  it('counts are keyed (rule, file, scope) and equal the number of authored sites', () => {
    const r = A.scan({ ...KIT, 'pages/x/view.tsx': 'export function V() { return <div><p>one</p><p>two</p></div>; }' });
    expect(r.counts['layout.text|pages/x/view.tsx|main']).toBe(2);
  });
});

describe('anatomy detector: slots and Visual (mutants)', () => {
  mutant('Visual with two short div lines', 'layout.visual', "import { Visual } from '@kit';\nexport function V() { return <Visual label=\"x\"><div>line one</div><div>line two</div></Visual>; }");
  mutant('a span tabIndex=0 inside Visual', 'layout.visual', "import { Visual } from '@kit';\nexport function V() { return <Visual label=\"x\"><span tabIndex={0} /></Visual>; }");
  mutant('contentEditable inside Visual', 'layout.visual', "import { Visual } from '@kit';\nexport function V() { return <Visual label=\"x\"><svg contentEditable /></Visual>; }");
  mutant('a raw button in SettingRow label', 'layout.slot', "import { SettingRow } from '@kit';\nexport function V() { return <SettingRow label={<button>x</button>} />; }");
  mutant('a prose div in a DataTable column cell', 'layout.slot', "import { DataTable } from '@kit';\nexport function V() { return <DataTable columns={[{ key: 'a', cell: () => <div>hello</div> }]} />; }", {}, ['layout.text']);
  mutant('a page div passed as ConversationView pane', 'layout.slot', "import { ConversationView } from '@kit';\nexport function V() { return <ConversationView pane={<div />} />; }");
  it('controls: a graphic Visual, an IdChip in a text slot and a Rail-less ConversationView stay clean', () => {
    expect(scan("import { Visual } from '@kit';\nexport function V() { return <Visual label=\"x\"><svg><path /></svg></Visual>; }")).toEqual([]);
    expect(scan("import { SettingRow, IdChip } from '@kit';\nexport function V() { return <SettingRow label={<IdChip />} />; }")).toEqual([]);
  });
});

// ── further cases: each fixture is one a simpler detector misses ──
const ids = (hits: Hit[], rule: string, file = 'pages/x/view.tsx') => hits.filter((h) => h.rule === rule && h.file === file);

describe('anatomy detector: re-exports are judged where they are used', () => {
  const cases: Array<[string, string, Record<string, string>]> = [
    ['a renamed import', "import { Panel as Box } from '@kit';\nexport function V() { return <Box /> ; }", {}],
    ['a page barrel', "import { Box } from './barrel';\nexport function V() { return <Box />; }", { 'pages/x/barrel.ts': "export { Panel as Box } from '@kit';" }],
    ['a chain two modules deep', "import { Crate } from './a';\nexport function V() { return <Crate />; }", { 'pages/x/a.ts': "export * from './b';", 'pages/x/b.ts': "export { Box as Crate } from './c';", 'pages/x/c.ts': "export { Panel as Box } from '@kit';" }],
  ];
  for (const [name, page, extra] of cases) {
    it(`${name}: the consuming file is hit once, in main`, () => {
      const hits = ids(scan(page, extra), 'layout.legacy');
      expect(hits).toHaveLength(1);
      expect(hits[0]?.scope).toBe('main');
    });
  }
});

describe('anatomy detector: React factory under any spelling', () => {
  mutant("an aliased createElement('h2')", 'layout.heading', "import { createElement as h } from 'react';\nexport function V() { return h('h2', null); }");
  mutant("React.createElement('h2')", 'layout.heading', "import React from 'react';\nexport function V() { return React.createElement('h2', null); }");
  mutant("a namespace import R.createElement('h2')", 'layout.heading', "import * as R from 'react';\nexport function V() { return R.createElement('h2', null); }");
  mutant('an aliased factory with text', 'layout.text', "import { createElement as h } from 'react';\nexport function V() { return h('p', null, 'x'); }");
  mutant('an aliased factory with a data-hub-* prop', 'layout.marker', "import { createElement as h } from 'react';\nexport function V() { return h('div', { 'data-hub-a': 1 }); }");
  mutant("a constant tag: const T = 'h2'; createElement(T)", 'layout.heading', "import { createElement } from 'react';\nconst T = 'h2';\nexport function V() { return createElement(T, null); }");
  mutant('a local const alias of the factory', 'layout.heading', "import { createElement } from 'react';\nconst make = createElement;\nexport function V() { return make('h2', null); }");
  mutant('a local re-export of the factory', 'layout.heading', "import { h } from './h';\nexport function V() { return h('h2', null); }", { 'pages/x/h.ts': "export { createElement as h } from 'react';" });
  it('controls: an unrelated function called createElement, or one imported from another module, hits nothing', () => {
    expect(scan("function createElement(t: string, ...r: unknown[]) { return [t, r]; }\nexport function V() { return createElement('h2', null); }")).toEqual([]);
    expect(scan("import { createElement } from './mine';\nexport function V() { return createElement('h2', null); }", { 'pages/x/mine.ts': 'export const createElement = (t: string, ...r: unknown[]) => [t, r];' })).toEqual([]);
    expect(scan("import { createElement as h } from 'react';\nexport function V() { return h(Tag, null); }")).toEqual([]);
  });
});

describe('anatomy detector: overlay ids forward only what they prove', () => {
  const ov = (page: string, extra: Record<string, string> = {}) => ids(scan(page, extra), 'layout.overlayId');
  it('an unrelated spread names no id: <Dialog {...{ open: true }} /> is a hit', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ open: true }} />; }")).toHaveLength(1);
  });
  it('a computed id and an id from a local that is not a prop are hits', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId={make()} />; }")).toHaveLength(1);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { const id = make(); return <Dialog overlayId={id} />; }")).toHaveLength(1);
  });
  it('a literal object spread that carries the id is a literal id', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ overlayId: 'x' }} />; }")).toEqual([]);
  });
  it('a forwarding wrapper is clean while a render site names the overlay, in every spelling of the forward', () => {
    const wrappers: Array<[string, string, string]> = [
      ['p.id', 'function W(p: any) { return <Dialog overlayId={p.id} />; }', 'id'],
      ['destructured', 'function W({ id }: any) { return <Dialog overlayId={id} />; }', 'id'],
      ['whole props spread', 'function W(p: any) { return <Dialog {...p} />; }', 'overlayId'],
      ['rest spread', 'function W({ open, ...rest }: any) { return <Dialog open={open} {...rest} />; }', 'overlayId'],
    ];
    for (const [name, def, prop] of wrappers) {
      expect(ov(`import { Dialog } from '@kit';\n${def}\nexport function V() { return <W ${prop}="a" />; }`), name).toEqual([]);
    }
  });
  it('a forwarding wrapper nobody renders (an exported root) is a hit: its id has no origin', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function Root(p: any) { return <Dialog overlayId={p.id} />; }")).toHaveLength(1);
  });
  it('a render site of a wrapper with a computed id is a hit at the render site', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { return <Dialog overlayId={p.id} />; }\nexport function V() { return <W id={pick()} />; }")).toHaveLength(1);
  });
  it('a chain of wrappers resolves through to the literal at the outermost render site', () => {
    const page = "import { Dialog } from '@kit';\nfunction Inner(p: any) { return <Dialog overlayId={p.id}><p>x</p></Dialog>; }\nfunction Outer(p: any) { return <Inner id={p.id} />; }\nexport function V() { return <Outer id=\"deep\" />; }";
    const hits = scan(page);
    expect(ids(hits, 'layout.overlayId')).toEqual([]);
    expect(ids(hits, 'layout.text').map((h) => h.scope)).toEqual(['overlay:deep']);
  });
});

describe("anatomy detector: Prose and Steps are the Guide's, wherever the barrel defines them", () => {
  const kit = { 'kit/index.ts': `${KIT['kit/index.ts']}\nexport { Prose } from './agent/Reply';`, 'kit/agent/Reply.tsx': 'export function Prose(p: any) { return <div>{p.text}</div>; }' };
  const page = "import { Prose } from '@kit';\nexport function V() { return <Prose text=\"x\" />; }";
  it('a non-Guide page rendering the barrel Prose is a hit; the Guide page is not', () => {
    expect(ids(scan(page, kit), 'layout.prose')).toHaveLength(1);
    const g = A.scan({ ...KIT, ...kit, 'pages/guide/view.tsx': page });
    expect(g.hits.filter((h) => h.rule === 'layout.prose')).toEqual([]);
  });
  it("the Bot conversation may draw its chat messages with Prose; the exception is that one file, not its folder", () => {
    const r = A.scan({ ...KIT, ...kit, 'pages/bots/parts/ActivityTab.tsx': page, 'pages/bots/parts/Other.tsx': page, 'pages/bots/parts/ActivityTab.tsx.bak.tsx': page });
    const files = r.hits.filter((h) => h.rule === 'layout.prose').map((h) => h.file).sort();
    expect(files).toEqual(['pages/bots/parts/ActivityTab.tsx.bak.tsx', 'pages/bots/parts/Other.tsx']);
  });
});

describe('anatomy detector: JavaScript modules are governed too', () => {
  it('a .jsx page module with a raw heading is a hit in that file', () => {
    const r = A.scan({ ...KIT, 'pages/x/view.tsx': "import { Off } from './off.jsx';\nexport function V() { return <Off />; }", 'pages/x/off.jsx': 'export function Off() { return <h2>raw</h2>; }' });
    expect(ids(r.hits, 'layout.heading', 'pages/x/off.jsx')).toHaveLength(1);
  });
  it('a .js module that holds JSX is read as JSX', () => {
    const r = A.scan({ ...KIT, 'pages/x/view.tsx': 'export const V = 1;', 'pages/x/off.js': 'export function Off() { return <h2>raw</h2>; }' });
    expect(ids(r.hits, 'layout.heading', 'pages/x/off.js')).toHaveLength(1);
  });
  it('a legacy Panel re-exported through a .jsx barrel is still caught at the consuming file', () => {
    expect(ids(scan("import { Box } from './barrel.jsx';\nexport function V() { return <Box />; }", { 'pages/x/barrel.jsx': "export { Panel as Box } from '@kit';" }), 'layout.legacy')).toHaveLength(1);
  });
});

describe('anatomy detector: slot content hoisted into a const', () => {
  mutant('a div hoisted into a const, passed as ConversationView pane', 'layout.slot', "import { ConversationView } from '@kit';\nexport function V() { const pane = <div />; return <ConversationView pane={pane} />; }");
  it('control: a hoisted IdChip in a text slot stays clean', () => {
    expect(scan("import { SettingRow, IdChip } from '@kit';\nexport function V() { const l = <IdChip />; return <SettingRow label={l} />; }")).toEqual([]);
  });
});

describe('anatomy detector: the editor cache follows the tree and the buffer', () => {
  it('lintHits rescans after a file changes on disk and when handed a different buffer', () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'lint-'));
    const f = path.join(dir, 'pages/x/view.tsx');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const dirty = 'export function V() { return <h2>x</h2>; }\n';
    const clean = 'export function V() { return <div />; }\n';
    fs.writeFileSync(f, dirty);
    expect(A.lintHits(dir, 'pages/x/view.tsx').map((h) => h.rule)).toContain('layout.heading');
    fs.writeFileSync(f, clean);
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(f, later, later);
    expect(A.lintHits(dir, 'pages/x/view.tsx')).toEqual([]);
    expect(A.lintHits(dir, 'pages/x/view.tsx', dirty).map((h) => h.rule)).toContain('layout.heading');
    expect(A.lintHits(dir, 'pages/x/view.tsx', clean)).toEqual([]);
    fs.unlinkSync(f);
  });
});

describe('anatomy detector: matchScreen grants an exemption to the call that feeds it, not to the file', () => {
  const nav = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { useSubPath, usePathname, matchScreen } from './nav';`,
    'kit/nav.tsx': 'export const useSubPath = (b: string) => [b]; export const usePathname = () => "/"; export const matchScreen = (p: unknown, s?: unknown) => p;',
  };
  const screens = (page: string, extra: Record<string, string> = {}) => ids(scan(page, { ...nav, ...extra }), 'layout.screens');
  it('a bare useSubPath, or a split usePathname, is a hit', () => {
    expect(screens("import { useSubPath } from '@kit';\nexport function V() { const p = useSubPath('/x'); return <div>{p}</div>; }")).toHaveLength(1);
    expect(screens("import { usePathname } from '@kit';\nexport function V() { const p = usePathname().split('/'); return <div>{p}</div>; }")).toHaveLength(1);
  });
  it('an imported but unused matchScreen, or one from another module, grants nothing', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); return <div>{p}</div>; }")).toHaveLength(1);
    expect(screens("import { useSubPath } from '@kit';\nimport { matchScreen } from './mine';\nexport function V() { const p = useSubPath('/x'); return matchScreen(p); }", { 'pages/x/mine.ts': 'export const matchScreen = (p: unknown) => p;' })).toHaveLength(1);
  });
  it('a renamed hook import is still the hook', () => {
    expect(screens("import { useSubPath as usp } from '@kit';\nexport function V() { const p = usp('/x'); return <div>{p}</div>; }")).toHaveLength(1);
  });
  it('the call whose value reaches matchScreen is clean, directly or through a const; a second call in the file is not', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { return matchScreen(useSubPath('/x')); }")).toEqual([]);
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); return matchScreen(p); }")).toEqual([]);
    expect(screens("import { usePathname, matchScreen } from '@kit';\nexport function V() { return matchScreen(usePathname().split('/')); }")).toEqual([]);
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const a = useSubPath('/x'); const b = useSubPath('/y'); matchScreen(a); return <div>{b}</div>; }")).toHaveLength(1);
  });
});

describe('anatomy detector:.mjs and.cjs modules are governed too', () => {
  for (const ext of ['mjs', 'cjs']) {
    it(`a .${ext} page module with a raw heading is a hit`, () => {
      const r = A.scan({ ...KIT, 'pages/x/view.tsx': 'export const V = 1;', [`pages/x/off.${ext}`]: 'export function Off() { return <h2>raw</h2>; }' });
      expect(ids(r.hits, 'layout.heading', `pages/x/off.${ext}`)).toHaveLength(1);
    });
  }
});

describe('anatomy detector: readTree reads every governed module extension', () => {
  it('reads .ts .tsx .js .jsx .mjs .cjs and .css, and ignores json and dotfiles', () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tree-'));
    fs.mkdirSync(path.join(dir, 'pages/x'), { recursive: true });
    for (const f of ['a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.mjs', 'f.cjs', 'g.css', 'h.json', '.i.ts']) fs.writeFileSync(path.join(dir, 'pages/x', f), '');
    const t = (A as unknown as { readTree(d: string): Record<string, string> }).readTree(dir);
    expect(Object.keys(t).sort()).toEqual(['pages/x/a.ts', 'pages/x/b.tsx', 'pages/x/c.js', 'pages/x/d.jsx', 'pages/x/e.mjs', 'pages/x/f.cjs', 'pages/x/g.css']);
  });
});

// ── effective props in source order, per-prop forwarding, lexical bindings ──
describe('anatomy detector: overlay ids resolve in source order and per forwarded prop', () => {
  const ov = (page: string, extra: Record<string, string> = {}) => ids(scan(page, extra), 'layout.overlayId');
  it('an explicit computed attribute after a literal spread overrides it: a hit, and no literal scope', () => {
    const hits = scan("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ overlayId: 'a' }} overlayId={pick()}><p>x</p></Dialog>; }");
    expect(ids(hits, 'layout.overlayId')).toHaveLength(1);
    expect(ids(hits, 'layout.text').map((h) => h.scope)).toEqual(['main']);
  });
  it('a literal after a computed one is the effective id; a literal attribute before a props spread is overridden by it', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId={pick()} {...{ overlayId: 'a' }} />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ overlayId: pick() }} overlayId=\"a\" />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId=\"a\" {...{ overlayId: pick() }} />; }")).toHaveLength(1);
  });
  it('a rest binding that had the id destructured out forwards nothing', () => {
    const page = "import { Dialog } from '@kit';\nfunction W({ overlayId, ...rest }: any) { return <Dialog {...rest} />; }\nexport function V() { return <W overlayId=\"x\" />; }";
    expect(ov(page)).toHaveLength(1);
    const ok = "import { Dialog } from '@kit';\nfunction W({ open, ...rest }: any) { return <Dialog open={open} {...rest} />; }\nexport function V() { return <W overlayId=\"x\" />; }";
    expect(ov(ok)).toEqual([]);
  });
  it('a wrapper that forwards two props needs both named at every render site', () => {
    const w = "import { Dialog } from '@kit';\nfunction W(p: any) { return <div><Dialog overlayId={p.a} /><Dialog overlayId={p.b} /></div>; }\n";
    expect(ov(`${w}export function V() { return <W a="x" b="y" />; }`)).toEqual([]);
    expect(ov(`${w}export function V() { return <W a="x" b={pick()} />; }`)).toHaveLength(1);
    expect(ov(`${w}export function V() { return <W a="x" />; }`)).toHaveLength(1);
  });
});

describe('anatomy detector: names mean the binding they resolve to', () => {
  const nav = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { useSubPath, matchScreen } from './nav';`,
    'kit/nav.tsx': 'export const useSubPath = (b: string) => [b]; export const matchScreen = (p: unknown, s?: unknown) => p;',
  };
  const screens = (page: string) => ids(scan(page, nav), 'layout.screens');
  it('a nested parameter with the same name does not carry the hook value to matchScreen', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); const other = (p: string[]) => matchScreen(p); return <div>{p}{other}</div>; }")).toHaveLength(1);
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); function f() { const p = 1; return matchScreen(p); } return <div>{p}{f()}</div>; }")).toHaveLength(1);
  });
  it('the same variable reaching matchScreen from a nested function is still the exemption', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); const go = () => matchScreen(p); return <div>{go()}</div>; }")).toEqual([]);
  });
  it('a local function named matchScreen is not the kit one', () => {
    expect(screens("import { useSubPath } from '@kit';\nexport function V() { const matchScreen = (x: unknown) => x; const p = useSubPath('/x'); return matchScreen(p); }")).toHaveLength(1);
  });
  it('a parameter or local named like the imported React factory is not the factory', () => {
    expect(scan("import { createElement as h } from 'react';\nfunction collect(h: any) { return h('h2'); }\nexport function V() { return collect(1); }")).toEqual([]);
    expect(scan("import { createElement as h } from 'react';\nexport function V() { const h = (t: string) => t; return h('h2'); }")).toEqual([]);
    expect(scan("import React from 'react';\nfunction f(React: any) { return React.createElement('h2'); }\nexport function V() { return f(1); }")).toEqual([]);
  });
  it('the factory is still found through a local const alias of the import', () => {
    expect(ids(scan("import { createElement as h } from 'react';\nexport function V() { const make = h; return make('h2'); }"), 'layout.heading')).toHaveLength(1);
  });
});

// ── computed keys and nested spreads, shadowed props, per-prop scopes, bindings, helper flow ──
describe('anatomy detector: an overlay id is the last write to it, computed keys and nested spreads included', () => {
  const ov = (page: string) => ids(scan(page), 'layout.overlayId');
  it('a statically computed key is the key it spells', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ ['overlayId']: 'a' }} />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog {...{ overlayId: 'a', ['overlayId']: pick() }} />; }")).toHaveLength(1);
  });
  it('a nested object spread is applied in order', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId=\"a\" {...{ ...{ overlayId: pick() } }} />; }")).toHaveLength(1);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { return <Dialog overlayId={pick()} {...{ ...{ overlayId: 'a' } }} />; }")).toEqual([]);
  });
  it('a forwarded prop replaced by a later computed key is not forwarded', () => {
    const page = "import { Dialog } from '@kit';\nfunction W(p: any) { return <Dialog {...{ overlayId: p.id, ['overlayId']: pick() }} />; }\nexport function V() { return <W id=\"a\" />; }";
    expect(ov(page)).toHaveLength(1);
  });
  it('a rest binding that had the id destructured out under a computed key forwards nothing', () => {
    const page = "import { Dialog } from '@kit';\nfunction W({ ['overlayId']: removed, ...rest }: any) { return <Dialog {...rest} />; }\nexport function V() { return <W overlayId=\"a\" />; }";
    expect(ov(page)).toHaveLength(1);
  });
});

describe('anatomy detector: a forwarded prop is the component\'s own, not a nested name of the same spelling', () => {
  const ov = (page: string) => ids(scan(page), 'layout.overlayId');
  it('a callback parameter shadowing the destructured prop forwards nothing', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W({ overlayId }: any) { return [pick()].map((overlayId) => <Dialog {...{ overlayId }} />); }\nexport function V() { return <W overlayId=\"a\" />; }")).toHaveLength(1);
  });
  it('a nested parameter shadowing the props object forwards nothing', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { return [pick()].map((p) => <Dialog overlayId={p.id} />); }\nexport function V() { return <W id=\"a\" />; }")).toHaveLength(1);
  });
  it('props captured by a nested callback still forward', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { return [1].map(() => <Dialog overlayId={p.id} />); }\nexport function V() { return <W id=\"a\" />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nfunction W({ overlayId }: any) { return [1].map(() => <Dialog overlayId={overlayId} />); }\nexport function V() { return <W overlayId=\"a\" />; }")).toEqual([]);
  });
  it('p["id"] forwards like p.id', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { return <Dialog overlayId={p['id']} />; }\nexport function V() { return <W id=\"a\" />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { return <Dialog overlayId={p['id']} />; }\nexport function V() { return <W />; }")).toHaveLength(1);
  });
});

describe('anatomy detector: each forwarded prop names its own dialog\'s scope', () => {
  const w = "import { Dialog } from '@kit';\nfunction W(p: any) { return <div><Dialog overlayId={p.a}><p>A</p></Dialog><Dialog overlayId={p.b}><p>B</p></Dialog></div>; }\n";
  it('contents of the second dialog take the caller\'s attribute for the second prop', () => {
    const hits = scan(`${w}export function V() { return <W a="x" b="y" />; }`);
    expect(ids(hits, 'layout.text').map((h) => h.scope).sort()).toEqual(['overlay:x', 'overlay:y']);
  });
  it('a valid caller and an invalid one are both judged, in either order', () => {
    const call = (v: string) => ids(scan(`${w}${v}`), 'layout.overlayId');
    expect(call('export function V() { return <W a="x" b="y" />; }\nexport function U() { return <W a="x" />; }')).toHaveLength(1);
    expect(call('export function U() { return <W a="x" />; }\nexport function V() { return <W a="x" b="y" />; }')).toHaveLength(1);
  });
});

describe('anatomy detector: one binding has one answer', () => {
  const nav = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { useSubPath, matchScreen } from './nav';`,
    'kit/nav.tsx': 'export const useSubPath = (b: string) => [b]; export const matchScreen = (p: unknown, s?: unknown) => p;',
  };
  const screens = (page: string) => ids(scan(page, nav), 'layout.screens');
  it('a var declared twice is one variable: the second declaration feeding matchScreen is the exemption', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { var p; var p = useSubPath('/x'); return matchScreen(p); }")).toEqual([]);
  });
  it('a switch shares one lexical scope across its clauses', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V(k: number) { switch (k) { case 1: { return null; } default: const p = useSubPath('/x'); case 2: return matchScreen(p); } }")).toEqual([]);
  });
  it('a named class expression binds its own name inside itself, never the import', () => {
    const page = "import React from 'react';\nconst C = class React { static createElement(t: string) { return t; } static read() { return React.createElement('h2'); } };\nexport function V() { return <div>{C.read()}</div>; }";
    expect(ids(scan(page), 'layout.heading')).toEqual([]);
  });
  it('a callee shadowing the kit matchScreen in a nested scope grants nothing', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); const f = () => { const matchScreen = (x: unknown) => x; return matchScreen(p); }; return <div>{f()}</div>; }")).toHaveLength(1);
  });
});

describe('anatomy detector: a hook value handed to matchScreen through a local helper is still the exemption', () => {
  const nav = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { useSubPath, matchScreen } from './nav';`,
    'kit/nav.tsx': 'export const useSubPath = (b: string) => [b]; export const matchScreen = (p: unknown, s?: unknown) => p;',
  };
  const screens = (page: string) => ids(scan(page, nav), 'layout.screens');
  it('a nested function declaration receiving the value and calling matchScreen', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); return route(p); function route(p: string[]) { return matchScreen(p); } }")).toEqual([]);
  });
  it('a helper const arrow, and a helper that passes it on again', () => {
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); const route = (q: string[]) => matchScreen(q); return route(p); }")).toEqual([]);
    expect(screens("import { useSubPath, matchScreen } from '@kit';\nexport function V() { const p = useSubPath('/x'); const a = (q: string[]) => b(q); const b = (r: string[]) => matchScreen(r); return a(p); }")).toEqual([]);
  });
  it('a helper that never hands it to matchScreen, or a recursive one, grants nothing', () => {
    expect(screens("import { useSubPath } from '@kit';\nexport function V() { const p = useSubPath('/x'); return route(p); function route(q: string[]) { return q; } }")).toHaveLength(1);
    expect(screens("import { useSubPath } from '@kit';\nexport function V() { const p = useSubPath('/x'); return loop(p); function loop(q: string[]): unknown { return loop(q); } }")).toHaveLength(1);
  });
});

// ── a key computed from a variable is unresolved, so it fails closed ──
describe('anatomy detector: a variable-computed key in an inline spread fails closed', () => {
  const ov = (page: string) => ids(scan(page), 'layout.overlayId');
  it('such a key after a literal id leaves the id unnamed, directly or inside a nested inline spread', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V({ k }: any) { return <Dialog overlayId=\"a\" {...{ [k]: pick() }} />; }")).toHaveLength(1);
    expect(ov("import { Dialog } from '@kit';\nexport function V({ k }: any) { return <Dialog overlayId=\"a\" {...{ ...{ [k]: pick() } }} />; }")).toHaveLength(1);
  });
  it('a forwarded prop followed by such a key is not forwarded', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { const k = p.k; return <Dialog overlayId={p.id} {...{ [k]: 1 }} />; }\nexport function V() { return <W id=\"a\" />; }")).toHaveLength(1);
  });
  it('a literal written after it is the effective id again', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V({ k }: any) { return <Dialog {...{ [k]: pick() }} overlayId=\"b\" />; }")).toEqual([]);
    expect(ov("import { Dialog } from '@kit';\nexport function V({ k }: any) { return <Dialog {...{ [k]: pick(), overlayId: 'b' }} />; }")).toEqual([]);
  });
  it('a spread of an unknown identifier keeps the earlier literal (accepted: it is common)', () => {
    expect(ov("import { Dialog } from '@kit';\nexport function V({ rest }: any) { return <Dialog overlayId=\"a\" {...rest} />; }")).toEqual([]);
  });
});

// ── alias objects, wrapper chains, var scopes, helper stacks ──
describe('anatomy detector: precision cases', () => {
  const ov = (page: string) => ids(scan(page), 'layout.overlayId');
  const nav = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { useSubPath, matchScreen } from './nav';`,
    'kit/nav.tsx': 'export const useSubPath = (b: string) => [b]; export const matchScreen = (p: unknown, s?: unknown) => p;',
  };
  const screens = (page: string) => ids(scan(page, nav), 'layout.screens');
  const head = "import { useSubPath, matchScreen } from '@kit';\n";
  it('a spread of a local inline-object alias is applied like the inline object', () => {
    expect(ov("import { Dialog } from '@kit';\nfunction W(p: any) { const replacement = { overlayId: pick() }; return <Dialog {...{ overlayId: p.id, ...replacement }} />; }\nexport function V() { return <W id=\"a\" />; }")).toHaveLength(1);
    expect(ov("import { Dialog } from '@kit';\nexport function V() { const named = { overlayId: 'a' }; return <Dialog overlayId={pick()} {...named} />; }")).toEqual([]);
  });
  it('the second prop keeps its own scope through an intermediate wrapper', () => {
    const page = "import { Dialog } from '@kit';\nfunction W(p: any) { return <><Dialog overlayId={p.a}><p>A</p></Dialog><Dialog overlayId={p.b}><p>B</p></Dialog></>; }\nfunction Outer(p: any) { return <W a={p.x} b={p.y} />; }\nexport function V() { return <Outer x=\"x\" y=\"y\" />; }";
    expect(ids(scan(page), 'layout.text').map((h) => h.scope).sort()).toEqual(['overlay:x', 'overlay:y']);
  });
  it('a var in a class static block or a namespace is not the enclosing function\'s', () => {
    expect(ids(scan("import React from 'react';\nexport function V() { class C { static { var React = 1; } } return React.createElement('h2'); }"), 'layout.heading')).toHaveLength(1);
  });
  it('a failed deep helper visit does not block a shallower one, in either call order', () => {
    const fns = 'function a(q: string[]) { return b(q); }\nfunction b(q: string[]) { return h(q); }\nfunction h(q: string[]) { return end(q); }\nfunction end(q: string[]) { return matchScreen(q); }\n';
    expect(screens(`${head}${fns}export function V() { const p = useSubPath('/x'); a(p); return h(p); }`)).toEqual([]);
    expect(screens(`${head}${fns}export function V() { const p = useSubPath('/x'); h(p); return a(p); }`)).toEqual([]);
  });
  it('a reassignable function value is not followed as a helper; a const one is', () => {
    expect(screens(`${head}export function V() { const p = useSubPath('/x'); let route = (q: string[]) => matchScreen(q); route = (q: string[]) => q; return route(p); }`)).toHaveLength(1);
    expect(screens(`${head}export function V() { const p = useSubPath('/x'); const route = (q: string[]) => matchScreen(q); return route(p); }`)).toEqual([]);
  });
});

// ── the new scope boundaries resolve their own bindings; an alias is read through the binding the name resolves to ──
describe('anatomy detector: scope boundaries keep their own bindings, aliases follow the resolved binding', () => {
  const heading = (page: string) => ids(scan(page), 'layout.text');
  it('a var declared inside a class static block is that block\'s own, while the outer import is still the import', () => {
    const inner = "import React from 'react';\nexport function V() { class C { static { var React = { createElement: (...a: unknown[]) => null }; React.createElement('p', null, 'payload'); } } return null; }";
    expect(heading(inner)).toEqual([]);
    expect(ids(scan("import React from 'react';\nexport function V() { class C { static { var React = 1; } } return React.createElement('h2'); }"), 'layout.heading')).toHaveLength(1);
  });
  it('a var declared inside a namespace is that namespace\'s own', () => {
    const page = "import React from 'react';\nnamespace N { var React = { createElement: (...a: unknown[]) => null }; export function V() { return React.createElement('p', null, 'payload'); } }\nexport const X = 1;";
    expect(heading(page)).toEqual([]);
  });
  it('a loop binding that shadows an outer object alias is not that object', () => {
    expect(ids(scan("import { Dialog } from '@kit';\nconst extra = { overlayId: undefined };\nexport function V() { for (const extra of [{ title: 'Hello' }]) { return <Dialog overlayId=\"a\" {...extra} />; } return null; }"), 'layout.overlayId')).toEqual([]);
    expect(ids(scan("import { Dialog } from '@kit';\nexport function V() { const extra = { overlayId: undefined }; return <Dialog overlayId=\"a\" {...extra} />; }"), 'layout.overlayId')).toHaveLength(1);
  });
  it('each dialog\'s contents keep their own scope through a wrapper chain, line by line', () => {
    const page = "import { Dialog } from '@kit';\nfunction W(p: any) { return <>\n<Dialog overlayId={p.a}><p>A</p></Dialog>\n<Dialog overlayId={p.b}><p>B</p></Dialog>\n</>; }\nfunction Outer(p: any) { return <W a={p.x} b={p.y} />; }\nexport function V() { return <Outer x=\"x\" y=\"y\" />; }";
    const byLine = ids(scan(page), 'layout.text').map((h) => `${h.line}:${h.scope}`).sort();
    expect(byLine).toEqual(['3:overlay:x', '4:overlay:y']);
  });
});

// ── the slot table knows PageHeader.actions, DetailPage.notice and what an `empty` slot takes; a fragment is judged through its expression children and text ──
describe('anatomy detector: slot table entries for PageHeader.actions, DetailPage.notice and the empty slot', () => {
  const heads = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { PageHeader, DetailPage } from './layouts/Head';\nexport { FirstUseState, NoAccessState, ErrorState } from './states/Recipes';\nexport { SessionView } from './agent/SessionView';\nexport { PauseBand } from './agent/PauseX';\nexport { Link } from './controls/LinkX';`,
    'kit/layouts/Head.tsx': 'export function PageHeader(p: any) { return <header>{p.actions}</header>; }\nexport function DetailPage(p: any) { return <main>{p.notice}</main>; }',
    'kit/states/Recipes.tsx': 'export function FirstUseState(p: any) { return <div />; }\nexport function NoAccessState(p: any) { return <div />; }\nexport function ErrorState(p: any) { return <div />; }',
    'kit/agent/SessionView.tsx': 'export function SessionView(p: any) { return <div>{p.empty}</div>; }',
    'kit/agent/PauseX.tsx': 'export function PauseBand(p: any) { return <div />; }',
    'kit/controls/LinkX.tsx': 'export function Link(p: any) { return <a />; }',
  };
  const slots = (page: string) => ids(scan(page, heads), 'layout.slot');
  const imp = "import { PageHeader, DetailPage, Button, Band, EmptyState, ErrorState, FirstUseState, NoAccessState, DataTable, ConversationView, SessionView, IdChip, Link, PauseBand } from '@kit';\n";
  const page = (jsx: string) => `${imp}export function V() { return ${jsx}; }`;
  it('PageHeader.actions takes actions, and only those', () => {
    expect(slots(page('<PageHeader title="a" actions={<Button>go</Button>} />'))).toEqual([]);
    expect(slots(page('<PageHeader title="a" actions={<Band>x</Band>} />'))).toHaveLength(1);
    expect(slots(page('<PageHeader title="a" actions={<div>x</div>} />'))).toHaveLength(1);
  });
  it('DetailPage.notice takes notices, and only those', () => {
    expect(slots(page('<DetailPage notice={<Band>x</Band>} />'))).toEqual([]);
    expect(slots(page('<DetailPage notice={<Button>go</Button>} />'))).toHaveLength(1);
  });
  it('ConversationView.top takes notices (a Band, the kit\'s PauseBand), and only those', () => {
    expect(slots(page('<ConversationView top={<PauseBand />} />'))).toEqual([]);
    expect(slots(page('<ConversationView top={<Band>x</Band>} />'))).toEqual([]);
    expect(slots(page('<ConversationView top={<Button>go</Button>} />'))).toHaveLength(1);
    expect(slots(page('<ConversationView top={<div>x</div>} />'))).toHaveLength(1);
  });
  const owners: Array<[string, (el: string) => string]> = [
    ['DataTable', (el) => `<DataTable empty={${el}} />`],
    ['ConversationView', (el) => `<ConversationView empty={${el}} />`],
    ['SessionView', (el) => `<SessionView empty={${el}} />`],
  ];
  const recipes: Record<string, string> = {
    EmptyState: '<EmptyState title="none" body="b" action={<Button>go</Button>} secondary={<Button>more</Button>} hint={<IdChip />} />',
    FirstUseState: '<FirstUseState title="none" body={<IdChip />} action={<Button>go</Button>} learn={<Link>how</Link>} hint={<IdChip />} />',
    NoAccessState: '<NoAccessState title="none" body={<IdChip />} action={<Button>back</Button>} />',
  };
  for (const [name, el] of Object.entries(recipes)) {
    for (const [owner, wrap] of owners) {
      it(`an empty slot takes a complete <${name}>, in ${owner}`, () => {
        expect(slots(page(wrap(el)))).toEqual([]);
      });
    }
  }
  for (const [owner, wrap] of owners) {
    it(`an empty slot in ${owner} refuses an ErrorState and anything else`, () => {
      expect(slots(page(wrap('<ErrorState title="failed" />')))).toHaveLength(1);
      expect(slots(page(wrap('<Button>go</Button>')))).toHaveLength(1);
      expect(slots(page(wrap('<p>none</p>')))).toHaveLength(1);
    });
  }
  it('a recipe\'s own action is an actions slot: a Band there is a hit', () => {
    expect(slots(page('<DataTable empty={<FirstUseState title="t" body="b" action={<Band>x</Band>} />} />'))).toHaveLength(1);
    expect(slots(page('<NoAccessState action={<Band>x</Band>} />'))).toHaveLength(1);
  });
  describe('a fragment is judged through its expression children and its text', () => {
    it('{cond && <X />} and a .map inside a fragment are judged like the element beside them', () => {
      expect(slots(page('<DetailPage notice={<><Band>n</Band>{true && <Button>wrong</Button>}</>} />'))).toHaveLength(1);
      expect(slots(page('<PageHeader title="a" actions={<><Button>a</Button>{true && <Band>wrong</Band>}</>} />'))).toHaveLength(1);
      expect(slots(page('<DataTable empty={<><EmptyState title="n" />{true && <Button>wrong</Button>}</>} />'))).toHaveLength(1);
      expect(slots(page('<DetailPage notice={<>{[1].map(() => <Button>wrong</Button>)}</>} />'))).toHaveLength(1);
    });
    it('the same fragments with the right kinds are clean', () => {
      expect(slots(page('<DetailPage notice={<><Band>n</Band>{true && <Band>m</Band>}</>} />'))).toEqual([]);
      expect(slots(page('<PageHeader title="a" actions={<><Button>a</Button>{true && <Button>b</Button>}</>} />'))).toEqual([]);
    });
    it('visible text is refused where only elements fit, and allowed in a text slot', () => {
      expect(slots(page('<DetailPage notice={<>loose words<Band>n</Band></>} />'))).toHaveLength(1);
      expect(slots(page('<PageHeader title="a" actions={<>loose words<Button>a</Button></>} />'))).toHaveLength(1);
      expect(slots(page('<EmptyState title="t" body={<>some words <IdChip /></>} />'))).toEqual([]);
    });
    it('character references that render as whitespace are not text; the ones that render a character are', () => {
      for (const ws of ['&#32;', '&#x20;', '&#X20;', '&nbsp;', '&#160;', '&#xA0;', '&ensp;', '&thinsp;', ' &nbsp; ']) {
        expect(slots(page(`<PageHeader title="a" actions={<><Button>a</Button>${ws}<Button>b</Button></>} />`))).toEqual([]);
        expect(slots(page(`<DetailPage notice={<><Band>n</Band>${ws}<Band>m</Band></>} />`))).toEqual([]);
        expect(slots(page(`<DataTable empty={<><EmptyState title="n" />${ws}</>} />`))).toEqual([]);
      }
      for (const word of ['&amp;', '&#65;', '&#x41;', '&copy;', 'x&nbsp;y', '&bogus;']) {
        expect(slots(page(`<PageHeader title="a" actions={<><Button>a</Button>${word}<Button>b</Button></>} />`))).toHaveLength(1);
        expect(slots(page(`<DetailPage notice={<><Band>n</Band>${word}</>} />`))).toHaveLength(1);
        expect(slots(page(`<DataTable empty={<>${word}<EmptyState title="n" /></>} />`))).toHaveLength(1);
      }
    });
  });
});

// ── FaqLink is a `text` and an `actions` slot element; a raw <p> there is still a hit ──
describe('anatomy detector: FaqLink in the text and actions slots', () => {
  const faq = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { PageHeader } from './layouts/Head';\nexport { FirstUseState } from './states/Recipes';\nexport { FaqLink } from './layouts/Faq';`,
    'kit/layouts/Head.tsx': 'export function PageHeader(p: any) { return <header>{p.actions}</header>; }',
    'kit/states/Recipes.tsx': 'export function FirstUseState(p: any) { return <div>{p.learn}</div>; }',
    'kit/layouts/Faq.tsx': 'export function FaqLink(p: any) { return <button />; }',
  };
  const slots = (page: string) => ids(scan(page, faq), 'layout.slot');
  const page = (jsx: string) => `import { PageHeader, FirstUseState, FaqLink } from '@kit';\nexport function V({ item }: any) { return ${jsx}; }`;
  it('a FaqLink in FirstUseState.learn is clean, a raw <p> there is a hit', () => {
    expect(slots(page('<FirstUseState title="t" body="b" learn={<FaqLink item={item}>How?</FaqLink>} />'))).toEqual([]);
    expect(slots(page('<FirstUseState title="t" body="b" learn={<p>How?</p>} />'))).toHaveLength(1);
  });
  it('a FaqLink in PageHeader.actions is clean, a raw <p> there is a hit', () => {
    expect(slots(page('<PageHeader title="a" actions={<FaqLink item={item}>How?</FaqLink>} />'))).toEqual([]);
    expect(slots(page('<PageHeader title="a" actions={<p>How?</p>} />'))).toHaveLength(1);
  });
});

describe('anatomy detector: localDecl is exported for the term counter', () => {
  /** The declaration text `localDecl` gives the LAST identifier named `name` in `source`, or null (an import or a global). */
  const decl = (source: string, name: string): string | null => {
    const sf = A.createProject({ 'a.tsx': source }).sourceOf('a.tsx');
    const ids: TsNode[] = [];
    const walk = (n: TsNode) => {
      if (n.escapedText !== undefined && n.text === name) ids.push(n);
      n.getChildren(sf).forEach(walk);
    };
    walk(sf);
    const d = A.localDecl!(ids[ids.length - 1]!);
    return d ? d.getText(sf) : null;
  };

  it('is a function on the module', () => expect(typeof A.localDecl).toBe('function'));
  it('the exports the other detectors rely on are still there', () => {
    for (const k of ['RULES', 'scan', 'createProject', 'countKeys', 'compareDebt', 'keyOf', 'parseKey', 'isTestFile', 'isSourceFile']) expect(Object.keys(A)).toContain(k);
  });
  it('a parameter resolves to the parameter', () => expect(decl('function f(a) { return a; }', 'a')).toBe('a'));
  it('a destructured parameter resolves to the whole parameter', () => expect(decl('function f({ a }) { return a; }', 'a')).toBe('{ a }'));
  it('the nearest scope wins: a block-scoped const shadows the parameter', () => expect(decl('function f(a) { { const a = 1; return a; } }', 'a')).toBe('a = 1'));
  it('a var hoists to its function', () => expect(decl('function f() { if (c) { var a = 1; } return a; }', 'a')).toBe('a = 1'));
  it('a function declaration resolves to the declaration', () => expect(decl('function g() {}\ng();', 'g')).toBe('function g() {}'));
  it('a catch variable and a for-initializer resolve', () => {
    expect(decl('try {} catch (e) { e; }', 'e')).toBe('e');
    expect(decl('for (const i of xs) { i; }', 'i')).toBe('i');
  });
  it('an import is not local', () => expect(decl("import { a } from 'x';\na();", 'a')).toBeNull());
  it('a global is not local', () => expect(decl('window.x;', 'window')).toBeNull());
  it('a name declared in another function is not local', () => expect(decl('function f() { const a = 1; }\nfunction h() { return a; }', 'a')).toBeNull());
});

describe('anatomy detector: a manifest\'s subLayouts', () => {
  const kit = {
    ...KIT,
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport { definePage } from './page';\nexport { TablePage, DetailPage } from './archetypes';`,
    'kit/page.ts': 'export const definePage = (m: any) => m;',
    'kit/archetypes.tsx': 'export function TablePage(p: any) { return <main>{p.children}</main>; }\nexport function DetailPage(p: any) { return <main>{p.children}</main>; }',
  };
  const VIEW = "import { TablePage } from '@kit';\nexport default function V() { return <TablePage />; }";
  const manifest = (pre: string, sub: string) =>
    `import { definePage } from '@kit';\n${pre}\nexport default definePage({ id: 'x', path: '/x', title: 't', layout: 'detail', screens: [], ${sub} load: () => import('./view'), status: 'hidden', sensitive: false, strings: {} });`;
  const manifestHits = (pre: string, sub: string, disabled: string[] = []) =>
    A.scan({ ...kit, 'pages/x/view.tsx': VIEW, 'pages/x/page.ts': manifest(pre, sub) }, { disabled }).hits.filter((h) => h.rule === 'layout.manifest' && h.file === 'pages/x/page.ts');
  it('an inline literal is read: a sub-layout naming the root\'s layout clears the root check, an empty one does not', () => {
    expect(manifestHits('', "subLayouts: { list: 'table' },")).toEqual([]);
    expect(manifestHits('', 'subLayouts: {},')).toHaveLength(1);
    expect(manifestHits('', '')).toHaveLength(1);
  });
  it('a subLayouts the rule cannot read is a hit, never a silent skip of the root check', () => {
    const unread: [string, string][] = [
      ["const L = { list: 'table' } as const;", 'subLayouts: L,'],
      ["const L = { list: 'table' } as const;", 'subLayouts: { ...L },'],
      ["const T = 'table';", 'subLayouts: { list: T },'],
    ];
    for (const [pre, sub] of unread) {
      expect(manifestHits(pre, sub), sub).toHaveLength(1);
      expect(manifestHits(pre, sub, ['layout.manifest']), sub).toEqual([]);
    }
  });
});

describe('anatomy detector: slot content a same-file function returns', () => {
  mutant('a div a const arrow returns, called as ConversationView pane', 'layout.slot', "import { ConversationView } from '@kit';\nconst wrap = (x: any) => <div>{x}</div>;\nexport function V() { return <ConversationView pane={wrap(1)} />; }");
  mutant('a div a function declaration returns, called as a SettingRow label', 'layout.slot', "import { SettingRow } from '@kit';\nfunction lab() { if (Math.random()) return <div />; return <span />; }\nexport function V() { return <SettingRow label={lab()} />; }");
  mutant('a div an inner helper returns, called in a ternary', 'layout.slot', "import { ConversationView } from '@kit';\nexport function V({ on }: any) { const wrap = () => <div />; return <ConversationView pane={on ? wrap() : null} />; }");
  it('control: a local function returning an IdChip in a text slot stays clean', () => {
    expect(scan("import { SettingRow, IdChip } from '@kit';\nconst lab = () => <IdChip />;\nexport function V() { return <SettingRow label={lab()} />; }")).toEqual([]);
  });
  it('each function is one authored site: called twice in one slot it is one hit, and both of its returns count', () => {
    const twice = scan("import { SettingRow } from '@kit';\nconst f = () => <div />;\nexport function V({ on }: any) { return <SettingRow label={on ? f() : f()} />; }");
    expect(twice.filter((h) => h.rule === 'layout.slot')).toHaveLength(1);
    const two = scan("import { SettingRow } from '@kit';\nfunction lab(x: any) { if (x) return <div />; return <p />; }\nexport function V() { return <SettingRow label={lab(1)} />; }");
    expect(two.filter((h) => h.rule === 'layout.slot').map((h) => h.msg).sort()).toEqual(['SettingRow.label: a raw <div> in a text slot', 'SettingRow.label: a raw <p> in a text slot']);
  });
  it.each(['on ? [1, 2].map(f) : f(0)', 'on ? f(0) : [1, 2].map(f)'])('a site reached as a .map callback and as a direct call is one hit: %s', (label) => {
    const hits = scan(`import { SettingRow } from '@kit';\nconst f = (x: number) => <div>{x}</div>;\nexport function V({ on }: any) { return <SettingRow label={${label}} />; }`);
    expect(hits.filter((h) => h.rule === 'layout.slot')).toHaveLength(1);
  });
  it.each(['on ? [[[[[[[f()]]]]]]] : f()', 'on ? f() : [[[[[[[f()]]]]]]]'])('an expansion the depth limit cuts never hides a shallower call of the same helper: %s', (label) => {
    const hits = scan(`import { SettingRow } from '@kit';\nconst f = () => <div />;\nexport function V({ on }: any) { return <SettingRow label={${label}} />; }`);
    expect(hits.filter((h) => h.rule === 'layout.slot')).toHaveLength(1);
  });
  it('a helper that calls itself, or two that call each other, through a fragment ends (slots and hand-written action rows)', () => {
    const self = "import { SettingRow, IdChip } from '@kit';\nfunction label(n: number): any { return n > 0 ? <>{label(n - 1)}</> : <IdChip />; }\nexport function V() { return <SettingRow label={label(3)} />; }";
    expect(scan(self)).toEqual([]);
    const mutual = "import { SettingRow, IdChip } from '@kit';\nfunction a(n: number): any { return n > 0 ? <>{b(n - 1)}</> : <IdChip />; }\nfunction b(n: number): any { return <>{a(n)}</>; }\nexport function V() { return <SettingRow label={a(3)} />; }";
    expect(scan(mutual)).toEqual([]);
    const selfRaw = "import { SettingRow } from '@kit';\nfunction label(n: number): any { return n > 0 ? <>{label(n - 1)}</> : <div />; }\nexport function V() { return <SettingRow label={label(3)} />; }";
    expect(scan(selfRaw).filter((h) => h.rule === 'layout.slot')).toHaveLength(1);
    const row = "import { Button } from '@kit';\nfunction acts(n: number): any { return n > 0 ? <>{acts(n - 1)}</> : <Button />; }\nexport function V() { return <div>{acts(2)}</div>; }";
    expect(() => scan(row)).not.toThrow();
  });
  // A node an early return left unchecked (the <p> behind the first fragment's <div>) is still checked through the
  // second fragment, in either order and through every slot caller
  const shared = "const raw = <p />;\nconst first = <>{[<div />, raw]}</>;\nconst second = <>{raw}</>;\n";
  const callers = [
    ['SettingRow label', 'SettingRow', (xs: string) => `<SettingRow label={${xs}} />`],
    ['DataTable cell', 'DataTable', (xs: string) => `<DataTable columns={[{ key: 'a', cell: () => ${xs} }]} />`],
    ['Band render-function children', 'Band', (xs: string) => `<Band>{() => ${xs}}</Band>`],
  ] as const;
  it.each(callers.flatMap(([name, comp, el]) => ['[first, second]', '[second, first]'].map((xs) => [name, xs, comp, el] as const)))('content an early return left unchecked is still checked: %s %s', (_name, xs, comp, el) => {
    const hits = scan(`import { ${comp} } from '@kit';\n${shared}export function V() { return ${el(xs)}; }`, {}, ['layout.text']).filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg.replace(/^.*: /, '')).sort()).toEqual([`a raw <div> in a text slot`, `a raw <p> in a text slot`]);
  });
  // A fragment whose first problem another content of the slot reports still reports its next one, in either
  // order (each content claims one problem no other content claims)
  it.each(['on ? frag : raw', 'on ? raw : frag'])('a fragment sharing its first problem with another content still reports its own: %s', (label) => {
    const hits = scan(`import { SettingRow } from '@kit';\nconst raw = <p />;\nconst frag = <>{raw}<span /></>;\nexport function V({ on }: any) { return <SettingRow label={${label}} />; }`).filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg).sort()).toEqual(['SettingRow.label: a raw <p> in a text slot', 'SettingRow.label: a raw <span> in a text slot']);
  });
  it.each(['r.x ? <>{stateCell(r)}<em /></> : stateCell(r)', 'r.x ? stateCell(r) : <>{stateCell(r)}<em /></>'])('the same in a DataTable cell: %s', (body) => {
    const hits = scan(`import { DataTable } from '@kit';\nconst stateCell = (r: any) => <p>{r.s}</p>;\nexport function V() { return <DataTable columns={[{ key: 'a', cell: (r: any) => ${body} }]} />; }`, {}, ['layout.text']).filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg).sort()).toEqual(['DataTable cell: a raw <em> in a text slot', 'DataTable cell: a raw <p> in a text slot']);
  });
  // It is a maximum matching, not a shortcut. A{x}, B{x}, C{y,z} is 2 hits (min(contents, distinct problems) would say 3)
  const matchSrc = (order: string) => `import { SettingRow } from '@kit';\nconst x = <p />;\nconst A = <>{x}</>;\nconst B = <>{x}</>;\nconst C = <><b /><i /></>;\nexport function V() { return <SettingRow label={[${order}]} />; }`;
  it.each(['A, B, C', 'C, B, A'])('three contents over three distinct problems where only two can be claimed are two hits: %s', (order) => {
    const hits = scan(matchSrc(order)).filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg.replace(/^.*: /, '')).sort()).toEqual(['a raw <b> in a text slot', 'a raw <p> in a text slot']);
  });
  // each hit is reported at the content that claims it (the fragment's declaration line: A 3, B 4, C 5), in content order
  it.each([
    ['A, B, C', ['3 a raw <p>', '5 a raw <b>']],
    ['C, B, A', ['5 a raw <b>', '4 a raw <p>']],
    ['B, C, A', ['4 a raw <p>', '5 a raw <b>']],
  ] as const)('one input gives the same hits in the same order, every run: %s', (order, want) => {
    const once = scan(matchSrc(order)).filter((h) => h.rule === 'layout.slot');
    expect(once.map((h) => `${h.line} ${h.msg.replace(/^.*: /, '').replace(/ in a text slot$/, '')}`)).toEqual(want);
    expect(scan(matchSrc(order)).filter((h) => h.rule === 'layout.slot')).toEqual(once);
  });
  // The matching's steps count against the walk budget: N fragments that each hold the same N raw nodes walk in under the budget,
  // and the matching's augmenting paths take it past, so the file fails closed
  it('the matching spends the walk budget: a slot it cannot settle within the budget fails closed', { timeout: 120_000 }, () => {
    const n = 130;
    const xs = `const xs = [${Array.from({ length: n }, (_, i) => `<b key="${i}" />`).join(', ')}];`;
    const label = `[${Array.from({ length: n }, () => '<>{xs}</>').join(', ')}]`;
    const hits = scan(`import { SettingRow } from '@kit';\n${xs}\nexport function V() { return <SettingRow label={${label}} />; }`, {}, ['layout.explain', 'layout.explainGap']).filter((h) => h.rule === 'layout.slot');
    expect(hits.some((h) => /^too deep to check/.test(h.msg))).toBe(true);
  });
  it('control: one fragment with two raw children is still one hit, as before', () => {
    const hits = scan("import { SettingRow } from '@kit';\nexport function V() { return <SettingRow label={<><p /><span /></>} />; }").filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg)).toEqual(['SettingRow.label: a raw <p> in a text slot']);
  });
  it('a node placed in two slots is a problem in each: the hits are deduped per slot, never across slots', () => {
    const hits = scan("import { SettingRow } from '@kit';\nconst raw = <div />;\nexport function V() { return <SettingRow label={raw} help={raw} />; }").filter((h) => h.rule === 'layout.slot');
    expect(hits.map((h) => h.msg).sort()).toEqual(['SettingRow.help: a raw <div> in a text slot', 'SettingRow.label: a raw <div> in a text slot']);
  });
  // Every path is walked, with no memo, under a per-file step budget: past it the file fails closed. The FAQ
  // explanation rules are off: their own walker re-walks such helpers too
  const branching = (width: number) => {
    const calls = (f: string) => `[${Array.from({ length: width }, () => `${f}()`).join(', ')}]`;
    return `import { SettingRow, IdChip } from '@kit';\nconst f0 = () => <IdChip />;\nconst f1 = () => ${calls('f0')};\nconst f2 = () => ${calls('f1')};\nconst f3 = () => ${calls('f2')};\nconst f4 = () => ${calls('f3')};\nexport function V() { return <SettingRow label={f4()} />; }`;
  };
  it('a helper tree past the walk budget fails closed with one "too deep to check" hit, and stops early', { timeout: 120_000 }, () => {
    const t0 = performance.now();
    const hits = scan(branching(48), {}, ['layout.explain', 'layout.explainGap']).filter((h) => h.rule === 'layout.slot');
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(hits.map((h) => h.msg)).toEqual([expect.stringMatching(/^too deep to check/)]);
  });
  // Its leaves sit past the walk's depth cut, so this proves only that the budget is not spent.
  it('control: a clean helper tree inside the budget costs no "too deep to check" hit', () => {
    expect(scan(branching(4), {}, ['layout.explain', 'layout.explainGap']).filter((h) => h.rule === 'layout.slot')).toEqual([]);
  });
  it('control: a call of a parameter, a let binding or an imported function is not followed', () => {
    expect(scan("import { SettingRow } from '@kit';\nexport function V({ render }: any) { return <SettingRow label={render()} />; }")).toEqual([]);
    expect(scan("import { SettingRow } from '@kit';\nexport function V() { let f = () => <div />; return <SettingRow label={f()} />; }")).toEqual([]);
    expect(scan("import { SettingRow } from '@kit';\nimport { mk } from './mk';\nexport function V() { return <SettingRow label={mk()} />; }", { 'pages/x/mk.tsx': 'export const mk = () => <div />;' })).toEqual([]);
  });
});
