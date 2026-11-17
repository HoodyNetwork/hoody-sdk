// commerce.ts: the Market, plans, wallet and subscriptions behaviour.
// No DOM. The sections read these models and call these actions; the money rules are commerce-pure.ts's.
//
// Contract, in plain words.
//
// Owners. Every change is sent only as the identity the Hub DISPLAYS when its dialog or flow opens
// (shownOwner), never the stored session's user. No displayed identity means no owner and nothing is sent.
// The owner holds only while the Hub still displays that identity, the stored session is that user's and the
// captured context lives (alive(ctx)); a request made for an owner that stopped holding is refused unsent
// (the superseded refusal, notSent). api() itself sends every change as the shown identity and checks alive
// before every send. A multi-page read (walkOwner) binds ONE context and one owner for the whole walk: a page
// answered after that owner stopped holding is dropped (superseded) and the walk stops. Before an identity is
// shown (boot) the owner of a read is the stored session's user.
//
// Hosts. The /subserver-subscriptions family (list, by-id read, purchase quote and purchase, the existing
// subscription's quote, Pay now, upgrade, auto-renew) is realm-scoped: with a realm selected it goes to the
// realm host captured with the context, so the server's current-realm membership check applies; in All mode
// api() sends it to the base host. Market (stock, offers, reserve, rent), reservations, rentals, wallet,
// GitHub bonus, plan catalogues and /users/auth/me go to the base host. Nothing leaves except through the
// routes declared here (defineRoute); api() refuses any other call unsent. The by-id subscription read
// refuses the id "quote" (that path is the quote route's).
//
// Outcomes. A change answered by pending (sent, outcome unknown: a 5xx, a lost answer, a late answer) or a
// transport failure is never shown as failed or cancelled and is never resent blindly. The purchase machines
// read the outcome back themselves (recovers: true: no pending notice while their context lives); the buy,
// pay and upgrade attempts keep their idempotency key until a definitive answer. A refusal before sending
// (notSent) is definitive: nothing happened. A change is "sent" only as api() reports it, never by this
// module's guess.
//
// Budgets. One read 15 s; the money POST's own network leg 30 s; a whole money operation (identity check,
// claim, token waits, POST) 40 s; the whole subscription list 30 s; a single read as a whole (its token wait
// included) its 15 s plus 5 s slack. When a deadline fires the operation's AbortController is aborted, which
// api() reads as "alive false": a request not yet on the wire is never sent (notSent); one already out is
// pending. Whatever the operation settles to afterwards is dropped. The Market posting budget is 30 s, its
// reconciliation 15 s, a Check again 15 s, a read retry 3.5 s.
//
// The reserve pending store (localStorage hub_market_pending, kept at sign-out). Every new reserve gets a
// fresh key, written and read back BEFORE its POST may leave: storage that cannot keep exactly that entry
// refuses the purchase (nothing is sent); a store that cannot be READ is not an empty one (a fresh reserve is
// refused unsent, cleanup changes nothing). While an offer has an unresolved entry for the user, a fresh
// Confirm of that offer is refused: the entry is resolved only by the person's confirmed resend (o.recover then
// Retry: a replay of the exact stored request, same key, replay semantics; Check again only reads,
// checkReserveHold) or dropped by the person's confirmed "Start a new purchase" on its unknown view (the billing
// drawer calls marketPendingAbandon with the kept key: a tombstone every send point refuses, marketSendGate). An
// entry goes only on an authoritative outcome (the server's
// 2xx, a definitive refusal of a fresh request) or that explicit drop: never on Close, a redraw, a realm change,
// sign-out or another account.
//
// The buy / pay key store (hub_money_pending, commerce-pure's lock, claim and read-back) and the upgrade key
// store (hub_money_upgrade, per user + subscription, same lock and read-back). The key is stored before the
// POST; the request leaves only through the claim (the entry the dialog showed), after GET /users/auth/me
// names the same user. It is dropped only on a definitive answer (a valid envelope, or a refusal that proves
// nothing was charged); anything else keeps it and the next Confirm resends exactly it. The cleanup runs in
// the background and never holds a settled answer behind the lock.
//
// Reserve admission (cross-tab). The unresolved check and the key's persistence run together inside the
// pending lock (navigator.locks when present, else the in-tab order of commerce-pure's withPendingLock), so
// two tabs never persist two keys for one offer. Confirm's early check only refuses fast; the locked one
// decides. Confirm returns ok once the machine is posting; an admission the lock refuses puts it back to idle
// with its notice (unresolvedReserve / storageFailed) and sends nothing. Every admission (reserve, rent, top-up)
// waits for the lock at most bounds.read: past that it fails closed (nothing marked, nothing sent; busy, never
// failed), and a lock granted later runs nothing. Without a granted Web Lock (no navigator.locks, or one whose request
// throws or rejects) the in-tab order excludes only this tab, so no admission that would mint a NEW money key runs
// there (buy, pay, upgrade, rent, reserve, a top-up's first send): each is refused 'noLocks', nothing written or
// sent. Work on keys already stored (confirmed resends, Check again, drops) still runs on it,
// except a kept reservation's: every write of hub_market_pending needs a granted lock, so without one its resend
// is refused 'noLocks' at its admission (the notice, nothing sent) and its drop and abandon write nothing; its Check
// again still reads.
// Rent markers (hub.v3.rent_pending) are one shared list: every read-modify-write of it runs under the same
// lock, with a fresh read (an admission's mark inside the admission's own hold; every other write queued on the
// lock, this tab's view of a queued write taken from memory until it is written).
//
// Top-up. A top-up POST whose answer was lost is pending (phase and result 'pending'), never 'failed': the
// snapshot keeps {key, method, amount}. checkAgain() only reads; resend(true), the person's confirmed resend, sends
// exactly that keyed request again (the server's idempotent replay; no new key, no other amount or provider). It
// clears on the checkout URL.
//
// Return verification. Only the owner-scoped intent says cancelled (cancelled / expired); a return URL that
// says cancelled while the intent is still nonterminal after the polls is 'processing' (not settled yet).
//
// Checkout URL acceptance. A top-up's checkout or invoice URL is followed only on the method's own https host
// (only the card and crypto checkout hosts this file allows); any other is BAD_CHECKOUT_URL and is not followed.
//
// Test seams: bounds, budgets, RES, SUBS (mutable budgets), marketLatch (the ban latch) and
// resetCommerce().
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api, bannedError, type HubError } from './api';
import { buy as B, buyEvidence, heldRequestSig, lang, market as M, payEvidence, subs as S, upgradeSeen, wallet as W, type HoldCheck, type HoldEvidence, type MarketRow, type PendingEntry } from './commerce-pure';
import { alive, capture, onBump, page as pageIdentity, shownId, subscribe as ctxSubscribe, type Ctx } from './ctx';
import { keepsChanges } from './changes';
import { hostEnv, localStore, registrationGroup, sessionStore } from './host-env';
import { bannedOf, meRoute } from './lifecycle';
import { onTeardown } from './realm';
import { defineRoute, type CallInput, type Route } from './routes';
import { errorInfo, type ErrorInfo } from './errors';
import { sessionUid, shared } from './session';

type Rec = Record<string, unknown>;
type Err = HubError & Rec;

const has = Object.hasOwn;
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const asRec = (v: unknown): Rec => (v !== null && typeof v === 'object' ? (v as Rec) : {});
const dict = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

// ---- routes: one declaration per route, with its scope and query keys ----

/** Every commerce answer is the standard envelope. */
export interface Env { data?: unknown; total?: unknown }
type Cents = number;
interface ReserveBody { days: number; max_charge_cents: Cents; idempotency_key: string }
interface RentBody { rental_days: number; max_charge_cents: Cents }
interface TransferBody { amount: string; idempotency_key: string; expected_fee_bps?: number }
interface CheckoutBody { amount: string; idempotency_key: string }
interface MoneyBody { plan_id?: string; idempotency_key: string; max_charge_cents: Cents; region?: string }

const offersRoute = defineRoute<Env>({ method: 'GET', path: '/offers', scope: 'base' });
const stockRoute = defineRoute<Env>({ method: 'GET', path: '/servers/available', scope: 'base' });
const reserveRoute = defineRoute<Env, ReserveBody>({ method: 'POST', path: '/offers/:id/reserve', scope: 'base', body: ['days', 'max_charge_cents', 'idempotency_key'] });
const rentRoute = defineRoute<Env, RentBody>({ method: 'POST', path: '/servers/:id/rent', scope: 'base', body: ['rental_days', 'max_charge_cents'] });
const reservationsRoute = defineRoute<Env>({ method: 'GET', path: '/reservations', scope: 'base', query: ['limit', 'offset'] });
const reservationRoute = defineRoute<Env>({ method: 'GET', path: '/reservations/:id', scope: 'base' });
const rentalsRoute = defineRoute<Env>({ method: 'GET', path: '/rentals', scope: 'base' });
const balancesRoute = defineRoute<Env>({ method: 'GET', path: '/wallet/balances', scope: 'base' });
const availabilityRoute = defineRoute<Env>({ method: 'GET', path: '/wallet/payment-availability', scope: 'base' });
const bonusRoute = defineRoute<Env>({ method: 'GET', path: '/wallet/github-bonus', scope: 'base' });
const cardIntentRoute = defineRoute<Env>({ method: 'GET', path: '/wallet/payments/card/intents/:id', scope: 'base' });
const cryptoIntentRoute = defineRoute<Env>({ method: 'GET', path: '/wallet/payments/crypto/intents/:id', scope: 'base' });
const transferRoute = defineRoute<Env, TransferBody>({ method: 'POST', path: '/wallet/transfers', scope: 'base', body: ['amount', 'idempotency_key', 'expected_fee_bps'] });
const claimRoute = defineRoute<Env, Record<string, never>>({ method: 'POST', path: '/wallet/github-bonus/claim', scope: 'base', body: [] });
const checkoutRoute = defineRoute<Env, CheckoutBody>({ method: 'POST', path: '/wallet/payments/card/checkout', scope: 'base', body: ['amount', 'idempotency_key'] });
const invoiceRoute = defineRoute<Env, CheckoutBody>({ method: 'POST', path: '/wallet/payments/crypto/invoice', scope: 'base', body: ['amount', 'idempotency_key'] });
const catalogueRoute = defineRoute<Env>({ method: 'GET', path: '/meta/subserver-plans', scope: 'base', query: ['locale'] });
const plansRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-plans', scope: 'base', query: ['locale'] });
// `region`: the location the person chose for a new server; left out for "Automatic". Sent only when chosen.
const buyQuoteRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-subscriptions/quote', scope: 'realm', query: ['plan_id', 'region'], codes: ['PAID_REGION_UNKNOWN'] });
const buyRoute = defineRoute<Env, MoneyBody>({ method: 'POST', path: '/subserver-subscriptions', scope: 'realm', body: ['plan_id', 'idempotency_key', 'max_charge_cents', 'region'], codes: ['PAID_REGION_UNKNOWN', 'NO_PAID_CAPACITY_IN_REGION'] });
// Where a server of one plan can be placed, and whether each location has room for it now. A read, on the quote's host.
const regionsRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-subscriptions/regions', scope: 'realm', query: ['plan_id'] });
// One route for a subscription's quote (pay: action=pay; upgrade: action=upgrade + plan_id): fixture rules
// match by route object, and tell the two apart with `when` on query.action.
const quoteRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-subscriptions/:id/quote', scope: 'realm', query: ['action', 'plan_id'] });
const payRoute = defineRoute<Env, MoneyBody>({ method: 'POST', path: '/subserver-subscriptions/:id/pay', scope: 'realm', body: ['idempotency_key', 'max_charge_cents'] });
const upgradeRoute = defineRoute<Env, MoneyBody>({ method: 'POST', path: '/subserver-subscriptions/:id/upgrade', scope: 'realm', body: ['plan_id', 'idempotency_key', 'max_charge_cents'] });
const autoRenewRoute = defineRoute<Env, { auto_renew: boolean }>({ method: 'PUT', path: '/subserver-subscriptions/:id/auto-renew', scope: 'realm', body: ['auto_renew'] });
const subsListRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-subscriptions', scope: 'realm', query: ['limit', 'offset', 'locale'] });
const subRoute = defineRoute<Env>({ method: 'GET', path: '/subserver-subscriptions/:id', scope: 'realm' });

/** The declared routes (fixtures and tests name them). /users/auth/me is lifecycle.ts's meRoute. */
export const commerceRoutes = Object.freeze({
  offersRoute, stockRoute, reserveRoute, rentRoute, reservationsRoute, reservationRoute, rentalsRoute, meRoute, balancesRoute,
  availabilityRoute, bonusRoute, cardIntentRoute, cryptoIntentRoute, transferRoute, claimRoute, checkoutRoute, invoiceRoute,
  catalogueRoute, plansRoute, buyQuoteRoute, buyRoute, regionsRoute, quoteRoute, payQuoteRoute: quoteRoute, payRoute, upgradeQuoteRoute: quoteRoute, upgradeRoute, autoRenewRoute,
  subsListRoute, subRoute,
});

// ---- outcome classes ----
// Never sent: api() marks notSent exactly when nothing went out (framed lock, superseded or stale before the
// send, a failed refresh, CANCELLED, an aborted operation), and a sent change whose context died or whose
// answer was lost is pending. This module's own refusals carry notSent too.
function refusal(code: string, extra: Rec = {}): Err {
  return { code, kind: 'not_sent', notSent: true, ...extra };
}
const notSent = (err: unknown): boolean => !!err && (err as Err).notSent === true;
const isPending = (err: unknown): boolean => !!err && ((err as Err).pending === true || (err as Err).kind === 'pending');
const isStale = (err: unknown): boolean => !!err && ((err as Err).stale === true || (err as Err).kind === 'stale') && !isPending(err);
const isBanned = (err: unknown): boolean => bannedError(err) || M.isAccountBannedError(err);
const isSuperseded = (err: unknown): boolean => shared().isSupersededAuthError(err);
const stale = (): Err => ({ stale: true, kind: 'stale', notSent: false });
const superseded = (): Err => ({ ...shared().supersededAuthError() });

/** A poll failure that ends the poll: a ban, another user, a dead context, a request refused unsent. */
export function pollStops(err: unknown): boolean {
  return isBanned(err) || isSuperseded(err) || isStale(err) || notSent(err);
}

// ---- owners ----
export interface Owner {
  /** The user the owner speaks for (null only for a boot-time read with no session at all). */
  readonly owner: string | null;
  readonly ctx: Ctx;
  /** Still the same user, the same stored session and a live context. */
  live(): boolean;
  /** Only the user: the Hub still shows this identity and storage still holds this user. */
  user(): boolean;
}
export interface ShownOwner extends Owner { readonly owner: string }

/**
 * The owner of a change: the identity the Hub displays now, null when none is displayed. It holds while the
 * Hub still displays it, the stored session is that user's and `ctx` lives.
 */
export function shownOwner(ctx: Ctx): ShownOwner | null {
  const uid = shownId();
  if (!uid) return null;
  const user = () => shownId() === uid && sessionUid(pageIdentity()) === uid;
  return { owner: uid, ctx, user, live: () => user() && alive(ctx) };
}

/**
 * The owner of a multi-page read: one user for the whole walk. With an identity displayed it is that
 * identity under the change rule; before one is displayed (boot) it is the stored session's user.
 */
export function walkOwner(ctx: Ctx): Owner {
  const own = shownOwner(ctx);
  if (own) return own;
  const owner = sessionUid(pageIdentity());
  const user = () => !!owner && sessionUid(pageIdentity()) === owner;
  return { owner, ctx, user, live: () => user() && alive(ctx) };
}

/** One request as `own`: refused unsent once the owner stopped holding (api() sends changes as the shown user). */
function viaOwner<R, B>(own: Owner | null, route: Route<R, B>, input: CallInput<B> = {}): Promise<R> {
  if (!own || !own.owner || !own.live()) return Promise.reject({ ...superseded(), kind: 'not_sent', notSent: true });
  return api(route, { ...input, ctx: own.ctx });
}
/** A read as the walk's owner when it has one; else plain. */
function readAs<R>(own: Owner | null, ctx: Ctx, route: Route<R, never>, input: CallInput<never> = {}): Promise<R> {
  if (own && own.owner) return viaOwner(own, route, { ...input, ctx });
  return api(route, { ...input, ctx });
}
/** A stale rejection of a read whose USER moved is the superseded refusal (a page is never shown for another user). */
function dropped(err: unknown, own: Owner | null): unknown {
  return own && own.owner && !own.user() && isStale(err) ? superseded() : err;
}

// ---- bounds ----
const BOUND_DEFAULT = { read: 15000, post: 30000, op: 40000, list: 30000, slack: 5000 };
export const bounds: { read: number; post: number; op: number; list: number; slack: number } = { ...BOUND_DEFAULT };
// topupMs: one top-up request's transport bound; past it the outcome is unknown (pending), never failed.
const BUDGET_DEFAULT = { postingMs: 30000, reconcileMs: 15000, checkMs: 15000, readRetryMs: 3500, topupMs: 60000 };
export const budgets: { postingMs: number; reconcileMs: number; checkMs: number; readRetryMs: number; topupMs: number } = { ...BUDGET_DEFAULT };

/** An operation's fence: `dead` once its deadline fired; its signal aborts then (a request not yet out never leaves). */
interface Att { dead: boolean; ctl: AbortController; handed: boolean; post: Promise<unknown> | null }
function newAtt(): Att { return { dead: false, ctl: new AbortController(), handed: false, post: null }; }
function kill(att: Att): void { att.dead = true; att.ctl.abort(); }
const deadline = (): Err => ({ status: 0, code: 'OP_DEADLINE' });

// bounded(att, run, ms): when the deadline fires `att.dead` is set and the caller gets OP_DEADLINE; whatever
// `run` settles to afterwards is dropped, and a run that checks att.dead sends nothing more.
function bounded<T>(att: Att, run: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { kill(att); reject(deadline()); }, ms);
    Promise.resolve().then(run).then(
      (v) => { if (att.dead) return; clearTimeout(t); resolve(v); },
      (e: unknown) => { if (att.dead) return; clearTimeout(t); reject(e); });
  });
}
function boundedRead<T>(run: () => Promise<T>): Promise<T> {
  return bounded(newAtt(), run, bounds.read + bounds.slack);
}

// ---- Market listing ----
// Both inventories, normalized with commerce-pure's rules (integer cents, off-contract tiers invalid). One rail
// failing leaves the other; a ban on either latches `banned`.
/** The ban latch: true once a Market inventory call was refused as banned; tests read and reset it. Every change
 *  (whoever writes it) notifies `subscribeMarketBanned`, so a view reading it through useSyncExternalStore follows it. */
let bannedNow = false;
const bannedListeners = new Set<() => void>();
export const marketLatch = {
  get banned(): boolean { return bannedNow; },
  set banned(v: boolean) {
    if (v === bannedNow) return;
    bannedNow = v;
    for (const l of [...bannedListeners]) { try { l(); } catch { /* a listener's own */ } }
  },
};
/** Called after every change of the ban latch (set by a refused Market call, cleared by an authoritative identity). */
export function subscribeMarketBanned(fn: () => void): () => void {
  bannedListeners.add(fn);
  return () => { bannedListeners.delete(fn); };
}
function classifyMarket(err: unknown): unknown {
  if (isBanned(err)) marketLatch.banned = true;
  return err;
}
/** The latch as it stands: the view paints the suspension without sending anything while it holds. */
export function marketBanned(): boolean { return marketLatch.banned; }

export type CheckStatus = 'clear' | 'cleared' | 'still' | 'unknown' | 'failed';
/**
 * Check status: with the ban latched, GET /users/auth/me for the displayed
 * identity; only an authoritative is_banned === false clears the latch. A missing, malformed, failed or
 * another user's answer keeps it.
 */
export function checkStatus(ctx: Ctx): Promise<CheckStatus> {
  if (!marketLatch.banned) return Promise.resolve('clear');
  const own = shownOwner(ctx);
  if (!own) return Promise.resolve('failed');
  return boundedRead(() => viaOwner(own, meRoute, { timeoutMs: bounds.read })).then((r): CheckStatus => {
    const d = r && r.data;
    if (!own.live() || !d || typeof d !== 'object' || d.id !== own.owner) return 'unknown';
    const b = bannedOf(d);
    if (b === false) { marketLatch.banned = false; return 'cleared'; }
    return b === true ? 'still' : 'unknown';
  }, (): CheckStatus => 'failed');
}

/**
 * The displayed user's free server, for the Market's confirm line (a purchase adds a server and never removes
 * the free one). GET /rentals lists it as is_free_tier (or with computer_capacity, sent only for free-tier
 * servers). Resolves its name, or null when the list holds none; rejects when the read fails or no longer
 * speaks for the displayed user.
 */
export function freeServerName(ctx: Ctx): Promise<string | null> {
  const own = shownOwner(ctx);
  if (!own) return Promise.reject(new Error('no displayed identity'));
  return boundedRead(() => viaOwner(own, rentalsRoute, { timeoutMs: bounds.read })).then((r) => {
    const list = r && r.data;
    if (!own.live() || !Array.isArray(list)) throw new Error('unreadable');
    for (const x of list as unknown[]) {
      const xr = asRec(x), sv = asRec(xr.server), cap = sv.computer_capacity as { used?: unknown; max?: unknown } | null | undefined;
      const free = x && (xr.is_free_tier === true || !!(cap && typeof cap.used === 'number' && typeof cap.max === 'number'));
      if (free) return String(sv.name || xr.server_id || '') || null;
    }
    return null;
  });
}

export interface Listing { stock: MarketRow[]; offers: MarketRow[]; errStock: unknown; errOffers: unknown; banned: boolean }
export function loadListing(ctx: Ctx): Promise<Listing> {
  function rail(route: Route<Env, never>, norm: (raw: unknown, seq: number) => MarketRow): Promise<{ rows: MarketRow[]; error: unknown }> {
    return api(route, { ctx }).then((resp) => {
      const raw = resp && resp.data;
      if (!Array.isArray(raw)) return { rows: [], error: { code: 'BAD_LIST' } };
      const rows: MarketRow[] = [];
      raw.forEach((r, i) => { const n = norm(r, i); if (n) rows.push(n); });
      return { rows, error: null };
    }, (err: unknown) => {
      classifyMarket(err);
      if (isStale(err)) throw stale();
      return { rows: [], error: err };
    });
  }
  return Promise.all([rail(stockRoute, M.normalizeStockRow), rail(offersRoute, M.normalizeOfferRow)]).then(([st, of]) => {
    if (!alive(ctx)) throw stale();
    return { stock: st.rows, offers: of.rows, errStock: st.error, errOffers: of.error, banned: marketLatch.banned };
  });
}

// The Market continuation after Add funds (hub_market_resume): a listing and a day count, no account data.
// Reopening it opens a new dialog, which takes its own displayed owner.
export function marketResume() { return M.readResumeMarker(); }
export function setMarketResume(row: { kind?: string; id?: string | null } | null | undefined, days: string): void {
  if (row && (row.kind === 'stock' || row.kind === 'offer') && typeof row.id === 'string') M.writeResumeMarker(row.kind, row.id, days);
}
export function clearMarketResume(): void { M.clearResumeMarker(); }

// ---- reservations (newest first; <= maxAuto pages, then Load more) ----
// The list only grows at its head (a refund or a fulfilment updates a row in place), so the page offset is the
// RAW count of rows consumed: a head insert costs one overlapping page (deduplicated), never a skipped row.
// Polling: only while a loaded row is pending, one cycle at a time; a cycle is one page-0
// read plus <= perIdCap by-id reads of the pendings not on that page, least recently polled first,
// `concurrency` at once.
const RES_DEFAULT = { page: 200, maxAuto: 5, intervalMs: 30000, perIdCap: 5, concurrency: 2 };
export const RES: { page: number; maxAuto: number; intervalMs: number; perIdCap: number; concurrency: number } = { ...RES_DEFAULT };
// id -> the last terminal row seen on this page load: a row's state only advances, so a lagging answer never
// shows a refunded or fulfilled reservation as pending again, even in a new walk. Ids are server ids, inert
// for any other account.
let resTerminal = dict<ResRow>();
const resDone = (s: unknown): boolean => s === 'fulfilled' || s === 'refunded';

export interface ResRow { id: string; state?: string; [k: string]: unknown }
export interface ResWalk {
  own: Owner; rows: ResRow[]; at: Record<string, number>; offset: number; total: number | null; pages: number;
  exhausted: boolean; tracked: Record<string, { lastPolledAt: number; seq: number }>; tseq: number; more: boolean; restart: boolean;
}

// One row into the walk: the terminal latch, then the row store and the pending set. A row the walk does not
// hold yet goes to place(row), the latched row. -> 'new' | 'updated' | null (not a row).
function absorbRes(walk: ResWalk, rIn: unknown, place?: (r: ResRow) => void): 'new' | 'updated' | null {
  if (!rIn || typeof rIn !== 'object') return null;
  let r = rIn as ResRow;
  if (typeof r.id !== 'string' || !r.id) return null;
  const latched = resTerminal[r.id];
  if (latched && !resDone(r.state)) r = latched;
  if (resDone(r.state)) resTerminal[r.id] = r;
  const known = has(walk.at, r.id);
  const idx = walk.at[r.id];
  if (known && idx !== undefined && idx >= 0) walk.rows[idx] = r;
  if (r.state === 'pending') { if (!has(walk.tracked, r.id)) walk.tracked[r.id] = { lastPolledAt: 0, seq: walk.tseq++ }; }
  else delete walk.tracked[r.id];
  if (!known && place) place(r);
  return known ? 'updated' : 'new';
}
function appendRes(walk: ResWalk, list: unknown[]): void {
  list.forEach((r) => { absorbRes(walk, r, (x) => { walk.at[x.id] = walk.rows.length; walk.rows.push(x); }); });
}
// Page 0 is newest first: an id never seen is newer than the whole window, so it goes on top in the page's
// order. -> how many rows were new.
function prependRes(walk: ResWalk, list: unknown[]): number {
  const fresh: ResRow[] = [];
  list.forEach((r) => { absorbRes(walk, r, (x) => { walk.at[x.id] = -1; fresh.push(x); }); });
  if (!fresh.length) return 0;
  walk.rows = fresh.concat(walk.rows);
  walk.at = dict<number>();
  walk.rows.forEach((r, i) => { walk.at[r.id] = i; });
  return fresh.length;
}
function resTotal(walk: ResWalk, resp: Env | null | undefined): void { if (resp && isCount(resp.total)) walk.total = resp.total; }
function resMore(walk: ResWalk): void { walk.more = walk.total !== null && walk.rows.length < walk.total; }
// One reservations read as the walk's owner: bounded, and dropped (superseded) once that owner stopped
// holding; a read answered after the context died is stale. A ban latches.
function resRead(ctx: Ctx, walk: ResWalk, route: Route<Env, never>, input: CallInput<never>): Promise<Env> {
  return boundedRead(() => readAs(walk.own, ctx, route, { ...input, timeoutMs: bounds.read })).then((resp) => {
    if (walk.own.owner && !walk.own.live()) throw superseded();
    if (!alive(ctx)) throw stale();
    return resp;
  }, (err: unknown) => { throw classifyMarket(dropped(err, walk.own)); });
}
function pageList(resp: Env | null | undefined): unknown[] {
  const rows = resp && Array.isArray(resp.data) ? (resp.data as unknown[]) : null;
  if (!rows) throw { status: 0, code: 'BAD_LIST' };
  return rows;
}
const page0 = () => ({ limit: RES.page, offset: 0 });

/**
 * One walk: one owner from its start; a page that settles after that owner stopped holding is dropped and the
 * walk stops. Passing `walk` continues it (Load more) under the SAME owner: the next older page, or,
 * once a short page proved the older tail ended, a page-0 read for rows added at the head meanwhile. A head
 * read that finds nothing new while rows are still missing sets walk.restart: only a fresh walk converges
 * then. Every page, poll included, goes as the owner.
 */
export function walkReservations(ctx: Ctx, walkIn?: ResWalk): Promise<ResWalk> {
  const walk: ResWalk = walkIn || {
    own: walkOwner(ctx), rows: [], at: dict<number>(), offset: 0, total: null, pages: 0, exhausted: false, tracked: dict(), tseq: 0, more: false, restart: false,
  };
  walk.restart = false;
  if (walk.exhausted && walk.pages) {
    return resRead(ctx, walk, reservationsRoute, { query: page0() }).then((resp) => {
      const n = prependRes(walk, pageList(resp));
      resTotal(walk, resp);
      resMore(walk);
      if (!n && walk.more) walk.restart = true;
      return walk;
    });
  }
  const limit = walk.pages + RES.maxAuto;
  function next(): Promise<ResWalk> {
    return resRead(ctx, walk, reservationsRoute, { query: { limit: RES.page, offset: walk.offset } }).then((resp) => {
      const rows = pageList(resp);
      appendRes(walk, rows);
      walk.pages++;
      walk.offset += rows.length;
      if (rows.length < RES.page) walk.exhausted = true;
      resTotal(walk, resp);
      resMore(walk);
      // Only a full page goes on: a short one proves the older tail ended, so a lying or racing total cannot
      // loop the walk; the gap stays visible as "Showing n of total".
      if (walk.more && rows.length === RES.page && walk.pages < limit) return next();
      return walk;
    });
  }
  return next();
}
export function resPendingCount(walk: ResWalk | null | undefined): number { return walk ? Object.keys(walk.tracked).length : 0; }

/**
 * One poll cycle over a walk's pending rows. Nothing is read when none is pending (no idle poll). Resolves
 * once every read settled (the caller arms the next cycle after RES.intervalMs, so cycles never overlap); a
 * by-id read failing is best effort (the row stays pending). Rejects, sending nothing more, when the owner
 * stopped holding, the context died or the account is banned.
 */
export function pollReservations(ctx: Ctx, walk: ResWalk): Promise<ResWalk> {
  if (!resPendingCount(walk)) return Promise.resolve(walk);
  return resRead(ctx, walk, reservationsRoute, { query: page0() }).then((resp) => {
    const list = pageList(resp), onPage = dict<number>();
    prependRes(walk, list);
    resTotal(walk, resp);
    resMore(walk);
    list.forEach((r) => { const id = asRec(r).id; if (typeof id === 'string') onPage[id] = 1; });
    const ids = M.lruPollPick(walk.tracked, onPage, RES.perIdCap);
    let stop: unknown = null;
    return new Promise<ResWalk>((resolve, reject) => {
      let i = 0, active = 0;
      function nextId(): void {
        if (stop) { if (!active) reject(stop); return; }
        while (active < RES.concurrency && i < ids.length) one(ids[i++] as string);
        if (!active) resolve(walk);
      }
      function one(id: string): void {
        active++;
        // The stamp moves at dispatch: a failed read still spent its slot, which rotates the pick.
        const t = walk.tracked[id];
        if (t) t.lastPolledAt = Date.now();
        resRead(ctx, walk, reservationRoute, { params: { id } }).then((r) => {
          const row = r && r.data;
          if (!stop && row && typeof row === 'object' && (row as Rec).id === id) absorbRes(walk, row);
        }, (err: unknown) => {
          if (pollStops(err)) stop = stop || err;
        }).then(() => { active--; nextId(); });
      }
      nextId();
    });
  });
}

// ---- the reserve pending store (hub_market_pending) ----
const MKT_PENDING = 'hub_market_pending';
/** A kept reservation's Retry-After deadline (ms), by key, in this tab: the fallback when the shared store could not
 *  keep it. The deadline also goes on the kept entry itself (retry_until), so every tab's resend waits it out. */
const marketRetryUntil = new Map<string, number>();
export interface MarketPending { user_id: string; offer_id: string; days: string; ceiling: number; key: string; at: number; name?: string | null;
  /** The server's Retry-After for this key ran out at this time (ms); a resend from any tab waits until then. */
  retry_until?: number;
  /** The person confirmed Start a new purchase on this request at this time (ms) (marketPendingAbandon): a tombstone.
   *  No tab sends this key again (marketSendGate refuses it at every send point), no view offers it, and it never
   *  holds a fresh Confirm of the offer. It goes with a later drop, or 24 h on (MK_TOMBSTONE_MS). */
  abandoned_at?: number;
  /** Sends of this key whose request may be on the wire: one per dispatch, written and read back under the pending
   *  lock before the transport starts (marketFlightAdd); its send point (marketSendGate, read-only, the last check
   *  before fetch) requires it. It goes when nothing was sent (notSent) or on any HTTP answer, whatever its status
   *  (flightEnded); a timeout, lost answer or abort keeps it (that fetch may still be out) until it is stale
   *  (mkFlightStaleMs), as is a dead tab's. A stale flight holds nothing. Every write needs a granted Web Lock. */
  flights?: MkFlight[];
  /** The first time any tab's dispatch of this key got its flight (marketFlightAdd), so the request may have reached the
   *  server: kept when the flight ends (a 5xx or a lost answer leaves the outcome unknown). A key with it, or with any
   *  flight, is never removed as unsent (marketPendingDropUnsent). */
  sent_at?: number;
  /** The flight id of every dispatch of this key that got its flight (marketFlightAdd), oldest first, at most 16: kept
   *  when the flight ends. A definitive refusal of one dispatch proves only that its own request did not run, so it
   *  removes the key only when every recorded send is its own (marketPendingDropOwn). */
  sends?: string[] }
interface MkFlight { id: string; at: number }
/** A dispatch ends by budgets.postingMs (its fence aborts it); a flight older than twice that, plus slack, is over. */
/** At most this many sends are recorded on an entry (MarketPending.sends); a full list proves nothing about who sent. */
const MK_SENDS_MAX = 16;
/** The send-list mark for sends made before the list existed (marketFlightAdd): never a dispatch's own flight id. */
const MK_PRIOR_SENDS = 'prior-unrecorded-sends';
const mkFlightStaleMs = (): number => 2 * budgets.postingMs + 10000;
const MK_TOMBSTONE_MS = 24 * 60 * 60 * 1000;
const validFlight = (f: unknown): f is MkFlight => !!f && typeof f === 'object' && typeof (f as MkFlight).id === 'string'
  && /^[\w-]{8,64}$/.test((f as MkFlight).id) && typeof (f as MkFlight).at === 'number' && isFinite((f as MkFlight).at);
const liveFlight = (f: MkFlight, now: number): boolean => now - f.at < mkFlightStaleMs() && f.at <= now + mkFlightStaleMs();
/** A request this browser may still send: kept, not abandoned. */
const openMk = (e: MarketPending): boolean => e.abandoned_at === undefined;
function validMk(eIn: unknown): eIn is MarketPending {
  const e = eIn as Rec | null | undefined;
  return !!e && typeof e.user_id === 'string' && e.user_id.length > 0 && e.user_id.length <= 128
    && typeof e.offer_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.offer_id) && typeof e.days === 'string' && /^[0-9]{1,4}$/.test(e.days)
    && isCount(e.ceiling) && typeof e.key === 'string' && /^[\w-]{16,128}$/.test(e.key) && typeof e.at === 'number' && isFinite(e.at)
    && (e.name == null || (typeof e.name === 'string' && e.name.length <= 200))
    && (e.retry_until === undefined || (typeof e.retry_until === 'number' && isFinite(e.retry_until)))
    && (e.abandoned_at === undefined || (typeof e.abandoned_at === 'number' && isFinite(e.abandoned_at)))
    && (e.flights === undefined || (Array.isArray(e.flights) && e.flights.length <= 16 && e.flights.every(validFlight)))
    && (e.sent_at === undefined || (typeof e.sent_at === 'number' && isFinite(e.sent_at)))
    && (e.sends === undefined || (Array.isArray(e.sends) && e.sends.length <= MK_SENDS_MAX && e.sends.every((x) => typeof x === 'string' && /^[\w-]{8,64}$/.test(x))));
}
// null = the store could not be read (getItem threw): not the same as empty. A fresh reserve is then refused
// unsent and cleanup changes nothing. Bytes that do not parse hold no usable entry and read as empty.
function readMk(): MarketPending[] | null {
  let raw: string | null;
  try { raw = localStore().getItem(MKT_PENDING); } catch { return null; }
  try { const a: unknown = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter(validMk) : []; } catch { return []; }
}
function writeMk(list: MarketPending[]): boolean {
  try { if (list.length) localStore().setItem(MKT_PENDING, JSON.stringify(list)); else localStore().removeItem(MKT_PENDING); return true; } catch { return false; }
}
function sameMk(e: MarketPending, user: string, id: string, days: string, ceiling: number): boolean {
  return e.user_id === user && e.offer_id === id && e.days === String(days) && e.ceiling === ceiling;
}
/** The entry with this key goes (an authoritative outcome; the person's Start a new purchase is marketPendingAbandon). Under the
 *  cross-tab pending lock, like admitReserve's check and write, so a drop never lands between them. A drop writes only
 *  when a valid entry has this key, like marketRetryAt; otherwise the stored bytes stay as they are, rows this tab
 *  cannot read included. A drop that finds its key rewrites the valid
 *  entries left, so rows this tab cannot read go with it. */
export function marketPendingDrop(key: string | null | undefined): Promise<void> {
  if (!key) return Promise.resolve();
  return B.withPendingLock(() => {
    // Every write of the store needs a granted Web Lock: on the in-tab fallback a stale read
    // could put back what another tab abandoned or wrote. Unheld, the entry stays kept: Check only reads it; only the
    // person's confirmed "Send the same request again" replays it (the same key, one charge), and only under a granted lock.
    if (!B.pendingLockHeld()) return;
    const list = readMk();
    if (list && list.some((e) => e.key === key)) writeMk(list.filter((e) => e.key !== key));
  }).then(() => undefined, () => undefined);
}
/** A disposed admission's own proved key, which it never sent: under a granted pending lock its entry goes only while
 *  the store holds it open, this owner's, never sent by any tab (no sent_at, no flight, live or stale). true only when
 *  that removal landed and a read-back proves the key gone. false keeps the admission's hold:
 *  a key already absent (another tab may have sent and dropped it), a tombstone,
 *  a key some tab sent (the entry stays too: its answer may be unknown), no lock, a lock not granted in time, or a store
 *  that cannot be read or written. */
function marketPendingDropUnsent(owner: string, key: string): Promise<boolean> {
  return marketPendingDropIf(owner, key, (e) => e.sent_at === undefined && !(e.sends || []).length && !(e.flights || []).length);
}
/** A definitive refusal (initial mode: 429, 403 banned, a typed 4xx other than 409 IDEMPOTENCY_INTENT_MISMATCH, a 5xx
 *  PRICING_INVALID) of this dispatch's own registered send proves only that its own request did not run: a 429 or a
 *  PRICING_INVALID is per request, so another tab's send of the same key may still pass. The key goes only when every
 *  recorded send of it and every flight on it is this dispatch's (`flight`); a full send list (16) proves nothing.
 *  Otherwise it stays kept and holds the offer. */
function marketPendingDropOwn(owner: string, key: string, flight: string): Promise<boolean> {
  return marketPendingDropIf(owner, key, (e) => {
    const sends = e.sends || [];
    return sends.length > 0 && sends.length < MK_SENDS_MAX && sends.every((x) => x === flight) && (e.flights || []).every((f) => f.id === flight);
  });
}
/** Under a granted pending lock: the open entry of this owner with this key goes when `ok` holds for it, written and read
 *  back gone (true). No lock, a lock not granted in time, an unreadable store, the key absent or a tombstone, another
 *  owner's entry, `ok` false, or a write that did not land: false, nothing proved. */
function marketPendingDropIf(owner: string, key: string, ok: (e: MarketPending) => boolean): Promise<boolean> {
  return admitUnderLock((): boolean => {
    if (!B.pendingLockHeld()) return false;
    const list = readMk();
    const e = list && list.find((x) => x.key === key);
    if (!list || !e || e.user_id !== owner || !openMk(e)) return false;
    if (!ok(e)) return false;
    if (!writeMk(list.filter((x) => x.key !== key))) return false;
    const back = readMk();
    return !!back && !back.some((x) => x.key === key);
  }, false);
}
/** A 429 on a kept reservation: its deadline is kept in this tab and on the stored entry (under the pending lock, the
 *  later deadline wins), so a resend from another tab is refused until then. */
function marketRetryAt(key: string, until: number): void {
  marketRetryUntil.set(key, Math.max(until, marketRetryUntil.get(key) ?? 0));
  void B.withPendingLock(() => {
    // Unheld (no Web Locks), only this tab keeps the deadline: the stored write needs a granted lock.
    if (!B.pendingLockHeld()) return;
    const list = readMk();
    if (!list) return;
    let hit = false;
    for (const e of list) if (e.key === key) { e.retry_until = Math.max(until, e.retry_until ?? 0); hit = true; }
    if (hit) writeMk(list);
  }).then(() => undefined, () => undefined);
}
/** The latest Retry-After deadline known for a kept key: this tab's or the stored entry's (another tab's 429). */
function marketRetryUntilFor(key: string): number | undefined {
  const mine = marketRetryUntil.get(key);
  const stored = (readMk() || []).filter((e) => e.key === key && e.retry_until !== undefined).map((e) => e.retry_until as number);
  const all = mine === undefined ? stored : [mine, ...stored];
  return all.length ? Math.max(...all) : undefined;
}
// true / false, or null when the store could not be read.
function unresolvedMk(user: string, id: string): boolean | null {
  const list = readMk();
  return list && list.some((e) => e.user_id === user && e.offer_id === String(id) && openMk(e));
}
// A fresh key for a new reserve intent, persisted and read back; null when storage did not keep exactly this entry.
function persistNewKey(user: string, row: MarketRow, id: string, days: string, ceiling: number, written?: (key: string) => void): string | null {
  const key = M.newIdemKey(), read = readMk();
  if (!read) return null;
  const now = Date.now();
  const list = read.filter((e) => openMk(e) || now - (e.abandoned_at as number) < MK_TOMBSTONE_MS);
  list.push({ user_id: user, offer_id: id, days: String(days), ceiling, key, at: Date.now(), name: typeof row.name === 'string' ? row.name.slice(0, 200) : null });
  if (!writeMk(list)) return null;
  // The write landed: the key may be in the store even when the read-back below cannot prove it (unreadable, other bytes).
  written?.(key);
  const back = (readMk() || []).filter((e) => e.key === key);
  const b = back[0];
  return back.length === 1 && b && sameMk(b, user, id, days, ceiling) ? key : null;
}
export type MarketAbandon = 'dropped' | 'absent' | 'inflight' | 'unreadable' | 'failed';
/** The person's confirmed "Start a new purchase" on a kept reservation. Under the
 *  cross-tab pending lock the displayed user's entry with this key becomes a tombstone (abandoned_at), read back,
 *  unless a send of it may be on the wire in some tab (a live flight): then nothing changes ('inflight': it may already
 *  have gone through). Every send of a key passes marketSendGate at its send point, which refuses a tombstone or a
 *  missing entry, so only 'dropped' (the tombstone read back) and 'absent' (a read of the store holds no valid entry
 *  of this user with this key) prove that no tab of this browser sends it again (up to the cross-tab delivery
 *  window marketSendGate names). A store that cannot be read
 *  ('unreadable') or written ('failed'), or a lock not granted in time ('failed'), proves nothing. */
export function marketPendingAbandon(ctx: Ctx | null | undefined, key: string | null | undefined): Promise<MarketAbandon> {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own || !key) return Promise.resolve('failed');
  return admitUnderLock((): MarketAbandon => {
    if (!own.live()) return 'failed';
    // Without a granted Web Lock nothing is written: no tombstone, so nothing proves the key is gone.
    if (!B.pendingLockHeld()) return 'failed';
    const list = readMk();
    if (!list) return 'unreadable';
    const e = list.find((x) => x.key === key && x.user_id === own.owner);
    if (!e) return 'absent';
    const now = Date.now();
    if (openMk(e) && (e.flights || []).some((f) => liveFlight(f, now))) return 'inflight';
    if (openMk(e)) {
      e.abandoned_at = now;
      delete e.flights;
      if (!writeMk(list)) return 'failed';
    }
    const back = (readMk() || []).filter((x) => x.key === key);
    return back.length === 1 && back[0]!.user_id === own.owner && !openMk(back[0]!) ? 'dropped' : 'failed';
  }, 'failed' as const);
}
/** Whether `owner` (a purchase dialog's own owner, PurchaseSnapshot.owner, as its admission checked) keeps an
 *  unresolved reserve intent of this offer: true kept, false PROVEN none, null unknown (no owner or offer, a store
 *  that cannot be read, one that does not parse, or a damaged row that could be this one). Unlike marketPendingFor (an unreadable store reads as empty
 *  there), a "nothing was sent" outcome may rest only on false. */
export function marketPendingKept(owner: string | null | undefined, offerId: string | null | undefined): boolean | null {
  // A tombstone (abandoned_at) is not kept: no tab sends it, and it holds no fresh Confirm.
  if (!owner || !offerId) return null;
  let raw: string | null;
  try { raw = localStore().getItem(MKT_PENDING); } catch { return null; }
  let a: unknown;
  // Only a missing key is an empty store: a stored empty string is unparseable, so it proves nothing.
  try { a = JSON.parse(raw ?? '[]'); } catch { return null; }
  if (!Array.isArray(a)) return null;
  const id = String(offerId);
  let unsure = false;
  for (const e of a) {
    if (validMk(e)) {
      if (e.user_id === owner && e.offer_id === id && openMk(e)) return true;
      continue;
    }
    // A row that fails validMk may be this owner's intent for this offer, damaged: it proves nothing unless it plainly
    // names another offer or another owner.
    const r = (e && typeof e === 'object' ? e : {}) as Rec;
    const otherOffer = typeof r.offer_id === 'string' && r.offer_id !== id;
    const otherOwner = typeof r.user_id === 'string' && r.user_id !== owner;
    if (!otherOffer && !otherOwner) unsure = true;
  }
  return unsure ? null : false;
}
/** Reserves this tab admitted whose own key write landed but whose admission could not prove or keep it (admitReserve's
 *  unresolvedReserve from `saved`). Another tab may have sent that key and
 *  dropped it, so no kept entry is left to hold a second Confirm: this tab remembers the reserve per owner, offer and
 *  term, since its Confirm, and holds it like a kept key: for the whole offer, any term, as unresolvedMk does.
 *  A drawer opened on that offer starts on outcome unknown, and both confirm() and the locked admission refuse
 *  beside it, until the person's confirmed Start a new purchase forgets that term's hold
 *  (reserveUnknownAbandon).
 *  Memory only: a reload, or resetCommerce, forgets it. */
const reserveUnknown = new Map<string, { since: number; key?: string }>();
/** The hold of the admission that wrote `key`, once that key's own outcome is proven or this tab sends it itself: its
 *  admission dispatches it (the kept key then holds the offer), drops it, or the server confirms it (2xx, a held resend
 *  of it included). A hold of any other key stays. */
function releaseHoldOf(key: string | null | undefined): void {
  if (!key) return;
  for (const [id, v] of reserveUnknown) if (v.key === key) reserveUnknown.delete(id);
}
const ruId = (owner: string, offerId: string, days: string): string => JSON.stringify([owner, offerId, days]);
/** The remembered holds of this owner's offer, any term. */
function heldOf(owner: string, offerId: string): Array<{ id: string; days: string; since: number }> {
  const out: Array<{ id: string; days: string; since: number }> = [];
  for (const [id, v] of reserveUnknown) {
    const [o, i, d] = JSON.parse(id) as [string, string, string];
    if (o === owner && i === offerId) out.push({ id, days: d, since: v.since });
  }
  return out;
}
/** The shown user's remembered unresolved reserve of this offer (above): this term's, else another term's, or null. */
export function reserveUnknownFor(ctx: Ctx | null | undefined, offerId: string | null | undefined, days: string | null | undefined): { since: number; days: string } | null {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own || !offerId || !days) return null;
  const all = heldOf(own.owner, offerId);
  const h = all.find((x) => x.days === days) ?? all[0];
  return h ? { since: h.since, days: h.days } : null;
}
/** The person confirmed Start a new purchase on the remembered reserve of term `days` (the one the dialog showed), with no
 *  kept key shown. Under the pending lock (ordered with every admission and abandon of this browser), that term's hold
 *  goes only once the store PROVES the shown owner keeps no key of this offer, any term (marketPendingKept false):
 *  'dropped' (also when no hold of that term is left). A hold of another term was not shown in that dialog and may still
 *  go through, so it stays and keeps holding the offer. A key kept ('kept': its own Start a new purchase abandons it
 *  first) or a store that cannot say ('failed') keeps the hold. */
export function reserveUnknownAbandon(ctx: Ctx | null | undefined, offerId: string | null | undefined, days: string | null | undefined): Promise<'dropped' | 'kept' | 'failed'> {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own || !offerId || !days) return Promise.resolve('failed');
  return admitUnderLock((): 'dropped' | 'kept' | 'failed' => {
    if (!own.live()) return 'failed';
    const kept = marketPendingKept(own.owner, offerId);
    if (kept === null) return 'failed';
    if (kept) return 'kept';
    reserveUnknown.delete(ruId(own.owner, offerId, days));
    return 'dropped';
  }, 'failed' as const);
}
/** The kept key `key` of this term was abandoned (proved gone, marketPendingAbandon): this tab's hold of the term goes
 *  with it only when it is that key's own hold (the admission that wrote `key`), as the person's Start a new purchase
 *  covered both. A hold of another key (another admission, whose outcome is still unknown) stays and keeps holding the
 *  offer. `ctx` is the context the abandon was confirmed under: once it is not live (another account shown, signed
 *  out), nothing is forgotten (the hold stays: fail closed). */
export function reserveUnknownForget(ctx: Ctx | null | undefined, offerId: string | null | undefined, days: string | null | undefined, key: string | null | undefined): boolean {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own || !own.live() || !offerId || !days || !key) return false;
  const id = ruId(own.owner, offerId, days);
  const h = reserveUnknown.get(id);
  if (!h || h.key !== key) return false;
  return reserveUnknown.delete(id);
}
/** The displayed user's unresolved reserve intents (newest first), for the Market's recovery note after a reload. */
export function marketPendingFor(ctx: Ctx | null | undefined): MarketPending[] {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own) return [];
  return (readMk() || []).filter((e) => e.user_id === own.owner && openMk(e)).sort((a, b) => b.at - a.at);
}
/** A reserve dispatch's flight, before its transport starts: under a granted pending lock (admitUnderLock, so a lock
 *  not granted in time is false; the in-tab fallback is no lock), this owner's open entry with this key gets the
 *  flight, written and read back. false: a tombstone, a missing entry, a store that cannot be read or kept it, or no
 *  lock; that dispatch sends nothing. */
function marketFlightAdd(owner: string, key: string, flight: string): Promise<boolean> {
  return admitUnderLock((): boolean => {
    // Only under a granted Web Lock: the in-tab fallback orders this tab alone, so its whole-list
    // write could put back a key another tab abandoned. No lock, no flight, no send.
    if (!B.pendingLockHeld()) return false;
    const list = readMk();
    const e = list && list.find((x) => x.key === key);
    if (!list || !e || e.user_id !== owner || !openMk(e)) return false;
    const now = Date.now();
    // A key some tab already sent or is sending with no send list (code from before `sends`) has senders nobody recorded:
    // MK_PRIOR_SENDS marks them, so no dispatch's refusal ever reads the list as all its own.
    const prior = e.sends === undefined && (e.sent_at !== undefined || (e.flights || []).length > 0) ? [MK_PRIOR_SENDS] : [];
    e.flights = [...(e.flights || []).filter((f) => f.id !== flight && liveFlight(f, now)), { id: flight, at: now }].slice(-16);
    e.sent_at = e.sent_at ?? now;
    e.sends = [...(e.sends || prior), flight].slice(-MK_SENDS_MAX);
    if (!writeMk(list)) return false;
    const back = (readMk() || []).find((x) => x.key === key);
    return !!back && back.user_id === owner && openMk(back) && back.sent_at !== undefined && (back.sends || []).includes(flight) && (back.flights || []).some((f) => f.id === flight);
  }, false);
}
/** The send point of a reserve request (api still(), which the transport reads as the last check before every fetch of
 *  it, a 2FA retry and a send after a token refresh included): true only while the store holds this owner's open entry
 *  with this key and this dispatch's flight (marketFlightAdd) on it. A tombstone, a missing entry, a store that cannot
 *  be read, or a flight gone (an abandon deletes them): nothing is sent. Read-only: every write of the pending store
 *  is under its lock, so a gate's read can never put back an entry another tab abandoned or dropped.
 *  Synchronous, so nothing of this tab runs between it and the fetch; another tab's abandon landing in the same few
 *  ms (localStorage reaches other tabs asynchronously) is the window left. */
function marketSendGate(owner: string, key: string, flight: string): () => boolean {
  return (): boolean => {
    const e = (readMk() || []).find((x) => x.key === key);
    return !!e && e.user_id === owner && openMk(e) && (e.flights || []).some((f) => f.id === flight);
  };
}
/** A dispatch that got an HTTP answer (any status) or sent nothing is off the wire: its flight goes, under the lock.
 *  No answer (a timeout, a lost connection, an abort) keeps it: that fetch may still be out (api() gives up before a
 *  fetch that waited on a token refresh does, and a server may still run an aborted one), so it holds the key until
 *  stale. */
const flightEnded = (err: unknown): boolean => {
  if (notSent(err)) return true;
  const x = err as Err | null;
  return !!x && typeof x.status === 'number' && x.status > 0 && x.code !== 'TIMEOUT';
};
/** The dispatch's flight goes, under the lock. */
function marketFlightDone(key: string, flight: string): void {
  void B.withPendingLock(() => {
    // Unheld, the flight stays and goes stale: never a write without a granted lock.
    if (!B.pendingLockHeld()) return;
    const list = readMk();
    const e = list && list.find((x) => x.key === key);
    if (!list || !e || !(e.flights || []).some((f) => f.id === flight)) return;
    e.flights = (e.flights || []).filter((f) => f.id !== flight);
    if (!e.flights.length) delete e.flights;
    writeMk(list);
  }).then(() => undefined, () => undefined);
}

// ---- unresolved rents (stored per user: localStorage hub.v3.rent_pending, module memory as fallback) ----
// A rent has no idempotency key: when its outcome stays unknown (indeterminate, or not found by the reads) the
// marker says "this rental may exist". It outlives the dialog, a reload and the tab (stored, read only for its
// user; kept at sign-out like hub_money_pending: purge:false), and stays across a realm switch (rentals are
// account-wide). Module memory backs writes only after the rent was sent: a new rent whose hold storage cannot keep
// (written and read back) is refused before its POST (storageFailed); a later write storage refuses leaves the
// stored row as it was, still holding the server for every tab.
// While it is set a new rent of the same server is held; only confirm(true, {rentAgainAnyway: true}) sends one
// (the page says plainly it may create a second rental). It is released only by its own attempt's answer: a
// /rentals read is evidence, never a release (checkRentPending). Dismissing the warning hides it and never unlocks
// a re-rent. Every change is announced (subscribeRentPending), whichever dialog or tab made it.
export interface RentPending {
  readonly server_id: string; readonly name: string | null; readonly days: string; readonly at: number; readonly dismissed: boolean;
  /** The rent POST is still out (no answer yet): the hold is already on, so a dialog closed now still holds
   *  the next Confirm. A page may show this as "renting…" rather than "may have gone through". A stored
   *  "sending" older than the posting budget (its tab died mid-POST) reads false. */
  readonly sending: boolean;
  /** False when the hold could not be stored (storage blocked or full): only this tab remembers it. */
  readonly persisted: boolean;
}
// One marker per (owner, server, attempt): each rent dispatch (`attempt`) holds its own, and only its own answers
// move it (a /rentals read is evidence only). "Rent again anyway" adds attempt B beside A: B's outcome (a definite failure, a 2FA
// cancel, a confirmed rent) never clears or rewrites A's hold, which stays until A's own answer
// resolves it. A server is held while any attempt of it is.
type RentMark = RentPending & { owner: string; attempt: string };
const rentMarks = new Map<string, RentMark>();
const rentId = (owner: string, server: string, attempt: string): string => owner + '\u0000' + server + '\u0000' + attempt;
const RENT_PENDING = 'hub.v3.rent_pending';
const rentListeners = new Set<() => void>();
function rentChanged(): void { for (const l of [...rentListeners]) { try { l(); } catch { /* a listener's own */ } } }
/** Called on every change of the unresolved rents (this tab's or, through storage, another tab's). */
export function subscribeRentPending(fn: () => void): () => void {
  rentListeners.add(fn);
  return () => { rentListeners.delete(fn); };
}
// Another context wrote the store: through host-env, never a `typeof window` guard (the terminal Hub's strict window
// passes that guard and throws on use).
hostEnv().onExternalChange((_area, key) => { if (key === RENT_PENDING || key === null) rentChanged(); });
onBump((reason) => { if (!keepsChanges(reason)) { rentMarks.clear(); rentChanged(); } });
interface StoredRent { user_id: string; server_id: string; name: string | null; days: string; at: number; dismissed: boolean; sending: boolean; attempt: string }
function validRent(eIn: unknown): eIn is StoredRent {
  const e = eIn as Rec | null | undefined;
  return !!e && typeof e.user_id === 'string' && e.user_id.length > 0 && e.user_id.length <= 128
    && typeof e.server_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.server_id) && typeof e.days === 'string' && /^[0-9]{1,4}$/.test(e.days)
    && typeof e.at === 'number' && isFinite(e.at) && typeof e.dismissed === 'boolean' && typeof e.sending === 'boolean'
    && typeof e.attempt === 'string' && /^[\w-]{16,128}$/.test(e.attempt) && (e.name === null || (typeof e.name === 'string' && e.name.length <= 200));
}
// null = unreadable (not the same as empty).
function readRents(): StoredRent[] | null {
  let raw: string | null;
  try { raw = localStore().getItem(RENT_PENDING); } catch { return null; }
  try { const a: unknown = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter(validRent) : []; } catch { return []; }
}
// Never cut: every stored hold is unsettled (a hold
// leaves only on its own attempt's answer; a dismissed or stale-sending one still holds), so dropping one silently
// freed its server for a second rental. The list grows; a store too full to take it refuses the rent at its
// admission (storageFailed, the read-back in admitRent).
/** True when the list was written (false: storage blocked or full; memory still holds). */
function writeRents(list: StoredRent[]): boolean {
  try { if (list.length) localStore().setItem(RENT_PENDING, JSON.stringify(list)); else localStore().removeItem(RENT_PENDING); return true; } catch { return false; }
}
/** Rent writes waiting for the lock (rentId → the mark to store, or null to drop): until they land, this tab's
 *  view of that attempt is the queued value, never the stored one. */
const rentQueued = new Map<string, RentMark | null>();
/** Queued writes that only set `dismissed` on the marker stored when the lock is granted (never a stale copy). */
const rentPatch = new Set<string>();
/** The read-modify-write of one attempt's stored marker. Call only under the pending lock. */
function storeRent(id: string, m: RentMark | null): boolean {
  const list = readRents();
  if (!list) return false;
  const rest = list.filter((x) => rentId(x.user_id, x.server_id, x.attempt) !== id);
  if (!m && rest.length === list.length) return true;
  return writeRents(m ? [...rest, storedOf(m)] : rest);
}
/** Queues one attempt's write on the pending lock; the latest queued value of an attempt is the one stored. */
function queueRent(id: string, m: RentMark | null, patch = false): void {
  if (patch && rentQueued.has(id) && !rentPatch.has(id)) {
    // A full write already waits (an answer ending "sending"): the dismiss joins it, so that write is never lost;
    // a queued drop stays a drop.
    const q0 = rentQueued.get(id) as RentMark | null;
    rentQueued.set(id, q0 ? { ...q0, dismissed: true } : null);
  } else {
    rentQueued.set(id, m);
    if (patch) rentPatch.add(id); else rentPatch.delete(id);
  }
  void B.withPendingLock(() => {
    if (!rentQueued.has(id)) return;
    const q = rentQueued.get(id) as RentMark | null;
    rentQueued.delete(id);
    if (rentPatch.delete(id) && q) {
      // A dismiss: applied to the marker as stored now. One gone from storage was resolved elsewhere (a drop, a
      // read): it stays gone, and this tab's stored copy goes too (a memory-only one stays).
      const list = readRents();
      const e = list ? list.find((x) => rentId(x.user_id, x.server_id, x.attempt) === id) : undefined;
      const cur = rentMarks.get(id);
      if (e) { const ok = storeRent(id, { ...markOf(e), dismissed: true }); if (cur) rentMarks.set(id, { ...markOf(e), dismissed: true, persisted: ok }); }
      else if (list && cur && cur.persisted) rentMarks.delete(id);
      rentChanged();
      return;
    }
    const ok = storeRent(id, q);
    const cur = rentMarks.get(id);
    if (q && cur && cur.at === q.at && cur.sending === q.sending && cur.dismissed === q.dismissed) rentMarks.set(id, { ...cur, persisted: ok });
    rentChanged();
  }).then(null, () => { /* memory still holds; the next write retries */ });
}
const markOf = (e: StoredRent): RentMark => ({ owner: e.user_id, server_id: e.server_id, name: e.name, days: e.days, at: e.at, dismissed: e.dismissed, sending: e.sending, attempt: e.attempt, persisted: true });
const storedOf = (m: RentMark): StoredRent => ({ user_id: m.owner, server_id: m.server_id, name: m.name, days: m.days, at: m.at, dismissed: m.dismissed, sending: m.sending, attempt: m.attempt });
/** Every attempt's marker of the owner, per server, oldest first: the stored ones (another tab's, or before a
 *  reload) win over this tab's memory for the same attempt. One read and parse of the store, whatever the number of
 *  servers (`server` only narrows the result). */
function rentsByServer(owner: string, server?: string): Map<string, RentMark[]> {
  const by = new Map<string, Map<string, RentMark>>();
  const put = (m: RentMark): void => {
    let g = by.get(m.server_id);
    if (!g) by.set(m.server_id, (g = new Map()));
    g.set(m.attempt, m);
  };
  const list = readRents();
  const stored = list ? new Set(list.filter((x) => x.user_id === owner).map((x) => rentId(x.user_id, x.server_id, x.attempt))) : null;
  // This tab's memory counts only for holds that never reached storage (persisted false) or while storage
  // cannot be read; one that was stored and is gone from readable storage was resolved elsewhere (another tab).
  for (const [id, m] of [...rentMarks]) {
    if (m.owner !== owner || (server !== undefined && m.server_id !== server)) continue;
    if (rentQueued.has(id)) { put(m); continue; }
    if (stored && m.persisted && !stored.has(id)) { rentMarks.delete(id); continue; }
    put(list ? m : { ...m, persisted: false });
  }
  for (const e of list || []) {
    if (e.user_id === owner && (server === undefined || e.server_id === server) && !rentQueued.has(rentId(owner, e.server_id, e.attempt))) put(markOf(e));
  }
  const out = new Map<string, RentMark[]>();
  for (const [sv, g] of by) out.set(sv, [...g.values()].sort((a, b) => a.at - b.at));
  return out;
}
/** Every attempt's marker of (owner, server), oldest first (rentsByServer). */
function rentsOf(owner: string, server: string): RentMark[] { return rentsByServer(owner, server).get(server) ?? []; }
/** Writes one attempt's marker: at once when `locked` (the caller holds the pending lock), else queued on it. */
function putRent(m: RentMark, locked = false): void {
  const id = rentId(m.owner, m.server_id, m.attempt);
  if (locked) { rentQueued.delete(id); rentMarks.set(id, { ...m, persisted: storeRent(id, m) }); }
  else { const mark = { ...m, persisted: true }; rentMarks.set(id, mark); queueRent(id, mark); }
  rentChanged();
}
/** Drops the marker of `attempt` only (another attempt's hold of the same server stays), queued on the lock. */
function dropRent(owner: string, server: string, attempt: string): void {
  const id = rentId(owner, server, attempt);
  rentMarks.delete(id);
  queueRent(id, null);
  rentChanged();
}
/** Writes the hold of `attempt`: a dispatch (sending) writes it fresh; an unknown answer (or a confirmation shown
 *  to nobody) writes its own marker, never another attempt's. */
function markRent(owner: string, row: MarketRow, server: string, days: string, sending: boolean, attempt: string, locked = false): void {
  const was = rentsOf(owner, server).find((m) => m.attempt === attempt);
  // `at` is when this rent was sent (an unknown answer keeps it; the posting budget counts from it).
  const at = was && !sending ? was.at : Date.now();
  putRent({ owner, server_id: server, name: typeof row.name === 'string' ? row.name.slice(0, 200) : null, days: String(days), at, dismissed: sending ? false : !!was?.dismissed, sending, attempt, persisted: false }, locked);
}
/** Clears `attempt`'s hold only (its proven or refused outcome says nothing of another attempt's). */
function clearRent(owner: string, server: string, attempt: string): void { dropRent(owner, server, attempt); }
function rentHeld(owner: string, server: string): boolean { return rentsOf(owner, server).length > 0; }
// A stored "sending" older than the posting budget (its tab died mid-POST) is no longer live.
const rentLive = (m: RentMark): boolean => m.sending && Date.now() - m.at < budgets.postingMs + 10000;
/** True while a rent POST of (owner, server) is still out, in this tab or another. */
function rentSending(owner: string, server: string): boolean { return rentsOf(owner, server).some(rentLive); }
/** The displayed user's unresolved rents (newest first), dismissed ones included (the hold stays). */
export function rentPendingFor(ctx: Ctx | null | undefined): RentPending[] {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own) return [];
  // One row per server: the newest attempt's, sending while any attempt's POST is still out, dismissed only
  // when every attempt's warning was. One read of the store for every server (a
  // read per server grew with the square of the servers held, the list being never cut).
  // A server whose holds were all resolved elsewhere (gone from storage) has none left: no row.
  return [...rentsByServer(own.owner).values()].filter((all) => all.length > 0).map((all) => {
    const m = all[all.length - 1]!;
    return { server_id: m.server_id, name: m.name, days: m.days, at: m.at, dismissed: all.every((x) => x.dismissed), sending: all.some(rentLive), persisted: all.every((x) => x.persisted) };
  }).sort((a, b) => b.at - a.at);
}
/** Hides the warning; the re-rent hold stays. */
export function dismissRentPending(ctx: Ctx | null | undefined, server: string): void {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own) return;
  for (const m of rentsOf(own.owner, server)) {
    const id = rentId(m.owner, m.server_id, m.attempt);
    const mark = { ...m, dismissed: true };
    rentMarks.set(id, mark);
    queueRent(id, mark, true);
  }
  rentChanged();
}
/** One fresh /rentals read for an unresolved rent: 'active' (an active rental of the server is listed), 'absent'
 *  (none is), or 'unknown' (a failed read, or a newer attempt since). Evidence only: no read releases a marker. A rent
 *  has no key, so neither one rental nor its absence after any wait says what became of each attempt:
 *  only the attempt's own answer ends its hold ("Rent again anyway" adds a new attempt beside it). */
export async function checkRentPending(ctx: Ctx | null | undefined, server: string): Promise<'active' | 'absent' | 'unknown'> {
  const own = ctx ? shownOwner(ctx) : null;
  const before = own ? rentsOf(own.owner, server) : [];
  if (!own || !before.length) return 'unknown';
  let list: unknown;
  try { list = ((await viaOwner(own, rentalsRoute)) as Env | null)?.data; } catch { return 'unknown'; }
  const now = rentsOf(own.owner, server);
  // A newer attempt (or a rent sent again) since the read began: this read says nothing about it.
  const same = now.length === before.length && now.every((m, i) => m.attempt === before[i]!.attempt && m.at === before[i]!.at);
  if (!same || !own.live() || !Array.isArray(list)) return 'unknown';
  return list.some((r) => { const x = asRec(r); return x.status === 'active' && x.server_id === server; }) ? 'active' : 'absent';
}

/** An admission under the pending lock, waiting at most bounds.read: past that it is `late` (fail closed) and a
 *  lock granted later runs nothing. Once `fn` has run, its result is the answer, however late it arrives. */
function admitUnderLock<T, L>(fn: () => T, late: L): Promise<T | L> {
  let ran = false, gaveUp = false;
  return new Promise<T | L>((resolve) => {
    const t = setTimeout(() => { if (!ran) { gaveUp = true; resolve(late); } }, bounds.read);
    B.withPendingLock((): T | L => { if (gaveUp) return late; ran = true; return fn(); }).then(
      (v) => { clearTimeout(t); if (!gaveUp) resolve(v); },
      () => { clearTimeout(t); if (!gaveUp) resolve(late); },
    );
  });
}

// ---- the Market purchase machine (rent / reserve) ----
// The driver of commerce-pure's transition table (purchaseTransition), headless: the four invariants of today's
// Market hold (canClose false only while posting/reconciling; nothing leaves a terminal by itself; op tokens
// gate state; only a replay 2xx proves a reserve).
export interface PurchaseOptions {
  /** A re-quote the server returned for this duration: a new confirm sends it as the ceiling (a new intent). */
  requote?: { days: string; totalCents: number } | null;
  /** An unresolved reserve intent of this user (marketPendingFor): start at outcome unknown with the stored request. */
  recover?: MarketPending | null;
  onChange?: (s: PurchaseSnapshot) => void;
}
export interface Failure {
  code: string | null; status: unknown; /** The rejection's allow-listed facts (errorInfo), for Details. */ info?: ErrorInfo; requiredCents?: number | null; availableCents?: number | null; requote?: boolean;
  requoteCents?: number; requoteRentalCents?: number | null; requoteFeeCents?: number | null; availableDays?: Record<string, true> | null;
}
export interface PurchaseSnapshot {
  state: string; mode: string | null; rail: 'rent' | 'reserve'; canClose: boolean; notice: string | null; owner: string | null;
  idemKey: string | null; ceiling: number | null; receipt: Rec | null; replayed: boolean; advisory: boolean; advisoryKind: string | null;
  lateHint: boolean; entry: string | null; failure: Failure | null; reconfirm: boolean; banned: boolean; retryIn: number;
  /** @deprecated Always false: the reserve flow never re-sends by itself; kept for the snapshot's shape. */
  autoReplayUsed: boolean;
  /** A manual Retry is waiting on its admission (the Retry-After check under the pending lock); nothing sent yet. */
  retrying: boolean;
}
export type PurchaseConfirm = { ok: true } | { ok: false; reason: 'consent' | 'busy' | 'accountChanged' | 'unquotable' | 'storage' | 'unresolved' };
export interface Purchase {
  /** c.rentAgainAnyway: send a rent although an unresolved one of this server is held (may create a second rental). */
  confirm(agreed: boolean, c?: { rentAgainAnyway?: boolean }): PurchaseConfirm;
  retry(): boolean;
  retryRent(): boolean;
  checkAgain(): boolean;
  refresh(): Promise<boolean>;
  dismiss(): boolean;
  snapshot(): PurchaseSnapshot;
  /** The dialog is gone: no more onChange, no new read, replay or timer. A pending answer still keeps the store right. */
  dispose(): void;
  /** Undoes dispose (a remount of the same dialog). */
  resume(): void;
}

interface PM {
  state: string; mode: string | null; op: number; rail: 'rent' | 'reserve'; days: string; ceiling: number | null; idemKey: string | null;
  own: ShownOwner | null; attemptAt: string | null; receipt: Rec | null; replayed: boolean; err: unknown; entry: string | null;
  /** The rent attempt now out (new at each dispatch): the hold it wrote is moved only by its own answers. */
  rentAttempt: string | null;
  advisoryKind: string | null; advisory: boolean; lateHint: boolean; autoReplayUsed: boolean;
  retryAfterS: number | null; retryArmedAt: number; reconfirm: boolean; notice: string | null; failure: Failure | null;
}

/** `proven`: core itself decided this answer is a definite pre-commit refusal (the 500 PRICING_INVALID of a fresh rent
 *  or reserve). api() marks every sent 5xx pending; the facts then carry core's decision, so the view says it
 *  failed (and offers Try again) instead of "may have gone through" with nothing held to check. */
function failureOf(err: unknown, proven = false): Failure {
  const e = err as Err | null;
  const d = M.errData(err) || {};
  const facts = proven && e ? { status: e.status, code: e.code, traceId: (e as { traceId?: unknown }).traceId, route: (e as { route?: unknown }).route } : err;
  const f: Failure = { code: (e && e.code) || null, status: e && e.status, info: errorInfo(facts) };
  if (e && e.code === 'INSUFFICIENT_BALANCE') { f.requiredCents = isCount(d.required_cents) ? d.required_cents : null; f.availableCents = isCount(d.available_cents) ? d.available_cents : null; }
  // The server's own re-quote for this duration: the dialog shows it and a new confirm
  // sends it as the ceiling, which is a new intent (a new reserve key).
  if (e && /^(CHARGE_EXCEEDS_MAX|CHARGE_CONFIRMATION_REQUIRED|SETUP_FEE_CONFIRMATION_REQUIRED)$/.test(e.code || '')) {
    f.requote = true;
    if (isCount(d.total_cents)) {
      f.requoteCents = d.total_cents;
      f.requoteRentalCents = isCount(d.rental_cents) ? d.rental_cents : null;
      f.requoteFeeCents = isCount(d.setup_fee_cents) ? d.setup_fee_cents : null;
    }
  }
  if (e && e.code === 'INVALID_DURATION') f.availableDays = M.readAvailableDays(d);
  return f;
}

// withDeadline: the deadline also kills `fence` (the request's own signal): a request still waiting for a token
// refresh or the 2FA prompt when it fires is never sent.
function withDeadline<T>(promise: Promise<T>, ms: number, onLate: (v: T) => void, fence: Att): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      kill(fence);
      reject({ status: 0, code: 'OP_DEADLINE', message: 'deadline' });
      promise.then((v) => { onLate(v); }, (e: unknown) => { classifyMarket(e); });
    }, ms);
    promise.then(
      (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); },
      (e: unknown) => { if (done) return; done = true; clearTimeout(timer); reject(e); });
  });
}

/**
 * createPurchase(row, days, {requote, recover, onChange}) -> the machine for one confirm dialog. `row` is a
 * normalized stock or offer row. The owner and context are captured HERE, when the dialog opens.
 */
export function createPurchase(row: MarketRow, days: string, o: PurchaseOptions = {}): Purchase {
  const ctx = capture();
  const dialogOwn = shownOwner(ctx);
  const rowId = row.id;
  const pm: PM = {
    state: 'idle', mode: null, op: 0, rail: row.kind === 'stock' ? 'rent' : 'reserve', days, ceiling: null, idemKey: null, own: null,
    attemptAt: null, receipt: null, replayed: false, err: null, entry: null, rentAttempt: null, advisoryKind: null, advisory: false, lateHint: false,
    autoReplayUsed: false, retryAfterS: null, retryArmedAt: 0, reconfirm: false,
    notice: dialogOwn && dialogOwn.live() ? null : 'accountChanged', failure: null,
  };
  let disposed = false;
  let retryAdmitting = false; // a manual Retry waiting on its admission under the pending lock
  // Set while confirm() applies its rent dispatch: admitRent marks that rent under the cross-tab lock.
  let admittingRent = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  }
  function unlater(t: ReturnType<typeof setTimeout>): void { clearTimeout(t); timers.delete(t); }

  // o.recover: an unresolved reserve intent of this user (marketPendingFor). The machine starts in its
  // outcome-unknown state with the stored request (key, term, ceiling): Retry replays exactly that request
  // with replay semantics (only a 2xx is definitive), Refresh reads the reservations, Close keeps the entry.
  const rec = o.recover;
  if (rec && pm.rail === 'reserve' && dialogOwn && dialogOwn.live() && rec.user_id === dialogOwn.owner && rec.offer_id === rowId && rec.days === String(days)) {
    pm.state = 'indeterminate'; pm.mode = 'replay'; pm.idemKey = rec.key; pm.ceiling = rec.ceiling; pm.own = dialogOwn;
    pm.attemptAt = new Date(rec.at).toISOString();
    const until = marketRetryUntilFor(rec.key);
    if (until !== undefined && until > Date.now()) { pm.retryAfterS = Math.ceil((until - Date.now()) / 1000); pm.retryArmedAt = Date.now(); }
  }

  function changed(): void {
    if (disposed || typeof o.onChange !== 'function') return;
    try { o.onChange(snapshot()); } catch { /* view error */ }
  }
  function apply(ev: string): ReturnType<typeof M.purchaseTransition> {
    const next = M.purchaseTransition(pm.state, ev, pm.mode);
    if (!next) return null;
    pm.state = next.state; pm.mode = next.mode; pm.op++;
    if (pm.rail === 'rent' && pm.own && rowId) {
      // The hold is written when the rent is dispatched (posting), before any answer: a dialog closed or
      // disposed mid-POST (its reconciliation never runs) still leaves it. Only a proven outcome (confirmed)
      // or a definite refusal (failed) clears it; an unknown one (indeterminate, not-found) keeps it.
      // Each dispatch is a new attempt; every later move touches only that attempt's own marker.
      // A Confirm's dispatch marks under the cross-tab lock instead (admitRent): not here.
      if (pm.state === 'posting') { if (!admittingRent) { pm.rentAttempt = newKey(); markRent(pm.own.owner, row, rowId, pm.days, true, pm.rentAttempt); } }
      else if (pm.rentAttempt === null) { /* no rent dispatched by this dialog: no hold of its own */ }
      // A disposed dialog's unknown answer is still written (sending false): the hold stays on and only moves
      // from "renting..." to "may have gone through", which is what a closed dialog's user must see.
      else if (pm.state === 'indeterminate' || pm.state === 'not-found' || pm.state === 'reconciling') markRent(pm.own.owner, row, rowId, pm.days, false, pm.rentAttempt);
      // The attempt's own definite answer is the only thing that ends its hold (no read releases a marker: a /rentals
      // match, from the reconciliation or the machine's checkAgain, leaves the attempt indeterminate (advisory), and
      // checkRentPending is evidence only). A definite refusal (failed) ends it shown or not:
      // nothing was rented, so a new rent cannot double one. A confirmation (only ever this POST's own answer) ends it
      // only when shown: a closed dialog's answer is shown to nobody, so its hold stays, moved to
      // "may have gone through", and the next Confirm is held instead of renting twice; Dismiss hides it and the
      // warned Rent again anyway still sends.
      else if (pm.state === 'failed' || (pm.state === 'confirmed' && !disposed)) clearRent(pm.own.owner, rowId, pm.rentAttempt);
      else if (pm.state === 'confirmed') markRent(pm.own.owner, row, rowId, pm.days, false, pm.rentAttempt);
    }
    if (next.bannedNow) marketLatch.banned = true;
    if (next.advisory) pm.advisory = true;
    if (next.reconfirm) pm.reconfirm = true;
    return next;
  }
  const ownerGone = (): boolean => !pm.own || !pm.own.live();

  // Confirm: consent, an owner that still holds, a quotable intent: else nothing is sent.
  function confirm(agreed: boolean, c: { rentAgainAnyway?: boolean } = {}): PurchaseConfirm {
    if (!agreed) return { ok: false, reason: 'consent' };
    if (pm.state !== 'idle') return { ok: false, reason: 'busy' };
    if (!dialogOwn || !dialogOwn.live()) { pm.notice = 'accountChanged'; changed(); return { ok: false, reason: 'accountChanged' }; }
    const q = M.quoteFor(row, pm.days);
    // A row with no id cannot be addressed: nothing is sent for it.
    if (!q || typeof q.totalCents !== 'number' || !rowId) return { ok: false, reason: 'unquotable' };
    const rq = (o.requote && o.requote.days === pm.days) ? o.requote : null;
    const ceiling = rq ? rq.totalCents : q.totalCents;
    if (pm.rail === 'reserve') {
      // An unresolved reserve of this offer is resolved only by a confirmed resend (a replay of its exact request) or
      // dropped by the person's confirmed Start a new purchase on its unknown view: a fresh Confirm never sends beside
      // it, and never reuses its key with other bytes.
      const earlier = unresolvedMk(dialogOwn.owner, rowId);
      if (earlier === null) { pm.notice = 'storageFailed'; changed(); return { ok: false, reason: 'storage' }; }
      if (earlier || heldOf(dialogOwn.owner, rowId).length > 0) { pm.notice = 'unresolvedReserve'; changed(); return { ok: false, reason: 'unresolved' }; }
    }
    // An unresolved rent of this server (any dialog of this tab) holds a new one, unless the user explicitly
    // chose to rent again anyway. While a rent of it is still being sent (this tab's or another's), even rent
    // again anyway is refused (busy): its answer may come any moment, and nothing is known yet to decide on.
    if (pm.rail === 'rent' && c.rentAgainAnyway && rentSending(dialogOwn.owner, rowId)) { changed(); return { ok: false, reason: 'busy' }; }
    if (pm.rail === 'rent' && rentHeld(dialogOwn.owner, rowId) && !c.rentAgainAnyway) { pm.notice = 'unresolvedRent'; changed(); return { ok: false, reason: 'unresolved' }; }
    pm.notice = null;
    pm.ceiling = ceiling;
    pm.own = dialogOwn; // before apply: a rent's hold is written at posting, under this owner
    admittingRent = pm.rail === 'rent';
    try { apply('confirm'); } finally { admittingRent = false; }
    pm.attemptAt = new Date().toISOString();
    changed();
    if (pm.rail === 'reserve') admitReserve(dialogOwn.owner, ceiling);
    else admitRent(dialogOwn.owner, !!c.rentAgainAnyway);
    return { ok: true };
  }
  // An admission abandoned (disposed) while this dispatch is still the machine's: nothing was sent, back to idle.
  function backToIdle(op: number): void {
    if (op !== pm.op || pm.state !== 'posting') return;
    pm.state = 'idle'; pm.mode = null; pm.op++; pm.attemptAt = null;
  }
  // The rent's admission: the hold check and the hold's mark run together under the cross-tab pending
  // lock (the checks in confirm only refuse early), so two tabs never both send a rent of one server unless the
  // user chose rent again anyway (and even then never while another rent of it is still being sent). The mark
  // is written before the POST leaves. A refusal here puts the machine back to idle with its notice: nothing
  // was sent and nothing stays marked (storageFailed and a lock failing after the callback remove the mark the
  // callback wrote).
  function admitRent(owner: string, anyway: boolean): void {
    const op = pm.op, id = rowId as string;
    // The attempt this admission marked, if its callback got that far: a lock that fails after the callback ran
    // answers 'busy' with the mark (sending) already written, and no POST follows.
    let marked: string | null = null;
    admitUnderLock((): 'busy' | 'unresolvedRent' | 'noLocks' | 'storageFailed' | { attempt: string } => {
      if (rentSending(owner, id)) return anyway ? 'busy' : 'unresolvedRent';
      if (!anyway && rentHeld(owner, id)) return 'unresolvedRent';
      if (!B.pendingLockHeld()) return 'noLocks';
      const attempt = newKey();
      marked = attempt;
      markRent(owner, row, id, pm.days, true, attempt, true);
      // The hold must be stored, read back, before the rent may leave, as a reserve's key is (persistNewKey): a hold
      // only this tab's memory keeps is lost to a reload and invisible to another tab, whose plain Confirm would then
      // rent the same server again with no warning if this answer is lost. Nothing was
      // sent: the mark goes and the admission refuses with storageFailed, as a reserve's does. A write that landed
      // but cannot be read back is removed too (best effort, still under the lock), so no other tab reads a
      // "renting" hold for a rent that never left.
      const back = readRents();
      if (!back || !back.some((x) => x.user_id === owner && x.server_id === id && x.attempt === attempt && x.sending)) {
        storeRent(rentId(owner, id, attempt), null);
        rentMarks.delete(rentId(owner, id, attempt));
        marked = null;
        rentChanged();
        return 'storageFailed';
      }
      return { attempt };
    }, 'busy' as const).then((r) => {
      // Refused after its mark was written (the lock's promise rejected after the callback, commerce-pure
      // withPendingLock): nothing was sent for this attempt, so its mark goes; else it would say "renting" for an
      // attempt no machine owns, released by no answer.
      if (typeof r === 'string' && marked) dropRent(owner, id, marked);
      // Admitted but this dispatch moved on (a dispose, another op): nothing is sent, so its fresh mark goes,
      // and a disposed dialog still at this dispatch goes back to idle (a resume shows it closable).
      if (typeof r !== 'string' && (op !== pm.op || pm.state !== 'posting' || disposed)) { dropRent(owner, id, r.attempt); backToIdle(op); return; }
      if (disposed) { backToIdle(op); return; }
      if (op !== pm.op || pm.state !== 'posting') return;
      if (typeof r === 'string') {
        pm.state = 'idle'; pm.mode = null; pm.op++; pm.notice = r === 'busy' ? null : r; pm.attemptAt = null; changed();
        return;
      }
      pm.rentAttempt = r.attempt;
      changed();
      dispatchPost();
    });
  }
  // The reserve's admission: the unresolved check and the key's persistence run together under the
  // cross-tab pending lock (the check above only refuses early), so two tabs never persist two keys for one
  // offer. A refusal here puts the machine back to idle with its notice: nothing was sent.
  function admitReserve(owner: string, ceiling: number): void {
    const op = pm.op;
    // Set once the callback's write of this admission's key landed, whether or not its read-back proved it. The key may
    // then stay behind, never sent, for another tab to recover and send, so two answers become this item's unresolved
    // reserve (outcome unknown), never "not sent": a lock that rejects after the write ('busy', late),
    // and a granted lock whose read-back failed or found other bytes
    // ('storageFailed'). The drawer reads either refusal as "not
    // sent" once no key is kept, and the other tab may already have sent and dropped it. A refusal whose callback never
    // wrote (the lock wait gave up, the lock never granted, a store that could not be read or written) left nothing of
    // this admission and keeps its own answer.
    let saved = false;
    // The term and Confirm time of this admission, for the remembered hold below (taken now: the machine may move on).
    const heldDays = pm.days;
    const heldSince = pm.attemptAt ? Date.parse(pm.attemptAt) : Date.now();
    admitUnderLock((): string | { key: string } => {
      const earlier = unresolvedMk(owner, rowId as string);
      if (earlier === null) return 'storageFailed';
      if (earlier) return 'unresolvedReserve';
      // A hold this tab remembered since the early check (another admission's), under the same lock.
      if (heldOf(owner, rowId as string).length > 0) return 'unresolvedReserve';
      if (!B.pendingLockHeld()) return 'noLocks';
      // Every landed write is held at once, inside the lock, proved or not: if the lock then rejects late, another tab may
      // send and drop the key before this tab's answer, and an admission waiting behind it must still see a hold.
      // This admission releases it itself, in its answer, only by sending or dropping its
      // own proved key; meanwhile the kept key holds the offer anyway, so the hold refuses nothing new.
      const k = persistNewKey(owner, row, rowId as string, pm.days, ceiling, (key) => {
        saved = true;
        reserveUnknown.set(ruId(owner, rowId as string, heldDays), { since: heldSince, key });
      });
      return k ? { key: k } : 'storageFailed';
    }, 'busy' as const).then((r) => ((r === 'busy' || r === 'storageFailed') && saved ? 'unresolvedReserve' as const : r), () => 'storageFailed' as const).then((r) => {
      // This admission's own key was written and may be gone (reserveUnknown): remembered whatever became of the
      // machine meanwhile (disposed, another op), so a drawer opened later on this term holds it.
      // (Set inside the lock above; an unresolvedReserve answer keeps it.)
      if (typeof r !== 'string' && (op !== pm.op || pm.state !== 'posting' || disposed)) {
        const key = r.key;
        // The hold goes only with a proved removal of the unsent key: absent (another tab may have sent
        // and dropped it), in flight in some tab, or a store or lock that cannot say, the hold stays.
        void marketPendingDropUnsent(owner, key).then((gone) => { if (gone) releaseHoldOf(key); });
        backToIdle(op);
        return;
      }
      if (disposed) { backToIdle(op); return; }
      if (op !== pm.op || pm.state !== 'posting') return;
      if (typeof r === 'string') {
        pm.state = 'idle'; pm.mode = null; pm.op++; pm.notice = r === 'busy' ? null : r; pm.attemptAt = null; changed();
        return;
      }
      pm.idemKey = r.key;
      // Sent by this admission itself, under its own proved key: the kept key and this machine track it from here.
      releaseHoldOf(r.key);
      changed();
      dispatchPost();
    });
  }
  function eventFor(err: unknown): string {
    // Refused before sending (another user, a dead context): definitively nothing happened.
    if (notSent(err)) return 'typed_4xx';
    // api() reports a sent change with a 5xx answer as pending; the server's typed 5xx (PRICING_INVALID) is its
    // own rule, every other lost or late answer is ambiguous.
    if (isPending(err)) {
      const st = (err as Err).status;
      return typeof st === 'number' && st >= 500 && st < 600 ? M.postEventFor(pm.rail, err) : 'transport_ambiguous';
    }
    return M.postEventFor(pm.rail, err);
  }
  function dispatchPost(): void {
    const op = pm.op, isRent = pm.rail === 'rent';
    const id = rowId as string;
    // Each dispatch (the first POST, a manual Retry) has its own fence: once its posting
    // budget expired, that request can never leave, however long the shell waited before it.
    const fence = newAtt();
    const common = { recovers: true, timeoutMs: budgets.postingMs, signal: fence.ctl.signal };
    // A reserve's flight is registered under the pending lock first (marketFlightAdd); every send point then re-reads
    // the kept request and the flight (marketSendGate): abandoned, gone or not registered, nothing leaves.
    const flight = isRent ? null : M.newIdemKey();
    const key = pm.idemKey as string, owner = pm.own ? pm.own.owner : '';
    // Whether this dispatch's flight was registered (so its request may have left): set before the request is made.
    let flown = false;
    const posting: Promise<Env> = isRent
      ? viaOwner(pm.own, rentRoute, { ...common, params: { id }, body: { rental_days: parseInt(pm.days, 10), max_charge_cents: pm.ceiling as number } })
      : marketFlightAdd(owner, key, flight as string).then((ok) => {
        flown = ok;
        return viaOwner(pm.own, reserveRoute, { ...common, still: ok ? marketSendGate(owner, key, flight as string) : () => false, params: { id }, body: { days: parseInt(pm.days, 10), max_charge_cents: pm.ceiling as number, idempotency_key: key } });
      });
    if (flight) posting.then(() => marketFlightDone(key, flight), (err: unknown) => { if (flightEnded(err)) marketFlightDone(key, flight); });
    withDeadline(posting, budgets.postingMs, lateSettlement, fence).then((resp) => {
      if (op !== pm.op || pm.state !== 'posting') { lateSettlement(resp); return; }
      if (ownerGone()) { ownerLeft(); return; }
      // A 2xx out of the route's shape, or about another server, offer or term, proves nothing: the outcome is unknown,
      // the key and the hold stay (C9). A rent settles unknown at once: its /rentals reads could end it not-found
      // ("Rent again") after the server already answered 2xx.
      if (!M.validMarketReceipt(pm.rail, resp && resp.data, { id, days: parseInt(pm.days, 10) })) {
        apply('transport_ambiguous'); if (isRent) apply('reconcile_budget_expired'); settled(); return;
      }
      pm.receipt = (resp && (resp.data as Rec | null)) || null;
      pm.replayed = !!(pm.receipt && pm.receipt.replayed);
      apply('http_2xx');
      if (pm.rail === 'reserve') { void marketPendingDrop(pm.idemKey); releaseHoldOf(pm.idemKey); } // the intent is spent the moment the server confirms it; its hold goes with it
      settled();
    }, (err: unknown) => {
      if (op !== pm.op || pm.state !== 'posting') return;
      classifyMarket(err);
      pm.err = err;
      const ev = eventFor(err);
      if (ev === 'rent_409_server_unavailable') pm.entry = 'unavailable';
      if (ev === 'http_429') {
        const ra = (err as Err | null)?.retryAfter;
        pm.retryAfterS = typeof ra === 'number' ? ra : null; pm.retryArmedAt = Date.now();
        // Kept by key too, so a machine rebuilt from the kept record (a held view) still waits it out.
        if (pm.rail === 'reserve' && pm.idemKey && pm.retryAfterS != null) marketRetryAt(pm.idemKey, pm.retryArmedAt + pm.retryAfterS * 1000);
      }
      if (ev === 'http_409_intent_mismatch') pm.advisoryKind = 'exists';
      const replay = pm.mode === 'replay';
      apply(ev);
      // A definitive refusal of a fresh request: nothing was charged. A replay's refusal proves nothing about
      // the original request, so its entry stays.
      // Its entry goes only by proof: a dispatch whose flight never
      // registered sent nothing, but another tab may have sent the key meanwhile (marketPendingDropUnsent); a registered
      // one's refusal covers only its own request (marketPendingDropOwn). Unproved, the key stays and holds the offer.
      if ((pm.state as string) === 'failed') {
        pm.failure = failureOf(err, ev === 'http_5xx_pricing_invalid' && !replay);
        if (pm.rail === 'reserve' && !replay && flight) void (flown ? marketPendingDropOwn(owner, key, flight) : marketPendingDropUnsent(owner, key));
      }
      settled();
    });
  }
  // An answer that arrives after the dialog's owner stopped holding (the Hub displays someone else, or the
  // stored session moved) is never shown as this purchase's confirmation: the outcome is unknown, and nothing
  // more is read or sent for it.
  function ownerLeft(): void {
    apply('transport_ambiguous');
    if (pm.state === 'reconciling') apply('reconcile_budget_expired');
    changed();
  }
  function settled(): void {
    changed();
    if (disposed || pm.state !== 'reconciling') return;
    if (pm.rail === 'rent') rentReads(budgets.reconcileMs);
    else reserveRecovery();
  }
  function lateSettlement(resp: Env | null | undefined): void {
    if (pm.state !== 'indeterminate' || !resp || !resp.data) return;
    pm.lateHint = true;
    changed();
  }
  const reconciling = (op: number): boolean => op === pm.op && pm.state === 'reconciling' && !disposed;

  // Rent: up to 3 x GET /rentals. An active rental of this server is evidence only (a rent has no key): read_match
  // marks the attempt advisory, it stays indeterminate (unknown) and keeps its hold; nothing here confirms or releases it.
  function rentReads(budgetMs: number): void {
    const op = pm.op;
    let reads = 0, failures = 0;
    const timer = later(() => { if (reconciling(op)) { apply('reconcile_budget_expired'); changed(); } }, budgetMs);
    function settle(ev: string): void { unlater(timer); if (!reconciling(op)) return; apply(ev); changed(); }
    function again(): void {
      if (reads >= 3) { settle(failures > 0 ? 'reads_exhausted_failure' : 'reads_clean_no_match'); return; }
      later(readOnce, budgets.readRetryMs);
    }
    function readOnce(): void {
      if (!reconciling(op)) return;
      viaOwner(pm.own, rentalsRoute).then((resp) => {
        if (!reconciling(op)) return;
        if (ownerGone()) { settle('reads_exhausted_failure'); return; } // the ledger read no longer speaks for this owner
        reads++;
        const list = resp && resp.data;
        if (!Array.isArray(list)) { failures++; again(); return; } // a 2xx without the array is a failed read
        for (const r of list as unknown[]) {
          const x = asRec(r);
          if (x.status === 'active' && x.server_id === rowId) { settle('read_match'); return; } // evidence only: no receipt
        }
        again();
      }, (err: unknown) => {
        if (!reconciling(op)) return;
        classifyMarket(err);
        if (isBanned(err)) { settle('read_403_banned'); return; }
        // Another user, or the context died: this purchase's ledger can no longer be read as its user.
        if (isSuperseded(err) || notSent(err) || isStale(err)) { settle('reads_exhausted_failure'); return; }
        reads++; failures++;
        again();
      });
    }
    readOnce();
  }
  // Reserve: one advisory page-0 read, then the attempt stays unknown (C9: no read settles it and nothing is sent
  // again without a person). The kept key is resent only through the confirmed "Send the same request again".
  function reserveRecovery(): void {
    let op = pm.op;
    const timer = later(() => { if (reconciling(op)) { apply('reconcile_budget_expired'); changed(); } }, budgets.reconcileMs);
    function settleUnknown(): void {
      if (!reconciling(op)) return;
      unlater(timer);
      apply('reconcile_budget_expired');
      changed();
    }
    viaOwner(pm.own, reservationsRoute, { query: page0() }).then((resp) => {
      if (!reconciling(op)) return;
      const m = M.advisoryMatch(resp && resp.data, rowId, pm.days, pm.attemptAt);
      apply(m ? 'ambiguity_read_match' : 'ambiguity_read_no_match');
      op = pm.op; // the advisory read moves the op token
      settleUnknown();
    }, (err: unknown) => {
      if (!reconciling(op)) return;
      classifyMarket(err);
      if (isSuperseded(err) || notSent(err) || isStale(err)) { unlater(timer); apply('reconcile_budget_expired'); changed(); return; }
      if (isBanned(err)) { unlater(timer); apply('ambiguity_read_403_banned'); changed(); return; }
      apply('ambiguity_read_failure');
      op = pm.op;
      settleUnknown();
    });
  }
  function retryCountdownS(): number {
    const own = pm.retryAfterS == null ? 0 : pm.retryAfterS - Math.floor((Date.now() - pm.retryArmedAt) / 1000);
    // The kept key's shared deadline too: another machine for the same key, in this tab or another, may have had its
    // 429 after this one was built.
    const until = pm.rail === 'reserve' && pm.idemKey ? marketRetryUntilFor(pm.idemKey) : undefined;
    const shared = until === undefined ? 0 : Math.ceil((until - Date.now()) / 1000);
    const left = Math.max(own, shared);
    return left > 0 ? left : 0;
  }
  // Manual [Retry] (reserve, indeterminate): the SAME key, behind the ban, the owner and Retry-After. true = accepted
  // for admission: the Retry-After is checked again under the cross-tab pending lock, on a fresh read of the kept
  // entry, before anything is sent, so a 429 another tab is recording (its write waits on the same lock) is seen.
  // A store that cannot be read, a kept request gone or changed, or a deadline still running,
  // refuses: nothing is sent, the attempt
  // stays unknown and the next snapshot (retrying false) shows the countdown (fail closed). Without a granted Web Lock
  // nothing is sent: the admission refuses with the noLocks notice, as a first send's does, so the view can say
  // why (none, or a Locks API that rejects). Only an admission whose callback ran under a granted lock clears it: a
  // wait that timed out (the callback never ran) proves nothing about the lock.
  function retry(): boolean {
    if (pm.state !== 'indeterminate' || pm.rail !== 'reserve' || retryAdmitting) return false;
    if (marketLatch.banned || ownerGone() || retryCountdownS() > 0) return false;
    const op = pm.op, key = pm.idemKey, owner = pm.own ? pm.own.owner : null, ceiling = pm.ceiling;
    retryAdmitting = true;
    let granted = false;
    void admitUnderLock((): boolean | 'noLocks' => {
      if (!B.pendingLockHeld()) return 'noLocks';
      granted = true;
      if (!key || !owner || ceiling == null) return false;
      const list = readMk();
      if (!list) return false;
      // The kept request must still be the one confirmed: another tab may have settled, dropped or replaced it
      // while this admission waited. Gone or changed sends nothing.
      const kept = list.find((e) => e.key === key);
      if (!kept || !openMk(kept) || !sameMk(kept, owner, rowId as string, pm.days, ceiling)) return false;
      // An admission is not a send: the send point checks the kept request again (marketSendGate), however late.
      return !(kept.retry_until !== undefined && kept.retry_until > Date.now());
    }, false).then((ok) => {
      retryAdmitting = false;
      if (op !== pm.op || pm.state !== 'indeterminate' || key !== pm.idemKey || disposed) { changed(); return; }
      if (ok === 'noLocks') { pm.notice = 'noLocks'; changed(); return; }
      if (granted && pm.notice === 'noLocks') pm.notice = null;
      if (!ok || marketLatch.banned || ownerGone() || retryCountdownS() > 0 || !apply('retry_replay')) { changed(); return; }
      changed();
      dispatchPost();
    });
    return true;
  }
  // Rent [Retry] from not-found: back to a fresh confirm (rent has no idempotency).
  function retryRent(): boolean {
    if (pm.state !== 'not-found' || pm.rail !== 'rent' || marketLatch.banned) return false;
    if (!apply('retry_rent')) return false;
    changed();
    return true;
  }
  function checkAgain(): boolean {
    if ((pm.state !== 'not-found' && pm.state !== 'indeterminate') || pm.rail !== 'rent') return false;
    if (!apply('check_again')) return false;
    changed();
    rentReads(budgets.checkMs);
    return true;
  }
  // Refresh reservations: a read that never moves the purchase state.
  function refresh(): Promise<boolean> {
    if (pm.state !== 'indeterminate' || pm.rail !== 'reserve') return Promise.resolve(false);
    const stamp = pm.op;
    // Bounded like every other recovery read (checkReserveHold): a read that never settles (a token refresh that hangs
    // before the request leaves) answers OP_DEADLINE, a read failure, so the drawer's Check again always ends.
    return boundedRead(() => viaOwner(pm.own, reservationsRoute, { query: page0(), timeoutMs: bounds.read })).then((resp) => {
      if (pm.state !== 'indeterminate' || pm.op !== stamp) return false;
      apply(M.advisoryMatch(resp && resp.data, rowId, pm.days, pm.attemptAt) ? 'refresh_read_match' : 'refresh_read_no_match');
      changed();
      return true;
    }, (err: unknown) => {
      if (pm.state !== 'indeterminate' || pm.op !== stamp) return false;
      classifyMarket(err);
      apply(isBanned(err) ? 'refresh_read_403_banned' : 'refresh_read_failure');
      changed();
      return true;
    });
  }
  // Dismissal: the one exit from a terminal. It never retires an unresolved reserve's key (the billing drawer's
  // unknown view keeps offering Check again and Start a new purchase).
  function dismiss(): boolean {
    if (!M.PM_TERMINALS[pm.state]) return false;
    apply('dismiss');
    changed();
    return true;
  }
  function snapshot(): PurchaseSnapshot {
    return {
      state: pm.state, mode: pm.mode, rail: pm.rail, canClose: M.pmCanClose(pm.state), notice: pm.notice,
      owner: dialogOwn ? dialogOwn.owner : null, idemKey: pm.idemKey, ceiling: pm.ceiling, receipt: pm.receipt,
      replayed: pm.replayed, advisory: pm.advisory, advisoryKind: pm.advisoryKind, lateHint: pm.lateHint,
      entry: pm.entry, failure: pm.failure, reconfirm: pm.reconfirm, banned: marketLatch.banned,
      retryIn: retryCountdownS(), autoReplayUsed: pm.autoReplayUsed, retrying: retryAdmitting,
    };
  }
  return {
    confirm, retry, retryRent, checkAgain, refresh, dismiss, snapshot,
    dispose() { disposed = true; for (const t of timers) clearTimeout(t); timers.clear(); },
    resume() { disposed = false; },
  };
}

// ---- wallet ----
export interface Balances { general: unknown; aiRemaining: unknown; aiLive: boolean }
export function balances(ctx: Ctx): Promise<Balances> {
  return api(balancesRoute, { ctx }).then((r) => {
    const d = asRec(r && r.data);
    const live = d.ai_usage_status === 'live';
    return { general: d.general_balance == null ? null : d.general_balance, aiRemaining: live ? d.ai_remaining : null, aiLive: live };
  });
}
export interface TopUpMethod { key: 'card' | 'crypto'; path: string; urlField: string; min: number; max: number }
/** A held top-up's method when availability does not list it: route and answer field, no amount bounds. */
function heldMethod(key: 'card' | 'crypto'): TopUpMethod {
  return key === 'card'
    ? { key, path: '/wallet/payments/card/checkout', urlField: 'checkout_url', min: 0, max: Number.MAX_SAFE_INTEGER }
    : { key, path: '/wallet/payments/crypto/invoice', urlField: 'invoice_url', min: 0, max: Number.MAX_SAFE_INTEGER };
}
/** The enabled top-up methods with their bounds, and the AI transfer fee (null = unknown). */
export function availability(ctx: Ctx): Promise<{ methods: TopUpMethod[]; feeBps: number | null }> {
  return api(availabilityRoute, { ctx }).then((r) => {
    const av = asRec(r && r.data);
    const methods: TopUpMethod[] = [];
    const bnd = (b: Rec) => ({ min: typeof b.min_usd === 'number' ? b.min_usd : 5, max: typeof b.max_usd === 'number' ? b.max_usd : 10000 });
    const card = asRec(av.card), now = asRec(av.crypto);
    // An answer that does not say, for both providers, whether each is enabled is not an answer (a gateway page, an empty object,
    // one provider missing): the read failed, never "no method is enabled" (C9). The API always sends both.
    if (typeof card.enabled !== 'boolean' || typeof now.enabled !== 'boolean') throw { status: 0, code: 'BAD_LIST' };
    if (card.enabled) methods.push({ key: 'card', path: '/wallet/payments/card/checkout', urlField: 'checkout_url', ...bnd(card) });
    if (now.enabled) methods.push({ key: 'crypto', path: '/wallet/payments/crypto/invoice', urlField: 'invoice_url', ...bnd(now) });
    return { methods, feeBps: typeof av.ai_credit_fee_bps === 'number' ? av.ai_credit_fee_bps : null };
  });
}
// A change of the wallet: the dialog's owner, its context, the 2FA path of api().
function walletWrite<B>(own: ShownOwner | null, route: Route<Env, B>, body: B, extra: Omit<CallInput<B>, 'body' | 'ctx'> = {}): Promise<Env> {
  if (!own || !own.live()) return Promise.reject(refusal('ACCOUNT_CHANGED'));
  return viaOwner(own, route, { ...extra, body });
}
export function newKey(): string { return M.newIdemKey(); }
export type TransferResult = { ok: true; generalBalance: unknown; syncPending: boolean };
/** Transfer to AI credit, bound to the fee the dialog showed. Rejects {code: 'reused', newKey} | {code: 'fee_changed'} | the error. */
export function transfer(own: ShownOwner | null, _ctx: Ctx, amountRaw: unknown, feeBps: number | null | undefined, idem: string): Promise<TransferResult> {
  const amt = W.normalizeAmount(amountRaw);
  if (!amt || amt === '0.00') return Promise.reject(refusal('BAD_AMOUNT'));
  const body: TransferBody = { amount: amt, idempotency_key: idem };
  if (typeof feeBps === 'number') body.expected_fee_bps = feeBps;
  return walletWrite(own, transferRoute, body).then((r): TransferResult => {
    const d = asRec(r && r.data);
    return { ok: true, generalBalance: d.general_balance == null ? null : d.general_balance, syncPending: !!d.limit_sync_pending };
  }, (e: unknown) => {
    const x = e as Err | null;
    // A key reused with another amount: an earlier transfer already went through; a new key for the next.
    if (x && x.code === 'TRANSFER_IDEMPOTENCY_KEY_REUSED') throw { code: 'reused', newKey: newKey() };
    if (x && (x.code === 'TRANSFER_FEE_CHANGED' || x.code === 'TRANSFER_FEE_CONFIRMATION_REQUIRED')) throw { code: 'fee_changed' };
    throw e;
  });
}
/** Top-up: the checkout URL is followed only on the method's own https host. `o.signal`/`o.still` end the attempt
 *  before anything more leaves (the 2FA retry included); the request is bounded by budgets.topupMs (unknown). */
export function topup(own: ShownOwner | null, _ctx: Ctx, method: TopUpMethod | null | undefined, amountRaw: unknown, idem: string,
  o: { signal?: AbortSignal; still?: () => boolean } = {}): Promise<{ url: string }> {
  const amt = W.normalizeAmount(amountRaw);
  if (!method || !amt) return Promise.reject(refusal('BAD_AMOUNT'));
  const n = parseFloat(amt);
  if (!(n >= method.min && n <= method.max)) return Promise.reject(refusal('OUT_OF_RANGE', { min: method.min, max: method.max }));
  // The method names its route; a path that is not that route's is outside the table.
  const route = method.key === 'card' ? checkoutRoute : method.key === 'crypto' ? invoiceRoute : null;
  if (!route || method.path !== route.path) return Promise.reject(refusal('ROUTE_UNKNOWN'));
  return walletWrite(own, route, { amount: amt, idempotency_key: idem }, { timeoutMs: budgets.topupMs, ...o }).then((r) => {
    const url = asRec(r && r.data)[method.urlField] || '';
    const re = method.key === 'crypto' ? W.CRYPTO_HOST_RE : W.CARD_HOST_RE;
    // A 2xx answered: the checkout may exist server-side. A URL off the provider's host is never followed,
    // and the outcome stays unknown (pending: only a confirmed resend sends the same key), never a definite failure.
    if (typeof url !== 'string' || !re.test(url)) throw { code: 'BAD_CHECKOUT_URL', pending: true };
    return { url };
  });
}
export type ReturnState = { state: 'unverified' } | { state: 'gone' } | { state: 'received' } | { state: 'failed' } | { state: 'cancelled' } | { state: 'processing' } | { state: 'review'; credited: boolean };
/** After checkout: the owner-scoped intent decides (the return query is only a trigger). */
export function verifyReturn(ctx: Ctx, payment: unknown, provider: unknown, _returnStatus?: unknown): Promise<ReturnState> {
  if (typeof payment !== 'string' || !/^[0-9a-f]{24}$/i.test(payment)) return Promise.resolve({ state: 'unverified' });
  const route = W.returnProviderPrefix(provider) === 'crypto' ? cryptoIntentRoute : cardIntentRoute;
  let tries = 0;
  return new Promise<ReturnState>((resolve) => {
    (function tick(): void {
      if (!alive(ctx)) { resolve({ state: 'gone' }); return; }
      tries++;
      api(route, { ctx, params: { id: payment } }).then((r) => {
        const i = asRec(r && r.data), st = i.status;
        if (st === 'under_review' || st === 'admin_review') { resolve({ state: 'review', credited: !!i.credited_at }); return; }
        if (i.credited_at || st === 'completed') { resolve({ state: 'received' }); return; }
        if (st === 'failed') { resolve({ state: 'failed' }); return; }
        if (st === 'cancelled' || st === 'expired') { resolve({ state: 'cancelled' }); return; }
        // The return URL is only a trigger: a still-nonterminal intent is not settled, whatever the URL said.
        if (tries >= W.RETURN_POLL_MAX) { resolve({ state: 'processing' }); return; }
        setTimeout(tick, W.RETURN_POLL_MS);
      }, (e: unknown) => {
        if (isStale(e)) { resolve({ state: 'gone' }); return; }
        const s = e && (e as Err).status;
        if (s === 404 || s === 503 || tries >= W.RETURN_POLL_MAX) { resolve({ state: 'unverified' }); return; }
        setTimeout(tick, W.RETURN_POLL_MS);
      });
    })();
  });
}
// The payment return the boot capture stashed (hub_topup_return): kept while valid so a reload
// mid-verification resumes; garbage, a bad payment id or a stash older than 24 h is dropped. Not owner-bound:
// the intent read is owner-scoped server-side (another user's -> 404 -> 'unverified'), so it never shows
// another account's payment.
const TOPUP_RETURN_KEY = 'hub_topup_return';
export function dropTopupReturn(): void { try { sessionStore().removeItem(TOPUP_RETURN_KEY); } catch { /* nothing to lose */ } }
export function readTopupReturn(): { payment: string; provider: 'crypto' | 'card'; status: unknown } | null {
  let raw: string | null;
  let d: Rec | null;
  try { raw = sessionStore().getItem(TOPUP_RETURN_KEY); } catch { return null; }
  if (!raw) return null;
  try { d = JSON.parse(raw) as Rec | null; } catch { dropTopupReturn(); return null; }
  if (!d || typeof d.payment !== 'string' || !/^[0-9a-f]{24}$/i.test(d.payment)) { dropTopupReturn(); return null; }
  if (typeof d.at === 'number' && d.at && (Date.now() - d.at) > 24 * 60 * 60 * 1000) { dropTopupReturn(); return null; }
  return { payment: d.payment, provider: d.provider === 'crypto' ? 'crypto' : 'card', status: d.status };
}
/** GitHub connection bonus: a cold read failure renders nothing ({enabled: false}). */
export function githubBonus(ctx: Ctx): Promise<Rec> {
  return api(bonusRoute, { ctx }).then((r) => asRec(r && r.data), (e: unknown) => {
    if (isStale(e)) throw e;
    return { enabled: false };
  });
}
/** -> {result, refetch}: a transport failure is ambiguous ('retry': re-read, never "nothing added"). */
export function claimBonus(own: ShownOwner | null, _ctx: Ctx): Promise<{ result: unknown; data?: Rec; refetch: boolean }> {
  return walletWrite(own, claimRoute, {}).then((r) => {
    const res = (r && (r.data as Rec | null)) || { result: 'error' };
    return { result: res.result, data: res, refetch: !!W.REFETCH_AFTER[String(res.result)] };
  }, (e: unknown) => {
    if (notSent(e)) throw e;
    const res = (e as Err | null)?.status === 429 ? 'rate_limited' : 'retry';
    return { result: res, refetch: !!W.REFETCH_AFTER[res] };
  });
}

// ---- paid subscriptions and plans ----
const SUBS_DEFAULT = { page: 200, maxPages: 1000 };
export const SUBS: { page: number; maxPages: number } = { ...SUBS_DEFAULT };
function locale(): string {
  const l = lang();
  return ({ zht: 'zh-TW', br: 'pt-BR' } as Record<string, string>)[l] || l;
}
export interface SubsLoad { subs: Rec[]; partial: { shown: number; total: number } | null }
/** Every page (realm-scoped list), deduplicated by id, under one owner. */
export function loadSubscriptions(ctx: Ctx, cap?: number): Promise<SubsLoad> {
  const own = walkOwner(ctx);
  const seen = dict<1>(), out: Rec[] = [], att = newAtt();
  let partial: SubsLoad['partial'] = null;
  const maxPages = isCount(cap) && cap > 0 ? cap : SUBS.maxPages;
  function next(offset: number, n: number): Promise<SubsLoad> {
    if (att.dead) return Promise.reject(deadline());
    return readAs(own, ctx, subsListRoute, { query: { limit: SUBS.page, offset, locale: locale() }, timeoutMs: bounds.read, signal: att.ctl.signal }).then((resp) => {
      if (own.owner && !own.live()) throw superseded();
      if (!alive(ctx)) throw stale();
      const rows = resp && Array.isArray(resp.data) ? (resp.data as unknown[]) : null;
      if (!rows) throw { status: 0, code: 'BAD_LIST' };
      rows.forEach((r) => {
        if (S.validSub(r)) {
          const id = (r as Rec).id as string;
          if (!has(seen, id)) { seen[id] = 1; out.push(r as Rec); }
        }
      });
      const nextOff = offset + rows.length;
      if (rows.length && isCount(resp.total) && nextOff < resp.total) {
        if (n + 1 < maxPages) return next(nextOff, n + 1);
        partial = { shown: out.length, total: resp.total };
      }
      return { subs: S.sortSubs(out), partial };
    }, (err: unknown) => { throw dropped(err, own); });
  }
  return bounded(att, () => next(0, 0), bounds.list);
}
/** One subscription by id (realm-scoped like the list): null when it is not served in this realm. */
export function getSubscription(ctx: Ctx, id: string): Promise<Rec | null> {
  // "quote" is the quote route's path, never a subscription id.
  if (id === 'quote') return Promise.reject(refusal('ROUTE_UNKNOWN'));
  const own = walkOwner(ctx);
  return boundedRead(() => readAs(own, ctx, subRoute, { params: { id }, timeoutMs: bounds.read })).then((r) => {
    const d = r && r.data;
    return S.validSub(d) ? (d as Rec) : null;
  }, (e: unknown) => { if (e && (e as Err).status === 404) return null; throw e; });
}
// Both catalogues answer {data: {requested_locale, plans: [...]}}; anything else reads as no plans.
function planList(r: Env | null | undefined): unknown[] {
  const d = asRec(r && r.data);
  return Array.isArray(d.plans) ? (d.plans as unknown[]) : [];
}
export function plans(ctx: Ctx) {
  return boundedRead(() => api(plansRoute, { ctx, query: { locale: locale() }, timeoutMs: bounds.read })).then((r) => S.planIndex(planList(r)));
}
/** The plan chip (top bar): the kind of the active computer's server and, for a paid subserver, its plan title. */
export function planChip(container: unknown, subs: unknown, planIdx: Record<string, never> | Parameters<typeof S.infoFor>[1]): { kind: 'paid' | 'bare_metal' | 'free' | null; title: string | null } {
  const s = asRec(asRec(container).server);
  const has_ = container && typeof container === 'object' && 'server' in (container as object) && (container as Rec).server;
  const kind = !has_ ? null : s.paid_subserver === true ? 'paid' : s.is_free === false ? 'bare_metal' : 'free';
  let title: string | null = null;
  if (kind === 'paid' && Array.isArray(subs)) {
    for (const x of subs as unknown[]) {
      const sub = asRec(x);
      if (x && s.id && sub.server_id === s.id) { const info = S.infoFor(sub, planIdx || {}); title = (info && info.title) || null; break; }
    }
  }
  return { kind, title };
}

// ---- buy intents and money attempts (plan purchase, Pay now, upgrade) ----
// The intent the website's Get link left (hub-boot-gate.js stashes it before the auth gate). Read only after
// an identity is displayed; consumed when the panel opens.
export function readIntent(): string | null { return B.readIntent(Date.now()); }
export function consumeIntent(): string | null { const p = readIntent(); B.dropIntent(); return p; }
/**
 * The top-up continuation marker for the account displayed now (another account never sees it;
 * unreadable or another account's is deleted; before an identity is shown: hidden, kept).
 */
export function readBuyResume(): ReturnType<typeof B.parseResume> {
  let raw: string | null;
  try { raw = sessionStore().getItem(B.RESUME_KEY); } catch { return null; }
  if (!raw) return null;
  const m = B.parseResume(raw, Date.now());
  const me = shownId();
  if (m && !me) return null;
  if (!m || m.user !== me) { try { sessionStore().removeItem(B.RESUME_KEY); } catch { /* nothing to lose */ } return null; }
  return m;
}
function storeResume(m: Rec): boolean { try { sessionStore().setItem(B.RESUME_KEY, JSON.stringify(m)); return true; } catch { return false; } }
/**
 * The writers (written by openTopUp before Add funds leaves the panel):
 * bound to the owner the panel was opened for, and only while it still holds; the marker names that user, so
 * readBuyResume shows it to no one else. -> written or not.
 */
export function writeBuyResume(own: ShownOwner | null, familyId: unknown, title?: string, region?: string | null): boolean {
  if (!own || !own.live() || typeof familyId !== 'string' || !familyId) return false;
  // The location chosen in the panel goes with it, as a whole code only; the panel that continues offers it again
  // only if the plan's fresh list still has room there.
  return storeResume({ kind: 'subserver', user: own.owner, plan: familyId, title: title || '', ...(B.regionCode(region) ? { region } : {}), at: Date.now() });
}
export function writePayResume(own: ShownOwner | null, sub: { id?: unknown; paid_through?: unknown } | null | undefined, info?: { title?: string; name?: string; holdDays?: number | null }): boolean {
  if (!own || !own.live() || !sub || typeof sub.id !== 'string') return false;
  const i = info || {};
  return storeResume({ kind: 'subserver-pay', user: own.owner, sub: sub.id, paid_through: sub.paid_through, title: i.title, name: i.name, hold_days: i.holdDays, at: Date.now() });
}
/** The continuation's location was offered again (or found gone): it is asked once, the rest of the marker stays. */
export function forgetBuyResumeRegion(): void {
  try {
    const raw = sessionStore().getItem(B.RESUME_KEY);
    const m = raw ? (JSON.parse(raw) as Rec | null) : null;
    if (!m || typeof m !== 'object' || !('region' in m)) return;
    delete m.region;
    sessionStore().setItem(B.RESUME_KEY, JSON.stringify(m));
  } catch { /* nothing to lose */ }
}
export function clearBuyResume(): void { try { sessionStore().removeItem(B.RESUME_KEY); } catch { /* nothing to lose */ } }
export function catalogue(ctx: Ctx): Promise<unknown[]> {
  return boundedRead(() => api(catalogueRoute, { ctx, query: { locale: locale() }, timeoutMs: bounds.read })).then(planList);
}

// An upgrade's retained attempt (Billing): stored before its POST and kept until an answer, like a buy's or a
// payment's, but under its own key, per user + subscription: an older Hub version rewrites hub_money_pending with
// its buy and pay entries only (commerce-pure holds those rules verbatim), which would lose an upgrade's key.
// The same lock (withPendingLock) and the same read-back before anything is sent.
const UPGRADE_KEY = 'hub_money_upgrade';
export interface UpgradeEntry { kind: 'upgrade'; user_id: string; key: string; max_charge_cents: number; at: number; sub_id: string; plan_id: string; title?: string | null; phase?: SendPhase }
type Entry = PendingEntry | UpgradeEntry;
const shortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
function validUpgrade(eIn: unknown): eIn is UpgradeEntry {
  const e = eIn as Rec | null | undefined;
  return !!e && e.kind === 'upgrade' && shortText(e.user_id, 128) && shortText(e.key, 128) && isCount(e.max_charge_cents)
    && typeof e.sub_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.sub_id) && shortText(e.plan_id, 64)
    && typeof e.at === 'number' && isFinite(e.at) && (e.title == null || typeof e.title === 'string');
}
function upgradeAll(): UpgradeEntry[] {
  try { const a: unknown = JSON.parse(localStore().getItem(UPGRADE_KEY) || '[]'); return Array.isArray(a) ? a.filter(validUpgrade) : []; } catch { return []; }
}
function upgradePut(l: UpgradeEntry[]): void {
  try { if (l.length) localStore().setItem(UPGRADE_KEY, JSON.stringify(l)); else localStore().removeItem(UPGRADE_KEY); } catch { /* read back by the claim */ }
}
function upgradeFind(q: { user_id: string; sub_id: string }): UpgradeEntry | null {
  for (const e of upgradeAll()) if (e.user_id === q.user_id && e.sub_id === q.sub_id) return e;
  return null;
}
/** The displayed user's retained upgrade of one subscription, or null (Billing reopens the dialog on its plan). */
export function pendingUpgrade(owner: string | null | undefined, subId: string | null | undefined): UpgradeEntry | null {
  return owner && subId ? upgradeFind({ user_id: owner, sub_id: subId }) : null;
}
/** Every retained upgrade of the displayed user (newest first): Billing shows Check again for each. */
export function pendingUpgrades(owner: string | null | undefined): UpgradeEntry[] {
  return owner ? upgradeAll().filter((e) => e.user_id === owner).sort((x, y) => y.at - x.at) : [];
}
// `kept`: this send is the resend of a kept entry (not a first send): it goes only while that entry is still stored,
// with the same request (heldRequestSig). One that vanished (answered or dropped elsewhere) or was rewritten is refused
// 'gone', never written back and sent as a new hold.
function claimUpgrade(mine: UpgradeEntry, live: () => boolean, kept = false): Promise<UpgradeEntry> {
  return B.withPendingLock(() => {
    if (!live()) throw { preflight: 'expired' };
    const cur = upgradeFind(mine);
    // Another stored upgrade of this subscription is adopted only when it targets the same plan: one of another plan is
    // never taken over (a resend would buy that plan from this one's dialog); nothing is sent, the dialog adopts nothing,
    // and it says an earlier upgrade of this server is still unresolved ('heldUpgrade', a definite nothing-sent).
    if (cur && cur.key !== mine.key) throw cur.plan_id === mine.plan_id ? { preflight: 'adopted', entry: cur } : { preflight: 'heldUpgrade' };
    if (!cur && kept) throw { preflight: 'gone' };
    // A kept entry rewritten under the same key (another plan, ceiling or owner) is not the request confirmed: never sent.
    if (cur && kept && heldRequestSig(cur) !== heldRequestSig(mine)) throw { preflight: 'gone' };
    if (!cur && !B.pendingLockHeld()) throw { preflight: 'noLocks' };
    const sending: UpgradeEntry = { ...(cur || mine), phase: 'sending' };
    upgradePut(upgradeAll().filter((x) => !(x.user_id === mine.user_id && x.sub_id === mine.sub_id)).concat([sending]));
    planHoldsChanged();
    const back = upgradeFind(mine);
    if (!back || back.key !== mine.key) throw { preflight: 'store' };
    return back;
  });
}
function dropUpgrade(e: UpgradeEntry): Promise<void> {
  return B.withPendingLock(() => {
    upgradePut(upgradeAll().filter((x) => !(x.user_id === e.user_id && x.sub_id === e.sub_id && x.key === e.key)));
  });
}
// commerce-pure's claimShown with one more check INSIDE the pending-store lock, before anything is written: `live()`
// (the operation's deadline and owner fence). Composed from commerce-pure's pieces because the lock is not
// re-entrant: wrapping claimShown in a second lock would deadlock.
function claimFenced(mine: PendingEntry, live: () => boolean, kept = false): Promise<PendingEntry> {
  return B.withPendingLock(() => {
    if (!live()) throw { preflight: 'expired' };
    const cur = B.findPending(mine);
    if (cur && cur.key !== mine.key) throw { preflight: 'adopted', entry: cur };
    if (!cur && kept) throw { preflight: 'gone' };
    // A kept entry rewritten under the same key (another plan, ceiling or owner) is not the request confirmed: never sent.
    if (cur && kept && heldRequestSig(cur) !== heldRequestSig(mine)) throw { preflight: 'gone' };
    if (!cur && !B.pendingLockHeld()) throw { preflight: 'noLocks' };
    const sending = { ...(cur || mine), phase: 'sending' } as PendingEntry;
    B.writePendingAll(B.readPendingAll().map((x) => (cur && x.key === cur.key && x.user_id === cur.user_id ? sending : x)).concat(cur ? [] : [sending]));
    planHoldsChanged();
    const back = B.findPending(mine);
    if (!back || back.key !== mine.key) throw { preflight: 'store' };
    return back;
  });
}
// A definitive answer's pending-entry cleanup. It removes only the entry with that key (dropPending matches
// target AND key; a newer attempt of this panel always has a new key), and it is queued on the lock at
// settlement, so it runs before any later claim; it never touches the model. The confirm answer waits for it,
// at most CLEANUP_WAIT_MS: a page that re-reads the unknown list on that answer must not see the completed
// attempt as "may have gone through". A cleanup slower than that finishes in the background.
const CLEANUP_WAIT_MS = 1500;
function cleanup(entry: Entry | null, onDropped?: (drop: Promise<void>) => void): Promise<void> {
  if (!entry) return Promise.resolve();
  const drop = (entry.kind === 'upgrade' ? dropUpgrade(entry) : B.dropPending(entry)).then(() => undefined, () => { /* the next claim reads the store */ });
  if (onDropped) onDropped(drop);
  return new Promise<void>((res) => {
    const t = setTimeout(res, CLEANUP_WAIT_MS);
    void drop.then(() => { clearTimeout(t); res(); });
  });
}
// ---- one hold lifecycle, read by Billing and the Market ----
// A claim writes `phase: 'sending'` (under the pending lock) while this tab holds the Web Lock SEND_LOCK + key, from
// before the claim until the answer. A definite answer drops the entry; any other end rewrites it `held`, then the
// lock is released. A reader takes `sending` only while some tab holds that lock: a sender that closed or crashed
// leaves `sending` with no holder, read `held`. An entry without a phase (an older Hub version) reads `held`.
export type SendPhase = 'sending' | 'held';
const SEND_LOCK = 'hub_money_send:';
interface LockMgr {
  request: ((name: string, cb: () => unknown) => Promise<unknown>) & ((name: string, opts: { mode?: 'shared' | 'exclusive' }, cb: () => unknown) => Promise<unknown>);
  query?: () => Promise<{ held?: Array<{ name?: string; mode?: string }> }>;
}
function lockMgr(): LockMgr | null {
  try {
    const l = (globalThis.navigator as { locks?: LockMgr } | undefined)?.locks;
    return l && typeof l.request === 'function' ? l : null;
  } catch { return null; }
}
const holdListeners = new Set<() => void>();
function planHoldsChanged(): void { for (const l of [...holdListeners]) { try { l(); } catch { /* a listener's own */ } } }
/** The send lock of one key: `granted` once this tab holds it (at once without Web Locks); `release` ends it. */
function sendLock(key: string): { granted: Promise<void>; release: () => void } {
  let release!: () => void;
  const done = new Promise<void>((r) => { release = r; });
  const lm = lockMgr();
  if (!lm) return { granted: Promise.resolve(), release };
  // A request that throws or rejects is no lock: granted at once, as without Web Locks (the claim then decides, and
  // refuses a new money key 'noLocks').
  const granted = new Promise<void>((g) => {
    try { Promise.resolve(lm.request(SEND_LOCK + key, () => { g(); return done; })).then(null, () => g()); } catch { g(); }
  });
  return { granted, release };
}
/** After a send ends: the entry of that key, if still stored, reads `held`; then the lock goes. At most CLEANUP_WAIT_MS:
 *  past it the lock goes anyway (the answer is in; a store lock held elsewhere must not keep it "sending"). */
function endSend(entry: Entry | null, lock: { release: () => void } | null): Promise<void> {
  if (!lock) return Promise.resolve();
  let ended = false;
  const finish = (): void => { if (ended) return; ended = true; lock.release(); planHoldsChanged(); };
  const mark = !entry ? Promise.resolve() : B.withPendingLock(() => {
    // Past the bound the lock is already gone (finish): a later same-key send may own `sending` now, so write nothing.
    // The entry then says `sending` with no sender, which every reader takes as held.
    if (ended) return;
    if (entry.kind === 'upgrade') {
      const l = upgradeAll();
      if (l.some((x) => x.key === entry.key && x.phase === 'sending')) upgradePut(l.map((x) => (x.key === entry.key ? { ...x, phase: 'held' as const } : x)));
    } else {
      const l = B.readPendingAll() as Array<PendingEntry & { phase?: SendPhase }>;
      if (l.some((x) => x.key === entry.key && x.phase === 'sending')) B.writePendingAll(l.map((x) => (x.key === entry.key ? { ...x, phase: 'held' } : x)) as PendingEntry[]);
    }
  }).then(() => undefined, () => undefined);
  return new Promise<void>((res) => {
    const t = setTimeout(() => { finish(); res(); }, CLEANUP_WAIT_MS);
    void mark.then(() => { clearTimeout(t); finish(); res(); });
  });
}

/** A retained buy or upgrade of the displayed user, as the Market and Billing show it. Never done or failed. */
export interface PlanHold {
  kind: 'buy' | 'upgrade'; key: string; max_charge_cents: number; at: number; title: string | null;
  /** buy: the family the key was claimed for. */ family_id?: string;
  /** buy: the plan version; upgrade: the target plan. */ plan_id?: string;
  /** upgrade: the server. */ sub_id?: string;
  phase: SendPhase;
}
/** Names of the send locks a sender holds now (exclusive only: a reader's shared watch is no sender); null when it
 *  cannot be known (every `sending` then reads held). */
async function heldSendLocks(): Promise<Set<string> | null> {
  const lm = lockMgr();
  if (!lm || typeof lm.query !== 'function') return null;
  try {
    const q = await lm.query();
    return new Set((q.held || []).filter((h) => (h as { mode?: unknown }).mode !== 'shared').map((h) => String(h.name)));
  } catch { return null; }
}
const watched = new Set<string>();
/** A shared request on an open send lock: granted when its sender answered or died; tells the listeners once. */
function watchSend(key: string): void {
  const lm = lockMgr();
  if (!lm || watched.has(key)) return;
  watched.add(key);
  // Told only after the watch request completed: its own shared hold is gone before any listener reads again.
  try {
    Promise.resolve(lm.request(SEND_LOCK + key, { mode: 'shared' }, () => undefined)).then(() => { watched.delete(key); planHoldsChanged(); }, () => { watched.delete(key); });
  } catch { watched.delete(key); }
}
/**
 * Every retained buy and upgrade of the identity `ctx` displays (none without one), newest first. Each entry is its
 * own hold (several for one plan are each listed). Read the stores before any catalogue: recovery never needs it.
 * Only the newest started read is applied: a read that waited while a later read began resolves with the newest
 * started read's result (again while newer ones start), never its own older snapshot. Every caller gets current
 * holds, so independent subscribers reading on one notification never cancel each other.
 */
let holdReadSeq = 0;
/** The newest started read and the owner it was started for. */
let newestHoldRead: { p: Promise<PlanHold[]>; owner: string } | null = null;
export function planHolds(ctx: Ctx): Promise<PlanHold[]> {
  const own = shownOwner(ctx);
  if (!own) return Promise.resolve([]);
  const p = readHolds(own, ++holdReadSeq);
  newestHoldRead = { p, owner: own.owner };
  return p;
}
/**
 * The newest started read's result for `own`, followed again while a newer read starts during the wait. Checked
 * against the ORIGINAL caller's identity at every handover: when `own` is no longer displayed, or the read to adopt
 * was started for another owner, it rejects superseded (never another user's holds).
 */
async function newestHolds(own: ShownOwner): Promise<PlanHold[]> {
  for (;;) {
    const n = newestHoldRead!;
    if (n.owner !== own.owner) throw superseded();
    const r = await n.p;
    if (!own.user()) throw superseded();
    if (n === newestHoldRead) return r;
  }
}
async function readHolds(own: ShownOwner, mine: number): Promise<PlanHold[]> {
  const read = (): Array<(PendingEntry | UpgradeEntry) & { phase?: unknown }> => [
    ...B.readPendingAll().filter((e) => e.kind === 'buy' && e.user_id === own.owner),
    ...upgradeAll().filter((e) => e.user_id === own.owner),
  ];
  let raw = read();
  let held: Set<string> | null = null;
  if (raw.some((e) => e.phase === 'sending')) {
    held = await heldSendLocks();
    // The stores as they are now, never as they were before the wait (a drop meanwhile stays dropped); a read whose
    // displayed user moved meanwhile is superseded, never another user's holds.
    if (!own.user()) throw superseded();
    if (mine !== holdReadSeq) return newestHolds(own);
    raw = read();
  }
  const out: PlanHold[] = raw.map((e) => {
    const live = e.phase === 'sending' && !!held && held.has(SEND_LOCK + e.key);
    if (live) watchSend(e.key);
    const h: PlanHold = { kind: e.kind as 'buy' | 'upgrade', key: e.key, max_charge_cents: e.max_charge_cents, at: e.at, title: e.title ?? null, phase: live ? 'sending' : 'held' };
    if (e.kind === 'buy') { h.family_id = (e as PendingEntry).family_id; h.plan_id = (e as PendingEntry).plan_id; }
    else { h.plan_id = (e as UpgradeEntry).plan_id; h.sub_id = (e as UpgradeEntry).sub_id; }
    return h;
  });
  return out.sort((x, y) => y.at - x.at);
}
/**
 * Called after any change a planHolds read could see: this tab's claim, phase rewrite or drop, another tab's write of
 * either store (storage), the displayed identity changing, and an open send lock's release (its sender answered or
 * died). Read planHolds again on each.
 */
export function subscribePlanHolds(fn: () => void): () => void {
  holdListeners.add(fn);
  return () => { holdListeners.delete(fn); };
}
hostEnv().onExternalChange((_area, key) => { if (key === B.PENDING_KEY || key === UPGRADE_KEY || key === null) planHoldsChanged(); });
let holdOwner: string | null = null;
ctxSubscribe(() => { const id = shownId(); if (id !== holdOwner) { holdOwner = id; planHoldsChanged(); } });

// An upgrade's refusals that prove THIS request was not run (the service refuses inside its transaction, before
// any debit): the same status rule as commerce-pure's buy/pay lists (buy.definitive). IDEMPOTENCY_INTENT_MISMATCH is
// not one (see MONEY_DEFINITIVE): the earlier operation under the key may have charged, so it stays held.
// No room (anywhere, or in the location asked for) is one too: the purchase and the upgrade look for a host only after
// their replay check found nothing under the key, in the same transaction and before any debit.
const KEY_SETTLING = ['CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE', 'CHARGE_CONFIRMATION_REQUIRED', 'NO_PAID_CAPACITY', 'NO_PAID_CAPACITY_IN_REGION'];
const UPGRADE_DEFINITIVE = ['PLAN_NOT_AVAILABLE', 'PLAN_CHANGE_NOT_UPGRADE', 'SUBSERVER_DORMANT', 'SUBSCRIPTION_PERIOD_ENDED',
  'HOST_UNAVAILABLE', 'NO_PAID_CAPACITY', 'CHARGE_CONFIRMATION_REQUIRED', 'CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE'];
function upgradeDefinitive(err: unknown): boolean {
  const e = err as Err | null;
  // Pending (late answer, change maybe under way): never definitive, as B.definitive.
  if (isPending(err)) return false;
  const s = e && e.status;
  if (typeof s !== 'number' || s < 400 || s >= 500 || s === 401 || s === 403 || s === 404 || s === 429) return false;
  return typeof e?.code === 'string' && UPGRADE_DEFINITIVE.indexOf(e.code) !== -1;
}

export type AttemptKind = 'buy' | 'pay' | 'upgrade';
export interface AttemptTarget {
  plan?: { id: string; family_id?: string }; sub?: { id: string }; title?: string;
  /** buy: the location chosen for the new server (a region code); null or absent is "Automatic". Fixed for the
   *  attempt's life: another choice is another attempt (its own quote, its own key), never this key with another body. */
  region?: string | null;
}
export interface AttemptOptions { /** Opened from the top-up continuation: cleared once the amount was read again. */ resumed?: boolean; onChange?: (s: AttemptSnapshot) => void }
export interface AttemptResultData { operation: unknown; subscription: unknown; replayed: boolean; failed: boolean }
export interface AttemptSnapshot {
  phase: 'account' | 'review' | 'posting' | 'unknown' | 'done' | 'failed'; notice: string | null; owner: string | null; ceiling: number | undefined;
  key: string | null; pending: boolean; result: AttemptResultData | null; error: { kind: string; code: unknown; info?: ErrorInfo } | null;
  /** buy: the location the next send carries: a kept request's own (it is resent as it was), else the attempt's. null: Automatic. */
  region: string | null;
}
export interface AttemptQuote { charge_cents: number; price_cents_per_month?: number; [k: string]: unknown }
export type AttemptConfirm =
  | { ok: true; result: AttemptResultData }
  /** reason 'unknown' with kind 'intent': IDEMPOTENCY_INTENT_MISMATCH, held like any unknown outcome. */
  | { ok: false; reason: string; notSent?: boolean; key?: string; kind?: string; definitive?: boolean };
export interface Attempt {
  quote(): Promise<AttemptQuote>;
  confirm(agreed: boolean): Promise<AttemptConfirm>;
  snapshot(): AttemptSnapshot;
  /** The dialog is gone: no more onChange. A request in flight still settles the key store. */
  dispose(): void;
  resume(): void;
}

/**
 * One money attempt (buy a plan, pay a subscription, or upgrade one in place: kind 'upgrade', target {sub,
 * plan}). Opened for the displayed identity; the request leaves only through the claim (the key the dialog
 * showed, stored first, read back), after GET /users/auth/me names the same user, with the owner bound. The
 * key is dropped only on a definitive answer; anything else keeps it (outcome unknown -> the same key again).
 * The whole Confirm (identity check, claim, token waits, POST) runs under bounds.op: on expiry before the POST
 * was handed over nothing is sent and Confirm works again (reason 'timeout'); after it, the fence stops a send
 * that has not happened yet and the outcome is unknown with the key kept, until api() reports nothing went out
 * (then 'timeout' again, o.onChange). A definitive answer settles the model at once; its cleanup never holds it.
 */
export function createAttempt(kind: AttemptKind, target: AttemptTarget, o: AttemptOptions = {}): Attempt {
  const ctx = capture();
  const own = shownOwner(ctx);
  const st = {
    phase: (own ? 'review' : 'account') as AttemptSnapshot['phase'], pending: null as Entry | null, entry: null as Entry | null,
    result: null as AttemptResultData | null, error: null as AttemptSnapshot['error'], notice: (own ? null : 'accountChanged') as string | null,
    gen: 0, ceiling: undefined as number | undefined, key: undefined as string | null | undefined,
  };
  let disposed = false;
  function changed(): void {
    if (disposed || typeof o.onChange !== 'function') return;
    try { o.onChange(snapshot()); } catch { /* view error */ }
  }
  const planId = target.plan ? target.plan.id : '';
  const subId = target.sub ? target.sub.id : '';
  // A buy's chosen location, only as a whole code (the list's own): anything else is "Automatic", never sent.
  const region = kind === 'buy' && B.regionCode(target.region) ? target.region : null;
  // The location a quote is read for: a kept request's own while one is held (the price shown is the price of the
  // request that will be resent), else this attempt's.
  const quoteRegion = (): string | null => (st.pending ? ((st.pending as { region?: string }).region ?? null) : region);
  // The plan version a buy's quote is read for: likewise the kept request's own (adoption matches the family only, and
  // the resend carries the stored plan_id), else this attempt's.
  const quotePlan = (): string => (kind === 'buy' && st.pending && (st.pending as PendingEntry).plan_id) || planId;
  function quote(): Promise<AttemptQuote> {
    if (!own) return Promise.reject(refusal('ACCOUNT_CHANGED'));
    const q: Promise<Env> = boundedRead(() => kind === 'upgrade'
      ? viaOwner(own, quoteRoute, { params: { id: subId }, query: { action: 'upgrade', plan_id: planId }, timeoutMs: bounds.read })
      : kind === 'buy'
        ? viaOwner(own, buyQuoteRoute, { query: quoteRegion() ? { plan_id: quotePlan(), region: quoteRegion() as string } : { plan_id: quotePlan() }, timeoutMs: bounds.read })
        : viaOwner(own, quoteRoute, { params: { id: subId }, query: { action: 'pay' }, timeoutMs: bounds.read }));
    return q.then((r) => {
      const d = r && r.data;
      const qd = asRec(d);
      if (!d || !isCount(qd.charge_cents) || (kind === 'buy' && !isCount(qd.price_cents_per_month))) throw { code: 'BAD_QUOTE' };
      if (o.resumed) clearBuyResume();
      // A new charge is a new intent (new ceiling, new key), except while a retained attempt is being resent:
      // that one goes out exactly as it was first sent.
      if (!st.pending && st.ceiling !== qd.charge_cents) { st.ceiling = qd.charge_cents; st.key = B.newIdemKey(); }
      return qd as AttemptQuote;
    });
  }
  function entryFor(owner: string): Entry {
    if (st.pending) return st.pending;
    const key = st.key || (st.key = B.newIdemKey());
    const ceiling = st.ceiling as number;
    const title = String(target.title || '').slice(0, 80);
    if (kind === 'buy') {
      return { kind: 'buy', user_id: owner, key, max_charge_cents: ceiling, at: Date.now(), family_id: target.plan?.family_id as string, plan_id: planId, title, ...(region ? { region } : {}) };
    }
    if (kind === 'upgrade') return { kind: 'upgrade', user_id: owner, key, max_charge_cents: ceiling, at: Date.now(), sub_id: subId, plan_id: planId, title };
    return { kind: 'pay', user_id: owner, key, max_charge_cents: ceiling, at: Date.now(), sub_id: subId };
  }
  function identityCheck(own1: ShownOwner, att: Att): Promise<void> {
    return viaOwner(own1, meRoute, { timeoutMs: bounds.read, signal: att.ctl.signal }).then((r) => {
      const id = r && r.data && r.data.id;
      if (typeof id !== 'string' || !id) throw { preflight: 'check' };
      if (id !== own1.owner) throw { preflight: 'account' };
    }, (e: unknown) => {
      // The token refresh reached no verdict: the session is kept and the account did not change, so it is a check
      // that could not run, not an account change.
      if (e && (e as Err).code === 'REFRESH_UNAVAILABLE') throw { preflight: 'check', status: (e as Err).status };
      if (isSuperseded(e) || notSent(e)) throw { preflight: 'account' };
      const s = e && (e as Err).status;
      throw { preflight: s === 401 ? 'auth' : 'check', status: s };
    });
  }
  function sendMoney(own1: ShownOwner, entry: Entry, att: Att): Promise<Env> {
    const common = { recovers: true, timeoutMs: bounds.post, signal: att.ctl.signal };
    if (kind === 'upgrade') {
      const u = entry as UpgradeEntry;
      return viaOwner(own1, upgradeRoute, { ...common, params: { id: subId }, body: { plan_id: u.plan_id, idempotency_key: u.key, max_charge_cents: u.max_charge_cents } });
    }
    const body = B.pendingBody(entry as PendingEntry);
    return kind === 'buy' ? viaOwner(own1, buyRoute, { ...common, body }) : viaOwner(own1, payRoute, { ...common, params: { id: subId }, body });
  }
  function confirm(agreed: boolean): Promise<AttemptConfirm> {
    if (!agreed) return Promise.resolve({ ok: false, reason: 'consent' });
    if (!own || !own.live()) { st.notice = 'accountChanged'; return Promise.resolve({ ok: false, reason: 'accountChanged' }); }
    const me = own;
    if (st.phase !== 'review' && st.phase !== 'unknown') return Promise.resolve({ ok: false, reason: 'busy' });
    if (!isCount(st.ceiling) && !st.pending) return Promise.resolve({ ok: false, reason: 'unquoted' });
    const mine = entryFor(me.owner);
    const kept = !!st.pending;
    // No Web Locks: a new key is refused before any request; a kept one may still go (the claim decides).
    if (!B.hasWebLocks() && !(kind === 'upgrade' ? upgradeFind(mine as UpgradeEntry) : B.findPending(mine as PendingEntry))) {
      st.notice = 'noLocks';
      return Promise.resolve({ ok: false, reason: 'noLocks', notSent: true });
    }
    const att = newAtt(), g = ++st.gen;
    let lock: ReturnType<typeof sendLock> | null = null;
    // A definite answer's drop: the send lock is released once it really ran (in the background), so no reader sees
    // `sending` without a sender before the entry is gone.
    let dropped: Promise<void> | null = null;
    const onDropped = (d: Promise<void>): void => { dropped = d; };
    st.phase = 'posting'; st.notice = null; st.entry = null;
    function unknown(): Extract<AttemptConfirm, { ok: false }> {
      const e = st.entry as Entry;
      st.pending = e; st.key = e.key; st.ceiling = e.max_charge_cents;
      st.phase = 'unknown';
      return { ok: false, reason: 'unknown', key: e.key };
    }
    return bounded(att, () => identityCheck(me, att).then(() => {
      if (att.dead) throw deadline();
      lock = sendLock(mine.key);
      return lock.granted;
    }).then(() => {
      if (att.dead) throw deadline();
      const live = () => !att.dead && me.live();
      return (kind === 'upgrade' ? claimUpgrade(mine as UpgradeEntry, live, kept) : claimFenced(mine as PendingEntry, live, kept)) as Promise<Entry>;
    }).then((entry: Entry) => {
      if (att.dead) throw deadline();
      st.entry = entry;
      if (!me.live()) throw { preflight: 'account' };
      att.handed = true;
      const post = sendMoney(me, entry, att);
      att.post = post;
      return post;
    }), bounds.op).then((resp): AttemptConfirm | Promise<AttemptConfirm> => {
      const d = resp && resp.data;
      // The answer must be about what was sent: the entry's plan (buy, upgrade) and the path's subscription (pay, upgrade).
      const sentPlan = st.entry ? st.entry.plan_id : undefined;
      if (!B.validEnvelope(d, { kind, subId: kind === 'buy' ? undefined : subId, planId: kind === 'pay' ? undefined : sentPlan })) return unknown();
      const dr = asRec(d);
      // The answer is authoritative: the model settles now; the stored entry goes in the background.
      const done = st.entry;
      st.pending = null; st.key = null;
      st.result = { operation: dr.operation, subscription: dr.subscription, replayed: dr.replayed === true, failed: B.failedOutcome(d) };
      st.phase = st.result.failed ? 'failed' : 'done';
      const result = st.result;
      return cleanup(done, onDropped).then((): AttemptConfirm => ({ ok: true, result }));
    }, (err: unknown): AttemptConfirm | Promise<AttemptConfirm> => {
      const e = err as (Err & { preflight?: string; entry?: Entry }) | null;
      if (att.dead) {
        if (!att.handed) {
          // Expired before the POST was handed over: nothing was sent. A claimed entry stays the attempt to
          // resend (the same key), so Confirm is usable again at once.
          if (st.entry) { st.pending = st.entry; st.key = st.entry.key; st.ceiling = st.entry.max_charge_cents; }
          st.phase = 'review'; st.notice = 'timeout';
          return { ok: false, reason: 'timeout', notSent: true };
        }
        // Handed over: only api()'s send history (notSent exactly when nothing went out) says whether it left,
        // and the fence stops it from leaving now. Until it says, the outcome is unknown and the key kept; its
        // later "nothing was sent" turns this attempt back to the review, with the same key still retained.
        (att.post as Promise<unknown>).then(null, (x: unknown) => {
          if (g !== st.gen || st.phase !== 'unknown' || !notSent(x)) return;
          st.phase = 'review'; st.notice = 'timeout';
          changed();
        });
        return unknown();
      }
      if (e && e.preflight) {
        st.phase = 'review';
        if (e.preflight === 'adopted' && e.entry) { st.pending = e.entry; st.ceiling = e.entry.max_charge_cents; st.key = e.entry.key; }
        st.notice = e.preflight === 'account' ? 'accountChanged' : e.preflight;
        return { ok: false, reason: e.preflight, notSent: true };
      }
      // Sent = handed over and not reported unsent by api() (never this module's guess).
      const sent = att.handed && !notSent(err);
      // A resend of a kept request (its first send's outcome unknown): a 409 can be the state that first request made
      // (the plan already changed, the period already paid), so it never settles the hold: unknown, the key retained.
      // IDEMPOTENCY_INTENT_MISMATCH keeps its own kind below.
      // Except a live (not pending) charge refusal: the server records it against the key after its replay check, and
      // replays the operation instead if one ran under the key, so it proves nothing was charged (else the
      // kept key is stranded, every resend replaying the same refusal). The definitive lists below refuse a pending one.
      if (sent && kept && e?.status === 409 && e.code !== 'IDEMPOTENCY_INTENT_MISMATCH' && KEY_SETTLING.indexOf(e.code || '') === -1) return unknown();
      if (sent && (kind === 'upgrade' ? upgradeDefinitive(err) : B.definitive(kind, err))) {
        const done = st.entry;
        st.pending = null; st.key = null; st.phase = 'review'; st.error = { kind: B.classifyError(err), code: e?.code, info: errorInfo(err) };
        const k = st.error.kind;
        return cleanup(done, onDropped).then((): AttemptConfirm => ({ ok: false, reason: 'refused', kind: k, definitive: true }));
      }
      if (!sent) { st.phase = 'review'; st.error = { kind: B.classifyError(err), code: e?.code, info: errorInfo(err) }; return { ok: false, reason: 'refused', notSent: true }; }
      // Another intent already holds the key: this request did not run, but the earlier one may have charged.
      // Its own kind, held like any unknown outcome (key kept), never "refused" or "nothing was charged".
      if (e?.code === 'IDEMPOTENCY_INTENT_MISMATCH') { const u = unknown(); st.error = { kind: 'intent', code: e.code, info: errorInfo(err) }; return { ...u, kind: 'intent' }; }
      return unknown();
    }).then((r) => {
      const d = dropped as Promise<void> | null;
      if (d && lock) { const l = lock as { release: () => void }; void d.then(() => { l.release(); planHoldsChanged(); }); return r; }
      return endSend(st.entry, lock).then(() => r);
    });
  }
  function snapshot(): AttemptSnapshot {
    const kept = st.pending as { region?: string } | null;
    return { phase: st.phase, notice: st.notice, owner: own ? own.owner : null, ceiling: st.ceiling, key: st.key || null, pending: !!st.pending, result: st.result, error: st.error, region: kept ? (kept.region ?? null) : region };
  }
  // A retained attempt for this user + target is shown and resent unchanged. An upgrade's target is the subscription
  // AND the plan: a retained upgrade to another plan is never adopted here.
  if (own) {
    const all: Entry[] = kind === 'upgrade' ? upgradeAll() : B.readPendingAll();
    const keep = all.filter((e) => e.kind === kind && e.user_id === own.owner
      && (kind === 'buy' ? (e as PendingEntry).family_id === (target.plan && target.plan.family_id) : (e as { sub_id?: string }).sub_id === (target.sub && target.sub.id))
      && (kind !== 'upgrade' || (e as UpgradeEntry).plan_id === planId))[0];
    if (keep) { st.pending = keep; st.key = keep.key; st.ceiling = keep.max_charge_cents; }
  }
  // Every settled quote or Confirm tells the view (the snapshot is the state).
  const told = <T,>(run: () => Promise<T>): Promise<T> => {
    const p = run();
    changed();
    return p.then((v) => { changed(); return v; }, (e: unknown) => { changed(); throw e; });
  };
  return {
    quote: () => told(quote), confirm: (agreed: boolean) => told(() => confirm(agreed)), snapshot,
    dispose() { disposed = true; },
    resume() { disposed = false; },
  };
}

// ---- recovery reads: Check again only reads ----
// Every check below issues GETs only, never sends a kept request and never drops a hold: what a read sees is evidence
// at most. A failed read is unknown (never failed or not sent). The same-key resend is the attempt's confirm(true),
// reached only from the page's confirmed "Send the same request again".
export type { HoldCheck, HoldEvidence } from './commerce-pure';
export interface HeldPlanTarget { kind: AttemptKind; subId?: string | null; planId?: string | null; familyId?: string | null }
/** The displayed user's kept entry for this target, matched as createAttempt adopts one. */
function heldEntryFor(own: ShownOwner, t: HeldPlanTarget): Entry | null {
  if (t.kind === 'upgrade') {
    const e = t.subId ? upgradeFind({ user_id: own.owner, sub_id: t.subId }) : null;
    return e && (t.planId == null || e.plan_id === t.planId) ? e : null;
  }
  return B.readPendingAll().filter((e) => e.kind === t.kind && e.user_id === own.owner
    && (t.kind === 'buy' ? e.family_id === (t.familyId ?? undefined) : e.sub_id === (t.subId ?? undefined)))[0] ?? null;
}
/** The displayed user's kept buy, pay or upgrade for this target, read from the store now (key and ceiling only): what
 *  a resend dialog is opened for and must still find at its confirm. Null when none is kept. */
export function heldPlanEntry(ctx: Ctx, t: HeldPlanTarget): { key: string; maxCents: number; sig: string } | null {
  const own = shownOwner(ctx);
  const e = own ? heldEntryFor(own, t) : null;
  return e ? { key: e.key, maxCents: e.max_charge_cents, sig: heldRequestSig(e) } : null;
}
/** The plan title the displayed user's kept buy for this target was requested for (a label only, with its key so a
 *  caller names it only for the request it adopted). A buy adopts its family's kept request, which may be for another
 *  plan version or title than the one clicked. Null when none is kept or the record has no title. */
export function heldPlanTitle(ctx: Ctx, t: HeldPlanTarget): { key: string; title: string } | null {
  if (t.kind !== 'buy') return null;
  const own = shownOwner(ctx);
  const e = own ? heldEntryFor(own, t) : null;
  const title = e && typeof e.title === 'string' ? e.title.trim() : '';
  return e && title ? { key: e.key, title } : null;
}
/** A kept reservation's request signature (owner, key, offer, term, ceiling): what its resend dialog confirms. */
export const marketPendingSig = (p: MarketPending): string => heldRequestSig(p);
const unknownCheck = (evidence: HoldEvidence | null = null): HoldCheck => ({ check: 'unknown', evidence });
/**
 * Check again for a held buy or upgrade. buy: GET /subserver-subscriptions, a server of the held plan created since
 * the claim is evidence. upgrade: GET /subserver-subscriptions/:id; an operation running is 'running', the target
 * plan reached with none running is evidence. The hold stays either way.
 */
export async function checkPlanHold(ctx: Ctx, t: HeldPlanTarget): Promise<HoldCheck> {
  const own = shownOwner(ctx);
  if (!own || (t.kind !== 'buy' && t.kind !== 'upgrade')) return { check: 'none' };
  const e = heldEntryFor(own, t);
  if (!e) return { check: 'none' };
  try {
    if (e.kind === 'upgrade') {
      const v = upgradeSeen(await getSubscription(ctx, e.sub_id), e.plan_id);
      return v === 'running' ? { check: 'running' } : unknownCheck(v === 'reached' ? { kind: 'planReached' } : null);
    }
    const l = await loadSubscriptions(ctx, 1);
    return unknownCheck(buyEvidence(l.subs, { plan_id: (e as PendingEntry).plan_id, family_id: (e as PendingEntry).family_id, at: e.at }));
  } catch { return unknownCheck(); }
}
/** Check again for a held payment: GET /subserver-subscriptions/:id. The paid period's end is evidence only. */
export async function checkPayHold(ctx: Ctx, t: HeldPlanTarget): Promise<HoldCheck> {
  const own = shownOwner(ctx);
  if (!own || t.kind !== 'pay') return { check: 'none' };
  const e = heldEntryFor(own, t);
  if (!e) return { check: 'none' };
  try { return unknownCheck(payEvidence(await getSubscription(ctx, (e as PendingEntry).sub_id as string))); } catch { return unknownCheck(); }
}
/** Check again for a held reservation: GET /reservations (first page). One of that offer and term made since the claim is evidence only.
 *  `gone`: the drawer's own unresolved admission (the purchase machine idle with notice unresolvedReserve, or a refusal
 *  that left a key it cannot rule out): when no key of the offer is kept any more (another tab may have sent it and
 *  dropped it), the read still runs, for that term since the drawer's Confirm.
 *  Without it, no kept key is 'none'. `gone.owner` is the account that
 *  confirmed: a shown account that is not it reads nothing ('none'), so another account's reservations are never shown
 *  as this one's evidence. A kept key of that term wins over another term's. */
export async function checkReserveHold(
  ctx: Ctx,
  offerId: string | null | undefined,
  gone?: { days: string; since: number | null; owner?: string | null } | null,
): Promise<HoldCheck> {
  const own = shownOwner(ctx);
  if (!own || (gone && gone.owner !== undefined && gone.owner !== own.owner)) return { check: 'none' };
  const mine = offerId ? marketPendingFor(ctx).filter((p) => p.offer_id === offerId) : [];
  const termKept = gone ? mine.find((p) => p.days === gone.days) : undefined;
  const pend = termKept ?? (offerId && gone && gone.since !== null ? { offer_id: offerId, days: gone.days, at: gone.since } : mine[0]);
  if (!pend) return { check: 'none' };
  try {
    const resp = await boundedRead(() => viaOwner(own, reservationsRoute, { query: page0(), timeoutMs: bounds.read }));
    const m = M.advisoryMatch(resp && resp.data, pend.offer_id, pend.days, new Date(pend.at).toISOString());
    return unknownCheck(m && typeof m.created_at === 'string' ? { kind: 'reserved', at: m.created_at } : null);
  } catch { return unknownCheck(); }
}

/** Auto-renew on/off: no charge, but a commitment; the same owner rule. */
export function setAutoRenew(own: ShownOwner | null, _ctx: Ctx, sub: { id: string }, on: boolean): Promise<Env> {
  if (!own || !own.live()) return Promise.reject(refusal('ACCOUNT_CHANGED'));
  return viaOwner(own, autoRenewRoute, { params: { id: sub.id }, body: { auto_renew: !!on } });
}

// ---- the top-up dialog's flow: method, amount, then the provider's checkout ----
// One key per dialog; a method switch is a new purchase (a key never spans two providers); another amount
// after an attempt is another purchase (a key never spans two amounts); PAYMENT_IDEMPOTENCY_KEY_REUSED means
// the key is spent: a new one. The page navigates to `url` itself (top-level navigation).
export interface TopUpSnapshot {
  phase: 'account' | 'loading' | 'ready' | 'none' | 'availError' | 'submitting' | 'redirect' | 'error' | 'pending';
  methods: TopUpMethod[]; method: 'card' | 'crypto' | null; key: string | null; error: unknown; url: string | null;
  /** Set while the last submit's outcome is unknown (sent, answer lost): the exact request resend() sends again.
   *  persisted: false when the hold could not be stored (storage blocked or full): only this tab remembers it,
   *  and a reload or another tab will not show it (the page says so). sending: true while a POST of this key
   *  is out (this drawer's, another drawer's or another tab's): forget() is refused then. */
  pending: { key: string; method: 'card' | 'crypto'; amount: string; persisted: boolean; sending?: boolean } | null;
}
export type TopUpSubmit = { ok: true; url: string }
  | { ok: false; reason: 'busy' | 'nomethod' | 'failed'; error?: unknown }
  /** No Web Locks: a first send would mint a key two tabs could each mint. Nothing was sent. */
  | { ok: false; reason: 'noLocks'; error?: unknown }
  /** A first send whose hold storage could not keep (written and read back): nothing was sent, nothing is held (the
   *  same refusal as a rent's or a reserve's). */
  | { ok: false; reason: 'storageFailed'; error?: unknown }
  /** Check again found the owner's top-up already answered elsewhere (another drawer): nothing was sent; the
   *  drawer is ready again with a new key. */
  | { ok: false; reason: 'resolved' }
  | { ok: false; reason: 'pending'; key: string; method: 'card' | 'crypto'; amount: string; error?: unknown };
export interface TopUp {
  load(): Promise<void>;
  select(key: 'card' | 'crypto'): boolean;
  submit(amountRaw: unknown): Promise<TopUpSubmit>;
  /** After a pending submit: a read only, never a send. The held request stays pending ('pending'), or the answer
   *  says another drawer answered it ('resolved') or a POST of it is out ('busy'). */
  checkAgain(): Promise<TopUpSubmit>;
  /** The person's confirmed resend of the exact held request (same key, provider, amount); never a new one.
   *  Nothing is sent without `true`; with `shown` (what the confirm dialog showed) nothing is sent unless the held
   *  request is still exactly that. */
  resend(confirmed: true, shown?: { key: string; method: string; amount: string } | null): Promise<TopUpSubmit>;
  /** "Forget this payment": the person's explicit, confirmed exit from a held top-up that Check again cannot
   *  resolve (e.g. every replay refused because the provider's bounds changed: the bounds check runs before the
   *  key lookup, so that refusal proves nothing). The page asks first, saying the payment may have gone through
   *  and to check the billing history, and passes `true` only after that confirm. It drops the owner's held
   *  record (this key only), sends nothing and leaves the drawer ready with a new key. Refused (false) while a
   *  POST of the held key is out in any drawer or tab (pending.sending), when the shared record holds another
   *  key, when nothing is held, or without `true`. Never shown as failed or not sent. */
  forget(confirmed: true): boolean;
  snapshot(): TopUpSnapshot;
  dispose(): void;
  resume(): void;
}
// A top-up whose outcome is unknown, per owner, at module level: it survives the drawer (a new machine
// restores it: same provider, amount and key; only Check again may run). It is registered BEFORE the POST
// leaves, so a drawer closed and reopened during a slow or hung POST holds too: admission is per owner, not per
// machine. Every write and drop matches the key (a late answer of another key never touches it). Dropped on
// an answer (the redirect), a definite refusal of the first request, an account change or a sign-out; a realm
// switch keeps it (the wallet is account-wide). Restored even when its provider is missing from availability
// (held: never a fresh key beside it).
// It is also stored (localStorage hub.v3.topup_pending: owner, key, provider, amount, time; no secret), so a
// reload, another tab or an account switch and back still shows "may have gone through" with Check again under
// the same key. Storage is read first. A send leaves only once storage keeps its hold, stamped (written and read
// back; a first send refused otherwise: storageFailed); module memory backs it after that, when storage cannot be
// read or a later write is refused (this tab still holds). Kept at sign-out (registry row, purge:false, like hub_money_pending): each entry names its user
// and is read only for that user.
// A POST in flight is stamped on the record (sending: its attempt id, sending_at), by every drawer and tab, and
// cleared only by that attempt's own answer: forget() is refused while it is set, so no drawer can drop a key
// whose POST is still out and start a new one beside it. A tab that dies mid-POST leaves the stamp; past
// TOPUP_SENDING_STALE_MS it no longer refuses (this tab's own POSTs are known in memory and never go stale).
// Every read-modify-write of the record (hold, stamp, drop, the admission of a new top-up) runs under the pending
// lock (withPendingLock) with a fresh read of the owner's record.
type HeldTopUp = { key: string; method: 'card' | 'crypto'; amount: string; persisted?: boolean; sending?: string; sending_at?: number };
const topUpPending = new Map<string, HeldTopUp>();
/** This tab's POSTs in flight: owner + key + attempt. */
const topUpSending = new Set<string>();
/** Attempts this tab started: once out of topUpSending, their stamp is stale even before its locked cleanup. */
const topUpOwnAttempts = new Set<string>();
const sendingId = (owner: string, key: string, attempt: string): string => owner + '\u0000' + key + '\u0000' + attempt;
const TOPUP_SENDING_STALE_MS = 120000;
const TOPUP_HEARTBEAT_MS = 30000;
onBump((reason) => { if (!keepsChanges(reason)) { topUpPending.clear(); topUpChanged(); } });
const TOPUP_PENDING = 'hub.v3.topup_pending';
interface StoredTopUp extends HeldTopUp { user_id: string; at: number }
// The stored method is read by one rule, the return value's own (returnProviderPrefix): 'crypto' is crypto, any other
// stored word is the card method. A record written under an earlier method word keeps its key, amount and stamp, so
// the hold it stands for is never lost; every write stores only 'card' or 'crypto'.
function validTopUp(eIn: unknown): eIn is StoredTopUp {
  const e = eIn as Rec | null | undefined;
  return !!e && typeof e.user_id === 'string' && e.user_id.length > 0 && e.user_id.length <= 128
    && typeof e.key === 'string' && /^[\w-]{16,128}$/.test(e.key) && typeof e.method === 'string' && e.method.length > 0 && e.method.length <= 32
    && typeof e.amount === 'string' && /^[0-9]{1,9}\.[0-9]{2}$/.test(e.amount) && typeof e.at === 'number' && isFinite(e.at)
    && (e.sending === undefined || (typeof e.sending === 'string' && /^[\w-]{16,128}$/.test(e.sending) && typeof e.sending_at === 'number' && isFinite(e.sending_at)));
}
// null = unreadable (not the same as empty).
function readTopUps(): StoredTopUp[] | null {
  let raw: string | null;
  try { raw = localStore().getItem(TOPUP_PENDING); } catch { return null; }
  try { const a: unknown = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter(validTopUp).map((e) => (e.method === 'crypto' ? e : { ...e, method: W.returnProviderPrefix(e.method) })) : []; } catch { return []; }
}
/** True when the list was written (false: storage blocked or full; memory still holds). Never cut:
 *  the list holds one row per account (holdTopUp), and dropping another account's row lost its "may have gone
 *  through" and freed a second top-up with no warning. */
function writeTopUps(list: StoredTopUp[]): boolean {
  try { if (list.length) localStore().setItem(TOPUP_PENDING, JSON.stringify(list)); else localStore().removeItem(TOPUP_PENDING); return true; } catch { return false; }
}
/** The owner's held top-up: the stored one (another tab's, or before a reload; persisted), else this tab's
 *  memory when it never reached storage (persisted false) or storage cannot be read now. A memory hold that was
 *  stored and is gone from readable storage was resolved elsewhere (another tab): it is dropped here too. */
function heldTopUp(owner: string): HeldTopUp | undefined {
  const list = readTopUps();
  const e = (list || []).find((x) => x.user_id === owner);
  if (e) return { key: e.key, method: e.method, amount: e.amount, persisted: true, ...(e.sending ? { sending: e.sending, sending_at: e.sending_at } : {}) };
  const m = topUpPending.get(owner);
  if (!m) return undefined;
  if (list && m.persisted) { topUpPending.delete(owner); return undefined; }
  return { ...m, persisted: false };
}
/** True while a POST of the owner's held `key` is out: this tab's (memory), or another tab's fresh stamp. */
function topUpSendingNow(owner: string, h: HeldTopUp): boolean {
  const pre = owner + '\u0000' + h.key + '\u0000';
  for (const id of topUpSending) if (id.startsWith(pre)) return true;
  return !!h.sending && !topUpOwnAttempts.has(h.sending) && typeof h.sending_at === 'number' && Date.now() - h.sending_at < TOPUP_SENDING_STALE_MS;
}
/** The displayed owner's unresolved top-up, as core's own record reads it now (no availability read, no machine). */
export interface TopUpHeld {
  readonly key: string; readonly method: 'card' | 'crypto'; readonly amount: string;
  /** False when the hold could not be stored (storage blocked or full): only this tab remembers it. */
  readonly persisted: boolean;
  /** A POST of the key is out (this tab's, or another tab's stamp still inside TOPUP_SENDING_STALE_MS). Moves with time:
   *  read it again on a tick while it is true. */
  readonly sending: boolean;
}
/** Synchronous and owner-bound (shownOwner): another account's hold is never visible. Null when nothing is held. */
export function topUpHeldFor(ctx: Ctx | null | undefined): TopUpHeld | null {
  const own = ctx ? shownOwner(ctx) : null;
  if (!own) return null;
  const h = heldTopUp(own.owner);
  return h ? { key: h.key, method: h.method, amount: h.amount, persisted: h.persisted === true, sending: topUpSendingNow(own.owner, h) } : null;
}
/** Remove all local data (local-wipe.ts) wipes every account's records in this browser, so it runs only while no
 *  payment's outcome is open here. 'settled': every stored payment list (buy and pay, upgrade, Market, rent, top-up)
 *  is absent or an empty list, no checkout return or resume marker is kept (top-up return, buy and Market resume),
 *  and this tab's memory holds no rent or top-up hold or send. 'held': any of them holds something, for any account.
 *  'unreadable': a list or marker could not be read, or is not a list where one is stored (never taken for empty).
 *  Read only. */
export function paymentsSettled(): 'settled' | 'held' | 'unreadable' {
  let heldAny = false;
  for (const k of [B.PENDING_KEY, UPGRADE_KEY, MKT_PENDING, RENT_PENDING, TOPUP_PENDING]) {
    try {
      const raw = localStore().getItem(k);
      if (raw === null) continue;
      const v: unknown = JSON.parse(raw);
      if (!Array.isArray(v)) return 'unreadable';
      if (v.length) heldAny = true;
    } catch {
      return 'unreadable';
    }
  }
  for (const k of [TOPUP_RETURN_KEY, B.RESUME_KEY, M.RESUME_KEY]) {
    try {
      if (sessionStore().getItem(k) !== null) heldAny = true;
    } catch {
      return 'unreadable';
    }
  }
  if (rentMarks.size || rentQueued.size || topUpPending.size || topUpSending.size) heldAny = true;
  return heldAny ? 'held' : 'settled';
}
const topUpListeners = new Set<() => void>();
function topUpChanged(): void { for (const l of [...topUpListeners]) { try { l(); } catch { /* a listener's own */ } } }
/** Called after every change of the owner's held top-up: a locked hold, restamp or drop (after the write really ran,
 *  a Forget's delayed delete included), an attempt's send starting or ending, another tab's write (storage) and an
 *  account change. */
export function subscribeTopUpPending(fn: () => void): () => void {
  topUpListeners.add(fn);
  return () => { topUpListeners.delete(fn); };
}
hostEnv().onExternalChange((_area, key) => { if (key === TOPUP_PENDING || key === null) topUpChanged(); });
/** Holds the owner's top-up; true when it was stored (false: only this tab remembers it). `sending` stamps an
 *  attempt's POST in flight; without it, the stamp of the same key is kept (an answer clears only its own). */
function holdTopUp(owner: string, h: HeldTopUp, sending?: string): boolean {
  const list = readTopUps();
  const was = (list || []).find((x) => x.user_id === owner);
  const prev = topUpPending.get(owner);
  const stamp = sending ? { sending, sending_at: Date.now() }
    : was && was.key === h.key && was.sending ? { sending: was.sending, sending_at: was.sending_at }
      : prev && prev.key === h.key && prev.sending ? { sending: prev.sending, sending_at: prev.sending_at } : {};
  const ok = !!list && writeTopUps([...list.filter((x) => x.user_id !== owner), { user_id: owner, key: h.key, method: h.method, amount: h.amount, at: Date.now(), ...stamp }]);
  topUpPending.set(owner, { key: h.key, method: h.method, amount: h.amount, persisted: ok, ...stamp });
  topUpChanged();
  return ok;
}
/** The read-back of an admission's hold: readable storage holds the owner's record as `key` stamped by `attempt`. */
function topUpStamped(owner: string, key: string, attempt: string): boolean {
  const e = (readTopUps() || []).find((x) => x.user_id === owner);
  return !!e && e.key === key && e.sending === attempt;
}
/** Puts the owner's stored row back to `row` (none: removed), into the list as it is stored now; every other
 *  account's row is kept as stored. Unreadable storage is left as it is (a row it may keep only holds more). */
function restoreOwnTopUp(owner: string, row: StoredTopUp | undefined): void {
  const now = readTopUps();
  if (!now) return;
  writeTopUps([...now.filter((x) => x.user_id !== owner), ...(row ? [row] : [])]);
}
/** Renews `attempt`'s in-flight stamp of `key` (another attempt's stamp, or none, stays as it is). */
function restampTopUp(owner: string, key: string, attempt: string): void {
  const now = Date.now();
  const m = topUpPending.get(owner);
  if (m && m.key === key && m.sending === attempt) m.sending_at = now;
  const list = readTopUps();
  if (list && list.some((x) => x.user_id === owner && x.key === key && x.sending === attempt)) {
    writeTopUps(list.map((x) => (x.user_id === owner && x.key === key && x.sending === attempt ? { ...x, sending_at: now } : x)));
  }
  topUpChanged();
}
/** True while the owner's record is still `key` stamped by `attempt`. Readable storage decides; this tab's memory
 *  only for a hold that never reached storage, or while storage cannot be read. A record another tab dropped
 *  (Forget) or replaced is no longer this attempt's: nothing more of it may leave. */
function ownsTopUpStamp(owner: string, key: string, attempt: string): boolean {
  const list = readTopUps();
  const e = (list || []).find((x) => x.user_id === owner);
  if (e) return e.key === key && e.sending === attempt;
  const m = topUpPending.get(owner);
  if (!m || m.key !== key || m.sending !== attempt) return false;
  return !list || m.persisted !== true;
}
/** Clears `attempt`'s in-flight stamp of `key` (another attempt's stamp stays). */
function unstampTopUp(owner: string, key: string, attempt: string): void {
  topUpSending.delete(sendingId(owner, key, attempt));
  const m = topUpPending.get(owner);
  if (m && m.key === key && m.sending === attempt) { delete m.sending; delete m.sending_at; }
  const list = readTopUps();
  if (list && list.some((x) => x.user_id === owner && x.key === key && x.sending === attempt)) {
    writeTopUps(list.map((x) => {
      if (!(x.user_id === owner && x.key === key && x.sending === attempt)) return x;
      const { sending: _s, sending_at: _a, ...rest } = x;
      return rest;
    }));
  }
}
/** Drops the owner's held top-up only when it is still this key (another key's answer never touches it). */
function dropTopUp(owner: string, key: string): void {
  if (topUpPending.get(owner)?.key === key) topUpPending.delete(owner);
  const list = readTopUps();
  if (list && list.some((x) => x.user_id === owner && x.key === key)) writeTopUps(list.filter((x) => !(x.user_id === owner && x.key === key)));
  topUpChanged();
}
/** The record writes, each under the pending lock (fire and forget: the next admission reads the store). */
const lockedTopUp = (fn: () => void): void => { void B.withPendingLock(fn).then(null, () => { /* the next read decides */ }); };

export function createTopUp(o: { onChange?: (s: TopUpSnapshot) => void } = {}): TopUp {
  const ctx = capture();
  const own = shownOwner(ctx);
  const s: TopUpSnapshot = { phase: own ? 'loading' : 'account', methods: [], method: null, key: null, error: null, url: null, pending: null };
  let sent: string | null = null, disposed = false;
  // The last availability read's failure (null once a read answered): a held top-up shows through a failed read, and when it is
  // forgotten the drawer goes back to "could not read the options", never to "no method is enabled" (C9).
  let availFailure: unknown = null;
  const snapshot = (): TopUpSnapshot => ({ ...s, methods: s.methods.slice() });
  function changed(): void {
    if (disposed || typeof o.onChange !== 'function') return;
    try { o.onChange(snapshot()); } catch { /* view error */ }
  }
  const selected = (): TopUpMethod | undefined => s.methods.find((m) => m.key === s.method);
  // The send now out (one at a time per drawer): every answer is fenced by its own number, so a late answer of an
  // earlier send never writes over this drawer's state.
  let seq = 0;
  function load(): Promise<void> {
    if (!own) return Promise.resolve();
    // A send is out: its answer decides the drawer; a load now would turn it back to pending or ready.
    if (s.phase === 'submitting') return Promise.resolve();
    s.phase = 'loading'; s.error = null; changed();
    return availability(ctx).then((av) => {
      if (disposed) return;
      const methods = av.methods.filter((m) => m.key === 'card' || m.key === 'crypto');
      availFailure = null;
      s.methods = methods;
      if (s.phase !== 'loading') { changed(); return; }
      if (restoreKept()) { changed(); return; }
      if (!methods.length) { s.phase = 'none'; changed(); return; }
      const first = methods[0] as TopUpMethod;
      s.method = first.key; s.key = M.newIdemKey(); s.phase = 'ready';
      changed();
    }, (e: unknown) => {
      if (disposed || s.phase !== 'loading') return;
      availFailure = e;
      // A held top-up still shows (Check again and its confirmed resend work without availability).
      if (restoreKept()) { s.error = e; changed(); return; }
      s.phase = 'availError'; s.error = e; changed();
    });
  }
  // The owner's unresolved top-up (another drawer's, or this one's sent before a close): the same request,
  // refused until Check again resolves it. Its provider may be missing now; it still holds.
  function restoreKept(): boolean {
    const kept = own ? heldTopUp(own.owner) : undefined;
    if (!kept) return false;
    s.method = kept.method; s.key = kept.key; s.phase = 'pending'; sent = kept.amount;
    s.pending = { key: kept.key, method: kept.method, amount: kept.amount, persisted: kept.persisted === true, sending: topUpSendingNow((own as ShownOwner).owner, kept) };
    return true;
  }
  const keptKey = (): string | undefined => (own ? heldTopUp(own.owner)?.key : undefined);
  const ready = (): void => {
    const m0 = s.methods.find((x) => x.key === s.method) ?? s.methods[0];
    s.pending = null; s.error = null; sent = null;
    s.method = m0 ? m0.key : null; s.key = M.newIdemKey();
    if (m0) s.phase = 'ready';
    else if (availFailure !== null) { s.phase = 'availError'; s.error = availFailure; }
    else s.phase = 'none';
  };
  // While a top-up's outcome is unknown only Check again may run: no other method, amount or key.
  function select(key: 'card' | 'crypto'): boolean {
    if (s.phase === 'submitting' || s.phase === 'pending' || !s.methods.some((m) => m.key === key)) return false;
    if (s.method === key) return true;
    s.method = key;
    s.key = M.newIdemKey(); // a method switch is a new purchase
    changed();
    return true;
  }
  function submit(amountRaw: unknown): Promise<TopUpSubmit> {
    if (s.phase === 'submitting' || s.phase === 'pending') return Promise.resolve({ ok: false, reason: 'busy' });
    // Another drawer's top-up of this owner is unresolved (or still being sent): this one shows it and holds.
    if (keptKey() !== undefined) { restoreKept(); changed(); return Promise.resolve({ ok: false, reason: 'busy' }); }
    const m = selected();
    if (!m || !s.key) return Promise.resolve({ ok: false, reason: 'nomethod' });
    const v = W.normalizeAmount(amountRaw);
    // Another amount after an attempt is another purchase: a key never spans two amounts.
    if (sent !== null && sent !== v) s.key = M.newIdemKey();
    sent = v;
    return send(m, amountRaw, s.key, v);
  }
  function send(m: TopUpMethod, amountRaw: unknown, key: string, amount: string | null, replay = false): Promise<TopUpSubmit> {
    // The owner stopped being live (another account, a dead context): nothing is written or sent, as walletWrite's
    // refusal of a not-live owner. A replay's earlier request stays unresolved (pending); the refusal itself is not sent.
    if (own && !own.live()) return Promise.resolve(ownerGone(replay, key, m, amount));
    const my = ++seq;
    const attempt = M.newIdemKey();
    s.phase = 'submitting'; s.error = null; changed();
    const owner = own ? own.owner : null;
    const method = m.key === 'card' || m.key === 'crypto' ? m.key : null;
    if (!owner || !amount || !method) return post(m, amountRaw, key, amount, replay, my, null);
    // Admission under the pending lock with a fresh read of the owner's record, registered (and stamped as
    // sending) BEFORE the request leaves (see topUpPending): a close and reopen mid-POST, another drawer or
    // another tab holds. A first send finding any record, or a replay finding another key, sends nothing.
    return admitUnderLock((): boolean | 'sending' | 'noLocks' | 'storageFailed' | 'stampFailed' | 'account' => {
      // Checked again under the lock, before any write: the owner may have left while the lock was awaited.
      if (!own || !own.live()) return 'account';
      const held = heldTopUp(owner);
      // A replay goes only while the record is still this request (key, provider, amount), never a rewritten one.
      if (replay ? !held || held.key !== key || held.method !== method || held.amount !== amount : !!held) return false;
      // A first send mints the record's key: refused without Web Locks; a replay keeps its key.
      if (!replay && !B.pendingLockHeld()) return 'noLocks';
      // A replay while a POST of the key is still out (another drawer's or tab's) sends nothing and never takes
      // over its stamp: that POST's own answer moves the record.
      if (replay && topUpSendingNow(owner, held as HeldTopUp)) return 'sending';
      // No POST leaves before storage keeps its hold, stamped by this attempt (written and read back): a hold only
      // this tab's memory keeps is gone after a reload or an account switch, and a new key could then be minted beside
      // a top-up that went through. Refused, only this attempt's state is undone: the
      // memory entry, and this owner's stored row as it was before (an earlier record of a replay stays the hold).
      // Only this owner's row is put back, into the list as stored now: a replay may run on the in-tab fallback (no
      // cross-tab lock), and another tab's row written meanwhile must stay.
      const before = readTopUps();
      const prev = topUpPending.get(owner);
      const wrote = holdTopUp(owner, { key, method, amount }, attempt);
      if (!wrote || !topUpStamped(owner, key, attempt)) {
        if (wrote && before) restoreOwnTopUp(owner, before.find((x) => x.user_id === owner));
        if (prev) topUpPending.set(owner, prev); else topUpPending.delete(owner);
        topUpChanged();
        // A first send: nothing was sent and nothing is held. A replay: its record (the key) is still stored, so its
        // earlier request stays unresolved: pending, never "not sent", and nothing is sent without its stamp stored.
        return replay ? 'stampFailed' : 'storageFailed';
      }
      topUpSending.add(sendingId(owner, key, attempt));
      topUpOwnAttempts.add(attempt);
      return true;
    }, 'late' as const).then((admitted): TopUpSubmit | Promise<TopUpSubmit> => {
      if (admitted === 'late') throw new Error('late');
      if (admitted === 'account') {
        if (my === seq) { if (!restoreKept()) s.phase = replay ? 'pending' : 'ready'; changed(); }
        return ownerGone(replay, key, m, amount);
      }
      if (admitted === 'noLocks') {
        if (my === seq) { if (!restoreKept()) ready(); changed(); }
        return { ok: false, reason: 'noLocks', error: { notSent: true } };
      }
      if (admitted === 'sending') {
        if (my === seq) { restoreKept(); changed(); }
        return { ok: false, reason: 'busy' };
      }
      if (admitted === 'storageFailed') {
        if (my === seq) { if (!restoreKept()) ready(); changed(); }
        return { ok: false, reason: 'storageFailed', error: { notSent: true } };
      }
      if (admitted === 'stampFailed') {
        if (my === seq) { if (!restoreKept()) s.phase = 'pending'; changed(); }
        return { ok: false, reason: 'pending', key, method: method as 'card' | 'crypto', amount: amount as string, error: { pending: true } };
      }
      if (!admitted) {
        if (my === seq) { if (!restoreKept()) ready(); changed(); }
        return replay && !keptKey() ? { ok: false, reason: 'resolved' } : { ok: false, reason: 'busy' };
      }
      return post(m, amountRaw, key, amount, replay, my, attempt);
    }).then((v) => v, (): TopUpSubmit => {
      // The lock could not be taken in time: nothing was sent now. A replay's earlier request is still unresolved:
      // pending, never "not sent".
      if (my === seq) { if (!restoreKept()) { s.phase = replay ? 'pending' : 'ready'; } changed(); }
      if (replay) return { ok: false, reason: 'pending', key, method: method as 'card' | 'crypto', amount: amount as string, error: { pending: true } };
      return { ok: false, reason: 'failed', error: { notSent: true } };
    });
  }
  // A send refused because the owner is not live: the module's ACCOUNT_CHANGED refusal (not sent), as a first send's
  // definite refusal ('failed'); a replay keeps its held request unresolved ('pending', as any refused replay).
  function ownerGone(replay: boolean, key: string, m: TopUpMethod, amount: string | null): TopUpSubmit {
    const error = refusal('ACCOUNT_CHANGED');
    if (replay) return { ok: false, reason: 'pending', key, method: m.key === 'crypto' ? 'crypto' : 'card', amount: amount || '', error };
    return { ok: false, reason: 'failed', error };
  }
  function post(m: TopUpMethod, amountRaw: unknown, key: string, amount: string | null, replay: boolean, my: number, attempt: string | null): Promise<TopUpSubmit> {
    const owner = own ? own.owner : null;
    // While the POST is out (a slow provider, a 2FA prompt holding it unsent), its stamp is renewed, so another
    // tab never reads it as a dead tab's.
    // The stamp is the attempt's licence: once another tab forgot or replaced the record (this tab asleep past the
    // stale window, a 2FA prompt open), the attempt is aborted and its 2FA retry never leaves.
    // Checked on each beat, when the page is shown again, and (still) right before any send of it.
    const ctl = new AbortController();
    const ours = (): boolean => !owner || !attempt || ownsTopUpStamp(owner, key, attempt);
    const check = (): void => { if (!ctl.signal.aborted && !ours()) ctl.abort(); };
    const onShow = (): void => { let shown = true; try { shown = hostEnv().visible(); } catch { /* no document */ } if (shown) check(); };
    const unShow: Array<() => void> = [];
    let beat: ReturnType<typeof setInterval> | null = null;
    const stopBeat = (): void => {
      if (beat) clearInterval(beat);
      beat = null;
      for (const off of unShow.splice(0)) { try { off(); } catch { /* already gone */ } }
    };
    if (owner && attempt) {
      // The beat stops with its owner (another account shown): the stamp then ages out instead of renewing.
      beat = setInterval(() => {
        if (!own || !own.live()) { stopBeat(); return; }
        // Read again under the lock: a beat queued behind another holder runs after the owner may have left.
        lockedTopUp(() => { if (!own.live()) { stopBeat(); return; } restampTopUp(owner, key, attempt); check(); });
      }, TOPUP_HEARTBEAT_MS);
      // Shown again: through host-env (the terminal Hub's strict window throws on use); a host without a document
      // (tests without a DOM) has no page to show, and the beat still checks. A registration that fails leaves none of
      // the pair attached (registrationGroup only skips the members after it), the beat alone checks from then on.
      const unregister = (): void => { for (const off of unShow.splice(0)) { try { off(); } catch { /* already gone */ } } };
      try {
        registrationGroup(() => {
          unShow.push(hostEnv().onVisibilityChange(onShow));
          unShow.push(hostEnv().onLifecycle('pageshow', onShow));
        }, unregister);
      } catch { unregister(); }
    }
    const done = (): void => { stopBeat(); if (owner && attempt) { const a = attempt; lockedTopUp(() => unstampTopUp(owner, key, a)); topUpSending.delete(sendingId(owner, key, a)); topUpChanged(); } };
    const dropMine = (): void => { if (owner) lockedTopUp(() => dropTopUp(owner, key)); };
    const mine = (): boolean => my === seq;
    return topup(own, ctx, m, amountRaw, key, { signal: ctl.signal, still: ours }).then((r): TopUpSubmit => {
      done(); dropMine();
      if (mine()) { s.phase = 'redirect'; s.url = r.url; s.pending = null; changed(); }
      return { ok: true, url: r.url };
    }, (e: unknown): TopUpSubmit => {
      // Read before done() clears this attempt's stamp.
      const lost = !!attempt && !!(e as Err | null)?.cancelled && !ours();
      done();
      // Ended because the record is no longer this attempt's: nothing more was sent (a 2FA challenge applies
      // nothing). The record is whoever holds it now; this drawer shows that, or is ready again.
      if (lost) {
        if (mine()) { if (!restoreKept()) ready(); changed(); }
        return keptKey() !== undefined ? { ok: false, reason: 'busy' } : { ok: false, reason: 'resolved' };
      }
      // Sent and unanswered: the key, provider and amount are kept for Check again; never "failed".
      if (isPending(e) && amount && (m.key === 'card' || m.key === 'crypto')) {
        const method = m.key;
        const h = owner ? heldTopUp(owner) : undefined;
        const persisted = !!h && h.key === key && h.persisted === true;
        if (mine()) { s.phase = 'pending'; s.error = e; s.pending = { key, method, amount, persisted }; changed(); }
        // The record stays (or comes back: the outcome is still unknown), never over another key's.
        if (owner) {
          lockedTopUp(() => {
            const now = heldTopUp(owner);
            if (now && now.key !== key) return;
            const ok = now ? now.persisted === true : holdTopUp(owner, { key, method, amount });
            if (mine() && s.phase === 'pending' && s.pending?.key === key && s.pending.persisted !== ok) { s.pending = { ...s.pending, persisted: ok }; changed(); }
          });
        }
        return { ok: false, reason: 'pending', key, method, amount, error: e };
      }
      // A replay's refusal (a 429, a dead context) says nothing about the first request: it stays pending.
      if (replay) {
        if (mine()) { s.error = e; if (s.pending) s.phase = 'pending'; changed(); }
        return { ok: false, reason: 'pending', key, method: m.key === 'crypto' ? 'crypto' : 'card', amount: amount || '', error: e };
      }
      dropMine();
      if (mine()) {
        s.phase = 'error'; s.error = e; s.pending = null;
        if ((e as Err | null)?.code === 'PAYMENT_IDEMPOTENCY_KEY_REUSED') s.key = M.newIdemKey();
        changed();
      }
      return { ok: false, reason: 'failed', error: e };
    });
  }
  // The owner's shared record, read afresh: still this key with no POST of it out -> the held request; otherwise what
  // to answer instead (another drawer answered it, holds another key, or a POST of it is out now).
  function heldNow(p: NonNullable<TopUpSnapshot['pending']>): TopUpSubmit | null {
    const held = own ? heldTopUp(own.owner) : undefined;
    if (held && held.key === p.key && own && topUpSendingNow(own.owner, held)) { restoreKept(); changed(); return { ok: false, reason: 'busy' }; }
    if (!held || held.key !== p.key || held.method !== p.method || held.amount !== p.amount) {
      if (held) { restoreKept(); changed(); return { ok: false, reason: 'busy' }; }
      ready();
      changed();
      return { ok: false, reason: 'resolved' };
    }
    return null;
  }
  // Check again only reads: it never sends. No member read finds a top-up by its key yet,
  // so a lost answer stays pending (the record, Dismiss and resend stay); the page reads the balance itself.
  function checkAgain(): Promise<TopUpSubmit> {
    const p = s.pending;
    if (s.phase === 'submitting') return Promise.resolve({ ok: false, reason: 'busy' });
    if (!p) return Promise.resolve({ ok: false, reason: 'nomethod' });
    const other = heldNow(p);
    if (other) return Promise.resolve(other);
    restoreKept();
    changed();
    return Promise.resolve({ ok: false, reason: 'pending', key: p.key, method: p.method, amount: p.amount });
  }
  // The person's confirmed "Send the same request again": only the owner's shared record is resent, as it was sent,
  // with the held method (fixed route and answer field, no amount bounds): its bounds were met when it first went
  // out, and bounds the provider changed since never block the resend of a request already out. Without `true`
  // nothing is sent.
  function resend(confirmed: true, shown?: { key: string; method: string; amount: string } | null): Promise<TopUpSubmit> {
    const p = s.pending;
    if (confirmed !== true || s.phase === 'submitting') return Promise.resolve({ ok: false, reason: 'busy' });
    if (!p) return Promise.resolve({ ok: false, reason: 'nomethod' });
    // The request the person confirmed (when the caller says which): anything else held now is not sent.
    if (shown && (shown.key !== p.key || shown.method !== p.method || shown.amount !== p.amount)) return Promise.resolve({ ok: false, reason: 'busy' });
    const other = heldNow(p);
    if (other) return Promise.resolve(other);
    return send(heldMethod(p.method), p.amount, p.key, p.amount, true);
  }
  function forget(confirmed: true): boolean {
    const p = s.pending;
    if (confirmed !== true || s.phase !== 'pending' || !p) return false;
    // The owner stopped being live: refused, nothing written (the record is that owner's, not this page's now).
    if (own && !own.live()) return false;
    if (own) {
      // A fresh read: the shared record must still be this key, with no POST of it out anywhere.
      const owner = own.owner;
      const held = heldTopUp(owner);
      if (held && held.key !== p.key) { restoreKept(); changed(); return false; }
      if (held && topUpSendingNow(owner, held)) { s.pending = { ...p, sending: true }; changed(); return false; }
      // Dropped under the lock, checked again there: a send of the key that began since keeps the record (its own
      // answer moves it), and the drawer that started it holds.
      lockedTopUp(() => { const h = heldTopUp(owner); if (h && h.key === p.key && !topUpSendingNow(owner, h)) dropTopUp(owner, p.key); });
    }
    ready();
    changed();
    return true;
  }
  return { load, select, submit, checkAgain, resend, forget, snapshot, dispose() { disposed = true; }, resume() { disposed = false; } };
}

// ---- per-account state goes with the account ----
// The ban latch and the reservations' terminal latch are the account's: they end with it (sign-out, another
// account, any purge), not with a realm switch.
function forgetAccount(): void {
  marketLatch.banned = false;
  resTerminal = dict<ResRow>();
}
onTeardown((reason) => { if (reason === 'account' || reason === 'signout' || reason === 'logout') forgetAccount(); });
onBump((reason) => { if (reason === 'account' || reason === 'signout' || reason === 'logout') forgetAccount(); });

/** The latches and the budgets back to their defaults (session disposal, dispose.ts; tests). */
export function resetCommerce(): void {
  forgetAccount();
  rentMarks.clear();
  rentQueued.clear();
  rentPatch.clear();
  try { localStore().removeItem(RENT_PENDING); } catch { /* tests */ }
  marketRetryUntil.clear();
  reserveUnknown.clear();
  topUpPending.clear();
  topUpSending.clear();
  topUpOwnAttempts.clear();
  holdListeners.clear();
  watched.clear();
  holdOwner = null;
  Object.assign(bounds, BOUND_DEFAULT);
  Object.assign(budgets, BUDGET_DEFAULT);
  Object.assign(RES, RES_DEFAULT);
  Object.assign(SUBS, SUBS_DEFAULT);
}

// ---- React: thin wrappers; every rule above is a plain function the tests drive without React ----
interface Machine<S> { snapshot(): S; dispose(): void; resume(): void }
interface Box<S, T extends Machine<S>> { machine: T; current: S; subs: Set<() => void> }
/**
 * One machine per mount, its snapshot as state (useSyncExternalStore), disposed on unmount (and resumed by a
 * StrictMode remount). The arguments are read once: show another row in a new dialog (a new key / mount).
 */
function useMachine<S, T extends Machine<S>>(make: (onChange: (s: S) => void) => T): { machine: T; state: S } {
  const ref = useRef<Box<S, T> | null>(null);
  if (!ref.current) {
    const subs = new Set<() => void>();
    const box = { subs } as Box<S, T>;
    box.machine = make((s) => { box.current = s; for (const l of [...subs]) l(); });
    box.current = box.machine.snapshot();
    ref.current = box;
  }
  const box = ref.current;
  const state = useSyncExternalStore((l) => { box.subs.add(l); return () => { box.subs.delete(l); }; }, () => box.current, () => box.current);
  useEffect(() => { box.machine.resume(); return () => { box.machine.dispose(); }; }, [box]);
  return { machine: box.machine, state };
}

/** One purchase machine per confirm dialog. */
export function usePurchase(row: MarketRow, days: string, o: Omit<PurchaseOptions, 'onChange'> = {}): { machine: Purchase; state: PurchaseSnapshot } {
  return useMachine<PurchaseSnapshot, Purchase>((onChange) => createPurchase(row, days, { ...o, onChange }));
}
/** The top-up dialog's flow. */
export function useTopUp(): { machine: TopUp; state: TopUpSnapshot } {
  return useMachine<TopUpSnapshot, TopUp>((onChange) => createTopUp({ onChange }));
}
/** One buy / pay / upgrade attempt per dialog. */
export function useAttempt(kind: AttemptKind, target: AttemptTarget, o: Omit<AttemptOptions, 'onChange'> = {}): { machine: Attempt; state: AttemptSnapshot } {
  return useMachine<AttemptSnapshot, Attempt>((onChange) => createAttempt(kind, target, { ...o, onChange }));
}
