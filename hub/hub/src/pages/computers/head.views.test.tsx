// Computers | Servers | Projects are the page's view tabs under the header's subtitle, like every other tabbed page:
// never a switch on the title line. A tab opens its view; the open view's tab is the selected one, also with a computer
// open beside the list.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function viewTabs() {
  return screen.findByRole('tablist', { name: strings['views.label'] }, { timeout: 20000 });
}

/** The tab bar sits after the header (so under its subtitle), never inside the header's title line. */
function expectUnderHeader(bar: HTMLElement) {
  const title = screen.getByRole('heading', { level: 1, name: strings.title });
  const header = title.closest('header') as HTMLElement;
  expect(header).not.toBeNull();
  expect(header.contains(bar)).toBe(false);
  expect(header.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('radio', { name: strings['views.servers'] })).toBeNull();
}

describe('computers: the view tabs', () => {
  it('sit under the subtitle, Computers selected, and Servers opens the servers view', async () => {
    await renderPage(page, { path: '/computers' });
    const bar = await viewTabs();
    expectUnderHeader(bar);
    expect(within(bar).getByRole('tab', { name: strings['views.computers'] })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(bar).getByRole('tab', { name: strings['views.servers'] }));
    const after = await viewTabs();
    expect(within(after).getByRole('tab', { name: strings['views.servers'] })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(strings['subtitle.servers'], {}, { timeout: 20000 })).toBeInTheDocument();
    expectUnderHeader(after);
  }, 60000);

  it('stay under the subtitle with a computer open beside the list', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const bar = await viewTabs();
    expect(within(bar).getByRole('tab', { name: strings['views.computers'] })).toHaveAttribute('aria-selected', 'true');
    expectUnderHeader(bar);
  }, 60000);
});
