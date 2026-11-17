#!/usr/bin/env bun
// The sibling contract. For every X.term.ts(x) beside X.ts(x), under the web tsconfig:
//  TYPES (as before, strict by default)
//   - the sibling exports no value name its web file lacks (the barrel must not grow a terminal-only name);
//   - every value name both export has the same type both ways, and neither side is `any`;
//   - the sibling has no type errors of its own, and no unannotated `any` escape inside an exported component
//     (`as any`, `as never`, a parameter typed any): a `typeof Web.X` declaration over an implementation that escapes
//     typing proves nothing. Annotate a reviewed one with `// contract-any: <why>` on the same line;
//   - names the web file has and the sibling lacks fail (`--lenient`: listed only; the loader fills them in dev).
//  BEHAVIOUR (src/term/scenario), per exported component (capitalised name, one props parameter):
//   (a) every prop of the web component's props type is READ by the sibling or listed in the scenario file's `ignored`
//       (with a reason). Read = destructured and used, or accessed as `p.x` / `rest.x`. A prop destructured and never
//       used is unread. Props forwarded wholesale (`{...rest}` into something) are "cannot tell" (reported, not failed);
//   (b) the component has a scenario file (`X.scenario.ts` beside it) with cases for it, and every BEHAVIOURAL prop
//       (callbacks on*, disabled/readonly/busy/invalid/selected/checked/expanded/open/value/type/autoFocus/... and the
//       file's `behavioural`) is set by some case (props, covers, control, rerender) or listed in `unsupported`/`ignored`;
//   - an `ignored` entry for a prop the sibling does read is stale and fails (keeps the lists honest).
//  Debt: obligations already failing are listed in contract.debt.json (identified sites, not counts). A new failure
//  fails; a listed one that is fixed also fails until removed (so the file only shrinks). `--update-debt` removes fixed
//  entries and adds none; `--write-debt` only creates the file when there is none. A re-exported component's
//  obligations belong to the pair of the file that DEFINES it.
//   bun scripts/term/contract.ts [--lenient] [--json] [--types-only] [--update-debt] [--write-debt [--allow-growth]] [--explain <Component>]
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import { HUB, SRC, termPaths } from './resolve';
import { noInputs } from './fail-closed';

export interface SiblingReport { sibling: string; web: string; extra: string[]; missing: string[]; mismatched: string[]; anyTyped: string[]; errors: string[]; escapes: string[] }

interface Program { program: ts.Program; checker: ts.TypeChecker; pairs: Array<{ sibling: string; web: string }> }
let cached: Program | null = null;
/** `hub` defaults to this hub (cached); another hub (a test's SDK-shaped temp hub) is never cached. */
export function programOf(extraRoots: string[] = [], hub: string = HUB): Program {
  const own = hub === HUB && !extraRoots.length;
  if (cached && own) return cached;
  const src = hub === HUB ? SRC : path.join(hub, 'src');
  const cfgFile = path.join(hub, 'tsconfig.json');
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgFile, ts.sys.readFile).config, ts.sys, hub, undefined, cfgFile);
  const siblings = [...new Bun.Glob('**/*.term.{ts,tsx}').scanSync(src)].map((f) => path.join(src, f)).sort();
  const pairs = siblings.flatMap((s) => {
    const web = ['.tsx', '.ts'].map((e) => s.replace(/\.term\.tsx?$/, e)).find((f) => ts.sys.fileExists(f));
    return web ? [{ sibling: s, web }] : [];
  });
  const ambient = cfg.fileNames.filter((f) => f.endsWith('.d.ts'));
  // Siblings import '@term/*' and the fixture '@core': the terminal's paths (termPaths, fixture mode),
  // never the web tsconfig's, which does not carry them.
  const program = ts.createProgram({ rootNames: [...ambient, ...pairs.flatMap((p) => [p.sibling, p.web]), ...extraRoots], options: { ...cfg.options, paths: termPaths(cfg.options, hub, true), noEmit: true, incremental: false, composite: false } });
  const p = { program, checker: program.getTypeChecker(), pairs };
  if (own) cached = p;
  return p;
}

function valuesOf(P: Program, file: string): Map<string, ts.Symbol> {
  const sf = P.program.getSourceFile(file);
  const mod = sf && P.checker.getSymbolAtLocation(sf);
  const out = new Map<string, ts.Symbol>();
  if (!mod) return out;
  for (const e of P.checker.getExportsOfModule(mod)) {
    const real = e.flags & ts.SymbolFlags.Alias ? P.checker.getAliasedSymbol(e) : e;
    if (real.flags & ts.SymbolFlags.Value) out.set(e.name, e);
  }
  return out;
}

const isAny = (t: ts.Type): boolean => (t.flags & ts.TypeFlags.Any) !== 0;

/** The error of a sibling the program could not read (see checkContracts). */
export const UNREAD_SIBLING = '0: the file could not be read while checking (removed or renamed during the run?): run the check again';

export function checkContracts(P: Program = programOf()): SiblingReport[] {
  const { program, checker } = P;
  return P.pairs.map(({ sibling, web }) => {
    const sf = program.getSourceFile(sibling);
    // A sibling the glob listed but the program could not read (removed or renamed while the run read the tree, as a
    // concurrent change to the tree does) is a failing report naming it, never a crash that hides every other result.
    if (!sf) return { sibling: path.relative(HUB, sibling), web: path.relative(HUB, web), extra: [], missing: [], mismatched: [], anyTyped: [], errors: [UNREAD_SIBLING], escapes: [] };
    const a = valuesOf(P, sibling);
    const b = valuesOf(P, web);
    const mismatched: string[] = [];
    const anyTyped: string[] = [];
    for (const [name, sym] of a) {
      const other = b.get(name);
      if (!other) continue;
      const ta = checker.getTypeOfSymbolAtLocation(sym, sf);
      const tb = checker.getTypeOfSymbolAtLocation(other, sf);
      if (isAny(ta) !== isAny(tb)) anyTyped.push(name);
      else if (!checker.isTypeAssignableTo(ta, tb) || !checker.isTypeAssignableTo(tb, ta)) mismatched.push(`${name} (term: ${checker.typeToString(ta).slice(0, 200)}; web: ${checker.typeToString(tb).slice(0, 200)})`);
    }
    const errors = [...program.getSemanticDiagnostics(sf), ...program.getSyntacticDiagnostics(sf)].map((d) => {
      const at = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      return `${at}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
    });
    // The whole sibling file: a helper (`const Faint = (p: any) => …`) escapes typing as much as the component does.
    const escapes = anyEscapes(sf, sf);
    return {
      sibling: path.relative(HUB, sibling), web: path.relative(HUB, web),
      extra: [...a.keys()].filter((n) => !b.has(n)).sort(), missing: [...b.keys()].filter((n) => !a.has(n)).sort(), mismatched, anyTyped, errors, escapes,
    };
  });
}

/** A reviewed escape's reason: at least three words and 12 characters (`contract-any: x` is not a review). */
export const REASON_OK = (why: string): boolean => {
  const t = why.replace(/^read\s*:\s*/i, '').trim();
  return t.length >= 12 && t.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length >= 3 && !/^(todo|tbd|n\/?a|none|ignored?|skip(ped)?|x+)\b/i.test(t);
};

/** Reads of an engine's `_`-prefixed (private or protected) field by name: `Reflect.get(x, '_f')` or `x['_f']`, which pass
 *  TypeScript's access check. Allowed only here, keyed `<file>|<form>|<field>`, each entry naming the public getter that
 *  replaces it; a `contract-any` note does not admit one. */
export const ENGINE_FIELD_ALLOW: ReadonlyMap<string, string> = new Map([
  // OpenTUI keeps Renderable._positionType protected with no getter; terminal prims add a public `positionType` getter in the
  // next fork patch, then FitOrScroll reads that and this entry goes.
  ['src/kit/layouts/ListDetailPage.term.tsx|Reflect.get|_positionType', 'Renderable.positionType (fork patch, terminal prims)'],
]);

/** Escapes from typing anywhere in a sibling file: `as any`, `as never` (except on returned JSX), `as unknown as …`, a
 *  parameter or variable typed any, unless the line says `// contract-any: <why, three words or more>`; and an engine
 *  field read by name outside ENGINE_FIELD_ALLOW. */
export function anyEscapes(fn: ts.Node, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const lines = sf.text.split('\n');
  const annotated = (n: ts.Node): boolean => { const m = /contract-any:\s*(.*)$/.exec(lines[sf.getLineAndCharacterOfPosition(n.getStart(sf)).line] ?? ''); return !!m && REASON_OK(m[1]!.replace(/\*\/.*$/, '')); };
  // A cast of the RETURNED value (JSX `as never` to meet the web return type) leaves props checked: not an escape.
  const returned = (n: ts.Expression): boolean => {
    let x: ts.Node = n;
    while (ts.isParenthesizedExpression(x.parent) || ts.isConditionalExpression(x.parent) || (ts.isBinaryExpression(x.parent) && x.parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken)) x = x.parent;
    return ts.isReturnStatement(x.parent) || (ts.isArrowFunction(x.parent) && x.parent.body === x);
  };
  const isJsx = (e: ts.Expression): boolean => { let x = e; while (ts.isParenthesizedExpression(x)) x = x.expression; return ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x); };
  const visit = (n: ts.Node): void => {
    if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && (n.type.kind === ts.SyntaxKind.AnyKeyword || n.type.kind === ts.SyntaxKind.NeverKeyword) && !annotated(n)
      && !(n.type.kind === ts.SyntaxKind.NeverKeyword && (isJsx(n.expression) || returned(n)))) {
      out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: \`${n.getText(sf).slice(0, 60)}\``);
    }
    // `x as unknown as T`: the double cast that passes anything as T (counted once, at the outer cast).
    if (ts.isAsExpression(n) && !annotated(n)) {
      let inner: ts.Expression = n.expression;
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
      if (ts.isAsExpression(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword && !isJsx(inner.expression)) out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: \`${n.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}\``);
    }
    // An engine's `_` field by name: Reflect.get(x, '_f') or x['_f'] (a string literal; no note admits it).
    const field = (e: ts.Expression | undefined): string | null => (e && ts.isStringLiteralLike(e) && e.text.startsWith('_') ? e.text : null);
    const reflected = ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'Reflect' && n.expression.name.text === 'get' ? field(n.arguments[1]) : null;
    const bracket = ts.isElementAccessExpression(n) ? field(n.argumentExpression) : null;
    const engine = reflected ?? bracket;
    if (engine && !ENGINE_FIELD_ALLOW.has(`${path.relative(HUB, sf.fileName)}|${reflected ? 'Reflect.get' : 'bracket'}|${engine}`)) out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: engine field \`${engine}\` read by name (${reflected ? 'Reflect.get' : 'bracket'}): use a public getter (ENGINE_FIELD_ALLOW, scripts/term/contract.ts)`);
    if (ts.isParameter(n) && n.type?.kind === ts.SyntaxKind.AnyKeyword && !annotated(n)) out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: parameter ${n.name.getText(sf)} typed any`);
    if (ts.isVariableDeclaration(n) && n.type?.kind === ts.SyntaxKind.AnyKeyword && !annotated(n)) out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.name.getText(sf)} typed any`);
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Behaviour obligations

/** The function implementing an exported component: `const X = (p) => …`, `function X(p)`, `memo(…)`/`forwardRef(…)`. */
function componentFunction(sym: ts.Symbol, checker: ts.TypeChecker): ts.FunctionLikeDeclaration | null {
  const real = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
  for (const d of real.declarations ?? []) {
    if (ts.isFunctionDeclaration(d)) return d;
    if (ts.isVariableDeclaration(d) && d.initializer) return unwrapFn(d.initializer);
  }
  return null;
}
function unwrapFn(e: ts.Expression): ts.FunctionLikeDeclaration | null {
  let x: ts.Expression = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    else if (ts.isCallExpression(x) && x.arguments[0]) x = x.arguments[0];
    else break;
  }
  return ts.isArrowFunction(x) || ts.isFunctionExpression(x) ? x : null;
}

const isComponentName = (n: string): boolean => /^[A-Z]/.test(n);

/** Prop names of a component's first parameter type (all members of a union's constituents), each with where declared. */
function webProps(sym: ts.Symbol, checker: ts.TypeChecker, at: ts.Node): Map<string, 'hub' | 'lib'> | null {
  const t = checker.getTypeOfSymbolAtLocation(sym, at);
  const sig = t.getCallSignatures()[0];
  if (!sig || sig.parameters.length !== 1) return null;
  const pt = checker.getTypeOfSymbolAtLocation(sig.parameters[0]!, at);
  const parts = pt.isUnion() ? pt.types : [pt];
  const out = new Map<string, 'hub' | 'lib'>();
  for (const part of parts) {
    for (const p of checker.getPropertiesOfType(checker.getApparentType(part))) {
      if (p.name === 'key' || p.name === 'children') continue;
      const lib = (p.declarations ?? []).every((d) => d.getSourceFile().fileName.includes('/node_modules/'));
      if (!out.has(p.name) || !lib) out.set(p.name, lib ? 'lib' : 'hub');
    }
  }
  return out;
}

export interface ReadInfo {
  read: Set<string>; destructuredUnused: Set<string>; forwarded: string[]; whole: boolean;
  /** Props with a read inside an event handler or effect (an on* attribute's function, a local function named handle… or on…,
   *  useCallback/useEffect/useLayoutEffect): behaviour, so never "look only". */
  inHandler: Set<string>;
}

const HOOK_DEPS = /^(useEffect|useLayoutEffect|useInsertionEffect|useMemo|useCallback|useImperativeHandle)$/;
const HANDLER_HOOK = /^(useCallback|useEffect|useLayoutEffect|useInsertionEffect)$/;
/** True when the value at `n` goes somewhere: not `void x`, not a bare `x;`, not the left of a comma, not a hook's
 *  dependency list, and (for a local that only takes it) when that local is used in turn. */
export function flows(n: ts.Node, localRefs: (id: ts.Identifier) => ts.Identifier[], depth = 0): boolean {
  let x: ts.Node = n;
  while (x.parent && (ts.isParenthesizedExpression(x.parent) || ts.isAsExpression(x.parent) || ts.isNonNullExpression(x.parent) || ts.isTypeAssertionExpression(x.parent) || ts.isSatisfiesExpression(x.parent))) x = x.parent;
  const p = x.parent;
  if (!p) return true;
  if (ts.isVoidExpression(p) || ts.isExpressionStatement(p)) return false;
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken && p.left === x) return false;
  if (ts.isArrayLiteralExpression(p) && ts.isCallExpression(p.parent) && p.parent.arguments[1] === p && ts.isIdentifier(p.parent.expression) && HOOK_DEPS.test(p.parent.expression.text)) return false;
  if (ts.isVariableDeclaration(p) && p.initializer === x && ts.isIdentifier(p.name)) return depth < 6 && localRefs(p.name).some((r) => flows(r, localRefs, depth + 1));
  return true;
}
/** True when `n` sits inside a function that handles events or runs as an effect. */
export function inHandlerFn(n: ts.Node, stop: ts.Node): boolean {
  for (let x: ts.Node | undefined = n.parent; x && x !== stop; x = x.parent) {
    if (!(ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isFunctionDeclaration(x))) continue;
    const p = x.parent;
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && /^on[A-Z]/.test(p.parent.name.getText())) return true;
    if (ts.isPropertyAssignment(p) && /^on[A-Z]/.test(p.name.getText())) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && HANDLER_HOOK.test(p.expression.text)) return true;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && /^(on|handle)[A-Z]/.test(p.name.text)) return true;
    if (ts.isFunctionDeclaration(x) && x.name && /^(on|handle)[A-Z]/.test(x.name.text)) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'useCallback') return true;
  }
  return false;
}

/** What the sibling's implementation reads of its props parameter (syntactic, with the checker for references). */
export function readsOf(fn: ts.FunctionLikeDeclaration, checker: ts.TypeChecker | null): ReadInfo {
  const info: ReadInfo = { read: new Set(), destructuredUnused: new Set(), forwarded: [], whole: false, inHandler: new Set() };
  const param = fn.parameters[0];
  if (!param) return info;
  const body = fn.body;
  const refs = (id: ts.Identifier): ts.Identifier[] => {
    const out: ts.Identifier[] = [];
    const sym = checker?.getSymbolAtLocation(id);
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n !== id && n.text === id.text) {
        const parent = n.parent;
        const isName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) || (ts.isJsxAttribute(parent) && parent.name === n) || (ts.isBindingElement(parent) && parent.propertyName === n);
        if (!isName && (!sym || checker!.getSymbolAtLocation(n) === sym || (ts.isShorthandPropertyAssignment(parent) && checker!.getShorthandAssignmentValueSymbol(parent) === sym))) out.push(n);
      }
      ts.forEachChild(n, visit);
    };
    if (body) visit(body);
    // defaults of later binding elements can read earlier ones
    ts.forEachChild(param, visit);
    return out;
  };
  // A read counts only when its value goes somewhere (flows): `void p.x`, a bare `x;`, `void rest` are mentions.
  const readAt = (prop: string, at: ts.Node): void => {
    if (!flows(at, refs)) return;
    info.read.add(prop);
    if (fn.body && inHandlerFn(at, fn)) info.inHandler.add(prop);
  };
  const objectUses = (id: ts.Identifier, label: string): void => {
    for (const r of refs(id)) {
      const p = r.parent;
      if (ts.isPropertyAccessExpression(p) && p.expression === r) readAt(p.name.text, p);
      else if (ts.isElementAccessExpression(p) && p.expression === r && ts.isStringLiteralLike(p.argumentExpression)) readAt(p.argumentExpression.text, p);
      else if (!flows(r, refs)) continue;
      else if (ts.isVariableDeclaration(p) && p.initializer === r && ts.isObjectBindingPattern(p.name)) pattern(p.name);
      else if (ts.isSpreadAssignment(p) || ts.isJsxSpreadAttribute(p) || ts.isSpreadElement(p)) info.forwarded.push(`${label} spread at line ${r.getSourceFile().getLineAndCharacterOfPosition(r.getStart()).line + 1}`);
      else if (ts.isCallExpression(p)) info.forwarded.push(`${label} passed to ${p.expression.getText().slice(0, 40)}`);
      else info.forwarded.push(`${label} used as a whole (${p.getText().slice(0, 40)})`);
    }
  };
  const pattern = (b: ts.ObjectBindingPattern): void => {
    for (const el of b.elements) {
      if (el.dotDotDotToken) { if (ts.isIdentifier(el.name)) objectUses(el.name, `...${el.name.text}`); continue; }
      const prop = el.propertyName && (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : null;
      if (!prop) continue;
      if (ts.isIdentifier(el.name)) {
        const used = refs(el.name).filter((r) => flows(r, refs));
        if (used.length) { info.read.add(prop); if (used.some((r) => inHandlerFn(r, fn))) info.inHandler.add(prop); }
        else info.destructuredUnused.add(prop);
      } else info.read.add(prop); // nested pattern: reads it
    }
  };
  if (ts.isObjectBindingPattern(param.name)) pattern(param.name);
  else if (ts.isIdentifier(param.name)) objectUses(param.name, param.name.text);
  return info;
}

export interface StaticCase { name: string; props: string[]; covers: string[]; asserts: boolean }
export interface StaticScenario {
  file: string; component: string; cases: number; ignored: Record<string, string>; unsupported: Record<string, string>;
  behavioural: string[]; exercised: Set<string>;
  /** `pageProof: { onOpen: 'account/twofa-turn-on' }`: a behavioural prop proved by a page shot that drives it (a mount
   *  that needs the whole page's data). Checked by drivingShot(); counts as exercised. */
  pageProof: Record<string, string>;
  /** Per case: the props it sets (props, control, rerender), the ones it claims (covers), and whether it asserts anything
   *  (calls, nodes, focused, neverShown or treeNever, at the end or in a step). A case asserting nothing exercises nothing. */
  perCase: StaticCase[];
}

/** Why `<page>/<shot>` does not prove a prop (null when it does): the shot must exist in src/pages/<page>/shots.ts and
 *  DRIVE the page (click, act or keys) to a state it waits for (waitForText). A shot that only draws a state proves the
 *  control is drawn, never that its callback works. Read without running the file. */
export function drivingShot(ref: string): string | null {
  const m = /^([a-z0-9-]+)\/(.+)$/.exec(ref);
  if (!m) return 'not <page>/<shot name>';
  const file = path.join(SRC, 'pages', m[1]!, 'shots.ts');
  if (!fs.existsSync(file)) return `no ${path.relative(HUB, file)}`;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.ObjectLiteralExpression | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'name' && ts.isStringLiteralLike(p.initializer) && p.initializer.text === m[2])) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) return `no shot named ${m[2]} in ${path.relative(HUB, file)}`;
  const keys = new Set((found as ts.ObjectLiteralExpression).properties.map((p) => p.name?.getText(sf)));
  if (!['click', 'act', 'keys'].some((k) => keys.has(k))) return `shot ${m[2]} presses nothing (no click, act or keys)`;
  if (!keys.has('waitForText')) return `shot ${m[2]} waits for nothing (no waitForText naming what the press opens)`;
  return null;
}

/** Reads `scenarios('X', X, {...})` calls of a scenario file without running it. */
export function staticScenarios(file: string): StaticScenario[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const consts = new Map<string, ts.Expression>();
  const out: StaticScenario[] = [];
  const keysOf = (e: ts.Expression | undefined): Record<string, string> => {
    const o: Record<string, string> = {};
    if (!e) return o;
    if (ts.isIdentifier(e) && consts.has(e.text)) return keysOf(consts.get(e.text));
    if (!ts.isObjectLiteralExpression(e)) return o;
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) Object.assign(o, keysOf(p.expression));
      else if (ts.isPropertyAssignment(p)) {
        const k = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
        if (k) o[k] = ts.isStringLiteralLike(p.initializer) ? p.initializer.text : ts.isIdentifier(p.initializer) && consts.has(p.initializer.text) && ts.isStringLiteralLike(consts.get(p.initializer.text)!) ? (consts.get(p.initializer.text) as ts.StringLiteral).text : p.initializer.getText(sf);
      } else if (ts.isShorthandPropertyAssignment(p)) o[p.name.text] = '';
    }
    return o;
  };
  const prop = (o: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
    for (const p of o.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) return p.initializer;
    return undefined;
  };
  const strings = (e: ts.Expression | undefined): string[] => (e && ts.isArrayLiteralExpression(e) ? e.elements.filter(ts.isStringLiteralLike).map((x) => x.text) : []);
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'scenarios' && n.arguments.length >= 3) {
      const [nameArg, , body] = n.arguments as unknown as [ts.Expression, ts.Expression, ts.Expression];
      if (ts.isStringLiteralLike(nameArg) && ts.isObjectLiteralExpression(body)) {
        const exercised = new Set<string>();
        const perCase: StaticCase[] = [];
        const cases = prop(body, 'cases');
        let count = 0;
        // An expect object asserts when one of its checks is present and not empty (`expect: {}` asserts nothing).
        const asserting = (e: ts.Expression | undefined): boolean => {
          if (!e) return false;
          if (ts.isIdentifier(e) && consts.has(e.text)) return asserting(consts.get(e.text));
          if (!ts.isObjectLiteralExpression(e)) return true; // computed: give it the benefit
          return e.properties.some((q) => {
            if (ts.isSpreadAssignment(q)) return asserting(q.expression);
            if (!ts.isPropertyAssignment(q) && !ts.isShorthandPropertyAssignment(q)) return false;
            const k = q.name.getText(sf);
            if (!['calls', 'nodes', 'focused', 'neverShown', 'treeNever', 'copied'].includes(k)) return false;
            if (!ts.isPropertyAssignment(q)) return true;
            const v = q.initializer;
            if (ts.isArrayLiteralExpression(v) || ts.isObjectLiteralExpression(v)) return (ts.isArrayLiteralExpression(v) ? v.elements : v.properties).length > 0;
            return v.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isIdentifier(v) && v.text === 'undefined');
          });
        };
        if (cases && ts.isArrayLiteralExpression(cases)) {
          for (const c of cases.elements) {
            if (!ts.isObjectLiteralExpression(c)) continue;
            count++;
            let pe = prop(c, 'props');
            if (pe && (ts.isArrowFunction(pe) || ts.isFunctionExpression(pe))) {
              const b = pe.body;
              pe = ts.isParenthesizedExpression(b as ts.Expression) ? (b as ts.ParenthesizedExpression).expression : ts.isBlock(b) ? undefined : (b as ts.Expression);
            }
            const sets = new Set<string>(Object.keys(keysOf(pe)));
            const ctl = prop(c, 'control');
            for (const v of Object.values(keysOf(ctl))) sets.add(v);
            const steps = prop(c, 'steps');
            let asserts = asserting(prop(c, 'expect'));
            if (steps && ts.isArrayLiteralExpression(steps)) for (const st of steps.elements) if (ts.isObjectLiteralExpression(st)) {
              for (const k of Object.keys(keysOf(prop(st, 'rerender')))) sets.add(k);
              if (asserting(prop(st, 'expect'))) asserts = true;
            }
            const nameE = prop(c, 'name');
            const covers = strings(prop(c, 'covers'));
            perCase.push({ name: nameE && ts.isStringLiteralLike(nameE) ? nameE.text : `case ${count}`, props: [...sets], covers, asserts });
            if (!asserts) continue;
            for (const k of sets) exercised.add(k);
            for (const k of covers) exercised.add(k);
          }
        }
        out.push({ file: path.relative(HUB, file), component: nameArg.text, cases: count, ignored: keysOf(prop(body, 'ignored')), unsupported: keysOf(prop(body, 'unsupported')), pageProof: keysOf(prop(body, 'pageProof')), behavioural: strings(prop(body, 'behavioural')), exercised, perCase });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const BEHAVIOURAL = new Set(['isDisabled', 'disabled', 'isReadOnly', 'readOnly', 'busy', 'isInvalid', 'invalid', 'isRequired', 'isSelected', 'defaultSelected',
  'isIndeterminate', 'isExpanded', 'defaultExpanded', 'isOpen', 'defaultOpen', 'open', 'value', 'defaultValue', 'checked', 'defaultChecked', 'type', 'autoFocus',
  'disabledReason', 'errorMessage', 'selectedKey', 'defaultSelectedKey', 'selectedKeys', 'defaultSelectedKeys', 'disabledKeys', 'selectionMode', 'href', 'destructive', 'confirmLabel', 'pressed', 'isPressed']);
export const isBehavioural = (p: string, extra: string[] = []): boolean => /^on[A-Z]/.test(p) || BEHAVIOURAL.has(p) || extra.includes(p);

/** Web-platform plumbing every component inherits from React / React Aria DOM types, ignored by default with one
 *  reason each (a scenario file may still list or test them). Deliberately NOT here, so each sibling must read or
 *  list them: hidden, inert (both change what is shown or usable), id (relations), aria-label / aria-labelledby /
 *  aria-describedby (names), onPaste / onCopy / onCut / onInput / onSelect (editing behaviour a page may rely on). */
export const DOM_PLUMBING: Readonly<Record<string, string>> = {
  'on*Capture': 'capture-phase DOM events: no DOM in a terminal',
  'onAnimation*': 'CSS animation events', 'onTransition*': 'CSS transition events',
  'onPointer*': 'pointer events: presses come through onPress', 'onMouse*': 'mouse events: presses come through onPress', 'onTouch*': 'touch events',
  'onDrag*': 'HTML drag events', 'onDrop': 'HTML drop event', 'onWheel': 'DOM wheel event', 'onScroll': 'DOM scroll event',
  'onDoubleClick': 'DOM double click', 'onContextMenu': 'DOM context menu', 'onAuxClick': 'DOM aux click', 'onClick': 'DOM click: onPress is the contract',
  'onLoad*': 'media load events', 'onError': 'media error event', 'onToggle': 'DOM details toggle', 'onScrollEnd': 'DOM scroll event',
  'className': 'no CSS classes in a terminal', 'style': 'no inline CSS in a terminal', 'slot': 'React Aria slots', 'translate': 'browser translation hint',
  'lang': 'language attribute: text is drawn as given', 'dir': 'rtl not modelled by the terminal', 'tabIndex': 'focus order comes from the focus store',
  'aria-[^ld]*': 'other aria-* attributes: semantics come from sem', 'aria-l[^a]*': 'aria-live/level/...: semantics come from sem', 'aria-d[^e]*': 'aria-disabled/dropeffect: sem', 'aria-details': 'points at a details element: no terminal meaning',
  'data-*': 'DOM data attributes', 'render': 'React Aria custom DOM element renderer', 'suppressHydrationWarning': 'server rendering only', 'autoCapitalize': 'soft keyboard hint', 'enterKeyHint': 'soft keyboard hint', 'inputMode': 'soft keyboard hint',
};

// Keys are globs with regex character classes and groups allowed (`aria-[^ld]*`, `on(Copy|Cut)*`): only `.+?${}\` are
// literal. (`^` must stay live inside a class: escaping it once turned `aria-[^ld]*` into "aria-l… or aria-d…", which
// ignored aria-label/labelledby/describedby and checked the rest.)
const globRe = (k: string): RegExp => new RegExp('^' + k.replace(/[.+?${}\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const listed = (p: string, list: Record<string, string>): string | undefined => {
  if (list[p] !== undefined) return p;
  return Object.keys(list).find((k) => /[*[(]/.test(k) && globRe(k).test(p));
};

export interface ComponentObligations {
  component: string; sibling: string; web: string; scenario: string | null; cases: number;
  props: number; read: string[]; unread: string[]; unsure: string[];
  /** Props not read by name while the props object is handed on (spread): read wherever it goes, so mutants try them. */
  forwarded: string[]; ignored: Record<string, string>; staleIgnored: string[];
  uncovered: string[]; unsupported: Record<string, string>; failures: string[];
}

export function obligations(P: Program = programOf()): ComponentObligations[] {
  const { checker, program } = P;
  const scen = new Map<string, StaticScenario[]>();
  for (const f of new Bun.Glob('**/*.scenario.ts').scanSync(SRC)) { const abs = path.join(SRC, f); scen.set(abs, staticScenarios(abs)); }
  const out: ComponentObligations[] = [];
  const webFiles = new Set(P.pairs.map((p) => p.web));
  for (const { sibling, web } of P.pairs) {
    const a = valuesOf(P, sibling);
    const b = valuesOf(P, web);
    const wsf = program.getSourceFile(web)!;
    const scenarioFile = sibling.replace(/\.term\.tsx?$/, '.scenario.ts');
    const files = scen.get(scenarioFile) ?? [];
    for (const [name, wsym] of b) {
      if (!isComponentName(name)) continue;
      // A re-export (`export { SettingRow } from '../forms/...'`) is owed by the DEFINING file's pair, so obligations
      // land on the owner of the code; only a component defined in a file with no sibling stays with the re-exporter.
      const real = wsym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(wsym) : wsym;
      const home = real.declarations?.[0]?.getSourceFile().fileName;
      if (home && home !== web && webFiles.has(home)) continue;
      const props = webProps(wsym, checker, wsf);
      if (!props) continue;
      const ssym = a.get(name);
      const fn = ssym ? componentFunction(ssym, checker) : null;
      if (!fn) continue; // missing exports are the type contract's business
      const r = readsOf(fn, checker);
      const s = files.find((x) => x.component === name) ?? null;
      const ignored = { ...DOM_PLUMBING, ...(s?.ignored ?? {}) };
      const unsupported = s?.unsupported ?? {};
      const read = [...props.keys()].filter((p) => r.read.has(p)).sort();
      const unread = [...props.keys()].filter((p) => !r.read.has(p) && !listed(p, ignored) && !(r.forwarded.length && !r.destructuredUnused.has(p))).sort();
      const forwarded = r.forwarded.length ? [...props.keys()].filter((p) => !r.read.has(p) && !r.destructuredUnused.has(p)).sort() : [];
      const unsure = r.forwarded.length ? [`${r.forwarded.join('; ')}: props not read by name may be handled there`] : [];
      const staleIgnored = Object.keys(s?.ignored ?? {}).filter((k) => !/[*[(]/.test(k) && r.read.has(k) && !/^read\b/.test(ignored[k]!));
      const proofs = Object.entries(s?.pageProof ?? {}).map(([k, ref]) => ({ k, ref, why: drivingShot(ref) }));
      const proved = new Set(proofs.filter((x) => !x.why).map((x) => x.k));
      const uncovered = [...props.keys()].filter((p) => isBehavioural(p, s?.behavioural) && !s?.exercised.has(p) && !proved.has(p) && !listed(p, unsupported) && !listed(p, ignored)).sort();
      const failures: string[] = [];
      for (const x of proofs) if (x.why) failures.push(`pageProof ${name}.${x.k} names no driving shot (${x.ref}: ${x.why})`);
      // A reason is a review: three words or more (`ignored: { tone: 'x' }` is not one).
      for (const [k, why] of [...Object.entries(s?.ignored ?? {}), ...Object.entries(s?.unsupported ?? {})]) if (!REASON_OK(why)) failures.push(`reason too short for ${name}.${k}`);
      // A prop listed as look only (ignored, or ignored with a `read:` reason) must not reach a handler or an effect.
      for (const k of Object.keys(s?.ignored ?? {})) if (!/[*[(]/.test(k) && r.inHandler.has(k) && props.has(k)) failures.push(`ignored prop ${name}.${k} reaches a handler`);
      // `covers` is a claim: the case must assert something (its mutant must then fail it, scenarios.ts --mutants).
      for (const c of s?.perCase ?? []) if (c.covers.length && !c.asserts) failures.push(`covers without an assertion ${name}: "${c.name}" (${c.covers.join(', ')})`);
      const hasBehaviour = [...props.keys()].some((p) => isBehavioural(p, s?.behavioural));
      if (!s && hasBehaviour) failures.push(`no scenario for ${name} (${path.relative(HUB, scenarioFile)})`);
      // Zero cases only when every behavioural prop is proved by a driving page shot (a mount that needs the page's data).
      else if (s && s.cases === 0 && !(proved.size && [...props.keys()].filter((p) => isBehavioural(p, s.behavioural)).every((p) => proved.has(p)))) failures.push(`scenario for ${name} has no cases`);
      for (const p of unread) failures.push(`unread prop ${name}.${p}`);
      if (s) for (const p of uncovered) failures.push(`behavioural prop ${name}.${p} not exercised`);
      for (const p of staleIgnored) failures.push(`ignored but read ${name}.${p}`);
      for (const k of [...Object.keys(s?.unsupported ?? {}), ...Object.keys(s?.ignored ?? {}), ...Object.keys(s?.pageProof ?? {})]) if (!/[*[(]/.test(k) && !props.has(k)) failures.push(`listed prop ${name}.${k} is not a prop of the web component`);
      out.push({ component: name, sibling: path.relative(HUB, sibling), web: path.relative(HUB, web), scenario: s ? s.file : null, cases: s?.cases ?? 0,
        props: props.size, read, unread, unsure, forwarded, ignored, staleIgnored, uncovered, unsupported, failures });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Debt (identified failing obligations)

// CONTRACT_DEBT_FILE: another debt file (the gate's own attack tests write to a copy, never to this one).
const DEBT_FILE = process.env.CONTRACT_DEBT_FILE ?? path.join(HUB, 'scripts/term/contract.debt.json');
const DEBT_NOTE = 'Obligations and any escapes failing when their rule started (scripts/term/contract.ts). It only shrinks: a fixed entry still listed fails the gate; `--update-debt` removes fixed entries and never adds one; `--write-debt` adds entries only with `--allow-growth`, which names each.';
interface Debt { note: string; entries: string[] }
const readDebt = (): Set<string> => { try { return new Set((JSON.parse(fs.readFileSync(DEBT_FILE, 'utf8')) as Debt).entries); } catch { return new Set(); } };
const keyOf = (o: ComponentObligations, f: string): string => `${o.sibling}: ${f}`;

/** The area that owns a sibling path (the parity report's owner column). Unknown paths print as "unowned". */
export function ownerOf(sibling: string): string {
  const p = sibling.replace(/^hub\//, '');
  if (/^src\/kit\/(overlays\/|states\/Toast)/.test(p)) return 'kit overlays';
  if (/^src\/kit\/(forms|controls)\//.test(p)) return 'kit forms';
  if (/^src\/kit\/(data|widgets)\//.test(p)) return 'kit data';
  if (/^src\/kit\/(layouts|states|qr|pickers|voice)\//.test(p) || /^src\/kit\/icons/.test(p)) return 'kit layouts';
  if (/^src\/(term\/(shell|app|env)|shell)\//.test(p)) return 'terminal shell';
  if (/^src\/term\/(prim|jsx|css|check|goldens)\//.test(p)) return 'terminal prims';
  if (/^src\/kit\/(agent\/|ask)/.test(p) || /^src\/ask\//.test(p) || /^src\/pages\/ai\//.test(p)) return 'AI and Ask';
  if (/^src\/pages\//.test(p)) return 'pages';
  if (/^src\/term\/scenario\//.test(p)) return 'scenarios';
  return 'unowned';
}

// The obligations need the whole web program (~40 s to parse on this host). The result is cached in
// hub/.term-cache/contract-obligations.json, keyed by the mtime of every file the program read plus the sibling and
// scenario file lists: any edit (or a new sibling/scenario) recomputes.
const CACHE = path.join(HUB, '.term-cache/contract-obligations.json');
interface Cached { key: Record<string, number>; comps: ComponentObligations[] }
const listKey = (): Record<string, number> => {
  const k: Record<string, number> = {};
  for (const g of ['**/*.term.{ts,tsx}', '**/*.scenario.ts']) for (const f of new Bun.Glob(g).scanSync(SRC)) k['list:' + f] = fs.statSync(path.join(SRC, f)).mtimeMs;
  k['self'] = fs.statSync(import.meta.path).mtimeMs;
  return k;
};
function cachedObligations(): ComponentObligations[] | null {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Cached;
    const now = listKey();
    for (const [f, m] of Object.entries(c.key)) {
      if (f.startsWith('list:') || f === 'self') { if (now[f] !== m) return null; continue; }
      if (fs.statSync(f, { throwIfNoEntry: false })?.mtimeMs !== m) return null;
    }
    if (Object.keys(now).some((k) => c.key[k] === undefined)) return null;
    return c.comps;
  } catch { return null; }
}
function storeObligations(P: Program, comps: ComponentObligations[]): void {
  const key: Record<string, number> = listKey();
  for (const sf of P.program.getSourceFiles()) { const m = fs.statSync(sf.fileName, { throwIfNoEntry: false })?.mtimeMs; if (m !== undefined) key[sf.fileName] = m; }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ key, comps } satisfies Cached));
}

/** Obligation summary for the scenario runner's report (and the gate). Without a program: the cache, else a fresh one. */
export function reportObligations(given?: Program, escapeKeys?: string[]) {
  let comps = given ? null : cachedObligations();
  if (!comps) { const P = given ?? programOf(); comps = obligations(P); storeObligations(P, comps); }
  const debt = readDebt();
  const now = [...comps.flatMap((c) => c.failures.map((f) => keyOf(c, f))), ...(escapeKeys ?? [])];
  const fresh = now.filter((k) => !debt.has(k));
  // Without the type pass (scenarios.ts), escape entries are not judged.
  const fixed = [...debt].filter((k) => !now.includes(k) && (escapeKeys !== undefined || !isEscapeKey(k)));
  return { components: comps, fresh, fixed, failing: fresh.length + fixed.length };
}
const isEscapeKey = (k: string): boolean => k.includes(': any escape ');
/** Debt keys of a sibling's escapes: the expression text without its line (lines move), numbered when repeated. */
export function escapeKeysOf(r: SiblingReport): string[] {
  const seen = new Map<string, number>();
  return r.escapes.map((e) => {
    const body = e.replace(/^line \d+: /, '');
    const n = (seen.get(body) ?? 0) + 1;
    seen.set(body, n);
    return `${r.sibling}: any escape ${body}${n > 1 ? ` (${n})` : ''}`;
  });
}

const DOC = 'src/term/docs/scenarios.md';
/** What to do about one failure: the file to edit, the command to run, the doc page. No team or worker names. */
export function fixLine(c: Pick<ComponentObligations, 'component' | 'sibling' | 'scenario'>, f: string): string {
  const scen = c.scenario ?? c.sibling.replace(/\.term\.tsx?$/, '.scenario.ts');
  const prop = /\b[A-Z][\w$]*\.([^\s:]+)/.exec(f)?.[1] ?? '<prop>';
  const explain = `bun scripts/term/contract.ts --explain ${c.component}`;
  if (f.startsWith('no scenario for')) return `-> create ${scen} (copy src/kit/controls/Button.scenario.ts; ${DOC} "A scenario file"), then: ${explain}`;
  if (/has no cases$/.test(f)) return `-> add cases to ${scen} (${DOC} "A case"), or, when a mount needs the whole page's data, prove each behavioural prop with pageProof: { prop: '<page>/<shot that presses it>' } (${DOC} "Page proof")`;
  if (f.startsWith('pageProof')) return `-> name a shot in src/pages/<page>/shots.ts that presses the control (click, act or keys) and waits for what it opens (waitForText) (${DOC} "Page proof")`;
  if (f.startsWith('unread prop')) return `-> read ${prop} in ${c.sibling} (draw it, or pass it on), or add ${prop}: '<why the terminal ignores it>' to ignored in ${scen}; ${explain}`;
  if (/not exercised$/.test(f)) return `-> add a case to ${scen} that sets ${prop} and expects its effect (calls, nodes or focus), or list it under unsupported with a reason (${DOC} "Expectations")`;
  if (f.startsWith('ignored but read')) return `-> ${c.sibling} reads ${prop}: remove it from ignored in ${scen}, or start its reason with "read:" if it only changes the look`;
  if (f.startsWith('listed prop')) return `-> remove ${prop} from ignored/unsupported in ${scen} (the web component has no such prop)`;
  if (f.startsWith('reason too short')) return `-> say why in ${scen} in three words or more (what the terminal does instead, or why it cannot)`;
  if (/reaches a handler$/.test(f)) return `-> ${prop} changes what ${c.component} does in ${c.sibling}: remove it from ignored in ${scen} and add a case that sets it and expects the effect`;
  if (f.startsWith('covers without an assertion')) return `-> give that case in ${scen} an expect that fails when the covered prop is ignored (calls, nodes, focused, neverShown or treeNever); bun scripts/term/scenarios.ts --mutants ${path.basename(scen)} checks it`;
  if (f.startsWith('any escape')) return `-> type it in ${c.sibling} (a typed props object; \`typeof Web.X\` on a typed implementation), or mark a reviewed one: // contract-any: <why, three words or more>`;
  return `-> ${explain}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Mutants: remove a sibling component's handling of one prop, in memory (scripts/term/scenarios.ts --mutants).

// The approval path of an agent gate (onDecide, its blockers pending/unavailable) is a safety prop like a destructive confirm.
export const SAFETY_PROPS = ['isDisabled', 'disabled', 'isReadOnly', 'readOnly', 'type', 'onPress', 'onChange', 'busy', 'defaultSelected', 'onConfirm', 'destructive', 'disabledReason', 'onDecide', 'pending', 'unavailable'];

/** The sibling source with every read of `prop` in component `component` replaced by `undefined`. A component that hands
 *  its props on (`<Approval {...p} />`, `<Body {...q} />`) to another function of the SAME file is followed: the prop is
 *  read there too (GateCard reads `pending` only in Approval), so that function's reads are mutated as well. */
export type MutantMode = 'drop' | 'flip';
const FLIP_FN = '\nfunction __contractFlip(v: unknown): unknown { return typeof v === \'boolean\' ? !v : v === undefined || v === null ? true : typeof v === \'function\' ? undefined : typeof v === \'string\' ? (v === \'\' ? \'x\' : \'\') : typeof v === \'number\' ? v + 1 : undefined; }\n';
/** `drop`: every read of the prop becomes undefined. `flip`: every read becomes its opposite (a boolean negated, unset
 *  set to true, a string emptied, a callback removed), for a case that sets the prop to its default. */
export function mutateSource(file: string, source: string, component: string, prop: string, mode: MutantMode = 'drop'): { code: string; sites: number } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findFn = (name: string): ts.FunctionLikeDeclaration | null => {
    let fn: ts.FunctionLikeDeclaration | null = null;
    const find = (n: ts.Node): void => {
      if (fn) return;
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) fn = unwrapFn(d.initializer);
      if (ts.isFunctionDeclaration(n) && n.name?.text === name) fn = n;
      ts.forEachChild(n, find);
    };
    find(sf);
    return fn;
  };
  const edits = new Map<number, [number, number, string]>();
  const done = new Set<string>();
  const queue = [component];
  while (queue.length) {
    const name = queue.shift()!;
    if (done.has(name)) continue;
    done.add(name);
    const f = findFn(name);
    if (!f) continue;
    for (const next of mutateFn(sf, f, prop, edits, mode)) if (!done.has(next)) queue.push(next);
  }
  const list = [...edits.values()].sort((x, y) => y[0] - x[0]);
  let code = source;
  for (const [s0, e, t] of list) code = code.slice(0, s0) + t + code.slice(e);
  if (mode === 'flip' && list.length) code += FLIP_FN;
  return { code, sites: list.length };
}

/** Mutates one function's reads of `prop` into `edits`; returns the JSX tags it spreads an object into (to follow). */
function mutateFn(sf: ts.SourceFile, f: ts.FunctionLikeDeclaration, prop: string, edits: Map<number, [number, number, string]>, mode: MutantMode = 'drop'): string[] {
  const add = (s0: number, e: number, t: string): void => { if (!edits.has(s0)) edits.set(s0, [s0, e, t]); };
  const gone = (n: ts.Node): string => (mode === 'flip' ? `(__contractFlip(${n.getText(sf)}) as never)` : '(undefined as never)');
  const param = f.parameters[0];
  const locals = new Set<string>();   // identifiers bound to the prop
  const objects = new Set<string>();  // identifiers holding the props object (p, rest)
  const follow: string[] = [];
  const propBindings = new Set<ts.Node>(); // the identifiers that bind the prop (never a shadow)
  const scanPattern = (b: ts.ObjectBindingPattern): void => {
    for (const el of b.elements) {
      if (el.dotDotDotToken && ts.isIdentifier(el.name)) { objects.add(el.name.text); continue; }
      const key = el.propertyName && (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : null;
      if (key === prop && ts.isIdentifier(el.name)) {
        locals.add(el.name.text);
        propBindings.add(el.name);
        if (el.initializer && mode === 'drop') add(el.initializer.getStart(sf), el.initializer.getEnd(), 'undefined');
      }
    }
  };
  if (param && ts.isObjectBindingPattern(param.name)) scanPattern(param.name);
  else if (param && ts.isIdentifier(param.name)) objects.add(param.name.text);
  // A nested scope that declares the prop's local name again (`let value` in a branch, a callback parameter `value`)
  // shadows it: its identifiers are another binding, never a read of the prop. Rewriting them gave
  // `let (undefined as never): ReactNode` (SecretField's local `value`: the mutant did not parse).
  const namesOf = (b: ts.BindingName, out: ts.Identifier[]): ts.Identifier[] => {
    if (ts.isIdentifier(b)) out.push(b);
    else for (const el of b.elements) if (!ts.isOmittedExpression(el)) namesOf(el.name, out);
    return out;
  };
  const declaredIn = (n: ts.Node): ts.Identifier[] => {
    const out: ts.Identifier[] = [];
    const vars = (l: ts.VariableDeclarationList): void => { for (const d of l.declarations) namesOf(d.name, out); };
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isCaseClause(n) || ts.isDefaultClause(n)) {
      for (const st of n.statements) {
        if (ts.isVariableStatement(st)) vars(st.declarationList);
        else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) out.push(st.name);
      }
    } else if (ts.isFunctionLike(n) && n !== f) {
      for (const p of n.parameters) namesOf(p.name, out);
      if ((ts.isFunctionExpression(n)) && n.name) out.push(n.name);
    } else if ((ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer)) vars(n.initializer);
    else if (ts.isCatchClause(n) && n.variableDeclaration) namesOf(n.variableDeclaration.name, out);
    return out.filter((id) => !propBindings.has(id));
  };
  // The prop's own bindings first (`const { value } = p`, `const { value } = rest` after `const { ...rest } = p`), so a
  // block declaring them is never read as shadowing them.
  for (let grew = true; grew;) {
    const n0 = propBindings.size + objects.size;
    const pre = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.initializer) && objects.has(n.initializer.text) && ts.isObjectBindingPattern(n.name)) scanPattern(n.name);
      ts.forEachChild(n, pre);
    };
    if (f.body) pre(f.body);
    grew = propBindings.size + objects.size !== n0;
  }
  let shadowed = new Set<string>();
  const visit = (n: ts.Node): void => {
    const shadows = declaredIn(n).filter((id) => locals.has(id.text) && !shadowed.has(id.text));
    if (shadows.length) {
      const before = shadowed;
      shadowed = new Set([...before, ...shadows.map((id) => id.text)]);
      visitInner(n);
      shadowed = before;
      return;
    }
    visitInner(n);
  };
  const visitInner = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.initializer) && objects.has(n.initializer.text) && ts.isObjectBindingPattern(n.name)) scanPattern(n.name);
    if (ts.isJsxSpreadAttribute(n)) {
      const tag = (n.parent.parent as ts.JsxOpeningLikeElement).tagName;
      if (tag && ts.isIdentifier(tag)) follow.push(tag.text);
    }
    if ((ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && objects.has(n.expression.text) && n.name.text === prop)
      || (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && objects.has(n.expression.text) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === prop)) {
      add(n.getStart(sf), n.getEnd(), gone(n));
      return;
    }
    if (ts.isIdentifier(n) && locals.has(n.text) && !shadowed.has(n.text)) {
      const p = n.parent;
      // A name in a key position is no read of the local: a property or JSX attribute name, a member name in a class,
      // object literal or type literal (`get value() {}`, `{ src: string }`), a qualified name's right side.
      const keyed = p as { name?: ts.Node };
      const isName = ts.isBindingElement(p) || (ts.isQualifiedName(p) && p.right === n)
        || ((ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isJsxAttribute(p) || ts.isMethodDeclaration(p)
          || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p)
          || ts.isMethodSignature(p) || ts.isEnumMember(p)) && keyed.name === n);
      if (ts.isShorthandPropertyAssignment(p)) add(n.getStart(sf), n.getEnd(), `${n.text}: ${gone(n)}`);
      else if (!isName) add(n.getStart(sf), n.getEnd(), gone(n));
    }
    ts.forEachChild(n, visit);
  };
  if (f.body) visit(f.body);
  return follow;
}

// ---------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const lenient = argv.includes('--lenient');
  const json = argv.includes('--json');
  const t0 = performance.now();
  const P = programOf();
  // --only a,b: judge only these siblings (hub-relative paths) or components; the exit code is theirs alone.
  const onlyArg = argv.includes('--only') ? (argv[argv.indexOf('--only') + 1] ?? '').split(',').filter(Boolean) : null;
  const onlySet = onlyArg ? new Set(onlyArg) : null;
  const picked = (sibling: string, component?: string): boolean => !onlySet || onlySet.has(sibling) || (!!component && onlySet.has(component));
  // The debt is the whole Hub's: rewriting it from a filtered view would drop every other entry.
  if (onlySet && (argv.includes('--update-debt') || argv.includes('--write-debt'))) { process.stderr.write('contract.ts: --only cannot be combined with --update-debt or --write-debt (the debt covers every sibling)\n'); process.exit(2); }
  const allReports = checkContracts(P);
  const reports = allReports.filter((r) => picked(r.sibling));
  const debt0 = readDebt();
  const escapeKeys = allReports.flatMap(escapeKeysOf);
  let bad = 0;
  const out: string[] = [];
  for (const r of reports) {
    const ek = escapeKeysOf(r);
    const newEsc = r.escapes.filter((_e, i) => !debt0.has(ek[i]!));
    const fail = r.extra.length + r.mismatched.length + r.anyTyped.length + r.errors.length + newEsc.length + (lenient ? 0 : r.missing.length);
    bad += fail ? 1 : 0;
    out.push(`${fail ? 'FAIL' : 'ok  '} ${r.sibling}${r.missing.length ? `  (${lenient ? 'not yet' : 'MISSING'}: ${r.missing.join(', ')})` : ''}${r.escapes.length > newEsc.length ? `  (${r.escapes.length - newEsc.length} escapes in debt)` : ''}`);
    for (const n of r.extra) out.push(`       exports ${n}, which ${r.web} does not -> remove it from ${r.sibling}, or move a terminal-only helper into a file with no web twin`);
    for (const n of r.mismatched) out.push(`       type differs from the web export: ${n} -> type the export as \`typeof Web.X\` over a typed implementation`);
    for (const n of r.anyTyped) out.push(`       ${n}: one side is typed any -> give it the web export's type`);
    for (const e of newEsc) out.push(`       any escape ${e} ${fixLine({ component: '', sibling: r.sibling, scenario: null }, 'any escape')}`);
    for (const e of r.errors.slice(0, 12)) out.push(`       line ${e}`);
  }
  // Fail closed (fail-closed.ts): no sibling with a web twin means nothing was compared.
  const contractEmpty = onlySet ? null : noInputs('contract.ts', 'term sibling with a web twin', reports.length);
  if (contractEmpty) { out.push(contractEmpty); bad += 1; }
  out.push(`types: ${reports.length} siblings, ${bad} failing`);
  let rep: ReturnType<typeof reportObligations> | null = null;
  if (!argv.includes('--types-only')) {
    rep = reportObligations(P, escapeKeys);
    if (argv.includes('--update-debt')) {
      // Only shrinks: drops entries that are fixed (or no longer exist), never adds one.
      const now = new Set([...rep.components.flatMap((c) => c.failures.map((f) => keyOf(c, f))), ...escapeKeys]);
      const before = [...readDebt()];
      const kept = before.filter((k) => now.has(k));
      // A component whose obligations moved to its defining file keeps its debt there (same failure, new owner).
      const gone = new Set(before.filter((k) => !now.has(k)).map((k) => k.slice(k.indexOf(': ') + 2)));
      const moved = rep.fresh.filter((k) => gone.has(k.slice(k.indexOf(': ') + 2)));
      if (moved.length) out.push(`re-keyed ${moved.length} entries to the file that defines the component`);
      const entries = [...kept, ...moved].sort();
      fs.writeFileSync(DEBT_FILE, JSON.stringify({ note: DEBT_NOTE, entries } satisfies Debt, null, 2) + '\n');
      out.push(`removed ${before.length - kept.length - moved.length} fixed debt entries (${entries.length} left); added none${rep.fresh.length ? `: ${rep.fresh.length} NEW obligations still fail and must be fixed, not listed` : ''}`);
      rep = reportObligations(P, escapeKeys);
    }
    if (argv.includes('--write-debt')) {
      // The debt only shrinks. Writing it adds entries only with --allow-growth, which names every one it adds.
      const now = [...new Set([...rep.components.flatMap((c) => c.failures.map((f) => keyOf(c, f))), ...escapeKeys])].sort();
      const before = readDebt();
      const added = now.filter((k) => !before.has(k));
      if (added.length && !argv.includes('--allow-growth')) {
        process.stderr.write(`--write-debt would ADD ${added.length} entries to ${path.relative(HUB, DEBT_FILE)}; the debt only shrinks. Fix them, or (a reviewed rule change only) re-run with --allow-growth, which lists each.\n`);
        process.exit(2);
      }
      for (const k of added) out.push(`DEBT ADDED (--allow-growth): ${k}`);
      fs.writeFileSync(DEBT_FILE, JSON.stringify({ note: DEBT_NOTE, entries: now } satisfies Debt, null, 2) + '\n');
      out.push(`wrote ${now.length} debt entries to ${path.relative(HUB, DEBT_FILE)} (${added.length} added, ${[...before].filter((k) => !now.includes(k)).length} fixed removed)`);
      rep = reportObligations(P, escapeKeys);
    }
    if (onlySet) {
      const comps = rep.components.filter((c) => picked(c.sibling, c.component));
      const sibs = new Set([...comps.map((c) => c.sibling), ...reports.map((r) => r.sibling)]);
      const mine = (k: string): boolean => sibs.has(k.slice(0, k.indexOf(': ')));
      const fresh = rep.fresh.filter(mine);
      const fixed = rep.fixed.filter(mine);
      rep = { components: comps, fresh, fixed, failing: fresh.length + fixed.length };
      if (!reports.length && !comps.length) { out.push(`contract.ts --only: none of ${onlyArg!.join(', ')} is a terminal sibling with a web twin`); bad += 1; }
    }
    const explain = argv.includes('--explain') ? (argv[argv.indexOf('--explain') + 1] ?? '').split(',') : [];
    for (const c of rep.components) {
      const mine = c.failures.map((f) => keyOf(c, f));
      const newOnes = mine.filter((k) => rep!.fresh.includes(k));
      if (!newOnes.length && !explain.includes(c.component)) continue;
      out.push(`${newOnes.length ? 'FAIL' : 'info'} ${c.component} (${c.sibling})  scenario: ${c.scenario ?? 'none'}  read ${c.read.length}/${c.props} props`);
      for (const k of newOnes) { const f = k.slice(c.sibling.length + 2); out.push(`       ${f}`, `         ${fixLine(c, f)}`); }
      if (explain.includes(c.component)) {
        out.push(`       read: ${c.read.join(', ')}`, `       unread: ${c.unread.join(', ') || 'none'}`, `       uncovered behavioural: ${c.uncovered.join(', ') || 'none'}`, `       stale ignored: ${c.staleIgnored.join(', ') || 'none'}`);
        for (const u of c.unsure) out.push(`       cannot tell: ${u}`);
      }
    }
    for (const k of rep.fixed) out.push(`FIXED (remove from contract.debt.json): ${k} -> bun scripts/term/contract.ts --update-debt`);
    // Per folder: open obligations (in debt + new), so each area sees its remainder.
    const per = new Map<string, { debt: number; fresh: number }>();
    for (const c of rep.components) for (const f of c.failures) {
      const o = path.dirname(c.sibling);
      const row = per.get(o) ?? { debt: 0, fresh: 0 };
      if (rep.fresh.includes(keyOf(c, f))) row.fresh++; else row.debt++;
      per.set(o, row);
    }
    if (per.size) out.push(`per folder (in debt / new): ${[...per].sort().map(([o, r]) => `${o} ${r.debt}/${r.fresh}`).join(', ')}`);
    const total = rep.components.reduce((n, c) => n + c.failures.length, 0);
    const shownEsc = onlySet ? reports.flatMap(escapeKeysOf) : escapeKeys;
    const escDebt = shownEsc.filter((k) => debt0.has(k)).length;
    out.push(`behaviour: ${rep.components.length} components, ${total} open obligations, ${shownEsc.length} any escapes (${total + shownEsc.length - rep.fresh.length} in debt, ${escDebt} of them escapes), ${rep.fresh.length} new, ${rep.fixed.length} fixed-but-listed`);
  }
  out.push(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (json) writeAllStdout(JSON.stringify({ types: reports, behaviour: rep }, (_k, v) => (v instanceof Set ? [...v] : v), 2) + '\n');
  else process.stdout.write(out.join('\n') + '\n');
  process.exit(bad || (rep?.failing ?? 0) ? 1 : 0);
}

// process.stdout.write to a pipe is asynchronous: a process.exit right after it cut --json output at 64 KB. Write
// synchronously, whole, to fd 1.
function writeAllStdout(text: string): void {
  const buf = Buffer.from(text);
  for (let off = 0; off < buf.length;) {
    try { off += fs.writeSync(1, buf, off); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e; }
  }
}
