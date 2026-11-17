// The page-anatomy slot table knows a CodeEditor's `tools`: the editor's own toolbar, where a page adds its controls
// (Copy code, Download, Edit with the assistant). It is an actions slot: kit buttons pass, text or a layout box is a hit.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  loadRegistry(dir?: string): unknown;
  scan(files: Record<string, string>, opts?: { registry?: unknown }): { hits: Hit[] };
};

const kit: Record<string, string> = {
  'kit/index.ts': ["export * from './forms/CodeEditor';", "export * from './controls/Button';", "export * from './layouts/Stack';"].join('\n'),
  'kit/forms/CodeEditor.tsx': 'export function CodeEditor(p: any) { return <div>{p.tools}</div>; }',
  'kit/controls/Button.tsx': 'export function Button(p: any) { return <button>{p.children}</button>; }',
  'kit/layouts/Stack.tsx': 'export function Stack(p: any) { return <div>{p.children}</div>; }',
};
const page = (el: string) => `import { Button, CodeEditor, Stack } from '@kit';\nexport function View({ v }: any) {\n  return (${el});\n}\n`;

function slotHits(el: string, registry?: unknown): string[] {
  const r = A.scan({ ...kit, 'pages/x/view.tsx': page(el) }, registry === undefined ? {} : { registry });
  return r.hits.filter((h) => h.file === 'pages/x/view.tsx' && h.rule === 'layout.slot').map((h) => h.msg);
}
const REGISTRY = () => A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy'));

describe('CodeEditor tools: an actions slot', () => {
  for (const [name, reg] of [['kit registry', REGISTRY], ['detector default', () => undefined]] as const) {
    it(`${name}: kit buttons in tools are no hit`, () => {
      expect(slotHits('<CodeEditor value={v} label="Code" tools={<><Button>Download</Button><Button>Edit</Button></>} />', reg())).toEqual([]);
    });

    it(`${name}: a layout box in tools is a hit naming the slot`, () => {
      const out = slotHits('<CodeEditor value={v} label="Code" tools={<Stack><Button>Download</Button></Stack>} />', reg());
      expect(out).toHaveLength(1);
      expect(out[0]).not.toMatch(/not in the slot table/);
    });
  }
});
