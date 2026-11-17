// Kit purity conformance: the production build marks every kit TS module side-effect free
// (vite.config.mts kitPure()), so a kit module nothing uses is dropped even when the '@kit' barrel imports it. That is
// only safe while loading a kit module does nothing but define things. This test parses every kit module and fails
// when one outside KIT_IMPURE is not made only of the allowlisted forms below, or binds a CSS module that is not.
// It also fails on a KIT_IMPURE entry that is gone or has become pure, so the list stays true.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import postcss, { type ChildNode, type Container, type Rule } from 'postcss';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { webBuilt } from '../app/conformance/termFiles';

const SRC = join(import.meta.dirname, '..');
const CONFIG = join(SRC, '..', 'vite.config.mts');

/** KIT_IMPURE as written in vite.config.mts, read from its syntax tree (the test never loads Vite). */
function kitImpure(): string[] {
  const sf = ts.createSourceFile(CONFIG, readFileSync(CONFIG, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== 'KIT_IMPURE') continue;
      let init = d.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression;
      if (!init || !ts.isArrayLiteralExpression(init)) throw new Error('KIT_IMPURE is not an array literal');
      return init.elements.map((e) => {
        if (!ts.isStringLiteral(e)) throw new Error('KIT_IMPURE holds a non-string entry');
        return e.text;
      });
    }
  }
  throw new Error('vite.config.mts has no KIT_IMPURE');
}

/** The modules kitPure() marks: kit TS sources, never tests, specs, declaration files or the dev-only gallery. */
function kitModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'gallery') walk(p); }
      else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(e.name)) out.push(relative(SRC, p).split(sep).join('/'));
    }
  };
  walk(join(SRC, 'kit'));
  return out.sort();
}

// A FAIL-CLOSED ALLOWLIST. A module counts as pure only when every top-level statement, and every rule of the CSS
// module it binds, is one of the forms named below. Anything else is "not pure": the module goes into KIT_IMPURE and
// the build keeps it. That is the safe direction, so a form missing from the list only costs bytes.
//
// Top-level statements:
//   S1 an import with bindings (a bare import is an effect)
//   S2 export { ... } / export * re-exports, interfaces, type aliases, declare forms, type-only namespaces
//   S3 a function declaration (its body runs only when called)
//   S4 a class declaration: no decorators, no static blocks, no computed member names, no extends (implements is a
//      type), static field initializers in V
//   S5 const/let/var name = V (never using / await using, never a destructuring pattern); export default V
// Values (V):
//   V1 a primitive literal (string, number, bigint, boolean, null, regex, untagged template without substitutions);
//      -<number>
//   V2 an arrow function or function expression (defined, not run)
//   V3 an identifier (reading a binding runs nothing)
//   V4 an array literal of V; an object literal of plain or method properties with literal keys and V values (no
//      spreads, getters, setters or computed keys)
//   V5 a template whose substitutions are primitive literals or module-local primitive consts
//   V6 a property read of a value import (any chain; element access with a primitive literal key). No builtin
//      property read at all: no pure kit module needs one, and a builtin accessor (Function.caller) throws
//   V7 a ? b : c, a && b, a || b, a ?? b over V (truthiness never runs user code); + - * / % only between number
//      literals and consts initialised to one
//   V8 a call to React's createContext/forwardRef/memo/lazy (by its exported name, imported from 'react') with V
//      arguments; Object.freeze(<V4 literal>); Symbol(<string>) / Symbol.for(<string>); new Map/Set/WeakMap/WeakSet()
//      with no argument; new Set(<array literal of V>)
//   V9 as/satisfies/!/parentheses around V
// Trusted: a value import is a plain value (V3, V6). A type-only import is no import.
//
// CSS rules of a bound module:
//   C0 a selector holds no comment and no quote (an attribute value is written unquoted)
//   C1 every selector has a compound with its own plain local class (or & under a local parent), and after that
//      compound the selector goes down the tree (descendant or child) before any sibling step. Pseudo-classes and
//      pseudo-elements may filter a compound; what is inside their parentheses never counts as a class.
//   C2 @media, @supports, @container around C rules; @keyframes with a plain name; composes without from
//   Not allowed: :global, escapes (\), any other at-rule (@layer, @font-face, @import, @property, ...).

const REACT_HELPERS = new Set(['createContext', 'forwardRef', 'memo', 'lazy']);

/** What a module binds at top level. */
interface Scope {
  /** every top-level value binding: imports, functions, classes, variables (destructured names too), enums, namespaces */
  bound: Set<string>;
  /** import bindings */
  imports: Set<string>;
  /** local name -> React export, for `import { memo as x } from 'react'` */
  reactNamed: Map<string, string>;
  /** default or namespace imports of 'react' */
  reactObject: Set<string>;
  /** consts holding a primitive literal (V5 template substitutions) */
  primitives: Set<string>;
  /** consts holding a number literal (V7 arithmetic) */
  numbers: Set<string>;
}

const unwrap = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) ? unwrap(e.expression) : e);

/** V1: a primitive literal. */
function primitive(e: ts.Expression): boolean {
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNumericLiteral(x) || ts.isBigIntLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isRegularExpressionLiteral(x)) return true;
  if (x.kind === ts.SyntaxKind.TrueKeyword || x.kind === ts.SyntaxKind.FalseKeyword || x.kind === ts.SyntaxKind.NullKeyword) return true;
  return ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(x.operand);
}

/** A number literal, or a negated one. */
function numberLiteral(e: ts.Expression): boolean {
  const x = unwrap(e);
  return ts.isNumericLiteral(x) || (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(x.operand));
}

const isConst = (st: ts.VariableStatement): boolean => (st.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const;

function bindingNames(n: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(n)) { out.add(n.text); return; }
  for (const el of n.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
}

function moduleScope(sf: ts.SourceFile): Scope {
  const s: Scope = { bound: new Set(), imports: new Set(), reactNamed: new Map(), reactObject: new Set(), primitives: new Set(), numbers: new Set() };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      // A type-only import binds no runtime value, so it earns no trust; its name still counts as bound.
      const react = st.moduleSpecifier.text === 'react' && !c.isTypeOnly;
      const value = (name: string, typeOnly: boolean): void => { s.bound.add(name); if (!typeOnly) s.imports.add(name); };
      if (c.name) { value(c.name.text, c.isTypeOnly); if (react) s.reactObject.add(c.name.text); }
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) { value(nb.name.text, c.isTypeOnly); if (react) s.reactObject.add(nb.name.text); }
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          value(el.name.text, c.isTypeOnly || el.isTypeOnly);
          if (react && !el.isTypeOnly) s.reactNamed.set(el.name.text, (el.propertyName ?? el.name).text);
        }
      }
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        bindingNames(d.name, s.bound);
        if (isConst(st) && ts.isIdentifier(d.name) && d.initializer) {
          if (primitive(d.initializer)) s.primitives.add(d.name.text);
          if (numberLiteral(d.initializer)) s.numbers.add(d.name.text);
        }
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
      s.bound.add(st.name.text);
    } else if (ts.isModuleDeclaration(st) && ts.isIdentifier(st.name)) {
      s.bound.add(st.name.text);
    }
  }
  return s;
}

const ARITHMETIC = new Set([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken]);

/** A number literal, a const initialised to one, or arithmetic over those: an operator on it runs no toString/valueOf
 *  and cannot throw. */
function primitiveOperand(e: ts.Expression, s: Scope): boolean {
  const x = unwrap(e);
  if (numberLiteral(x)) return true;
  if (ts.isIdentifier(x)) return s.numbers.has(x.text);
  return ts.isBinaryExpression(x) && ARITHMETIC.has(x.operatorToken.kind) && primitiveOperand(x.left, s) && primitiveOperand(x.right, s);
}

/** Whether evaluating e is one of the V forms; the reason it is not goes to why. */
function value(e: ts.Expression | undefined, why: string[], s: Scope): boolean {
  if (!e) return true;
  const v = (x: ts.Expression): boolean => value(x, why, s);
  const no = (reason: string): boolean => { why.push(reason); return false; };
  const x = unwrap(e);
  if (primitive(x) || ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isIdentifier(x)) return true;
  if (ts.isArrayLiteralExpression(x)) return x.elements.every((el) => (ts.isSpreadElement(el) ? no('spread') : ts.isOmittedExpression(el) ? no('array hole') : v(el)));
  if (ts.isObjectLiteralExpression(x)) {
    return x.properties.every((p) => {
      if (p.name && ts.isComputedPropertyName(p.name)) return no('computed key');
      if (ts.isPropertyAssignment(p)) return v(p.initializer);
      if (ts.isShorthandPropertyAssignment(p)) return !p.objectAssignmentInitializer || no('shorthand default');
      if (ts.isMethodDeclaration(p)) return true;
      return no(ts.isSpreadAssignment(p) ? 'spread' : 'accessor');
    });
  }
  if (ts.isTemplateExpression(x)) {
    return x.templateSpans.every((sp) => primitive(sp.expression) || (ts.isIdentifier(unwrap(sp.expression)) && s.primitives.has((unwrap(sp.expression) as ts.Identifier).text)) || no('template substitution that is not a primitive'));
  }
  if (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) {
    if (ts.isElementAccessExpression(x) && !primitive(x.argumentExpression)) return no('element access with a non-literal key');
    let root: ts.Expression = x.expression;
    while (ts.isPropertyAccessExpression(root) || (ts.isElementAccessExpression(root) && primitive(root.argumentExpression))) root = root.expression;
    root = unwrap(root);
    if (!ts.isIdentifier(root)) return no('property read of a computed value');
    const r = root.text;
    if (s.imports.has(r)) return true;
    return no(`property read of ${r}`);
  }
  if (ts.isConditionalExpression(x)) return v(x.condition) && v(x.whenTrue) && v(x.whenFalse);
  if (ts.isBinaryExpression(x)) {
    const op = x.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return v(x.left) && v(x.right);
    if (ARITHMETIC.has(op) && primitiveOperand(x.left, s) && primitiveOperand(x.right, s)) return true;
    return no(`operator ${ts.tokenToString(op) ?? op}`);
  }
  if (ts.isCallExpression(x)) {
    const callee = unwrap(x.expression);
    const helper = ts.isIdentifier(callee) ? s.reactNamed.get(callee.text)
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && s.reactObject.has(callee.expression.text) ? callee.name.text : undefined;
    if (helper !== undefined && REACT_HELPERS.has(helper)) return x.arguments.every((a) => v(a));
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && !s.bound.has(callee.expression.text)) {
      const n = `${callee.expression.text}.${callee.name.text}`;
      const [a0] = x.arguments;
      if (n === 'Object.freeze' && x.arguments.length === 1 && a0 && (ts.isObjectLiteralExpression(unwrap(a0)) || ts.isArrayLiteralExpression(unwrap(a0)))) return v(a0);
      if (n === 'Symbol.for' && x.arguments.length === 1 && a0 && ts.isStringLiteral(unwrap(a0))) return true;
    }
    if (ts.isIdentifier(callee) && callee.text === 'Symbol' && !s.bound.has('Symbol') && x.arguments.every((a) => ts.isStringLiteral(unwrap(a)))) return true;
    return no(`call ${callee.getText()}()`);
  }
  if (ts.isNewExpression(x)) {
    const callee = unwrap(x.expression);
    const [a0] = x.arguments ?? [];
    if (ts.isIdentifier(callee) && ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(callee.text) && !s.bound.has(callee.text)) {
      if (!a0) return true;
      if (callee.text === 'Set' && (x.arguments ?? []).length === 1 && ts.isArrayLiteralExpression(unwrap(a0))) return v(a0);
    }
    return no(`new ${callee.getText()}()`);
  }
  return no(ts.SyntaxKind[x.kind] ?? 'expression');
}

const hasModifier = (n: ts.Node, k: ts.SyntaxKind): boolean => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === k);

/** S2: a namespace the compiler erases (declare, global augmentation, or only types inside). */
function typeOnlyNamespace(m: ts.ModuleDeclaration): boolean {
  if (hasModifier(m, ts.SyntaxKind.DeclareKeyword) || (m.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true;
  const body = m.body;
  if (!body) return true;
  if (ts.isModuleDeclaration(body)) return typeOnlyNamespace(body);
  return ts.isModuleBlock(body) && body.statements.every((st) => ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || (ts.isModuleDeclaration(st) && typeOnlyNamespace(st)));
}


/** The top-level statements of a module source that are not on the allowlist, as "line: reason". */
function moduleEffects(source: string, file = 'm.tsx'): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const s = moduleScope(sf);
  const out: string[] = [];
  for (const st of sf.statements) {
    const why: string[] = [];
    if (hasModifier(st, ts.SyntaxKind.DeclareKeyword) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isExportDeclaration(st) || ts.isEmptyStatement(st) || ts.isFunctionDeclaration(st)) {
      // S2, S3
    } else if (ts.isImportDeclaration(st)) {
      if (!st.importClause) why.push('bare import');
    } else if (ts.isModuleDeclaration(st)) {
      if (!typeOnlyNamespace(st)) why.push('runtime namespace');
    } else if (ts.isVariableStatement(st)) {
      if ((st.declarationList.flags & ts.NodeFlags.Using) !== 0) why.push('using declaration');
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) value(d.initializer, why, s);
        else why.push('destructuring');
      }
    } else if (ts.isExportAssignment(st)) {
      value(st.expression, why, s);
    } else if (ts.isClassDeclaration(st)) {
      if (ts.getDecorators(st)?.length) why.push('decorator');
      if ((st.heritageClauses ?? []).some((h) => h.token === ts.SyntaxKind.ExtendsKeyword)) why.push('class heritage (extends)');
      for (const m of st.members) {
        if (ts.canHaveDecorators(m) && ts.getDecorators(m)?.length) why.push('member decorator');
        if (m.name && ts.isComputedPropertyName(m.name)) why.push('computed member name');
        if (ts.isClassStaticBlockDeclaration(m)) why.push('static block');
        else if (ts.isPropertyDeclaration(m) && hasModifier(m, ts.SyntaxKind.StaticKeyword)) value(m.initializer, why, s);
      }
    } else {
      why.push(ts.SyntaxKind[st.kind] ?? 'statement');
    }
    const line = sf.getLineAndCharacterOfPosition(st.getStart()).line + 1;
    for (const w of why) out.push(`${line}: ${w}`);
  }
  return out;
}

/** s split at top level (outside parentheses) on the characters sep matches; the separators are kept. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && sep.test(ch)) { out.push(cur, ch); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** C1: whether one selector stays inside a local class. A compound counts when it has its own plain class outside any
 *  parentheses (or & under a local parent); then every sibling step must come after a step down the tree. */
function localSelector(sel: string, parentLocal: boolean, nested: boolean): boolean {
  let t = sel.replace(/\[[^\]]*\]/g, '[]').trim(); // C0 rejected quotes and escapes, so ']' ends every attribute
  if (nested && !t.includes('&')) t = `& ${t}`;
  const tokens = splitTop(t.replace(/\s*([>+~])\s*/g, '$1'), /[\s>+~]/);
  const compounds: string[] = [];
  const combs: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) { if (tokens[i] !== '') compounds.push(tokens[i] ?? ''); }
    else if (compounds.length > 0) combs[compounds.length] = tokens[i] ?? ' '; // the combinator before compound n
  }
  const own = (c: string): boolean => {
    let bare = c;
    for (let prev = ''; prev !== bare;) { prev = bare; bare = bare.replace(/\([^()]*\)/g, ''); }
    return /\.[A-Za-z_-]/.test(bare) || (parentLocal && bare.includes('&'));
  };
  return compounds.some((c, k) => {
    if (!own(c)) return false;
    let down = false;
    for (let j = k + 1; j < compounds.length; j++) {
      const comb = combs[j] ?? ' ';
      if (comb === '+' || comb === '~') { if (!down) return false; } else down = true;
    }
    return true;
  });
}

function localRule(rule: Rule): boolean {
  let parent: Container | undefined = rule.parent as Container | undefined;
  while (parent && parent.type !== 'rule' && parent.type !== 'root') parent = parent.parent as Container | undefined;
  const nested = parent?.type === 'rule';
  const parentLocal = nested && localRule(parent as Rule);
  return rule.selectors.every((sel) => localSelector(sel, parentLocal, nested));
}

/** The rules of a CSS module that are not on the allowlist (C1, C2). */
function cssEffects(css: string): string[] {
  const out: string[] = [];
  const at = (n: ChildNode): number => n.source?.start?.line ?? 0;
  const walk = (nodes: ChildNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'rule') {
        if (n.selector.includes(':global')) out.push(`${at(n)}: :global ${n.selector}`);
        else if (n.selector.includes('\\')) out.push(`${at(n)}: escape in ${n.selector}`);
        else if (n.selector.includes('/*')) out.push(`${at(n)}: comment in ${n.selector}`);
        else if (/["']/.test(n.selector)) out.push(`${at(n)}: quote in ${n.selector}`);
        else if (!localRule(n)) out.push(`${at(n)}: not local ${n.selector}`);
        walk(n.nodes);
      } else if (n.type === 'decl') {
        if (n.prop === 'composes' && /\bfrom\b/.test(n.value)) out.push(`${at(n)}: composes ${n.value}`);
      } else if (n.type === 'atrule') {
        if (/^(-\w+-)?keyframes$/.test(n.name)) { if (!/^[A-Za-z_-][\w-]*$/.test(n.params.trim())) out.push(`${at(n)}: @keyframes ${n.params}`); continue; }
        if (['media', 'supports', 'container'].includes(n.name) && n.nodes) walk(n.nodes);
        else out.push(`${at(n)}: @${n.name}`);
      }
    }
  };
  walk(postcss.parse(css).nodes);
  return out;
}

/** Load-time effects of one kit module: its own statements, plus the CSS it binds. */
function kitModuleEffects(rel: string): string[] {
  const file = join(SRC, rel);
  const source = readFileSync(file, 'utf8');
  const out = moduleEffects(source, file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text.split('?')[0] ?? '';
    if (!spec.endsWith('.css')) continue;
    if (!spec.endsWith('.module.css')) { out.push(`global stylesheet ${spec}`); continue; }
    const css = join(dirname(file), spec);
    if (!existsSync(css)) { out.push(`missing ${spec}`); continue; }
    for (const w of cssEffects(readFileSync(css, 'utf8'))) out.push(`${spec} ${w}`);
  }
  return out;
}

describe('kit purity allowlist (red first; each red case is pinned to its reason)', () => {
  const reasons = (src: string): string => moduleEffects(src).join(' | ');

  it.each([
    // statements that run at import
    ['top-level call', 'register(x);', 'ExpressionStatement'],
    ['assignment to an import', "import { a } from 'b'; a.x = 1;", 'ExpressionStatement'],
    ['call in an initializer', 'export const q = new ToastQueue();', 'new ToastQueue()'],
    ['registration through makeT', 'export const t = makeT(strings);', 'call makeT()'],
    ['bare import', "import './global.css';", 'bare import'],
    ['control flow', "if (typeof window !== 'undefined') init();", 'IfStatement'],
    ['static block', 'export class A { static { boot(); } }', 'static block'],
    ['impure static field', 'export class A { static q = start(); }', 'call start()'],
    ['tagged template', 'export const c = css`a`;', 'TaggedTemplateExpression'],
    ['impure argument of an allowed callee', 'export const s = Object.freeze({ a: load() });', 'call load()'],
    // calls hidden in callbacks, getters and spreads
    ['callback run by a builtin', 'export const ids = Array.from([1], () => register());', 'call Array.from()'],
    ['getter consumed by a builtin', 'export const v = Object.values({ get value() { register(); return 1; } });', 'call Object.values()'],
    ['freezing a shared object', "import { registry } from './r'; export const f = Object.freeze(registry);", 'call Object.freeze()'],
    ['custom iterable in a constructor', "import { items } from './r'; export const s = new Set(items);", 'new Set()'],
    ['getter in Intl options', 'export const n = new Intl.NumberFormat("en", { get style() { register(); return "decimal"; } });', 'new Intl.NumberFormat()'],
    ['shadowed React helper', "import { memo } from './mine'; export const M = memo(() => null);", 'call memo()'],
    ['local helper named like React', 'const memo = (f: unknown) => register(f); export const M = memo(() => null);', 'call memo()'],
    ['class heritage call', 'export class C extends install() {}', 'heritage'],
    ['member decorator', 'export class C { @track() x = 1; }', 'member decorator'],
    ['computed class member name', 'export class C { [register()]() {} }', 'computed member name'],
    ['computed object key', 'export const o = { [register()]() {} };', 'computed key'],
    ['enum initializer call', 'export enum E { A = register() }', 'EnumDeclaration'],
    ['runtime namespace', 'export namespace N { register(); }', 'runtime namespace'],
    ['binding default', 'export const { value = register() } = {};', 'destructuring'],
    ['array destructuring of an unknown iterable', "import { it } from './r'; export const [a] = it;", 'destructuring'],
    ['property read of an unknown value', 'export const v = globalThis.someGetter;', 'property read of globalThis'],
    ['spread of an unknown value', 'export const o = { ...globalThis.thing };', 'spread'],
    // spreads that may run code
    ['spread of a literal with a getter', 'export const copied = { ...{ get value() { register(); return 1; } } };', 'spread'],
    ['spread of a call', 'export const a = [...items()];', 'spread'],
    ['spread of an import', "import { more } from './m'; export const all = ['a', ...more];", 'spread'],
    ['spread of a local literal', "const L = { a: 1 }; export const o = { ...L };", 'spread'],
    ['arithmetic on a read of a local primitive object', 'const P = { a: 2 } as const; export const n = P.a * 3;', 'operator *'],
    ['destructuring a literal with a getter', 'export const { value } = { get value() { register(); return 1; } };', 'destructuring'],
    ['nested destructuring default with a getter', 'export const { nested: { value } = { get value() { register(); return 1; } } } = {};', 'destructuring'],
    ['React export aliased to a helper name', "import { startTransition as memo } from 'react'; export const r = memo(() => register());", 'call memo()'],
    ['shadowed Symbol', 'function Symbol() { register(); return 1; } export const s = Symbol();', 'call Symbol()'],
    ['shadowed Number', 'function Number(v: number) { register(); return v; } export const n = Number(1);', 'call Number()'],
    ['shadowed Set', 'class Set { constructor() { register(); } } export const v = new Set();', 'new Set()'],
    ['shadowed Math with a getter', 'const Math = { get PI() { register(); return 3; } }; export const pi = Math.PI;', 'property read of Math'],
    ['property-access heritage hiding a call', 'function install() { register(); return { Base: class {} }; } export class C extends install().Base {}', 'heritage'],
    ['template coercion of a local object', "const key = { toString() { register(); return 'v'; } }; export const text = `${key}`;", 'template substitution'],
    ['computed key coercion', "const key = { toString() { register(); return 'v'; } }; export const o = { [key as any]: 1 };", 'computed key'],
    ['arithmetic coercion', "const key = { valueOf() { register(); return 1; } }; export const n = key + 1;", 'operator +'],
    ['using declaration', 'using resource = { [Symbol.dispose]() { register(); } }; export const value = 1;', 'using declaration'],
    ['await using declaration', 'await using resource = { async [Symbol.asyncDispose]() { register(); } }; export const value = 1;', 'using declaration'],
    ['let with an effectful initializer', 'export let n = start();', 'call start()'],
    ['arithmetic on a local object read with a method', 'const P = { a: { valueOf() { register(); return 1; } } }; export const n = P.a + 1;', 'operator +'],
    ['Map with entries', "export const m = new Map([['a', 1]]);", 'new Map()'],
    ['invalid Intl options (throws at load)', "export const f = new Intl.NumberFormat('en', { style: 'currency' });", 'new Intl.NumberFormat()'],
    ['JSON.parse that throws', "export const j = JSON.parse('{');", 'call JSON.parse()'],
    // Each construct is rejected, never analysed further
    ['BigInt const arithmetic (throws at load)', 'const numerator = 1n; const denominator = 0n; export const ratio = numerator / denominator;', 'operator /'],
    ['string const arithmetic', "const S = 'a'; export const label = S + 'b';", 'operator +'],
    ['string literal arithmetic', "export const label = 'a' + 'b';", 'operator +'],
    ['destructuring a literal whose nested value is null', 'const data = { nested: null as any }; export const { nested: { value } } = data;', 'destructuring'],
    ['array destructuring through a __proto__ iterator', 'const data = { __proto__: [], length: { valueOf() { register(); return 1; } }, 0: 7 } as any; export const [first] = data;', 'destructuring'],
    ['destructuring a local array literal', 'const values = [1, 2] as const; export const [first] = values;', 'destructuring'],
    ['property read of a local function', 'const fn = () => 0; export const caller = fn.caller;', 'property read of fn'],
    ['property read of a local literal', 'const L = { a: 1 }; export const x = L.a;', 'property read of L'],
    ['builtin read past one level', 'export const description = Symbol.prototype.description;', 'property read of Symbol'],
    ['builtin element access', "export const pi = Math['PI'];", 'property read of Math'],
    // Builtin reads come from a named allowlist of data properties
    ['Function.caller accessor (throws at load)', 'export const c = Function.caller;', 'property read of Function'],
    ['builtin property outside the allowlist', 'export const r = Math.random;', 'property read of Math'],
    ['builtin prototype read', 'export const p = Object.prototype;', 'property read of Object'],
    // No builtin property read is allowed
    ['Object.caller', 'export const c = Object.caller;', 'property read of Object'],
    ['Symbol.arguments', 'export const a = Symbol.arguments;', 'property read of Symbol'],
    ['Math.nope', 'export const n = (Math as any).nope;', 'property read of Math'],
    ['Math.PI', 'export const pi = Math.PI;', 'property read of Math'],
    ['heritage on a local arrow (throws at load)', 'const Base: any = () => null; export class Component extends Base {}', 'heritage'],
    ['heritage on an import', "import { Base } from './b'; export class C extends Base {}", 'heritage'],
    ['type-only import sharing a local value name', "import type { Box } from './types'; class Source { static get value() { register(); return 1; } } const Box = Source; export const result = Box.value;", 'property read of Box'],
    ['type-only named import sharing a local value name', "import { type Box } from './types'; class Source { static get value() { register(); return 1; } } const Box = Source; export const result = Box.value;", 'property read of Box'],
  ])('flags %s', (_name, src, reason) => {
    expect(reasons(src)).toContain(reason);
  });

  it.each([
    ['definitions', "import type { A } from 'a'; import s from './x.module.css'; export type B = A; export interface C { a: 1 } export function f() { g(); } declare const d: number;"],
    ['plain values', "import { o } from './o'; export const a = { b: [1, 'x', `t`, -1, null, /x/g], c: () => g(), d: o, m() { g(); } }; export const e = o.x ? o.y : 1; export const f = o ?? 2; export default a;"],
    ['React helpers by export name, aliased too', "import React, { memo as wrap, createContext } from 'react'; export const A = wrap(() => null); export const B = React.forwardRef(() => null); export const C = createContext(0);"],
    ['allowed builtins', "export const F = Object.freeze({ a: 1, run() { register(); } }); export const S = new Set(['a', 'b']); export const K = Symbol.for('k'); export const L = Symbol('l');"],
    ['reads of imports', "import { base } from './tokens'; export const o = { c: base.x, e: base['y'], f: base.x.y };"],
    ['template of local primitives', "const SLOT = '\\u0000'; export const T = `${SLOT}x${SLOT}${1}`;"],
    ['ambient and type-only namespaces', "declare global { interface W { a: 1 } } export namespace T { export type A = 1; } declare namespace D { const x: 1; }"],
    ['module state and empty collections', "export let shared: number | null = null; let n = 0; const m = new Map<string, number>(); const w = new WeakMap(); const ws = new WeakSet(); const st = new Set(['a']);"],
    ['arithmetic over number literals and number consts', "const N = 4; const M = -1; export const total = 1 + N * 2 - N / 2 + (N % 3) + M;"],
    ['class without heritage', "import type { I } from './b'; export class C implements I { x = run(); m() { run(); } static s = 1; }"],
    ['re-exports', "export * from './a'; export { b } from './b';"],
  ])('passes %s', (_name, src) => {
    expect(moduleEffects(src)).toEqual([]);
  });

  it.each([
    [':global rule', ':global(.x) { color: red; }', ':global'],
    [':global inside a local rule', '.a > :global(button) { color: red; }', ':global'],
    ['element selector', 'button { color: red; }', 'not local'],
    ['attribute selector', '[data-x] { color: red; }', 'not local'],
    ['root selector', ':root { --a: 1; }', 'not local'],
    ['element rule in a media query', '@media (width < 10px) { p { color: red; } }', 'not local'],
    ['font face', '@font-face { font-family: x; }', '@font-face'],
    ['class only inside :not', 'button:not(.local) { color: red; }', 'not local'],
    ['class only inside :is', ':is(.local, button) { color: red; }', 'not local'],
    ['class only inside :where', ':where(.local, [data-shared]) { color: red; }', 'not local'],
    ['class inside :is inside :not', 'button:not(:is(.owned, .other)) { color: red; }', 'not local'],
    ['class inside :where inside :has', 'body:has(:where(.owned)) { color: red; }', 'not local'],
    ['escaped dot in a type selector', 'x-widget\\.owned { color: red; }', 'escape'],
    ['sibling reached from a local class', '.local + button { color: red; }', 'not local'],
    ['sibling reached through nesting', '.local { & + button { color: red; } }', 'not local'],
    ['general sibling through nesting', '.local { & ~ p { color: red; } }', 'not local'],
    ['global keyframes', '@keyframes :global(spin) { from { opacity: 0; } }', '@keyframes'],
    ['named layer block', '@layer base { .a { color: red; } }', '@layer'],
    ['layer order statement', '@layer base, kit;', '@layer'],
    ['composes from another stylesheet', ".a { composes: b from './other.module.css'; }", 'composes'],
    ['composes from global', '.a { composes: b from global; }', 'composes'],
    // Comments and quotes in a selector are rejected, never parsed around
    ['comment holding a class', 'button/*.owned*/:hover { color: red; }', 'comment'],
    ['quoted attribute value hiding a class', `[data-x="'].owned"] { color: red; }`, 'quote'],
    ['quoted attribute value on a local class', '.a[data-state="open"] { color: red; }', 'quote'],
  ])('flags CSS: %s', (_name, css, reason) => {
    expect(cssEffects(css).join(' | ')).toContain(reason);
  });

  it.each([
    ['local class', '.a { color: red; }'],
    ['element inside a local class', '.a button, [data-x] .b { color: red; }'],
    ['nested rule under a local class', '.a { & span { color: red; } }'],
    ['local class in a media query', '@media (width < 10px) { .a { color: red; } }'],
    ['keyframes', '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }'],
    ['local siblings', '.a + .b, .a ~ .c > span, .list > li + li { color: red; }'],
    ['pseudo-class filters on a local class', '.a:hover:not(:disabled), .a::before, .a:is(:focus, :hover), .t:not(.x) th:not(.y) + th { color: red; }'],
    ['implicit descendant nesting', '.a { span { color: red; } .b + & { color: blue; } }'],
    ['composes within the module', '.a { composes: b; }'],
  ])('passes CSS: %s', (_name, css) => {
    expect(cssEffects(css)).toEqual([]);
  });
});

describe('kit modules marked side-effect free by the build (vite.config.mts kitPure)', () => {
  const listed = kitImpure();
  const modules = kitModules();

  it('KIT_IMPURE is sorted, unique and names kit TS modules', () => {
    expect(listed).toEqual([...new Set(listed)].sort());
    for (const rel of listed) expect(rel, rel).toMatch(/^kit\/.+\.tsx?$/);
  });

  it('every kit module outside KIT_IMPURE does nothing at load', () => {
    // kitPure() marks what vite bundles for the web Hub: terminal files are never in that graph and scenario files are
    // loaded only by the scenario runners (termFiles.test.ts pins both), so neither is judged here.
    const built = webBuilt('kitpure', 'kitPure marks web-build modules only; terminal and scenario files are never in the web build');
    const bad = modules.filter((m) => built(m) && !listed.includes(m)).map((m) => [m, kitModuleEffects(m)] as const).filter(([, w]) => w.length > 0);
    expect(bad.map(([m, w]) => `${m}: ${w.join('; ')}`), 'add the module to KIT_IMPURE in vite.config.mts, or move the load-time code into a function').toEqual([]);
  });

  it('every KIT_IMPURE entry exists and still has a load-time effect', () => {
    const stale = listed.filter((m) => !modules.includes(m) || kitModuleEffects(m).length === 0);
    expect(stale, 'remove these entries from KIT_IMPURE').toEqual([]);
  });
});
