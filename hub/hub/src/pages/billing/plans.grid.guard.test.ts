// Vitest: the Plans grid spec measures something. Its alignment check loops over the rows it found, so with no row
// found it would pass without asserting anything; the spec counts the plan columns and requires a measured top for each.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const spec = readFileSync(join(import.meta.dirname, 'plans.grid.spec.ts'), 'utf8');

describe('plans.grid.spec.ts', () => {
  it('fails when no plan column is measured', () => {
    expect(spec).toMatch(/expect\(cards, 'plan columns'\)\.toBeGreaterThan\(1\)/);
    expect(spec).toMatch(/expect\(rows\.flat\(\)\.length[^)]*\)\.toBeGreaterThanOrEqual\(cards\)/);
    // And a grid of one card per row lines up with nothing: where columns fit, a row holds two or more.
    expect(spec).toMatch(/if \(width >= 760\) expect\(Math\.max\(\.\.\.rows\.map\(\(r\) => r\.length\)\)[^)]*\)\.toBeGreaterThanOrEqual\(2\)/);
  });
});
