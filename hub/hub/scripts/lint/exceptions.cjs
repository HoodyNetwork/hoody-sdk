// Reviewed exceptions to the Hub's design lint rules. Reads hub/src/app/conformance/
// exceptions.ts (plain data, no imports) and turns each entry into a file-scoped override for ESLint and stylelint.
// A malformed entry throws at config load: a bad list fails every lint run instead of widening one. A path that is
// not on disk is skipped (it cannot widen) and fails app/conformance.std.test.ts as stale. std.* rules are read by
// that test only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SRC = path.resolve(__dirname, '..', '..', 'src');
const FILE = path.join(SRC, 'app', 'conformance', 'exceptions.ts');
const ESLINT = ['hub/one-accent', 'hub/no-text-literal', 'hub/no-raw-color', 'hub/retired-syntax'];
const STYLELINT = [
  'hub/blue-only-link-focus', 'hub/no-dashed', 'hub/token-use', 'hub/hover-parity',
  'hub/no-raw-font-weight', 'hub/no-raw-line-height', 'hub/no-raw-letter-spacing', 'hub/no-raw-duration', 'hub/no-raw-shadow',
];
// The ui.* rules an entry may name: the detector (anatomy.cjs scan) drops the hits an entry covers, and reports it as used.
const UI = ['ui.kitClass', 'ui.pageLook', 'ui.rawControl', 'ui.rawUrl', 'ui.computerList', 'ui.nativeTitle', 'ui.inlineLabel', 'ui.actionTwice', 'ui.bareNumber', 'ui.badgeUnit', 'ui.folderField'];
// What an entry may name.
const EXCEPTABLE = new Set([...ESLINT, ...STYLELINT, ...UI, 'std.chatName']);
const KEYS = new Set(['path', 'rules', 'why', 'by', 'until', 'sites']);
// A site is the function a ui.* hit sits in (anatomy.cjs: the enclosing component, else the nearest named function, else <module>).
const SITE = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|<module>)$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/; // no '', '.', '..', glob characters or hidden names
const SET_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function check(entries) {
  if (!Array.isArray(entries)) throw new Error('exceptions.ts: EXCEPTIONS is not an array');
  return entries.map((e, i) => {
    const at = `exceptions.ts entry ${i} (${e && e.path})`;
    if (!e || typeof e !== 'object' || !Object.keys(e).every((k) => KEYS.has(k))) throw new Error(`${at}: unknown key`);
    if (typeof e.path !== 'string') throw new Error(`${at}: path is not a string`);
    const folder = e.path.endsWith('/');
    if (!(folder ? e.path.slice(0, -1) : e.path).split('/').every((s) => SEGMENT.test(s)))
      throw new Error(`${at}: path must be hub/src-relative, with no '.', '..', glob or empty part`);
    if (!Array.isArray(e.rules) || !e.rules.length || !e.rules.every((r) => EXCEPTABLE.has(r)))
      throw new Error(`${at}: rules must be some of ${[...EXCEPTABLE].join(', ')}`);
    if (typeof e.why !== 'string' || !e.why.trim() || typeof e.by !== 'string' || !e.by.trim())
      throw new Error(`${at}: why and by are required`);
    if (e.until !== undefined && !(typeof e.until === 'string' && SET_ID.test(e.until))) throw new Error(`${at}: until is not a valid id`);
    // Sites narrow ui.* entries only: ESLint and stylelint overrides are whole files.
    if (e.sites !== undefined && !(Array.isArray(e.sites) && e.sites.length && e.sites.every((x) => typeof x === 'string' && SITE.test(x))
      && new Set(e.sites).size === e.sites.length && e.rules.every((r) => UI.includes(r))))
      throw new Error(`${at}: sites must be a non-empty list of unique function names (or <module>), on an entry whose rules are all ui.*`);
    return { path: e.path, folder, rules: [...e.rules] };
  });
}

/** The value of a literal-only expression: strings, arrays and plain objects of them. Anything executable throws. */
function literal(node, at) {
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.text;
    case ts.SyntaxKind.ArrayLiteralExpression:
      return node.elements.map((el) => literal(el, at));
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const out = {};
      for (const p of node.properties) {
        if (p.kind !== ts.SyntaxKind.PropertyAssignment || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
          throw new Error(`${at}: only plain "key: literal" properties are allowed`);
        if (p.name.text === '__proto__') throw new Error(`${at}: __proto__ is not a key`);
        out[p.name.text] = literal(p.initializer, at);
      }
      return out;
    }
    default:
      throw new Error(`${at}: only string, array and object literals are allowed (no accessors, calls or expressions)`);
  }
}

// The list is read as syntax, never executed: a getter or call cannot return one value to the check and another to the config.
function parse(text) {
  const out = ts.transpileModule(text, { reportDiagnostics: true, fileName: 'exceptions.ts', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const syntax = (out.diagnostics ?? []).find((d) => d.category === ts.DiagnosticCategory.Error);
  if (syntax) throw new Error(`exceptions.ts: ${ts.flattenDiagnosticMessageText(syntax.messageText, ' ')}`);
  const sf = ts.createSourceFile('exceptions.ts', text, ts.ScriptTarget.ES2022, true);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === 'EXCEPTIONS' && d.initializer) {
        let init = d.initializer;
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
        return literal(init, 'exceptions.ts EXCEPTIONS');
      }
    }
  }
  throw new Error('exceptions.ts: no EXCEPTIONS array');
}

function load() {
  if (!fs.existsSync(FILE)) throw new Error('hub/src/app/conformance/exceptions.ts is missing');
  return check(parse(fs.readFileSync(FILE, 'utf8')));
}

const overrides = (entries, ids, pattern, off) =>
  entries
    .filter((e) => fs.existsSync(path.join(SRC, e.path)))
    .flatMap((e) => {
      const rules = e.rules.filter((r) => ids.includes(r));
      return rules.length ? [{ files: [pattern(e)], rules: Object.fromEntries(rules.map((r) => [r, off])) }] : [];
    });
// ESLint: relative to hub/ (this config's folder), like the config's own 'src/…' patterns.
const forEslint = (entries = load()) => overrides(entries, ESLINT, (e) => `src/${e.path}${e.folder ? '**' : ''}`, 'off');
// stylelint: '**/src/…' matches from the CLI (config folder hub/) and from stylelint.lint({ config }) (cwd).
const forStylelint = (entries = load()) => overrides(entries, STYLELINT, (e) => `**/src/${e.path}${e.folder ? '**' : ''}`, null);

module.exports = { EXCEPTABLE, ESLINT, STYLELINT, UI, check, parse, load, forEslint, forStylelint };
