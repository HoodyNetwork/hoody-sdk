// Page FAQ conformance. A page keeps its rules and explanations in `pages/<page>/faq.ts`, which has
// ONE form: an exported `pageFaq(t)` that declares `const items = [ { id, q, a }, … ]` as a literal array and returns `{ items, byId }`. Every `q` is
// `t('faq.<id>.q')`; every `a` is `t('faq.<id>.a')` or a conditional between such calls of the id's answer variants (`faq.<id>.a.<variant>`);
// `byId` maps each id to its own `items[i]`. The page's archetype root (Detail/Table/Settings/Dashboard/Wizard/ListDetail Page) is given the
// builder's result once, as `faq={pageFaq(t)}` (or a name bound to it, or a conditional between that and nothing); a FaqLink or an overlay
// `faq={{ item, label }}` names `byId.<id>` of the same builder. Anything else in faq.ts or at those sites is an offence, not a case to judge.
// The source is read as a syntax tree. The length of the answers is the detector's job (layout.explain). `faqProblems` is pure so its own
// mutants and controls run beside the tree check.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as {
  readTree(dir: string): Record<string, string>;
  /** the anatomy rule's own reading of an overlay faq: [item, label] of `{ item, label }` or `cond ? { item, label } : undefined`, else null */
  overlayFaqOf(e: ts.Expression): [ts.Expression, ts.Expression] | null;
  DEFAULT_REGISTRY: { explain: { overlayFaq: string[] } };
};
/** the kit overlays whose faq is the descriptor { item, label } (the anatomy rule's own list) */
const OVERLAY_FAQ = A.DEFAULT_REGISTRY.explain.overlayFaq;
/** one program over a page's views, so names resolve through the checker by lexical scope (no lib, no module resolution: local bindings) */
function viewProgram(files: Record<string, string>, views: string[]): ts.Program {
  const host: ts.CompilerHost = {
    getSourceFile: (n) => (n in files ? parse(n, files[n]!) : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '',
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (n) => n in files,
    readFile: (n) => files[n],
  };
  return ts.createProgram(views, { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.Preserve }, host);
}
/** is this the parameter of a function, or a name destructured from one (`({ faq }) => …`) */
const isParamDecl = (d: ts.Declaration): boolean => {
  if (ts.isParameter(d)) return ts.isIdentifier(d.name);
  let top: ts.Node = d;
  while (top.parent && (ts.isObjectBindingPattern(top.parent) || ts.isArrayBindingPattern(top.parent) || ts.isBindingElement(top.parent))) top = top.parent;
  return ts.isBindingElement(d) && ts.isParameter(top.parent);
};
/** the kit name an element's tag stands for, by the checker: an imported name under the name it is exported as, a const alias of a name
 *  followed to that name; anything else by its own text */
function kitName(tag: ts.JsxTagNameExpression, checker: ts.TypeChecker, depth = 0): string {
  if (!ts.isIdentifier(tag) || depth > 4) return tag.getText();
  const decls = checker.getSymbolAtLocation(tag)?.declarations ?? [];
  const d = decls.length === 1 ? decls[0]! : undefined;
  if (d && ts.isImportSpecifier(d)) return (d.propertyName ?? d.name).text;
  if (d && ts.isVariableDeclaration(d) && d.initializer && ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const) {
    const init = unparen(d.initializer);
    if (ts.isIdentifier(init)) return kitName(init, checker, depth + 1);
    if (ts.isPropertyAccessExpression(init)) return init.name.text;
  }
  return tag.text;
}
/** the kit FAQ elements: FaqLink and the overlays whose faq is a descriptor */
const isKitFaq = (name: string): boolean => name === 'FaqLink' || OVERLAY_FAQ.includes(name);
/** React's element factories: an element made through one is not JSX the check reads */
const FACTORIES = new Set(['createElement', 'cloneElement', 'jsx', 'jsxs', 'jsxDEV', '_jsx', '_jsxs', '_jsxDEV']);
/** is this use of a name a value an overlay's faq takes (through parentheses, ?: branches and &&, || and ??), not a read anywhere else */
function inOverlayFaq(id: ts.Node, checker: ts.TypeChecker): boolean {
  let n: ts.Node = id;
  for (;;) {
    const p: ts.Node = n.parent;
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isNonNullExpression(p)) n = p;
    else if (ts.isConditionalExpression(p) && p.condition !== n) n = p;
    else if (ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) n = p;
    else if (ts.isJsxExpression(p)) n = p;
    else {
      if (!ts.isJsxAttribute(p) || p.name.getText() !== 'faq') return false;
      const owner = p.parent.parent;
      return (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) && OVERLAY_FAQ.includes(kitName(owner.tagName, checker));
    }
  }
}
/** a name's binding, by the checker: a parameter (forwarded), a `const` with an initializer whose every use is an overlay faq value (its
 *  initializer is the value: never written, aliased, passed on or mutated through a member), or unsupported (let, var, a destructured or
 *  imported name, a name the checker cannot resolve, a const read anywhere else) */
function bindingOf(id: ts.Identifier, checker: ts.TypeChecker): 'param' | ts.Expression | null {
  const sym = checker.getSymbolAtLocation(id);
  const decls = sym?.declarations ?? [];
  if (!sym || decls.length !== 1) return null;
  const d = decls[0]!;
  if (isParamDecl(d)) return 'param';
  if (!ts.isVariableDeclaration(d) || !ts.isIdentifier(d.name) || !d.initializer || !(ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const)) return null;
  let only = true;
  const uses = (n: ts.Node): void => {
    if (!only) return;
    if (ts.isIdentifier(n) && n !== d.name && n.text === d.name.getText() && checker.getSymbolAtLocation(n) === sym && !inOverlayFaq(n, checker)) only = false;
    ts.forEachChild(n, uses);
  };
  uses(d.getSourceFile());
  return only ? d.initializer : null;
}
/** the values a faq expression can take: the leaves of ?:, &&, || and ?? (through parentheses, as, satisfies and !, and through a const
 *  bound to a value), the conditions, the parameters (and members of one) among them, and the names that are not a parameter or such a const */
function overlayLeaves(e: ts.Expression, checker: ts.TypeChecker): { leaves: ts.Expression[]; conds: ts.Expression[]; unbound: ts.Expression[]; forwarded: ts.Expression[] } {
  const leaves: ts.Expression[] = [];
  const forwarded: ts.Expression[] = [];
  const conds: ts.Expression[] = [];
  const unbound: ts.Expression[] = [];
  const LOGICAL = [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken];
  const seen = new Set<ts.Node>();
  const walk = (x: ts.Expression): void => {
    x = unparen(x);
    if (ts.isConditionalExpression(x)) { conds.push(x.condition); walk(x.whenTrue); walk(x.whenFalse); return; }
    // `a && b` gives a only while a is falsy (never a descriptor): a is a condition; `a || b` and `a ?? b` may give either
    if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { conds.push(x.left); walk(x.right); return; }
    if (ts.isBinaryExpression(x) && LOGICAL.includes(x.operatorToken.kind)) { walk(x.left); walk(x.right); return; }
    if (isNothing(x, checker)) return;
    // a name or a member: a parameter (or a member of one) is forwarded, to be checked where the page passes it; a const bound to a value is
    // that value; anything else is refused
    const root = ts.isIdentifier(x) ? x : ts.isPropertyAccessExpression(x) && ts.isIdentifier(unparen(x.expression)) ? (unparen(x.expression) as ts.Identifier) : null;
    if (root) {
      const b = bindingOf(root, checker);
      if (b === 'param') return void forwarded.push(x);
      if (b && root === x && !seen.has(b)) { seen.add(b); return walk(b); }
      unbound.push(x);
      return;
    }
    leaves.push(x);
  };
  walk(e);
  return { leaves, conds, unbound, forwarded };
}
/** null, or `undefined` the global value (a parameter or local named undefined is a name like any other, traced or refused) */
function isNothing(e: ts.Expression, checker: ts.TypeChecker): boolean {
  const x = unparen(e);
  if (x.kind === ts.SyntaxKind.NullKeyword) return true;
  return ts.isIdentifier(x) && x.text === 'undefined' && !(checker.getSymbolAtLocation(x)?.declarations ?? []).length;
}
const hasJsx = (n: ts.Node): boolean => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || !!ts.forEachChild(n, (c) => hasJsx(c) || undefined);
const SRC = join(import.meta.dirname, '..');

const ID = /^[a-z][a-zA-Z0-9]*$/;
const PAGE_FAQ = /^pages\/([^/]+)\/faq\.ts$/;
const ARCHETYPE = /^(?:Detail|Table|Settings|Dashboard|Wizard|ListDetail)Page$/;
const PLURAL = /_(?:zero|one|two|few|many|other)$/;
const isSource = (rel: string) => /\.tsx$/.test(rel) && !/\.(test|spec)\.tsx$/.test(rel) && !/\/(fixtures|shots)\.tsx$/.test(rel);
const parse = (rel: string, text: string) => ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const unparen = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e) ? unparen(e.expression) : e);
const propName = (n: ts.PropertyName): string | undefined => (ts.isIdentifier(n) || ts.isStringLiteralLike(n) ? n.text : undefined);

// ── faq.ts: the one form ──
function builderProblems(rel: string, src: string, table: Record<string, unknown>): string[] {
  const out: string[] = [];
  const sf = parse(rel, src);
  const fns: ts.FunctionDeclaration[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name?.text === 'pageFaq' && st.body && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) fns.push(st);
    else out.push(`${rel}: holds something other than the exported pageFaq (${st.getText().slice(0, 40).replace(/\s+/g, ' ')}…)`);
  }
  if (fns.length !== 1) {
    out.push(`${rel}: must export exactly one function pageFaq(t)`);
    return out;
  }
  const fn = fns[0]!;
  const tp = fn.parameters[0];
  const tName = tp && ts.isIdentifier(tp.name) ? tp.name.text : '';
  const body = fn.body!.statements;
  const decl = body[0] && ts.isVariableStatement(body[0]) ? body[0] : null;
  const ret = body[1] && ts.isReturnStatement(body[1]) ? body[1] : null;
  const itemsDecl = decl && decl.declarationList.flags & ts.NodeFlags.Const && decl.declarationList.declarations.length === 1 ? decl.declarationList.declarations[0]! : null;
  if (body.length !== 2 || !itemsDecl || !ts.isIdentifier(itemsDecl.name) || itemsDecl.name.text !== 'items' || !itemsDecl.initializer || !ret?.expression) {
    out.push(`${rel}: pageFaq must be exactly \`const items = [...]; return { items, byId: {...} };\``);
    return out;
  }
  const arr = unparen(itemsDecl.initializer);
  if (!ts.isArrayLiteralExpression(arr)) {
    out.push(`${rel}: items must be a literal array of { id, q, a } objects`);
    return out;
  }
  const read = new Set<string>();
  const tCall = (e: ts.Expression, want: RegExp, what: string): boolean => {
    e = unparen(e);
    if (ts.isConditionalExpression(e) && what === 'a') return tCall(e.whenTrue, want, what) && tCall(e.whenFalse, want, what);
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === tName && e.arguments.length === 1 && ts.isStringLiteralLike(unparen(e.arguments[0]!))) {
      const key = (unparen(e.arguments[0]!) as ts.StringLiteral).text;
      if (!want.test(key)) return false;
      read.add(key);
      return true;
    }
    return false;
  };
  const ids: string[] = [];
  arr.elements.forEach((el, i) => {
    const o = unparen(el);
    if (!ts.isObjectLiteralExpression(o)) return void out.push(`${rel}: items[${i}] is not an object literal`);
    const props = new Map<string, ts.Expression>();
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)) return void out.push(`${rel}: items[${i}] has a member that is not a plain id/q/a property`);
      const k = propName(p.name) ?? '';
      if (props.has(k)) return void out.push(`${rel}: items[${i}] repeats the member ${k}`);
      props.set(k, p.initializer);
    }
    if (props.size !== 3 || !props.has('id') || !props.has('q') || !props.has('a')) return void out.push(`${rel}: items[${i}] must hold exactly id, q and a`);
    const idE = unparen(props.get('id')!);
    if (!ts.isStringLiteralLike(idE) || !ID.test(idE.text)) return void out.push(`${rel}: items[${i}] id must be a lower camelCase string literal`);
    const id = idE.text;
    ids.push(id);
    if (!tCall(props.get('q')!, new RegExp(`^faq\\.${id}\\.q$`), 'q')) out.push(`${rel}: item '${id}' q must be t('faq.${id}.q')`);
    if (!tCall(props.get('a')!, new RegExp(`^faq\\.${id}\\.a(?:\\.[A-Za-z][A-Za-z0-9]*)?$`), 'a')) out.push(`${rel}: item '${id}' a must be t('faq.${id}.a') or a conditional between its variants`);
  });
  if (new Set(ids).size !== ids.length) out.push(`${rel}: an item id appears twice`);
  // the return
  const r = unparen(ret.expression);
  const props = ts.isObjectLiteralExpression(r) ? r.properties : null;
  const itemsOk = !!props && props.length === 2 && props.some((p) => ts.isShorthandPropertyAssignment(p) && p.name.text === 'items');
  const byId = props?.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p.name) === 'byId');
  const byIdObj = byId ? unparen(byId.initializer) : null;
  if (!itemsOk || !byIdObj || !ts.isObjectLiteralExpression(byIdObj)) out.push(`${rel}: pageFaq must return exactly { items, byId: { <id>: items[i], … } }`);
  else {
    const seen = new Set<string>();
    for (const p of byIdObj.properties) {
      const k = ts.isPropertyAssignment(p) ? propName(p.name) : undefined;
      const v = ts.isPropertyAssignment(p) ? unparen(p.initializer) : null;
      const idx = v && ts.isElementAccessExpression(v) && ts.isIdentifier(unparen(v.expression)) && (unparen(v.expression) as ts.Identifier).text === 'items' && ts.isNumericLiteral(unparen(v.argumentExpression)) ? Number((unparen(v.argumentExpression) as ts.NumericLiteral).text) : -1;
      if (k === undefined || idx < 0 || ids[idx] !== k) out.push(`${rel}: byId.${k ?? '?'} must be items[i] of the item with that id`);
      else seen.add(k);
    }
    for (const id of ids) if (!seen.has(id)) out.push(`${rel}: byId has no entry for item '${id}'`);
  }
  // every faq key of the table is read by an item, and every key read exists
  const stripped = (k: string) => k.replace(PLURAL, '');
  for (const key of Object.keys(table)) if (key.startsWith('faq.') && !read.has(stripped(key))) out.push(`${rel}: ${key} is in the table but no item reads it`);
  for (const key of read) if (!(key in table) && !Object.keys(table).some((k) => stripped(k) === key)) out.push(`${rel}: reads ${key} which the table does not hold`);
  return out;
}

// ── views: where the builder's result goes ──
/** the declaration an identifier names, by the checker: a local variable, parameter or destructured name (an import, a name the checker
 *  cannot resolve, or one with several declarations is null) */
function declOf(id: ts.Identifier, checker: ts.TypeChecker): ts.VariableDeclaration | ts.BindingElement | ts.ParameterDeclaration | null {
  // `{ items }`: the shorthand's name is the property; its value is the variable
  const sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id);
  const decls = sym?.declarations ?? [];
  const d = decls.length === 1 ? decls[0]! : undefined;
  return d && (ts.isVariableDeclaration(d) || ts.isParameter(d) || ts.isBindingElement(d)) && ts.isIdentifier(d.name) ? d : null;
}
const isConst = (d: ts.Node): boolean => !!(ts.getCombinedNodeFlags(d as ts.Declaration) & ts.NodeFlags.Const);
type Ctx = { dir: string; rel: string; sf: ts.SourceFile; ids: Set<string>; checker: ts.TypeChecker };
/** is this identifier, by the checker, the `pageFaq` imported from this page's own faq module (any other binding of the name,
 *  a parameter or local that shadows the import, is not the builder) */
function isOwnBuilder(id: ts.Identifier, c: Ctx): boolean {
  const decls = c.checker.getSymbolAtLocation(id)?.declarations ?? [];
  const el = decls.length === 1 ? decls[0]! : undefined;
  if (!el || !ts.isImportSpecifier(el) || el.isTypeOnly || el.getSourceFile() !== c.sf) return false;
  const clause = el.parent.parent;
  if (clause.isTypeOnly || !ts.isStringLiteral(clause.parent.moduleSpecifier)) return false;
  const spec = clause.parent.moduleSpecifier.text;
  return (el.propertyName ?? el.name).text === 'pageFaq' && spec.startsWith('.') && posix.normalize(posix.join(posix.dirname(c.rel), spec)) === `${c.dir}/faq`;
}
const isBuilderCall = (e: ts.Expression, c: Ctx): boolean => {
  e = unparen(e);
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && isOwnBuilder(e.expression, c);
};
// ── writes: a builder result the page changes is no longer the page's FAQ ──
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const OBJECT_WRITERS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']);
/** the outermost member chain `id.a[b].c` (through parentheses and casts) that starts at this identifier */
function chainTop(id: ts.Identifier): ts.Expression {
  let n: ts.Expression = id;
  for (;;) {
    const p = n.parent;
    if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === n) n = p;
    else if ((ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p)) && p.expression === n) n = p;
    else return n;
  }
}
/** does this use write to the value the identifier names: assignment to it or a member, ++/--, delete, a mutating array method, Object.assign & co */
function isWriteUse(id: ts.Identifier): boolean {
  const n = chainTop(id);
  const p = n.parent;
  if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  if (ts.isDeleteExpression(p)) return true;
  if (ts.isCallExpression(p) && p.expression === n && n !== id && ts.isPropertyAccessExpression(n) && MUTATORS.has(n.name.text)) return true;
  if (ts.isCallExpression(p) && p.arguments[0] === n) {
    const callee = unparen(p.expression);
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Object' && OBJECT_WRITERS.has(callee.name.text)) return true;
  }
  return false;
}
/** is the value this declaration binds written to anywhere in its file, by its own name or by a const alias of it (`const g = f`, `const { items } = f`, `const xs = f.items`) */
function writtenTo(d: ts.VariableDeclaration | ts.BindingElement, checker: ts.TypeChecker, depth = 0): boolean {
  if (depth > 6 || !ts.isIdentifier(d.name)) return depth > 6;
  const name = d.name.text;
  let hit = false;
  const visit = (x: ts.Node): void => {
    if (hit) return;
    if (ts.isIdentifier(x) && x.text === name && x !== d.name && declOf(x, checker) === d) {
      if (isWriteUse(x)) hit = true;
      else {
        // an alias: a declaration initialised by this name or a member chain of it
        const top = chainTop(x);
        if (ts.isVariableDeclaration(top.parent) && top.parent.initializer === top) {
          const v = top.parent;
          if (ts.isIdentifier(v.name)) hit = writtenTo(v, checker, depth + 1);
          else {
            const parts: ts.BindingElement[] = [];
            const collect = (b: ts.Node): void => (ts.isBindingElement(b) && ts.isIdentifier(b.name) ? void parts.push(b) : ts.forEachChild(b, collect));
            collect(v.name);
            hit = parts.some((b) => writtenTo(b, checker, depth + 1));
          }
        }
      }
    }
    if (!hit) ts.forEachChild(x, visit);
  };
  visit(d.getSourceFile());
  return hit;
}
/** does the expression hold the builder's result: the call itself, or a const bound to it (destructured `{ items, byId }` parts included)
 *  that nothing writes to */
function holdsBuilder(e: ts.Expression, c: Ctx, depth = 0): 'whole' | 'part' | null {
  e = unparen(e);
  if (depth > 6) return null;
  if (isBuilderCall(e, c)) return 'whole';
  if (!ts.isIdentifier(e)) return null;
  const d = declOf(e, c.checker);
  if (!d || ts.isParameter(d) || !isConst(d)) return null;
  if (writtenTo(d, c.checker)) return null;
  if (ts.isVariableDeclaration(d)) return d.initializer ? holdsBuilder(d.initializer, c, depth + 1) : null;
  // a binding element: const { items, byId } = pageFaq(t)
  let top: ts.Node = d;
  while (top.parent && (ts.isObjectBindingPattern(top.parent) || ts.isArrayBindingPattern(top.parent) || ts.isBindingElement(top.parent))) top = top.parent;
  return ts.isVariableDeclaration(top.parent) && top.parent.initializer && holdsBuilder(top.parent.initializer, c, depth + 1) ? 'part' : null;
}
const isParamName = (e: ts.Expression, checker: ts.TypeChecker): boolean => {
  e = unparen(e);
  if (!ts.isIdentifier(e)) return false;
  const d = declOf(e, checker);
  if (!d) return false;
  if (ts.isParameter(d)) return true;
  let top: ts.Node = d;
  while (top.parent && (ts.isObjectBindingPattern(top.parent) || ts.isArrayBindingPattern(top.parent) || ts.isBindingElement(top.parent))) top = top.parent;
  return ts.isParameter(top.parent);
};
type Kind = 'builder' | 'forwarded' | 'absent' | 'empty' | 'foreign';
/** what a `faq={…}` value gives the element: properties of an object are applied in source order, a conditional is judged by both branches */
function faqKind(e: ts.Expression, c: Ctx, depth = 0): Kind {
  e = unparen(e);
  if (depth > 4) return 'foreign';
  if (isNothing(e, c.checker)) return 'absent';
  if (ts.isConditionalExpression(e)) {
    const a = faqKind(e.whenTrue, c, depth + 1);
    const b = faqKind(e.whenFalse, c, depth + 1);
    const good = (k: Kind) => k === 'builder' || k === 'forwarded';
    if (a === 'foreign' || b === 'foreign' || a === 'empty' || b === 'empty') return 'foreign';
    if (good(a) && (good(b) || b === 'absent')) return a;
    if (good(b) && a === 'absent') return b;
    return 'absent';
  }
  if (ts.isArrayLiteralExpression(e)) return 'empty';
  if (ts.isObjectLiteralExpression(e)) {
    let items: Kind = 'empty';
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) items = faqKind(p.expression, c, depth + 1);
      else if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'items') items = itemsKind(p.name, c);
      else if (ts.isPropertyAssignment(p) && propName(p.name) === 'items') items = itemsKind(p.initializer, c);
      else return 'foreign';
    }
    return items;
  }
  if (holdsBuilder(e, c) === 'whole') return 'builder';
  if (isParamName(e, c.checker)) return 'forwarded';
  return 'foreign';
}
function itemsKind(e: ts.Expression, c: Ctx): Kind {
  e = unparen(e);
  if (ts.isArrayLiteralExpression(e)) return e.elements.length ? 'foreign' : 'empty';
  if (isNothing(e, c.checker)) return 'empty';
  if (ts.isPropertyAccessExpression(e) && e.name.text === 'items' && holdsBuilder(e.expression, c) === 'whole') return 'builder';
  if (holdsBuilder(e, c)) return 'builder';
  return isParamName(e, c.checker) ? 'forwarded' : 'foreign';
}
/** the item id a FaqLink / overlay `item` names: { id } | { computed } | { forwarded } | { foreign } */
function itemRef(e: ts.Expression, c: Ctx, depth = 0): { id: string } | { bad: 'computed' | 'foreign' | 'forwarded' } {
  e = unparen(e);
  if (depth > 6) return { bad: 'foreign' };
  if (ts.isIdentifier(e)) {
    if (isParamName(e, c.checker)) return { bad: 'forwarded' };
    const d = declOf(e, c.checker);
    if (d && ts.isVariableDeclaration(d) && d.initializer && isConst(d)) return itemRef(d.initializer, c, depth + 1);
    return { bad: 'foreign' };
  }
  if (ts.isElementAccessExpression(e)) {
    const base = unparen(e.expression);
    const arg = unparen(e.argumentExpression);
    if (ts.isPropertyAccessExpression(base) && base.name.text === 'byId' && holdsBuilder(base.expression, c)) return ts.isStringLiteralLike(arg) ? { id: arg.text } : { bad: 'computed' };
    if (ts.isIdentifier(base) && holdsBuilder(base, c) === 'part') return ts.isStringLiteralLike(arg) ? { id: arg.text } : { bad: 'computed' };
    return { bad: 'foreign' };
  }
  if (ts.isPropertyAccessExpression(e)) {
    const base = unparen(e.expression);
    if (ts.isPropertyAccessExpression(base) && base.name.text === 'byId' && holdsBuilder(base.expression, c)) return { id: e.name.text };
    if (ts.isIdentifier(base) && base.text === 'byId' && holdsBuilder(base, c) === 'part') return { id: e.name.text };
    if (holdsBuilder(base, c) === 'whole' && e.name.text === 'byId') return { bad: 'foreign' };
  }
  return { bad: 'foreign' };
}

// ── forwarded values: a parameter is checked where the page passes it, at every element of its component ──
/** comp/compName: the component; name: its prop; dflt: the prop's default; fn: the component's function; bind: the name the function holds
 *  the value under (the destructured name, or the props parameter or rest binding, `whole`) */
type Prop = { comp: ts.Symbol; compName: string; name: string; dflt?: ts.Expression; fn: ts.SignatureDeclaration; bind: ts.Identifier; whole: boolean };
/** the prop of a plain named component a forwarded value is, by the checker: `({ item }) =>` or `({ item: x }) =>` (the destructured name, with
 *  its default), `props.faq` / `rest.faq` (a member of the props parameter or of its rest binding), or with `spread` the props parameter or
 *  rest binding itself spread on an element. 'absent': a rest binding beside a name that takes the prop. null: anything else (a positional
 *  or nested parameter, a callback's parameter, a defaulted props object, a component that is not a function declaration or a const) */
function paramProp(x: ts.Expression, checker: ts.TypeChecker, spread?: string): Prop | 'absent' | null {
  x = unparen(x);
  type Found = [ts.ParameterDeclaration, string, ts.Identifier, boolean, ts.Expression?] | 'absent' | null;
  const keyOf = (b: ts.BindingElement) => { const k = b.propertyName ?? b.name; return ts.isIdentifier(k) || ts.isStringLiteralLike(k) ? k.text : undefined; };
  const ofWhole = (id: ts.Expression, prop: string): Found => {
    const d = ts.isIdentifier(id) ? declOf(id, checker) : null;
    if (d && ts.isParameter(d) && !d.dotDotDotToken) return [d, prop, d.name as ts.Identifier, true];
    if (d && ts.isBindingElement(d) && d.dotDotDotToken && ts.isObjectBindingPattern(d.parent) && ts.isParameter(d.parent.parent))
      return d.parent.elements.some((b) => b !== d && keyOf(b) === prop) ? 'absent' : [d.parent.parent, prop, d.name as ts.Identifier, true];
    return null;
  };
  let found: Found = null;
  if (spread !== undefined) found = ofWhole(x, spread);
  else if (ts.isPropertyAccessExpression(x)) found = ofWhole(unparen(x.expression), x.name.text);
  else if (ts.isIdentifier(x)) {
    const d = declOf(x, checker);
    const key = d && ts.isBindingElement(d) ? keyOf(d) : undefined;
    if (d && ts.isBindingElement(d) && !d.dotDotDotToken && ts.isObjectBindingPattern(d.parent) && ts.isParameter(d.parent.parent) && key !== undefined)
      found = [d.parent.parent, key, d.name as ts.Identifier, false, d.initializer];
  }
  if (found === 'absent' || !found) return found;
  const [param, name, bind, whole, dflt] = found;
  if (param.initializer) return null;
  const fn = param.parent;
  if (!ts.isFunctionLike(fn) || fn.parameters[0] !== param) return null;
  const at = ts.isFunctionDeclaration(fn) ? fn.name
    : (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && fn.parent.initializer === fn && isConst(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name
    : undefined;
  const comp = at && checker.getSymbolAtLocation(at);
  return comp && at ? { comp, compName: at.text, name, dflt, fn, bind, whole } : null;
}
/** the function a call names, by the checker, when it is declared with a body in the checked program (a function declaration or a const
 *  arrow or function expression) */
function localFn(call: ts.CallExpression, checker: ts.TypeChecker): ts.FunctionLikeDeclaration | undefined {
  const callee = unparen(call.expression);
  if (!ts.isIdentifier(callee)) return undefined;
  let sym = checker.getSymbolAtLocation(callee);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  const decls = sym?.declarations ?? [];
  const d = decls.length === 1 ? decls[0]! : undefined;
  if (d && ts.isFunctionDeclaration(d) && d.body) return d;
  if (d && ts.isVariableDeclaration(d) && isConst(d) && d.initializer) {
    const init = unparen(d.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  }
  return undefined;
}
/** is this call's callee, by the checker, a name imported from the kit */
function kitCallee(call: ts.CallExpression | ts.NewExpression, checker: ts.TypeChecker): boolean {
  let root = unparen(call.expression);
  while (ts.isPropertyAccessExpression(root)) root = unparen(root.expression);
  if (!ts.isIdentifier(root)) return false;
  const decls = checker.getSymbolAtLocation(root)?.declarations ?? [];
  const d = decls.length === 1 ? decls[0]! : undefined;
  const imp = d && (ts.isImportSpecifier(d) ? d.parent.parent.parent : ts.isNamespaceImport(d) ? d.parent.parent : ts.isImportClause(d) ? d.parent : undefined);
  return !!imp && ts.isStringLiteral(imp.moduleSpecifier) && /^@kit(?:\/|$)/.test(imp.moduleSpecifier.text);
}
/** What, inside the forwarding component, may change the forwarded value after its callers are checked (refused, not
 *  followed): a write to the name or a member of it (assignment, ++/--, delete, a mutating method, Object.assign & co), the name as an
 *  assignment or for-in/of target, or the value passed on other than in JSX: to a call or `new` not imported from the kit, stored by an
 *  assignment, aliased by a declaration, or returned. A call of a function declared in the page's views is followed into the parameter
 *  that takes it (depth 6). Passing on counts for the value itself (for a props parameter or rest binding, the object or its member of
 *  the prop's name), not for a member read from it */
const changedMemo = new WeakMap<ts.Identifier, Map<string, string | null>>();
function changedIn(p: Pick<Prop, 'fn' | 'bind' | 'whole' | 'name'>, checker: ts.TypeChecker, depth = 0): string | null {
  // each binding is read once per question (a helper reached again, or through a cycle, adds nothing new)
  const memo = changedMemo.get(p.bind) ?? new Map<string, string | null>();
  changedMemo.set(p.bind, memo);
  const mk = `${p.whole}:${p.name}`;
  if (memo.has(mk)) return memo.get(mk)!;
  memo.set(mk, null);
  const got = changedOnce(p, checker, depth);
  memo.set(mk, got);
  return got;
}
function changedOnce(p: Pick<Prop, 'fn' | 'bind' | 'whole' | 'name'>, checker: ts.TypeChecker, depth: number): string | null {
  const sym = checker.getSymbolAtLocation(p.bind);
  if (!sym) return 'cannot be resolved';
  const symOf = (id: ts.Identifier) => (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id));
  const keyOf = (b: ts.BindingElement) => { const k = b.propertyName ?? b.name; return ts.isIdentifier(k) || ts.isStringLiteralLike(k) ? k.text : undefined; };
  const changeOf = (id: ts.Identifier): string | null => {
    if (isWriteUse(id)) return `writes ${id.text}`;
    const top = chainTop(id);
    if (top !== id) {
      if (!p.whole) return null;
      let first: ts.Node = id.parent;
      while (ts.isParenthesizedExpression(first) || ts.isAsExpression(first) || ts.isNonNullExpression(first) || ts.isSatisfiesExpression(first)) first = first.parent;
      const key = ts.isPropertyAccessExpression(first) ? first.name.text : ts.isElementAccessExpression(first) && ts.isStringLiteralLike(unparen(first.argumentExpression)) ? (unparen(first.argumentExpression) as ts.StringLiteral).text : null;
      // another member, or a member read from the value: not the value (a computed key may be it)
      if (key !== null && (key !== p.name || unparen(top) !== first)) return null;
    }
    let n: ts.Node = top;
    for (;;) {
      const q: ts.Node = n.parent;
      if (ts.isParenthesizedExpression(q) || ts.isAsExpression(q) || ts.isNonNullExpression(q) || ts.isSatisfiesExpression(q)) n = q;
      else if (ts.isConditionalExpression(q) && q.condition !== n) n = q;
      else if (ts.isBinaryExpression(q) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(q.operatorToken.kind)) n = q;
      else if (ts.isShorthandPropertyAssignment(q) || (ts.isPropertyAssignment(q) && q.initializer === n) || ts.isSpreadAssignment(q) || ts.isSpreadElement(q) || ts.isObjectLiteralExpression(q) || ts.isArrayLiteralExpression(q)) n = q;
      else if (ts.isBinaryExpression(q) && q.operatorToken.kind === ts.SyntaxKind.EqualsToken) return q.left === n ? `assigns ${id.text}` : `stores ${id.text} elsewhere`;
      else if ((ts.isForOfStatement(q) || ts.isForInStatement(q)) && q.initializer === n) return `assigns ${id.text} in a loop`;
      else if (ts.isVariableDeclaration(q) && q.initializer === n) {
        if (ts.isObjectBindingPattern(q.name) && n === top && p.whole && !q.name.elements.some((b) => b.dotDotDotToken || keyOf(b) === p.name || keyOf(b) === undefined)) return null;
        return `aliases ${id.text}`;
      } else if ((ts.isCallExpression(q) || ts.isNewExpression(q)) && q.arguments?.includes(n as ts.Expression)) {
        if (kitCallee(q, checker)) return null;
        const passed = `passes ${id.text} to ${q.expression.getText()}(...)`;
        const fn = ts.isCallExpression(q) && n === top ? localFn(q, checker) : undefined;
        const prm = fn?.parameters[q.arguments.indexOf(n as ts.Expression)];
        if (!fn || !prm || prm.dotDotDotToken || depth >= 6) return passed;
        const host = p.whole && top === id;
        const into = (bind: ts.BindingName, whole: boolean) => (ts.isIdentifier(bind) ? changedIn({ fn, bind, whole, name: p.name }, checker, depth + 1) : 'destructures it further');
        const inner = ts.isIdentifier(prm.name) ? into(prm.name, host)
          : host && ts.isObjectBindingPattern(prm.name) ? prm.name.elements.map((b) => (b.dotDotDotToken ? into(b.name, true) : keyOf(b) === undefined ? 'has a computed key' : keyOf(b) === p.name ? into(b.name, false) : null)).find((x) => x) ?? null
          : 'destructures it';
        return inner ? `${passed}, which ${inner}` : null;
      }
      else if (ts.isReturnStatement(q) || (ts.isArrowFunction(q) && q.body === n)) return `returns ${id.text}`;
      else return null;
    }
  };
  let hit: string | null = null;
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (ts.isIdentifier(n) && n !== p.bind && n.text === p.bind.text && symOf(n) === sym) {
      const why = changeOf(n);
      if (why) hit = `${why} at ${n.getSourceFile().fileName}:${n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    }
    ts.forEachChild(n, visit);
  };
  visit(p.fn);
  return hit;
}
type Site = ts.JsxOpeningLikeElement | ts.CallExpression;
/** every element and every direct call of a component, hook or helper in the page's views (by the checker, through imports), and every
 *  other use of it (passed on, wrapped): those hide what it is given. Its declaration, imports and exports of it and type-only uses are neither */
function elementsOf(comp: ts.Symbol, views: ts.SourceFile[], checker: ts.TypeChecker): { els: Site[]; other: string[] } {
  const els: Site[] = [];
  const other: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      let s = checker.getSymbolAtLocation(n);
      if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
      const p = n.parent;
      if (s === comp && !(comp.declarations ?? []).some((d) => (d as ts.NamedDeclaration).name === n)) {
        if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === n) els.push(p);
        else if (ts.isCallExpression(p) && p.expression === n) els.push(p);
        else if (!(ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isJsxClosingElement(p) || ts.isTypeQueryNode(p)))
          other.push(`${n.getSourceFile().fileName}:${n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  for (const sf of views) visit(sf);
  return { els, other };
}
/** may a value spread or passed whole supply `prop`: yes unless the checker knows its type and no member of it (of a union, each) has the
 *  prop or an index signature; any, unknown and a type it cannot resolve may */
function typeMay(e: ts.Expression, prop: string, checker: ts.TypeChecker): boolean {
  const may = (t: ts.Type): boolean => {
    if (t.isUnion()) return t.types.some(may);
    if (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Never | ts.TypeFlags.BooleanLike | ts.TypeFlags.Void)) return false;
    if (!(t.flags & ts.TypeFlags.Object) && !t.isIntersection()) return true;
    return !!checker.getPropertyOfType(t, prop) || checker.getIndexInfosOfType(t).length > 0;
  };
  return may(checker.getTypeAtLocation(e));
}

/** Two roots of one file that cannot render together, as the pair exception needs. Accept-only: each
 *  root is reached from ONE function F by return statements, with no other function in between: inside a returned expression of
 *  F, or inside a local helper declared in F whose every use is `return helper(...)` in F. The roots then part at two different
 *  return statements, or at the two arms of a conditional that is itself the returned expression. Everything else is refused. */
function neverTogether(a: ts.Node, b: ts.Node): boolean {
  const fnOf = (n: ts.Node): ts.Node | undefined => { let p = n.parent; while (p && !ts.isFunctionLike(p)) p = p.parent; return p; };
  // the returned expression holding n before its function: a return statement's, or an arrow's expression body
  const returned = (n: ts.Node): ts.Expression | undefined => {
    for (let p: ts.Node = n; p.parent; p = p.parent) {
      if (ts.isReturnStatement(p.parent)) return p.parent.expression;
      if (ts.isArrowFunction(p.parent) && p.parent.body === p) return p as ts.Expression;
      if (ts.isFunctionLike(p.parent)) return undefined;
    }
    return undefined;
  };
  // where a root is returned from: F and the returned expressions (one, or a helper's `return helper(...)` calls)
  const reach = (r: ts.Node): { f: ts.Node; at: ts.Expression[] } | undefined => {
    const own = returned(r);
    const g = fnOf(r);
    if (!own || !g) return undefined;
    const d = g.parent;
    const name = d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer === g ? d.name : undefined;
    const f = name ? fnOf(d!) : undefined;
    // a root returned by F itself: F is a function declaration or a module-level named function, never an inline callback
    if (!name) return ts.isFunctionDeclaration(g) ? { f: g, at: [own] } : undefined;
    if (!f) return { f: g, at: [own] };
    const uses: ts.Node[] = [];
    const scan = (n: ts.Node) => { if (ts.isIdentifier(n) && n.text === name.text && n !== name) uses.push(n); ts.forEachChild(n, scan); };
    scan(f);
    const at: ts.Expression[] = [];
    for (const u of uses) {
      const call = u.parent;
      if (!call || !ts.isCallExpression(call) || call.expression !== u || !ts.isReturnStatement(call.parent) || fnOf(call) !== f) return undefined;
      at.push(call);
    }
    return at.length ? { f, at } : undefined;
  };
  const ra = reach(a);
  const rb = reach(b);
  if (!ra || !rb || ra.f !== rb.f) return false;
  for (const x of ra.at) for (const y of rb.at) {
    if (x !== y) continue;
    const c = unparen(x);
    const arm = (n: ts.Node) => (!ts.isConditionalExpression(c) ? 0 : n.getStart() >= c.whenTrue.getStart() && n.getEnd() <= c.whenTrue.getEnd() ? 1 : n.getStart() >= c.whenFalse.getStart() && n.getEnd() <= c.whenFalse.getEnd() ? 2 : 0);
    if (!(arm(a) && arm(b) && arm(a) !== arm(b))) return false;
  }
  return true;
}

/** Every problem of the FAQ contract in a tree of `rel -> source` (strings tables included). */
export function faqProblems(files: Record<string, string>): string[] {
  const out: string[] = [];
  // every module specifier of every non-test source in the tree (imports, re-exports, import() and require()), read once when needed
  let specs: { from: string; spec: string }[] | null = null;
  const allSpecs = () => (specs ??= Object.keys(files).filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f))
    .flatMap((f) => ts.preProcessFile(files[f]!, true, true).importedFiles.map((r) => ({ from: f, spec: r.fileName }))));
  const pages = Object.keys(files).flatMap((f) => PAGE_FAQ.exec(f)?.[1] ?? []);
  for (const page of pages) {
    const dir = `pages/${page}`;
    const faqSrc = files[`${dir}/faq.ts`] ?? '';
    const tableSrc = files[`${dir}/strings.en.json`];
    if (tableSrc === undefined) {
      out.push(`${dir}/faq.ts: no ${dir}/strings.en.json beside it to read the questions from`);
      continue;
    }
    let table: Record<string, unknown>;
    try {
      table = JSON.parse(tableSrc) as Record<string, unknown>;
    } catch {
      out.push(`${dir}/strings.en.json: not valid JSON`);
      continue;
    }
    // faq.<id>.q | faq.<id>.a | faq.<id>.a.<variant> (and their plural forms _one/_other)
    const ids = new Map<string, { q: string[]; a: string[] }>();
    for (const [key, val] of Object.entries(table)) {
      const m = /^faq\.([^.]+)\.([qa])(?:\.[A-Za-z][A-Za-z0-9]*)?(?:_(?:zero|one|two|few|many|other))?$/.exec(key);
      if (!m) {
        if (key.startsWith('faq.')) out.push(`${dir}/strings.en.json: ${key} is not faq.<id>.q or faq.<id>.a (or an a.<variant>)`);
        continue;
      }
      const e = ids.get(m[1]!) ?? { q: [], a: [] };
      (m[2] === 'q' ? e.q : e.a).push(typeof val === 'string' ? val : '');
      ids.set(m[1]!, e);
    }
    if (!ids.size) out.push(`${dir}/faq.ts: ${dir}/strings.en.json holds no faq.<id>.q / faq.<id>.a pair (an empty FAQ is refused)`);
    for (const [id, e] of ids) {
      if (!ID.test(id)) out.push(`${dir}: faq id '${id}' is not lower camelCase`);
      if (!e.q.length) out.push(`${dir}: faq.${id}.a has no faq.${id}.q`);
      if (!e.a.length) out.push(`${dir}: faq.${id}.q has no faq.${id}.a`);
      for (const q of e.q) if (!q.trim().endsWith('?')) out.push(`${dir}: faq.${id}.q must end with "?"`);
      for (const v of [...e.q, ...e.a]) if (!v.trim()) out.push(`${dir}: faq.${id} has an empty text`);
    }
    out.push(...builderProblems(`${dir}/faq.ts`, faqSrc, table));

    // the views: the archetype root gets the builder's result once; every FaqLink / overlay item names an item of this page
    const views = Object.keys(files).filter((f) => f.startsWith(`${dir}/`) && isSource(f));
    // every archetype root given the builder: its file, and whether it is a second-root-capable wizard (below)
    // `tag` and `bind` serve the TablePage + ListDetailPage pair below; `bind` is the symbol of `items` in a faq written { items } or { items: x }
    // `el` is the root's element (its JSX node), for the pair's never-together proof
    const roots: { file: string; wizardOwn: boolean; tag: string; bind?: ts.Symbol; el: ts.Node }[] = [];
    const program = viewProgram(files, views);
    const checker = program.getTypeChecker();
    const sfs = views.map((f) => program.getSourceFile(f)!);
    const ctxs = new Map(sfs.map((sf): [ts.SourceFile, Ctx] => [sf, { dir, rel: sf.fileName, sf, ids: new Set(ids.keys()), checker }]));
    const symIds = new Map<ts.Symbol, number>();
    // a value to check: what it is (for the message), its file, and the component prop it was passed to on the way ('' at the link itself);
    // `spread` marks a props parameter or rest binding spread on an element, standing for its `spread` prop
    type Src = { ex: ts.Expression; c: Ctx; what: string; via: string; spread?: string };
    type Check = (s: Src, depth: number, seen: Set<string>) => void;
    const at = (s: Src) => `${s.c.rel}: ${s.what} ${s.ex.getText()}`;
    /** A forwarder exported from its file and reached from outside the page (imported by a file outside it, or re-exported
     *  by another file, which outside files may import) has callers this page check does not see: refused, not followed */
    const exportedUse = (p: Prop): string | null => {
      const sf = p.fn.getSourceFile();
      const modSym = checker.getSymbolAtLocation(sf);
      const exported = !!modSym && checker.getExportsOfModule(modSym).some((e) => (e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e) === p.comp);
      if (!exported) return null;
      const mod = sf.fileName.replace(/\.[cm]?[jt]sx?$/, '');
      const tail = mod.slice(mod.indexOf('pages/'));
      const reaches = (from: string, spec: string) => {
        if (!spec.startsWith('.')) return spec.replace(/\.[cm]?[jt]sx?$/, '').endsWith(tail);
        const to = posix.normalize(posix.join(posix.dirname(from), spec)).replace(/\.[cm]?[jt]sx?$/, '');
        return to === mod || `${to}/index` === mod;
      };
      for (const r of allSpecs()) {
        if (r.from === sf.fileName || !reaches(r.from, r.spec)) continue;
        if (!r.from.startsWith(`${dir}/`)) return `imported by ${r.from}`;
        const other = parse(r.from, files[r.from]!);
        if (other.statements.some((st) => ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && reaches(r.from, st.moduleSpecifier.text))) return `re-exported by ${r.from}`;
      }
      return null;
    };
    /** what an element's `prop` can be (or a call's, from its first argument): its last explicit attribute or property, and every spread after
     *  it (a props parameter or rest binding is forwarded; any other spread whose type may hold the prop is refused). A call given a
     *  name instead of an object literal: that name is forwarded like a spread, or judged by its type */
    const propValues = (el: Site, prop: string, c: Ctx, what: string, via: string): Src[] => {
      const got: Src[] = [];
      const label = ts.isCallExpression(el) ? `${el.expression.getText()}(...)` : `<${kitName(el.tagName, checker)}>`;
      const spreadOf = (e: ts.Expression, shown: string) => {
        const p = paramProp(e, checker, prop);
        if (p === 'absent') return;
        if (p) got.push({ ex: e, c, what, via, spread: prop });
        else if (typeMay(e, prop, checker)) out.push(`${c.rel}: ${shown} on ${label} may supply ${prop}; give ${prop} after it${via}`);
      };
      const list: readonly (ts.JsxAttributeLike | ts.ObjectLiteralElementLike)[] = ts.isCallExpression(el)
        ? (el.arguments[0] && ts.isObjectLiteralExpression(unparen(el.arguments[0])) ? (unparen(el.arguments[0]) as ts.ObjectLiteralExpression).properties : [])
        : el.attributes.properties;
      if (ts.isCallExpression(el) && el.arguments[0] && !ts.isObjectLiteralExpression(unparen(el.arguments[0]))) {
        spreadOf(el.arguments[0], `the argument ${el.arguments[0].getText()}`);
        return got;
      }
      const named = (a: ts.Node) => (ts.isJsxAttribute(a) ? a.name.getText() : (ts.isPropertyAssignment(a) || ts.isShorthandPropertyAssignment(a)) ? propName(a.name) : undefined);
      let last = -1;
      list.forEach((a, i) => { if (named(a) === prop) last = i; });
      if (last >= 0) {
        const a = list[last]!;
        const ex = ts.isJsxAttribute(a) ? a.initializer && (ts.isJsxExpression(a.initializer) ? a.initializer.expression : ts.isStringLiteral(a.initializer) ? a.initializer : undefined)
          : ts.isPropertyAssignment(a) ? a.initializer : ts.isShorthandPropertyAssignment(a) ? a.name : undefined;
        if (ex) got.push({ ex, c, what, via });
        else out.push(`${c.rel}: ${label} ${prop} has no value to check${via}`);
      }
      list.forEach((a, i) => {
        if (i < last) return;
        if (ts.isJsxSpreadAttribute(a) || ts.isSpreadAssignment(a)) spreadOf(a.expression, `a spread {...${a.expression.getText()}}`);
        else if (!ts.isJsxAttribute(a) && a.name && ts.isComputedPropertyName(a.name)) out.push(`${c.rel}: a computed key ${a.name.getText()} on ${label} may supply ${prop}${via}`);
      });
      return got;
    };
    /** a forwarded parameter: follow it to every element of its component in the page and check what each passes (and its default) */
    const forward = (s: Src, check: Check, depth: number, seen: Set<string>): void => {
      const p = paramProp(s.ex, checker, s.spread);
      if (p === 'absent') return;
      const head = s.spread ? `${s.c.rel}: a spread {...${s.ex.getText()}} that may supply ${s.what}` : `${at(s)} is a parameter that`;
      if (!p) return void out.push(`${head} is not a prop of a named component, so what it is given cannot be checked${s.via}`);
      if (!symIds.has(p.comp)) symIds.set(p.comp, symIds.size);
      const key = `${symIds.get(p.comp)}#${p.name}`;
      if (seen.has(key)) return; // a cycle: every element's value is checked on the first pass
      if (depth > 8) return void out.push(`${head} is forwarded more than 8 components deep${s.via}`);
      const next = new Set(seen).add(key);
      const changed = changedIn(p, checker);
      if (changed) out.push(`${head} comes from ${p.compName}, which ${changed}; a forwarded value must reach the link unchanged${s.via}`);
      const ext = exportedUse(p);
      if (ext) out.push(`${head} comes from ${p.compName}, which is exported and ${ext}, so its callers cannot be checked; keep a forwarder inside its page${s.via}`);
      if (p.dflt) check({ ex: p.dflt, c: s.c, what: s.what, via: s.via }, depth + 1, next);
      const { els, other } = elementsOf(p.comp, sfs, checker);
      for (const o of other) out.push(`${head} comes from ${p.compName}, which is used other than as an element at ${o}${s.via}`);
      if (!els.length && !other.length) out.push(`${head} comes from ${p.compName}, which no element or call in ${dir} passes it${s.via}`);
      for (const el of els) for (const v of propValues(el, p.name, ctxs.get(el.getSourceFile())!, s.what, ` (passed to ${p.compName} as ${p.name})`)) check(v, depth + 1, next);
    };
    const checkItem: Check = (s, depth, seen) => {
      if (s.spread) return forward(s, checkItem, depth, seen);
      const r = itemRef(s.ex, s.c);
      if ('id' in r) {
        if (!s.c.ids.has(r.id)) out.push(`${s.c.rel}: ${s.what} byId.${r.id} is not an item of ${dir}/faq.ts${s.via}`);
      } else if (r.bad === 'computed') out.push(`${at(s)} is computed; name the item as byId.<id>${s.via}`);
      else if (r.bad === 'foreign') out.push(`${at(s)} does not come from ${dir}/faq.ts (pageFaq)${s.via}`);
      else forward(s, checkItem, depth, seen);
    };
    // a kit overlay: every value the faq can take (each leaf of ?:, &&, || and ?? at any depth) is nothing, the descriptor the anatomy rule
    // reads (exactly the plain keys item and label; its item is checked here), a parameter or a member of one (followed to what the page
    // passes it), or a const bound to such a value (names resolve through the checker). A literal with a spread, computed or extra key, any
    // other name, and any other leaf, is refused; so is JSX in a condition
    const checkOverlay: Check = (s, depth, seen) => {
      if (s.spread) return forward(s, checkOverlay, depth, seen);
      const f = s.c.rel;
      const { leaves, conds, unbound, forwarded } = overlayLeaves(s.ex, checker);
      if (conds.some(hasJsx)) out.push(`${f}: faq={...} overlay descriptor shown under a condition that holds JSX${s.via}`);
      for (const u of unbound) out.push(`${f}: faq={...} overlay faq ${u.getText()} is not a parameter or a const bound to a descriptor used only as an overlay faq${s.via}`);
      for (const l of leaves) {
        const d = ts.isObjectLiteralExpression(l) ? A.overlayFaqOf(l) : null;
        if (d) checkItem({ ex: d[0], c: s.c, what: 'faq item', via: s.via }, depth, seen);
        else if (ts.isObjectLiteralExpression(l)) out.push(`${f}: faq={...} overlay descriptor must be exactly { item, label } (a spread, computed or extra key cannot be checked)${s.via}`);
        else out.push(`${f}: faq={...} overlay faq ${l.getText()} is not a descriptor { item, label }, nothing, a parameter or a const bound to one${s.via}`);
      }
      for (const x of forwarded) forward({ ex: x, c: s.c, what: 'overlay faq', via: s.via }, checkOverlay, depth, seen);
    };
    for (const sf of sfs) {
      const c = ctxs.get(sf)!;
      const f = c.rel;
      // the checker throws on a few broken inputs (an import of a name the module does not export): the file is then refused, not passed
      const visitSafe = (n: ts.Node) => {
        try {
          visit(n);
        } catch (err) {
          out.push(`${f}: the checker could not read this file (${err instanceof Error ? err.message : String(err)}); nothing in it can be checked`);
        }
      };
      const visit = (n: ts.Node) => {
        if (ts.isJsxAttribute(n) && n.name.getText() === 'faq' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
          const ex = unparen(n.initializer.expression);
          const owner = n.parent.parent;
          const tag = ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner) ? kitName(owner.tagName, checker) : '';
          const nothing = (e: ts.Expression) => isNothing(e, checker);
          // a kit overlay's faq is judged with its element below (its last faq and the spreads after it)
          if (!OVERLAY_FAQ.includes(tag)) {
            // elsewhere: an overlay-like descriptor read by the anatomy rule's own shape test (exactly { item, label }, or one conditional
            // between it and nothing with no JSX in its condition)
            // (the shape test reads `undefined` by its text: here only the global one is nothing)
            const d = ts.isConditionalExpression(ex) && !nothing(ex.whenTrue) && !nothing(ex.whenFalse) ? null : A.overlayFaqOf(ex);
            const shown = ts.isConditionalExpression(ex) ? (nothing(ex.whenFalse) ? unparen(ex.whenTrue) : nothing(ex.whenTrue) ? unparen(ex.whenFalse) : ex) : ex;
            const hasItem = ts.isObjectLiteralExpression(shown) && shown.properties.some((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'item');
            if (d) checkItem({ ex: d[0], c, what: 'faq item', via: '' }, 0, new Set());
            else if (hasItem) out.push(`${f}: faq={...} overlay descriptor must be exactly { item, label }, or one conditional between it and nothing with no JSX in the condition`);
            else {
              const k = faqKind(ex, c);
              if (k === 'empty' || k === 'absent') out.push(`${f}: faq={...} is empty; a page with a faq.ts passes its items`);
              else if (k === 'foreign') out.push(`${f}: faq={...} does not come from ${dir}/faq.ts (pageFaq)`);
              else if (ARCHETYPE.test(tag)) {
                // a WizardPage, or a ListDetailPage (a tab of the page drawn by its own view file), given the page's own pageFaq(t) as written:
                // the call itself, or one arm of a conditional whose other arm is undefined
                const own = (e: ts.Expression) => isBuilderCall(unparen(e), c);
                const isUndef = (e: ts.Expression) => { e = unparen(e); return ts.isIdentifier(e) && e.text === 'undefined' && nothing(e); };
                const wizardOwn = (tag === 'WizardPage' || tag === 'ListDetailPage') && (own(ex) || (ts.isConditionalExpression(ex) && ((own(ex.whenTrue) && isUndef(ex.whenFalse)) || (isUndef(ex.whenTrue) && own(ex.whenFalse)))));
                const only = ts.isObjectLiteralExpression(ex) && ex.properties.length === 1 ? ex.properties[0]! : undefined;
                const bind = only && ts.isShorthandPropertyAssignment(only) && only.name.text === 'items' ? checker.getShorthandAssignmentValueSymbol(only)
                  : only && ts.isPropertyAssignment(only) && ts.isIdentifier(only.name) && only.name.text === 'items' && ts.isIdentifier(unparen(only.initializer)) ? checker.getSymbolAtLocation(unparen(only.initializer))
                  : undefined;
                roots.push({ file: f, wizardOwn, tag, bind, el: ts.isJsxOpeningElement(owner) ? owner.parent : owner });
              }
            }
          }
        }
        // A namespace-qualified kit FAQ tag, and a kit FAQ element made through a factory, are refused (not resolved)
        if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && ts.isPropertyAccessExpression(n.tagName) && isKitFaq(n.tagName.name.text))
          out.push(`${f}: <${n.tagName.getText()}> is a namespace-qualified kit tag, which the check cannot read; import ${n.tagName.name.text} by name`);
        if (ts.isCallExpression(n) && n.arguments[0]) {
          const callee = unparen(n.expression);
          const fname = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
          const a0 = unparen(n.arguments[0]);
          const made = ts.isIdentifier(a0) ? kitName(a0, checker) : ts.isPropertyAccessExpression(a0) ? a0.name.text
            : ts.isJsxSelfClosingElement(a0) ? kitName(a0.tagName, checker) : ts.isJsxElement(a0) ? kitName(a0.openingElement.tagName, checker) : '';
          if (FACTORIES.has(fname) && isKitFaq(made)) out.push(`${f}: ${fname}(${made}, ...) makes a kit FAQ element the check cannot read; write it as <${made} ...>`);
        }
        if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
          // a FaqLink's item and a kit overlay's faq: the last explicit attribute and every spread after it (a JSX spread may carry them)
          const tag = kitName(n.tagName, checker);
          if (tag === 'FaqLink') {
            const vals = propValues(n, 'item', c, 'FaqLink item', '');
            if (!vals.length && !n.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a) || (ts.isJsxAttribute(a) && a.name.getText() === 'item'))) out.push(`${f}: FaqLink has no item={...}`);
            for (const v of vals) checkItem(v, 0, new Set());
          } else if (OVERLAY_FAQ.includes(tag)) for (const v of propValues(n, 'faq', c, 'overlay faq', '')) checkOverlay(v, 0, new Set());
          // an archetype root's faq is read only as written on it (faq={...}); a spread that may carry `faq` hides the page FAQ from
          // this check and from the one-root count, so it is refused wherever it sits
          // A spread the check reads by its letters (an object literal, or a condition between literals, `{}` included) is refused only
          // when a literal holds `faq`, a computed key or a spread; any other spread (a name, a call) is refused whatever its type says,
          // since a declared type can hide a `faq` its value carries
          else if (ARCHETYPE.test(tag))
            for (const a of n.attributes.properties) {
              if (!ts.isJsxSpreadAttribute(a)) continue;
              const lits: ts.ObjectLiteralExpression[] = [];
              const readable = (e: ts.Expression): boolean => {
                e = unparen(e);
                if (ts.isObjectLiteralExpression(e)) return (lits.push(e), true);
                if (ts.isConditionalExpression(e)) return readable(e.whenTrue) && readable(e.whenFalse);
                return false;
              };
              const hides = !readable(a.expression)
                || lits.some((o) => o.properties.some((p) => !(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) || ts.isComputedPropertyName(p.name) || p.name.getText().replace(/['"]/g, '') === 'faq'));
              if (hides) out.push(`${f}: a spread {...${a.expression.getText()}} on <${tag}> may supply faq, which the check cannot read; write faq={...} on it`);
            }
        }
        ts.forEachChild(n, visit);
      };
      visitSafe(sf);
    }
    if (roots.length === 0) out.push(`${dir}: faq.ts exists but no archetype page passes it the builder's result as faq={...}`);
    // One FAQ root per page. The one exception: a second root that is a WizardPage in another view
    // file than the first, given the page's own pageFaq(t) (a wizard route of the page, such as New script, never shown with the list).
    // The same holds for a ListDetailPage in another view file given pageFaq(t) (a tab of the page with its own list pane, such as
    // Programs' Ports & aliases, never shown with the first tab); the first root is then not given the bare call.
    const second = roots.length === 2 && roots[0]!.file !== roots[1]!.file && roots.some((r, i) => r.wizardOwn && !roots[1 - i]!.wizardOwn);
    // The second exception: in ONE view file, a TablePage and a ListDetailPage given the same `items`
    // binding as faq={{ items }} (the list and its detail form of one page, never shown together) count as one root.
    const pair = roots.length === 2 && roots[0]!.file === roots[1]!.file && new Set(roots.map((r) => r.tag)).size === 2
      && roots.every((r) => r.tag === 'TablePage' || r.tag === 'ListDetailPage') && !!roots[0]!.bind && roots[0]!.bind === roots[1]!.bind
      && neverTogether(roots[0]!.el, roots[1]!.el);
    if (roots.length > 1 && !second && !pair) out.push(`${dir}: ${roots.length} archetype pages are given a faq; a page has one FAQ root`);
  }
  // a page that builds a faq without faq.ts has no single place for it
  for (const [f, src] of Object.entries(files)) {
    const page = /^pages\/([^/]+)\//.exec(f)?.[1];
    if (!page || !isSource(f) || pages.includes(page)) continue;
    if (/\bpageFaq\b/.test(src) || /\bfaq=\{/.test(src)) out.push(`${f}: passes a faq but pages/${page}/faq.ts does not exist`);
  }
  return out;
}

const T = (o: Record<string, string>) => JSON.stringify(o);
const FAQ_TS = "export function pageFaq(t: (k: string) => string) {\n  const items = [{ id: 'rate', q: t('faq.rate.q'), a: t('faq.rate.a') }];\n  return { items, byId: { rate: items[0]! } };\n}";
const IMP = "import { pageFaq } from './faq';\n";
const VIEW = `${IMP}export function V() { const { items, byId } = pageFaq(t); return <TablePage faq={{ items }}><FaqLink item={byId.rate}>more</FaqLink></TablePage>; }`;
const GOOD: Record<string, string> = { 'pages/x/faq.ts': FAQ_TS, 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How is it paid?', 'faq.rate.a': 'In credit.' }), 'pages/x/view.tsx': VIEW };
const with_ = (o: Record<string, string | null>) => Object.fromEntries(Object.entries({ ...GOOD, ...o }).filter(([, v]) => v !== null)) as Record<string, string>;
const view = (body: string) => `${IMP}${body}`;

describe('page FAQ conformance: fixtures', () => {
  it('a page with one pair, a question mark, the builder given to the archetype root and a FaqLink to byId.<id> is clean', () => {
    expect(faqProblems(GOOD)).toEqual([]);
  });
  const bad = (name: string, files: Record<string, string>, want: RegExp) => it(`mutant: ${name}`, () => expect(faqProblems(files).join('\n')).toMatch(want));

  // the table
  bad('a question without an answer', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How?' }) }), /faq\.rate\.q has no faq\.rate\.a/);
  bad('an answer without a question', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.a': 'In credit.' }) }), /faq\.rate\.a has no faq\.rate\.q/);
  bad('a question that is a statement', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How it is paid', 'faq.rate.a': 'In credit.' }) }), /must end with "\?"/);
  bad('an empty answer', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How?', 'faq.rate.a': '  ' }) }), /empty text/);
  bad('an id that is not camelCase', with_({ 'pages/x/strings.en.json': T({ 'faq.Rate-1.q': 'How?', 'faq.Rate-1.a': 'x' }), 'pages/x/faq.ts': FAQ_TS.replace(/rate/g, 'Rate-1') }), /not lower camelCase/);
  bad('a faq key that is neither .q nor .a', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How?', 'faq.rate.a': 'x', 'faq.rate.note': 'y' }) }), /faq\.rate\.note is not faq\.<id>\.q or faq\.<id>\.a/);
  bad('no FAQ at all', with_({ 'pages/x/strings.en.json': T({ other: 'x' }) }), /holds no faq/);
  bad('no strings table beside faq.ts', with_({ 'pages/x/strings.en.json': null }), /no pages\/x\/strings\.en\.json beside it/);
  bad('a table pair no item reads', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How?', 'faq.rate.a': 'x', 'faq.extra.q': 'Why?', 'faq.extra.a': 'y' }) }), /faq\.extra\.q is in the table but no item reads it/);
  bad('an answer variant no item reads', with_({ 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How?', 'faq.rate.a': 'x', 'faq.rate.a.unknown': 'y' }) }), /faq\.rate\.a\.unknown is in the table but no item reads it/);
  bad('an item the table does not hold', with_({ 'pages/x/faq.ts': FAQ_TS.replace("rate: items[0]!", "rate: items[0]!, ghost: items[1]!").replace("a: t('faq.rate.a') }]", "a: t('faq.rate.a') }, { id: 'ghost', q: t('faq.ghost.q'), a: t('faq.ghost.a') }]") }), /reads faq\.ghost\.q which the table does not hold/);

  // the builder: one form
  bad('an item id twice', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a') }]", "a: t('faq.rate.a') }, { id: 'rate', q: t('faq.rate.q'), a: t('faq.rate.a') }]") }), /an item id appears twice/);
  bad('a builder that returns an empty list and keeps its items in an unused object', with_({ 'pages/x/faq.ts': "const unused = { id: 'rate', q: 'Wrong?', a: '' };\nexport function pageFaq(t: (k: string) => string) { return { items: [], byId: {} }; }" }), /holds something other than the exported pageFaq|must be exactly/);
  bad('an item whose q and a are unrelated literals', with_({ 'pages/x/faq.ts': FAQ_TS.replace("t('faq.rate.q')", "'Unrelated?'").replace("t('faq.rate.a')", "'Unrelated.'") }), /q must be t\('faq\.rate\.q'\)/);
  bad('an item whose answer reads another id', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a')", "a: t('faq.other.a')") }), /a must be t\('faq\.rate\.a'\)/);
  bad('a computed answer property', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a')", "['a']: t('faq.rate.a')") }), /holds exactly id, q and a|plain id\/q\/a property/);
  bad('an item with a repeated member', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a')", "a: t('faq.rate.a'), a: t('faq.rate.a')") }), /repeats the member a/);
  bad('an item with a spread', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a')", "a: t('faq.rate.a'), ...more") }), /plain id\/q\/a property/);
  bad('an answer that joins two keys', with_({ 'pages/x/faq.ts': FAQ_TS.replace("a: t('faq.rate.a')", "a: t('faq.rate.a') + t('faq.rate.a')") }), /a must be t\('faq\.rate\.a'\)/);
  bad('items built by map', with_({ 'pages/x/faq.ts': FAQ_TS.replace(/const items = \[.*\];/, "const items = ['rate'].map((id) => ({ id, q: t('faq.rate.q'), a: t('faq.rate.a') }));") }), /items must be a literal array/);
  bad('a byId entry that points at another item', with_({ 'pages/x/faq.ts': FAQ_TS.replace("rate: items[0]!", "rate: items[1]!") }), /byId\.rate must be items\[i\]/);
  bad('a helper beside pageFaq', with_({ 'pages/x/faq.ts': `${FAQ_TS}\nconst z = t('faq.lost.a');` }), /holds something other than the exported pageFaq/);

  // the views
  bad('no view passing the builder', with_({ 'pages/x/view.tsx': 'export function V() { return <TablePage />; }' }), /no archetype page passes it/);
  bad('a root given an empty faq', with_({ 'pages/x/view.tsx': 'export function V() { return <TablePage faq={[]} />; }' }), /faq=\{\.\.\.\} is empty/);
  bad('a root given the empty items object', with_({ 'pages/x/view.tsx': 'export function V() { return <TablePage faq={{ items: [] }} />; }' }), /faq=\{\.\.\.\} is empty/);
  bad('the builder spread and then emptied', with_({ 'pages/x/view.tsx': view('export function V() { return <TablePage faq={{ ...pageFaq(t), items: [] }} />; }') }), /faq=\{\.\.\.\} is empty/);
  bad('a later spread that empties the builder', with_({ 'pages/x/view.tsx': view('export function V() { return <TablePage faq={{ ...pageFaq(t), ...{ items: [] } }} />; }') }), /faq=\{\.\.\.\} is empty/);
  bad('a conditional with nothing in either branch', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { return <TablePage faq={c ? undefined : null} />; }') }), /faq=\{\.\.\.\} is empty/);
  bad('items of another source', with_({ 'pages/x/view.tsx': "export function V() { const items = [{ id: 'rate', q: 'x?', a: 'y' }]; return <TablePage faq={{ items }}><FaqLink item={items[0]}>more</FaqLink></TablePage>; }" }), /does not come from pages\/x\/faq\.ts/);
  bad('a builder imported from another page under the same name', with_({ 'pages/x/view.tsx': "import { pageFaq } from '../other/faq';\nexport function V() { const f = pageFaq(t); return <TablePage faq={f}><FaqLink item={f.byId.rate}>more</FaqLink></TablePage>; }" }), /does not come from pages\/x\/faq\.ts/);
  bad('a faq given to a descendant that may drop it', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage><Child faq={f} /></TablePage>; }') }), /no archetype page passes it/);
  bad('two archetype roots', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <><TablePage faq={f} /><SettingsPage faq={f} /></>; }') }), /one FAQ root/);
  // the wizard exception: only a WizardPage in another file, given pageFaq(t) itself
  const WIZ = (faq: string, tag = 'WizardPage') => view(`export function W({ done }: any) { return <${tag} faq={${faq}} />; }`);
  it('a second root that is a WizardPage in another view file, given pageFaq(t) (bare or against undefined), is clean', () => {
    expect(faqProblems(with_({ 'pages/x/wizard.tsx': WIZ('pageFaq(t)') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/wizard.tsx': WIZ('done ? undefined : pageFaq(t)') }))).toEqual([]);
  });
  it('a second root that is a ListDetailPage in another view file (a tab of the page), given pageFaq(t), is clean', () => {
    expect(faqProblems(with_({ 'pages/x/tab.tsx': WIZ('pageFaq(t)', 'ListDetailPage') }))).toEqual([]);
  });
  bad('a ListDetailPage second root given another list of the builder', with_({ 'pages/x/tab.tsx': WIZ('{ items: pageFaq(t).items }', 'ListDetailPage') }), /one FAQ root/);
  bad('a ListDetailPage second root in the same file as the first', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <><TablePage faq={{ items }} /><ListDetailPage faq={pageFaq(t)} /></>; }') }), /one FAQ root/);
  bad('two roots both given the bare builder call', with_({ 'pages/x/view.tsx': view('export function V() { return <ListDetailPage faq={pageFaq(t)} />; }'), 'pages/x/tab.tsx': WIZ('pageFaq(t)', 'ListDetailPage') }), /one FAQ root/);
  bad('a WizardPage second root in the same file as the first', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <><TablePage faq={{ items }} /><WizardPage faq={pageFaq(t)} /></>; }') }), /one FAQ root/);
  bad('a WizardPage second root given another list of the builder', with_({ 'pages/x/wizard.tsx': WIZ('{ items: pageFaq(t).items }') }), /one FAQ root/);
  bad('a second root that is not a WizardPage', with_({ 'pages/x/wizard.tsx': WIZ('pageFaq(t)', 'SettingsPage') }), /one FAQ root/);
  // the list + detail pair: one file, TablePage and ListDetailPage, the same items binding written { items }
  it('a TablePage and a ListDetailPage in one file given the same items binding are one root', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); return d ? <ListDetailPage faq={{ items }} /> : <TablePage faq={{ items }} />; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); return d ? <ListDetailPage faq={{ items: items }} /> : <TablePage faq={{ items }} />; }') }))).toEqual([]);
  });
  bad('a TablePage and a ListDetailPage given different items bindings', with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); const { items: b } = pageFaq(t); return d ? <ListDetailPage faq={{ items: b }} /> : <TablePage faq={{ items }} />; }') }), /one FAQ root/);
  bad('a TablePage and a ListDetailPage given the builder object', with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const f = pageFaq(t); return d ? <ListDetailPage faq={f} /> : <TablePage faq={f} />; }') }), /one FAQ root/);
  bad('the pair in two files', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <TablePage faq={{ items }} />; }'), 'pages/x/detail.tsx': view('export function D() { const { items } = pageFaq(t); return <ListDetailPage faq={{ items }} />; }') }), /one FAQ root/);
  bad('two TablePages given the same items binding', with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); return d ? <TablePage faq={{ items }} /> : <TablePage faq={{ items }} />; }') }), /one FAQ root/);
  bad('a faq spread onto an archetype root', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const p = { faq: { items } }; return <TablePage {...p} />; }') }), /a spread \{\.\.\.p\} on <TablePage> may supply faq/);
  bad('a faq spread onto the second of the pair', with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); const p = { faq: { items } }; return d ? <ListDetailPage {...p} /> : <TablePage faq={{ items }} />; }') }), /a spread \{\.\.\.p\} on <ListDetailPage> may supply faq/);
  bad('a spread before an explicit faq', with_({ 'pages/x/view.tsx': view('export function V({ rest }: any) { const { items } = pageFaq(t); return <TablePage {...rest} faq={{ items }} />; }') }), /a spread \{\.\.\.rest\} on <TablePage> may supply faq/);
  it('a literal spread without faq is not refused', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <TablePage {...{ id: "x" }} faq={{ items }} />; }') }))).toEqual([]);
  });
  bad('the pair as JSX siblings', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <><TablePage faq={{ items }} /><ListDetailPage faq={{ items }} /></>; }') }), /one FAQ root/);
  bad('the pair nested', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <ListDetailPage faq={{ items }}><TablePage faq={{ items }} /></ListDetailPage>; }') }), /one FAQ root/);
  bad('the pair beside each other under two && guards', with_({ 'pages/x/view.tsx': view('export function V({ a, b }: any) { const { items } = pageFaq(t); return <>{a && <TablePage faq={{ items }} />}{b && <ListDetailPage faq={{ items }} />}</>; }') }), /one FAQ root/);
  bad('a helper root called inside the other root', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const table = () => <TablePage faq={{ items }} />; return <ListDetailPage faq={{ items }}>{table()}</ListDetailPage>; }') }), /one FAQ root/);
  it('the pair in two return statements, or a local helper root returned on its own, is one root', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); if (d) return <TablePage faq={{ items }} />; return <ListDetailPage faq={{ items }} />; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ d }: any) { const { items } = pageFaq(t); const table = () => (<><TablePage faq={{ items }} /></>); if (d) return table(); return <ListDetailPage faq={{ items }} />; }') }))).toEqual([]);
  });
  bad('the pair as the arms of a conditional inside a .map callback', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <>{[0, 1].map((i) => (i ? <TablePage faq={{ items }} /> : <ListDetailPage faq={{ items }} />))}</>; }') }), /one FAQ root/);
  bad('a helper root called outside the other root, in the same tree', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const table = () => <TablePage faq={{ items }} />; return <><Box>{table()}</Box><ListDetailPage faq={{ items }} /></>; }') }), /one FAQ root/);
  bad('a sibling component rendered beside the other root', with_({ 'pages/x/view.tsx': view('function A({ items }: any) { return <TablePage faq={{ items }} />; }\nexport function V() { const { items } = pageFaq(t); return <><A items={items} /><ListDetailPage faq={{ items }} /></>; }') }), /one FAQ root/);
  bad('the pair as two consts rendered together', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const a = <TablePage faq={{ items }} />; const b = <ListDetailPage faq={{ items }} />; return <>{a}{b}</>; }') }), /one FAQ root/);
  bad('a spread with a narrowed type that carries faq', with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const p: { id: string } = { id: "x", faq: { items: [] } } as any; return <TablePage faq={{ items }} {...p} />; }') }), /a spread \{\.\.\.p\} on <TablePage> may supply faq/);
  bad('a conditional literal spread that carries faq', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const { items } = pageFaq(t); return <TablePage {...(c ? { faq: { items } } : {})} />; }') }), /may supply faq/);
  it('a conditional literal spread without faq (the optional-prop idiom) is not refused', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ c, m }: any) { const { items } = pageFaq(t); return <TablePage faq={{ items }} {...(c ? { menu: m } : {})} />; }') }))).toEqual([]);
  });
  bad('a third root beside the pair', with_({ 'pages/x/view.tsx': view('export function V({ d, e }: any) { const { items } = pageFaq(t); return e ? <DetailPage faq={{ items }} /> : d ? <ListDetailPage faq={{ items }} /> : <TablePage faq={{ items }} />; }') }), /3 archetype pages/);
  bad('a third root beside the wizard', with_({ 'pages/x/wizard.tsx': WIZ('pageFaq(t)'), 'pages/x/other.tsx': view('export function O() { return <DetailPage faq={pageFaq(t)} />; }') }), /3 archetype pages/);
  bad('a FaqLink given an item that is not from the builder', with_({ 'pages/x/view.tsx': VIEW.replace('item={byId.rate}', 'item={other.byId.rate}') }), /does not come from pages\/x\/faq\.ts/);
  bad('a FaqLink to an item of no page', with_({ 'pages/x/view.tsx': VIEW.replace('byId.rate', 'byId.nope') }), /byId\.nope is not an item/);
  bad('a computed FaqLink item', with_({ 'pages/x/view.tsx': VIEW.replace('byId.rate', 'byId[k]') }), /is computed/);
  bad('a computed item reached through an alias', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const item = f.byId[k]; return <TablePage faq={f}><FaqLink item={item}>more</FaqLink></TablePage>; }') }), /is computed/);
  bad('an unknown item reached through an alias', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const item = f.byId.nope; return <TablePage faq={f}><FaqLink item={item}>more</FaqLink></TablePage>; }') }), /byId\.nope is not an item/);
  bad('an overlay descriptor naming an unknown item', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={{ item: f.byId.nope, label: "x" }} /></TablePage>; }') }), /byId\.nope is not an item/);
  bad('a conditional overlay descriptor naming an unknown item', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { item: f.byId.nope, label: "x" } : undefined} /></TablePage>; }') }), /byId\.nope is not an item/);
  bad('a conditional overlay descriptor whose item is not from the builder', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? undefined : { item: other.byId.rate, label: "x" }} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('a faq passed by a page with no faq.ts', { 'pages/y/view.tsx': 'export function V() { return <TablePage faq={{ items }} />; }' }, /pages\/y\/faq\.ts does not exist/);

  bad('a conditional overlay descriptor with a spread after its item', with_({ 'pages/x/view.tsx': view('export function V({ c, o }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { item: f.byId.rate, ...o, label: "x" } : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('an overlay descriptor with an extra key', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={{ item: f.byId.rate, label: "x", note: "y" }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('an overlay descriptor with a computed key', with_({ 'pages/x/view.tsx': view('export function V({ k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={{ item: f.byId.rate, [k]: "x" }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a nested conditional overlay descriptor whose item is not from the builder', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? (d ? { item: other.byId.rate, label: \"x\" } : undefined) : undefined} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('a ternary chain overlay descriptor whose item is not from the builder (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? undefined : d ? { item: other.byId.rate, label: \"x\" } : null} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('a conditional overlay descriptor with JSX in its condition', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={<b>x</b> ? { item: f.byId.rate, label: "x" } : undefined} /></TablePage>; }') }), /overlay descriptor shown under a condition that holds JSX/);
  it('control: an overlay descriptor { item, label } from the builder, plain or in one conditional with nothing in either branch order, is clean', () => {
    for (const faq of ['{ item: f.byId.rate, label: "x" }', 'c ? { item: f.byId.rate, label: "x" } : undefined', 'c ? null : { item: f.byId.rate, label: "x" }'])
      expect(faqProblems(with_({ 'pages/x/view.tsx': view(`export function V({ c }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={${faq}} /></TablePage>; }`) }))).toEqual([]);
  });
  bad('a spread-only overlay descriptor', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={{ ...d }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a spread-only overlay descriptor in a conditional (literal first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { ...d } : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a spread-only overlay descriptor in a conditional (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? null : { ...d }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with a spread (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? undefined : { item: f.byId.rate, ...d, label: \"x\" }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with an extra key (literal first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { item: f.byId.rate, label: \"x\", note: \"y\" } : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with an extra key (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? null : { item: f.byId.rate, label: \"x\", note: \"y\" }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with a computed key (literal first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { item: f.byId.rate, [k]: \"x\" } : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with a computed key (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? undefined : { item: f.byId.rate, [k]: \"x\" }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional overlay descriptor with JSX in its condition (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, k }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={<b>x</b> ? undefined : { item: f.byId.rate, label: \"x\" }} /></TablePage>; }') }), /overlay descriptor shown under a condition that holds JSX/);
  bad('a nested spread-only overlay descriptor (literal first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? (d ? { ...e } : undefined) : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a nested spread-only overlay descriptor (nothing first)', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? null : (d ? undefined : { ...e })} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a conditional between two spread-only overlay descriptors', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { ...e } : { ...g }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a three-deep spread-only overlay descriptor', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? (d ? (g ? { ...e } : undefined) : undefined) : undefined} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a three-deep overlay descriptor whose item is not from the builder', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? (d ? null : (g ? { item: other.byId.rate, label: \"x\" } : undefined)) : undefined} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('a spread-only overlay descriptor behind &&', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c && { ...e }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a spread-only overlay descriptor behind ??', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={e ?? { ...g }} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('an overlay descriptor behind || whose item is not from the builder', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c || { item: other.byId.rate, label: \"x\" }} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('an overlay faq that is a call', with_({ 'pages/x/view.tsx': view('export function V({ c, d, e, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={g(e)} /></TablePage>; }') }), /overlay faq g\(e\) is not a descriptor/);
  bad('a name bound to a spread-only overlay descriptor', with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); const d = c ? { ...e } : undefined; return <TablePage faq={f}><ConfirmDialog faq={d} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a name bound to an overlay descriptor whose item is not from the builder', with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); const d = { item: other.byId.rate, label: \"x\" }; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  it('control: a name bound to a descriptor from the builder is clean', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); const d = { item: f.byId.rate, label: \"x\" }; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }))).toEqual([]);
  });
  bad('a shadowed inner declaration does not hide the spread-only const the faq reads', with_({ 'pages/x/view.tsx': view('export function V({ e }: any) { const f = pageFaq(t); { const d = undefined; void d; } const d = { ...e }; return <TablePage faq={f}><ConfirmDialog faq={d} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a shadowed const in a sibling if-block does not hide the spread-only const the faq reads', with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); if (c) { const d = undefined; void d; } else { const d = { item: f.byId.rate, label: \"x\" }; void d; } const d = { ...e }; return <TablePage faq={f}><ConfirmDialog faq={d} /></TablePage>; }') }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a let reassigned to a spread-only descriptor', with_({ 'pages/x/view.tsx': view('export function V({ e }: any) { const f = pageFaq(t); let d: any = undefined; d = { ...e }; return <TablePage faq={f}><ConfirmDialog faq={d} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a let given a good descriptor and later d = a spread-only one', with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); let d: any = { item: f.byId.rate, label: \"x\" }; if (c) d = { ...e }; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a var bound to a good descriptor (only a const is followed)', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); var d = { item: f.byId.rate, label: \"x\" }; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a name destructured from a local object', with_({ 'pages/x/view.tsx': view('export function V({ o }: any) { const f = pageFaq(t); const { d } = o; return <TablePage faq={f}><ConfirmDialog faq={d} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a name the checker cannot resolve', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t);  return <TablePage faq={f}><ConfirmDialog faq={c ? nowhere : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('an imported name', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t);  return <TablePage faq={f}><ConfirmDialog faq={c ? pageFaq : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a const whose item is replaced through a member', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); const d = { item: f.byId.rate, label: \"x\" }; d.item = other.byId.rate; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a const aliased and written through the alias', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); const d = { item: f.byId.rate, label: \"x\" }; const a: any = d; a.item = other.byId.rate; return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a const passed to a call that can change it', with_({ 'pages/x/view.tsx': view('export function V({ c, e }: any) { const f = pageFaq(t); const d = { item: f.byId.rate, label: \"x\" }; Object.assign(d, e); return <TablePage faq={f}><ConfirmDialog faq={c ? d : undefined} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  bad('a member of a const holding a spread-only descriptor', with_({ 'pages/x/view.tsx': view('export function V({ e }: any) { const f = pageFaq(t); const o = { faq: { ...e } }; return <TablePage faq={f}><ConfirmDialog faq={o.faq} /></TablePage>; }') }), /overlay faq \w+(\.\w+)? is not a parameter or a const bound to a descriptor/);
  // a page's element of V that passes a good descriptor as faq (and as e), so V's forwarded parameters have a caller to be checked at
  const USE = { 'pages/x/use.tsx': view("import { V } from './view';\nexport function U() { const f = pageFaq(t); return <V faq={{ item: f.byId.rate, label: 'x' }} e={{ item: f.byId.rate, label: 'y' }} c d />; }") };
  it('control: a props member, a destructured prop (renamed too), a rest member and a const used only as overlay faqs are followed to a good caller', () => {
    const page = (params: string, body: string, jsx: string) => faqProblems(with_({ ...USE, 'pages/x/view.tsx': view(`export function V(${params}) { const f = pageFaq(t); ${body} return <TablePage faq={f}>${jsx}</TablePage>; }`) }));
    expect(page('props: any', '', '<ConfirmDialog faq={props.faq} />')).toEqual([]);
    expect(page('{ faq }: any', '', '<ConfirmDialog faq={faq} />')).toEqual([]);
    expect(page('{ faq: g }: any', '', '<ConfirmDialog faq={g} />')).toEqual([]);
    expect(page('{ c, ...rest }: any', '', '<ConfirmDialog faq={c ? rest.faq : undefined} />')).toEqual([]);
    expect(page('{ c }: any', 'const d = { item: f.byId.rate, label: "x" };', '<ConfirmDialog faq={c ? d : undefined} /><Dialog faq={d} />')).toEqual([]);
  });
  it('control: on a kit overlay a forwarded prop, at any depth of ?:, && and ??, is clean when every element of its component passes a good descriptor', () => {
    for (const faq of ['e', 'c ? e : undefined', 'c ? null : d ? e : undefined', 'e ?? undefined', 'c && e'])
      expect(faqProblems(with_({ ...USE, 'pages/x/view.tsx': view(`export function V({ c, d, e }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={${faq}} /></TablePage>; }`) }))).toEqual([]);
  });
  it('control: a three-deep conditional whose leaves are descriptors from the builder or nothing is clean', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ c, d, g }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? (d ? (g ? { item: f.byId.rate, label: "x" } : undefined) : null) : { item: f.byId.rate, label: "y" }} /></TablePage>; }') }))).toEqual([]);
  });
  it('control: answer variants chosen by a conditional, and plurals, are part of the answer', () => {
    const faq = FAQ_TS.replace("a: t('faq.rate.a')", "a: c ? t('faq.rate.a') : t('faq.rate.a.unknown')").replace('(t: (k: string) => string)', '(t: (k: string) => string, c: boolean)');
    expect(faqProblems(with_({ 'pages/x/faq.ts': faq, 'pages/x/strings.en.json': T({ 'faq.rate.q': 'How is it paid?', 'faq.rate.a': 'In credit.', 'faq.rate.a.unknown': 'Not yet.', 'faq.rate.a_one': 'One.', 'faq.rate.a_other': 'Many.' }) }))).toEqual([]);
  });
  it('control: the builder given through a name, a conditional with nothing, or a forwarding prop is a root', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}>x</TablePage>; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V({ show }: any) { const f = pageFaq(t); return <TablePage faq={show ? f : undefined} />; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { return <TablePage faq={pageFaq(t)} />; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); return <TablePage faq={{ items }} />; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { return <Wrap faq={pageFaq(t)} />; }'), 'pages/x/parts/Wrap.tsx': 'export function W({ faq }: { faq: FaqSpec }) { return <TablePage faq={faq} />; }' }))).toEqual([]);
  });
  it('control: a FaqLink given a FaqItem prop, an overlay descriptor (also one shown only in some states) and a test harness of its own are clean', () => {
    const v = view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={{ item: f.byId.rate, label: "How?" }} /></TablePage>; }');
    const shown = view('export function V({ c }: any) { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={c ? { item: f.byId.rate, label: "How?" } : undefined} /></TablePage>; }');
    expect(faqProblems(with_({ 'pages/x/view.tsx': shown }))).toEqual([]);
    const join = { 'pages/x/parts/Join.tsx': 'export function J({ link }: { link: FaqItem }) { return <FaqLink item={link}>more</FaqLink>; }', 'pages/x/use.tsx': view("import { J } from './parts/Join';\nexport function U() { const f = pageFaq(t); return <J link={f.byId.rate} />; }") };
    expect(faqProblems(with_({ 'pages/x/view.tsx': v, ...join, 'pages/x/writes.test.tsx': 'render(<J link={other.byId.rate} />)' }))).toEqual([]);
  });
  // forwarded values and JSX spreads: a parameter is checked at every element of its component; a spread may carry
  const J1 = 'export function J({ item }: any) { return <FaqLink item={item}>more</FaqLink>; }';
  const uses = (jsx: string, imp = "import { J } from './parts/Join';\n") => view(`${imp}export function V() { const f = pageFaq(t); return <TablePage faq={f}>${jsx}</TablePage>; }`);
  const fwd = (join: string, jsx: string, more: Record<string, string> = {}) => with_({ 'pages/x/parts/Join.tsx': join, 'pages/x/view.tsx': uses(jsx), ...more });
  bad('a forwarded FaqLink item whose caller passes an item of another source', fwd(J1, '<J item={other.byId.rate} />'), /FaqLink item other\.byId\.rate does not come from pages\/x\/faq\.ts \(pageFaq\) \(passed to J as item\)/);
  bad('a forwarded FaqLink item whose caller names an unknown item', fwd(J1, '<J item={f.byId.nope} />'), /byId\.nope is not an item of pages\/x\/faq\.ts \(passed to J as item\)/);
  bad('a forwarded FaqLink item whose caller passes a computed item', fwd(J1, '<J item={f.byId[k]} />'), /f\.byId\[k\] is computed.*\(passed to J as item\)/);
  bad('one good caller does not cover a second caller with a foreign item', fwd(J1, '<J item={f.byId.rate} /><J item={other.byId.rate} />'), /other\.byId\.rate does not come from .*\(passed to J as item\)/);
  bad('a forwarded FaqLink item whose component no element renders', fwd(J1, ''), /FaqLink item item is a parameter that comes from J, which no element or call in pages\/x passes it/);
  bad('a forwarded FaqLink item whose component is passed on as a value', fwd(J1, '{[f.byId.rate].map(J)}'), /comes from J, which is used other than as an element/);
  bad('a forwarded FaqLink item whose component is wrapped', fwd(J1, '<W c={J} /><J item={f.byId.rate} />'), /comes from J, which is used other than as an element/);
  bad('a caller spread that may supply the forwarded item', fwd(J1, '<J {...o} />', { 'pages/x/view.tsx': uses('<J {...o} />').replace('const f = pageFaq(t);', 'const f = pageFaq(t); const o: any = g();') }), /a spread \{\.\.\.o\} on <J> may supply item; give item after it/);
  bad('a caller spread after a good forwarded item', fwd(J1, '', { 'pages/x/view.tsx': uses('<J item={f.byId.rate} {...o} />').replace('const f = pageFaq(t);', 'const f = pageFaq(t); const o: any = g();') }), /a spread \{\.\.\.o\} on <J> may supply item/);
  bad('a forwarded item whose default is of another source', fwd('export function J({ item = other.byId.rate }: any) { return <FaqLink item={item}>more</FaqLink>; }', '<J />'), /other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('an item forwarded through two components, the outer caller foreign', fwd('export function K({ item }: any) { return <FaqLink item={item}>more</FaqLink>; }\nexport function J({ item }: any) { return <K item={item} />; }', '<J item={other.byId.rate} />'), /other\.byId\.rate does not come from .*\(passed to J as item\)/);
  bad('a positional parameter given to a FaqLink', fwd('export function J(item: any) { return <FaqLink item={item}>more</FaqLink>; }', '<J />'), /is a parameter that is not a prop of a named component/);
  bad("a callback's parameter given to a FaqLink", fwd("export function J() { return <>{[1].map((item: any) => <FaqLink item={item}>more</FaqLink>)}</>; }", '<J />'), /is a parameter that is not a prop of a named component/);
  bad('a component wrapped in a call forwarding its item', fwd('export const J = memo(({ item }: any) => <FaqLink item={item}>more</FaqLink>);', '<J item={f.byId.rate} />'), /is a parameter that is not a prop of a named component/);
  bad('a rest binding spread on an overlay, its caller passing a foreign descriptor', fwd("export function J({ held, ...rest }: any) { return <ConfirmDialog {...rest} tone=\"danger\" />; }", "<J held faq={{ item: other.byId.rate, label: 'x' }} />"), /faq item other\.byId\.rate does not come from .*\(passed to J as faq\)/);
  bad('the props object spread on an overlay, its caller passing a spread-only descriptor', fwd('export function J(props: any) { return <ConfirmDialog {...props} />; }', '<J faq={{ ...o }} />'), /overlay descriptor must be exactly \{ item, label \}.*\(passed to J as faq\)/);
  bad('a spread of unknown type on a FaqLink', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const o: any = g(); return <TablePage faq={f}><FaqLink {...o}>more</FaqLink></TablePage>; }') }), /a spread \{\.\.\.o\} on <FaqLink> may supply item/);
  bad('a spread after a good FaqLink item', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const o: any = g(); return <TablePage faq={f}><FaqLink item={f.byId.rate} {...o}>more</FaqLink></TablePage>; }') }), /a spread \{\.\.\.o\} on <FaqLink> may supply item/);
  bad('a spread after a good overlay faq', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const o: any = g(); return <TablePage faq={f}><ConfirmDialog faq={{ item: f.byId.rate, label: "x" }} {...o} /></TablePage>; }') }), /a spread \{\.\.\.o\} on <ConfirmDialog> may supply faq/);
  bad('a spread whose type holds a faq', with_({ 'pages/x/view.tsx': view("export function V() { const f = pageFaq(t); const o = { faq: { item: other.byId.rate, label: 'x' } }; return <TablePage faq={f}><ConfirmDialog {...o} /></TablePage>; }") }), /a spread \{\.\.\.o\} on <ConfirmDialog> may supply faq/);
  bad('a spread of a union, one member holding an item', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); const o = c ? { tone: 1 } : { item: other.byId.rate }; return <TablePage faq={f}><FaqLink {...o}>more</FaqLink></TablePage>; }') }), /a spread \{\.\.\.o\} on <FaqLink> may supply item/);
  bad('a FaqLink imported under another name', with_({ 'pages/x/view.tsx': view("import { FaqLink as L } from '@kit/FaqLink';\nexport function V() { const f = pageFaq(t); return <TablePage faq={f}><L item={other.byId.rate}>more</L></TablePage>; }") }), /FaqLink item other\.byId\.rate does not come from/);
  bad('an overlay under a const alias', with_({ 'pages/x/view.tsx': view("export function V() { const f = pageFaq(t); const D = ConfirmDialog; return <TablePage faq={f}><D faq={{ ...f }} /></TablePage>; }") }), /overlay descriptor must be exactly \{ item, label \}/);
  bad('a FaqLink item through a const shadowed in an inner block', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); { const item = f.byId.rate; void item; } const item = other.byId.rate; return <TablePage faq={f}><FaqLink item={item}>more</FaqLink></TablePage>; }') }), /FaqLink item item does not come from/);
  bad('a FaqLink item through a let later reassigned', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); let item = f.byId.rate; if (c) item = other.byId.rate; return <TablePage faq={f}><FaqLink item={item}>more</FaqLink></TablePage>; }') }), /FaqLink item item does not come from/);
  bad('a member of a destructured prop given to an overlay', fwd('export function J({ e }: any) { return <ConfirmDialog faq={e.faq} />; }', "<J e={{ faq: { item: f.byId.rate, label: 'x' } }} />"), /overlay faq e\.faq is a parameter that is not a prop of a named component/);
  // useM (a helper given a whole host object) is in the module only when the call is to it: an uncalled forwarder is refused
  const hooked = (call: string, pre = '') => with_({
    'pages/x/parts/Join.tsx': `export function useJ({ item, ...rest }: any) { return <FaqLink item={item}>more</FaqLink>; }${call.startsWith('useM') ? '\nexport function useM(host: any) { return useJ(host); }' : ''}`,
    'pages/x/view.tsx': view(`import { useJ${call.startsWith('useM') ? ', useM' : ''} } from './parts/Join';\nexport function V() { const f = pageFaq(t); ${pre} const j = ${call}; return <TablePage faq={f}>{j}</TablePage>; }`),
  });
  bad("a hook's forwarded item whose call passes an item of another source", hooked('useJ({ item: other.byId.rate })'), /other\.byId\.rate does not come from .*\(passed to useJ as item\)/);
  bad('a helper given a whole host object, its caller passing a foreign item', hooked('useM({ item: other.byId.rate })'), /other\.byId\.rate does not come from .*\(passed to useM as item\)/);
  bad("a hook call whose literal spreads a value that may hold the item", hooked('useJ({ ...o })', 'const o: any = g();'), /a spread \{\.\.\.o\} on useJ\(\.\.\.\) may supply item/);
  bad('a hook call given a name that may hold the item', hooked('useJ(o)', 'const o: any = g();'), /the argument o on useJ\(\.\.\.\) may supply item/);
  bad('a hook call with a computed key', hooked('useJ({ [k]: f.byId.rate })'), /a computed key \[k\] on useJ\(\.\.\.\) may supply item/);
  bad('a hook call whose shorthand item is of another source', hooked('useJ({ item })', 'const item = other.byId.rate;'), /FaqLink item item does not come from .*\(passed to useJ as item\)/);
  bad('an overlay descriptor behind && whose condition holds JSX', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><ConfirmDialog faq={<b>x</b> && { item: f.byId.rate, label: "x" }} /></TablePage>; }') }), /overlay descriptor shown under a condition that holds JSX/);
  bad('a file the checker cannot read is refused, not passed', with_({ 'pages/x/parts/Join.tsx': 'export function useJ({ item }: any) { return <FaqLink item={item}>more</FaqLink>; }', 'pages/x/view.tsx': view("import { useJ, nope } from './parts/Join';\nexport function V() { const f = pageFaq(t); const j = useJ({ item: other.byId.rate }); void nope; return <TablePage faq={f}>{j}</TablePage>; }") }), /the checker could not read this file|other\.byId\.rate does not come from/);
  it('control: hooks and helpers whose calls pass items from the builder (by key, by shorthand, through a whole host) are clean', () => {
    expect(faqProblems(hooked('useJ({ item: f.byId.rate })'))).toEqual([]);
    expect(faqProblems(hooked('useJ({ item, tone: 1 })', 'const item = f.byId.rate;'))).toEqual([]);
    expect(faqProblems(hooked('useM({ item: f.byId.rate })'))).toEqual([]);
    expect(faqProblems(hooked('useJ({ ...{ tone: 1 }, item: f.byId.rate })'))).toEqual([]);
  });
  it('control: forwarded items and overlay faqs with good callers, a default from the builder, a rest beside its own faq, and spreads that cannot carry them are clean', () => {
    expect(faqProblems(fwd(J1, '<J item={f.byId.rate} /><J item={f.byId.rate} />'))).toEqual([]);
    expect(faqProblems(fwd('export function K({ item }: any) { return <FaqLink item={item}>more</FaqLink>; }\nexport function J({ item: x }: any) { return <K item={x} />; }', '<J item={f.byId.rate} />'))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/parts/Join.tsx': J1, 'pages/x/view.tsx': view("import { J } from './parts/Join';\nexport function V() { const f = pageFaq(t); return <TablePage faq={f}><J item={f.byId.rate} /></TablePage>; }\nexport function W({ held, ...rest }: any) { return <ConfirmDialog {...rest} tone=\"danger\" />; }\nexport function X() { const f = pageFaq(t); return <><W held faq={{ item: f.byId.rate, label: 'x' }} /><W held /></>; }") }))).toEqual([]);
    expect(faqProblems(fwd("export function J({ faq, ...rest }: any) { return <ConfirmDialog {...rest} faq={faq} />; }", "<J faq={{ item: f.byId.rate, label: 'x' }} />"))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view("export function V({ c }: any) { const f = pageFaq(t); const dialog = (a: string) => ({ isOpen: a === 'run', onConfirm: () => {} }); const o: any = g(); return <TablePage faq={f}><ConfirmDialog {...dialog('run')} /><ConfirmDialog {...o} {...dialog('x')} faq={{ item: f.byId.rate, label: 'x' }} /><ConfirmDialog {...(c ? { tone: 'danger' } : {})} /><FaqLink {...(c && { target: 'x' })} item={f.byId.rate}>more</FaqLink></TablePage>; }") }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view("import { FaqLink as L } from '@kit/FaqLink';\nexport function V() { const f = pageFaq(t); const D = ConfirmDialog; return <TablePage faq={f}><L item={f.byId.rate}>more</L><D faq={{ item: f.byId.rate, label: 'x' }} /></TablePage>; }") }))).toEqual([]);
  });
  // Conservative refusals, not resolution
  const GOOD_FAQ = "{ item: f.byId.rate, label: 'x' }";
  bad('rule 1: a parameter that shadows the imported builder', with_({ 'pages/x/view.tsx': view('export function V({ pageFaq }: any) { const f = pageFaq(t); return <TablePage faq={f}><FaqLink item={f.byId.rate}>more</FaqLink></TablePage>; }') }), /faq=\{\.\.\.\} does not come from pages\/x\/faq\.ts/);
  bad('rule 1: a local function that shadows the imported builder', with_({ 'pages/x/view.tsx': view('export function V() { const pageFaq = (_t: any) => other; const f = pageFaq(t); return <TablePage faq={f}><FaqLink item={f.byId.rate}>more</FaqLink></TablePage>; }') }), /FaqLink item f\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('rule 2: a forwarded item reassigned in its component', fwd('export function J({ item }: any) { item = other.byId.rate; return <FaqLink item={item}>more</FaqLink>; }', '<J item={f.byId.rate} />'), /comes from J, which writes item at pages\/x\/parts\/Join\.tsx:1; a forwarded value must reach the link unchanged/);
  bad('rule 2: a props faq written before an overlay reads it', fwd("export function J(props: any) { props.faq = { item: other.byId.rate, label: 'x' }; return <ConfirmDialog faq={props.faq} />; }", `<J faq={${GOOD_FAQ}} />`), /comes from J, which writes props at/);
  bad('rule 2: a rest object passed to a call that is not the kit', fwd('export function J({ held, ...rest }: any) { mutate(rest); return <ConfirmDialog {...rest} />; }', `<J held faq={${GOOD_FAQ}} />`), /comes from J, which passes rest to mutate\(\.\.\.\)/);
  bad('rule 2: the props object passed to a page helper that writes it', fwd('function set(h: any) { h.faq = other; }\nexport function J(props: any) { set(props); return <ConfirmDialog {...props} />; }', `<J faq={${GOOD_FAQ}} />`), /passes props to set\(\.\.\.\), which writes h at/);
  bad('rule 2: a forwarded item replaced by a destructuring assignment', fwd('export function J({ item }: any) { ({ item } = other); return <FaqLink item={item}>more</FaqLink>; }', '<J item={f.byId.rate} />'), /comes from J, which assigns item at/);
  it('control: rule 2 reads other members, calls the kit and page helpers that only read, and passes values on in JSX', () => {
    expect(faqProblems(fwd("import { useKit } from '@kit/useKit';\nfunction toneOf(h: any) { return h.tone; }\nexport function J(props: any) { useKit(props); const tone = toneOf(props); useEffect(() => props.onClose(), [props.onClose]); return <ConfirmDialog {...props} tone={tone} />; }", `<J faq={${GOOD_FAQ}} />`))).toEqual([]);
    expect(faqProblems(fwd('export function J({ item, onPick }: any) { const label = item.id; return <FaqLink item={item} onClick={() => onPick(label)}>more</FaqLink>; }', '<J item={f.byId.rate} />'))).toEqual([]);
  });
  bad('rule 3: a namespace-qualified FaqLink', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><Kit.FaqLink item={other.byId.rate}>more</Kit.FaqLink></TablePage>; }') }), /<Kit\.FaqLink> is a namespace-qualified kit tag, which the check cannot read; import FaqLink by name/);
  bad('rule 3: a namespace-qualified overlay', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}><Kit.ConfirmDialog faq={{ item: other.byId.rate, label: "x" }} /></TablePage>; }') }), /<Kit\.ConfirmDialog> is a namespace-qualified kit tag/);
  bad('rule 3: a FaqLink made by createElement', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}>{React.createElement(FaqLink, { item: other.byId.rate })}</TablePage>; }') }), /createElement\(FaqLink, \.\.\.\) makes a kit FAQ element the check cannot read/);
  bad('rule 3: an overlay made by jsx() from a namespace', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); return <TablePage faq={f}>{_jsx(Kit.ConfirmDialog, { faq: other })}</TablePage>; }') }), /_jsx\(ConfirmDialog, \.\.\.\) makes a kit FAQ element/);
  bad('rule 3: a FaqLink under a const alias of a namespace member', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const L = Kit.FaqLink; return <TablePage faq={f}><L item={other.byId.rate}>more</L></TablePage>; }') }), /FaqLink item other\.byId\.rate does not come from/);
  bad('rule 4: an exported forwarder imported by another page', fwd(J1, '<J item={f.byId.rate} />', { 'pages/y/use.tsx': "import { J } from '../x/parts/Join';\nexport function Y() { return <J item={other.byId.rate} />; }" }), /comes from J, which is exported and imported by pages\/y\/use\.tsx, so its callers cannot be checked; keep a forwarder inside its page/);
  bad('rule 4: an exported forwarder re-exported by a page file', fwd(J1, '<J item={f.byId.rate} />', { 'pages/x/index.ts': "export { J } from './parts/Join';" }), /comes from J, which is exported and re-exported by pages\/x\/index\.ts/);
  bad('rule 4: an exported forwarder reached by a dynamic import outside its page', fwd(J1, '<J item={f.byId.rate} />', { 'shell/lazy.ts': "export const load = () => import('../pages/x/parts/Join');" }), /which is exported and imported by shell\/lazy\.ts/);
  it('control: rule 4 a forwarder imported only inside its page, and outside importers in tests, are clean', () => {
    expect(faqProblems(fwd(J1, '<J item={f.byId.rate} />', { 'pages/y/use.test.tsx': "import { J } from '../x/parts/Join';\nrender(<J item={other.byId.rate} />);" }))).toEqual([]);
  });
  bad('rule 5: a const named undefined given as an overlay faq', with_({ 'pages/x/view.tsx': view("export function V() { const f = pageFaq(t); const undefined = { item: other.byId.rate, label: 'x' }; return <TablePage faq={f}><ConfirmDialog faq={undefined} /></TablePage>; }") }), /faq item other\.byId\.rate does not come from pages\/x\/faq\.ts/);
  bad('rule 5: a parameter named undefined beside a descriptor elsewhere', with_({ 'pages/x/view.tsx': view("export function V({ c, undefined }: any) { const f = pageFaq(t); return <TablePage faq={f}><Wrap faq={c ? { item: f.byId.rate, label: 'x' } : undefined} /></TablePage>; }") }), /faq=\{\.\.\.\} does not come from pages\/x\/faq\.ts/);
  bad('rule 5: a root given the builder or a shadowed undefined', with_({ 'pages/x/view.tsx': view('export function V({ c }: any) { const f = pageFaq(t); const undefined = other; return <TablePage faq={c ? f : undefined} />; }') }), /faq=\{\.\.\.\} does not come from pages\/x\/faq\.ts/);
  // the builder's result is the page's only while nothing writes to it
  const wrote = /does not come from pages\/x\/faq\.ts|no archetype page passes it/;
  bad('a member of the bound builder result assigned', with_({ 'pages/x/view.tsx': view("export function V() { const f = pageFaq(t); f.items = [{ id: 'rate', q: 'Other?', a: 'Other.' }]; return <SettingsPage faq={f} />; }") }), wrote);
  bad('a list of the bound builder result pushed to', with_({ 'pages/x/view.tsx': view("export function V() { const f = pageFaq(t); f.items.push({ id: 'z', q: 'Other?', a: 'Other.' }); return <SettingsPage faq={f} />; }") }), wrote);
  bad('a destructured items spliced', with_({ 'pages/x/view.tsx': view("export function V() { const { items } = pageFaq(t); items.splice(0, 1, { id: 'rate', q: 'Other?', a: 'Other.' }); return <TablePage faq={{ items }} />; }") }), wrote);
  bad('the bound builder result given to Object.assign', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); Object.assign(f, { items: [] }); return <SettingsPage faq={f} />; }') }), wrote);
  bad('an item deleted from byId before a FaqLink names it', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); delete f.byId.rate; return <TablePage faq={f}><FaqLink item={f.byId.rate}>more</FaqLink></TablePage>; }') }), wrote);
  bad('an alias of the builder result written to', with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const g = f; g.items = []; return <SettingsPage faq={f} />; }') }), wrote);
  bad('a compound write to a member', with_({ 'pages/x/view.tsx': view('export function V() { let f = pageFaq(t); f.items ??= []; return <SettingsPage faq={f} />; }') }), wrote);
  it('control: reading the builder result, copying it and passing a part on are not writes', () => {
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { const { items } = pageFaq(t); const detailFaq = { faq: { items } }; return <TablePage faq={{ items }}>{detailFaq.faq.items.length}</TablePage>; }') }))).toEqual([]);
    expect(faqProblems(with_({ 'pages/x/view.tsx': view('export function V() { const f = pageFaq(t); const n = f.items.length; const copy = [...f.items]; return <SettingsPage faq={f}>{n}{copy.length}</SettingsPage>; }') }))).toEqual([]);
  });
  it('control: a tree without any faq.ts has nothing to judge', () => {
    expect(faqProblems({ 'pages/y/view.tsx': 'export function V() { return <TablePage />; }' })).toEqual([]);
  });
});

describe('page FAQ conformance: the source tree', () => {
  it('no tsconfig path alias reaches into pages/ (rule 4 reads a page module through relative specifiers)', () => {
    const cfg = ts.parseConfigFileTextToJson('tsconfig.json', readFileSync(join(SRC, '..', 'tsconfig.json'), 'utf8')).config as { compilerOptions?: { paths?: Record<string, string[]> } };
    const targets = Object.values(cfg.compilerOptions?.paths ?? {}).flat();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((x) => /(^|\/)pages(\/|$)/.test(x))).toEqual([]);
  });
  it('every page FAQ keeps the contract', () => {
    expect(faqProblems(A.readTree(SRC))).toEqual([]);
  }, 120_000);
});
