// The page-anatomy detector finds the slot row of a kit part exported under another name (`export { VerdictRoot as Verdict }`,
// kit/states/Verdict.tsx) by its exported name when its declared name has none, so the row
// `Verdict: { next, slot, facts }` matches, and Verdict's `next` line is text the
// explain rule knows. The declared name stays the part's identity for every other rule: a legacy part
// re-exported under a new name is still the legacy part.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  loadRegistry(dir?: string): unknown;
  scan(files: Record<string, string>, opts: { registry: unknown }): { hits: Hit[] };
};

const kit: Record<string, string> = {
  'kit/index.ts': ["export * from './states/Verdict';", "export * from './data/Facts';", "export * from './controls/Button';", "export * from './layouts/Layouts';"].join('\n'),
  'kit/layouts/Layouts.tsx': 'export function Panel(p: any) { return <div>{p.children}</div>; }\nexport { Panel as OtherPanel };',
  'kit/states/Verdict.tsx': 'function VerdictRoot(p: any) { return <div>{p.children}{p.next}{p.slot}{p.facts}</div>; }\nexport { VerdictRoot as Verdict };',
  'kit/data/Facts.tsx': 'export function Facts(p: any) { return <dl />; }',
  'kit/controls/Button.tsx': 'export function Button(p: any) { return <button>{p.children}</button>; }',
};
const page = (el: string) => `import { Button, Facts, OtherPanel, Verdict } from '@kit';\nexport function View() {\n  return (${el});\n}\n`;

/** The slot, explain and legacy hits of one page element (kit added), as `rule msg`. */
function hits(el: string): string[] {
  const r = A.scan({ ...kit, 'pages/x/view.tsx': page(el) }, { registry: A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy')) });
  return r.hits.filter((h) => h.file === 'pages/x/view.tsx' && /^layout\.(slot|explainGap|legacy)$/.test(h.rule)).map((h) => `${h.rule} ${h.msg}`);
}

describe('a kit part exported under another name', () => {
  it("is its slot row: Verdict's facts and next are what the table says, with no hit", () => {
    expect(hits('<Verdict label="State" next="Next: turn privacy off" facts={<Facts items={[]} label="The bot" />}>It works</Verdict>')).toEqual([]);
  });

  it('is judged by the exported name: a prop the row does not list is a slot hit that names Verdict, never VerdictRoot', () => {
    const out = hits('<Verdict label="State" other={<Facts items={[]} label="x" />}>It works</Verdict>');
    expect(out).toEqual(['layout.slot Verdict.other takes caller content and is not in the slot table']);
  });

  it("is judged by the row's slot kinds: a button in facts (a body slot) is a hit", () => {
    const out = hits('<Verdict label="State" facts={<Button>Go</Button>}>It works</Verdict>');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^layout\.slot .*Button.*body slot/);
  });

  it('keeps its declared name as its identity: a legacy part exported under a new name is still the legacy part', () => {
    expect(hits('<OtherPanel>Old</OtherPanel>')).toContain('layout.legacy <Panel> is the legacy API (being removed)');
  });
});
