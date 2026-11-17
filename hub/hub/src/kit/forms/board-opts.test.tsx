import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { SR_ONLY } from '../controls/SrOnly';
import { Switch } from './fields';
import { NumberField, Select } from './more';

// The Board Options panels' switch, picker and number rows.
beforeEach(() => {
  boot();
});

describe('Switch labelHidden', () => {
  it('keeps the label as the accessible name without drawing it', () => {
    render(<Switch label="Show the clock" labelHidden />);
    const sw = screen.getByRole('switch', { name: 'Show the clock' });
    const text = within(sw.closest('label') as HTMLElement).getByText('Show the clock');
    expect(text.className).toBe(SR_ONLY);
    expect(text).not.toHaveAttribute('title');
  });

  it('draws the label by default', () => {
    render(<Switch label="Show the clock" />);
    const text = screen.getByText('Show the clock');
    expect(text.className).toMatch(/switchLabel/);
    expect(text).toHaveAttribute('title', 'Show the clock');
  });
});

describe('Select option swatch and sample', () => {
  const options = [
    { value: 'dusk', label: 'Dusk', swatch: ['#101820', '#f2aa4c', '#e0e0e0', '#ff0000'] },
    { value: 'mono', label: 'Mono', sample: { fontFamily: 'JetBrains Mono' } },
    { value: 'plain', label: 'Plain' },
  ] as const;

  it('draws up to three swatch colours before the label and the label in its sample font', async () => {
    render(<Select label="Theme" value="dusk" onChange={() => undefined} options={options} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Theme/ }));
    const dusk = screen.getByRole('option', { name: 'Dusk' });
    const dots = dusk.querySelectorAll('[aria-hidden="true"] > span');
    expect([...dots].map((d) => (d as HTMLElement).style.backgroundColor)).toEqual(['#101820', '#f2aa4c', '#e0e0e0']);
    expect(within(screen.getByRole('option', { name: 'Mono' })).getByText('Mono').style.fontFamily).toBe('"JetBrains Mono"');
    const plain = screen.getByRole('option', { name: 'Plain' });
    expect(plain.querySelector('[aria-hidden="true"] > span')).toBeNull();
    expect(within(plain).getByText('Plain').getAttribute('style')).toBeNull();
  });

  it('shows the chosen option with its swatches on the button', () => {
    render(<Select label="Theme" value="dusk" onChange={() => undefined} options={options} />);
    const btn = screen.getByRole('button', { name: /Theme/ });
    expect(btn.querySelectorAll('[aria-hidden="true"] > span[style]')).toHaveLength(3);
  });
});

describe('NumberField placeholder', () => {
  it('passes the placeholder to its input', () => {
    render(<NumberField label="Columns" placeholder="Automatic" />);
    expect(screen.getByRole('textbox', { name: 'Columns' })).toHaveAttribute('placeholder', 'Automatic');
  });
});
