// Vitest: the launcher's URL keys as another place builds them (links.ts launchSearch, the folder's public file).
// Programs' "Run an app" opens the Apps tab's find drawer with these keys only, so a link it builds opens the drawer
// with the words typed in; links.find writes the same keys.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { GH_PARAM, LAUNCH_PARAM, LAUNCH_Q, launchSearch, links } from './links';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

describe('the launcher in the URL, for other places', () => {
  it('is launch=1, with launchq only when there are words', () => {
    expect([LAUNCH_PARAM, LAUNCH_Q]).toEqual(['launch', 'launchq']);
    expect(launchSearch()).toEqual({ launch: '1' });
    expect(launchSearch('')).toEqual({ launch: '1' });
    expect(launchSearch('jupyter')).toEqual({ launch: '1', launchq: 'jupyter' });
  });

  it('links.find writes the same keys, with the words encoded as before', () => {
    expect(links.find('jupyter lab/2')).toBe('/programs?tab=apps&launch=1&launchq=jupyter%20lab%2F2');
    expect(links.find('')).toBe('/programs?tab=apps&launch=1');
    const u = new URL(links.find('htop'), 'https://x.invalid');
    expect(Object.fromEntries(u.searchParams)).toEqual({ tab: 'apps', ...launchSearch('htop') });
  });

  it('a link built with it opens the find drawer with the words typed in', async () => {
    await renderPage(page, { path: `/apps?${new URLSearchParams(launchSearch('jupyter')).toString()}` });
    expect(await screen.findByRole('table', { name: strings['tab.find'] })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: strings['launch.search'] })).toHaveValue('jupyter');
  });

  it('links.github opens the drawer on From GitHub\'s Ready step; Escape there is Library (the drawer stays), which takes gh= out of the address', async () => {
    expect(GH_PARAM).toBe('gh');
    expect(links.github('octo/demo')).toBe('/programs?tab=apps&launch=1&gh=octo%2Fdemo');
    const { router } = await renderPage(page, { path: `/apps?${new URLSearchParams({ ...launchSearch(), [GH_PARAM]: 'octo/demo' }).toString()}` });
    expect(await screen.findByRole('heading', { name: 'octo/demo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: strings['gh.tab'] })).toBeChecked();
    const u = userEvent.setup();
    // Escape inside Ready is Library, never the drawer's close: the drawer stays open (launch=1 kept).
    act(() => screen.getByRole('button', { name: strings['gh.toLibrary'] }).focus());
    await u.keyboard('{Escape}');
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>)[GH_PARAM]).toBeUndefined());
    expect((router.state.location.search as Record<string, unknown>)[LAUNCH_PARAM]).toBeDefined();
    expect(await screen.findByRole('textbox', { name: strings['gh.address'] })).toBeInTheDocument();
    // Find an app leaves From GitHub: a key would not hold it there.
    await u.click(screen.getByRole('radio', { name: strings['launch.mode.find'] }));
    expect(await screen.findByRole('table', { name: strings['tab.find'] })).toBeInTheDocument();
  });
});
