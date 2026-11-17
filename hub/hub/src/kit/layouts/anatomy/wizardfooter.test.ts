// A WizardPage's footer is the kit WizardFooter. The registry types WizardPage `footer`
// as `wizard-footer` (the WizardFooter alone) and WizardFooter `primary`/`secondary` as buttons; the explain rule reads its
// `back` ({ onPress, isDisabled }) as a handler and a flag, never authored text. The detector default holds the same rows.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Registry {
  slots: Record<string, Record<string, string>>;
  slotTypes: Record<string, string[]>;
}
const A = createRequire(import.meta.url)('../../../../scripts/lint/anatomy.cjs') as {
  DEFAULT_REGISTRY: Registry;
  loadRegistry(dir?: string): Registry;
  scan(files: Record<string, string>, opts: { registry: Registry }): { hits: { rule: string; file: string; msg: string }[] };
};

const kit: Record<string, string> = {
  'kit/index.ts': "export * from './layouts/Layouts';\nexport * from './controls/Button';",
  'kit/layouts/Layouts.tsx': [
    'export function WizardPage(p: any) { return <div>{p.children}{p.footer}</div>; }',
    'export function WizardFooter(p: any) { return <div>{p.secondary}{p.primary}</div>; }',
  ].join('\n'),
  'kit/controls/Button.tsx': 'export function Button(p: any) { return <button>{p.children}</button>; }',
};

/** The layout.slot and layout.explainGap messages of a page whose WizardPage footer is `footer`. */
function hits(footer: string): { slot: string[]; gap: string[] } {
  const page = [
    "import { Button, WizardFooter, WizardPage } from '@kit';",
    'export function View({ go }: { go: (n: number) => void }) {',
    `  return <WizardPage footer={${footer}}><p>One short line.</p></WizardPage>;`,
    '}',
  ].join('\n');
  const r = A.scan({ ...kit, 'pages/x/view.tsx': page }, { registry: A.loadRegistry(join(import.meta.dirname)) });
  const of = (rule: string) => r.hits.filter((h) => h.rule === rule && h.file === 'pages/x/view.tsx').map((h) => h.msg);
  return { slot: of('layout.slot'), gap: of('layout.explainGap') };
}

describe('the kit WizardFooter in the anatomy registry', () => {
  it('registers WizardPage footer as the wizard-footer type and WizardFooter primary/secondary as actions, in both registries', () => {
    for (const reg of [A.loadRegistry(join(import.meta.dirname)), A.DEFAULT_REGISTRY]) {
      // `aside` holds the summary's place in the wizard grid (Layouts.tsx WizardPage). It draws no frame of its own, so its
      // type is the summary parts plus one AnatomySection, the card New script and New realm put there.
      expect(reg.slots.WizardPage).toEqual({ summary: 'summary', aside: 'side-card', notice: 'notices', footer: 'wizard-footer' });
      expect(reg.slotTypes['side-card']).toEqual([...reg.slotTypes.summary!, 'AnatomySection']);
      expect(reg.slotTypes.summary).not.toContain('AnatomySection');
      expect(reg.slots.WizardFooter).toEqual({ primary: 'actions', secondary: 'actions' });
      expect(reg.slotTypes['wizard-footer']).toEqual(['WizardFooter']);
    }
  });

  it('a WizardFooter with Back, a secondary and a primary button is clean: no slot hit, no gap for back', () => {
    const h = hits('<WizardFooter back={{ onPress: () => go(0), isDisabled: false }} secondary={<Button>Skip</Button>} primary={<Button>Next</Button>} />');
    expect(h.slot).toEqual([]);
    expect(h.gap.filter((m) => m.includes('back'))).toEqual([]);
  });

  it('a bare button in the footer is a hit: the footer takes the WizardFooter, which lays the row out', () => {
    expect(hits('<Button>Next</Button>').slot).toEqual(['WizardPage.footer: <Button> in a wizard-footer slot']);
  });

  it('a raw element in the primary is a hit: it takes the kit buttons', () => {
    expect(hits('<WizardFooter primary={<div>Next</div>} />').slot).toEqual(['WizardFooter.primary: a raw <div> in a actions slot']);
  });

  it('back as a condition between the literal and nothing (the Flow form) is clean', () => {
    const h = hits('<WizardFooter back={go.length > 0 ? { onPress: () => go(0) } : undefined} primary={<Button>Next</Button>} />');
    expect(h.slot).toEqual([]);
    expect(h.gap.filter((m) => m.includes('back'))).toEqual([]);
  });

  it.each([
    ['another field', '{ onPress: () => go(0), text: "Authored text" }'],
    ['a spread', '{ ...{ onPress: () => go(0), text: "Authored text" } }'],
    ['a computed key', '{ ["te" + "xt"]: "Authored text", onPress: () => go(0) }'],
    ['text nested under onPress', '{ onPress: { text: "Authored text" } }'],
    ['text as isDisabled', '{ onPress: () => go(0), isDisabled: "Authored text" }'],
    ['a getter', '{ get onPress() { return <div>Authored text</div>; } }'],
    ['a method', '{ onPress() { return <div>Authored text</div>; } }'],
  ])('back holding %s is read as usual: its text is a gap, never a silent label', (_what, back) => {
    const h = hits(`<WizardFooter back={${back}} primary={<Button>Next</Button>} />`);
    expect(h.gap.some((m) => m.includes('back'))).toBe(true);
  });

  it('an unknown WizardFooter prop carrying text is still a gap: only back is known', () => {
    const h = hits('<WizardFooter back={{ onPress: () => go(0) }} primary={<Button>Next</Button>} extra={{ words: "Takes a minute" }} />');
    expect(h.gap.filter((m) => m.includes('back'))).toEqual([]);
    expect(h.gap.some((m) => m.includes('extra prop'))).toBe(true);
  });
});
