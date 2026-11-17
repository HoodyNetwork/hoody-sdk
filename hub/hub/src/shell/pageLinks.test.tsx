// Links to pages: a page this load serves links inside the Hub; a hidden page has no link (the control hides).
// There is no classic Hub to fall back to: nothing here ever points at /auth/home.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import * as pageLinks from './pageLinks';
import { followPageLink, followPagePath, pageLink, PagesProvider, placeUnder, SIGNIN_VIEW, signInViewOf, usePageLink, useServedPageLink, usePageVisible } from './pageLinks';

const page = (id: string, path = `/${id}`) => ({ id, path, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const served = [page('home'), page('notifications'), page('programs')];

describe('pageLink', () => {
  it('a served page links inside the Hub at its path', () => {
    expect(pageLink(served, 'notifications')).toEqual({ kind: 'hub', href: '/notifications' });
  });
  it('a hidden page has no link, whether or not the sign-in pages have a view for it', () => {
    expect(pageLink(served, 'account')).toBeNull();
    expect(pageLink(served, 'billing')).toBeNull();
    expect(pageLink(served, 'nope')).toBeNull();
  });
  it('the classic fallbacks are gone from the module', () => {
    for (const name of ['CLASSIC_VIEW', 'classicHubHref', 'classicViewOf', 'hiddenPageRedirect', 'ClassicRedirect']) expect(Object.hasOwn(pageLinks, name)).toBe(false);
  });
  it('sign-in view names: own keys only, billing and notifications under their sign-in names', () => {
    expect(signInViewOf('billing')).toBe('wallet');
    expect(signInViewOf('notifications')).toBe('notify');
    expect(signInViewOf('computers')).toBe('computers');
    for (const id of ['constructor', 'toString', '__proto__', 'nope']) expect(signInViewOf(id)).toBeUndefined();
    expect(Object.keys(SIGNIN_VIEW)).toHaveLength(17);
  });
});

describe('usePageVisible / usePageLink', () => {
  const wrap = ({ children }: { children: ReactNode }) => <PagesProvider pages={served}>{children}</PagesProvider>;
  it('read the pages the shell was given', () => {
    expect(renderHook(() => usePageVisible('programs'), { wrapper: wrap }).result.current).toBe(true);
    expect(renderHook(() => usePageVisible('account'), { wrapper: wrap }).result.current).toBe(false);
    expect(renderHook(() => usePageLink('account'), { wrapper: wrap }).result.current).toBeNull();
    expect(renderHook(() => usePageLink('programs'), { wrapper: wrap }).result.current).toEqual({ kind: 'hub', href: '/programs' });
    expect(renderHook(() => useServedPageLink('account'), { wrapper: wrap }).result.current).toBeNull();
  });
  it('outside the shell (a page test) every page counts as served', () => {
    expect(renderHook(() => usePageVisible('account')).result.current).toBe(true);
    expect(renderHook(() => usePageLink('account')).result.current).toEqual({ kind: 'hub', href: '/account' });
  });
});

describe('followPagePath (notify links: inbox, learn sections)', () => {
  it('a served page goes to the place inside it through the router', () => {
    const go = vi.fn();
    expect(followPagePath(pageLink(served, 'notifications'), '/notifications/learn#browser', go)).toBe(true);
    expect(go).toHaveBeenCalledWith('/notifications/learn#browser');
  });
  it('a hidden page goes nowhere: no router move, no full navigation', () => {
    const go = vi.fn();
    const assign = vi.fn();
    const replace = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, origin: real.origin, assign, replace } });
    try {
      expect(followPagePath(pageLink([page('home')], 'notifications'), '/notifications', go)).toBe(false);
      expect(followPagePath(pageLink([page('home')], 'nowhere'), '/nowhere', go)).toBe(false);
      expect(go).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });
  it('followPageLink always goes through the router', () => {
    const go = vi.fn();
    followPageLink({ kind: 'hub', href: '/programs' }, go);
    expect(go).toHaveBeenCalledWith('/programs');
  });
});

describe('names that are not pages (Object prototype keys)', () => {
  it('#/constructor and #/toString have no link', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(pageLink(served, id)).toBeNull();
  });
});

describe('followPagePath stays under its page', () => {
  it('a path outside the page goes to the page itself', () => {
    const go = vi.fn();
    followPagePath(pageLink(served, 'notifications'), '/keys', go);
    followPagePath(pageLink(served, 'notifications'), '/notifications?box=archive', go);
    expect(go.mock.calls).toEqual([['/notifications'], ['/notifications?box=archive']]);
  });
});

describe('placeUnder: a place is kept only when it is plainly under the page', () => {
  const link = { kind: 'hub', href: '/keys' } as const;
  it.each([
    ['/keys', '/keys'],
    ['/keys/abc', '/keys/abc'],
    ['/keys?sel=a&tab=b', '/keys?sel=a&tab=b'],
    ['/keys#top', '/keys#top'],
    ['/keys/abc?x=1#y', '/keys/abc?x=1#y'],
  ])('%s is kept', (path, want) => {
    expect(placeUnder(link, path)).toBe(want);
  });
  it.each([
    '/keys/../bots',
    '/keys/./abc',
    '/keys/%2e%2e/bots',
    '/keys/abc/..',
    '//keys/abc',
    'keys/abc',
    '/keys%2f..',
    '/keysmith',
    '/keys\\abc',
    '/keys/%5c..',
    '/keys/%zz',
    '/bots',
    '',
  ])('%s falls back to the page', (path) => {
    expect(placeUnder(link, path)).toBe('/keys');
  });
  it('followPagePath uses the same rule', () => {
    const go = vi.fn();
    followPagePath(pageLink(served, 'notifications'), '/notifications/../keys', go);
    followPagePath(pageLink(served, 'notifications'), 'notifications/learn', go);
    followPagePath(pageLink(served, 'notifications'), '//notifications/learn', go);
    expect(go.mock.calls).toEqual([['/notifications'], ['/notifications'], ['/notifications']]);
  });
});
