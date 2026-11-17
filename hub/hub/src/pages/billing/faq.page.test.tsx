// Vitest: where the billing questions show up. The page lists all eight under "Questions"; the wallet lines, the AI usage and
// subscriptions sections open their question in place (the page root shows the list); the Add funds and upgrade drawers are
// overlays, so their links peek the answer over the drawer.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const IDS = ['addFunds', 'stopTracking', 'autoRenew', 'retrySafe', 'upgrade', 'freeServer', 'aiAllowance', 'walletCredit'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

const peekOf = async () => {
  const dlgs = await screen.findAllByRole('dialog');
  return dlgs[dlgs.length - 1]!;
};

describe('billing questions', () => {
  it('the page lists the eight questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page, { path: '/billing' });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] });
    for (const id of IDS) expect(await screen.findByRole('button', { name: q(id) })).toHaveAttribute('aria-expanded', 'false');
  });

  it('the AI usage section links to where the allowance comes from, and its question opens in the list', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('link', { name: strings['aiu.allowanceMore'] }));
    expect(await screen.findByRole('button', { name: q('aiAllowance') })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the subscriptions section links to what auto-renew does, and its question opens in the list', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('link', { name: strings['subs.renewMore'] }));
    expect(await screen.findByRole('button', { name: q('autoRenew') })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a wallet with Referral credit links to what the amounts are, and its question opens in the list', async () => {
    await renderPage(page, { state: 'wallet-referral', path: '/billing?view=wallet' });
    await screen.findByText('$42.50');
    await userEvent.click(await screen.findByRole('link', { name: strings['credit.more'] }));
    expect(await screen.findByRole('button', { name: q('walletCredit') })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a wallet with neither Referral credit nor an owed amount shows no such link', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    await screen.findByText('$42.50');
    expect(screen.queryByRole('link', { name: strings['credit.more'] })).toBeNull();
  });

  it('the Add funds drawer links to how adding funds works, and the answer opens over the drawer', async () => {
    await renderPage(page, { path: '/billing?sheet=funds' });
    const dlg = await screen.findByRole('dialog');
    // The link ends the drawer's one Why (a closed disclosure): open it, then follow the link.
    await userEvent.click(await within(dlg).findByRole('button', { name: strings['top.why.q'] }));
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['top.more'] }));
    expect(within(await peekOf()).getByText(a('addFunds'))).toBeInTheDocument();
  });

  it('the upgrade drawer links to what an upgrade does, and the answer opens over the drawer', async () => {
    await renderPage(page, { path: '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01' });
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(await within(dlg).findByRole('link', { name: strings['up.more'] }, { timeout: 20000 }));
    expect(within(await peekOf()).getByText(a('upgrade'))).toBeInTheDocument();
  });
});
