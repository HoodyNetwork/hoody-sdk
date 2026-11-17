// Vitest (computer colour): Tabs `accent` draws one 4 px band at the top of the bar. It normalises the colour
// itself (a raw value never reaches a style); a missing or invalid colour draws nothing.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const ITEMS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
const band = () => document.querySelector('[data-tab-accent]');

describe('Tabs accent', () => {
  it('draws one band as the first child of the bar, normalised, always by default', () => {
    render(<Tabs label="Views" items={ITEMS} sticky accent="4ecdc4" />);
    expect(document.querySelectorAll('[data-tab-accent]')).toHaveLength(1);
    expect(band()).toHaveAttribute('data-tab-accent', '#4ECDC4');
    expect(band()).toHaveAttribute('data-accent-when', 'always');
    expect(band()?.getAttribute('style')).toContain('--computer: #4ECDC4');
    expect(band()?.parentElement?.firstElementChild).toBe(band());
    expect(band()).toHaveAttribute('aria-hidden', 'true');
  });

  it('accentWhen="narrow" is carried to the CSS switch', () => {
    render(<Tabs label="Views" items={ITEMS} accent="#abc" accentWhen="narrow" />);
    expect(band()).toHaveAttribute('data-tab-accent', '#AABBCC');
    expect(band()).toHaveAttribute('data-accent-when', 'narrow');
  });

  it.each([undefined, '', 'red', '#12345', 'url(x)', 'red;x:url()'])('%j draws no band and sets no --computer', (bad) => {
    render(<Tabs label="Views" items={ITEMS} sticky accent={bad} />);
    expect(band()).toBeNull();
    expect(document.body.innerHTML).not.toContain('--computer');
    expect(document.body.innerHTML).not.toContain('url(');
  });
});
