// Textarea conformance: no textarea shows the browser's own white box on the dark theme.
// (1) Outside the kit, a multi-line field is the kit's TextField multiline (themed with the rest of the form): no raw
// <textarea> and no react-aria TextArea in page, shell, ask or app code beyond the rows in the allow files
// (std.textarea, counts per file). (2) Every textarea that remains anywhere, raw or react-aria, the kit's own (the
// TextField multiline box) included, takes a class from its CSS module that sets both its text colour and its background from the theme (a var(--…) token, or
// transparent / inherit / currentColor), so it never falls back to the browser's colours. A className with alternatives
// (ready ? s.a : s.b, on && s.a) is judged per alternative: each one must carry both.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { allowCounts, allowFileOf } from './conformance/allow';
import { cssModules, cssRules, initializerOf, moduleClassesIn, parseTsx, styledClasses } from './conformance/cssScan';

const SRC = join(import.meta.dirname, '..');
const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const code = Object.fromEntries(ALL.filter((f) => f.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(f)).map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
const sheet = (f: string): string => { try { return readFileSync(join(SRC, f), 'utf8'); } catch { return ''; } };

type Cls = { cssFile: string; cls: string };
interface Area { file: string; line: number; raw: boolean; classes: Cls[]; branches: Cls[][] }

const BRANCH_MAX = 64;
/** The module classes each rendering of a className expression gets: a ternary or ||/?? gives either side, `x && y`
 *  gives y or nothing, a call (cx(…)) or template joins every argument's alternatives. Past BRANCH_MAX alternatives the
 *  rest are cut (no file comes close). */
function branchesOf(n: ts.Node, modules: ReadonlyMap<string, string>, depth = 0): Cls[][] {
  const flat = (): Cls[][] => { const one: Cls[] = []; moduleClassesIn(n, modules, (cssFile, cls) => one.push({ cssFile, cls }), true, depth); return [one]; };
  if (depth > 8) return [[]];
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) return branchesOf(n.expression, modules, depth + 1);
  if (ts.isConditionalExpression(n)) return [...branchesOf(n.whenTrue, modules, depth + 1), ...branchesOf(n.whenFalse, modules, depth + 1)].slice(0, BRANCH_MAX);
  if (ts.isBinaryExpression(n)) {
    const k = n.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return [[], ...branchesOf(n.right, modules, depth + 1)].slice(0, BRANCH_MAX);
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return [...branchesOf(n.left, modules, depth + 1), ...branchesOf(n.right, modules, depth + 1)].slice(0, BRANCH_MAX);
  }
  if (ts.isIdentifier(n)) { const init = initializerOf(n); return init ? branchesOf(init, modules, depth + 1) : [[]]; }
  // A render callback (react-aria className={({ isFocused }) => …}): what it returns.
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && !ts.isBlock(n.body)) return branchesOf(n.body, modules, depth + 1);
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isBlock(n.body)) {
    const rets: Cls[][] = [];
    const walk = (k: ts.Node): void => { if (ts.isReturnStatement(k) && k.expression) rets.push(...branchesOf(k.expression, modules, depth + 1)); else if (!ts.isFunctionLike(k)) ts.forEachChild(k, walk); };
    ts.forEachChild(n.body, walk);
    return rets.length ? rets.slice(0, BRANCH_MAX) : [[]];
  }
  const parts: ts.Node[] = ts.isCallExpression(n) ? [...n.arguments] : ts.isTemplateExpression(n) ? n.templateSpans.map((t) => t.expression) : ts.isArrayLiteralExpression(n) ? [...n.elements] : [];
  if (!parts.length) return flat();
  let out: Cls[][] = [[]];
  for (const p of parts) out = out.flatMap((a) => branchesOf(p, modules, depth + 1).map((b) => [...a, ...b])).slice(0, BRANCH_MAX);
  return out;
}

/** Every multi-line field written by hand: a <textarea> (raw) or a react-aria TextArea (named, renamed or through a
 *  namespace import), with the module classes in its className and each alternative rendering of them. */
function textareas(files: Record<string, string>): Area[] {
  const out: Area[] = [];
  for (const [file, text] of Object.entries(files)) {
    const sf = parseTsx(file, text);
    const modules = cssModules(sf, file);
    const racNames = new Set<string>();
    const racSpaces = new Set<string>();
    for (const n of sf.statements) {
      if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || n.moduleSpecifier.text !== 'react-aria-components') continue;
      const b = n.importClause?.namedBindings;
      if (b && ts.isNamedImports(b)) for (const e of b.elements) if ((e.propertyName ?? e.name).text === 'TextArea') racNames.add(e.name.text);
      if (b && ts.isNamespaceImport(b)) racSpaces.add(b.name.text);
    }
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        const viaSpace = /^(\w+)\.TextArea$/.exec(tag);
        if (tag === 'textarea' || racNames.has(tag) || (viaSpace && racSpaces.has(viaSpace[1] ?? ''))) {
          const classes: Area['classes'] = [];
          let branches: Cls[][] = [[]];
          for (const a of n.attributes.properties) {
            if (ts.isJsxAttribute(a) && a.name.getText(sf) === 'className' && a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression) {
              moduleClassesIn(a.initializer.expression, modules, (cssFile, cls) => classes.push({ cssFile, cls }), true);
              branches = branchesOf(a.initializer.expression, modules);
            }
          }
          out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, raw: tag === 'textarea', classes, branches });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const THEMED = /^var\(\s*--|^(?:transparent|inherit|currentcolor)$/i;
const themed = (v: string) => THEMED.test(v.replace(/\s*!important\s*$/i, '').trim());
/** What a textarea leaves to the browser in its worst alternative: 'colour', 'background', or nothing. */
function unthemed(a: Area, read: (f: string) => string): string[] {
  const miss = new Set<string>();
  for (const b of a.branches) for (const m of unthemedSet(b, read)) miss.add(m);
  return ['colour', 'background'].filter((m) => miss.has(m));
}
/** What one set of classes leaves to the browser. */
function unthemedSet(classes: Cls[], read: (f: string) => string): string[] {
  let colour = false, background = false;
  for (const { cssFile, cls } of classes) {
    for (const r of cssRules(read(cssFile))) {
      if (r.sel.includes('::') || !styledClasses(r.sel).includes(cls)) continue; // ::placeholder and friends style other parts
      for (const d of r.decls) {
        if (d.prop === 'color' && themed(d.value)) colour = true;
        if ((d.prop === 'background' || d.prop === 'background-color') && themed(d.value.replace(/\s*!important\s*$/i, '').split(/\s+(?![^(]*\))/)[0] ?? '')) background = true;
      }
    }
  }
  return [...(colour ? [] : ['colour']), ...(background ? [] : ['background'])];
}

/** Per file outside the kit: textareas over the allowed count, and allow rows above what is found. */
function overAndStale(areas: Area[], allowed: Record<string, number>): { over: string[]; stale: string[] } {
  const counts: Record<string, number> = {};
  for (const a of areas) if (!a.file.startsWith('kit/')) counts[a.file] = (counts[a.file] ?? 0) + 1;
  const over = Object.entries(counts).filter(([f, n]) => n > (allowed[f] ?? 0)).map(([f, n]) => `${f}: ${n} (allowed ${allowed[f] ?? 0}; rows in ${allowFileOf(f)})`);
  const stale = Object.entries(allowed).filter(([f, n]) => (counts[f] ?? 0) < n).map(([f, n]) => `${f}: allowed ${n}, found ${counts[f] ?? 0}`);
  return { over, stale };
}

const found = textareas(code);

describe('textareas', () => {
  it('outside the kit, multi-line fields are the kit TextField multiline', () => {
    const { over, stale } = overAndStale(found, allowCounts('std.textarea'));
    expect.soft(over, "use TextField multiline from '@kit' (it carries the theme's colours)").toEqual([]);
    expect(stale, 'lower or remove these std.textarea rows').toEqual([]);
  });

  it('the kit\'s own textarea is among those judged', () => {
    expect(found.some((a) => a.file.startsWith('kit/'))).toBe(true);
  });

  it('every textarea sets its text colour and background from the theme', () => {
    const bad = found.flatMap((a) => {
      const miss = unthemed(a, sheet);
      return miss.length ? [`${a.file}:${a.line} leaves its ${miss.join(' and ')} to the browser`] : [];
    });
    expect(bad, 'give it a module class with color and background from var(--…) tokens').toEqual([]);
  });
});

describe('textarea readers', () => {
  const one = (tsx: string) => textareas({ 'pages/x/V.tsx': tsx });
  it('finds raw and react-aria textareas, renamed imports included', () => {
    expect(one("import s from './v.module.css';\nconst a = <textarea className={cx(s.a, on && s.b)} />;")).toMatchObject([{ raw: true, line: 2, classes: [{ cssFile: 'pages/x/v.module.css', cls: 'a' }, { cls: 'b' }] }]);
    expect(one("import { TextArea as TA } from 'react-aria-components';\nconst a = <TA />;")).toMatchObject([{ raw: false }]);
    expect(one("import s from './v.module.css';\nconst box = cx(s.box, s.mono);\nconst a = <textarea className={box} />;")).toMatchObject([{ classes: [{ cls: 'box' }, { cls: 'mono' }] }]);
    expect(one("import s from './v.module.css';\nfunction A() { const box = s.plain; return null; }\nfunction B() { const box = s.themed; return <textarea className={box} />; }")).toMatchObject([{ classes: [{ cls: 'themed' }] }]);
    expect(one("const a = <TextArea />; // not react-aria's\n// <textarea />")).toEqual([]);
    expect(one("import * as RAC from 'react-aria-components';\nconst a = <RAC.TextArea />;")).toMatchObject([{ raw: false }]);
    expect(one("import s from './v.module.css';\nconst box = s.outer;\nfunction F({ box }) { return <textarea className={box} />; }")).toMatchObject([{ branches: [[]] }]);
    expect(one("import s from './v.module.css';\nconst a = <textarea className={on ? s.a : cx(s.b, x && s.c)} />;")).toMatchObject([{ branches: [[{ cls: 'a' }], [{ cls: 'b' }], [{ cls: 'b' }, { cls: 'c' }]] }]);
  });
  it('counts per file outside the kit: over the allowed count, and rows above what is found', () => {
    const at = (file: string): Area => ({ file, line: 1, raw: true, classes: [], branches: [[]] });
    expect(overAndStale([at('pages/x/V.tsx'), at('pages/x/V.tsx'), at('kit/f/F.tsx')], { 'pages/x/V.tsx': 1 }).over).toHaveLength(1);
    expect(overAndStale([at('pages/x/V.tsx')], { 'pages/x/V.tsx': 1 })).toEqual({ over: [], stale: [] });
    expect(overAndStale([], { 'pages/x/V.tsx': 1 }).stale).toHaveLength(1);
    expect(textareas({ 'kit/f/F.tsx': '<textarea />' })).toHaveLength(1);
  });
  it('needs both a themed colour and a themed background on the textarea itself', () => {
    const area: Area = { file: 'pages/x/V.tsx', line: 1, raw: true, classes: [{ cssFile: 'v.css', cls: 'box' }], branches: [[{ cssFile: 'v.css', cls: 'box' }]] };
    const with_ = (c: string) => unthemed(area, () => c);
    expect(with_('.box { color: var(--hx-ink); background: var(--hx-fill); }')).toEqual([]);
    expect(with_('.box { color: inherit; background: transparent; }')).toEqual([]);
    expect(with_('.box { color: var(--hx-ink); }')).toEqual(['background']);
    expect(with_('.box::placeholder { color: var(--hx-faint); } .box { background-color: var(--hx-fill); }')).toEqual(['colour']);
    expect(with_('.wrap .box { color: var(--hx-ink); background: var(--hx-fill); }')).toEqual([]);
    expect(with_('.box .inner { color: var(--hx-ink); background: var(--hx-fill); }')).toEqual(['colour', 'background']);
    expect(with_('.box { color: var( --hx-ink) !important; background: currentColor !important; }')).toEqual([]);
    expect(with_('.box { color: inherit !important; background: var( --hx-fill) !important; }')).toEqual([]);
    expect(with_('.box, .other { & .inner { color: var(--hx-ink); background: var(--hx-fill); } }')).toEqual(['colour', 'background']);
  });
  it('judges each alternative of a className: an unthemed one fails', () => {
    const css = '.themed { color: var(--hx-ink); background: var(--hx-fill); } .plain { font: inherit; }';
    const of = (tsx: string) => unthemed(textareas({ 'pages/x/V.tsx': tsx })[0]!, () => css);
    expect(of("import s from './v.module.css';\nconst a = <textarea className={ready ? s.themed : s.plain} />;")).toEqual(['colour', 'background']);
    expect(of("import s from './v.module.css';\nconst a = <textarea className={ready && s.themed} />;")).toEqual(['colour', 'background']);
    expect(of("import s from './v.module.css';\nconst a = <textarea className={cx(s.themed, wide && s.plain)} />;")).toEqual([]);
    expect(of("import { TextArea } from 'react-aria-components';\nimport s from './v.module.css';\nconst a = <TextArea className={() => (ready ? s.themed : s.plain)} />;")).toEqual(['colour', 'background']);
    expect(of("import { TextArea } from 'react-aria-components';\nimport s from './v.module.css';\nconst a = <TextArea className={({ isFocused }) => { if (isFocused) return s.themed; return s.plain; }} />;")).toEqual(['colour', 'background']);
    expect(of("import { TextArea } from 'react-aria-components';\nimport s from './v.module.css';\nconst a = <TextArea className={() => s.themed} />;")).toEqual([]);
  });
});
