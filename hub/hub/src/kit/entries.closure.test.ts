// @kit/pure and @kit/hooks closure. From each entry, every value dependency is
// followed on the real source graph: static and dynamic imports, re-exports, side-effect imports and `import = require`,
// with the tsconfig aliases resolved. Only declaration-level `import type` / `export type` is skipped: under
// verbatimModuleSyntax `import { type X } from './m'` still runs ./m. The closure may hold no stylesheet, no package
// outside EXTERNAL, nothing that does not resolve, and no browser global read (bindings resolved by the TypeScript
// checker, so a local of the same name in another scope never hides one). The global check may later give way
// to term-scan.cjs's scanGlobals, the one detector.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const HUB = join(import.meta.dirname, '..', '..');
const SRC = join(HUB, 'src');

/** The membership: a name joins an entry only together with this list, and only if the closure stays clean. */
const MEMBERS: Record<string, readonly string[]> = {
  'kit/pure.ts': [
    'LOCALE', 'agentSignedOut', 'bytesToGb', 'codeLangOfPath', 'countryFlag', 'formatDate', 'formatDateTime', 'formatNumber', 'formatPercent', 'formatRelative', 'formatStorage',
    'ipDetailsFrom', 'makeT', 'matchesSearch', 'normalizeHexColor', 'platformHosts', 'platformText', 'type IpDetails', 'type PlatformHosts',
    // Bots voice: the Talk machine, for pages/bots/voice (pending.ts, runner.ts).
    'VOICE_NOTES_CAP', 'VOICE_NOTE_TTL_MS', 'voiceInitial', 'voicePendingOf', 'voiceRestorePending', 'voiceStep',
    'type MaybeSent', 'type PendingIdentity', 'type VoiceEffect', 'type VoiceEvent', 'type VoiceMode', 'type VoiceState',
    // Bots voice: the voice socket's frame codec, for pages/bots/voice/session.ts.
    'voiceConnectQuery', 'voiceDecodeOutputAudio', 'voiceEncodeClientFrame', 'voiceEncodeInputAudio', 'voiceParseServerFrame',
    // The type-or-browse path rule, for pages/ai/new/logic.ts.
    'pathSplit',
    // The cron preset model, for pages/schedules/logic.ts and pages/scripts (schedule words and picker).
    'CRON_EVERY', 'cronNextRuns', 'cronRecognise', 'cronToExpr', 'type CronField', 'type CronKit', 'type CronPreset', 'type CronPreview',
  ],
  'kit/hooks.ts': ['useNow', 'useShellData', 'useStrings'],
  // @core/pure: Node-loaded code (Playwright specs, the links.ts files they import) uses it.
  'core/pure.ts': ['isRealmId', 'isRealmOrGlobal', 'utf8Bytes'],
};

/** Packages the closures may load. Any other package is a problem until someone audits it and adds it here. */
const EXTERNAL = new Set(['react']);
const GLOBALS = new Set(['window', 'document', 'location', 'localStorage', 'sessionStorage', 'navigator', 'indexedDB']);

/** tsconfig's paths, read from the file so a new alias is followed, never taken for a package. */
const PATHS: [string, string][] = (() => {
  const cfg = ts.readConfigFile(join(HUB, 'tsconfig.json'), ts.sys.readFile).config as { compilerOptions?: { paths?: Record<string, string[]> } };
  return Object.entries(cfg.compilerOptions?.paths ?? {}).map(([k, v]) => [k, join(HUB, v[0] ?? '')]);
})();

/** Source text by path: the tree, with `overlay` files (fixtures) laid over it. */
type Read = (file: string) => string | undefined;
const treeRead =
  (overlay: Record<string, string> = {}): Read =>
  (file) => {
    const rel = relative(SRC, file);
    if (rel in overlay) return overlay[rel];
    try { return statSync(file).isFile() ? readFileSync(file, 'utf8') : undefined; } catch { return undefined; }
  };

type Target = { file: string } | { pkg: string } | { missing: string };

function resolveSpec(from: string, spec: string, read: Read): Target {
  let base: string | undefined;
  for (const [pattern, target] of PATHS) {
    if (pattern.endsWith('/*') ? spec.startsWith(pattern.slice(0, -1)) : spec === pattern) {
      base = pattern.endsWith('/*') ? join(target.slice(0, -1), spec.slice(pattern.length - 1)) : target;
      break;
    }
  }
  if (base === undefined && spec.startsWith('.')) base = join(from, '..', spec);
  if (base === undefined) return { pkg: spec };
  const exts = /\.(json|css)$/.test(base) ? [''] : ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
  for (const e of exts) if (read(base + e) !== undefined) return { file: base + e };
  return { missing: spec };
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Every value dependency of a file. Only `import type …` and `export type …` declarations are left out. */
function valueSpecs(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) out.push((n.moduleSpecifier as ts.StringLiteral).text);
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !n.isTypeOnly) out.push(n.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(n) && !n.isTypeOnly && ts.isExternalModuleReference(n.moduleReference)) {
      const e = n.moduleReference.expression;
      out.push(ts.isStringLiteral(e) ? e.text : '\0non-literal require');
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = n.arguments[0];
      out.push(a && ts.isStringLiteralLike(a) ? a.text : '\0non-literal import()');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Browser globals read as values, by binding: the checker resolves each name in its own scope (no lib is loaded, so
 *  a global has no symbol and a local one has a declaration in the file). `globalThis.document` and
 *  `globalThis['document']` count when globalThis is not shadowed. */
function globalReads(files: Map<string, string>): string[] {
  const host = ts.createCompilerHost({});
  const sources = new Map([...files].map(([f, t]) => [f, parse(f, t)]));
  host.getSourceFile = (f) => sources.get(f);
  host.fileExists = (f) => sources.has(f);
  host.readFile = (f) => files.get(f);
  const program = ts.createProgram({ rootNames: [...files.keys()], options: { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.Preserve }, host });
  const checker = program.getTypeChecker();
  const unbound = (id: ts.Identifier): boolean => {
    // `{ document }` names the shorthand property; the value it reads is the symbol behind it.
    const sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id);
    return !sym || !(sym.declarations ?? []).some((d) => d.getSourceFile() === id.getSourceFile());
  };
  const hits: string[] = [];
  for (const [file, sf] of sources) {
    const at = (n: ts.Node, name: string) => hits.push(`${relative(SRC, file)} -> global ${name}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
    const visit = (n: ts.Node): void => {
      if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
      if (ts.isIdentifier(n) && GLOBALS.has(n.text)) {
        const p = n.parent;
        const nameSlot =
          (ts.isPropertyAccessExpression(p) && p.name === n) ||
          ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isBindingElement(p)) && p.name === n) ||
          ts.isQualifiedName(p) ||
          ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name === n);
        if (!nameSlot && unbound(n)) at(n, n.text);
      }
      if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ts.isIdentifier(n.expression) && n.expression.text === 'globalThis' && unbound(n.expression)) {
        const key = ts.isPropertyAccessExpression(n) ? n.name.text : ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : '\0computed';
        if (GLOBALS.has(key) || key === '\0computed') at(n, `globalThis.${key === '\0computed' ? '[computed]' : key}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return hits;
}

/** Every problem in the closure of `entry`, as 'importer -> what'. */
function closureProblems(entry: string, overlay: Record<string, string> = {}): string[] {
  const read = treeRead(overlay);
  const problems: string[] = [];
  const files = new Map<string, string>();
  const queue = [join(SRC, entry)];
  while (queue.length) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    const text = read(file);
    if (text === undefined) { problems.push(`${relative(SRC, file)} -> unreadable`); continue; }
    files.set(file, text);
    const rel = relative(SRC, file);
    for (const spec of valueSpecs(parse(file, text))) {
      if (spec.startsWith('\0')) { problems.push(`${rel} -> ${spec.slice(1)}`); continue; }
      const t = resolveSpec(file, spec, read);
      if ('missing' in t) { problems.push(`${rel} -> unresolved ${t.missing}`); continue; }
      if ('pkg' in t) { if (!EXTERNAL.has(t.pkg)) problems.push(`${rel} -> package ${t.pkg}`); continue; }
      if (t.file.endsWith('.css')) { problems.push(`${rel} -> ${spec}`); continue; }
      if (t.file.endsWith('.json')) continue; // data, resolved above
      queue.push(t.file);
    }
  }
  return [...problems, ...globalReads(files)];
}

/** An entry's members, `type X` for a type-only one. Anything but `export { … } from '…'` is itself a problem. */
function exportedNames(entry: string, overlay: Record<string, string> = {}): string[] {
  const file = join(SRC, entry);
  const names: string[] = [];
  for (const st of parse(file, treeRead(overlay)(file) ?? '').statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const e of st.exportClause.elements) names.push(st.isTypeOnly || e.isTypeOnly ? `type ${e.name.text}` : e.name.text);
    } else names.push(`<not an export list: ${ts.SyntaxKind[st.kind]}>`);
  }
  return names.sort();
}

describe('@kit/pure, @kit/hooks and @core/pure import closures', () => {
  for (const entry of Object.keys(MEMBERS)) {
    it(`${entry} reaches no stylesheet, unlisted package, unresolved import or browser global`, () => {
      expect(closureProblems(entry), 'a member pulls in browser-only code: extract the pure part into its own file (as ipDetails.ts), or keep the name out').toEqual([]);
    });
    it(`${entry} exports exactly its member list`, () => {
      expect(exportedNames(entry)).toEqual([...(MEMBERS[entry] ?? [])].sort());
    });
  }
  it('every tsconfig alias the walk follows exists', () => {
    expect(PATHS.length).toBeGreaterThan(0);
    for (const [, target] of PATHS) expect(existsSync(target.replace(/\*$/, '')), target).toBe(true);
  });
});

describe('the closure check sees what it bans (fixtures laid over the tree)', () => {
  const probe = (code: string, file = 'kit/zzProbe.ts') => closureProblems(file, { [file]: code });
  const clean = (code: string) => expect(probe(code)).toEqual([]);
  const red = (code: string, part: string) => expect(probe(code).join('\n')).toContain(part);

  it('known-bad kit files', () => {
    expect(closureProblems('kit/forms/ColorPicker.tsx').some((p) => p.includes('package react-aria-components'))).toBe(true);
    // (DataTableLayout.ts and agentHints.ts were the known-bad global readers; both read through hostEnv() now, so the
    // global reads are pinned with fixtures instead.)
    red('export const w = () => document.title;', 'global document');
    red('export const h = () => location.host;', 'global location');
  });
  it('a type specifier inside a value import still loads the module; only `import type` / `export type` skip it', () => {
    red("import { type ColorPickerProps } from './forms/ColorPicker';\nexport type P = ColorPickerProps;", 'react-aria');
    red("export { type ColorPickerProps } from './forms/ColorPicker';", 'react-aria');
    clean("import type { ColorPickerProps } from './forms/ColorPicker';\nexport type P = ColorPickerProps;");
    clean("export type { ColorPickerProps } from './forms/ColorPicker';");
  });
  it('import = require, non-literal import(), side-effect css, export *', () => {
    red("import rd = require('react-dom');\nexport const x = rd;", 'package react-dom');
    red("const m = './format';\nexport const x = () => import(m);", 'non-literal import()');
    red("import './data/IpInfo.module.css';", 'IpInfo.module.css');
    red("export * from './forms/ColorPicker';", 'react-aria');
  });
  it('aliases are followed, unknown packages and missing files fail', () => {
    red("export * from '@shell/nowhere';", 'unresolved @shell/nowhere');
    expect(probe("export * from '@shell/context';").some((p) => p.includes('package @shell'))).toBe(false);
    red("export * from 'left-pad';", 'package left-pad');
    red("export * from './nowhere';", 'unresolved ./nowhere');
    red("import t from './nowhere.strings.en.json';\nexport const x = t;", 'unresolved ./nowhere.strings.en.json');
  });
  it('globals by binding: sibling scopes, globalThis, property names, type positions, typeof guards', () => {
    red('function local(document: unknown) { return document; }\nexport const t = () => document.title;', 'global document');
    red('export const t = () => globalThis.document.title;', 'global globalThis.document');
    red("export const t = () => globalThis['localStorage'];", 'global globalThis.localStorage');
    red('export const captured = { document, window };', 'global document');
    red('export const captured = { window };', 'global window');
    clean('export const f = (document: unknown) => ({ document });');
    red("export const h = typeof location === 'undefined' ? '' : location.host;", 'global location');
    clean('export const f = (document: { title: string }) => document.title;');
    clean('const o = { location: 1 };\nexport const x = o.location;\nexport type W = typeof window;');
    clean('export function g() { const navigator = { id: 1 }; return navigator.id; }');
    clean('const globalThis = { document: 1 };\nexport const x = globalThis.document;');
  });
  it('membership: only export lists, type and value kept apart', () => {
    const over = (extra: string) => ({ 'kit/pure.ts': readFileSync(join(SRC, 'kit/pure.ts'), 'utf8') + extra });
    const rejected = (extra: string) => exportedNames('kit/pure.ts', over(extra)).some((n) => n.startsWith('<not an export list'));
    expect(rejected("export * as extra from './forms/hexColor';\n")).toBe(true);
    expect(rejected("export * from './forms/hexColor';\n")).toBe(true);
    expect(rejected('export const extra = 1;\n')).toBe(true);
    expect(rejected('')).toBe(false);
    expect(exportedNames('kit/pure.ts')).toContain('type IpDetails');
  });
});
