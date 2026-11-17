// Vitest: Buy a plan's Confirm while its gate is closed is the kit ReasonButton: it can be reached
// by keyboard (aria-disabled, never the disabled attribute), it is described by the first failing gate's words whether
// the footer line or the review body shows them, and pressing it sends nothing and changes nothing. While the quote is
// coming it stays a plain disabled button with no reason. Every other checkout kind does the same (below).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import { cents } from './logic';
import page from './page';
import drawer from './parts/CheckoutDrawer.tsx?raw';
import strings from './strings.en.json';

const BUY = '/billing?checkout=buy&plan=fam-plus';

async function openBuy(state?: string) {
  resetUnknownCheckouts();
  await renderPage(page, { state, path: BUY });
  const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
  await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
  return dialog;
}
const confirmOf = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: strings['buy.confirm'] });
/** The words a screen reader hears with the button: its aria-describedby targets. */
const described = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const phaseOf = (dialog: HTMLElement) => dialog.querySelector('[data-phase]')?.getAttribute('data-phase');

/** A closed gate: reachable, described by `why`, and a press leaves the review as it was. */
async function expectReasoned(dialog: HTMLElement, why: string) {
  const confirm = confirmOf(dialog);
  expect(confirm).toHaveAttribute('aria-disabled', 'true');
  expect(confirm).not.toHaveAttribute('disabled');
  expect(described(confirm)).toContain(why);
  const ticked = (within(dialog).getByRole('checkbox') as HTMLInputElement).checked;
  await userEvent.click(confirm);
  confirm.focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.keyboard(' ');
  // A send would move the drawer to posting and then to its outcome; a closed gate stays on the review, box untouched.
  await new Promise((r) => setTimeout(r, 50));
  expect(phaseOf(dialog)).toBe('review');
  expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(ticked);
  expect(within(dialog).queryByRole('button', { name: strings['action.done'] })).toBeNull();
}

describe('Buy a plan: a Confirm that cannot act says why and sends nothing', () => {
  it('the consent box is not ticked: described by the consent words, and a press changes nothing', async () => {
    const dialog = await openBuy();
    await expectReasoned(dialog, strings.consent);
  });

  it('ticking the box gives the real Confirm, which sends; the reasoned one is gone', async () => {
    const dialog = await openBuy();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    const confirm = confirmOf(dialog);
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await userEvent.click(confirm);
    await waitFor(() => expect(phaseOf(dialog)).not.toBe('review'));
  });

  it('blocked: described by the blocked words the Band shows, with the box ticked too', async () => {
    const dialog = await openBuy('quote-noroom');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await expectReasoned(dialog, strings['buy.noRoom']);
  });

  it('short: described by the shortfall sentence, with the box ticked too', async () => {
    const dialog = await openBuy('wallet-short');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await expectReasoned(dialog, strings['buy.short'].replace('{{amount}}', cents(320)));
  });

  it('an unreadable balance: described by the balance words, with the box ticked too', async () => {
    const dialog = await openBuy('balance-unreadable');
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await expectReasoned(dialog, strings['mkt.balanceUnavailable']);
  });
});

describe("the drawer's reasoned Confirm has no action of its own", () => {
  const footer = drawer.slice(drawer.indexOf('function renderFooter('));
  it('the ReasonButton takes the words and the label only: no press handler, and co.confirm stays on the one real Confirm', () => {
    const reasoned = [...footer.matchAll(/<ReasonButton\b([^>]*)>/g)].map((m) => m[1] ?? '');
    expect(reasoned).toHaveLength(1);
    // No handler, and no expression naming the send (the actionId string literal is a focus id, not a call).
    expect(reasoned[0]).not.toMatch(/onPress|onClick|\{[^}]*\bconfirm\b[^}]*\}/);
    expect(reasoned[0]).toMatch(/reason=\{say\(t, why\)\}/);
    expect(drawer.match(/co\.confirm\b/g)).toHaveLength(1);
  });
  it('it is drawn only on `why`, which the drawer takes from confirmFooter for every checkout kind', () => {
    expect(footer).toMatch(/\{why \? \(\s*<ReasonButton\b/);
    expect(drawer).toContain('why: cf.why,');
  });
});

// Every checkout's Confirm with the consent box unticked: the reasoned Confirm, reachable by keyboard and described by
// the consent words; a press sends nothing (the review stays, no outcome). Pay, upgrade, rent and reserve as Buy a plan.
const OTHER = [
  ['pay', '/billing?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm'],
  ['upgrade', '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm'],
  ['rent', '/billing?view=servers&checkout=rent&item=l06&days=30', 'mkt.confirmCta'],
  // A reservation the fixture wallet covers, so the consent box is the first closed gate.
  ['reserve', '/billing?checkout=reserve&item=mkt_sin_m&days=30', 'mkt.confirmCta'],
] as const;

describe('the other checkouts: a Confirm that cannot act says why and sends nothing', () => {
  it.each(OTHER)('%s, box not ticked: aria-disabled, described by the consent words, a press changes nothing', async (_kind, path, label) => {
    resetUnknownCheckouts();
    await renderPage(page, { path });
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 20000 });
    await within(dialog).findByRole('checkbox', undefined, { timeout: 20000 });
    const confirm = within(dialog).getByRole('button', { name: (strings as Record<string, string>)[label] });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toHaveAttribute('disabled');
    expect(described(confirm)).toContain(strings.consent);
    await userEvent.click(confirm);
    confirm.focus();
    await userEvent.keyboard('{Enter}');
    await new Promise((r) => setTimeout(r, 50));
    expect(phaseOf(dialog)).toBe('review');
    expect((within(dialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    // Ticked, the real Confirm is back.
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: (strings as Record<string, string>)[label] })).toBeEnabled();
  });
});
