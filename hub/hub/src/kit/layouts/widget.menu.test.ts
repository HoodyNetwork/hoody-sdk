// A Widget's ⋯ menu is always shown. One that appeared only on hover covered View all and
// hid its actions from anyone who did not hover, so no rule may hide it; hover or focus styling that keeps it shown
// is fine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');

describe('Widget menu is never hover-only', () => {
  it('no .widgetMenu rule hides it (opacity 0, visibility hidden or collapse, display none)', () => {
    const blocks = [...css.matchAll(/([^{}]*\.widgetMenu[^{}]*)\{([^}]*)\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, sel, body] of blocks) {
      expect(body, sel).not.toMatch(/opacity:\s*0(?![.\d]*[1-9])/);
      expect(body, sel).not.toMatch(/visibility:\s*(hidden|collapse)/);
      expect(body, sel).not.toMatch(/display:\s*none/);
    }
  });
});
