// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { formatPrice, nameProblem, settle } from './logic';
import page from './page';
import strings from './strings.en.json';

const existing = [{ id: 'item-01', name: 'boreal' }];

describe('__ID__ logic', () => {
  it('checks the name before sending', () => {
    expect(nameProblem('  ', existing)).toBe('name.required');
    expect(nameProblem('boreal', existing)).toBe('name.taken');
    expect(nameProblem('atlas', existing)).toBeUndefined();
  });

  it('settles an unknown create only from a read-back that shows it', () => {
    expect(settle('pending', 'boreal', existing)).toBe('done');
    expect(settle('pending', 'atlas', existing)).toBe('pending');
    expect(settle('pending', 'atlas', undefined)).toBe('pending');
    expect(settle('failed', 'boreal', existing)).toBe('failed');
  });

  it('formats a monthly price', () => {
    expect(formatPrice(1200)).toBe('$12.00');
  });
});

describe('__ID__ page', () => {
  it('starts at the name step and refuses a blank name', async () => {
    await renderPage(page, {});
    await screen.findByLabelText(strings['name.label']);
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    expect(await screen.findByText(strings['name.required'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
