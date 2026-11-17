// ESLint for the Hub v3 app: page boundaries, no UI literals, no raw I/O in
// pages. Enforcement by lint, not review. ESLint 10 finds this file for everything under hub/.
const path = require('node:path');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const hubRules = require('./scripts/lint/eslint-hub.cjs');
const exceptions = require('./scripts/lint/exceptions.cjs');

const PAGES = path.join(__dirname, 'src', 'pages');
// The terminal: what a .term file (and a .term test) may import from the terminal is ONE list,
// scripts/lint/term-imports.cjs, shared with the kit boundary tests.
// Refusals recorded in scripts/lint/term-imports.debt.cjs pass (termImportJudged); the debt only shrinks.
const { termImportJudged, terminalOnlyModules } = require('./scripts/lint/term-imports.cjs');

// ── Local rule: a page imports only its own folder, other pages' links.ts, and the aliases ──
// A page's fixtures.ts and test/spec files may also import another page's fixtures.links.ts (that page's fake
// answers, for fixtures only), so fixture data never rides the production entry links.ts.
const pageBoundaries = {
  meta: {
    type: 'problem',
    messages: {
      otherPage: 'Pages may import only another page\'s links.ts, and from fixtures.ts or a test its fixtures.links.ts ("{{spec}}" reaches into page "{{other}}").',
      escape: 'Reach the kit, core and app through @kit / @core, never by relative path ("{{spec}}").',
      aliasEscape: 'An alias path never climbs out with ".." ("{{spec}}"): name the module directly (Ask: @ask/io only).',
      computed: 'A dynamic import names its module literally, so the page boundaries can be checked.',
      termAliasWeb: '"{{spec}}" is the terminal\'s: only a page\'s .term file (X.term.tsx beside X.tsx) imports it.',
      termAliasDeep: 'Terminal primitives come only from "@term/prim" (src/term/prim/page.ts: layout and text) or, in a kit terminal file, "@term/kit" (src/term/prim/kit.ts), never "{{spec}}". Focus, semantics, overlays and tables come through @kit.',
      termKitOutside: '"{{spec}}" (interaction prims) is for kit terminal files (src/kit/**) only: a page draws with "@term/prim" (layout and text) and @kit components.',
      termRelative: 'Reach the terminal primitives through "@term/prim" (src/term/prim/page.ts), never by relative path ("{{spec}}"). Test helpers (scripts/term/*, prim/testing, prim/semantics) only from a .term test.',
    },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    const rel = path.relative(PAGES, file);
    if (rel.startsWith('..')) return {};
    const own = rel.split(path.sep)[0];
    const fixtureReader = rel === path.join(own, 'fixtures.ts') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(file));
    const check = (node, spec) => {
      // A backslash separates path segments on Windows but is a file-name character to path.resolve on POSIX, so the
      // two readings of '..\files\storage' differ and the resolve below would judge the wrong one. No module name
      // needs one: any specifier containing a backslash is an escape.
      if (typeof spec === 'string' && spec.includes('\\')) {
        context.report({ node, messageId: 'escape', data: { spec } });
        return;
      }
      // '@core/../ask/engine' resolves through the alias into another folder; no alias path may climb.
      if (typeof spec === 'string' && spec.startsWith('@') && spec.split('/').includes('..')) {
        context.report({ node, messageId: 'aliasEscape', data: { spec } });
        return;
      }
      // Vite reads '/src/...' under its root (and '/@fs/...' or an absolute path from the disk); a page
      // never needs either, so any '/' module name is an escape.
      if (typeof spec === 'string' && spec.startsWith('/')) {
        context.report({ node, messageId: 'escape', data: { spec } });
        return;
      }
      const term = termImportJudged(file, spec);
      if (term) {
        if (!term.ok) context.report({ node, messageId: term.messageId, data: { spec } });
        return;
      }
      if (typeof spec !== 'string' || !spec.startsWith('.')) return;
      const target = path.resolve(path.dirname(file), spec);
      const t = path.relative(PAGES, target);
      if (t.startsWith('..')) {
        // (a relative path into the terminal was judged above by termImport)
        context.report({ node, messageId: 'escape', data: { spec } });
        return;
      }
      const other = t.split(path.sep)[0];
      if (other === own) return;
      const rest = t.split(path.sep).slice(1).join('/');
      if (rest === 'links' || rest === 'links.ts') return;
      if (fixtureReader && (rest === 'fixtures.links' || rest === 'fixtures.links.ts')) return;
      context.report({ node, messageId: 'otherPage', data: { spec, other } });
    };
    return {
      ImportDeclaration: (n) => check(n, n.source.value),
      ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
      ExportAllDeclaration: (n) => check(n, n.source.value),
      ImportExpression: (n) => {
        if (n.source.type === 'Literal') return check(n, n.source.value);
        // A template without substitutions is a literal name; one with substitutions cannot be checked.
        if (n.source.type === 'TemplateLiteral' && n.source.expressions.length === 0) return check(n, n.source.quasis[0].value.cooked);
        context.report({ node: n, messageId: 'computed' });
      },
    };
  },
};

// ── Local rule: the terminal imports of a kit file (src/kit/**), the same list as a page's (term-imports.cjs) ──
const termImports = {
  meta: { type: 'problem', messages: pageBoundaries.meta.messages, schema: [] },
  create(context) {
    const file = context.filename ?? context.getFilename();
    const check = (node, spec) => {
      const term = termImportJudged(file, spec);
      if (term && !term.ok) context.report({ node, messageId: term.messageId, data: { spec } });
    };
    return {
      ImportDeclaration: (n) => check(n, n.source.value),
      ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
      ExportAllDeclaration: (n) => check(n, n.source.value),
      ImportExpression: (n) => {
        if (n.source.type === 'Literal') return check(n, n.source.value);
        if (n.source.type === 'TemplateLiteral' && n.source.expressions.length === 0) return check(n, n.source.quasis[0].value.cooked);
      },
    };
  },
};

const hub = { rules: { 'page-boundaries': pageBoundaries, 'term-imports': termImports, ...hubRules.rules } };

// Attributes that carry user-visible text must come from strings.en.json.
const TEXT_ATTRS = '/^(aria-label|aria-description|title|placeholder|alt|label|description|subtitle|body|tooltip|emptyText)$/';

const UI_LIBS = {
  group: ['react-aria-components', 'react-aria', 'react-aria/*', 'react-stately', '@react-aria/*', '@react-stately/*', '@tanstack/*', 'radix-ui', '@radix-ui/*'],
  message: 'Pages compose @kit (and data through @core); they never use the UI or data libraries directly. Need something the kit lacks? Build it in parts/ and file a kit request.',
};
const SHELL = { group: ['@shell', '@shell/*'], message: 'The shell is not a page dependency.' };
// Pages reach Ask's agent IO only through the read-only @ask/io (app/conformance/ask-io.conformance.test.ts).
const ASK = { regex: '^@ask(?!/io$)(?:/|$)', message: 'Pages reach Ask only through @ask/io (its data and logic, read-only).' };

function pageImports(allowApp) {
  const banned = ['fixtures', 'testing', 'e2e', 'shots.types', 'router', 'pageRouter', 'pages', 'main', 'DevToolbar', 'PageStates'].filter((m) => !allowApp.includes(m));
  return [
    'error',
    {
      patterns: [
        UI_LIBS,
        SHELL,
        ASK,
        ...(banned.length ? [{ group: banned.map((m) => `@app/${m}`), message: 'This @app module is not for this file.' }] : []),
      ],
    },
  ];
}

// The terminal files (term-imports.cjs): .term files and tests, src/term itself, the terminal-only modules listed in
// app/conformance/termFiles.ts (read from that file, one list), and plain scenario files (terminal test input).
const TERMINAL_FILES = [
  'src/**/*.term.{ts,tsx}',
  'src/**/*.term.test.{ts,tsx}',
  'src/term/**/*.{ts,tsx}',
  'src/**/*.scenario.ts',
  ...terminalOnlyModules().map((m) => `src/${m}`),
];
// The rules that still report in those files; there they are warnings (see below). The list only shrinks.
const TERMINAL_SWEEP = [
  'react/jsx-no-literals',
  'jsx-a11y/no-autofocus',
  'hub/page-boundaries',
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unused-vars',
  'react-hooks/exhaustive-deps',
  'hub/no-raw-color',
  'no-restricted-syntax',
  'no-console',
  'react/jsx-key',
  '@typescript-eslint/consistent-type-imports',
  'react-hooks/rules-of-hooks',
  'no-restricted-imports',
  'jsx-a11y/click-events-have-key-events',
  'jsx-a11y/no-static-element-interactions',
  'hub/retired-syntax',
  'prefer-const',
  '@typescript-eslint/no-this-alias',
  '@typescript-eslint/ban-ts-comment',
  'jsx-a11y/interactive-supports-focus',
  'react/no-danger',
  'jsx-a11y/anchor-is-valid',
];

module.exports = [
  {
    ignores: ['templates/**', 'scripts/shots.spec.ts'],
  },
  // .mts too (vite.config.mts, the term configs and scripts): a file no block matches is skipped with "no matching configuration".
  ...tsPlugin.configs['flat/recommended'].map((c) => ({ ...c, files: ['**/*.{ts,tsx,mts}'] })),
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, hub },
    settings: { react: { version: '19.3' } },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/no-danger': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-target-blank': 'error',
      // A lone '…' passes here; hub/retired-syntax reports it (an ellipsis belongs in the strings value).
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true, allowedStrings: ['·', '—', '–', '/', '×', '›', '…', ':', '(', ')'] }],
      // The design rules fail. hub/anatomy stays 'warn': it repeats the
      // ratchet, and ESLint's per-file cache can hold a stale cross-file hit. A file a rule cannot fit gets an
      // entry in app/conformance/exceptions.ts (scripts/lint/exceptions.cjs), never an inline disable.
      'hub/one-accent': 'error',
      'hub/anatomy': 'warn',
      // The loose-link, band and drawer-list rules: warnings like hub/anatomy; their rows (layout.looseFaqLink, layout.bandsPerSection,
      // layout.drawerOl in each page's conformance.allow.ts) only shrink, and the anatomy ratchet is what fails.
      'hub/no-loose-faqlink': 'warn',
      'hub/one-band-per-section': 'warn',
      'hub/no-drawer-ol': 'warn',
      'hub/no-text-literal': 'error',
      'hub/no-raw-color': 'error',
      'hub/retired-syntax': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > Literal[value=/[A-Za-z]/]`, message: 'User-visible text comes from strings.en.json (t("key")).' },
        { selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > JSXExpressionContainer > Literal[value=/[A-Za-z]/]`, message: 'User-visible text comes from strings.en.json (t("key")).' },
        { selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > JSXExpressionContainer > TemplateLiteral`, message: 'User-visible text comes from strings.en.json (t("key", vars)).' },
        { selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]', message: 'No raw HTML.' },
        { selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]', message: 'No raw HTML.' },
      ],
      'no-console': ['error', { allow: ['error'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  // ── Pages: boundaries and no raw I/O ──
  // Old names kept as aliases: a warning in app code only (src), where the kit buttons are; scripts and
  // the configs render none. app/conformance.retiredalias.test.ts holds their count down and asks ESLint that its scan
  // and this scope are one set. Tests and specs turn it off below.
  { files: ['src/**/*.{ts,tsx,mts}'], rules: { 'hub/retired-alias': 'warn' } },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'hub/page-boundaries': 'error',
      'hub/use-data-view': 'error',
      'no-console': 'error',
      'no-restricted-imports': pageImports([]),
      'no-restricted-globals': [
        'error',
        ...['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'BroadcastChannel'].map((name) => ({
          name,
          message: 'Pages reach the network and storage only through @core.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          ['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'WebSocket'].map((property) => ({
            object,
            property,
            message: 'Pages reach the network and storage only through @core.',
          })),
        ),
        { object: 'document', property: 'cookie', message: 'No cookies from pages.' },
      ],
    },
  },
  // A page root's data and fixtures, plus the two of the Bare metal view (pages/billing/servers/), named
  // exactly: a nested data.ts or fixtures.ts elsewhere keeps the @app/fixtures ban (only a page root touches it).
  // pages/notes/fixtureApi.ts is the Notes fixture Api, kept out of data.ts so the terminal ship build has no fixture
  // input; only pages/notes/fixtures.ts imports it.
  { files: ['src/pages/*/data.ts', 'src/pages/*/fixtures.ts', 'src/pages/billing/servers/data.ts', 'src/pages/billing/servers/fixtures.ts', 'src/pages/notes/fixtureApi.ts'], rules: { 'no-restricted-imports': pageImports(['fixtures']) } },
  // Page tests at any depth (pages/files/transfers/*.test.tsx too): a nested test is a page test like a top-level one.
  { files: ['src/pages/*/page.test.ts', 'src/pages/*/*.test.ts', 'src/pages/*/*.test.tsx', 'src/pages/*/**/*.test.{ts,tsx}'], rules: { 'no-restricted-imports': pageImports(['testing', 'fixtures']) } },
  // Every Playwright spec in a page folder (page.spec.ts plus split files such as list.spec.ts) may use @app/e2e.
  { files: ['src/pages/*/*.spec.ts', 'src/pages/*/**/*.spec.ts'], rules: { 'no-restricted-imports': pageImports(['e2e']) } },
  { files: ['src/pages/*/shots.ts'], rules: { 'no-restricted-imports': pageImports(['shots.types']) } },
  // Layer guard: the shell never imports a page. Tests are exempt for drift
  // checks against a page's links (shell/notify/paths.test.ts); shell/layers.test.ts guards the rest.
  {
    files: ['src/shell/**/*.{ts,tsx}'],
    ignores: ['src/shell/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/pages/**', '@pages', '@pages/*'], message: 'The shell never imports a page: move what it needs into @core or the shell.' }] },
      ],
    },
  },
  // ── Terminal files: the TERMINAL_SWEEP rules report as warnings ──
  // In terminal files and plain scenario files only, the rules in TERMINAL_SWEEP report as warnings, so every
  // finding stays in the output and the web keeps its errors. A rule leaves the list when its findings are fixed and
  // is an error again; never add a rule to TERMINAL_SWEEP. The tests block below still switches its rules off in .term tests.
  { files: TERMINAL_FILES, rules: Object.fromEntries(TERMINAL_SWEEP.map((r) => [r, 'warn'])) },
  // ── Node-side files ──
  {
    // The live harness's reporters (e2e-live gate/serve/summarize) are Node CLI scripts too.
    files: ['scripts/**/*.{ts,mts}', '*.config.{ts,mts}', 'e2e-live/{gate,serve,summarize}.ts'],
    rules: { 'no-console': 'off', 'react/jsx-no-literals': 'off', 'hub/no-raw-color': 'off', 'hub/no-text-literal': 'off' },
  },
  // Tests: assertions name strings freely.
  {
    files: ['**/*.test.{ts,tsx,mts}', '**/*.spec.ts'],
    rules: { 'react/jsx-no-literals': 'off', 'no-restricted-syntax': 'off', 'hub/no-text-literal': 'off', 'hub/no-raw-color': 'off', 'hub/one-accent': 'off', 'hub/retired-syntax': 'off', 'hub/retired-alias': 'off', 'hub/anatomy': 'off', 'hub/no-loose-faqlink': 'off', 'hub/one-band-per-section': 'off', 'hub/no-drawer-ol': 'off' },
  },
  // The gallery shows every variant side by side on purpose.
  { files: ['src/kit/gallery/**'], rules: { 'hub/one-accent': 'off' } },
  { files: ['src/kit/**/*.{ts,tsx,mts}'], rules: { 'hub/term-imports': 'error' } },
  // A kit terminal file's relative imports into src/term that term-imports.debt.cjs lacks: warnings, like the TERMINAL_SWEEP rules above.
  { files: ['src/kit/**/*.term.{ts,tsx}', 'src/kit/**/*.term.test.{ts,tsx}', ...terminalOnlyModules().filter((m) => m.startsWith('kit/')).map((m) => `src/${m}`)], rules: { 'hub/term-imports': 'warn' } },
  // Fixture data and core models hold record values (a notice's title, a program's name), not UI text.
  {
    files: ['src/pages/*/fixtures.ts', 'src/pages/*/shots.ts', 'src/core/**', 'src/app/fixtures.ts'],
    rules: { 'hub/no-text-literal': 'off', 'hub/use-data-view': 'off' },
  },
  // The same record data in a page's sub-folder (pages/files/link/fixtures.ts holds reply bodies); the block above is one level deep.
  { files: ['src/pages/*/**/fixtures.ts', 'src/pages/*/**/shots.ts'], rules: { 'hub/no-text-literal': 'off' } },
  // Scenario files (*.scenario.ts, input of the web and terminal scenario runners) and *.fixture.ts files (a scripted
  // conversation for terminal tests and benches) hold record values too, never page text.
  { files: ['src/**/*.scenario.ts', 'src/**/*.fixture.ts'], rules: { 'hub/no-text-literal': 'off' } },
  // The live e2e harness answers with fake replies (mock.ts, ask-agent.ts): record data, not UI text. It rewrites mock and agent
  // JSON of any shape, and no tsconfig type-checks e2e-live, so `any` there marks that JSON, not a skipped type.
  { files: ['e2e-live/**'], rules: { 'hub/no-text-literal': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
  // Exceptions (app/conformance/exceptions.ts): file-scoped 'off', last, so no block above turns a rule back on.
  ...exceptions.forEslint(),
];
