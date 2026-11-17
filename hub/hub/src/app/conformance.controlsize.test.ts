// @vitest-environment node
// hub/control-size-token (scripts/lint/stylelint-hub.mjs): a kit control's height and width come from size
// tokens, never a raw length or a spacing step. Fixtures run the rule alone; the Hub's real config turns it on for kit CSS
// only; and today's misses are frozen in scripts/lint/control-size.debt.cjs, which only shrinks: the debt is
// exactly what the rule finds with its rows switched off, counted, each row is one FROZEN holds, and each says why and when.
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
const RULE = 'hub/control-size-token';
const KIT_FILE = path.join(KIT, 'controls', 'plant.module.css');
/** The frozen rows (file|at-rules|selector|property|value). This list only loses lines: a change that fixes a row deletes it
 *  here and in the debt file. A line added or changed here is a new exception; so a row cannot be
 *  swapped for another, or a value moved along with its CSS, without a line in this list saying so. */
const FROZEN = [
  'kit/data/DataTable.module.css|@media not (pointer: coarse)|.groupInnerStacked .groupExtra :is(a[href], button)|min-block-size|24px',
  'kit/data/DataTable.module.css||.groupBtn.groupBtnStacked|min-block-size|max(24px, var(--touch-min))',
  'kit/data/Display.module.css||.tag .tagRemove|height|calc(20px - 2 * var(--bw))',
  'kit/data/Display.module.css||.tag .tagRemove|width|calc(20px - 2 * var(--bw))',
  'kit/layouts/Splitter.module.css||.horizontal|block-size|8px',
  'kit/layouts/Splitter.module.css||.vertical|inline-size|8px',
  'kit/overlays/Drawer.module.css||.resizer|inline-size|8px',
  'kit/overlays/InfoTip.module.css||.icon|block-size|max(24px, var(--touch-min))',
  'kit/overlays/InfoTip.module.css||.icon|inline-size|max(24px, var(--touch-min))',
  'kit/overlays/Menu.module.css||.menu[data-pictures] .lead|width|22px',
  'kit/states/Toast.module.css||.toast|width|min(var(--toast-w, 360px), calc(100vw - 2 * var(--sp-4)))',
];
const FIX_BY = new Set(['ctl-h tokens', 'keep']);

type Row = {
  file: string;
  at?: string;
  selector: string;
  prop: string;
  value: string;
  fixBy: string;
  why: string;
};
const { ROWS } = createRequire(import.meta.url)('../../scripts/lint/control-size.debt.cjs') as { ROWS: Row[] };
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const keyOf = (r: Pick<Row, 'file' | 'at' | 'selector' | 'prop' | 'value'>) => [r.file, squash(r.at ?? ''), squash(r.selector), r.prop, squash(r.value)].join('|');

const pluginFile = async () => (await import(path.join(HUB, 'scripts', 'lint', 'stylelint-hub.mjs'))) as { default: object[]; controlSizeKey: (file: string, decl: postcss.Declaration) => string };
const plugins = async () => (await pluginFile()).default;
const realConfig = async () => (await import(path.join(HUB, 'stylelint.config.mjs'))).default as object;
/** The raw sizes the rule reports in a stylesheet, as the quoted value of each report; `debt: false` reports the rows too. */
async function hits(code: string, file = KIT_FILE, opts: object = { debt: false }): Promise<string[]> {
  const { results } = await stylelint.lint({
    code,
    codeFilename: file,
    config: { plugins: await plugins(), rules: { [RULE]: [true, opts] } },
  });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE).map((w) => /"([^"]+)"/.exec(w.text)?.[1] ?? '');
}
/** How many times the rule reports through the Hub's real config for a stylesheet at `file`. */
async function realHits(code: string, file: string): Promise<number> {
  const { results } = await stylelint.lint({
    code,
    codeFilename: file,
    config: await realConfig(),
  });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE).length;
}
const kitFiles = () =>
  readdirSync(KIT, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(KIT, f))
    .sort();
/** Every declaration the rule reports in kit CSS with the debt off, as debt keys (the report's position names it). */
async function kitDebt(): Promise<string[]> {
  const files = kitFiles();
  const { controlSizeKey } = await pluginFile();
  const { results } = await stylelint.lint({
    files,
    config: {
      plugins: await plugins(),
      rules: { [RULE]: [true, { debt: false }] },
    },
  });
  const out: string[] = [];
  for (const r of results) {
    const ws = r.warnings.filter((w) => w.rule === RULE);
    if (!ws.length) continue;
    const decls: postcss.Declaration[] = [];
    postcss.parse(readFileSync(r.source!, 'utf8')).walkDecls((d) => void decls.push(d));
    const before = (a: { line: number; column: number }, b: { line: number; column: number }) => a.line < b.line || (a.line === b.line && a.column <= b.column);
    for (const w of ws) {
      const d = decls.find((x) => before(x.source!.start!, w) && before(w, x.source!.end!));
      if (!d) throw new Error(`no declaration at ${r.source}:${w.line}:${w.column}`);
      out.push(controlSizeKey(r.source!, d));
    }
  }
  return out;
}

describe('hub/control-size-token: what is a control', () => {
  it('a button tag, a state attribute, a control role, a state pseudo or a .button class sizes a control', async () => {
    expect(await hits('.button { height: 30px; }\n')).toEqual(['30px']);
    expect(await hits('.buttonSm { min-width: 3rem; }\n')).toEqual(['3rem']);
    expect(await hits('.x[data-hovered] { min-height: 2rem; }\n')).toEqual(['2rem']);
    expect(await hits(".x[role='tab'] { min-width: 44px; }\n")).toEqual(['44px']);
    expect(await hits('.x:focus-visible { block-size: 20px; }\n')).toEqual(['20px']);
    expect(await hits('.box input { width: 8ch; }\n')).toEqual(['8ch']);
    expect(await hits('.bar :is(a[href], button) { min-block-size: 24px; }\n')).toEqual(['24px']);
  });
  it('a class the file styles in a state is a control, and so is a part under it; an ancestor is not', async () => {
    expect(await hits('.y { width: var(--sp-6); }\n.y:hover { color: var(--hx-ink); }\n')).toEqual(['var(--sp-6)']);
    expect(await hits('.y { width: var(--sp-6); }\n')).toEqual([]);
    expect(await hits('.track { height: 20px; }\n.sw[data-selected] .track { color: var(--hx-ink); }\n')).toEqual(['20px']);
    expect(await hits('.wrap { height: 20px; }\n.wrap .b:hover { color: var(--hx-ink); }\n')).toEqual([]);
    expect(await hits('.y { width: 20px; }\n.y:not(:hover) { color: var(--hx-ink); }\n')).toEqual([]);
  });
  it('the last compound decides, and a pseudo-element is never the control box', async () => {
    expect(await hits('.button .label { height: 20px; }\n')).toEqual([]);
    expect(await hits('.button::before { inline-size: 44px; block-size: 44px; }\n')).toEqual([]);
    expect(await hits('.x[data-pressed]::after { width: 10px; }\n')).toEqual([]);
  });
  it('only the sized element counts: :has() and :not() name others, and so does an :is() argument before its last compound', async () => {
    expect(await hits('.layout:has(button:hover) { width: 300px; }\n')).toEqual([]);
    expect(await hits('.layout { width: 300px; }\n.layout:has(button:hover) { color: var(--hx-ink); }\n')).toEqual([]);
    expect(await hits(':is(button .label) { height: 20px; }\n')).toEqual([]);
    expect(await hits(':is(.a, button) { height: 20px; }\n')).toEqual(['20px']);
    expect(await hits('.y { width: 20px; }\n:is(.y:hover) { color: var(--hx-ink); }\n')).toEqual(['20px']);
  });
  it('a nested rule is judged by what it resolves to, and a declaration in a nested at-rule by the rule around it', async () => {
    expect(await hits('.button { &.wide { inline-size: 31px; } }\n')).toEqual(['31px']);
    expect(await hits('.button { @media (width >= 600px) { block-size: 31px; } }\n')).toEqual(['31px']);
    expect(await hits('.x { > button { width: 9px; } }\n')).toEqual(['9px']);
    expect(await hits('.button { & .label { height: 20px; } }\n')).toEqual([]);
    expect(await hits('.y { width: 20px; &:hover { color: var(--hx-ink); } }\n')).toEqual(['20px']);
  });
});

describe('hub/control-size-token: what is raw', () => {
  it('a non-zero length or a spacing step is raw, once per declaration, a var() fallback included', async () => {
    expect(await hits('.button { height: calc(var(--sp-10) + var(--sp-7)); }\n')).toEqual(['var(--sp-10)']);
    expect(await hits('.button { min-block-size: max(24px, var(--touch-min)); }\n')).toEqual(['24px']);
    expect(await hits('.button { height: var(--btn-h, 30px); }\n')).toEqual(['30px']);
    expect(await hits('.button { width: calc(20px - 2 * var(--bw)); }\n')).toEqual(['20px']);
  });
  it('size tokens, zero, percentages, keywords, max-* and other properties pass', async () => {
    for (const v of ['var(--btn-h)', 'var(--ctl-h-md)', 'max(var(--ctl-h), var(--touch-min))', '0', '100%', 'auto', 'fit-content', 'calc(var(--ctl-h) * 2)'])
      expect(await hits(`.button { height: ${v}; }\n`), v).toEqual([]);
    expect(await hits('.button { max-width: 300px; max-height: var(--sp-6); padding: 0 var(--sp-3); --btn-req: 44px; }\n')).toEqual([]);
  });
  // A row whose selector is a control on its own (a tag), so the fixtures need no state rule, and that sits inside at-rules.
  const tagRow = () => ROWS.find((r) => r.at && /\bbutton\b/.test(r.selector))!;
  it('a debt row skips exactly its declaration (file, at-rules, selector, property, value), whitespace aside', async () => {
    const row = tagRow();
    const file = path.join(SRC, row.file);
    const code = `${row.at} {\n  ${row.selector.replace(', ', ',\n')} {\n    ${row.prop}:  ${row.value};\n  }\n}\n.button { height: 31px; }\n`;
    const found = await hits(code, file, {});
    expect(found.length).toBe(1);
    expect(await hits(code, file)).toHaveLength(2);
    expect(await hits(code, path.join(KIT, 'other', 'x.module.css'), {})).toHaveLength(2);
  });
  it('a row covers one declaration: a second one, or one inside other at-rules or none, is a new raw size', async () => {
    const row = tagRow();
    const file = path.join(SRC, row.file);
    const decl = `${row.selector} { ${row.prop}: ${row.value}; }\n`;
    const inPlace = `${row.at} { ${decl} }\n`;
    expect(await hits(inPlace, file, {})).toHaveLength(0);
    expect(await hits(inPlace + inPlace, file, {})).toHaveLength(1);
    expect(await hits(`${inPlace}@media (width >= 1200px) { ${decl} }\n`, file, {})).toHaveLength(1);
    expect(await hits(`@media (width >= 1200px) { ${decl} }\n`, file, {})).toHaveLength(1);
    expect(await hits(decl, file, {})).toHaveLength(1);
  });
});

describe('hub/control-size-token: the real config and the debt', () => {
  it('the Hub config runs it on kit CSS only', async () => {
    const code = '.button { height: 31px; }\n';
    expect(await realHits(code, KIT_FILE)).toBe(1);
    expect(await realHits(code, path.join(SRC, 'pages', 'home', 'plant.module.css'))).toBe(0);
    expect(await realHits(code, path.join(SRC, 'shell', 'plant.module.css'))).toBe(0);
    expect(await realHits(code, path.join(KIT, 'tokens.css'))).toBe(1);
  }, lintMs(120_000));

  it('every kit stylesheet passes it through the Hub config (the debt rows applied)', async () => {
    const config = await realConfig();
    const { results } = await stylelint.lint({ files: kitFiles(), config });
    const found = results.flatMap((r) => r.warnings.filter((w) => w.rule === RULE).map((w) => `${path.relative(SRC, r.source ?? '')}:${w.line} ${w.text}`));
    expect(found).toEqual([]);
  }, lintMs(300_000));

  it('the debt is exactly what the rule finds in kit CSS today, counted: no hit unlisted, no row stale', async () => {
    const left = await kitDebt();
    const rows = ROWS.map(keyOf);
    const stale = rows.filter((k) => {
      const i = left.indexOf(k);
      if (i >= 0) left.splice(i, 1);
      return i < 0;
    });
    expect(left, 'a raw control size not in control-size.debt.cjs: use a size token').toEqual([]);
    expect(stale, 'a debt row that hits nothing: delete it (the debt only shrinks)').toEqual([]);
  }, lintMs(300_000));

  it('the debt only shrinks, and every row says why (a keep row, the size that is no control)', () => {
    expect(ROWS.map(keyOf).sort(), 'the debt and FROZEN: a fixed row leaves both, and nothing joins either').toEqual([...FROZEN].sort());
    for (const r of ROWS) {
      expect(FIX_BY.has(r.fixBy), `${r.file} ${r.selector}: fixBy ${r.fixBy}`).toBe(true);
      expect(r.why.length, `${r.file} ${r.selector}: why`).toBeGreaterThanOrEqual(20);
      if (r.fixBy === 'keep') expect(r.why, `${r.file} ${r.selector}: a keep row names its non-control role`).toMatch(/^[^:]{4,}: .*\bnot a control\b/);
      else expect(r.why, `${r.file} ${r.selector}`).toContain(r.fixBy);
    }
  });
});
