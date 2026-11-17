// Vitest: the two toasts a dropped link ask shows cover every ask kind, Preview of a file and
// Open terminal here for a folder, so their words name the link and what happened, never a file the ask may not have had.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe("a dropped link ask's toast words", () => {
  it('name the link and that nothing was opened, never "the file" (a terminal ask is about a folder)', () => {
    for (const key of ['ask.hidden', 'ask.whichComputer'] as const) {
      expect(strings[key]).toMatch(/\blink\b/);
      expect(strings[key]).not.toMatch(/\bfile\b/i);
    }
  });
});
