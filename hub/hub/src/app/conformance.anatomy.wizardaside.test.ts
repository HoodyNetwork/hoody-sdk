// The page-anatomy slot table knows WizardPage `aside`: the flow variant's side card, which holds the summary's place
// (New realm passes its summary Section there). It is a summary slot, like `summary`: a kit Section passes; a raw
// layout box is a hit naming the slot, never "not in the slot table".
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  loadRegistry(dir?: string): unknown;
  scan(files: Record<string, string>, opts?: { registry?: unknown }): { hits: Hit[] };
};

const kit: Record<string, string> = {
  'kit/index.ts': ["export * from './layouts/Layouts';", "export * from './layouts/Section';", "export * from './layouts/Stack';"].join('\n'),
  'kit/layouts/Layouts.tsx': 'export function WizardPage(p: any) { return <div>{p.aside}{p.summary}{p.children}</div>; }',
  'kit/layouts/Section.tsx': 'export function Section(p: any) { return <section>{p.children}</section>; }',
  'kit/layouts/Stack.tsx': 'export function Stack(p: any) { return <div>{p.children}</div>; }',
};
const page = (el: string) => `import { Section, Stack, WizardPage } from '@kit';\nexport function View({ v }: any) {\n  return (${el});\n}\n`;

function slotHits(el: string, registry?: unknown): string[] {
  const r = A.scan({ ...kit, 'pages/x/view.tsx': page(el) }, registry === undefined ? {} : { registry });
  return r.hits.filter((h) => h.file === 'pages/x/view.tsx' && h.rule === 'layout.slot').map((h) => h.msg);
}
const REGISTRY = () => A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy'));

describe('WizardPage aside: a summary slot', () => {
  for (const [name, reg] of [['kit registry', REGISTRY], ['detector default', () => undefined]] as const) {
    it(`${name}: a kit Section in aside is no hit`, () => {
      expect(slotHits('<WizardPage variant="flow" aside={<Section title="Summary">{v}</Section>}>{v}</WizardPage>', reg())).toEqual([]);
    });

    it(`${name}: a layout box in aside is a hit naming the slot`, () => {
      const out = slotHits('<WizardPage variant="flow" aside={<Stack>{v}</Stack>}>{v}</WizardPage>', reg());
      expect(out).toHaveLength(1);
      expect(out[0]).not.toMatch(/not in the slot table/);
    });
  }
});
