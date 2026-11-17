// The Checkout drawer's state machine, pure. One drawer serves five purchases: buy a plan, pay an unpaid server,
// upgrade in place, rent a stock server, reserve an offer. The IO (quotes, the send, the read-back) is hub-core's
// commerce module; this reducer only decides what the drawer shows, so C9 holds in one place:
//
//   - `posting` and `reconciling` lock the drawer (x, Esc and the scrim do nothing): the only drawer that locks.
//   - A send that came back unknown is `unknown`: "it may already have gone through". Check again (`checkAgain`)
//     only reads and never sends anything; no read settles it. The only sends from here are
//     the person's confirmed "Send the same request again" (same key, same body; a reservation after its countdown)
//     and a rent's warned "Rent again anyway". Confirm is not offered again, and a new purchase needs a new review.
//   - Success is shown only after the answer: nothing says "done" before it.
import type { ErrorInfo } from '@core';
import { cents } from './logic';
import type { Key, Vars, Word } from './types';

export type CheckoutKind = 'buy' | 'pay' | 'upgrade' | 'rent' | 'reserve';

export type CheckoutPhase =
  'quoting' | 'quote_error' | 'review' | 'posting' | 'reconciling' | 'checking' | 'unknown' | 'done' | 'already' | 'failed' | 'not_found' | 'banned';

export interface QuoteLine {
  label: Key;
  /** Values for the label ("{{n}} days"). */
  vars?: Vars;
  cents: number | null;
  strong?: boolean;
}

export interface CheckoutQuote {
  /** What this confirm charges now. */
  chargeCents: number;
  lines: QuoteLine[];
  /** The wallet balance; null when it could not be read. */
  balanceCents: number | null;
  /** One sentence under the lines: renews on…, hold rules…, pays the difference until…. */
  notes: Word[];
  /** Why this cannot be bought now (the limit, no room); the confirm stays off. */
  blocked: Word | null;
  /** A warning shown above the consent (an upgrade's downtime and one-way note). */
  warnings: Word[];
  /** What is bought (kind, plan version, subscription, or offer and term): consent is given on this purchase. */
  subject?: string;
  /** Buy a plan: where the new server will be (the chosen location), or, with Automatic, where it would be placed
   *  right now (a hint only; null when the API names no place). */
  place?: { region: string; country: string; city: string } | null;
}

export interface CheckoutResult {
  chargedCents: number | null;
  /** ISO time of the charge or of the earlier request. */
  at: string | null;
  /** An answer to an earlier request with the same key: nothing new was charged. */
  replayed: boolean;
  /** Setup failed after the charge (support reference shown). */
  setupFailed: boolean;
  /** "Yours from" / paid-until / ready-by date for the done line. */
  until: string | null;
  /** Rent/reserve: a reservation's ready-by date. */
  readyBy: string | null;
  /** Setup failed: the operation to give support (never the full id; IdChip shortens it). */
  ref: string | null;
  /** Buy a plan: where the new server is, as the answer's subscription says; absent or null when it names no place. */
  place?: { region: string; country: string; city: string } | null;
}

export interface CheckoutFailure {
  word: Word;
  /** A masked support reference (mono, with copy). */
  ref: string | null;
  /** The rejection's allow-listed facts, when the answer carried them: the failed outcome's Details. */
  info?: ErrorInfo;
}

/** A failed checkout whose rejection facts say the purchase may have gone through (C9: the kit shows the banner pending
 *  on the same test). Nothing that starts a fresh purchase is offered beside it. */
export function failedMayHaveGone(state: Pick<CheckoutState, 'phase' | 'failure'>): boolean {
  return state.phase === 'failed' && state.failure?.info?.outcome === 'pending';
}

export interface CheckoutState {
  phase: CheckoutPhase;
  quote: CheckoutQuote | null;
  consent: boolean;
  /** A line above the review: not sent, price changed, wallet short... */
  notice: Word | null;
  /** The price moved to this total; the next confirm is a new intent. */
  requote: number | null;
  result: CheckoutResult | null;
  failure: CheckoutFailure | null;
  /** Why the price could not be read (core's allow-listed facts only): the price error's Details. */
  quoteError?: ErrorInfo;
  /** Seconds until a reservation's "Try again" may be pressed (unknown outcome). */
  retryIn: number;
  /** How many read-backs ran since the outcome became unknown. */
  checks: number;
  /** The read-back answered "still unknown" the last time. */
  stillUnknown: boolean;
  /** A key was kept: a later Check again repeats that same request. */
  keyKept: boolean;
  /** The account read suspended while this drawer was open: no control that could send is offered again. Once set it
   *  stays for the drawer's life; no later read clears it (a fresh drawer starts from the page's own suspension). */
  suspended: boolean;
}

export const initialCheckout: CheckoutState = {
  phase: 'quoting',
  quote: null,
  consent: false,
  notice: null,
  requote: null,
  result: null,
  failure: null,
  retryIn: 0,
  checks: 0,
  stillUnknown: false,
  keyKept: false,
  suspended: false,
};

export type CheckoutEvent =
  | { type: 'quoted'; quote: CheckoutQuote }
  | { type: 'quoteFailed'; info?: ErrorInfo }
  /** A market row read for new inputs is out: a review built on the earlier row goes back to quoting. */
  | { type: 'marketStale' }
  /** The account is suspended. `keep`: core holds a purchase that was sent (out, unresolved or done), so the drawer
   *  keeps its step and only marks itself suspended. */
  | { type: 'banned'; keep?: boolean }
  | { type: 'consent'; on: boolean }
  | { type: 'confirmed' }
  | { type: 'rentAgain' }
  | { type: 'sent'; kind: 'done' | 'already'; result: CheckoutResult }
  /** `word`: why a resend's admission sent nothing (noLocks); the outcome stays unknown. */
  | { type: 'unknown'; retryIn?: number; word?: Word }
  | {
      type: 'refused';
      word: Word;
      requote?: number | null;
      short?: boolean;
      fresh?: Partial<Pick<CheckoutQuote, 'balanceCents'>>;
    }
  | { type: 'notSent'; word: Word }
  | { type: 'failed'; word: Word; ref: string | null; info?: ErrorInfo }
  | { type: 'checkStarted' }
  | { type: 'checkFound'; kind: 'done' | 'already'; result: CheckoutResult }
  | { type: 'reconciling' }
  | { type: 'checkNotFound' }
  /** `word`: why this check could not be sent (noLocks); the outcome stays unknown. */
  | { type: 'checkUnknown'; word?: Word }
  | { type: 'tick' }
  | { type: 'retrying' }
  | { type: 'restore' }
  | { type: 'startOver' }
  /** The person confirmed Start a new purchase on a reservation whose outcome is unknown: `dropped` when core proved
   *  no tab of this browser sends its request again (a fresh review); otherwise the view stays unknown, with why:
   *  `sending` when a send of it may be on the wire in some tab, else the store could not be read or written. */
  | { type: 'reserveNew'; dropped: boolean; sending?: boolean; keptDays?: string }
  | { type: 'again' }
  /** The plan picked in Choose plan was put back before anything was sent: what stood on that plan (consent, the
   *  requote band and why a send came back) goes with it. */
  | { type: 'planCleared' };

/** The wallet is short of this confirm's charge: the review shows Add funds and the confirm stays off. */
export function shortfall(q: CheckoutQuote | null): number {
  if (!q || q.balanceCents === null) return 0;
  return Math.max(0, q.chargeCents - q.balanceCents);
}

export type ConfirmGate =
  | { ok: true }
  | {
      ok: false;
      reason: 'phase' | 'consent' | 'short' | 'blocked' | 'balance';
    };

/** Whether Confirm may send now. The consent box is required every time (a requote unticks it). */
export function confirmGate(s: CheckoutState): ConfirmGate {
  if (s.phase !== 'review' || !s.quote) return { ok: false, reason: 'phase' };
  if (s.quote.blocked) return { ok: false, reason: 'blocked' };
  if (s.quote.balanceCents === null) return { ok: false, reason: 'balance' };
  if (shortfall(s.quote) > 0) return { ok: false, reason: 'short' };
  if (!s.consent) return { ok: false, reason: 'consent' };
  return { ok: true };
}

/**
 * The words a disabled Confirm shows in the footer: the first failing gate in confirmGate's order, a
 * suspension first. Nothing while the quote is still coming (the body shows its skeleton) or when Confirm can act. The
 * shortfall is the gate's own number (shortfall()), never one computed in the view.
 */
export function confirmReason(s: CheckoutState, banned: boolean, kind?: CheckoutKind): Word | null {
  if (banned) return { k: 'mkt.suspended' };
  const g = confirmGate(s);
  if (g.ok || g.reason === 'phase') return null;
  switch (g.reason) {
    case 'blocked':
      return s.quote?.blocked ?? null;
    case 'balance':
      return { k: 'mkt.balanceUnavailable' };
    case 'short':
      // The body's own short line words it by kind: a payment, an upgrade, else a purchase.
      return { k: kind === 'pay' ? 'subs.payShort' : kind === 'upgrade' ? 'up.short' : 'buy.short', v: { amount: cents(shortfall(s.quote)) } };
    case 'consent':
      return { k: 'consent' };
  }
}

export interface ConfirmFooter {
  disabled: boolean;
  /** The footer's words: null when Confirm can act, while the quote is coming, or when the review body says why. */
  reason: Word | null;
  /**
   * Confirm is off for a reason the review body already says: the blocked Band, the balance Band, or the shortfall line
   * beside Add funds (the same sentence as the footer's).
   */
  saidAbove: boolean;
  /**
   * Why Confirm cannot act, whether the footer line or the review body shows it: the words of the reasoned Confirm (a
   * kit ReasonButton, which has no action). Null when Confirm can act and while it is off with nothing to name (the
   * quote is coming), so it is never set on an open gate.
   */
  why: Word | null;
}

/** Closed gates the review body states itself: the blocked Band, the balance Band, the shortfall line. */
const SAID_ABOVE: ReadonlySet<string> = new Set(['blocked', 'balance', 'short']);

/**
 * Confirm's disabled state and its footer reason, from one place: a condition added to
 * only one of them would leave a disabled Confirm with no reason. Confirm is off on a suspension or a closed gate; on a
 * quoted review it is off exactly when the footer or the body says why, never both (the
 * no-repeat rule covers the footer line). A suspension and the consent box stay in the
 * footer: the review body does not say them.
 */
export function confirmFooter(s: CheckoutState, banned: boolean, kind?: CheckoutKind): ConfirmFooter {
  const g = confirmGate(s);
  const saidAbove = !banned && !g.ok && SAID_ABOVE.has(g.reason);
  const disabled = banned || !g.ok;
  const why = disabled ? confirmReason(s, banned, kind) : null;
  return { disabled, reason: saidAbove ? null : why, saidAbove, why };
}

/**
 * Buy a plan's subtitle is the plan and its price (the body has no plan heading of its own) on every
 * step that shows the review body: review, quoting, posting and reconciling. The other kinds keep their step list.
 */
export function planInSubtitle(kind: CheckoutKind, phase: CheckoutPhase): boolean {
  return kind === 'buy' && (phase === 'review' || phase === 'quoting' || phase === 'posting' || phase === 'reconciling');
}

/** x, Esc and the scrim work only when no charge is in flight. */
export function canClose(s: CheckoutState): boolean {
  return s.phase !== 'posting' && s.phase !== 'reconciling' && s.phase !== 'checking';
}

/** A charge whose outcome is unknown (the page keeps a Check again band after the drawer closes). */
export function isUnknown(s: CheckoutState): boolean {
  return s.phase === 'unknown' || (s.phase === 'checking' && s.keyKept);
}

/** Refusal words that only say the price moved (the requote band says it with the new total). */
const PRICE_WORDS: ReadonlySet<string> = new Set(['buy.priceChanged', 'mkt.priceChanged']);

export const RETRY_AFTER_S = 20;

/** The steps where nothing has gone through yet: a suspension replaces them with the banned body. */
const BEFORE_OUTCOME: ReadonlySet<CheckoutPhase> = new Set<CheckoutPhase>(['quoting', 'quote_error', 'review', 'failed', 'banned']);

/** The wallet rows of a quote: what the person holds, not what is bought (a balance re-read keeps consent). */
const BALANCE_LINES: ReadonlySet<string> = new Set(['buy.wallet', 'buy.referral']);
const termLines = (q: CheckoutQuote) => JSON.stringify(q.lines.filter((l) => !BALANCE_LINES.has(l.label)));

/** The same purchase (subject), charge and term lines (label and cents, in order): what consent was given on is unchanged. */
function sameMoney(a: CheckoutQuote | null, b: CheckoutQuote): boolean {
  return !!a && a.subject === b.subject && a.chargeCents === b.chargeCents && termLines(a) === termLines(b);
}

export function checkoutReducer(s: CheckoutState, e: CheckoutEvent): CheckoutState {
  switch (e.type) {
    case 'quoted':
      // A new quote never resets a charge in flight, a result or an unknown outcome. A review keeps its notice, and so
      // does one marketStale sent back to quoting (why a send came back): quoting holds a notice only then.
      if (s.phase !== 'quoting' && s.phase !== 'quote_error' && s.phase !== 'review') return s;
      // Consent was given on the purchase and money shown: it survives a fresh quote only when the subject, the charge
      // and every term line are the same (a balance change alone keeps it). A requote after a refusal (CHARGE_EXCEEDS_MAX) at a new price asks again.
      return {
        ...s,
        phase: 'review',
        quote: e.quote,
        consent: s.consent && sameMoney(s.quote, e.quote),
        notice: s.phase === 'review' || s.phase === 'quoting' ? s.notice : null,
      };
    case 'quoteFailed':
      return s.phase === 'quoting' || s.phase === 'quote_error' ? { ...s, phase: 'quote_error', quoteError: e.info } : s;
    case 'marketStale':
      // Only a review: a send in flight, an unknown outcome or a result keeps its step (they never stood on the price).
      // Its notice stays (why a send came back) through the fresh quote ('quoted'); the price and consent go.
      return s.phase === 'review' ? { ...s, phase: 'quoting', quote: null, consent: false } : s;
    case 'banned':
      // Before anything went through (quoting, review, a definite failure) the drawer stops at the banned body, and so
      // does a posting step core has left with nothing sent (idle or failed: the adapter sends this without `keep` after
      // that answer). A send that is unresolved or done keeps its body ("may already have gone through" with the
      // read-only Check again, or the done line), and so does any step while core holds a sent purchase (`keep`): only
      // the send controls go.
      return !e.keep && (BEFORE_OUTCOME.has(s.phase) || s.phase === 'posting')
        ? { ...s, phase: 'banned', suspended: true }
        : s.suspended
          ? s
          : { ...s, suspended: true };
    case 'consent':
      return s.phase === 'review' ? { ...s, consent: e.on } : s;
    case 'confirmed':
      return confirmGate(s).ok ? { ...s, phase: 'posting', notice: null, requote: null, keyKept: true } : s;
    case 'rentAgain':
      // After an explicit "Rent again anyway": a new send behind a held, unresolved rent.
      return s.phase === 'not_found' || (s.phase === 'unknown' && s.stillUnknown)
        ? { ...s, phase: 'posting', notice: null, keyKept: true, consent: true }
        : s;
    case 'sent':
      if (s.phase !== 'posting' && s.phase !== 'reconciling') return s;
      return {
        ...s,
        phase: e.kind === 'already' || e.result.replayed ? 'already' : 'done',
        result: e.result,
        notice: null,
        keyKept: false,
        stillUnknown: false,
      };
    case 'unknown':
      if (s.phase !== 'posting' && s.phase !== 'reconciling' && s.phase !== 'checking') return s;
      return {
        ...s,
        phase: 'unknown',
        retryIn: e.retryIn ?? s.retryIn,
        ...(e.word ? { notice: e.word } : {}),
        keyKept: true,
        stillUnknown: s.phase === 'checking',
        checks: s.phase === 'checking' ? s.checks + 1 : s.checks,
      };
    case 'refused': {
      if (s.phase !== 'posting') return s;
      // A definitive refusal: nothing was charged and the key is spent. Back to the review.
      const quote = s.quote && e.fresh ? { ...s.quote, ...e.fresh } : s.quote;
      return {
        ...s,
        phase: 'review',
        quote,
        consent: false,
        // The requote band already says the price moved and to what: the same sentence again is noise.
        notice: e.requote != null && PRICE_WORDS.has(e.word.k) ? null : e.word,
        requote: e.requote ?? null,
        keyKept: false,
      };
    }
    case 'notSent':
      // Nothing left the browser: the review stays as it was, consent kept.
      return s.phase === 'posting' ? { ...s, phase: 'review', notice: e.word, keyKept: false } : s;
    case 'failed':
      if (s.phase !== 'posting' && s.phase !== 'checking' && s.phase !== 'reconciling') return s;
      return {
        ...s,
        phase: 'failed',
        failure: { word: e.word, ref: e.ref, ...(e.info ? { info: e.info } : {}) },
        keyKept: false,
      };
    case 'checkStarted':
      return s.phase === 'unknown' || s.phase === 'not_found' ? { ...s, phase: 'checking' } : s;
    case 'checkFound':
      if (s.phase !== 'checking') return s;
      return {
        ...s,
        phase: e.kind === 'already' || e.result.replayed ? 'already' : 'done',
        result: e.result,
        keyKept: false,
        stillUnknown: false,
      };
    case 'reconciling':
      // The Market's read-back after an ambiguous send: still locked, still no resend.
      return s.phase === 'posting' ? { ...s, phase: 'reconciling' } : s;
    case 'checkNotFound':
      return s.phase === 'checking' || s.phase === 'reconciling' ? { ...s, phase: 'not_found', keyKept: true, checks: s.checks + 1 } : s;
    case 'checkUnknown':
      return s.phase === 'checking' ? { ...s, phase: 'unknown', stillUnknown: true, checks: s.checks + 1, notice: e.word ?? null } : s;
    case 'tick':
      return s.phase === 'unknown' && s.retryIn > 0 ? { ...s, retryIn: s.retryIn - 1 } : s;
    case 'retrying':
      // The confirmed resend of a kept reservation (the machine's own retry, same key and body). A kept buy, pay or upgrade
      // resend goes through checkStarted instead: its answer is read with replay semantics.
      // An earlier "no lock" reason goes with it: this resend's own answer says again if it still applies.
      return s.phase === 'unknown' && s.retryIn === 0 ? { ...s, phase: 'posting', notice: s.notice?.k === 'noLocks' ? null : s.notice } : s;
    case 'restore':
      // The page still holds this purchase as unknown: the drawer reopens on it, whatever the quote says.
      return s.phase === 'quoting' || s.phase === 'quote_error' || s.phase === 'review'
        ? { ...s, phase: 'unknown', keyKept: true, consent: false }
        : s;
    case 'startOver':
      return backToReview(s);
    case 'reserveNew':
      if (s.phase !== 'unknown') return s;
      if (e.dropped) return { ...freshReview(s), retryIn: 0 };
      // A key the store still keeps for this offer names its term: that kept reservation is what to check first.
      if (e.keptDays) return { ...s, notice: { k: 'mkt.reserveNewKept', v: { days: e.keptDays } } };
      return { ...s, notice: { k: e.sending ? 'mkt.reserveNewSending' : 'mkt.reserveNewStoreErr' } };
    case 'again':
      // After a definite failure: a new quote, a new review, a new intent. Never from an unknown outcome.
      return s.phase === 'failed' ? { ...initialCheckout, suspended: s.suspended } : s;
    case 'planCleared':
      return s.phase === 'review' || s.phase === 'quoting' || s.phase === 'quote_error'
        ? { ...s, consent: false, notice: null, requote: null }
        : s;
    default:
      return s;
  }
}

/** A rent whose read-back found nothing: the next step is Check again, or a fresh review (a new confirm). */
export function backToReview(s: CheckoutState): CheckoutState {
  if (s.phase !== 'not_found') return s;
  return freshReview(s);
}
/** A fresh review of the same quote: no consent, no kept key, no checks. */
function freshReview(s: CheckoutState): CheckoutState {
  if (!s.quote) return s;
  return {
    ...s,
    phase: 'review',
    consent: false,
    notice: null,
    requote: null,
    keyKept: false,
    checks: 0,
    stillUnknown: false,
  };
}

/** Fixture prices of the market's listings, in cents: `kind:id` → term days → [rental, one-time setup]. */
export type ListingPrices = Record<string, Record<string, readonly [number, number]>>;

/**
 * The quote of one listing and term, from a template quote: the rental, setup and total lines and the ceiling note follow
 * the item. Null when the listing has no such term (nothing is priced in its place). A rent (stock) with no setup draws no
 * Setup line, as live Checkout does (purchaseQuote: a stock setup is only known as total less rental); a reservation keeps
 * its offer's own fee, $0.00 included.
 */
export function quoteForListing(
  template: CheckoutQuote,
  prices: ListingPrices,
  kind: 'rent' | 'reserve',
  item: string,
  days: number,
): CheckoutQuote | null {
  const term = prices[`${kind}:${item}`]?.[String(days)];
  if (!term) return null;
  const [rental, setup] = term;
  const total = rental + setup;
  const cents_ = (label: Key, was: number | null): number | null =>
    label === 'mkt.bdRental' ? rental : label === 'mkt.bdSetup' ? setup : label === 'mkt.bdTotal' ? total : was;
  return {
    ...template,
    chargeCents: total,
    lines: template.lines.filter((l) => !(kind === 'rent' && setup === 0 && l.label === 'mkt.bdSetup')).map((l) => ({ ...l, cents: cents_(l.label, l.cents) })),
    notes: template.notes.map((n) => (n.k === 'co.ceiling' ? { ...n, v: { ...n.v, amount: cents(total) } } : n)),
  };
}
