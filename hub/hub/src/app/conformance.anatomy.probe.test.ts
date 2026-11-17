// The kit's measuring probe is no content. kit useButtonLabelsWidth returns { width, probe }: the
// probe draws kit Buttons in an aria-hidden, inert, out-of-flow box only to measure them, so wherever a page renders it, it is neither
// explanation text (layout.explain / layout.explainGap) nor slot content (layout.slot). The detector proves it syntactically, else it
// reads the value as before: each refusal has a control that keeps its gap or slot hit.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Registry = Record<string, unknown>;
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  loadRegistry(dir?: string): Registry;
  scan(files: Record<string, string>, opts?: { registry?: Registry; disabled?: string[] }): { hits: Hit[] };
};
const REG = A.loadRegistry(join(import.meta.dirname, '../kit/layouts/anatomy'));

const PROBE_KIT = 'export function useButtonLabelsWidth(labels: any[], opts: any = {}) { return { width: null as number | null, probe: <span aria-hidden="true" /> }; }';
const chars = (n: number) => 'abcdefghi '.repeat(Math.ceil(n / 10)).slice(0, n - 1) + 'z';

describe('explain: the kit probe shows no text', () => {
  const KIT: Record<string, string> = {
    'kit/index.ts': "export * from './layouts/Layouts';\nexport * from './controls/Controls';\nexport { useButtonLabelsWidth } from './controls/buttonMetrics';\nexport * from './strings';",
    'kit/strings.ts': 'export function useStrings(table: any) { return (k: string, v?: any) => k; }',
    'kit/layouts/Layouts.tsx': 'export function Section(p: any) { return <section>{p.description}{p.children}</section>; }',
    'kit/controls/Controls.tsx': 'export function Button(p: any) { return <button />; }',
    'kit/controls/buttonMetrics.tsx': PROBE_KIT,
  };
  const HEAD = "import { Section, Button, useStrings, useButtonLabelsWidth } from '@kit';\nimport strings from './strings.en.json';\n";
  /** the explainGap count of a page whose Section description shows a 40-char line and `shown`, with `pre` before the return */
  function gaps(pre: string, shown: string, opts: { head?: string; extra?: Record<string, string>; sig?: string } = {}) {
    const page = `export function V(${opts.sig ?? ''}) { const t = useStrings(strings); ${pre} return <Section title="s" description={<>{t('a')}${shown}</>}><Button>go</Button></Section>; }`;
    const files = { ...KIT, 'pages/x/strings.en.json': JSON.stringify({ a: chars(40), big: chars(200) }), ...(opts.extra ?? {}), 'pages/x/view.tsx': (opts.head ?? HEAD) + page };
    return A.scan(files).hits.filter((h) => h.file === 'pages/x/view.tsx' && h.rule === 'layout.explainGap').length;
  }
  const WRAP = "function useW() { const l = useButtonLabelsWidth(['a'], { link: true }); const b = useButtonLabelsWidth(['b']); return { width: l.width, probe: (<>{l.probe}{b.probe}</>) }; }\n";

  it('the probe read any proven way is no gap: destructured, renamed, a member, a const of it, a fragment of probes', () => {
    expect(gaps("const { width, probe } = useButtonLabelsWidth(['a']);", '{probe}')).toBe(0);
    expect(gaps("const { probe: p } = useButtonLabelsWidth(['a']);", '{p}')).toBe(0);
    expect(gaps("const m = useButtonLabelsWidth(['a']); const w = m.width;", '{m.probe}')).toBe(0);
    expect(gaps("const m = useButtonLabelsWidth(['a']);", "{m['probe']}")).toBe(0);
    expect(gaps("const m = useButtonLabelsWidth(['a']); const pr = m.probe;", '{pr}')).toBe(0);
    expect(gaps("const l = useButtonLabelsWidth(['a']); const b = useButtonLabelsWidth(['b']);", '<>{l.probe} {b.probe}</>')).toBe(0);
  });
  it('through a renamed kit import and through a wrapper hook (same file, or imported with every return a probe)', () => {
    expect(gaps("const { probe } = measure(['a']);", '{probe}', { head: HEAD.replace('useButtonLabelsWidth }', 'useButtonLabelsWidth as measure }') })).toBe(0);
    expect(gaps(WRAP.replace(/\n$/, '') + ' const { width, probe } = useW();', '{probe}')).toBe(1); // a nested function is not followed
    expect(gaps('const { width, probe } = useW();', '{probe}', { head: HEAD + WRAP })).toBe(0);
    const W2 = "import { useButtonLabelsWidth } from '@kit';\nexport function useW2() { const { probe } = useButtonLabelsWidth(['a']); if (Math.random()) return { width: 1, probe }; return { width: 2, probe }; }";
    expect(gaps('const { probe } = useW2();', '{probe}', { head: HEAD + "import { useW2 } from './w';\n", extra: { 'pages/x/w.tsx': W2 } })).toBe(0);
  });
  it('controls: a value the walk cannot prove to be the kit probe keeps its gap', () => {
    // a look-alike: not the kit's hook, or a local one
    const mine = { 'pages/x/mine.tsx': 'export function useButtonLabelsWidth(x: any): any { return x; }' };
    expect(gaps("const { probe } = useButtonLabelsWidth(['a']);", '{probe}', { head: HEAD.replace("useStrings, useButtonLabelsWidth } from '@kit';", "useStrings } from '@kit';\nimport { useButtonLabelsWidth } from './mine';"), extra: mine })).toBe(1);
    expect(gaps("function useB(x: any) { return { probe: x }; } const { probe } = useB(['a']);", '{probe}')).toBe(1);
    // a binding that can change: let, a member write, the object handed to a call, a default, another member under the name
    expect(gaps("let m = useButtonLabelsWidth(['a']);", '{m.probe}')).toBe(1);
    expect(gaps("const m = useButtonLabelsWidth(['a']); (m as any).probe = t('big');", '{m.probe}')).toBe(1);
    expect(gaps("const m = useButtonLabelsWidth(['a']); Object.assign(m, { probe: t('big') });", '{m.probe}')).toBe(1);
    expect(gaps("const { probe = t('big') } = useButtonLabelsWidth(['a']);", '{probe}')).toBe(1);
    expect(gaps("const { width: probe } = useButtonLabelsWidth(['a']);", '{probe}')).toBe(1);
    expect(gaps('', '{m.probe}', { sig: '{ m }: { m: { probe: string } }' })).toBe(1);
  });
  it('controls: a wrapper hook is followed only when every return is a plain object whose one `probe` is a probe', () => {
    const use = (fn: string) => gaps('const { probe } = useW(true as any);', '{probe}', { head: HEAD + fn + '\n' });
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: <>{l.probe}</> }; }")).toBe(0);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: <>{l.probe}<p>{'x'}</p></> }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, ...k }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); if (k) return { probe: l.probe }; return { probe: <p>{'y'}</p> }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { get probe() { return l.probe; } }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, [k]: 1 }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { ['probe']: l.probe }; }")).toBe(0);
    // plain members only: an accessor or a method beside the probe is refused, as is any way out that is not an object
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, get w() { return 1; } }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, f() { return 1; } }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); if (k) return; return { probe: l.probe }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); if (k) { return { probe: l.probe }; } }")).toBe(1);
    // `__proto__: X` (identifier or string key) sets the prototype instead of a member: the object is not plain
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, __proto__: k }; }")).toBe(1);
    expect(use("function useW(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, '__proto__': k }; }")).toBe(1);
  });
  it('controls: only a stable function is followed, and only the kit module defines the hook', () => {
    const P = "{ const m = useButtonLabelsWidth(['a']); return { probe: m.probe }; }";
    // a function declaration the file reassigns, an exported let, a call such as memo() that returns another function
    expect(gaps('const { probe } = useW();', '{probe}', { head: HEAD + `function useW() ${P}\n(useW as any) = () => ({ probe: 'VISIBLE' });\n` })).toBe(1);
    const lib = (decl: string) => ({ head: HEAD + "import { useL } from './l';\n", extra: { 'pages/x/l.tsx': "import { useButtonLabelsWidth } from '@kit';\n" + decl } });
    expect(gaps('const { probe } = useL();', '{probe}', lib(`export const useL = () => ${P};`))).toBe(0);
    expect(gaps('const { probe } = useL();', '{probe}', lib(`export let useL = () => ${P};\nexport function swap() { useL = () => ({ probe: 'VISIBLE' } as any); }`))).toBe(1);
    expect(gaps('const { probe } = useW();', '{probe}', { head: HEAD + `function memo(f: any) { return () => ({ probe: 'VISIBLE' }); }\nconst useW = memo(() => ${P});\n` })).toBe(1);
    // `@kit` re-exporting a page's function of the same name
    const kit = "export * from './layouts/Layouts';\nexport * from './controls/Controls';\nexport { useButtonLabelsWidth } from '../pages/x/mine';\nexport * from './strings';";
    expect(gaps("const { probe } = useButtonLabelsWidth(['a']);", '{probe}', { extra: { 'kit/index.ts': kit, 'pages/x/mine.tsx': "export function useButtonLabelsWidth(x: any): any { return { probe: 'VISIBLE' }; }" } })).toBe(1);
  });
  it('controls: nothing is called through the object (a method runs with `this` bound to it and can rewrite probe)', () => {
    const W = "function useW() { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, change: function () { (this as any).probe = 'VISIBLE'; } }; }\n";
    expect(gaps('const m = useW(); m.change();', '{m.probe}', { head: HEAD + W })).toBe(1);
    expect(gaps("const m = useW(); m['change']();", '{m.probe}', { head: HEAD + W })).toBe(1);
    // a destructured probe is its own value: a later call cannot change it; a call on a member's value is no call through the object
    expect(gaps('const { probe, change } = useW(); change();', '{probe}', { head: HEAD + W })).toBe(0);
    expect(gaps("const m = useButtonLabelsWidth(['a']); const w = String(m.width).trim();", '{m.probe}')).toBe(0);
  });
});

describe('slots: the kit probe is no slot content', () => {
  const KIT: Record<string, string> = {
    'kit/index.ts': "export * from './misc/Misc';\nexport { useStrings } from './strings';\nexport { useButtonLabelsWidth } from './controls/buttonMetrics';",
    'kit/strings.ts': 'export function useStrings(table: any) { return (k: string) => k; }',
    'kit/controls/buttonMetrics.tsx': PROBE_KIT,
    'kit/misc/Misc.tsx': ['EmptyState', 'IdChip', 'DataTable', 'ListDetailPage'].map((n) => `export function ${n}(p: any) { return <div />; }`).join('\n'),
  };
  const IMPORTS = "import { EmptyState, IdChip, DataTable, ListDetailPage, useButtonLabelsWidth } from '@kit';\n";
  const slot = (page: string) => A.scan({ ...KIT, 'pages/x/view.tsx': IMPORTS + page }, { registry: REG }).hits.filter((h) => h.rule === 'layout.slot' && h.file === 'pages/x/view.tsx').map((h) => h.msg);
  const body = (defs: string) => `${defs}\nexport function View() { return <EmptyState body={<W />} />; }\n`;
  const UNREAD = ['EmptyState.body: <W> renders a value the check cannot read into a text slot'];

  it('beside a chip in a wrapper and in a pane slot, the probe adds nothing', () => {
    expect(slot(body("function W() { const { probe } = useButtonLabelsWidth(['a']); return <><IdChip />{probe}</>; }"))).toEqual([]);
    expect(slot(body("function W() { const m = useButtonLabelsWidth(['a']); return <><IdChip />{m.probe}</>; }"))).toEqual([]);
    expect(slot(body("function useP() { const l = useButtonLabelsWidth(['a']); return { probe: <>{l.probe}</> }; }\nfunction W() { const { probe } = useP(); return <><IdChip />{probe}</>; }"))).toEqual([]);
    expect(slot("export function View() { const { probe } = useButtonLabelsWidth(['a']); return <ListDetailPage list={<>{probe}<DataTable /></>} />; }\n")).toEqual([]);
  });
  it('controls: an unproven value keeps its slot hit', () => {
    expect(slot(body("function W() { let m = useButtonLabelsWidth(['a']); return <><IdChip />{m.probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function useB(x: any) { return { probe: x }; }\nfunction W() { const { probe } = useB(<div />); return <><IdChip />{probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function useP() { const l = useButtonLabelsWidth(['a']); return { probe: l.probe }; }\n(useP as any) = () => ({ probe: <div /> });\nfunction W() { const { probe } = useP(); return <><IdChip />{probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function memo(f: any) { return () => ({ probe: <div /> }); }\nconst useP = memo(() => { const l = useButtonLabelsWidth(['a']); return { probe: l.probe }; });\nfunction W() { const { probe } = useP(); return <><IdChip />{probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function useP() { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, change: function () { (this as any).probe = <div />; } }; }\nfunction W() { const m = useP(); m.change(); return <><IdChip />{m.probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function useP(k: any) { const l = useButtonLabelsWidth(['a']); if (k) return; return { probe: l.probe }; }\nfunction W() { const { probe } = useP(1) as any; return <><IdChip />{probe}</>; }"))).toEqual(UNREAD);
    expect(slot(body("function useP(k: any) { const l = useButtonLabelsWidth(['a']); return { probe: l.probe, __proto__: k }; }\nfunction W() { const { probe } = useP(<div />); return <><IdChip />{probe}</>; }"))).toEqual(UNREAD);
  });
});
