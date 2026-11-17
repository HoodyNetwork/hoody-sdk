// Vitest (source): the New schedule chooser adds no padding to the drawer body's own inset, so its choices line up with
// the drawer's title as every other drawer's content does.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('the chooser keeps the drawer body inset: no padding of its own', () => {
  const css = readFileSync(path.join(__dirname, 'Editor.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\.choices\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule).toMatch(/gap:\s*var\(--sp-2\)/);
  expect(rule).not.toMatch(/padding/);
});
