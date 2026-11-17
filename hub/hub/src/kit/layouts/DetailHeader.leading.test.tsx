// DetailHeader `leading` (computer detail head): a mark that belongs with the name sits before the h2 on
// the title line, centred on it, and a stacked name wraps beside it rather than dropping under it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailHeader } from './ListDetailPage';

const css = readFileSync(join(__dirname, 'ListDetailPage.module.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('DetailHeader leading', () => {
  it('draws the leading mark first on the title line, before the h2', () => {
    render(<DetailHeader title="web-prod-1" leading={<span data-testid="mark">M</span>} status={<span>Running</span>} />);
    const line = screen.getByRole('heading', { level: 2, name: 'web-prod-1' }).parentElement!;
    const slot = screen.getByTestId('mark').closest('[data-detail-leading]') as HTMLElement;
    expect(slot.parentElement).toBe(line);
    expect(line.firstElementChild).toBe(slot);
  });

  it('CSS: the slot does not shrink and centres its mark; a stacked name wraps beside it', () => {
    expect(rule('.detailLeading')).toMatch(/flex: none;/);
    expect(rule('.detailLeading')).toMatch(/align-items: center;/);
    expect(rule('.detailStacked .detailLeading + .detailTitle')).toMatch(/min-inline-size: 0;/);
  });
});
