// Vitest: a vault row offers nothing beyond opening it (a click or Enter does that), and the Encrypt setting of an
// unencrypted entry is named once: the row carries the name, its group adds no second copy for a screen reader.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { resetFixtureVaults } from './fixtures';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  vi.stubGlobal('isSecureContext', true);
});

describe('vault rows', () => {
  it('draw no row menu and no Open button: opening is the row itself', async () => {
    await renderPage(page, { path: '/vault' });
    const row = await screen.findByRole('row', { name: /github-token/ });
    expect(within(row).queryAllByRole('button')).toEqual([]);
  });
});

describe('the Encrypt setting of an unencrypted entry', () => {
  it('is not wrapped in a group named the same as its only row', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    const pane = await screen.findByRole('region', { name: 'Details' });
    await within(pane).findByRole('button', { name: strings['action.encrypt'] });
    expect(within(pane).queryByRole('group', { name: strings['protect.label'] })).toBeNull();
  });
});
