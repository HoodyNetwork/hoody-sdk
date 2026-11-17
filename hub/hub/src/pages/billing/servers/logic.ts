// Pure rules of the Bare metal view: the listing view-model, term quotes, the range bounds and search words
// the view's filters use, delivery and money words, and the reservation view-model. Filtering and sorting
// are not here: View.tsx runs them through useDataView. No DOM, no network.

import type { commerceRules, listingRules } from '@core';

// ── Listings ────────────────────────────────────────────────────────────────────────────

export interface Term {
  /** The term in days, as the kit spells it. */
  days: number;
  priceCents: number | null;
  /** One-time setup fee; null when the total already includes it. */
  feeCents: number | null;
  /** What the first payment is. Authoritative. */
  totalCents: number;
  /** Days the server is held after the term, when the kit says so. */
  holdDays: number | null;
}

export interface Listing {
  /** Opaque listing id: used in URLs and links, never shown. */
  id: string;
  kind: 'stock' | 'offer';
  name: string;
  /** ISO 3166 alpha-2, upper case, or ''. */
  country: string;
  city: string;
  datacenter: string;
  cpu: string;
  featured: boolean;
  stockLeft: number | null;
  /** Hours until the server is delivered after payment; 0 is now. */
  deliveryHours: number | null;
  setupMinutes: number | null;
  cores: number | null;
  threads: number | null;
  ramGb: number | null;
  ramType: string;
  diskGb: number | null;
  diskSummary: string;
  /** The disk kinds the row names (HDD, SSD, NVMe, SAS), for the disk type filter; empty when it names none. */
  diskTypes: readonly DiskType[];
  /** Each group of identical disks the row lists (core's MarketRow disks), in its order; empty when it lists none. */
  disks: readonly commerceRules.MarketDisk[];
  /** RAM speed in MHz (stock rows only). */
  ramMhz: number | null;
  region: string;
  /** IPv6 on the machine: a stock row says yes or no; an offer row does not say (null). */
  ipv6: boolean | null;
  /** A virtual machine rather than a whole one, when the row says (stock rows only). */
  isVm: boolean | null;
  /** What the machine is built for (compute, memory, storage, general, gpu); null when the row does not say. */
  category: string | null;
  bandwidthMbps: number | null;
  trafficTb: number | null;
  trafficUnlimited: boolean;
  ipv4: number | null;
  cpuScore: number | null;
  /** What the score measures ('geekbench_multi', 'geekbench_single', 'passmark'), when the row says. */
  cpuScoreType: string | null;
  terms: Term[];
}

/**
 * The order summary's parts of one term. A stock row carries no setup fee of its own and may carry no rental:
 * each is derived from the total when the other is known, and neither is shown when neither is.
 */
export function splitTerm(term: Pick<Term, 'priceCents' | 'feeCents' | 'totalCents'>): { rental: number | null; setup: number | null } {
  const { priceCents: price, feeCents: fee, totalCents: total } = term;
  const setup = fee ?? (price !== null && total > price ? total - price : null);
  const rental = price ?? (fee !== null ? total - fee : null);
  return { rental, setup };
}

/** The cheapest first payment over the terms, or null when the listing cannot be priced. */
export function fromTerm(l: Pick<Listing, 'terms'>): Term | null {
  let best: Term | null = null;
  for (const t of l.terms) if (best === null || t.totalCents < best.totalCents) best = t;
  return best;
}

export const buyable = (l: Pick<Listing, 'terms'>): boolean => l.terms.length > 0;

/** The cheapest 30-day rental among the listings that can be bought (the setup fee is not the month's price). */
export function bareFromCents(listings: readonly Pick<Listing, 'terms'>[]): number | null {
  let best: number | null = null;
  for (const l of listings) {
    for (const t of l.terms) {
      if (t.days === 30 && t.priceCents !== null && t.priceCents > 0 && (best === null || t.priceCents < best)) best = t.priceCents;
    }
  }
  return best;
}

/**
 * The classic market's Featured order, the list's default: buyable before not for sale, in stock before
 * pre-orders, then the order the server listed them in (in stock: featured first, then popularity; pre-orders:
 * as listed). `list` is in that arrival order (in stock, then pre-orders); the sort is stable.
 */
export function featuredOrder<L extends Pick<Listing, 'kind' | 'terms'>>(list: readonly L[]): L[] {
  const rank = (l: L) => (buyable(l) ? 0 : 2) + (l.kind === 'stock' ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** The term for a day count, else the shortest one (the default pick). */
export function termFor(l: Pick<Listing, 'terms'>, days: string | undefined): Term | null {
  const n = days === undefined ? NaN : Number(days);
  const sorted = [...l.terms].sort((a, b) => a.days - b.days);
  return sorted.find((t) => t.days === n) ?? sorted[0] ?? null;
}

/** A listing as core's listing facts read it (listingRules.listingFacts): the same facts Billing's checkout shows. */
export function factsOf(l: Listing): listingRules.FactsInput {
  return {
    kind: l.kind, model: l.cpu || null, cores: l.cores, threads: l.threads, cpuScore: l.cpuScore, cpuScoreType: l.cpuScoreType,
    ramGb: l.ramGb, ramType: l.ramType || null, ramMhz: l.ramMhz, disks: [...l.disks], diskGb: l.diskGb, diskSummary: l.diskSummary || null,
    bandwidthMbps: l.bandwidthMbps, trafficTb: l.trafficTb, trafficUnlimited: l.trafficUnlimited, ipv4Count: l.ipv4, isVm: l.isVm,
    category: l.category, datacenter: l.datacenter || null, city: l.city || null, region: l.region || null, country: l.country || null,
    deliveryHours: l.deliveryHours, setupMinutes: l.setupMinutes, stockLeft: l.stockLeft,
  };
}

// ── Filters ─────────────────────────────────────────────────────────────────────────────
// Search, filters and sort come from useDataView in view.tsx; these are the values it offers.

export const CORES_RANGE = { min: 2, max: 64 } as const;
export const RAM_RANGE = { min: 8, max: 512 } as const;
export const DISK_RANGE = { min: 100, max: 8000 } as const;
export const PRICE_RANGE = { min: 0, max: 300 } as const;
export const BANDWIDTH_RANGE = { min: 100, max: 10000, step: 100 } as const;
export const TRAFFIC_RANGE = { min: 1, max: 100 } as const;

/** The disk kinds the API filters by (`disk_types` of GET /servers/available). */
export const DISK_TYPES = ['HDD', 'SSD', 'NVMe', 'SAS'] as const;
export type DiskType = (typeof DISK_TYPES)[number];

/**
 * The disk kinds of a raw row: each disk's own `type` (stock `specs.disks.config`, offer `disks`), matched to
 * DISK_TYPES whatever its case; with none named there, the words of the summary ("2 x 1 TB NVMe").
 */
export function diskTypesOf(disks: readonly unknown[], summary: string): DiskType[] {
  const found = new Set<DiskType>();
  const add = (word: string) => {
    const hit = DISK_TYPES.find((d) => d.toLowerCase() === word.toLowerCase());
    if (hit) found.add(hit);
  };
  for (const d of disks) if (d && typeof d === 'object' && typeof (d as { type?: unknown }).type === 'string') add((d as { type: string }).type);
  if (!found.size) for (const w of summary.split(/[^A-Za-z]+/)) add(w);
  return DISK_TYPES.filter((d) => found.has(d));
}

/** A RAM type as the filter keys it: one spelling whatever the row's case or spacing ("ddr4  ecc" = "DDR4 ECC"). */
export const ramTypeKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toUpperCase();

/** A disk type typed in any case, as DISK_TYPES spells it; anything else unchanged. */
export const diskTypeKey = (s: string): string => DISK_TYPES.find((d) => d.toLowerCase() === s.trim().toLowerCase()) ?? s;

/** A multi filter's URL value ("a,b") with each item in its key's spelling; undefined stays undefined. */
export const canonList = (v: string | undefined, key: (s: string) => string): string | undefined => (v === undefined ? v : v.split(',').map(key).join(','));

/** Traffic as one number for the range filter: unlimited reads as more than any allowance. */
export const trafficValue = (l: Pick<Listing, 'trafficTb' | 'trafficUnlimited'>): number | null => (l.trafficUnlimited ? Number.MAX_SAFE_INTEGER : l.trafficTb);

/** The cheapest first payment in dollars to the cent (the price filter's value), or null for a listing that cannot be
 *  priced. Never rounded: a $9.99 listing is under a $10 floor and a $10.49 one is over a $10 ceiling. */
export const fromDollars = (l: Pick<Listing, 'terms'>): number | null => {
  const t = fromTerm(l);
  return t === null ? null : t.totalCents / 100;
};

/** The countries present, by code, with their names, for the country chip. */
export function countries(list: readonly Listing[], name: (code: string) => string): { code: string; name: string }[] {
  const codes = [...new Set(list.map((l) => l.country).filter(Boolean))];
  return codes.map((code) => ({ code, name: name(code) })).sort((a, b) => a.name.localeCompare(b.name));
}

export const searchWords = (l: Listing, countryName: string): string[] => [l.name, l.country, countryName, l.city, l.datacenter, l.cpu];

// ── Money and time ──────────────────────────────────────────────────────────────────────

/** "$39" or "$39.50": whole dollars drop the cents. */
export function money(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return '';
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** One amount of a summary that adds up (rental + setup = total): when any line has cents, every line shows them
 *  ("$27.00", "$0.99", "$27.99"), so the column reads as a sum. Otherwise as money(). */
export function moneyIn(cents: number | null, lines: readonly (number | null)[]): string {
  if (cents === null || !Number.isFinite(cents)) return '';
  if (!lines.some((c) => c !== null && Number.isFinite(c) && c % 100 !== 0)) return money(cents);
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export type Delivery = { k: 'now' } | { k: 'hours'; n: number } | { k: 'days'; n: number } | { k: 'unknown' };

export function delivery(hours: number | null): Delivery {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return { k: 'unknown' };
  if (hours === 0) return { k: 'now' };
  if (hours < 48) return { k: 'hours', n: Math.round(hours) };
  return { k: 'days', n: Math.round(hours / 24) };
}

/** What a wallet balance means against a total: enough, or short by this much. */
export function shortfall(balanceCents: number | null, totalCents: number | null): { ok: true } | { ok: false; shortBy: number } | null {
  if (balanceCents === null || totalCents === null) return null;
  return balanceCents >= totalCents ? { ok: true } : { ok: false, shortBy: totalCents - balanceCents };
}

// ── Reservations ────────────────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  name: string;
  state: 'pending' | 'fulfilled' | 'refunded';
  days: number | null;
  paidCents: number | null;
  cores: number | null;
  ramGb: number | null;
  diskGb: number | null;
  /** Promised delivery, epoch ms. */
  readyBy: number | null;
  createdAt: number;
  /** The terms quoted when it was paid for (the reservation's own, not the offer's today). */
  quoted: {
    deliveryHours: number | null;
    setupMinutes: number | null;
    /** Days the data is kept after the term ends, then deleted; 0 is none. */
    holdDays: number | null;
    /** Money: null when this caller may not read financials. */
    rentalCents: number | null;
    setupFeeCents: number | null;
  };
  /** What it was delivered as, once fulfilled (full ids: shown masked, never written into text). */
  serverId: string | null;
  rentalId: string | null;
}

export interface ReservationPage {
  rows: Reservation[];
  total: number;
}


/** A pending reservation past its promised date. */
export const overdue = (r: Reservation, now: number): boolean => r.state === 'pending' && r.readyBy !== null && r.readyBy < now;

export const pendingCount = (rows: readonly Reservation[]): number => rows.filter((r) => r.state === 'pending').length;

export const TABS = ['listings', 'reservations'] as const;
export type Tab = (typeof TABS)[number];
export const isTab = (v: string | undefined): v is Tab => !!v && (TABS as readonly string[]).includes(v);
