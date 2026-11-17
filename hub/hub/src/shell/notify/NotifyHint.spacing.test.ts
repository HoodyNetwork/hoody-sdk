// The hint box: its buttons keep 6 px to the box's top and bottom lines and 8 px to its end line, the words start
// 12 px in, and no fixed height squeezes them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(import.meta.dirname, 'NotifyHint.module.css'), 'utf8'));
const hint: Record<string, string> = {};
css.walkRules((r) => {
  if (r.selector === '.hint') r.walkDecls((d) => void (hint[d.prop] = d.value));
});

describe('the notify hint spacing', () => {
  it('pads the box so its buttons never touch a line', () => {
    expect(hint['padding-block']).toBe('calc(var(--sp-1) + var(--sp-half))');
    expect(hint['padding-inline']).toBe('var(--sp-3) var(--sp-2)');
    expect(hint['align-items']).toBe('center');
  });

  it('takes its height from its content and padding', () => {
    expect(Object.keys(hint).filter((p) => /^(min-|max-)?(height|block-size)$/.test(p))).toEqual([]);
  });
});
