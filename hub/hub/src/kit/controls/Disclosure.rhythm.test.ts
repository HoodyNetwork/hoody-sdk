// An open Disclosure lays its body out in the block rhythm (--gap-block): a Band and the InlineActions under it never
// touch, so a page never wraps the body in a Stack. Only while open: a closed panel keeps React Aria's `hidden`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Disclosure.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel: string) => {
  const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => r[1]!.replace(/\s+/g, ' ').trim() === sel);
  return m ? m[2]!.replace(/\s+/g, ' ').trim() : null;
};

describe('Disclosure body rhythm', () => {
  it('an open panel is a column with the block gap', () => {
    const open = body('.disclosure[data-expanded] .panel') ?? '';
    expect(open).toMatch(/display: flex;/);
    expect(open).toMatch(/flex-direction: column;/);
    expect(open).toMatch(/gap: var\(--gap-block\);/);
  });
  it('the closed panel sets no display, so React Aria\'s hidden still hides it', () => {
    expect(body('.panel') ?? '').not.toMatch(/display/);
  });
});
