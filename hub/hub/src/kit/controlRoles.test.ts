// @vitest-environment node
// The control role tokens are aliases of the tokens each role reads. An alias resolves on the element that declares it
// and that value is what inherits, so every rule outside :root that redeclares an aliased token must redeclare its alias
// too (the top bar, ListDetailPage's footer), or the alias keeps :root's value there. Rules on :root itself (the dark
// theme, a coarse pointer, perf) recompute the alias already. Buttons are not a role: they read the --btn-* and
// --hx-btn-* tokens (Button.glyph.css.test.ts).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const TOKENS = path.join(SRC, 'kit', 'tokens.css');

/** Each role name and what it is at :root: an alias (`var(--old)`) or a literal of its own. */
const ROLES: Record<string, string> = {
  '--ctl-h-md': 'var(--ctl-h)',
  '--ctl-h-xs': '24px',
  '--ctl-line-field': 'var(--hx-field-line)',
  '--ctl-line-toggle': 'var(--hx-switch-line)',
  '--ctl-off-opacity': '0.5',
  '--field-pad-x': 'var(--sp-3)',
  '--field-bg': 'var(--hx-field-bg)',
  '--field-line-hover': 'var(--hx-ink)',
  '--field-off-bg': 'var(--hx-fill)',
  '--field-off-ink': 'var(--hx-muted)',
};
/** The role names that are gone: no rule declares or reads one. */
const RETIRED = ['--ctl-pad-x-md', '--ctl-pad-x-sm', '--ctl-gap', '--ctl-gap-sm', '--ctl-line-button', '--ctl-line-quiet', '--ctl-line-frame', '--ctl-ink-on', '--ctl-hover', '--ctl-press', '--hx-grey-1', '--hx-grey-2', '--hx-grey-3', '--hx-grey-4', '--hx-grey-hover', '--hx-sec-line'];
/** The old token an alias reads, or null for a literal. */
const oldOf = (value: string) => /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? null;
const ALIASES = Object.entries(ROLES).flatMap(([name, value]) => (oldOf(value) ? [[name, oldOf(value)!] as const] : []));

/** What the aliased tokens are at :root (light, fine pointer, default density). */
const TODAY: Record<string, string> = {
  '--ctl-h': '40px',
  '--sp-3': '12px',
  '--hx-field-line': '#7a7a7a',
  '--hx-switch-line': '#7a7a7a',
  '--hx-field-bg': 'var(--hx-input-bg)',
  '--hx-ink': '#272727',
  '--hx-fill': '#f2f2f2',
  '--hx-muted': 'var(--hx-muted-text)',
};

const parse = (file: string) => postcss.parse(readFileSync(file, 'utf8'), { from: file });
/** A rule whose every selector is :root itself (with attributes or pseudo-classes): it computes on the root element. */
const onRoot = (rule: Rule) => rule.selectors.every((s) => /^:root(\[[^\]]*\]|:[\w-]+(\([^)]*\))?)*$/.test(s.trim()));
/** The declarations of a rule by property (the last wins, as in CSS). */
const declsOf = (rule: Rule) => {
  const out = new Map<string, string>();
  rule.each((n) => {
    if (n.type === 'decl') out.set(n.prop, n.value.trim());
  });
  return out;
};
/** The plain :root block of tokens.css (not inside an at-rule). */
function rootDecls(): Map<string, string> {
  const out = new Map<string, string>();
  parse(TOKENS).each((n) => {
    if (n.type === 'rule' && n.selector.trim() === ':root') for (const [k, v] of declsOf(n)) out.set(k, v);
  });
  return out;
}
const cssFiles = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(SRC, f))
    .sort();

describe('control role tokens', () => {
  const root = rootDecls();

  it('every role is declared at :root, as the alias or literal it is listed as', () => {
    for (const [name, value] of Object.entries(ROLES)) expect(root.get(name), name).toBe(value);
  });

  it('no control role but these is declared at :root: every --ctl-* name is a role here or a plain size', () => {
    // The plain control heights the roles and the Button sizes are built from.
    const SIZES = ['--ctl-h', '--ctl-h-sm', '--ctl-h-compact'];
    expect([...root.keys()].filter((k) => k.startsWith('--ctl-') && !(k in ROLES) && !SIZES.includes(k))).toEqual([]);
  });

  it('the retired role names are gone: no CSS declares or reads one', () => {
    const left: string[] = [];
    for (const file of cssFiles()) {
      const names = new Set(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/--[\w-]+/g));
      for (const name of RETIRED) if (names.has(name)) left.push(`${path.relative(SRC, file)} ${name}`);
    }
    expect(left).toEqual([]);
  });

  it("every alias reads a token declared at :root, and those tokens hold their values", () => {
    for (const [name, old] of ALIASES) expect(root.has(old), `${name} -> ${old}`).toBe(true);
    for (const [old, value] of Object.entries(TODAY)) expect(root.get(old), old).toBe(value);
    expect(new Set(ALIASES.map(([, old]) => old))).toEqual(new Set(Object.keys(TODAY)));
  });

  it('a rule off :root that redeclares an aliased token redeclares its alias as the same var()', () => {
    const misses: string[] = [];
    let scoped = 0;
    for (const file of cssFiles())
      parse(file).walkRules((rule) => {
        if (onRoot(rule)) return;
        const decls = declsOf(rule);
        for (const [name, old] of ALIASES)
          if (decls.has(old)) {
            scoped++;
            if (decls.get(name) !== `var(${old})`) misses.push(`${path.relative(SRC, file)} ${rule.selector} redeclares ${old} without ${name}`);
          }
      });
    expect(misses).toEqual([]);
    // the top bar and ListDetailPage's narrow footer: a scan that finds neither has stopped reading
    expect(scoped).toBeGreaterThanOrEqual(2);
  });

  it('a role is declared nowhere else, but beside a redeclaration of the token it aliases', () => {
    const stray: string[] = [];
    for (const file of cssFiles())
      parse(file).walkRules((rule) => {
        const decls = declsOf(rule);
        for (const name of Object.keys(ROLES)) {
          if (!decls.has(name)) continue;
          if (file === TOKENS && rule.selector.trim() === ':root' && rule.parent?.type === 'root') continue;
          const old = oldOf(ROLES[name]!);
          if (old === null || !decls.has(old) || decls.get(name) !== `var(${old})`) stray.push(`${path.relative(SRC, file)} ${rule.selector} ${name}`);
        }
      });
    expect(stray).toEqual([]);
  });
});
