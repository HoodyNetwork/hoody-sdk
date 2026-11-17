// @vitest-environment node
// Lint flip: the design rules of both linters fail, `dashed` has one allowance (the side
// nav's item line), and a rule that cannot fit a file gets an entry in app/conformance/exceptions.ts, read by
// scripts/lint/exceptions.cjs. Run through the Hub's real configs, as conformance.pageboundaries.test.ts and
// kit/controls/Button.bluelint.test.ts do; each case reads only its own rule's messages.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EXCEPTIONS } from './conformance/exceptions';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const SRC = path.join(HUB, 'src');
const X = createRequire(import.meta.url)('../../scripts/lint/exceptions.cjs') as {
  EXCEPTABLE: Set<string>;
  ESLINT: string[];
  STYLELINT: string[];
  check(entries: unknown): Array<{ path: string; folder: boolean; rules: string[] }>;
  load(): Array<{ path: string; folder: boolean; rules: string[] }>;
  parse(text: string): unknown;
  forEslint(entries?: unknown): Array<{ files: string[]; rules: Record<string, unknown> }>;
  forStylelint(entries?: unknown): Array<{ files: string[]; rules: Record<string, unknown> }>;
};

const ESLINT_FLIPPED = ['hub/one-accent', 'hub/no-text-literal', 'hub/no-raw-color', 'hub/retired-syntax'];
// Every test here runs a linter: the default test budget, stretched by the host's load like the explicit ones.
vi.setConfig({ testTimeout: lintMs(15_000) });

const STYLELINT_FLIPPED = ['hub/blue-only-link-focus', 'hub/no-dashed', 'hub/token-use'];

// The real config, running only the flipped rules: lintRule reads one of them at a time, so no lint pays for the others (the
// anatomy rule's cold whole-tree scan above all). The config itself (severities included) is the whole one.
const eslint = new ESLint({ cwd: HUB, overrideConfigFile: path.join(HUB, 'eslint.config.js'), ruleFilter: ({ ruleId }) => ESLINT_FLIPPED.includes(ruleId) });
const PAGE_VIEW = path.join(SRC, 'pages', 'computers', 'view.tsx');
const PAGE_CSS = path.join(SRC, 'pages', 'computers', 'plant.module.css');

// The first lint of each linter pays its config and plugin load (stylelint's standard config too); warm both once, under
// their own timeout.
beforeAll(async () => {
  await eslint.lintText('export const x = 1;\n', { filePath: PAGE_VIEW });
  await cssRule('hub/no-dashed', '.x { color: inherit; }\n');
}, lintMs(120_000));

/** The messages one rule gives a text linted as `file`, through the real config (plus an optional extra config block). */
async function lintRule(ruleId: string, code: string, file = PAGE_VIEW, linter: ESLint = eslint) {
  // A rule the linter does not run would give no messages and pass every "allowed" case unseen.
  if (linter === eslint && !ESLINT_FLIPPED.includes(ruleId)) throw new Error(`lintRule: ${ruleId} is not run by the shared linter (ESLINT_FLIPPED)`);
  const [r] = await linter.lintText(code, { filePath: file });
  return (r?.messages ?? []).filter((m) => m.ruleId === ruleId);
}
async function cssRule(rule: string, code: string, file = PAGE_CSS, config?: object) {
  const base = config ?? (await import(path.join(HUB, 'stylelint.config.mjs'))).default;
  const { results } = await stylelint.lint({ code, codeFilename: file, config: base });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === rule);
}

describe('severities', () => {
  it('the four flipped eslint rules are errors and hub/anatomy still warns', async () => {
    const cfg = (await eslint.calculateConfigForFile(PAGE_VIEW)) as { rules: Record<string, unknown> };
    const sev = (id: string) => (Array.isArray(cfg.rules[id]) ? (cfg.rules[id] as unknown[])[0] : cfg.rules[id]);
    for (const id of ESLINT_FLIPPED) expect([id, sev(id)], id).toEqual([id, 2]);
    expect(sev('hub/anatomy')).toBe(1);
  });
  it('the three flipped stylelint rules carry no warning severity and hub/page-anatomy-css keeps it', async () => {
    const { rules } = (await import(path.join(HUB, 'stylelint.config.mjs'))).default as { rules: Record<string, unknown> };
    const severityOf = (id: string) => (rules[id] as [unknown, { severity?: string }?])[1]?.severity;
    for (const id of STYLELINT_FLIPPED) expect([id, severityOf(id)], id).toEqual([id, undefined]);
    expect(severityOf('hub/page-anatomy-css')).toBe('warning');
  });
});

describe('one plant per flipped rule is an error', () => {
  it('hub/one-accent: two primary Buttons rendered together', async () => {
    const m = await lintRule('hub/one-accent', "export const V = () => (<div><Button variant=\"primary\">{t('a')}</Button><Button variant=\"primary\">{t('b')}</Button></div>);\n");
    expect(m.map((x) => x.severity)).toEqual([2]);
  });
  it('hub/no-text-literal: a column label in an object literal', async () => {
    const m = await lintRule('hub/no-text-literal', "export const cols = [{ label: 'Open the file' }];\n");
    expect(m.map((x) => x.severity)).toEqual([2]);
  });
  it('hub/no-raw-color: a hex colour', async () => {
    const m = await lintRule('hub/no-raw-color', "export const c = '#ff0000';\n");
    expect(m.map((x) => x.severity)).toEqual([2]);
  });
  it('hub/retired-syntax: variant="subtle" and a JSX ellipsis', async () => {
    const subtle = await lintRule('hub/retired-syntax', "export const V = () => <Link variant=\"subtle\">{t('a')}</Link>;\n");
    const dots = await lintRule('hub/retired-syntax', 'export const V = () => <span>…</span>;\n');
    expect([subtle, dots].map((m) => m.map((x) => x.severity))).toEqual([[2], [2]]);
  });
  it('hub/blue-only-link-focus: blue fill in a page stylesheet', async () => {
    const w = await cssRule('hub/blue-only-link-focus', '.x { background: var(--hx-blue); }\n');
    expect(w.map((x) => x.severity)).toEqual(['error']);
  });
  it('hub/no-dashed: a dashed border', async () => {
    const w = await cssRule('hub/no-dashed', '.x { border: 1px dashed var(--hx-line); }\n');
    expect(w.map((x) => x.severity)).toEqual(['error']);
  });
  it('hub/token-use: the app surface without app ink', async () => {
    const w = await cssRule('hub/token-use', '.x { background: var(--hx-app); }\n');
    expect(w.map((x) => x.severity)).toEqual(['error']);
  });
  it('hub/page-anatomy-css stays a warning', async () => {
    const { rules } = (await import(path.join(HUB, 'stylelint.config.mjs'))).default as { rules: Record<string, unknown[]> };
    expect(rules['hub/page-anatomy-css']?.[1]).toEqual({ severity: 'warning' });
  });
});

describe('dashed only with the nav item line token, on a border', () => {
  const dashed = async (decl: string) => (await cssRule('hub/no-dashed', `.x { ${decl} }\n`)).length;
  it('border-block-start with var(--hx-nav-line-item) is allowed', async () => {
    expect(await dashed('border-block-start: var(--bw) dashed var(--hx-nav-line-item);')).toBe(0);
    expect(await dashed('border: 1px dashed var(--hx-nav-line-item);')).toBe(0);
  });
  it('border-inline-start with var(--hx-section-rail) is allowed', async () => {
    expect(await dashed('border-inline-start: var(--bw) dashed var(--hx-section-rail);')).toBe(0);
  });
  it('border-inline-end with var(--hx-card-rail-line) is allowed', async () => {
    expect(await dashed('border-inline-end: var(--bw) dashed var(--hx-card-rail-line);')).toBe(0);
  });
  it('border-block-end with var(--hx-ledger-line) or var(--hx-ledger-head-line) is allowed', async () => {
    expect(await dashed('border-block-end: var(--bw) dashed var(--hx-ledger-line);')).toBe(0);
    expect(await dashed('border-block-end: var(--bw) dashed var(--hx-ledger-head-line);')).toBe(0);
  });
  it.each([
    'border: 1px dashed var(--hx-nav-line);',
    'outline: 1px dashed var(--hx-nav-line-item);',
    'outline: 1px dashed var(--hx-section-rail);',
    'outline: 1px dashed var(--hx-card-rail-line);',
    'outline: 1px dashed var(--hx-ledger-line);',
    'border: 1px dashed var(--hx-ledger-head-bg);',
    'border: 1px dashed var(--hx-ledger-line-x);',
    'border: 1px dashed var(--hx-card-rail);',
    'border: 1px dashed var(--hx-section-rail-x);',
    'border-style: dashed;',
    'border: 1px dashed var(--hx-nav-line-item-2);',
    'border: 1px dashed var(--hx-nav-line-item, red);',
    'border: 1px dashed var(--hx-line, var(--hx-nav-line-item));',
    'border: 1px dashed var(--hx-line, ") var(--hx-nav-line-item) (");',
    "border: 1px dashed var(--hx-line, ') var(--hx-nav-line-item) (');",
    'border: 1px dashed var(--hx-line, "\\") var(--hx-nav-line-item) (");',
    'border: 1px dashed var(--hx-line, \\) var(--hx-nav-line-item) );',
    'border: 1px dashed var(--hx-line, \\) var(--hx-nav-line-item) \\();',
  ])('still reports %s', async (decl) => {
    expect(await dashed(decl)).toBe(1);
  });
});

describe('exceptions.cjs check() refuses a malformed list', () => {
  const good = { path: 'kit/forms/ColorPicker.tsx', rules: ['hub/no-raw-color'], why: 'api data', by: 'design review' };
  it('a good entry passes, and a folder keeps its trailing slash', () => {
    expect(X.check([good])).toEqual([{ path: 'kit/forms/ColorPicker.tsx', folder: false, rules: ['hub/no-raw-color'] }]);
    expect(X.check([{ ...good, path: 'kit/forms/' }])[0]).toMatchObject({ folder: true });
    expect(() => X.check([{ ...good, until: 'some-change-1' }])).not.toThrow();
  });
  it.each(['/abs/path.ts', '../up.ts', './here.ts', 'a//b.ts', 'a/*.ts', 'a/?.ts', 'a/[x].ts', 'a/{x}.ts', 'a/!x.ts', '', 'a/.hidden.ts'])('refuses the path %j', (p) => {
    expect(() => X.check([{ ...good, path: p }])).toThrow(/path/);
  });
  it.each([[[]], [['hub/anatomy']], [['hub/page-boundaries']], [['std.publicText']], [['std.inlineDisable']], [['hub/no-raw-color', 'nope']]])('refuses the rules %j', (rules) => {
    expect(() => X.check([{ ...good, rules }])).toThrow(/rules/);
  });
  it('refuses an empty why or by, an empty until, and an unknown key', () => {
    expect(() => X.check([{ ...good, why: ' ' }])).toThrow(/why and by/);
    expect(() => X.check([{ ...good, by: '' }])).toThrow(/why and by/);
    expect(() => X.check([{ ...good, until: '' }])).toThrow(/until/);
    expect(() => X.check([{ ...good, untill: 'x' }])).toThrow(/unknown key/);
  });
  it('reads the list as literal syntax only: accessors, calls, __proto__ and syntax errors are refused', () => {
    const list = (body: string) => `export const EXCEPTIONS = ${body};`;
    expect(X.parse(list("[{ path: 'kit/', rules: ['hub/no-raw-color'], why: 'w', by: 'b' }]"))).toEqual([{ path: 'kit/', rules: ['hub/no-raw-color'], why: 'w', by: 'b' }]);
    expect(() => X.parse(list("[{ get path() { return 'kit/'; } }]"))).toThrow(/plain/);
    expect(() => X.parse(list("[{ path: String('kit/') }]"))).toThrow(/literal/);
    expect(() => X.parse(list("[{ ['pa' + 'th']: 'kit/' }]"))).toThrow(/plain/);
    expect(() => X.parse(list("[{ __proto__: { path: 'kit/' } }]"))).toThrow(/__proto__/);
    expect(() => X.parse(list('[;'))).toThrow(/exceptions\.ts/);
    expect(() => X.parse('export const OTHER = [];')).toThrow(/no EXCEPTIONS/);
  });
  it('refuses a list that is not an array', () => {
    expect(() => X.check({})).toThrow(/not an array/);
  });
  // sites narrow a ui.* entry to the functions the hits sit in; lint overrides stay whole files, so no hub/ or std rule
  it('takes sites only on an all-ui entry, as unique function names or <module>', () => {
    const ui = { path: 'shell/Switchers.tsx', rules: ['ui.computerList'], why: 'w', by: 'b' };
    expect(() => X.check([{ ...ui, sites: ['ComputerSwitcher', 'PhoneContext', '<module>', '$x', '_y'] }])).not.toThrow();
    for (const sites of [[], ['A', 'A'], [''], ['a.b'], ['<Module>'], ['1a'], 'A', [1]])
      expect(() => X.check([{ ...ui, sites }]), JSON.stringify(sites)).toThrow(/sites/);
    expect(() => X.check([{ ...good, sites: ['A'] }])).toThrow(/sites/);
    expect(() => X.check([{ ...ui, rules: ['ui.computerList', 'std.chatName'], sites: ['A'] }])).toThrow(/sites/);
  });
});

describe('override shapes', () => {
  const entries = X.check([
    { path: 'kit/forms/ColorPicker.tsx', rules: ['hub/no-raw-color', 'hub/no-dashed', 'std.chatName'], why: 'w', by: 'b' },
    { path: 'kit/qr/', rules: ['hub/no-raw-color'], why: 'w', by: 'b' },
    { path: 'kit/forms/gone-for-good.tsx', rules: ['hub/no-raw-color'], why: 'w', by: 'b' },
  ]);
  it('eslint gets src/<file> (a folder adds **) and only eslint ids', () => {
    expect(X.forEslint(entries)).toEqual([
      { files: ['src/kit/forms/ColorPicker.tsx'], rules: { 'hub/no-raw-color': 'off' } },
      { files: ['src/kit/qr/**'], rules: { 'hub/no-raw-color': 'off' } },
    ]);
  });
  it('stylelint gets **/src/<file> and only stylelint ids; std ids reach neither; a missing path gives nothing', () => {
    expect(X.forStylelint(entries)).toEqual([{ files: ['**/src/kit/forms/ColorPicker.tsx'], rules: { 'hub/no-dashed': null } }]);
    expect(JSON.stringify([X.forEslint(entries), X.forStylelint(entries)])).not.toMatch(/std\.|gone-for-good/);
  });
});

describe('the real configs honour an entry for its own file only', () => {
  it('ColorPicker.tsx may hold a hex colour and its sibling may not', async () => {
    const code = "export const c = '#ff0000';\n";
    expect(await lintRule('hub/no-raw-color', code, path.join(SRC, 'kit', 'forms', 'ColorPicker.tsx'))).toHaveLength(0);
    expect(await lintRule('hub/no-raw-color', code, path.join(SRC, 'kit', 'forms', 'hexColor.ts'))).toHaveLength(1);
  });
  it('a stylelint entry switches off its own file and leaves its sibling on', async () => {
    const base = (await import(path.join(HUB, 'stylelint.config.mjs'))).default as { overrides: object[] };
    const config = { ...base, overrides: [...base.overrides, ...X.forStylelint(X.check([{ path: 'kit/forms/OtpField.module.css', rules: ['hub/no-dashed'], why: 'w', by: 'b' }]))] };
    const code = '.x { border: 1px dashed var(--hx-line); }\n';
    expect(await cssRule('hub/no-dashed', code, path.join(SRC, 'kit', 'forms', 'OtpField.module.css'), config)).toHaveLength(0);
    expect(await cssRule('hub/no-dashed', code, path.join(SRC, 'kit', 'forms', 'Secret.module.css'), config)).toHaveLength(1);
  });
  it('record data in a nested page fixtures.ts is not UI text, a nested view still is', async () => {
    const code = "export const body = { message: 'Download accepted' };\n";
    expect(await lintRule('hub/no-text-literal', code, path.join(SRC, 'pages', 'files', 'link', 'fixtures.ts'))).toHaveLength(0);
    expect(await lintRule('hub/no-text-literal', code, path.join(SRC, 'pages', 'files', 'link', 'view.ts'))).toHaveLength(1);
  });
  it('mock replies in the live e2e harness are record data, not UI text; a view next to it still is', async () => {
    const code = "export const reply = { message: 'live mock: no id' };\n";
    expect(await lintRule('hub/no-text-literal', code, path.join(HUB, 'e2e-live', 'mock.ts'))).toHaveLength(0);
    expect(await lintRule('hub/no-text-literal', code, path.join(HUB, 'e2e-live', 'nested', 'ask-agent.ts'))).toHaveLength(0);
    expect(await lintRule('hub/no-text-literal', code, path.join(SRC, 'pages', 'files', 'link', 'view.ts'))).toHaveLength(1);
  });
  it('the loader parse equals the TS import of EXCEPTIONS', () => {
    expect(X.load()).toEqual(EXCEPTIONS.map((e) => ({ path: e.path, folder: e.path.endsWith('/'), rules: [...e.rules] })));
  });
});

describe('every hub/ rule of every entry is used (an unused entry would quietly re-allow its file)', () => {
  const filesOf = (p: string): string[] => {
    const abs = path.join(SRC, p);
    if (!p.endsWith('/')) return existsSync(abs) ? [abs] : [];
    return readdirSync(abs, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .map((f) => path.join(abs, f));
  };
  /** One linter per eslint rule: the real config with the rule forced on after every exception, and only that rule run
   *  (ruleFilter; the count reads only its messages anyway), so no case pays for the others or for anatomy's whole-tree scan. */
  const forced = new Map<string, ESLint>();
  const forcedFor = (rule: string): ESLint => {
    let l = forced.get(rule);
    if (!l) {
      l = new ESLint({ cwd: HUB, overrideConfigFile: path.join(HUB, 'eslint.config.js'), overrideConfig: { rules: { [rule]: 'error' } }, ruleFilter: ({ ruleId }) => ruleId === rule });
      forced.set(rule, l);
    }
    return l;
  };
  /** Hits of `rule` over the entry's files with the rule forced on after every exception. */
  async function hits(p: string, rule: string): Promise<number> {
    const files = filesOf(p);
    if (X.ESLINT.includes(rule)) {
      const results = await forcedFor(rule).lintFiles(files.filter((f) => /\.tsx?$/.test(f)));
      return results.flatMap((r) => r.messages).filter((m) => m.ruleId === rule).length;
    }
    // A stylesheet rule: the real config (its plugins and every other key) with only the forced rule, so no other rule runs (not
    // even the standard set it extends); all of the entry's stylesheets in one lint.
    const base = (await import(path.join(HUB, 'stylelint.config.mjs'))).default as { rules: Record<string, unknown> };
    const config = { ...base, extends: [], rules: { [rule]: true }, overrides: [] };
    const css = files.filter((x) => x.endsWith('.css'));
    if (css.length === 0) return 0;
    const { results } = await stylelint.lint({ files: css, config });
    return results.flatMap((r) => r.warnings).filter((w) => w.rule === rule).length;
  }
  /** The verdict: an entry's rule is still needed when the file breaks it with the rule forced on. */
  const stillNeeded = async (p: string, rule: string): Promise<boolean> => (await hits(p, rule)) > 0;
  const pairs = EXCEPTIONS.flatMap((e) => e.rules.filter((r) => r.startsWith('hub/')).map((r) => [e.path, r] as const));
  it.each(pairs)('%s still needs %s', async (p, rule) => {
    expect(await stillNeeded(p, rule), `${p} no longer breaks ${rule}: remove it from the entry in app/conformance/exceptions.ts`).toBe(true);
  }, lintMs(60_000));
  it('a clean file is reported unused', async () => {
    expect(await stillNeeded('kit/forms/OtpField.tsx', 'hub/no-raw-color')).toBe(false);
  }, lintMs(60_000));
});
