// Keys on a phone (float rule 3): the API keys tab wraps the list/detail page in a fill frame (height 100%).
// On a phone the page scrolls as one document and overflowed that frame, so the content area's end padding (the bottom
// bar's strip and the floating button's room) landed before the last questions: at the end of the scroll the float
// covered two of them (measured at 390: "What does sharing a realm give someone?" and the next). Under 600 px the
// frame grows with its content.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'parts/keys.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `@container content (width < 600px)` block that holds `sel`. */
function narrowRule(sel: string): string {
  for (const m of css.matchAll(/@container content \(width < 600px\)\s*\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const body = css.slice(start, i - 1);
    const r = body.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
    if (r) return r[1]!;
  }
  return '';
}

describe('keys: the fill frame on a phone', () => {
  it('grows with the page under 600 px, at least the content area high', () => {
    const r = narrowRule('.frameFill');
    expect(r).toMatch(/height:\s*auto;/);
    expect(r).toMatch(/min-height:\s*100%;/);
  });
});
