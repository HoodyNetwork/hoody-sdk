// @vitest-environment node
// Vitest: RailPane and Faq under forced colours. Forced colours drop background colours and gradient images, so:
// the rail's needs-you mark keeps a system colour (forced-color-adjust off, CanvasText); an open FAQ card keeps its start
// bar as a border on its own ::before (borders survive); a FAQ question's focus outline comes from Disclosure's trigger.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const forced = (css: string) => {
  const at = css.indexOf('@media (forced-colors: active)');
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return '';
};
const rule = (src: string, sel: string) => new RegExp(`(?:\\{|\\})\\s*${sel.replace(/[.:()[\]]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';

describe('forced colours: RailPane and Faq', () => {
  it('the needs-you mark stays drawn', () => {
    const m = forced(read('RailPane.module.css'));
    expect(rule(m, '.navMark')).toMatch(/forced-color-adjust:\s*none/);
    expect(rule(m, '.navMark')).toMatch(/background:\s*CanvasText/);
  });

  it('an open FAQ card keeps its start bar as a border', () => {
    const m = forced(read('Faq.module.css'));
    const bar = rule(m, '.item[data-expanded]::before');
    expect(bar).toMatch(/position:\s*absolute/);
    expect(bar).toMatch(/border-inline-start:\s*var\(--hx-faq-bar-w\) solid CanvasText/);
    expect(bar).toMatch(/content:/);
  });

  it('a FAQ question (Disclosure trigger) has a forced-colours focus outline', () => {
    const m = forced(readFileSync(join(import.meta.dirname, '..', 'controls', 'Disclosure.module.css'), 'utf8'));
    expect(rule(m, '.trigger[data-focus-visible]')).toMatch(/outline:\s*var\(--bw-2\) solid Highlight/);
  });
});
