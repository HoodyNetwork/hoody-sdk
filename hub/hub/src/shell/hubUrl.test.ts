// The v3 Hub keeps its place through sign-in: ?view= (the classic names too) becomes the v3 route at
// boot, and leaving for sign-in carries hub=v3 plus the page's view; "this page again" keeps the hash.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { visiblePages } from '../app/pages';
import { commerce } from '@core';
import { adoptViewParam, billingStashFor, billingStashWaiting, herePath, hubLifecycle, keepHubState } from './hubUrl';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const SERVED = [pg('home'), pg('programs'), pg('notifications')];

const at = (url: string) => window.history.replaceState(null, '', url);
const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => at('/'));

describe('adoptViewParam', () => {
  it('a deep link through sign-in lands on its page, and the param is dropped', () => {
    at('/auth/home?hub=v3&view=programs');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3#/programs');
  });
  it('maps the classic view names', () => {
    at('/auth/home?hub=v3&view=notify');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3#/notifications');
  });
  it('a view this load does not serve stays on the default route; other params stay', () => {
    at('/auth/home?hub=v3&view=wallet&theme=dark&fx=empty');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3&theme=dark&fx=empty');
  });
  it('an explicit hash wins; an unknown view is only dropped', () => {
    at('/auth/home?hub=v3&view=programs#/notifications');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3#/notifications');
    at('/auth/home?hub=v3&view=nope');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3');
  });
  it('no view: nothing changes', () => {
    at('/auth/home?hub=v3#/programs');
    adoptViewParam(SERVED);
    expect(here()).toBe('/auth/home?hub=v3#/programs');
  });
});

// A website buy link or a payment return the boot gate stashed opens Billing (the only page that
// reads it); Home, the default route, never reads it.
describe('adoptViewParam: a waiting buy link or payment return opens Billing', () => {
  const WITH_BILLING = [...SERVED, pg('billing')];
  it('no view and no hash: Billing, other params kept', () => {
    at('/auth/home?theme=dark');
    adoptViewParam(WITH_BILLING, () => true);
    expect(here()).toBe('/auth/home?theme=dark#/billing');
    at('/auth/home#/');
    adoptViewParam(WITH_BILLING, () => true);
    expect(here()).toBe('/auth/home#/billing');
  });
  it('nothing waiting, a hash, a view, or Billing not served: no landing (and a hash or view never asks)', () => {
    const waits = vi.fn(() => true);
    at('/auth/home');
    adoptViewParam(WITH_BILLING, () => false);
    expect(here()).toBe('/auth/home');
    at('/auth/home#/programs');
    adoptViewParam(WITH_BILLING, waits);
    expect(here()).toBe('/auth/home#/programs');
    at('/auth/home?view=programs');
    adoptViewParam(WITH_BILLING, waits);
    expect(here()).toBe('/auth/home#/programs');
    expect(waits).not.toHaveBeenCalled();
    at('/auth/home');
    adoptViewParam(SERVED, () => true);
    expect(here()).toBe('/auth/home');
  });
  it('a second adoption after the landing asks nothing again (the hash now names Billing)', () => {
    at('/auth/home');
    adoptViewParam(WITH_BILLING, () => true);
    const waits = vi.fn(() => true);
    adoptViewParam(WITH_BILLING, waits);
    expect(here()).toBe('/auth/home#/billing');
    expect(waits).not.toHaveBeenCalled();
  });
  it('the default check: the stored session and the stash it reads; never in fixtures, false when a read throws, the stash kept for Billing', () => {
    const plan = '0123456789abcdef01234567';
    const account = () => ({ kind: 'account' });
    try {
      sessionStorage.setItem('hub_buy_intent', JSON.stringify({ kind: 'subserver', plan, at: Date.now() }));
      expect(billingStashWaiting(false, account, commerce)).toBe(true);
      expect(sessionStorage.getItem('hub_buy_intent')).not.toBeNull();
      expect(billingStashWaiting(false, () => ({ kind: 'token' }), commerce)).toBe(false);
      expect(billingStashWaiting(false, () => null, commerce)).toBe(false);
      expect(billingStashWaiting(true, account, commerce)).toBe(false);
      expect(billingStashWaiting(false, () => { throw new Error('storage'); }, commerce)).toBe(false);
      expect(billingStashWaiting(false, account, { readTopupReturn: () => { throw new Error('storage'); }, readIntent: () => null })).toBe(false);
      // The default wiring of adoptViewParam: this test build is a fixtures build, so nothing lands.
      at('/auth/home');
      adoptViewParam(WITH_BILLING);
      expect(here()).toBe('/auth/home');
    } finally {
      sessionStorage.removeItem('hub_buy_intent');
    }
  });
  it('billingStashFor: an account with a fresh stash only; a stale or malformed one counts for nothing', () => {
    const plan = '0123456789abcdef01234567';
    try {
      sessionStorage.setItem('hub_buy_intent', JSON.stringify({ kind: 'subserver', plan, at: Date.now() }));
      expect(billingStashFor('account', commerce)).toBe(true);
      expect(billingStashFor('token', commerce)).toBe(false);
      expect(billingStashFor(undefined, commerce)).toBe(false);
      sessionStorage.setItem('hub_buy_intent', JSON.stringify({ kind: 'subserver', plan, at: Date.now() - 2 * 60 * 60 * 1000 }));
      expect(billingStashFor('account', commerce)).toBe(false);
      sessionStorage.removeItem('hub_buy_intent');
      localStorage.setItem('hub_buy_intent', JSON.stringify({ kind: 'subserver', plan, at: Date.now() }));
      expect(billingStashFor('account', commerce)).toBe(true);
      localStorage.removeItem('hub_buy_intent');
      sessionStorage.setItem('hub_topup_return', JSON.stringify({ payment: plan, status: 'success', provider: 'card', at: Date.now() }));
      expect(billingStashFor('account', commerce)).toBe(true);
      sessionStorage.setItem('hub_topup_return', '{"payment":"nope"}');
      expect(billingStashFor('account', commerce)).toBe(false);
    } finally {
      sessionStorage.removeItem('hub_buy_intent');
      sessionStorage.removeItem('hub_topup_return');
      localStorage.removeItem('hub_buy_intent');
    }
  });
});

describe('leaving the page', () => {
  it('sign-in keeps hub=v3 and the current page as a view', () => {
    at('/auth/home?hub=v3#/programs/abc');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3&view=programs');
    expect(keepHubState('/auth/login?error=shared_expired')).toBe('/auth/login?error=shared_expired&hub=v3&view=programs');
  });
  it('the classic names go out as the classic view; Home and unknown pages add no view', () => {
    at('/auth/home?hub=v3#/notifications');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3&view=notify');
    at('/auth/home?hub=v3#/home');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3');
    at('/auth/home?hub=v3#/no-such');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3');
  });
  it('other destinations are left alone', () => {
    at('/auth/home?hub=v3#/programs');
    expect(keepHubState('/auth/home?hub=v3#/programs')).toBe('/auth/home?hub=v3#/programs');
  });
  it('core\'s exits go through it', () => {
    at('/auth/home?hub=v3#/programs');
    const replace = vi.fn();
    const { origin, hash } = window.location;
    vi.spyOn(window, 'location', 'get').mockReturnValue({ origin, hash, replace } as unknown as Location);
    try {
      hubLifecycle.navigate('/auth/login');
    } finally {
      vi.restoreAllMocks();
    }
    expect(replace).toHaveBeenCalledWith('/auth/login?hub=v3&view=programs');
    expect(hubLifecycle.herePath()).toBe('/auth/home?hub=v3#/programs');
  });
  it('"this page again" is a real reload (a replace to the same URL with a hash only scrolls)', () => {
    at('/auth/home?hub=v3#/programs');
    const replace = vi.fn();
    const reload = vi.fn();
    const { origin, hash, pathname, search } = window.location;
    vi.spyOn(window, 'location', 'get').mockReturnValue({ origin, hash, pathname, search, replace, reload } as unknown as Location);
    try {
      hubLifecycle.navigate(hubLifecycle.herePath());
    } finally {
      vi.restoreAllMocks();
    }
    expect(reload).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
  it('a preview page survives the whole sign-in round trip', () => {
    // Leaving: the preview page goes out with preview=1 and its view.
    at('/auth/home?hub=v3&preview=1#/computers/abc');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3&preview=1&view=computers');
    at('/auth/home?hub=v3#/computers');
    expect(keepHubState('/auth/login')).toBe('/auth/login?hub=v3&view=computers');
    // Coming back (login forwards the query): main.tsx's visiblePages reads ?preview, then adoptViewParam.
    const all = [pg('home'), { ...pg('computers'), status: 'preview' } as PageManifest];
    at('/auth/home?hub=v3&preview=1&view=computers');
    adoptViewParam(visiblePages(all, { preview: new URLSearchParams(window.location.search).get('preview') === '1', only: '', fixtures: false }));
    expect(here()).toBe('/auth/home?hub=v3&preview=1#/computers');
    // Without preview the page is not served: the default route, and only `view` is dropped.
    at('/auth/home?hub=v3&view=computers');
    adoptViewParam(visiblePages(all, { preview: false, only: '', fixtures: false }));
    expect(here()).toBe('/auth/home?hub=v3');
  });
  it('"this page again" keeps the hash', () => {
    at('/auth/home?hub=v3#/programs');
    expect(herePath()).toBe('/auth/home?hub=v3#/programs');
  });
});
