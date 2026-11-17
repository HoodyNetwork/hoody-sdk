// Vitest: the "Being built in this browser" rows stack (one column) below 720 px of content. From 640 to about 720 px the
// one-line grid's fixed columns (pill and step, computer, age, up to three buttons) left the description no room at all.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'parts/Building.module.css'), 'utf8');

describe('Building rows: the stacking width', () => {
  it('stacks each row below 720 px of content', () => {
    const at = css.indexOf('@container content (width < 720px)');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}', at));
    expect(block).toMatch(/\.row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('has no second, narrower stacking width left behind', () => {
    expect(css).not.toMatch(/@container content \(width < 640px\)/);
  });
});
