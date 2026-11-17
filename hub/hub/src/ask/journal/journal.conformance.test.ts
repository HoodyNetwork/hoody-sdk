// Journal conformance: static scans over every non-test file of hub/src. Comments are
// removed first (with the TypeScript scanner), so a name in prose never counts and never hides.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const rel = (p: string) => relative(SRC, p).split(sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
/** The source without comments (their characters become spaces; newlines stay), found on the syntax tree so no regular expression
 *  or template literal can fool it. */
function code(text: string): string {
  const sf = ts.createSourceFile('x.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const spans: Array<[number, number]> = [];
  const seen = new Set<number>();
  const take = (rs: readonly ts.CommentRange[] | undefined) => { for (const r of rs ?? []) if (!seen.has(r.pos)) { seen.add(r.pos); spans.push([r.pos, r.end]); } };
  const visit = (n: ts.Node) => {
    take(ts.getLeadingCommentRanges(text, n.getFullStart()));
    take(ts.getTrailingCommentRanges(text, n.getEnd()));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  take(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  let out = text;
  for (const [s, e] of spans) out = out.slice(0, s) + out.slice(s, e).replace(/[^\n]/g, ' ') + out.slice(e);
  return out;
}
const isTest = (r: string) => /\.test\.tsx?$/.test(r) || r.startsWith('ask/accept/') || r.includes('/test/');
// A test file's text is read only by the second rule's /journal\/testing/ (and dropped there), so only a test file that can match it pays for the
// comment strip: stripping only removes matches, never adds one.
const ALL = walk(SRC).map((p) => {
  const r = rel(p), raw = readFileSync(p, 'utf8');
  return { r, text: !isTest(r) || /journal\/testing/.test(raw) ? code(raw) : raw };
});
const prod = ALL.filter((f) => !isTest(f.r));
const holders = (re: RegExp, among = prod) => among.filter((f) => re.test(f.text)).map((f) => f.r).sort();

/** The door sends of a file and where the `go` callback sits in their arguments (`sendJ(fields, call, onAdmit)`,
 *  `sendHeld(g, op, go, lease, then)`, `sendDecision(kind, rid, gate, go)`), with the file that defines each. */
const DOOR_SENDS: Record<string, { go: number; file: string; cls: string }> = {
  sendJ: { go: 1, file: 'ask/engine.ts', cls: 'AskEngine' },
  sendHeld: { go: 2, file: 'pages/apps/github/run.ts', cls: 'GitHubRun' },
  sendDecision: { go: 3, file: 'pages/apps/github/run.ts', cls: 'GitHubRun' },
};
const MUTATIONS = new Set(['create', 'turn', 'command', 'interrupt', 'stop', 'confirm', 'answer']);
const isFn = (n: ts.Node): n is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(n) || ts.isFunctionExpression(n);
/** Every use of `name` in a body that is not its own declaration, a parameter name or a property name. */
const usesOf = (body: ts.Node, name: string): ts.Identifier[] => {
  const out: ts.Identifier[] = [];
  const walkN = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      const decl = (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === n;
      const prop = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
      if (!decl && !prop) out.push(n);
    }
    ts.forEachChild(n, walkN);
  };
  walkN(body);
  return out;
};
/** Declarations a fixture sees in place of the real modules: the AgentIO the checker recognizes by name, and the factories that return it. */
const FIXTURE_PRELUDE = 'interface AgentIO { create(...a: any[]): any; turn(...a: any[]): any; command(...a: any[]): any; interrupt(...a: any[]): any; stop(...a: any[]): any; confirm(...a: any[]): any; answer(...a: any[]): any; state(...a: any[]): any }\n'
  + 'declare function liveIO(t: any): AgentIO; declare function makeIO(): AgentIO; declare const A: any, jr: any, a: any, b: any, g: any, op: any, lease: any, f: any, t: any, k: any, r: any, sid: any, rid: any, gate: any, unrelated: any, other: any, then: any, go2: any, arm: any, sent: any;\n';
const PRELUDE_LINES = FIXTURE_PRELUDE.split('\n').length - 1;
let options: ts.CompilerOptions | null = null;
const compilerOptions = (): ts.CompilerOptions => {
  if (options) return { ...options };
  const root = join(SRC, '..');
  const cfg = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  options = { ...parsed.options, noEmit: true, types: [], skipLibCheck: true };
  return { ...options };
};
/** The lib files every fixture program reads (lib.es2023.d.ts and the libs it references), parsed once: they never change, and a
 *  checker only binds a source file, which a later program may share. */
const libFiles = new Map<string, ts.SourceFile | undefined>();
const libDir = dirname(ts.getDefaultLibFilePath({})) + sep;
/** The modules a production file imports (static, dynamic, re-exports, import types), resolved under the tsconfig paths, as src paths. */
const importsOf = (r: string, text: string): string[] => {
  const from = join(SRC, r), out: string[] = [];
  for (const f of ts.preProcessFile(text, true, true).importedFiles) {
    const m = ts.resolveModuleName(f.fileName, from, compilerOptions(), ts.sys).resolvedModule;
    if (m && !m.isExternalLibraryImport) out.push(rel(m.resolvedFileName));
  }
  return out;
};
/** A file every other file sees without importing it: a global script, or one that declares a global or augments a module. */
const seenEverywhere = (r: string, text: string): boolean =>
  /\bdeclare\s+(global|module)\b/.test(text) || !ts.isExternalModule(ts.createSourceFile(join(SRC, r), text, ts.ScriptTarget.Latest, false));
/** The production files an AgentIO-typed value can occur in: the files that name AgentIO and every file whose imports reach one of them
 *  (a type comes into a module only through its imports, or from a file seen everywhere: if one of those names AgentIO, every file).
 *  The type scans read only these; the others cannot hold an AgentIO, which test `reach` pins. Without it, a program over every
 *  production file with a type for every expression needed more than the 2 GB heap a vitest worker gets in an 8 GB scope. */
let reachMemo: { files: ReadonlySet<string>; deps: ReadonlyMap<string, readonly string[]>; global: readonly string[] } | null = null;
const reach = () => {
  if (reachMemo) return reachMemo;
  const deps = new Map(prod.map((f) => [f.r, importsOf(f.r, f.text)] as const));
  const global = prod.filter((f) => seenEverywhere(f.r, f.text)).map((f) => f.r);
  const names = (r: string) => /\bAgentIO\b/.test(prod.find((f) => f.r === r)!.text);
  const files = new Set(global.some(names) ? prod.map((f) => f.r) : prod.filter((f) => names(f.r)).map((f) => f.r));
  for (let grew = true; grew;) { grew = false; for (const f of prod) if (!files.has(f.r) && deps.get(f.r)!.some((d) => files.has(d))) { files.add(f.r); grew = true; } }
  return (reachMemo = { files, deps, global });
};
const reachProd = () => prod.filter((f) => reach().files.has(f.r));
/** A program over those files (and the files seen everywhere, so every type there is what the whole Hub makes it), for symbol and type
 *  questions. */
let realProgram: ts.Program | null = null;
const realChecker = (): ts.Program => {
  if (realProgram) return realProgram;
  const roots = [...new Set([...reach().files, ...reach().global])].map((r) => join(SRC, r));
  realProgram = ts.createProgram(roots, compilerOptions());
  return realProgram;
};
/** A one-file program over a fixture (with the prelude above it). */
const fixtureProgram = (file: string, text: string): ts.Program => {
  const name = join(SRC, file);
  const full = FIXTURE_PRELUDE + text;
  const opts = { ...compilerOptions(), noResolve: true, types: [], lib: ['lib.es2023.d.ts'] };
  const host = ts.createCompilerHost(opts);
  const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host), getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (n) => n === name || fileExists(n);
  host.readFile = (n) => (n === name ? full : readFile(n));
  host.getSourceFile = (n, lang, onError, shouldCreate) => {
    if (n === name) return ts.createSourceFile(n, full, lang, true, ts.ScriptKind.TSX);
    if (!n.startsWith(libDir)) return getSourceFile(n, lang, onError, shouldCreate);
    if (!libFiles.has(n)) libFiles.set(n, getSourceFile(n, lang, onError, shouldCreate));
    return libFiles.get(n);
  };
  return ts.createProgram([name], opts, host);
};
/** The program, source file and type questions of one file: a fixture's own one-file program, or the real one. */
function open(file: string, text: string, program?: ts.Program) {
  const fixture = !program && !prod.some((f) => f.r === file && f.text === text);
  const prog = program ?? (fixture ? fixtureProgram(file, text) : realChecker());
  const sf = prog.getSourceFile(join(SRC, file));
  if (!sf) return null;
  const tc = prog.getTypeChecker();
  const shift = fixture ? PRELUDE_LINES : 0;
  const at = (n: ts.Node) => file + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 - shift);
  const hasIo = (t: ts.Type): boolean => {
    if (t.aliasSymbol?.name === 'AgentIO' || t.getSymbol()?.name === 'AgentIO') return true;
    if (t.isUnionOrIntersection()) return t.types.some(hasIo);
    return false;
  };
  const isIo = (e: ts.Node): boolean => hasIo(tc.getTypeAtLocation(e));
  return { sf, tc, at, isIo };
}
/** The journaled AgentIO mutations of a source that are not inside the go argument (at its position) of a door send called on
 *  `this` inside the class that defines it, plus the forwarders that do not hand their go on once, unchanged, and nowhere else.
 *  The receivers are found by TYPE (the type checker's AgentIO, through aliases, parentheses, assertions, assignments, typed
 *  properties and parameters); an element access whose name is not a literal is itself a violation. Every violation text names the
 *  rule (`mutation`, `computed`, `forwarder`) so a fixture can assert why it failed. What else may touch an AgentIO is `ioSites`'s
 *  business (a fixed allowlist), not this function's. `program`: the one the file belongs to (the real one when omitted and
 *  `text` is the file's own). `seen.io` counts the AgentIO mutation accesses the types found, so a scan that resolved no type
 *  (and so found nothing) cannot pass for a clean one. */
export function sendBoundary(file: string, text: string, program?: ts.Program, seen?: { io: number }): string[] {
  const cx = open(file, text, program);
  if (!cx) return [file + ': not in the program'];
  const { sf, tc, at, isIo } = cx;
  const out: string[] = [];
  const classOf = (n: ts.Node): ts.ClassLikeDeclaration | undefined => { for (let p = n.parent; p; p = p.parent) if (ts.isClassLike(p)) return p; return undefined; };
  const defines = (c: ts.ClassLikeDeclaration | undefined, name: string): boolean => !!c && c.name?.text === DOOR_SENDS[name]!.cls && c.members.some((m) => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === name);
  const insideGo = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent, child: ts.Node = n; p; child = p, p = p.parent) {
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const send = DOOR_SENDS[p.expression.name.text];
        if (send && file === send.file && p.arguments[send.go] === child && isFn(child) && defines(classOf(p), p.expression.name.text)) return true;
      }
      // an unjournaled engine's plain `else { ... }` branch of `if (this.jr)`
      if (ts.isIfStatement(p) && p.expression.getText(sf) === 'this.jr' && p.elseStatement === child && file === 'ask/engine.ts') return true;
    }
    return false;
  };
  const flag = (n: ts.Node, rule: string, what: string) => { if (!insideGo(n)) out.push(at(n) + ' ' + rule + ' ' + what + ': a journaled call outside the go of a door send'); };
  const forwarders = new Set<string>();
  const visit = (n: ts.Node) => {
    // io.turn(...), io.turn as a value, io['turn'], io[name]
    if (ts.isPropertyAccessExpression(n) && MUTATIONS.has(n.name.text) && isIo(n.expression)) { if (seen) seen.io++; flag(n, 'mutation', n.name.text); }
    if (ts.isElementAccessExpression(n) && isIo(n.expression)) {
      const arg = n.argumentExpression, at2 = tc.getTypeAtLocation(arg);
      if (ts.isStringLiteralLike(arg)) { if (MUTATIONS.has(arg.text)) flag(n, 'mutation', arg.text); }
      else if (at2.isStringLiteral()) { if (MUTATIONS.has(at2.value)) flag(n, 'mutation', at2.value); }
      else flag(n, 'computed', 'an element access of an AgentIO by a name that is not a literal');
    }
    // the forwarders
    if ((ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.body && DOOR_SENDS[n.name.text] && file === DOOR_SENDS[n.name.text]!.file) {
      const name = n.name.text;
      forwarders.add(name);
      const body = n.body;
      const params = n.parameters.map((q) => q.name.getText(sf));
      const goName = params[DOOR_SENDS[name]!.go];
      const calls: ts.CallExpression[] = [];
      const collect = (m: ts.Node) => { if (ts.isCallExpression(m)) calls.push(m); ts.forEachChild(m, collect); };
      collect(body);
      const bad = (why: string) => out.push(at(n) + ' forwarder ' + name + ': ' + why);
      if (!goName) return void bad('no go parameter at its position');
      if (name === 'sendJ') {
        // call (the go handed in) is used once, inside the go the door receives; that go is used once, as the door's post argument
        const posts = calls.filter((c) => c.expression.getText(sf) === 'jr.j.post');
        const callUses = usesOf(body, goName);
        const goDecl: ts.VariableDeclaration[] = [];
        const findGo = (m: ts.Node) => { if (ts.isVariableDeclaration(m) && m.name.getText(sf) === 'go' && m.initializer && isFn(m.initializer)) goDecl.push(m); ts.forEachChild(m, findGo); };
        findGo(body);
        const goUses = usesOf(body, 'go');
        const callIn = callUses.length === 1 && goDecl.length === 1 && callUses[0]!.getStart(sf) >= goDecl[0]!.initializer!.getStart(sf) && callUses[0]!.getEnd() <= goDecl[0]!.initializer!.getEnd();
        const goOnce = goUses.length === 1 && posts.length === 1 && posts[0]!.arguments[1] === goUses[0];
        if (!callIn || !goOnce) bad('go is not the call handed in, used once, passed to the door unchanged and nowhere else');
      } else {
        const target = name === 'sendHeld' ? 'A.held.post' : 'this.sendHeld';
        const idx = name === 'sendHeld' ? 1 : 2;
        const posts = calls.filter((c) => c.expression.getText(sf) === target);
        const uses = usesOf(body, goName);
        if (posts.length !== 1 || uses.length !== 1 || posts[0]!.arguments[idx] !== uses[0]) bad('go is not passed once, unchanged, to ' + target + ' and nowhere else');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const [name, d] of Object.entries(DOOR_SENDS)) if (d.file === file && !forwarders.has(name)) out.push(file + ': forwarder ' + name + ' is missing');
  return out;
}

/** Every reference to AgentIO that is not the plain receiver of one of its members: its type names (an annotation, a heritage clause,
 *  a generic constraint or argument, an indexed type, an alias), its import, and every expression of its type (a value that is
 *  assigned, passed, returned, stored, cast, destructured, spread or awaited). Each is a signature: the file, the node and its parent
 *  kind, and the parent's text (whitespace folded, cut at 100 characters). A receiver of a member is not a site: a journaled
 *  member is judged by sendBoundary (inside a go or not), the others cannot send. */
export function ioSites(file: string, text: string, program?: ts.Program): Array<{ sig: string; at: string }> {
  // One type-checked walk per (file, text): the scans below ask for the same file's sites several times (a site beyond the list, a stale
  // one, and the three scans of 12d-stale). A caller-supplied program is its own question and is never cached.
  if (program) return ioSitesOf(file, text, program);
  const key = file + '\0' + text;
  let got = SITES_OF.get(key);
  if (!got) SITES_OF.set(key, (got = ioSitesOf(file, text)));
  return got.map((x) => ({ ...x }));
}
const SITES_OF = new Map<string, Array<{ sig: string; at: string }>>();
function ioSitesOf(file: string, text: string, program?: ts.Program): Array<{ sig: string; at: string }> {
  const cx = open(file, text, program);
  if (!cx) return [{ sig: file + '::not in the program', at: file }];
  const { sf, at, isIo } = cx;
  const out: Array<{ sig: string; at: string }> = [];
  const norm = (n: ts.Node) => n.getText(sf).replace(/\s+/g, ' ').slice(0, 100);
  const add = (n: ts.Node, kind: string) => out.push({ sig: file + '::' + kind + '@' + ts.SyntaxKind[n.parent.kind] + '::' + norm(n.parent), at: at(n) });
  const isNamePosition = (n: ts.Node): boolean => {
    const p = n.parent;
    return (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isTypeReferenceNode(p) && p.typeName === n) || ts.isImportSpecifier(p)
      || ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isInterfaceDeclaration(p)
        || ts.isClassDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name === n)
      || ts.isExpressionWithTypeArguments(p) || ts.isQualifiedName(p) || ts.isTypeParameterDeclaration(p);
  };
  const visit = (n: ts.Node) => {
    if (ts.isImportSpecifier(n) && n.name.text === 'AgentIO') add(n, 'import');
    else if (ts.isTypeReferenceNode(n) && /(^|\.)AgentIO$/.test(n.typeName.getText(sf))) add(n, 'type');
    else if (ts.isExpressionWithTypeArguments(n) && /(^|\.)AgentIO$/.test(n.expression.getText(sf))) add(n, 'heritage');
    else if (ts.isExpression(n) && !ts.isOmittedExpression(n) && !isNamePosition(n) && !ts.isParenthesizedExpression(n.parent) && !ts.isNonNullExpression(n.parent) && isIo(n)) {
      const p = n.parent;
      const receiver = (ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isElementAccessExpression(p) && p.expression === n);
      if (!receiver) add(n, 'value');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
/** The sites of a file beyond what `allow` (signature -> exact count) names, each as a violation naming the rule `site`. */
export function siteViolations(file: string, text: string, allow: Readonly<Record<string, number>>, program?: ts.Program): string[] {
  const used: Record<string, number> = {};
  const out: string[] = [];
  for (const x of ioSites(file, text, program)) {
    used[x.sig] = (used[x.sig] ?? 0) + 1;
    if (used[x.sig]! > (allow[x.sig] ?? 0)) out.push(x.at + ' site ' + x.sig + ': an AgentIO reference outside the named sites');
  }
  return out;
}
/** The allowed sites that the file no longer has (a stale list). */
export function staleSites(file: string, text: string, allow: Readonly<Record<string, number>>, program?: ts.Program): string[] {
  const used: Record<string, number> = {};
  for (const x of ioSites(file, text, program)) used[x.sig] = (used[x.sig] ?? 0) + 1;
  return Object.entries(allow).filter(([sig, n]) => sig.startsWith(file + '::') && (used[sig] ?? 0) < n).map(([sig]) => file + ' stale ' + sig);
}

/** The whole scan: the sites beyond `allow` and the allowed sites that are gone, over the given files. */
export function scanSites(allow: Readonly<Record<string, number>>, files: ReadonlyArray<{ r: string; text: string }>): string[] {
  const bad: string[] = [];
  for (const f of files) {
    bad.push(...siteViolations(f.r, f.text, allow));
    bad.push(...staleSites(f.r, f.text, allow));
  }
  return bad;
}

/** THE NAMED SITES: every reference to AgentIO in a production file, by signature (file::node@parent kind::parent text) and the exact number of times it occurs.
 *  A reference that is not listed here, or listed fewer times than it occurs, fails 12d: add a site only when the new code is one of the places an AgentIO may legitimately
 *  go (its type, its guard, its factory, its hand-over to the engine / run / journal) and never to let a journaled call out of a door go. A listed site that no longer occurs fails
 *  too (a stale list). A member of an AgentIO used as a receiver is not a site (sendBoundary judges it). */
const IO_SITES: Record<string, number> = {
  // ask/activity.ts
  "ask/activity.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/activity.ts::type@Parameter::io: AgentIO": 1,
  // ask/data.ts
  "ask/data.ts::type@FunctionDeclaration::export function liveIO(target: Target): AgentIO { // The target is read ONCE: every request of this ": 1,
  "ask/data.ts::type@VariableDeclaration::io: AgentIO = { health: () => api(routes.health, base), version: () => api(routes.version, base), au": 1,
  "ask/data.ts::value@CallExpression::withDest(io, frozen)": 1,
  "ask/data.ts::value@ReturnStatement::return withDest(io, frozen);": 1,
  // ask/engine.ts
  "ask/engine.ts::import@NamedImports::{ AgentIO, StreamHandlers }": 1,
  "ask/engine.ts::type@Parameter::io: AgentIO": 1,
  "ask/engine.ts::type@PropertyDeclaration::private readonly io: AgentIO;": 1,
  "ask/engine.ts::value@BinaryExpression::this.io = this.jr ? guardIO(io, { acct: slot.account, container: slot.computer }) : io": 2,
  "ask/engine.ts::value@CallExpression::guardIO(io, { acct: slot.account, container: slot.computer })": 1,
  "ask/engine.ts::value@CallExpression::jr.j.check(this.io, jr.handle, key, alive, admitted)": 1,
  "ask/engine.ts::value@CallExpression::jr.j.checkCreate(this.io, jr.handle, rec.r, rec.k1, alive)": 1,
  "ask/engine.ts::value@CallExpression::jr.j.peekTurn(this.io, jr.handle, rec.s, rec.r, k2)": 1,
  "ask/engine.ts::value@CallExpression::this.jr.j.check(this.io, this.jr.handle, k2)": 1,
  // A start's create key read back for the start provider (checkKey: the journal's check while it holds the entry, else a read).
  "ask/engine.ts::value@CallExpression::this.jr.j.check(this.io, this.jr.handle, k, alive)": 1,
  "ask/engine.ts::value@CallExpression::this.jr.j.checkCreate(this.io, this.jr.handle, this.slot.realm, k, alive)": 1,
  "ask/engine.ts::value@CallExpression::this.jr.j.observe(this.io, { type: 'command', r: this.rec.r, sid: this.rec.s, kind: cf.kind, ids: cf": 1,
  "ask/engine.ts::value@CallExpression::this.jr.j.observe(this.io, { type: 'gate', r: this.rec.r, sid: this.rec.s, gate: { id: x.g.gate.id, ": 1,
  "ask/engine.ts::value@ConditionalExpression::this.jr ? guardIO(io, { acct: slot.account, container: slot.computer }) : io": 2,
  "ask/engine.ts::value@ExpressionStatement::this.io = this.jr ? guardIO(io, { acct: slot.account, container: slot.computer }) : io;": 1,
  "ask/engine.ts::value@PropertyAssignment::io: this.io": 1,
  // The Recent clear's per-candidate read-only state check (idleKeys reads GET /sessions/{id}/state through the engine's guarded io, never a journaled call)
  "ask/engine.ts::value@CallExpression::idleKeys(this.io, clearCandidates(env), same)": 1,
  "ask/engine.ts::value@CallExpression::idleKeys(this.io, plan.keys, same)": 1,
  // ask/forkRecovery.ts: the engine-free recovery of a pending fork (its reads and retires go through the journal's readFork / retireFork)
  "ask/forkRecovery.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/forkRecovery.ts::type@PropertySignature::io: AgentIO;": 1,
  "ask/forkRecovery.ts::value@CallExpression::this.d.j.readFork(this.d.io, scope, scope.r, k1, null)": 3,
  "ask/forkRecovery.ts::value@CallExpression::j.readFork(io, scope, r, k1, hold)": 1,
  "ask/forkRecovery.ts::value@CallExpression::j.retireFork(io, hold, scope, r, k1, rec.fk as NonNullable<JRec['fk']>)": 1,
  // ask/recentClear.ts: the Recent clear's read-only state reads (idleKeys); no journaled call
  "ask/recentClear.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/recentClear.ts::type@Parameter::io: AgentIO": 1,
  // ask/registry.ts: the shared connection handed to the engine-free fork recovery
  "ask/registry.ts::value@VariableDeclaration::io = sharedIO(slotKey(slot), slot, target)": 1,
  // ask/fake.ts
  "ask/fake.ts::heritage@HeritageClause::implements AgentIO": 1,
  "ask/fake.ts::import@NamedImports::{ AgentIO, AttachBody, StreamHandlers }": 1,
  // ask/journal/door.ts
  "ask/journal/door.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/journal/door.ts::type@TypeParameter::T extends AgentIO": 1,
  "ask/journal/door.ts::type@TypeOperator::keyof AgentIO": 1,
  // ask/journal/index.ts
  "ask/journal/index.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/journal/index.ts::type@Parameter::io: AgentIO": 7,
  "ask/journal/index.ts::value@CallExpression::this.recover.check(io, h, k, alive, readOnly)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.checkCreate(io, h, realm, k1, alive)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.checkById(io, h, k)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.peekTurn(io, h, sid, realm, k)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.observe(io, ev)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.readFork(io, scope, realm, k1, hold)": 1,
  "ask/journal/index.ts::value@CallExpression::this.recover.retireFork(io, hold, scope, realm, k1, fk)": 1,
  // ask/journal/recover.ts
  "ask/journal/recover.ts::import@NamedImports::{ AgentIO }": 1,
  "ask/journal/recover.ts::type@Parameter::io: AgentIO": 8,
  "ask/journal/recover.ts::value@CallExpression::destOf(io)": 7,
  "ask/journal/recover.ts::value@CallExpression::this.byKey(io, h, k, alive, readOnly)": 1,
  // ask/registry.ts
  "ask/registry.ts::import@NamedImports::{ liveIO, readStore, withFixtureDest, type AgentIO }": 1,
  "ask/registry.ts::type@FunctionDeclaration::function fakeFor(slot: Slot): AgentIO { const fx = askfx(); const k = slotKey(slot) + '|' + fx; cons": 1,
  "ask/registry.ts::type@FunctionDeclaration::function ioFor(slot: Slot, target: Target): AgentIO { if (__HUB_FIXTURES__ && fixtureModeActive()) r": 1,
  "ask/registry.ts::type@FunctionDeclaration::function sharedIO(k: string, slot: Slot, target: Target): AgentIO { let io = ios.get(k); if (!io) { ": 1,
  // ios (the shared connections) and fakes: in fixtures, the one scripted agent per slot and
  // scenario, kept so every engine of the slot reaches the same fake world. Never a live connection (fakeFor runs only under
  // __HUB_FIXTURES__ && fixtureModeActive()): an engine's journaled calls still pass its guardIO door, then reach this fake, never
  // a live agent.
  "ask/registry.ts::type@NewExpression::new Map<string, AgentIO>()": 2,
  "ask/registry.ts::value@VariableDeclaration::had = fakes.get(k)": 1,
  "ask/registry.ts::value@IfStatement::if (had) return had;": 1,
  "ask/registry.ts::value@ReturnStatement::return had;": 1,
  "ask/registry.ts::value@BinaryExpression::io = ioFor(slot, target)": 2,
  // keepIO: the one store of a shared connection (ios.set) with the server it was made for (ioServers); its callers hand it the io they just made
  "ask/registry.ts::type@Parameter::io: AgentIO": 1,
  "ask/registry.ts::value@CallExpression::ios.set(k, io)": 1,
  "ask/registry.ts::value@CallExpression::keepIO(k, slot, io)": 2,
  "ask/registry.ts::value@CallExpression::readActivity(sharedIO(k, a.slot, a.target), recs)": 1,
  "ask/registry.ts::value@ExpressionStatement::io = ioFor(slot, target);": 1,
  "ask/registry.ts::value@NewExpression::new AskEngine(slot, io, journal.view(ref.computer, ref.sid), realClock, { sid: ref.sid, journal: { j": 1,
  "ask/registry.ts::value@NewExpression::new AskEngine(slot, io, store, realClock, { journal: { j: journal, handle }, usage })": 1,
  "ask/registry.ts::value@PrefixUnaryExpression::!io": 1,
  "ask/registry.ts::value@ReturnStatement::return fakeFor(slot);": 1,
  "ask/registry.ts::value@ReturnStatement::return io;": 1,
  "ask/registry.ts::value@ReturnStatement::return liveIO(target);": 1,
  "ask/registry.ts::value@VariableDeclaration::io = ioFor(slot, target)": 2,
  "ask/registry.ts::value@VariableDeclaration::io = ios.get(k)": 1,
  // pages/apps/github/GitHubPane.tsx
  "pages/apps/github/GitHubPane.tsx::value@CallExpression::GitHubRun.resume(liveIO(on), { computer: on.container.id, account: core.account, realm: core.realm, ": 1,
  "pages/apps/github/GitHubPane.tsx::value@CallExpression::GitHubRun.resume(liveIO(run.on), { computer: run.on.container.id, account: run.account, realm: core.": 1,
  "pages/apps/github/GitHubPane.tsx::value@NewExpression::new GitHubRun(liveIO(on), { computer: on.container.id, account: core.account, realm: core.realm, adm": 1,
  // pages/apps/github/run.ts
  "pages/apps/github/run.ts::import@NamedImports::{ AgentIO, StreamHandlers }": 1,
  "pages/apps/github/run.ts::type@Parameter::io: AgentIO": 2,
  "pages/apps/github/run.ts::type@PropertyDeclaration::private readonly io: AgentIO;": 1,
  "pages/apps/github/run.ts::value@BinaryExpression::this.io = A.guardIO(io, { acct: input.account, container: input.computer })": 2,
  "pages/apps/github/run.ts::value@CallExpression::A.guardIO(io, { acct: input.account, container: input.computer })": 1,
  "pages/apps/github/run.ts::value@ExpressionStatement::this.io = A.guardIO(io, { acct: input.account, container: input.computer });": 1,
  "pages/apps/github/run.ts::value@NewExpression::new GitHubRun(io, input, clock)": 1,
  // pages/apps/github/testing.ts
  "pages/apps/github/testing.ts::import@NamedImports::{ AgentIO, StreamHandlers }": 1,
  "pages/apps/github/testing.ts::type@AsExpression::{} as AgentIO": 1,
  "pages/apps/github/testing.ts::type@TypeOperator::keyof AgentIO": 1,
  "pages/apps/github/testing.ts::value@CallExpression::A.withFixtureDest(raw, COMPUTER)": 1,
  "pages/apps/github/testing.ts::value@NewExpression::new Proxy({} as AgentIO, { get: (_t, m: string) => { if (m === 'alive') return () => alive; if (m ==": 1,
  "pages/apps/github/testing.ts::value@VariableDeclaration::io = A.withFixtureDest(raw, COMPUTER)": 1,
  "pages/apps/github/testing.ts::value@VariableDeclaration::raw = new Proxy({} as AgentIO, { get: (_t, m: string) => { if (m === 'alive') return () => alive; if": 1,
};

describe('journal conformance', () => {
  it('1: the journal\'s storage keys appear only in journal/storage.ts (and the shared.js rows)', () => {
    for (const key of ['hub_ai_req_v1', 'hub_ai_mig_v1', 'hub_ai_lease_v1', 'hub_ai_journal_v1']) {
      // core/registry.ts: the fixture copy of shared.js's rows; term/env/persist.ts: the terminal store's rows for the three kept keys;
      // term/app/live-wire.ts: SEAM_JOURNAL_KEYS, the keys its store seam leaves to the journal.
      const term = key === 'hub_ai_mig_v1' ? [] : ['term/app/live-wire.ts', 'term/env/persist.ts'];
      expect(holders(new RegExp(key)), key).toEqual(['ask/journal/storage.ts', 'core/registry.ts', ...term]);
    }
  });
  it('2: outside ask/journal/ code reaches the journal only through its index; journal/testing is named only by tests and testing.ts files (io.ts re-exports the two page helpers from journal/pageReset, so the ship build never reaches a test-input module)', () => {
    const bad: string[] = [];
    for (const f of prod) {
      if (f.r.startsWith('ask/journal/')) continue;
      for (const m of f.text.matchAll(/from\s+['"]([^'"]*journal[^'"]*)['"]/g)) {
        const spec = m[1]!;
        if (/\/journal$/.test(spec) || spec === './journal') continue;
        if (f.r === 'ask/io.ts' && spec === './journal/pageReset') continue;
        bad.push(f.r + ' -> ' + spec);
      }
    }
    expect(bad).toEqual([]);
    const testing = holders(/journal\/testing/, ALL).filter((r) => !isTest(r) && !r.endsWith('/testing.ts'));
    expect(testing).toEqual([]);
  });
  it('bindDestForTests and resetPageForTests are named only by test files, testing.ts files, ask/io.ts, journal/testing.ts and journal/pageReset.ts', () => {
    const outside = holders(/\b(bindDestForTests|resetPageForTests)\b/).filter((r) => r !== 'ask/io.ts' && r !== 'ask/journal/testing.ts' && r !== 'ask/journal/pageReset.ts' && !r.endsWith('/testing.ts'));
    expect(outside).toEqual([]);
  });
  it('3: the proof constructors and the removal door are used only where they belong', () => {
    const only = (re: RegExp, files: string[]) => expect(holders(re), String(re)).toEqual(files.sort());
    only(/\b(fromVerdict|fromCreateKept|fromDismissal|fromTurnKept)\b/, ['ask/journal/index.ts', 'ask/journal/proof.ts', 'ask/journal/settle.ts']);
    only(/\bmintKept\b/, ['ask/journal/proof.ts', 'ask/journal/records.ts']);
    only(/\bmintFn\b|\bmintForTests\b/, ['ask/journal/door.ts', 'ask/journal/held.ts', 'ask/journal/testing.ts']);
    only(/\bneverLeft\b/, ['ask/journal/door.ts', 'ask/journal/entries.ts', 'ask/journal/proof.ts']);
  });
  it('the by-key members are named only where they are declared, faked, guarded and called; only recover.ts calls a retire', () => {
    expect(holders(/\b(createKeyGet|createKeyRetire|turnByKey|turnKeyRetire|commandByKey|commandKeyRetire)\b/))
      .toEqual(['ask/data.ts', 'ask/fake.ts', 'ask/journal/door.ts', 'ask/journal/recover.ts']);
    const calls = (f: string) => prod.find((x) => x.r === f)!.text.match(/\bio\.(createKeyRetire|turnKeyRetire|commandKeyRetire)\(/g) ?? [];
    // byKey's three (create, turn, command) and retireFork's one (a fork's create key, under its target lock T).
    expect(calls('ask/journal/recover.ts')).toHaveLength(4);
    for (const f of ['ask/engine.ts', 'ask/journal/index.ts', 'ask/journal/settle.ts', 'ask/journal/door.ts']) expect(calls(f), f).toEqual([]);
  });
  it('the keyed turn peek is a read and only a read, and only the engine asks it', () => {
    // Named only where it is declared (the journal's front and its recovery) and asked (the engine's reopen and adoption).
    expect(holders(/\bpeekTurn\b/)).toEqual(['ask/engine.ts', 'ask/journal/index.ts', 'ask/journal/recover.ts']);
    const rec = prod.find((x) => x.r === 'ask/journal/recover.ts')!.text;
    const at = rec.indexOf('async peekTurn(');
    expect(at, 'peekTurn is declared in recover.ts').toBeGreaterThan(0);
    const body = rec.slice(at, rec.indexOf('private async byKey(', at));
    // One read by key; it never retires, settles, admits, notes a reference or writes a store.
    expect(body.match(/\bio\.[A-Za-z]+\(/g)).toEqual(['io.turnByKey(']);
    expect(body).not.toMatch(/\b(settler|entries|door|records|noteRef|settle|KeyRetire|admit)\b/);
  });
  it('5: the journaled routes carry the tickets and no refuses list, so core cannot stamp notApplied before the classifier runs', () => {
    const data = prod.find((f) => f.r === 'ask/data.ts')!.text;
    for (const name of ['create', 'turn', 'command', 'confirm', 'answer']) {
      const m = new RegExp(`\\n  ${name}: defineRoute[^\\n]*(?:\\n(?!  \\w+:)[^\\n]*)*`).exec(data);
      expect(m, name).not.toBeNull();
      // The journal's ticket is always required; the lease member rides beside it where a session may need one.
      expect(m![0], name).toMatch(name === 'confirm' || name === 'answer' ? /tickets:\s*DECIDED/ : name === 'create' ? /tickets:\s*\{\s*journal:\s*'required',\s*lease:/ : /tickets:\s*JOURNALED/);
      expect(m![0], name).not.toMatch(/refuses/);
    }
    const attach = /\n  attach: defineRoute[\s\S]*?\}\),/.exec(data)![0];
    expect(attach, 'attach is not journaled').not.toMatch(/JOURNALED|journal:/);
    expect(attach, 'attach needs the lease ticket').toMatch(/tickets:\s*\{\s*lease:\s*'required'\s*\}/);
  });
  it('6: dismissal() is called only from the Dismiss handlers (the engine\'s dismissRow and dismissDecision)', () => {
    expect(holders(/\bdismissal\(\)/)).toEqual(['ask/engine.ts', 'ask/journal/proof.ts', 'ask/journal/testing.ts']);
  });
  it('7: AskEngine keeps no reference to its unguarded io', () => {
    const eng = prod.find((f) => f.r === 'ask/engine.ts')!.text;
    expect(eng).toMatch(/this\.io\s*=\s*this\.jr\s*\?\s*guardIO\(io,/);
    expect(eng.match(/this\.\w+\s*=\s*io\b/g) ?? []).toEqual([]);
  });
  it('8: claimTickets(\'journal\' appears only in journal/door.ts', () => {
    expect(holders(/claimTickets\(\s*['"]journal['"]/)).toEqual(['ask/journal/door.ts']);
  });
  it('9: hub_ai_mig_v1 appears only in journal/storage.ts', () => {
    expect(holders(/hub_ai_mig_v1/)).toEqual(['ask/journal/storage.ts', 'core/registry.ts']);
  });
  it('10: withDest( and withFixtureDest( are called only in ask/data.ts, registry.ts (fakeFor), journal/testing.ts, journal/pageReset.ts and test helpers; destOf( only in data.ts, door.ts, recover.ts', () => {
    const ok = (r: string) => r === 'ask/data.ts' || r === 'ask/registry.ts' || r === 'ask/journal/testing.ts' || r === 'ask/journal/pageReset.ts' || r.endsWith('/testing.ts');
    expect(holders(/\b(withDest|withFixtureDest)\(/).filter((r) => !ok(r))).toEqual([]);
    expect(holders(/\bdestOf\(/).filter((r) => r.startsWith('ask/') || r.startsWith('pages/apps/github/'))).toEqual(['ask/data.ts', 'ask/journal/door.ts', 'ask/journal/recover.ts']);
  });
  it('11: held.admit( and held.post( are called only by the GitHub run', () => {
    expect(holders(/\bheld\.(admit|post)\(/)).toEqual(['pages/apps/github/run.ts']);
  });
  it('12: only ask/data.ts names the journaled routes outside ask/journal/', () => {
    expect(holders(/\broutes\.(create|turn|command|confirm|answer)\b/).filter((r) => (r.startsWith('ask/') || r.startsWith('pages/apps/github/')) && r !== 'ask/data.ts' && !r.startsWith('ask/journal/'))).toEqual([]);
  });
  // Order matters for the heap (not for what is proven): the fixture-only checks (12c, 12e) run BEFORE the program over every production
  // file exists, so their one-file programs never sit on top of it; the whole-program scans (12b, 12d, 12d-stale) come last of the
  // checker tests. Under the default 4 GB heap the old order (12b first) ran out of memory in 12c.
  it('the boundary check rejects the arrangements it exists to catch, each for its own reason', () => {
    const J = 'sendJ(f, call) { const go = (t) => call([t]); return jr.j.post(a, go); }';
    const H = 'sendHeld(g, op, go, lease, then) { void A.held.post(a, go); }';
    const eng = (members: string) => 'class AskEngine { io!: AgentIO; agent!: AgentIO; ' + J + ' ' + members + ' }';
    const gh = (members: string) => 'class GitHubRun { io!: AgentIO; ' + H + ' sendDecision(kind, rid, gate, go) { this.sendHeld(g, op, go, lease, f); } ' + members + ' }';
    const GH = 'pages/apps/github/run.ts';
    const v = (src: string, name = 'ask/engine.ts') => sendBoundary(name, src);
    /** The check fails, and one of its violations names the rule (and the mutation, when one is named). */
    const rejects = (src: string, rule: string, what = '', name = 'ask/engine.ts') => {
      const got = v(src, name);
      expect(got.length, src).toBeGreaterThan(0);
      expect(got.some((m) => m.includes(' ' + rule + ' ' + what)), src + ' -> ' + got.join(' | ')).toBe(true);
    };
    // the real shapes pass
    expect(v(eng('f() { this.sendJ(a, (t) => this.io.turn(sid, "x", k, r, undefined, [t])); }'))).toEqual([]);
    expect(v(eng('f() { if (this.jr) { this.sendJ(a, (t) => this.io.turn(a, [t])); } else { arm(); sent = this.io.turn(a); } }'))).toEqual([]);
    expect(v(gh('f() { this.sendHeld(g, op, (t) => this.io.stop(sid, k, r, [t]), lease, then); } g() { return this.sendDecision("confirm", rid, gate, (t) => this.io.confirm(a, b, r, [t])); }'), GH)).toEqual([]);
    // a mutation outside any door send, or beside one
    rejects(eng('f() { this.io.turn(a, b, k, r, undefined, [t]); }'), 'mutation', 'turn');
    rejects(eng('f() { this.sendJ(a, () => 1); this.io.turn(a); }'), 'mutation', 'turn');
    // the io reached by an alias, a bare reference, an element access, a destructuring, a parameter, a factory
    rejects(eng('f() { const agent = this.io; agent.turn(a); }'), 'mutation', 'turn');
    rejects(eng('f() { const send = this.io.turn; send(a); }'), 'mutation', 'turn');
    rejects(eng('f() { this.io["turn"](a); }'), 'mutation', 'turn');
    rejects(eng('f(io: AgentIO) { io.stop(a); }'), 'mutation', 'stop');
    rejects(eng('f() { const x = liveIO(t); x.confirm(a); }'), 'mutation', 'confirm');
    // counterexamples: parentheses, assertions, assignment aliases, typed properties and variables, quoted names, constants
    rejects(eng('f() { (this.io).turn(a); }'), 'mutation', 'turn');
    rejects(eng('f() { const agent = (this.io); agent.turn(a); }'), 'mutation', 'turn');
    rejects(eng('f() { let agent: AgentIO; agent = this.io; agent.turn(a); }'), 'mutation', 'turn');
    rejects(eng('f() { (this.io as AgentIO).turn(a); }'), 'mutation', 'turn');
    rejects(eng('f() { this.agent.answer(a); }'), 'mutation', 'answer');
    rejects(eng('f() { const x: AgentIO = makeIO(); x.create(a); }'), 'mutation', 'create');
    rejects(eng('f() { const name = "turn"; this.io[name](a); }'), 'mutation', 'turn');
    rejects(eng('f(n: string) { this.io[n](a); }'), 'computed');
    // and calls that are not mutations stay free
    expect(v(eng('f() { this.io.state(sid); }'))).toEqual([]);
    // the call at the wrong argument of the door, or in a callback that is not its go
    rejects(eng('f() { this.sendJ(() => this.io.turn(a), unrelated); }'), 'mutation', 'turn');
    rejects(gh('f() { this.sendHeld(g, op, go2, lease, () => this.io.stop(a)); }'), 'mutation', 'stop', GH);
    // a door send that is not this class's own
    rejects(eng('f() { other.sendJ(a, (t) => this.io.turn(a, [t])); }'), 'mutation', 'turn');
    rejects(eng('} class Other { io!: AgentIO; sendJ(a, b) {} f() { this.sendJ(a, (t) => this.io.turn(a, [t])); }'), 'mutation', 'turn');
    // forwarders: go dropped, wrapped, called besides, or used before the door
    const fw = (h: string, d = 'sendDecision(kind, rid, gate, go) { this.sendHeld(g, op, go, lease, f); }') => 'class GitHubRun { ' + h + ' ' + d + ' }';
    rejects(fw('sendHeld(g, op, go, lease, then) { void A.held.post(a, () => go); }'), 'forwarder', 'sendHeld', GH);
    rejects(fw('sendHeld(g, op, go, lease, then) { go(t); return A.held.post(a, go); }'), 'forwarder', 'sendHeld', GH);
    rejects(fw(H, 'sendDecision(kind, rid, gate, go) { this.sendHeld(g, op, (t) => go(t), lease, f); }'), 'forwarder', 'sendDecision', GH);
    rejects(fw('sendHeld(g, op, go, lease, then) { void A.held.post(a, go); go(t); }'), 'forwarder', 'sendHeld', GH);
    rejects('class AskEngine { sendJ(f, call) { call([t]); const go = (t) => call([t]); return jr.j.post(a, go); } }', 'forwarder', 'sendJ');
    rejects('class AskEngine { sendJ(f, call) { const go = (t) => other([t]); return jr.j.post(a, go); } }', 'forwarder', 'sendJ');
    rejects('class AskEngine { sendJ(f, call) { const go = (t) => call([t]); go(t); return jr.j.post(a, go); } }', 'forwarder', 'sendJ');
    // a forwarder that is gone
    rejects('class AskEngine { other() {} }', 'forwarder', 'sendJ is missing');
  }, 120000);
  it('every other way to hold, pass, hide or rebuild an AgentIO is a site, and a site beyond the list fails', { timeout: 120000 }, () => {
    const J = 'sendJ(f, call) { const go = (t) => call([t]); return jr.j.post(a, go); }';
    const base = (members: string, tail = '') => 'class AskEngine { io!: AgentIO; ' + J + ' ' + members + ' }\n' + tail;
    const CLEAN = base('f() { this.sendJ(a, (t) => this.io.turn(sid, "x", k, r, undefined, [t])); this.io.state(sid); } h(x: AgentIO) { return x.state(sid); }');
    const allow: Record<string, number> = {};
    for (const x of ioSites('ask/engine.ts', CLEAN)) allow[x.sig] = (allow[x.sig] ?? 0) + 1;
    expect(Object.keys(allow).length, 'the clean fixture has its own named sites').toBeGreaterThan(0);
    expect(siteViolations('ask/engine.ts', CLEAN, allow), 'the clean fixture passes').toEqual([]);
    // a member read through the receiver adds no site
    expect(siteViolations('ask/engine.ts', base('f() { this.io.state(sid); this.io.health(); }'), allow)).toEqual([]);
    /** The variant adds a site; one violation names it by the text of the code that holds the AgentIO. */
    const missed: string[] = [];
    const adds = (form: string, members: string, tail = '') => {
      const got = siteViolations('ask/engine.ts', base(members, tail), allow);
      if (!got.some((m) => m.includes(' site ') && m.includes(form))) missed.push(form + ' -> ' + (got.join(' | ') || 'nothing'));
    };
    // known reproductions
    adds('agent: any = this.io', 'f() { const agent: any = this.io; agent.turn(a); }');
    adds('T extends AgentIO', 'f<T extends AgentIO>(agent: T) { agent.turn(a); }');
    adds('agent: this.io', 'f() { const { agent: { turn } } = { agent: this.io }; turn(a); }');
    adds('io: this.io', 'f() { ({ io: this.io } as any).io.turn(a); }');
    adds('[this.io]', 'f() { ([this.io] as any[])[0].turn(a); }');
    adds('Promise.resolve<any>(this.io)', 'f() { Promise.resolve<any>(this.io).then(agent => agent.turn(a)); }');
    adds('extends AgentIO', '', 'interface Sub extends AgentIO { x: 1 }');
    adds('{ turn } = this.io', 'f() { let turn: AgentIO["turn"]; ({ turn } = this.io); turn(a); }');
    adds('Pick<AgentIO, "turn">', 'f() { const x: Pick<AgentIO, "turn"> = this.io; x.turn(a); }');
    adds('T extends AgentIO', 'generic<T extends AgentIO>(io: T) { io.turn(a); }');
    adds('agent: any = io', 'erased(io: AgentIO) { const agent: any = io; agent.turn(a); }');
    adds('agent: io', 'nested(io: AgentIO) { const { agent: { turn } } = { agent: io }; turn(a); }');
    adds('Promise.resolve<any>(io)', 'async awaited(io: AgentIO) { (await Promise.resolve<any>(io)).turn(a); }');
    // and the plain forms
    adds('agent = this.io', 'f() { const agent = this.io; agent.state(a); }');
    adds('agent = (this.io)', 'f() { const agent = (this.io); agent.state(a); }');
    adds('this.io as any', 'f() { (this.io as any).turn(a); }');
    adds('...this.io', 'f() { const m = { ...this.io }; m.turn(a); }');
    adds('{ turn } = this.io', 'f() { const { turn } = this.io; turn(a); }');
    adds('{ "turn": send } = this.io', 'f() { const { "turn": send } = this.io; send(a); }');
    adds('help(this.io)', 'f() { help(this.io); }', 'declare function help(x: any): void;');
    adds('return this.io', 'get raw() { return this.io; }');
    adds('[this.io]', 'f() { const arr = [this.io]; arr[0].turn(a); }');
    adds('type Alias = AgentIO', '', 'type Alias = AgentIO;');
    adds('x: D.AgentIO', 'q(x: D.AgentIO) {}');
    adds('{ stop }: AgentIO', 'f({ stop }: AgentIO) { stop(a); }');
    adds('x = liveIO(t)', 'f() { const x = liveIO(t); x.state(a); }');
    adds('this.other = this.io', 'other: any; f() { this.other = this.io; }');
    // a site listed fewer times than it occurs fails; a listed site that is gone is stale
    adds('x: AgentIO', 'h(x: AgentIO) { return x.state(sid); } h2(x: AgentIO) { return x.state(sid); }');
    const gone = base('f() { this.sendJ(a, (t) => this.io.turn(sid, "x", k, r, undefined, [t])); this.io.state(sid); }');
    expect(missed, 'forms that were not reported as a site').toEqual([]);
    expect(staleSites('ask/engine.ts', gone, allow).some((m) => m.includes('x: AgentIO')), 'a listed site that is gone is stale').toBe(true);
  });
  it('reach: the type scans read every file an AgentIO can be in: each file naming it, each file importing one, the door files', { timeout: 180000 }, () => {
    const { files, deps, global } = reach();
    const named = prod.filter((f) => /\bAgentIO\b/.test(f.text)).map((f) => f.r);
    expect(named.filter((r) => !files.has(r)), 'a file naming AgentIO').toEqual([]);
    expect(prod.filter((f) => !files.has(f.r) && deps.get(f.r)!.some((d) => files.has(d))).map((f) => f.r), 'a file importing one').toEqual([]);
    expect(global.filter((r) => named.includes(r)).length === 0 || files.size === prod.length, 'a file seen everywhere names AgentIO: every file').toBe(true);
    for (const r of ['ask/data.ts', 'ask/engine.ts', 'ask/journal/door.ts', 'pages/apps/github/run.ts', ...Object.values(DOOR_SENDS).map((d) => d.file)]) expect(files.has(r), r).toBe(true);
    // the imports were resolved, relative and alias spellings alike (ask/io.ts re-exports data.ts, so every file importing @ask/io is in)
    expect(deps.get('ask/engine.ts')!.includes('ask/data.ts'), 'engine.ts -> data.ts resolved').toBe(true);
    const viaAlias = prod.filter((f) => /\bfrom\s+['"]@ask\/io['"]/.test(f.text)).map((f) => f.r);
    expect(viaAlias.length, 'some file imports @ask/io').toBeGreaterThan(0);
    expect(viaAlias.filter((r) => !files.has(r)), 'a file importing @ask/io').toEqual([]);
    expect(files.size, 'the closure reaches past the seeds').toBeGreaterThan(named.length * 3);
  });
  it('every journaled AgentIO call of every production file sits inside the go of a door send, and the forwarders pass go on unchanged', { timeout: 180000 }, () => {
    const bad: string[] = [];
    const found: Record<string, number> = {};
    for (const f of reachProd()) {
      const seen = { io: 0 };
      bad.push(...sendBoundary(f.r, f.text, undefined, seen));
      if (seen.io) found[f.r] = seen.io;
    }
    expect(bad).toEqual([]);
    // the types resolved: the two sending files show their AgentIO mutations to the scan
    expect(found['ask/engine.ts'] ?? 0, 'the engine\'s AgentIO calls were found by type').toBeGreaterThanOrEqual(5);
    expect(found['pages/apps/github/run.ts'] ?? 0, 'the run\'s AgentIO calls were found by type').toBeGreaterThanOrEqual(3);
    const seen = (r: string) => prod.some((f) => f.r === r && /\.(create|turn|command|interrupt|stop|confirm|answer)\(/.test(f.text));
    expect(seen('ask/engine.ts') && seen('pages/apps/github/run.ts'), 'the scan reads the two files that send').toBe(true);
  });
  it('an AgentIO appears in production code only at the named sites (IO_SITES), each the listed number of times, and none of them is stale', { timeout: 180000 }, () => {
    expect(scanSites(IO_SITES, reachProd())).toEqual([]);
    const files = new Set(Object.keys(IO_SITES).map((k) => k.split('::')[0] ?? ''));
    expect([...files].every((r) => prod.some((f) => f.r === r)), 'every file of the list exists').toBe(true);
    // A file that cannot hold an AgentIO has no site: one the list names there is stale.
    expect([...files].filter((r) => !reach().files.has(r ?? '')), 'a listed file outside the reach (a stale entry)').toEqual([]);
  });
  it('12d-stale: a list with a site the code no longer has (an extra signature, or a count one too high) fails with the stale-entry diagnostic', { timeout: 180000 }, () => {
    const first = Object.keys(IO_SITES)[0]!;
    const extra = scanSites({ ...IO_SITES, 'ask/engine.ts::value@CallExpression::gone(this.io)': 1 }, reachProd());
    expect(extra, 'an extra signature').toEqual(['ask/engine.ts stale ask/engine.ts::value@CallExpression::gone(this.io)']);
    const high = scanSites({ ...IO_SITES, [first]: IO_SITES[first]! + 1 }, reachProd());
    expect(high, 'a count one too high').toEqual([first.split('::')[0] + ' stale ' + first]);
    // and a site the list lacks (a count one too low, a signature removed) fails as a site, not as stale
    const low = scanSites({ ...IO_SITES, [first]: IO_SITES[first]! - 1 }, reachProd());
    expect(low.length, 'a count one too low').toBe(1);
    expect(low[0]).toContain(' site ' + first);
  });
  it('13: the Admission type has exactly the members key and cancel', () => {
    const door = prod.find((f) => f.r === 'ask/journal/door.ts')!.text;
    const m = /export interface Admission\s*\{([^}]*)\}/.exec(door)!;
    const members = m[1]!.split(';').map((x) => x.trim()).filter(Boolean).map((x) => /^(?:readonly\s+)?(\w+)/.exec(x)![1]);
    expect(members.sort()).toEqual(['cancel', 'key']);
  });
  it('`.sent(` is called in pages/apps/github only inside held.ts', () => {
    expect(holders(/\.sent\(/).filter((r) => r.startsWith('pages/apps/github/'))).toEqual(['pages/apps/github/held.ts']);
  });
  it('the run builds no object literal with a step key outside metaBase and readMeta', () => {
    const t = prod.find((f) => f.r === 'pages/apps/github/run.ts')!.text;
    const cut = (src: string, head: RegExp): string => {
      const m = head.exec(src);
      if (!m) throw new Error('not found: ' + head);
      let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0;
      const start = m.index;
      for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
      return src.slice(0, start) + src.slice(i + 1);
    };
    const rest = cut(cut(t, /private metaBase\([^)]*\)[^{]*\{/), /export function readMeta\([^)]*\)[^{]*\{/);
    expect(rest.match(/[{,]\s*step\s*:/g) ?? [], 'a hold meta is built outside metaBase').toEqual([]);
  });
});

// ---- fork recovery: the target lock T, the by-key fence and the account scope ----
/** The text of the function-like member `name` of a source (its signature to its closing brace). */
function member(text: string, name: RegExp): string {
  const m = name.exec(text);
  if (!m) throw new Error('not found: ' + name);
  // The body opens at the first `{` outside the signature's parentheses.
  let i = m.index, paren = 0;
  for (; i < text.length; i++) {
    if (text[i] === '(') paren++;
    else if (text[i] === ')') paren--;
    else if (text[i] === '{' && paren === 0 && i > m.index + m[0].length - 1) break;
  }
  const start = m.index;
  let depth = 0;
  for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
  return text.slice(start, i + 1);
}
const textOf = (r: string): string => prod.find((f) => f.r === r)!.text;
/** Every call of `callee` in a source, with the names of the calls whose function arguments enclose it. */
function enclosingCalls(text: string, callee: RegExp): Array<{ at: number; inside: string[] }> {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Array<{ at: number; inside: string[] }> = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && callee.test(n.expression.getText(sf))) {
      const inside: string[] = [];
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (isFn(p) && p.parent && ts.isCallExpression(p.parent) && p.parent.arguments.includes(p as ts.Expression)) inside.push(p.parent.expression.getText(sf));
      }
      out.push({ at: n.getStart(sf), inside });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
describe('fork recovery conformance', () => {
  it('C1: the fork target lock names are built only in locks.ts (and, for a target with no record yet, by runFork); a record is locked through lockNameOf', () => {
    expect(holders(/\b(forkLockName|badForkLockName)\(/)).toEqual(['ask/engine.ts', 'ask/journal/locks.ts']);
    expect(holders(/\bholdIfFree\(/)).toEqual(['ask/engine.ts', 'ask/forkRecovery.ts', 'ask/journal/locks.ts']);
  });
  it('C2: holdIfFree( is never inside a send, record-lock or post callback (T is only ever tried first)', () => {
    for (const f of prod) {
      for (const c of enclosingCalls(f.text, /(^|\.)holdIfFree$/)) {
        expect(c.inside.filter((n) => /(withRecsLock|withFreeSendLock|\.post|sendJ|withLock)$/.test(n)), `${f.r}@${c.at}`).toEqual([]);
      }
    }
  });
  it('C3: createKeyRetire is called twice in recover.ts - byKey and retireFork - and both run inside withFreeSendLock; byKey fences a fork key before ITS read and again inside the lock', () => {
    const t = textOf('ask/journal/recover.ts');
    expect(t.match(/\bio\.createKeyRetire\(/g)).toHaveLength(2);
    const retireFork = member(t, /async retireFork\(/);
    expect(retireFork.match(/\bio\.createKeyRetire\(/g)).toHaveLength(1);
    for (const c of enclosingCalls(retireFork, /^io\.createKeyRetire$/)) expect(c.inside.some((n) => /withFreeSendLock$/.test(n)), 'retireFork retires inside the lock').toBe(true);
    const byKey = member(t, /private async byKey\(/);
    const calls = enclosingCalls(byKey, /^call$/).filter((c) => byKey.slice(c.at, c.at + 12) === 'call(retire)');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.inside.some((n) => /withFreeSendLock$/.test(n)), 'byKey retires inside the lock').toBe(true);
    const guards = enclosingCalls(byKey, /^forkGuard$/);
    expect(guards.length, 'the guard runs before the read and again under the lock').toBeGreaterThanOrEqual(2);
    expect(guards.some((g) => g.inside.some((n) => /withFreeSendLock$/.test(n)))).toBe(true);
  });
  it('C4: the ForkHold brand is not exported, and holdIfFree is the only place that makes a hold', () => {
    const t = textOf('ask/journal/locks.ts');
    expect(t).toMatch(/declare const forkHoldBrand: unique symbol;/);
    expect(t).not.toMatch(/export\s+(declare\s+)?const\s+forkHoldBrand/);
    expect(holders(/\bas unknown as ForkHold\b|\bas ForkHold\b|<ForkHold>/)).toEqual(['ask/journal/locks.ts']);
    expect(t.match(/as unknown as ForkHold/g)).toHaveLength(1);
  });
  it('C5: dismissFork has no insert path: it rewrites a record it found, and nothing else', () => {
    const body = member(textOf('ask/journal/records.ts'), /dismissFork\(h: string/);
    expect(body).toMatch(/!x \|\| x\.k1 !== k1 \|\| !unresolvedFork\(x\)/);
    expect(body.match(/\bd\[[^\]]*\]\s*=/g)).toHaveLength(1);
    expect(body).toMatch(/d\[id\] = \{ \.\.\.x, dk:/);
  });
  it('C6: endedAsUnavailable( is called only by the fork recovery (and defined in proof.ts)', () => {
    expect(holders(/\bendedAsUnavailable\(/).filter((r) => r !== 'ask/journal/proof.ts')).toEqual(['ask/forkRecovery.ts']);
  });
  it('C7: the fork record facades take the account explicitly, and read currentAccount() only to compare it with it', () => {
    const rec = textOf('ask/journal/records.ts');
    for (const name of [/claimFork\(h: string/, /forkHeld\(h: string/, /dismissFork\(h: string/, /lookupK1\(h: string/]) {
      const b = member(rec, name);
      expect(b, String(name)).toMatch(/acct: string|expectAcct: string/);
      for (const m of b.matchAll(/currentAccount\(\)(.{0,12})/g)) expect(m[1], `${name}: ${m[0]}`).toMatch(/^\s*!==\s*(acct|expectAcct)/);
    }
    const idx = textOf('ask/journal/index.ts');
    for (const name of [/\bclaimFork\(/, /\bforkHeld\(/, /\blookupK1\(/, /\bdismissFork\(/, /\breadFork\(/, /\bretireFork\(/]) {
      const line = idx.split('\n').find((l) => name.test(l) && /^\s+(claimFork|forkHeld|lookupK1|dismissFork|readFork|retireFork)\(/.test(l))!;
      expect(line, String(name)).toMatch(/acct: string|scope: OpScope/);
    }
  });
  it('C8: byKey asks lookupK1 (through its guard) before it calls createKeyGet', () => {
    const byKey = member(textOf('ask/journal/recover.ts'), /private async byKey\(/);
    const lookup = byKey.indexOf('lookupK1(');
    const guardCall = byKey.indexOf('const barred = forkGuard()');
    const read = byKey.indexOf('io.createKeyGet(');
    expect(lookup).toBeGreaterThan(-1);
    expect(guardCall).toBeGreaterThan(lookup);
    expect(read).toBeGreaterThan(guardCall);
    expect(byKey.indexOf('await call(get)')).toBeGreaterThan(guardCall);
  });
  it('C9: in runFork, forkHeld( sits inside the call argument of sendJ, before this.io.create(, so a claim displaced after admission sends nothing', () => {
    const run = member(textOf('ask/engine.ts'), /private async runFork\(/);
    const sends = enclosingCalls(run, /^forkHeld$|^jr\.j\.forkHeld$/);
    expect(sends.length, 'forkHeld is called in runFork').toBeGreaterThan(0);
    for (const c of sends) expect(c.inside.some((n) => /(^|\.)sendJ$/.test(n)), 'forkHeld runs inside sendJ\'s call argument').toBe(true);
    const held = run.indexOf('forkHeld(');
    const create = run.indexOf('this.io.create(');
    expect(held).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(held);
    expect(enclosingCalls(run, /^this\.io\.create$/).every((c) => c.inside.some((n) => /(^|\.)sendJ$/.test(n)))).toBe(true);
    expect(run.match(/\bthis\.io\.create\(/g)).toHaveLength(1);
  });
  it('C10: claimFork scans the entries inside its record-lock callback, with the account, and frees only entry-less claims of its own computer that are not bad', () => {
    const b = member(textOf('ask/journal/records.ts'), /claimFork\(h: string/);
    const lock = b.indexOf('this.locked<ForkClaim>(');
    expect(lock).toBeGreaterThan(-1);
    expect(b.indexOf('this.scan(h)'), 'the scan is inside the locked callback').toBeGreaterThan(lock);
    expect(b).toMatch(/\}, expectAcct\);\s*\}\s*$/);
    expect(b).toMatch(/const unsent = \(x: JRec\): boolean => ents !== null && x\.h === h && /);
    const target = /const target = \(x: JRec\): boolean => x\.h === h && x\.r === probe\.r && !x\.fk\?\.bad/;
    expect(b).toMatch(target);
    const frees = [...b.matchAll(/\bfree\(([^;]*)\);/g)].map((m) => m[1]);
    expect(frees.length).toBeGreaterThanOrEqual(2);
    for (const pred of frees) expect(pred, 'every free is the target or skips bad records').toMatch(/^target$|!x\.fk\?\.bad/);
  });
});
