// Tests of the terminal module graph (scripts/term/graph.ts) on small synthetic hub trees written under
// $GRAPH_FIXTURES_DIR (default .term-cache/graph-fixtures). Run: (cd hub/scripts/term/graph && bun test)
import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { run, type RunOptions } from '../graph';
import { scanFile, readStrictGlobals } from './scan';
import { r3Hint } from './rules';

const ROOT = process.env.GRAPH_FIXTURES_DIR ?? path.join(import.meta.dir, '..', '..', '..', '.term-cache', 'graph-fixtures');
fs.mkdirSync(ROOT, { recursive: true });
const made: string[] = [];
afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, resolveJsonModule: true,
    allowJs: true, noEmit: true, verbatimModuleSyntax: true,
    paths: { '@kit': ['./src/kit/index.ts'], '@kit/*': ['./src/kit/*'], '@core': ['./src/core/index.ts'], '@core/*': ['./src/core/*'] },
  },
  include: ['src'],
};

/** A hub tree: tsconfig.json + the given files (paths relative to the hub dir). */
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'hub-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return dir;
}

function analyse(hub: string, extra: Partial<RunOptions> = {}) {
  const seams = path.join(hub, 'seams.json');
  if (!fs.existsSync(seams)) fs.writeFileSync(seams, JSON.stringify({ files: [] }));
  return run({ hub, quiet: true, seams, baseline: path.join(hub, 'baseline.json'), shellEntries: [], termEntries: [], ...extra });
}

const PAGE = (view = './view') => `import { definePage } from '@kit';\nexport default definePage({ id: 'p', load: () => import('${view}') });\n`;
const KIT_PAGE = `export function definePage<T>(m: T): T { return m; }\n`;
const globals = readStrictGlobals(null);

describe('scan: reasons, debt, imports', () => {
  test('web-only reasons carry their lines; shadowed and type-position names do not count', () => {
    const f = scanFile('/x/a.tsx', [
      "import s from './a.module.css';",          // 1 css-module
      "import { Button } from 'react-aria-components';", // 2 package
      'export function f(el: HTMLElement) {',      // 3 type position: not a reason
      '  const document = 1; return document;',    // 4 shadowed
      '}',
      'export function g(ref: { current: HTMLDivElement | null }) {',
      '  ref.current?.focus();',                    // 7 dom-member on a ref
      '  return window.innerWidth + localStorage.length;', // 8 globals
      '}',
      'export const top = typeof window;',         // 10 typeof guard, module scope
      'export const C = () => <div className={s.a}><span>x</span><Button /></div>;',
    ].join('\n'), { globals });
    const by = (k: string) => f.reasons.filter((r) => r.kind === k).map((r) => `${r.detail}@${r.line}`);
    expect(by('css-module')).toEqual(['./a.module.css@1']);
    expect(by('package')).toEqual(['react-aria-components@2']);
    expect(by('dom-member')).toEqual(['current.focus@7']);
    expect(by('global')).toEqual(['window.innerWidth@8', 'localStorage@8', 'window@10']);
    expect(f.reasons.find((r) => r.line === 10)!.moduleScope).toBe(true);
    expect(f.reasons.find((r) => r.line === 8)!.moduleScope).toBe(false);
    expect(f.typeofGuards.map((t) => t.line)).toEqual([10]);
    expect(f.raw).toEqual({ div: 1, span: 1 });
  });

  test('type-only imports and exports are not runtime; an all-inline-type import is marked kept-empty', () => {
    const f = scanFile('/x/b.ts', [
      "import type { A } from './a';",
      "import { type B } from './b';",
      "import { type C, d } from './c';",
      "export type { E } from './e';",
      "export { type F, g } from './f';",
      "export * from './h';",
      "export type * from './i';",
    ].join('\n'), { globals });
    const rt = f.imports.filter((i) => i.names.length > 0).map((i) => `${i.spec}:${i.names.join(',')}`);
    expect(rt).toEqual(['./c:d']);
    expect(f.imports.find((i) => i.spec === './b')!.emptyKept).toBe(true);
    expect(f.reexports.map((r) => `${r.name}:${r.type}`)).toEqual(['E:true', 'F:true', 'g:false']);
    expect(f.stars.map((s) => s.spec)).toEqual(['./h']);
  });

  test('a runtime re-export from a web-only package or CSS is a reason; a type-only one is not', () => {
    const f = scanFile('/x/c.ts', [
      "export { createPortal as portal } from 'react-dom';",
      "export type { Root } from 'react-dom/client';",
      "export { type FocusScope } from 'react-aria';",
      "export * from '@react-aria/focus';",
      "export type * from '@react-aria/utils';",
      "export * as rac from 'react-aria-components';",
    ].join('\n'), { globals });
    expect(f.reasons.filter((r) => r.kind === 'package').map((r) => `${r.detail}@${r.line}`)).toEqual(['react-dom@1', '@react-aria/focus@4', 'react-aria-components@6']);
  });
});

describe('graph: resolution', () => {
  test('type-only imports create no edge; a value import through a re-export chain reaches the defining module', () => {
    const hub = tree({
      'src/kit/index.ts': "export * from './page';\nexport * from './mid';\nexport type { T } from './types';\nexport { Inner as Outer } from './chain';\n",
      'src/kit/page.ts': KIT_PAGE,
      'src/kit/mid.ts': "export { deep } from './deep';\n",
      'src/kit/deep.ts': 'export const deep = 1;\n',
      'src/kit/chain.ts': "import { Inner } from './chain2';\nexport { Inner };\n",
      'src/kit/chain2.ts': "export function Inner() { return document.title; }\n",
      'src/kit/types.ts': "import './web.css';\nexport type T = number;\n",
      'src/kit/web.css': '.a{}',
      'src/pages/p/page.ts': PAGE(),
      'src/pages/p/view.tsx': "import type { T } from '@kit';\nimport { type T as U } from '@kit';\nimport { deep } from '@kit';\nexport default function V(): T { return deep; }\n",
    });
    const { analysis: a, graph: g } = analyse(hub);
    const edges = g.edges('term', 'src/pages/p/view.tsx').edges.map((e) => e.to);
    expect(edges).toEqual(['src/kit/deep.ts']);
    expect(a.pages.p!.status).toBe('native-ready');
    const outer = a.kit.find((k) => k.name === 'Outer')!;
    expect(outer.file).toBe('src/kit/chain2.ts');
    expect(outer.status).toBe('needs-sibling');
    expect(outer.needs).toEqual(['src/kit/chain2.ts']);
    expect(a.kit.find((k) => k.name === 'T')!.kind).toBe('type');
    expect(a.kit.find((k) => k.name === 'deep')!.status).toBe('shared');
    expect(a.emptyKept.map((e) => e.file)).toEqual(['src/pages/p/view.tsx']);
  });

  test('a .term sibling replaces its base (ported); a page through it is native-ready', () => {
    const hub = tree({
      'src/kit/index.ts': "export * from './page';\nexport { Box, boxWidth } from './Box';\n",
      'src/kit/page.ts': KIT_PAGE,
      'src/kit/Box.tsx': "import s from './Box.module.css';\nexport const boxWidth = () => window.innerWidth;\nexport function Box() { return <div className={s.b} />; }\n",
      'src/kit/Box.module.css': '.b{}',
      'src/kit/Box.term.tsx': "import type { ReactNode } from 'react';\nexport const boxWidth = () => 80;\nexport function Box(): ReactNode { return null; }\n",
      'src/pages/p/page.ts': PAGE(),
      'src/pages/p/view.tsx': "import { Box, boxWidth } from '@kit';\nexport default function V() { return <Box>{boxWidth()}</Box>; }\n",
    });
    const { analysis: a } = analyse(hub);
    expect(a.modules['src/kit/Box.tsx']!.class).toBe('has-sibling');
    expect(a.kit.find((k) => k.name === 'Box')!.status).toBe('ported');
    expect(a.pages.p!.status).toBe('native-ready');
    expect(a.worklist).toEqual([]);
  });

  test('aliases @kit/* and @core resolve; dynamic import and glob are followed from entries', () => {
    const hub = tree({
      'src/kit/index.ts': "export * from './page';\n",
      'src/kit/page.ts': KIT_PAGE,
      'src/kit/deep/thing.ts': 'export const thing = () => navigator.language;\n',
      'src/core/index.ts': "export { core } from './core';\n",
      'src/core/core.ts': 'export const core = 2;\n',
      'src/pages/p/page.ts': PAGE('./lazy'),
      'src/pages/p/lazy.ts': "import { thing } from '@kit/deep/thing';\nimport { core } from '@core';\nexport default () => thing() + core;\n",
    });
    const { analysis: a } = analyse(hub);
    expect(a.pages.p!.blockers.map((b) => [b.file, b.group])).toEqual([['src/kit/deep/thing.ts', 'kit']]);
    expect(a.pages.p!.blockers[0]!.reasons).toEqual(['navigator']);
  });
});

describe('classification, handoff, pages, work-list', () => {
  const files = (extra: Record<string, string> = {}) => ({
    'src/kit/index.ts': "export * from './page';\nexport { Btn } from './Btn';\nexport { Sheet } from './Sheet';\nexport { Canvas } from './Canvas';\nexport { pure, Mixed } from './Mixed';\nexport { Clean } from './Clean';\n",
    'src/kit/page.ts': KIT_PAGE,
    'src/kit/Btn.tsx': "import { Button } from 'react-aria-components';\nexport function Btn() { return <Button />; }\n",
    'src/kit/Sheet.tsx': "import './sheet.css';\nexport function Sheet() { return <section />; }\n",
    'src/kit/sheet.css': '.s{}',
    'src/kit/Canvas.tsx': 'export function Canvas() { return <canvas />; }\n',
    'src/kit/Mixed.tsx': "export const pure = (n: number) => n + 1;\nexport function Mixed() { return document.title; }\n",
    'src/kit/Clean.tsx': 'export function Clean() { return <span>x</span>; }\n',
    'src/pages/a/page.ts': PAGE(),
    'src/pages/a/view.tsx': "import { Btn, Sheet, Clean } from '@kit';\nimport { Own } from './Own';\nexport default function V() { return <><Btn /><Sheet /><Clean /><Own /></>; }\n",
    'src/pages/a/Own.tsx': "import { pure } from '@kit';\nimport s from './own.module.css';\nexport function Own() { return <p className={s.o}>{pure(1)}</p>; }\n",
    'src/pages/a/own.module.css': '.o{}',
    'src/pages/b/page.ts': PAGE(),
    'src/pages/b/view.tsx': "import { Btn, Canvas } from '@kit';\nexport default function V() { return <><Btn /><Canvas /></>; }\n",
    ...extra,
  });

  test('module classes, kit statuses, handoff and pass-through page blockers', () => {
    const hub = tree(files());
    // The hand-off machinery for a name with no sibling (the real list is derived and holds only siblings: handoffs.ts).
    const { analysis: a } = analyse(hub, { handoffNames: ['Canvas'] });
    expect(a.modules['src/kit/Btn.tsx']!.class).toBe('web-only');
    expect(a.modules['src/kit/Clean.tsx']!.class).toBe('shared-with-debt');
    expect(a.modules['src/kit/Canvas.tsx']!.class).toBe('handoff');
    expect(a.modules['src/kit/page.ts']!.class).toBe('shared-clean');
    expect(a.modules['src/kit/Sheet.tsx']!.reasons.map((r) => r.kind)).toEqual(['css']);
    const st = Object.fromEntries(a.kit.map((k) => [k.name, k.status]));
    expect(st).toMatchObject({ Btn: 'needs-sibling', Sheet: 'needs-sibling', Canvas: 'handoff', Clean: 'shared', Mixed: 'needs-sibling', pure: 'needs-sibling' });
    expect(a.kit.find((k) => k.name === 'Btn')!.importers).toBe(2);
    // page a: own web-only files are listed AND walked through (Own.tsx's kit use shows up)
    const pa = a.pages.a!;
    expect(pa.status).toBe('blocked');
    expect(pa.blockers.map((b) => b.file).sort()).toEqual(['src/kit/Btn.tsx', 'src/kit/Mixed.tsx', 'src/kit/Sheet.tsx', 'src/pages/a/Own.tsx']);
    expect(pa.blockersByGroup).toEqual({ kit: 3, own: 1 });
    // Own.tsx is web-only only through its CSS module; plain CSS (Sheet) stays web-only
    expect(pa.blockersIfCssModulesTranslate).toBe(3);
    expect(a.pages.b!.handoffs).toEqual(['src/kit/Canvas.tsx#Canvas']);
    // pure helper trapped in a web-only file
    expect(a.trapped.find((t) => t.file === 'src/kit/Mixed.tsx')!.pure).toEqual(['pure']);
  });

  test('work-list: the file on most blocked imports first; it names exports, reasons and completed pages', () => {
    const { analysis: a } = analyse(tree(files()));
    expect(a.worklist[0]!.file).toBe('src/kit/Btn.tsx');
    expect(a.worklist[0]!.kitNames.map((k) => k.name)).toEqual(['Btn']);
    expect(a.worklist[0]!.reasons[0]!.detail).toBe('react-aria-components');
    const order = a.worklist.map((w) => w.file);
    expect(new Set(order).size).toBe(order.length);
    expect(order).toContain('src/pages/a/Own.tsx');
    const done = a.worklist.flatMap((w) => w.pagesCompleted);
    expect(done.sort()).toEqual(['page:a', 'page:b']);
    expect(a.worklist[a.worklist.length - 1]!.cumulative).toBe(a.blockedSites);
  });
});

describe('rules', () => {
  test('R1: an orphan sibling and a twin value import error; a sibling of a non-web-only file warns', () => {
    const hub = tree({
      'src/kit/index.ts': "export { a } from './A';\n",
      'src/kit/A.ts': 'export const a = 1;\n',
      'src/kit/A.term.ts': "import { a as webA } from './A';\nexport const a = webA;\n",
      'src/kit/Lonely.term.ts': 'export const x = 1;\n',
    });
    const f = analyse(hub, { check: true, rules: ['R1'] }).findings!;
    expect(f.filter((x) => x.severity === 'warn').map((x) => x.file).sort()).toEqual(['src/kit/A.term.ts']);
    const errs = f.filter((x) => x.severity === 'error');
    expect(errs.map((x) => x.file).sort()).toEqual(['src/kit/A.term.ts', 'src/kit/Lonely.term.ts']);
    expect(errs.find((x) => x.file === 'src/kit/A.term.ts')!.message).toContain('TERM_TWIN_VALUE_IMPORT');
  });

  test('R1: a base that only re-exports a web-only package (react-dom createPortal) is web-only: its sibling is needed', () => {
    const hub = tree({
      'src/pages/p/portal.ts': "export { createPortal as portal } from 'react-dom';\n",
      'src/pages/p/portal.term.ts': 'export const portal = (n: unknown) => n;\n',
      'src/pages/p/view.tsx': "import { portal } from './portal';\nexport const V = () => portal;\n",
    });
    expect(analyse(hub, { check: true, rules: ['R1'] }).findings!.filter((x) => x.file === 'src/pages/p/portal.term.ts')).toEqual([]);
  });

  test('R2: the sibling must export the same runtime names (types ignored)', () => {
    const hub = tree({
      'src/kit/index.ts': "export { a } from './A';\n",
      'src/kit/A.ts': "export const a = () => document.title;\nexport const b = 2;\nexport type T = 1;\n",
      'src/kit/A.term.ts': 'export const a = () => "";\nexport const c = 3;\n',
    });
    const r = analyse(hub, { check: true, rules: ['R2'] });
    expect(r.exitCode).toBe(1);
    expect(r.findings!.map((x) => x.message)).toEqual([expect.stringMatching(/Missing: b .*Extra: c/)]);
    fs.writeFileSync(path.join(hub, 'src/kit/A.term.ts'), 'export const a = () => "";\nexport const b = 2;\n');
    expect(analyse(hub, { check: true, rules: ['R2'] }).findings).toEqual([]);
  });

  test('R3/R4/R6: identified-site ratchet; missing baseline, new site and stale site all fail', () => {
    const base = {
      'src/kit/index.ts': "export * from './page';\nexport { W } from './W';\nexport { V2 } from './V2';\n",
      'src/kit/page.ts': KIT_PAGE,
      'src/kit/W.tsx': 'export function W() { return <div>{window.name}</div>; }\n',
      'src/kit/V2.tsx': 'export function V2() { return <div>{window.name}</div>; }\n',
      'src/pages/p/page.ts': PAGE(),
      'src/pages/p/view.tsx': "import { W } from '@kit';\nexport default function V() { return <div><span>a</span><W /></div>; }\n",
    };
    const hub = tree(base);
    // No baseline: an error, never a warning.
    const first = analyse(hub, { check: true, rules: ['R3', 'R4'] });
    expect(first.exitCode).toBe(1);
    expect(first.findings!.map((f) => `${f.rule} ${f.severity}`).sort()).toEqual(['R3 error', 'R4 error']);
    analyse(hub, { updateBaseline: true });
    const bl = JSON.parse(fs.readFileSync(path.join(hub, 'baseline.json'), 'utf8'));
    expect(bl.version).toBe(2);
    expect(bl.webOnlyEdges).toEqual(['page:p|src/pages/p/view.tsx -> src/kit/W.tsx']);
    expect(bl.rawSites).toContain('src/pages/p/view.tsx#div#1');
    expect(bl.rawSites).toContain('src/pages/p/view.tsx#span#1');
    expect(bl.excludedEdges).toEqual([]);
    expect(analyse(hub, { check: true, rules: ['R3', 'R4', 'R6'] }).exitCode).toBe(0);
    // Swap one offender for another: the totals are equal, the sites are not.
    fs.writeFileSync(path.join(hub, 'src/pages/p/view.tsx'), "import { V2 } from '@kit';\nexport default function V() { return <div><b>a</b><V2 /></div>; }\n");
    const r = analyse(hub, { check: true, rules: ['R3', 'R4'] });
    expect(r.exitCode).toBe(1);
    const msgs = r.findings!.filter((f) => f.severity === 'error').map((f) => `${f.rule} ${f.message}`);
    // One finding per edge, naming the entries that reach it, with what makes the target web-only.
    const r3 = msgs.find((m) => m.startsWith('R3 new web-only edge: src/pages/p/view.tsx -> src/kit/V2.tsx (from page:p).'));
    expect(r3).toBeDefined();
    expect(r3).toContain('src/kit/V2.tsx');
    expect(r3).toContain('src/kit/V2.term.tsx');
    expect(msgs.some((m) => m.startsWith('R3 1 recorded web-only edge is gone'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('R4 new raw element site: src/pages/p/view.tsx#b#1'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('R4 2 recorded raw element sites are gone (src/kit/W.tsx#div#1; src/pages/p/view.tsx#span#1)'))).toBe(true);
    // R3 only: R4 switched off
    expect(new Set(analyse(hub, { check: true, rules: ['R3'] }).findings!.map((f) => f.rule))).toEqual(new Set(['R3']));
  });

  test('R3: the walk goes on through a web-only module (an earlier blocker never hides the debt behind it)', () => {
    const hub = tree({
      'src/kit/index.ts': "export * from './page';\nexport { Outer } from './Outer';\n",
      'src/kit/page.ts': KIT_PAGE,
      'src/kit/Outer.tsx': "import { Inner } from './Inner';\nexport function Outer() { return <Inner n={window.name} />; }\n",
      'src/kit/Inner.tsx': 'export function Inner(p: { n: string }) { return <i>{document.title + p.n}</i>; }\n',
      'src/pages/p/page.ts': PAGE(),
      'src/pages/p/view.tsx': "import { Outer } from '@kit';\nexport default function V() { return <Outer />; }\n",
    });
    analyse(hub, { updateBaseline: true });
    const bl = JSON.parse(fs.readFileSync(path.join(hub, 'baseline.json'), 'utf8'));
    expect(bl.webOnlyEdges).toEqual(['page:p|src/kit/Outer.tsx -> src/kit/Inner.tsx', 'page:p|src/pages/p/view.tsx -> src/kit/Outer.tsx']);
  });

  test('R3/R4: an old-format baseline is an error naming the format', () => {
    const hub = tree({ 'src/kit/index.ts': "export * from './page';\n", 'src/kit/page.ts': KIT_PAGE });
    fs.writeFileSync(path.join(hub, 'baseline.json'), JSON.stringify({ webOnlyReachable: {}, rawDebt: {} }));
    const r = analyse(hub, { check: true, rules: ['R3'] });
    expect(r.exitCode).toBe(1);
    expect(r.findings![0]!.message).toContain('TERM_BASELINE_FORMAT');
  });

  test('R5: OpenTUI tags and imports only under src/term/prim/', () => {
    const hub = tree({
      'src/kit/index.ts': "export { X } from './X';\n",
      'src/kit/X.tsx': "import { useKeyboard } from '@opentui/react';\nexport function X() { useKeyboard(() => {}); return <box><text>hi</text><svg><text>svg ok</text></svg></box>; }\n",
      'src/term/prim/Box.tsx': "import '@opentui/react';\nexport function Box() { return <box />; }\n",
    });
    const f = analyse(hub, { check: true, rules: ['R5'] }).findings!;
    expect(f.map((x) => x.message.split(' ')[0])).toEqual(['src/kit/X.tsx:2', 'src/kit/X.tsx:2', 'src/kit/X.tsx:1']);
    expect(f.every((x) => x.file === 'src/kit/X.tsx')).toBe(true);
  });

  test('R5: createElement of an OpenTUI tag and a runtime import of prim/otui outside src/term/prim/', () => {
    const hub = tree({
      'src/kit/index.ts': "export { X } from './X';\n",
      'src/kit/X.tsx': "import { createElement as h } from 'react';\nimport * as React from 'react';\nimport { el } from '../term/prim/otui';\nimport type { BoxRenderable } from '../term/prim/otui';\nexport type B = BoxRenderable;\nexport function X() { return [h('box', null), React.createElement('text', null), document.createElement('box'), el('box', null)]; }\n",
      'src/term/prim/otui.ts': "export function el(t: string, p: unknown) { return [t, p]; }\nexport interface BoxRenderable { id: string }\n",
      'src/term/prim/Box.tsx': "import { createElement } from 'react';\nimport { el } from './otui';\nexport function Box() { return [createElement('box'), el('box', null)]; }\n",
    });
    const f = analyse(hub, { check: true, rules: ['R5'] }).findings!;
    expect(f.map((x) => x.message.split(' ')[0]).sort()).toEqual(['src/kit/X.tsx:3', 'src/kit/X.tsx:6', 'src/kit/X.tsx:6']);
    expect(f.some((x) => x.message.includes('<box>'))).toBe(true);
    expect(f.some((x) => x.message.includes('<text>'))).toBe(true);
  });

  test('R7: code from a string and computed import()/require() are refused anywhere, shadowed names are not', () => {
    const hub = tree({
      'src/kit/index.ts': "export { X } from './X';\n",
      'src/kit/X.ts': "export function X(n: string) {\n  const a = new Function('return 1');\n  const b = Function('return 2');\n  const c = eval('3');\n  const d = import(n);\n  const e = require(n);\n  const ok = import('./ok');\n  return [a, b, c, d, e, ok];\n}\nexport function Y(eval: (s: string) => number) { return eval('1'); }\n",
      'src/kit/ok.ts': 'export const ok = 1;\n',
    });
    const f = analyse(hub, { check: true, rules: ['R7'] }).findings!;
    expect(f.map((x) => x.message.split(' ')[0])).toEqual(['src/kit/X.ts:2', 'src/kit/X.ts:3', 'src/kit/X.ts:4', 'src/kit/X.ts:5', 'src/kit/X.ts:6']);
    expect(f.every((x) => x.rule === 'R7' && x.severity === 'error')).toBe(true);
  });

  test('R7: a shared module re-exporting react-aria is refused; a .web.ts file may', () => {
    const hub = tree({
      'src/kit/index.ts': "export { X } from './X';\nexport { useFocusRing } from 'react-aria';\nexport * from '@react-aria/utils';\nexport type { AriaButtonProps } from 'react-aria';\n",
      'src/kit/X.ts': "import { mergeProps } from 'react-aria';\nexport { mergeProps };\nexport const X = 1;\n",
      'src/kit/aria.web.ts': "export { useButton } from 'react-aria';\n",
    });
    const f = analyse(hub, { check: true, rules: ['R7'] }).findings!;
    expect(f.map((x) => x.message.split(' ')[0]).sort()).toEqual(['src/kit/X.ts:2', 'src/kit/index.ts:2', 'src/kit/index.ts:3']);
  });
});

describe('R3: a web-only import used only as <Handoff> children', () => {
  test('fails in a shared file; not when the part is also used outside, nor in a .web file', () => {
    const files = {
      'src/kit/index.ts': "export { Handoff } from './states/Handoff';\n",
      'src/kit/states/Handoff.tsx': "export function Handoff(p: { reason: string; children?: unknown }) { return p.children; }\n",
      'src/kit/W.tsx': "export function W() { return window.innerWidth; }\n",
      'src/pages/p/page.ts': "export default { id: 'p', path: '/p', view: () => import('./view') };\n",
      'src/pages/p/view.tsx': "import { Handoff } from '../../kit/states/Handoff';\nimport { W } from '../../kit/W';\nexport default function V() { return <Handoff reason=\"r\"><W /></Handoff>; }\n",
      'src/pages/q/view.tsx': "import { Handoff } from '../../kit/states/Handoff';\nimport { W } from '../../kit/W';\nexport default function V() { return [<Handoff reason=\"r\"><W /></Handoff>, <W />]; }\n",
      'src/pages/r/part.web.tsx': "import { Handoff } from '../../kit/states/Handoff';\nimport { W } from '../../kit/W';\nexport default function V() { return <Handoff reason=\"r\"><W /></Handoff>; }\n",
    };
    const f = analyse(tree(files), { check: true, rules: ['R3'] }).findings!.filter((x) => x.message.includes('<Handoff> children'));
    expect(f.map((x) => x.file)).toEqual(['src/pages/p/view.tsx']);
    expect(f[0]!.message).toContain('src/pages/p/view.tsx:2 imports W');
    expect(f[0]!.severity).toBe('error');
  });
});

describe('R3 hint', () => {
  test('a target that is itself a sibling is fixed in place (never "write its sibling"); a global read names hostEnv and the line', () => {
    const mods = { 'src/kit/X.term.tsx': { reasons: [{ kind: 'global', detail: 'window.innerWidth', lines: [14], moduleScope: false }] } } as never;
    const h = r3Hint('page:p|src/kit/Y.term.tsx -> src/kit/X.term.tsx', { modules: mods });
    expect(h).toContain('Fix it in src/kit/X.term.tsx');
    expect(h).toContain('reads window.innerWidth (line 14)');
    expect(h).toContain('hostEnv()');
    expect(h).not.toContain('X.term.term');
    const w = r3Hint('page:p|src/kit/Y.term.tsx -> src/kit/Z.tsx', { modules: {} as never });
    expect(w).toContain('src/kit/Z.term.tsx');
  });
});

describe('terminal-only non-sibling (runtime import of src/term/prim, no web reach)', () => {
  // TS.tsx reads .scrollTop on a renderable; Lay.tsx is web-only (window) and its sibling Lay.term.tsx uses TS.
  const LISTED = "export const TERMINAL_ONLY_MODULES: Readonly<Record<string, string>> = Object.freeze({\n  'kit/TS.tsx': 'terminal scroll helper',\n});\n";
  const files = (extra: Record<string, string> = {}) => ({
    'src/kit/index.ts': "export * from './page';\nexport { Lay } from './Lay';\nexport { Shared } from './Shared';\n",
    'src/kit/page.ts': KIT_PAGE,
    'src/term/prim/index.ts': "export { Scroll } from './Scroll';\n",
    'src/term/prim/Scroll.ts': 'export interface Box { scrollTop: number }\nexport function Scroll() { return null; }\n',
    'src/kit/TS.tsx': "import { Scroll } from '../term/prim';\nexport function useTS(box: { scrollTop: number }) { return box.scrollTop + (Scroll() === null ? 0 : 1); }\n",
    'src/kit/Lay.tsx': 'export function Lay() { return <div>{window.name}</div>; }\n',
    'src/kit/Lay.term.tsx': "import { useTS } from './TS';\nexport function Lay() { return useTS({ scrollTop: 0 }); }\n",
    'src/kit/Shared.tsx': 'export function Shared() { return null; }\n',
    'src/app/conformance/termFiles.ts': LISTED,
    'src/pages/p/page.ts': PAGE(),
    'src/pages/p/view.tsx': "import { Lay, Shared } from '@kit';\nexport default function V() { return <><Lay /><Shared /></>; }\n",
    ...extra,
  });
  const edges = (hub: string) => {
    analyse(hub, { updateBaseline: true });
    return (JSON.parse(fs.readFileSync(path.join(hub, 'baseline.json'), 'utf8')) as { webOnlyEdges: string[] }).webOnlyEdges;
  };

  test('reached by no web entry: terminal code, its DOM-named members are no reason, no R3 edge', () => {
    const hub = tree(files());
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).not.toBe('web-only');
    expect(edges(hub).filter((e) => e.includes('src/kit/TS.tsx'))).toEqual([]);
  });

  test('the same file reached by ANY web entry is still flagged', () => {
    const hub = tree(files({ 'src/kit/Shared.tsx': "import { useTS } from './TS';\nexport function Shared() { return useTS({ scrollTop: 0 }); }\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
    expect(edges(hub)).toContain('page:p|src/kit/Shared.tsx -> src/kit/TS.tsx');
  });

  test('a web entry outside the pages (src/app/main.tsx) counts as web reach', () => {
    const hub = tree(files({ 'src/app/main.tsx': "import { useTS } from '../kit/TS';\nexport const n = useTS({ scrollTop: 0 });\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
  });

  test('reached only through a dynamic import from a page is flagged', () => {
    const hub = tree(files({ 'src/pages/p/view.tsx': "import { Lay } from '@kit';\nexport default function V() { void import('../../kit/TS'); return <Lay />; }\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
  });

  test('reached only through an inline-type import (kept as `import {}`) is flagged', () => {
    const hub = tree(files({
      'src/kit/TS.tsx': "import { Scroll } from '../term/prim';\nexport interface Opts { n: number }\nexport function useTS(box: { scrollTop: number }) { return box.scrollTop + (Scroll() === null ? 0 : 1); }\n",
      'src/kit/Shared.tsx': "import { type Opts } from './TS';\nexport function Shared(p: { o?: Opts }) { return p.o ? null : null; }\n",
    }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
  });

  test('reached only from the one-file Hub entry (src/standalone/entry.tsx) is flagged', () => {
    const hub = tree(files({ 'src/standalone/entry.tsx': "import { useTS } from '../kit/TS';\nexport const n = useTS({ scrollTop: 0 });\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
  });

  test('a type-only import of src/term/prim does not reclassify the file', () => {
    const hub = tree(files({ 'src/kit/TS.tsx': "import type { Box } from '../term/prim/Scroll';\nexport function useTS(box: Box) { return box.scrollTop; }\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
    expect(edges(hub)).toContain('page:p|src/kit/Lay.term.tsx -> src/kit/TS.tsx');
  });

  test('a file missing from TERMINAL_ONLY_MODULES is never forgiven', () => {
    const hub = tree(files({ 'src/app/conformance/termFiles.ts': "export const TERMINAL_ONLY_MODULES: Readonly<Record<string, string>> = Object.freeze({\n  'kit/Other.tsx': 'x',\n});\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.class).toBe('web-only');
    expect(edges(hub)).toContain('page:p|src/kit/Lay.term.tsx -> src/kit/TS.tsx');
  });

  test('only dom-member reasons are dropped: a window read in a terminal-only file is still web-only', () => {
    const hub = tree(files({ 'src/kit/TS.tsx': "import { Scroll } from '../term/prim';\nexport function useTS(box: { scrollTop: number }) { return box.scrollTop + window.innerWidth + (Scroll() === null ? 0 : 1); }\n" }));
    expect(analyse(hub).analysis.modules['src/kit/TS.tsx']!.reasons.map((r) => r.kind)).toEqual(['global']);
  });
});
