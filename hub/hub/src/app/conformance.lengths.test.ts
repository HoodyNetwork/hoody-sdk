// @vitest-environment node
// Length bans in the Hub's real stylelint config (stylelint.config.mjs): spacing and radius take tokens, so a raw length
// fails, including a negative spacing and a percent radius. Each fixture runs through the real config on a kit stylesheet.
import path from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { lintMs } from './conformance/budget';

const HUB = path.resolve(__dirname, '..', '..');
const FILE = path.join(HUB, 'src', 'kit', 'data', 'plant.module.css');
const RULE = 'declaration-property-value-disallowed-list';

const realConfig = async () => (await import(path.join(HUB, 'stylelint.config.mjs'))).default as object;
/** The declarations the raw-length rule rejects in a stylesheet, as "prop: value". */
async function rejected(css: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code: css, codeFilename: FILE, config: await realConfig() });
  return (results[0]?.warnings ?? []).filter((w) => w.rule === RULE).map((w) => w.text.replace(/\s*\(.*$/, ''));
}

describe('raw spacing and radius lengths', () => {
  it('a radius written in percent is raw, as one in px is', async () => {
    for (const v of ['50%', '25%', '50% 0', '4px', '0.5rem'])
      expect(await rejected(`.a { border-radius: ${v}; }\n`), v).toHaveLength(1);
    expect(await rejected('.a { border-start-start-radius: 50%; }\n')).toHaveLength(1);
  }, lintMs(120_000));
  it('a radius from a token, 0 or a calc of tokens passes', async () => {
    for (const v of ['var(--r-round)', '0', 'calc(var(--r-2) * 2)', 'var(--r-pill)'])
      expect(await rejected(`.a { border-radius: ${v}; }\n`), v).toEqual([]);
  }, lintMs(120_000));
  it('a negative spacing is raw', async () => {
    for (const p of ['margin', 'margin-block-start', 'margin-inline', 'padding-inline-end', 'gap'])
      for (const v of ['-4px', '-1px'])
        expect(await rejected(`.a { ${p}: ${v}; }\n`), `${p}: ${v}`).toHaveLength(1);
  }, lintMs(120_000));
  it('a negative spacing from a token passes, and a token name containing a number is not a length', async () => {
    for (const v of ['calc(-1 * var(--sp-2))', 'calc(-1 * var(--bw))', 'var(--sp-4)', 'calc(var(--sp-4) - var(--sp-1))', '0', 'auto'])
      expect(await rejected(`.a { margin: ${v}; }\n`), v).toEqual([]);
    expect(await rejected('.a { margin-inline: var(--sp-4px-x); }\n')).toEqual([]);
  }, lintMs(120_000));
  it('a fraction or an upper-case unit is raw too', async () => {
    for (const v of ['0.05rem', '-.05rem', '.5em', '-0.25px', '-4PX', '1.5REM', '10Px', '1e2px', '-1e-2rem', '1E2PX'])
      expect(await rejected(`.a { margin-inline: ${v}; }\n`), v).toHaveLength(1);
    for (const v of ['0.5rem', '.25em', '50%', '4PX', '1e2px', '1e-2rem'])
      expect(await rejected(`.a { border-radius: ${v}; }\n`), `radius ${v}`).toHaveLength(1);
    for (const v of ['0', '0.0px', '.0rem', '0px'])
      expect(await rejected(`.a { margin: ${v}; }\n`), `zero ${v}`).toEqual([]);
  }, lintMs(120_000));
});
