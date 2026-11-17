// A Band with `attach` wraps its field, so it stands in a field slot (a SettingRow's children,
// read where the detector reads them: a render function, as kit/gallery/settingGroups.tsx writes it); its `attach` prop is
// its own `attached` slot: the field parts plus PickerPanel and SettingGroup (both point their aria-describedby at the Band's
// sentence). A Band without `attach` keeps the plain rule: a field slot does not take it, and a Band stands in a field slot
// only when what it attaches is itself a field (a SettingRow never takes a SettingGroup, attached or not). Registry: slots.ts
// Band `attach: 'attached'`, the detector's `slotVia` (hub/scripts/lint/anatomy.cjs).
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
  'kit/index.ts': "export * from './misc/Misc';",
  'kit/misc/Misc.tsx': ['SettingRow', 'Band', 'NumberField', 'TextButton', 'EmptyState', 'SettingGroup', 'PickerPanel', 'Section']
    .map((n) => `export function ${n}(p: any) { return <div />; }`)
    .join('\n'),
};
const IMPORTS = "import { SettingRow, Band, NumberField, TextButton, EmptyState, SettingGroup, PickerPanel, Section } from '@kit';\n";

/** The layout.slot messages of one page file. */
function hits(body: string): string[] {
  const r = A.scan({ ...KIT, 'pages/x/view.tsx': `${IMPORTS}export function V() { return ${body}; }\n` }, { registry: REG });
  return r.hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
}
/** A SettingRow whose field is `inner`, given as the row's render function (the field gets the row's ids). */
const row = (inner: string) => `<SettingRow label="Port">{(ids: any) => ${inner}}</SettingRow>`;

describe('a Band with attach stands in a field slot', () => {
  it('a SettingRow takes a Band that attaches its field, with an end link', () => {
    expect(hits(row('<Band tone="warn" attach={<NumberField />} actions={<TextButton />}>Port 22 is SSH.</Band>'))).toEqual([]);
  });
  // Baseline guard: the plain rule still holds.
  it('a Band without attach is not a field', () => {
    expect(hits(row('<Band tone="warn">Port 22 is SSH.</Band>'))).toEqual(['SettingRow children: <Band> in a field slot']);
  });
  // Baseline guard: the field slot's own rule.
  it('the field slot still takes a field and refuses a raw element', () => {
    expect(hits(row('<NumberField />'))).toEqual([]);
    expect(hits(row('<input />'))).toEqual(['SettingRow children: a raw <input> in a field slot']);
  });
  it('attach is its own slot: a raw element or a Band there is a hit (and the outer Band then attaches no kit field)', () => {
    const outer = 'SettingRow children: <Band> in a field slot';
    expect(hits(row('<Band tone="warn" attach={<input />}>x</Band>'))).toEqual([outer, 'Band.attach: a raw <input> in a attached slot']);
    expect(hits(row('<Band tone="warn" attach={<Band>y</Band>}>x</Band>'))).toEqual([outer, 'Band.attach: <Band> in a attached slot']);
  });
  it('attach takes a kit PickerPanel or SettingGroup (the warning is about that list), in a section body', () => {
    for (const part of ['PickerPanel', 'SettingGroup']) {
      expect(hits(`<Section title="s"><Band tone="warn" attach={<${part} />}>x</Band></Section>`), part).toEqual([]);
    }
  });
  it('the field slot is not widened: a SettingRow refuses a SettingGroup, alone or attached to a Band', () => {
    expect(hits(row('<SettingGroup />'))).toEqual(['SettingRow children: <SettingGroup> in a field slot']);
    expect(hits(row('<Band tone="warn" attach={<SettingGroup />}>x</Band>'))).toEqual(['SettingRow children: <Band> in a field slot']);
    expect(hits(row('<Band tone="warn" attach={<PickerPanel />}>x</Band>'))).toEqual(['SettingRow children: <Band> in a field slot']);
  });
  it('attach must hold an element on every path: unset, conditional or computed values leave a plain notice and are hits', () => {
    const bare = ['SettingRow children: <Band> in a field slot'];
    expect(hits(row('<Band tone="warn" attach={undefined}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach={ids ? <NumberField /> : undefined}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach={ids.field}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach={(<NumberField />)}>x</Band>'))).toEqual([]);
  });
  it('a fragment, or a spread written after attach that can replace it, is not a provable field', () => {
    const bare = ['SettingRow children: <Band> in a field slot'];
    expect(hits(row('<Band tone="warn" attach={<></>}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach={<>{ids && <NumberField />}</>}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" attach={<NumberField />} {...ids}>x</Band>'))).toEqual(bare);
    expect(hits(row('<Band tone="warn" {...ids} attach={<NumberField />}>x</Band>'))).toEqual([]);
  });
  it('an attach that is not itself a kit field (a local component that may render nothing) is not provable', () => {
    const r = A.scan(
      { ...KIT, 'pages/x/view.tsx': `${IMPORTS}function MaybeField() { return null; }\nexport function V() { return ${row('<Band tone="warn" attach={<MaybeField />}>x</Band>')}; }\n` },
      { registry: REG },
    );
    const msgs = r.hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
    expect(msgs).toContain('SettingRow children: <Band> in a field slot');
  });
  it('attach does not make a Band fit another slot: an EmptyState action still refuses it', () => {
    expect(hits('<EmptyState action={<Band attach={<NumberField />}>x</Band>} />')).toEqual(['EmptyState.action: <Band> in a actions slot']);
  });
});
