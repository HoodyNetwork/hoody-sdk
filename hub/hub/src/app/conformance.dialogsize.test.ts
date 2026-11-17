// Dialog size conformance. A kit Dialog is `sm`
// 480, `lg` 560 or `xl` 800, and xl is for code and tables only:
//   A. a Dialog that holds code or a table (CodeBlock, CodeEditor, DataTable, table, pre) must be xl, and only xl;
//   B. a Dialog that is xl must hold one of them (xl is not "roomy");
//   C. a page or shell class on a kit Dialog sets none of width, min/max-width, inline-size, height, min/max-height or
//      block-size: the size prop is the one way to size it.
// What it reads: every .tsx under src except tests and specs, through the TypeScript parser. A kit Dialog is a JSX tag
// `Dialog` that is not imported from react-aria-components (its own overlays use that one). `size` must be a string
// literal or a ?: of literals. A spread on a Dialog in a page or the shell is an offence unless it is (or names a const of the same
// file that is) an object literal of `key: value` and shorthand properties, read in JSX order (the last `size` or `className`
// wins), or a ?: of such literals (the optional-prop idiom `{...(c ? { outcome } : {})}`) that sets neither; the kit's own
// wrappers pass their props through. A spread resolves only from a `const` of the file that is never written (no `p.x =`,
// `p = `, `++`, `delete p.x`, `Object.assign(p, ..)`); a page or the shell may not import a kit module as a namespace
// (`import * as K from '@kit'`, so `K.CodeBlock` cannot hide). "Holds" follows a component declared at the top level of the same file (a function, or a const, also
// through an alias of either) and a const of the same file named in a JSX expression, once each; CodeBlock, CodeEditor and
// DataTable are known by what they are imported as. Out of reach, and none does it today: a component imported from
// another file that renders a code block or a table inside the dialog's children, and a size or className built by a call.
// The geometry half is kit/overlays/dialogsize.spec.ts; the scroll half is kit/overlays/Dialog.scroll.test.tsx.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { cssModules, cssRules, initializerOf, lineOf, moduleClassesIn, parseTsx, styledClasses } from './conformance/cssScan';
import { webDrawn } from './conformance/termFiles';

const SRC = join(import.meta.dirname, '..');
const WIDE = new Set(['CodeBlock', 'CodeEditor', 'DataTable', 'table', 'pre']);
const SIZE_PROP = /^(?:min-|max-)?(?:width|height|inline-size|block-size)$/;
const MAX_DEPTH = 200; // a walk this deep is refused, never skipped
const KIT_MODULE = /^@kit(?:\/|$)|(?:^|\/)kit(?:\/|$)/;
const owned = (f: string) => /^(?:pages\/[^/]+|shell)\//.test(f);

/** Every offence in the given files (path under src -> text) and owned CSS modules (path -> text), one line each. */
function scan(files: Record<string, string>, sheets: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    const sf = parseTsx(file, text);
    const modules = cssModules(sf, file);
    // Names this file binds to react-aria's Dialog: not a kit Dialog.
    const aria = new Set<string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== 'react-aria-components') continue;
      const b = st.importClause?.namedBindings;
      if (b && ts.isNamedImports(b)) for (const e of b.elements) if ((e.propertyName ?? e.name).text === 'Dialog') aria.add(e.name.text);
    }
    const kitAlias = new Set<string>(['Dialog']);
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text === 'react-aria-components') continue;
      const b = st.importClause?.namedBindings;
      if (b && ts.isNamedImports(b)) for (const e of b.elements) if (e.propertyName?.text === 'Dialog') kitAlias.add(e.name.text);
    }
    for (const a of aria) kitAlias.delete(a);
    if (owned(file)) {
      for (const st of sf.statements) {
        const b = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : undefined;
        if (b && ts.isNamespaceImport(b) && ts.isStringLiteral((st as ts.ImportDeclaration).moduleSpecifier) && KIT_MODULE.test(((st as ts.ImportDeclaration).moduleSpecifier as ts.StringLiteral).text)) {
          out.push(`${file}:${sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1} imports a kit module as a namespace: import its components by name`);
        }
      }
    }
    // What this file calls CodeBlock, CodeEditor and DataTable: an import is known by the name it imports, never by the
    // local spelling (`import { CodeBlock as Snippet }` is wide, `import { Other as CodeBlock }` is not).
    const importedAs = new Map<string, string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause) continue;
      const b = st.importClause.namedBindings;
      if (b && ts.isNamedImports(b)) for (const e of b.elements) importedAs.set(e.name.text, (e.propertyName ?? e.name).text);
      if (b && ts.isNamespaceImport(b)) importedAs.set(b.name.text, '*');
      if (st.importClause.name) importedAs.set(st.importClause.name.text, 'default');
    }
    const isWide = (tag: string): boolean => (importedAs.has(tag) ? WIDE.has(importedAs.get(tag)!) : WIDE.has(tag));
    // Top-level components of this file, by name.
    const decls = new Map<string, ts.Node>();
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer);
    }
    const holds = (root: ts.Node): { found: string | null; cut: boolean } => {
      let cut = false;
      const seen = new Map<ts.Node, number>(); // node -> shallowest depth it was walked at: a shallower revisit walks again
      let found: string | null = null;
      const walk = (n: ts.Node, depth: number): void => {
        if (found) return;
        if (depth > MAX_DEPTH) { cut = true; return; }
        const was = seen.get(n);
        if (was !== undefined && was <= depth) return;
        seen.set(n, depth);
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          const tag = n.tagName.getText(sf);
          if (isWide(tag)) { found = importedAs.get(tag) ?? tag; return; }
          const comp = /^[A-Z]/.test(tag) ? decls.get(tag) : undefined;
          if (comp) walk(comp, depth + 1);
        } else if (ts.isIdentifier(n) && !ts.isPropertyAccessExpression(n.parent) && !ts.isJsxAttribute(n.parent)) {
          if (importedAs.has(n.text) && WIDE.has(importedAs.get(n.text)!)) { found = importedAs.get(n.text)!; return; }
          const init = initializerOf(n) ?? (decls.get(n.text) && ts.isFunctionDeclaration(decls.get(n.text)!) ? decls.get(n.text) : undefined);
          if (init) walk(init, depth + 1);
        }
        ts.forEachChild(n, (k) => walk(k, depth + 1));
      };
      walk(root, 0);
      return { found, cut };
    };
    // Names this file writes to: `p = ..`, `p.x = ..`, `p[k] += ..`, `p++`, `delete p.x`, `Object.assign(p, ..)`.
    const written = new Set<string>();
    const root = (e: ts.Expression): string | null => {
      while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression;
      return ts.isIdentifier(e) ? e.text : null;
    };
    // The places an assignment target writes: itself, or every leaf of an object/array pattern (nested, with defaults, rest).
    const leaves = (e: ts.Expression): ts.Expression[] => {
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      if (ts.isObjectLiteralExpression(e)) {
        return e.properties.flatMap((q) => ts.isPropertyAssignment(q) ? leaves(q.initializer) : ts.isShorthandPropertyAssignment(q) ? [q.name] : ts.isSpreadAssignment(q) ? leaves(q.expression) : []);
      }
      if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => ts.isSpreadElement(x) ? leaves(x.expression) : ts.isOmittedExpression(x) ? [] : leaves(x));
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) return leaves(e.left); // a default: `{ a: p.x = 1 }`
      return [e];
    };
    const collect = (n: ts.Node): void => {
      let target: ts.Expression | null = null;
      if (ts.isForInStatement(n) || ts.isForOfStatement(n)) { if (!ts.isVariableDeclarationList(n.initializer)) for (const l of leaves(n.initializer)) { const r = root(l); if (r) written.add(r); } }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        for (const l of leaves(n.left)) { const r = root(l); if (r) written.add(r); }
      }
      else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) target = n.operand;
      else if (ts.isDeleteExpression(n)) target = n.expression;
      else if (ts.isCallExpression(n) && n.arguments[0] && /^Object\.(?:assign|defineProperty|defineProperties|setPrototypeOf)$/.test(n.expression.getText(sf))) target = n.arguments[0];
      const r = target && root(target);
      if (r) written.add(r);
      ts.forEachChild(n, collect);
    };
    collect(sf);
    // A name a spread may be read from: declared `const` with an initializer, and never written in this file.
    const constUnwritten = (id: ts.Identifier): boolean => {
      const init = initializerOf(id);
      const decl = init?.parent;
      return !!init && !!decl && ts.isVariableDeclaration(decl) && (ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) !== 0 && !written.has(id.text);
    };
    // The object literals a spread can be: itself, a const of the same file naming one, or either branch of a ?: of those.
    const objectsOf = (e: ts.Expression | undefined, depth = 0): ts.ObjectLiteralExpression[] | null => {
      while (e && ts.isParenthesizedExpression(e)) e = e.expression;
      if (!e || depth > 8) return null;
      if (ts.isObjectLiteralExpression(e)) return [e];
      if (ts.isIdentifier(e)) return constUnwritten(e) ? objectsOf(initializerOf(e), depth + 1) : null;
      if (ts.isConditionalExpression(e)) {
        const a = objectsOf(e.whenTrue, depth + 1), b = objectsOf(e.whenFalse, depth + 1);
        return a && b ? [...a, ...b] : null;
      }
      return null;
    };
    // A Dialog's props as the JSX renders them: attributes and static object-literal spreads in order, the last one wins.
    // null = present with no readable value (`size` alone). `bad` = a spread that cannot be read statically.
    const propsOf = (el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): { props: Map<string, ts.Expression | null>; bad: boolean } => {
      const props = new Map<string, ts.Expression | null>();
      let bad = false;
      for (const p of el.attributes.properties) {
        if (ts.isJsxAttribute(p)) {
          const init = p.initializer;
          props.set(p.name.getText(sf), !init ? null : ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) ? init.expression ?? null : null);
          continue;
        }
        const alts = objectsOf(p.expression);
        if (!alts) { bad = true; continue; }
        // One literal is applied in order. A conditional (`c ? { a } : {}`, the optional-prop idiom) must not touch size
        // or className in either branch: the rule cannot know which branch renders.
        for (const o of alts) {
          for (const q of o.properties) {
            const key = ts.isPropertyAssignment(q) && (ts.isIdentifier(q.name) || ts.isStringLiteralLike(q.name)) ? q.name.text : ts.isShorthandPropertyAssignment(q) ? q.name.text : null;
            if (key === null || (alts.length > 1 && (key === 'size' || key === 'className'))) bad = true;
            else if (alts.length === 1) props.set(key, ts.isPropertyAssignment(q) ? q.initializer : (q as ts.ShorthandPropertyAssignment).name);
          }
        }
      }
      return { props, bad };
    };
    const lits = (e: ts.Expression): string[] | null => {
      if (ts.isParenthesizedExpression(e)) return lits(e.expression);
      if (ts.isStringLiteralLike(e)) return [e.text];
      if (ts.isConditionalExpression(e)) {
        const a = lits(e.whenTrue), b = lits(e.whenFalse);
        return a && b ? [...a, ...b] : null;
      }
      return null;
    };
    const sizesOf = (props: Map<string, ts.Expression | null>): Set<string> | string => {
      if (!props.has('size')) return new Set(['sm']);
      const e = props.get('size');
      const got = e ? lits(e) : null;
      return got ? new Set(got) : 'size must be a literal or a ?: of literals';
    };
    const visit = (n: ts.Node): void => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        const open = ts.isJsxElement(n) ? n.openingElement : n;
        const tag = open.tagName.getText(sf);
        if (kitAlias.has(tag) && !aria.has(tag)) {
          const where = `${file}:${sf.getLineAndCharacterOfPosition(open.getStart(sf)).line + 1}`;
          const { props, bad } = propsOf(open);
          if (bad && owned(file)) out.push(`${where} spreads props onto a Dialog: only an object literal of the same file may be spread`);
          const sizes = sizesOf(props);
          const { found: wide, cut } = holds(n);
          if (cut && !wide) out.push(`${where} is too deep to read for code or a table: flatten it`);
          if (typeof sizes === 'string') out.push(`${where} ${sizes}`);
          else {
            const is = [...sizes].sort().join('|');
            if (wide && is !== 'xl') out.push(`${where} holds a ${wide}: size must be xl (is ${is})`);
            if (!wide && sizes.has('xl')) out.push(`${where} is xl but holds no code or table (CodeBlock, CodeEditor, DataTable, table, pre)`);
          }
          if (owned(file)) {
            const cls = props.get('className');
            if (cls) {
              moduleClassesIn(cls, modules, (cssFile, c) => {
                const css = sheets[cssFile] ?? '';
                for (const r of cssRules(css)) {
                  if (!styledClasses(r.sel).includes(c)) continue;
                  for (const d of r.decls) if (SIZE_PROP.test(d.prop)) out.push(`${where} sizes a Dialog with ${cssFile} .${c} ${d.prop} (line ${lineOf(css, d.at)}): use size`);
                }
              }, true);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const read = (keep: (f: string) => boolean): Record<string, string> => Object.fromEntries(ALL.filter(keep).map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));

describe('dialog size', () => {
  it('every kit Dialog is the size its content says: code or a table is xl, and only that', () => {
    // Terminal files skipped: dialog sizes are web layout; the terminal sizes its dialogs to the screen.
    const web = webDrawn('dialogSize', 'dialog sizes (sm..xl) are web layout; the terminal sizes a dialog to the screen');
    const tsx = read((f) => f.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(f) && web(f));
    expect(scan(tsx, read((f) => owned(f) && f.endsWith('.css')))).toEqual([]);
  });
});

// The reader on small sources: each case is one way the rule could be dodged (or blamed wrongly).
describe('dialog size reader', () => {
  const dlg = (props: string, kids: string, extra = '') => `import { Dialog, CodeBlock } from '@kit';\n${extra}\nexport const V = () => (<Dialog isOpen ${props}>${kids}</Dialog>);\n`;
  const one = (src: string, sheets: Record<string, string> = {}, file = 'pages/x/V.tsx') => scan({ [file]: src }, sheets);
  it('a CodeBlock child at lg is refused', () => {
    expect(one(dlg('size="lg"', '<CodeBlock code="a" />'))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is lg)']);
    expect(one(dlg('', '<CodeBlock code="a" />'))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is sm)']);
  });
  it('a CodeBlock inside a component declared in the same file is found', () => {
    expect(one(dlg('size="lg"', '<Inner />', `const Inner = () => <div><CodeBlock code="a" /></div>;`))).toHaveLength(1);
    expect(one(dlg('size="lg"', '<Inner />', `function Inner() { return <pre>a</pre>; }`))).toHaveLength(1);
  });
  it('a CodeBlock reached through a const of the same file is found', () => {
    expect(one(dlg('size="lg"', '{block}', `const block = <CodeBlock code="a" />;`))).toHaveLength(1);
  });
  it('size={c ? "xl" : "lg"} holding a CodeBlock is refused (every branch must be xl)', () => {
    expect(one(dlg(`size={c ? 'xl' : 'lg'}`, '<CodeBlock code="a" />'))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is lg|xl)']);
  });
  it('size={v} is refused', () => {
    expect(one(dlg('size={v}', '<p>a</p>'))).toEqual(['pages/x/V.tsx:3 size must be a literal or a ?: of literals']);
  });
  it('react-aria\'s Dialog holding a CodeBlock reports nothing', () => {
    expect(one(`import { Dialog } from 'react-aria-components';\nimport { CodeBlock } from '@kit';\nexport const V = () => (<Dialog><CodeBlock code="a" /></Dialog>);\n`)).toEqual([]);
    expect(one(`import { Dialog as D } from 'react-aria-components';\nimport { CodeBlock } from '@kit';\nexport const V = () => (<D><CodeBlock code="a" /></D>);\n`)).toEqual([]);
  });
  it('an xl dialog that holds only fields is refused', () => {
    expect(one(dlg('size="xl"', '<input />'))).toEqual(['pages/x/V.tsx:3 is xl but holds no code or table (CodeBlock, CodeEditor, DataTable, table, pre)']);
  });
  it('a page class that sets a width on a Dialog is refused', () => {
    const src = `import s from './v.module.css';\n${dlg('size="xl" className={s.wide}', '<CodeBlock code="a" />')}`;
    expect(one(src, { 'pages/x/v.module.css': '.wide { max-width: 900px; }' })).toEqual(['pages/x/V.tsx:4 sizes a Dialog with pages/x/v.module.css .wide max-width (line 1): use size']);
  });
  it('a page class that sets only padding reports nothing (the spacing test owns padding)', () => {
    const src = `import s from './v.module.css';\n${dlg('size="xl" className={s.pad}', '<CodeBlock code="a" />')}`;
    expect(one(src, { 'pages/x/v.module.css': '.pad { padding: var(--pad-surface); }' })).toEqual([]);
  });
  it('a spread on a Dialog is read in JSX order when it is an object literal, and refused otherwise', () => {
    const cb = '<CodeBlock code="a" />';
    // positive: the spread decides the size, the rule holds
    expect(one(dlg(`{...{ size: 'xl' }}`, cb))).toEqual([]);
    expect(one(dlg(`{...{ size: 'xl' }}`, '<input />'))).toEqual(['pages/x/V.tsx:3 is xl but holds no code or table (CodeBlock, CodeEditor, DataTable, table, pre)']);
    expect(one(dlg('{...p}', cb, `const p = { size: 'lg' };`))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is lg)']);
    // order: a later spread overrides an earlier attribute, a later attribute overrides an earlier spread
    expect(one(dlg(`size="xl" {...{ size: 'lg' }}`, cb))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is lg)']);
    expect(one(dlg(`{...{ size: 'lg' }} size="xl"`, cb))).toEqual([]);
    // the optional-prop idiom is fine until a branch sets size or className
    expect(one(dlg(`{...(c ? { primaryLabel: 'a', onPrimary: f } : {})}`, '<input />'))).toEqual([]);
    expect(one(dlg(`{...(c ? {} : { primaryLabel: 'a' })}`, cb))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is sm)']);
    expect(one(dlg(`{...(c ? { size: 'xl' } : {})}`, cb))).toHaveLength(2);
    expect(one(dlg(`{...(c ? { className: s.w } : {})}`, '<input />'))).toHaveLength(1);
    // the kit's own wrappers may pass props through
    expect(one(dlg('{...rest}', '<input />'), {}, 'kit/overlays/V.tsx')).toEqual([]);
    // negative: anything not statically readable is an offence of its own
    const bad = 'pages/x/V.tsx:3 spreads props onto a Dialog: only an object literal of the same file may be spread';
    expect(one(dlg('{...props}', '<input />'))).toEqual([bad]);
    expect(one(dlg('{...{ ...more }}', '<input />'))).toEqual([bad]);
    expect(one(dlg('{...{ [k]: 1 }}', '<input />'))).toEqual([bad]);
    // a className from a spread is judged like an attribute one
    const src = `import s from './v.module.css';\n${dlg('{...{ size: \'xl\', className: s.wide }}', cb)}`;
    expect(one(src, { 'pages/x/v.module.css': '.wide { max-width: 900px; }' })).toEqual(['pages/x/V.tsx:4 sizes a Dialog with pages/x/v.module.css .wide max-width (line 1): use size']);
  });
  it('CodeBlock, CodeEditor and DataTable are known by what they are imported as', () => {
    const imp = (as: string, name = 'CodeBlock') => `import { Dialog, ${name} as ${as} } from '@kit';\nexport const V = () => (<Dialog isOpen size="SZ"><${as} /></Dialog>);\n`;
    expect(one(imp('Snippet').replace('SZ', 'lg'))).toHaveLength(1);
    expect(one(imp('Snippet').replace('SZ', 'xl'))).toEqual([]);
    expect(one(imp('Grid', 'DataTable').replace('SZ', 'lg'))).toHaveLength(1);
    expect(one(imp('Ed', 'CodeEditor').replace('SZ', 'xl'))).toEqual([]);
    // an import that merely wears the name is not wide
    expect(one(imp('CodeBlock', 'Other').replace('SZ', 'lg'))).toEqual([]);
    expect(one(imp('CodeBlock', 'Other').replace('SZ', 'xl'))).toHaveLength(1);
  });
  it('a const or function alias of a component declared in the same file is followed', () => {
    const inner = `function Inner() { return <CodeBlock code="a" />; }\nconst Alias = Inner;\nconst Alias2 = Alias;`;
    expect(one(dlg('size="lg"', '<Alias />', inner))).toHaveLength(1);
    expect(one(dlg('size="lg"', '<Alias2 />', inner))).toHaveLength(1);
    expect(one(dlg('size="xl"', '<Alias2 />', inner))).toEqual([]);
    // a cycle ends, and a function with no code in it stays plain
    expect(one(dlg('size="lg"', '<A />', `const A = B;\nconst B = A;`))).toEqual([]);
    // too deep to read is an offence, not a silent skip (a 300-alias chain, then a direct use after it)
    const deep = Array.from({ length: 300 }, (_, i) => `const D${i} = ${i ? `D${i - 1}` : 'Inner'};`).join('\n');
    expect(one(dlg('size="lg"', '<D299 /><p>a</p>', `function Inner() { return <CodeBlock code="a" />; }\n${deep}`))).toEqual(['pages/x/V.tsx:303 is too deep to read for code or a table: flatten it']);
    // a long alias chain does not hide a later direct use of the same component (cycle protection is by depth, not once-only)
    const chain = Array.from({ length: 36 }, (_, i) => `const A${i} = ${i ? `A${i - 1}` : 'Inner'};`).join('\n');
    expect(one(dlg('size="lg"', '<A35 /><Inner />', `function Inner() { return <CodeBlock code="a" />; }\n${chain}`))).toHaveLength(1);
    expect(one(dlg('size="lg"', '<Alias />', `function Inner() { return <p>a</p>; }\nconst Alias = Inner;`))).toEqual([]);
  });
  it('a page or the shell may not import a kit module as a namespace; a const alias of an imported wide component is wide', () => {
    const ns = `import { Dialog } from '@kit';\nimport * as K from '@kit';\nexport const V = () => (<Dialog size="lg"><K.CodeBlock code="a" /></Dialog>);\n`;
    expect(one(ns)).toEqual(['pages/x/V.tsx:2 imports a kit module as a namespace: import its components by name']);
    expect(one(ns.replace("'@kit';\nexport", "'../../kit/data/Ids';\nexport").replace("import { Dialog } from '@kit'", "import { Dialog } from '@kit'"))).toHaveLength(1);
    // other namespaces stay fine, and so does a kit file or a test
    expect(one(`import { Dialog } from '@kit';\nimport * as React from 'react';\nexport const V = () => (<Dialog size="lg"><input /></Dialog>);\n`)).toEqual([]);
    expect(one(ns, {}, 'kit/overlays/V.tsx')).toEqual([]);
    const al = (sz: string) => `import { Dialog, CodeBlock as Snippet } from '@kit';\nconst Block = Snippet;\nexport const V = () => (<Dialog size="${sz}"><Block code="a" /></Dialog>);\n`;
    expect(one(al('lg'))).toEqual(['pages/x/V.tsx:3 holds a CodeBlock: size must be xl (is lg)']);
    expect(one(al('xl'))).toEqual([]);
    expect(one(`import { Dialog, CodeBlock as CB } from '@kit';\nconst S = CB;\nconst S2 = S;\nexport const V = () => (<Dialog size="lg"><S2 code="a" /></Dialog>);\n`)).toHaveLength(1);
  });
  it('a spread resolves only from a const that is never written in the file', () => {
    const cb = '<CodeBlock code="a" />';
    const refused = (decl: string) => one(dlg('{...p}', cb, decl)).filter((l) => l.includes('spreads props onto a Dialog')).length;
    expect(refused(`const p = { size: 'xl' };`)).toBe(0);
    expect(refused(`const p = { size: 'xl' };\nconst q = p.size;`)).toBe(0);
    expect(refused(`let p = { size: 'xl' };`)).toBe(1);
    expect(refused(`var p = { size: 'xl' };`)).toBe(1);
    expect(refused(`let p = { size: 'xl' };\np = { size: 'lg' };`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\np.size = 'lg';`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\np['size'] = 'lg';`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\nObject.assign(p, { size: 'lg' });`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\ndelete p.size;`)).toBe(1);
    // destructuring-assignment writes: object, array, nested, default, rest, and a for-of target
    expect(refused(`const p = { size: 'xl' };\n({ size: p.size } = { size: 'lg' });`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\n[p.size] = ['lg'];`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\n({ a: [{ b: p.size }] } = x);`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\n({ a: p.size = 'lg' } = x);`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\n[...p.rest] = x;`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\n({ ...p.rest } = x);`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\nfor (p.size of xs) {}`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\nfor ([p.size] of xs) {}`)).toBe(1);
    expect(refused(`const p = { size: 'xl' };\nconst { size } = p;\n({ size: q.size } = x);`)).toBe(0); // another name written
  });
  it('a kit Dialog imported under another name is still a kit Dialog', () => {
    expect(one(`import { Dialog as KitDialog, CodeBlock } from '@kit';\nexport const V = () => (<KitDialog size="lg"><CodeBlock code="a" /></KitDialog>);\n`)).toHaveLength(1);
  });
  it('a plain dialog with no code, at sm or lg, reports nothing', () => {
    expect(one(dlg('', '<input />'))).toEqual([]);
    expect(one(dlg('size="lg"', '<input />'))).toEqual([]);
  });
});
