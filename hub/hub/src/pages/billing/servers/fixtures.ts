// Fake-API states of the Bare metal view for hub:dev, hub:shots, tests and specs; billing/fixtures.ts merges them into
// Billing's states (`servers-<state>`). Listings, balance and account are keyed answers; reservations are core rules
// (`rules`), answered by offset like the API.
import { defineFixtures } from '@app/fixtures';
import { answers, commerce, reply, type FixtureAnswer, type FixtureRule, type commerceRules } from '@core';
import { diskTypesOf, type Listing, type Reservation, type Term } from './logic';

const NOW = Date.now();
const HOUR = 3600000;
const DAY = 24 * HOUR;

const term = (days: number, priceCents: number, feeCents: number | null = null, holdDays: number | null = null): Term => ({
  days,
  priceCents,
  feeCents,
  totalCents: priceCents + (feeCents ?? 0),
  holdDays,
});

const base: Listing = {
  id: 'x',
  kind: 'stock',
  name: '',
  country: 'DE',
  city: 'Falkenstein',
  datacenter: 'Example DC 1',
  cpu: 'AMD Ryzen 9 5950X',
  featured: false,
  stockLeft: 4,
  deliveryHours: 0,
  setupMinutes: 15,
  cores: 16,
  threads: 32,
  ramGb: 128,
  ramType: 'DDR4 ECC',
  diskGb: 1000,
  diskSummary: '2 x 512 GB NVMe',
  diskTypes: ['NVMe'],
  disks: [{ count: 2, gb: 512, type: 'NVMe', iface: 'PCIe', model: 'Samsung PM9A1' }],
  ramMhz: 3200,
  region: 'Saxony',
  ipv6: true,
  isVm: false,
  category: 'general',
  bandwidthMbps: 1000,
  trafficTb: null,
  trafficUnlimited: true,
  ipv4: 1,
  cpuScore: 46000,
  cpuScoreType: 'geekbench_multi',
  terms: [term(30, 6900), term(90, 18900), term(365, 69000)],
};

/** The disk groups a summary like "2 x 1.92 TB NVMe" names (a TB is 1024 GB here); none when it does not parse. */
function groupsOf(summary: string): commerceRules.MarketDisk[] {
  const m = /^(?:(\d+) x )?([\d.]+) (GB|TB) (\w+)$/.exec(summary);
  if (!m) return [];
  const size = Number(m[2]) * (m[3] === 'TB' ? 1024 : 1);
  return [{ count: m[1] ? Number(m[1]) : 1, gb: Math.round(size), type: m[4] ?? null, iface: null, model: null }];
}

// A listing's disk kinds and groups follow its summary unless it names its own. An offer row carries no RAM type,
// RAM speed, IPv6, machine kind or category (the offers rail has none of those fields).
const l = (o: Partial<Listing>): Listing => {
  const summary = o.diskSummary ?? base.diskSummary;
  const offer = o.kind === 'offer' ? { ramType: '', ramMhz: null, region: '', ipv6: null, isVm: null, category: null, diskSummary: '' } : {};
  return { ...base, disks: groupsOf(summary), ...offer, ...o, diskTypes: o.diskTypes ?? diskTypesOf([], summary) };
};

export const listings: Listing[] = [
  l({ id: 'l01', name: 'Frankfurt L', disks: [{ count: 2, gb: 512, type: 'NVMe', iface: 'PCIe', model: 'Samsung PM9A1' }], featured: true, stockLeft: 2, terms: [term(30, 6900, null, 3), term(90, 18900, null, 7), term(365, 69000, null, 7)] }),
  l({ id: 'l02', name: 'Frankfurt M', cores: 8, threads: 16, ramGb: 64, diskGb: 512, diskSummary: '512 GB NVMe', cpu: 'AMD Ryzen 7 3700X', cpuScore: 24000, stockLeft: 9, terms: [term(30, 3900), term(90, 10500), term(365, 38000)] }),
  l({ id: 'l03', name: 'Tokyo L', country: 'JP', city: 'Tokyo', datacenter: 'Example DC 2', cpu: 'AMD EPYC 7502P', cores: 32, threads: 64, ramGb: 256, ramType: 'DDR4 ECC', ramMhz: 2933, diskGb: 20224, diskSummary: '2 x 1.92 TB NVMe + 2 x 8 TB HDD', disks: [{ count: 2, gb: 1966, type: 'NVMe', iface: 'PCIe', model: null }, { count: 2, gb: 8192, type: 'HDD', iface: 'SATA', model: 'Toshiba MG08' }], isVm: null, category: 'storage', ipv6: false, cpuScore: 56000, stockLeft: 1, deliveryHours: 0, terms: [term(30, 17900, 4900), term(90, 49900)] }),
  l({ id: 'l04', name: 'Singapore M', country: 'SG', city: 'Singapore', datacenter: 'Example DC 3', cpu: 'Intel Xeon E-2288G', cores: 8, threads: 16, ramGb: 64, diskGb: 960, diskSummary: '2 x 480 GB SSD', cpuScore: 21000, cpuScoreType: 'passmark', bandwidthMbps: 500, trafficUnlimited: false, trafficTb: 20, deliveryHours: 2, terms: [term(30, 8900, null, 0), term(90, 24900, null, 0)] }),
  l({ id: 'l05', name: 'Ashburn M', country: 'US', city: 'Ashburn', datacenter: 'Example DC 4', cpu: 'Intel Xeon Gold 6226R', cores: 12, threads: 24, ramGb: 96, diskGb: 1000, diskSummary: '1 TB NVMe', disks: [{ count: 1, gb: 1000, type: null, iface: null, model: null }], cpuScore: 29000, terms: [term(30, 7900), term(90, 21900), term(180, 41900)] }),
  l({ id: 'l06', name: 'Singapore S', country: 'SG', city: 'Singapore', datacenter: 'Example DC 5', cpu: 'Intel Core i5-13500', cores: 4, threads: 8, ramGb: 32, diskGb: 500, diskSummary: '500 GB NVMe', cpuScore: 17000, stockLeft: 12, terms: [term(30, 3000), term(90, 7900)] }),
  l({ id: 'l07', ramType: 'DDR5', name: 'Tokyo M', country: 'JP', city: 'Tokyo', datacenter: 'Example DC 6', cpu: 'AMD Ryzen 9 7950X', cores: 16, threads: 32, ramGb: 128, diskGb: 2000, diskSummary: '2 x 1 TB NVMe', cpuScore: 62000, stockLeft: 3, terms: [term(30, 11900), term(90, 32900), term(365, 119000)] }),
  l({ id: 'l08', name: 'Frankfurt S', cpu: 'AMD Ryzen 7 5700X', cores: 8, threads: 16, ramGb: 64, diskGb: 1000, diskSummary: '2 x 500 GB NVMe', cpuScore: 25000, stockLeft: 6, terms: [term(30, 3400), term(90, 9400)] }),
  l({ id: 'o01', kind: 'offer', cpuScoreType: null, name: 'Frankfurt XL', city: 'Frankfurt', datacenter: 'Example DC 7', cpu: 'AMD EPYC 7443P', cores: 24, threads: 48, ramGb: 256, diskGb: 3840, diskSummary: '2 x 1.92 TB NVMe', disks: [{ count: 2, gb: 1966, type: 'NVMe', iface: 'PCIe', model: 'Micron 7450' }], cpuScore: null, stockLeft: null, deliveryHours: 72, setupMinutes: 30, terms: [term(30, 14900, 2900, 14), term(90, 41900, null, 14)] }),
  l({ id: 'o02', kind: 'offer', cpuScoreType: null, name: 'Ashburn XL', country: 'US', city: 'Ashburn', datacenter: 'Example DC 8', cpu: 'AMD EPYC 9354P', cores: 32, threads: 64, ramGb: 512, diskGb: 7680, diskSummary: '4 x 1.92 TB NVMe', cpuScore: null, stockLeft: null, deliveryHours: 120, setupMinutes: null, terms: [term(30, 29900, 5900), term(90, 84900)] }),
  l({ id: 'o03', kind: 'offer', cpuScoreType: null, name: 'Singapore XL', country: 'SG', city: 'Singapore', datacenter: 'Example DC 9', cpu: 'Intel Xeon E-2386G', cores: 6, threads: 12, ramGb: 64, diskGb: 1000, diskSummary: '1 TB NVMe', cpuScore: null, stockLeft: null, deliveryHours: 48, terms: [term(30, 6400, 1900)] }),
  l({ id: 'u01', name: 'Ashburn S', country: 'US', city: 'Ashburn', datacenter: 'Example DC 10', terms: [], stockLeft: 0, cores: 2, threads: 4, ramGb: 4, diskGb: 80, diskSummary: '80 GB SSD', cpu: 'Intel Xeon E-2124', cpuScore: 8000, deliveryHours: null }),
];

const reservation = (o: Partial<Reservation> & { id: string }): Reservation => ({
  name: 'Frankfurt XL',
  state: 'pending',
  days: 30,
  paidCents: 17800,
  cores: 24,
  ramGb: 256,
  diskGb: 3840,
  readyBy: NOW + 3 * DAY,
  createdAt: NOW - 2 * DAY,
  quoted: { deliveryHours: 72, setupMinutes: 30, holdDays: 14, rentalCents: 14900, setupFeeCents: 2900 },
  serverId: null,
  rentalId: null,
  ...o,
});

export const reservations: Reservation[] = [
  // Quoted when paid, before the offer's terms changed (the offer now holds 14 days, a $29 setup fee).
  reservation({ id: 'r01', name: 'Frankfurt XL', quoted: { deliveryHours: 72, setupMinutes: 30, holdDays: 10, rentalCents: 15300, setupFeeCents: 2500 } }),
  reservation({ id: 'r02', name: 'Ashburn XL', days: 90, paidCents: 84900, cores: 32, ramGb: 512, diskGb: 7680, readyBy: NOW - 2 * DAY, createdAt: NOW - 9 * DAY }),
  reservation({ id: 'r03', name: 'Singapore XL', state: 'fulfilled', serverId: '64b0c0ffee0000000000a003', rentalId: '64b0c0ffee0000000000b003', quoted: { deliveryHours: 48, setupMinutes: 20, holdDays: 0, rentalCents: 6900, setupFeeCents: 1400 }, paidCents: 8300, cores: 6, ramGb: 64, diskGb: 1000, readyBy: NOW - 5 * DAY, createdAt: NOW - 8 * DAY }),
  reservation({ id: 'r04', name: 'Frankfurt XL', state: 'refunded', days: 90, paidCents: 41900, readyBy: null, createdAt: NOW - 30 * DAY }),
  reservation({ id: 'r05', name: 'Tokyo L', state: 'fulfilled', quoted: { deliveryHours: null, setupMinutes: null, holdDays: null, rentalCents: null, setupFeeCents: null }, days: null, paidCents: null, cores: null, ramGb: null, diskGb: null, readyBy: null, createdAt: NOW - 60 * DAY }),
];

/** A reservation as GET /reservations answers it (its offer snapshot in the offer rail's raw fields). */
function rawReservation(r: Reservation): Record<string, unknown> {
  const snap: Record<string, unknown> = { name: r.name };
  if (r.cores !== null) snap.cpu_cores = r.cores;
  if (r.ramGb !== null) snap.ram_gb = r.ramGb;
  if (r.diskGb !== null) snap.disks = [{ capacity_gb: r.diskGb, count: 1 }];
  return {
    id: r.id,
    state: r.state,
    days: r.days,
    // Money only when it is known: a caller without the billing right gets none of these fields.
    ...(r.paidCents === null ? {} : { total_paid_cents: r.paidCents }),
    ...(r.quoted.deliveryHours === null ? {} : { delivery_hours_quoted: r.quoted.deliveryHours }),
    ...(r.quoted.setupMinutes === null ? {} : { setup_time_minutes_quoted: r.quoted.setupMinutes }),
    ...(r.quoted.holdDays === null ? {} : { hold_days_quoted: r.quoted.holdDays }),
    ...(r.quoted.rentalCents === null ? {} : { rental_cents: r.quoted.rentalCents }),
    ...(r.quoted.setupFeeCents === null ? {} : { setup_fee_cents: r.quoted.setupFeeCents }),
    server_id: r.serverId,
    rental_id: r.rentalId,
    ready_by: r.readyBy === null ? null : new Date(r.readyBy).toISOString(),
    created_at: new Date(r.createdAt).toISOString(),
    offer_snapshot: snap,
  };
}

/** The page-0 reservations reads a `heads` state answered since a test reset it. */
export const resHeads = { n: 0 };

/** More reservations than one read (200) holds, for Load more. */
export const manyReservations: Reservation[] = Array.from({ length: 450 }, (_, i) =>
  reservation({ id: `m${String(i + 1).padStart(3, '0')}`, name: `Server ${i + 1}`, state: i % 3 === 0 ? 'fulfilled' : 'pending', readyBy: NOW + (i + 1) * HOUR }),
);

/**
 * GET /reservations over these rows, one page per limit and offset, and GET /reservations/:id (core polls pending
 * rows by id). `answer` answers every list read; `later` answers the reads from offset `laterFrom` (default: every
 * read after the first page), `laterTimes` times (then they answer normally); `laterDelayMs` slows the answers after
 * the first page; `headDelayMs` slows every page-0 read after the first (core's poll cycles); `reads` records the
 * offset of every list read; `heads` answers the page-0 reads in turn (counted in `resHeads`, which a test using it
 * resets first), then they answer normally; `byId` answers every GET /reservations/:id (core's poll of a pending row).
 */
function reservationRules(
  rows: readonly Reservation[],
  o: { answer?: FixtureAnswer; later?: FixtureAnswer; laterFrom?: number; laterTimes?: number; laterDelayMs?: number; headDelayMs?: number; reads?: number[]; heads?: readonly FixtureAnswer[]; byId?: FixtureAnswer } = {},
): FixtureRule[] {
  let laterLeft = o.laterTimes ?? Infinity;
  let heads = 0;
  const { reservationsRoute, reservationRoute } = commerce.commerceRoutes;
  return [
    reply(reservationsRoute, (req) => {
      if (o.answer) return o.answer;
      const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
      o.reads?.push(offset);
      if (o.heads && offset === 0) {
        const head = o.heads[resHeads.n++];
        if (head) return head;
      }
      if (o.later && offset >= (o.laterFrom ?? 1) && laterLeft > 0) {
        laterLeft--;
        return o.later;
      }
      const limit = Math.max(1, Number(req.query.limit ?? 200) || 200);
      const delay = offset > 0 ? o.laterDelayMs : heads++ > 0 ? o.headDelayMs : undefined;
      return answers.ok({ statusCode: 200, data: rows.slice(offset, offset + limit).map(rawReservation), total: rows.length }, delay);
    }),
    reply(reservationRoute, (req) => {
      if (o.byId) return o.byId;
      const r = rows.find((x) => req.path.endsWith(`/${x.id}`));
      return r ? answers.ok({ statusCode: 200, data: rawReservation(r) }) : answers.refused(404, 'NOT_FOUND');
    }),
  ];
}

const account = { data: { banned: false } };
const balance = { data: { general: 25000, referral: 0, cents: 25000 } };
const stockRows = listings.filter((x) => x.kind === 'stock');
const offerRows = listings.filter((x) => x.kind === 'offer');
// More listings than one page (50) holds, for the pager and reload tests.
const longStock = [...stockRows, ...Array.from({ length: 60 }, (_, i) => ({ ...stockRows[i % stockRows.length]!, id: `x${String(i + 1).padStart(2, '0')}`, name: `${stockRows[i % stockRows.length]!.name} ${Math.floor(i / stockRows.length) + 2}` }))];
const rails = { stock: { data: stockRows }, offers: { data: offerRows } };
const same = { account, balance, rules: reservationRules(reservations), ...rails };
/** The offsets the 'res-more-slow' and 'res-poll-slow' states were read at (a test empties them first). */
export const slowReads: number[] = [];
export const pollReads: number[] = [];

export default defineFixtures({
  default: 'many',
  states: {
    many: { ...same },
    long: { ...same, stock: { data: longStock } },
    loading: { ...same, stock: { pending: true }, offers: { pending: true } },
    'one-failed': { ...same, offers: { error: 'server' } },
    'both-failed': { ...same, stock: { error: 'server' }, offers: { error: 'server' } },
    empty: { ...same, stock: { data: [] }, offers: { data: [] } },
    banned: { ...same, account: { data: { banned: true } } },
    'balance-loading': { ...same, balance: { pending: true } },
    'balance-failed': { ...same, balance: { error: 'network' } },
    'balance-short': { ...same, balance: { data: { general: 1500, referral: 0, cents: 1500 } } },
    // Referral credit: what the footer compares is general + Referral credit, against the
    // term's total first payment, setup included (l03 30 days: 179 + 49 setup = 228).
    'referral-covers': { ...same, balance: { data: { general: 14000, referral: 10000, cents: 24000 } } },
    'referral-partial': { ...same, balance: { data: { general: 14000, referral: 8000, cents: 22000 } } },
    'res-loading': { ...same, rules: reservationRules([], { answer: answers.slow({ data: [] }, 600_000) }) },
    'res-empty': { ...same, rules: reservationRules([]) },
    'res-error': { ...same, rules: reservationRules([], { answer: answers.pending5xx(503) }) },
    /** The reservations read refused as suspended (403 ACCOUNT_BANNED) while the account read still says not banned. */
    'res-banned': { ...same, rules: reservationRules([], { answer: answers.refused(403, 'ACCOUNT_BANNED') }) },
    /** 450 reservations; the first read after page one is refused as suspended (a Load more), then they answer. */
    'res-more-banned': { ...same, rules: reservationRules(manyReservations, { later: answers.refused(403, 'ACCOUNT_BANNED'), laterTimes: 1 }) },
    /** No reservations; the first read is refused as suspended, the next (a recheck, a return visit) never answers. */
    'res-banned-then-hang': { ...same, rules: reservationRules([], { heads: [answers.refused(403, 'ACCOUNT_BANNED'), answers.slow({ data: [] }, 600_000)] }) },
    /** No reservations; the first read is refused as suspended, then they answer. */
    'res-banned-once': { ...same, rules: reservationRules([], { heads: [answers.refused(403, 'ACCOUNT_BANNED')] }) },
    /** 450 reservations: the walk reads clean; core's poll of a pending row past page 0 (by id) is then refused as
     *  suspended. Rows on page 0 are never polled by id, so the rows must outrun one page. */
    'res-poll-banned': { ...same, rules: reservationRules(manyReservations, { byId: answers.refused(403, 'ACCOUNT_BANNED') }) },
    /** 450 reservations: more than the walk reads at once when a test lowers commerce.RES.maxAuto. */
    'res-many': { ...same, rules: reservationRules(manyReservations) },
    /** 450 reservations; the reads after page one answer after 6 s (wide enough for a second press under load). */
    'res-more-slow': { ...same, rules: reservationRules(manyReservations, { laterDelayMs: 6000, reads: slowReads }) },
    /** 450 reservations; the first read after page one fails, then they answer. */
    'res-more-fail': { ...same, rules: reservationRules(manyReservations, { later: answers.pending5xx(503), laterTimes: 1 }) },
    /** 450 reservations; a poll cycle's page-0 read answers after 12 s (under core's 20 s read bound, so the dev app still polls). */
    'res-poll-slow': { ...same, rules: reservationRules(manyReservations, { headDelayMs: 12000, reads: pollReads }) },
    /** 450 reservations; the first read at offset 400 fails, then they answer (a Load more reading two pages gets one). */
    'res-more-part': { ...same, rules: reservationRules(manyReservations, { later: answers.pending5xx(503), laterFrom: 400, laterTimes: 1 }) },
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resHeads.n = 0;
  slowReads.length = 0;
  pollReads.length = 0;
}
