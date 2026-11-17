// Vitest: a Bot row's "Copy address", off while the Bot has no address, says why (the kit's disabled-reason line),
// never a plain greyed item.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

/** The first row menu's Copy address, opened and returned with the menu still open. */
async function firstCopy(state: string) {
  await renderPage(page, { state, path: '/bots' });
  const rows = await screen.findAllByRole('button', { name: 'Row actions' });
  await userEvent.click(rows[0]!);
  const menu = await screen.findByRole('menu');
  return within(menu).getByRole('menuitem', { name: new RegExp(strings['row.copyLink']) });
}

describe('the row menu: Copy address while the addresses are not known', () => {
  it.each(['linkReadPending', 'linkReadFailed'])('%s: disabled, and never says the Bot has no address', async (state) => {
    const copy = await firstCopy(state);
    expect(copy).toHaveAttribute('aria-disabled', 'true');
    expect(copy).toHaveAccessibleDescription(strings['row.addressUnread']);
  }, 60000);

  it('a Bot with an address: Copy address is enabled, with no reason', async () => {
    await renderPage(page, { path: '/bots' });
    let seen = 0;
    for (const r of await screen.findAllByRole('button', { name: 'Row actions' })) {
      await userEvent.click(r);
      const copy = within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['row.copyLink']) });
      if (copy.getAttribute('aria-disabled') !== 'true') {
        expect(copy).not.toHaveAttribute('aria-describedby');
        seen++;
        break;
      }
      await userEvent.keyboard('{Escape}');
    }
    expect(seen).toBe(1);
  }, 60000);
});

describe('the row menu: Copy address with no address', () => {
  it('is disabled with its reason', async () => {
    await renderPage(page, { state: 'noLink', path: '/bots' });
    const rows = await screen.findAllByRole('button', { name: 'Row actions' });
    let seen = 0;
    for (const r of rows) {
      await userEvent.click(r);
      const menu = await screen.findByRole('menu');
      const copy = within(menu).queryByRole('menuitem', { name: new RegExp(strings['row.copyLink']) });
      if (copy?.getAttribute('aria-disabled') === 'true') {
        expect(copy).toHaveAccessibleDescription(strings['row.noAddress']);
        seen++;
        break;
      }
      await userEvent.keyboard('{Escape}');
    }
    expect(seen).toBeGreaterThan(0);
  }, 60000);
});
