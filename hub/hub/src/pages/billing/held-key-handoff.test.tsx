// A kept-request band ("… may have gone through", Check again) opens its own kept request, named by a
// fingerprint of its key, never by the server's short handle. Two servers here end in the same 8 characters (deadbeef);
// each has a kept payment. Whichever of them the subscription list holds, each band checks its own request.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { heldRef, pickHeld } from './logic';
import page from './page';
import strings from './strings.en.json';

const A = 'a'.repeat(16) + 'deadbeef';
const B = 'b'.repeat(16) + 'deadbeef';

const fx = vi.hoisted(() => ({
  checked: [] as string[],
  resent: [] as string[],
  // Both kept requests carry one key (a store that should never hold that): one fingerprint for two.
  sameKey: false,
  // The handle's own server's checkout restores a pending request (its machine says unknown): every Check again it is
  // asked for is counted here, never sent to the fixture.
  restore: false,
  coChecks: 0,
  // Replaces the two kept payments (kept buys and upgrades).
  list: null as null | { key: string; title: string; target: Record<string, unknown> }[],
}));

vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    useCheckout: (...args: unknown[]) => {
      const api = (a.useCheckout as (...x: unknown[]) => Record<string, unknown> & { state: object })(...args);
      if (!fx.restore) return api;
      return { ...api, state: { ...api.state, phase: 'unknown' }, checkAgain: () => void fx.coChecks++ };
    },
    useUnknownCheckouts: () => fx.list ?? [
      { key: 'kept-key-of-clash-1', title: 'clash-1', target: { kind: 'pay', item: null, sub: 'deadbeef', subId: A, days: null } },
      { key: fx.sameKey ? 'kept-key-of-clash-1' : 'kept-key-of-clash-2', title: 'clash-2', target: { kind: 'pay', item: null, sub: 'deadbeef', subId: B, days: null } },
    ],
    checkHeldAttempt: (e: { target: { subId?: string; item?: string } }) => {
      fx.checked.push(e.target.subId ?? e.target.item ?? '');
      return Promise.resolve({ check: 'unknown' });
    },
    resendHeldAttempt: (e: { target: { subId: string } }) => {
      fx.resent.push(e.target.subId);
      return Promise.resolve({ check: 'unknown' });
    },
  };
});

beforeEach(() => {
  fx.checked = [];
  fx.resent = [];
  fx.sameKey = false;
  fx.restore = false;
  fx.coChecks = 0;
  fx.list = null;
});

const bandOf = async (title: string) => {
  const words = strings['band.unknownTitle'].replace('{{title}}', title);
  const el = await screen.findByText(words, {}, { timeout: 10_000 });
  return el.closest('[data-band]') as HTMLElement;
};
const checkAgain = async (title: string) => userEvent.click(within(await bandOf(title)).getByRole('button', { name: strings['buy.checkAgain'] }));

describe('a kept-request band opens its own kept request', () => {
  it('neither server listed: each band checks its own request, not the first with the handle', async () => {
    await renderPage(page, { path: '/billing?view=wallet' });
    await checkAgain('clash-2');
    await waitFor(() => expect(fx.checked).toEqual([B]), { timeout: 10_000 });
    expect(within(screen.getByRole('dialog')).queryByRole('checkbox')).toBeNull();
  });

  it("one listed: the unlisted server's band checks its own request, never the listed server's checkout", async () => {
    // held-clash-gone lists clash-2 only, so the shared handle resolves to clash-2.
    await renderPage(page, { state: 'held-clash-gone', path: '/billing?view=wallet' });
    await checkAgain('clash-1');
    await waitFor(() => expect(fx.checked).toEqual([A]), { timeout: 10_000 });
    const d = screen.getByRole('dialog');
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });

  it("the band's link carries the fingerprint, never the key", async () => {
    const { router } = await renderPage(page, { path: '/billing?view=wallet' });
    await checkAgain('clash-1');
    const ref = await heldRef('kept-key-of-clash-1');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ checkout: 'pay', held: ref, check: 'true' }));
    expect(JSON.stringify(router.state.location)).not.toContain('kept-key-of-clash-1');
  });

  it('a fingerprint no kept request has: the plain settled message, nothing checked or offered for any other request', async () => {
    await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=0000000000000000` });
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(d).toHaveTextContent(strings['held.settledTitle']), { timeout: 10_000 });
    expect(d).toHaveTextContent(strings['held.settledBody']);
    expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
    expect(fx.checked).toEqual([]);
    expect(fx.resent).toEqual([]);
    expect(within(d).queryByRole('checkbox')).toBeNull();
  });

  it("a fingerprint no kept request has, the handle naming a listed server: still settled, the listed server's checkout is never opened", async () => {
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=0000000000000000` });
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(d).toHaveTextContent(strings['held.settledTitle']), { timeout: 10_000 });
    expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(fx.checked).toEqual([]);
  });

  it('a link whose fingerprint could not be made (held=none): says it cannot tell which purchase, nothing checked or sent', async () => {
    await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=none` });
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(d).toHaveTextContent(strings['held.unnamedTitle']), { timeout: 10_000 });
    expect(d).toHaveTextContent(strings['held.unnamedBody']);
    expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
    expect(fx.checked).toEqual([]);
    expect(fx.resent).toEqual([]);
    expect(within(d).queryByRole('checkbox')).toBeNull();
  });

  it('two kept requests with one fingerprint: the plain refusal, neither is picked', async () => {
    fx.sameKey = true;
    const ref = await heldRef('kept-key-of-clash-1');
    await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=${ref}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(fx.checked).toEqual([]);
    expect(within(d).queryByRole('checkbox')).toBeNull();
  });

  it('two kept requests with one fingerprint, the handle naming one server: still the plain refusal, neither is picked', async () => {
    // held-clash-gone lists clash-2 only: the handle resolves to one server, so only the fingerprint is ambiguous.
    fx.sameKey = true;
    const ref = await heldRef('kept-key-of-clash-1');
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=${ref}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(fx.checked).toEqual([]);
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['subs.payConfirm'] })).toBeNull();
  });
});

describe("the automatic Check again never reads the handle's server in the named request's place", () => {
  it("the link names another server (listed, its checkout restoring a pending request) than clash-1's named request: nothing is read, the plain refusal, no resend", async () => {
    fx.restore = true;
    const ref = await heldRef('kept-key-of-clash-1');
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=${ref}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(fx.checked).toEqual([]);
    expect(fx.coChecks).toBe(0);
    expect(within(d).queryByText(strings['held.unknownTitle'])).toBeNull();
    expect(within(d).queryByRole('button', { name: /send|again/i })).toBeNull();
  });

  it("an old short link with clash-1's fingerprint: nothing is read, the plain refusal, no resend", async () => {
    fx.restore = true;
    const ref = await heldRef('kept-key-of-clash-1');
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=deadbeef&check=true&held=${ref}` });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings.payAmbiguous, {}, { timeout: 10_000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(fx.checked).toEqual([]);
    expect(fx.coChecks).toBe(0);
    expect(within(d).queryByRole('button', { name: /send|again/i })).toBeNull();
  });

  it("the link carries clash-1's own whole id with its fingerprint: one read, of clash-1's request (its keyed checkout's), no refusal", async () => {
    fx.restore = true;
    const ref = await heldRef('kept-key-of-clash-1');
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${A}&check=true&held=${ref}` });
    // The drawer's checkout is keyed by clash-1's whole id, so its own Check again reads clash-1's kept request.
    await waitFor(() => expect(fx.coChecks).toBe(1), { timeout: 10_000 });
    expect(fx.checked.filter((x) => x !== A)).toEqual([]);
    expect(within(screen.getByRole('dialog')).queryByText(strings.payAmbiguous)).toBeNull();
  });

  it('a fingerprint no kept request has, the listed server restoring a pending request: nothing is read at all', async () => {
    fx.restore = true;
    await renderPage(page, { state: 'held-clash-gone', path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=0000000000000000` });
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(d).toHaveTextContent(strings['held.settledTitle']), { timeout: 10_000 });
    expect(fx.coChecks).toBe(0);
    expect(fx.checked).toEqual([]);
  });
});

describe("a link whose plan is not the named request's own: only the named request is read", () => {
  it("a kept buy named, another plan in the link whose checkout restores a pending request: the named buy is read, never the other plan's", async () => {
    fx.restore = true;
    fx.list = [
      { key: 'kept-buy-plus', title: 'Small', target: { kind: 'buy', item: 'plan-plus-v2', familyId: 'fam-plus', sub: null, days: null } },
      { key: 'kept-buy-pro', title: 'Medium', target: { kind: 'buy', item: 'plan-pro-v2', familyId: 'fam-pro', sub: null, days: null } },
    ];
    const ref = await heldRef('kept-buy-plus');
    await renderPage(page, { path: `/billing?view=wallet&checkout=buy&plan=plan-pro-v2&check=true&held=${ref}` });
    await waitFor(() => expect(fx.checked).toEqual(['plan-plus-v2']), { timeout: 10_000 });
    expect(fx.coChecks).toBe(0);
    expect(within(screen.getByRole('dialog')).queryByRole('checkbox')).toBeNull();
  });

  it("a kept upgrade named, another plan in the link for the same server: the named upgrade is read, never the other plan's", async () => {
    fx.restore = true;
    const sub = 'a1b2c3d4e5f60718293a4b01';
    fx.list = [{ key: 'kept-up-pro', title: 'n12', target: { kind: 'upgrade', item: 'plan-pro-v2', familyId: 'fam-pro', sub: sub.slice(-8), subId: sub, days: null } }];
    const ref = await heldRef('kept-up-pro');
    await renderPage(page, { path: `/billing?view=wallet&checkout=upgrade&sub=${sub}&plan=plan-max-v1&check=true&held=${ref}` });
    await waitFor(() => expect(fx.checked).toEqual([sub]), { timeout: 10_000 });
    expect(fx.coChecks).toBe(0);
    expect(within(screen.getByRole('dialog')).queryByRole('checkbox')).toBeNull();
  });

  it('the link names the plan the kept buy is for: the ordinary drawer restores it (no mismatch)', async () => {
    fx.restore = true;
    fx.list = [{ key: 'kept-buy-plus', title: 'Small', target: { kind: 'buy', item: 'plan-plus-v2', familyId: 'fam-plus', sub: null, days: null } }];
    const ref = await heldRef('kept-buy-plus');
    await renderPage(page, { path: `/billing?view=wallet&checkout=buy&plan=plan-plus-v2&check=true&held=${ref}` });
    await waitFor(() => expect(fx.coChecks).toBe(1), { timeout: 10_000 });
    expect(fx.checked).toEqual([]);
  });

  it('the link names the kept upgrade\'s plan by its family id: the ordinary drawer restores it (no mismatch)', async () => {
    fx.restore = true;
    const sub = 'a1b2c3d4e5f60718293a4b01';
    fx.list = [{ key: 'kept-up-pro', title: 'n12', target: { kind: 'upgrade', item: 'plan-pro-v2', familyId: 'fam-pro', sub: sub.slice(-8), subId: sub, days: null } }];
    const ref = await heldRef('kept-up-pro');
    await renderPage(page, { path: `/billing?view=wallet&checkout=upgrade&sub=${sub}&plan=fam-pro&check=true&held=${ref}` });
    await waitFor(() => expect(fx.coChecks).toBe(1), { timeout: 10_000 });
    expect(fx.checked).toEqual([]);
  });
});

// A Plans column's exact link names a version; a kept buy of an entry whose family has
// that name is another plan's request, never this one's.
describe('an exact link and a kept buy of a family named like its version', () => {
  const odd = { key: 'kept-buy-odd', title: 'Odd', target: { kind: 'buy', item: 'plan-odd', familyId: 'plan-max-v1', sub: null, days: null } };
  it('named by fingerprint: a mismatch, only the named buy is read, the drawer never restores it as Large', async () => {
    fx.restore = true;
    fx.list = [odd];
    const ref = await heldRef('kept-buy-odd');
    await renderPage(page, { path: `/billing?view=wallet&checkout=buy&plan=plan-max-v1&exact=true&check=true&held=${ref}` });
    await waitFor(() => expect(fx.checked).toEqual(['plan-odd']), { timeout: 10_000 });
    expect(fx.coChecks).toBe(0);
  });
  it('without a fingerprint, the version gone: the plan is gone, the kept buy of Odd is never checked as its request', { timeout: 40_000 }, async () => {
    fx.list = [odd];
    await renderPage(page, { state: 'plans-version-replaced', path: '/billing?view=wallet&checkout=buy&plan=plan-max-v1&exact=true&check=true' });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings['co.planGone'], {}, { timeout: 20_000 })).toBeInTheDocument();
    expect(fx.checked).toEqual([]);
    expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
  });
});

describe('fingerprints that could not be made in the drawer', () => {
  it('a real fingerprint in the link, the digest failing here: says it cannot tell which purchase, never settled, nothing read', async () => {
    const ref = await heldRef('kept-key-of-clash-1');
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no digest'));
    try {
      await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=${ref}` });
      const d = await screen.findByRole('dialog');
      await waitFor(() => expect(d).toHaveTextContent(strings['held.unnamedTitle']), { timeout: 10_000 });
      expect(d).not.toHaveTextContent(strings['held.settledTitle']);
      expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
      expect(fx.checked).toEqual([]);
      expect(fx.resent).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('the same frame with the ordinary checkout forced unknown: no Check again, no resend button, nothing read or sent', async () => {
    fx.restore = true;
    const ref = await heldRef('kept-key-of-clash-1');
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no digest'));
    try {
      await renderPage(page, { path: `/billing?view=wallet&checkout=pay&sub=${B}&check=true&held=${ref}` });
      const d = await screen.findByRole('dialog');
      await waitFor(() => expect(d).toHaveTextContent(strings['held.unnamedTitle']), { timeout: 10_000 });
      await new Promise((r) => setTimeout(r, 300));
      expect(within(d).queryByRole('button', { name: strings['buy.checkAgain'] })).toBeNull();
      expect(within(d).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
      expect(within(d).queryByRole('button', { name: strings['co.resendConfirm'] })).toBeNull();
      expect(fx.coChecks).toBe(0);
      expect(fx.checked).toEqual([]);
      expect(fx.resent).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('heldRef and pickHeld', () => {
  it('heldRef: 16 hex (64 bits) of SHA-256, stable, distinct per key, not the key', async () => {
    const r = await heldRef('kept-key-of-clash-1');
    expect(r).toMatch(/^[0-9a-f]{16}$/);
    expect(await heldRef('kept-key-of-clash-1')).toBe(r);
    expect(await heldRef('kept-key-of-clash-2')).not.toBe(r);
    // SHA-256("abc") begins ba7816bf8f01cfea.
    expect(await heldRef('abc')).toBe('ba7816bf8f01cfea');
  });

  it('pickHeld: one match is the pick; two name none; another kind never matches', () => {
    const u = (key: string, kind = 'pay') => ({ key, target: { kind } });
    const refs = new Map([['k1', 'r1'], ['k2', 'r2'], ['k3', 'r2'], ['k4', 'r1']]);
    expect(pickHeld([u('k1'), u('k2')], refs, 'pay', 'r1')).toEqual({ entry: u('k1'), shared: false });
    expect(pickHeld([u('k2'), u('k3')], refs, 'pay', 'r2')).toEqual({ entry: undefined, shared: true });
    expect(pickHeld([u('k1'), u('k4', 'upgrade')], refs, 'pay', 'r1')).toEqual({ entry: u('k1'), shared: false });
    expect(pickHeld([u('k1')], refs, 'pay', 'r9')).toEqual({ entry: undefined, shared: false });
  });
});
