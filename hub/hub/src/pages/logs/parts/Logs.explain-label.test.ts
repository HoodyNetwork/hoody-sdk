// Vitest (source): the Explain drawer's field label reads like the drawer's other labels (sentence case, ink, --fs-md,
// medium), not a caps heading.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('.sectionTitle: ink, --fs-md, medium, no caps', () => {
  const css = readFileSync(path.join(__dirname, 'Logs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const own = /(?:^|\})\s*\.sectionTitle\s*\{([^}]*)\}/.exec(css)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  expect(own).toContain('color: var(--hx-ink);');
  expect(own).toContain('font-size: var(--fs-md);');
  expect(own).toContain('font-weight: var(--fw-medium);');
  expect(own).not.toMatch(/text-transform|letter-spacing/);
});
