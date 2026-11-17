// Public hrefs of the Support page, and the one way other pages open a prefilled new ticket.
// The prefill never travels in the URL: newTicket() puts {category, subject, body} into one
// module slot and navigates to /support?new=1. The slot is bounded (subject 200, body 4,000 characters), scoped to the
// account shown when it was put, cleared when it is taken, when the account changes or signs out, and 10 minutes
// after it was put. A reload loses it. Taking it never sends anything.
import { capture, onBump } from '@core';

export const links = {
  list: '/support',
  ticket: (id: string) => `/support?sel=${encodeURIComponent(id)}`,
  newTicket: '/support?new=1',
} as const;

export interface Prefill {
  readonly category?: string;
  readonly subject?: string;
  readonly body?: string;
}

/** How long a put prefill waits to be taken. */
export const PREFILL_TTL_MS = 10 * 60_000;
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

let slot: { readonly account: string; readonly at: number; readonly prefill: Prefill } | null = null;
let watching = false;

function watch(): void {
  if (watching) return;
  watching = true;
  onBump((reason) => {
    if (reason === 'account' || reason === 'signout' || reason === 'logout' || reason === 'suspended') slot = null;
  });
}

const cut = (s: string | undefined, max: number): string | undefined => (s === undefined ? undefined : Array.from(s).slice(0, max).join(''));

/** Keep a prefill for the next New ticket drawer of this account (a newer one replaces it). Nothing is kept without an
 *  account shown. */
export function putPrefill(p: Prefill, now: number = Date.now()): void {
  watch();
  const account = capture().account;
  if (!account) {
    slot = null;
    return;
  }
  const subject = cut(p.subject, SUBJECT_MAX), body = cut(p.body, BODY_MAX);
  slot = {
    account,
    at: now,
    prefill: { ...(p.category !== undefined ? { category: p.category } : {}), ...(subject !== undefined ? { subject } : {}), ...(body !== undefined ? { body } : {}) },
  };
}

/** Take the prefill once: only under the account it was put for and within its time. It is cleared either way. */
export function takePrefill(now: number = Date.now()): Prefill | null {
  const s = slot;
  slot = null;
  if (!s) return null;
  if (s.account !== capture().account || now - s.at > PREFILL_TTL_MS || now < s.at) return null;
  return s.prefill;
}

/** Open a new support ticket from another page, prefilled in memory. `go` is the caller's navigation (kit useGo). */
export function newTicket(p: Prefill, go: (href: string) => void): void {
  putPrefill(p);
  go(links.newTicket);
}

/** Tests only: forget the slot. */
export function resetPrefillForTests(): void {
  slot = null;
}
