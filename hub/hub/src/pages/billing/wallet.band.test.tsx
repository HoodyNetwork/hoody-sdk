// Vitest: the wallet is ONE band: the balance and the GitHub bonus under it as a second line. Add funds is the
// page header's alone, rail or no rail (a copy in the band would make two on narrower pages).
import { renderPage, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const up = async (state?: string) => {
  const r = await renderPage(page, state ? { state, path: '/billing?view=wallet' } : { path: '/billing?view=wallet' });
  await waitFor(() => expect(document.querySelector('[data-card="wallet"]')).not.toBeNull(), { timeout: 20000 });
  return r;
};
const band = () => document.querySelector<HTMLElement>('[data-card="wallet"]') as HTMLElement;
const addFunds = (el: HTMLElement) => within(el).queryAllByRole('button', { name: strings.addFunds });

describe('the wallet band', () => {
  it('is one card: the balance and, when the account has an offer, the bonus inside it, never a second card', async () => {
    await up();
    await within(band()).findByText(strings.wallet);
    expect(document.querySelectorAll('[data-card="wallet"]')).toHaveLength(1);
    const bonus = await within(band()).findByRole('group', { name: strings['bonus.ghBonusTitle'] });
    expect(band().contains(bonus)).toBe(true);
    expect(within(bonus).getByRole('button', { name: strings['bonus.ghBonusClaim'] })).toBeInTheDocument();
    expect(within(band()).getByText(strings.generalNote)).toBeInTheDocument();
  });

  it('no offer, no bonus line: the band is the balance alone', async () => {
    await up('bonus-none');
    await within(band()).findByText(strings.wallet);
    await waitFor(() => expect(document.querySelector('[data-balance]')).not.toBeNull());
    expect(within(band()).queryByRole('group')).toBeNull();
  });

  it('carries no Add funds; the page has one, and it opens the Add funds drawer', async () => {
    const { router } = await up();
    await within(band()).findByText(strings.wallet);
    expect(addFunds(band())).toHaveLength(0);
    const all = addFunds(document.body);
    expect(all).toHaveLength(1);
    await userEvent.click(all[0] as HTMLElement);
    expect(router.state.location.search).toMatchObject({ sheet: 'funds' });
  });

  it('a suspended account cannot press the page\'s Add funds', async () => {
    await up('banned');
    await within(band()).findByText(strings.wallet);
    await waitFor(() => expect(addFunds(document.body)[0]).toBeDisabled());
    expect(addFunds(band())).toHaveLength(0);
  });

  it('a balance that cannot be read says so with Try again, and the bonus line is unaffected', async () => {
    await up('widget-balance-error');
    expect(await within(band()).findByText(strings.balanceErr)).toBeInTheDocument();
    expect(within(band()).getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    // The offer is its own read: a failing balance neither hides it nor stops its claim.
    const bonus = await within(band()).findByRole('group', { name: strings['bonus.ghBonusTitle'] });
    expect(within(bonus).getByRole('button', { name: strings['bonus.ghBonusClaim'] })).toBeEnabled();
  });

  it('while the offer is being read, and when it cannot be read, the band shows no bonus line and no placeholder for it', async () => {
    for (const state of ['bonus-loading', 'bonus-read-error']) {
      const { unmount } = await up(state);
      await within(band()).findByText(strings.wallet);
      await waitFor(() => expect(document.querySelector('[data-balance]')).not.toBeNull());
      expect(within(band()).queryByRole('group')).toBeNull();
      expect(within(band()).queryByText(strings['bonus.ghBonusTitle'])).toBeNull();
      expect(band().querySelector('[data-card="bonus"]')).toBeNull();
      // the balance is drawn, so a skeleton left in the band could only be the offer's
      expect(band().querySelector('[data-skeleton]')).toBeNull();
      unmount();
    }
  });
});
