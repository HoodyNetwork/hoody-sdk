// The ONE list of what a file may import from the terminal. Read by eslint.config.js
// (page-boundaries) and by kit boundary tests (src/kit/agent/agent.boundary.test.ts); never copy it.
// - A terminal file reaches the terminal primitives only through the aliases, never '@term', '@term/<other>',
//   '@term/prim/<x>' or a relative path into src/term or scripts/term:
//     '@term/prim'  (src/term/prim/page.ts, layout and text): every terminal file (pages and kit);
//     '@term/kit'   (src/term/prim/kit.ts, interaction prims): terminal files under src/kit only; a page's is refused.
// - A terminal file is a `.term.*` file or a terminal-only module listed in src/app/conformance/termFiles.ts
//   (TERMINAL_ONLY_MODULES, read from that file: one source).
// - A `.term.test.*` file may also import the term test helpers by relative path: scripts/term/** (render, clock...)
//   and src/term/prim/{testing,semantics} (draw a part, query what an agent reads).
// - Any other file (web files, and plain scenario files, which the web runner shares) imports nothing from the terminal.
// - Files of the terminal itself (src/term/**, scripts/term/**) are not judged here.
const fs = require('node:fs');
const path = require('node:path');

const HUB = path.join(__dirname, '..', '..');
const SRC = path.join(HUB, 'src');
const TERM_PRIM_ALIAS = '@term/prim';
const TERM_KIT_ALIAS = '@term/kit';
const TERM_TEST_HELPERS = [path.join(HUB, 'scripts', 'term') + path.sep, path.join(HUB, 'src', 'term', 'prim', 'testing'), path.join(HUB, 'src', 'term', 'prim', 'semantics')];
const TERM_DIRS = [path.join(HUB, 'src', 'term') + path.sep, path.join(HUB, 'scripts', 'term') + path.sep];
const KIT_DIR = path.join(SRC, 'kit') + path.sep;
const TERM_FILES_TS = path.join(SRC, 'app', 'conformance', 'termFiles.ts');

/** The keys of TERMINAL_ONLY_MODULES in termFiles.ts (paths under src), read from its text: the one list. A file that
 *  cannot be read or parsed throws (a boundary check never runs on a guessed list). */
function terminalOnlyModules(text = fs.readFileSync(TERM_FILES_TS, 'utf8')) {
  const m = /export const TERMINAL_ONLY_MODULES[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(text);
  if (!m) throw new Error('term-imports: TERMINAL_ONLY_MODULES not found in src/app/conformance/termFiles.ts');
  const keys = [...m[1].matchAll(/^\s*'([^']+)'\s*:/gm)].map((x) => x[1]);
  if (!keys.length) throw new Error('term-imports: TERMINAL_ONLY_MODULES is empty or unreadable');
  return keys;
}
let only = null;
const terminalOnly = () => (only ??= new Set(terminalOnlyModules()));

const relSrc = (file) => path.relative(SRC, file).split(path.sep).join('/');
const isTermFile = (file) => /\.term\./.test(path.basename(file)) || terminalOnly().has(relSrc(file));
const isTermTest = (file) => /\.term\.test\.[cm]?[jt]sx?$/.test(path.basename(file));
const isKitFile = (file) => path.resolve(file).startsWith(KIT_DIR);
const isTermTestHelper = (target) => TERM_TEST_HELPERS.some((h) => (h.endsWith(path.sep) ? target.startsWith(h) : target === h || /^\.(tsx?|mts)$/.test(target.slice(h.length))));

/** The verdict on one import of `file` (absolute path): null when `spec` does not name the terminal; else
 *  { ok: true } or { ok: false, messageId: 'termAliasDeep' | 'termAliasWeb' | 'termKitOutside' | 'termRelative' }. */
function termImport(file, spec) {
  if (typeof spec !== 'string') return null;
  if (TERM_DIRS.some((d) => path.resolve(file).startsWith(d))) return null;
  if (spec === '@term' || spec.startsWith('@term/')) {
    if (spec !== TERM_PRIM_ALIAS && spec !== TERM_KIT_ALIAS) return { ok: false, messageId: 'termAliasDeep' };
    if (!isTermFile(file)) return { ok: false, messageId: 'termAliasWeb' };
    if (spec === TERM_KIT_ALIAS && !isKitFile(file)) return { ok: false, messageId: 'termKitOutside' };
    return { ok: true };
  }
  if (!spec.startsWith('.')) return null;
  const target = path.resolve(path.dirname(file), spec);
  if (!TERM_DIRS.some((d) => target.startsWith(d))) return null;
  if (isTermTest(file) && isTermTestHelper(target)) return { ok: true };
  return { ok: false, messageId: 'termRelative' };
}

/** The recorded debt (scripts/lint/term-imports.debt.cjs), keyed `<file under src>\0<module name>`. */
let debt = null;
const debtRows = () => (debt ??= new Map(require('./term-imports.debt.cjs').ROWS.map((r) => [`${r.file}\0${r.spec}`, r])));
const debtKey = (file, spec) => `${relSrc(path.resolve(file))}\0${spec}`;

/** termImport as eslint applies it: a refusal recorded in the debt passes, marked { ok: true, debt: row }. */
function termImportJudged(file, spec) {
  const v = termImport(file, spec);
  if (!v || v.ok) return v;
  const row = debtRows().get(debtKey(file, spec));
  return row ? { ok: true, debt: row } : v;
}

module.exports = { TERM_PRIM_ALIAS, TERM_KIT_ALIAS, TERM_TEST_HELPERS, isTermFile, isTermTest, isKitFile, isTermTestHelper, terminalOnlyModules, termImport, termImportJudged, debtKey };
