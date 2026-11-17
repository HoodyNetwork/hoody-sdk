// decide.only-source.test.ts: a decision reaches AskEngine.decide / AskEngine.answer only
// through the active source: active.ts decideLike, called by activate.ts guarded(['decide'] / ['answer']), which checks the
// capability table's prerequisites (journal, recovery, attachment hold, approver lease for a Strict chat). A surface that called
// the engine straight (the dock column did) would decide with none of them. The engine itself carries no copy of that check
// (one policy table, capability.ts).
//
// Both scans run on the TypeScript checker over a program built from hub/tsconfig.json (every non-test file, root files included),
// so a spelling cannot hide a reference:
// 1. References: every use of the two engine members' symbols (property access, literal element access, destructuring, a method
//    taken out or handed to call/apply/bind, a mapped type of AskEngine) outside the class itself must be in ALLOWED, exactly.
// 2. Imports: outside src/ask no non-test file imports a module that RESOLVES (ts.resolveModuleName under the tsconfig paths, so
//    relative and alias spellings are the same thing) into src/ask, except its index (AskPanel and hooks, no engine), io.ts
//    (@ask/io) and JSON data.
// src/ask/accept is the acceptance harness (test-only helpers) and is not scanned. Fixtures below hold every form the check must catch.
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const HUB = join(SRC, '..');
const MEMBERS = ['decide', 'answer'];

/** file (relative to src) -> the reference texts allowed there, sorted. */
const ALLOWED: Record<string, string[]> = {
  // The one path to the engine: decideLike's `go` callback, for decide and for answer.
  'ask/active.ts': ['e.answer', 'e.decide'],
};

const isTestFile = (f: string) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f);

/** AskEngine (the class in <root>/ask/engine.ts) and the symbols of its own decide/answer. */
function targets(p: ts.Program, root: string): { cls: ts.Symbol; members: ts.Symbol[] } {
  const sf = p.getSourceFile(join(root, 'ask', 'engine.ts'));
  if (!sf) throw new Error('ask/engine.ts is not in the program');
  const tc = p.getTypeChecker(), members: ts.Symbol[] = [];
  let cls: ts.Symbol | undefined;
  ts.forEachChild(sf, (n) => {
    if (!ts.isClassDeclaration(n) || n.name?.text !== 'AskEngine') return;
    cls = tc.getSymbolAtLocation(n.name);
    for (const m of n.members) if (m.name && ts.isIdentifier(m.name) && MEMBERS.includes(m.name.text)) { const s = tc.getSymbolAtLocation(m.name); if (s) members.push(s); }
  });
  if (!cls || members.length !== MEMBERS.length) throw new Error(`AskEngine members not found: ${members.map((s) => s.name).join(',')}`);
  return { cls, members };
}

/** Every way the scanned files reach the engine members, by file: a reference to their symbols (the referencing expression's text),
 *  `computed:<expr>` for an element access with a non-literal key on an AskEngine value, and `escape:<expr>` for an AskEngine value
 *  handed to another type that has a decide or answer (an interface, a structural parameter, a type parameter's constraint), whose
 *  member symbols are not the engine's. */
function engineRefs(p: ts.Program, root: string, scanned: (f: string) => boolean): Record<string, string[]> {
  const tc = p.getTypeChecker(), { cls, members: want } = targets(p, root);
  const isTarget = (s: ts.Symbol | undefined): boolean => !!s && (want.includes(s) || tc.getRootSymbols(s).some((r) => want.includes(r)));
  const isEngine = (t: ts.Type): boolean => t.getSymbol() === cls || (t.isUnionOrIntersection() && t.types.some(isEngine));
  const loose = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
  /** A type other than the engine (any/unknown aside) through which decide or answer can be called: a union member, null and
   *  undefined aside, or a type parameter's constraint counts. */
  const otherDecider = (t: ts.Type): boolean => {
    const u = tc.getNonNullableType(t);
    return (u.isUnion() ? u.types : [u]).some((m) => {
      const c = m.isTypeParameter() ? tc.getBaseConstraintOfType(m) ?? m : m;
      return !(c.flags & loose) && !isEngine(c) && MEMBERS.some((k) => tc.getApparentType(c).getProperty(k) !== undefined);
    });
  };
  /** The types `n` is handed to: its contextual type and, for an argument, the declared (uninstantiated) parameter type, whose type
   *  parameter the call itself instantiates to the engine. A destructuring initializer is not handed on (its pattern's members are
   *  references, seen above). */
  const receivers = (n: ts.Expression): ts.Type[] => {
    const q = n.parent;
    if ((ts.isVariableDeclaration(q) || ts.isParameter(q)) && !q.type && !ts.isIdentifier(q.name)) return [];
    const out: ts.Type[] = [];
    const ct = tc.getContextualType(n);
    if (ct) out.push(ct);
    if ((ts.isCallExpression(q) || ts.isNewExpression(q)) && q.arguments) {
      const prms = tc.getResolvedSignature(q)?.getDeclaration()?.parameters;
      const prm = prms?.length ? prms[Math.min(q.arguments.indexOf(n), prms.length - 1)] : undefined;
      if (prm) out.push(tc.getTypeAtLocation(prm));
    }
    return out;
  };
  /** An expression in a slot that gives it a contextual type (an argument, an initializer, a returned or assigned value, an element or
   *  property of a literal, a JSX attribute): the only places a value can be handed to another type. Checking only these keeps the
   *  scan inside its timeout. */
  const handed = (n: ts.Node): n is ts.Expression => {
    if (!ts.isExpression(n)) return false;
    const q = n.parent;
    return ((ts.isCallExpression(q) || ts.isNewExpression(q)) && !!q.arguments?.includes(n))
      || ((ts.isVariableDeclaration(q) || ts.isParameter(q) || ts.isPropertyDeclaration(q) || ts.isPropertyAssignment(q)) && q.initializer === n)
      || (ts.isShorthandPropertyAssignment(q) && q.name === n)
      || (ts.isArrowFunction(q) && q.body === n)
      || (ts.isBinaryExpression(q) && q.right === n && q.operatorToken.kind === ts.SyntaxKind.EqualsToken)
      || (ts.isConditionalExpression(q) && q.condition !== n)
      || ts.isReturnStatement(q) || ts.isArrayLiteralExpression(q) || ts.isJsxExpression(q) || ts.isSpreadElement(q)
      || ts.isSpreadAssignment(q) || ts.isParenthesizedExpression(q) || ts.isAsExpression(q) || ts.isSatisfiesExpression(q)
      || ts.isYieldExpression(q) || ts.isExportAssignment(q);
  };
  const out: Record<string, string[]> = {};
  for (const sf of p.getSourceFiles()) {
    if (sf.isDeclarationFile || !scanned(sf.fileName)) continue;
    const file = relative(root, sf.fileName).split(sep).join('/');
    const visit = (n: ts.Node) => {
      const named = (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && MEMBERS.includes(n.text);
      if (named) {
        const parent = n.parent;
        // The members' own declarations are not references.
        const own = (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === n;
        let s: ts.Symbol | undefined;
        if (ts.isBindingElement(parent) && (parent.propertyName ?? parent.name) === n) {
          // `const { decide } = eng` / `({ decide: d }) => …`: the property of the pattern's source type.
          s = tc.getTypeAtLocation(parent.parent).getProperty(n.text);
        } else s = tc.getSymbolAtLocation(n);
        if (!own && isTarget(s)) {
          const host = ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) || ts.isBindingElement(parent) ? parent : n;
          (out[file] ??= []).push(host.getText(sf).replace(/\s+/g, ''));
        }
      }
      if (ts.isElementAccessExpression(n) && !ts.isStringLiteralLike(n.argumentExpression) && isEngine(tc.getTypeAtLocation(n.expression))) {
        (out[file] ??= []).push('computed:' + n.getText(sf).replace(/\s+/g, ''));
      }
      if (handed(n) && isEngine(tc.getTypeAtLocation(n))) {
        if (receivers(n).some(otherDecider)) (out[file] ??= []).push('escape:' + n.getText(sf).replace(/\s+/g, ''));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    out[file]?.sort();
  }
  return out;
}

const COMPUTED = '<computed>';
/** Every module specifier of one file: import/export declarations (type-only too), import(), import types and require(). An
 *  import() or require() whose specifier is not a literal cannot be resolved, so it is returned as `<computed>` and refused. */
function specifiers(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteralLike(n.moduleReference.expression)) out.push(n.moduleReference.expression.text);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      const a = n.arguments[0];
      out.push(a && ts.isStringLiteralLike(a) ? a.text : COMPUTED);
    }
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteralLike(n.argument.literal)) out.push(n.argument.literal.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Imports from outside <root>/ask that resolve into it, other than its index, io.ts and JSON: `file: specifier -> target`. */
function askImports(p: ts.Program, root: string, host: ts.ModuleResolutionHost, scanned: (f: string) => boolean): string[] {
  const ask = join(root, 'ask') + sep, opts = p.getCompilerOptions();
  const open = new Set([join(root, 'ask', 'index.ts'), join(root, 'ask', 'index.tsx'), join(root, 'ask', 'io.ts')]);
  const bad: string[] = [];
  for (const sf of p.getSourceFiles()) {
    if (sf.isDeclarationFile || !scanned(sf.fileName) || sf.fileName.startsWith(ask)) continue;
    for (const s of specifiers(sf)) {
      if (s === COMPUTED) { bad.push(`${relative(root, sf.fileName).split(sep).join('/')}: a computed import()/require() specifier`); continue; }
      const r = ts.resolveModuleName(s, sf.fileName, opts, host).resolvedModule?.resolvedFileName;
      if (!r || !r.startsWith(ask) || open.has(r) || r.endsWith('.json')) continue;
      bad.push(`${relative(root, sf.fileName).split(sep).join('/')}: ${s} -> ${relative(root, r).split(sep).join('/')}`);
    }
  }
  return bad.sort();
}

describe('a decision reaches the engine only through the active source', () => {
  let real: ts.Program;
  const scanned = (f: string) => f.startsWith(SRC + sep) && !isTestFile(f) && !f.startsWith(join(SRC, 'ask', 'accept') + sep);
  beforeAll(() => {
    const cfg = ts.getParsedCommandLineOfConfigFile(join(HUB, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
    if (!cfg) throw new Error('hub/tsconfig.json');
    real = ts.createProgram({ rootNames: cfg.fileNames.filter((f) => !isTestFile(f)), options: { ...cfg.options, noEmit: true } });
  }, 240_000);

  it('the engine\'s decide/answer are referenced only where ALLOWED says', () => {
    expect(engineRefs(real, SRC, scanned)).toEqual(ALLOWED);
  }, 120_000);

  it('outside src/ask nothing imports an src/ask module but its index, io.ts or JSON', () => {
    expect(askImports(real, SRC, ts.sys, scanned)).toEqual([]);
  }, 120_000);
});

// ---- fixtures: an in-memory tree with the same layout and the hub's paths, so every known form stays covered ----
const V = '/virtual/hub';
const VSRC = V + '/src';
const ENGINE = 'export class AskEngine { decide(c: string): void { void c; } answer(v: string): void { void v; } other(): void {} }\n';
function fixture(files: Record<string, string>) {
  const all: Record<string, string> = { [VSRC + '/ask/engine.ts']: ENGINE, [VSRC + '/ask/index.ts']: 'export const AskPanel = 1;\n', [VSRC + '/ask/io.ts']: 'export const io = 1;\n', [VSRC + '/ask/strings.en.json']: '{}', [VSRC + '/kit/index.ts']: 'export const k = 1;\n' };
  for (const [k, v] of Object.entries(files)) all[VSRC + '/' + k] = v;
  const opts: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    strict: true, noEmit: true, resolveJsonModule: true, allowImportingTsExtensions: true, types: [], lib: ['lib.es2022.d.ts'], baseUrl: V,
    paths: { '@kit': ['./src/kit/index.ts'], '@kit/*': ['./src/kit/*'], '@core/*': ['./src/core/*'], '@ask/io': ['./src/ask/io.ts'] },
  };
  const host = ts.createCompilerHost(opts);
  const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host), getSourceFile = host.getSourceFile.bind(host);
  const dirs = new Set(Object.keys(all).flatMap((f) => f.split('/').slice(1, -1).map((_, i, a) => '/' + a.slice(0, i + 1).join('/'))));
  host.fileExists = (n) => n in all || fileExists(n);
  host.readFile = (n) => (n in all ? all[n] : readFile(n));
  host.directoryExists = (d) => dirs.has(d) || ts.sys.directoryExists(d);
  host.getSourceFile = (n, lang, onError, create) => (n in all ? ts.createSourceFile(n, all[n]!, lang, true, n.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) : getSourceFile(n, lang, onError, create));
  const p = ts.createProgram({ rootNames: Object.keys(all).filter((f) => !f.endsWith('.json')), options: opts, host });
  const scanned = (f: string) => f.startsWith(VSRC + '/') && !isTestFile(f);
  return { refs: () => engineRefs(p, VSRC, scanned), imports: () => askImports(p, VSRC, host, scanned) };
}
const use = (body: string) => fixture({ 'shell/Use.tsx': `import type { AskEngine } from '../ask/engine';\nexport function use(eng: AskEngine) {\n${body}\n}\n` }).refs();

describe('the reference scan sees every form (fixtures)', () => {
  it.each([
    ['a plain call', 'eng.decide(\'once\');', 'eng.decide'],
    ['an optional call', 'eng?.answer?.(\'x\');', 'eng?.answer'],
    ['literal element access', 'eng[\'decide\'](\'once\');', 'eng[\'decide\']'],
    ['a template-literal key', 'eng[`answer`](\'x\');', 'eng[`answer`]'],
    ['destructuring', 'const { decide } = eng; void decide;', 'decide'],
    ['destructuring with a rename', 'const { answer: a } = eng; void a;', 'answer:a'],
    ['a method taken out', 'const d = eng.decide; void d;', 'eng.decide'],
    ['call', 'eng.decide.call(eng, \'once\');', 'eng.decide'],
    ['apply', 'eng.answer.apply(eng, [\'x\']);', 'eng.answer'],
    ['bind', 'void eng.decide.bind(eng);', 'eng.decide'],
    ['a parameter pattern', 'const f = ({ decide }: AskEngine) => decide; void f;', 'decide'],
  ])('%s is a reference', (_n, body, text) => {
    expect(use(body)).toEqual({ 'shell/Use.tsx': [text] });
  });

  it.each([
    ['a computed key', 'const k = \'decide\' as const; eng[k](\'once\');', 'computed:eng[k]'],
    ['a computed key of any string', 'const k: string = \'answer\'; void (eng as unknown as Record<string, unknown>)[k];', null],
    ['a structural parameter', 'const f = (x: { decide(c: string): void }) => x.decide(\'once\'); f(eng);', 'escape:eng'],
    ['a type parameter\'s constraint', 'function g<T extends { answer(v: string): void }>(x: T) { x.answer(\'y\'); }\ng(eng);', 'escape:eng'],
    ['an annotated variable', 'const d: { decide(c: string): void } = eng; void d;', 'escape:eng'],
    ['an annotated return', 'const h = (): { answer(v: string): void } => eng; void h;', 'escape:eng'],
    ['an object property', 'const holder: { e: { decide(c: string): void } } = { e: eng }; void holder;', 'escape:eng'],
    ['a shorthand property', 'const holder: { eng: { decide(c: string): void } } = { eng }; void holder;', 'escape:eng'],
    ['an array element', 'const list: { answer(v: string): void }[] = [eng]; void list;', 'escape:eng'],
    ['an assignment', 'let d: { decide(c: string): void } | null = null; d = eng; void d;', 'escape:eng'],
  ])('%s reaches the engine', (_n, body, text) => {
    expect(use(body)).toEqual(text ? { 'shell/Use.tsx': [text] } : {});
  });

  it('handing the engine to its own type, any or unknown is not an escape', () => {
    expect(use('const a: AskEngine = eng; const b: unknown = eng; const c: any = eng; const f = (x: AskEngine) => x; f(eng); void [a, b, c];')).toEqual({});
  });

  it('a mapped type of the engine is still the engine (Pick)', () => {
    expect(fixture({ 'kit/p.ts': 'import type { AskEngine } from \'../ask/engine\';\nexport const f = (x: Pick<AskEngine, \'decide\'>) => x.decide(\'once\');\n' }).refs()).toEqual({ 'kit/p.ts': ['x.decide'] });
  });

  it('comments, strings, other members and other objects\' decide/answer are not references', () => {
    expect(use('// eng.decide(\'once\')\nconst s = \'eng.answer(v)\'; void s;\neng.other();\nconst o = { decide: () => 1, answer: 2 }; o.decide(); void o.answer;\nconst io = { answer: (x: string) => x }; io.answer(\'y\');')).toEqual({});
  });
});

describe('the import scan resolves every spelling (fixtures)', () => {
  it('relative, alias and root-file imports of an engine module are refused', () => {
    expect(fixture({
      'shell/A.tsx': 'import { AskEngine } from \'../ask/engine\';\nexport const a = AskEngine;\n',
      'shell/B.tsx': 'import \'@kit/../ask/engine\';\n',
      'shell/C.ts': 'export type E = import(\'../ask/engine\').AskEngine;\n',
      'shell/D.ts': 'export * from \'../ask/engine.ts\';\n',
      'shell/E.ts': 'export const m = () => import(\'../ask/engine\');\n',
      'shell/G.ts': 'export const n = (x: string) => import(`../ask/${x}.ts`);\n',
      'root.ts': 'import \'./ask/engine\';\n',
    }).imports()).toEqual([
      'root.ts: ./ask/engine -> ask/engine.ts',
      'shell/A.tsx: ../ask/engine -> ask/engine.ts',
      'shell/B.tsx: @kit/../ask/engine -> ask/engine.ts',
      'shell/C.ts: ../ask/engine -> ask/engine.ts',
      'shell/D.ts: ../ask/engine.ts -> ask/engine.ts',
      'shell/E.ts: ../ask/engine -> ask/engine.ts',
      'shell/G.ts: a computed import()/require() specifier',
    ]);
  });

  it('the index, io.ts (any spelling) and JSON are allowed', () => {
    expect(fixture({
      'shell/F.tsx': 'import { AskPanel } from \'../ask\';\nimport { AskPanel as P2 } from \'../ask/index.ts\';\nimport { io } from \'@ask/io\';\nimport { io as io2 } from \'../ask/io.ts\';\nimport { io as io3 } from \'../ask/io\';\nimport s from \'../ask/strings.en.json\';\nexport const f = [AskPanel, P2, io, io2, io3, s];\n',
    }).imports()).toEqual([]);
  });
});
