// Public hrefs of the billing page ("Plans & billing"): the only file other pages may import from this folder.
// The page has three views (`?view=plans|servers|wallet`; none or an unknown one is Plans, and a bare #subscriptions or
// #usage opens the wallet). A checkout is addressed by what it buys: a plan (version or family id), a subscription by its
// short handle, or by its whole id where the person picked one server (the Plans columns: an ending may be shared), a
// bare-metal listing by its opaque id. `view` is the view drawn behind the drawer, and `from` the page the drawer returns
// to (that view when the link names none).
export type CheckoutKind = 'buy' | 'pay' | 'upgrade' | 'rent' | 'reserve';

export interface CheckoutLink {
  plan?: string | null;
  sub?: string | null;
  item?: string | null;
  days?: number | null;
  from?: string | null;
  /** The view the checkout opens over (none: Plans). */
  view?: BillingView | null;
  check?: boolean;
  /** `plan` is a version id that must open that version or none (a Plans column's link), never an entry whose family
   *  has that name (logic.ts planByHandle). */
  exact?: boolean;
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== false && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The page's views (the layout's view bar, `views`). */
export type BillingView = 'plans' | 'servers' | 'wallet';

/** The view a URL shows: its `view`, else a bare #subscriptions or #usage opens the wallet, else the plans. */
export function viewOf(view: unknown, hash: string): BillingView {
  if (view === 'plans' || view === 'servers' || view === 'wallet') return view;
  return hash.endsWith('#subscriptions') || hash.endsWith('#usage') ? 'wallet' : 'plans';
}

/** The Bare metal view: a selected listing, the reservations list, a country filter. */
export interface ServersLink {
  sel?: string | null;
  /** The For rent | Your reservations switch, `?tab=` (ListDetailPage owns `?list=`, its list pane). */
  tab?: 'rent' | 'reservations' | null;
  country?: string | null;
}

/** Every URL key of the Bare metal view (servers/View.tsx): the listings table (search, sort, page, selection, one key
 * per filter), the inspector's term, the For rent | Your reservations switch, and the reservations table (`r` keys).
 * An old /market link carries these and nothing else (market/view.tsx). */
export const serversKeys = [
  'sel', 'days', 'tab', 'q', 'sort', 'page',
  'kind', 'country', 'cores', 'ram', 'disk', 'ramType', 'diskType', 'bandwidth', 'traffic', 'unlimited', 'price',
  'rsel', 'rq', 'rsort', 'rpage', 'rstate',
] as const;

/** The Plans view's hand-off keys: a plan marked "Suggested for you" and the paid server the plans speak about. */
export const plansKeys = ['plan', 'sub'] as const;

const PLANS = '/billing?view=plans#plans';

export const links = {
  billing: '/billing',
  subscriptions: '/billing?view=wallet#subscriptions',
  usage: '/billing?view=wallet#usage',
  // #plans: the page treats the hand-off as a landing and moves focus to the plans heading (view.tsx wantsPlans).
  plans: PLANS,
  /** One view of the page, with nothing else in its address (the view bar). */
  view: (v: BillingView) => `/billing${query({ view: v })}`,
  /** The plans, with one plan (version or family id) marked "Suggested for you"; an empty plan is `plans`. */
  /** An empty plan is the plain plans link (#plans included, so focus lands on the plans heading). */
  plansFor: (plan: string) => (plan ? `/billing${query({ view: 'plans', plan })}` : PLANS),
  /** The plans for one of the account's paid servers (its whole subscription id; a link may still carry an ending that
   *  names one server only): its Upgrade buttons, "Plans for" picked. */
  plansOn: (sub: string) => `/billing${query({ view: 'plans', sub })}`,
  /** The Bare metal view. */
  servers: (o: ServersLink = {}) => `/billing${query({ view: 'servers', sel: o.sel, tab: o.tab === 'rent' ? null : o.tab, country: o.country })}`,
  /** Add funds drawer. `from` brings the person back after the provider's page. */
  funds: (from?: string) => `/billing${query({ sheet: 'funds', from })}`,
  /** A website buy link and the market's purchase panel land here: the Checkout drawer, opened. */
  checkout: (kind: CheckoutKind, o: CheckoutLink = {}) =>
    `/billing${query({ view: o.view, checkout: kind, plan: o.plan, sub: o.sub, item: o.item, days: o.days, from: o.from, check: o.check, exact: o.exact })}`,
  checkoutFor: (
    t: {
      kind: string;
      item: string | null;
      sub: string | null;
      days: number | null;
    },
    // `held`: the kept request's fingerprint (heldRef), so the drawer opens that request and no other.
    o: { check?: boolean; view?: BillingView | null; held?: string | null } = {},
  ) =>
    `/billing${query({ view: o.view, checkout: t.kind, sub: t.sub, [t.kind === 'rent' || t.kind === 'reserve' ? 'item' : 'plan']: t.item, days: t.days, check: o.check, held: o.held })}`,
  /** The bare-metal purchase panel's buttons: the Bare metal view stays behind the drawer. */
  rent: (listing: string, days: number, from?: string) => `/billing${query({ view: 'servers', checkout: 'rent', item: listing, days, from })}`,
  reserve: (offer: string, days: number, from?: string) => `/billing${query({ view: 'servers', checkout: 'reserve', item: offer, days, from })}`,
} as const;
