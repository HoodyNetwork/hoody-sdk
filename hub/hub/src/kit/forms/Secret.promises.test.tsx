// Vitest: SecretInput `promises` draws each promise with a lock glyph in the field's
// description, after the page's description; empty promises draw nothing.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { SecretInput } from './Secret';

beforeEach(() => {
  boot();
});

const field = () => document.querySelector('[data-secret-input]') as HTMLElement;

describe('SecretInput promises', () => {
  it('each promise is drawn with its glyph and read as the field\'s description', () => {
    const { container } = render(<SecretInput label="Bot token" value="" onChange={() => undefined} promises={['Pasted here only', "This page doesn't store it"]} />);
    const row = container.querySelector('[data-secret-promises]') as HTMLElement;
    expect([...row.querySelectorAll('[data-secret-promise]')].map((c) => c.textContent)).toEqual(['Pasted here only', "This page doesn't store it"]);
    expect(row.querySelectorAll('svg')).toHaveLength(2);
    expect(field()).toHaveAccessibleDescription(/Pasted here only\. This page doesn't store it\./);
    expect(screen.getByLabelText('Bot token')).toBe(field());
  });

  it('after the page\'s own description', () => {
    render(<SecretInput label="Bot token" value="" onChange={() => undefined} description="From BotFather." promises={['Pasted here only']} />);
    expect(field()).toHaveAccessibleDescription(/^From BotFather\.\s*Pasted here only\.$/);
  });

  it('no promises (or only blank ones): the description is as before', () => {
    const { container, rerender } = render(<SecretInput label="Bot token" value="" onChange={() => undefined} description="From BotFather." promises={[' ']} />);
    expect(container.querySelector('[data-secret-promises]')).toBeNull();
    expect(field()).toHaveAccessibleDescription('From BotFather.');
    rerender(<SecretInput label="Bot token" value="" onChange={() => undefined} />);
    expect(field()).not.toHaveAttribute('aria-describedby');
  });
});
