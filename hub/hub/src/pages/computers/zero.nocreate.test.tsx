// Vitest: with no computer and a login that can't get computers, the empty state says so and where to go instead; it
// never asks the person to get a first computer it offers no way to get.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('the Computers empty state for a login without create', () => {
  it('names the login limit instead of "get your first computer"', async () => {
    await renderPage(page, { state: 'emptyLimited', path: '/computers' });
    await screen.findByText(strings['zero.empty.title'], {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: strings['zero.empty.create'] })).toBeNull();
    expect(screen.queryByText(strings['zero.empty.body'])).toBeNull();
    expect(screen.getByText(/This login can't get computers/)).toBeInTheDocument();
  });
});
