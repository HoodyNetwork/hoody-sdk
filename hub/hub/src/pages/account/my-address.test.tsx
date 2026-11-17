// Account > Sign-in sessions opens with this browser's address as the
// Hoody API sees it (GET /api/v1/ip): kit IpInfo, IpInfo's Copy of the exact address, an InfoTip. While it loads the row
// holds a labelled Spinner (no Skeleton: anatomy layout.state); a failed read, or an answer naming no address, says
// so with Try again, never a blank row.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const S = strings;
const SLOW = { timeout: 8000 };
// IpInfo's own Copy (kit IpInfo strings 'ip.copy'): one Copy per address, no second button beside it.
const COPY = /^Copy 203\.0\.113\.7$/;
const row = async () => (await screen.findByText(S['s.ip.label'], undefined, SLOW)).closest('[class*="row"]') as HTMLElement;

describe('account: this browser\'s address', () => {
  it('shows the address with its place, a Copy of it and the InfoTip', async () => {
    await renderPage(page, { path: '/account' });
    const r = await row();
    expect(await within(r).findByText('203.0.113.7', undefined, SLOW)).toBeInTheDocument();
    expect(r).toHaveTextContent(/Lisbon/);
    expect(within(r).getAllByRole('button', { name: /^Copy/ })).toHaveLength(1);
    expect(within(r).getByRole('button', { name: COPY })).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: new RegExp(S['s.ip.label']) })).toBeInTheDocument();
  });

  it('is the first thing in the sessions block, before the list', async () => {
    await renderPage(page, { path: '/account' });
    const r = await row();
    const table = await screen.findByRole('grid', { name: S['s.title'] }, SLOW).catch(() => screen.findByRole('table', { name: S['s.title'] }, SLOW));
    expect(r.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Copy puts the exact address on the clipboard', async () => {
    // user-event's own clipboard stub (setup() installs it): readText answers what the page wrote.
    const user = userEvent.setup();
    await renderPage(page, { path: '/account' });
    const r = await row();
    await within(r).findByText('203.0.113.7', undefined, SLOW);
    await user.click(within(r).getByRole('button', { name: COPY }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('203.0.113.7'));
  });

  it('loading: a labelled loader in the row, no address yet', async () => {
    await renderPage(page, { state: 'ip-loading', path: '/account' });
    const r = await row();
    expect(within(r).getByRole('status', { name: S['s.ip.reading'] })).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: COPY })).toBeNull();
  });

  it('a failed read says so with Try again, never a blank row', async () => {
    await renderPage(page, { state: 'ip-error', path: '/account' });
    const r = await row();
    expect(await within(r).findByText(S['s.ip.failed'], undefined, SLOW)).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: COPY })).toBeNull();
  });

  it('an answer naming no address reads as not known, with Try again', async () => {
    await renderPage(page, { state: 'ip-none', path: '/account' });
    const r = await row();
    expect(await within(r).findByText(S['s.ip.failed'], undefined, SLOW)).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('a suspended account still shows the row (sessions only)', async () => {
    await renderPage(page, { state: 'suspended', path: '/account' });
    // The page drops to sessions only once its identity read answers: the row is looked up after that.
    await screen.findByText(S['suspended.title'], undefined, SLOW);
    expect(await screen.findByText('203.0.113.7', undefined, SLOW)).toBeInTheDocument();
    const r = await row();
    expect(within(r).getByText('203.0.113.7')).toBeInTheDocument();
  });
});
