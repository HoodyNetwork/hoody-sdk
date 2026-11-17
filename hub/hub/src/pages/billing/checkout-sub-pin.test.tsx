// A pay checkout opens only the subscription its link's whole id names:
// a later read never retargets the open drawer, and an old short link names no server, so neither its checkout nor
// another server's kept request is offered.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const C1 = `${'a'.repeat(16)}deadbeef`;
const C2 = `${'b'.repeat(16)}deadbeef`;
const fx = vi.hoisted(() => ({ first: null as any, swap: null as any, unknowns: [] as any[] }));
vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    // Core's kept requests (empty unless a test sets them).
    useUnknownCheckouts: () => fx.unknowns,
    useSubs: () => {
      const r = a.useSubs();
      if (r.data && !fx.first) fx.first = r.data;
      return fx.swap ? { ...r, data: fx.swap } : r;
    },
  };
});

beforeEach(() => {
  fx.first = null;
  fx.swap = null;
  fx.unknowns = [];
});

describe('an open pay checkout keeps its subscription', () => {
  // Regression pins: the two tests below open with clash-2's whole id, which no earlier
  // code resolved by ending either, so they pin the behaviour and do not tell an ending lookup apart. The tests
  // that discriminate are the two short-link tests further down and the short-link case in held-key-handoff.test.tsx.
  it('regression pin: a re-read where clash-2 is gone and clash-1 listed (same ending): the drawer never shows clash-1, it says the server is gone', async () => {
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${C2}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByRole('button', { name: strings['subs.payConfirm'] }, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getAllByText(/clash-2/).length).toBeGreaterThan(0);
    // The next read lists clash-1 alone (same ending).
    fx.swap = { ...fx.first, subs: fx.first.subs.map((s: any) => ({ ...s, id: `${'a'.repeat(16)}deadbeef`, server_name: 'clash-1' })) };
    await userEvent.click(within(d).getByRole('checkbox'));
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(within(d).queryByText(/clash-1/)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
    expect(within(d).getByText(strings.payMissing)).toBeInTheDocument();
  });

  it('regression pin: the opened server leaves the list and clash-1, with the same ending, has a kept payment: neither its recovery nor its resend is offered', async () => {
    fx.unknowns = [{ key: 'kept-pay', title: 'clash-1', target: { kind: 'pay', item: null, sub: 'deadbeef', subId: C1, days: null } }];
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${C2}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByRole('button', { name: strings['subs.payConfirm'] }, { timeout: 10_000 })).toBeInTheDocument();
    fx.swap = { ...fx.first, subs: fx.first.subs.map((s: any) => ({ ...s, id: C1, server_name: 'clash-1' })) };
    await userEvent.click(within(d).getByRole('checkbox'));
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
    expect(within(d).queryByText(/clash-1/)).toBeNull();
    expect(within(d).queryByRole('button', { name: /send|again/i })).toBeNull();
    expect(within(d).getByText(strings.payMissing)).toBeInTheDocument();
  });

  it("a whole id the partial list did not deliver: the drawer says the list was not read whole, never \"isn't in your account anymore\", in its own words", async () => {
    const absent = 'f'.repeat(24);
    await renderPage(page, { state: 'partial', path: `/billing?view=wallet&checkout=pay&sub=${absent}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payUnlisted, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings.payMissing)).toBeNull();
    expect(within(d).queryByText(strings.payAmbiguous)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it('an old short link on a partial list: the link names no server, so the drawer says so, never "not read whole"', async () => {
    await renderPage(page, { state: 'partial', path: '/billing?view=wallet&checkout=pay&sub=deadbeef' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings.payUnlisted)).toBeNull();
    expect(within(d).queryByText(strings.payMissing)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it('the same whole id, the list whole: the server is not in the account', async () => {
    await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${'f'.repeat(24)}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payMissing, {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("an old short link, its server gone and clash-2 now the one listed with that ending: never clash-2's checkout", async () => {
    await renderPage(page, { state: 'held-clash-gone', path: '/billing?view=wallet&checkout=pay&sub=deadbeef' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(/clash-2/)).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it("an old short link naming no listed server, another server's kept payment with that ending: neither its recovery nor its resend", async () => {
    fx.unknowns = [{ key: 'kept-pay', title: 'clash-1', target: { kind: 'pay', item: null, sub: 'deadbeef', subId: C1, days: null } }];
    await renderPage(page, { path: '/billing?view=wallet&checkout=pay&sub=deadbeef' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
    expect(within(d).queryByText(/clash-1/)).toBeNull();
    expect(within(d).queryByRole('button', { name: /send|again/i })).toBeNull();
  });
});
