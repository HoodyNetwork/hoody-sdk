// The sign-out forget has exactly one caller,
// lifecycle.ts signOutForgetting. No other non-test source names
// forgetAccountChanges (an import, a call, a re-export, `x.forgetAccountChanges`, `x['forgetAccountChanges']`), so
// wiring it anywhere else, an index re-export or a shell button among them, fails here first.
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { referencesIn, sourcesUnder } from './test/noarg-scan';

const NAME = 'forgetAccountChanges';
/** The definition and its one caller. */
const OWNERS = new Set(['core/changes.ts', 'core/lifecycle.ts']);

describe('conformance: only core/lifecycle.ts calls the sign-out forget', () => {
  it('no non-test source outside core/changes.ts (its definition) and core/lifecycle.ts names forgetAccountChanges', () => {
    const src = join(import.meta.dirname, '..');
    const named = sourcesUnder(src).map((f) => relative(src, f).split(sep).join('/')).filter((rel) => !OWNERS.has(rel) && referencesIn(readFileSync(join(src, rel), 'utf8'), NAME, rel) > 0);
    expect(named).toEqual([]);
  });
  it('the owners do name it (the scan is not blind)', () => {
    const src = join(import.meta.dirname, '..');
    for (const rel of OWNERS) expect(referencesIn(readFileSync(join(src, rel), 'utf8'), NAME, rel)).toBeGreaterThan(0);
  });
  it('every form of naming it is seen', () => {
    expect(referencesIn("import { forgetAccountChanges as f } from './changes';", NAME)).toBe(1);
    expect(referencesIn("export { forgetAccountChanges } from './changes';", NAME)).toBe(1);
    expect(referencesIn('void core.forgetAccountChanges(a, s, x);', NAME)).toBe(1);
    expect(referencesIn("void core['forgetAccountChanges'](a, s, x);", NAME)).toBe(1);
    expect(referencesIn('const { forgetAccountChanges: go } = core;', NAME)).toBe(1);
    expect(referencesIn("const s = 'forgetAccountChanges is mentioned in a string';", NAME)).toBe(0);
  });
});
