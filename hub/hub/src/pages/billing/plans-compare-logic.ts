// The Compare plans table and the lower Plans sections, as data. Pure: the page passes what it read (the catalogue's
// comparison, the free server's computers, the Bare metal facts of one whole market read, the regions) and words the
// result itself. A price or a limit is shown only from one of those reads: where the Hub has no live value the cell is
// "Not listed", never a number copied from the website. The website's words are used only for what no read carries
// (the kind of hardware, virtual machines).
import { LEGAL, PLAN_REALMS, type commerceRules } from '@core';
import { formatStorage } from '@kit/pure';
import { priceShort, type CompareCell, type Comparison, type PlanCard } from './logic';
import type { BareFacts, Span } from './plans-next';
import type { PlanRegion, PlanRegions } from './plans-regions';
import { money } from './servers/logic';
import type { AiTier, Key, Vars, Word } from './types';

type FactId = commerceRules.PlanFactId;

/** A row of the table: the price, a catalogue fact, or one of the rows only the website words. */
export type CmpRowId = 'price' | FactId | 'hardware' | 'regions' | 'realms' | 'vms';

/** One column's answer in one row. `none` says which it is in words: not included, or not listed (no live value). */
export type CmpCell =
  | { kind: 'text'; text: string }
  | { kind: 'word'; word: Word }
  | { kind: 'ai'; tier: AiTier | null; mult: number | null }
  | { kind: 'regions'; regions: readonly PlanRegion[] }
  | { kind: 'none'; why: 'notIncluded' | 'notListed' };

export interface CmpColumn {
  id: string;
  kind: 'plan' | 'bare';
  /** A plan's own title from the catalogue ('' when it has none); Bare metal is worded by the page. */
  title: string;
}

export interface CmpRow {
  id: CmpRowId;
  label: Key;
  /** One cell per column, in the columns' order. */
  cells: CmpCell[];
}

export interface CmpTable {
  columns: CmpColumn[];
  rows: CmpRow[];
}

export interface CmpInput {
  /** The catalogue's comparison; null while it is unread or failed (Bare metal still has its column). */
  cmp: Comparison | null;
  /** The Bare metal facts of one whole market read; null without one (then no number shows in that column). */
  bare: BareFacts | null;
  /** Where each paid shared plan can run now, by the plan column's id (plans-regions.ts: the API's list per plan). A
   *  plan with no entry is unknown: no location is named on a guess. */
  regions: Readonly<Record<string, PlanRegions>>;
}

/** One plan's Locations cell: its locations with room; else the words for still reading, not readable, or all full. */
export function regionsCell(r: PlanRegions | undefined): CmpCell {
  if (r && r.state === 'refused') return word('plans.regionsRefused');
  if (!r || r.state === 'unknown') return word('plans.regionsUnknown');
  if (r.state === 'loading') return word('plans.regionsLoading');
  return r.regions.length > 0 ? { kind: 'regions', regions: r.regions } : word('plans.regionsFull');
}

const word = (k: Key, v?: Vars): CmpCell => ({ kind: 'word', word: v ? { k, v } : { k } });
const text = (s: string): CmpCell => ({ kind: 'text', text: s });
const NOT_LISTED: CmpCell = { kind: 'none', why: 'notListed' };
const NOT_INCLUDED: CmpCell = { kind: 'none', why: 'notIncluded' };

const spanText = ([a, b]: Span, f: (n: number) => string): string => (a === b ? f(a) : `${f(a)}–${f(b)}`);

/** The catalogue facts in the table's order, before and after the two rows about hardware and regions. Every fact id
 *  has a place (the record is exhaustive, so a new fact in core fails to compile here until it is placed). */
const FACT_PLACE: Record<FactId, { at: 'top' | 'bottom'; n: number }> = {
  computers: { at: 'top', n: 0 },
  cores: { at: 'top', n: 1 },
  ram: { at: 'top', n: 2 },
  disk: { at: 'top', n: 3 },
  io: { at: 'top', n: 4 },
  net: { at: 'top', n: 5 },
  snapshots: { at: 'bottom', n: 0 },
  boturls: { at: 'bottom', n: 1 },
  aliases: { at: 'bottom', n: 2 },
  ai: { at: 'bottom', n: 3 },
};

/** The rows' labels for facts the catalogue has no row for (an empty catalogue): the labels comparison() would give. */
const FACT_LABEL: Record<FactId, Key> = {
  computers: 'buy.resComputers',
  cores: 'buy.resCpu',
  ram: 'buy.resRam',
  disk: 'buy.resDisk',
  io: 'buy.resDiskIo',
  net: 'buy.resNetwork',
  snapshots: 'buy.resSnapshots',
  boturls: 'buy.resBotUrls',
  aliases: 'buy.resAliases',
  ai: 'plans.aiLabel',
};

const fromCompare = (c: CompareCell | undefined): CmpCell => {
  if (!c) return NOT_LISTED;
  if (c.kind === 'none') return c.why === 'notIncluded' ? NOT_INCLUDED : NOT_LISTED;
  if (c.kind === 'ai') return { kind: 'ai', tier: c.tier, mult: c.mult };
  return typeof c.value === 'string' ? text(c.value) : { kind: 'word', word: c.value };
};

/** Bare metal's cell for a fact: the ranges of the machines on the market, when one whole read gave them. */
function bareFact(id: FactId, bare: BareFacts | null): CmpCell {
  switch (id) {
    case 'computers':
      return word('plans.cmp.bareComputers');
    case 'cores':
      return bare?.cores ? text(spanText(bare.cores, String)) : NOT_LISTED;
    case 'ram':
      return bare?.ramGb ? text(spanText(bare.ramGb, (n) => formatStorage(n))) : NOT_LISTED;
    case 'disk':
      return bare?.diskGb ? text(spanText(bare.diskGb, (n) => formatStorage(n))) : NOT_LISTED;
    case 'net':
      // In the plans' own unit (their cells read "500 Mbps").
      return bare?.netMbps ? text(`${spanText(bare.netMbps, String)} Mbps`) : NOT_LISTED;
    case 'ai':
      return { kind: 'ai', tier: 'bare_metal', mult: null };
    default:
      return NOT_LISTED;
  }
}

/** The realms an account on this plan may use: a plan that costs nothing is the free one, a plan with a price is a
 *  paid one; a plan without a price shows no number. */
function planRealms(p: PlanCard): CmpCell {
  if (p.priceCents === 0) return text(String(PLAN_REALMS.free));
  if (p.priceCents !== null && p.priceCents > 0) return text(String(PLAN_REALMS.paid));
  return NOT_LISTED;
}

const hasValue = (c: CmpCell): boolean => c.kind !== 'none';

/** An AI allowance's multiple as the page draws it: the catalogue's multiple; without one, the Free tier's is 1 by
 *  definition (every multiple is of Free's allowance) and any other tier has none (its tier alone, no scale). */
export const aiMultiple = (tier: AiTier | null, mult: number | null): number | null => mult ?? (tier === 'free' ? 1 : null);

/** The end of the AI scale: the largest multiple among the cells compared (at least 1), so each plan's bars show its
 *  allowance beside the others' (Free 1, a plan of 2, a plan of 5: the largest fills its scale). Read from the data,
 *  never a fixed number. */
export function aiScale(cells: readonly (CmpCell | CompareCell | undefined)[]): number {
  let end = 1;
  for (const c of cells) {
    if (!c || c.kind !== 'ai') continue;
    const m = aiMultiple(c.tier, c.mult);
    if (m !== null && Number.isFinite(m) && m > end) end = m;
  }
  return end;
}

/**
 * The table compares what is for sale: each plan on sale in the catalogue's order, then Bare metal. Free is not a
 * column (its card above says what it has). Rows: the price, the catalogue's facts (labels as the plan cards word
 * them), and the rows the website words. A fact row is drawn when the catalogue has it or when Bare metal has a live
 * value for it; the AI row always is.
 */
export function compareTable({ cmp, bare, regions }: CmpInput): CmpTable {
  const plans: readonly PlanCard[] = cmp?.plans ?? [];
  const columns: CmpColumn[] = [
    ...plans.map((p): CmpColumn => ({ id: `plan:${p.id}`, kind: 'plan', title: p.title })),
    { id: 'bare', kind: 'bare', title: '' },
  ];
  const across = (plan: (p: PlanCard, i: number) => CmpCell, last: CmpCell): CmpCell[] => [...plans.map(plan), last];

  const catalogue = new Map((cmp?.groups ?? []).flatMap((g) => g.rows).map((r) => [r.id, r] as const));
  const factRow = (id: FactId): CmpRow | null => {
    const own = catalogue.get(id);
    const last = bareFact(id, bare);
    if (!own && id !== 'ai' && !(hasValue(last) && last.kind === 'text')) return null;
    return { id, label: id === 'ai' ? 'plans.aiLabel' : (own?.label ?? FACT_LABEL[id]), cells: across((_p, i) => fromCompare(own?.cells[i]), last) };
  };
  const facts = (at: 'top' | 'bottom'): CmpRow[] =>
    (Object.keys(FACT_PLACE) as FactId[])
      .filter((id) => FACT_PLACE[id].at === at)
      .sort((a, b) => FACT_PLACE[a].n - FACT_PLACE[b].n)
      .map(factRow)
      .filter((r): r is CmpRow => r !== null);

  const price: CmpRow = {
    id: 'price',
    label: 'col.price',
    cells: across(
      (p) => (p.priceCents === null ? NOT_LISTED : word('plans.cmp.price', { price: priceShort(p.priceCents) })),
      bare ? word('plans.cmp.priceFrom', { price: money(bare.fromCents) }) : NOT_LISTED,
    ),
  };
  const hardware: CmpRow = { id: 'hardware', label: 'plans.hardware', cells: across(() => word('plans.cmp.shared'), word('plans.cmp.dedicated')) };
  const where: CmpRow = {
    id: 'regions',
    label: 'plans.regions',
    cells: across((p) => regionsCell(regions[p.id]), word('plans.regionsBare')),
  };
  // Realms are counted per account, not per server, so the catalogue's plan rows carry no figure for them: the row
  // reads core's one table of the realms each plan includes (public plan terms).
  const realms: CmpRow = { id: 'realms', label: 'plans.cmp.realms', cells: across((p) => planRealms(p), text(String(PLAN_REALMS.bareMetal))) };
  const vms: CmpRow = { id: 'vms', label: 'plans.cmp.vms', cells: across(() => NOT_INCLUDED, word('plans.cmp.vmsBare')) };

  return { columns, rows: [price, ...facts('top'), hardware, where, ...facts('bottom'), realms, vms] };
}

/** The least width (px) at which the table keeps every column as a column; below it the page asks the kit for cards,
 *  which keep every plan's value on its own line. */
export const CMP_LABEL_MIN = 190;
export const CMP_COLUMN_MIN = 132;
/** The page gutters around the table (the measure is the page region, wider than the table by its padding). */
const CMP_GUTTER = 64;
export const compareMinWidth = (columns: number): number => CMP_LABEL_MIN + columns * CMP_COLUMN_MIN + CMP_GUTTER;

/** The plans on sale as "name is price a month" facts for the page to word; a plan without a title or a price is left out. */
export function planPrices(cmp: Comparison | null): { plan: string; price: string }[] {
  return (cmp?.plans ?? []).filter((p) => p.title && p.priceCents !== null).map((p) => ({ plan: p.title, price: priceShort(p.priceCents) }));
}

/** The site's pages the lower sections link to. Absolute https only (the kit Link opens them in a new tab). */
export const SITE = {
  infrastructure: 'https://hoody.com/infrastructure/',
  terms: LEGAL.terms,
  privacy: LEGAL.privacy,
  aup: 'https://hoody.com/aup/',
  subprocessors: 'https://hoody.com/subprocessors/',
} as const;

export const DOCS = {
  servers: 'https://docs.hoody.com/foundation/servers',
  files: 'https://docs.hoody.com/kit/files',
  computers: 'https://docs.hoody.com/concepts/containers',
  domains: 'https://docs.hoody.com/foundation/proxy/connect-domain',
  storage: 'https://docs.hoody.com/foundation/storage',
  kit: 'https://docs.hoody.com/kit',
  billing: 'https://docs.hoody.com/foundation/billing',
  security: 'https://docs.hoody.com/concepts/security',
} as const;
