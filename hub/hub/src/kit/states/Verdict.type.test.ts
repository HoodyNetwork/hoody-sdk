// The Verdict's sentence is a status sentence, not a page title:
// it takes --t-heading (18/24), one step under the page title's --t-title (26/32), on every
// page; the small caps label stays --t-label. One rule in the kit, no per-page size.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'Verdict.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string): string => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('Verdict type', () => {
  it('the sentence is the heading step, never the page title or display size', () => {
    expect(rule('.sentence')).toMatch(/font:\s*var\(--t-heading\)/);
    expect(css).not.toMatch(/--t-title|--t-display/);
  });
  it('the label keeps the small caps label face', () => {
    expect(css).toMatch(/\.label,\s*\.count\s*\{[^}]*font:\s*var\(--t-label\)/);
  });
});
