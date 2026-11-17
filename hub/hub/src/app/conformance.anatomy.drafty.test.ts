// The loose-link, band and drawer-list rules of the page-anatomy detector, on a minimal kit:
// - layout.looseFaqLink: a FaqLink sits in a Why or a Faq, or in a Band's or a Section header's `actions`; anywhere else it is loose.
// - layout.bandsPerSection: one Band per Section, SubSection or overlay body; a condition's branches count as the larger one,
//   a nested Section counts on its own, and the hit is keyed by the body's scope (an overlay's own id).
// - layout.drawerOl: no hand-made <ol> in an overlay body (in the file, or where its component renders), outside a StepList.
// Consumer files only, never the gallery (its specimens show each piece alone). Their rows are each page's conformance.allow.ts
// rows (the anatomy ratchet); the ESLint names are hub/no-loose-faqlink, hub/one-band-per-section and hub/no-drawer-ol.
import { createRequire } from 'node:module';
import path, { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  RULES: string[];
  loadRegistry(dir?: string): unknown;
  scan(files: Record<string, string>, opts: { registry: unknown }): { hits: Hit[] };
};

const kit: Record<string, string> = {
  'kit/index.ts': "export * from './layouts/Layouts';",
  'kit/layouts/Layouts.tsx': [
    'export function Section(p: any) { return <div>{p.actions}{p.children}</div>; }',
    'export function SubSection(p: any) { return <div>{p.actions}{p.children}</div>; }',
    'export function Band(p: any) { return <div>{p.children}{p.actions}</div>; }',
    'export function Why(p: any) { return <div>{p.children}</div>; }',
    'export function FaqLink(p: any) { return <a>{p.children}</a>; }',
    'export function Drawer(p: any) { return <div>{p.children}</div>; }',
    'export function StepList(p: any) { return <div>{p.children}</div>; }',
    'export function Row(p: any) { return <div>{p.children}</div>; }',
    'export function Button(p: any) { return <button>{p.children}</button>; }',
    'export function RadioGroup(p: any) { return <div />; }',
    'export function Select(p: any) { return <div />; }',
  ].join('\n'),
};
const IMPORTS = "import { Band, Button, Drawer, FaqLink, RadioGroup, Row, Section, Select, StepList, SubSection, Why } from '@kit';";
const page = (body: string) => `${IMPORTS}\nexport function View({ on, rows }: { on: boolean; rows: string[] }) {\n  return (<>${body}</>);\n}\n`;
const F = 'faqLink(0)';

/** The looseFaqLink, bandsPerSection and drawerOl hits of `files` (kit added), as `rule file scope`. */
function k16(files: Record<string, string>): string[] {
  const r = A.scan(
    { ...kit, ...files },
    {
      registry: A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy')),
    },
  );
  return r.hits.filter((h) => /^layout\.(looseFaqLink|bandsPerSection|drawerOl)$/.test(h.rule)).map((h) => `${h.rule} ${h.file} ${h.scope}`);
}
const one = (body: string) =>
  k16({
    'pages/x/view.tsx': page(body.split(F).join('<FaqLink item={0}>More</FaqLink>')),
  });

describe('rule ids', () => {
  it('the detector lists all three', () => {
    expect(A.RULES).toEqual(expect.arrayContaining(['layout.looseFaqLink', 'layout.bandsPerSection', 'layout.drawerOl']));
  });
});

describe('layout.looseFaqLink', () => {
  it.each([
    ['a Why', `<Why question="q">A line. ${F}</Why>`],
    ["a Band's actions", `<Band actions={${F}}>Note</Band>`],
    ["a Section header's actions", `<Section title="t" actions={${F}}>Body</Section>`],
    ["a SubSection header's actions", `<SubSection title="t" actions={${F}}>Body</SubSection>`],
    ["a Row inside a Band's actions", `<Band actions={<Row><Button>Go</Button>${F}</Row>}>Note</Band>`],
  ])('in %s it is not loose', (_where, body) => {
    expect(one(body)).toEqual([]);
  });

  it.each([
    ['a page body', `<p>${F}</p>`],
    ["a Band's text", `<Band>Note ${F}</Band>`],
    ["a Section's description", `<Section title="t" description={${F}}>Body</Section>`],
    ["a Section's body", `<Section title="t">Body ${F}</Section>`],
    ["another component's actions", `<Row actions={${F}} />`],
    ['an attribute of another element inside a Why', `<Why question="q"><Row foo={${F}} /></Why>`],
    ["a spread's actions on a Band inside a Why", `<Why question="q"><Band {...{ actions: ${F} }}>Note</Band></Why>`],
  ])('in %s it is loose', (_where, body) => {
    expect(one(body)).toEqual(['layout.looseFaqLink pages/x/view.tsx main']);
  });

  it('a gallery specimen and the kit itself are not consumers of the rule', () => {
    expect(k16({ 'kit/gallery/x.tsx': page('<FaqLink item={0}>More</FaqLink>') })).toEqual([]);
    expect(
      k16({
        'kit/layouts/Other.tsx': page('<FaqLink item={0}>More</FaqLink>'),
      }),
    ).toEqual([]);
  });
});

describe('layout.bandsPerSection', () => {
  it('a Band attached to its field (attach) is that field\'s own warning, not a strip of the section', () => {
    const att = (w: string) => `<Band attach={<Button>f</Button>}>${w}</Band>`;
    expect(one(`<Section title="t">${att('A')}${att('B')}<Band>C</Band></Section>`)).toEqual([]);
    expect(one(`<Section title="t">${att('A')}<Band>B</Band><Band>C</Band></Section>`)).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
    // only a written attach attribute counts: a spread the rule cannot read leaves the Band a strip
    expect(one('<Section title="t"><Band {...({} as any)}>A</Band><Band>B</Band></Section>')).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
  });

  it('an attach that may be empty (unset, a condition with an empty side, &&, a fragment, or replaced by a later spread) leaves a strip of the section', () => {
    const hit = ['layout.bandsPerSection pages/x/view.tsx main'];
    for (const v of ['{undefined}', '{null}', '{on ? <Button>f</Button> : undefined}', '{on ? null : <Button>f</Button>}', '{on && <Button>f</Button>}', '{<></>}']) {
      expect(one(`<Section title="t"><Band attach=${v}>A</Band><Band>B</Band></Section>`), v).toEqual(hit);
    }
    expect(one('<Section title="t"><Band attach={<Button>f</Button>} {...({} as any)}>A</Band><Band>B</Band></Section>')).toEqual(hit);
    // written as one element with no later spread: still the field's own warning
    expect(one('<Section title="t"><Band {...({} as any)} attach={(<Button>f</Button>)}>A</Band><Band>B</Band></Section>')).toEqual([]);
    // a name is taken as the field it holds
    expect(one('<Section title="t"><Band attach={field}>A</Band><Band>B</Band></Section>')).toEqual([]);
  });

  it('two Bands in one Section is one hit, at the Section', () => {
    expect(one('<Section title="t"><Band>A</Band><Band>B</Band></Section>')).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
  });

  it.each([
    ['one Band', '<Section title="t"><Band>A</Band><p>x</p></Section>'],
    ['two branches of a condition (the larger, not the sum)', '<Section title="t">{on ? <Band>A</Band> : <Band>B</Band>}</Section>'],
    ['a nested SubSection with its own Band', '<Section title="t"><Band>A</Band><SubSection title="s"><Band>B</Band></SubSection></Section>'],
    ['a Band in an attribute (not the body)', '<Section title="t" actions={<Band>A</Band>}><Band>B</Band></Section>'],
  ])('%s is not a hit', (_what, body) => {
    expect(one(body)).toEqual([]);
  });

  it.each([
    ['a guarded Band beside another', '<Section title="t">{on && <Band>A</Band>}<Band>B</Band></Section>'],
    ['a Band in a map beside another', '<Section title="t">{rows.map((r) => <Band key={r}>{r}</Band>)}<Band>B</Band></Section>'],
    ['two Bands inside a Row of the body', '<Section title="t"><Row><Band>A</Band><Band>B</Band></Row></Section>'],
    ['an || between Bands beside another', '<Section title="t">{on || <Band>A</Band>}<Band>B</Band></Section>'],
  ])('%s is a hit', (_what, body) => {
    expect(one(body)).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
  });

  it('a body too large or too deep to read is a hit (the rule fails closed, never counts what it read)', () => {
    const wide = Array.from({ length: 4100 }, () => '<p>x</p>').join('');
    const deep = '<Row>'.repeat(70) + '<Band>A</Band>' + '</Row>'.repeat(70);
    expect(one(`<Section title="t">${wide}<Band>A</Band><Band>B</Band></Section>`)).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
    expect(one(`<Section title="t">${deep}<Band>B</Band></Section>`)).toEqual(['layout.bandsPerSection pages/x/view.tsx main']);
  });

  // A radio option's reveal (kit/forms/more.tsx Option.reveal) is drawn in the section that holds the group while that option is
  // picked: its Bands count there. One option is picked at a time, so the reveals of one group count as the larger one. Read
  // through an inline array of object literals, a const, a conditional spread and a `.map` returning object literals; any other
  // options value is not read (0, as before). Select ignores `reveal`.
  describe('a RadioGroup option reveal', () => {
    const rg = (opts: string) => `<RadioGroup label="l" options={${opts}} />`;
    const hit = ['layout.bandsPerSection pages/x/view.tsx main'];
    it.each([
      ['an inline option', `[{ value: 'a', reveal: <Band>B</Band> }]`],
      ['a fragment in the reveal', `[{ value: 'a', reveal: <><p>x</p><Band>B</Band></> }]`],
      ['a conditional reveal', `[{ value: 'a', reveal: on ? <Band>B</Band> : null }]`],
      ['a conditional spread of options', `[{ value: 'x' }, ...(on ? [{ value: 'a', reveal: <Band>B</Band> }] : [])]`],
      ['a .map returning options', `rows.map((r) => ({ value: r, reveal: <Band>{r}</Band> }))`],
    ])('%s beside a Band of the section is a hit', (_what, opts) => {
      expect(one(`<Section title="t"><Band>A</Band>${rg(opts)}</Section>`)).toEqual(hit);
    });

    it('a const options array is read', () => {
      const body = `${IMPORTS}\nconst opts = [{ value: 'a', reveal: <Band>B</Band> }];\nexport function View() { return <Section title="t"><Band>A</Band><RadioGroup label="l" options={opts} /></Section>; }\n`;
      expect(k16({ 'pages/x/view.tsx': body })).toEqual(hit);
    });

    it('one option whose reveal holds two Bands is a hit; in a Drawer it is keyed by the drawer', () => {
      expect(one(`<Section title="t">${rg(`[{ value: 'a', reveal: <><Band>A</Band><Band>B</Band></> }]`)}</Section>`)).toEqual(hit);
      expect(one(`<Drawer overlayId="x-d" isOpen title="t"><Band>A</Band>${rg(`[{ value: 'a', reveal: <Band>B</Band> }]`)}</Drawer>`)).toEqual([
        'layout.bandsPerSection pages/x/view.tsx overlay:x-d',
      ]);
    });

    it.each([
      ['two options with one Band each (alternatives)', rg(`[{ value: 'a', reveal: <Band>A</Band> }, { value: 'b', reveal: <Band>B</Band> }]`)],
      ['a reveal Band attached to its field', `<Band>A</Band>${rg(`[{ value: 'a', reveal: <Band attach={<Button>f</Button>}>B</Band> }]`)}`],
      ['a reveal holding its own SubSection', `<Band>A</Band>${rg(`[{ value: 'a', reveal: <SubSection title="s"><Band>B</Band></SubSection> }]`)}`],
      ['a Select option reveal (Select ignores it)', `<Band>A</Band><Select label="l" options={[{ value: 'a', reveal: <Band>B</Band> }]} />`],
      ['options the rule cannot read (known gap)', `<Band>A</Band>${rg('mk()')}`],
    ])('%s is not a hit', (_what, inner) => {
      expect(one(`<Section title="t">${inner}</Section>`)).toEqual([]);
    });
  });

  it("a Drawer's two Bands are keyed by the drawer's own scope", () => {
    expect(one('<Drawer overlayId="x-d" isOpen title="t"><Band>A</Band><Band>B</Band></Drawer>')).toEqual([
      'layout.bandsPerSection pages/x/view.tsx overlay:x-d',
    ]);
  });
});

describe('layout.drawerOl', () => {
  it('an <ol> in a Drawer body is a hit in its scope', () => {
    expect(one('<Drawer overlayId="x-d" isOpen title="t"><ol><li>a</li></ol></Drawer>')).toEqual(['layout.drawerOl pages/x/view.tsx overlay:x-d']);
  });

  it('an <ol> in a Drawer without an id is still a hit (main scope; layout.overlayId names the missing id)', () => {
    expect(one('<Drawer isOpen title="t"><ol><li>a</li></ol></Drawer>')).toEqual(['layout.drawerOl pages/x/view.tsx main']);
  });

  it('an <ol> inside a StepList, or in the page main, is not', () => {
    expect(one('<Drawer overlayId="x-d" isOpen title="t"><StepList><ol><li>a</li></ol></StepList></Drawer>')).toEqual([]);
    expect(one('<Section title="t"><ol><li>a</li></ol></Section>')).toEqual([]);
  });

  it('an <ol> in a component rendered only inside a Drawer (another file) is a hit in that drawer scope', () => {
    const steps = `${IMPORTS}\nexport function Steps() { return <ol><li>a</li></ol>; }\n`;
    const view = `${IMPORTS}\nimport { Steps } from './Steps';\nexport function View() { return <Drawer overlayId="x-d" isOpen title="t"><Steps /></Drawer>; }\n`;
    expect(k16({ 'pages/x/Steps.tsx': steps, 'pages/x/view.tsx': view })).toEqual(['layout.drawerOl pages/x/Steps.tsx overlay:x-d']);
  });

  it('an <ol> in a component rendered both in the page main and inside a Drawer is a hit (main scope: two render scopes)', () => {
    const steps = `${IMPORTS}\nexport function Steps() { return <ol><li>a</li></ol>; }\n`;
    const view = `${IMPORTS}\nimport { Steps } from './Steps';\nexport function View() { return <><Steps /><Drawer overlayId="x-d" isOpen title="t"><Steps /></Drawer></>; }\n`;
    expect(k16({ 'pages/x/Steps.tsx': steps, 'pages/x/view.tsx': view })).toEqual(['layout.drawerOl pages/x/Steps.tsx main']);
  });

  it("an <ol> in a component rendered only inside a Drawer's StepList (another file) is not a hit", () => {
    const steps = `${IMPORTS}\nexport function Steps() { return <ol><li>a</li></ol>; }\n`;
    const view = `${IMPORTS}\nimport { Steps } from './Steps';\nexport function View() { return <Drawer overlayId="x-d" isOpen title="t"><StepList><Steps /></StepList></Drawer>; }\n`;
    expect(k16({ 'pages/x/Steps.tsx': steps, 'pages/x/view.tsx': view })).toEqual([]);
  });

  it("an <ol> in an overlay's attribute is not in its body; in an attribute of an element in the body it is", () => {
    expect(one('<Drawer overlayId="x-d" isOpen title={<ol><li>a</li></ol>}><p>x</p></Drawer>')).toEqual([]);
    expect(one('<Drawer overlayId="x-d" isOpen title="t"><Row foo={<ol><li>a</li></ol>} /></Drawer>')).toEqual([
      'layout.drawerOl pages/x/view.tsx overlay:x-d',
    ]);
    expect(one('<Drawer overlayId="x-d" isOpen title="t"><StepList label={<ol><li>a</li></ol>} /></Drawer>')).toEqual([
      'layout.drawerOl pages/x/view.tsx overlay:x-d',
    ]);
  });
});

// The ESLint names: the plugin exports one rule per id (each reports only its own id's hits above the file's rows, read from the
// file on disk like hub/anatomy, which leaves the three out), and the Hub's config has them on for page code and off in tests.
describe('hub/no-loose-faqlink, hub/one-band-per-section, hub/no-drawer-ol', () => {
  const HUB = path.resolve(import.meta.dirname, '..', '..');
  const NAMES = ['no-loose-faqlink', 'one-band-per-section', 'no-drawer-ol'];
  it('the plugin exports the three rules beside hub/anatomy', () => {
    const plugin = createRequire(import.meta.url)('../../scripts/lint/eslint-hub.cjs') as { rules: Record<string, unknown> };
    expect(Object.keys(plugin.rules)).toEqual(expect.arrayContaining(['anatomy', ...NAMES]));
  });
  it('the config warns with them on a page file and turns them off in a test file', async () => {
    const eslint = new ESLint({
      cwd: HUB,
      overrideConfigFile: path.join(HUB, 'eslint.config.js'),
    });
    const on = (await eslint.calculateConfigForFile(path.join(HUB, 'src/pages/demo/view.tsx'))) as { rules: Record<string, unknown[]> };
    const off = (await eslint.calculateConfigForFile(path.join(HUB, 'src/pages/demo/view.test.tsx'))) as { rules: Record<string, unknown[]> };
    for (const n of NAMES) {
      expect(on.rules[`hub/${n}`]?.[0]).toBe(1);
      expect(off.rules[`hub/${n}`]?.[0]).toBe(0);
    }
  }, 120_000);
});
