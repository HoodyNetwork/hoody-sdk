// Vitest: Files reads every page of the realm's computer list (core useComputersAll),
// so a computer past the first 100 opens from a link. A computer missing from a list not known to be whole is unknown, and
// the pane says why: later pages still loading, a page that failed, more computers than Files reads, or a list read in several
// pages (which can skip a computer). Only a list that fits one page makes it "not in this realm" (page.test.tsx).
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { listAsked, resetFiles } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const paneB = () => screen.findByRole('region', { name: strings['pane.b'] });
beforeEach(() => { resetFiles(); });

describe('files: a realm with more than 100 computers', () => {
  it('a link to a computer on page 2 of the list opens its folder', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv', state: 'pages' });
    const a = await paneA();
    expect(await within(a).findByText('app', {}, { timeout: 5000 })).toBeTruthy();
    expect(within(a).queryByText(strings['pick.unknown'])).toBeNull();
  });

  it('a link to a computer on no page, once every page is in: not found yet (never gone), the list is read in parts, Check again', async () => {
    await renderPage(page, { path: '/files?a=nowhere.0000', state: 'pages' });
    const a = await paneA();
    expect(await within(a).findByText(strings['pick.unknownUnproven'], {}, { timeout: 5000 })).toBeTruthy();
    expect(within(a).getByText(strings['pick.unknown'])).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
    expect(listAsked).toEqual([1, 2]);
    // Check again reads the list again: pages 1 and 2 once more, never a page past the end.
    await userEvent.click(within(a).getByRole('button', { name: strings['action.checkAgain'] }));
    await waitFor(() => expect(listAsked).toHaveLength(4));
    expect(listAsked.slice(2).sort()).toEqual([1, 2]);
    expect(await within(a).findByText(strings['pick.unknownUnproven'], {}, { timeout: 5000 })).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
  });

  it('a refresh whose page 1 comes back unreadable: a computer on page 3 stays open in the other pane, and the list reads as failed', async () => {
    await renderPage(page, { path: '/files?a=nowhere.0000&b=atlas.00a1&bp=%2Fsrv', state: 'pagesBadRefresh' });
    const a = await paneA();
    const b = await paneB();
    expect(await within(b).findByText('app', {}, { timeout: 5000 })).toBeTruthy();
    expect(await within(a).findByText(strings['pick.unknownUnproven'], {}, { timeout: 5000 })).toBeTruthy();
    await userEvent.click(within(a).getByRole('button', { name: strings['action.checkAgain'] }));
    expect(await within(a).findByText(strings['pick.unknownFailed'], {}, { timeout: 5000 })).toBeTruthy();
    expect(within(b).getByText('app')).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
  });

  it('page 1 unreadable while the refreshed later pages end the list sooner: a computer on page 3 stays open', async () => {
    await renderPage(page, { path: '/files?a=nowhere.0000&b=atlas.00a1&bp=%2Fsrv', state: 'pagesBadShrink' });
    const a = await paneA();
    const b = await paneB();
    expect(await within(b).findByText('app', {}, { timeout: 5000 })).toBeTruthy();
    expect(await within(a).findByText(strings['pick.unknownUnproven'], {}, { timeout: 5000 })).toBeTruthy();
    await userEvent.click(within(a).getByRole('button', { name: strings['action.checkAgain'] }));
    expect(await within(a).findByText(strings['pick.unknownFailed'], {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(listAsked.filter((n) => n === 3)).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 100));
    expect(within(b).getByText('app')).toBeTruthy();
    expect(within(b).queryByText(strings['pick.unknown'])).toBeNull();
    expect(within(b).queryByText(strings['pick.gone'])).toBeNull();
  });

  it('while page 2 is out: the computer is not known yet (never gone), and the pane says the list is still being read', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv', state: 'pagesSlow' });
    const a = await paneA();
    expect(await within(a).findByText(strings['pick.unknownMore'])).toBeTruthy();
    expect(within(a).getByText(strings['pick.unknown'])).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
  });

  it('page 2 failing: not known (never gone), and the pane says part of the list could not be read', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv', state: 'pagesFailed' });
    const a = await paneA();
    expect(await within(a).findByText(strings['pick.unknownFailed'])).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
  });

  it('more computers than Files reads: not known (never gone), and the pane says Files reads the first 1,000', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv', state: 'pagesCapped' });
    const a = await paneA();
    const words = strings['pick.unknownCapped'].replace('{{max}}', '1,000');
    expect(await within(a).findByText(words, {}, { timeout: 8000 })).toBeTruthy();
    expect(within(a).queryByText(strings['pick.gone'])).toBeNull();
  });
});
