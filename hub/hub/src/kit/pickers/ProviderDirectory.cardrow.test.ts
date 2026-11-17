// Vitest (source): a provider card's name asks for 6rem before its button wraps under it, so in the directory's
// two-column grid "Set up" stays beside the name as the shorter "View" does: one card layout in one grid.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('.cardName: flex 1 1 6rem on a wrapping .cardTop', () => {
  const css = readFileSync(path.join(__dirname, 'ModelChooser.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(/\.cardTop\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/flex-wrap:\s*wrap;/);
  expect(/\.cardName\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/flex:\s*1 1 6rem;/);
});
