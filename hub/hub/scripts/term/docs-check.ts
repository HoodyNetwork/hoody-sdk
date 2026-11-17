#!/usr/bin/env bun
// Checks the terminal build's Markdown against the code:  bun scripts/term/docs-check.ts [--json]
//
// Docs checked: every *.md under src/term and scripts/term. Reads only; writes nothing. Exit 1 on any finding.
//   path     a backticked `src/...`, `scripts/...` or `hub/...` path names a file or directory that does not exist
//   link     a relative Markdown link [text](file.md) points at a file that does not exist
//   flag     a line that runs `scripts/term/<name>.ts` names a `--flag` that script's source never mentions
//   script   a line runs `scripts/term/<name>.ts` and there is no such script
//   code     a TERM_* code appears in a doc and nowhere in the code under src or scripts/term
//   prim     docs/prims.md: an export of a file under src/term/prim is missing from the page, or the page lists an
//            export name (first cell of a table row, `Name`) that no prim file exports
//   absent   a path the doc declares not created yet now exists (the doc is out of date)
//   list     a written-out export list (<!-- exports-of: <file> --> ... <!-- exports-of:end -->) differs from the
//            exports of the file it names, or names a file that does not exist (scripts/term/docs-lists.ts)
// A path with a placeholder (`<id>`, `*`, `X.term.tsx`, `...`) is skipped: it names a pattern, not a file.
// A file that is created only when first needed is declared once per doc with an HTML comment:
//   <!-- docs-check: absent scripts/term/secrets.allow.json -->
// The path rule then accepts the name in that doc, and the check fails once the file appears.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { exportListProblems, exportLists } from './docs-lists';

const HUB = path.resolve(import.meta.dir, '..', '..');
const SRC = path.join(HUB, 'src');
const PRIM = path.join(SRC, 'term', 'prim');
const DOC_ROOTS = [path.join(SRC, 'term'), path.join(HUB, 'scripts', 'term')];
const PRIMS_PAGE = path.join(SRC, 'term', 'docs', 'prims.md');

interface Finding { file: string; line: number; rule: 'path' | 'link' | 'flag' | 'script' | 'code' | 'prim' | 'absent' | 'list'; message: string }
const findings: Finding[] = [];
const rel = (f: string): string => path.relative(HUB, f);

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'term-golden' || e.name === 'fixtures') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, keep, out);
    else if (keep(f)) out.push(f);
  }
  return out;
}

const docs = DOC_ROOTS.flatMap((d) => walk(d, (f) => f.endsWith('.md'))).sort();

// ── TERM_* codes the code knows ──────────────────────────────────────────────────────────────────────────────────────
const CODE = /\bTERM_[A-Z][A-Z_]{2,}\b/g;
// The shell entries count too: the boundary's refusals (TERM_NETNS_*) are raised by netns.sh, some of them nowhere else.
const known = new Set<string>();
for (const f of [...walk(SRC, (x) => /\.tsx?$/.test(x)), ...walk(path.join(HUB, 'scripts', 'term'), (x) => /\.(ts|sh)$/.test(x))]) {
  if (f === import.meta.path) continue;
  const text = fs.readFileSync(f, 'utf8');
  if (!text.includes('TERM_')) continue;
  for (const m of text.matchAll(CODE)) known.add(m[0]);
}
// A family the code names with a star (`TERM_BOOT_*`, `TERM_NETNS_*`) knows every member by its prefix.
// Environment variables of terminals themselves, not codes of this build.
const TERMINAL_ENV = new Set(['TERM_PROGRAM', 'TERM_PROGRAM_VERSION']);
const knownCode = (c: string): boolean => TERMINAL_ENV.has(c) || known.has(c) || [...known].some((k) => k.endsWith('_') && c.startsWith(k)) || known.has(c.replace(/_[A-Z]+$/, '_'));

// ── Script sources, for flags ────────────────────────────────────────────────────────────────────────────────────────
const scriptSrc = new Map<string, string | null>();
function sourceOf(name: string): string | null {
  if (!scriptSrc.has(name)) {
    const f = path.join(HUB, 'scripts', 'term', name);
    scriptSrc.set(name, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  }
  return scriptSrc.get(name)!;
}
/** A script mentions a flag as '--name', "--name", `--name` in a comment, or reads it with arg('name') / flag('name'). */
const hasFlag = (src: string, flag: string): boolean => src.includes('--' + flag) || src.includes(`'${flag}'`);

// ── Per doc ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER = /[<>*{}|$]|\.\.\.|…|(^|\/)X\.|\/x\/|Thing/;
const exists = (p: string): boolean => fs.existsSync(p);

for (const doc of docs) {
  const lines = fs.readFileSync(doc, 'utf8').split('\n');
  const absent = new Set<string>();
  lines.forEach((text, i) => {
    for (const m of text.matchAll(/<!--\s*docs-check:\s*absent\s+(\S+)\s*-->/g)) {
      absent.add(m[1]!);
      if (exists(path.join(HUB, m[1]!.replace(/^hub\//, '')))) findings.push({ file: rel(doc), line: i + 1, rule: 'absent', message: `\`${m[1]}\` is declared absent but exists: update the doc and remove the declaration` });
    }
  });
  lines.forEach((text, i) => {
    const line = i + 1;
    const add = (rule: Finding['rule'], message: string): void => { findings.push({ file: rel(doc), line, rule, message }); };

    // Paths in code spans.
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      for (const word of m[1]!.split(/[\s,;()]+/)) {
        const w = word.replace(/[.:]+$/, '').replace(/:\d+$/, '').replace(/#.*$/, '');
        if (!/^(hub\/)?(src|scripts)\/[\w@./-]+$/.test(w) || PLACEHOLDER.test(w)) continue;
        const p = path.join(HUB, w.replace(/^hub\//, ''));
        if (!exists(p) && !absent.has(w)) add('path', `\`${w}\` does not exist`);
      }
    }

    // Relative links.
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!.split('#')[0]!;
      if (!target || /^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
      if (!exists(path.resolve(path.dirname(doc), target))) add('link', `link target ${target} does not exist`);
    }

    // Script runs and their flags: from the script name to the end of the code span (or of the line in a code block).
    for (const m of text.matchAll(/scripts\/term\/([\w/-]+\.ts)\b([^`\n]*)/g)) {
      const name = m[1]!;
      const src = sourceOf(name);
      const flags = [...m[2]!.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)/g)].map((x) => x[1]!);
      if (src === null) { if (flags.length || /\bbun\b/.test(text)) add('script', `scripts/term/${name} does not exist`); continue; }
      // `bun test --preload ./scripts/term/test-preload.ts`: --preload is bun's, and what follows is not the preload's.
      if (name === 'test-preload.ts') continue;
      for (const f of flags) if (!hasFlag(src, f)) add('flag', `scripts/term/${name} has no --${f}`);
    }

    // Error codes.
    for (const m of text.matchAll(CODE)) if (!knownCode(m[0])) add('code', `${m[0]} is in no file under src or scripts/term`);
  });
}

// ── Prims page against the prim directory ────────────────────────────────────────────────────────────────────────────
function exportsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set<string>();
  for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]!);
  for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim();
      if (name) out.add(name);
    }
  }
  return [...out];
}

if (exists(PRIMS_PAGE)) {
  const page = fs.readFileSync(PRIMS_PAGE, 'utf8');
  const all = new Map<string, string>();
  for (const f of fs.readdirSync(PRIM).filter((x) => /\.ts$/.test(x) && !/\.test\.tsx?$/.test(x)).sort()) {
    if (f === 'index.ts') continue;
    for (const name of exportsOf(path.join(PRIM, f))) if (!all.has(name)) all.set(name, f);
  }
  for (const [name, f] of all) {
    if (!new RegExp('`' + name.replace(/\$/g, '\\$') + '`').test(page)) findings.push({ file: rel(PRIMS_PAGE), line: 0, rule: 'prim', message: `export ${name} of src/term/prim/${f} is not on the page` });
  }
  page.split('\n').forEach((text, i) => {
    const m = /^\|\s*`([A-Za-z_$][\w$]*)`/.exec(text);
    if (m && !all.has(m[1]!)) findings.push({ file: rel(PRIMS_PAGE), line: i + 1, rule: 'prim', message: `\`${m[1]}\` is listed as an export but no file under src/term/prim exports it` });
  });
  // The barrel list on the page: names said to come from the barrel must be in index.ts.
  const barrel = new Set(exportsOf(path.join(PRIM, 'index.ts')));
  const section = /<!-- barrel:start -->([\s\S]*?)<!-- barrel:end -->/.exec(page)?.[1];
  if (section !== undefined) {
    const listed = new Set([...section.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!));
    for (const n of listed) if (!barrel.has(n)) findings.push({ file: rel(PRIMS_PAGE), line: 0, rule: 'prim', message: `\`${n}\` is listed as a barrel export but src/term/prim/index.ts does not export it` });
    for (const n of barrel) if (!listed.has(n)) findings.push({ file: rel(PRIMS_PAGE), line: 0, rule: 'prim', message: `src/term/prim/index.ts exports ${n}, which the barrel list lacks` });
  }
}

// Written-out export lists: one per source file, compared with that file's exports.
for (const doc of docs) {
  for (const list of exportLists(fs.readFileSync(doc, 'utf8'))) {
    const src = path.join(HUB, list.source);
    if (!exists(src)) { findings.push({ file: rel(doc), line: list.line, rule: 'list', message: `export list names ${list.source}, which does not exist` }); continue; }
    for (const message of exportListProblems(list, exportsOf(src))) findings.push({ file: rel(doc), line: list.line, rule: 'list', message });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ docs: docs.map(rel), findings }, null, 2) + '\n');
} else {
  for (const f of findings) process.stdout.write(`${f.file}${f.line ? ':' + f.line : ''}  [docs/${f.rule}]  ${f.message}\n`);
  process.stdout.write(`${docs.length} docs, ${findings.length} findings\n`);
}
process.exit(findings.length ? 1 : 0);
