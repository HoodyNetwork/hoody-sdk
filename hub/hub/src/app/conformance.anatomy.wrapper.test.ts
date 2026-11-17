// A page-local component (a wrapper) written in a kit slot is judged by what it renders, as if that were written in the slot
// Composites pass where the kit declares them (narrow slot
// types in kit/layouts/anatomy/slots.ts, no exemption list in the detector); a dialog beside its trigger is not slot content;
// Skeleton passes only where a slot list declares it; whatever the wrapper walk cannot prove is a hit at the site (cycles,
// unreadable components, depth and budget, unknown values), never absent and never an overlay. Content written directly in a
// slot keeps the existing walk. Every case has its clean twin.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; msg: string; line: number };
type Registry = Record<string, unknown>;
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  loadRegistry(dir?: string): Registry;
  scan(files: Record<string, string>, opts: { registry: Registry }): { hits: Hit[] };
};
const REG = A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy'));

const KIT: Record<string, string> = {
  'kit/index.ts': "export * from './misc/Misc';\nexport { useStrings } from './strings';",
  'kit/strings.ts': 'export function useStrings(table: any) { return (k: string) => k; }',
  'kit/misc/Misc.tsx': [
    'EmptyState', 'Button', 'IconButton', 'IdChip', 'Tag', 'ConfirmDialog', 'Drawer', 'AskAgentDrawer', 'Skeleton', 'DataTable',
    'SegmentedControl', 'CutFrame', 'AddressField', 'RowNote', 'ConversationView', 'UsageTab', 'SessionTab', 'ListDetailPage',
    'AnatomySection', 'Facts',
  ].map((n) => `export function ${n}(p: any) { return <div />; }`).join('\n'),
};
const IMPORTS =
  "import { EmptyState, Button, IconButton, IdChip, Tag, ConfirmDialog, Drawer, AskAgentDrawer, Skeleton, DataTable, SegmentedControl, CutFrame, AddressField, RowNote, ConversationView, UsageTab, SessionTab, ListDetailPage, AnatomySection, Facts, useStrings } from '@kit';\n";

/** The layout.slot messages of one page file (the kit stubs above, this repo's registry). */
function hits(page: string): string[] {
  const r = A.scan({ ...KIT, 'pages/x/view.tsx': IMPORTS + page }, { registry: REG });
  return r.hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
}
/** A page whose EmptyState puts `use` in the slot `slot` (body: text, action: actions), with `defs` above it. */
const page = (defs: string, slot: string, use: string) => `${defs}\nexport function View() { return <EmptyState ${slot}={${use}} />; }\n`;

describe('a wrapper in a slot is judged by what it renders', () => {
  it('raw markup or a part the slot does not take is a hit at the site; the slot\'s own parts pass', () => {
    expect(hits(page('function W() { return <div />; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
    expect(hits(page('function W() { return <Button />; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders <Button> into a text slot']);
    expect(hits(page('function W() { return <IdChip />; }', 'body', '<W />'))).toEqual([]);
    expect(hits(page('function W() { return <><IdChip /><Tag /></>; }', 'body', '<W />'))).toEqual([]);
  });
  it('every root counts: conditions, consts, same-file helpers and nested wrappers (named by what they render), one hit naming the first and how many more', () => {
    expect(hits(page('function W(p: { on: boolean }) { const x = <IdChip />; return p.on === true ? x : <div />; }', 'body', '<W on />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
    expect(hits(page('function inner() { return <span />; }\nfunction W() { return <>{inner()}<p /></>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <span> into a text slot (and 1 more)']);
    expect(hits(page('function V() { return <div />; }\nfunction W() { return <V />; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
  });
  it('children and props resolve to what the use site passes; defaults count', () => {
    const W = 'function W({ children }: any) { return <>{children}</>; }';
    expect(hits(page(W, 'body', '<W><div /></W>'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
    expect(hits(page(W, 'body', '<W><IdChip /></W>'))).toEqual([]);
    const D = 'function W({ child = <div /> }: any) { return <>{child}</>; }';
    expect(hits(page(D, 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
    expect(hits(page(D, 'body', '<W child={<IdChip />} />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
    expect(hits(page('function W({ child = <Tag /> }: any) { return <>{child}</>; }', 'body', '<W child={<IdChip />} />'))).toEqual([]);
    expect(hits(page('function id(x: any) { return x; }\nfunction W() { return <>{id(<div />)}</>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
  });
  it('text: strings and t() of useStrings pass a text slot; text in an actions slot is a hit', () => {
    const T = "function W() { const t = useStrings({}); return <>{t('a')}</>; }";
    expect(hits(page(T, 'body', '<W />'))).toEqual([]);
    expect(hits(page(T, 'action', '<W />'))).toEqual(['EmptyState.action: <W> renders visible text into a actions slot']);
    expect(hits(page("function t(k: string) { return <div />; }\nfunction W() { return <>{t('a')}</>; }", 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
  });
  it('a non-boolean left of && can render "" or 0: a hit outside text slots; a boolean left renders nothing', () => {
    expect(hits(page('function W(p: { n: number }) { return <>{p.n && <Button />}</>; }', 'action', '<W n={1} />'))).toEqual(['EmptyState.action: <W> renders a condition that can render "" or 0 into a actions slot']);
    expect(hits(page('function W(p: { n: number }) { return <>{p.n > 0 && <Button />}</>; }', 'action', '<W n={1} />'))).toEqual([]);
    expect(hits(page('function W(p: { n: number }) { return <>{p.n && <IdChip />}</>; }', 'body', '<W n={1} />'))).toEqual([]);
  });
});

describe('what the wrapper walk cannot prove is a hit at the site', () => {
  it('a variable the code can change, a value it cannot read, a rest parameter or a spread', () => {
    expect(hits(page('function W() { let x = <IdChip />; x = <div />; return x; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a value the check cannot read into a text slot']);
    expect(hits(page('function W() { const x = <IdChip />; return x; }', 'body', '<W />'))).toEqual([]);
    expect(hits(page('function W(p: any) { return p.items.map((i: any) => <IdChip key={i} />); }', 'body', '<W items={[]} />'))).toEqual(['EmptyState.body: <W> renders a value the check cannot read into a text slot']);
    expect(hits(page('function c(x: any) { x = <div />; return x; }\nfunction W() { return <>{c(null)}</>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a parameter the check cannot read into a text slot']);
    expect(hits(page('function c(x: any) { return x; }\nfunction W() { return <>{c(<IdChip />)}</>; }', 'body', '<W />'))).toEqual([]);
    expect(hits(page('function c(...xs: any[]) { return xs; }\nfunction W() { return <>{c(null, <div />)}</>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a parameter the check cannot read into a text slot']);
    expect(hits(page('function c(a: any, b: any) { return b; }\nfunction W() { return <>{c(null, <IdChip />)}</>; }', 'body', '<W />'))).toEqual([]);
    expect(hits(page('function c(a: any, b: any) { return b; }\nfunction W() { return <>{c(...[null, <div />])}</>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders a spread argument the check cannot read into a text slot']);
    expect(hits(page('function W({ child }: any) { return <>{child}</>; }\nconst rest = { child: <div /> };', 'body', '<W {...rest} />'))).toEqual(['EmptyState.body: <W> renders a spread prop the check cannot read into a text slot']);
    expect(hits(page('function W({ child }: any) { return <>{child}</>; }', 'body', '<W {...{ child: <div /> }} />'))).toEqual(['EmptyState.body: <W> renders a raw <div> into a text slot']);
  });
  it('recursion, depth past five wrappers and a component it cannot read', () => {
    expect(hits(page('function W({ end, child }: any) { return end ? child : <W end child={<div />} />; }', 'body', '<W end={false} />'))).toEqual(['EmptyState.body: <W> renders itself: too deep to check into a text slot']);
    expect(hits(page('function V({ child }: any) { return <>{child}</>; }\nfunction W() { return <V child={<IdChip />} />; }', 'body', '<W />'))).toEqual([]);
    // a component the walk cannot read (made by a call it does not know) is a hit; the same component as an arrow is read
    expect(hits("const make = (f: any) => f;\nconst W = make(() => <IdChip />);\nexport function View() { return <EmptyState body={<W />} />; }\n")).toEqual(['EmptyState.body: <W> cannot be read (not a function component) in a text slot']);
    expect(hits('const W = () => <IdChip />;\nexport function View() { return <EmptyState body={<W />} />; }\n')).toEqual([]);
    const chain = ['function W6() { return <IdChip />; }', ...[5, 4, 3, 2, 1].map((i) => `function W${i}() { return <W${i + 1} />; }`)].join('\n');
    expect(hits(page(chain, 'body', '<W1 />'))).toHaveLength(1);
    expect(hits(page(chain, 'body', '<W1 />'))[0]).toMatch(/nests local components past 5 levels: too deep to check/);
    expect(hits(page('function W4() { return <IdChip />; }\nfunction W3() { return <W4 />; }\nfunction W2() { return <W3 />; }\nfunction W1() { return <W2 />; }', 'body', '<W1 />'))).toEqual([]);
  });
});

describe('writes, keys and strings the walk does not trust', () => {
  const R = 'EmptyState.body: <W> renders a parameter the check cannot read into a text slot';
  it('form 1: a for...of target, a props object passed to a call, a member as a destructuring target', () => {
    expect(hits(page('function W({ c }: any) { for (c of [<div />]) {} return <>{c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page('function W({ c }: any) { for (const d of [1]) {} return <>{c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([]);
    expect(hits(page('function W(p: any) { Object.assign(p, { c: <div /> }); return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page('function W(p: any) { const q = { ...p }; return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([]);
    expect(hits(page('function W(p: any) { ({ a: p.c } = { a: <div /> }); return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
  });
  it('form 2: a computed key named by an identifier is a value, not its spelling', () => {
    expect(hits(page("const key = 'c';\nfunction W({ c }: any) { return <>{c}</>; }", 'body', '<W c={<IdChip />} {...{ [key]: <div /> }} />'))).toEqual([
      'EmptyState.body: <W> renders a spread prop the check cannot read into a text slot',
    ]);
    expect(hits(page('function W({ c }: any) { return <>{c}</>; }', 'body', "<W {...{ ['c']: <IdChip /> }} />"))).toEqual([]);
    expect(hits(page("const key = 'c';\nfunction W({ [key]: c }: any) { return <>{c}</>; }", 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page("function W({ ['c']: c }: any) { return <>{c}</>; }", 'body', '<W c={<IdChip />} />'))).toEqual([]);
  });
  it("form 3: t() is text only from the imported useStrings, not a local function of that name", () => {
    expect(hits(page("function W() { function useStrings(x: any) { return (k: string) => <div />; } const t = useStrings({}); return <>{t('a')}</>; }", 'body', '<W />'))).toEqual([
      'EmptyState.body: <W> renders a value the check cannot read into a text slot',
    ]);
    expect(hits(page("function W() { const t = useStrings({}); return <>{t('a')}</>; }", 'body', '<W />'))).toEqual([]);
  });
  it("form 3: another module's useStrings, or a global one, is not the kit's", () => {
    const scanOwn = (imports: string) =>
      A.scan(
        {
          ...KIT,
          'lib/strs.ts': 'export function useStrings(x: any) { return (k: string) => <div />; }',
          'pages/x/view.tsx': `${imports}\nfunction W() { const t = useStrings({}); return <>{t('a')}</>; }\nexport function View() { return <EmptyState body={<W />} />; }\n`,
        },
        { registry: REG },
      ).hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
    const U = ['EmptyState.body: <W> renders a value the check cannot read into a text slot'];
    expect(scanOwn("import { EmptyState } from '@kit';\nimport { useStrings } from '../../lib/strs';")).toEqual(U);
    expect(scanOwn("import { EmptyState } from '@kit';")).toEqual(U);
    expect(scanOwn("import { EmptyState, useStrings } from '@kit';")).toEqual([]);
  });
  it('form 5: a props object aliased and written through the alias', () => {
    expect(hits(page('function W(p: any) { const q = p; q.c = <div />; return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page('function W(p: any) { const q = p.c; return <>{q}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([]);
  });
  it('form 5: a props object escaping through a default or a destructuring default', () => {
    expect(hits(page('function W(p: any) { function mutate(q = p) { q.c = <div />; } mutate(); return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page('function W(p: any) { const { q = p } = {} as any; q.c = <div />; return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([R]);
    expect(hits(page('function W(p: any) { function mutate(q = 1) { return q; } mutate(); return <>{p.c}</>; }', 'body', '<W c={<IdChip />} />'))).toEqual([]);
  });
});

describe('the expression walk fails closed past its nesting bound', () => {
  // jsxContents nests to 32 (it stopped silently at 8): past it the file gets one "too deep to check" layout.slot hit
  const nested = (n: number) => Array.from({ length: n }, (_, i) => `p.k === ${i} ? <IdChip /> : `).join('') + '<IdChip />';
  it('a 34-deep chain of conditions in a slot is a file-level hit; 30 deep is read and clean', () => {
    expect(hits(`export function View(p: any) { return <EmptyState body={${nested(34)}} />; }\n`)).toEqual([expect.stringMatching(/^too deep to check: an expression the slots and action rows can produce nests past 32 levels/)]);
    expect(hits(`export function View(p: any) { return <EmptyState body={${nested(30)}} />; }\n`)).toEqual([]);
  });
});

describe('a dialog beside its trigger is not slot content', () => {
  it('beside a trigger in the same fragment it passes; alone, beside a non-trigger, or in the same child as content it is judged', () => {
    expect(hits(page('function W() { return <><Button /><ConfirmDialog /></>; }', 'action', '<W />'))).toEqual([]);
    expect(hits(page('function W() { return <><Button /><AskAgentDrawer /></>; }', 'action', '<W />'))).toEqual([]);
    expect(hits(page('function W() { return <ConfirmDialog />; }', 'action', '<W />'))).toEqual(['EmptyState.action: <W> renders <ConfirmDialog> into a actions slot']);
    expect(hits(page('function W() { return <><IdChip /><ConfirmDialog /></>; }', 'body', '<W />'))).toEqual(['EmptyState.body: <W> renders <ConfirmDialog> into a text slot']);
    expect(hits(page('function W(p: { o: boolean }) { return <><Button />{p.o === true ? <IconButton /> : <ConfirmDialog />}</>; }', 'action', '<W o />'))).toEqual(['EmptyState.action: <W> renders <ConfirmDialog> into a actions slot']);
  });
  it('a local dialog wrapper counts as an overlay only when everything it renders is one', () => {
    const D = 'function Dlg() { return <ConfirmDialog />; }';
    expect(hits(page(`${D}\nfunction W() { return <><Button /><Dlg /></>; }`, 'action', '<W />'))).toEqual([]);
    const M = 'function Dlg(p: { c: boolean }) { return <><ConfirmDialog />{p.c === true && <div />}</>; }';
    expect(hits(page(`${M}\nfunction W() { return <><Button /><Dlg c /></>; }`, 'action', '<W />'))).toEqual(['EmptyState.action: <W> renders <ConfirmDialog> into a actions slot (and 1 more)']);
    const U = 'function id(x: any) { return x; }\nfunction Dlg() { return <><ConfirmDialog />{id(<div />)}</>; }';
    expect(hits(page(`${U}\nfunction W() { return <><Button /><Dlg /></>; }`, 'action', '<W />'))).toHaveLength(1);
  });
});

describe('a trigger passed from another file is read in the file it is written in', () => {
  const WRAP = "import { ConfirmDialog, Button } from '@kit';\nexport function W({ trig }: any) { return <>{trig}<ConfirmDialog /></>; }\n";
  const scan2 = (caller: string) =>
    A.scan({ ...KIT, 'pages/x/W.tsx': WRAP, 'pages/x/view.tsx': caller }, { registry: REG }).hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
  it("a caller-local Button is not the kit's: the dialog beside it is judged; a kit IconButton is a trigger", () => {
    expect(scan2("import { EmptyState } from '@kit';\nimport { W } from './W';\nfunction Button() { return <span />; }\nexport function View() { return <EmptyState action={<W trig={<Button />} />} />; }\n")).toEqual(['EmptyState.action: <W> renders a raw <span> into a actions slot (and 1 more)']);
    expect(scan2("import { EmptyState, IconButton } from '@kit';\nimport { W } from './W';\nexport function View() { return <EmptyState action={<W trig={<IconButton />} />} />; }\n")).toEqual([]);
  });
  it('a trigger nested in the passed child resolves in the caller too (an element resolves in the file it is written in)', () => {
    // the caller-local Button inside a Tag is no trigger, so the dialog is judged ("and 1 more"); a nested kit IconButton is one
    expect(scan2("import { EmptyState, Tag } from '@kit';\nimport { W } from './W';\nfunction Button() { return <span />; }\nexport function View() { return <EmptyState action={<W trig={<Tag><Button /></Tag>} />} />; }\n")).toEqual(['EmptyState.action: <W> renders <Tag> into a actions slot (and 1 more)']);
    expect(scan2("import { EmptyState, Tag, IconButton } from '@kit';\nimport { W } from './W';\nexport function View() { return <EmptyState action={<W trig={<Tag><IconButton /></Tag>} />} />; }\n")).toEqual(['EmptyState.action: <W> renders <Tag> into a actions slot']);
  });
  it('a helper that returns a fragment around a call of itself ends (a dialog beside it is not proven an overlay)', () => {
    const rec = (leaf: string) => `function lbl(n: number): any { return n > 0 ? <>{lbl(n - 1)}<ConfirmDialog /></> : ${leaf}; }\nfunction W() { return <>{lbl(3)}</>; }\n`;
    expect(hits(page(rec('<IconButton />'), 'action', '<W />'))).toEqual(['EmptyState.action: <W> renders <lbl> calls itself: too deep to check into a actions slot (and 1 more)']);
    expect(hits(page(rec('<div />'), 'action', '<W />'))).toEqual(['EmptyState.action: <W> renders <lbl> calls itself: too deep to check into a actions slot (and 2 more)']);
  });
});

describe('composites pass where the kit declares them (slots.ts narrow types)', () => {
  const table = (prop: string, use: string, defs = '') => `${defs}\nexport function View() { return <DataTable ${prop}={${use}} />; }\n`;
  it('DataTable: SegmentedControl in toolbarEnd, CutFrame in cardRender, AddressField in renderExpanded, nowhere else', () => {
    expect(hits(table('toolbarEnd', '<SegmentedControl />'))).toEqual([]);
    expect(hits(table('cardRender', '() => <CutFrame />'))).toEqual([]);
    expect(hits(table('renderExpanded', '() => <AddressField />'))).toEqual([]);
    expect(hits(table('renderExpanded', '() => <CutFrame />'))).toEqual(['DataTable.renderExpanded: <CutFrame> in a expanded slot']);
    expect(hits(table('toolbarNote', '<SegmentedControl />'))).toEqual(['DataTable.toolbarNote: <SegmentedControl> in a text slot']);
    expect(hits(page('', 'body', '<RowNote />'))).toEqual(['EmptyState.body: <RowNote> in a text slot']);
    // a column cell reads the registry's cell type (text + RowNote); a header stays text
    const cols = (cell: string, header = '<IdChip />') => `const cols = [{ id: 'a', header: () => ${header}, cell: () => ${cell} }];\nexport function View() { return <DataTable columns={cols} />; }\n`;
    expect(hits(cols('<RowNote />'))).toEqual([]);
    expect(hits(cols('<Button />'))).toEqual(['DataTable cell: <Button> in a cell slot']);
    expect(hits(cols('<IdChip />', '<RowNote />'))).toEqual(['DataTable header: <RowNote> in a text slot']);
  });
  it('ConversationView: UsageTab and SessionTab only in their own panes', () => {
    const conv = (prop: string, use: string) => `export function View() { return <ConversationView ${prop}={${use}} />; }\n`;
    expect(hits(conv('usage', '<UsageTab />'))).toEqual([]);
    expect(hits(conv('session', '<SessionTab />'))).toEqual([]);
    expect(hits(conv('pane', '<UsageTab />'))).toEqual(['ConversationView.pane: <UsageTab> in a surface slot']);
    expect(hits(conv('usage', '<SessionTab />'))).toEqual(['ConversationView.usage: <SessionTab> in a conv-usage slot']);
  });
  it('Skeleton passes only where a list declares it: a pane, not body text', () => {
    expect(hits('export function View() { return <ListDetailPage list={<Skeleton />} detail={<AnatomySection />} />; }\n')).toEqual([]);
    expect(hits(page('function W(p: { l: boolean }) { return p.l === true ? <Skeleton /> : <IdChip />; }', 'body', '<W l />'))).toEqual(['EmptyState.body: <W> renders <Skeleton> into a text slot']);
  });
});

describe('a value written directly in a slot', () => {
  const view = (jsx: string, defs = '') => `${defs}\nexport function View(p: any) { return ${jsx}; }\n`;
  it('(a) a text-like slot takes a value it cannot read, and still judges what it can read', () => {
    // counted limit: a string is what a text slot expects; without types the walk cannot tell one from an element
    expect(hits(view('<EmptyState body={p.name} />'))).toEqual([]);
    expect(hits(view('<EmptyState title={p.user.email} />'))).toEqual([]);
    // the twin: a readable {x && <b />} in the same slot is still a hit
    expect(hits(view('<EmptyState body={p.x && <b />} />'))).toEqual(['EmptyState.body: a raw <b> in a text slot']);
  });
  it('(b) a slot that takes no text fails closed on what it cannot read', () => {
    expect(hits(view('<EmptyState action={p.btn} />'))).toEqual(['EmptyState.action: a value the check cannot read in a actions slot']);
    expect(hits(view('<EmptyState action={p.n && <Button />} />'))).toEqual(['EmptyState.action: a condition that can render "" or 0 in a actions slot']);
    expect(hits(view("<EmptyState action={'Save'} />"))).toEqual(['EmptyState.action: visible text in a actions slot']);
    expect(hits(view('<EmptyState action={p.xs.map((x: any) => x.label)} />'))).toEqual(['EmptyState.action: a value the check cannot read in a actions slot']);
    expect(hits(view('<DataTable columns={[]} renderExpanded={(r: any) => r.note} />'))).toEqual(['DataTable.renderExpanded: a value the check cannot read in a expanded slot']);
  });
  it('(b) what it can prove passes: a const, a boolean condition, a .map and a render callback that return elements', () => {
    expect(hits(view('<EmptyState action={btn} />', 'const btn = <Button />;'))).toEqual([]);
    expect(hits(view('<EmptyState action={!!p.n && <Button />} />'))).toEqual([]);
    expect(hits(view("<EmptyState action={['a', 'b'].map((x) => <Button key={x} />)} />"))).toEqual([]);
    expect(hits(view('<EmptyState action={Object.keys(p.o).map((x) => <Button key={x} />)} />'))).toEqual([]);
    expect(hits(view('<DataTable columns={[]} renderExpanded={(r: any) => <AddressField />} />'))).toEqual([]);
    expect(hits(view('<EmptyState action={p.ok ? <Button /> : null} />'))).toEqual([]);
  });
  it('(b) reaches what the JSX walk skipped: fragment children, JSX through a helper argument, a .map it cannot prove', () => {
    expect(hits(view('<EmptyState action={<>{p.value}</>} />'))).toEqual(['EmptyState.action: a value the check cannot read in a actions slot']);
    expect(hits(view("<EmptyState action={<>{'Save'}</>} />"))).toEqual(['EmptyState.action: visible text in a actions slot']);
    expect(hits(view('<EmptyState action={<>{p.n && <Button />}</>} />'))).toEqual(['EmptyState.action: a condition that can render "" or 0 in a actions slot']);
    const id = 'function id(x: any) { return x; }';
    expect(hits(view('<EmptyState action={id(<div />)} />', id))).toEqual(['EmptyState.action: a raw <div> in a actions slot']);
    expect(hits(view('<EmptyState action={id(<Button />)} />', id))).toEqual([]);
    // a .map on a receiver the walk cannot prove an array may be any method: its callback is not what renders
    expect(hits(view('<EmptyState action={p.source.map(() => <Button />)} />'))).toEqual(['EmptyState.action: a value the check cannot read in a actions slot']);
  });
  it('only an array written in the slot expression itself is read', () => {
    const body = (pre: string, jsx: string) => `export function View(p: any) { ${pre} return ${jsx}; }\n`;
    const arr = 'EmptyState.action: an array not written in the slot itself (a binding can change it): a value the check cannot read in a actions slot';
    expect(hits(body('const xs = [<Button />];', '<EmptyState action={xs} />'))).toEqual([arr]);
    expect(hits(view('<EmptyState action={[<Button key="a" />]} />'))).toEqual([]);
    // an array reached through a const in any branch of its initializer, or returned by a helper into one, is unknown too
    expect(hits(body("const xs: any = p.ok ? [<Button />] : [<Button />]; xs.push('Save');", '<EmptyState action={xs} />'))).toEqual([arr, arr]);
    expect(hits(body("const xs: any = f(); xs.push('Save');", '<EmptyState action={xs} />').replace('export', 'function f() { return [<Button />]; }\nexport'))).toEqual([arr]);
    expect(hits(body("const xs: any = [1].map(() => <Button />); xs.push('Save');", '<EmptyState action={xs} />'))).toEqual([arr]);
    // a helper holds its argument by a binding too: an array passed in is unknown, JSX passed in is checked as written
    expect(hits(view('<EmptyState action={f([<Button />])} />', "function f(x: any) { const xs: any = x; xs.push('Save'); return xs; }"))).toEqual([arr]);
    expect(hits(view('<EmptyState action={f([<Button />])} />', "function f(x: any) { x.push('Save'); return x; }"))).toEqual([arr]);
    expect(hits(view('<EmptyState action={f()} />', "function f(x: any = [<Button />]) { x.push('Save'); return x; }"))).toEqual([arr]);
    expect(hits(view('<EmptyState action={f()} />', "function f(x: any = [1].map(() => <Button />)) { x.push('Save'); return x; }"))).toEqual([arr]);
    expect(hits(view('<EmptyState action={f()} />', 'function f(x: any = <Button />) { return x; }'))).toEqual([]);
    // a const's JSX is the same whoever holds it; only an array written in the slot expression itself is read, not one a
    // helper returns
    expect(hits(body('const fr = <>{[<Button key="a" />]}</>;', '<EmptyState action={fr} />'))).toEqual([]);
    expect(hits(view('<EmptyState action={f()} />', 'function f() { return [<Button key="a" />]; }'))).toEqual([arr]);
    expect(hits(view('<EmptyState action={f()} />', 'function f() { return <Button />; }'))).toEqual([]);
    // .map reads its callback only on an array literal written inline (or Object.keys/values/entries, Array.from/of)
    expect(hits(body('const xs = [1];', '<EmptyState action={xs.map(() => <Button />)} />'))).toEqual(['EmptyState.action: a value the check cannot read in a actions slot']);
    expect(hits(view('<EmptyState action={[1].map(() => <Button />)} />'))).toEqual([]);
  });
  it('a helper called in the slot is direct content; a component it renders is a wrapper', () => {
    // an element the walk cannot classify keeps the direct rule through a helper, as written in the slot itself
    expect(hits(view('<EmptyState action={<Mystery />} />'))).toEqual([]);
    expect(hits(view('<EmptyState action={f()} />', 'function f() { return <Mystery />; }'))).toEqual([]);
    const w = 'function W() { return p0.map(() => <Button />); }\nconst p0: any = null;';
    const msg = 'EmptyState.action: <W> renders a value the check cannot read into a actions slot';
    expect(hits(view('<EmptyState action={<W />} />', w))).toEqual([msg]);
    expect(hits(view('<EmptyState action={f()} />', `${w}\nfunction f() { return <W />; }`))).toEqual([msg]);
  });
});

describe('inside a wrapper only an array written in the expression itself is read', () => {
  const arr = 'EmptyState.action: <W> renders an array not written in the slot itself (a binding can change it): a value the check cannot read into a actions slot';
  it('an array a const holds is unknown, whatever changes it after it is made', () => {
    expect(hits(page("function W() { const xs: any = [<Button key=\"a\" />]; xs.push('Save'); return <>{xs}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function W() { const xs: any = [<Button key=\"a\" />]; [xs[0]] = ['Save']; return <>{xs}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function W() { const xs: any = [<Button key=\"a\" />]; xs.forEach((_: any, i: number, a: any) => { a[i] = 'Save'; }); return <>{xs}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function W(p: any) { const xs: any = p.ok ? [<Button key=\"a\" />] : []; xs.push('Save'); return <>{xs}</>; }", 'action', '<W ok />'))).toEqual([`${arr} (and 1 more)`]);
    // the clean twins: an array written inline, a const's JSX
    expect(hits(page('function W() { return <>{[<Button key="a" />]}</>; }', 'action', '<W />'))).toEqual([]);
    expect(hits(page('function W() { const b = <Button />; return <>{b}</>; }', 'action', '<W />'))).toEqual([]);
  });
  it('a helper\'s return, argument and default, and a prop, a prop default and children hold an array by a binding too', () => {
    expect(hits(page("function f() { const xs: any = [<Button key=\"a\" />]; xs.push('Save'); return xs; }\nfunction W() { return <>{f()}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function f(x: any) { x.push('Save'); return x; }\nfunction W() { return <>{f([<Button key=\"a\" />])}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function f(x: any = [<Button key=\"a\" />]) { x.push('Save'); return x; }\nfunction W() { return <>{f()}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function W({ xs }: any) { xs.push('Save'); return <>{xs}</>; }", 'action', '<W xs={[<Button key="a" />]} />'))).toEqual([arr]);
    expect(hits(page("function W({ xs = [<Button key=\"a\" />] }: any) { xs.push('Save'); return <>{xs}</>; }", 'action', '<W />'))).toEqual([arr]);
    expect(hits(page("function W({ children }: any) { children.push('Save'); return <>{children}</>; }", 'action', '<W>{[<Button key="a" />]}</W>'))).toEqual([arr]);
    // the clean twins: JSX passed in, returned or given as children is checked as written
    expect(hits(page('function f() { return <Button />; }\nfunction W() { return <>{f()}</>; }', 'action', '<W />'))).toEqual([]);
    expect(hits(page('function W({ a }: any) { return <>{a}</>; }', 'action', '<W a={<Button />} />'))).toEqual([]);
    expect(hits(page('function W({ children }: any) { return <>{children}</>; }', 'action', '<W><Button /></W>'))).toEqual([]);
    expect(hits(page('function W({ a }: any) { return <>{a}</>; }', 'action', '<W a={<div />} />'))).toEqual(['EmptyState.action: <W> renders a raw <div> into a actions slot']);
  });
});
