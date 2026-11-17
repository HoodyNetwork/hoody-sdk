// Vitest: a shared-access (access key) session on every view of Notifications. Inbox and Notices both keep the page's
// tabs, say where the account's lists are and offer the one way out (SignOutAction); Get notified opens. Core refuses the
// account's lists unsent: no request of the inbox or the notices list ever reaches the server, whichever tab is opened.
import type { FixtureRule } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { abuseRoutes } from './abuse';
import { routes } from './data';
import page from './page';
import strings from './strings.en.json';

// The shell's Sign out (renderPage draws no shell): the one way out both views offer.
const shell = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@kit', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const real = m.useShellData as () => Record<string, unknown>;
  return { ...m, useShellData: () => ({ ...real(), signOut: shell.signOut }) };
});

const sent: string[] = [];
// Each rule only notes the request and falls through: a request that reached the transport went out.
const spy = (name: string, route: FixtureRule['route']): FixtureRule => ({ route, when: () => { sent.push(name); return false; }, answer: () => ({ status: 500, body: {} }) as never });
const rules = [spy('inbox', routes.list), spy('notices', abuseRoutes.list), spy('notice', abuseRoutes.get)];
const tabs = () => screen.findByRole('tablist', { name: strings['h.tabs.label'] });

describe('Notifications tabs in a shared-access session', () => {
  it('Inbox and Notices each say where the lists are with the way out, the tabs stay, and nothing account-only is sent', async () => {
    sent.length = 0;
    await renderPage(page, { state: 'access-key', path: '/notifications', rules });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['token.signOut'] })).toBeInTheDocument();
    await tabs();
    await userEvent.click(screen.getByRole('tab', { name: strings['h.tab.notices'] }));
    expect(await screen.findByText(strings['an.noTokenTitle'])).toBeInTheDocument();
    expect(screen.getByText(strings['an.noToken'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['token.signOut'] }));
    expect(shell.signOut).toHaveBeenCalledTimes(1);
    await tabs();
    await userEvent.click(screen.getByRole('tab', { name: strings['h.tab.learn'] }));
    await waitFor(() => expect(screen.queryByText(strings['an.noTokenTitle'])).toBeNull());
    await userEvent.click(await screen.findByRole('tab', { name: strings['h.tab.inbox'] }));
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it('the notices list is named without a count until it has one, never "0 in all"', async () => {
    await renderPage(page, { path: '/notifications/notices', latency: 'slow' });
    expect(await screen.findByRole('table', { name: strings['an.listName'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings['an.list'].replace('{{n}}', '0') })).toBeNull();
  });
});
