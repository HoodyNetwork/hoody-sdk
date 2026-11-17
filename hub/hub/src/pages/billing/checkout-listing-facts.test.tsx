// Vitest: before paying for a market server, the Checkout drawer says everything the listing says: the
// same facts the Market's inspector shows (core's listingRules.listingFacts), disk kind per group and the RAM type
// included, a fact the row left out reading "Not listed". An instant listing (the stock rail) carries the
// "Instant delivery*" promise with its footnote; a pre-order never does. Plans and Free use the Market's
// tier words.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { SAMPLE_FACTS, listingRules } from '@core';
import { listings } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const W = listingRules.listingFactWords;

const open = async (kind: 'rent' | 'reserve', item: string) => {
  await renderPage(page, { path: `/billing?checkout=${kind}&item=${item}&days=30` });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('button', { name: strings['mkt.confirmCta'] }, { timeout: 20000 });
  return dialog;
};

describe('What you get, in the rent and reserve checkout', () => {
  it('a stock server lists every fact, each disk group with its kind and the RAM type, and the instant promise', async () => {
    const dialog = await open('rent', 'l03');
    const facts = within(dialog).getByRole('region', { name: strings['co.whatYouGet'] });
    for (const label of [W['fact.cpu'], W['fact.cores'], W['fact.ram'], W['fact.ramType'], W['fact.disks'], W['fact.diskTotal'], W['fact.bandwidth'], W['fact.location']]) {
      expect(within(facts).getByText(label), label).toBeInTheDocument();
    }
    expect(within(facts).getByText('2 × 1.92 TB NVMe (PCIe)')).toBeInTheDocument();
    expect(within(facts).getByText('2 × 8 TB HDD (SATA, Toshiba MG08)')).toBeInTheDocument();
    expect(within(facts).getByText('DDR4 ECC')).toBeInTheDocument();
    expect(within(facts).getByText(listingRules.instantPromise.label)).toBeInTheDocument();
    // IPv6 is not part of Hoody: the list has no IPv6 line.
    expect(within(facts).queryByText(/IPv6/i)).toBeNull();
    expect(within(dialog).getByText(listingRules.instantPromise.footnote)).toBeInTheDocument();
  });

  it('a pre-order lists its facts, says "Not listed" for what it leaves out, and never promises instant delivery', async () => {
    const dialog = await open('reserve', 'o01');
    const facts = within(dialog).getByRole('region', { name: strings['co.whatYouGet'] });
    expect(within(facts).getByText('2 × 1.92 TB NVMe (PCIe, Micron 7450)')).toBeInTheDocument();
    expect(within(facts).getAllByText(W['fact.notListed']).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(listingRules.instantPromise.label)).toBeNull();
    expect(within(dialog).queryByText(listingRules.instantPromise.footnote)).toBeNull();
  });
});

describe('the fixture facts are the Market\'s', () => {
  it('each checkout listing says exactly what the Market\'s row of that kind and id says; one the Market lacks says nothing', () => {
    let matched = 0;
    for (const l of listings) {
      const input = SAMPLE_FACTS[`${l.kind === 'rent' ? 'stock' : 'offer'}:${l.id}`];
      if (input) matched += 1;
      expect(l.facts, `${l.kind}:${l.id}`).toEqual(input ? listingRules.listingFacts(input) : []);
    }
    expect(matched).toBeGreaterThanOrEqual(12);
  });
});

describe('Plans and Free in the Market\'s words', () => {
  it('a plan is a server slice of your own; bare metal is a whole machine for you alone', () => {
    expect(strings.plansLede).toMatch(/a server of your own/);
    expect(strings['plans.bareMetalBody']).toBe('A whole machine for you alone');
    expect(strings['free.body']).toMatch(/^You always keep your free server, whatever else you get\./);
  });
});
