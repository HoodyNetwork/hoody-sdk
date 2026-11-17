// Vitest (source): a detail header's page buttons, on their own line (stacked or narrow), end at the pane's inset as the
// body's cards do; the header's own end padding is the smaller --sp-3 the frameless end icons need.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const css = readFileSync(path.join(__dirname, 'ListDetailPage.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim().replace(/\s+/g, ' ') === sel)?.[2]?.replace(/\s+/g, ' ').trim();

it('the header pads its end by --sp-3 and the wrapped buttons make up the rest of the pane inset', () => {
  expect(rule('.detailHeader')).toMatch(/padding: var\(--sp-2\) var\(--sp-3\) var\(--sp-2\) var\(--pane-inset, var\(--sp-5\)\);/);
  expect(rule('.detailStacked .detailActions, .detailNarrow:has(> .detailEnd) > .detailActions')).toBe('padding-inline-end: max(0px, calc(var(--pane-inset, var(--sp-5)) - var(--sp-3)));');
});
