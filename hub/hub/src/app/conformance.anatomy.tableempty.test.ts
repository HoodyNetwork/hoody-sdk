// A kit DataTable's own empty state. A state component
// written as a kit DataTable's `empty` value is in place (no layout.state hit) when the table renders inside a Widget, inside a
// `state` value, or inside a kit Section that takes a `state`: the Section draws loading and failure, the table its own no-rows.
// The detector reads the table's ancestry through the file's own unexported components to the places they are rendered; each
// refusal has a control that keeps the hit. Only a kit EmptyState, and only a home's children.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  scan(files: Record<string, string>, opts?: { disabled?: string[] }): { hits: Hit[] };
};

const KIT: Record<string, string> = {
  'kit/index.ts': "export * from './layouts/anatomy/Section';\nexport * from './states/States';\nexport * from './misc/Misc';",
  'kit/layouts/anatomy/Section.tsx': 'export function AnatomySection(p: any) { return <section>{p.children}</section>; }\nexport function Section(p: any) { return <section>{p.children}</section>; }',
  'kit/states/States.tsx': 'export function EmptyState(p: any) { return <div />; }\nexport function Skeleton(p: any) { return <div />; }\nexport function ErrorState(p: any) { return <div />; }',
  'kit/misc/Misc.tsx': 'export function Widget(p: any) { return <div>{p.children}</div>; }\nexport function DataTable(p: any) { return <table />; }\nexport function Stack(p: any) { return <div>{p.children}</div>; }',
};
const HEAD = "import { AnatomySection, Section, Widget, DataTable, EmptyState, Skeleton, ErrorState, Stack } from '@kit';\n";
/** the layout.state hits of a page file `src` (HEAD prepended unless `head` is given) */
const states = (src: string, head = HEAD, extra: Record<string, string> = {}) =>
  A.scan({ ...KIT, ...extra, 'pages/x/view.tsx': head + src }).hits.filter((h) => h.rule === 'layout.state' && h.file === 'pages/x/view.tsx').length;
const TABLE = '<DataTable rows={[]} empty={<EmptyState title="none" />} />';
const LIST = `function Listing() { return ${TABLE}; }\n`;

describe('layout.state: a kit DataTable empty state in a state home is in place', () => {
  it('inside a kit Section that takes a state, a Widget, or a state value', () => {
    expect(states(`export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }}>${TABLE}</AnatomySection>; }`)).toBe(0);
    expect(states(`export function V() { return <Section title="a" state={{ kind: 'ready' }}><Stack>${TABLE}</Stack></Section>; }`)).toBe(0);
    expect(states(`export function V() { return <Widget title="a">${TABLE}</Widget>; }`)).toBe(0);
    expect(states(`export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }}><DataTable rows={[]} empty={(<EmptyState title="none" />)} /></AnatomySection>; }`)).toBe(0);
  });
  it("through the file's own components to where they are rendered (declaration, const arrow, two levels, every use)", () => {
    expect(states(`${LIST}export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }}>{true && <Listing />}</AnatomySection>; }`)).toBe(0);
    expect(states(`const Listing = () => ${TABLE};\nexport function V() { return <Widget title="a"><Listing></Listing></Widget>; }`)).toBe(0);
    expect(states(`${LIST}function Body() { return <Stack><Listing /></Stack>; }\nexport function V() { return <Widget title="a"><Body /></Widget>; }`)).toBe(0);
    expect(states(`${LIST}export function V() { return <><Widget title="a"><Listing /></Widget><Widget title="b"><Listing /></Widget></>; }`)).toBe(0);
    expect(states(`${LIST}export function V() { return <Stack state={<Listing />} />; }`)).toBe(0);
  });
});

describe('layout.state: controls, an unproven table empty state keeps its hit', () => {
  it('the place: a Section with no state, a plain wrapper, a page with no home', () => {
    expect(states(`export function V() { return <AnatomySection title="a">${TABLE}</AnatomySection>; }`)).toBe(1);
    expect(states(`export function V() { return <Stack>${TABLE}</Stack>; }`)).toBe(1);
    expect(states(`${LIST}export function V() { return <Stack><Listing /></Stack>; }`)).toBe(1);
  });
  it('the slot: only a kit DataTable, only its `empty`, only a state element written there directly', () => {
    const SEC = (x: string) => `export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }}>${x}</AnatomySection>; }`;
    expect(states(SEC('<Stack><DataTable rows={[]} toolbar={<EmptyState title="none" />} /></Stack>'))).toBe(1);
    expect(states(`function DataTable(p: any) { return <table />; }\n${SEC(TABLE)}`, "import { AnatomySection, EmptyState } from '@kit';\n")).toBe(1);
    expect(states(`export function V(p: { c: boolean }) { return <Stack><DataTable rows={[]} empty={p.c ? <EmptyState title="none" /> : null} /></Stack>; }`)).toBe(1);
    expect(states(`export function V() { return <Stack><DataTable rows={[]} toolbar={<EmptyState title="none" />} /></Stack>; }`)).toBe(1);
  });
  it('only a kit EmptyState: a Skeleton or ErrorState in the slot is a loading or failure state the Section draws', () => {
    const SEC = (x: string) => `export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }}><Stack>${x}</Stack></AnatomySection>; }`;
    expect(states(SEC('<DataTable rows={[]} empty={<EmptyState title="none" />} />'))).toBe(0);
    expect(states(SEC('<DataTable rows={[]} empty={<Skeleton />} />'))).toBe(1);
    expect(states(SEC('<DataTable rows={[]} empty={<ErrorState title="x" />} />'))).toBe(1);
    // the kit EmptyState however it is imported: renamed, or a member of the kit namespace
    expect(states(SEC('<DataTable rows={[]} empty={<E title="none" />} />'), "import { AnatomySection, DataTable, EmptyState as E, Stack } from '@kit';\n")).toBe(0);
    expect(states(SEC('<Kit.DataTable rows={[]} empty={<Kit.EmptyState title="none" />} />').replace(/<(\/?)(AnatomySection|Stack)/g, '<$1Kit.$2'), "import * as Kit from '@kit';\n")).toBe(0);
    expect(states(SEC('<Kit.DataTable rows={[]} empty={<Kit.Skeleton />} />').replace(/<(\/?)(AnatomySection|Stack)/g, '<$1Kit.$2'), "import * as Kit from '@kit';\n")).toBe(1);
  });
  it("only a home's children: a table in a Section's or Widget's attribute is not in it", () => {
    expect(states(`${LIST}export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }} actions={<Listing />}>{null}</AnatomySection>; }`)).toBe(1);
    expect(states(`${LIST}export function V() { return <AnatomySection title="a" state={{ kind: 'ready' }} description={<Listing />} />; }`)).toBe(1);
    expect(states(`${LIST}export function V() { return <Widget title="a" description={<Listing />}>{null}</Widget>; }`)).toBe(1);
    expect(states(`${LIST}export function V() { return <Widget title="a"><Stack><Listing /></Stack></Widget>; }`)).toBe(0);
  });
  it('the component: exported, default, a non-JSX reference, a use outside a home, unused, wrapped, nested (not top level), recursive, shadowed', () => {
    const IN = 'export function V() { return <Widget title="a"><Listing /></Widget>; }';
    expect(states(`export ${LIST}${IN}`)).toBe(1);
    expect(states(`${LIST}${IN}\nexport default Listing;`)).toBe(1);
    expect(states(`${LIST}${IN}\nexport { Listing };`)).toBe(1);
    expect(states(`${LIST}${IN}\nexport const L2 = Listing;`)).toBe(1);
    expect(states(`${LIST}${IN}\nexport function W() { return <Stack><Listing /></Stack>; }`)).toBe(1);
    expect(states(LIST)).toBe(1);
    expect(states(`function memo(f: any) { return f; }\nconst Listing = memo(() => ${TABLE});\n${IN}`)).toBe(1);
    expect(states(`export function V() { function Listing() { return ${TABLE}; } return <Widget title="a"><Listing /></Widget>; }`)).toBe(1);
    expect(states(`export function V() { const Listing = () => ${TABLE}; return <Widget title="a"><Listing /></Widget>; }`)).toBe(1);
    expect(states(`let Listing = () => ${TABLE};\n${IN}`)).toBe(1);
    expect(states(`function Listing(): any { return <Stack>{${TABLE}}<Listing /></Stack>; }\n${IN}`)).toBe(1);
    expect(states(`${LIST}export function V({ Listing }: { Listing: any }) { return <Widget title="a"><Listing /></Widget>; }`)).toBe(1);
  });
  it('the depth: four components deep is followed, five is not', () => {
    const chain = (n: number) => {
      let s = LIST;
      let prev = 'Listing';
      for (let i = 1; i < n; i++) { s += `function C${i}() { return <Stack><${prev} /></Stack>; }\n`; prev = `C${i}`; }
      return `${s}export function V() { return <Widget title="a"><${prev} /></Widget>; }`;
    };
    expect(states(chain(4))).toBe(0);
    expect(states(chain(5))).toBe(1);
  });
});

describe('a `state` that is literally nothing is no state', () => {
  // `state={undefined}`, `state={null}` and `state={void 0}` set no state: a strict Section holding a data leaf with one is
  // layout.stateMissing, and it is no home for a DataTable's empty state. Any other value (a variable, a call, a conditional)
  // still counts as a state, as before.
  const missing = (src: string) => A.scan({ ...KIT, 'pages/x/view.tsx': HEAD + src }).hits.filter((h) => h.rule === 'layout.stateMissing' && h.file === 'pages/x/view.tsx').length;
  const sec = (state: string) => `export function V(p: { s: any }) { return <AnatomySection title="a"${state}>${TABLE}</AnatomySection>; }`;
  it('undefined, null and void are no state: the Section is stateMissing and no home', () => {
    for (const st of [' state={undefined}', ' state={null}', ' state={void 0}', ' state={(undefined)}', ' state={undefined as any}']) {
      expect(missing(sec(st)), st).toBe(1);
      expect(states(sec(st)), st).toBe(1);
    }
  });
  it('controls: a written state of any other value is a state', () => {
    for (const st of [" state={{ kind: 'ready' }}", ' state={p.s}', ' state={p.s ?? undefined}']) {
      expect(missing(sec(st)), st).toBe(0);
      expect(states(sec(st)), st).toBe(0);
    }
    expect(missing(sec('')), 'no state attribute').toBe(1);
    expect(missing(`export function V() { const undefined = { kind: 'ready' }; return <AnatomySection title="a" state={undefined}>${TABLE}</AnatomySection>; }`), 'a local named undefined').toBe(0);
    expect(A.scan({ ...KIT, 'pages/x/s.ts': "export const ready = { kind: 'ready' };", 'pages/x/view.tsx': `${HEAD}import { ready as undefined } from './s';\nexport function V() { return <AnatomySection title="a" state={undefined}>${TABLE}</AnatomySection>; }` }).hits.filter((h) => h.file === 'pages/x/view.tsx' && (h.rule === 'layout.stateMissing' || h.rule === 'layout.state')).length, 'an import named undefined').toBe(0);
  });
});
