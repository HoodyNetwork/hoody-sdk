// Fake-API states of the billing page for hub:dev, hub:shots, tests and specs.
// State names are the shots' and tests' vocabulary: ?fx=<state>. Every state starts from `base` and overrides keys.
import { defineFixtures, type FixtureState } from '@app/fixtures';
import { SAMPLE_FACTS, listingRules } from '@core';
import type { CheckoutQuote, ListingPrices } from './checkout-logic';
import { type Availability, type Balance, type Identity, type Listing, type ServerKinds, resetUnknownCheckouts } from './data';
import type { PaidRegion } from './plans-regions';
import type { RawBonus, RawPlan, RawSub, RawUsage, ReturnState, SubsRead } from './types';
import servers, { resetFixtureServer as resetServers } from './servers/fixtures';

const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const S_N12 = '6612aa0b0c0d0e0f10111213';
const S_FRA = '6612aa0b0c0d0e0f10111214';
const S_SIN = '6612aa0b0c0d0e0f10111215';
const S_NEW = '6612aa0b0c0d0e0f10111216';
const S_FREE = '6612aa0b0c0d0e0f10111217';
const S_RENT = '6612aa0b0c0d0e0f10111218';

// ── Plans ───────────────────────────────────────────────────────────────────────────

const plan = (
  id: string,
  family: string,
  title: string,
  cents: number,
  o: Partial<RawPlan> & {
    cpu: number;
    ram: number;
    disk: number;
    mult: number;
    tier: string;
    computers: number;
    sort: number;
    res?: Partial<NonNullable<RawPlan['resources']>>;
  },
): RawPlan => ({
  id,
  family_id: family,
  price_cents_per_month: cents,
  hold_days: 7,
  ai_tier: o.tier,
  sort_order: o.sort,
  max_proxy_aliases: o.max_proxy_aliases ?? o.computers * 2,
  max_bot_urls: o.max_bot_urls ?? o.computers,
  resources: {
    cpu_cores: o.cpu,
    ram_gb: o.ram,
    disk_limit_gb: o.disk,
    disk_io_read_mib: 200 * o.cpu,
    disk_io_write_mib: 100 * o.cpu,
    network_limit_mbps: 250 * o.cpu,
    max_computers: o.computers,
    snapshots_per_computer: 3,
    ai_multiplier: o.mult,
    ...o.res,
  },
  text: {
    title,
    type_label: o.text?.type_label ?? 'Shared server',
    description: o.text?.description ?? '',
  },
});

const PLANS: RawPlan[] = [
  plan('plan-plus-v2', 'fam-plus', 'Small', 1200, {
    cpu: 2,
    ram: 4,
    disk: 60,
    computers: 3,
    mult: 4,
    tier: 'plus',
    sort: 1,
  }),
  plan('plan-pro-v2', 'fam-pro', 'Medium', 2900, {
    cpu: 4,
    ram: 8,
    disk: 160,
    computers: 8,
    mult: 10,
    tier: 'pro',
    sort: 2,
  }),
  plan('plan-max-v1', 'fam-max', 'Large', 5900, {
    cpu: 8,
    ram: 16,
    disk: 320,
    computers: 16,
    mult: 20,
    tier: 'pro',
    sort: 3,
  }),
];

const terms = (p: RawPlan) => ({
  family_id: p.family_id,
  title: p.text?.title,
  price_cents_per_month: p.price_cents_per_month,
  hold_days: p.hold_days,
  resources: p.resources,
  max_proxy_aliases: p.max_proxy_aliases,
  max_bot_urls: p.max_bot_urls,
  ai_tier: p.ai_tier,
});

const [PLUS, PRO] = PLANS as [RawPlan, RawPlan, RawPlan];

// ── Subscriptions ───────────────────────────────────────────────────────────────────

const SUBS: RawSub[] = [
  {
    id: 'a1b2c3d4e5f60718293a4b01',
    state: 'active',
    server_id: S_N12,
    server_name: 'n12',
    country: 'SG',
    region: { region: 'sg-sin', country: 'SG', city: 'Singapore' },
    plan_id: PLUS.id,
    plan: terms(PLUS),
    paid_through: iso(11),
    auto_renew: true,
    active_operation_id: null,
  },
  {
    id: 'a1b2c3d4e5f60718293a4b02',
    state: 'held',
    server_id: S_FRA,
    server_name: 'fra-7',
    country: 'DE',
    region: { region: 'de-fra', country: 'DE', city: 'Frankfurt' },
    plan_id: PRO.id,
    plan: terms(PRO),
    paid_through: iso(-22),
    delete_at: iso(6),
    auto_renew: false,
    active_operation_id: null,
  },
  {
    id: 'a1b2c3d4e5f60718293a4b03',
    state: 'active',
    server_id: S_SIN,
    server_name: 'Singapore M',
    country: 'SG',
    region: { region: 'sg-sin', country: 'SG', city: 'Singapore' },
    plan_id: PRO.id,
    plan: terms(PRO),
    paid_through: iso(24),
    auto_renew: false,
    active_operation_id: null,
  },
  {
    id: 'a1b2c3d4e5f60718293a4b04',
    state: 'provisioning',
    server_id: S_NEW,
    server_name: 'paid-6612aa0b0c0d0e0f10111216',
    plan_id: PLUS.id,
    plan: terms(PLUS),
    paid_through: iso(30),
    auto_renew: true,
    active_operation_id: 'op-1',
  },
];

const subs: SubsRead = { subs: SUBS, partial: null };
const clashSubs = () => ['a', 'b'].map((c, i) => ({ ...SUBS[1]!, id: `${c.repeat(16)}deadbeef`, server_name: `clash-${i + 1}` }));
// Two upgradeable servers whose ids share the last 8 characters: only the whole id tells them apart.
const TWIN = (c: string, i: number): RawSub => ({ ...SUBS[0]!, id: `${c.repeat(16)}0a0b0c0d`, server_id: `srv-twin-${i}`, server_name: `twin-${i}` });
const twinSubs = () => [TWIN('c', 1), TWIN('d', 2), ...SUBS.slice(1)];
// twin-2's server as the usage read names it (a 24-hex server id).
const TWIN2_SRV = '7712aa0b0c0d0e0f10111299';
const heldSubs = (n: number) => Array.from({ length: n }, (_, i) => ({ ...SUBS[1]!, id: `a1b2c3d4e5f6071829${String(i).padStart(6, '0')}`, server_name: `held-${i + 1}` }));

// ── AI usage ────────────────────────────────────────────────────────────────────────

const lane = (pct: number, hours = 2) => ({
  status: 'ok',
  percent_used: pct,
  resets_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
});
const usage: RawUsage = {
  servers: [
    {
      server: { id: S_N12, name: 'n12' },
      status: 'ok',
      as_of: iso(0),
      lanes: {
        chat: lane(40),
        decisions: lane(10),
        search: lane(0),
        speech: { status: 'off' },
        transcription: lane(80, 5),
      },
    },
    {
      server: { id: S_SIN, name: 'Singapore M' },
      status: 'ok',
      as_of: iso(0),
      lanes: {
        chat: lane(100, 3),
        decisions: lane(30),
        search: lane(70),
        speech: lane(0),
        transcription: lane(0),
      },
    },
    {
      server: { id: S_FRA, name: 'fra-7' },
      status: 'ok',
      as_of: iso(0),
      lanes: {
        chat: lane(20),
        decisions: lane(0),
        search: lane(0),
        speech: { status: 'off' },
        transcription: { status: 'off' },
      },
    },
    {
      server: { id: S_FREE, name: 'ash-3' },
      status: 'ok',
      as_of: iso(0),
      lanes: {
        chat: lane(60, 1),
        decisions: lane(20),
        search: lane(10),
        speech: lane(0),
        transcription: lane(0),
      },
    },
    {
      server: { id: S_RENT, name: 'Tokyo M' },
      status: 'unavailable',
      as_of: iso(0),
      lanes: {},
    },
  ],
  truncated: false,
};

const kinds: ServerKinds = { [S_FREE]: 'free', [S_RENT]: 'bare_metal' };

// 'usage-bare-next': a server on Large, the biggest plan, and its AI usage row.
const S_BIG = '6612aa0b0c0d0e0f10111219';
const BIG_SUB: RawSub = {
  id: 'a1b2c3d4e5f60718293a4b05',
  state: 'active',
  server_id: S_BIG,
  server_name: 'osa-9',
  country: 'JP',
  plan_id: PLANS[2]!.id,
  plan: terms(PLANS[2]!),
  paid_through: iso(18),
  auto_renew: true,
  active_operation_id: null,
};
const BIG_USAGE: NonNullable<RawUsage['servers']>[number] = {
  server: { id: S_BIG, name: 'osa-9' },
  status: 'ok',
  as_of: iso(0),
  lanes: { chat: lane(90), decisions: lane(50), search: lane(30), speech: lane(0), transcription: lane(0) },
};

// ── Wallet ──────────────────────────────────────────────────────────────────────────

const balance: Balance = { general: '42.50', referral: '0.00', owed: '0.00' };
const bonus: RawBonus = {
  enabled: true,
  github_linked: true,
  amount_usd: '10.00',
  github_username: 'octocat',
};
const availability: Availability = {
  methods: [
    { key: 'card', min: 5, max: 10_000 },
    { key: 'crypto', min: 10, max: 5_000 },
  ],
};
const identity: Identity = { banned: false };

// ── Quotes (what each checkout shows) ───────────────────────────────────────────────

const q = (o: Partial<CheckoutQuote> & Pick<CheckoutQuote, 'chargeCents' | 'lines'>): CheckoutQuote => ({
  balanceCents: 4250,
  notes: [],
  blocked: null,
  warnings: [],
  ...o,
});

const quoteBuy = q({
  chargeCents: 1200,
  lines: [
    { label: 'co.plan', cents: 1200 },
    { label: 'buy.chargeNow', cents: 1200, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'co.renewsFromWallet', v: { date: '23 Nov 2026', price: '$12.00' } }, { k: 'buy.hold', v: { days: 7 } }, { k: 'co.newServer' }],
});

const quotePay = q({
  chargeCents: 2900,
  lines: [
    { label: 'co.plan', cents: 2900 },
    { label: 'buy.chargeNow', cents: 2900, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'subs.payLine', v: { date: '23 Nov 2026' } }],
});

const quoteUpgrade = q({
  chargeCents: 1710,
  lines: [
    { label: 'co.upgradeDifference', cents: 1710 },
    { label: 'buy.chargeNow', cents: 1710, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'up.until', v: { date: '3 Nov 2026', price: '$29.00' } }],
  warnings: [
    { k: 'up.downtime', v: { server: 'n12' } },
    { k: 'up.oneWay', v: { server: 'n12' } },
  ],
});

const quoteRent = q({
  chargeCents: 3900,
  lines: [
    { label: 'mkt.bdRental', cents: 3900 },
    { label: 'mkt.bdSetup', cents: 0 },
    { label: 'mkt.bdTotal', cents: 3900, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'co.ceiling', v: { amount: '$39.00' } }, { k: 'mkt.noRefunds' }],
});

const quoteReserve = q({
  chargeCents: 3900,
  lines: [
    { label: 'mkt.bdRental', cents: 3500 },
    { label: 'mkt.bdSetup', cents: 400 },
    { label: 'mkt.bdTotal', cents: 3900, strong: true },
    { label: 'buy.wallet', cents: 4250 },
  ],
  notes: [{ k: 'co.ceiling', v: { amount: '$39.00' } }, { k: 'mkt.preorderProtect' }],
});

/** The market's term prices in cents (rental, one-time setup), by `kind:id` then days: what its rows quote. */
const listingPrices: ListingPrices = {
  'rent:mkt_sin_m': { '30': [3900, 0], '90': [10900, 0], '180': [19900, 0] },
  'reserve:mkt_sin_m': { '30': [3500, 400], '90': [9900, 400], '180': [18900, 400] },
  'rent:l01': { '30': [6900, 0], '90': [18900, 0], '365': [69000, 0] },
  'rent:l02': { '30': [3900, 0], '90': [10500, 0], '365': [38000, 0] },
  'rent:l03': { '30': [17900, 4900], '90': [49900, 0] },
  'rent:l04': { '30': [8900, 0], '90': [24900, 0] },
  'rent:l05': { '30': [7900, 0], '90': [21900, 0], '180': [41900, 0] },
  'rent:l06': { '30': [3000, 0], '90': [7900, 0] },
  'rent:l07': { '30': [11900, 0], '90': [32900, 0], '365': [119000, 0] },
  'rent:l08': { '30': [3400, 0], '90': [9400, 0] },
  'reserve:o01': { '30': [14900, 2900], '90': [41900, 0] },
  'reserve:o02': { '30': [29900, 5900], '90': [84900, 0] },
  'reserve:o03': { '30': [6400, 1900] },
};

/** Where a paid plan's server can be placed (the regions read, the same list for every plan here): three locations
 *  with room and one that is full right now. */
export const REGIONS: PaidRegion[] = [
  { region: 'de-fra', country: 'DE', city: 'Frankfurt', available: true },
  { region: 'fi-hel', country: 'FI', city: 'Helsinki', available: true },
  { region: 'sg-sin', country: 'SG', city: 'Singapore', available: true },
  { region: 'us-nyc', country: 'US', city: 'New York', available: false },
];

const quotes: FixtureState = {
  prices: { data: listingPrices },
  regions: { data: REGIONS },
  'quote.buy': { data: quoteBuy },
  'quote.pay': { data: quotePay },
  'quote.upgrade': { data: quoteUpgrade },
  'quote.rent': { data: quoteRent },
  'quote.reserve': { data: quoteReserve },
};

/** The market's own listings (the ids its rows link to): a checkout opened for one item prices that item, never another. */
/**
 * A listing's facts are the Market's own: built from the Market fixture row's facts input with the same kind and id (core's
 * SAMPLE_FACTS, pinned to the Market rows by the Market's tests; unknowns kept), so the checkout can never say anything the Market's inspector does not. An id the Market does not
 * list has no facts (no section), never invented ones.
 */
const marketFacts = (kind: Listing['kind'], id: string): Listing['facts'] => {
  const input = SAMPLE_FACTS[`${kind === 'rent' ? 'stock' : 'offer'}:${id}`];
  return input ? listingRules.listingFacts(input) : [];
};
const lst = (kind: Listing['kind'], id: string, name: string, city: string, country: string, terms: number[]): Listing => ({
  kind,
  id,
  name,
  place: `${city}, ${country}`,
  terms,
  facts: marketFacts(kind, id),
  instant: kind === 'rent',
});
export const listings: Listing[] = [
  lst('rent', 'mkt_sin_m', 'Singapore M', 'Singapore', 'SG', [30, 90, 180]),
  lst('rent', 'l01', 'Frankfurt L', 'Falkenstein', 'DE', [30, 90, 365]),
  lst('rent', 'l02', 'Frankfurt M', 'Falkenstein', 'DE', [30, 90, 365]),
  lst('rent', 'l03', 'Tokyo L', 'Tokyo', 'JP', [30, 90]),
  lst('rent', 'l04', 'Singapore M', 'Singapore', 'SG', [30, 90]),
  lst('rent', 'l05', 'Ashburn M', 'Ashburn', 'US', [30, 90, 180]),
  lst('rent', 'l06', 'Singapore S', 'Singapore', 'SG', [30, 90]),
  lst('rent', 'l07', 'Tokyo M', 'Tokyo', 'JP', [30, 90, 365]),
  lst('rent', 'l08', 'Frankfurt S', 'Falkenstein', 'DE', [30, 90]),
  lst('rent', 'u01', 'Ashburn S', 'Ashburn', 'US', []),
  lst('reserve', 'mkt_sin_m', 'Singapore M', 'Singapore', 'SG', [30, 90, 180]),
  lst('reserve', 'o01', 'Frankfurt XL', 'Frankfurt', 'DE', [30, 90]),
  lst('reserve', 'o02', 'Ashburn XL', 'Ashburn', 'US', [30, 90]),
  lst('reserve', 'o03', 'Singapore XL', 'Singapore', 'SG', [30]),
];

// ── Base ────────────────────────────────────────────────────────────────────────────

const done = {
  outcome: 'done',
  data: { chargedCents: 1200, at: iso(0), until: iso(30), readyBy: iso(1) },
} as const;

const base: FixtureState = {
  subs: { data: subs },
  plans: { data: PLANS },
  usage: { data: usage },
  balance: { data: balance },
  bonus: { data: bonus },
  identity: { data: identity },
  kinds: { data: { kinds, free: { max: 3 } } },
  availability: { data: availability },
  return: { data: null },
  resume: { data: { kind: 'buy', plan: 'fam-plus' } },
  listings: { data: listings },
  ...quotes,
  autoRenew: { outcome: 'done' },
  claimBonus: {
    outcome: 'done',
    data: { result: 'granted', amount_usd: '10.00' },
  },
  topup: {
    outcome: 'done',
    data: { url: 'https://checkout.stripe.com/c/pay/cs_live_a1b2c3d4e5' },
  },
  confirm: done,
  check: done,
};

const only = (over: FixtureState): FixtureState => ({ ...base, ...over });

// A quote's Wallet balance line reads the same balance the quote answers with (balanceCents).
const walletAt = (lines: CheckoutQuote['lines'], cents: number): CheckoutQuote['lines'] =>
  lines.map((l) => (l.label === 'buy.wallet' ? { ...l, cents } : l));

const SEND_FAIL = (code: string, data?: Record<string, unknown>) => only({ confirm: { outcome: 'failed', code, ...(data ? { data } : {}) } });

const retStates: Record<string, ReturnState | null> = {
  'return-received': { state: 'received' },
  'return-processing': { state: 'processing' },
  'return-review': { state: 'review', credited: false },
  'return-failed': { state: 'failed' },
  'return-cancelled': { state: 'cancelled' },
  'return-unverified': { state: 'unverified' },
};

/**
 * The Bare metal view answers from the same state as the rest of the page: its keyed answers
 * ride every Billing state under `servers.` names (servers/data.ts reads them so), its default's with the Billing
 * states, and each of its own states becomes a Billing state `servers-<state>` over Billing's default. Its core rules
 * (the reservations) come first, so a rule of its own wins over a Billing one for the same route.
 */
function withServers(own: Readonly<Record<string, FixtureState>>, ownDefault: string): Record<string, FixtureState> {
  const keyed = (st: FixtureState): FixtureState => Object.fromEntries(Object.entries(st).filter(([k]) => k !== 'rules').map(([k, v]) => [`servers.${k}`, v]));
  const join = (page: FixtureState, sv: FixtureState): FixtureState => ({ ...page, ...keyed(sv), rules: [...(sv.rules ?? []), ...(page.rules ?? [])] });
  const svDefault = servers.states[servers.default] as FixtureState;
  const out: Record<string, FixtureState> = {};
  for (const [k, st] of Object.entries(own)) out[k] = join(st, svDefault);
  for (const [k, st] of Object.entries(servers.states)) out[`servers-${k}`] = join(own[ownDefault] as FixtureState, st as FixtureState);
  return out;
}

export default defineFixtures({
  default: 'many',
  states: withServers({
    many: base,
    // the page
    empty: only({
      subs: { data: { subs: [], partial: null } },
      kinds: { data: { kinds: {}, free: null } },
      usage: { data: { servers: [], truncated: false } },
      bonus: { data: null },
    }),
    loading: only({
      subs: { pending: true },
      plans: { pending: true },
      usage: { pending: true },
      balance: { pending: true },
      bonus: { pending: true },
      identity: { pending: true },
    }),
    error: only({
      subs: { error: 'server' },
      plans: { error: 'server' },
      usage: { error: 'server' },
      balance: { error: 'server' },
    }),
    partial: only({
      subs: { data: { subs: SUBS, partial: { shown: 4, total: 9 } } },
    }),
    // A change in flight on three pill tones: an active server upgrading (ok), one being deleted and one on hold
    // with a change running (danger), one being set up (neutral ink). Their dots pulse; the words never do.
    'busy-tones': only({
      subs: {
        data: {
          subs: [
            { ...SUBS[0]!, active_operation_id: 'op-2' },
            { ...SUBS[1]!, id: 'a1b2c3d4e5f60718293a4b05', state: 'wiping', server_name: 'old-db', active_operation_id: null },
            { ...SUBS[1]!, active_operation_id: 'op-3' },
            SUBS[3]!,
          ],
          partial: null,
        },
      },
    }),
    // Held servers past the page's bands: 3 draw bands, the 4th and on are counted.
    'held-clash': only({ subs: { data: { subs: clashSubs(), partial: null } } }),
    // A verified credit with a payment waiting for clash-2 (core's resume holds its whole id): Continue opens clash-2's
    // payment by its whole id.
    'return-received-clash': only({
      subs: { data: { subs: clashSubs(), partial: null } },
      return: { data: { state: 'received' } },
      resume: { data: { kind: 'pay', sub: `${'b'.repeat(16)}deadbeef` } },
    }),
    // A verified credit with a payment waiting for a server no longer listed, whose every shorter ending another listed
    // server shares: Continue must never open that other server.
    'return-received-orphan': only({
      subs: { data: { subs: [{ ...SUBS[1]!, id: `b${'a'.repeat(15)}deadbeef`, server_name: 'other-1' }], partial: null } },
      return: { data: { state: 'received' } },
      resume: { data: { kind: 'pay', sub: `${'a'.repeat(16)}deadbeef` } },
    }),
    // The same, with a listed id one character longer that ends with the whole missing id: the whole id in
    // the link names only the subscription it is, never one it is the ending of.
    'return-received-orphan-long': only({
      subs: { data: { subs: [{ ...SUBS[1]!, id: `b${'a'.repeat(16)}deadbeef`, server_name: 'other-1' }], partial: null } },
      return: { data: { state: 'received' } },
      resume: { data: { kind: 'pay', sub: `${'a'.repeat(16)}deadbeef` } },
    }),
    'held-clash-gone': only({ subs: { data: { subs: clashSubs().slice(1), partial: null } } }),
    'held-3': only({ subs: { data: { subs: heldSubs(3), partial: null } } }),
    'held-4': only({ subs: { data: { subs: heldSubs(4), partial: null } } }),
    'held-5': only({ subs: { data: { subs: heldSubs(5), partial: null } } }),
    // A held server that can be started again (no delete date, no change running): its action is Retry.
    retry: only({ subs: { data: { subs: [SUBS[0]!, { ...SUBS[1]!, delete_at: null }, ...SUBS.slice(2)], partial: null } } }),
    'usage-forbidden': only({ usage: { error: 'forbidden' } }),
    'usage-throttled': only({ usage: { error: 'bad_request' } }),
    banned: only({ identity: { data: { banned: true } } }),
    // Plus at ×2 and Pro at ×5, with a catalogue description the plans
    // view does not show.
    'plans-live': only({
      plans: {
        data: [
          plan('plan-live-plus', 'fam-plus', 'Plus', 1000, { cpu: 3, ram: 6, disk: 75, computers: 12, mult: 2, tier: 'plus', sort: 1, max_proxy_aliases: 50, max_bot_urls: 25, res: { disk_io_read_mib: 400, disk_io_write_mib: 400, network_limit_mbps: 50, snapshots_per_computer: 25 }, text: { type_label: 'Standard', description: '3 vCPU, 6 GB RAM and 75 GB disk for your containers, billed monthly.' } }),
          plan('plan-live-pro', 'fam-pro', 'Pro', 2500, { cpu: 6, ram: 16, disk: 200, computers: 30, mult: 5, tier: 'pro', sort: 2, max_proxy_aliases: 250, max_bot_urls: 250, res: { disk_io_read_mib: 800, disk_io_write_mib: 800, network_limit_mbps: 200, snapshots_per_computer: 100 }, text: { type_label: 'Standard', description: '6 vCPU, 16 GB RAM and 200 GB disk for your containers, billed monthly.' } }),
        ],
      },
    }),
    // Plans: the ?sub= server's states and the catalogue's, one at a time.
    'plans-subs-pending': only({ subs: { pending: true } }),
    'plans-subs-error': only({ subs: { error: 'server' } }),
    'plans-sub-held': only({ subs: { data: { subs: [{ ...SUBS[0]!, state: 'held', delete_at: iso(6) }, ...SUBS.slice(1)], partial: null } } }),
    // n12's own record says $10 while its catalogue version is $12: the columns use the catalogue's.
    'plans-own-terms': only({ subs: { data: { subs: [{ ...SUBS[0]!, plan: { ...terms(PLUS), price_cents_per_month: 1000 } }, ...SUBS.slice(1)], partial: null } } }),
    // n12's version is no longer on sale (its own record still has a price): no monthly difference is said.
    'plans-own-gone': only({ subs: { data: { subs: [{ ...SUBS[0]!, plan_id: 'plan-plus-v1' }, ...SUBS.slice(1)], partial: null } } }),
    // "Plans for" with long server names (hostLabel keeps 80 characters): still a radio group at 390 px, wrapped in place.
    'plans-long-names': only({
      subs: {
        data: {
          subs: [
            { ...SUBS[0]!, server_name: 'production-web-frontend-singapore-primary-cluster-node-with-a-very-long-name-01' },
            SUBS[1]!,
            { ...SUBS[2]!, server_name: 'Singapore Medium build and staging server for the whole data team, second one' },
            SUBS[3]!,
          ],
          partial: null,
        },
      },
    }),
    // twin-1 and twin-2 share an id ending; -gone: twin-1 has left the list and twin-2 is still there.
    'plans-sub-twins': only({ subs: { data: { subs: twinSubs(), partial: null } } }),
    // twin-2's AI usage row: its Upgrade opens twin-2's upgrade by its whole id.
    'usage-twins': only({
      subs: { data: { subs: twinSubs().map((x) => (x.server_id === 'srv-twin-2' ? { ...x, server_id: TWIN2_SRV } : x)), partial: null } },
      usage: { data: { servers: [{ ...usage.servers![0]!, server: { id: TWIN2_SRV, name: 'twin-2' } }], truncated: false } },
    }),
    // A server already on the biggest plan (Large): no bigger plan, no suggestion, the market open, so its AI usage
    // action is the bare-metal one ("Get more AI", named for bare metal).
    'usage-bare-next': only({
      subs: { data: { subs: [...SUBS, BIG_SUB], partial: null } },
      usage: { data: { servers: [...usage.servers!, BIG_USAGE], truncated: false } },
    }),
    'plans-sub-twins-gone': only({ subs: { data: { subs: twinSubs().slice(1), partial: null } } }),
    // Two versions of one family on sale: the checkout's lookup by family finds the first, Medium.
    'plans-two-versions': only({
      plans: {
        data: [...PLANS, plan('plan-pro-v3', 'fam-pro', 'Medium Plus', 3900, { cpu: 6, ram: 12, disk: 200, computers: 10, mult: 12, tier: 'pro', sort: 2 })],
      },
    }),
    // An entry whose family is Large's version id, listed first: Large's id names two
    // entries, so its column has no Get; a link that names plan-max-v1 still opens Large.
    'plans-handle-collision': only({
      plans: {
        data: [plan('plan-odd', 'plan-max-v1', 'Odd', 9900, { cpu: 12, ram: 24, disk: 400, computers: 20, mult: 20, tier: 'pro', sort: 4 }), ...PLANS],
      },
    }),
    // Large's version has left the catalogue and an entry of family plan-max-v1 has come:
    // a column's exact link to plan-max-v1 finds the plan gone.
    'plans-version-replaced': only({
      plans: {
        data: [plan('plan-odd', 'plan-max-v1', 'Odd', 9900, { cpu: 12, ram: 24, disk: 400, computers: 20, mult: 20, tier: 'pro', sort: 4 }), ...PLANS.filter((p) => p.id !== 'plan-max-v1')],
      },
    }),
    // An entry no column shows (price 0) whose family is n12's version id: the catalogue
    // reads plan-plus-v2 two ways, so no column says n12 is on it and no monthly difference is said.
    // Singapore M is still on Medium's retired version plan-pro-v1 (same family as the plan-pro-v2 column): the column's
    // "N of your servers" counts the version, so only fra-7 counts there.
    'plans-sub-retired': only({ subs: { data: { subs: SUBS.map((x, i) => (i === 2 ? { ...x, plan_id: 'plan-pro-v1' } : x)), partial: null } } }),
    'plans-own-hidden-family': only({
      plans: {
        data: [plan('plan-zero', 'plan-plus-v2', 'Zero', 0, { cpu: 1, ram: 1, disk: 10, computers: 1, mult: 1, tier: 'plus', sort: 0 }), ...PLANS],
      },
    }),
    'plans-none': only({ plans: { data: [] } }),
    'plans-read-error': only({ plans: { error: 'server' } }),
    'plans-pending': only({ plans: { pending: true } }),
    'wallet-pending': only({ balance: { pending: true } }),
    // Referral credit: the card lines, and the Checkout's "can I pay" = general + Referral credit.
    'wallet-referral': only({ balance: { data: { ...balance, referral: '12.40' } } }),
    'wallet-referral-owed': only({ balance: { data: { ...balance, referral: '12.40', owed: '3.00' } } }),
    'wallet-owed': only({ balance: { data: { ...balance, referral: '0.00', owed: '3.00' } } }),
    // Seven-figure amounts on every wallet line: nothing may be cut at phone width.
    'wallet-long-amounts': only({ balance: { data: { general: '1234567.89', referral: '123456.40', owed: '98765.00' } } }),
    // Each also carries the quote the live drawer computes from that balance, for hub:dev and shots (the live tests
    // compute it: checkout-referral.test.tsx).
    'checkout-referral-covers': only({ balance: { data: { general: '5.00', referral: '10.00', owed: '0.00' } }, 'quote.buy': { data: q({ chargeCents: 1200, balanceCents: 1500, lines: [quoteBuy.lines[0]!, quoteBuy.lines[1]!, { label: 'buy.wallet', cents: 500 }, { label: 'buy.referral', cents: 1000 }], notes: quoteBuy.notes }) } }),
    'checkout-referral-partial': only({ balance: { data: { general: '5.00', referral: '4.00', owed: '0.00' } }, 'quote.buy': { data: q({ chargeCents: 1200, balanceCents: 900, lines: [quoteBuy.lines[0]!, quoteBuy.lines[1]!, { label: 'buy.wallet', cents: 500 }, { label: 'buy.referral', cents: 400 }], notes: quoteBuy.notes }) } }),
    // The select keeps only D.CC amounts: a malformed Referral credit reaches the page as null and counts 0.
    'checkout-referral-malformed': only({ balance: { data: { general: '5.00', referral: null, owed: null } }, 'quote.buy': { data: q({ chargeCents: 1200, balanceCents: 500, lines: [quoteBuy.lines[0]!, quoteBuy.lines[1]!, { label: 'buy.wallet', cents: 500 }], notes: quoteBuy.notes }) } }),
    // An unreadable general balance stays unknown whatever Referral credit says: Confirm stays blocked.
    'checkout-referral-nogeneral': only({ balance: { data: { general: '', referral: '10.00', owed: '0.00' } }, 'quote.buy': { data: q({ chargeCents: 1200, balanceCents: null, lines: [quoteBuy.lines[0]!, quoteBuy.lines[1]!], notes: quoteBuy.notes }) } }),
    'checkout-referral-split': only({ balance: { data: { general: '10.00', referral: '5.00', owed: '0.00' } }, 'quote.buy': { data: q({ chargeCents: 1200, balanceCents: 1500, lines: [quoteBuy.lines[0]!, quoteBuy.lines[1]!, { label: 'buy.wallet', cents: 1000 }, { label: 'buy.referral', cents: 500 }], notes: quoteBuy.notes }) } }),
    // Rental 90.00 + setup 20.00 = 110.00 against 60.00 + 40.00: short by 10.00 (setup is charged and counted).
    'checkout-baremetal-setup': only({
      balance: { data: { general: '60.00', referral: '40.00', owed: '0.00' } },
      // Fixture-mode rent and reserve take the rental and setup from `prices` and the wallet lines from the quote template
      // (the live drawer: walletLine over spendOf).
      prices: { data: { ...listingPrices, 'reserve:mkt_sin_m': { ...listingPrices['reserve:mkt_sin_m'], '30': [9000, 2000] } } },
      'quote.reserve': { data: q({ ...quoteReserve, balanceCents: 10000, lines: [...quoteReserve.lines.slice(0, 3), { label: 'buy.wallet', cents: 6000 }, { label: 'buy.referral', cents: 4000 }] }) },
    }),
    // the Home widget
    'widget-balance-error': only({ balance: { error: 'server' } }),
    'widget-subs-error': only({ subs: { error: 'server' } }),
    long: only({
      subs: {
        data: {
          subs: [
            {
              ...SUBS[0]!,
              server_name: 'production-eu-central-primary-database-and-api-gateway-node-01',
              plan: {
                ...terms(PLUS),
                title: 'Plus with a very long plan title that must be cut with an ellipsis',
              },
            },
            ...SUBS.slice(1),
          ],
          partial: null,
        },
      },
    }),
    many26: only({
      subs: {
        data: {
          subs: Array.from({ length: 24 }, (_, i) => ({
            ...SUBS[i % 3]!,
            id: `a1b2c3d4e5f60718293a${(i + 10).toString(16).padStart(4, '0')}`,
            server_name: `node-${i + 1}`,
          })),
          partial: null,
        },
      },
    }),
    // bonus
    'bonus-claimed': only({
      bonus: {
        data: { claimed: true, claim: { amount_usd: '10.00', at: iso(-12) } },
      },
    }),
    'bonus-elsewhere': only({
      bonus: {
        data: {
          enabled: true,
          identity_claimed_elsewhere: true,
          github_username: 'octocat',
        },
      },
    }),
    'bonus-none': only({ bonus: { data: null } }),
    'bonus-loading': only({ bonus: { pending: true } }),
    'bonus-read-error': only({ bonus: { error: 'server' } }),
    'bonus-retry': only({
      claimBonus: { outcome: 'done', data: { result: 'retry' } },
    }),
    'bonus-rate': only({
      claimBonus: { outcome: 'done', data: { result: 'rate_limited' } },
    }),
    'bonus-unknown': only({ claimBonus: { outcome: 'pending' } }),
    // payment return
    ...Object.fromEntries(Object.entries(retStates).map(([name, st]) => [name, only({ return: { data: st } })])),
    'return-checking': only({ return: { pending: true } }),
    // add funds
    'topup-none': only({ availability: { data: { methods: [] } } }),
    'topup-error': only({ availability: { error: 'server' } }),
    'topup-unknown': only({ topup: { outcome: 'pending' } }),
    'topup-failed': only({
      topup: { outcome: 'failed', code: 'PAYMENT_VELOCITY_LIMIT_EXCEEDED' },
    }),
    'topup-badurl': only({
      topup: { outcome: 'done', data: { url: 'https://evil.example/pay' } },
    }),
    // auto-renew
    'renew-unknown': only({ autoRenew: { outcome: 'pending' } }),
    'renew-failed': only({
      autoRenew: { outcome: 'failed', code: 'FORBIDDEN' },
    }),
    // checkout: review states
    'wallet-short': only({
      balance: { data: { ...balance, general: '8.80' } },
      'quote.buy': {
        data: q({
          chargeCents: 1200,
          balanceCents: 880,
          lines: walletAt(quoteBuy.lines, 880),
          notes: quoteBuy.notes,
        }),
      },
      'quote.pay': {
        data: q({
          chargeCents: 2900,
          balanceCents: 880,
          lines: walletAt(quotePay.lines, 880),
          notes: quotePay.notes,
        }),
      },
      'quote.upgrade': {
        data: q({
          chargeCents: 1710,
          balanceCents: 880,
          lines: walletAt(quoteUpgrade.lines, 880),
          notes: quoteUpgrade.notes,
          warnings: quoteUpgrade.warnings,
        }),
      },
      'quote.rent': {
        data: q({
          chargeCents: 3900,
          balanceCents: 880,
          lines: walletAt(quoteRent.lines, 880),
          notes: quoteRent.notes,
        }),
      },
    }),
    'balance-unreadable': only({
      'quote.buy': {
        data: q({
          chargeCents: 1200,
          balanceCents: null,
          lines: quoteBuy.lines.slice(0, 2),
          notes: quoteBuy.notes,
        }),
      },
    }),
    'quote-loading': only({
      'quote.buy': { pending: true },
      'quote.pay': { pending: true },
      'quote.upgrade': { pending: true },
      'quote.rent': { pending: true },
      'quote.reserve': { pending: true },
    }),
    'quote-error': only({
      'quote.buy': { error: 'server' },
      'quote.pay': { error: 'server' },
      'quote.upgrade': { error: 'server' },
      'quote.rent': { error: 'server' },
      'quote.reserve': { error: 'server' },
    }),
    'quote-banned': only({
      'quote.buy': { error: 'forbidden' },
      'quote.rent': { error: 'forbidden' },
      'quote.reserve': { error: 'forbidden' },
    }),
    'quote-limit': only({
      'quote.buy': {
        data: q({
          chargeCents: 1200,
          lines: quoteBuy.lines,
          blocked: { k: 'buy.limit', v: { max: 3 } },
        }),
      },
    }),
    // A live buy quote always carries co.newServer (checkout-live.ts), so this one does too: the What you get plate draws.
    'quote-noroom': only({
      'quote.buy': {
        data: q({
          chargeCents: 1200,
          lines: quoteBuy.lines,
          notes: quoteBuy.notes,
          blocked: { k: 'buy.noRoom' },
        }),
      },
    }),
    // Blocked and short at once: the blocked Band and the shortfall with Add funds; the footer repeats neither.
    'quote-noroom-short': only({
      'quote.buy': {
        data: q({
          chargeCents: 1200,
          balanceCents: 880,
          lines: [...quoteBuy.lines.slice(0, 2), { label: 'buy.wallet', cents: 880 }],
          notes: quoteBuy.notes,
          blocked: { k: 'buy.noRoom' },
        }),
      },
    }),
    // checkout: sends
    'send-slow': only({
      confirm: { outcome: 'done', data: done.data, delayMs: 60_000 },
    }),
    'send-done': base,
    'send-already': only({
      confirm: {
        outcome: 'done',
        data: { chargedCents: 1200, at: iso(-1), replayed: true },
      },
    }),
    'send-setup-failed': only({
      confirm: {
        outcome: 'done',
        data: {
          chargedCents: 1200,
          at: iso(0),
          setupFailed: true,
          ref: 'sub_7Xk29Qa81f03',
        },
      },
    }),
    'send-setup-failed-noref': only({
      confirm: { outcome: 'done', data: { chargedCents: 1200, at: iso(0), setupFailed: true } },
    }),
    'send-setup-failed-noamount': only({
      confirm: { outcome: 'done', data: { chargedCents: null, at: iso(0), setupFailed: true, ref: 'sub_7Xk29Qa81f03' } },
    }),
    'send-unknown': only({
      confirm: { outcome: 'pending' },
      check: { outcome: 'pending' },
    }),
    'send-unknown-resolves': only({
      confirm: { outcome: 'pending' },
      check: {
        outcome: 'done',
        data: { chargedCents: 1200, at: iso(0), replayed: true },
      },
    }),
    'send-unknown-notfound': only({
      confirm: { outcome: 'pending' },
      check: { outcome: 'failed', code: 'NOT_FOUND' },
    }),
    'send-unknown-failed': only({
      confirm: { outcome: 'pending' },
      check: {
        outcome: 'failed',
        code: 'REFUSED',
        data: { ref: 'op_9Fq0Lm33zz71' },
      },
    }),
    'send-notsent': only({ confirm: { outcome: 'not_sent' } }),
    'send-failed': SEND_FAIL('SOMETHING_ELSE', { ref: 'op_9Fq0Lm33zz71' }),
    'send-funds': SEND_FAIL('INSUFFICIENT_BALANCE', { balanceCents: 880 }),
    'send-requote': SEND_FAIL('CHARGE_EXCEEDS_MAX', { totalCents: 1400 }),
    'send-gone': SEND_FAIL('PLAN_NOT_AVAILABLE'),
    'send-limit': SEND_FAIL('PAID_SUBSERVER_LIMIT_REACHED'),
    'send-capacity': SEND_FAIL('NO_PAID_CAPACITY'),
    // The chosen location filled between the quote and the purchase: nothing charged, back to the review and its picker.
    'send-region-full': SEND_FAIL('NO_PAID_CAPACITY_IN_REGION'),
    'send-region-unknown': SEND_FAIL('PAID_REGION_UNKNOWN'),
    // the locations list
    'regions-loading': only({ regions: { pending: true } }),
    'regions-error': only({ regions: { error: 'server' } }),
    'regions-all-full': only({ regions: { data: REGIONS.map((r) => ({ ...r, available: false })) } }),
    'regions-none': only({ regions: { data: [] } }),
    'send-rate': SEND_FAIL('RATE_LIMITED'),
    'send-permission': SEND_FAIL('FORBIDDEN'),
    'send-justtaken': SEND_FAIL('SERVER_UNAVAILABLE'),
    'send-outofstock': SEND_FAIL('OUT_OF_STOCK'),
    'send-notupgrade': SEND_FAIL('PLAN_CHANGE_NOT_UPGRADE'),
  }, 'many'),
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts).
 *  The page's fixture stand-ins for core's held records (data.ts: unknown checkouts, the held top-up) are this
 *  session's too: a shot never shows an earlier shot's hold (held-session.term.test.tsx). */
export function resetFixtureServer(): void {
  resetServers();
  resetUnknownCheckouts();
}
