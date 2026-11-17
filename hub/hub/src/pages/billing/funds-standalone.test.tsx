// Vitest: on the standalone Hub (one HTML file) payments are made in the served Hub. The Add funds form, in its own
// drawer and as a checkout's funds step, opens with a band that says so and links to this same place in the served Hub;
// its footer keeps Cancel and has no "Continue to payment", so no press starts a payment. The served Hub keeps its
// form exactly as before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOff, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({ standalone: false, served: 'https://hoody.example/auth/home' }));

vi.mock('@core', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    isStandalone: () => fx.standalone,
    servedHubUrl: (route = '') => (fx.served ? fx.served + (route ? '#' + route : '') : ''),
  };
});

afterEach(() => {
  fx.standalone = false;
  fx.served = 'https://hoody.example/auth/home';
});

async function openFunds(state?: string) {
  resetUnknownCheckouts();
  await renderPage(page, { path: '/billing?sheet=funds', ...(state ? { state } : {}) });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  // The form is on screen once its wallet Ledger is.
  await waitFor(() => expect(dialog.querySelector('dl[aria-label="Wallet"]')).not.toBeNull(), { timeout: 20000 });
  return dialog;
}
const footerOf = (dialog: HTMLElement) => within(dialog.querySelector('footer') as HTMLElement);
const handoffOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('[data-band="handoff"]');

describe('standalone Hub: Add funds hands off to the served Hub', () => {
  it('a band says why and links to this drawer in the served Hub; the footer is Cancel only', async () => {
    fx.standalone = true;
    const dialog = await openFunds();
    const band = handoffOf(dialog) as HTMLElement;
    expect(band.textContent).toContain(strings['co.standalone']);
    const link = within(band).getByRole('link', { name: strings['co.standaloneOpen'] });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/hoody\.example\/auth\/home#\/billing\?sheet=funds/);
    expect(footerOf(dialog).getByRole('button', { name: strings['action.cancel'] })).toBeInTheDocument();
    expect(footerOf(dialog).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
  });

  it('choosing an amount changes nothing: still no "Continue to payment"', async () => {
    fx.standalone = true;
    const dialog = await openFunds();
    const fifty = within(dialog).queryByRole('radio', { name: '$50' });
    if (fifty) await userEvent.click(fifty);
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
    expect(handoffOf(dialog)).not.toBeNull();
  });

  it('no served address yet: the reason only, no link and no "Continue to payment"', async () => {
    fx.standalone = true;
    fx.served = '';
    const dialog = await openFunds();
    const band = handoffOf(dialog) as HTMLElement;
    expect(band.textContent).toContain(strings['co.standalone']);
    expect(within(band).queryByRole('link')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
  });

  it("a checkout's funds step: the same band, linking to that checkout, and no \"Continue to payment\"", async () => {
    fx.standalone = true;
    resetUnknownCheckouts();
    await renderPage(page, { state: 'wallet-short', path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['addFunds'] }, { timeout: 20000 }));
    await waitFor(() => expect(dialog.querySelector('dl[aria-label="Wallet"]')).not.toBeNull(), { timeout: 20000 });
    const band = handoffOf(dialog) as HTMLElement;
    expect(band.textContent).toContain(strings['co.standalone']);
    expect(within(band).getByRole('link', { name: strings['co.standaloneOpen'] }).getAttribute('href')).toMatch(
      /^https:\/\/hoody\.example\/auth\/home#\/billing\?checkout=buy/,
    );
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
    expect(footerOf(dialog).getByRole('button', { name: strings['co.backToCheckout'] })).toBeInTheDocument();
  });

  it('the served Hub keeps "Continue to payment" and offers no hand-off', async () => {
    const dialog = await openFunds();
    const go = await within(dialog).findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(isOff(go)).toBe(false));
    expect(handoffOf(dialog)).toBeNull();
    expect(within(dialog).queryByRole('link', { name: strings['co.standaloneOpen'] })).toBeNull();
  });
});
