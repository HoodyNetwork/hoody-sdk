// Vitest: the Billing wallet card shows Referral credit only when the account has some.
// Billing). A line under the balance when Referral credit or what is owed is above 0; an owed line only when owed is
// above 0. Most accounts have neither, and the card stays as it is. The general balance itself never changes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderPage, screen, userEvent, within } from '@app/testing';
import fixtures from './fixtures';
import page from './page';

// Which pages this load serves (the shell's page list); renderPage mounts no shell, so the test decides.
const served = vi.hoisted(() => ({ ids: new Set<string>(['referrals']), followed: [] as unknown[] }));
vi.mock('@kit', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    usePageLink: (id: string) => (served.ids.has(id) ? { kind: 'hub', href: `/${id}` } : null),
    followPageLink: (link: unknown) => served.followed.push(link),
  };
});
beforeEach(() => {
  served.ids = new Set(['referrals']);
  served.followed = [];
});

async function card(state?: string): Promise<HTMLElement> {
  cleanup(); // one page at a time: a second card() in a test replaces the first
  await renderPage(page, state ? { state, path: '/billing?view=wallet' } : { path: '/billing?view=wallet' });
  await screen.findByText('$42.50');
  const el = document.querySelector<HTMLElement>('[data-card="wallet"]');
  expect(el).not.toBeNull();
  return el!;
}

describe('wallet card: Referral credit', () => {
  it('wallet_card_line_only_above_zero: an account with Referral credit sees it under the balance', async () => {
    const c = await card('wallet-referral');
    expect(within(c).getByText(/referral credit/i)).toBeInTheDocument();
    expect(within(c).getByText(/\$12\.40/)).toBeInTheDocument();
    expect(within(c).getByText('$42.50')).toBeInTheDocument();
    expect(within(c).queryByText(/owed/i)).toBeNull();
  });

  it('owed above 0 shows its own line, paid from new Referral credit', async () => {
    const c = await card('wallet-owed');
    expect(within(c).getByText(/owed/i)).toHaveTextContent('$3.00');
  });

  it('wallet_card_line_only_above_zero: zero Referral credit and nothing owed add no line', async () => {
    // The default state is what most accounts get from the API: both fields present and "0.00".
    const def = fixtures.states[fixtures.default] as { balance?: { data?: Record<string, unknown> } };
    expect(def.balance?.data).toMatchObject({ referral: '0.00', owed: '0.00' });
    const c = await card();
    expect(within(c).queryByText(/referral credit/i)).toBeNull();
    expect(within(c).queryByText(/owed/i)).toBeNull();
  });

  it('the first line shown links the Referrals page (credit line, or the owed line alone)', async () => {
    let c = await card('wallet-referral');
    let link = within(c).getByRole('button', { name: 'Referrals' });
    expect(c.querySelector('[data-referral]')).toContainElement(link);
    await userEvent.click(link);
    expect(served.followed).toEqual([{ kind: 'hub', href: '/referrals' }]);
    c = await card('wallet-owed');
    link = within(c).getByRole('button', { name: 'Referrals' });
    expect(c.querySelector('[data-owed]')).toContainElement(link);
    expect(within(c).getAllByRole('button', { name: 'Referrals' })).toHaveLength(1);
    // Both lines shown: one link, on the Referral credit line.
    c = await card('wallet-referral-owed');
    expect(within(c).getAllByRole('button', { name: 'Referrals' })).toHaveLength(1);
    expect(c.querySelector('[data-referral]')).toContainElement(within(c).getByRole('button', { name: 'Referrals' }));
    expect(within(c).getByText(/owed/i)).toHaveTextContent('$3.00');
  });

  it('no link while the load does not serve the Referrals page, and none with nothing to show', async () => {
    served.ids = new Set();
    let c = await card('wallet-referral');
    expect(within(c).getByText(/referral credit/i)).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: 'Referrals' })).toBeNull();
    served.ids = new Set(['referrals']);
    c = await card();
    expect(within(c).queryByRole('button', { name: 'Referrals' })).toBeNull();
  });
});
