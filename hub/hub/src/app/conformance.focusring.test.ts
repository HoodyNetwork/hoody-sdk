// @vitest-environment node
// hub/focus-ring-token (scripts/lint/stylelint-hub.mjs): kit focus has one shape, the
// --focus-ring box-shadow (--focus-ring-inset where a strip clips). An outline in a focus colour is an error outside
// forced-colors. Fixtures run the rule alone; the Hub's real config turns it on for kit CSS (base.css aside, the global
// default ring); and today's misses are frozen in scripts/lint/focus-ring.debt.cjs, which only shrinks.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import postcss from 'postcss';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const SRC = path.join(HUB, 'src');
const KIT = path.join(SRC, 'kit');
const RULE = 'hub/focus-ring-token';
const KIT_FILE = path.join(KIT, 'controls', 'plant.module.css');
/** The rows frozen when the rule came in (file|at-rules|selector|property|value). This list only loses lines (as control-size's FROZEN). */
const FROZEN = [
  'kit/data/DataTable.module.css||.cards .tr:focus-visible|outline|var(--bw-2) solid var(--hx-focus)',
  'kit/data/DataTable.module.css||.icons .tr:focus-visible|outline|var(--bw-2) solid var(--hx-focus)',
  'kit/data/DataTable.module.css||.wrap[data-drop-over], .nothing[data-drop-over]|outline|var(--bw-2) solid var(--hx-focus)',
  'kit/data/DataTable.module.css||.tr[data-drop-over]|outline|var(--bw-2) solid var(--hx-focus)',
];
const FIX_BY = new Set(['focus-ring token', 'keep']);

type Row = { file: string; at?: string; selector: string; prop: string; value: string; fixBy: string; why: string };
const { ROWS } = createRequire(import.meta.url)('../../scripts/lint/focus-ring.debt.cjs') as { ROWS: Row[] };
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const keyOf = (r: Pick<Row, 'file' | 'at' | 'selector' | 'prop' | 'value'>) => [r.file, squash(r.at ?? ''), squash(r.selector), r.prop, squash(r.value)].join('|');

const pluginFile = async () => (await import(path.join(HUB, 'scripts', 'lint', 'stylelint-hub.mjs'))) as { default: object[]; controlSizeKey: (file: string, decl: postcss.Declaration) => string };
const realConfig = async () => (await import(path.join(HUB, 'stylelint.config.mjs'))).default as object;
/** How many declarations the rule reports in a stylesheet; `debt: false` reports the rows too. */
async function hits(code: string, file = KIT_FILE, opts: object = { debt: false }): Promise<number> {
  const { results } = await stylelint.lint({ code, codeFilename: file, config: { plugins: (await pluginFile()).default, rules: { [RULE]: [true, opts] } } });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE).length;
}
async function realHits(code: string, file: string): Promise<number> {
  const { results } = await stylelint.lint({ code, codeFilename: file, config: await realConfig() });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE).length;
}
const kitFiles = () =>
  readdirSync(KIT, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(KIT, f))
    .sort();

describe('hub/focus-ring-token: what is a focus outline', () => {
  it('an outline or outline-color naming a focus token is one, in any form', async () => {
    expect(await hits('.x[data-focus-visible] { outline: 2px solid var(--hx-focus); }\n')).toBe(1);
    expect(await hits('.x:focus-visible { outline-color: var(--hx-focus); }\n')).toBe(1);
    expect(await hits('.x { outline: var(--bw-2) solid var(--hx-focus-ring-x, red); }\n')).toBe(1);
    expect(await hits('.x { @media (width >= 600px) { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
    expect(await hits('@media (prefers-contrast: more) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
    // A query that also holds outside forced colours is no exemption.
    expect(await hits('@media (forced-colors: active), (min-width: 1px) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
    expect(await hits('@media not (forced-colors: active) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
    expect(await hits('@media (forced-colors: active) or (width >= 1px) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
    expect(await hits('@media (forced-colors: none) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(1);
  });
  it('forced colours may draw it, and the ring itself, other colours and other properties pass', async () => {
    expect(await hits('@media (forced-colors: active) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(0);
    expect(await hits('@media (forced-colors: active) { .x { @media (width >= 600px) { outline-color: var(--hx-focus); } } }\n')).toBe(0);
    expect(await hits('@media screen and (forced-colors: active) { .x { outline: 2px solid var(--hx-focus); } }\n')).toBe(0);
    expect(await hits('.x { box-shadow: var(--focus-ring); outline: none; }\n')).toBe(0);
    expect(await hits('.x { outline: var(--bw-2) solid var(--hx-selected-bar); }\n')).toBe(0);
    expect(await hits('.x { border-color: var(--hx-focus); outline-offset: 2px; }\n')).toBe(0);
  });
  it('a debt row skips exactly its one declaration in its file', async () => {
    const row = ROWS[0]!;
    const file = path.join(SRC, row.file);
    const decl = `${row.selector} { ${row.prop}: ${row.value}; }\n`;
    expect(await hits(decl, file, {})).toBe(0);
    expect(await hits(decl + decl, file, {})).toBe(1);
    expect(await hits(decl, KIT_FILE, {})).toBe(1);
    expect(await hits(`@media (width >= 600px) { ${decl} }\n`, file, {})).toBe(1);
  });
});

describe('hub/focus-ring-token: the real config and the debt', () => {
  it('the Hub config runs it on kit CSS, base.css aside', async () => {
    const code = '.x[data-focus-visible] { outline: 2px solid var(--hx-focus); }\n';
    expect(await realHits(code, KIT_FILE)).toBe(1);
    expect(await realHits(code, path.join(KIT, 'base.css'))).toBe(0);
    expect(await realHits(code, path.join(SRC, 'pages', 'home', 'plant.module.css'))).toBe(0);
  }, lintMs(120_000));

  it('every kit stylesheet passes it through the Hub config (the debt rows applied)', async () => {
    const { results } = await stylelint.lint({ files: kitFiles(), config: await realConfig() });
    const found = results.flatMap((r) => r.warnings.filter((w) => w.rule === RULE).map((w) => `${path.relative(SRC, r.source ?? '')}:${w.line} ${w.text}`));
    expect(found).toEqual([]);
  }, lintMs(300_000));

  it('the debt is exactly what the rule finds in kit CSS (base.css aside), counted: no hit unlisted, no row stale', async () => {
    const { controlSizeKey, default: plugins } = await pluginFile();
    const files = kitFiles().filter((f) => path.basename(f) !== 'base.css');
    const { results } = await stylelint.lint({ files, config: { plugins, rules: { [RULE]: [true, { debt: false }] } } });
    const left: string[] = [];
    for (const r of results) {
      const ws = r.warnings.filter((w) => w.rule === RULE);
      if (!ws.length) continue;
      const decls: postcss.Declaration[] = [];
      postcss.parse(readFileSync(r.source!, 'utf8')).walkDecls((d) => void decls.push(d));
      for (const w of ws) {
        // The warning's full position (line and column: a line may hold several declarations).
        const at = (p: { line: number; column: number }) => p.line * 1e6 + p.column;
        const d = decls.find((x) => at(x.source!.start!) <= at(w) && at(w) <= at(x.source!.end!));
        if (!d) throw new Error(`no declaration at ${r.source}:${w.line}`);
        left.push(controlSizeKey(r.source!, d));
      }
    }
    const stale = ROWS.map(keyOf).filter((k) => {
      const i = left.indexOf(k);
      if (i >= 0) left.splice(i, 1);
      return i < 0;
    });
    expect(left, 'a focus outline not in focus-ring.debt.cjs: use box-shadow var(--focus-ring)').toEqual([]);
    expect(stale, 'a debt row that hits nothing: delete it (the debt only shrinks)').toEqual([]);
  }, lintMs(300_000));

  it('the debt only shrinks, and every row says why (a keep row, the outline that is no focus ring)', () => {
    expect(ROWS.map(keyOf).sort(), 'the debt and FROZEN: a fixed row leaves both, and nothing joins either').toEqual([...FROZEN].sort());
    for (const r of ROWS) {
      expect(FIX_BY.has(r.fixBy), `${r.file} ${r.selector}: fixBy ${r.fixBy}`).toBe(true);
      expect(r.why.length, `${r.file} ${r.selector}: why`).toBeGreaterThanOrEqual(20);
      if (r.fixBy === 'keep') expect(r.why, `${r.file} ${r.selector}: a keep row names its non-focus role`).toMatch(/^[^:]{4,}: .*\bnot a focus ring\b/);
      else expect(r.why, `${r.file} ${r.selector}`).toContain(r.fixBy);
    }
  });
});
