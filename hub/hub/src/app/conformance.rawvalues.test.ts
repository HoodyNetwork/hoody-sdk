// @vitest-environment node
// Raw-value bans (scripts/lint/stylelint-hub.mjs): kit CSS takes font weights, line heights, letter spacing,
// durations and shadow lengths from tokens.css. Each rule runs alone for the fixtures, and through the Hub's real config
// for its kit/** and shell/** scope and the listed entries (app/conformance/exceptions.ts). Built in: a unitless
// line-height of 1, zero times, and delays.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const SRC = path.join(HUB, 'src');
const KIT_FILE = path.join(SRC, 'kit', 'data', 'plant.module.css');
const WEIGHT = 'hub/no-raw-font-weight';
const LINE = 'hub/no-raw-line-height';
const TRACK = 'hub/no-raw-letter-spacing';
const DUR = 'hub/no-raw-duration';
const SHADOW = 'hub/no-raw-shadow';
const RULES = [WEIGHT, LINE, TRACK, DUR, SHADOW];
const X = createRequire(import.meta.url)('../../scripts/lint/exceptions.cjs') as { STYLELINT: string[] };

const plugins = async () => (await import(path.join(HUB, 'scripts', 'lint', 'stylelint-hub.mjs'))).default;
const realConfig = async () => (await import(path.join(HUB, 'stylelint.config.mjs'))).default as object;
/** The raw values one rule finds in a stylesheet: the rule alone, or through `config`. Unknown-rule notices never count. */
async function hits(rule: string, code: string, file = KIT_FILE, config?: object): Promise<string[]> {
  const cfg = config ?? { plugins: await plugins(), rules: { [rule]: true } };
  const { results } = await stylelint.lint({ code, codeFilename: file, config: cfg });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === rule && w.text.includes('written raw')).map((w) => /"([^"]+)"/.exec(w.text)?.[1] ?? '');
}
/** Where one rule reports, as "value@line:column" (the rule alone). */
async function at(rule: string, code: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code, codeFilename: KIT_FILE, config: { plugins: await plugins(), rules: { [rule]: true } } });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === rule).map((w) => `${/"([^"]+)"/.exec(w.text)?.[1]}@${w.line}:${w.column}`);
}

describe('hub/no-raw-font-weight', () => {
  it('any number from 1 to 1000 is raw, non-hundred and decimal weights included', async () => {
    for (const v of ['100', '400', '500', '600', '650', '1', '1000', '550.5', '750'])
      expect(await hits(WEIGHT, `.a { font-weight: ${v}; }\n`), v).toEqual([v]);
  });
  it('bold, bolder and lighter are raw; normal, tokens and CSS-wide keywords pass', async () => {
    for (const v of ['bold', 'bolder', 'lighter', 'BOLD']) expect(await hits(WEIGHT, `.a { font-weight: ${v}; }\n`), v).toHaveLength(1);
    for (const v of ['normal', 'var(--fw-medium)', 'inherit', 'unset', 'revert-layer'])
      expect(await hits(WEIGHT, `.a { font-weight: ${v}; }\n`), v).toEqual([]);
  });
  it('a number in a var() fallback is raw', async () => {
    expect(await hits(WEIGHT, '.a { font-weight: var(--fw-medium, 500); }\n')).toEqual(['500']);
  });
  it('the font shorthand: the weight before the size is read, a size or line height is not a weight', async () => {
    expect(await hits(WEIGHT, '.a { font: 400 11px/1 var(--font-mono); }\n')).toEqual(['400']);
    expect(await hits(WEIGHT, '.a { font: italic 650 12px var(--font-text); }\n')).toEqual(['650']);
    expect(await hits(WEIGHT, '.a { font: bold 12px/1.5 var(--font-text); }\n')).toEqual(['bold']);
    expect(await hits(WEIGHT, '.a { font: var(--fw-regular) 14px/22px var(--font-text); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: 12px/1.2 var(--font-text); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: var(--t-body); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: inherit; }\n')).toEqual([]);
  });
  it('a declaration over several lines is one value, reported at the value itself', async () => {
    expect(await at(WEIGHT, '.a {\n  font:\n    600\n    13px / 20px\n    var(--font-text);\n}\n')).toEqual(['600@3:5']);
  });
  it('a math weight is a weight, not the size; a stretch keyword before it is skipped', async () => {
    expect(await hits(WEIGHT, '.a { font: calc(650) 16px Arial; }\n')).toEqual(['650']);
    expect(await hits(WEIGHT, '.a { font: italic condensed calc(600 + 50) 12px/20px Arial; }\n')).toEqual(['600', '50']);
    expect(await hits(WEIGHT, '.a { font: calc(12px + 1vw)/1.2 Arial; }\n')).toEqual([]);
  });
  it('a whole-value var() fallback is read as a shorthand', async () => {
    expect(await hits(WEIGHT, '.a { font: var(--type, 650 16px/20px Arial); }\n')).toEqual(['650']);
    expect(await hits(WEIGHT, '.a { font: var(--type, 600 16px/1.2 Arial); }\n')).toEqual(['600']);
  });
  it('a factor in weight math and a unitless 0 size are not weights', async () => {
    expect(await hits(WEIGHT, '.a { font-weight: calc(var(--fw-regular) * 1); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: 0 Arial; }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font-weight: calc(600); }\n')).toEqual(['600']);
  });
  it('only a product factor is exempt in math: a fallback or an additive operand stays raw', async () => {
    expect(await hits(WEIGHT, '.a { font-weight: calc(var(--fw, 650)); }\n')).toEqual(['650']);
    expect(await hits(WEIGHT, '.a { font-weight: calc(var(--fw) + 100); }\n')).toEqual(['100']);
    expect(await hits(WEIGHT, '.a { font-weight: calc(var(--fw) * 2 * 1.5); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font-weight: max(var(--fw) * 1, 650); }\n')).toEqual(['650']);
    expect(await hits(LINE, '.a { line-height: calc(var(--lh, 1.5)); }\n')).toEqual(['1.5']);
  });
  it('an unspaced product is split into its numbers and operators, in every math function', async () => {
    expect(await hits(WEIGHT, '.a { font-weight: calc(var(--fw) + 650*1); }\n')).toEqual(['650', '1']);
    expect(await hits(WEIGHT, '.a { font-weight: max(650*1, var(--fw)); }\n')).toEqual(['650', '1']);
    expect(await hits(WEIGHT, '.a { font-weight: round(var(--fw) + 1*650, 1); }\n')).toEqual(['1', '650', '1']);
    expect(await hits(WEIGHT, '.a { font-weight: abs(650/1); }\n')).toEqual(['650', '1']);
    expect(await hits(WEIGHT, '.a { font-weight: max(2*var(--x, 650)); }\n')).toEqual(['650']);
    expect(await hits(LINE, '.a { line-height: max(var(--lh)*1.5, 18px); }\n')).toEqual(['18px']);
    expect(await at(WEIGHT, '.a {\n  font-weight: max(var(--fw), 1*650);\n}\n')).toEqual(['1@2:31', '650@2:33']);
  });
  it('a factor glued to a function stays a factor', async () => {
    expect(await hits(WEIGHT, '.a { font-weight: calc(2*var(--x)); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font-weight: max(2*var(--x)); }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font-weight: max(var(--fw)*2); }\n')).toEqual([]);
    expect(await hits(SHADOW, '.a { box-shadow: 0 0 0 abs(-1*var(--bw)) var(--hx-line); }\n')).toEqual([]);
  });
  it('an unspaced product in the font shorthand is a weight, not the size', async () => {
    expect(await hits(WEIGHT, '.a { font: max(650*1, 700*1) 16px Arial; }\n')).toEqual(['650', '1', '700', '1']);
  });
  it('controls for the font shorthand split: spaced products and lone vars read as before', async () => {
    expect(await hits(WEIGHT, '.a { font: max(650 * 1, 700 * 1) 16px Arial; }\n')).toEqual(['650', '1', '700', '1']);
    expect(await hits(WEIGHT, '.a { font: var(--fw) 16px Arial; }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: calc(var(--fw)*1) 16px Arial; }\n')).toEqual([]);
  });
  it('a var() whose fallback is a size fills the size slot, so its fallback is not a weight', async () => {
    expect(await hits(WEIGHT, '.a { font: var(--font-size, 0) Arial; }\n')).toEqual([]);
    expect(await hits(WEIGHT, '.a { font: var(--fw, 600) var(--fs, 16px) Arial; }\n')).toEqual(['600']);
  });
  it('other properties and custom properties are not read', async () => {
    expect(await hits(WEIGHT, '.a { --w: 600; z-index: var(--z-top); flex: 1 1 600px; }\n')).toEqual([]);
  });
});

describe('hub/no-raw-line-height', () => {
  it('numbers, lengths and percentages are raw; a unitless 1 is built in', async () => {
    for (const v of ['1.2', '1.5', '0', '20px', '1.25rem', '1.4em', '150%'])
      expect(await hits(LINE, `.a { line-height: ${v}; }\n`), v).toEqual([v]);
    for (const v of ['1', 'normal', 'var(--lh-tight)', 'inherit']) expect(await hits(LINE, `.a { line-height: ${v}; }\n`), v).toEqual([]);
  });
  it('calc, min, max and clamp: a non-zero dimension is raw, a bare factor is not', async () => {
    expect(await hits(LINE, '.a { line-height: calc(1em + 4px); }\n')).toEqual(['1em', '4px']);
    expect(await hits(LINE, '.a { line-height: max(var(--lh-tight), 18px); }\n')).toEqual(['18px']);
    expect(await hits(LINE, '.a { line-height: clamp(16px, 2vh, 24px); }\n')).toEqual(['16px', '2vh', '24px']);
    expect(await hits(LINE, '.a { line-height: calc(var(--lh-normal) * 1.1); }\n')).toEqual([]);
  });
  it('a var() fallback is read like the value itself', async () => {
    expect(await hits(LINE, '.a { line-height: var(--lh-tight, 1.2); }\n')).toEqual(['1.2']);
    expect(await hits(LINE, '.a { line-height: var(--lh-x, 1); }\n')).toEqual([]);
  });
  it('the font shorthand: the value after "/" is read, the size is not', async () => {
    expect(await hits(LINE, '.a { font: var(--fw-regular) 14px/22px var(--font-text); }\n')).toEqual(['22px']);
    expect(await hits(LINE, '.a { font: 400 11px/1 var(--font-mono); }\n')).toEqual([]);
    expect(await hits(LINE, '.a { font: 12px/calc(1em + 2px) var(--font-text); }\n')).toEqual(['1em', '2px']);
    expect(await hits(LINE, '.a { font: 12px var(--font-text); }\n')).toEqual([]);
    expect(await hits(LINE, '.a {\n  font: 600 13px\n    / 1.35 var(--font-text);\n}\n')).toEqual(['1.35']);
  });
  it('the line height inside a whole-value var() fallback is read', async () => {
    expect(await hits(LINE, '.a { font: var(--type, 650 16px/20px Arial); }\n')).toEqual(['20px']);
  });
  it('every CSS math function is read like calc, and math without a var() reads as if bare', async () => {
    expect(await hits(LINE, '.a { line-height: round(20px, 1px); }\n')).toEqual(['20px', '1px']);
    expect(await hits(LINE, '.a { line-height: calc(1.5); }\n')).toEqual(['1.5']);
    expect(await hits(TRACK, '.a { letter-spacing: abs(-1px); }\n')).toEqual(['-1px']);
    expect(await hits(SHADOW, '.a { box-shadow: 0 0 0 mod(5px, 3px) var(--hx-ink); }\n')).toEqual(['5px', '3px']);
  });
});

describe('hub/no-raw-letter-spacing', () => {
  it('a non-zero length is raw; 0, normal and the tracking tokens pass', async () => {
    for (const v of ['0.06em', '-0.01em', '1px', '0.08em']) expect(await hits(TRACK, `.a { letter-spacing: ${v}; }\n`), v).toEqual([v]);
    for (const v of ['0', 'normal', 'var(--tracking-caps)', 'calc(-1 * var(--tracking-head))'])
      expect(await hits(TRACK, `.a { letter-spacing: ${v}; }\n`), v).toEqual([]);
  });
});

describe('hub/no-raw-duration', () => {
  it('an unspaced time product or a glued duration var marks the duration slot', async () => {
    expect(await hits(DUR, '.a { transition: opacity max(120ms*2, 200ms*2); }\n')).toEqual(['120ms', '200ms']);
    expect(await hits(DUR, '.a { transition: opacity max(2*var(--dur-press)) 100ms; }\n')).toEqual([]);
  });
  it('controls for the duration slot split: spaced products and lone vars read as before', async () => {
    expect(await hits(DUR, '.a { transition: opacity max(120ms * 2, 200ms * 2); }\n')).toEqual(['120ms', '200ms']);
    expect(await hits(DUR, '.a { transition: opacity var(--dur-press) 100ms; }\n')).toEqual([]);
    expect(await hits(DUR, '.a { transition: opacity calc(var(--dur-press)*2); }\n')).toEqual([]);
  });
  it('a raw duration in transition, animation and their -duration longhands', async () => {
    expect(await hits(DUR, '.a { transition: opacity 120ms var(--ease-out); }\n')).toEqual(['120ms']);
    expect(await hits(DUR, '.a { animation: pulse 900ms var(--ease-in-out) infinite; }\n')).toEqual(['900ms']);
    expect(await hits(DUR, '.a { transition-duration: 0.2s, var(--dur-hover); }\n')).toEqual(['0.2s']);
    expect(await hits(DUR, '.a { animation-duration: 0.001ms; }\n')).toEqual(['0.001ms']);
  });
  it('zero times and delays pass; *-delay is not read', async () => {
    expect(await hits(DUR, '.a { animation: sk-appear 0ms linear 150ms both; }\n')).toEqual([]);
    expect(await hits(DUR, '.a { transition: visibility 0s linear var(--dur-exit); }\n')).toEqual([]);
    expect(await hits(DUR, '.a { transition: opacity var(--dur-hover) var(--ease-out) 90ms; }\n')).toEqual([]);
    expect(await hits(DUR, '.a { animation-delay: 150ms; transition-delay: 300ms; }\n')).toEqual([]);
  });
  it('commas inside cubic-bezier() and steps() are not layer breaks; each real layer has its own duration', async () => {
    expect(await hits(DUR, '.a { transition: opacity 120ms cubic-bezier(0.4, 0, 1, 1) 150ms, transform var(--dur-press) steps(4, end) 90ms; }\n')).toEqual(['120ms']);
    expect(await hits(DUR, '.a { transition: color 200ms, background-color 1.6s; }\n')).toEqual(['200ms', '1.6s']);
  });
  it('a time in a var() fallback is raw; a declaration over several lines is one value', async () => {
    expect(await hits(DUR, '.a { transition: opacity var(--dur-hover, 120ms); }\n')).toEqual(['120ms']);
    expect(await at(DUR, '.a {\n  transition:\n    color 200ms,\n    background-color var(--dur-press);\n}\n')).toEqual(['200ms@3:11']);
  });
  it('a whole-layer or duration-slot var() fallback is read per layer, so its delay never counts', async () => {
    expect(await hits(DUR, '.a { transition: var(--transition, opacity 120ms ease 200ms); }\n')).toEqual(['120ms']);
    expect(await hits(DUR, '.a { transition: opacity var(--t, 120ms ease 200ms); }\n')).toEqual(['120ms']);
    expect(await hits(DUR, '.a { transition: var(--t, opacity 120ms 50ms, color 80ms 300ms); }\n')).toEqual(['120ms', '80ms']);
  });
});

describe('hub/no-raw-shadow', () => {
  it('any non-zero length in box-shadow is raw, in every layer', async () => {
    expect(await hits(SHADOW, '.a { box-shadow: inset 3px 0 0 var(--hx-selected-bar); }\n')).toEqual(['3px']);
    expect(await hits(SHADOW, '.a { box-shadow: 0 0 0 var(--bw-2) var(--hx-bg), 0 0 0 4px var(--hx-ink); }\n')).toEqual(['4px']);
    expect(await hits(SHADOW, '.a { box-shadow: 0 0 0 0.25rem var(--hx-ink); }\n')).toEqual(['0.25rem']);
  });
  it('zeros, tokens and a calc() factor of a token pass', async () => {
    for (const v of ['none', 'var(--sh-2)', '0 0 0 var(--bw) var(--hx-line)', 'inset 0 0 0 calc(-1 * var(--bw)) var(--hx-line)', 'var(--focus-ring)'])
      expect(await hits(SHADOW, `.a { box-shadow: ${v}; }\n`), v).toEqual([]);
  });
});

describe('the bans in the Hub config', () => {
  const sample = '.a { font-weight: 600; line-height: 20px; letter-spacing: 0.06em; transition: opacity 120ms; box-shadow: 0 0 0 3px var(--hx-ink); }\n';
  it('are stylelint rules an exception entry can clear', () => {
    for (const r of RULES) expect(X.STYLELINT).toContain(r);
  });
  it('apply to kit and shell CSS: not pages or tokens.css', async () => {
    const config = await realConfig();
    for (const r of RULES) {
      expect(await hits(r, sample, KIT_FILE, config), r).toHaveLength(1);
      expect(await hits(r, sample, path.join(SRC, 'shell', 'plant.module.css'), config), r).toHaveLength(1);
      expect(await hits(r, sample, path.join(SRC, 'pages', 'computers', 'plant.module.css'), config), r).toEqual([]);
      expect(await hits(r, sample, path.join(SRC, 'kit', 'tokens.css'), config), r).toEqual([]);
    }
  }, lintMs(120_000));
  it('an exception entry clears only the rules it names', async () => {
    const config = await realConfig();
    const modelChooser = path.join(SRC, 'kit', 'pickers', 'ModelChooser.module.css'); // entry: hub/no-raw-shadow
    expect(await hits(SHADOW, sample, modelChooser, config)).toEqual([]);
    expect(await hits(WEIGHT, sample, modelChooser, config)).toEqual(['600']);
  }, lintMs(120_000));
  it('every kit stylesheet passes all five (with the listed entries)', async () => {
    const config = await realConfig();
    const files = readdirSync(path.join(SRC, 'kit'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.css'))
      .map((f) => path.join(SRC, 'kit', f));
    expect(files.length).toBeGreaterThan(70);
    const { results } = await stylelint.lint({ files, config });
    const found = results.flatMap((r) => r.warnings.filter((w) => RULES.includes(w.rule)).map((w) => `${path.relative(SRC, r.source ?? '')}:${w.line} ${w.text}`));
    expect(found).toEqual([]);
  }, lintMs(300_000));
  it('every shell stylesheet passes all five (with the listed entries)', async () => {
    const config = await realConfig();
    const files = readdirSync(path.join(SRC, 'shell'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.css'))
      .map((f) => path.join(SRC, 'shell', f));
    expect(files.length).toBeGreaterThan(10);
    const { results } = await stylelint.lint({ files, config });
    const found = results.flatMap((r) => r.warnings.filter((w) => RULES.includes(w.rule)).map((w) => `${path.relative(SRC, r.source ?? '')}:${w.line} ${w.text}`));
    expect(found).toEqual([]);
  }, lintMs(300_000));
});
