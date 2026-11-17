// Under 600 px a PageHeader whose actions took a line of their own (stacked, or the narrow row
// with a ⋯) starts that line under the title (flex-start), as every other wrapped row on a phone does; from 600 px the
// stacked line keeps the end side.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'PageHeader.module.css'), 'utf8');
const block = (at: string) => {
  const i = css.indexOf(at);
  return i < 0 ? '' : css.slice(i, css.indexOf('\n}\n', i));
};
const rule = (src: string, sel: string) => {
  const i = src.indexOf(`${sel} {`);
  return i < 0 ? '' : src.slice(i, src.indexOf('}', i));
};

describe('PageHeader actions line under 600 px', () => {
  const narrow = block('@container pagehead (width < 600px)');

  it('a stacked header starts its actions line', () => {
    expect(rule(narrow, '.stacked .actions')).toMatch(/justify-content: flex-start;/);
  });

  it('the narrow row with a ⋯ starts its actions line', () => {
    expect(rule(narrow, '.row:has(> .menuEnd) > .actions')).toMatch(/justify-content: flex-start;/);
  });

  it('from 600 px the stacked line keeps the end side', () => {
    expect(rule(css, '.stacked .actions')).toMatch(/justify-content: flex-end;/);
  });
});
