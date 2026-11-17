// A server on hold: every Billing view says so above its tabs' content, names the server, and goes to its own pay checkout.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { heldRows, subByWholeId, subHandleShared } from './logic';
import page from './page';
import strings from './strings.en.json';
import type { RawSub } from './types';

const band = async () => {
  await waitFor(() => expect(document.querySelector('[data-band="held-server"]')).not.toBeNull(), { timeout: 10_000 });
  return document.querySelector('[data-band="held-server"]') as HTMLElement;
};
const payNow = strings['subs.payNow'];

describe('the held band', () => {
  for (const path of ['/billing', '/billing?view=plans', '/billing?view=servers', '/billing?view=wallet']) {
    it(`on ${path}: names the server, says it is on hold, and offers Pay now`, async () => {
      await renderPage(page, { path });
      const b = await band();
      expect(b).toHaveTextContent(/^fra-7: On hold/);
      expect(within(b).getByRole('button', { name: /^Pay now/ })).toHaveTextContent(new RegExp(`^${payNow}`));
      expect(document.querySelectorAll('[data-band="held-server"]')).toHaveLength(1);
    });
  }

  it('Pay now opens that server\'s pay checkout over Wallet & usage', async () => {
    const { router } = await renderPage(page, { path: '/billing' });
    await userEvent.click(within(await band()).getByRole('button', { name: /^Pay now/ }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: 'a1b2c3d4e5f60718293a4b02', view: 'wallet' }));
  });

  it('a held server that can be started again offers Start it again, with the words of its row', async () => {
    await renderPage(page, { state: 'retry', path: '/billing' });
    const b = await band();
    expect(b).toHaveTextContent(`fra-7: ${strings['subs.stResumeFailed']}`);
    expect(within(b).getByRole('button', { name: new RegExp(`^${strings['subs.resumeRetry']}`) })).toHaveTextContent(strings['subs.resumeRetry']);
  });

  it('a banned account sees the band with its button off, saying why', async () => {
    await renderPage(page, { state: 'banned', path: '/billing' });
    const b = within(await band()).getByRole('button', { name: /^Pay now/ });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(strings['mkt.suspended']);
  });

  const bands = () => document.querySelectorAll('[data-band="held-server"]');
  const more = () => document.querySelector('[data-band="held-more"]');

  it('3 held servers: 3 bands, each with its own name, and no count line', async () => {
    await renderPage(page, { state: 'held-3', path: '/billing' });
    await band();
    expect(Array.from(bands()).map((b) => b.textContent?.split(':')[0])).toEqual(['held-1', 'held-2', 'held-3']);
    expect(more()).toBeNull();
  });

  it('4 held servers: 3 bands and "1 more server is held"', async () => {
    await renderPage(page, { state: 'held-4', path: '/billing' });
    await band();
    expect(bands()).toHaveLength(3);
    expect(more()).toHaveTextContent('1 more server is held');
  });

  it('5 held servers: 3 bands, the count line says 2, and its button goes to Wallet & usage', async () => {
    const { router } = await renderPage(page, { state: 'held-5', path: '/billing' });
    await band();
    expect(bands()).toHaveLength(3);
    expect(more()).toHaveTextContent('2 more servers are held');
    await userEvent.click(within(more() as HTMLElement).getByRole('button', { name: strings['view.wallet'] }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'wallet' }));
  });

  it('the second band opens the second server, not the first', async () => {
    await renderPage(page, { state: 'held-3', path: '/billing' });
    await band();
    await userEvent.click(within(bands()[1] as HTMLElement).getByRole('button', { name: /^Pay now/ }));
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(d).toHaveTextContent('held-2'));
    expect(d).not.toHaveTextContent('held-1');
  });

  // Two servers share the last 8 characters: whichever is pressed, no pay checkout opens for either.
  for (const [from, at] of [['the band', 0], ['the Wallet row', 1]] as const) {
    it(`two servers sharing the last 8 characters: Pay now on ${from} opens that server's own payment`, async () => {
      const { router } = await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet' });
      const all = await screen.findAllByRole('button', { name: /^Pay now.*clash-2/ }, { timeout: 10_000 });
      expect(all).toHaveLength(2);
      expect(Boolean((all[0] as HTMLElement).closest('[data-band="held-server"]'))).toBe(true);
      expect(Boolean((all[1] as HTMLElement).closest('[data-band="held-server"]'))).toBe(false);
      await userEvent.click(all[at] as HTMLElement);
      // The link carries the whole id: the shared ending would name neither.
      await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: `${'b'.repeat(16)}deadbeef` }));
      const d = await screen.findByRole('dialog');
      expect(await within(d).findByRole('button', { name: strings['subs.payConfirm'] }, { timeout: 10_000 })).toBeInTheDocument();
      expect(within(d).queryByText(strings.payAmbiguous)).toBeNull();
      expect(within(d).getAllByText(/clash-2/).length).toBeGreaterThan(0);
      expect(within(d).queryByText(/clash-1/)).toBeNull();
    });
  }

  it("a verified credit's Continue for a payment of clash-2 opens clash-2's own payment, not a refusal", async () => {
    const { router } = await renderPage(page, { state: 'return-received-clash', path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.continuePay'] }, { timeout: 10_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: `${'b'.repeat(16)}deadbeef` }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByRole('button', { name: strings['subs.payConfirm'] }, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("the AI usage row's Upgrade for twin-2 opens twin-2's own upgrade by its whole id", async () => {
    const { router } = await renderPage(page, { state: 'usage-twins', path: '/billing?view=wallet' });
    await waitFor(() => expect(document.querySelector('[data-section="usage"]')).not.toBeNull(), { timeout: 10_000 });
    const sec = document.querySelector('[data-section="usage"]') as HTMLElement;
    await userEvent.click(await within(sec).findByRole('button', { name: /^Upgrade twin-2/ }, { timeout: 10_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'upgrade', sub: `${'d'.repeat(16)}0a0b0c0d` }));
  });

  it("Continue for an unlisted server whose every shorter ending another listed one shares carries the whole id: never the other's payment", async () => {
    const { router } = await renderPage(page, { state: 'return-received-orphan', path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.continuePay'] }, { timeout: 10_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: `${'a'.repeat(16)}deadbeef` }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payMissing, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(/other-1/)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it("Continue for an unlisted server whose whole id another listed id ends with: the whole id names only itself", async () => {
    const { router } = await renderPage(page, { state: 'return-received-orphan-long', path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.continuePay'] }, { timeout: 10_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', sub: `${'a'.repeat(16)}deadbeef` }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payMissing, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(/other-1/)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it('a link whose handle two servers share still refuses in plain words and offers no Confirm', async () => {
    await renderPage(page, { state: 'held-clash', path: '/billing?view=wallet&checkout=pay&sub=deadbeef' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings.payMissing)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
    expect(within(d).getByRole('link', { name: strings['subs.heading'] })).toBeInTheDocument();
  });

  it('Upgrade on a twin server\'s row opens that server\'s own upgrade, not a refusal', async () => {
    const { router } = await renderPage(page, { state: 'plans-sub-twins', path: '/billing?view=wallet' });
    const ups = await screen.findAllByRole('button', { name: /^Upgrade.*twin-2/ }, { timeout: 10_000 });
    await userEvent.click(ups[ups.length - 1] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'upgrade', sub: `${'d'.repeat(16)}0a0b0c0d` }));
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(within(d).queryByText(strings.payAmbiguous)).toBeNull());
    expect(await within(d).findAllByText(/twin-2/, {}, { timeout: 10_000 })).not.toHaveLength(0);
  });

  it('no held server, no band', async () => {
    await renderPage(page, { state: 'empty', path: '/billing' });
    // The page has settled once the plan columns draw (the Plans view has no table).
    await screen.findByRole('heading', { name: strings.plans }, { timeout: 10_000 });
    await waitFor(() => expect(document.querySelector('[data-section="plans"] [data-kit="plan-card"]')).not.toBeNull(), { timeout: 10_000 });
    expect(document.querySelector('[data-band="held-server"]')).toBeNull();
    expect(document.querySelector('[data-band="held-more"]')).toBeNull();
  });
});

describe('heldRows', () => {
  const sub = (o: Partial<RawSub>) => ({ id: 'a1b2c3d4e5f60718293a4b02', state: 'held', server_name: 'x', auto_renew: true, active_operation_id: null, delete_at: '2030-01-01T00:00:00Z', paid_through: '2029-01-01T00:00:00Z', ...o }) as RawSub;
  it('only held: an unpaid server has a Pay now in its row, and no band', () => {
    expect(heldRows([sub({ state: 'past_due' }), sub({ state: 'active' })], null)).toEqual([]);
    expect(heldRows([sub({})], null).map((r) => r.pay)).toEqual(['pay']);
  });
  it('a held server already starting again has nothing to press', () => {
    expect(heldRows([sub({ delete_at: null, active_operation_id: 'op' })], null)).toEqual([]);
    expect(heldRows([sub({ delete_at: null })], null).map((r) => r.pay)).toEqual(['retry']);
  });

  // No lookup by ending is left (no findSub): a link names a subscription only by
  // its whole id (subByWholeId), and an ending two share is still told apart for the "can't tell" line (subHandleShared).
  describe('subHandleShared: an ending two subscriptions share', () => {
    const subs = [{ id: 'aaaa0000deadbeef' }, { id: 'bbbb0000deadbeef' }, { id: 'cccc000012345678' }] as RawSub[];
    it('true only for an ending more than one has', () => {
      expect(subHandleShared(subs, 'deadbeef')).toBe(true);
      expect(subHandleShared(subs, '12345678')).toBe(false);
      expect(subHandleShared(subs, 'bbbb0000deadbeef')).toBe(false);
    });
  });

  describe('a whole id names only itself', () => {
    it('a handle of 24 or more characters names only the subscription whose whole id it is, never one it ends', () => {
      const id = `${'a'.repeat(16)}12345678`;
      const longer = [{ id: `b${id}` }] as RawSub[];
      expect(subByWholeId(longer, id)).toBeNull();
      expect(subHandleShared(longer, id)).toBe(false);
      expect(subByWholeId([...longer, { id }] as RawSub[], id)?.id).toBe(id);
      // A shorter ending names none: no lookup by ending is left.
      expect(subByWholeId(longer, id.slice(-23))).toBeNull();
    });
  });
});
