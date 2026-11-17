// links.go-blue-do-dark.spec.ts holds every go link and text button to 4.5:1 on each surface a link can sit on. It leaves out the
// backgrounds only a control paints, under its own label: the secondary fill (--hx-sec-bg), the pressed layer
// (--hx-press) and a button's plate (--hx-btn-plate, its hover and pressed steps, the danger and the pager hover
// plates). A link or text button inside a control is interactive content inside interactive content, which HTML does
// not allow (the HTML content model). This file is the declaration-level inventory beside that
// rule, a source scan with bounded claims:
//  1. every CSS declaration that names one of these tokens is listed, one row per rule and property: any var() form (a
//     fallback included), through any custom property set from one (followed across files, to a fixpoint), in any
//     rule (one with no class is a row too). The CSS is read by postcss: a declaration
//     beside a nested rule is seen, a nested rule's selector is resolved against its parent (`&`, or a descendant when
//     it has none), and the at-rules around a declaration (name and condition) lead its row, its value ends it. A new
//     painter, a new rule of a known one, a known one moved under a new condition, or a changed value changes the list.
//  2. no Link, TextButton, ExtLink or PageLinkTo is drawn inside a button (the kit Button family, react-aria's,
//     <button>) or inside an element given a painted class, nor given one itself: as a child or in a prop. A tag is
//     read by its import identity: an alias (`Button as Action`, `Link as Go`) and a namespace member (`<Kit.Link>`,
//     `<Kit.Button>`) count as what they import; react-aria's own Link is a control, not a link look. CSS modules
//     are resolved per file, through a relative path or a tsconfig path alias (`@kit/...`), with default, named-default
//     and namespace imports (`n.tiles`, `n.default.tiles`); :global classes match by name.
//  3. no rule lays a band tint and one of these tokens together (in one declaration or two).
// A className held in a const in scope is read through it (the nearest const of the name, to any depth of consts).
// Not seen by this scan (so not claimed): a link handed to a control through a variable, a re-export or a wrapper
// component, a className built in another file and passed in (a prop, a function's return), a className reached
// through a JSX spread (`{...props}`, `{...{ className: s.tiles }}`), a class reached through a computed key, and a
// painted surface composed across a parent and a child element (two rules each harmless alone). The rendered check of the same
// rule does not exist yet.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import postcss, { type Container, type Node as CssNode } from 'postcss';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
// The control-only surfaces: the secondary fill, the pressed layer, and every step of a button's plate.
const BASE = ['--hx-sec-bg', '--hx-press', '--hx-btn-plate', '--hx-btn-plate-hover', '--hx-btn-plate-press', '--hx-btn-danger-hover', '--hx-btn-pager-hover'];
const TINTS = /var\(\s*--hx-(warn-t|danger-t)(?![\w-])/;
const LINKS = new Set(['Link', 'TextButton', 'ExtLink', 'PageLinkTo', 'ComputerLink']);
// A button of any kind: the kit Button family (Button, LinkButton, IconButton, CopyButton, ...), react-aria's
// (imported as AriaButton, ToggleButton) and a plain <button>. TextButton is a link look, checked as one.
const isButtonTag = (tag: string): boolean => tag !== 'TextButton' && (tag === 'button' || /^(?:[A-Z]\w*)?Button$/.test(tag));

const sources = (ext: RegExp): string[] =>
  (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.split('\\').join('/'))
    .filter((f) => ext.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.includes('node_modules/'))
    .sort();

const noComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Splits on `sep` outside parentheses. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && sep.test(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The classes of a selector's subject (its last compound), those inside :is()/:where()/:global() included and those
 *  inside :not()/:has() left out; `global` holds the ones written inside :global(). */
function subjectClasses(selector: string): { local: string[]; global: string[] } {
  const local: string[] = [];
  const global: string[] = [];
  for (const one of splitTop(selector, /,/)) {
    const parts = splitTop(one, /[\s>+~]/);
    const last = parts[parts.length - 1] ?? '';
    const stack: string[] = [];
    for (let i = 0; i < last.length; i++) {
      const fn = /^:([\w-]+)\(/.exec(last.slice(i));
      if (fn) {
        stack.push(fn[1]!);
        i += fn[0].length - 1;
      } else if (last[i] === '(') stack.push('');
      else if (last[i] === ')') stack.pop();
      else if (last[i] === '.' && !stack.some((k) => k === 'not' || k === 'has')) {
        const name = /^\.([\w-]+)/.exec(last.slice(i))?.[1];
        if (name) {
          (stack.includes('global') ? global : local).push(name);
          i += name.length;
        }
      }
    }
  }
  return { local, global };
}

/** One declaration as read by postcss: its rule's selector (nested ones resolved against their parents), the at-rules
 *  around it (outermost first), its property and value. */
interface Decl {
  sel: string;
  at: string;
  prop: string;
  value: string;
}

const oneLine = (s: string): string => s.split(/\s+/).join(' ').trim();

/** The selector a rule applies with: its own, nested in its parent rule's (`&` stands for the parent, a selector with
 *  no `&` is a descendant of it); at-rules in between are passed through. Empty outside any rule. */
function selectorOf(n: CssNode | undefined): string {
  if (!n || n.type === 'root' || n.type === 'document') return '';
  const up = selectorOf(n.parent as CssNode | undefined);
  if (n.type !== 'rule') return up;
  const own = oneLine((n as unknown as { selector: string }).selector);
  if (!up) return own;
  return splitTop(own, /,/)
    .map((x) => (x.includes('&') ? x.split('&').join(`:is(${up})`) : `:is(${up}) ${x}`))
    .join(', ');
}

/** The at-rules around a node, outermost first: `@media (hover: hover) @supports (...)`. */
function atRulesOf(n: CssNode): string {
  const out: string[] = [];
  for (let p = n.parent as Container | undefined; p; p = p.parent as Container | undefined)
    if (p.type === 'atrule') out.unshift(oneLine(`@${(p as unknown as { name: string }).name} ${(p as unknown as { params: string }).params}`));
  return out.join(' ');
}

/** Every declaration of a CSS file. */
function declsOf(css: string): Decl[] {
  const out: Decl[] = [];
  postcss.parse(css).walkDecls((d) => {
    out.push({ sel: selectorOf(d.parent), at: atRulesOf(d), prop: d.prop, value: oneLine(noComments(d.value)) });
  });
  return out;
}

/** A row's place: the at-rules (when any) then the selector. */
const placeOf = (d: Decl): string => (d.at ? `${d.at} | ${d.sel}` : d.sel);
/** An inventory row: file, place, property and the value (one line, comments out), so a changed fallback changes the row. */
const rowOf = (f: string, d: Decl): string => `${f} | ${placeOf(d)} | ${d.prop}: ${d.value}`;

const names = (props: Iterable<string>): RegExp => new RegExp(`var\\(\\s*(${[...props].map((p) => p.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`);

const CSS = sources(/\.css$/).map((f) => [f, declsOf(readFileSync(join(SRC, f), 'utf8'))] as const);

/** The base tokens and every custom property whose value reaches one (any file, to a fixpoint). */
function tainted(): Set<string> {
  const set = new Set(BASE);
  for (let grew = true; grew; ) {
    grew = false;
    const re = names(set);
    for (const [, ds] of CSS)
      for (const { prop: p, value: v } of ds)
        if (p.startsWith('--') && !set.has(p) && re.test(v)) {
          set.add(p);
          grew = true;
        }
  }
  return set;
}

const TAINT = tainted();
const PAINTS = names(TAINT);

/** `file | selector | property: value` for every declaration that names a token or a custom property set from one; and the
 *  painted classes per file. The tokens' own definitions (a :root or theme block setting a base token) are not
 *  painters. */
function inventory(): { rows: string[]; local: Map<string, Set<string>>; global: Set<string> } {
  const rows: string[] = [];
  const local = new Map<string, Set<string>>();
  const global = new Set<string>();
  for (const [f, ds] of CSS)
    for (const d of ds) {
      if (BASE.includes(d.prop) || !PAINTS.test(d.value)) continue;
      rows.push(rowOf(f, d));
      const c = subjectClasses(d.sel);
      const set = local.get(f) ?? new Set<string>();
      for (const x of c.local) set.add(x);
      local.set(f, set);
      for (const x of c.global) global.add(x);
    }
  return { rows, local, global };
}

const tagOf = (n: ts.JsxOpeningLikeElement): string => n.tagName.getText();

/** The hub's tsconfig path aliases that map a prefix to a source directory (`@kit/*` -> `kit/`). */
const ALIASES: Array<[string, string]> = (() => {
  const cfg = ts.readConfigFile(join(SRC, '..', 'tsconfig.json'), ts.sys.readFile).config as { compilerOptions?: { paths?: Record<string, string[]> } };
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(cfg.compilerOptions?.paths ?? {}))
    if (k.endsWith('/*') && v.length === 1 && v[0]!.startsWith('./src/') && v[0]!.endsWith('/*')) out.push([k.slice(0, -1), v[0]!.slice('./src/'.length, -1)]);
  return out;
})();

/** A CSS import's file under SRC: a relative path, or a path alias. */
function cssFile(f: string, spec: string): string | undefined {
  if (spec.startsWith('.')) return relative(SRC, resolve(dirname(join(SRC, f)), spec)).split('\\').join('/');
  for (const [prefix, dir] of ALIASES) if (spec.startsWith(prefix)) return dir + spec.slice(prefix.length);
  return undefined;
}

/** `file:line <Link> inside <Tag>` (or `<Link> painted`) for every link look drawn inside a button or a painted element
 *  of one TSX file, or given a painted class itself. */
function linksInsidePainters(f: string, text: string, inv: ReturnType<typeof inventory>): string[] {
  const found: string[] = [];
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const painted = new Map<string, Set<string>>(); // CSS-module binding -> painted classes
  // Import identity: a local name, or a namespace binding, to what it imports and from where
  // (react-aria or not). A tag is read as what it imports, so an alias or a namespace member counts as the original.
  const named = new Map<string, { name: string; ra: boolean }>();
  const spaces = new Map<string, boolean>(); // namespace binding -> from react-aria
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const clause = st.importClause;
    const nb = clause?.namedBindings;
    const ra = spec.startsWith('react-aria');
    if (!spec.endsWith('.css')) {
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) named.set(el.name.text, { name: (el.propertyName ?? el.name).text, ra });
      if (nb && ts.isNamespaceImport(nb)) spaces.set(nb.name.text, ra);
      continue;
    }
    const file = cssFile(f, spec);
    const cls = file === undefined ? undefined : inv.local.get(file);
    if (!cls) continue;
    const bindings: string[] = [];
    if (clause?.name) bindings.push(clause.name.text);
    if (nb && ts.isNamespaceImport(nb)) bindings.push(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if ((el.propertyName ?? el.name).text === 'default') bindings.push(el.name.text);
    for (const b of bindings) painted.set(b, cls);
  }
  /** A tag's identity: its imported name, and whether react-aria is its source. */
  const identity = (tag: string): { name: string; ra: boolean } => {
    const dot = tag.indexOf('.');
    if (dot > 0 && spaces.has(tag.slice(0, dot))) return { name: tag.slice(dot + 1), ra: spaces.get(tag.slice(0, dot))! };
    return named.get(tag) ?? { name: tag, ra: false };
  };
  // The kit's link looks only: react-aria's own Link (a menu row, a nav item, a LinkButton) is a control, not one.
  const isLink = (tag: string): boolean => {
    const id = identity(tag);
    return LINKS.has(id.name) && !id.ra;
  };
  const isButton = (tag: string): boolean => isButtonTag(identity(tag).name);
  // A class held in a const (`const painted = s.tiles; <div className={painted}>`) is read
  // through it: each name the className reads is resolved in its own scope, to the nearest enclosing `const` of that name
  // (a parameter, a function or a let/var of the name hides it: not followed), and that initializer is read the same way,
  // each declaration once.
  const constOf = (id: ts.Identifier): ts.VariableDeclaration | undefined => {
    for (let a: ts.Node | undefined = id.parent; a; a = a.parent) {
      if (ts.isFunctionLike(a) && a.parameters.some((x) => ts.isIdentifier(x.name) && x.name.text === id.text)) return undefined;
      const stmts = ts.isBlock(a) || ts.isSourceFile(a) || ts.isModuleBlock(a) || ts.isCaseClause(a) || ts.isDefaultClause(a) ? a.statements : undefined;
      for (const st of stmts ?? []) {
        if (ts.isFunctionDeclaration(st) && st.name?.text === id.text) return undefined;
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.name.text === id.text) return st.declarationList.flags & ts.NodeFlags.Const && d.initializer ? d : undefined;
      }
    }
    return undefined;
  };
  const expand = (root: ts.Node): string => {
    let out = root.getText();
    const seen = new Set<ts.VariableDeclaration>();
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
        const d = constOf(n);
        if (d && !seen.has(d)) {
          seen.add(d);
          out += ` ${d.initializer!.getText()}`;
          visit(d.initializer!);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return out;
  };
  const hasPainted = (n: ts.JsxOpeningLikeElement): boolean => {
    for (const a of n.attributes.properties) {
      if (!ts.isJsxAttribute(a) || a.name.getText() !== 'className' || !a.initializer) continue;
      const v = expand(a.initializer);
      for (const [alias, cls] of painted) for (const c of cls) if (new RegExp(`\\b${alias}(?:\\.default)?(\\.${c}\\b|\\[['"\`]${c}['"\`]\\])`).test(v)) return true;
      for (const c of inv.global) if (new RegExp(`['"\` ]${c}['"\` ]`).test(v)) return true;
    }
    return false;
  };
  const walk = (n: ts.Node, inside: string | null): void => {
    let here = inside;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const open = ts.isJsxElement(n) ? n.openingElement : n;
      const tag = tagOf(open);
      const line = () => sf.getLineAndCharacterOfPosition(open.getStart()).line + 1;
      if (isLink(tag)) {
        if (here) found.push(`${f}:${line()} <${tag}> inside <${here}>`);
        else if (hasPainted(open)) found.push(`${f}:${line()} <${tag}> painted`);
      }
      if (!here && (isButton(tag) || hasPainted(open))) here = tag;
    }
    ts.forEachChild(n, (c) => walk(c, here));
  };
  walk(sf, null);
  return found;
}

describe('contrast surfaces: no link or text button sits on the secondary fill, a pressed layer or a button plate', () => {
  const inv = inventory();

  it('only the custom properties known here carry the tokens', () => {
    // --plate: the one property a kit button paints its fill from (Button.module.css; a kit part retints a button
    // through it). --strip-band: the Computers strip's band.
    expect([...TAINT].sort()).toEqual([...BASE, '--plate', '--strip-band'].sort());
  });

  it('every declaration that paints one of the tokens is a known one', () => {
    expect(inv.rows).toEqual(PAINTERS);
  });

  it('no Link, TextButton, ExtLink or PageLinkTo is drawn inside a button or a painted element, nor painted itself', () => {
    expect(sources(/\.tsx$/).flatMap((f) => linksInsidePainters(f, readFileSync(join(SRC, f), 'utf8'), inv))).toEqual([]);
  });

  it('no rule lays a band tint and either token together', () => {
    const found: string[] = [];
    for (const [f, ds] of CSS) {
      const byRule = new Map<string, string[]>();
      for (const d of ds) byRule.set(placeOf(d), [...(byRule.get(placeOf(d)) ?? []), `${d.prop}: ${d.value}`]);
      for (const [place, vs] of byRule) if (TINTS.test(vs.join(';')) && PAINTS.test(vs.join(';'))) found.push(`${f} ${place}`);
    }
    expect(found).toEqual([]);
  });

  // The scans must see what they claim to see: each shape below is planted and must be found.
  it('the scans are live', () => {
    expect(subjectClasses('.a:is(.b, .c):not(.d) > .e:where(.f)').local.sort()).toEqual(['e', 'f']);
    expect(subjectClasses('.a, :global(.g) .h:is(.i)').local.sort()).toEqual(['a', 'h', 'i']);
    expect(subjectClasses(':global(.g)').global).toEqual(['g']);
    expect(PAINTS.test('var(--hx-press, transparent)')).toBe(true);
    expect(PAINTS.test('var( --hx-sec-bg)')).toBe(true);
    expect(PAINTS.test('var(--hx-press-x)')).toBe(false);
    expect(PAINTS.test('var(--strip-band)')).toBe(true);
    const f = 'pages/computers/x.tsx';
    const head = "import s from './parts/parts.module.css';\nimport { Link as Go } from '@kit';\nimport * as n from './parts/parts.module.css';\n";
    expect(linksInsidePainters(f, "import { Link } from 'react-aria-components';\nimport s from './parts/parts.module.css';\nconst a = <Link className={s.tiles} />;", inv)).toEqual([]);
    const scan = (body: string) => linksInsidePainters(f, `${head}${body}`, inv);
    expect(scan('const a = <Button><span><Link href="/">x</Link></span></Button>;')).toEqual([`${f}:4 <Link> inside <Button>`]);
    expect(scan('const a = <AriaButton aria-label={<TextButton />} />;')).toEqual([`${f}:4 <TextButton> inside <AriaButton>`]);
    expect(scan('const a = <div className={cx(s.tiles)}><ExtLink href="/" /></div>;')).toEqual([`${f}:4 <ExtLink> inside <div>`]);
    expect(scan('const a = <div className={n.tiles}><Go href="/" /></div>;')).toEqual([`${f}:4 <Go> inside <div>`]);
    expect(scan('const a = <PageLinkTo page="x" className={s.tiles} />;')).toEqual([`${f}:4 <PageLinkTo> painted`]);
    expect(scan('const a = <div className={s.tile}><PageLinkTo page="x" /></div>;')).toEqual([]);
    // Import identities, path aliases and a namespace's default.
    const head2 = [
      "import * as Kit from '@kit';",
      "import { Button as Action, TextButton as Act } from '@kit';",
      "import * as RA from 'react-aria-components';",
      "import b from '@kit/controls/Button.module.css';",
      "import * as n from './parts/parts.module.css';",
      '',
    ].join('\n');
    const scan2 = (body: string) => linksInsidePainters(f, `${head2}${body}`, inv);
    expect(scan2('const a = <div className={n.default.tiles}><Kit.Link href="/" /></div>;')).toEqual([`${f}:6 <Kit.Link> inside <div>`]);
    expect(scan2('const a = <Kit.Button><Act /></Kit.Button>;')).toEqual([`${f}:6 <Act> inside <Kit.Button>`]);
    expect(scan2('const a = <Action><Kit.TextButton /></Action>;')).toEqual([`${f}:6 <Kit.TextButton> inside <Action>`]);
    expect(scan2('const a = <span className={b.button}><Kit.ExtLink href="/" /></span>;')).toEqual([`${f}:6 <Kit.ExtLink> inside <span>`]);
    expect(PAINTS.test('var(--plate)')).toBe(true);
    expect(PAINTS.test('var(--plate-line)')).toBe(false);
    expect(PAINTS.test('var(--hx-btn-plate-hover)')).toBe(true);
    expect(PAINTS.test('var(--hx-btn-line)')).toBe(false);
    expect(scan2('const a = <RA.Link className={n.tiles} />;')).toEqual([]);
    // A class held in a local const is followed, through a chain of consts; a spread is the stated boundary.
    expect(scan2('const painted = n.tiles;\nconst a = <div className={painted}><Kit.Link href="/" /></div>;')).toEqual([`${f}:7 <Kit.Link> inside <div>`]);
    expect(scan2('const base = n.tiles;\nconst both = cx(base, x);\nconst a = <div className={both}><Act /></div>;')).toEqual([`${f}:8 <Act> inside <div>`]);
    expect(scan2('const plain = n.tile;\nconst a = <div className={plain}><Act /></div>;')).toEqual([]);
    expect(scan2('const a = <div {...{ className: n.tiles }}><Act /></div>;'), 'a spread is not read (header: not claimed)').toEqual([]);
    // The const is resolved in scope, so a same-named const in another function neither hides nor stands in.
    const two = (first: string, second: string) =>
      scan2(`function A() {\n  const painted = ${first};\n  return <div className={painted}><Act /></div>;\n}\nfunction B() {\n  const painted = ${second};\n  return <div className={painted}><Act /></div>;\n}`);
    expect(two('n.tiles', 'n.tile')).toEqual([`${f}:8 <Act> inside <div>`]);
    expect(two('n.tile', 'n.tiles')).toEqual([`${f}:12 <Act> inside <div>`]);
    expect(scan2('const painted = n.tiles;\nfunction A(painted: string) {\n  return <div className={painted}><Act /></div>;\n}'), 'a parameter hides the outer const').toEqual([]);
    expect(scan2('const painted = n.tile;\nfunction A() {\n  const painted = n.tiles;\n  return <div className={painted}><Act /></div>;\n}'), 'the nearest const wins').toEqual([`${f}:9 <Act> inside <div>`]);
    expect(scan2('let painted = n.tiles;\nconst a = <div className={painted}><Act /></div>;'), 'a let is not followed (it can change)').toEqual([]);
    // The CSS reader: a declaration beside a nested rule, a nested selector resolved, the at-rules leading the place.
    const css = declsOf('.a { color: red; &[data-pressed] { background: var(--hx-press); } .b { color: x } background: var(--hx-sec-bg); }\n@media (hover: hover) { @supports (color: red) { .c { background: var(--hx-press) } } }');
    // A changed value alone changes the row.
    const [r1, r2] = ['transparent', 'red'].map((v) => declsOf(`.p { background: var(--hx-press, ${v}); }`).map((d) => rowOf('x.css', d)));
    expect(r1).toEqual(['x.css | .p | background: var(--hx-press, transparent)']);
    expect(r2).not.toEqual(r1);
    expect(css.filter((d) => PAINTS.test(d.value)).map((d) => `${placeOf(d)} | ${d.prop}`)).toEqual([
      ':is(.a)[data-pressed] | background',
      '.a | background',
      '@media (hover: hover) @supports (color: red) | .c | background',
    ]);
    expect(subjectClasses(selectorOf((postcss.parse('.a { .b & { x: y } }').first as Container).first)).local.sort()).toEqual(['a']);
  });
});

// The inventory (declaration level). A new row is a new surface under a control's own label, or a new place a link
// could land: check it against the HTML content model before adding it, and if a link or text button can sit on it, add
// the surface to links.go-blue-do-dark.spec.ts's matrix instead.
const PAINTERS: readonly string[] = [
  "kit/agent/StepTrail.module.css | .stepRow[data-pressed] | background: var(--hx-press)", // a pressed step row of a turn's trail: the tint is the row's own fill, it holds a mark, the step's kind, its input and its time, no link
  "kit/controls/Button.module.css | .button | --plate: var(--hx-btn-plate)", // every kit button's plate at rest: under the button's own label
  "kit/controls/Button.module.css | .button | background: linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--plate-cut-grow)), var(--plate) calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--plate-cut-grow))) padding-box, linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - var(--plate-cut-soft)), var(--plate-line) calc(var(--plate-cut-at) + var(--plate-cut-soft))) border-box",
  "kit/controls/Button.module.css | .button[data-hovered] | --plate: var(--hx-btn-plate-hover)",
  "kit/controls/Button.module.css | .button[data-pressed] | --plate: var(--hx-btn-plate-press)",
  "kit/controls/Button.module.css | .danger:is([data-hovered], [data-pressed]), .dangerSolid:is([data-hovered], [data-pressed]) | --plate: var(--hx-btn-danger-hover)",
  "kit/controls/Button.module.css | .primary:is([data-disabled], [aria-disabled='true']):not([data-pending]) | --plate: var(--hx-btn-plate)",
  "kit/controls/Button.module.css | .button.bubble | background: linear-gradient(var(--plate-angle), transparent var(--plate-cut-at), var(--plate) var(--plate-cut-at))", // the bubble paints the same --plate without a frame layer (its fill is --hx-bubble-plate or the accent)
  "kit/controls/Button.module.css | .iconOnly.ghost:not(.more, .toolbar, .inStrip)[data-hovered] | --plate: var(--hx-btn-plate)",
  "kit/controls/Button.module.css | .iconOnly.ghost:not(.more, .toolbar, .inStrip)[data-pressed] | --plate: var(--hx-btn-plate-hover)",
  "kit/controls/Button.module.css | .button.pressed:not(.iconOnly) | --plate: var(--hx-btn-plate-press)",
  "kit/controls/Button.module.css | .button.iconOnly.pressed | --plate: var(--hx-btn-plate-press)", // a toggled framed icon button: an icon on the pressed step, no link or text on it
  "kit/controls/Button.module.css | .button.toolbar.pressed | --plate: var(--hx-btn-plate-press)",
  "kit/controls/ListItemButton.module.css | .item[data-pressed] | background: var(--hx-press)", // a pressed list row (the model chooser's provider rows): the tint is the row's own fill, it holds a mark, its name and its facts, no link
  "kit/controls/SideTabs.module.css | .row[data-pressed] | background: var(--hx-press)", // a pressed side tab: the tint is the row's own fill, it holds only its label, no link
  "kit/controls/SideTabs.module.css | .row[data-picked][data-pressed] | background: linear-gradient(var(--hx-press), var(--hx-press)), var(--hx-plate-bg)", // the picked side tab keeps its panel fill under the press tint; it holds only its label, no link
  "kit/data/DataTable.module.css | .chipWrap | --plate: var(--hx-btn-plate)", // a table filter chip is a button plate: it holds the chip's own buttons, never a link
  "kit/data/DataTable.module.css | .chipWrap | background: linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--btn-cut-line-grow)), var(--plate) calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--btn-cut-line-grow))) padding-box, linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - var(--btn-cut-line-soft)), var(--plate-line) calc(var(--plate-cut-at) + var(--btn-cut-line-soft))) border-box",
  "kit/data/DataTable.module.css | .chipWrap:has([data-hovered]) | --plate: var(--hx-btn-plate-hover)",
  "kit/data/DataTable.module.css | .chipWrap:has([data-pressed]) | --plate: var(--hx-btn-plate-press)",
  "kit/data/DataTable.module.css | .chipOn .chipX[data-hovered], .chipOn .chipX[data-pressed] | background: linear-gradient(var(--plate-angle), transparent calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--btn-cut-line-grow)), var(--hx-btn-plate-press) calc(var(--plate-cut-at) - 0.414 * var(--bw) + var(--btn-cut-line-grow)))", // a set chip's clear button under the pointer: it holds an x, never a link
  "kit/data/DataTable.module.css | .groupRow > td | background: var(--hx-sec-bg)", // a group header's band; it holds the header
  // button (label, count) and status pills (`extra`), never a link: the group note is its own unpainted row
  "kit/data/DataTable.module.css | .footer .pager button[data-hovered]:not([data-pressed]) | --plate: var(--hx-btn-pager-hover)", // a frameless pager arrow under the pointer
  "kit/data/Ids.module.css | .stepLine > button.copyCell.lineCopy[data-hovered], .codeInline > button.copyCell.codeInlineCopy[data-hovered] | --plate: var(--hx-btn-plate-hover)", // the step line's and the inline code line's copy cell, an icon button; no link sits on it
  "kit/data/Ids.module.css | .stepLine > button.copyCell.lineCopy[data-pressed], .codeInline > button.copyCell.codeInlineCopy[data-pressed] | --plate: var(--hx-btn-plate-press)",
  "kit/overlays/Menu.module.css | .item[data-pressed] | background: var(--hx-press)",
  "pages/computers/parts/parts.module.css | .tiles | --strip-band: var(--hx-sec-bg)",
  "pages/computers/parts/parts.module.css | .tiles | background: var(--strip-band)",
  "pages/computers/parts/parts.module.css | .stripCell > .stripActions | background-color: var(--strip-band)",
  "shell/BottomNav.module.css | .tab[data-pressed] | background: var(--hx-press)",
  "shell/Sidebar.module.css | .item[data-pressed] | background: var(--hx-press)",
  "shell/Switchers.module.css | .sheetItem[data-pressed] | background: var(--hx-press)",
];
