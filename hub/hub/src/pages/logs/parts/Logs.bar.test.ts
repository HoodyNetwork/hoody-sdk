// Vitest (source): the Logs bar adds no padding above itself, so the page header keeps the same gap to the first block
// as on every other page.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('.bar pads below only', () => {
  const css = readFileSync(path.join(__dirname, 'Logs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(/\.bar\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/padding-block:\s*0 var\(--sp-2\);/);
});
