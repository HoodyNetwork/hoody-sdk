// Stand-ins for what the terminal does not have yet (fixture flavour only; the strict flavour and the ship build refuse
// every one of them, loader.ts / build.ts).
//   - A web-only file without a sibling becomes a synthesized module (synthesize()).
//   - A partial sibling is completed with what it lacks (fillSibling()).
// A COMPONENT export becomes a labelled visual placeholder (src/term/placeholder.ts phComponent), listed in the ledger.
// Every other value export (hook, function, constant, class, object) becomes phUnsupported: any call, property read,
// iteration or conversion throws TERM_UNSUPPORTED naming export, module and importer (the page error boundary shows
// it). The only exception is a name on the shrinking allowance list placeholder.allow.json, which keeps the old
// inert "hole" behaviour; a page that touches one can never be accepted (the ledger reports `allowed`).
//
// What counts as missing is computed per exported NAME (local declarations, `export { a, b } from`, `export * from`,
// `export * as ns from`, default), the same names contract.ts compares (scanExports is also its syntax view).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { HUB, SRC } from './resolve';

export type ExportKind = 'component' | 'value';

export interface ReexportScan {
  /** The statement, verbatim. */
  text: string;
  spec: string;
  /** Exported names ('*' for `export * from`). */
  names: string[];
  /** For named re-exports: exported name -> the name in the source module. */
  local: Record<string, string>;
}

export interface ExportScan {
  /** Value names this file declares and exports itself, with their kind. */
  names: string[];
  kinds: Record<string, ExportKind>;
  hasDefault: boolean;
  defaultKind: ExportKind;
  reexports: ReexportScan[];
  /** Compatibility view of `reexports`. */
  reexportNames: string[][];
}

const mods = (n: ts.Node): readonly ts.ModifierLike[] => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []);
const isExported = (n: ts.Node): boolean => mods(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const isDefault = (n: ts.Node): boolean => mods(n).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
const isAmbient = (n: ts.Node): boolean => mods(n).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
const pascal = (n: string): boolean => /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(n);

function bindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out);
}

const WRAPPERS = new Set(['memo', 'forwardRef', 'React.memo', 'React.forwardRef', 'lazy', 'React.lazy']);
/** A component: a PascalCase function, a PascalCase const holding a function or memo()/forwardRef()/lazy(), or a class
 *  extending (React.)Component / PureComponent. Anything else (hooks, helpers, constants, enums, objects) is a value. */
function kindOf(name: string, init: ts.Node | undefined): ExportKind {
  if (!pascal(name)) return 'value';
  if (!init) return 'value';
  if (ts.isFunctionDeclaration(init) || ts.isFunctionExpression(init) || ts.isArrowFunction(init)) return 'component';
  if (ts.isClassDeclaration(init) || ts.isClassExpression(init)) {
    const ext = init.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression.getText();
    return ext && /(^|\.)(Pure)?Component$/.test(ext) ? 'component' : 'value';
  }
  let e: ts.Node = init;
  while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCallExpression(e) && WRAPPERS.has(e.expression.getText())) return 'component';
  return 'value';
}

/** The value exports of a source file, by syntax alone. */
export function scanExports(file: string, code: string): ExportScan {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, /\.[cm]?[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names: string[] = [];
  const kinds: Record<string, ExportKind> = {};
  const reexports: ReexportScan[] = [];
  let hasDefault = false;
  let defaultKind: ExportKind = 'value';
  const decls = new Map<string, ts.Node>();
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) decls.set(st.name.text, st);
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer);
  }
  const add = (n: string, k: ExportKind): void => { if (!(n in kinds)) names.push(n); kinds[n] = k; };
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      hasDefault = true;
      const e = st.expression;
      defaultKind = ts.isIdentifier(e) ? kindOf(e.text, decls.get(e.text)) : kindOf('Default', e);
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        const local: Record<string, string> = {};
        let exported: string[];
        if (!st.exportClause) exported = ['*'];
        else if (ts.isNamespaceExport(st.exportClause)) exported = [st.exportClause.name.text];
        else {
          exported = [];
          for (const e of st.exportClause.elements) {
            if (e.isTypeOnly) continue;
            exported.push(e.name.text);
            local[e.name.text] = (e.propertyName ?? e.name).text;
          }
          if (exported.length === 0) continue; // `export { type A } from`: types only
        }
        reexports.push({ text: st.getText(sf), spec, names: exported, local });
        continue;
      }
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const localName = (el.propertyName ?? el.name).text;
          if (el.name.text === 'default') { hasDefault = true; defaultKind = kindOf(localName, decls.get(localName)); }
          else add(el.name.text, kindOf(el.name.text, decls.get(localName)));
        }
      }
      continue;
    }
    if (!isExported(st) || isAmbient(st)) continue;
    if (isDefault(st)) {
      hasDefault = true;
      defaultKind = ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) ? kindOf(st.name?.text ?? 'Default', st) : 'value';
      continue;
    }
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) { if (st.name) add(st.name.text, kindOf(st.name.text, st)); }
    else if (ts.isEnumDeclaration(st) && !mods(st).some((m) => m.kind === ts.SyntaxKind.ConstKeyword)) add(st.name.text, 'value');
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const out: string[] = [];
        bindingNames(d.name, out);
        for (const n of out) add(n, ts.isIdentifier(d.name) ? kindOf(n, d.initializer) : 'value');
      }
    }
  }
  return { names, kinds, hasDefault, defaultKind, reexports, reexportNames: reexports.map((r) => r.names) };
}

export const PLACEHOLDER_RUNTIME = path.join(SRC, 'term', 'placeholder.ts');
export const ALLOWANCE_FILE = path.join(import.meta.dirname, 'placeholder.allow.json');

/** The named allowance list: "<path under hub>#<export>" entries that keep the inert hole behaviour. Shrinks only
 *  (placeholder.allow.test: an entry nothing uses fails; the list may never grow past its recorded size). */
export function readAllowances(file = ALLOWANCE_FILE): Set<string> {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: { id: string }[] };
    return new Set((j.entries ?? []).map((e) => e.id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw new Error(`TERM_ALLOWANCE_FILE: ${file} unreadable: ${(e as Error).message}`);
  }
}

export interface FillContext {
  /** "<rel>#<name>" ids that keep an inert hole. */
  allow?: ReadonlySet<string>;
}

function stubLine(n: string, kind: ExportKind, rel: string, allow: ReadonlySet<string>, exportAs = n): string {
  const fn = kind === 'component' ? 'phComponent' : allow.has(rel + '#' + n) ? 'phHole' : 'phUnsupported';
  if (exportAs === 'default') return `export default ${fn}(${JSON.stringify(n)}, ${JSON.stringify(rel)});`;
  return `export const ${exportAs} = ${fn}(${JSON.stringify(n)}, ${JSON.stringify(rel)});`;
}

const HEAD = (rel: string, reason: string, names: readonly string[]): string[] => [
  `import { phComponent, phHole, phModule, phUnsupported } from ${JSON.stringify(PLACEHOLDER_RUNTIME)};`,
  `phModule(${JSON.stringify(rel)}, ${JSON.stringify(reason)}, ${JSON.stringify(names)});`,
];

export interface SiblingFill {
  /** Source to append to the sibling (fixture flavour). Empty when nothing is missing. */
  append: string;
  /** Every web export the sibling lacks: names, 'default', and '* from <spec>' for a missing star re-export. */
  missing: string[];
}

/**
 * What a sibling leaves out of its web twin's exports. A missing name the web file declares itself gets a stand-in; a
 * missing name the web file re-exports is re-exported from the same module (resolved by the terminal rules, so the
 * terminal's own version of it); a missing `export * from S` is added. All of them are listed in `missing`, which the
 * strict flavour refuses.
 */
export function fillSibling(webFile: string, webCode: string, siblingCode: string, ctx: FillContext = {}): SiblingFill {
  const web = scanExports(webFile, webCode);
  const sib = scanExports(webFile, siblingCode);
  const allow = ctx.allow ?? new Set<string>();
  const rel = path.relative(HUB, webFile);
  const have = new Set<string>([...sib.names, ...sib.reexports.flatMap((r) => r.names.filter((n) => n !== '*'))]);
  const sibStars = new Set(sib.reexports.filter((r) => r.names.includes('*')).map((r) => r.spec));
  const missing: string[] = [];
  const lines: string[] = [];
  const stubs: string[] = [];
  for (const n of web.names) if (!have.has(n)) { missing.push(n); stubs.push(stubLine(n, web.kinds[n]!, rel, allow)); }
  for (const r of web.reexports) {
    if (r.names.includes('*')) {
      if (!sibStars.has(r.spec)) { missing.push('* from ' + r.spec); lines.push(`export * from ${JSON.stringify(r.spec)};`); }
      continue;
    }
    if (sibStars.has(r.spec)) continue; // the sibling re-exports the whole module
    const lack = r.names.filter((n) => !have.has(n));
    if (lack.length === 0) continue;
    missing.push(...lack);
    lines.push(`export { ${lack.map((n) => (r.local[n] && r.local[n] !== n ? `${r.local[n]} as ${n}` : n)).join(', ')} } from ${JSON.stringify(r.spec)};`);
  }
  if (web.hasDefault && !sib.hasDefault) { missing.push('default'); stubs.push(stubLine('default', web.defaultKind, rel, allow, 'default')); }
  if (missing.length === 0) return { append: '', missing };
  const out = [...(stubs.length ? HEAD(rel, 'sibling leaves these out', missing) : []), ...lines, ...stubs];
  return { append: '\n' + out.join('\n') + '\n', missing };
}

/** The TypeScript source of the stand-in for a web-only `file` without a sibling (fixture flavour). */
export function synthesize(file: string, code: string, reason: string, ctx: FillContext = {}): string {
  const scan = scanExports(file, code);
  const allow = ctx.allow ?? new Set<string>();
  const rel = path.relative(HUB, file);
  const lines = [...HEAD(rel, reason, [...scan.names, ...(scan.hasDefault ? ['default'] : [])]), ...scan.reexports.map((r) => r.text)];
  for (const n of scan.names) lines.push(stubLine(n, scan.kinds[n]!, rel, allow));
  if (scan.hasDefault) lines.push(stubLine('default', scan.defaultKind, rel, allow, 'default'));
  return lines.join('\n') + '\n';
}
