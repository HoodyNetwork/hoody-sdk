// The pause notice (paused, may be paused, state unknown) with its button: the button never touches the notice's edge.
// 6 px above and below, 12 px before the words, 8 px after the button, 12 px between words and button, both centred.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(import.meta.dirname, 'Pause.module.css'), 'utf8'));
const decls = (selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.parent === css && r.selector === selector) r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

describe('the pause notice spacing', () => {
  it('pads the notice on every side and keeps 12 px between the words and the button', () => {
    const warn = decls('.warn');
    expect(warn['padding-block']).toBe('calc(var(--sp-1) + var(--sp-half))');
    expect(warn['padding-inline']).toBe('var(--sp-3) var(--sp-2)');
    expect(warn.gap).toBe('var(--sp-1) var(--sp-3)');
  });

  it('in a rail foot keeps 8 px from the start line and 4 px (plus the foot gap) before the next control; elsewhere no margin', () => {
    expect(decls('.railWarn')).toEqual({ 'margin-inline': 'var(--sp-2) var(--sp-1)' });
    expect(Object.keys(decls('.warn')).filter((p) => p.startsWith('margin'))).toEqual([]);
    const src = readFileSync(join(import.meta.dirname, 'Pause.tsx'), 'utf8');
    expect(src.match(/\$\{rail \? ` \$\{s\.railWarn\}` : ''\}/g)).toHaveLength(3);
  });

  it('centres the words and the button on one line', () => {
    expect(decls('.foot')).toMatchObject({ display: 'inline-flex', 'align-items': 'center' });
  });
});
