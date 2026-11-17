// SubSection's structure, judged on the real stylesheet: a group's title is a step above a field's label, its
// description sits on the title, and sibling groups are parted by a rule with more room than the fields inside one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = strip(readFileSync(join(import.meta.dirname, 'anatomy.module.css'), 'utf8'));
const FIELDS = strip(readFileSync(join(import.meta.dirname, '..', '..', 'forms', 'fields.module.css'), 'utf8'));
const TOKENS = strip(readFileSync(join(import.meta.dirname, '..', '..', 'tokens.css'), 'utf8'));

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').trim().replace(/\s+/g, ' ') !== selector) continue;
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}

const px = (name: string): number => {
  const v = new RegExp(`${name}:\\s*([^;]+);`).exec(TOKENS)?.[1]?.trim() ?? '';
  const inner = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return inner ? px(inner[1]!) : parseFloat(v);
};

describe('SubSection rhythm', () => {
  it('draws the title on the group step, above a field label', () => {
    expect(rule(CSS, '.sub .titleLine > [data-hub-heading]').font).toBe('var(--t-group)');
    const group = /--t-group:\s*(\d+) (\d+)px/.exec(TOKENS);
    expect(group).not.toBeNull();
    const label = rule(FIELDS, '.label');
    expect(label['font-size']).toBe('var(--fs-sm)');
    expect(label['font-weight']).toBe('var(--fw-medium)');
    expect(Number(group![2])).toBeGreaterThan(px('--fs-sm'));
    expect(Number(group![1])).toBeGreaterThan(px('--fw-medium'));
  });

  it('keeps the description on the title', () => {
    expect(rule(CSS, '.sub > .subHead + p')['margin-block-start']).toBe('calc(var(--gap-line) - var(--gap-block))');
  });

  it('parts sibling groups with a rule and more room than the fields inside one', () => {
    const sib = rule(CSS, '.sub + .sub');
    expect(sib['border-block-start']).toBe('var(--bw) solid var(--pop-sep)');
    expect(sib['padding-block-start']).toBe('var(--sp-5)');
    expect(sib['margin-block-start']).toBe('max(0px, calc(var(--sp-5) - var(--form-gap, var(--gap-block))))');
    expect(rule(CSS, '.sub').gap).toBe('var(--gap-block)');
    expect(px('--sp-5')).toBeGreaterThan(px('--gap-block'));
    // The first group takes no rule: only the sibling rule draws one.
    expect(rule(CSS, '.sub')['border-block-start']).toBeUndefined();
  });
});
