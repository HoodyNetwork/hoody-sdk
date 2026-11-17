// Kit barrel conformance: every name imported or re-exported from '@kit' anywhere in hub/src, tests
// included, is an export of kit/index.ts. A barrel that drops an export some
// module imports fails here even where nobody ran tsc.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const SRC = join(import.meta.dirname, '..');
const BARREL = join(SRC, 'kit', 'index.ts');

/** Every name a declaration binds: `export const a`, and destructured `export const { a, b: c, ...d } = …` / `[a, b]`. */
function bindingNames(n: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(n)) { into.add(n.text); return; }
  for (const el of n.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, into);
}

/** The names kit/index.ts exports, read syntactically (fast: no type program, so the scan never slows a timed test
 *  that shares the run): export lists, exported declarations, and `export *` chains followed into their files. */
function barrelExports(): Set<string> {
  const names = new Set<string>();
  const seen = new Set<string>();
  const resolve = (from: string, spec: string): string => {
    const base = join(from, '..', spec);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      try { if (statSync(c).isFile()) return c; } catch { /* next candidate */ }
    }
    throw new Error(`export * target not found: ${spec} (from ${from})`);
  };
  const walk = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const st of sf.statements) {
      if (ts.isExportDeclaration(st)) {
        if (!st.exportClause) {
          if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) walk(resolve(file, st.moduleSpecifier.text));
        } else if (ts.isNamedExports(st.exportClause)) {
          st.exportClause.elements.forEach((e) => names.add(e.name.text));
        } else {
          names.add(st.exportClause.name.text);
        }
        continue;
      }
      const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if (ts.isVariableStatement(st)) {
        st.declarationList.declarations.forEach((d) => bindingNames(d.name, names));
      } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
        names.add(st.name.text);
      }
    }
  };
  walk(BARREL);
  return names;
}

interface Use { file: string; line: number; name: string }

/** Every named import / re-export whose module specifier is exactly '@kit'. */
function barrelUses(): Use[] {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));
  const out: Use[] = [];
  for (const f of files) {
    const text = readFileSync(join(SRC, f), 'utf8');
    if (!text.includes("'@kit'") && !text.includes('"@kit"')) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, false, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (n: ts.ImportSpecifier | ts.ExportSpecifier): void => {
      out.push({ file: f, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, name: (n.propertyName ?? n.name).text });
    };
    const fromKit = (m: ts.Expression | undefined): boolean => m !== undefined && ts.isStringLiteral(m) && m.text === '@kit';
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && fromKit(st.moduleSpecifier)) {
        const nb = st.importClause?.namedBindings;
        if (nb && ts.isNamedImports(nb)) nb.elements.forEach(add);
        if (st.importClause?.name) out.push({ file: f, line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1, name: 'default' });
      } else if (ts.isExportDeclaration(st) && fromKit(st.moduleSpecifier) && st.exportClause && ts.isNamedExports(st.exportClause)) {
        st.exportClause.elements.forEach(add);
      }
    }
  }
  return out;
}

describe('kit barrel', () => {
  const exported = barrelExports();
  const uses = barrelUses();

  it('reads a real barrel and real uses (the scan is not empty)', () => {
    expect(exported.size).toBeGreaterThan(100);
    expect(uses.length).toBeGreaterThan(100);
    expect(exported.has('Button')).toBe(true);
  });

  it("every name imported or re-exported from '@kit' is exported by kit/index.ts", () => {
    const missing = uses.filter((u) => !exported.has(u.name)).map((u) => `${u.file}:${u.line} ${u.name}`);
    expect(missing).toEqual([]);
  });
});
