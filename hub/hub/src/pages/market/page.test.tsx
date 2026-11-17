// Vitest: the old /market route. It has no nav entry, and Plans & billing is
// the one commerce entry; every row of the redirect table lands where the table says, in place of this address
// (`replace`), and only once; a Billing this load does not serve takes its own link.
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

type Link = { kind: 'hub'; href: string } | { kind: 'classic'; href: string } | null;
const at: { search: Record<string, string>; link: Link } = { search: {}, link: null };
const go = vi.fn();
const follow = vi.fn();
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    useGo: () => go,
    useSearch: () => at.search,
    // The view reads the route's anchor from the router (no RouterProvider here): none.
    useLocationHash: () => '',
    usePageLink: () => at.link,
    followPageLink: (l: unknown) => follow(l),
  };
});
const { default: MarketRedirect, redirectFor } = await import('./view');

beforeEach(() => {
  go.mockClear();
  follow.mockClear();
  at.link = { kind: 'hub', href: '#/billing' };
  at.search = {};
  window.location.hash = '';
});

describe('one commerce entry', () => {
  it('the market route has no nav entry (Plans & billing has the one: billing/servers/servers.test.tsx)', () => {
    expect(page.nav).toBeUndefined();
    expect(page.path).toBe('/market');
  });
});

describe('the redirect table', () => {
  it.each([
    [{}, '', '/billing?view=servers'],
    [{ sel: 'l01' }, '', '/billing?view=servers&sel=l01'],
    [{ sel: 'l01', days: '90' }, '', '/billing?view=servers&sel=l01&days=90'],
    [{ tab: 'reservations' }, '', '/billing?view=servers&tab=reservations'],
    [{ tab: 'reservations', rsel: 'r02' }, '', '/billing?view=servers&tab=reservations&rsel=r02'],
    [{ tab: 'listings' }, '', '/billing?view=servers'],
    [{ country: 'DE', cores: '8..', sort: 'from', q: 'ryzen' }, '', '/billing?view=servers&country=DE&cores=8..&sort=from&q=ryzen'],
    [{}, '#/market#plans', '/billing?view=plans'],
    [{ plan: 'fam-pro' }, '', '/billing?view=plans&plan=fam-pro'],
    // The plans hand-off keeps its known parameters together (plan, sub), nothing else (`why` is read by no view).
    [{ plan: 'p', why: 'ai', sub: 's' }, '', '/billing?view=plans&plan=p&sub=s'],
    [{ sub: 's' }, '#/market#plans', '/billing?view=plans&sub=s'],
    [{ plan: 'p', sheet: 'funds', checkout: 'buy' }, '', '/billing?view=plans&plan=p'],
    // Only the Bare metal view's own keys travel: a Billing drawer (funds, checkout) or anything else is dropped.
    [{ sel: 'l01', sheet: 'funds', from: '/x', checkout: 'rent', item: 'l02', days: '90', check: 'true', plan: '' }, '', '/billing?view=servers&sel=l01&days=90'],
    [{ tab: 'reservations', rsel: 'r01', rq: 'xl', rsort: '-ready', rpage: '2', rstate: 'pending' }, '', '/billing?view=servers&tab=reservations&rsel=r01&rq=xl&rsort=-ready&rpage=2&rstate=pending'],
    [{ kind: 'offer', ram: '64..', disk: '..2000', ramType: 'ddr5', diskType: 'NVMe', bandwidth: '1000..', traffic: '10..', unlimited: 'yes', price: '..200', page: '2' }, '', '/billing?view=servers&kind=offer&ram=64..&disk=..2000&ramType=ddr5&diskType=NVMe&bandwidth=1000..&traffic=10..&unlimited=yes&price=..200&page=2'],
    [{ ref: 'x', utm_source: 'y', weird: 'z' }, '', '/billing?view=servers'],
  ])('%o %s → %s', (search, hash, to) => {
    expect(redirectFor(search, hash)).toBe(to);
  });

  it('moves once, in place of the old address; a second render sends nothing more', () => {
    at.search = { sel: 'l01' };
    const r = render(<MarketRedirect />);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenLastCalledWith('/billing?view=servers&sel=l01', { replace: true });
    at.search = { view: 'servers', sel: 'l01' };
    r.rerender(<MarketRedirect />);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('the Sidebar "Rent servers" link (plain /market) lands on the Bare metal view', () => {
    render(<MarketRedirect />);
    expect(go).toHaveBeenCalledWith('/billing?view=servers', { replace: true });
  });

  it('a classic Billing link: the redirect follows that link', () => {
    at.link = { kind: 'classic', href: '/auth/home?view=wallet' };
    render(<MarketRedirect />);
    expect(go).not.toHaveBeenCalled();
    expect(follow).toHaveBeenCalledWith(at.link);
  });

  it('no Billing in this load: nothing moves, the note stays', () => {
    at.link = null;
    render(<MarketRedirect />);
    expect(go).not.toHaveBeenCalled();
    expect(follow).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(strings.opening);
  });
});
