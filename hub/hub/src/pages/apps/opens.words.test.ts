// "Where it opens" does not show the same sentence twice. The description says what Hoody doesn't know;
// the error after a press says what to do. The drawer uses the two keys in those two places.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const src = readFileSync(join(__dirname, 'parts', 'OptionsDrawer.tsx'), 'utf8');

describe('apps options: where it opens', () => {
  it('the description and the error are different sentences', () => {
    expect(strings['opt.opensNeeded']).not.toBe(strings['opt.opensMissing']);
    expect(strings['opt.opensNeeded']).not.toContain(strings['opt.opensMissing']);
  });
  it('the error after a press is the "choose" sentence, never the description', () => {
    expect(src).toMatch(/errorMessage: t\('opt\.opensMissing'\)/);
    expect(src).not.toMatch(/errorMessage: t\('opt\.opensNeeded'\)/);
  });
});
