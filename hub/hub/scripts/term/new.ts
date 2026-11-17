#!/usr/bin/env bun
// Scaffolds the terminal side of a web file:  bun scripts/term/new.ts src/kit/x/Thing.tsx [--page <id>] [--print]
// Writes, each only if absent (never over an existing file):
//  1. Thing.term.tsx: every value export of the web file. A PascalCase export becomes a stub component typed
//     `typeof Web.Thing` under a `// term-stub: Thing` marker (a stub is NOT a port: the kit gate keeps it in the
//     placeholder class while the marker stands, and the ship build refuses it). Every type export is re-exported
//     (`export type { … } from './Thing'`), so a module importing the web file's types keeps compiling.
//  2. Thing.scenario.ts: one `scenarios(...)` per component with no cases, and the web props listed in a comment as
//     "behavioural (each needs a case)" and "other (read or ignore)". Zero cases keeps the contract red on purpose.
//  3. Thing.term.test.tsx: a drawTest import and one test.todo per component (frame, keys, callback arguments, mono).
// Then prints the paths and a "next:" list. --print writes nothing and prints the three files instead.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { HUB } from './resolve';
import { scanExports } from './placeholder';
import { isBehavioural } from './contract';

const args = process.argv.slice(2);
const flag = (f: string): boolean => args.includes(f);
const opt = (f: string): string | undefined => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--page');
if (!target || !/\.tsx?$/.test(target) || /\.(term|scenario)\.tsx?$/.test(target)) {
  console.error('usage: bun scripts/term/new.ts <path/to/X.tsx> [--page <id>] [--print]   (the web file, not a .term file)');
  process.exit(2);
}
const web = path.resolve(HUB, target);
if (!fs.existsSync(web)) { console.error(`no such file: ${path.relative(HUB, web)}`); process.exit(2); }
const rel = (f: string): string => path.relative(HUB, f);
const stem = web.replace(/\.tsx?$/, '');
const out = { term: `${stem}.term.tsx`, scenario: `${stem}.scenario.ts`, test: `${stem}.term.test.tsx` };
const code = fs.readFileSync(web, 'utf8');
const scan = scanExports(web, code);
const base = './' + path.basename(stem);
const prim = path.relative(path.dirname(web), path.join(HUB, 'src/term/prim')).replace(/^(?!\.)/, './');
const scenarioTypes = path.relative(path.dirname(web), path.join(HUB, 'src/kit/scenario-types')).replace(/^(?!\.)/, './');
const comps = scan.names.filter((n) => /^[A-Z]/.test(n) && !/^[A-Z0-9_]+$/.test(n) && scan.kinds[n] !== 'value');
const values = scan.names.filter((n) => !comps.includes(n));

// Type exports (scanExports lists values only): interfaces, type aliases and `export type { … }` of the file itself.
const sf = ts.createSourceFile(web, code, ts.ScriptTarget.Latest, true, /x$/.test(web) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const typeNames: string[] = [];
const exported = (n: ts.Node): boolean => !!(ts.getCombinedModifierFlags(n as ts.Declaration) & ts.ModifierFlags.Export);
for (const st of sf.statements) {
  if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && exported(st)) typeNames.push(st.name.text);
  else if (ts.isExportDeclaration(st) && st.isTypeOnly && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) typeNames.push(e.name.text);
}

// The props of each component, from the checker (a program rooted at the web file only).
function propsOf(): Map<string, string[]> {
  const res = new Map<string, string[]>();
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(HUB, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, HUB);
  const program = ts.createProgram({ rootNames: [...cfg.fileNames.filter((f) => f.endsWith('.d.ts')), web], options: { ...cfg.options, noEmit: true, incremental: false, composite: false } });
  const checker = program.getTypeChecker();
  const src = program.getSourceFile(web);
  const mod = src && checker.getSymbolAtLocation(src);
  if (!mod) return res;
  for (const e of checker.getExportsOfModule(mod)) {
    if (!comps.includes(e.name)) continue;
    const t = checker.getTypeOfSymbolAtLocation(e, src);
    const sig = t.getCallSignatures()[0];
    const p0 = sig?.getParameters()[0];
    if (!p0) { res.set(e.name, []); continue; }
    const pt = checker.getTypeOfSymbolAtLocation(p0, src);
    res.set(e.name, checker.getPropertiesOfType(pt).map((s) => s.name).filter((n) => n !== 'key').sort());
  }
  return res;
}
const props = comps.length ? propsOf() : new Map<string, string[]>();

// 1. the sibling
const T: string[] = [
  `// Terminal sibling of ${path.basename(web)} (scaffolded by scripts/term/new.ts). Same exports, same types; drawn with prim.`,
  `// Rules: colours only through tokens, user text through prim Text, layouts hold at 80x24 and 120x40 (src/term/README.md).`,
  `// A component under a "term-stub" marker is NOT ported: the kit gate counts it as a placeholder and the ship build`,
  `// refuses it. Remove the marker when the component draws and behaves as the web one does.`,
  `import type { ReactNode } from 'react';`,
  `import type * as Web from '${base}';`,
  `import { Box, Text } from '${prim}';`,
  '',
];
if (typeNames.length) T.push(`export type { ${typeNames.join(', ')} } from '${base}';`, '');
for (const c of comps) {
  T.push(`// term-stub: ${c}`);
  T.push(`export const ${c}: typeof Web.${c} = ((p: { children?: ReactNode }) => (`);
  T.push(`  <Box dir="column">`);
  T.push(`    <Text dim>${c}</Text>`);
  T.push(`    {p.children}`);
  T.push(`  </Box>`);
  T.push(`)) as typeof Web.${c}; // contract-any: scaffold stub, replaced when the component is ported`);
  T.push('');
}
for (const v of values) {
  T.push(`// term-stub: ${v}. A pure helper moves to a module both files import (a sibling may not value-import its web twin, graph R2); else implement it here.`);
  T.push(`export const ${v}: typeof Web.${v} = undefined as never; // contract-any: scaffold stub, replaced when ported`);
  T.push('');
}
if (scan.hasDefault) T.push(`// TODO(term): the web file has a default export; add it here.`);
if (scan.reexports.length) T.push(`// The web file re-exports: ${scan.reexportNames.map((x) => x.join(' ')).join(' ')}\n// Re-export the same names (from terminal-safe modules).`);

// 2. the scenario file
const S: string[] = [
  `// Behaviour scenarios for ${path.basename(web)}: run on the web and in the terminal (src/term/docs/scenarios.md).`,
  `// No case yet: the contract fails "scenario for X has no cases" until each behavioural prop has one.`,
  `import { scenarios } from '${scenarioTypes}';`,
  comps.length ? `import { ${comps.join(', ')} } from '${base}';` : '',
  '',
];
for (const c of comps) {
  const ps = props.get(c) ?? [];
  const beh = ps.filter((p) => isBehavioural(p));
  const other = ps.filter((p) => !isBehavioural(p));
  S.push(`// ${c} props, behavioural (each needs a case, or an \`unsupported\` reason): ${beh.join(', ') || 'none'}`);
  S.push(`// ${c} props, other (the sibling reads each, or \`ignored\` gives a reason): ${other.join(', ') || 'none'}`);
  S.push(`const ${c[0]!.toLowerCase()}${c.slice(1)} = scenarios('${c}', ${c}, {`);
  S.push(`  ignored: {},`);
  S.push(`  unsupported: {},`);
  S.push(`  cases: [],`);
  S.push(`});`);
  S.push('');
}
S.push(`export default [${comps.map((c) => `${c[0]!.toLowerCase()}${c.slice(1)}`).join(', ')}];`);

// 3. the term test
const X: string[] = [
  `// Terminal tests for ${path.basename(out.term)} (bun test with the term preload).`,
  `import { describe, test } from 'bun:test';`,
  `import { drawTest } from '${path.relative(path.dirname(web), path.join(HUB, 'src/term/prim/testing')).replace(/^(?!\.)/, './')}';`,
  `void drawTest;`,
  '',
];
for (const c of comps) {
  X.push(`describe('${c} (terminal)', () => {`);
  for (const what of ['draws at 80x24 and 120x40 (frame)', 'keys do what the web keys do', 'callbacks get the web arguments', 'reads on the mono tier (no colour)']) X.push(`  test.todo('${what}');`);
  X.push(`});`, '');
}

const files: Array<[string, string]> = [[out.term, T.join('\n') + '\n'], [out.scenario, S.join('\n') + '\n'], [out.test, X.join('\n') + '\n']];
const wrote: string[] = [];
for (const [f, text] of files) {
  if (fs.existsSync(f)) { console.log(`kept   ${rel(f)} (exists; nothing written)`); continue; }
  if (flag('--print')) { console.log(`--- ${rel(f)}\n${text}`); continue; }
  fs.writeFileSync(f, text);
  wrote.push(f);
  console.log(`wrote  ${rel(f)}`);
}
console.log(`${comps.length} components (stubs, marked term-stub), ${values.length} other values, ${typeNames.length} types re-exported.`);
const page = opt('--page');
console.log([
  'next:',
  `  1. draw each stub, then delete its "term-stub" line`,
  `  2. bun scripts/term/contract.ts --explain ${comps.join(',') || '<Component>'}`,
  `  3. add cases to ${rel(out.scenario)}, then bun scripts/term/scenarios.ts ${path.basename(out.scenario)} --mutants`,
  `  4. ${page ? `bun scripts/term/check.ts --page ${page}` : 'bun scripts/term/check.ts --page <a page that draws it> (or none: say so)'}`,
  `  doc: src/term/README.md "Add a sibling", src/term/docs/scenarios.md`,
].join('\n'));
