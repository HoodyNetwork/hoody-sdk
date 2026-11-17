// Vitest: the __ID__ page's logic and its interaction in the fixture states it renders. Add a case for each state you add.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { canRename } from './logic';
import page from './page';
import strings from './strings.en.json';

describe('__ID__ logic', () => {
  it('sends a rename only when the trimmed name changed', () => {
    expect(canRename('atlas', 'atlas-2')).toBe(true);
    expect(canRename('atlas', ' atlas ')).toBe(false);
    expect(canRename('atlas', '   ')).toBe(false);
  });
});

describe('__ID__ page', () => {
  it('shows the record with its facts rail', async () => {
    await renderPage(page, {});
    expect(await screen.findByRole('heading', { name: 'atlas' })).toBeInTheDocument();
    expect(screen.getByText(strings['aside.title'])).toBeInTheDocument();
  });

  it('shows the compact empty state of a record without activity', async () => {
    await renderPage(page, { state: 'empty', path: '/__ID__?tab=activity' });
    expect(await screen.findByText(strings['activity.empty'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('opens the edit drawer from the URL', async () => {
    await renderPage(page, { path: '/__ID__?edit=1' });
    expect(await screen.findByRole('dialog', { name: strings['edit.title'] })).toBeInTheDocument();
  });
});
