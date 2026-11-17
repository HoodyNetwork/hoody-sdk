// Vitest (source): a row's word button stands the planned gap from the control beside it. The column plan reserves
// ROW_CONTROL_GAP (`--sp-2`) after the inline button; the wrap's own gap is `--sp-half`, so the button adds the rest.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROW_CONTROL_GAP } from './rowControlMetrics';

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync(path.join(__dirname, 'DataTable.module.css'), 'utf8'));
const tokens = strip(readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8'));
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/\s+/g, ' ').trim()] as const);
const px = (name: string) => parseFloat(new RegExp(`${name}:\\s*([\\d.]+)px;`).exec(tokens)![1]!);

describe("a row's word button and its neighbour", () => {
  it('the wrap keeps --sp-half and the word button adds the rest of --sp-2', () => {
    expect(rules.find(([sel]) => sel === '.rowActionsWrap')![1]).toMatch(/gap: var\(--sp-half\);/);
    const word = rules.find(([sel]) => sel === ".rowActionsWrap:not([data-row-size='xs']) > span[data-row-actions]:not([data-row-open], :last-child)");
    expect(word?.[1]).toBe('margin-inline-end: calc(var(--sp-2) - var(--sp-half));');
  });

  it('that is the gap the column plan reserves', () => {
    expect(px('--sp-half') + (px('--sp-2') - px('--sp-half'))).toBe(ROW_CONTROL_GAP);
  });

  it('the word button is the only bare span[data-row-actions] the table draws in the wrap', () => {
    const tsx = readFileSync(path.join(__dirname, 'DataTable.tsx'), 'utf8');
    expect(tsx.match(/<span data-row-actions="">/g)).toHaveLength(1);
    expect(tsx).toMatch(/<span data-row-open="" data-row-actions="">/);
  });
});
