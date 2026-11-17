// Vitest: every focus ring Layouts.module.css draws as a box-shadow (the kit focus ring) has a system-colour outline under
// forced colours, which drop box-shadow: a keyboard user in Windows high contrast still sees which control has focus
// (the step strip's done-step buttons included).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Layouts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the `@media (forced-colors: active)` block, braces balanced. */
function forcedBlock(): string {
  const at = css.indexOf('@media (forced-colors: active)');
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 1;
  let i = open + 1;
  for (; i < css.length && depth > 0; i += 1) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return css.slice(open + 1, i - 1);
}

const rules = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1]!.split(',').map((x) => x.trim().replace(/\s+/g, ' ')), body: m[2]! }));

describe('Layouts focus rings under forced colours', () => {
  it('each focus-visible selector ringed by a shadow has a Highlight outline there', () => {
    const forced = forcedBlock();
    const outer = css.replace(forced, '');
    const ringed = rules(outer)
      .filter((r) => /box-shadow:\s*var\(--focus-ring(-inset)?\)/.test(r.body) && /outline:\s*none/.test(r.body))
      .flatMap((r) => r.sels)
      .filter((sel) => /focus-visible/.test(sel));
    expect(ringed).toContain('button.stripBtn:focus-visible');
    const outlined = rules(forced)
      .filter((r) => /outline:[^;]*solid Highlight/.test(r.body))
      .flatMap((r) => r.sels);
    for (const sel of ringed) expect(outlined, sel).toContain(sel);
  });
});
