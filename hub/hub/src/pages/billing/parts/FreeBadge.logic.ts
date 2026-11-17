// When the Free badge may show. No React, no I/O.
// GET /servers lists the person's real rentals and their free slices (is_free_tier); a paid subserver is not in it,
// it is only in GET /subserver-subscriptions. So the badge needs both lists, each whole and fresh: a server of any
// other kind, or any list that could not be read or is cut short, means no badge.

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** A rental or subscription that has ended is no server of theirs any more; every other state still holds a paid server. */
const ENDED_RENTAL = new Set(['expired', 'terminated']);
const ENDED_SUB = new Set(['terminated', 'host_wiped']);

export type FreeVerdict = 'free' | 'paid' | 'none' | 'unknown';

/**
 * 'free': at least one server, every live one a free slice, and no live paid subscription.
 * 'paid': a paid server or subscription exists. 'none': no live server at all. 'unknown': a list is missing, not a
 * list, holds a row that is not one, or the subscriptions are cut short with no paid one among those shown.
 */
export function freeOnly(serversRaw: unknown, subsRaw: unknown): FreeVerdict {
  const s = obj(serversRaw);
  const b = obj(subsRaw);
  if (!s || !Array.isArray(s.data) || !b || !Array.isArray(b.data)) return 'unknown';
  let paid = false;
  let unknown = false;
  let live = 0;
  for (const row of s.data) {
    const r = obj(row);
    if (!r) {
      unknown = true;
      continue;
    }
    if (typeof r.status === 'string' && ENDED_RENTAL.has(r.status)) continue;
    if (r.is_free_tier === true) live += 1;
    else paid = true;
  }
  for (const row of b.data) {
    const r = obj(row);
    if (!r) {
      unknown = true;
      continue;
    }
    if (!(typeof r.state === 'string' && ENDED_SUB.has(r.state))) paid = true;
  }
  // A paid one is enough to hide the badge, whatever else could not be read.
  if (paid) return 'paid';
  if (unknown) return 'unknown';
  const total = b.total;
  if (typeof total !== 'number' || total > b.data.length) return 'unknown';
  return live > 0 ? 'free' : 'none';
}

/** How long a read answer counts; the lists are re-read every two minutes, so this is that and some slack. */
export const FRESH_MS = 150_000;

/**
 * Every answer was read within `freshMs` of `now`. Only age: that an answer was asked for after the last purchase
 * activity is not a matter of clocks, the reads' key carries the cutoff (FreeBadge.data.ts), so an older request
 * answers to a key nobody reads.
 */
export function answersCurrent(updatedAt: readonly number[], now: number, freshMs: number): boolean {
  return updatedAt.every((t) => t > 0 && now - t <= freshMs);
}

/**
 * The network cap of the person's free server, in Mbit/s each way, as GET /servers states it on the free row
 * (`network_limit_mbps`: the cap the platform enforces, its per-server cap or else the free tier default). Every live
 * free row must carry the same whole positive number; anything else (no number, a null, two different caps, a list
 * that is not one) gives null, and the card then says nothing about the network. Never a number of the Hub's own.
 */
export function freeNetworkMbps(serversRaw: unknown): number | null {
  const s = obj(serversRaw);
  if (!s || !Array.isArray(s.data)) return null;
  let cap: number | null = null;
  for (const row of s.data) {
    const r = obj(row);
    if (!r || r.is_free_tier !== true) continue;
    if (typeof r.status === 'string' && ENDED_RENTAL.has(r.status)) continue;
    const v = r.network_limit_mbps;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) return null;
    if (cap !== null && cap !== v) return null;
    cap = v;
  }
  return cap;
}
