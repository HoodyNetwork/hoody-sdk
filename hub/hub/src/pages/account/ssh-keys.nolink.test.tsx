// Vitest: a load that does not serve Computers opens nothing from an SSH key
// row: no openable row, and a click leaves the URL as it was (never the table's default open, the view's selection).
import { bootFixtureCore } from '@core';
import type * as Kit from '@kit';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

type KitModule = typeof Kit;

vi.mock('@kit', async (orig) => {
  const kit = await orig<KitModule>();
  return { ...kit, usePageLink: (id: string) => (id === 'computers' ? null : kit.usePageLink(id)) };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

describe('computer SSH keys without the Computers page', () => {
  it('no row opens, and a click on one changes nothing', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('atlas');
    const row = within(table).getByText('atlas', { selector: 'bdi' }).closest('tr') as HTMLElement;
    expect(table.querySelector('[data-row-opens]')).toBeNull();
    const before = { path: router.state.location.pathname, search: router.state.location.search };
    await userEvent.click(within(row).getByText('ada@laptop'));
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe(before.path);
    expect(router.state.location.search).toEqual(before.search);
  });
});
