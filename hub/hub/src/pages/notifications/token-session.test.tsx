// Vitest: a shared-access (token) session opens the Inbox. Core refuses the account's notices unsent
// (TOKEN_SESSION_REFUSED), so the page says where they are, as Keys and Vault do, and offers no Try again.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

describe('notifications in a shared-access session', () => {
  it('shows the account-only notice, not a load error with Try again', async () => {
    await renderPage(page, { state: 'access-key', path: '/notifications' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['token.body'])).toBeInTheDocument();
    // The page keeps its frame: its heading.
    expect(screen.getByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: kitStrings['action.retry'] })).toBeNull();
    expect(screen.queryByText("This didn't load", { exact: false })).toBeNull();
  });

  it('an account session still lists its notices', async () => {
    await renderPage(page, { path: '/notifications' });
    expect(await screen.findByText('Computer atlas stopped', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(strings['token.title'])).toBeNull();
  });
});
