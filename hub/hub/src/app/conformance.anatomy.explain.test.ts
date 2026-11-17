// layout.explain and layout.explainGap against fixtures. Every mutant
// must hit, every control must stay clean, and a mutant scanned with its rule switched off (`disabled`) loses the hit: the red half
// of red-first. Explanation is measured per REGION in characters (budget 150, step 75; FAQ answers 600), so splitting or merging
// keys changes nothing, and what the walk cannot read is a GAP (layout.explainGap), never a silent zero.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Detector = {
  scan(files: Record<string, string>, opts?: { disabled?: string[]; readSrc?: (rel: string) => string | null }): { hits: Hit[]; counts: Record<string, number> };
  readTree(dir: string): Record<string, string>;
  lintHits(srcDir: string, rel: string, source?: string): Hit[];
};
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;

const KIT: Record<string, string> = {
  'kit/index.ts': [
    "export * from './layouts/Layouts';",
    "export * from './controls/Controls';",
    "export * from './states/States';",
    "export * from './overlays/Overlays';",
    "export * from './misc/Misc';",
    "export * from './strings';",
  ].join('\n'),
  'kit/strings.ts': 'export function useStrings(table: any) { return (k: string, v?: any) => k; }',
  'kit/layouts/Layouts.tsx': [
    'export function Section(p: any) { return <section>{p.description}{p.children}</section>; }',
    'export function SettingsPage(p: any) { return <main>{p.children}</main>; }',
    'export function TablePage(p: any) { return <main>{p.children}</main>; }',
    'export function DetailPage(p: any) { return <main>{p.children}</main>; }',
    'export function ListDetailPage(p: any) { return <main>{p.banner}{p.list}</main>; }',
  ].join('\n'),
  'kit/controls/Controls.tsx': ['export function Button(p: any) { return <button />; }', 'export function Disclosure(p: any) { return <div>{p.children}</div>; }', 'export function FaqLink(p: any) { return <a>{p.children}</a>; }'].join('\n'),
  'kit/states/States.tsx': [
    'export function EmptyState(p: any) { return <div />; }',
    'export function FirstUseState(p: any) { return <div />; }',
    'export function Band(p: any) { return <div>{p.children}</div>; }',
    'export function PauseBand(p: any) { return <div />; }',
  ].join('\n'),
  'kit/overlays/Overlays.tsx': ['export function Drawer(p: any) { return <aside>{p.children}</aside>; }', 'export function ConfirmDialog(p: any) { return <div />; }', 'export function Dialog(p: any) { return <div />; }', 'export function DangerConfirm(p: any) { return <div />; }', 'export function Sheet(p: any) { return <aside>{p.children}</aside>; }'].join('\n'),
  'kit/misc/Misc.tsx': ['export function SettingRow(p: any) { return <div>{p.help}{p.detail}</div>; }', 'export function FormFooter(p: any) { return <div />; }', 'export function SettingSwitch(p: any) { return <div>{p.help}{p.detail}</div>; }', 'export function Stack(p: any) { return <div>{p.children}</div>; }', 'export function Composer(p: any) { return <div>{p.below}</div>; }', 'export function SessionView(p: any) { return <div>{p.empty}</div>; }', 'export function CodeEditor(p: any) { return <div>{p.problems?.map((x: any) => x.message)}</div>; }', 'export function PathField(p: any) { return <div>{p.description}</div>; }', 'export function FilterChips(p: any) { return <div />; }', 'export function CardGrid(p: any) { return <div />; }', 'export function Ledger(p: any) { return <dl />; }', 'export function ConversationView(p: any) { return <div />; }', 'export function ChatNames(p: any) { return <>{p.text}</>; }', 'export function AddressField(p: any) { return <div />; }', 'export function SecretInput(p: any) { return <div />; }', 'export function CodeBlock(p: any) { return <pre />; }', 'export function RadioGroup(p: any) { return <div />; }', 'export function PickCard(p: any) { return <button />; }', 'export function Select(p: any) { return <div />; }', 'export function SectionMenuItem(p: any) { return <button>{p.children}</button>; }', 'function TrackRoot(p: any) { return <ol>{p.children}</ol>; }', 'export function TrackStep(p: any) { return <li>{p.why}{p.children}</li>; }', 'function VerdictRoot(p: any) { return <div>{p.children}{p.next}</div>; }', 'export { TrackRoot as Track, VerdictRoot as Verdict };'].join('\n'),
};

/** `n` characters of text (one word per 10, so normalization keeps the length) */
const chars = (n: number) => 'abcdefghi '.repeat(Math.ceil(n / 10)).slice(0, n - 1) + 'z';
const HEAD = "import { Section, Disclosure, ConfirmDialog, Dialog, DangerConfirm, Drawer, EmptyState, FirstUseState, Band, SettingRow, SettingSwitch, Button, FaqLink, Stack, SettingsPage, DetailPage, ListDetailPage, Sheet, Composer, SessionView, CodeEditor, PathField, FilterChips, CardGrid, Ledger, ConversationView, ChatNames, AddressField, CodeBlock, SecretInput, SectionMenuItem, Track, TrackStep, Verdict, RadioGroup, Select, PickCard, useStrings } from '@kit';\nimport strings from './strings.en.json';\n";

function scan(page: string, table: Record<string, string> = {}, extra: Record<string, string> = {}, disabled: string[] = []) {
  const files = { ...KIT, 'pages/x/strings.en.json': JSON.stringify(table), ...extra, 'pages/x/view.tsx': HEAD + page };
  return A.scan(files, { disabled }).hits.filter((h) => h.file.startsWith('pages/'));
}
const explain = (hits: Hit[]) => hits.filter((h) => h.rule === 'layout.explain');
const gaps = (hits: Hit[]) => hits.filter((h) => h.rule === 'layout.explainGap');
const keysOf = (hits: Hit[]) => [...new Set(hits.map((h) => `${h.rule}|${h.file}|${h.scope}`))].sort();
const T = 'const t = useStrings(strings);\n';

describe('explain: what a region scores (budget 150, step 75)', () => {
  it('a ConfirmDialog body of 300 characters is 2 hits in its overlay scope; switched off the hits are gone', () => {
    const page = `export function V() { ${T} return <ConfirmDialog overlayId="d" isOpen title="t" body={t('b')} />; }`;
    const hits = scan(page, { b: chars(300) });
    expect(keysOf(explain(hits))).toEqual(['layout.explain|pages/x/view.tsx|overlay:d']);
    expect(explain(hits)).toHaveLength(2);
    expect(scan(page, { b: chars(300) }, {}, ['layout.explain']).filter((h) => h.rule === 'layout.explain')).toEqual([]);
  });

  it('a ConfirmDialog or Dialog outcomeDetail and outcomeNote are text of the overlay (read like body: counted, never a gap)', () => {
    for (const el of ['ConfirmDialog', 'Dialog']) {
      const page = `export function V() { ${T} return <${el} overlayId="d" isOpen title="t" body={t('b')} outcomeDetail={<>{t('od')}</>} outcomeNote={t('on')} />; }`;
      const hits = scan(page, { b: chars(100), od: chars(100), on: chars(100) });
      expect(gaps(hits), el).toEqual([]);
      expect(keysOf(explain(hits)), el).toEqual(['layout.explain|pages/x/view.tsx|overlay:d']);
      expect(explain(hits), el).toHaveLength(2);
    }
  });

  it('a PickCard is a region of its own: its line, end words, note and disabled reason are its text (never a gap); meta is data', () => {
    const card = `<PickCard title="a" line={t('l')} end={t('e')} note={t('n')} disabledReason={t('r')} meta={t('m')} onPress={() => {}} />`;
    const page = `export function V() { ${T} return <Section title="s" description={t('d')}>${card}${card}</Section>; }`;
    const table = { d: chars(140), l: chars(60), e: chars(20), n: chars(40), r: chars(30), m: chars(300) };
    const hits = scan(page, table);
    expect(gaps(hits)).toEqual([]);
    expect(explain(hits)).toEqual([]);
    // 60 + 20 + 40 + 30 = 150 is a card's budget (the section's 140 is its own); a line of 136 makes 226: 2 hits per card
    const big = scan(page, { ...table, l: chars(136) });
    expect(explain(big)).toHaveLength(4);
    expect(new Set(explain(big).map((h) => h.line)).size).toBe(1);
  });

  it('a PickCard line or note read from a record is data; its end words and disabled reason are not', () => {
    const page = (attr: string) => `export function V({ p }: { p: { tagline: string; kind: string } }) { ${T} return <Section title="s"><PickCard title="a" ${attr} onPress={() => {}} /></Section>; }`;
    expect(gaps(scan(page("line={p.tagline} note={p.kind}")))).toEqual([]);
    expect(gaps(scan(page("line={p.kind ? p.tagline : t('none')}"), { none: chars(20) }))).toEqual([]);
    expect(gaps(scan(page('end={p.kind}'))).length).toBeGreaterThan(0);
  });

  it('step boundary: 225 characters over the budget of a region are 1 hit, 226 are 2 (a step is 75)', () => {
    const page = `export function V() { ${T} return <ConfirmDialog overlayId="d" isOpen title="t" body={t('b')} />; }`;
    expect(explain(scan(page, { b: chars(225) }))).toHaveLength(1);
    expect(explain(scan(page, { b: chars(226) }))).toHaveLength(2);
  });

  it('the same 300 characters split over three keys score the same (split and merge change nothing)', () => {
    const page = `export function V() { ${T} return <ConfirmDialog overlayId="d" isOpen title="t" body={<Stack><p>{t('a')}</p><p>{t('b')}</p><p>{t('c')}</p></Stack>} />; }`;
    expect(explain(scan(page, { a: chars(100), b: chars(100), c: chars(100) }))).toHaveLength(2);
  });

  it('three keys of 50 characters in one region (150) are clean; one more character is 1 hit', () => {
    const page = `export function V() { ${T} return <Section title="s" description={<>{t('a')}{t('b')}{t('c')}</>}><Button>go</Button></Section>; }`;
    expect(explain(scan(page, { a: chars(50), b: chars(50), c: chars(50) }))).toEqual([]);
    expect(explain(scan(page, { a: chars(50), b: chars(50), c: chars(51) }))).toHaveLength(1);
  });

  it('X-NE / C-NE: the 222-character eligibility body is 1 hit, its 43-character replacement is clean', () => {
    const page = `export function V() { ${T} return <FirstUseState title="t" body={t('b')} />; }`;
    expect(explain(scan(page, { b: chars(222) }))).toHaveLength(1);
    expect(explain(scan(page, { b: 'Join after your first paid server purchase.' }))).toEqual([]);
  });

  // Under a Track that shows one open body at a time, each step is a region of its own on
  // screen (a region named by its heading), and so is the Verdict plate: their text counts there, never in the panel. A flat
  // Track shows every body at once, so its steps count in the panel, as does a step with no Track the rule can see.
  describe('Track steps and the Verdict plate', () => {
    const ks2 = (track: string) =>
      [
        `export function V() { ${T} const flat = Math.random() > 0.5; return (`,
        '<Drawer title="t">',
        `<Verdict label="l" next={t('n')}>{t('v')}</Verdict>`,
        track,
        `<TrackStep id="a" state="done" name="A" why={t('w1')}><p>{t('b1')}</p></TrackStep>`,
        `<TrackStep id="b" state="now" name="B" why={t('w2')}><p>{t('b2')}</p></TrackStep>`,
        '</Track>',
        '</Drawer>',
        '); }',
      ].join('\n');
    const lineOf = (page: string, s: string) => (HEAD + page).split('\n').findIndex((l) => l.includes(s)) + 1;
    const table = { v: chars(100), n: chars(40), w1: chars(60), b1: chars(80), w2: chars(60), b2: chars(80) };

    it('each step (its why and body) and the Verdict (sentence and next line) are regions of their own', () => {
      const page = ks2('<Track label="k">');
      // 420 characters in all, at most 140 in any one region: clean, where the drawer holding them all would be 4 hits
      expect(explain(scan(page, table))).toEqual([]);
      expect(gaps(scan(page, table))).toEqual([]);
      // one step over its own budget: that step's hit, on that step
      const over = explain(scan(page, { ...table, b2: chars(100) }));
      expect(over.map((h) => h.line)).toEqual([lineOf(page, '<TrackStep id="b"')]);
      // the Verdict over its own: on the Verdict
      expect(explain(scan(page, { ...table, v: chars(130) })).map((h) => h.line)).toEqual([lineOf(page, '<Verdict')]);
      // flat={false} is the same Track
      expect(explain(scan(ks2('<Track label="k" flat={false}>'), table))).toEqual([]);
      // the Verdict's count line is read in the plate; its segments are the bar's data (no gap, no text)
      const plate = page.replace(`<Verdict label="l" next={t('n')}>`, `<Verdict label="l" next={t('n')} count={t('c')} segments={['done', 'now'] as const}>`);
      expect(gaps(scan(plate, { ...table, c: chars(10) }))).toEqual([]);
      expect(explain(scan(plate, { ...table, c: chars(10) }))).toEqual([]);
      expect(explain(scan(plate, { ...table, c: chars(30) })).map((h) => h.line)).toEqual([lineOf(plate, '<Verdict')]);
      // a step's foot sentence (foot.say) is read in that step; its buttons are actions
      const foot = page.replace(`why={t('w2')}>`, `why={t('w2')} foot={{ say: t('f'), primary: <Button>{t('go')}</Button> }}>`);
      expect(gaps(scan(foot, { ...table, f: chars(10), go: chars(70) }))).toEqual([]);
      expect(explain(scan(foot, { ...table, f: chars(10), go: chars(70) }))).toEqual([]);
      expect(explain(scan(foot, { ...table, f: chars(80) })).map((h) => h.line)).toEqual([lineOf(foot, '<TrackStep id="b"')]);
      // a foot the rule cannot read as a plain literal (a name, a call, a spread) is a gap, never a dropped sentence
      for (const [form, pre] of [
        ['foot={ft}', `const ft = { say: t('f') };`],
        ['foot={mk()}', `const mk = () => ({ say: t('f') });`],
        ['foot={{ ...ft }}', `const ft = { say: t('f') };`],
      ] as const) {
        const page2 = page.replace(`why={t('w2')}>`, `why={t('w2')} ${form}>`).replace('return (', `${pre} return (`);
        expect(gaps(scan(page2, { ...table, f: chars(80) })).length, form).toBeGreaterThan(0);
      }
    });

    it('a flat Track shows every body at once: its steps count in the panel holding it (280 characters: 2 hits, on the drawer)', () => {
      for (const track of ['<Track label="k" flat>', '<Track label="k" flat={true}>', '<Track label="k" flat={flat}>', "<Track label=\"k\" {...({ flat: true } as any)}>"]) {
        const page = ks2(track);
        const hits = scan(page, table);
        expect(explain(hits).map((h) => h.line), track).toEqual([lineOf(page, '<Drawer'), lineOf(page, '<Drawer')]);
        expect(gaps(hits).filter((h) => !/spread/.test(h.msg)), track).toEqual([]);
      }
    });

    it('steps handed to a local wrapper are read where the wrapper renders them: under its Track (paged or flat)', () => {
      const wrap = (flat: string) =>
        [
          `function Steps({ children }: { children: any }) { return <Track label="k"${flat}>{children}</Track>; }`,
          `export function V() { ${T} return (`,
          '<Drawer title="t">',
          '<Steps>',
          `<TrackStep id="a" state="done" name="A" why={t('w1')}><p>{t('b1')}</p></TrackStep>`,
          `<TrackStep id="b" state="now" name="B" why={t('w2')}><p>{t('b2')}</p></TrackStep>`,
          '</Steps>',
          '</Drawer>',
          '); }',
        ].join('\n');
      expect(explain(scan(wrap(''), table))).toEqual([]);
      expect(gaps(scan(wrap(''), table))).toEqual([]);
      expect(explain(scan(wrap(' flat'), table))).toHaveLength(2);
    });

    it('a step with no Track the rule can see counts in the panel too, its why read (not a gap)', () => {
      const page = ks2('<div>').replace('</Track>', '</div>');
      const hits = scan(page, table);
      expect(explain(hits).map((h) => h.line)).toEqual([lineOf(page, '<Drawer'), lineOf(page, '<Drawer')]);
      expect(gaps(hits)).toEqual([]);
    });
  });

  // A done step's result and a step's tags are shown text of the step, so they are read where the step counts (its own region under
  // a paged Track, the panel under a flat one): never a gap, never dropped.
  describe('Track step result and tags', () => {
    const page = (track: string, extra: string) =>
      [
        `export function V() { ${T} return (`,
        '<Drawer title="t">',
        track,
        `<TrackStep id="a" state="done" name="A" ${extra}><p>{t('b1')}</p></TrackStep>`,
        '</Track>',
        '</Drawer>',
        '); }',
      ].join('\n');
    const lineOf = (pg: string, s: string) => (HEAD + pg).split('\n').findIndex((l) => l.includes(s)) + 1;

    it('result is read in the step: no gap, and over the budget the hit is on the step', () => {
      const pg = page('<Track label="k">', `result={t('r')}`);
      expect(gaps(scan(pg, { r: chars(20), b1: chars(100) }))).toEqual([]);
      expect(explain(scan(pg, { r: chars(20), b1: chars(100) }))).toEqual([]);
      expect(explain(scan(pg, { r: chars(80), b1: chars(100) })).map((h) => h.line)).toEqual([lineOf(pg, '<TrackStep id="a"')]);
    });

    it('under a flat Track the result counts in the panel holding the Track', () => {
      const pg = page('<Track label="k" flat>', `result={t('r')}`);
      expect(gaps(scan(pg, { r: chars(80), b1: chars(100) }))).toEqual([]);
      expect(explain(scan(pg, { r: chars(80), b1: chars(100) })).map((h) => h.line)).toEqual([lineOf(pg, '<Drawer')]);
    });

    it('tags are read too: authored words in them count, a result the rule cannot read is still a gap', () => {
      const pg = page('<Track label="k">', `tags={<span>{t('g')}</span>}`);
      expect(gaps(scan(pg, { g: chars(20), b1: chars(100) }))).toEqual([]);
      expect(explain(scan(pg, { g: chars(80), b1: chars(100) })).map((h) => h.line)).toEqual([lineOf(pg, '<TrackStep id="a"')]);
      // a result that is a value the page read (a bare name, a member of one) is data: no gap; a call is not readable: a gap
      const data = page('<Track label="k">', 'result={<ChatNames text={SLOTS[kind]} />}').replace('export function V() {', 'export function V({ SLOTS, kind }: any) {');
      expect(gaps(scan(data, { b1: chars(100) }))).toEqual([]);
      const dyn = page('<Track label="k">', 'result={(window as any).mk()}');
      expect(gaps(scan(dyn, { r: chars(20), b1: chars(100) })).length).toBeGreaterThan(0);
    });
  });

  it('a ChatNames sentence is measured where it is shown, though ChatNames is a part text slots admit', () => {
    const page = `export function V() { ${T} return <ConfirmDialog overlayId="d" isOpen title="t" body={<ChatNames text={t('b')} />} />; }`;
    expect(explain(scan(page, { b: chars(100) }))).toEqual([]);
    expect(explain(scan(page, { b: chars(300) }))).toHaveLength(2);
    expect(gaps(scan(page, { b: chars(300) }))).toEqual([]);
  });

  it('kit props that are data, labels or the part\'s own text are read as such, never a gap', () => {
    const sec = (body: string) => `export function V({ url, rows }: any) { ${T} return <Section title="s">${body}</Section>; }`;
    // an address and a code block's captioned lines are data and labels
    expect(gaps(scan(sec(`<AddressField label="l" url={\`https://\${url}/x\`} /><CodeBlock label="l" lines={[{ caption: t('c'), code: 'ls' }]} />`), { c: chars(200) }))).toEqual([]);
    expect(explain(scan(sec(`<CodeBlock label="l" lines={[{ caption: t('c'), code: 'ls' }]} />`), { c: chars(400) }))).toEqual([]);
    // a menu item's words are a label, like a button's
    expect(gaps(scan(sec(`{rows.map((r: any) => <SectionMenuItem key={r.id}>{t('c')}</SectionMenuItem>)}`), { c: chars(20) }))).toEqual([]);
  });

  it('a secret field\'s promise lines and a drawer\'s reason line are measured text, never a gap', () => {
    const sec = (body: string) => `export function V() { ${T} return <Section title="s">${body}</Section>; }`;
    const field = sec(`<SecretInput label="l" promises={[t('p1'), t('p2')]} />`);
    expect(gaps(scan(field, { p1: chars(40), p2: chars(40) }))).toEqual([]);
    expect(explain(scan(field, { p1: chars(40), p2: chars(40) }))).toEqual([]);
    expect(explain(scan(field, { p1: chars(100), p2: chars(100) }))).toHaveLength(1);
    const drawer = `export function V() { ${T} return <Drawer title="t" overlayId="x-d" reason={t('r')}><Section title="s">{t('b')}</Section></Drawer>; }`;
    expect(gaps(scan(drawer, { r: chars(60), b: chars(60) }))).toEqual([]);
    expect(explain(scan(drawer, { r: chars(60), b: chars(60) }))).toEqual([]);
    expect(explain(scan(drawer, { r: chars(200), b: chars(60) }))).toHaveLength(1);
  });

  // A Ledger's total is a label and an amount (labels, data); its attached strip is one sentence (text, counted in the region that
  // holds the ledger) and one button. Both are read only as plain object literals: any other value stays a gap.
  describe('Ledger total and attach', () => {
    const page = (props: string, pre = '') => `export function V() { ${T} ${pre} return <Section title="s"><Ledger label="l" rows={[]} ${props} /></Section>; }`;

    it('a literal total is labels: no gap, no text', () => {
      const pg = page(`total={{ label: t('tl'), amount: t('ta') }}`);
      const hits = scan(pg, { tl: chars(200), ta: chars(200) });
      expect(gaps(hits)).toEqual([]);
      expect(explain(hits)).toEqual([]);
    });

    it('a literal attach: its text counts in the section, its action is an action', () => {
      const pg = page(`attach={{ text: t('at'), action: <Button>{t('go')}</Button> }}`);
      expect(gaps(scan(pg, { at: chars(100), go: chars(200) }))).toEqual([]);
      expect(explain(scan(pg, { at: chars(100), go: chars(200) }))).toEqual([]);
      expect(explain(scan(pg, { at: chars(225), go: chars(10) }))).toHaveLength(1);
    });

    it('a total or attach that is not a plain literal (a name, a call, a spread) stays a gap', () => {
      for (const [props, pre] of [
        ['attach={at}', `const at = { text: t('at') };`],
        ['attach={mk()}', `const mk = () => ({ text: t('at') });`],
        ['attach={{ ...at }}', `const at = { text: t('at') };`],
        ['total={mk()}', `const mk = () => ({ label: t('at'), amount: 1 });`],
      ] as const) {
        expect(gaps(scan(page(props, pre), { at: chars(100) })).length, props).toBeGreaterThan(0);
      }
    });
  });

  // A conversation's capability line ("Chat only" in the header): `tag` is a label, `text` one sentence of the header region. Read as a
  // plain literal, also behind a condition between the literal and nothing; any other value stays a gap.
  describe('ConversationView capability', () => {
    const page = (props: string, pre = '') => `export function V({ ok }: { ok: boolean }) { ${T} ${pre} return <Section title="s"><ConversationView ${props} /></Section>; }`;

    it('a literal or a condition with nothing: tag is a label, text counts', () => {
      for (const props of [`capability={{ tag: t('tg'), text: t('tx') }}`, `capability={ok ? { tag: t('tg'), text: t('tx') } : null}`, `capability={ok ? null : { tag: t('tg'), text: t('tx') }}`]) {
        expect(gaps(scan(page(props), { tg: chars(200), tx: chars(100) })), props).toEqual([]);
        expect(explain(scan(page(props), { tg: chars(200), tx: chars(100) })), props).toEqual([]);
        expect(explain(scan(page(props), { tg: chars(10), tx: chars(225) })), props).toHaveLength(1);
      }
    });

    it('a capability that is not a plain literal stays a gap', () => {
      expect(gaps(scan(page('capability={mk()}', `const mk = () => ({ tag: t('tg'), text: t('tx') });`), { tg: chars(10), tx: chars(10) })).length).toBeGreaterThan(0);
    });
  });

  // A setting row's reveal (a rare edit opened in place): its opener and Save words are labels, its handlers and flags data, and its
  // editor is a region of its own (it is drawn under the row only while open). Read as a plain object literal, also through a
  // never-reassigned const and a condition between the literal and nothing; anything else stays a gap.
  describe('SettingRow reveal', () => {
    const lit = `{ label: t('open'), saveLabel: t('save'), canSave: true, onSave: () => {}, editor: <Stack><p>{t('ed')}</p></Stack> }`;
    const page = (attr: string, pre = '') => `export function V({ ok }: { ok: boolean }) { ${T} ${pre} return <Section title="s" description={t('d')}><SettingRow label="l" ${attr} /></Section>; }`;
    const table = { open: chars(200), save: chars(200), ed: chars(140), d: chars(140) };

    it('labels are labels and the editor is its own region: no gap, and the section does not take the editor text', () => {
      for (const [attr, pre] of [
        [`reveal={${lit}}`, ''],
        ['reveal={rv}', `const rv = ${lit};`],
        ['reveal={rv}', `const rv = ok ? ${lit} : undefined;`],
        ['{...(rv ? { reveal: rv } : {})}', `const rv = ok ? ${lit} : undefined;`],
        [`reveal={{ label: t('open'), onSave: () => {}, editor: () => <p>{t('ed')}</p> }}`, ''],
      ] as const) {
        const hits = scan(page(attr, pre), table);
        expect(gaps(hits), attr + pre.slice(0, 20)).toEqual([]);
        expect(explain(hits), attr + pre.slice(0, 20)).toEqual([]);
      }
    });

    it('an editor over the budget is a hit of its own', () => {
      expect(explain(scan(page(`reveal={${lit}}`), { ...table, ed: chars(225) }))).toHaveLength(1);
    });

    it('a reveal the rule cannot read (a call, a spread inside, a reassigned variable) stays a gap', () => {
      for (const [attr, pre] of [
        ['reveal={mk()}', `const mk = () => (${lit});`],
        [`reveal={{ ...base, editor: <p>{t('ed')}</p> }}`, `const base = { label: t('open'), onSave: () => {} };`],
        ['reveal={rv}', `let rv = ${lit}; rv = ${lit};`],
      ] as const) {
        expect(gaps(scan(page(attr, pre), table)).length, attr).toBeGreaterThan(0);
      }
    });
  });

  // A radio option's reveal (kit/forms/more.tsx Option.reveal) is drawn under its radio while that option is picked, inside the
  // region that holds the group: its text counts there, as if its JSX sat in that region. Only one option is picked at a time, so
  // the reveals of one group are alternatives (the longest one shows), exactly as a condition between them written in the section.
  // Read through an inline array of object literals, a never-reassigned const, a conditional spread, and a `.map` callback that
  // returns object literals. The option's value, label, description and flags stay labels. Known gap (pinned below): an options
  // value that is none of those (a call, a prop) is read as today, a label, so a reveal inside it is not seen. Select and Combobox
  // ignore `reveal` (only RadioGroup draws it).
  describe('RadioGroup option reveal', () => {
    const sec = (opts: string, pre = '') => `export function V({ ok, list }: { ok: boolean; list: string[] }) { ${T} ${pre} return <Section title="s" description={t('d')}><RadioGroup label="l" value="a" onChange={() => {}} options={${opts}} /></Section>; }`;
    const opt = (v: string, rv: string) => `{ value: '${v}', label: t('lab'), description: t('desc'), reveal: ${rv} }`;
    const table = { d: chars(140), r: chars(140), q: chars(60), lab: chars(200), desc: chars(200) };

    it('reveal text counts in the region that holds the group (140 + 140 = 2 hits); labels and descriptions stay labels', () => {
      for (const [opts, pre] of [
        [`[${opt('a', "<p>{t('r')}</p>")}]`, ''],
        [`[${opt('a', 'rv')}]`, "const rv = <p>{t('r')}</p>;"],
        ['opts', `const opts = [${opt('a', "<p>{t('r')}</p>")}];`],
        ['[o1]', `const o1 = ${opt('a', "<p>{t('r')}</p>")};`],
        [`[${opt('a', "ok ? <p>{t('r')}</p> : null")}]`, ''],
        [`[{ value: 'x', label: 'x' }, ...(ok ? [${opt('a', "<p>{t('r')}</p>")}] : [])]`, ''],
        [`['a', 'b'].map((v) => (${opt('v', "<p>{t('r')}</p>")}))`, ''],
        [`list.map((v) => { return ${opt('v', "<p>{t('r')}</p>")}; })`, ''],
      ] as const) {
        const hits = scan(sec(opts, pre), table);
        expect(gaps(hits), opts + pre).toEqual([]);
        expect(explain(hits), opts + pre).toHaveLength(2);
        expect(keysOf(explain(hits)), opts + pre).toEqual(['layout.explain|pages/x/view.tsx|main']);
      }
    });

    it('the reveals of one group are alternatives: the longest one counts, never the sum', () => {
      const hits = scan(sec(`[${opt('a', "<p>{t('q')}</p>")}, ${opt('b', "<p>{t('r')}</p>")}, ${opt('c', "<p>{t('q')}</p>")}]`), table);
      expect(explain(hits)).toHaveLength(2);
    });

    it('an option without a reveal adds nothing, and a reveal under the budget alone is clean', () => {
      expect(explain(scan(sec(`[{ value: 'a', label: t('lab') }, ${opt('b', "<p>{t('q')}</p>")}]`), table))).toHaveLength(1);
      expect(explain(scan(`export function V() { ${T} return <Section title="s"><RadioGroup label="l" options={[${opt('a', "<p>{t('r')}</p>")}]} /></Section>; }`, table))).toEqual([]);
    });

    it('a reveal in an overlay counts in that overlay', () => {
      const page = `export function V() { ${T} return <Drawer overlayId="x-d" isOpen title="t"><p>{t('d')}</p><RadioGroup label="l" options={[${opt('a', "<p>{t('r')}</p>")}]} /></Drawer>; }`;
      const hits = explain(scan(page, table));
      expect(keysOf(hits)).toEqual(['layout.explain|pages/x/view.tsx|overlay:x-d']);
      expect(hits).toHaveLength(2);
    });

    it('what a reveal holds that the rule cannot read is a gap (it was invisible before)', () => {
      const page = `export function V({ note }: { note: string }) { ${T} return <Section title="s"><RadioGroup label="l" options={[${opt('a', '<p>{note}</p>')}]} /></Section>; }`;
      expect(gaps(scan(page, table)).length).toBeGreaterThan(0);
    });

    it('a region inside a reveal is a region of its own, counted once', () => {
      const page = `export function V() { ${T} return <Section title="s"><RadioGroup label="l" options={[${opt('a', "<Disclosure title=\"h\"><p>{t('big')}</p></Disclosure>")}]} /></Section>; }`;
      expect(explain(scan(page, { ...table, big: chars(225) }))).toHaveLength(1);
    });

    it('known gap: options the rule cannot read (a call) stay labels, so their reveal is not counted; Select ignores reveal', () => {
      const mk = `const mk = () => [${opt('a', "<p>{t('r')}</p>")}];`;
      expect(explain(scan(sec('mk()', mk), table))).toHaveLength(0);
      const sel = `export function V() { ${T} return <Section title="s" description={t('d')}><Select label="l" options={[${opt('a', "<p>{t('r')}</p>")}]} /></Section>; }`;
      expect(explain(scan(sel, table))).toEqual([]);
    });
  });

  // ExamplePicker and SystemSteps (kit/data/Steps.tsx) show one example or system at a time, read like radio reveals: an example's
  // note and footer, a system's step, need, more and code footer count in the region holding the picker (summed within the one shown,
  // the longest one across them); names, labels, ids and the code itself are labels and data, never a gap.
  describe('ExamplePicker and SystemSteps', () => {
    const table = { d: chars(140), r: chars(140), q: chars(60), lab: chars(200) };
    const IMP = "import { ExamplePicker, SystemSteps } from '@kit';\n";
    const sec = (el: string) => `${IMP}export function V() { ${T} return <Section title="s" description={t('d')}>${el}</Section>; }`;
    const sys = (id: string, more: string) => `{ id: '${id}', label: t('lab')${more} }`;
    const ex = (id: string, more: string) => `{ id: '${id}', name: t('lab'), label: t('lab'), lang: 'python', code: 'print(1)'${more} }`;

    it('an example note or footer counts in the section (140 + 140 = 2 hits); names, labels and code are no gap', () => {
      for (const more of [", note: t('r')", ", footer: <p>{t('r')}</p>"]) {
        const hits = scan(sec(`<ExamplePicker label="Language" examples={[${ex('a', more)}]} />`), table);
        expect(gaps(hits), more).toEqual([]);
        expect(explain(hits), more).toHaveLength(2);
      }
    });

    it('examples are alternatives: the longest note counts, never the sum', () => {
      const hits = scan(sec(`<ExamplePicker label="Language" examples={[${ex('a', ", note: t('q')")}, ${ex('b', ", note: t('r')")}, ${ex('c', ", note: t('q')")}]} />`), table);
      expect(explain(hits)).toHaveLength(2);
    });

    it("a system's step and need add up; its code block's footer counts; systems are alternatives", () => {
      const both = scan(sec(`<SystemSteps label="Device" systems={[${sys('mac', ", step: t('q'), need: t('q')")}]} />`), table);
      expect(gaps(both)).toEqual([]);
      expect(explain(both)).toHaveLength(2); // 140 + 60 + 60 = 260
      const foot = scan(sec(`<SystemSteps label="Device" systems={[${sys('mac', ", step: t('q'), code: { label: t('lab'), lang: 'shell', code: 'ls', footer: <p>{t('q')}</p> }")}]} />`), table);
      expect(gaps(foot)).toEqual([]);
      expect(explain(foot)).toHaveLength(2);
      const alts = scan(sec(`<SystemSteps label="Device" systems={[${sys('mac', ", step: t('q')")}, ${sys('linux', ", step: t('q'), more: <p>{t('q')}</p>")}]} />`), table);
      expect(explain(alts)).toHaveLength(2); // the longer system: 140 + 120
    });

    it('a list read through a never-reassigned const counts the same', () => {
      const page = `${IMP}export function V() { ${T} const list = [${sys('mac', ", step: t('r')")}]; return <Section title="s" description={t('d')}><SystemSteps label="Device" systems={list} /></Section>; }`;
      expect(explain(scan(page, table))).toHaveLength(2);
    });

    it('examples the rule cannot follow stay a gap, as before it read them: a helper call, a spread in an example', () => {
      const helper = `${IMP}const build = (t: (k: string) => string) => [${ex('a', ", note: t('r')")}];\nexport function V() { ${T} return <Section title="s" description={t('d')}><ExamplePicker label="Language" examples={build(t)} /></Section>; }`;
      expect(gaps(scan(helper, table))).toHaveLength(1);
      const spread = scan(sec(`<ExamplePicker label="Language" examples={[{ ...{ note: t('r') }, id: 'a', name: t('lab'), label: t('lab'), lang: 'python', code: 'x' }]} />`), table);
      expect(gaps(spread)).toHaveLength(1);
      // a direct long note still counts as text, not a gap
      expect(gaps(scan(sec(`<ExamplePicker label="Language" examples={[${ex('a', ", note: t('r')")}]} />`), table))).toEqual([]);
    });
  });

  it('a Disclosure holding six list items of 1,600 characters is a region of its own', () => {
    const li = [0, 1, 2, 3, 4, 5].map((i) => `<li>{t('k${i}')}</li>`).join('');
    const page = `export function V() { ${T} return <Disclosure title="h"><ul>${li}</ul></Disclosure>; }`;
    const table = Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`k${i}`, chars(i < 4 ? 270 : 260)]));
    const hits = explain(scan(page, table));
    expect(hits).toHaveLength(Math.ceil((1600 - 150) / 75));
    expect(keysOf(hits)).toEqual(['layout.explain|pages/x/view.tsx|main']);
  });

  it('ternary branches take their max, never their sum', () => {
    const page = `export function V({ c }: { c: boolean }) { ${T} return <Section title="s" description={c ? t('long') : t('short')}><Button>go</Button></Section>; }`;
    expect(explain(scan(page, { long: chars(140), short: chars(100) }))).toEqual([]);
    expect(explain(scan(page, { long: chars(226), short: chars(100) }))).toHaveLength(2);
  });

  it('`a || b` and `a ?? b` alternatives take their max, never their sum', () => {
    for (const op of ['||', '??']) {
      const page = `export function V({ c }: { c?: string }) { ${T} return <Section title="s" description={c ${op} t('long')}><Button>go</Button></Section>; }`;
      expect(explain(scan(page, { long: chars(100) })), op).toEqual([]);
    }
    const page = `export function V({ c }: { c?: string }) { ${T} return <Section title="s" description={t('a') || t('b')}><Button>go</Button></Section>; }`;
    expect(explain(scan(page, { a: chars(100), b: chars(100) }))).toEqual([]); // 100, not 200
  });

  it('plural forms of one key score by the longest', () => {
    const page = `export function V() { ${T} return <FirstUseState title="t" body={t('n', { count: 2 })} />; }`;
    expect(explain(scan(page, { n_one: chars(100), n_other: chars(300) }))).toHaveLength(2);
  });

  it('{{param}} counts 6 characters', () => {
    const page = `export function V() { ${T} return <FirstUseState title="t" body={t('b', { rate: '5' })} />; }`;
    expect(explain(scan(page, { b: `${chars(138)} {{rate}}` }))).toEqual([]); // 138 + 1 + 6 = 145
    expect(explain(scan(page, { b: `${chars(144)} {{rate}}` }))).toHaveLength(1); // 144 + 1 + 6 = 151
  });
});

describe('explain: exempt by kind, never by length', () => {
  const body = (inner: string) => `export function V() { ${T} return ${inner}; }`;
  it('consequences of a ConfirmDialog are exempt', () => {
    const page = body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} consequences={[t('long')]} />`);
    expect(explain(scan(page, { short: chars(40), long: chars(400) }))).toEqual([]);
  });
  it('long text in a Band is exempt (notice length is a later rule)', () => {
    expect(explain(scan(body(`<Section title="s"><Band>{t('long')}</Band></Section>`), { long: chars(400) }))).toEqual([]);
  });
  it('a long aria-label, title and button text are labels, not explanation', () => {
    const page = body(`<Section title={t('long')}><Button aria-label={t('long')}>{t('long')}</Button><button title={t('long')}>{t('long')}</button></Section>`);
    expect(explain(scan(page, { long: chars(400) }))).toEqual([]);
  });
  it('prose under pages/guide is not measured', () => {
    const files = { ...KIT, 'pages/guide/strings.en.json': JSON.stringify({ long: chars(900) }), 'pages/guide/view.tsx': `${HEAD}export function G() { ${T} return <Section title="s"><p>{t('long')}</p></Section>; }` };
    expect(A.scan(files).hits.filter((h) => h.rule.startsWith('layout.explain'))).toEqual([]);
  });
  it('a dialog with one short line and a FaqLink is clean', () => {
    const page = body(`<ConfirmDialog overlayId="d" isOpen title="t" body={<Stack><p>{t('line')}</p><FaqLink item={x}>{t('more')}</FaqLink></Stack>} />`);
    expect(explain(scan(page, { line: chars(120), more: chars(300) }))).toEqual([]);
  });
});

describe('explain: one aggregation rule', () => {
  it('six literal keys, a literal-array map over the same keys and a helper component score the same', () => {
    const table = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => [`h.${k}`, chars(200)]));
    const six = `export function V() { ${T} return <Disclosure title="h">${['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `<p>{t('h.${k}')}</p>`).join('')}</Disclosure>; }`;
    const map = `const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;\nexport function V() { ${T} return <Disclosure title="h">{KEYS.map((k) => <p key={k}>{t(\`h.\${k}\`)}</p>)}</Disclosure>; }`;
    const helper = `function List({ t }: { t: any }) { return <>${['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `<p>{t('h.${k}')}</p>`).join('')}</>; }\nexport function V() { ${T} return <Disclosure title="h"><List t={t} /></Disclosure>; }`;
    const want = Math.ceil((1200 - 150) / 75);
    for (const page of [six, map, helper]) expect(explain(scan(page, table)), page.slice(0, 40)).toHaveLength(want);
  });

  it('the same four keys as a literal array sum; supplied by runtime data they are a gap, never a lower score', () => {
    const table = Object.fromEntries(['a', 'b', 'c', 'd'].map((k) => [`w.${k}`, chars(200)]));
    const literal = `const WAYS = ['a', 'b', 'c', 'd'] as const;\nexport function V() { ${T} return <Disclosure title="h">{WAYS.map((w) => <p key={w}>{t(\`w.\${w}\`)}</p>)}</Disclosure>; }`;
    const runtime = `export function V({ ways }: { ways: string[] }) { ${T} return <Disclosure title="h">{ways.map((w) => <p key={w}>{t(\`w.\${w}\`)}</p>)}</Disclosure>; }`;
    expect(explain(scan(literal, table))).toHaveLength(Math.ceil((800 - 150) / 75));
    const r = scan(runtime, table);
    expect(gaps(r)).toHaveLength(1);
    expect(explain(r)).toEqual([]);
  });

  it('a template over a literal-array element resolves each element', () => {
    const page = `const OS = ['ios', 'android'] as const;\nexport function V() { ${T} return <Section title="s">{OS.map((k) => <p key={k}>{t(\`h.phone.\${k}\`)}</p>)}</Section>; }`;
    expect(explain(scan(page, { 'h.phone.ios': chars(400), 'h.phone.android': chars(50) }))).toHaveLength(Math.ceil((450 - 150) / 75));
  });

  it('a template over a variable that is no literal array takes the longest matching key', () => {
    const page = `export function V({ os }: { os: string }) { ${T} return <Section title="s"><p>{t(\`h.phone.\${os}\`)}</p></Section>; }`;
    expect(explain(scan(page, { 'h.phone.ios': chars(400), 'h.phone.android': chars(50) }))).toHaveLength(Math.ceil((400 - 150) / 75));
  });

  it('a helper chain of depth 4 is measured, depth 5 is a gap', () => {
    const chain = (n: number) =>
      Array.from({ length: n }, (_, i) => `function H${i}({ t }: { t: any }) { return ${i === n - 1 ? "<p>{t('long')}</p>" : `<H${i + 1} t={t} />`}; }`).join('\n') + `\nexport function V() { ${T} return <Disclosure title="h"><H0 t={t} /></Disclosure>; }`;
    const four = scan(chain(4), { long: chars(400) });
    expect(explain(four)).toHaveLength(Math.ceil((400 - 150) / 75));
    expect(gaps(four)).toEqual([]);
    const five = scan(chain(5), { long: chars(400) });
    expect(gaps(five).length).toBeGreaterThan(0);
  });

  it('one helper rendered in a main-scope Disclosure and inside a ConfirmDialog scores in both keys', () => {
    const page =
      `function List({ t }: { t: any }) { return <ul><li>{t('a')}</li><li>{t('b')}</li></ul>; }\n` +
      `export function V() { ${T} return <><Disclosure title="h"><List t={t} /></Disclosure><ConfirmDialog overlayId="join" isOpen title="t" body={<List t={t} />} /></>; }`;
    const hits = explain(scan(page, { a: chars(200), b: chars(200) }));
    expect(keysOf(hits)).toEqual(['layout.explain|pages/x/view.tsx|main', 'layout.explain|pages/x/view.tsx|overlay:join']);
  });

  it('one component given two different tables by two callers is two occurrences', () => {
    const page =
      `function Body({ t }: { t: any }) { return <p>{t('x')}</p>; }\n` +
      `export function V() { ${T} const u = useStrings(other);\n return <><Section title="a"><Body t={t} /></Section><Section title="b"><Body t={u} /></Section></>; }`;
    const files = { 'pages/x/other.strings.en.json': JSON.stringify({ x: chars(400) }) };
    const src = page.replace("const u = useStrings(other);", 'const u = useStrings(other);');
    const hits = scan(`import other from './other.strings.en.json';\n${src}`, { x: chars(40) }, files);
    expect(explain(hits)).toHaveLength(Math.ceil((400 - 150) / 75)); // only the second Section's table is long
  });

  it('a shared Drawer wrapper given another body by each caller sums under the wrapper; the same helper rendered twice is two occurrences', () => {
    const wrap = `function Wrap({ children }: { children: any }) { return <Drawer overlayId="w">{children}</Drawer>; }`;
    const two = `${wrap}\nexport function V() { ${T} return <><Wrap><p>{t('a')}</p></Wrap><Wrap><p>{t('b')}</p></Wrap></>; }`;
    expect(explain(scan(two, { a: chars(300), b: chars(300) }))).toHaveLength(4);
    const once = `function Panel({ t }: { t: any }) { return <Section title="s"><p>{t('a')}</p></Section>; }\nexport function V() { ${T} return <><Panel t={t} /><Panel t={t} /></>; }`;
    expect(explain(scan(once, { a: chars(300) }))).toHaveLength(4); // two rendered occurrences, two hits each
  });

  it('regions inside a prop that is not text (an action) are still found', () => {
    const page = `function Join({ t }: { t: any }) { return <ConfirmDialog overlayId="join" isOpen title="t" body={t('b')} />; }\nexport function V() { ${T} return <FirstUseState title="t" body={t('s')} action={<Join t={t} />} />; }`;
    const hits = explain(scan(page, { b: chars(400), s: chars(40) }));
    expect(keysOf(hits)).toEqual(['layout.explain|pages/x/view.tsx|overlay:join']);
  });

  it('SettingsPage sections are Sections: their description and content are measured per entry', () => {
    const page = `export function V() { ${T} const sections = [{ id: 'a', title: 'A', description: t('d'), content: <p>{t('c')}</p> }]; return <SettingsPage sections={sections} />; }`;
    expect(explain(scan(page, { d: chars(100), c: chars(100) }))).toHaveLength(1); // 200 characters in the entry's Section
    expect(explain(scan(page, { d: chars(60), c: chars(90) }))).toEqual([]);
  });

  it('two ternaries driven by one condition score their independent maxima (documented, conservative); one outer conditional is the canonical form', () => {
    const table = { a1: chars(120), a2: chars(20), b1: chars(20), b2: chars(120) };
    const split = `export function V({ c }: { c: boolean }) { ${T} return <Section title="s" description={<>{c ? t('a1') : t('a2')}{c ? t('b1') : t('b2')}</>}><Button>go</Button></Section>; }`;
    const canonical = `export function V({ c }: { c: boolean }) { ${T} return <Section title="s" description={c ? <>{t('a1')}{t('b1')}</> : <>{t('a2')}{t('b2')}</>}><Button>go</Button></Section>; }`;
    expect(explain(scan(split, table)).length).toBe(2); // 240 chars: the independent maxima
    expect(explain(scan(canonical, table))).toEqual([]); // 140
  });
});

describe('explain: what cannot be read is a gap, and a gap never lowers the score', () => {
  const sec = (inner: string) => `export function V({ k }: { k: string }) { ${T} return <Section title="s">${inner}</Section>; }`;
  it('a computed key is 1 gap', () => {
    const r = scan(sec('<p>{t(k)}</p>'), { a: chars(400) });
    expect(gaps(r)).toHaveLength(1);
    expect(explain(r)).toEqual([]);
  });
  it('a literal key missing from its table is 1 gap', () => {
    expect(gaps(scan(sec("<p>{t('nope')}</p>"), { a: 'x' }))).toHaveLength(1);
  });
  it('a template that matches no key is 1 gap', () => {
    expect(gaps(scan(sec('<p>{t(`z.${k}`)}</p>'), { a: 'x' }))).toHaveLength(1);
  });
  it('a map over data of unknown size that renders authored text is 1 gap; one that renders data is none', () => {
    expect(gaps(scan(sec("{rows.map((r) => <p key={r}>{t('a')}</p>)}"), { a: 'x' }))).toHaveLength(1);
    expect(gaps(scan(sec('{rows.map((r) => <p key={r}>{r.name}</p>)}'), { a: 'x' }))).toHaveLength(1); // a member read of a name the rule cannot trace is a gap, in a map too
    expect(gaps(scan(sec('{rows.map((r) => <p key={r}>{1 + 2}</p>)}'), { a: 'x' }))).toEqual([]);
  });
  it('a component that renders itself is a gap', () => {
    const page = `function R({ t }: { t: any }) { return <p>{t('a')}<R t={t} /></p>; }\nexport function V() { ${T} return <Section title="s"><R t={t} /></Section>; }`;
    expect(gaps(scan(page, { a: 'x' })).length).toBeGreaterThan(0);
  });
  it('a gap and its region are keyed alike (file, scope of the region element)', () => {
    const page = `export function V({ k }: { k: string }) { ${T} return <ConfirmDialog overlayId="d" isOpen title="t" body={t(k)} />; }`;
    expect(keysOf(gaps(scan(page, { a: 'x' })))).toEqual(['layout.explainGap|pages/x/view.tsx|overlay:d']);
  });
  it('turning measured text into an unresolved lookup lowers layout.explain and raises layout.explainGap (the gate refuses that pair)', () => {
    const before = scan(sec("<p>{t('a')}</p>"), { a: chars(400) });
    const after = scan(sec('<p>{t(k)}</p>'), { a: chars(400) });
    expect(explain(before).length).toBeGreaterThan(0);
    expect(explain(after)).toEqual([]);
    expect(gaps(before)).toEqual([]);
    expect(gaps(after)).toHaveLength(1);
  });
});

describe('explain: tables', () => {
  it('a merged table (spreads of imported tables) resolves its keys, later spreads winning', () => {
    const page = `import more from './more.strings.en.json';\nconst merged = { ...strings, ...more };\nexport function V() { const t = useStrings(merged); return <FirstUseState title="t" body={t('b')} />; }`;
    const files = { 'pages/x/more.strings.en.json': JSON.stringify({ b: chars(300) }) };
    expect(explain(scan(page, { b: 'short' }, files))).toHaveLength(2);
  });
  it('an unreadable table throws; readSrc supplies it', () => {
    const files = { ...KIT, 'pages/x/view.tsx': `${HEAD}export function V() { ${T} return <FirstUseState title="t" body={t('b')} />; }` };
    expect(() => A.scan(files)).toThrow(/cannot read table pages\/x\/strings\.en\.json/);
    const r = A.scan(files, { readSrc: (rel) => (rel === 'pages/x/strings.en.json' ? JSON.stringify({ b: chars(300) }) : null) });
    expect(r.hits.filter((h) => h.rule === 'layout.explain')).toHaveLength(2);
  });
  it('a strings-only edit (the TSX untouched) changes the lint count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-lint-'));
    try {
      const put = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      };
      for (const [rel, text] of Object.entries(KIT)) put(rel, text);
      put('pages/x/view.tsx', `${HEAD}export function V() { ${T} return <FirstUseState title="t" body={t('b')} />; }`);
      put('pages/x/strings.en.json', JSON.stringify({ b: chars(40) }));
      expect(A.lintHits(dir, 'pages/x/view.tsx').filter((h) => h.rule === 'layout.explain')).toEqual([]);
      put('pages/x/strings.en.json', JSON.stringify({ b: chars(400) }));
      expect(A.lintHits(dir, 'pages/x/view.tsx').filter((h) => h.rule === 'layout.explain').length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('explain: FAQ answers (the placement rule and the answer budget 600)', () => {
  it('a faq.* key read in a region outside faq.ts is 1 hit per site', () => {
    const page = `export function V() { ${T} return <Section title="s"><p>{t('faq.rate.a')}</p></Section>; }`;
    expect(explain(scan(page, { 'faq.rate.a': 'short' }))).toHaveLength(1);
  });
  it('in faq.ts a 700-character answer is 2 hits, a 590-character answer is clean', () => {
    const faq = `export function pageFaq(t: (k: string) => string) { return [{ id: 'x', q: t('faq.x.q'), a: t('faq.x.a') }]; }`;
    const run = (n: number) => explain(scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(n) }, { 'pages/x/faq.ts': faq }));
    expect(run(700)).toHaveLength(2);
    expect(run(590)).toEqual([]);
    expect(run(700).every((h) => h.file === 'pages/x/faq.ts')).toBe(true);
  });
});

describe('explain: the rule list', () => {
  it('the detector enumerates both rules', () => {
    const rules = (createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as { RULES: string[] }).RULES;
    expect(rules).toContain('layout.explain');
    expect(rules).toContain('layout.explainGap');
  });
});

// The walk fails closed. Each fixture is an input that once failed: it scored 0 hits and
// 0 gaps before. A control beside it shows the readable form scoring as it should.
describe('nothing authored is a silent zero', () => {
  const L: Record<string, string> = { long: chars(300), short: chars(100) };
  const view = (body: string, pre = '') => `${pre}export function V({ props, rows, c, k }: any) { ${T} ${body} }`;
  const two = (page: string, table = L, extra: Record<string, string> = {}) => explain(scan(page, table, extra)).length;
  const gapsOf = (page: string, table = L, extra: Record<string, string> = {}) => gaps(scan(page, table, extra));

  it('spreads: an object spread into a region reads like the attribute; a conditional spread over-approximates; an unknown spread is a gap', () => {
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" {...{ body: t('long') }} />;`))).toBe(2);
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" {...(c ? { body: t('long') } : {})} />;`))).toBe(2);
    expect(two(view(`const more = { body: t('long') }; return <ConfirmDialog overlayId="d" isOpen title="D" {...more} />;`))).toBe(2);
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('short')} {...{ body: t('long') }} />;`))).toBe(2); // the later one wins
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('long')} {...{ body: t('short') }} />;`))).toBe(0);
    const unknown = scan(view(`return <ConfirmDialog overlayId="d" isOpen title="D" {...props} />;`));
    expect(gaps(unknown)).toHaveLength(1);
    expect(explain(unknown)).toEqual([]);
  });
  it('spreads through a helper: props forwarded by a rest spread are read in the caller; an unknown spread into a helper is a gap', () => {
    const wrap = `function Wrap({ title, ...rest }: any) { return <ConfirmDialog overlayId="w" isOpen title={title} {...rest} />; }\n`;
    expect(two(view(`return <Wrap title="x" body={t('long')} />;`, wrap))).toBe(2);
    expect(gapsOf(view(`return <Wrap title="x" {...props} />;`, wrap))).toHaveLength(1);
  });
  it('rendered props outside the old whitelist: Drawer subtitle, SettingsPage summary, DetailPage aside; an unknown prop carrying authored text is a gap', () => {
    expect(two(view(`return <Drawer overlayId="d" isOpen title="D" subtitle={t('long')} />;`))).toBe(2);
    expect(two(view(`return <SettingsPage sections={[]} summary={<p>{t('long')}</p>} />;`))).toBe(2);
    expect(two(view(`return <DetailPage header={{ title: 'D' }} aside={t('long')} />;`))).toBe(2);
    const unknown = scan(view(`return <DetailPage header={{ title: 'D' }} mystery={t('long')} />;`));
    expect(gaps(unknown)).toHaveLength(1);
    expect(explain(unknown)).toEqual([]);
    // labels and handlers stay exempt by kind
    expect(gaps(scan(view(`return <ConfirmDialog overlayId="d" isOpen title={t('long')} confirmLabel={t('long')} onConfirm={() => t('long')} />;`)))).toEqual([]);
  });
  for (const page of ['DetailPage', 'ListDetailPage']) {
    it(`a ${page} banner is read like children (measured; a Band in it is exempt); an unknown prop is still a gap`, () => {
      const banner = scan(view(`return <${page} header={{ title: 'D' }} banner={<p>{t('long')}</p>} />;`), L);
      expect(gaps(banner)).toEqual([]);
      expect(explain(banner)).toHaveLength(2);
      const band = scan(view(`return <${page} header={{ title: 'D' }} banner={<Band>{t('long')}</Band>} />;`), L);
      expect([...explain(band), ...gaps(band)]).toEqual([]);
      expect(gaps(scan(view(`return <${page} header={{ title: 'D' }} vista={t('long')} />;`), L))).toHaveLength(1);
    });

    it(`a ${page} views prop (the bar label and view labels) is labels, never a gap or a hit`, () => {
      const views = `views={{ label: t('long'), value: 'a', onChange: () => undefined, items: [{ id: 'a', label: t('long') }, { id: 'b', label: t('short') }] }}`;
      const hits = scan(view(`return <${page} header={{ title: 'D' }} ${views} />;`), L);
      expect([...explain(hits), ...gaps(hits)]).toEqual([]);
    });
  }

  it('kit-table-views: a TablePage views prop is labels too, never a gap or a hit; an unknown prop is still a gap', () => {
    const views = `views={{ label: t('long'), value: 'a', onChange: () => undefined, items: [{ id: 'a', label: t('long') }, { id: 'b', label: t('short') }] }}`;
    const pre = "import { TablePage } from '@kit';\n";
    const hits = scan(view(`return <TablePage header={{ title: 'D' }} ${views} />;`, pre), L);
    expect([...explain(hits), ...gaps(hits)]).toEqual([]);
    expect(gaps(scan(view(`return <TablePage header={{ title: 'D' }} vista={t('long')} />;`, pre), L))).toHaveLength(1);
  });

  it('scripts-pane-parts: a DetailPage menu is read entry by entry: labels, separators and conditional spreads are nothing, description, disabledReason and a group note count (conditional branches as alternatives), an unreadable or changed-in-place list or entry is a gap', () => {
    const page = (menu: string) => scan(view(`return <DetailPage header={{ title: 'D' }} menu={${menu}} />;`), L);
    const labels = page(`[{ id: 'a', label: t('long'), icon: 'x', onAction: () => undefined }, '-', ...(ok ? [{ id: 'b', label: t('long'), copy: 'c', onAction: () => undefined }] : [])]`);
    expect([...explain(labels), ...gaps(labels)]).toEqual([]);
    for (const field of ['description', 'disabledReason']) {
      const text = page(`[{ id: 'a', label: 'A', ${field}: t('long'), onAction: () => undefined }]`);
      expect(gaps(text), field).toEqual([]);
      expect(explain(text), field).toHaveLength(2); // 300 characters: two steps past the budget
      // inside a conditional spread and inside a group's items alike
      expect(explain(page(`[...(ok ? [{ id: 'a', label: 'A', ${field}: t('long'), onAction: () => undefined }] : [])]`)), field).toHaveLength(2);
      expect(explain(page(`[{ label: 'G', items: [{ id: 'a', label: 'A', ${field}: t('long'), onAction: () => undefined }] }]`)), field).toHaveLength(2);
    }
    // a group's note is explanation too; an unreadable one is a gap
    const note = page(`[{ label: 'G', note: t('long'), items: [{ id: 'a', label: 'A', onAction: () => undefined }] }]`);
    expect(gaps(note)).toEqual([]);
    expect(explain(note)).toHaveLength(2);
    expect(gaps(page(`[{ label: 'G', note: noteOf(), items: [{ id: 'a', label: 'A', onAction: () => undefined }] }]`))).toHaveLength(1);
    // the branches of a conditional spread are alternatives: the longer one shows, never both together (300, not 600)
    expect(explain(page(`[...(ok ? [{ id: 'a', label: 'A', description: t('long'), onAction: () => undefined }] : [{ id: 'b', label: 'B', description: t('long'), onAction: () => undefined }])]`))).toHaveLength(2);
    // a handler written as a method is an action, never a gap
    const method = page(`[{ id: 'a', label: 'A', onAction() { go(); } }]`);
    expect([...explain(method), ...gaps(method)]).toEqual([]);
    // a menu array or entry changed in place cannot be read from its initializer: a gap, never an empty menu
    const pushed = scan(view(`const entries: any[] = []; entries.push({ id: 'a', label: 'A', description: t('long'), onAction: () => undefined }); return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(pushed)).toHaveLength(1);
    const written = scan(view(`const e = { id: 'a', label: 'A', onAction: () => undefined }; e.description = t('long'); return <DetailPage header={{ title: 'D' }} menu={[e]} />;`), L);
    expect(gaps(written)).toHaveLength(1);
    // through a member chain of the list, through an alias, or passed to a call: still changed in place, still a gap
    const viaEntry = scan(view(`const entries = [{ id: 'a', label: 'A', onAction: () => undefined }]; entries[0].description = t('long'); return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(viaEntry)).toHaveLength(1);
    const viaAlias = scan(view(`const entries: any[] = []; const alias = entries; alias.push({ id: 'a', label: 'A', description: t('long'), onAction: () => undefined }); return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(viaAlias)).toHaveLength(1);
    const viaCall = scan(view(`const entries: any[] = []; fill(entries); return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(viaCall)).toHaveLength(1);
    // a write to another variable of the same name (a nested function's own parameter) is not this list's: no false gap
    const shadowed = scan(view(`const entries = [{ id: 'a', label: 'A', description: t('long'), onAction: () => undefined }]; function more(entries: any[]) { entries.push(1); } return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(shadowed)).toEqual([]);
    expect(explain(shadowed)).toHaveLength(2);
    const stable = scan(view(`const entries = [{ id: 'a', label: 'A', description: t('long'), onAction: () => undefined }]; return <DetailPage header={{ title: 'D' }} menu={entries} />;`), L);
    expect(gaps(stable)).toEqual([]);
    expect(explain(stable)).toHaveLength(2);
    expect(gaps(page('entries()'))).toHaveLength(1);
    expect(gaps(page(`[{ id: 'a', label: 'A', onAction: () => undefined }, more()]`))).toHaveLength(1);
    expect(gaps(page(`[...more()]`))).toHaveLength(1);
  });

  it('FilterChips filters are labels and data (chip and option labels, counts, callbacks), an option description is text; CardGrid keyOf, textOf and renderCard are data', () => {
    const chips = (opt: string) => `return <FilterChips onClearAll={() => undefined} filters={[{ id: 'k', label: t('long'), value: undefined, onChange: () => undefined, options: ${opt} }]} />;`;
    for (const opt of [`[{ value: 'a', label: t('long'), count: 3 }]`, `rows.map((r: any) => ({ value: r.id, label: r.name, count: r.n }))`]) {
      const h = scan(view(chips(opt)), L);
      expect([...explain(h), ...gaps(h)], opt).toEqual([]);
    }
    // a description is the line under the option in the chip's menu: it counts, inline or returned by a callback
    expect(explain(scan(view(chips(`[{ value: 'a', label: 'A', description: t('long') }]`)), L))).toHaveLength(2);
    expect(explain(scan(view(chips(`rows.map((r: any) => ({ value: r.id, label: r.name, description: t('long') }))`)), L))).toHaveLength(2);
    const grid = scan(view(`return <CardGrid label="G" items={rows} keyOf={(r: any) => r.id} textOf={(r: any) => r.name + t('long')} renderCard={(r: any) => <div>{r.name}</div>} onPick={() => undefined} />;`), L);
    expect([...explain(grid), ...gaps(grid)]).toEqual([]);
  });

  it('kit-explain-codeeditor-problems: a CodeEditor\'s problems are error output (like error/errorText), never a hit or a gap, authored or data', () => {
    const authored = scan(view(`return <CodeEditor value="" problems={[{ line: 1, message: t('long') }, { line: null, message: t('long') }]} />;`), L);
    expect([...explain(authored), ...gaps(authored)]).toEqual([]);
    const data = scan(view(`return <CodeEditor value="" problems={rows.map((e: any) => ({ line: e.line ?? null, message: e.message }))} />;`), L);
    expect([...explain(data), ...gaps(data)]).toEqual([]);
  });

  it('a SettingRow or SettingSwitch detail= is its outcome line (the exempt Outcome), never a hit or a gap; its help= still counts', () => {
    for (const row of ['SettingRow', 'SettingSwitch']) {
      const detail = scan(view(`return <${row} label="R" outcome="failed" detail={t('long')} />;`), L);
      expect([...explain(detail), ...gaps(detail)], row).toEqual([]);
      expect(explain(scan(view(`return <${row} label="R" help={t('long')} />;`), L)), row).toHaveLength(2); // 300 characters: two steps past the budget
      // the outcome line adds nothing to the region its help is measured in
      expect(explain(scan(view(`return <${row} label="R" help={t('short')} detail={t('long')} />;`), L)), row).toEqual([]);
    }
    // detail is a label on these two only: on another kit component it is read as before
    expect(explain(scan(view(`return <Drawer overlayId="d" isOpen title="D" detail={t('long')} />;`), L))).toHaveLength(2);
    expect(explain(scan(view(`return <Drawer overlayId="d" isOpen title="D" detail={<p>{t('long')}</p>} />;`), L))).toHaveLength(2);
  });

  it('settingswitch-help-per-row: a SettingSwitch help= is its own region, as a SettingRow help= is; rows never sum into the section', () => {
    const rows = (row: string) => `return <Section title="S" description={t('short')}><${row} label="A" help={t('short')} /><${row} label="B" help={t('short')} /></Section>;`;
    for (const row of ['SettingRow', 'SettingSwitch']) expect(explain(scan(view(rows(row)), L)), row).toEqual([]);
  });

  it('formfooter-faileddetail: a FormFooter failedDetail= is its outcome line (the exempt Outcome), never a hit or a gap; on another component it is unknown', () => {
    const pre = "import { FormFooter } from '@kit';\n";
    for (const v of [`t('long')`, `ok ? undefined : t('long')`, `t(keyOf(err))`, `o?.message`]) {
      const h = scan(view(`return <Drawer overlayId="d" isOpen title="D" footer={<FormFooter dirty failedDetail={${v}} />} />;`, pre), L);
      expect([...explain(h), ...gaps(h)], v).toEqual([]);
    }
    // only FormFooter's: the same prop on a Drawer is a prop the rule does not know, a gap when it carries authored text
    expect(gaps(scan(view(`return <Drawer overlayId="d" isOpen title="D" failedDetail={t('long')} />;`), L))).toHaveLength(1);
  });

  it('primary-reason-label: the line about the primary (FormFooter reason: what it does or why it is off; Dialog primaryDisabledReason, ConfirmDialog confirmDisabledReason: why it cannot act yet) is a label: never a hit or a gap, as a prop or in a spread; on another component it is unknown', () => {
    const pre = "import { FormFooter } from '@kit';\n";
    for (const v of [`t('long')`, `ok ? t('long') : undefined`, `need`]) {
      const decl = v === 'need' ? "const need = c ? t('long') : undefined; " : '';
      const foot = scan(view(`${decl}return <Drawer overlayId="d" isOpen title="D" footer={<FormFooter dirty reason={${v}} />} />;`, pre), L);
      expect([...explain(foot), ...gaps(foot)], `FormFooter reason={${v}}`).toEqual([]);
      const dialog = scan(view(`${decl}return <Dialog overlayId="d" isOpen title="D" primaryDisabledReason={${v}} />;`), L);
      expect([...explain(dialog), ...gaps(dialog)], `Dialog primaryDisabledReason={${v}}`).toEqual([]);
      const confirm = scan(view(`${decl}return <ConfirmDialog overlayId="d" isOpen title="D" confirmDisabledReason={${v}} />;`), L);
      expect([...explain(confirm), ...gaps(confirm)], `ConfirmDialog confirmDisabledReason={${v}}`).toEqual([]);
    }
    // a conditional spread reads like the attribute
    const spread = scan(view(`return <Drawer overlayId="d" isOpen title="D" footer={<FormFooter dirty {...(c ? { reason: t('long') } : {})} />} />;`, pre), L);
    expect([...explain(spread), ...gaps(spread)]).toEqual([]);
    // the label adds nothing to the overlay's own text: a body under the budget stays under it beside a long reason
    expect(explain(scan(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('short')} confirmDisabledReason={t('long')} />;`), L))).toEqual([]);
    expect(explain(scan(view(`return <Dialog overlayId="d" isOpen title="D" body={t('short')} primaryDisabledReason={t('long')} />;`), L))).toEqual([]);
    // each component's own prop only: the same words in a prop that component does not have are still a gap
    expect(gaps(scan(view(`return <Dialog overlayId="d" isOpen title="D" confirmDisabledReason={t('long')} />;`), L)).length).toBeGreaterThan(0);
    expect(gaps(scan(view(`return <ConfirmDialog overlayId="d" isOpen title="D" primaryDisabledReason={t('long')} />;`), L)).length).toBeGreaterThan(0);
    expect(gaps(scan(view(`return <Drawer overlayId="d" isOpen title="D" primaryDisabledReason={t('long')} />;`), L))).toHaveLength(1);
  });

  it('envrows-labels-label: an EnvRows labels= (each row\'s field and button names, the placeholders, the add word) is labels, never a hit or a gap; its description still counts; on another component it is unknown', () => {
    const ENV = { 'kit/index.ts': `${KIT['kit/index.ts']}\nexport * from './forms/EnvRows';`, 'kit/forms/EnvRows.tsx': 'export function EnvRows(p: any) { return <fieldset>{p.description}</fieldset>; }' };
    const pre = "import { EnvRows } from '@kit';\n";
    const words = `{ key: (n: number) => t('long', { n }), value: (n: number) => t('long', { n }), remove: (n: number) => t('long', { n }), keyHint: t('long'), valueHint: t('long'), add: t('long') }`;
    const h = scan(view(`return <EnvRows rows={rows} label="Variables" labels={${words}} onEdit={() => undefined} onRemove={() => undefined} onAdd={() => undefined} />;`, pre), L, ENV);
    expect([...explain(h), ...gaps(h)]).toEqual([]);
    // the field's description is text of the region that holds it
    expect(explain(scan(view(`return <EnvRows rows={rows} label="Variables" description={t('long')} labels={${words}} />;`, pre), L, ENV))).toHaveLength(2);
    // labels is EnvRows' own: the same prop on a Drawer is a prop the rule does not know
    expect(gaps(scan(view(`return <Drawer overlayId="d" isOpen title="D" labels={{ add: t('long') }} />;`), L, ENV))).toHaveLength(1);
  });

  it('allow-everything-confirm-ownlabels: an AllowEverythingConfirm data= (the approvals read), setYolo= (the switch) and yoloWhy= (only takes the offer away, never drawn) are data, never a hit or a gap, as props or in a spread; on another component they are unknown', () => {
    const AE = { 'kit/index.ts': `${KIT['kit/index.ts']}\nexport * from './agent/ApprovalMode';`, 'kit/agent/ApprovalMode.tsx': 'export function AllowEverythingConfirm(p: any) { return <div />; }\nexport function useApproval(c: any) { return c; }' };
    const pre = "import { AllowEverythingConfirm, useApproval } from '@kit';\n";
    const decl = "const ap = useApproval(c); const setYolo = c ? (w: boolean) => !!w : null; const opts = { setYolo, ...(k ? { yoloWhy: t('long') } : {}) };\n";
    const spread = scan(view(`${decl}return <AllowEverythingConfirm data={ap} computer="atlas" askFor={null} setAskFor={() => undefined} onSent={() => undefined} {...opts} />;`, pre), L, AE);
    expect([...explain(spread), ...gaps(spread)]).toEqual([]);
    const props = scan(view(`${decl}return <AllowEverythingConfirm data={ap} computer="atlas" askFor={null} setAskFor={() => undefined} onSent={() => undefined} setYolo={setYolo} yoloWhy={t('long')} />;`, pre), L, AE);
    expect([...explain(props), ...gaps(props)]).toEqual([]);
    // AllowEverythingConfirm's own props only: the same props on a Drawer are props the rule does not know
    expect(gaps(scan(view(`${decl}return <Drawer overlayId="d" isOpen title="D" yoloWhy={t('long')} />;`, pre), L, AE))).toHaveLength(1);
  });

  it('anatomy-pathfield-read-ownlabel: a PathField read= is the folder reads (data), never a hit or a gap, in either branch; its description still counts', () => {
    const reads = 'const NO = { entries: [], dir: null, failed: true, want: () => undefined }; const reads = useReads(c);\n';
    for (const read of ['reads', 'useReads(c) ?? NO', 'c ? useReads(c) : NO', '{ entries: [], dir: null, failed: true, want: () => undefined }', "t('long')"]) {
      const h = scan(view(`${reads}return <PathField label="Folder" value="" onChange={() => undefined} mode="folder" root="/" read={${read}} />;`), L);
      expect([...explain(h), ...gaps(h)], read).toEqual([]);
    }
    expect(explain(scan(view(`return <PathField label="Folder" value="" read={c} description={t('long')} />;`), L))).toHaveLength(2);
    // read is data on PathField only: on another kit component it is read as before
    expect(gapsOf(view(`return <Drawer overlayId="d" isOpen title="D" read={t('long')} />;`))).toHaveLength(1);
    // and only on the kit's own PathField: a page's own component of that name is read as before
    const own = { 'pages/x/PathField.tsx': 'export function PathField(p: any) { return <div>{p.read}</div>; }' };
    const ownHits = scan(view(`return <Own read={t('long')} />;`, "import { PathField as Own } from './PathField';\n"), L, own).filter((h) => h.file === 'pages/x/view.tsx');
    expect(explain(ownHits)).toHaveLength(2);
  });

  it('views and problems are labels only on DetailPage, ListDetailPage and CodeEditor; on any other kit component or an outside one they are read', () => {
    const ext = "import Ext from 'some-lib';\n";
    // read like any unknown prop: the same hits and gaps as a prop name the rule has never heard of (vista)
    const same = (page: (an: string) => string, pre = '') => {
      const of = (an: string) => { const h = scan(view(page(an), pre), L); return [explain(h).length, gaps(h).length]; };
      expect(of('views')).toEqual(of('vista'));
      expect(of('problems')).toEqual(of('vista'));
    };
    for (const an of ['views', 'problems']) {
      expect(gapsOf(view(`return <Drawer overlayId="d" isOpen title="D" ${an}={t('long')} />;`))).toHaveLength(1);
      expect(gapsOf(view(`return <Ext ${an}={t('long')} />;`, ext))).toHaveLength(1);
    }
    same((an) => `return <Drawer overlayId="d" isOpen title="D" ${an}={<Section title="s" description={t('long')} />} />;`);
    same((an) => `return <Ext ${an}={<Section title="s" description={t('long')} />} />;`, ext);
    same((an) => `return <Ext ${an}={[{ line: 1, message: t('long') }]} />;`, ext);
  });

  it('expression forms: strings.key, a helper returning text, and an expression past the depth limit', () => {
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={strings.long} />;`))).toBe(2);
    expect(gapsOf(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={strings.nope} />;`))).toHaveLength(1);
    expect(gapsOf(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={(strings as any)[k]} />;`))).toHaveLength(1);
    expect(two(view(`const body = () => t('long'); return <ConfirmDialog overlayId="d" isOpen title="D" body={body()} />;`))).toBe(2);
    expect(two(view(`function copy(key: string) { return t(key); } return <ConfirmDialog overlayId="d" isOpen title="D" body={copy('long')} />;`))).toBe(2);
    const deep = `${'String('.repeat(14)}t('long')${')'.repeat(14)}`; // a flat `+` chain is measured whole, so the depth limit is shown with nested calls
    expect(gapsOf(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={${deep}} />;`)).length).toBeGreaterThan(0);
    expect(two(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('long').trim().toUpperCase()} />;`))).toBe(2);
  });
  it('a FAQ answer is one region however many pieces join it; a computed answer is a gap', () => {
    const faq = (a: string) => `export function pageFaq(t: (k: string) => string, k: string) { return [{ id: 'x', q: t('faq.x.q'), a: ${a} }]; }`;
    const run = (a: string) => scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(400) }, { 'pages/x/faq.ts': faq(a) });
    expect(explain(run("t('faq.x.a') + t('faq.x.a')"))).toHaveLength(3); // 800 characters: 600 + two steps
    expect(explain(run("t('faq.x.a')"))).toEqual([]);
    expect(explain(run("t('faq.x.a') + ' ' + t('faq.x.a')")).length).toBe(3);
    expect(gaps(run('t(k)'))).toHaveLength(1);
    expect(gaps(run('someRuntimeThing(k)')).length).toBeGreaterThan(0);
    expect(gaps(run("t('faq.x.a')"))).toEqual([]);
  });
  it('dangerouslySetInnerHTML: a readable __html is measured, anything else is a gap', () => {
    expect(two(view(`return <Section title="s"><div dangerouslySetInnerHTML={{ __html: t('long') }} /></Section>;`))).toBe(2);
    expect(gapsOf(view(`return <Section title="s"><div dangerouslySetInnerHTML={{ __html: rows }} /></Section>;`))).toHaveLength(1);
  });
  it('translators by alias and through props are traced; an untraceable translate call is a gap', () => {
    const alias = `import { Section, useStrings as useCopy } from '@kit';\nimport strings from './strings.en.json';\nexport function V() { const t = useCopy(strings); return <Section title="s" description={t('long')}><Button>go</Button></Section>; }`;
    const files = { ...KIT, 'pages/x/strings.en.json': JSON.stringify(L), 'pages/x/view.tsx': alias };
    expect(explain(A.scan(files).hits.filter((h) => h.file.startsWith('pages/')))).toHaveLength(2);
    const member = `function P(p: any) { return <Section title="s" description={p.t('long')} />; }\n`;
    expect(two(view(`return <P t={t} />;`, member))).toBe(2);
    expect(gapsOf(view(`return <P t={props.t} />;`, member)).length).toBeGreaterThan(0);
    // a local hook that wraps useStrings
    const hook = `function useT() { return useStrings(strings); }\n`;
    expect(two(`${hook}export function V() { const t = useT(); return <Section title="s" description={t('long')} />; }`)).toBe(2);
  });
  it('table members: a string-literal member overrides in order; any other member makes the table unreadable (gap)', () => {
    const merged = (member: string) => view(`return <FirstUseState title="S" body={t('b')} />;`, `const merged = { ...strings, ${member} };\n`).replace('const t = useStrings(strings);', 'const t = useStrings(merged);');
    expect(two(merged(`b: '${chars(300)}'`), { b: 'Short.' })).toBe(2);
    const bad = scan(merged('b: LONG'), { b: 'Short.' });
    expect(gaps(bad)).toHaveLength(1);
    expect(explain(bad)).toEqual([]);
  });
  it('roots and components: an anonymous default export is a root; a computed or unresolved component is a gap', () => {
    expect(two(`export default function () { ${T} return <FirstUseState title="S" body={t('long')} />; }`)).toBe(2);
    expect(two(`export default () => { ${T} return <FirstUseState title="S" body={t('long')} />; };`)).toBe(2);
    expect(gapsOf(view(`const Choice = c ? Section : Stack; return <Choice body={t('long')} />;`)).length).toBeGreaterThan(0);
    expect(gapsOf(view(`const C = props.C; return <C body={t('long')} />;`)).length).toBeGreaterThan(0);
  });
  it('a map of unknown size whose body creates a region is a gap; a sections entry that is not a literal is a gap', () => {
    const r = scan(view(`return <>{rows.map((r: any) => <Section key={r.id} title="s" description={t('short')} />)}</>;`), L);
    expect(gaps(r)).toHaveLength(1);
    expect(gaps(scan(view(`return <>{rows.map((r: any) => <Section key={r.id} title={r.name} />)}</>;`)))).toEqual([]);
    expect(two(view(`const item = { id: 'a', title: 'A', description: t('long'), content: null }; return <SettingsPage sections={[item]} />;`))).toBe(2);
    expect(gapsOf(view(`return <SettingsPage sections={buildSections()} />;`))).toHaveLength(1);
    expect(gapsOf(view(`const base = {}; return <SettingsPage sections={[{ ...base, id: 'a', title: 'A' }]} />;`))).toEqual([]); // a readable spread is read in order
    expect(gapsOf(view(`return <SettingsPage sections={[props.first, { id: 'b', title: 'B', description: t('short') }]} />;`)).length).toBeGreaterThan(0);
  });
  it('every rendered occurrence counts: a helper rendered twice is two regions; its unresolved lookup is two gaps', () => {
    const panel = `function Panel({ t }: any) { return <Section title="s"><p>{t('long')}</p></Section>; }\n`;
    expect(two(view(`return <><Panel t={t} /><Panel t={t} /></>;`, panel))).toBe(4);
    const g = `function G({ t, k }: any) { return <p>{t(k)}</p>; }\n`;
    expect(gapsOf(view(`return <Section title="s"><G t={t} k={k} /><G t={t} k={k} /></Section>;`, g))).toHaveLength(2);
  });
  it('text is joined before it is normalized: the whitespace between fragments counts', () => {
    const t75 = { a: chars(75), b: chars(75) };
    expect(two(view(`return <FirstUseState title="S" body={t('a') + ' ' + t('b')} />;`), t75)).toBe(1); // 151
    expect(two(view(`return <FirstUseState title="S" body={t('a') + t('b')} />;`), t75)).toBe(0); // 150
    expect(two(view("return <FirstUseState title=\"S\" body={`${t('a')} ${t('b')}`} />;"), t75)).toBe(1);
    expect(two(view(`return <Section title="s" description={<>{t('a')}{' '}{t('b')}</>}><Button>go</Button></Section>;`), t75)).toBe(1);
    const many = Array.from({ length: 76 }, () => "{'x '}").join('');
    expect(two(view(`return <Section title="s" description={<>${many}</>}><Button>go</Button></Section>;`))).toBe(1); // 152 - 1
    // a trailing and a leading space across two expressions are one space: 10 x (8 + 8) characters is 150
    const seam = Array.from({ length: 10 }, () => "{'xxxxxxx '}{' xxxxxxx'}").join('');
    expect(two(view(`return <Section title="s" description={<>${seam}</>}><Button>go</Button></Section>;`))).toBe(0);
  });
  it('the returns of one function are alternatives: the longest shows, not the sum', () => {
    const body = `function Body({ c, t }: any) { if (c) return t('a'); return t('b'); }\n`;
    expect(two(view(`return <Section title="s"><Body c={c} t={t} /></Section>;`, body), { a: chars(100), b: chars(100) })).toBe(0);
    expect(two(view(`return <Section title="s"><Body c={c} t={t} /></Section>;`, body), { a: chars(300), b: chars(100) })).toBe(2);
  });
  it('a translate call with no traceable translator, an unresolvable component and a seam space each score as written', () => {
    const noT = (body: string, pre = '') => view(body, pre).replace('const t = useStrings(strings);', '');
    expect(gaps(scan(noT(`const t = makeIt(); return <Section title="s" description={t('long')} />;`), L)).length).toBe(1);
    const hoc = `const Mystery = makeComponent();\n`;
    expect(gaps(scan(view(`return <Mystery body={t('long')} />;`, hoc), L)).length).toBe(1);
    // ' x ' pieces share their seam space: 76 of them are 151 characters, not 226
    const seam = Array.from({ length: 76 }, () => "{' x '}").join('');
    expect(two(view(`return <Section title="s" description={<>${seam}</>}><Button>go</Button></Section>;`))).toBe(1);
  });
  it('a known text prop outside the region list still counts in that region (a hit, not a gap)', () => {
    const r = scan(view(`return <EmptyState title="x" note={t('long')} />;`), L);
    expect(explain(r)).toHaveLength(2);
    expect(gaps(r)).toEqual([]);
  });
  it('a FAQ key outside faq.ts is 1 hit and hides nothing else: the other alternative still counts, a missing FAQ key is a gap', () => {
    const table = { 'faq.x.a': 'short', huge: chars(1000) };
    const r = scan(view(`return <Section title="s"><p>{t(c ? 'faq.x.a' : 'huge')}</p></Section>;`), table);
    expect(explain(r)).toHaveLength(12 + 1); // 1000 characters: ceil(850 / 75) = 12, plus the placement hit
    const missing = scan(view(`return <Section title="s"><p>{t('faq.missing.a')}</p></Section>;`), table);
    expect(gaps(missing)).toHaveLength(1);
  });
});

// The contract is a WHITELIST. A measured position holds a string literal, a template of
// measured parts, JSX text, t('key') / strings.key on a traced table, a prop the render site gave, a `const` holding one of those, or a known text prop;
// ANY OTHER form is a gap at that occurrence, never a zero. Each fixture below is an input that once failed
// with a control beside it, and each is the one that kills its mutant.
describe('the whitelist', () => {
  const L: Record<string, string> = { long: chars(300), short: chars(100), a: chars(75), b: chars(75) };
  const view = (body: string, pre = '') => `${pre}export function V({ props, rows, c, k }: any) { ${T} ${body} }`;
  const run = (src: string, table: Record<string, string> = L, extra: Record<string, string> = {}) => {
    const hits = scan(src, table, extra);
    return { e: explain(hits).length, g: gaps(hits).length, hits };
  };
  const sec = (inner: string) => `return <Section title="s">${inner}</Section>;`;

  describe('bindings: destructuring, array parts, captures, defaults, reassignment', () => {
    it('an array read in a FAQ answer is read: 800 characters in two parts is 3 hits, not 0', () => {
      const faq = "export function pageFaq(t: (k: string) => string) { const parts = [t('faq.x.a'), t('faq.x.a')]; const items = [{ id: 'x', q: t('faq.x.q'), a: parts[0] + parts[1] }]; return { items, byId: { x: items[0] } }; }";
      const r = scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(400) }, { 'pages/x/faq.ts': faq });
      expect(explain(r)).toHaveLength(3);
      expect(gaps(r)).toEqual([]);
    });
    it('a destructured table name is read (const { long: body } = strings)', () => {
      expect(run(view('const { long: body } = strings; return <FirstUseState title="S" body={body} />;')).e).toBe(2);
      expect(run(view('const { long } = strings; return <FirstUseState title="S" body={long} />;')).e).toBe(2);
      expect(run(view('const { nope } = strings; return <FirstUseState title="S" body={nope} />;')).g).toBe(1);
    });
    it('a binding captured by a local function is read through the function that owns it', () => {
      const pre = 'function Copy({ body }: any) { const show = () => body; return <p>{show()}</p>; }\n';
      expect(run(view(sec("<Copy body={t('long')} />"), pre)).e).toBe(2);
    });
    it('a destructured parameter of a helper reads the argument object; an argument it cannot open is a gap', () => {
      const pre = 'function pick({ body }: any) { return body; }\n';
      expect(run(view(`return <FirstUseState title="S" body={pick({ body: t('long') })} />;`, pre)).e).toBe(2);
      expect(run(view(`return <FirstUseState title="S" body={pick(props)} />;`, pre)).g).toBe(1);
    });
    it('a variable assigned after its declaration is a gap, a const is read', () => {
      expect(run(view("let body = ''; body = t('long'); return <FirstUseState title=\"S\" body={body} />;")).g).toBe(1);
      expect(run(view("const body = t('long'); return <FirstUseState title=\"S\" body={body} />;")).e).toBe(2);
    });
    it('a parameter default and an array element are read', () => {
      const pre = 'function Body({ text = strings.long }: any) { return <p>{text}</p>; }\n';
      expect(run(view(sec('<Body />'), pre)).e).toBe(2);
      expect(run(view("const parts = [t('long')]; return <FirstUseState title=\"S\" body={parts[0]} />;")).e).toBe(2);
      expect(run(view("const parts = [t('short'), t('long')]; return <FirstUseState title=\"S\" body={parts[k]} />;")).e).toBe(2); // an unknown index: the longest element shows
    });
    it('a literal index reads that element', () => {
      expect(run(view("const parts = [t('long'), t('short')]; return <FirstUseState title=\"S\" body={parts[1]} />;")).e).toBe(0);
    });
    it('a name it cannot trace is a gap', () => {
      expect(run(view('return <FirstUseState title="S" body={COPY} />;', "import { COPY } from './copy';\n")).g).toBe(1);
    });
    it('a member read it cannot follow is a gap', () => {
      expect(run(view('return <FirstUseState title="S" body={rows.title} />;')).g).toBe(1);
    });
    it('a record read whose member a later computed key may override is a gap; a plain record read is not', () => {
      expect(run(view("const COPY = { a: 'a sentence that is long enough to count', [k]: 'z' }; return <FirstUseState title=\"S\" body={COPY.a} />;")).g).toBe(1);
      expect(run(view("const COPY = { a: 'a short sentence', b: 'z' }; return <FirstUseState title=\"S\" body={COPY.a} />;")).g).toBe(0);
    });
    it('a table the function declares itself wins over an imported table of the same name', () => {
      const local = `export function V() { const strings = { long: '${chars(300)}' }; const t = useStrings(strings); return <FirstUseState title="S" body={t('long')} />; }`;
      expect(run(local, { long: 'short' }).e).toBe(2);
    });
  });

  describe('conditional spreads are alternatives', () => {
    it('{...(c ? { body: long } : { body: short })} shows the long body', () => {
      expect(run(view(`return <ConfirmDialog overlayId="d" isOpen title="D" {...(c ? { body: t('long') } : { body: t('short') })} />;`)).e).toBe(2);
      expect(run(view(`return <ConfirmDialog overlayId="d" isOpen title="D" {...(c ? { body: t('short') } : { body: t('short') })} />;`)).e).toBe(0);
    });
    it('an && spread keeps the body it overrides as the other alternative', () => {
      expect(run(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('long')} {...(c && { body: t('short') })} />;`)).e).toBe(2);
      expect(run(view(`return <ConfirmDialog overlayId="d" isOpen title="D" body={t('short')} {...(c && { body: t('long') })} />;`)).e).toBe(2);
    });
  });

  describe('string methods keep their arguments', () => {
    it('join counts its separator', () => {
      expect(run(view("return <FirstUseState title=\"S\" body={[t('a'), t('b')].join(' ')} />;")).e).toBe(1); // 151
      expect(run(view("return <FirstUseState title=\"S\" body={[t('a'), t('b')].join('')} />;")).e).toBe(0); // 150
      expect(run(view("return <FirstUseState title=\"S\" body={[t('a'), t('b')].join(k)} />;")).g).toBe(1);
    });
    it('replace / replaceAll bring their replacement; an unbounded method is a gap', () => {
      expect(run(view("return <FirstUseState title=\"S\" body={''.replace('', t('long'))} />;")).e).toBe(2);
      expect(run(view("return <FirstUseState title=\"S\" body={''.replace(/^/, t('long'))} />;")).e).toBe(2);
      expect(run(view(`return <FirstUseState title="S" body={''.replace('', '${chars(300)}')} />;`)).e).toBe(2); // a literal replacement
      expect(run(view("return <FirstUseState title=\"S\" body={'x'.replaceAll('x', t('long'))} />;")).g).toBe(1); // every match brings the replacement again
      expect(run(view("return <FirstUseState title=\"S\" body={t('short').padEnd(400)} />;")).g).toBe(1);
      expect(run(view("return <FirstUseState title=\"S\" body={t('short').repeat(4)} />;")).g).toBe(1);
    });
  });

  describe('a call or tagged template the rule has no rule for is a gap', () => {
    const copy = "const copy = t('long'); ";
    it.each([
      ['Object.assign', `${copy}return <FirstUseState title="S" body={Object.assign({}, { body: copy }).body} />;`],
      ['String.raw', `${copy}return <FirstUseState title="S" body={String.raw\`\${copy}\`} />;`],
      ['React.createElement', `${copy}return <FirstUseState title="S" body={React.createElement('p', null, copy)} />;`],
      ['React.cloneElement', `return <FirstUseState title="S" body={React.cloneElement(<p>{t('long')}</p>, Object.assign({}, {}))} />;`],
      ['a translator held in an object', `const tr = { translate: t }; return <FirstUseState title="S" body={tr.translate('long')} />;`],
      ['reduce', `return <FirstUseState title="S" body={['long'].reduce((s, x) => s + t(x), '')} />;`],
      ['map(t)', `return <FirstUseState title="S" body={['long'].map(t)} />;`],
    ])('%s', (_n, body) => {
      const r = run(view(body));
      expect(r.g).toBeGreaterThan(0);
    });
    it('a call to a name it cannot follow is exactly one gap, and its arguments are not read around it', () => {
      const r = run(view("return <FirstUseState title=\"S\" body={fmt(t('long'))} />;"));
      expect([r.g, r.e]).toEqual([1, 0]);
      const iife = run(view("return <FirstUseState title=\"S\" body={(() => t('long'))()} />;"));
      expect(iife.g).toBe(1);
    });
    it('a named callback is followed like an inline one', () => {
      expect(run(view("const read = (key: string) => t(key); return <Section title=\"s\">{['long'].map(read)}</Section>;")).e).toBe(2);
    });
  });

  describe('a translate call on a translator nobody can name is one gap', () => {
    it('a t made by a call the rule cannot follow is one gap, not a zero', () => {
      const r = scan(view("const t = makeIt(); return <Section title=\"s\" description={t('long')} />;").replace('const t = useStrings(strings);', ''), { long: chars(300) });
      expect([gaps(r).length, explain(r).length]).toEqual([1, 0]);
    });
    it('a parameter called t that no caller passes', () => {
      const r = scan(`export function W({ t }: any) { return <Section title="s" description={t('long')} />; }`, { long: chars(300) });
      expect([gaps(r).length, explain(r).length]).toEqual([1, 0]);
    });
  });

  describe('intrinsic elements: children and HTML props in source order', () => {
    it('a children prop and spread HTML are measured', () => {
      expect(run(view(sec("<div children={t('long')} />"))).e).toBe(2);
      expect(run(view(sec("<div {...{ dangerouslySetInnerHTML: { __html: t('long') } }} />"))).e).toBe(2);
      expect(run(view(sec("<div {...{ children: t('long') }} />"))).e).toBe(2);
    });
    it('the last __html wins, wherever it is written', () => {
      expect(run(view(sec("<div dangerouslySetInnerHTML={{ __html: t('short'), ...{ __html: t('long') } }} />"))).e).toBe(2);
      expect(run(view(sec("<div dangerouslySetInnerHTML={{ __html: t('long'), ...{ __html: t('short') } }} />"))).e).toBe(0);
    });
    it('a spread of children is one gap', () => {
      const r = run(view(sec("{...[t('long')]}")));
      expect([r.g, r.e]).toEqual([1, 0]); // a readable array would otherwise be measured: the spread itself is the gap
    });
    it('JSX children win over the children prop; a spread it cannot read is a gap', () => {
      expect(run(view(sec("<div children={t('long')}>{t('short')}</div>"))).e).toBe(0);
      expect(run(view(sec('<div {...props} />'))).g).toBe(1);
    });
  });

  describe('components the rule cannot resolve, and roots', () => {
    it('a member component is a gap', () => {
      expect(run(view("return <props.C body={t('long')} />;")).g).toBe(1);
    });
    it('React.memo is unwrapped to its component', () => {
      expect(run(`export default React.memo(() => { ${T} return <FirstUseState title="S" body={t('long')} />; });`).e).toBe(2);
    });
    it('a lowercase named default function is a root', () => {
      expect(run(`export default function view() { ${T} return <FirstUseState title="S" body={t('long')} />; }`).e).toBe(2);
    });
    it('an unsupported root wrapper is a gap, never nothing', () => {
      expect(run(`export default someHoc(() => { ${T} return <FirstUseState title="S" body={t('long')} />; });`).g).toBe(1);
    });
    it('a component that renders itself is entered once: its text counts and the recursion is a gap', () => {
      const r = run(`export function V({ again }: any) { ${T} return <Section title="s" description={t('long')}>{again && <V again={false} />}</Section>; }`);
      expect(r.e).toBe(2);
      expect(r.g).toBe(1);
    });
    it('components that only reach each other are still entered once', () => {
      const pre = `function A({ n }: any) { ${T} return <Section title="s" description={t('long')}>{n && <B n={false} />}</Section>; }\nfunction B({ n }: any) { return <A n={n} />; }\n`;
      expect(run(pre).e).toBe(2);
    });
    it('a Provider suffix is not a pass: a component the rule cannot open that is handed text is a gap', () => {
      const pre = 'const CopyProvider = (Math.random() ? (p: any) => <p>{p.body}</p> : null) as any;\n';
      expect(run(view(sec("<CopyProvider body={t('long')} />"), pre)).g).toBe(1);
      expect(run(view(sec('<CopyProvider value={1}><p>hello</p></CopyProvider>'), pre)).g).toBe(0);
    });
    it('an outside component that is handed authored text in a prop is a gap; its children are shown', () => {
      const pre = "import Ext from 'some-lib';\n";
      expect(run(view(sec("<Ext body={t('long')} />"), pre)).g).toBe(1);
      expect(run(view(sec("<Ext>{t('long')}</Ext>"), pre)).e).toBe(2);
    });
  });

  describe('slots: a content slot is measured, an alias into a label slot keeps its regions', () => {
    it('Composer.below and SessionView.empty are content', () => {
      expect(run(view(sec("<Composer below={<p>{t('long')}</p>} />"))).e).toBe(2);
      expect(run(view(sec("<SessionView empty={<p>{t('long')}</p>} />"))).e).toBe(2);
    });
    it('a region reached through an alias in an action prop is counted where it is', () => {
      const pre = "function Panel({ t }: any) { return <ConfirmDialog overlayId=\"d\" isOpen title=\"T\" body={t('long')} />; }\n";
      const r = run(view("const action = <Panel t={t} />; return <FirstUseState title=\"S\" body={t('short')} action={action} />;", pre));
      expect(r.e).toBe(2);
      expect(keysOf(explain(r.hits))).toEqual(['layout.explain|pages/x/view.tsx|overlay:d']);
    });
    it('a render callback in a content position is walked; one in an event prop is not content', () => {
      expect(run(view(`return <Sheet overlayId="s" title="S" isOpen onOpenChange={() => {}}>{() => <p>{t('long')}</p>}</Sheet>;`)).e).toBe(2);
      expect(run(view(`return <Section title="s"><Button onPress={() => { go(t('long')); }}>go</Button></Section>;`)).g).toBe(0);
    });
  });

  describe('a local translator hook must return the translator it made', () => {
    const hook = (ret: string) => `function useCopy() { const base = useStrings(strings); ${ret} }\n`;
    const pg = "export function V() { const t = useCopy(); return <FirstUseState title=\"S\" body={t('short')} />; }";
    const tbl = { short: chars(100), 'prefix.short': chars(300) };
    it('a wrapper that changes the key has a table the rule cannot name', () => {
      expect(run(hook('return (key: string) => base(`prefix.${key}`);') + pg, tbl).g).toBe(1);
      expect(run(hook('return (key: string) => base(`prefix.${key}`);') + pg, tbl).e).toBe(0);
    });
    it('a hook that returns the translator itself keeps its table', () => {
      expect(run(hook('return base;') + pg, tbl).g).toBe(0);
      expect(run(hook('return base;') + pg.replace("t('short')", "t('long')"), L).e).toBe(2);
    });
  });

  describe('exclusive alternatives containing regions score the longest, not the sum', () => {
    it('early returns and a ternary of regions', () => {
      expect(run(view("if (c) return <Section title=\"S\" description={t('long')} />; return <Section title=\"S\" description={t('long')} />;")).e).toBe(2);
      expect(run(view("return c ? <Section title=\"S\" description={t('long')} /> : <Section title=\"S\" description={t('short')} />;")).e).toBe(2);
      expect(run(view("return <><Section title=\"S\" description={t('long')} /><Section title=\"S\" description={t('long')} /></>;")).e).toBe(4);
    });
    it('a gap in either alternative is kept', () => {
      expect(run(view("return c ? <Section title=\"S\" description={t('long')} /> : <Section title=\"S\" description={t(k)} />;")).g).toBe(1);
    });
  });

  describe('descriptor entries: a gap per entry, readable spreads read', () => {
    it('two unreadable entries are two gaps', () => {
      expect(run(view('return <SettingsPage sections={[props.first, props.second]} />;')).g).toBe(2);
    });
    it('a readable spread supplies the entry text', () => {
      expect(run(view("const base = { description: t('long') }; return <SettingsPage sections={[{ ...base, id: 'a', title: 'A' }]} />;")).e).toBe(2);
    });
  });

  describe('a FAQ answer placed outside faq.ts is a hit in every lookup form, even when the key is missing', () => {
    it('strings[...] and a missing key', () => {
      const tb = { 'faq.rate.a': chars(40) };
      expect(run(view("return <FirstUseState title=\"S\" body={strings['faq.rate.a']} />;"), tb).e).toBe(1);
      const miss = run(view("return <FirstUseState title=\"S\" body={t('faq.nope.a')} />;"), tb);
      expect(miss.e).toBe(1);
      expect(miss.g).toBe(1);
    });
  });

  describe('object arrays', () => {
    it('a map over a literal array of records reads each record field', () => {
      const pre = "const IDEAS = [{ key: 'short' }, { key: 'short' }] as const;\n";
      const r = run(view(sec('{IDEAS.map((r) => <p key={r.key}>{t(r.key)}</p>)}'), pre));
      expect(r.g).toBe(0);
      expect(r.e).toBe(1); // 100 + 100 > 150
    });
  });

  describe('a shared helper keeps the overlay of each render occurrence', () => {
    it('the same helper in two dialogs scores 2 hits in each', () => {
      const pre = "function Body({ t }: any) { return <Section title=\"s\" description={t('long')} />; }\n";
      const r = run(view('return <><Dialog overlayId="a" isOpen title="t"><Body t={t} /></Dialog><Dialog overlayId="b" isOpen title="t"><Body t={t} /></Dialog></>;', pre));
      expect(keysOf(explain(r.hits))).toEqual(['layout.explain|pages/x/view.tsx|overlay:a', 'layout.explain|pages/x/view.tsx|overlay:b']);
      expect(explain(r.hits)).toHaveLength(4);
    });
  });

  describe('a computed or spread member of a FAQ item can supply the answer', () => {
    it('a computed answer property is a gap', () => {
      const faq = "export function pageFaq(t: (k: string) => string, name: string) { const items = [{ id: 'x', q: t('faq.x.q'), [name]: t('faq.x.a') + t('faq.x.a') }]; return { items, byId: { x: items[0] } }; }";
      const r = scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(400) }, { 'pages/x/faq.ts': faq });
      expect(gaps(r).length).toBeGreaterThan(0);
    });
  });
});

// One failing input per fix with a control beside it, and each test is the
// fixture that kills its own mutant (one test per mutant, so a title names exactly the fix it guards). Two cases are answered with evidence
// instead of a change: `t.key` is not a form (a translator is a plain function), and a component's whole-argument default (React always hands a component a
// props object, so it never applies to a render).
describe('explain: one failing input per fix, each with a control beside it', () => {
  const L: Record<string, string> = { long: chars(300), short: chars(100), a: chars(75), b: chars(75), length: chars(300) };
  const view = (body: string, pre = '') => `${pre}export function V({ props, rows, c, k }: any) { ${T} ${body} }`;
  const run = (src: string, table: Record<string, string> = L, extra: Record<string, string> = {}) => {
    const hits = scan(src, table, extra);
    return { e: explain(hits).length, g: gaps(hits).length, hits };
  };
  const files = (hits: Hit[]) => [...new Set(hits.map((h) => h.file))].sort();
  const clean = { e: 0, g: 0 };

  describe('a form read through another file is keyed to the file it is in', () => {
    const wrap = { 'pages/x/Wrap.tsx': "import { SettingsPage } from '@kit';\nexport function Wrap({ title, ...rest }: any) { return <SettingsPage {...rest} />; }\n" };
    const imp = "import { Wrap } from './Wrap';\n";
    it('sections handed to a wrapper that spreads them into SettingsPage: the hits belong to view.tsx, where they are written', () => {
      const r = run(view("return <Wrap title=\"x\" sections={[{ id: 'a', title: 'A', description: t('long') }]} />;", imp), L, wrap);
      expect(r.e).toBe(2);
      expect(files(r.hits)).toEqual(['pages/x/view.tsx']);
    });
    it('sections handed to a wrapper: a gap in them is reported in view.tsx too', () => {
      const r = run(view("return <Wrap title=\"x\" sections={[{ id: 'a', title: 'A', description: fmt(k) }]} />;", imp), L, wrap);
      expect(r.g).toBe(1);
      expect(files(r.hits)).toEqual(['pages/x/view.tsx']);
    });
    it('an imported array of records with a module const, read by a destructuring map, is measured', () => {
      const data = { 'pages/x/data.ts': `const LONG = '${chars(300)}';\nexport const ITEMS = [{ text: LONG }];\n` };
      const r = run(view('return <Section title="s">{ITEMS.map(({ text }) => <p key={text}>{text}</p>)}</Section>;', "import { ITEMS } from './data';\n"), L, data);
      expect([r.e, r.g]).toEqual([2, 0]);
      expect(files(r.hits)).toEqual(['pages/x/view.tsx']);
    });
    it('an imported array holding a named record reads that record', () => {
      const data = { 'pages/x/data.ts': `const sub = { text: '${chars(300)}' };\nexport const ITEMS = [sub];\n` };
      const r = run(view('return <Section title="s">{ITEMS.map((r) => <p key={r.text}>{r.text}</p>)}</Section>;', "import { ITEMS } from './data';\n"), L, data);
      expect([r.e, r.g]).toEqual([2, 0]);
    });
  });

  describe('a table key named length or size is a lookup; a data member stays data', () => {
    it('strings.length with a length key is 2 hits', () => {
      expect(run(view('return <FirstUseState title="S" body={strings.length} />;')).e).toBe(2);
    });
    it('strings.size without a size key is data', () => {
      expect(run(view('return <FirstUseState title="S" body={strings.size} />;'))).toMatchObject(clean);
    });
    it('rows.length is data', () => {
      expect(run(view('return <FirstUseState title="S" body={rows.length} />;'))).toMatchObject(clean);
    });
    it('t.long is a gap (a translator is a function, so t.key is not a form)', () => {
      expect(run(view('return <FirstUseState title="S" body={t.long} />;'))).toMatchObject({ e: 0, g: 1 });
    });
    it('t.length is data', () => {
      expect(run(view('return <FirstUseState title="S" body={t.length} />;'))).toMatchObject(clean);
    });
  });

  describe('a replacement that repeats text is a gap', () => {
    const body = (x: string) => view(`return <FirstUseState title="S" body={${x}} />;`);
    it('replaceAll is a gap: every match brings the replacement again', () => {
      expect(run(body("'xxxx'.replaceAll('x', t('short'))")).g).toBe(1);
    });
    it('replace with a global pattern is a gap', () => {
      expect(run(body("'xxxx'.replace(/x/g, t('short'))")).g).toBe(1);
    });
    it('replace with a pattern that is not a literal is a gap', () => {
      expect(run(body("'xxxx'.replace(k, t('short'))")).g).toBe(1);
    });
    it('replace whose string replacement echoes the match is a gap', () => {
      expect(run(body("t('short').replace(/^.*$/, '$&$&$&')")).g).toBe(1);
    });
    it('replace whose template replacement echoes the match is a gap', () => {
      expect(run(body("t('short').replace('x', `$'${'$'}`)")).g).toBe(1);
    });
    it('replace of one literal match with a plain replacement stays measured', () => {
      expect(run(body("''.replace('', t('long'))"))).toMatchObject({ e: 2, g: 0 });
    });
    it('an array joined by toLocaleString is a method the rule does not measure', () => {
      expect(run(body("[t('a'), t('b')].toLocaleString()")).g).toBe(1);
    });
    it('a string toLocaleLowerCase keeps its receiver', () => {
      expect(run(body("t('long').toLocaleLowerCase()"))).toMatchObject({ e: 2, g: 0 });
    });
  });

  describe('prose written in pieces, and a record that holds a gap', () => {
    const sec = (inner: string) => view(`return <Section title="s">${inner}</Section>;`);
    const cfgProp = (decl: string) => run(view('return <DetailPage header={{ title: "D" }} mystery={cfg} />;', decl));
    it('a template of short literals that reads as a sentence is authored text in an unknown-size map', () => {
      expect(run(sec('{rows.map((r) => <p key={r}>{`This is a long piece of authored text (${1}).`}</p>)}')).g).toBe(1);
    });
    it('a template that is not prose in an unknown-size map stays clean', () => {
      expect(run(sec('{rows.map((r) => <p key={r}>{`${rows.length}`}</p>)}')).g).toBe(0);
    });
    it('literals joined with + read as one text in an unknown-size map', () => {
      expect(run(sec("{rows.map((r) => <p key={r}>{'word1 word2' + ' word3 word4'}</p>)}")).g).toBe(1);
    });
    it('short literals joined with + that are not prose in an unknown-size map stay clean', () => {
      expect(run(sec("{rows.map((r) => <p key={r}>{'ab' + 'cd'}</p>)}")).g).toBe(0);
    });
    it('a long + chain is measured whole, not as a depth gap', () => {
      expect(run(view(`return <FirstUseState title="S" body={t('long')${" + ''".repeat(14)}} />;`))).toMatchObject({ e: 2, g: 0 });
    });
    it('a record in a const handed to a prop the rule does not know keeps the gap inside it', () => {
      expect(cfgProp("const cfg = { body: fmt(t('long')) };\n").g).toBeGreaterThan(0);
    });
    it('an array of records handed to a prop the rule does not know keeps the gap inside it', () => {
      expect(run(view("return <DetailPage header={{ title: \"D\" }} mystery={[{ body: fmt(t('long')) }]} />;")).g).toBeGreaterThan(0);
    });
    it('a record with only short text handed to an unknown prop stays clean', () => {
      expect(cfgProp("const cfg = { body: 'short' };\n").g).toBe(0);
    });
    it('a spread in a record is read, so the gap in it counts', () => {
      expect(cfgProp('const cfg = { ...fmt(k) };\n').g).toBeGreaterThan(0);
    });
    it('a computed key in a record is a gap', () => {
      expect(cfgProp('const cfg = { [k]: 1 };\n').g).toBeGreaterThan(0);
    });
    it('a method in a record is a gap', () => {
      expect(cfgProp('const cfg = { get a() { return 1; } };\n').g).toBeGreaterThan(0);
    });
  });

  describe('a default applies when the value is undefined', () => {
    const copy = 'function Copy({ text = strings.long }: any) { return <p>{text}</p>; }\n';
    const sec = (inner: string, pre: string) => run(view(`return <Section title="s">${inner}</Section>;`, pre));
    it('a prop given as undefined falls back to the signature default', () => {
      expect(sec('<Copy text={undefined} />', copy)).toMatchObject({ e: 2, g: 0 });
    });
    it('a prop given as maybe undefined falls back to the signature default', () => {
      expect(sec("<Copy text={c ? 'x' : undefined} />", copy)).toMatchObject({ e: 2, g: 0 });
    });
    it('a prop given a value does not use the default', () => {
      expect(sec('<Copy text="given text" />', copy)).toMatchObject(clean);
    });
    it('a destructuring default applies to an undefined value', () => {
      expect(run(view('const { text = strings.long } = { text: undefined }; return <FirstUseState title="S" body={text} />;'))).toMatchObject({ e: 2, g: 0 });
    });
    it('a destructuring default does not apply to a given value', () => {
      expect(run(view("const { text = strings.long } = { text: 'given' }; return <FirstUseState title=\"S\" body={text} />;"))).toMatchObject(clean);
    });
    const pick = 'function pick({ text }: any = { text: strings.long }) { return text; }\n';
    it('a helper called without its argument uses the parameter-level default', () => {
      expect(run(view('return <FirstUseState title="S" body={pick()} />;', pick))).toMatchObject({ e: 2, g: 0 });
    });
    it('a helper called with undefined uses the parameter-level default', () => {
      expect(run(view('return <FirstUseState title="S" body={pick(undefined)} />;', pick))).toMatchObject({ e: 2, g: 0 });
    });
    it('a helper called with an object does not use the parameter-level default', () => {
      expect(run(view("return <FirstUseState title=\"S\" body={pick({ text: 'given' })} />;", pick))).toMatchObject(clean);
    });
    it('a helper called with undefined uses an identifier parameter default', () => {
      const one = 'function one(a = strings.long) { return a; }\n';
      expect(run(view('return <FirstUseState title="S" body={one(undefined)} />;', one))).toMatchObject({ e: 2, g: 0 });
    });
    it('a component is always handed a props object, so its whole-argument default is never the text of a render', () => {
      const body = 'function Body({ text }: any = { text: strings.long }) { return <p>{text}</p>; }\nfunction Props(props: any = { text: strings.long }) { return <p>{props.text}</p>; }\n';
      expect(run(view('return <Section title="s"><Body /><Props /></Section>;', body))).toMatchObject(clean);
    });
  });

  describe('a translator the FAQ builder declares itself is not the page translator', () => {
    const faq = (decl: string) => scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(100) }, { 'pages/x/faq.ts': `export function pageFaq(${decl}) { const items = [{ id: 'x', q: t('faq.x.q'), a: t('faq.x.a') }]; return { items, byId: { x: items[0] } }; }` });
    it('a local t that wraps another translator is followed as a function, so the answer is a gap', () => {
      const r = scan('export function V() { return null; }', { 'faq.x.q': 'Why?', 'faq.x.a': chars(100) }, { 'pages/x/faq.ts': "export function pageFaq(p: any) { const t = (k: string) => p.translate(k); const items = [{ id: 'x', q: t('faq.x.q'), a: t('faq.x.a') }]; return { items, byId: { x: items[0] } }; }" });
      expect(gaps(r).length).toBeGreaterThan(0);
    });
    it('the translator parameter of pageFaq is still the page table', () => {
      const r = faq('t: (k: string) => string');
      expect([explain(r).length, gaps(r).length]).toEqual([0, 0]);
    });
  });

  describe('data props are not text props', () => {
    for (const prop of ['isDisabled', 'hasError', 'canSave', 'shouldFocus', 'readOnly', 'disabled', 'isExpanded', 'expanded', 'maxValue', 'minValue', 'returnFocus', 'closeFocus', 'list']) {
      it(`${prop} passed an expression the rule cannot read is not authored text`, () => {
        expect(run(view(`return <Section title="s" ${prop}={fmt(k)} />;`)).g).toBe(0);
      });
    }
    it('a prop the rule does not know still gaps', () => {
      expect(run(view('return <Section title="s" mystery={fmt(k)} />;')).g).toBe(1);
    });
    it('the kit\'s PauseBand, a notice whose words are the kit\'s own, is not authored text, and the page text it is handed (the computer\'s name, put into a kit string) is not a gap', () => {
      const pre = "import { PauseBand, Stack } from '@kit';\n";
      expect(run(view('return <Section title="s" mystery={c ? <PauseBand computer={fmt(k)} /> : undefined} />;', pre)).g).toBe(0);
      expect(run(view('return <Section title="s" mystery={c ? <PauseBand store={k} computer={c.computerName} /> : undefined} />;', pre)).g).toBe(0);
    });
    it('the same prop holding any other element still gaps (the token covers PauseBand alone)', () => {
      const pre = "import { PauseBand, Stack } from '@kit';\n";
      expect(run(view('return <Section title="s" mystery={c ? <Stack>{fmt(k)}</Stack> : undefined} />;', pre)).g).toBe(1);
      expect(run(view('return <Section title="s" mystery={c ? <Stack><PauseBand computer={fmt(k)} />{fmt(k)}</Stack> : undefined} />;', pre)).g).toBe(1);
    });
    it('page text handed to PauseBand is a notice\'s name, not explanation: long prose there adds nothing to the region\'s count, where the same prose in a paragraph does', () => {
      const pre = "import { PauseBand } from '@kit';\n";
      const page = (inner: string) => view(`return <Section title="s" description={t('short')}>${inner}</Section>;`, pre);
      expect(run(page("<p>{t('long')}</p>")).e).toBeGreaterThan(0);
      expect(run(page("<PauseBand computer={t('long')} />")).e).toBe(0);
      expect(run(page(''))).toEqual(run(page("<PauseBand computer={t('long')} />")));
    });
  });
});

describe('the overlay FAQ descriptor faq={{ item, label }} (kit/overlays/Dialog.tsx DialogFaq)', () => {
  // the kit renders the descriptor as <FaqLink item={faq.item}>{faq.label}</FaqLink>: the label is a link label and the item a reference, so
  // only that exact shape on the three overlays that take it is read as a link; any other shape or component stays a prop the rule does not know
  const body = (inner: string) => `export function V() { ${T} return ${inner}; }`;
  const table = { short: chars(40), long: chars(300), q: 'Why?' };
  const run = (page: string) => {
    const r = scan(page, table);
    return { e: explain(r).length, g: gaps(r).length };
  };
  for (const kind of ['Dialog', 'ConfirmDialog', 'DangerConfirm']) {
    it(`a ${kind} with faq={{ item, label }} and a long label is clean`, () => {
      expect(run(body(`<${kind} overlayId="d" isOpen title="t" body={t('short')} faq={{ item: x, label: t('long') }} />`))).toEqual({ e: 0, g: 0 });
    });
    it(`a ${kind} with the shorthand faq={{ item, label }} is clean`, () => {
      const page = `export function V() { ${T} const item = x; const label = t('long'); return <${kind} overlayId="d" isOpen title="t" body={t('short')} faq={{ item, label }} />; }`;
      expect(run(page)).toEqual({ e: 0, g: 0 });
    });
    it(`a ${kind} whose faq shows only in some states (a conditional between faq={{ item, label }} and nothing) is clean`, () => {
      expect(run(body(`<${kind} overlayId="d" isOpen title="t" body={t('short')} faq={c ? { item: x, label: t('long') } : undefined} />`))).toEqual({ e: 0, g: 0 });
      expect(run(body(`<${kind} overlayId="d" isOpen title="t" body={t('short')} faq={c ? null : { item: x, label: t('long') }} />`))).toEqual({ e: 0, g: 0 });
    });
  }
  it('control: a conditional whose other branch is not nothing keeps the gap (two descriptors, or one and a call)', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? { item: x, label: t('long') } : { item: y, label: t('long') }} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? { item: x, label: t('q') } : pick(t('long'))} />`)).g).toBe(1);
  });
  it('control: a conditional between nothing and something that is not the literal keeps the gap', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? pick(t('long')) : undefined} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? { item: x, label: t('q'), note: t('long') } : undefined} />`)).g).toBe(1);
  });
  it('control: a nested conditional or a ternary chain keeps the gap (only one level, its branch the literal itself)', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? (d ? { item: x, label: t('long') } : undefined) : undefined} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? undefined : d ? { item: x, label: t('long') } : null} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? null : (d ? undefined : { item: x, label: t('long') })} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? (d ? { item: x, label: t('long') } : { item: y, label: t('long') }) : undefined} />`)).g).toBe(1);
  });
  it('control: JSX in the condition keeps the gap (the conditional is read as the literal only when its condition renders nothing)', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={<b>{t('long')}</b> ? { item: x, label: t('q') } : undefined} />`)).g).toBeGreaterThan(0);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={<b>{t('long')}</b> ? null : { item: x, label: t('q') }} />`)).g).toBeGreaterThan(0);
  });
  it('control: `c && { item, label }` is not read as the descriptor (only the conditional with nothing is)', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c && { item: x, label: t('long') }} />`)).g).toBe(1);
  });
  it('control: in a conditional, an extra key, a spread or a computed key beside authored text keeps the gap in either branch order', () => {
    for (const lit of [`{ item: x, label: t('q'), note: t('long') }`, `{ item: x, label: t('long'), ...d }`, `{ item: x, [k]: t('long') }`]) {
      expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? ${lit} : undefined} />`)).g).toBeGreaterThan(0);
      expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={c ? null : ${lit}} />`)).g).toBeGreaterThan(0);
    }
  });
  it('control: a key other than item and label keeps the gap', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={{ item: x, label: t('q'), note: t('long') }} />`)).g).toBe(1);
  });
  it('control: a spread in the descriptor keeps the gap, with no authored text anywhere (the spread itself is what gaps)', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={{ item: x, label: y, ...d }} />`)).g).toBe(1);
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={{ item: x, ...d }} />`)).g).toBe(1);
  });
  it('control: a computed key is not read as label, so a short label under one stays unknown text', () => {
    // a computed key with no authored text is silent in the unknown-prop probe; what matters is that its text is never sunk as the link label
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={{ item: x, ['label']: t('q') }} />`)).g).toBe(1);
  });
  it('control: a descriptor that is not an object literal keeps the gap', () => {
    expect(run(body(`<ConfirmDialog overlayId="d" isOpen title="t" body={t('short')} faq={pick(t('long'))} />`)).g).toBe(1);
  });
  it('control: faq={{ item, label }} on a component that is not one of the three overlays keeps the gap', () => {
    expect(run(body(`<Section title="s" faq={{ item: x, label: t('long') }} />`)).g).toBe(1);
  });
});

describe('the page FAQ on an archetype root faq={...} (its answers are measured in faq.ts)', () => {
  // pages/ai/tab.tsx renders the Models page (a SettingsPage with the AI FAQ) inside its own main region: the FAQ is the page's, counted in
  // faq.ts against faqBudget, so the host region must not read it as text in a prop it does not know. Only an explicit faq={...} on an
  // archetype root whose expression is a direct call of the page's own pageFaq (imported from its ./faq) takes that exemption.
  const table = { 'faq.a.q': 'Why?', 'faq.a.a': chars(300), short: chars(40) };
  const faqTs = (dir: string) => ({ [`pages/${dir}/faq.ts`]: "import type { FaqItem } from '@kit';\ntype T = (k: string) => string;\nexport function pageFaq(t: T): { items: FaqItem[]; byId: Record<'a', FaqItem> } {\n  const items = [{ id: 'a', q: t('faq.a.q'), a: t('faq.a.a') }];\n  return { items, byId: { a: items[0]! } };\n}\n" });
  const files = { ...faqTs('x'), ...faqTs('y'), 'pages/y/strings.en.json': JSON.stringify(table) };
  const own = "import { pageFaq } from './faq';\n";
  const inline = "{ items: [{ id: 'a', q: t('faq.a.q'), a: t('faq.a.a') }] }";
  // only the view: faq.ts's own answer regions are not what is under test here
  const run = (page: string) => {
    const r = scan(page, table, files).filter((h) => h.file === 'pages/x/view.tsx');
    return { e: explain(r).length, g: gaps(r).length };
  };
  const hosted = (root: string, faq: string, pre = own) => `${pre}function Models() { ${T} return <${root} header={{ title: 't' }} ${faq} sections={[]} />; }\nexport function V() { return <DetailPage header={{ title: 'h' }}><Models /></DetailPage>; }`;
  for (const root of ['SettingsPage', 'DetailPage']) {
    it(`a ${root} given pageFaq(t) from ./faq, rendered inside another page's region, is clean`, () => {
      expect(run(hosted(root, 'faq={pageFaq(t)}'))).toEqual({ e: 0, g: 0 });
    });
  }
  it('a SettingsPage root given pageFaq(t) from ./faq on its own is clean', () => {
    expect(run(`${own}export function V() { ${T} return <SettingsPage header={{ title: 't' }} faq={pageFaq(t)} sections={[]} />; }`)).toEqual({ e: 0, g: 0 });
  });
  // Only the call itself, written in the attribute. A name that holds the result can be changed before the page reads it, and a
  // conditional is not the builder form the conformance holds to faq.ts, so both stay text in a prop the rule does not know
  it('control: a const holding pageFaq(t) whose items are replaced before the root reads it keeps the gap', () => {
    expect(run(`${own}export function V() { ${T} const f = pageFaq(t); f.items = ${inline}.items; return <SettingsPage header={{ title: 't' }} faq={f} sections={[]} />; }`).g).toBe(1);
  });
  it('control: a conditional between pageFaq(t) and undefined keeps the gap', () => {
    expect(run(hosted('SettingsPage', 'faq={t ? pageFaq(t) : undefined}')).g).toBe(1);
  });
  it('control: a conditional between pageFaq(t) and void 0 keeps the gap', () => {
    expect(run(hosted('SettingsPage', 'faq={t ? pageFaq(t) : void 0}')).g).toBe(1);
  });
  it('control: a const holding a conditional between pageFaq(t) and null keeps the gap', () => {
    expect(run(`${own}export function V() { ${T} const f = t ? pageFaq(t) : null; return <SettingsPage header={{ title: 't' }} faq={f} sections={[]} />; }`).g).toBe(1);
  });
  it('a spread faq that a later faq={pageFaq(t)} overrides is clean (the attribute wins)', () => {
    expect(run(`${own}export function V() { ${T} return <SettingsPage header={{ title: 't' }} {...{ faq: ${inline} }} faq={pageFaq(t)} sections={[]} />; }`)).toEqual({ e: 0, g: 0 });
  });
  it('control: faq={pageFaq(t)} that a later spread overrides keeps the gap (the spread wins)', () => {
    expect(run(`${own}export function V() { ${T} return <SettingsPage header={{ title: 't' }} faq={pageFaq(t)} {...{ faq: ${inline} }} sections={[]} />; }`).g).toBe(1);
  });
  it('control: an inline-object faq={...} on a hosted SettingsPage root keeps the gap', () => {
    expect(run(hosted('SettingsPage', `faq={${inline}}`)).g).toBe(1);
  });
  it('control: pageFaq from another page\'s faq.ts on a hosted SettingsPage root keeps the gap', () => {
    expect(run(hosted('SettingsPage', 'faq={pageFaq(t)}', "import { pageFaq } from '../y/faq';\n")).g).toBe(1);
  });
  // the FAQ conformance holds only an explicit faq={...} to faq.ts; a faq a spread supplies is not checked there
  it('control: a faq an inline spread supplies to a SettingsPage root keeps the gap', () => {
    expect(run(`export function V() { ${T} return <SettingsPage header={{ title: 't' }} {...{ faq: ${inline} }} sections={[]} />; }`).g).toBe(1);
  });
  it('control: pageFaq(t) a spread object supplies to a hosted TablePage root keeps the gap', () => {
    expect(run(`import { TablePage } from '@kit';\n${own}function Models() { ${T} const p = { faq: pageFaq(t) }; return <TablePage header={{ title: 't' }} {...p} />; }\nexport function V() { return <DetailPage header={{ title: 'h' }}><Models /></DetailPage>; }`).g).toBe(1);
  });
  it('control: an inline-object faq={...} on a Section keeps the gap', () => {
    expect(run(`export function V() { ${T} return <Section title="s" description={t('short')} faq={${inline}} />; }`).g).toBe(1);
  });
  it('control: an inline-object faq={...} on a Stack inside a page keeps the gap', () => {
    expect(run(`export function V() { ${T} return <DetailPage header={{ title: 'h' }}><Stack faq={${inline}} /></DetailPage>; }`).g).toBe(1);
  });
});

describe('a pane state on ListDetailPage and DetailPage: state={{ kind, title, body }}', () => {
  // The kit draws it as an EmptyState, so an inline object is a region of its own: its body counts as an EmptyState's does, its
  // title and action are labels. A state the rule cannot see into stays a prop it does not know, and only these layouts qualify.
  const table = { title: chars(300), short: chars(100), long: chars(300), go: chars(40) };
  const run = (inner: string) => {
    const r = scan(`export function V(p: any) { ${T} return ${inner}; }`, table);
    return { e: explain(r).length, g: gaps(r).length };
  };
  for (const [name, open, close] of [['ListDetailPage', '<ListDetailPage list={null} detail={null} ', ' />'], ['DetailPage', "<DetailPage header={{ title: 'h' }} ", '>{null}</DetailPage>']] as const) {
    it(`${name}: a short body and a long title are clean, with no gap`, () => {
      expect(run(`${open}state={{ kind: 'notHere', title: t('title'), body: t('short') }}${close}`)).toEqual({ e: 0, g: 0 });
    });
    it(`${name}: an action is a label, not a gap`, () => {
      expect(run(`${open}state={{ kind: 'notHere', title: t('short'), body: t('short'), action: { id: 'a', label: t('go'), onPress: () => {} } }}${close}`)).toEqual({ e: 0, g: 0 });
    });
    it(`mutant: ${name} with a 300 character body is over budget, as an EmptyState's would be`, () => {
      expect(run(`${open}state={{ kind: 'notHere', title: t('short'), body: t('long') }}${close}`)).toEqual({ e: 2, g: 0 });
    });
    it(`control: ${name} with a spread in its state is a gap`, () => {
      expect(run(`${open}state={{ ...p, body: t('short') }}${close}`).g).toBe(1);
    });
  }
  it('control: the same inline state on another component keeps the gap', () => {
    expect(run(`<DetailPage header={{ title: 'h' }}><Stack state={{ kind: 'notHere', title: t('short'), body: t('short') }} /></DetailPage>`).g).toBe(1);
  });
  const runIn = (pre: string, inner: string) => {
    const r = scan(`export function V() { ${T} ${pre} return ${inner}; }`, table);
    return { e: explain(r).length, g: gaps(r).length };
  };
  const STATE = "{ kind: 'notHere' as const, title: t('title'), body: t('short') }";
  for (const [name, open, close] of [['ListDetailPage', '<ListDetailPage list={null} detail={null} ', ' />'], ['DetailPage', "<DetailPage header={{ title: 'h' }} ", '>{null}</DetailPage>']] as const) {
    // A spread is a gap even when the rule could read the object: it follows the initializer, not a later write to a property.
    it(`control: ${name} with a spread of an object the rule can read is a gap`, () => {
      expect(runIn(`const s = ${STATE};`, `${open}state={{ ...s }}${close}`).g).toBe(1);
    });
    it(`control: ${name} with a spread of an object mutated to a long body is a gap`, () => {
      expect(runIn(`const s = ${STATE}; s.body = t('long');`, `${open}state={{ ...s }}${close}`).g).toBe(1);
    });
    it(`control: ${name} with its state in a variable is a gap`, () => {
      expect(runIn(`const s = ${STATE};`, `${open}state={s}${close}`).g).toBe(1);
    });
  }
});

// Sibling `cond && X` children whose conditions cannot hold together in one render
// (the same value compared with two different literals, or a value and its negation, in any conjunct) are alternatives: their text
// in the region counts once, by the longest. Regions they create are judged on their own, as before: each overlay keeps its hits
// and gaps. Anything else (other values, the same literal, a call, an index) still sums.
describe('explain: sibling conditionals on exclusive conditions are alternatives', () => {
  const sec = (sig: string, kids: string) => `export function V(${sig}) { ${T} return <Section title="s" description={<>${kids}</>}><Button>go</Button></Section>; }`;
  const ab = { a: chars(100), b: chars(100), c: chars(100) };
  it('mutant: two siblings on `k === "a"` / `k === "b"` take their max (100), not their sum (200, 1 hit before the rule)', () => {
    const page = sec("{ k }: { k: string }", "{k === 'a' && <p>{t('a')}</p>}{k === 'b' && <p>{t('b')}</p>}");
    expect(explain(scan(page, ab))).toEqual([]);
    expect(explain(scan(page, { a: chars(226), b: chars(100) }))).toHaveLength(2); // the longest alone still scores
  });
  it('a literal on either side, numbers, a no-substitution template and an optional member chain are read alike', () => {
    expect(explain(scan(sec("{ d }: { d?: { kind: string } }", "{d?.kind === 'a' && <p>{t('a')}</p>}{'b' === d?.kind && <p>{t('b')}</p>}"), ab))).toEqual([]);
    expect(explain(scan(sec("{ n }: { n: number }", '{n === 1 && <p>{t(\'a\')}</p>}{n === 2 && <p>{t(\'b\')}</p>}'), ab))).toEqual([]);
    expect(explain(scan(sec("{ k }: { k: string }", "{k === `a` && <p>{t('a')}</p>}{k === `b` && <p>{t('b')}</p>}"), ab))).toEqual([]);
  });
  it('a props type (inline, named or an interface) is not a use of the member root', () => {
    const kids = "{d.kind === 'a' && <p>{t('a')}</p>}{d.kind === 'b' && <p>{t('b')}</p>}";
    const body = `${T} return <Section title="s" description={<>${kids}</>}><Button>go</Button></Section>; }`;
    expect(explain(scan(`export function V({ d }: { d: { kind: string } }) { ${body}`, ab))).toEqual([]);
    expect(explain(scan(`type P = { d: { kind: string } };\nexport function V({ d }: P) { ${body}`, ab))).toEqual([]);
    expect(explain(scan(`export function V({ d }: { d: { kind: string } }) { interface Q { d: string } type R = { d: Q }; ${body}`, ab))).toEqual([]);
  });
  it('`k && X` and `!k && Y` are alternatives; so is a contradiction in any conjunct of a longer guard', () => {
    expect(explain(scan(sec("{ k }: { k: boolean }", "{k && <p>{t('a')}</p>}{!k && <p>{t('b')}</p>}"), ab))).toEqual([]);
    expect(explain(scan(sec("{ k, o }: { k: string; o: boolean }", "{o && k === 'a' && <p>{t('a')}</p>}{k === 'b' && <p>{t('b')}</p>}"), ab))).toEqual([]);
  });
  it('three pairwise-exclusive siblings count once (the longest); an unconditional sibling still adds', () => {
    expect(explain(scan(sec("{ k }: { k: string }", "{k === 'a' && <p>{t('a')}</p>}{k === 'b' && <p>{t('b')}</p>}{k === 'c' && <p>{t('c')}</p>}"), ab))).toEqual([]);
    expect(explain(scan(sec("{ k }: { k: string }", "{k === 'a' && <p>{t('a')}</p>}<p>{t('c')}</p>{k === 'b' && <p>{t('b')}</p>}"), { ...ab, c: chars(51) }))).toHaveLength(1); // 100 + 51
  });
  it('control: guards that can hold together still sum (other values, the same literal, a call, an index, a loose ==)', () => {
    for (const [sig, kids] of [
      ['{ k, j }: { k: string; j: string }', "{k === 'a' && <p>{t('a')}</p>}{j === 'b' && <p>{t('b')}</p>}"],
      ['{ k }: { k: string }', "{k === 'a' && <p>{t('a')}</p>}{k === 'a' && <p>{t('b')}</p>}"],
      ['{ f }: { f: () => string }', "{f() === 'a' && <p>{t('a')}</p>}{f() === 'b' && <p>{t('b')}</p>}"],
      ['{ k }: { k: string[] }', "{k[0] === 'a' && <p>{t('a')}</p>}{k[0] === 'b' && <p>{t('b')}</p>}"],
      ['{ k }: { k: string }', "{k == 'a' && <p>{t('a')}</p>}{k == 'b' && <p>{t('b')}</p>}"],
      ['{ k, j }: { k: boolean; j: boolean }', "{k && <p>{t('a')}</p>}{!j && <p>{t('b')}</p>}"],
    ] as const) {
      expect(explain(scan(sec(sig, kids), ab)), kids).toHaveLength(1); // 200
    }
  });
  it('a group whose third sibling is not exclusive with the first is scored as a pair plus a sibling', () => {
    const kids = "{k === 'a' && <p>{t('a')}</p>}{k === 'b' && <p>{t('b')}</p>}{j && <p>{t('c')}</p>}";
    expect(explain(scan(sec('{ k, j }: { k: string; j: boolean }', kids), ab))).toHaveLength(1); // max(a, b) + c = 200
  });
  it('regions the alternatives create are judged on their own: each overlay keeps its hits and gaps', () => {
    const page = `export function V({ k, g }: { k: string; g: string }) { ${T} return <div>{k === 'a' && <ConfirmDialog overlayId="da" isOpen title="t" body={t('a')} />}{k === 'b' && <ConfirmDialog overlayId="db" isOpen title="t" body={<>{t('b')}{t(g)}</>} />}</div>; }`;
    const hits = scan(page, { a: chars(300), b: chars(226) });
    expect(explain(hits).filter((h) => h.scope === 'overlay:da')).toHaveLength(2);
    expect(explain(hits).filter((h) => h.scope === 'overlay:db')).toHaveLength(2);
    expect(gaps(hits).filter((h) => h.scope === 'overlay:db')).toHaveLength(1);
  });
  it('the longest alternative is scored with its whole length and no merged space at its seams, so it is never undercounted at its own place', () => {
    // after 147 characters, `k === 'b'` renders 'z' + ' a ' + 'q' = 152 (no seam merges with 'z' or 'q'): 1 hit
    const page = sec('{ k }: { k: string }', "{t('p')}{k === 'a' && 'a'}{'z'}{k === 'b' && ' a '}{'q'}");
    expect(explain(scan(page, { p: chars(147) }))).toHaveLength(1);
  });
  it('a later alternative\'s slot is a barrier, so the text around it never merges a space across it', () => {
    // with `k === 'b'`: 144 + ' z ' + 'BB' + ' n' = 151 rendered characters, 1 hit (a merge across the skipped slot scored 150)
    expect(explain(scan(sec('{ k }: { k: string }', "{t('p')}{k === 'a' && 'AA'}{' z '}{k === 'b' && 'BB'}{' n'}"), { p: chars(144) }))).toHaveLength(1);
    expect(explain(scan(sec('{ k }: { k: string }', "{t('p')}{k === 'a' && <b>AA</b>} z {k === 'b' && <b>BB</b>} n"), { p: chars(144) }))).toHaveLength(1);
    // the longest in a later slot is scored at the first slot with no merged space: 142 + 'x ' + ' BB ' + ' y' + 'q' + 'r' = 152
    // (it renders 151 at its own place); merging its spaces at the first slot would score 150
    expect(explain(scan(sec('{ k }: { k: string }', "{t('p')}{'x '}{k === 'a' && 'A'}{' y'}{'q'}{k === 'b' && ' BB '}{'r'}"), { p: chars(142) }))).toHaveLength(1);
  });
  it('a key must read one value at every sibling: a written let or parameter, a written or escaping member root, a deeper chain, an import, an object with an accessor or a `new` value still sum', () => {
    const two = "{K === 'a' && <p>{t('a')}</p>}{K === 'b' && <p>{t('b')}</p>}";
    const at = (k: string) => two.split('K').join(k);
    const cases: [string, string, string][] = [
      ['{ p }: { p: string }', "let k = p; const flip = () => { k = 'b'; return ''; };", at('k')],
      ['{ k }: { k: string }', "if (k === 'x') k = 'a';", at('k')],
      ['{ d }: { d: { kind: string } }', "const flip = () => { d.kind = 'b'; return ''; };", at('d.kind')],
      ['{ d }: { d: { kind: string } }', 'const e = d;', at('d.kind')],
      ['{ d, f }: { d: { kind: string }; f: (x: unknown) => string }', '', `{f(d)}${at('d.kind')}`],
      ['{ q }: { q: { data: { kind: string } } }', '', at('q.data.kind')],
      ['{ n }: { n: number }', "const o = { get kind() { n += 1; return n % 2 ? 'a' : 'b'; } };", at('o.kind')],
      ['{ n }: { n: number }', 'const o = new Box(n);', at('o.kind')],
    ];
    for (const [sig, pre, kids] of cases) {
      const page = `export function V(${sig}) { ${T} ${pre} return <Section title="s" description={<>${kids}</>}><Button>go</Button></Section>; }`;
      expect(explain(scan(page, ab)), `${pre} ${kids}`).toHaveLength(1); // 200
    }
  });
  const hooked = (imp: string, pre: string) => `${imp}\nexport function V({ d, go, f }: { d: { kind: string }; go: (x: unknown) => void; f: (x: unknown) => unknown }) { ${T} ${pre} return <Section title="s" description={<>{d.kind === 'a' && <p>{t('a')}</p>}{d.kind === 'b' && <p>{t('b')}</p>}</>}><Button onPress={() => { const e = d; e.kind = 'b'; go(e); }}>go</Button></Section>; }`;
  it('code that never runs between two siblings does not count: an event handler, a React effect callback, a React hook dependency list of plain reads', () => {
    const pre = "useEffect(() => { d.kind = 'z'; }, [d]); const v = useMemo(() => 1, [d, d.kind]); React.useLayoutEffect(() => { go(d); }, [d]);";
    expect(explain(scan(hooked("import React, { useEffect, useMemo } from 'react';", pre), ab))).toEqual([]);
  });
  it('a dependency entry that writes or calls, and a same-named hook not imported from react, are looked into: the siblings sum', () => {
    for (const [imp, pre] of [
      ["import { useMemo } from 'react';", "useMemo(() => null, [d.kind = 'b']);"],
      ["import { useMemo } from 'react';", 'useMemo(() => null, [f(d)]);'],
      ["import { useEffect } from './sync';", "useEffect(() => { d.kind = 'b'; }, []);"],
      ["import { useMemo } from './sync';", 'useMemo(() => null, [d]);'],
      ['', "useEffect(() => { d.kind = 'b'; }, []);"],
    ] as const) {
      expect(explain(scan(hooked(imp, pre), ab)), `${imp} ${pre}`).toHaveLength(1); // 200
    }
  });
  it('a gap inside an alternative is kept', () => {
    const page = sec('{ k, g }: { k: string; g: string }', "{k === 'a' && <p>{t('a')}</p>}{k === 'b' && <p>{t(g)}</p>}");
    expect(gaps(scan(page, ab))).toHaveLength(1);
  });
});

describe('the KS1 kit parts and the kit pause description hold readable text', () => {
  // Lengths chosen at the step boundaries (budget 150, step 75): 100 alone is 0 hits, 100 + 126 = 226 is 2, 200 is 1,
  // 226 is 2, 200 + 226 = 426 is 4. So each reader (a field, a push, a branch kept as the longer one) changes the count.
  const L: Record<string, string> = { long: chars(300), short: chars(100), a: chars(100), b: chars(126), c: chars(200), d: chars(226) };
  const KS1: Record<string, string> = {
    'kit/index.ts': `${KIT['kit/index.ts']}\nexport * from './data/Steps';\nexport * from './agent/Pause';`,
    'kit/data/Steps.tsx': 'export function StepList(p: any) { return <ol />; }\nexport function Why(p: any) { return <div>{p.children}</div>; }',
    'kit/agent/Pause.tsx': 'export function usePauseDescription(c: string) { return c; }',
    'kit/agent/Pause.strings.en.json': JSON.stringify({ 'pause.description': chars(300) }),
    'pages/bots/data.ts': 'export function useBotModelLabel(k: string, c: unknown) { return k; }\nexport function useBotModelLabels(r: unknown) { return r; }',
    'pages/x/data.ts': "export function useBotModelLabel(k: string, c: unknown) { return 'A label the rule cannot see'; }\nexport function useOther(k: string) { return k; }",
  };
  const PRE = "import { StepList, Why, usePauseDescription } from '@kit';\nimport { useBotModelLabel } from '../bots/data';\nimport { useBotModelLabel as otherLabel, useOther } from './data';\n";
  const view = (body: string) => `${PRE}export function V({ c, k, x, rows }: any) { ${T} ${body} }`;
  const run = (body: string) => {
    const hits = scan(view(body), L, KS1);
    return { e: explain(hits).length, g: gaps(hits).length };
  };
  const inBox = (inner: string) => `return <Disclosure title="T">${inner}</Disclosure>;`;
  const list = (groups: string, pre = '') => `${pre} ${inBox(`<StepList label="S" groups={${groups}} />`)}`;

  it('the boundary lengths score as planned in a plain region', () => {
    expect(run(inBox(`{t('a')}`))).toEqual({ e: 0, g: 0 });
    expect(run(inBox(`{t('c')}`))).toEqual({ e: 1, g: 0 });
    expect(run(inBox(`{t('a')}{t('b')}`))).toEqual({ e: 2, g: 0 });
    expect(run(inBox(`{t('d')}`))).toEqual({ e: 2, g: 0 });
    expect(run(inBox(`{t('c')}{t('d')}`))).toEqual({ e: 4, g: 0 });
  });

  it("StepList: an item's text and its note each count (either alone stays under a hit); where, open, id and act are labels", () => {
    expect(run(list(`[{ items: [{ text: t('a'), note: t('b') }] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list(`[{ items: [{ text: t('b'), note: t('a') }] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list(`[{ items: [{ text: t('a') }, { text: t('b') }] }]`))).toEqual({ e: 2, g: 0 });
    const labels = `[{ where: t('long'), open: { label: t('long'), url: 'u' }, items: [{ id: 'a', text: 'Send it', act: <Button>{t('long')}</Button> }] }]`;
    expect(run(list(labels))).toEqual({ e: 0, g: 0 });
  });

  it('StepList: every push of a const list counts once (two pushes sum; one alone stays under a hit)', () => {
    expect(run(list('groups', "const items: any[] = []; items.push({ text: t('a') }); items.push({ text: t('b') }); const groups = [{ items }];"))).toEqual({ e: 2, g: 0 });
    expect(run(list('groups', "const items: any[] = [{ text: t('a') }]; if (c) items.push({ text: t('b') }); const groups = [{ items }];"))).toEqual({ e: 2, g: 0 });
    expect(run(list('groups', "const items: any[] = []; items.push({ text: t('a') }); const groups = [{ items }]; groups.push({ items: [{ text: t('b') }] });"))).toEqual({ e: 2, g: 0 });
    expect(run(list('groups', "const items: any[] = []; items.push(...[{ text: t('a') }, { text: t('b') }]); const groups = [{ items }];"))).toEqual({ e: 2, g: 0 });
  });

  it('StepList: exclusive alternatives count as the longer one, never the sum (an entry, an array spread, an object spread)', () => {
    expect(run(list(`[{ items: [c ? { text: t('c') } : { text: t('d') }] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list(`[{ items: [...(c ? [{ text: t('c') }] : [{ text: t('d') }])] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list(`[{ items: [{ ...(c ? { text: t('c') } : { text: t('d') }) }] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list('groups', "const items: any[] = []; items.push(k ? { text: t('c') } : { text: t('d') }); const groups = [{ items }];"))).toEqual({ e: 2, g: 0 });
  });

  it('StepList: a list or entry the rule cannot follow is a gap, never a silent zero', () => {
    const items = (pre: string) => run(list('[{ items }]', pre));
    expect(items("const items = [{ text: 'A' }]; items[0].text = t('long');").g).toBe(1);
    expect(items("const items: any[] = []; const alias = items; alias.push({ text: t('long') });").g).toBe(1);
    expect(items("const items: any[] = []; fill(items);").g).toBe(1);
    expect(items("const items: any[] = []; items['push']({ text: t('long') });").g).toBe(1);
    expect(items("const m = 'push'; const items: any[] = []; (items as any)[m]({ text: t('long') });").g).toBe(1);
    expect(items("const items: any[] = []; if (c) items.push({ text: t('c') }); else items.push({ text: t('d') });").g).toBe(1);
    expect(items("const items: any[] = []; for (const r of rows) items.push({ text: t('a') });").g).toBe(1);
    expect(items("const items: any[] = []; rows.forEach(() => items.push({ text: t('a') }));").g).toBe(1);
    expect(run(list(`[{ items: [{ ...extra }] }]`, "const extra: any = {}; extra.text = t('long');")).g).toBe(1);
    expect(run(list(`[{ items: [{ ...extra }] }]`, "const extra: any = { text: 'A' }; const alias = extra; alias.text = t('long');")).g).toBe(1);
    expect(run(list(`[{ ...extra }]`, "const extra = { items: [] as any[] }; const alias = extra.items; alias.push({ text: t('long') });")).g).toBe(1);
    expect(run(list(`[extra]`, "const extra = { items: [] as any[] }; fill(extra.items);")).g).toBe(1);
    expect(run(list('[{ items }]', "const items: any[] = [{ text: 'A' }]; const first = items[0]; first.text = t('long');")).g).toBe(1);
  });

  it('StepList: a key set twice in an entry (a later one may replace it) is a gap; a conditional spread setting it in both branches is not', () => {
    expect(run(list(`[{ items: [{ ...{ text: t('long') }, text: 'Short' }] }]`)).g).toBe(1);
    expect(run(list(`[{ items: [{ text: t('long'), ...more }] }]`, "const more = { text: 'Short' };")).g).toBe(1);
    expect(run(list(`[{ items: [{ text: 'A', ...(c ? { note: t('c') } : { note: t('d') }) }] }]`))).toEqual({ e: 2, g: 0 });
    expect(run(list(`[{ items: [{ ...(c ? { text: t('c') } : { text: t('d') }), text: 'B' }] }]`)).g).toBe(1);
    expect(run(list('rowsOf(c)')).g).toBe(1);
    expect(run(list(`[{ items: [{ text: textOf(c) }] }]`)).g).toBe(1);
  });

  it("Why: its answer is a region of its own like a Disclosure's body; the question is its label and faq={{ item, label }} its link", () => {
    expect(run(`return <Why question={t('long')} faq={{ item: x, label: t('long') }}>{t('a')}</Why>;`)).toEqual({ e: 0, g: 0 });
    expect(run(`return <Why question="Q" faq={{ item: x, label: 'More' }}>{t('d')}</Why>;`)).toEqual({ e: 2, g: 0 });
    expect(run(`return <Why question="Q" faq={faqOf(c)}>{t('a')}</Why>;`).g).toBe(1);
  });

  it("usePauseDescription: read through the kit binding as the kit's one pause description; a local namesake is an ordinary call", () => {
    expect(run(`const help = usePauseDescription(c); return <SettingRow label="P" help={help} />;`)).toEqual(run(`return <SettingRow label="P" help={t('long')} />;`));
    expect(run(`return <SettingRow label="P" help={t('long')} />;`).e).toBeGreaterThan(0);
    const local = `${PRE.replace('usePauseDescription }', '}')}function usePauseDescription(c: string) { return c ? 'Paused' : 'On'; }\nexport function V({ c }: any) { ${T} return <SettingRow label="P" help={usePauseDescription(c)} />; }`;
    expect(gaps(scan(local, L, KS1))).toHaveLength(0);
    expect(explain(scan(local, L, KS1))).toHaveLength(0);
  });

  it('a data hook is nothing only through its own binding (pages/bots/data); a namesake from another file, or any other call, is a gap', () => {
    expect(run(`return <SettingRow label="M" help={useBotModelLabel(k, c)} />;`)).toEqual({ e: 0, g: 0 });
    expect(run(`return <SettingRow label="M" help={otherLabel(k, c)} />;`).g).toBe(1);
    const same = `import { useBotModelLabel } from './data';\nexport function V({ c, k }: any) { ${T} return <SettingRow label="M" help={useBotModelLabel(k, c)} />; }`;
    expect(gaps(scan(same, L, KS1))).toHaveLength(1);
    expect(run(`return <SettingRow label="M" help={useOther(k)} />;`).g).toBe(1);
  });

  it('switched off, the readers are gone with the rule (red half)', () => {
    const hits = scan(view(list(`[{ items: [{ text: t('long') }] }]`)), L, KS1, ['layout.explain']);
    expect(explain(hits)).toEqual([]);
  });
});

describe('an optional prop the call site does not pass renders nothing', () => {
  // A component's optional prop that its render site leaves out is undefined there: a call through it (`note?.(p)`), a member read
  // from it (`locked?.hint`) and anything built only on them show nothing at that site. Given at another site, it is read as before.
  const L: Record<string, string> = { long: chars(300), a: chars(75) };
  const pick = [
    'function Pick({ rows, note, locked, groupNote }: any) {',
    '  const sub = groupNote?.(rows);',
    '  return <Section title="s">{note?.(rows)}{locked?.hint}{locked?.copy.text}{sub && <span>{sub}</span>}',
    '    {rows.map((r: any) => <p key={r}>{note?.(r)}{locked?.hint}</p>)}</Section>;',
    '}\n',
  ].join('\n');
  const run = (site: string) => {
    const hits = scan(`${pick}export function V({ rows, c }: any) { ${T} return ${site}; }`, L);
    return { e: explain(hits).length, g: gaps(hits).length };
  };
  it('left out at the call site: no text and no gap (the map over unknown rows shows nothing authored)', () => {
    expect(run('<Pick rows={rows} />')).toEqual({ e: 0, g: 0 });
  });
  it('given, it is read as before (a member of a given object is not followed: a gap, never nothing)', () => {
    const r = run(`<Pick rows={rows} locked={{ hint: t('long') }} />`);
    expect(r.e + r.g).toBeGreaterThan(0);
  });
  it('given as something the rule cannot read, each read of it stays a gap', () => {
    expect(run('<Pick rows={rows} note={c} />').g).toBeGreaterThan(0);
    expect(run('<Pick rows={rows} groupNote={c} />').g).toBeGreaterThan(0);
  });
  it('a prop with a default is the default, not nothing', () => {
    const dflt = `function D({ note = (x: any) => x }: any) { return <Section title="s">{note?.(1)}</Section>; }\nexport function V() { return <D />; }`;
    expect(gaps(scan(dflt, L)).length).toBeGreaterThan(0);
  });
  it('a component nothing renders keeps its props unknown (a gap)', () => {
    const root = `export function R({ note }: any) { return <Section title="s">{note?.(1)}</Section>; }`;
    expect(gaps(scan(root, L)).length).toBeGreaterThan(0);
  });
});

// Anatomy debt moves with the code, never drops: a function a page split out into its own pure
// module (`X.pure.ts`, imported by that name) is followed like a function of the page file, so the text it returns still
// counts in the region that renders it; a function of any other module stays a gap; terminal siblings are not web anatomy.
describe('pure modules and terminal siblings', () => {
  const T2 = "const t = useStrings(strings);";
  const page = (from: string) => `import { why } from '${from}';\nexport function V() { ${T2} return <ConfirmDialog overlayId="d" isOpen title="t" body={why(t)} />; }`;
  const helper = 'export function why(t: (k: string) => string) { return t(\'b\'); }';

  it('a call into the page\'s pure module measures the text it returns, exactly as the same function inline', () => {
    const inline = scan(`function why(t: (k: string) => string) { return t('b'); }\nexport function V() { ${T2} return <ConfirmDialog overlayId="d" isOpen title="t" body={why(t)} />; }`, { b: chars(300) });
    const split = scan(page('./h.pure'), { b: chars(300) }, { 'pages/x/h.pure.ts': helper });
    expect(explain(inline)).toHaveLength(2);
    expect(explain(split)).toHaveLength(2);
    expect(gaps(split)).toEqual([]);
  });

  it('a call into any other module (a plain .ts, or a pure function re-exported through one) stays a gap', () => {
    const plain = scan(page('./h'), { b: chars(300) }, { 'pages/x/h.ts': helper });
    expect(explain(plain)).toEqual([]);
    expect(keysOf(gaps(plain))).toEqual(['layout.explainGap|pages/x/view.tsx|overlay:d']);
    const via = scan(page('./h'), { b: chars(300) }, { 'pages/x/h.ts': "export { why } from './h.pure';", 'pages/x/h.pure.ts': helper });
    expect(explain(via)).toEqual([]);
    expect(gaps(via)).toHaveLength(1);
  });

  it('readTree skips terminal siblings and terminal tests, and keeps .tsx, .pure.ts and term/ folders', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-term-'));
    try {
      const put = (rel: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'export {};'); };
      for (const f of ['pages/x/A.tsx', 'pages/x/A.term.tsx', 'pages/x/data.web.ts', 'pages/x/data.web.term.ts', 'pages/x/A.term.test.tsx', 'pages/x/B.pure.ts', 'pages/x/term/C.tsx', 'pages/x/terminal.tsx']) put(f);
      expect(Object.keys(A.readTree(dir)).sort()).toEqual(['pages/x/A.tsx', 'pages/x/B.pure.ts', 'pages/x/data.web.ts', 'pages/x/term/C.tsx', 'pages/x/terminal.tsx']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
