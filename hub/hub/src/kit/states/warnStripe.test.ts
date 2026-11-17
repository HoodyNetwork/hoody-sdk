// The warning look, "Hazard stripe edge": the warn tokens take the design's values in light and dark,
// and every kit notice shape draws its warning edge as the hazard stripe over a transparent start border (one recipe,
// --nt-edge), with a system-colour border back in forced colours. Calm and danger keep their solid bar.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const kit = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(kit, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const tokens = read('tokens.css');
const block = (sel: RegExp) => sel.exec(tokens)?.[1] ?? '';
const light = block(/(?:^|\n):root \{([\s\S]*?)\n\}/);
const dark = block(/\n:root\[data-hx-theme="dark"\] \{([\s\S]*?)\n\}/);
const val = (b: string, name: string) => new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(b)?.[1]?.trim();

describe('warn tokens', () => {
  it.each([
    ['--hx-warn-fill', '#a6b300', '#ef2'],
    ['--hx-warn-text', '#5b6300', '#ef2'],
    ['--hx-notice-warn', 'rgb(0 0 0 / 4%)', 'rgb(255 255 255 / 4%)'],
    ['--hx-notice-warn-line', 'rgb(0 0 0 / 9%)', 'rgb(255 255 255 / 12%)'],
    ['--hx-tag-warn-bg', '#f1f3d6', '#3a3d1b'],
    ['--hx-tag-warn-edge', '#ced573', '#838c1e'],
    ['--hx-tag-warn-ink', '#5b6300', '#ef2'],
    ['--hx-tag-warn-dot', '#a6b300', '#ef2'],
    ['--hx-stripe-gap', '#272727', '#111112'],
  ])('%s is %s in light and %s in dark', (name, l, d) => {
    expect(val(light, name)).toBe(l);
    expect(val(dark, name)).toBe(d);
  });

  it('the stripe is 4 px warn-fill bands on the gap colour, at -45 degrees', () => {
    expect(val(light, '--hx-warn-stripe')).toBe('repeating-linear-gradient(-45deg, var(--hx-warn-fill) 0 4px, var(--hx-stripe-gap) 4px 8px)');
  });

  it('the accent swap sets no warn colour', () => {
    for (const m of tokens.matchAll(/:root\[data-hx-hl="[a-z]+"\][^{]*\{([^}]*)\}/g)) expect(m[1]).not.toMatch(/--hx-(warn|notice-warn|tag-warn|stripe)/);
  });
});

describe('every kit notice shape draws the warning edge as the stripe', () => {
  const EDGE = /background:\s*var\(--nt-edge\) 0 0 \/ var\(--bw-notice\) 100% no-repeat border-box, var\(--nt-fill\);/;
  const band = read('states/Band.module.css');
  const states = read('states/States.module.css');
  const outcome = read('forms/Outcome.module.css');

  it('Band and Notice: the warn tone is the stripe over a transparent bar; calm and danger paint no layer', () => {
    expect(rule(band, '.warn')).toMatch(/--nt-bar:\s*transparent;[\s\S]*--nt-edge:\s*var\(--hx-warn-stripe\);/);
    expect(band).toMatch(/\.band,\s*\.notice\s*\{[^}]*--nt-edge:\s*none;/);
    expect(rule(band, '.danger')).toMatch(/--nt-bar:\s*var\(--hx-danger-fill\);/);
    expect(rule(band, '.band')).toMatch(EDGE);
    expect(rule(band, '.notice')).toMatch(EDGE);
    expect(rule(band, '.flush::before')).toMatch(/background:\s*var\(--nt-edge\) border-box;/);
    expect(band).toMatch(/\.band:dir\(rtl\),\s*\.notice:dir\(rtl\)\s*\{\s*background-position-x:\s*100%;/);
  });

  it('OutcomeBanner pending and the States pending block take the same recipe', () => {
    expect(rule(states, '.outcome')).toMatch(EDGE);
    expect(rule(states, '.o_pending')).toMatch(/--nt-bar:\s*transparent;[\s\S]*--nt-edge:\s*var\(--hx-warn-stripe\);/);
    expect(rule(outcome, '.block')).toMatch(EDGE);
    expect(rule(outcome, '.k_pending.block')).toMatch(/--nt-bar:\s*transparent;[\s\S]*--nt-edge:\s*var\(--hx-warn-stripe\);/);
  });

  it('the Ledger strip paints the stripe over a transparent start border', () => {
    const strip = rule(read('data/Ledger.module.css'), '.strip');
    expect(strip).toMatch(/border-inline-start:\s*var\(--bw-notice\) solid transparent;/);
    expect(strip).toMatch(/background:\s*var\(--hx-warn-stripe\) 0 0 \/ var\(--bw-notice\) 100% no-repeat border-box, var\(--hx-notice-warn\);/);
  });

  it('in forced colours a warning keeps a system-colour bar', () => {
    for (const [css, sel] of [[band, '.warn'], [states, '.o_pending'], [outcome, '.k_pending.block']] as const)
      expect(css).toMatch(new RegExp(`@media \\(forced-colors: active\\) \\{\\s*${sel.replace(/[.]/g, '\\.')} \\{\\s*--nt-bar: CanvasText;`));
  });

  it('a Verdict limited step wears the stripe (never the accent-coloured fill of a done one)', () => {
    const v = read('states/Verdict.module.css');
    expect(rule(v, '.seg_limited')).toMatch(/background:\s*var\(--hx-warn-stripe\) border-box;/);
    expect(rule(v, '.tone_state .seg_limited')).toMatch(/background:\s*var\(--hx-verdict-stripe\) border-box;/);
  });
});
