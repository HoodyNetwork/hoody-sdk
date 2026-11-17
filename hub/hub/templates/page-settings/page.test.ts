// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { isDirty } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('__ID__ logic', () => {
  const saved = { name: 'Personal', region: 'eu' as const, emailAlerts: true };
  it('is dirty only when a value changed', () => {
    expect(isDirty(saved, { ...saved })).toBe(false);
    expect(isDirty(saved, { ...saved, name: ' Personal ' })).toBe(false);
    expect(isDirty(saved, { ...saved, region: 'us' })).toBe(true);
    expect(isDirty(saved, { ...saved, emailAlerts: false })).toBe(true);
  });
});

describe('__ID__ page', () => {
  it('shows the sections without a save bar', async () => {
    await renderPage(page, {});
    expect(await screen.findByLabelText(strings['field.name'])).toHaveValue('Personal');
    expect(screen.queryByRole('button', { name: strings.save })).toBeNull();
  });

  it('shows the compact empty state of a section', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['channels.empty'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
