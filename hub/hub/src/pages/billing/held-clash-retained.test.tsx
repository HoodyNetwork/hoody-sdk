// Two servers share the last 8 characters of their ids, and clash-1 has a kept (not confirmed)
// request. Opening clash-2 must not pick clash-1's kept request by the shared ending: no "not confirmed" recovery, no
// resend, only the plain refusal. (billing-held-band.)
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const KEPT = 'a'.repeat(16) + 'deadbeef';

vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    useUnknownCheckouts: () => [
      { key: 'kept-pay', title: 'clash-1', target: { kind: 'pay', item: null, sub: 'deadbeef', subId: KEPT, days: null } },
      { key: 'kept-upgrade', title: 'clash-1', target: { kind: 'upgrade', item: 'gone-plan', sub: 'deadbeef', subId: KEPT, days: null } },
    ],
  };
});

const refused = async () => {
  const d = await screen.findByRole('dialog');
  expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
  expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  // No consent box either: no review step of any kind (pay or upgrade) is drawn.
  expect(within(d).queryByRole('checkbox')).toBeNull();
};

describe("clash-1's kept request, opened from clash-2", () => {
  it("pay: clash-2's own Pay now opens clash-2's own payment, never clash-1's recovery", async () => {
    await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet' });
    const own = await screen.findAllByRole('button', { name: /^Pay now.*clash-2/ }, { timeout: 10_000 });
    await userEvent.click(own[own.length - 1] as HTMLElement);
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByRole('button', { name: strings['subs.payConfirm'] }, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
    expect(within(d).queryByText(strings.payAmbiguous)).toBeNull();
  });

  it("pay: the clash-1 band's Check again carries clash-1's whole id, so clash-1's own drawer opens (it restores the kept request by its key), never the refusal", async () => {
    const { router } = await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet' });
    const again = await screen.findAllByRole('button', { name: strings['buy.checkAgain'] }, { timeout: 10_000 });
    await userEvent.click(again[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: KEPT }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findAllByText(/clash-1/, {}, { timeout: 10_000 })).not.toHaveLength(0);
    expect(within(d).queryByText(/clash-2/)).toBeNull();
    expect(within(d).queryByText(strings.payAmbiguous)).toBeNull();
  });

  it("upgrade: the upgrade checkout clash-2's handle builds gets the plain refusal, not clash-1's recovery", async () => {
    // A held server offers no Upgrade button; this is the URL its handle builds (links.checkout('upgrade', { sub })).
    await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet&checkout=upgrade&sub=deadbeef' });
    await refused();
  });

  it('a shared handle with a gone upgrade plan still gets the plain refusal, not the plan words', async () => {
    await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet&checkout=upgrade&sub=deadbeef&plan=gone-plan' });
    await refused();
    expect(within(screen.getByRole('dialog')).queryByText(strings['co.planGone'])).toBeNull();
  });

  it('an unlisted server opened by its full id finds its own kept request', async () => {
    // clash-1 is not in the list; its full id names it with no doubt, so its kept payment is shown for checking.
    await renderPage(page, { state: 'held-clash-gone', path: '/billing?view=wallet&checkout=pay&sub=' + KEPT });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings['held.unknownTitle'], {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("a listed clash-2 with a gone plan never takes clash-1's kept upgrade: matching is by full id", async () => {
    // clash-2 resolves by its whole id; the plan is gone, so the drawer would fall back to a kept request. By ending it
    // would be clash-1's (its recovery and resend); by full id there is none.
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=upgrade&sub=${'b'.repeat(16)}deadbeef&plan=gone-plan` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings['co.planGone'], {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
  });
});
