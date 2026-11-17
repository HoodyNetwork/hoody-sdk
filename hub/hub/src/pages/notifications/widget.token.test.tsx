// Vitest: the Home widget in a shared-access (token) session. Core refuses the account's notices unsent, so a
// "Try again" could never work: the widget says where the notifications are, as the page does, and offers no retry.
import { bootFixtureCore } from '@core';
import { renderPage, screen } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

describe('notifications widget in a shared-access session', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('says the notifications are kept in the account, with no load error and no Try again', async () => {
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'access-key' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.error'])).toBeNull();
    expect(screen.queryByRole('button', { name: kitStrings['action.retry'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.readAll })).toBeNull();
  });

  it('a list that fails for another reason keeps its load error and Try again', async () => {
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'error' });
    expect(await screen.findByText(strings['widget.error'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: kitStrings['action.retry'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['token.title'])).toBeNull();
  });
});
