// Vitest: the structure of Add funds in both of its homes, through the real page: the drawer of ?sheet=funds and the
// funds step a checkout opens when the wallet is short. The lede is the drawer's subtitle; the wallet balance (and,
// from a checkout, what the purchase still needs) is one kit Ledger; "How adding funds works" is a kit Why; and a
// payment page that is not confirmed leaves the footer with Cancel and Check again only, its two recovery actions
// (the confirmed resend, Stop tracking) sitting in the pending banner.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

type Client = Awaited<ReturnType<typeof renderPage>>['queryClient'];

const ledger = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(`dl[aria-label="${strings.wallet}"]`);
/** The rows of the funds Ledger as [label, amount]. */
const rows = (dialog: HTMLElement): string[][] =>
  [...dialog.querySelectorAll<HTMLElement>(`dl[aria-label="${strings.wallet}"] > div`)].map((r) => [
    r.querySelector('dt')?.textContent ?? '',
    r.querySelector('dd')?.textContent ?? '',
  ]);
const footer = (dialog: HTMLElement) => dialog.querySelector('footer') as HTMLElement;
const names = (el: HTMLElement) => within(el).queryAllByRole('button').map((b) => b.textContent);

async function standalone(state?: string) {
  const r = await renderPage(page, state ? { state, path: '/billing?sheet=funds' } : { path: '/billing?sheet=funds' });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('button', { name: strings['top.go'] });
  return { ...r, dialog };
}

/** A Buy a plan review that is short, then its Add funds: the funds step, and what the review said it was short by. */
async function fromCheckout() {
  const r = await renderPage(page, { state: 'wallet-short', path: '/billing?checkout=buy&plan=fam-plus' });
  const review = await screen.findByRole('dialog');
  const add = await within(review).findByRole('button', { name: strings.addFunds });
  const short = review.querySelector('[data-ledger-tone="warn"] dd')?.textContent ?? '';
  expect(short).toMatch(/^\$\d/);
  const reviewText = review.textContent ?? '';
  await userEvent.click(add);
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('button', { name: strings['top.go'] });
  return { ...r, dialog, short, reviewText };
}

async function ban(qc: Client) {
  await act(async () => {
    const qs = qc.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes('identity'));
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) q.setState({ data: { banned: true }, status: 'success', fetchStatus: 'idle' });
  });
}

describe('Add funds: the drawer of ?sheet=funds', () => {
  beforeEach(() => resetUnknownCheckouts());

  it('shows the lede once, as the subtitle under the title', async () => {
    const { dialog } = await standalone();
    const lede = within(dialog).getAllByText(strings['top.lede']);
    expect(lede).toHaveLength(1);
    expect(lede[0]!.closest('[data-drawer-body]')).toBeNull();
    expect(lede[0]!.closest('header')).not.toBeNull();
  });

  it('shows the wallet balance as a one-row Ledger, with no "still needed" row', async () => {
    const { dialog } = await standalone();
    await waitFor(() => expect(rows(dialog)).toEqual([[strings.general, '$42.50']]));
    expect(dialog.querySelector('[data-drawer-body]')?.contains(ledger(dialog))).toBe(true);
  });

  it('a balance that cannot be read is a dash with its sentence, never an amount, and Continue stays as it was', async () => {
    const { dialog } = await standalone('widget-balance-error');
    await waitFor(() => expect(rows(dialog)[0]?.[0]).toBe(strings.general));
    expect(rows(dialog)[0]?.[1]).toBe('—');
    expect(within(dialog).getByText(strings['mkt.balanceUnavailable'])).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/\$0\.00/);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeEnabled());
  });

  it('"How adding funds works" is a closed Why that ends with the FAQ link', async () => {
    const { dialog } = await standalone();
    const why = within(dialog).getByRole('button', { name: strings['top.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('link', { name: strings['top.more'] })).toBeNull();
    await userEvent.click(why);
    expect(await within(dialog).findByRole('link', { name: strings['top.more'] })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['top.why.a'])).toBeInTheDocument();
  });

  it('a clean form has Cancel and Continue to payment in the footer, nothing else', async () => {
    const { dialog } = await standalone();
    expect(names(footer(dialog))).toEqual([strings['action.cancel'], strings['top.go']]);
  });
});

describe('Add funds: a payment page that is not confirmed', () => {
  beforeEach(() => resetUnknownCheckouts());

  async function unknown() {
    const r = await standalone('topup-unknown');
    await userEvent.click(within(r.dialog).getByRole('button', { name: strings['top.go'] }));
    await within(r.dialog).findByText(strings['top.unknownTitle']);
    const banner = r.dialog.querySelector('[data-outcome="pending"]') as HTMLElement;
    expect(banner).not.toBeNull();
    return { ...r, banner };
  }

  it('the footer keeps Cancel and Check again only', async () => {
    const { dialog } = await unknown();
    expect(names(footer(dialog))).toEqual([strings['action.cancel'], strings['buy.checkAgain']]);
  });

  it('the pending banner holds the confirmed resend and Stop tracking, and no second Check again', async () => {
    const { dialog, banner } = await unknown();
    expect(within(banner).getByRole('button', { name: strings['co.resend'] })).toBeEnabled();
    expect(within(banner).getByRole('button', { name: strings['top.forget'] })).toBeEnabled();
    expect(within(dialog).getAllByRole('button', { name: strings['buy.checkAgain'] })).toHaveLength(1);
    expect(within(banner).getByText(strings['top.unknown'])).toBeInTheDocument();
  });

  it('the resend in the banner still asks first: its press sends nothing', async () => {
    const { banner } = await unknown();
    await userEvent.click(within(banner).getByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(strings['co.resendTitle'])).toBeInTheDocument();
    // Declined: the hold is as it was.
    await userEvent.click(within(ask).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(banner).getByText(strings['top.unknown'])).toBeInTheDocument();
  });

  it('Stop tracking in the banner asks first, and only its confirm brings the form back', async () => {
    const { dialog, banner } = await unknown();
    await userEvent.click(within(banner).getByRole('button', { name: strings['top.forget'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(strings['top.forgetBody'])).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(dialog.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(await within(dialog).findByRole('button', { name: strings['top.go'] })).toBeInTheDocument();
  });

  it('a suspended account gets no resend anywhere in the drawer; Check again and Stop tracking stay', async () => {
    const { dialog, queryClient } = await unknown();
    await ban(queryClient);
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: strings['co.resend'] })).toBeNull());
    expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: strings['top.forget'] })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
  });
});

describe("Add funds: a checkout's funds step", () => {
  beforeEach(() => resetUnknownCheckouts());

  it('shows the wallet balance and what the purchase still needs, the amount the review was short by', async () => {
    const { dialog, short, reviewText } = await fromCheckout();
    await waitFor(() => expect(rows(dialog)).toHaveLength(2));
    const [balance, need] = rows(dialog);
    expect(balance?.[0]).toBe(strings.general);
    // The row names the purchase the review was for, not "this purchase".
    const named = /^Still needed for (.+)$/.exec(need?.[0] ?? '')?.[1] ?? '';
    expect(named).not.toBe('');
    expect(need?.[0]).not.toBe(strings['top.needed']);
    expect(reviewText).toContain(named);
    expect(need?.[1]).toBe(short);
  });

  it('keeps the shortfall pre-fill: the amount starts at what is missing, within the provider\'s bounds', async () => {
    const { dialog, short } = await fromCheckout();
    const field = (await within(dialog).findByRole('textbox', { name: strings['top.otherLabel'] })) as HTMLInputElement;
    const missing = Number(short.replace(/[$,]/g, ''));
    expect(Number(field.value)).toBeGreaterThanOrEqual(missing);
    expect(within(dialog).getByRole('button', { name: strings['top.go'] })).toBeEnabled();
  });

  it('shows the lede once and the same Why as the drawer', async () => {
    const { dialog } = await fromCheckout();
    const lede = within(dialog).getAllByText(strings['top.lede']);
    expect(lede).toHaveLength(1);
    // Under the step's title, as in the drawer; never a body line.
    expect(lede[0]!.closest('[data-drawer-body]')).toBeNull();
    const why = within(dialog).getByRole('button', { name: strings['top.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(why);
    expect(await within(dialog).findByRole('link', { name: strings['top.more'] })).toBeInTheDocument();
  });
});
