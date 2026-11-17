// On Launch an app: a catalogue read the computer never answered is the shared not-reachable state, never
// "The Hub couldn't reach the server"; any other failure keeps the catalogue error with its facts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceError } from '@core';
import { renderPage, screen, userEvent } from '@app/testing';
import type * as Data from './data';
import strings from './strings.en.json';

const S = vi.hoisted(() => ({ catalog: null as unknown, refetches: 0 }));
vi.mock('./data', async (orig) => ({
  ...(await orig<typeof Data>()),
  useCatalog: () => S.catalog,
}));
const failed = (error: unknown) => ({ data: undefined, error, isPending: false, isError: true, isFetching: false, refetch: () => { S.refetches++; return Promise.resolve(); } });

beforeEach(() => { S.refetches = 0; });

describe('Launch an app: the catalogue gets no answer', () => {
  it('no answer: the not-reachable state, with Try again that reads again', async () => {
    S.catalog = failed(new SourceError('network', 'NETWORK', null));
    const { harness: page } = await import('./launch/harness');
    await renderPage(page, { path: '/apps?launch=1' });
    // Inside the Ready to install section the state's title is text, not a heading (the section's title is the heading).
    expect(await screen.findByText("This computer isn't reachable right now")).toBeInTheDocument();
    expect(screen.queryByText(strings['error.catalog.title'])).toBeNull();
    expect(screen.queryByText(/The Hub couldn't reach the server/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(S.refetches).toBe(1);
  });

  it('an answered failure keeps the catalogue error, worded from its facts, never "couldn\'t reach the server"', async () => {
    S.catalog = failed(new SourceError('server', 'INTERNAL_SERVER_ERROR', 500));
    const { harness: page } = await import('./launch/harness');
    await renderPage(page, { path: '/apps?launch=1' });
    expect(await screen.findByText(strings['error.catalog.title'])).toBeInTheDocument();
    expect(screen.queryByText(/isn't reachable right now/)).toBeNull();
    expect(screen.queryByText(/The Hub couldn't reach the server/)).toBeNull();
  });
});

describe('Launch an app: a failed catalogue while the places search', () => {
  it('a failed catalogue stays said, with Try again, and "Nothing found" never claims every place answered', async () => {
    S.catalog = failed(new SourceError('server', 'INTERNAL_SERVER_ERROR', 500));
    const { harness: page } = await import('./launch/harness');
    await renderPage(page, { path: '/apps?launch=1', state: 'search-none' });
    await userEvent.type(await screen.findByRole('searchbox', { name: strings['launch.search'] }), 'zzzzzz');
    expect(await screen.findByText(strings['find.noneTitleIncomplete'].replace('{{q}}', 'zzzzzz'), undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['find.noneBody'])).toBeNull();
    expect(screen.getByText(strings['find.noneSomeFailed'])).toBeInTheDocument();
    expect(screen.getByText(strings['error.catalog.title'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(S.refetches).toBe(1);
  }, 30000);
});
