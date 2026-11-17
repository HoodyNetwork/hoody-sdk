// The generated kit contract names (src/term/kit/contract.names.gen.ts, read by the graph gate) equal a fresh run of
// their generator, scripts/term/contract-names.ts. A stale file: `bun scripts/term/contract-names.ts --write`.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import { kitSurface, NAMES_FILE, renderNames } from './contract-names';

describe('contract names', () => {
  test('the committed file equals a fresh run of the generator', () => {
    expect(fs.readFileSync(path.join(HUB, NAMES_FILE), 'utf8')).toBe(renderNames(kitSurface()));
  }, 120_000);

  test('kinds: components render, use* are hooks, the rest values; nothing listed twice', () => {
    const s = kitSurface();
    expect(s.components).toContain('Handoff');
    expect(s.values).toContain('openOutside');
    expect(s.hooks.every((h) => /^use[A-Z]/.test(h))).toBe(true);
    const all = [...s.components, ...s.generic, ...s.hooks, ...s.values];
    expect(new Set(all).size).toBe(all.length);
  }, 120_000);
});
