// @vitest-environment node
// Vitest: the Splitter's touch floor and forced colours. A finger gets a strip --touch-min wide, centred on the
// line, drawn by ::before over the panes, so the 8 px layout strip (control-size `keep` rows) does not change. Forced
// colours repaint backgrounds, so the line is kept in CanvasText (Highlight under the pointer) with forced-color-adjust off.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Splitter.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const media = (q: string) => {
  const at = css.indexOf(`@media ${q}`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return '';
};
const rule = (src: string, sel: string) => new RegExp(`(?:\\{|\\})\\s*${sel.replace(/[.:()]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';

describe('Splitter touch floor and forced colours', () => {
  it('coarse pointer: a --touch-min hit strip centred on the line, over the panes; the layout strip stays 8 px', () => {
    const m = media('(pointer: coarse)');
    expect(m, 'a coarse-pointer block').not.toBe('');
    expect(rule(m, '.splitter::before')).toMatch(/position:\s*absolute/);
    expect(rule(m, '.splitter::before')).toMatch(/content:/);
    expect(rule(m, '.splitter')).toMatch(/z-index:\s*var\(--z-raised\)/);
    expect(rule(m, '.vertical::before')).toMatch(/inset-inline:\s*calc\(50% - var\(--touch-min\) \/ 2\)/);
    expect(rule(m, '.horizontal::before')).toMatch(/inset-block:\s*calc\(50% - var\(--touch-min\) \/ 2\)/);
    expect(rule(css, '.vertical')).toMatch(/inline-size:\s*8px/);
    expect(rule(css, '.horizontal')).toMatch(/block-size:\s*8px/);
  });

  it('forced colours: the line in CanvasText, Highlight under the pointer', () => {
    const m = media('(forced-colors: active)');
    expect(rule(m, '.splitter::after')).toMatch(/background:\s*CanvasText/);
    expect(rule(m, '.splitter::after')).toMatch(/forced-color-adjust:\s*none/);
    expect(m).toMatch(/\.splitter:hover::after,\s*\.splitter:active::after\s*\{[^}]*background:\s*Highlight/);
  });
});
