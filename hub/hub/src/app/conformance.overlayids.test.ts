// Overlay names are unique within a page (rule layout.overlayId). The anatomy detector keys an overlay's hits by its
// overlayId (`overlay:<id>`), and the open dialog carries it as `data-hub-overlay`, so two overlays of one page sharing
// an id would pool their debt rows and answer one DOM query. The ids come from the detector itself (`scan().overlays`:
// every literal id it reads, in whatever form, at the element that names it), so this guard sees exactly the ids the
// scopes are keyed by; an id the detector cannot read is a layout.overlayId hit, judged by conformance.anatomy.test.ts.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Overlay = { file: string; line: number; id: string };
interface Detector {
  readTree(dir: string): Record<string, string>;
  loadRegistry(anatomyDir?: string): unknown;
  scan(files: Record<string, string>, opts?: { registry?: unknown }): { hits: Array<{ rule: string; scope: string }>; overlays: Overlay[] };
}
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;
const SRC = join(import.meta.dirname, '..');

/** `page: id is named N times: file:line, ...` for every id named more than once within one page. */
function duplicates(overlays: Overlay[]): string[] {
  const sites = new Map<string, string[]>();
  for (const o of overlays) {
    const page = /^pages\/([^/]+)\//.exec(o.file)?.[1];
    if (!page) continue;
    const key = `${page}: ${o.id}`;
    sites.set(key, [...(sites.get(key) ?? []), `${o.file}:${o.line}`]);
  }
  return [...sites].filter(([, at]) => at.length > 1).map(([key, at]) => `${key} is named ${at.length} times: ${at.join(', ')}`);
}

const KIT = {
  'kit/index.ts': "export { Dialog } from './overlays/Dialog';",
  'kit/overlays/Dialog.tsx': 'export function Dialog(p: any) { return <div>{p.children}</div>; }',
};
/** A page file holding one plain `x-edit` dialog and a second dialog written as `second`. */
const page = (second: string) => `import { Dialog } from '@kit';
export function V() { return <>
<Dialog overlayId="x-edit"><p>one</p></Dialog>
${second}
</>; }`;
const scanOf = (files: Record<string, string>) => A.scan({ ...KIT, ...files });

describe('overlay ids', () => {
  it('every overlay id is named once within its page', () => {
    const { overlays } = A.scan(A.readTree(SRC), { registry: A.loadRegistry(join(SRC, 'kit/layouts/anatomy')) });
    expect(overlays.filter((o) => o.file.startsWith('pages/')).length).toBeGreaterThan(100); // the detector reports ids at all
    expect(duplicates(overlays), 'one overlayId names one overlay of a page: give the second Drawer, Sheet, Dialog or ConfirmDialog its own literal overlayId (`<page>-<what it is for>`), or render the one overlay from one place').toEqual([]);
  }, 300_000);

  it.each([
    ['plain', '<Dialog overlayId="x-edit"><p>two</p></Dialog>'],
    ['single quotes', "<Dialog overlayId='x-edit'><p>two</p></Dialog>"],
    ['an expression', '<Dialog overlayId={"x-edit"}><p>two</p></Dialog>'],
    ['parenthesized', '<Dialog overlayId={("x-edit")}><p>two</p></Dialog>'],
    ['a template', '<Dialog overlayId={`x-edit`}><p>two</p></Dialog>'],
    ['an escape', '<Dialog overlayId={"x\\u002dedit"}><p>two</p></Dialog>'],
    ['a spread object', '<Dialog {...{ overlayId: "x-edit" }}><p>two</p></Dialog>'],
    ['a quoted key', '<Dialog {...{ "overlayId": "x-edit" }}><p>two</p></Dialog>'],
    ['a wrapped computed key', '<Dialog {...{ [("overlayId")]: "x-edit" }}><p>two</p></Dialog>'],
    ['an asserted computed key', '<Dialog {...{ ["overlayId" as const]: "x-edit" }}><p>two</p></Dialog>'],
  ])('a second x-edit written as %s is caught', (_what, second) => {
    const files = { 'pages/x/view.tsx': page(second) };
    expect(scanOf(files).hits.filter((h) => h.rule === 'layout.overlayId')).toEqual([]); // the detector reads it as a name
    expect(duplicates(scanOf(files).overlays)).toEqual(['x: x-edit is named 2 times: pages/x/view.tsx:3, pages/x/view.tsx:4']);
  });

  it('a held object and a wrapper render site are caught at the element that names the id', () => {
    const held = page('<Dialog {...merge}><p>two</p></Dialog>').replace('export function V', 'const merge = { overlayId: "x-edit" };\nexport function V');
    expect(duplicates(scanOf({ 'pages/x/view.tsx': held }).overlays)).toEqual(['x: x-edit is named 2 times: pages/x/view.tsx:4, pages/x/view.tsx:5']);
    const files = {
      'pages/x/parts/Wrap.tsx': "import { Dialog } from '@kit';\nexport function Wrap({ overlayId }: { overlayId: string }) { return <Dialog overlayId={overlayId}><p>w</p></Dialog>; }",
      'pages/x/view.tsx': page('<Wrap overlayId="x-edit" />').replace("import { Dialog } from '@kit';", "import { Dialog } from '@kit';\nimport { Wrap } from './parts/Wrap';"),
    };
    expect(duplicates(scanOf(files).overlays)).toEqual(['x: x-edit is named 2 times: pages/x/view.tsx:4, pages/x/view.tsx:5']);
  });

  it.each(['jsx', 'mjs', 'cjs'])('a duplicate in a .%s page file is caught', (ext) => {
    const files = { [`pages/x/view.${ext}`]: page('<Dialog overlayId="x-edit"><p>two</p></Dialog>') };
    expect(duplicates(scanOf(files).overlays)).toEqual([`x: x-edit is named 2 times: pages/x/view.${ext}:3, pages/x/view.${ext}:4`]);
  });

  it('another page may reuse an id, tests are not page overlays, and two different ids pass', () => {
    const files = {
      'pages/x/view.tsx': page('<Dialog overlayId="x-drop"><p>two</p></Dialog>'),
      'pages/y/view.tsx': page(''),
      'pages/x/view.test.tsx': page('<Dialog overlayId="x-edit"><p>two</p></Dialog>'),
    };
    expect(duplicates(scanOf(files).overlays)).toEqual([]);
  });
});
