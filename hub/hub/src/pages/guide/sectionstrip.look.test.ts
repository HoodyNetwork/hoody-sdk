// On a narrow page Guide's section index is a strip, drawn with the same section-menu
// look as the kit's settings strip (Account, AI): the current item underlined in the selected-bar colour, no fills, no
// rounded box. Guide sets the hooks the settings strip sets, with the same values, and no others.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const read = (rel: string) => readFileSync(path.join(here, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The `--section-menu-*` declarations of every rule whose selector is exactly `selector`. */
function hooks(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  let rules = 0;
  for (const m of css.matchAll(new RegExp(`(?:^|[\\s{};])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))) {
    rules++;
    for (const d of m[1]!.matchAll(/(--section-menu-[a-z-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  }
  expect(rules, `${selector} rule exists`).toBeGreaterThan(0);
  return out;
}

describe('Guide section strip: the settings strip look', () => {
  const guide = hooks(read('parts/guide.module.css'), '.index');
  const settings = hooks(read('../../kit/layouts/Layouts.module.css'), '.settingsNav');

  it('underlines the current item, with no selected or hover fill and no radius', () => {
    expect(guide['--section-menu-current-line']).toBe('var(--hx-selected-bar)');
    expect(guide['--section-menu-current-fill']).toBeUndefined();
    expect(guide['--section-menu-hover-fill']).toBeUndefined();
    expect(guide['--section-menu-radius']).toBeUndefined();
  });

  it('sets exactly the hooks the settings strip sets, with the same values', () => {
    expect(Object.keys(settings).length).toBeGreaterThan(0);
    expect(guide).toEqual(settings);
  });
});
