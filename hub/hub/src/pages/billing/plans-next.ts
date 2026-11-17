// The facts behind each column's "Next" hint and the
// Bare metal band. Pure: the page passes the catalogue columns and the market's listings, and words them itself.
import { bareFromCents, type Listing } from './servers/logic';
import type { PlanCard } from './logic';

/**
 * What a column points to next. `plan`: the next column, a step up in price, with what of this column gets tight
 * (its memory and its computers, either left out when the catalogue does not list it). `bare`: the last column points to the
 * Bare metal band below, only when the page draws it.
 */
export type NextHint = { kind: 'plan'; plan: string; ram: string | null; computers: number | null } | { kind: 'bare' };

/**
 * The hint of the column at `i` in [Free, ...cols]: Free points to the first plan (its computers are the free server's
 * `freeMax`, never a memory the Hub does not know); a plan points to the next column only when that one costs more (a
 * "next" that is not a step up says nothing); the last plan, and Free with no plan on sale, point to bare metal when
 * `bare`. Null: no hint.
 */
export function nextHint(cols: readonly PlanCard[], i: number, freeMax: number | null, bare: boolean): NextHint | null {
  if (i < 0 || i > cols.length) return null;
  const here = i === 0 ? null : (cols[i - 1] as PlanCard);
  const next = cols[i] ?? null;
  if (next === null) return bare ? { kind: 'bare' } : null;
  if (!next.title) return null;
  if (here === null) return { kind: 'plan', plan: next.title, ram: null, computers: freeMax !== null && freeMax > 0 ? freeMax : null };
  if (here.priceCents === null || next.priceCents === null || next.priceCents <= here.priceCents) return null;
  const row = here.rows.find((r) => r.id === 'ram');
  // A memory of 0 reads "Not included" in the comparison (logic.ts compareCell), so it is no memory to grow out of either
  // Decided on the catalogue's number (`gb`), never on the formatted text.
  const ram = row && typeof row.value === 'string' && row.gb !== undefined && row.gb > 0 ? row.value : null;
  return { kind: 'plan', plan: next.title, ram, computers: here.computers !== null && here.computers > 0 ? here.computers : null };
}

/** A least and a most (equal when every listing says the same). */
export type Span = readonly [number, number];

export interface BareFacts {
  /** The cheapest 30-day rental, in cents. */
  fromCents: number;
  cores: Span | null;
  ramGb: Span | null;
  diskGb: Span | null;
  /** The machines' network port speeds, in Mbps. */
  netMbps: Span | null;
  /** How many countries the machines are in (0 when no listing names one). */
  countries: number;
}

const span = (xs: readonly (number | null)[]): Span | null => {
  const ok = xs.filter((x): x is number => x !== null && Number.isFinite(x) && x > 0);
  return ok.length ? [Math.min(...ok), Math.max(...ok)] : null;
};

/**
 * The band's facts over the machines that can be rented for 30 days at a price (the ones its "from" counts), or null
 * when there is none. Only a whole market read stands for the market: with a rail missing (`failed`) the ranges and the
 * "from" could be another machine's, so none is shown.
 */
export function bareFacts(read: { listings: readonly Listing[]; failed: readonly string[] } | undefined): BareFacts | null {
  if (!read || read.failed.length > 0) return null;
  const month = read.listings.filter((l) => l.terms.some((t) => t.days === 30 && t.priceCents !== null && t.priceCents > 0));
  const fromCents = bareFromCents(month);
  if (fromCents === null) return null;
  return {
    fromCents,
    cores: span(month.map((l) => l.cores)),
    ramGb: span(month.map((l) => l.ramGb)),
    diskGb: span(month.map((l) => l.diskGb)),
    netMbps: span(month.map((l) => l.bandwidthMbps)),
    countries: new Set(month.map((l) => l.country).filter(Boolean)).size,
  };
}
