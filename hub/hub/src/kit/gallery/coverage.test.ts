// Every value export of the kit barrel is shown in the gallery, or recorded in specimens.ts with a reason.
// A new export with neither fails here; a recorded name that now has a specimen,
// or is no longer exported, fails too, so the lists only shrink.
//
// Both sides come from the TypeScript program, not from text: the barrel's exports are the checker's export list
// (so `export *`, destructured consts and several exports on one line are all seen), and a name counts as shown
// only when an identifier in a gallery source resolves to that export's symbol (a word in a string, a comment, JSX
// text, a property name, a type position or an import line shows nothing).
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { NON_VISUAL_KIT_EXPORTS } from '../../app/conformance/exceptions';
import { NO_SPECIMEN, SPECIMEN_DEBT } from './specimens';

const KIT = join(import.meta.dirname, '..');
const HUB = join(KIT, '..', '..');
const GALLERY = join(KIT, 'gallery');

/** Gallery sources (any depth) that can hold a specimen: not tests, not the lists themselves. A source counts even when no tab mounts it. */
const gallerySources = (): string[] =>
  readdirSync(GALLERY, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.(test|d)\.tsx?$/.test(f) && f !== 'specimens.ts')
    .map((f) => join(GALLERY, f.split(sep).join('/')))
    .sort();

/** A part you can look at (PascalCase). Hooks, constants and functions are the other shapes. */
const isComponent = (name: string): boolean => /^[A-Z][a-z]/.test(name);

let exported: string[] = [];
let shownNames = new Set<string>();

/**
 * The program covers only what the two questions need, not the whole app: the barrel and the gallery sources, every
 * file a gallery source imports, and (from any of them) the files named by `export ... from`, which is the chain a
 * barrel name is followed along. Nothing else is read, no library file is loaded and imports are not followed
 * further (noResolve), so building it takes about a second. The sources are parsed once and shared with the program.
 */
function buildProgram(): ts.Program {
  const read = ts.readConfigFile(join(HUB, 'tsconfig.json'), ts.sys.readFile);
  const base: ts.CompilerOptions = {
    ...ts.parseJsonConfigFileContent(read.config, ts.sys, HUB).options,
    noEmit: true,
    incremental: false,
    composite: false,
    tsBuildInfoFile: undefined,
    noLib: true,
    types: [],
  };
  const parsedFiles = new Map<string, ts.SourceFile>();
  const parse = (file: string): ts.SourceFile => {
    let sf = parsedFiles.get(file);
    if (!sf) {
      sf = ts.createSourceFile(file, ts.sys.readFile(file) ?? '', ts.ScriptTarget.ESNext, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      parsedFiles.set(file, sf);
    }
    return sf;
  };
  const sources = gallerySources();
  const fromGallery = new Set(sources);
  const queue = [join(KIT, 'index.ts'), ...sources];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i] as string;
    for (const st of parse(file).statements) {
      const viaExport = ts.isExportDeclaration(st);
      // A kit module's pure sibling (X.pure.ts, the terminal port's split) is read too: the module re-exports names
      // imported from it, and with an unread target every such name resolves to the one unknown symbol, so any
      // unresolved identifier in the gallery would count as showing all of them.
      const spec = ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : '';
      const viaImport = ts.isImportDeclaration(st) && (fromGallery.has(file) || /\.pure$/.test(spec));
      if (!(viaExport || viaImport) || !st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const found = ts.resolveModuleName(st.moduleSpecifier.text, file, base, ts.sys).resolvedModule;
      if (!found || found.isExternalLibraryImport || found.resolvedFileName.endsWith('.d.ts') || seen.has(found.resolvedFileName)) continue;
      seen.add(found.resolvedFileName);
      queue.push(found.resolvedFileName);
    }
  }
  const options: ts.CompilerOptions = { ...base, noResolve: true };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...rest) => parsedFiles.get(file) ?? getSourceFile(file, ...rest);
  return ts.createProgram({ rootNames: queue, options, host });
}

beforeAll(() => {
  const program = buildProgram();
  const checker = program.getTypeChecker();
  const resolve = (s: ts.Symbol): ts.Symbol => ((s.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(s) : s);
  /** `export type { A }` and `export { type A }`: a type, whatever the file it comes from (an outside file is not read, so its symbol is unknown). */
  const typeOnly = (s: ts.Symbol): boolean =>
    (s.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || (ts.isNamedExports(d.parent) && d.parent.parent.isTypeOnly)));

  const barrel = program.getSourceFile(join(KIT, 'index.ts'));
  const barrelSymbol = barrel && checker.getSymbolAtLocation(barrel);
  const byTarget = new Map<ts.Symbol, string[]>();
  exported = [];
  for (const exp of barrelSymbol ? checker.getExportsOfModule(barrelSymbol) : []) {
    const target = resolve(exp);
    if ((target.flags & ts.SymbolFlags.Value) === 0 || typeOnly(exp)) continue; // a type, an interface: no markup to show
    exported.push(exp.name);
    byTarget.set(target, [...(byTarget.get(target) ?? []), exp.name]);
  }
  exported.sort();

  const shownTargets = new Set<ts.Symbol>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node)) {
      const sym = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
      if (sym) {
        const target = resolve(sym);
        if (byTarget.has(target)) shownTargets.add(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const file of gallerySources()) {
    const sf = program.getSourceFile(file);
    if (sf) ts.forEachChild(sf, visit);
  }
  shownNames = new Set([...shownTargets].flatMap((t) => byTarget.get(t) ?? []));
}, 120_000);

const shown = (name: string): boolean => shownNames.has(name);
const noSpecimen = NO_SPECIMEN.flatMap((g) => g.names);

describe('the kit gallery covers the kit barrel', () => {
  it('reads the barrel (a broken read must not pass by finding nothing)', () => {
    expect(exported.length).toBeGreaterThan(300);
    // Spread across the shapes the barrel uses: a named re-export, an `export *` function, an `export *` destructured const.
    for (const name of ['Button', 'formatDateTime', 'formatBytes', 'useDataView']) expect(exported, name).toContain(name);
    expect(shown('Button')).toBe(true);
    expect(shownNames.size).toBeGreaterThan(50);
  });

  it('every value export is shown in the gallery or recorded with a reason', () => {
    const recorded = new Set([...SPECIMEN_DEBT, ...noSpecimen, ...NON_VISUAL_KIT_EXPORTS]);
    const unrecorded = exported.filter((n) => !shown(n) && !recorded.has(n));
    expect(
      unrecorded,
      'add a gallery specimen. A hook, constant or function goes under a reason in kit/gallery/specimens.ts NO_SPECIMEN; a component that draws nothing goes to NON_VISUAL_KIT_EXPORTS',
    ).toEqual([]);
  });

  it('SPECIMEN_DEBT holds exported components that still have no specimen', () => {
    const bad = [
      ...SPECIMEN_DEBT.filter((n) => !exported.includes(n)).map((n) => `${n}: not exported any more`),
      ...SPECIMEN_DEBT.filter((n) => shown(n)).map((n) => `${n}: has a specimen now`),
      ...SPECIMEN_DEBT.filter((n) => !isComponent(n)).map((n) => `${n}: not a component (use NO_SPECIMEN)`),
      ...SPECIMEN_DEBT.filter((n, i) => SPECIMEN_DEBT.indexOf(n) !== i).map((n) => `${n}: listed twice`),
    ];
    expect(bad, 'remove the row from SPECIMEN_DEBT in kit/gallery/specimens.ts').toEqual([]);
  });

  it('NO_SPECIMEN names each have one reason, are exported, unshown, and are not components', () => {
    const bad = [
      ...NO_SPECIMEN.filter((g) => g.why.trim() === '').map(() => 'a group has no reason'),
      ...noSpecimen.filter((n) => !exported.includes(n)).map((n) => `${n}: not exported any more`),
      ...noSpecimen.filter((n) => shown(n)).map((n) => `${n}: has a specimen now`),
      ...noSpecimen.filter((n) => isComponent(n)).map((n) => `${n}: a component cannot be exempt here (a component needs a specimen; NON_VISUAL_KIT_EXPORTS lists the exceptions)`),
      ...noSpecimen.filter((n, i) => noSpecimen.indexOf(n) !== i).map((n) => `${n}: listed twice`),
      ...noSpecimen.filter((n) => SPECIMEN_DEBT.includes(n)).map((n) => `${n}: also in SPECIMEN_DEBT`),
    ];
    expect(bad, 'fix kit/gallery/specimens.ts').toEqual([]);
  });

  it('NON_VISUAL_KIT_EXPORTS names are exported and not also shown or listed here', () => {
    const bad = NON_VISUAL_KIT_EXPORTS.filter((n) => !exported.includes(n) || shown(n) || SPECIMEN_DEBT.includes(n) || noSpecimen.includes(n));
    expect(bad, 'stale or doubled entry in NON_VISUAL_KIT_EXPORTS').toEqual([]);
  });
});
