// dispose.ts and test/env.ts reset the same things: boot() calls resetCoreSteps, and no reset call lives only in env.ts.
// And the other way: a store module of core that exports a reset is named in dispose.ts, or is listed below with why not.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const calls = (src: string) => new Set([...src.matchAll(/\b(reset[A-Z]\w*)\(/g)].map((m) => m[1] as string));

const parse = (src: string, file = 'x.ts') => ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const isReset = (n: string) => /^reset[A-Z]\w*$/.test(n);
const where = (sf: ts.SourceFile, n: ts.Node): string => `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
/** The names a core module exports, by the TypeScript AST. Fail closed: a form whose names this scan does not read (a destructuring
 *  binding in an exported variable statement, `export default`, `export import`, `export namespace`, `export * from` a module that
 *  is not './x' of the same directory) is reported as unsupported with file:line, so a reset cannot hide behind it. Read: exported function/class/variable
 *  declarations, export lists (`export { a as b }`, also re-exports) and `export * as x from` (its target is a scanned module). */
const exportedNames = (sf: ts.SourceFile): { names: string[]; unsupported: string[]; barrels: string[] } => {
  const names: string[] = [];
  const barrels: string[] = [];
  const unsupported: string[] = [];
  const no = (n: ts.Node, what: string): void => { unsupported.push(`${where(sf, n)}: ${what}`); };
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    const exported = !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) no(st, 'export default');
    else if (exported && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st))) { if (st.name) names.push(st.name.text); }
    else if (exported && ts.isEnumDeclaration(st)) names.push(st.name.text); // an enum is a value
    else if (exported && ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) names.push(d.name.text); else no(d, 'a destructuring binding in an exported variable statement'); }
    }
    else if (exported && ts.isImportEqualsDeclaration(st)) no(st, 'export import');
    else if (exported && ts.isModuleDeclaration(st)) no(st, 'export namespace');
    else if (ts.isExportAssignment(st)) no(st, 'export default / export =');
    else if (ts.isExportDeclaration(st)) {
      const c = st.exportClause;
      const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : '';
      if (!c || ts.isNamespaceExport(c)) { // `export * from './x'` / `export * as ns from './x'`: x is scanned on its own, if it resolves
        if (!from.startsWith('./')) no(st, c ? 'export * as from a module outside this directory' : 'export * from a module outside this directory');
        else barrels.push(from);
        if (c) names.push(c.name.text);
      }
      else if (ts.isNamedExports(c)) for (const el of c.elements) names.push(el.name.text);
    }
  }
  return { names, unsupported, barrels };
};
/** Every exported reset of a module, and the export forms of it that the scan does not read. */
const scanResets = (src: string, file = 'x.ts') => { const r = exportedNames(parse(src, file)); return { resets: r.names.filter(isReset), unsupported: r.unsupported, barrels: r.barrels }; };
/** The barrels of a module (`export * from './x'`) whose target is not a module of `known` (./x.ts, ./x.tsx, ./x/index.ts, ./x/index.tsx): such a target is not scanned, so it fails closed. */
const unresolvedBarrels = (file: string, barrels: string[], known: ReadonlySet<string>): string[] =>
  barrels.filter((b) => { const base = join(dirname(file), b); return ![`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].some((c) => known.has(c)); }).map((b) => `${file}: export * from '${b}' does not resolve to a scanned core module`);
const exportedResets = (src: string, file = 'x.ts') => scanResets(src, file).resets;
/** The resets a session reset runs. A step is only: a plain identifier element of the array literal passed to the one `runAll(...)`
 *  statement in the body of resetCoreSteps (which must be the first statement of the body, so nothing can stop it from running), or the callee of the one call that is the whole body of an arrow element. Any other
 *  element (property access, spread, an arrow that is not a single call), no runAll statement or a second one throws; `void resetX`,
 *  comments and every other reference do not count. */
const stepNames = (src: string): Set<string> => {
  const sf = parse(src);
  const fn = sf.statements.find((st): st is ts.FunctionDeclaration => ts.isFunctionDeclaration(st) && st.name?.text === 'resetCoreSteps');
  if (!fn || !fn.body) throw new Error('resetCoreSteps not found');
  const runs = fn.body.statements.filter((st): st is ts.ExpressionStatement => ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && ts.isIdentifier(st.expression.expression) && st.expression.expression.text === 'runAll');
  if (runs.length !== 1) throw new Error(`expected one runAll(...) statement in resetCoreSteps, found ${runs.length}`);
  if (fn.body.statements[0] !== runs[0]) throw new Error('runAll must be the first statement of resetCoreSteps'); // nothing before it can stop the list from running
  const arg = (runs[0] as ts.ExpressionStatement).expression as ts.CallExpression;
  const list = arg.arguments[0];
  if (arg.arguments.length !== 1 || !list || !ts.isArrayLiteralExpression(list)) throw new Error('runAll must take one array literal of steps');
  const out = new Set<string>();
  for (const el of list.elements) {
    if (ts.isIdentifier(el)) { out.add(el.text); continue; }
    if (ts.isArrowFunction(el)) {
      let body: ts.Node = el.body;
      if (ts.isBlock(body)) {
        const only = body.statements.length === 1 ? body.statements[0] : undefined;
        body = only && ts.isExpressionStatement(only) ? only.expression : body;
      }
      if (ts.isCallExpression(body) && ts.isIdentifier(body.expression)) { out.add(body.expression.text); continue; }
    }
    throw new Error(`a step this scan does not read: ${el.getText(sf)}`);
  }
  return out;
};

describe('the test reset and the production reset do not drift', () => {
  const dispose = here('dispose.ts'), env = here('test/env.ts');
  it('test/env.ts holds no reset call dispose.ts lacks', () => {
    const steps = stepNames(dispose);
    const lacking = [...calls(env)].filter((n) => !steps.has(n) && n !== 'resetCoreSteps');
    expect(lacking).toEqual([]);
  });
  it('boot() runs the shared step list', () => {
    expect(env).toMatch(/\bresetCoreSteps\(/);
  });
  it('dispose.ts resets every store in the listed order', () => {
    const steps = /export function resetCoreSteps[\s\S]*?\n\}/.exec(dispose)![0];
    const order = [...steps.matchAll(/\b(reset[A-Z]\w*)\b/g)].map((m) => m[1]).filter((n) => n !== 'resetCoreSteps');
    expect(order).toEqual([
      'resetCore', 'resetRealm', 'resetComputer', 'resetRouting', 'resetChanges', 'resetPrefs', 'resetLifecycle', 'resetLeave', 'resetNotifications', 'resetTabLock',
      'resetTickets', 'resetOtp', 'resetToken', 'resetBootToken', 'resetAgentSignIn', 'resetSetup', 'resetCommerce', 'resetAttempts',
      'resetAppLock', 'resetStreamMux', 'resetCryptForTests',
    ]);
  });
});

// Core modules (not tests) whose exported resetX is deliberately not a step of the session reset.
const NOT_A_STEP: Record<string, string> = {
  resetCoreSteps: 'the list itself',
  resetHostEnvForTests: 'the host env outlives a session: it is installed once per process and only tests drop it',
  resetPrefUpdates: 'resetPrefs calls it',
  resetChatAttentionForTests: 'chat-attention.ts forgets its notes and found gates itself on a sign-out (onTeardown); notes of another account are keyed by it; only tests drop the rest',
  resetChatListsForTests: 'chat-lists.ts clears its pinned places itself on every teardown (onTeardown); only tests drop it',
};
function coreSources(dir = __dirname): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'test' || f === 'node_modules' ? [] : coreSources(p);
    return /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('the reset scan reads exports and steps the way the code means them', () => {
  it('finds declarations of any spacing, export lists and re-exports, and ignores prose and strings', () => {
    const src = [
      'export   async   function  resetA() {}', 'export let resetB = 1;', 'export var resetC = 1;', 'export function* resetD() {}',
      'const resetE = 1; const resetF = 2; export { resetE, resetF as resetG, other as resetH, resetE as notAReset };',
      "export { resetI } from './x';",
      '// export function resetProse() {}', '/* export const resetBlock = 1; */', "const s = 'export function resetString() {}';",
    ].join('\n');
    expect(exportedResets(src).sort()).toEqual(['resetA', 'resetB', 'resetC', 'resetD', 'resetE', 'resetG', 'resetH', 'resetI']);
  });
  it('an export list that names a reset dispose does not run is found, and the step list does not have it', () => {
    const mod = 'const resetZz = () => {};\nexport { resetZz };\n';
    const dispose = "export function resetCoreSteps(): void {\n  runAll([resetCore]);\n}\n";
    const missing = exportedResets(mod).filter((n) => !stepNames(dispose).has(n));
    expect(missing).toEqual(['resetZz']);
  });
  it('an export form the scan does not read is reported unsupported with file:line, one test per form', () => {
    const bad = (src: string) => scanResets(src, 'core/m.ts').unsupported;
    expect(bad('const store = {};\nexport const { resetA } = store;')).toEqual(['core/m.ts:2: a destructuring binding in an exported variable statement']);
    expect(bad('export const [resetB] = [1];')).toHaveLength(1);
    expect(bad('const resetC = 1;\nexport default resetC;')).toEqual(['core/m.ts:2: export default / export =']);
    expect(bad('export default function resetD() {}')).toEqual(['core/m.ts:1: export default']);
    expect(bad('import a = require("a");\nexport import b = a.b;')).toEqual(['core/m.ts:2: export import']);
    expect(bad('export namespace N { export const resetE = 1; }')).toEqual(['core/m.ts:1: export namespace']);
    expect(bad('export * from "some-package";')).toEqual(['core/m.ts:1: export * from a module outside this directory']);
    expect(bad('export * from "../other";')).toHaveLength(1);
    expect(bad('export * from "./barrel";')).toEqual([]); // a same-directory barrel: its target is a core file, scanned on its own
  });
  it('a barrel target must be a scanned core module: ./x.ts, ./x.tsx, ./x/index.ts and ./x/index.tsx resolve, ./missing does not', () => {
    const known = new Set(['/c/a.ts', '/c/b.tsx', '/c/d/index.ts', '/c/e/index.tsx']);
    expect(unresolvedBarrels('/c/idx.ts', ['./a', './b', './d', './e'], known)).toEqual([]);
    expect(unresolvedBarrels('/c/idx.ts', ['./missing', './a'], known)).toEqual(["/c/idx.ts: export * from './missing' does not resolve to a scanned core module"]);
    expect(unresolvedBarrels('/c/sub/idx.ts', ['./a'], known)).toHaveLength(1); // relative to the barrel's own directory
  });
  it('the readable export forms are not reported', () => {
    const bad = (src: string) => scanResets(src, 'core/m.ts').unsupported;
    expect(bad('export * as x from "./other"; export function resetF() {} export const resetG = 1; export { resetF as resetH };')).toEqual([]);
  });
  it('an exported enum is a value export: counted, never ignored', () => {
    expect(exportedResets('export enum resetEx { A }\nexport const enum resetCe { B }\nexport declare enum resetDe { C }')).toEqual(['resetEx', 'resetCe', 'resetDe']);
  });
  it('export * as ns from X: X must be a same-directory module (a package or ../ is unsupported), and a barrel target must resolve like any barrel', () => {
    expect(scanResets('export * as stores from "outside-core";', 'core/m.ts').unsupported).toEqual(['core/m.ts:1: export * as from a module outside this directory']);
    expect(scanResets('export * as stores from "../x";', 'core/m.ts').unsupported).toHaveLength(1);
    const ok = scanResets('export * as stores from "./inside";', 'core/m.ts');
    expect(ok.unsupported).toEqual([]);
    expect(ok.barrels).toEqual(['./inside']);
    expect(unresolvedBarrels('/c/m.ts', ok.barrels, new Set(['/c/other.ts']))).toHaveLength(1); // ./inside is not a scanned core module
  });
  it('a step is only a plain identifier of the one runAll statement list, or the single call of an arrow element', () => {
    const body = (list: string, after = '') => `import { resetX, resetY } from './x';\nexport function resetCoreSteps(): void {\n  runAll(${list});\n}\n${after}`;
    expect([...stepNames(body('[resetX, resetY, () => { resetZ(1); }, () => resetV()]'))].sort()).toEqual(['resetV', 'resetX', 'resetY', 'resetZ']);
    expect([...stepNames("export function resetCoreSteps(): void {\n  runAll([resetX]);\n  void resetY;\n}\n")]).toEqual(['resetX']); // a reference that is never run is not a step
    expect(() => stepNames(body('[resetX, stores.resetFoo]'))).toThrow('does not read');
    expect(() => stepNames(body('[...more]'))).toThrow('does not read');
    expect(() => stepNames(body('[() => { resetA(); resetB(); }]'))).toThrow('does not read');
    expect(() => stepNames(body('[() => {}]'))).toThrow('does not read');
    expect(() => stepNames(body('list'))).toThrow('array literal');
    expect(() => stepNames("export function resetCoreSteps(): void {}\nrunAll([resetX]);\n")).toThrow('found 0'); // the list is outside the function
    expect(() => stepNames("export function resetCoreSteps(): void {\n  runAll([resetX]);\n  runAll([resetY]);\n}\n")).toThrow('found 2');
    expect(() => stepNames("export function resetCoreSteps(): void {\n  if (x) runAll([resetX]);\n}\n")).toThrow('found 0'); // not a statement of the body
    const before = (stmt: string) => `export function resetCoreSteps(): void {\n  ${stmt}\n  runAll([resetX]);\n}\n`;
    for (const stmt of ['return;', "throw new Error('x');", '{ return; }', "if (true) throw new Error('x');", 'setup();', 'const a = 1;']) {
      expect(() => stepNames(before(stmt))).toThrow('runAll must be the first statement of resetCoreSteps'); // anything before the list is refused
    }
    expect([...stepNames("export function resetCoreSteps(): void {\n  runAll([resetX]);\n  return;\n}\n")]).toEqual(['resetX']); // a return after the list is fine
  });
  it('counts a step only in the body of resetCoreSteps, not in a comment or elsewhere in dispose.ts', () => {
    const src = "import { resetX } from './x';\n// resetProse is mentioned here\nexport function resetCoreSteps(): void {\n  runAll([resetX]);\n}\nconst later = resetLate;\n";
    expect([...stepNames(src)].sort()).toEqual(['resetX']);
  });
});

describe('every store reset of core is a step of the session reset', () => {
  it('each exported reset of a core module is named in dispose.ts or listed with its reason', () => {
    const named = stepNames(here('dispose.ts'));
    const scans = coreSources().map((p) => scanResets(readFileSync(p, 'utf8'), p));
    expect(scans.flatMap((r) => r.unsupported)).toEqual([]);
    const files = coreSources();
    const known = new Set(files);
    expect(scans.flatMap((r, i) => unresolvedBarrels(files[i] as string, r.barrels, known))).toEqual([]);
    const exported = scans.flatMap((r) => r.resets);
    expect(exported.length).toBeGreaterThan(15); // the scan reads the modules, not nothing
    expect(exported.filter((n) => !named.has(n) && !(n in NOT_A_STEP))).toEqual([]);
  });
  it('the list of exceptions names only resets that exist, and none that dispose.ts already runs', () => {
    const named = stepNames(here('dispose.ts'));
    const exported = new Set(coreSources().flatMap((p) => exportedResets(readFileSync(p, 'utf8'), p)));
    for (const n of Object.keys(NOT_A_STEP)) {
      expect(exported.has(n)).toBe(true);
      if (n !== 'resetCoreSteps') expect(named.has(n)).toBe(false);
    }
  });
});
