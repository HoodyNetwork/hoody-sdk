// A strict section's data state: AnatomySection and SubSection draw `state` through the kit's
// StateBody, which shows notHere as an EmptyState, so an inline state={{ kind: 'notHere', title, body, action }} on them is read
// like the same state on DetailPage and ListDetailPage: its body counts as an EmptyState's does, its title and action are labels.
// Before, both reported "authored text in the state prop, which the rule does not know" (layout.explainGap).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; msg: string };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  scan(files: Record<string, string>, opts?: { disabled?: string[] }): { hits: Hit[] };
};

const KIT: Record<string, string> = {
  'kit/index.ts': ["export * from './layouts/anatomy/Section';", "export * from './misc/Misc';", "export * from './strings';"].join('\n'),
  'kit/strings.ts': 'export function useStrings(table: any) { return (k: string, v?: any) => k; }',
  'kit/layouts/anatomy/Section.tsx': [
    'export function AnatomySection(p: any) { return <section>{p.children}</section>; }',
    'export function SubSection(p: any) { return <section>{p.children}</section>; }',
  ].join('\n'),
  'kit/misc/Misc.tsx': 'export function Stack(p: any) { return <div>{p.children}</div>; }',
};
const HEAD = "import { AnatomySection, SubSection, Stack, useStrings } from '@kit';\nimport strings from './strings.en.json';\n";
const T = 'const t = useStrings(strings);\n';
/** `n` characters of text (one word per 10, so normalization keeps the length) */
const chars = (n: number) => 'abcdefghi '.repeat(Math.ceil(n / 10)).slice(0, n - 1) + 'z';
const table = { title: chars(300), short: chars(100), long: chars(300), go: chars(40), s: 'Section' };

function run(inner: string, pre = '') {
  const files = { ...KIT, 'pages/x/strings.en.json': JSON.stringify(table), 'pages/x/view.tsx': `${HEAD}export function V(p: any) { ${T} ${pre} return ${inner}; }\n` };
  const hits = A.scan(files).hits.filter((h) => h.file.startsWith('pages/'));
  return { e: hits.filter((h) => h.rule === 'layout.explain').length, g: hits.filter((h) => h.rule === 'layout.explainGap').length };
}

describe('a strict section state: state={{ kind, title, body }} on AnatomySection and SubSection', () => {
  for (const name of ['AnatomySection', 'SubSection'] as const) {
    const open = `<${name} id="x" title={t('s')} `;
    const close = ` />`;
    it(`${name}: a short body and a long title are clean, with no gap`, () => {
      expect(run(`${open}state={{ kind: 'notHere', title: t('title'), body: t('short') }}${close}`)).toEqual({ e: 0, g: 0 });
    });
    it(`${name}: an action is a label, not a gap`, () => {
      expect(run(`${open}state={{ kind: 'notHere', icon: 'computer', title: t('short'), body: t('short'), action: { id: 'a', label: t('go'), onPress: () => {} } }}${close}`)).toEqual({ e: 0, g: 0 });
    });
    it(`mutant: ${name} with a 300 character body is over budget, as an EmptyState's would be`, () => {
      expect(run(`${open}state={{ kind: 'notHere', title: t('short'), body: t('long') }}${close}`)).toEqual({ e: 2, g: 0 });
    });
    it(`control: ${name} with a spread in its state is a gap`, () => {
      expect(run(`${open}state={{ ...p, body: t('short') }}${close}`).g).toBe(1);
    });
    it(`control: ${name} with its state in a variable is a gap`, () => {
      expect(run(`${open}state={s}${close}`, "const s = { kind: 'notHere' as const, title: t('title'), body: t('short') };").g).toBe(1);
    });
  }
  it('control: the same inline state on another component keeps the gap', () => {
    expect(run(`<Stack state={{ kind: 'notHere', title: t('short'), body: t('short') }} />`).g).toBe(1);
  });
});
