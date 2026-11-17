// TERM_TOKENS (tokens.ts): --pad-page is the kit's page gutter in the terminal, one cell at every width class, so a
// page that pads its own header with var(--pad-page) lines up with the kit's toolbars (keys header-gutter test).
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { envFor, WIDTH_CLASSES } from './queries';
import { loadTokens, TERM_TOKENS } from './tokens';
import { spaceCells } from './units';

const CSS = fs.readFileSync(path.join(import.meta.dirname, '../../../src/kit/tokens.css'), 'utf8');

test('every TERM_TOKENS row names a token tokens.css declares, with a why', () => {
  for (const t of TERM_TOKENS) {
    expect(CSS).toContain(`${t.name}:`);
    expect(t.why.length).toBeGreaterThan(20);
  }
});

for (const [w, wc] of Object.entries(WIDTH_CLASSES)) {
  test(`${w}: --pad-page reads as one cell, from the terminal row`, () => {
    const set = loadTokens(CSS, envFor(wc));
    const v = set.values.get('--pad-page') ?? '';
    expect(v).toMatch(/^\d+px$/);
    expect(spaceCells(parseInt(v, 10), 'h')).toBe(1);
    expect(set.from.get('--pad-page')).toMatch(/^terminal \(/);
  });
}

test('a token with no row keeps its tokens.css value', () => {
  const set = loadTokens(':root { --sp-4: 16px; --pad-page: 24px; }', envFor(WIDTH_CLASSES.narrow!));
  expect(set.values.get('--sp-4')).toBe('16px');
  expect(set.values.get('--pad-page')).toBe('8px');
});
