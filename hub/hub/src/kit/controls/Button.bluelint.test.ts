// hub/blue-only-link-focus and the kit Button: no button is blue. The Button has no blue variant, so its CSS names no
// blue token and lints clean, and a blue fill warns in every Button rule, as it does in any other file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const HUB = join(import.meta.dirname, '..', '..', '..');
const BUTTON = join(HUB, 'src', 'kit', 'controls', 'Button.module.css');
const OTHER = join(HUB, 'src', 'kit', 'controls', 'Other.module.css');

async function blueWarnings(code: string, file: string): Promise<number> {
  const config = (await import(join(HUB, 'stylelint.config.mjs'))).default;
  const { results } = await stylelint.lint({ code, codeFilename: file, config: { ...config, rules: { 'hub/blue-only-link-focus': [true, { severity: 'warning' }] } } });
  return results[0]!.warnings.filter((w) => w.rule === 'hub/blue-only-link-focus').length;
}

describe('no kit button is blue', () => {
  const source = readFileSync(BUTTON, 'utf8');

  it('the Button CSS has no blue variant and names no blue token', () => {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.blue\b/);
    expect(css).not.toMatch(/--hx-blue/);
    // Its one use of the focus colour is the kit ring.
    expect(css.match(/var\(--(?:hx-focus|focus-ring)[\w-]*\)/g)).toEqual(['var(--focus-ring)', 'var(--focus-ring-inset)']);
  });

  it('the Button CSS as written lints clean', async () => {
    expect(await blueWarnings(source, BUTTON)).toBe(0);
  });

  it('a Button rule may not fill with blue', async () => {
    expect(await blueWarnings('.secondary { background: var(--hx-blue); }\n', BUTTON)).toBe(1);
    expect(await blueWarnings('.primary { --plate: var(--hx-blue); }\n', BUTTON)).toBe(1);
  });

  // The retired blue variant had an exception in the rule: no selector spelling may bring a blue fill back.
  for (const sel of ['.blue', '.button.blue', '.blue[data-hovered],\n.blue[data-pressed]', '.blue, .secondary', ':not(.blue)', '.button:not(.blue)', '.blue-other', '.blue .secondary', '.blue > .glyph', '.blue::before']) {
    it(`"${sel.replace('\n', ' ')}" may not fill with blue`, async () => {
      expect(await blueWarnings(`${sel} { background: var(--hx-blue); }\n`, BUTTON)).toBe(1);
    });
  }

  it('a .blue rule in any other file may not either', async () => {
    expect(await blueWarnings('.blue { background: var(--hx-blue); }\n', OTHER)).toBe(1);
  });
});
