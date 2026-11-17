// Vitest: the Inbox on the kit list/detail layout: the detail is the kit's
// pane with its header, and row actions come from the table's declared `actions`. (Browser choices are core's:
// core/alerts.test.ts.)
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const openAtlas = async () => {
  const table = await screen.findByRole('table', {}, { timeout: 8000 });
  const row = (await within(table).findAllByRole('row', { name: /Computer atlas stopped/ }))[0];
  if (!row) throw new Error('no row');
  row.focus();
  await userEvent.keyboard('{Enter}');
  return table;
};

describe('Inbox on the kit list/detail layout', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('a selected notice opens in the kit detail pane, with its title as the heading and the kit close button', async () => {
    await renderPage(page);
    await openAtlas();
    const pane = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    expect(within(pane).getByRole('heading', { level: 2, name: /Computer atlas stopped/ })).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: kitStrings['listDetail.close'] })).toBeInTheDocument();
  });

  // At a fine pointer Mark read is the row's hover icon, so it is not listed again in ⋯.
  it('an unread row offers Mark read once, as its row icon', async () => {
    await renderPage(page, { state: 'ack-pending-unreadable' });
    const table = await screen.findByRole('table', {}, { timeout: 8000 });
    const markRead = (await within(table).findAllByRole('button', { name: new RegExp(`^${strings.read}`) }))[0] as HTMLElement;
    // Mark read is that unread row's only action, so with it drawn the row has no ⋯ at all.
    const row = markRead.closest('tr') as HTMLElement;
    expect(within(row).queryByRole('button', { name: kitStrings['table.rowActions'] })).toBeNull();
  });

  it('the internal Computers and logs links in a notice are kit links', async () => {
    await renderPage(page);
    await openAtlas();
    const pane = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    const link = within(pane).getByRole('link', { name: strings['inspector.openComputers'] });
    expect(link).toHaveAttribute('data-rac');
  });
});
