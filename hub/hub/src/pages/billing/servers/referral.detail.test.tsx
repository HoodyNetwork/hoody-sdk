// Vitest: the Market inspector's order footer counts Referral credit and shows the split.
// The footer compares the term's total first payment, setup included (the API charges rental + setup and Referral
// credit pays setup too), with general + Referral credit. When the account has
// Referral credit, the footer says what each part holds: "Wallet $x" and "Referral credit $y (used first)".
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from '../page';
import strings from './strings.en.json';

const footer = () => document.querySelector<HTMLElement>('[data-order-split]');

describe('market order footer: Referral credit', () => {
  it('referral_credit_covers_charge: the sum covers the total; both parts are named', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03', state: 'servers-referral-covers' });
    expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
    expect(footer()).toHaveTextContent('Wallet $140');
    expect(footer()).toHaveTextContent('Referral credit $100 (used first)');
  });

  it('baremetal_setup_in_affordability: rental 179.00 + setup 49.00 against 140.00 + 80.00 is $8.00 short', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03', state: 'servers-referral-partial' });
    expect(await screen.findByText(/\$8 short/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['buy.addFunds'] }).length).toBeGreaterThan(0);
    expect(footer()).toHaveTextContent('Referral credit $80 (used first)');
  });

  it('the page header shows the general wallet, not the sum ($140, while the footer counts $240)', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03', state: 'servers-referral-covers' });
    expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
    // The header line: a label span "Balance " and the amount, nothing else.
    const label = strings['balance.label'];
    const header = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.children.length === 2 && el.children[0]!.textContent?.trim() === label);
    expect(header).toHaveTextContent(`${label} $140`);
    expect(header).not.toHaveTextContent('$240');
  });

  it('no Referral credit: no split line', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03' });
    expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
    expect(footer()).toBeNull();
  });
});
