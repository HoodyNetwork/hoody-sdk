// layout.explainGap on a reveal row's value. A SettingRow with `reveal` shows the setting as stored next to its Change…
// opener (who a share is for, when it ends, its addresses): that value is data the page read, like a done step's `result`
// (X.dataText). So a name the rule cannot trace there (a property read, a parameter) is data, not a gap. Everything else is
// judged as before: words the page wrote there count, a call the rule cannot measure stays a gap, a row without `reveal`
// keeps the gap, and children that are elements are walked as before (their own names stay gaps).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Detector = { scan(files: Record<string, string>, opts?: { disabled?: string[] }): { hits: Hit[] } };
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;

const KIT: Record<string, string> = {
  'kit/index.ts': ["export * from './layouts/Layouts';", "export * from './misc/Misc';", "export * from './strings';"].join('\n'),
  'kit/strings.ts': 'export function useStrings(table: any) { return (k: string, v?: any) => k; }',
  'kit/layouts/Layouts.tsx': 'export function Section(p: any) { return <section>{p.description}{p.children}</section>; }',
  'kit/misc/Misc.tsx': [
    'export function SettingRow(p: any) { return <div>{p.help}{p.detail}</div>; }',
    'export function SettingGroup(p: any) { return <div>{p.children}</div>; }',
    'export function Stack(p: any) { return <div>{p.children}</div>; }',
  ].join('\n'),
};
const HEAD = "import { Section, SettingGroup, SettingRow, Stack, useStrings } from '@kit';\nimport strings from './strings.en.json';\n";
const chars = (n: number) => 'abcdefghi '.repeat(Math.ceil(n / 10)).slice(0, n - 1) + 'z';
const TABLE = { open: 'Change…', d: chars(40), long: chars(200), none: 'Anyone' };
const REVEAL = `reveal={{ label: t('open'), onSave: () => {}, editor: <p>x</p> }}`;

function scan(row: string) {
  const page = `export function V({ row }: { row: { who: string; ips: string; at: number } }) { const t = useStrings(strings); return <Section title="s" description={t('d')}><SettingGroup label="g">${row}</SettingGroup></Section>; }`;
  const files = { ...KIT, 'pages/x/strings.en.json': JSON.stringify(TABLE), 'pages/x/view.tsx': HEAD + page };
  return A.scan(files).hits.filter((h) => h.file.startsWith('pages/'));
}
const gaps = (hits: Hit[]) => hits.filter((h) => h.rule === 'layout.explainGap');
const explain = (hits: Hit[]) => hits.filter((h) => h.rule === 'layout.explain');

describe('a reveal row value is data', () => {
  it('a property read, alone or beside the words for "none", is no gap on a row with reveal', () => {
    for (const value of ['{row.who}', "{row.who || t('none')}", '{row.ips}{row.who}', "{row.at === 0 ? t('none') : row.who}"]) {
      expect(gaps(scan(`<SettingRow label="l" ${REVEAL}>${value}</SettingRow>`)), value).toEqual([]);
    }
  });

  it('control: the same value on a row without reveal is still a gap', () => {
    expect(gaps(scan(`<SettingRow label="l">{row.who}</SettingRow>`))).toHaveLength(1);
  });

  it('words the page wrote in the value still count (over the budget = a hit, as without reveal)', () => {
    const withReveal = explain(scan(`<SettingRow label="l" ${REVEAL}>{t('long')}</SettingRow>`));
    const without = explain(scan(`<SettingRow label="l">{t('long')}</SettingRow>`));
    expect(withReveal).toHaveLength(1);
    expect(withReveal.length).toBe(without.length);
  });

  it('a call the rule cannot measure stays a gap', () => {
    expect(gaps(scan(`<SettingRow label="l" ${REVEAL}>{mystery(row.at)}</SettingRow>`))).toHaveLength(1);
  });

  it('element children are walked as before: a name inside them stays a gap', () => {
    expect(gaps(scan(`<SettingRow label="l" ${REVEAL}><Stack>{row.who}</Stack></SettingRow>`))).toHaveLength(1);
  });

  it('a reveal the rule cannot see (a spread) does not make the value data', () => {
    expect(gaps(scan(`<SettingRow label="l" {...extra}>{row.who}</SettingRow>`)).length).toBeGreaterThan(0);
  });
});
