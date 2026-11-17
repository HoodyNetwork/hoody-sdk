// Vitest: on the standalone Hub (one HTML file) payments are made in the served Hub. Every checkout's
// review opens with a band that says so and links to this same checkout in the served Hub; the footer keeps Cancel and
// has no Confirm, so no press sends. The served Hub keeps its Confirm exactly as before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
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

const CASES = [
  ['buy', '?checkout=buy&plan=fam-plus', 'buy.confirm'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm'],
] as const;

async function open(search: string) {
  resetUnknownCheckouts();
  await renderPage(page, { path: `/billing${search}` });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return dialog;
}

describe('standalone Hub: a checkout hands off to the served Hub', () => {
  it.each(CASES)('%s: a band links to the served Hub and says why; no Confirm', async (_kind, search, confirmKey) => {
    fx.standalone = true;
    const dialog = await open(search);
    const band = dialog.querySelector<HTMLElement>('[data-band="handoff"]')!;
    expect(band.textContent).toContain(strings['co.standalone']);
    const link = within(band).getByRole('link', { name: strings['co.standaloneOpen'] });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/hoody\.example\/auth\/home#\/billing\?checkout=/);
    expect(within(dialog.querySelector('footer')!).getByRole('button', { name: strings['action.cancel'] })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: (strings as Record<string, string>)[confirmKey] })).toBeNull();
    // Ticking the box changes nothing: still no Confirm.
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).queryByRole('button', { name: (strings as Record<string, string>)[confirmKey] })).toBeNull();
  });

  it('no served address yet: the reason only, no link and no Confirm', async () => {
    fx.standalone = true;
    fx.served = '';
    const dialog = await open(CASES[0][1]);
    const band = dialog.querySelector<HTMLElement>('[data-band="handoff"]')!;
    expect(band.textContent).toContain(strings['co.standalone']);
    expect(within(band).queryByRole('link')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['buy.confirm'] })).toBeNull();
  });

  // The hand-off does not wait on the price: while it loads, and when it could not be read, the band and its link are
  // there and the footer has Cancel only (the error keeps its own Try again).
  it.each([
    ['quote-loading', false],
    ['quote-error', true],
  ] as const)('%s: the band links to the served Hub; no Confirm', async (state, failed) => {
    fx.standalone = true;
    resetUnknownCheckouts();
    await renderPage(page, { state, path: `/billing${CASES[0][1]}` });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    if (failed) await within(dialog).findByText(strings['buy.quoteErr'], undefined, { timeout: 20000 });
    const band = await waitFor(() => {
      const b = dialog.querySelector<HTMLElement>('[data-band="handoff"]');
      expect(b).not.toBeNull();
      return b!;
    });
    expect(band.textContent).toContain(strings['co.standalone']);
    expect(within(band).getByRole('link', { name: strings['co.standaloneOpen'] }).getAttribute('href')).toMatch(
      /^https:\/\/hoody\.example\/auth\/home#\/billing\?checkout=buy/,
    );
    expect(within(dialog.querySelector('footer')!).getByRole('button', { name: strings['action.cancel'] })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['buy.confirm'] })).toBeNull();
  });

  it('the served Hub keeps its Confirm and offers no hand-off', async () => {
    const dialog = await open(CASES[0][1]);
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: strings['buy.confirm'] })).toBeEnabled();
    expect(within(dialog).queryByRole('link', { name: strings['co.standaloneOpen'] })).toBeNull();
    expect(dialog.querySelector('[data-band="handoff"]')).toBeNull();
  });
});
