// The terminal's realm colours are kit/tokens.css's dark-theme values: one per palette colour, plus the kit's display-only
// yellow (kit/data/Display RealmColor), which older realm rows may still carry.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REALM_PALETTE } from '@core';
import { REALM_HEX } from './realmColour';

test('realm colours follow the dark tokens', () => {
  const css = readFileSync(path.join(import.meta.dir, '../../kit/tokens.css'), 'utf8');
  const start = css.indexOf(':root[data-hx-theme="dark"]');
  expect(start).toBeGreaterThan(-1);
  const dark = css.slice(start, css.indexOf('}', start));
  for (const c of [...REALM_PALETTE, 'yellow' as const]) {
    const m = new RegExp(`--hx-r-${c}:\\s*(#[0-9a-fA-F]{6})`).exec(dark);
    expect(m?.[1]?.toLowerCase()).toBe(REALM_HEX[c]);
  }
  expect(Object.keys(REALM_HEX).sort()).toEqual([...REALM_PALETTE, 'yellow'].sort());
});
