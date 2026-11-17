// What would stop the ship bundle under Node: a read of the Bun global that is not guarded (`Bun.x`, or `g.Bun.x`
// without `?.`), Bun's own import.meta fields (`dir`, `path`, `file`, `main`; Node has `dirname` and `filename`), and an
// import of `bun` or `bun:*`. Read with the TypeScript parser over the shipped sources: every non-test file under src/
// (tests, `test/` and `fixtures/` folders left out) and the files under scripts/ those and ship-entry.ts import.
// `import.meta.env` is not a finding: the term build replaces it (loader.ts `define`). Not read: the native-library
// module the build plugin writes (plugin.ts NATIVE_ENTRY_SOURCE): only a Bun-target bundle has it, and the release
// binary's build pins its `import.meta.dir` (cli/hub-build-step.ts assertNativePathBesideBundle). A Bun-only path
// reached through a local alias (`const B = g.Bun`) is not seen; the files that have one guard it by hand (Caret.ts).
// portable.term.test.ts holds the list empty.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const HUB = path.resolve(import.meta.dirname, '..', '..', '..');
const SKIP_DIRS = new Set(['test', 'fixtures', '__tests__', 'node_modules']);
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const BUN_META = new Set(['dir', 'path', 'file', 'main']);

/** The findings in one source text, as `file:line what`. */
export function portabilityFindings(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node, what: string): void => { out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${what}`); };
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const obj = n.expression;
      if (ts.isIdentifier(obj) && obj.text === 'Bun') at(n, n.getText().slice(0, 60));
      else if (ts.isPropertyAccessExpression(obj) && obj.name.text === 'Bun' && !n.questionDotToken) at(n, n.getText().slice(0, 80));
    }
    if (ts.isMetaProperty(n) && ts.isPropertyAccessExpression(n.parent) && BUN_META.has(n.parent.name.text)) at(n, `import.meta.${n.parent.name.text}`);
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && /^bun(:|$)/.test(n.moduleSpecifier.text)) {
      const typeOnly = ts.isImportDeclaration(n) ? n.importClause?.isTypeOnly : n.isTypeOnly;
      if (!typeOnly) at(n, `import '${n.moduleSpecifier.text}'`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The relative static imports of a source text (type-only ones left out). */
function relativeImports(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const out: string[] = [];
  for (const s of sf.statements) {
    if ((ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text.startsWith('.')) {
      if (ts.isImportDeclaration(s) ? s.importClause?.isTypeOnly : s.isTypeOnly) continue;
      out.push(s.moduleSpecifier.text);
    }
  }
  return out;
}

const resolveFile = (from: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (/\.tsx?$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};

/** The shipped sources: non-test src/ files, plus the scripts/ files they and ship-entry.ts import (transitively). */
export function shippedSources(hub = HUB): string[] {
  const src: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name) && !TEST_FILE.test(e.name)) src.push(p);
    }
  };
  walk(path.join(hub, 'src'));
  const scripts = path.join(hub, 'scripts') + path.sep;
  const seen = new Set(src);
  const queue = [...src, path.join(hub, 'scripts', 'term', 'build', 'ship-entry.ts')];
  seen.add(queue[queue.length - 1]!);
  for (let i = 0; i < queue.length; i++) {
    const f = queue[i]!;
    for (const spec of relativeImports(f, fs.readFileSync(f, 'utf8'))) {
      const r = resolveFile(f, spec);
      if (r && r.startsWith(scripts) && !TEST_FILE.test(r) && !seen.has(r)) { seen.add(r); queue.push(r); }
    }
  }
  return queue;
}

/** Every finding over the shipped sources. Empty when the bundle can run on Node. */
export function shippedFindings(hub = HUB): string[] {
  const out: string[] = [];
  for (const f of shippedSources(hub)) out.push(...portabilityFindings(path.relative(hub, f), fs.readFileSync(f, 'utf8')));
  return out;
}
