// listing-facts.ts: everything a bare-metal listing says about itself, in one ordered projection with its words, so
// the Market (row, card, inspector) and Billing's rent/reserve checkout show the same facts and can never disagree.
// Pure: no DOM, no network. A value the row left out comes back as NOT_LISTED, never dropped and never shown as 0;
// only the CPU score (stock rows with a benchmark) and the stock count (offers the rail counts) appear when present.
// Sizes go through the kit's formatStorage (binary steps: 1024 GB and up read in TB). The labels and value words are
// listing-facts.en.json; both pages read them from here.
import { formatNumber, formatStorage } from '../kit/format';
import { makeT } from '../kit/strings';
import type { MarketDisk, MarketRow } from './commerce-pure';
import words from './listing-facts.en.json';

export { words as listingFactWords };

const t = makeT(words);
/** A word key as t() takes it (plural keys by their base name). */
type Key = Parameters<typeof t>[0];

/** What a fact says when the row does not say it. */
export const NOT_LISTED = 'notListed' as const;
export type NotListed = typeof NOT_LISTED;

export type FactKey =
  | 'cpu'
  | 'cores'
  | 'score'
  | 'ram'
  | 'ramType'
  | 'ramSpeed'
  | 'disks'
  | 'diskTotal'
  | 'bandwidth'
  | 'traffic'
  | 'ipv4'
  | 'machine'
  | 'category'
  | 'location'
  | 'delivery'
  | 'setup'
  | 'stockLeft';

export interface ListingFact {
  key: FactKey;
  label: string;
  /** One line, several lines (one per disk group), or NOT_LISTED. */
  value: string | readonly string[] | NotListed;
}

/** The row fields the facts read: core's MarketRow, or a page's own listing with the same names. */
export type FactsInput = Pick<
  MarketRow,
  | 'kind'
  | 'model'
  | 'cores'
  | 'threads'
  | 'cpuScore'
  | 'cpuScoreType'
  | 'ramGb'
  | 'ramType'
  | 'ramMhz'
  | 'disks'
  | 'diskGb'
  | 'diskSummary'
  | 'bandwidthMbps'
  | 'trafficTb'
  | 'trafficUnlimited'
  | 'ipv4Count'
  | 'isVm'
  | 'category'
  | 'datacenter'
  | 'city'
  | 'region'
  | 'country'
  | 'deliveryHours'
  | 'setupMinutes'
  | 'stockLeft'
>;

/** The disk kinds the API names, in its spelling. */
export const DISK_KINDS = ['HDD', 'SSD', 'NVMe', 'SAS'] as const;
const kindOf = (w: string): string => DISK_KINDS.find((d) => d.toLowerCase() === w.trim().toLowerCase()) ?? w.trim();

/** A row's disk groups; a row built without the field (an older or partial row) has none, never a crash. */
const groupsOf = (row: Pick<FactsInput, 'disks'>): readonly MarketDisk[] => (Array.isArray(row.disks) ? row.disks : []);

/** The known kinds a summary names ("2 x 1 TB NVMe" → NVMe). */
function summaryKinds(summary: string | null): string[] {
  const found = new Set<string>();
  for (const w of (summary ?? '').split(/[^A-Za-z]+/)) {
    const k = DISK_KINDS.find((d) => d.toLowerCase() === w.toLowerCase());
    if (k) found.add(k);
  }
  return DISK_KINDS.filter((d) => found.has(d));
}

/** A group's kind; a lone group that names none takes the one kind its row's summary names. */
function groupKind(g: MarketDisk, row: Pick<FactsInput, 'disks' | 'diskSummary'>): string {
  if (g.type) return kindOf(g.type);
  const named = summaryKinds(row.diskSummary);
  return groupsOf(row).length === 1 && named.length === 1 ? (named[0] ?? '') : '';
}

/** "2 × 1 TB NVMe" (a size or kind left out says so); with `detail`, "(PCIe, Samsung PM9A3)" after. */
export function diskGroupLine(g: MarketDisk, row: Pick<FactsInput, 'disks' | 'diskSummary'>, detail = false): string {
  const size = g.gb === null ? t('value.disk.sizeUnknown') : formatStorage(g.gb);
  const type = groupKind(g, row) || t('value.disk.typeUnknown');
  // A count the row did not give is said, never read as one disk.
  const base =
    g.count === null ? t('value.disk.noCount', { size, type, countUnknown: t('value.disk.countUnknown') }) : g.count > 1 ? t('value.disk.group', { count: formatNumber(g.count), size, type }) : t('value.disk.one', { size, type });
  const more = [g.iface, g.model].filter(Boolean).join(', ');
  return detail && more ? `${base} (${more})` : base;
}

/** The disks on one line, for a row or card: every group joined ("2 × 1 TB NVMe + 2 × 8 TB HDD"), else the total and the kinds. */
export function disksLine(row: Pick<FactsInput, 'disks' | 'diskSummary' | 'diskGb'>): string {
  const groups = groupsOf(row);
  if (groups.length > 0) return groups.map((g) => diskGroupLine(g, row)).join(' + ');
  return [row.diskGb === null ? '' : formatStorage(row.diskGb), ...summaryKinds(row.diskSummary)].filter(Boolean).join(' ');
}

/** The memory on one line, for a row or card: "128 GB DDR4 ECC"; the size alone when the row names no type. */
export function ramLine(row: Pick<FactsInput, 'ramGb' | 'ramType'>): string {
  return [row.ramGb === null ? '' : formatStorage(row.ramGb), row.ramType ?? ''].filter(Boolean).join(' ');
}

/** "500 Mbit/s", "10 Gbit/s" (whole gigabits read in Gbit/s, as on the website). */
export function bandwidthLine(mbps: number): string {
  return mbps >= 1000 && mbps % 1000 === 0 ? t('value.gbps', { n: formatNumber(mbps / 1000) }) : t('value.mbps', { n: formatNumber(mbps) });
}

/** A listing delivered right after payment: the stock rail (its delivery is the API's constant 0). Offers are reserved. */
export const isInstant = (row: Pick<FactsInput, 'kind'>): boolean => row.kind === 'stock';

/** A country's English name from its ISO code, falling back to the code. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** A word for `k` from a fixed table, by own key only: a row's "__proto__" or "toString" finds nothing. */
const own = (table: Readonly<Record<string, Key>>, k: string | null): Key | null => (k !== null && Object.hasOwn(table, k) ? (table[k] as Key) : null);

const SCORE_LABELS: Record<string, Key> = {
  geekbench_multi: 'fact.score.geekbench_multi',
  geekbench_single: 'fact.score.geekbench_single',
  passmark: 'fact.score.passmark',
};

const CATEGORY_WORDS: Record<string, Key> = {
  compute: 'value.category.compute',
  memory: 'value.category.memory',
  storage: 'value.category.storage',
  general: 'value.category.general',
  gpu: 'value.category.gpu',
};

function deliveryValue(row: Pick<FactsInput, 'kind' | 'deliveryHours'>): string | NotListed {
  if (isInstant(row)) return t('promise.label');
  const h = row.deliveryHours;
  if (h === null || !Number.isFinite(h) || h < 0) return NOT_LISTED;
  return h < 48 ? t('value.delivery.hours', { count: Math.max(1, Math.round(h)) }) : t('value.delivery.days', { count: Math.round(h / 24) });
}

/** Every fact of a listing, in the order a person weighs them. */
export function listingFacts(row: FactsInput): ListingFact[] {
  const f = (key: FactKey, value: ListingFact['value'], label = t(`fact.${key}`)): ListingFact => ({ key, label, value });
  const or = <V>(v: V | null | undefined | '', show: (v: V) => string): string | NotListed => (v === null || v === undefined || v === '' ? NOT_LISTED : show(v as V));
  const out: ListingFact[] = [
    f('cpu', or(row.model, (m) => m)),
    f('cores', or(row.cores, (c) => (row.threads !== null ? t('value.coresThreads', { cores: formatNumber(c), threads: formatNumber(row.threads) }) : formatNumber(c)))),
  ];
  if (row.cpuScore !== null) out.push(f('score', formatNumber(row.cpuScore), t(own(SCORE_LABELS, row.cpuScoreType?.toLowerCase() ?? null) ?? 'fact.score')));
  const groups = groupsOf(row);
  const disks: ListingFact['value'] =
    groups.length > 1 ? groups.map((g) => diskGroupLine(g, row, true)) : groups[0] ? diskGroupLine(groups[0], row, true) : row.diskSummary || NOT_LISTED;
  out.push(
    f('ram', or(row.ramGb, formatStorage)),
    f('ramType', or(row.ramType, (s) => s)),
    f('ramSpeed', or(row.ramMhz, (n) => t('value.mhz', { n: formatNumber(n) }))),
    f('disks', disks),
    f('diskTotal', or(row.diskGb, formatStorage)),
    f('bandwidth', or(row.bandwidthMbps, bandwidthLine)),
    f('traffic', row.trafficUnlimited ? t('value.unlimited') : or(row.trafficTb, (n) => t('value.tb', { n: formatNumber(n) }))),
    f('ipv4', or(row.ipv4Count, formatNumber)),
    // No IPv6 fact: IPv6 is not part of Hoody, so a listing never says whether it has it.
    f('machine', typeof row.isVm !== 'boolean' ? NOT_LISTED : t(row.isVm ? 'value.vm' : 'value.whole')),
    f('category', or(own(CATEGORY_WORDS, row.category), (k) => t(k))),
    f('location', or([row.datacenter, row.city, row.region, row.country ? countryName(row.country) : ''].filter(Boolean).join(', '), (s) => s)),
    f('delivery', deliveryValue(row)),
    f('setup', or(row.setupMinutes, (n) => t('value.setup', { count: n }))),
  );
  if (row.stockLeft !== null) out.push(f('stockLeft', row.stockLeft > 0 ? formatNumber(row.stockLeft) : t('value.stockLeft.none')));
  return out;
}

/** A fact's value as text: NOT_LISTED in words, several lines joined by the caller's separator. */
export const factText = (v: ListingFact['value'], sep = '\n'): string => (v === NOT_LISTED ? t('fact.notListed') : typeof v === 'string' ? v : v.join(sep));

/** The instant-delivery promise: the footnote under a list ("*Usually ready…") and the checkout's review line. */
export const instantPromise = {
  label: t('promise.label'),
  footnote: t('promise.footnote', { promise: t('promise.body') }),
  review: t('promise.review', { promise: t('promise.body') }),
} as const;
