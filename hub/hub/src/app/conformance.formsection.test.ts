// Form sections in overlays (the form.* rules of the page-anatomy detector), and their ratchet.
// - form.flat: five or more kit fields in one column of an overlay, outside a FormSection or SettingGroup: one hit
//   per file and overlay scope.
// - form.handGroup: a <fieldset>, or an element drawn with a page class named like a label that is not a <label>, in
//   an overlay body: a group's name is a FormSection title, a step above the field labels.
// The debt list is app/conformance/formSection.debt.ts; it only shrinks.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FORM_SECTION_DEBT } from './conformance/formSection.debt';

type FormHit = { rule: string; file: string; scope: string; line: number; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  FORM_RULES: string[];
  readTree(dir: string): Record<string, string>;
  loadRegistry(anatomyDir?: string, exceptionsPath?: string): unknown;
  scan(files: Record<string, string>, opts?: { registry?: unknown }): { formHits: FormHit[] };
};
const SRC = join(import.meta.dirname, '..');

const kit: Record<string, string> = {
  'kit/index.ts': "export * from './parts';",
  'kit/parts.tsx': [
    'export function Dialog(p: any) { return <div>{p.children}</div>; }',
    'export function Drawer(p: any) { return <div>{p.children}{p.footer}</div>; }',
    'export function Stack(p: any) { return <div>{p.children}</div>; }',
    'export function FormSection(p: any) { return <div>{p.children}</div>; }',
    'export function SettingGroup(p: any) { return <div>{p.children}</div>; }',
    'export function TextField(p: any) { return <input />; }',
    'export function Select(p: any) { return <div />; }',
    'export function Checkbox(p: any) { return <input />; }',
    'export function Button(p: any) { return <button>{p.children}</button>; }',
  ].join('\n'),
};
const IMPORTS = "import { Button, Checkbox, Dialog, Drawer, FormSection, Select, SettingGroup, Stack, TextField } from '@kit';\nimport s from './x.module.css';";
const page = (body: string) => `${IMPORTS}\nexport function View({ on }: { on: boolean }) {\n  return (<>${body}</>);\n}\n`;
const scan = (files: Record<string, string>): string[] =>
  A.scan({ ...kit, 'pages/x/x.module.css': '.a{}', ...files }, { registry: A.loadRegistry(join(SRC, 'kit/layouts/anatomy')) }).formHits.map((h) => `${h.rule} ${h.file} ${h.scope}`);
const one = (body: string) => scan({ 'pages/x/view.tsx': page(body) });
const FIELDS = (n: number) => Array.from({ length: n }, (_, i) => `<TextField label="f${i}" />`).join('');

describe('form.flat', () => {
  it('five loose fields in a dialog are one hit, keyed by the overlay', () => {
    expect(one(`<Dialog overlayId="x-d" isOpen title="t"><Stack>${FIELDS(5)}</Stack></Dialog>`)).toEqual(['form.flat pages/x/view.tsx overlay:x-d']);
  });
  it('four fields are a short form: no hit', () => {
    expect(one(`<Dialog overlayId="x-d" isOpen title="t">${FIELDS(4)}</Dialog>`)).toEqual([]);
  });
  it('fields in FormSections (or a SettingGroup) are grouped: no hit', () => {
    expect(one(`<Drawer overlayId="x-d" isOpen title="t"><FormSection>${FIELDS(2)}</FormSection><FormSection title="More">${FIELDS(4)}</FormSection></Drawer>`)).toEqual([]);
    expect(one(`<Drawer overlayId="x-d" isOpen title="t"><SettingGroup>${FIELDS(6)}</SettingGroup></Drawer>`)).toEqual([]);
  });
  it('only the fields outside a section count', () => {
    expect(one(`<Drawer overlayId="x-d" isOpen title="t"><FormSection>${FIELDS(3)}</FormSection>${FIELDS(4)}</Drawer>`)).toEqual([]);
    expect(one(`<Drawer overlayId="x-d" isOpen title="t"><FormSection>${FIELDS(1)}</FormSection>${FIELDS(5)}</Drawer>`)).toEqual(['form.flat pages/x/view.tsx overlay:x-d']);
  });
  it('a long form on the page itself (no overlay) is not this rule', () => {
    expect(one(`<Stack>${FIELDS(8)}</Stack>`)).toEqual([]);
  });
  it('a form component is counted where it renders: in the overlay of its caller', () => {
    const form = `${IMPORTS}\nexport function KeyForm() { return <Stack>${FIELDS(6)}</Stack>; }\n`;
    const view = "import { Drawer } from '@kit';\nimport { KeyForm } from './KeyForm';\nexport function View() { return <Drawer overlayId=\"x-d\" isOpen title=\"t\"><KeyForm /></Drawer>; }\n";
    expect(scan({ 'pages/x/KeyForm.tsx': form, 'pages/x/view.tsx': view })).toEqual(['form.flat pages/x/KeyForm.tsx overlay:x-d']);
  });
  it('two overlays of one file are judged apart', () => {
    expect(one(`<Dialog overlayId="x-a" isOpen title="t">${FIELDS(3)}</Dialog><Dialog overlayId="x-b" isOpen title="t">${FIELDS(3)}</Dialog>`)).toEqual([]);
  });
});

describe('form.handGroup', () => {
  it('a fieldset in an overlay body is a hit', () => {
    expect(one('<Dialog overlayId="x-d" isOpen title="t"><fieldset><legend>Rights</legend><Checkbox label="a" /></fieldset></Dialog>')).toEqual(['form.handGroup pages/x/view.tsx overlay:x-d']);
  });
  it('text drawn with a label-named page class is a hit; a real <label> is not', () => {
    expect(one('<Dialog overlayId="x-d" isOpen title="t"><span className={s.fieldLabel}>Tools</span><TextField label="Add a tool" /></Dialog>')).toEqual(['form.handGroup pages/x/view.tsx overlay:x-d']);
    expect(one('<Dialog overlayId="x-d" isOpen title="t"><label className={s.fieldLabel}>Tools</label></Dialog>')).toEqual([]);
    expect(one('<Dialog overlayId="x-d" isOpen title="t"><span className={s.labelled}>Tools</span></Dialog>')).toEqual([]);
  });
  it('outside an overlay neither is this rule', () => {
    expect(one('<fieldset><legend>Rights</legend></fieldset><span className={s.groupLabel}>Tools</span>')).toEqual([]);
  });
});

describe('form sections ratchet', () => {
  let counts: Record<string, Record<string, number>> = {};
  let hits: FormHit[] = [];
  beforeAll(() => {
    hits = A.scan(A.readTree(SRC), { registry: A.loadRegistry(join(SRC, 'kit/layouts/anatomy'), join(SRC, 'app/conformance/exceptions.ts')) }).formHits;
    counts = {};
    for (const h of hits) {
      const key = `${h.file} ${h.scope}`;
      const rule = (counts[h.rule] ??= {});
      rule[key] = (rule[key] ?? 0) + 1;
    }
  }, 180_000);
  const where = (rule: string, key: string) =>
    hits.filter((h) => h.rule === rule && `${h.file} ${h.scope}` === key).slice(0, 4).map((h) => `    ${h.file}:${h.line} ${h.msg}`).join('\n');

  it('the debt list names the detector\'s form rules', () => {
    expect(Object.keys(FORM_SECTION_DEBT).sort()).toEqual([...A.FORM_RULES].sort());
  });
  it('no form debt grew: every (rule, file, scope) is at or below its row', () => {
    const grown = Object.entries(counts).flatMap(([rule, rows]) =>
      Object.entries(rows).filter(([k, n]) => n > ((FORM_SECTION_DEBT as Record<string, Record<string, number>>)[rule]?.[k] ?? 0)).map(([k, n]) => `${rule}  ${k}: ${n} hit(s), row allows ${(FORM_SECTION_DEBT as Record<string, Record<string, number>>)[rule]?.[k] ?? 0}\n${where(rule, k)}`),
    );
    expect(grown, 'a form in an overlay is cut into kit FormSections (kit/forms/FormSection.tsx); rows: app/conformance/formSection.debt.ts').toEqual([]);
  });
  it('no row is stale: each row equals the detector\'s count (a fixed overlay lowers or deletes its row)', () => {
    const stale = Object.entries(FORM_SECTION_DEBT).flatMap(([rule, rows]) => Object.entries(rows).filter(([k, n]) => n !== (counts[rule]?.[k] ?? 0)).map(([k, n]) => `${rule}  ${k}: row ${n}, detector counts ${counts[rule]?.[k] ?? 0}`));
    expect(stale, 'these rows differ from the debt that is left').toEqual([]);
  });
});
