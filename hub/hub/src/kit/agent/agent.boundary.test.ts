// Vitest: kit/agent is engine-free. The pieces moved out of ask/ import nothing from ask/, the daemon engine or
// a page, so the dock and the AI page draw one reply, card and composer from props alone.
// Terminal files: what a file may import from the terminal is judged by the ONE list eslint uses
// (scripts/lint/term-imports.cjs): a `.term.*` file may import '@term/prim' only (no deep or relative path), a
// `.term.test.*` file also the term test helpers; a plain scenario file nothing from the terminal. Every other rule
// below holds for `.term` files too.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const { termImport } = createRequire(import.meta.url)('../../../scripts/lint/term-imports.cjs') as {
  termImport(file: string, spec: string): { ok: boolean; messageId?: string } | null;
};

const DIR = __dirname;
const SOURCES = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

/** The imports of `src` (file `f` in this folder) that reach out of the kit. */
function badImports(f: string, src: string): string[] {
  const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
  return specs.filter((s) => {
    const term = termImport(join(DIR, f), s);
    if (term) return !term.ok;
    return /^@ask/.test(s) || /(^|\/)pages(\/|$)/.test(s) || /^@shell/.test(s) || /\.\.\/\.\.\//.test(s);
  });
}

describe('kit/agent has no engine', () => {
  it('lists the moved files', () => {
    for (const f of ['Reply.tsx', 'GateCard.tsx', 'Composer.tsx', 'AttachChips.tsx', 'code.ts', 'md.ts']) expect(SOURCES).toContain(f);
  });
  it.each(SOURCES)('%s imports nothing from src/ask, pages/ or shell/ (kit/ask.ts is the kit own)', (f) => {
    expect(badImports(f, readFileSync(join(DIR, f), 'utf8')), `${f} reaches out of the kit`).toEqual([]);
  });
  it('judges terminal imports by the shared list', () => {
    const imp = (spec: string) => `import { Box } from '${spec}';`;
    // A .term file: the alias only.
    expect(badImports('X.term.tsx', imp('@term/prim'))).toEqual([]);
    for (const spec of ['@term/prim/Box', '@term', '../../term/prim', '../../term/prim/Box', '../../term/prim/testing']) expect(badImports('X.term.tsx', imp(spec)), spec).toEqual([spec]);
    // A .term test: the alias and the test helpers.
    expect(badImports('X.term.test.tsx', imp('../../term/prim/testing') + imp('../../term/prim/semantics') + imp('@term/prim'))).toEqual([]);
    expect(badImports('X.term.test.tsx', imp('../../term/prim/Box'))).toEqual(['../../term/prim/Box']);
    // A web file and a plain scenario file: nothing from the terminal.
    for (const f of ['X.tsx', 'X.scenario.ts']) for (const spec of ['@term/prim', '../../term/scenario/types']) expect(badImports(f, imp(spec)), `${f} ${spec}`).toEqual([spec]);
    // A kit terminal file may also import '@term/kit'; so may a terminal-only kit module (termFiles.ts list).
    expect(badImports('X.term.tsx', imp('@term/kit'))).toEqual([]);
    expect(badImports('termKeyLine.tsx', imp('@term/prim') + imp('@term/kit'))).toEqual([]);
    expect(badImports('X.tsx', imp('@term/kit'))).toEqual(['@term/kit']);
    expect(badImports('X.term.tsx', imp('@term/kit/Pressable'))).toEqual(['@term/kit/Pressable']);
    // The other rules hold for .term files.
    for (const spec of ['@ask/engine', '@shell', '../../pages/ai/x']) expect(badImports('X.term.tsx', imp(spec)), spec).toEqual([spec]);
  });
});
