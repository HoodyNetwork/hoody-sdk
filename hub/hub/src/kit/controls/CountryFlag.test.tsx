import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountryFlag } from './CountryFlag';

describe('CountryFlag', () => {
  it('draws the flag with its upper-case code as the name, in any case', () => {
    const { getByRole } = render(<CountryFlag code="sg" />);
    const el = getByRole('img', { name: 'SG' });
    expect(el.textContent).toBe('🇸🇬');
    expect(el).toHaveAttribute('aria-label', 'SG');
    expect(el).toHaveAttribute('title', 'SG');
  });

  it('a label replaces the name', () => {
    const { getByRole } = render(<CountryFlag code="SG" label="Singapore" />);
    expect(getByRole('img', { name: 'Singapore' })).toHaveAttribute('title', 'Singapore');
  });

  it('renders nothing for an unknown code', () => {
    for (const code of [undefined, null, '', 'S', 'SGP', '1x', ' sg']) {
      const { container } = render(<CountryFlag code={code} />);
      expect(container).toBeEmptyDOMElement();
    }
  });
});
