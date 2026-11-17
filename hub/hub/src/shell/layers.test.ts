// Layers: the shell sits above the pages' building blocks, never on a page. No shell module
// (tests aside: a drift test may read a page's public links) imports from pages/, by path or alias.
import { describe, expect, it } from 'vitest';

const files = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('shell layering', () => {
  it('no shell module imports a page', () => {
    const bad: string[] = [];
    for (const [file, text] of Object.entries(files)) {
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1] ?? '';
        if (/(^|\/)pages(\/|$)/.test(spec) || spec.startsWith('@pages')) bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad, 'move what the shell needs into @core (or the shell), never import pages/').toEqual([]);
  });
});
