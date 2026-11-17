// On a coarse pointer every RadioGroup option is a 44 px target, like a Button or a Link: the
// option takes --touch-min (0 on a fine pointer, 44px on a coarse one, tokens.css) inside the coarse block, so a
// desktop option keeps its size. Read from source; the drawn height is checked by ModelChooser.spec.ts at 390 touch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'more.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `@media (pointer: coarse)` block. */
function coarseBlock(): string {
  const at = css.indexOf('@media (pointer: coarse)');
  if (at < 0) throw new Error('no coarse block');
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unclosed coarse block');
}

/** The declarations of the one rule whose selector is exactly `sel` in `body`, or null; a second such rule fails. */
function rule(body: string, sel: string): string | null {
  const all = [...body.matchAll(new RegExp(`(?<=^|})\\s*${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(all.length, `at most one ${sel} rule`).toBeLessThanOrEqual(1);
  return all[0]?.[1] ?? null;
}

describe('RadioGroup options on a coarse pointer', () => {
  it('take the touch minimum height inside the coarse block', () => {
    expect(rule(coarseBlock(), '.radio')).toMatch(/(?:^|;)\s*min-block-size:\s*var\(--touch-min\)\s*;/);
  });

  it('keep their desktop size: no top-level .radio rule sets a minimum height', () => {
    const top = rule(css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, ''), '.radio');
    expect(top).not.toBeNull();
    expect(top).not.toMatch(/min-(?:block-size|height)/);
  });
});
