// Vitest: the notifications page in its fixture states.
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFixtureServer, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';
import formStrings from '@kit/forms/forms.strings.en.json';

// The bulk bar's Mark read (the rows' hover icons and the inspector's button share the name).
const bulkButtons = () => screen.queryAllByRole('button', { name: strings.read }).filter((b) => !b.closest('table') && !b.closest('[role="region"]'));
const bulkButton = async () => {
  await waitFor(() => expect(bulkButtons().length).toBe(1));
  return bulkButtons()[0]!;
};

// C9 wording: the kit's own pending title, the same on every page.
const PENDING = formStrings['outcome.pendingShort'];

describe('notifications inbox', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('lists unread notices and opens one in the inspector', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const row = (
      await within(table).findAllByRole('row', {
        name: /Computer atlas stopped/,
      })
    )[0];
    if (!row) throw new Error('no row');
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.search).toMatchObject({
      sel: expect.any(String),
    });
    expect(
      await screen.findByRole('region', {
        name: kitStrings['listDetail.detail'],
      }),
    ).toBeInTheDocument();
  });

  it('a notice about a stopped computer links to Computers and the logs (CS: detail links)', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const row = (await within(table).findAllByRole('row', { name: /Computer atlas stopped/ }))[0];
    if (!row) throw new Error('no row');
    row.focus();
    await userEvent.keyboard('{Enter}');
    const insp = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    expect(within(insp).getByRole('link', { name: strings['inspector.openComputers'] })).toHaveAttribute('href', expect.stringContaining('computers'));
    expect(within(insp).getByRole('link', { name: strings['inspector.openLogs'] })).toHaveAttribute('href', expect.stringContaining('logs'));
  });

  it('an unconfirmed mark-read uses the C9 words, never its own', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    await userEvent.click((await within(await screen.findByRole('table', {}, { timeout: 8000 })).findAllByRole('button', { name: strings.read }))[0]!);
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    expect(screen.queryByText(/May have been marked read/)).toBeNull();
    expect(screen.getAllByText(/may have gone through/i).length).toBeGreaterThan(0);
  });

  it('shows the caught-up state', async () => {
    await renderPage(page, { state: 'caught-up' });
    expect(await screen.findByText(strings.noneUnread)).toBeInTheDocument();
  });

  it('shows the error state', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('says how many it shows when the inbox is capped', async () => {
    await renderPage(page, { state: 'capped' });
    expect((await screen.findAllByText(/312/)).length).toBeGreaterThan(0);
  });

  it('shows the archive', async () => {
    await renderPage(page, { path: '/notifications?box=archive' });
    expect((await screen.findAllByRole('row', { name: /Payment received/ })).length).toBeGreaterThan(0);
  });
});

describe('notifications learn', () => {
  it('asks before turning alerts on', async () => {
    await renderPage(page, {
      path: '/notifications/learn',
      state: 'browser-ask',
    });
    expect(await screen.findByRole('button', { name: strings['h.act.enable'] })).toBeInTheDocument();
  });

  it('explains a blocked browser', async () => {
    await renderPage(page, {
      path: '/notifications/learn',
      state: 'browser-blocked',
    });
    expect(await screen.findByText(strings['h.status.blocked'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['h.act.turnOn'] })).toBeNull();
  });

  it('offers a test alert when alerts are on', async () => {
    await renderPage(page, {
      path: '/notifications/learn',
      state: 'browser-on',
    });
    expect(await screen.findByRole('button', { name: strings['h.act.test'] })).toBeInTheDocument();
  });

  it('says why an iPhone tab cannot show alerts', async () => {
    await renderPage(page, {
      path: '/notifications/learn',
      state: 'browser-ios',
    });
    expect(await screen.findByText(strings['h.why.ios_tab'])).toBeInTheDocument();
  });

  it('switches to the Inbox through the layout view switch under the header', async () => {
    const { router } = await renderPage(page, { path: '/notifications/learn' });
    const learn = await screen.findByRole('tab', { name: strings['h.tab.learn'] });
    expect(learn).toHaveAttribute('aria-selected', 'true');
    // the strip is the page's view switch, not a notice: the element right after the page header holds it
    const header = document.querySelector('header:has(h1)')!;
    expect(header.nextElementSibling!.contains(learn)).toBe(true);
    // the unread badge, as on the Inbox's own tabs
    const inbox = screen.getByRole('tab', { name: new RegExp(`^${strings['h.tab.inbox']}`) });
    expect(inbox.textContent).not.toBe(strings['h.tab.inbox']);
    await userEvent.click(inbox);
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
    // a history entry: Back returns to Get notified
    router.history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications/learn'));
  });
});

describe('notifications acks that may have gone through', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });
  const rowButton = async () => (await within(await screen.findByRole('table', {}, { timeout: 8000 })).findAllByRole('button', { name: strings.read }))[0]!;

  it('a failed read-back keeps "may have been marked read" until a read succeeds', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    await userEvent.click(await rowButton());
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    setListDown(false);
    await userEvent.click(screen.getByRole('button', { name: /^Check/ }));
    await waitFor(() => expect(screen.queryByText(PENDING)).toBeNull());
  });

  it('selecting the row after its check button went pending does not show it as failed', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    await userEvent.click(await rowButton());
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row').find((r) => r.getAttribute('aria-label') || r.textContent?.includes('Computer'));
    row?.focus();
    await userEvent.keyboard('{Enter}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/Couldn’t mark/)).toBeNull();
    expect(screen.getAllByText(PENDING).length).toBeGreaterThan(0);
  });

  it('shows a pending row action above the table when its row is not selected', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    await userEvent.click(await rowButton());
    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: kitStrings['listDetail.detail'] })).toBeNull();
  });

  it('the bulk Read button records each id, so opening the row afterwards does not show it as failed', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const boxes = await within(table).findAllByRole('checkbox');
    await userEvent.click(boxes[0] as HTMLElement);
    await userEvent.click(await bulkButton());
    // The pending row moves from the notice above the list into the inspector (the bulk run opens it).
    await waitFor(() => expect(within(screen.getByRole('region', { name: kitStrings['listDetail.detail'] })).getByText(PENDING)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/Couldn’t mark/)).toBeNull();
  });
});
