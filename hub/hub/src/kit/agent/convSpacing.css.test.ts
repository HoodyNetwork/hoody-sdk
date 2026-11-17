// Spacing in the conversation, read from source (the browser specs measure the drawn page): a message queued under a waiting
// card stands apart from it like a turn from a card; the header's place line is as tall with the model chip as without it, so
// the header keeps its height when the model becomes known; Details' sub-sections stand apart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (f: string) => noComments(readFileSync(join(import.meta.dirname, f), 'utf8'));
/** The declarations of the rule whose selector list is exactly `sel` (selectors compared without spaces). */
function rule(css: string, sel: string): string | null {
  const want = sel.split(',').map((x) => x.replace(/\s+/g, '')).sort().join(',');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const got = (m[1] as string).split(',').map((x) => x.replace(/\s+/g, '')).sort().join(',');
    if (got === want) return m[2] as string;
  }
  return null;
}

describe('conversation spacing', () => {
  it('a queued message after a card gets the gap a card gets after a turn', () => {
    expect(rule(read('SessionView.module.css'), '.turn + .gate, .gate + .gate, .gate + .turn')).toContain('margin-block-start: var(--conv-gap-group)');
  });
  it('the place line holds the model chip\'s height with or without the chip', () => {
    const css = read('ConvHeader.module.css');
    expect(rule(css, '.where:has(> .model)')).toBeNull();
    expect(rule(css, '.where')).toContain('min-block-size: var(--xs-press-h)');
  });
  it('Details sub-sections stand apart', () => {
    expect(rule(read('DetailsPanel.module.css'), ".body [data-hub-section='sub'] + [data-hub-section='sub']")).toContain('margin-block-start: var(--sp-4)');
  });
});
