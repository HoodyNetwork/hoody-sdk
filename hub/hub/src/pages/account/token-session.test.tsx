// Vitest: a shared-access (token) session opens Account. Core refuses the account's own reads (two-step sign-in,
// sessions, history, keys) unsent, so the page says where they are, as Keys and Vault do, and offers no Try again.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('account in a shared-access session', () => {
  it('shows the account-only notice, not "could not be read" with Try again', async () => {
    await renderPage(page, { state: 'access-key', path: '/account' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['token.body'])).toBeInTheDocument();
    // The page keeps its frame: its heading stays.
    expect(screen.getByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument();
    expect(screen.queryByText(strings['sum.twofaUnknown'])).toBeNull();
    expect(screen.queryByText(strings['sum.sessionsUnknown'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['sum.tryAgain'] })).toBeNull();
  });

  it('an account session still shows the settings', async () => {
    await renderPage(page, { path: '/account' });
    expect((await screen.findAllByText(strings['p.title'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['token.title'])).toBeNull();
  });
});
