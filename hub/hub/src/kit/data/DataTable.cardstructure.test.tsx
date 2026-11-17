// Vitest: a card's structure. Its title line centres the mark, the name and the status on one line, and its fields
// read as two groups: plain lines first, then label and value rows one step lower.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? null : css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at)).replace(/\s+/g, ' ').trim();
};

describe('a DataTable card', () => {
  it('centres its title line: a name beside a taller mark sits at the mark\'s middle', () => {
    expect(rule('.cardTop')).toContain('align-items: center;');
    expect(rule('.cardTop')).not.toContain('flex-start');
  });

  it('leads with its first plain line when label and value rows follow', () => {
    expect(rule('.cardItem:first-child:has(> .cardValue:first-child):has(~ .cardItem > .listLabel) > .cardValue')).toBe('color: var(--hx-ink);');
  });

  it('starts its label and value rows one step under its plain lines', () => {
    expect(rule('.cardItem:has(> .cardValue:first-child) + .cardItem:has(> .listLabel)')).toBe('margin-block-start: var(--sp-1);');
  });
});
