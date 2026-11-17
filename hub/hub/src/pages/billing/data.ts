// The billing page's data: its queries and mutations in one place.
// Live pages read and change everything through core's commerce module; fixture pages (hub:shots, tests) read
// fixtureSource with the same hook names and types. The routes core uses, all through core and never fetch:
//   realm scope:  GET /subserver-subscriptions   GET /subserver-subscriptions/quote?plan_id[&region]
//                 GET /subserver-subscriptions/regions?plan_id
//                 GET /subserver-subscriptions/{id}/quote?action[&plan_id]   POST /subserver-subscriptions (buy)
//                 POST /subserver-subscriptions/{id}/pay   POST /subserver-subscriptions/{id}/upgrade
//                 PUT /subserver-subscriptions/{id}/auto-renew
//   base scope:   GET /subserver-plans   GET /wallet/balances   GET /wallet/payment-availability
//                 GET /wallet/github-bonus   POST /wallet/github-bonus/claim   GET /wallet/payments/{card|crypto}/intents/{id}
//                 POST /wallet/payments/card/checkout   POST /wallet/payments/crypto/invoice
//                 GET /users/me/free-ai-usage   GET /servers/available   GET /offers
//                 POST /offers/{id}/reserve   POST /servers/{id}/rent   GET /reservations   GET /rentals
// Money rules held by core, not here: every send keeps its idempotency key until a definitive answer, a send
// whose outcome is unknown is never resent under a new key (Check again only reads; a buy, pay, upgrade, reserve or
// top-up is resent with the same key only after the person confirms "Send the same request again"; a rent, which has
// none, is only read), and the key store is written and read back before the send.
import { capture, commerce, useCore, commerceRules, coreSource, defineRoute, errorInfo, heldChanges, listingRules, type ErrorInfo, pageFixtures } from '@core';
import { formatDate, formatDateTime } from '@kit';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import {
  type CheckoutEvent,
  type CheckoutKind,
  type CheckoutQuote,
  type CheckoutState,
  type ListingPrices,
  checkoutReducer,
  confirmGate,
  initialCheckout,
  quoteForListing,
} from './checkout-logic';
import { attemptQuote, attemptChange, purchaseChange, purchaseQuote } from './checkout-live';
import { centsFromUsd, methodsFor, normalizeAmount, purchaseRow, spendOf, subHandle, topupWords } from './logic';
import { purchaseStoresChanged, usePurchaseActivity } from './parts/FreeBadge.data';
import { type Change, type SendData, purchasePhase, settleEvent } from './settle';
export type { Change } from './settle';
import type { PaidRegion } from './plans-regions';
import type { BonusResult, RawBonus, RawPlan, RawSub, RawUsage, ReturnState, SubsRead, TopUpMethod, Word } from './types';
import { onStorage } from './data.web';

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
/** A USD amount string as the wallet sends it ("12.40"), else null. */
const amountOrNull = (x: unknown): string | null => (centsFromUsd(x) === null ? null : (x as string));

/** Auto-renew: only a row that shows the value that was sent proves it (both values must be real booleans). Any other
 *  answer, the old value included, proves nothing: the server has no commit deadline, so a PUT may still commit late
 *  and the hold stays (Check again, or the warned Dismiss) until a read shows the value. There is no "not applied" proof. */
export function autoRenewProves(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const id = rec(identity);
  const reads = answers[0] ?? [];
  const row = (reads[reads.length - 1] as SubsRead | undefined)?.subs.find((x) => x.id === id.id);
  return row && typeof id.auto_renew === 'boolean' && typeof row.auto_renew === 'boolean' && row.auto_renew === id.auto_renew ? 'applied' : undefined;
}
/** The bonus claim: only an offer that reads `claimed === true` proves it. An unclaimed or incomplete offer proves nothing (a late commit). */
export function claimProves(_identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const reads = answers[0] ?? [];
  const b = reads[reads.length - 1] as RawBonus | null | undefined;
  return b && b.claimed === true ? 'applied' : undefined;
}
const R = commerce.commerceRoutes;
const AUTO_RENEW_LOCK = 'billing-auto-renew';
const CLAIM_LOCK = 'billing-claim';
const usageRoute = defineRoute({ method: 'GET', path: '/users/me/free-ai-usage', scope: 'base' });
const locale = () => ({ zht: 'zh-TW', br: 'pt-BR' })[commerceRules.lang()] ?? commerceRules.lang();

// The page's one data source: live on a real page (every read names its declared route, never a fixture), the page's
// own fixtures under the fixture transport. Money sends do not go through here: the purchase, the top-up and every
// send that needs an idempotency key run on core's commerce machines (useCheckout, useTopUp below).
const source = coreSource(
  'billing',
  {
    reads: {
      subs: {
        route: R.subsListRoute,
        input: () => ({ query: { limit: 200, offset: 0, locale: locale() } }),
        select: (r): SubsRead => {
          const e = rec(r);
          const rows = Array.isArray(e.data) ? e.data.filter(commerceRules.validSub) : null;
          if (!rows) throw new Error('BAD_LIST');
          // A row the page rejects is a row the read did not deliver: without a server total it still counts as missing.
          const total = typeof e.total === 'number' ? e.total : (e.data as unknown[]).length;
          return {
            subs: commerceRules.sortSubs(rows as never[]) as unknown as RawSub[],
            partial: total > rows.length ? { shown: rows.length, total } : null,
          };
        },
      },
      plans: {
        route: R.plansRoute,
        input: () => ({ query: { locale: locale() } }),
        select: (r) => {
          const d = rec(rec(r).data);
          return Array.isArray(d.plans) ? d.plans : [];
        },
      },
      // Where a server of one plan can be placed, and whether each location has room for it now. Read per plan, never
      // cached past a refusal (the checkout reads it again when a location is refused). An answer that is not that
      // plan's whole list is a failed read: no location is shown on a guess.
      regions: {
        route: R.regionsRoute,
        input: (planId: string) => ({ query: { plan_id: planId } }),
        select: (r: unknown, planId: string): PaidRegion[] => {
          const list = commerceRules.paidRegions(rec(r).data, planId);
          if (!list) throw new Error('BAD_LIST');
          return list;
        },
      },
      usage: { route: usageRoute, select: (r) => rec(r).data ?? {} },
      balance: {
        route: R.balancesRoute,
        select: (r) => {
          const d = rec(rec(r).data);
          const g = d.general_balance;
          // An absent balance is unknown, never 0: usd() shows a dash and the checkout reads no cents from ''.
          // Referral credit and what is owed are kept only as the API's dollar amounts ("12.40"); anything else is
          // null, never a guessed amount (C9).
          return { general: g == null ? '' : String(g), referral: amountOrNull(d.referral_credit), owed: amountOrNull(d.referral_credit_owed) };
        },
      },
      bonus: {
        route: R.bonusRoute,
        select: (r) => {
          const d = rec(r).data;
          return d && typeof d === 'object' ? d : null;
        },
      },
      identity: { route: R.meRoute, select: (r) => ({ banned: rec(rec(r).data).is_banned === true }) },
      // One read of GET /rentals for two uses: which servers are free or bare metal (the AI usage and the checkout), and
      // the account's free server for the Plans view's Free column (how many computers it holds:
      // server.computer_capacity.max, sent only for a free-tier server; its name comes from freeName, as the checkout's).
      kinds: {
        route: R.rentalsRoute,
        select: (r): KindsRead => {
          const kinds: Record<string, 'free' | 'bare_metal'> = {};
          let free: FreeServer | null = null;
          const list = rec(r).data;
          if (!Array.isArray(list)) return { kinds, free };
          for (const x of list) {
            const xr = rec(x);
            const sv = rec(xr.server);
            const id = String(sv.id ?? xr.server_id ?? '');
            const cap = sv.computer_capacity as { used?: unknown; max?: unknown } | null | undefined;
            const isFree = xr.is_free_tier === true || !!(cap && typeof cap.used === 'number' && typeof cap.max === 'number');
            if (id) kinds[id] = isFree ? 'free' : 'bare_metal';
            if (isFree && !free) {
              const max = cap && typeof cap.max === 'number' && Number.isSafeInteger(cap.max) && cap.max > 0 ? cap.max : null;
              free = { max };
            }
          }
          return { kinds, free };
        },
      },
      availability: {
        route: R.availabilityRoute,
        select: (r) => {
          const av = rec(rec(r).data);
          // An answer that does not say, for both providers, whether each is enabled is not an answer (a gateway page, an
          // empty object, one provider missing): the read failed, never "no method is enabled" (C9). Only both providers
          // answering enabled:false means none.
          if (typeof rec(av.card).enabled !== 'boolean' || typeof rec(av.crypto).enabled !== 'boolean') throw new Error('BAD_AVAILABILITY');
          const bnd = (b: Record<string, unknown>) => ({
            min: typeof b.min_usd === 'number' ? b.min_usd : 5,
            max: typeof b.max_usd === 'number' ? b.max_usd : 10000,
          });
          const methods: TopUpMethod[] = [];
          const card = rec(av.card);
          const now = rec(av.crypto);
          if (card.enabled === true) methods.push({ key: 'card', ...bnd(card) });
          if (now.enabled === true) methods.push({ key: 'crypto', ...bnd(now) });
          return { methods };
        },
      },
    },
    changes: {
      autoRenew: {
        route: R.autoRenewRoute,
        input: (v: { id: string; auto_renew: boolean }) => ({ params: { id: v.id }, body: { auto_renew: v.auto_renew } }),
        select: () => undefined,
        reads: ['subs'],
        // A named lock lets the page list what core holds without knowing the rows (heldChanges), so Dismiss never depends on a loaded list.
        lock: AUTO_RENEW_LOCK,
        // The lock is the change itself, so its proof can compare the row with what was sent.
        lockKey: (v: { id: string; auto_renew: boolean }) => ({ id: v.id, auto_renew: v.auto_renew }),
        // Only a row that now shows the value that was sent proves the change. A row that still shows the old value
        // proves nothing: the PUT may commit late, so the hold stays until a read shows the value (never "not applied").
        proves: autoRenewProves,
      },
      claimBonus: {
        route: R.claimRoute,
        input: () => ({ body: {} }),
        select: (r): BonusResult => {
          const d = rec(rec(r).data);
          return { result: String(d.result ?? 'error'), ...(typeof d.amount_usd === 'string' ? { amount_usd: d.amount_usd } : {}) };
        },
        reads: ['bonus', 'balance'],
        lock: CLAIM_LOCK,
        // Only an offer that now reads claimed proves the claim; an unclaimed read may precede a late commit.
        proves: claimProves,
      },
    },
  },
  // The ship build (__HUB_FIXTURES__ false) holds no fixture module: the fallback is given only in a fixture build,
  // the only build where coreSource answers from it (fixtureModeActive needs __HUB_FIXTURES__).
  pageFixtures('billing'),
);

// ── Reads ───────────────────────────────────────────────────────────────────────────

export interface Identity {
  banned: boolean;
}

export interface ServerKinds {
  [serverId: string]: 'free' | 'paid' | 'bare_metal';
}

/** The rentals read: each server's kind, and the account's free server (null when the list holds none). */
export interface KindsRead {
  kinds: ServerKinds;
  free: FreeServer | null;
}

/** The account's free server, as the Free column shows it: its computers (the name is freeName's, from the usage read). */
export interface FreeServer {
  /** How many computers it holds; null when the list does not say. */
  max: number | null;
}

export interface Balance {
  /** A USD string, "42.10". */
  general: string;
  /** Referral credit as a USD string, or null when the answer has none or it is not an amount. Pays servers only. */
  referral: string | null;
  /** Referral credit taken back after it was spent, as a USD string, or null. Never counted as spendable. */
  owed: string | null;
}

export interface Availability {
  methods: TopUpMethod[];
}

/** A market listing the Checkout drawer prices (rent a stock server or reserve an offer). */
export interface Listing {
  kind: 'rent' | 'reserve';
  id: string;
  name: string;
  place: string;
  /** Days offered. */
  terms: number[];
  /** Everything the listing says (core's listing facts: the Market's inspector shows the same list). */
  facts: readonly listingRules.ListingFact[];
  /** Delivered right after payment (the stock rail): the review carries the instant-delivery promise. */
  instant: boolean;
}

export const useSubs = () => source.useQuery<SubsRead>('subs');
export const usePlans = () => source.useQuery<RawPlan[]>('plans');
/** The locations a server of this plan can be placed in, each with whether it has room now. Nothing is read without a plan. */
export const usePlanRegions = (planId: string | null) => source.useQuery<PaidRegion[], string>('regions', planId ?? '', { enabled: !!planId });
/** The same read for each plan on sale (the Plans view), in the order of `planIds`. */
export const usePlansRegions = (planIds: readonly string[]) => source.useQueries<PaidRegion[], string>('regions', planIds);
export const useUsage = () => source.useQuery<RawUsage>('usage');
export const useBalance = () => source.useQuery<Balance>('balance');
export const useBonus = () => source.useQuery<RawBonus | null>('bonus');
export const useIdentity = () => source.useQuery<Identity>('identity');
const useKindsRead = () => source.useQuery<KindsRead>('kinds');
/** Which servers are free or bare metal (one GET /rentals, shared with useFreeServer). */
export function useServerKinds(): { data: ServerKinds | undefined } {
  const q = useKindsRead();
  return { data: q.data?.kinds };
}
export const useAvailability = () => source.useQuery<Availability>('availability');
/** The account's free server from the same rentals read: undefined while it loads or when it failed (the Free column then
 *  shows neither a name nor a count, never a guess), null when the account has none. */
export function useFreeServer(): { data: FreeServer | null | undefined } {
  const q = useKindsRead();
  return { data: q.data?.free };
}
/** null: no payment return is waiting. */
const usePaymentReturnFx = () => source.useQuery<ReturnState | null>('return');
/** The listing of the opened item (by kind and id, like core's market rows): another id never prices as this one; none is null. */
const useListingFx = (kind?: 'rent' | 'reserve' | null, id?: string | null): Async<Listing | null> => {
  const q = source.useQuery<Listing[]>('listings');
  const data = q.data === undefined ? undefined : kind ? (q.data.find((l) => l.kind === kind && l.id === id) ?? null) : null;
  return { ...q, data } as Async<Listing | null>;
};

/** Where a verified top-up continues: the purchase it interrupted. null: nothing waits (live: core's readBuyResume / marketResume). */
/** `pay.sub` is the subscription's whole id (core's resume record), which the link carries. */
export type Resume = { kind: 'buy'; plan: string } | { kind: 'pay'; sub: string } | { kind: 'market' } | null;
const useResumeFx = () => source.useQuery<Resume>('resume');

/** The AI usage read's refusals in words (the old route's 403 and 429; the fixture's bad_request stands for 429): core's rule, shared with the Servers cards. */
export { usageRefusal as usageError } from '@core';

// ── Changes ─────────────────────────────────────────────────────────────────────────

type Vars = Record<string, unknown> | void;

function useChange<T>(key: string) {
  const m = source.useMutation<T, Vars>(key);
  const [running, setRunning] = useState(false);
  const mref = useRef(m);
  mref.current = m;
  const run = useCallback(async (vars?: Record<string, unknown>): Promise<Change<T>> => {
    setRunning(true);
    try {
      const r = await mref.current.mutateAsync(vars);
      const out: Change<T> = { outcome: r.outcome };
      if (r.data !== undefined) out.data = r.data as T;
      if (r.code !== undefined) out.code = r.code;
      return out;
    } catch {
      return { outcome: 'failed', code: 'CALL_FAILED' };
    } finally {
      setRunning(false);
    }
  }, []);
  // Frees exactly the holds that were shown; a hold that no longer holds the lock (freed, sent again, another account) frees nothing.
  const dismissHeld = useCallback(async (held: readonly Held[]): Promise<boolean> => {
    let any = false;
    for (const h of held) any = (await mref.current.dismiss(h.vars, h.hold)) || any;
    return any;
  }, []);
  // Core's own lock for this change: it survives remounts. A fresh read frees it only when its proof (autoRenew, claimBonus) shows the change.
  return { run, running, pending: m.pending, readBack: m.readBack, settle: m.settle, discard: m.discard, dismissHeld };
}

/** One send core holds, as the person saw it: its variables and its hold (core's incarnation token, never shown). */
export interface Held {
  readonly vars: Record<string, unknown>;
  readonly hold: string;
}

/** The sends core holds under a named lock now in the realm shown, as the person is shown them: the variables each was sent with and its hold. A hold sent in another realm is never listed, so a Dismiss never frees it unseen. */
async function heldUnder(lock: string, varsOf: (identity: unknown) => Record<string, unknown>): Promise<Held[]> {
  return heldChanges(lock, { realm: capture().realm }).flatMap((h) => (h.hold ? [{ vars: varsOf(h.identity), hold: h.hold }] : []));
}

/** Auto-renew on is one PUT, nothing is charged by it; off asks first (the page's dialog). */
export function useAutoRenew() {
  const c = useChange<undefined>('autoRenew');
  // Every hold of the setting, or those of one row: asked of core by its lock, never of the loaded list.
  const holds = useCallback(
    (row?: string): Promise<Held[]> =>
      heldUnder(AUTO_RENEW_LOCK, rec).then((all) => (row === undefined ? all : all.filter((h) => h.vars.id === row))),
    [],
  );
  return { ...c, holds };
}
export function useClaimBonus() {
  const c = useChange<BonusResult>('claimBonus');
  const { run } = c;
  // The claim has no variables; an empty object keeps its lock addressable by hold.
  const runClaim = useCallback(() => run({}), [run]);
  const holds = useCallback(() => heldUnder(CLAIM_LOCK, () => ({})), []);
  return { ...c, run: runClaim, holds };
}

// ── Checkout (buy, pay, upgrade, rent, reserve) ─────────────────────────────────────

export interface CheckoutTarget {
  kind: CheckoutKind;
  /** Full ids, kept in memory for the send only (the page shows handles). */
  subId?: string;
  familyId?: string;
  /** The server an upgrade changes (its warnings name it). */
  server?: string;
  /** buy / upgrade: the plan (version or family id); rent / reserve: the listing id. */
  item: string | null;
  /** pay / upgrade: the subscription. */
  sub: string | null;
  /** rent / reserve: the term in days. */
  days: number | null;
  /** buy: the location chosen for the new server (a region code of the plan's list); null or absent is Automatic.
   *  Part of the request: another choice is another quote and another key, never this key with another body. */
  region?: string | null;
  /** buy: the chosen location's name, for the words about it ("Frankfurt, Germany"). A label only. */
  regionName?: string | null;
}

/** A refused location, named: the refusal's words with the chosen location's name when the drawer has one. */
function namedRegionRefusal(e: CheckoutEvent | null, target: CheckoutTarget | null): CheckoutEvent | null {
  if (!e || e.type !== 'refused' || e.word.k !== 'loc.refusedFull') return e;
  // No location was asked for (Automatic): the refusal is about every location, and "choose another" does not fit.
  if (!target?.region) return { ...e, word: { k: 'loc.refusedAuto' } };
  return target.regionName ? { ...e, word: { k: 'loc.refusedFullIn', v: { place: target.regionName } } } : e;
}

export function targetKey(t: CheckoutTarget): string {
  return [t.kind, t.sub ?? '', t.item ?? '', t.days ?? ''].join(':');
}

/**
 * Checkouts whose outcome is unknown, kept past the drawer so the page can offer Check again and the same
 * checkout reopens on its notice. Live pages read core's own stores (see readUnknown); this in-memory store only
 * stands in for them on fixture pages.
 */
const unknownStore = (() => {
  let list: readonly UnknownCheckout[] = [];
  const subs = new Set<() => void>();
  return {
    get: () => list,
    subscribe(l: () => void) {
      subs.add(l);
      return () => subs.delete(l);
    },
    put(u: UnknownCheckout) {
      list = [...list.filter((x) => x.key !== u.key), u];
      subs.forEach((l) => l());
    },
    drop(key: string) {
      if (!list.some((x) => x.key === key)) return;
      list = list.filter((x) => x.key !== key);
      subs.forEach((l) => l());
    },
  };
})();

export interface UnknownCheckout {
  key: string;
  target: CheckoutTarget;
  title: string;
  /** A rent whose POST has not answered yet: "renting…", not "may have gone through". */
  sending?: boolean;
  /** False when storage refused to keep the hold: only this tab remembers it (a reload or another tab will not show it). */
  persisted?: boolean;
  /** The kept request's ceiling: what "Send the same request again" may charge at most. */
  maxCents?: number;
}

function useUnknownCheckoutsFx(): readonly UnknownCheckout[] {
  return useSyncExternalStore(unknownStore.subscribe, unknownStore.get, unknownStore.get);
}

/**
 * The fixture pages' stand-in for core's held top-up (live pages read core's own record): the unknown top-up stays
 * until a Check again answers it or the person forgets it, so the page band and the drawer show the same hold.
 */
type FxTopUp = { method: TopUpMethod['key']; amount: string };
/** The fixture hold's key (one hold at a time). */
const FX_TOPUP_KEY = 'fixture-top-up-key';
const topUpStore = (() => {
  let held: FxTopUp | null = null;
  const subs = new Set<() => void>();
  const set = (h: FxTopUp | null) => {
    held = h;
    subs.forEach((l) => l());
  };
  return {
    get: () => held,
    set,
    subscribe(l: () => void) {
      subs.add(l);
      return () => subs.delete(l);
    },
  };
})();

/** Wipes the in-memory mirror (tests). */
export function resetUnknownCheckouts(): void {
  for (const u of unknownStore.get()) unknownStore.drop(u.key);
  topUpStore.set(null);
  endedHere.clear();
}

/** The kept request a resend dialog was opened for: it is sent only while the kept request is still exactly this.
 *  `sig` is core's heldRequestSig of the record (owner, key, ceiling and every body field), so a same-key record whose
 *  plan, term, ceiling or owner changed meanwhile is refused too. */
export interface ResendShown {
  key: string;
  maxCents: number | null;
  sig: string;
}
const sameShown = (a: ResendShown | null | undefined, b: ResendShown | null): boolean =>
  !!a && !!b && a.key === b.key && a.maxCents === b.maxCents && a.sig === b.sig;
/** What a Start a new purchase dialog was opened for: the kept request (as for a resend), or, with none kept, this tab's
 *  remembered reserve the drawer showed then (its term and since; core reserveUnknownFor). */
export type ReserveNewShown = { kept: ResendShown } | { held: { days: string; since: number } };
/** The held top-up a resend dialog was opened for: sent only while the held request is still exactly this. */
export interface TopUpShown {
  key: string;
  method: TopUpMethod['key'];
  amount: string;
}

export interface CheckoutApi {
  state: CheckoutState;
  /** Quote lines shown (the quote read, or null while it loads). */
  confirm: () => void;
  /** Reads only: never sends the kept request again. */
  checkAgain: () => void;
  /** What the resend dialog was opened for: the kept request's current key and ceiling (null when none is kept). */
  resendShown: () => ResendShown | null;
  /** The person's confirmed "Send the same request again": the kept key and body (buy, pay, upgrade) or the
   *  reservation's kept request (only once its countdown is at zero), only while the kept request is still the one
   *  the dialog was opened for (`shown`); a changed or vanished one sends nothing. Rent has none. */
  resend: (shown: ResendShown | null | undefined) => void;
  /** What the resend may charge at most (the kept request's ceiling), or null when it is not known. */
  resendMax: number | null;
  /** Whether `resend` can send the kept request from this drawer; false hides the control. */
  canResend: boolean;
  /** A buy that adopted its family's kept request: that request's own plan title (it may be another plan version or
   *  title than the one opened), so the drawer names what is really held. Null otherwise. A label only. */
  heldTitle: string | null;
  /** Buy a plan, outcome unknown: the location code of the kept request (what a resend sends), null when it names none
   *  (Automatic) or nothing is kept. */
  keptRegion: string | null;
  /** A kept reservation in a browser without Web Locks: core neither resends nor abandons it there, so the
   *  unknown view says so and offers only Check again. */
  reserveNoLocks: boolean;
  /** A rent that was not found: a fresh review (a new confirm is a new purchase). */
  startOver: () => void;
  /** A rent whose earlier attempt may still exist: send another only after the person's explicit confirm. */
  canRentAgain: boolean;
  /** Core still holds an unresolved rent of this server: Start a new purchase would only restore it. */
  rentHeld: boolean;
  /** A reservation whose outcome is unknown: Start a new purchase may be offered (after the person's confirm). */
  canReserveNew: boolean;
  /** What a Start a new purchase dialog opened now is for (read once when it opens), or null when there is nothing. */
  reserveNewShown: () => ReserveNewShown | null;
  /** The person confirmed Start a new purchase for what the dialog was opened for (`shown`): core abandons that kept
   *  request (no tab of this browser sends its key again; refused while a flight of it is live: a send this browser
   *  started may still be on the wire), or forgets that remembered reserve's term only,
   *  and the drawer opens a fresh review; a changed or vanished request or reserve, or a store that cannot prove it gone,
   *  drops nothing and the view stays unknown. */
  reserveNew: (shown: ReserveNewShown | null | undefined) => void;
  rentAgain: () => void;
  /** A reservation that looks like this one (advisory read or late hint), or an active rental of this server, was
   *  found: evidence only, one line in the unknown state. */
  match: boolean;
  /** After a definite failure: read the quote again for a new review. */
  again: () => void;
  setConsent: (on: boolean) => void;
  /** A Retry of a failed quote is out (quote_error, a new read asked): its button shows busy. Display only. */
  quoteRetrying: boolean;
  /** The picked plan was put back (Choose plan's back): its consent, requote band and notice go. Display only. */
  clearPlan: () => void;
  reload: () => void;
  /** x, Esc and the scrim are refused while this is false. */
  locked: boolean;
}

/** The reservation retry countdown: one `tick` a second while an unknown outcome waits to retry. */
function useRetryCountdown(state: CheckoutState, dispatch: (e: CheckoutEvent) => void): void {
  useEffect(() => {
    if (state.phase !== 'unknown' || state.retryIn <= 0) return;
    const id = setTimeout(() => dispatch({ type: 'tick' }), 1000);
    return () => clearTimeout(id);
  }, [state.phase, state.retryIn, dispatch]);
}

/**
 * One checkout. Mount it when the drawer opens (it reads the quote); unmount it when the drawer closes. A send in
 * flight locks the drawer, so the machine is never torn down mid-send; an unknown outcome is mirrored to the
 * page's store and restored on reopen.
 */
function useCheckoutFx(kind: CheckoutKind, target: CheckoutTarget | null, title: string): CheckoutApi {
  // The target is null while the drawer still looks up what is being bought: the machine waits, nothing is sent.
  const key = target ? targetKey(target) : '';
  const quote = source.useQuery<CheckoutQuote>(`quote.${kind}`);
  const prices = source.useQuery<ListingPrices>('prices');
  // A rent or reserve is priced from its own listing and term; the other kinds read their one fixture quote. Undefined
  // while something is still being read, null when the listing has no such term.
  const item = target?.item ?? null;
  const days = target?.days ?? null;
  const priceFrom = useCallback(
    (template: CheckoutQuote | undefined): CheckoutQuote | null | undefined => {
      if (kind !== 'rent' && kind !== 'reserve') return template;
      if (!template || !prices.data || !item || !days) return undefined;
      return quoteForListing(template, prices.data, kind, item, days);
    },
    [kind, prices.data, item, days],
  );
  // Buy a plan: the fixture quote follows the chosen location as the live one does. Its place is the chosen location
  // (no room there: the quote is blocked with that location's name), or, with Automatic, the first with room.
  const region = kind === 'buy' ? (target?.region ?? null) : null;
  const regionsFx = source.useQuery<PaidRegion[], string>('regions', item ?? '', { enabled: kind === 'buy' && !!item });
  const priced = useMemo(() => {
    const p = priceFrom(quote.data);
    if (kind !== 'buy' || !p) return p;
    const list = regionsFx.data ?? [];
    const picked = region ? (list.find((r) => r.region === region) ?? null) : null;
    const place = picked ?? (region ? null : (list.find((r) => r.available) ?? null));
    const full = !!picked && !picked.available && !p.blocked;
    return {
      ...p,
      subject: `buy:${item ?? ''}:${region ?? ''}`,
      place: place ? { region: place.region, country: place.country, city: place.city } : null,
      ...(full ? { blocked: { k: 'loc.noRoomIn', v: { place: target?.regionName ?? '' } } as Word } : {}),
    };
  }, [priceFrom, quote.data, kind, region, regionsFx.data, item, target?.regionName]);
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckout);
  const confirmM = useChange<SendData>('confirm');
  const checkM = useChange<SendData>('check');
  const stateRef = useRef(state);
  stateRef.current = state;
  const targetRef = useRef(target);
  targetRef.current = target;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (priced) dispatch({ type: 'quoted', quote: priced });
    else if (priced === null) dispatch({ type: 'quoteFailed' });
    else if (quote.error)
      dispatch({
        type: quote.error.kind === 'forbidden' ? 'banned' : 'quoteFailed',
      });
  }, [priced, quote.error]);

  // Reopened on a purchase whose outcome is still unknown: it stays unknown, never a fresh review.
  useEffect(() => {
    if (key && unknownStore.get().some((u) => u.key === key)) dispatch({ type: 'restore' });
  }, [key]);

  // Mirror an unknown outcome to the page; drop it on any definite end.
  useEffect(() => {
    if (!target) return;
    if (state.phase === 'unknown' || (state.phase === 'checking' && state.keyKept)) unknownStore.put({ key, target, title });
    else if (state.phase === 'done' || state.phase === 'already' || state.phase === 'failed' || (state.phase === 'review' && !state.keyKept))
      unknownStore.drop(key);
    // target is stable per key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.keyKept, key, title]);

  useRetryCountdown(state, dispatch);

  const settle = useCallback(
    (r: Change<SendData>, phase: 'send' | 'check') => {
      if (!live.current) return;
      // A fixture purchase lands where its quote said (the live answer's subscription names the place itself).
      const placed = kind === 'buy' && r.outcome === 'done' && phase === 'send' ? { ...r, data: { ...r.data, place: stateRef.current.quote?.place ?? null } } : r;
      const e = namedRegionRefusal(settleEvent(kind, placed, phase), targetRef.current);
      if (e) dispatch(e);
    },
    [kind],
  );

  const confirm = useCallback(() => {
    if (!confirmGate(stateRef.current).ok) return;
    dispatch({ type: 'confirmed' });
    // The ref moves now, not at the next render: a second Confirm in the same batch finds the drawer posting.
    stateRef.current = checkoutReducer(stateRef.current, { type: 'confirmed' });
    void confirmM.run().then((r) => settle(r, 'send'));
  }, [confirmM, settle]);

  const checkAgain = useCallback(() => {
    if (stateRef.current.phase !== 'unknown' && stateRef.current.phase !== 'not_found') return;
    dispatch({ type: 'checkStarted' });
    void checkM.run().then((r) => settle(r, 'check'));
  }, [checkM, settle]);

  const resendMax = kind === 'rent' ? null : (state.quote?.chargeCents ?? null);
  const resendShown = useCallback((): ResendShown | null => (kind === 'rent' || !key ? null : { key, maxCents: resendMax, sig: key }), [kind, key, resendMax]);
  const resend = useCallback(
    (shown: ResendShown | null | undefined) => {
      const s = stateRef.current;
      if (s.phase !== 'unknown' || s.retryIn > 0 || !sameShown(shown, resendShown())) return;
      dispatch({ type: 'retrying' });
      // As confirm: the ref moves now, so a second resend in the same batch finds the drawer posting and sends nothing.
      stateRef.current = checkoutReducer(stateRef.current, { type: 'retrying' });
      void confirmM.run().then((r) => settle(r, 'send'));
    },
    [confirmM, settle, resendShown],
  );

  return {
    state,
    confirm,
    checkAgain,
    resendShown,
    resend,
    resendMax,
    canResend: kind !== 'rent' && !!key,
    heldTitle: null,
    // A fixture's kept request is the one this drawer sent.
    keptRegion: kind === 'buy' && (state.phase === 'unknown' || state.phase === 'checking') ? (target?.region ?? null) : null,
    reserveNoLocks: false,
    canRentAgain: false,
    rentHeld: false,
    rentAgain: () => undefined,
    canReserveNew: false,
    reserveNewShown: () => null,
    reserveNew: () => undefined,
    match: false,
    startOver: () => {
      unknownStore.drop(key);
      dispatch({ type: 'startOver' });
    },
    again: () => {
      dispatch({ type: 'again' });
      void quote.refetch().then((r) => {
        const next = priceFrom(r.data);
        if (live.current && next) dispatch({ type: 'quoted', quote: next });
      });
    },
    setConsent: (on) => dispatch({ type: 'consent', on }),
    clearPlan: () => dispatch({ type: 'planCleared' }),
    quoteRetrying: state.phase === 'quote_error' && quote.isFetching,
    reload: () => void quote.refetch(),
    locked: state.phase === 'posting' || state.phase === 'reconciling' || state.phase === 'checking',
  };
}

// ── Add funds ───────────────────────────────────────────────────────────────────────

export interface TopUpSend {
  url: string;
}

/** `key` is the hold's key as this send actually used it (core's, read while the request was out), so the end can be told as this tab's own. */
export type TopUpResult =
  | { ok: true; url: string; key?: string }
  | { ok: false; word: Word; unknown: boolean; rekey: boolean; resolved?: boolean; key?: string; /** The rejection's allow-listed facts, for the banner's Details. */ info?: ErrorInfo };

/** A second submit while this drawer's own send is out: nothing happened and nothing is to be shown. */
export type TopUpIgnored = { ok: false; ignored: true };

export interface TopUpApi {
  submit: (method: TopUpMethod['key'], amount: string) => Promise<TopUpResult | TopUpIgnored>;
  /** After an unknown submit: a read only (the balance again); never sends. No read can settle a lost top-up yet, so it
   *  stays unknown unless another drawer answered it. */
  checkAgain: () => Promise<TopUpResult | TopUpIgnored>;
  /** The person's confirmed "Send the same request again": the same stored request (same key, provider, amount), only
   *  while it is still the one the dialog was opened for (`shown`: key, provider and amount). It opens a payment page;
   *  nothing is charged unless the person pays there. */
  resend: (shown: TopUpShown | null | undefined) => Promise<TopUpResult | TopUpIgnored>;
  /** "Forget this payment", only after the person's confirm: drops the held record, sends nothing. False when refused. */
  forget?: () => boolean;
  running: boolean;
  /** An earlier top-up whose answer is still unknown (kept by core across the drawer closing): its method and amount. */
  pending: { key: string; method: TopUpMethod['key']; amount: string; persisted?: boolean; sending?: boolean } | null;
  /** Core is still restoring an earlier top-up: no send is offered until it has answered. */
  loading: boolean;
  /** Reads the payment options again (the form's Retry / Check again). */
  reload: () => Promise<void>;
  /** The one availability answer: the machine that sends reads it, and the form lists exactly its methods and bounds, so the two
   *  can never disagree. `error`: the read failed or was not an answer (never "none", C9); `none`: both providers answered "not enabled". */
  avail: { state: 'loading' | 'ready' | 'none' | 'error'; methods: TopUpMethod[] };
}

const CARD_HOST = /^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i;
const CRYPTO_HOST = /^https:\/\/([a-z0-9-]+\.)*nowpayments\.io\//i;

/** The checkout page is followed only on the method's own https host. */
function acceptCheckoutUrl(method: TopUpMethod['key'], url: unknown): url is string {
  return typeof url === 'string' && (method === 'card' ? CARD_HOST : CRYPTO_HOST).test(url);
}

/** The machine's availability state as the form reads it. */
function liveAvail(s: { phase: string; methods?: Array<{ key: TopUpMethod['key']; min: number; max: number }> }): TopUpApi['avail'] {
  const methods = Array.isArray(s.methods) ? s.methods.map((m) => ({ key: m.key, min: m.min, max: m.max })) : [];
  if (s.phase === 'loading') return { state: 'loading', methods };
  if (s.phase === 'availError' || s.phase === 'account') return { state: 'error', methods };
  if (s.phase === 'none') return { state: 'none', methods };
  return { state: 'ready', methods };
}

/** The preview's availability: the fixture read stands in for the machine's. */
export function availOfQuery(av: { isPending: boolean; isError: boolean; data?: Availability | null }): TopUpApi['avail'] {
  if (av.isPending) return { state: 'loading', methods: [] };
  if (av.isError) return { state: 'error', methods: [] };
  const methods = methodsFor(av.data);
  return { state: methods.length ? 'ready' : 'none', methods };
}

function useTopUpFx(): TopUpApi {
  const m = useChange<TopUpSend>('topup');
  const av = useAvailability();
  const fxAvail = useMemo(() => availOfQuery(av), [av.isPending, av.isError, av.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useSyncExternalStore(topUpStore.subscribe, topUpStore.get, topUpStore.get);
  const submit = useCallback(
    async (method: TopUpMethod['key'], amount: string): Promise<TopUpResult> => {
      const r = await m.run();
      if (r.outcome === 'done') {
        // A replay that was answered: nothing is held any more.
        topUpStore.set(null);
        if (acceptCheckoutUrl(method, r.data?.url)) return { ok: true, url: r.data.url };
        const w = topupWords({ code: 'BAD_CHECKOUT_URL' });
        return { ok: false, word: w.word, unknown: false, rekey: false, info: errorInfo({ code: 'BAD_CHECKOUT_URL' }) };
      }
      // Sent and unanswered: held under its own method and amount (a replay never replaces them).
      if (r.outcome === 'pending' && !topUpStore.get()) topUpStore.set({ method, amount: normalizeAmount(amount) ?? amount });
      const w = topupWords(
        r.outcome === 'pending'
          ? { pending: true }
          : r.code === 'FRAMED_ACTION_REFUSED'
            ? { code: 'FRAMED_ACTION_REFUSED' }
            : r.outcome === 'not_sent' || r.outcome === 'stale'
              ? { code: 'ACCOUNT_CHANGED' }
              : r.code
                ? { code: r.code }
                : {},
      );
      return {
        ok: false,
        word: w.word,
        unknown: w.unknown === true,
        rekey: w.rekey === true,
        info: errorInfo(r),
      };
    },
    [m],
  );
  return {
    submit,
    checkAgain: () => Promise.resolve<TopUpResult>({ ok: false, word: topupWords({ pending: true }).word, unknown: true, rekey: false }),
    resend: (shown) =>
      shown?.key === FX_TOPUP_KEY && held && shown.method === held.method && shown.amount === held.amount
        ? submit(held.method, held.amount)
        : Promise.resolve<TopUpResult>({ ok: false, word: topupWords({ pending: true }).word, unknown: true, rekey: false }),
    forget: () => {
      topUpStore.set(null);
      return true;
    },
    running: m.running,
    pending: held ? { key: FX_TOPUP_KEY, ...held } : null,
    loading: false,
    reload: async () => { await av.refetch(); },
    avail: fxAvail,
  };
}

/**
 * The held top-up as core's own record reads now (the page band shows it from the first render, whatever drawer or
 * dialog is open, and needs no availability read). `sending` moves with time (another tab's stamp ages out at its own
 * `sending_at` + two minutes), so it is read again on a tick while it is true; core's rule decides, the page keeps no
 * clock of its own.
 */
export interface HeldTopUp {
  key: string;
  method: TopUpMethod['key'];
  amount: string;
  /** False when the hold could not be stored: only this tab remembers it. */
  persisted: boolean;
  /** A POST of this top-up is still out (this tab's, or another tab's fresh stamp). */
  sending: boolean;
}
export interface HeldTopUpRead {
  held: HeldTopUp | null;
  /** The displayed account (compared, never shown): a hold gone because another account is shown is not "answered elsewhere". */
  owner: string | null;
}

/** How often a hold being sent is read again, so a stale stamp shows up through core's own rule. */
const SENDING_TICK_MS = 5_000;

/** What the band shows from one read: two reads with the same signature draw the same band. */
function heldSignature(owner: string | null, held: HeldTopUp | null): string {
  return JSON.stringify([owner, held && [held.key, held.method, held.amount, held.persisted, held.sending]]);
}

function readHeld(): HeldTopUpRead {
  const ctx = capture();
  return { owner: commerce.shownOwner(ctx)?.owner ?? null, held: commerce.topUpHeldFor(ctx) };
}

export function useTopUpHeldLive(): HeldTopUpRead {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const { owner, held } = readHeld();
  const [first] = useState(() => heldSignature(owner, held));
  useEffect(() => {
    const off = commerce.subscribeTopUpPending(bump);
    // Anything announced between the render's read and this subscription reached nobody: read once more now.
    const now = readHeld();
    if (heldSignature(now.owner, now.held) !== first) bump();
    return off;
  }, [first]);
  const sending = held?.sending === true;
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(bump, SENDING_TICK_MS);
    return () => clearInterval(timer);
  }, [sending]);
  return { held, owner };
}

function useTopUpHeldFx(): HeldTopUpRead {
  const h = useSyncExternalStore(topUpStore.subscribe, topUpStore.get, topUpStore.get);
  return useMemo(
    () => ({ held: h ? { key: FX_TOPUP_KEY, method: h.method, amount: h.amount, persisted: true, sending: false } : null, owner: 'fixture' }),
    [h],
  );
}
export const useTopUpHeld = __HUB_FIXTURES__ ? useTopUpHeldFx : useTopUpHeldLive;

/**
 * Top-ups this tab itself ended (a confirmed Dismiss or Forget, or a replay that was answered): the band does not say
 * "answered elsewhere" for them. Only keys, never an amount: it cannot show, hide or restore anything.
 */
const endedHere = new Set<string>();
export function noteTopUpEnded(key: string | undefined): void {
  if (key) endedHere.add(key);
}
export function topUpEndedHere(key: string): boolean {
  return endedHere.has(key);
}

// leaveTo (the provider's page, a browser navigation) lives in data.web.ts, re-exported here.
export { leaveTo } from './data.web';

export type { RawSub };

// ── Live: core's commerce machines ──────────────────────────────────────────────────
// On a live page the idempotency keys, their storage and every outcome rule are core's (commerce.createAttempt,
// createPurchase, createTopUp): this page never builds a key and never resends a charge itself. The fixture path
// above stays for tests, shots and hub:dev, where core has no commerce answers.

interface Async<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: { kind: string } | null;
  refetch: () => Promise<unknown>;
}

/** A read that also says whether the read for its current inputs has ended (answered or failed). */
type Read<T> = Async<T> & { ended: boolean };

/** One async read, bound to core's account, realm and generation (a switch reads again). */
function useAsync<T>(read: () => Promise<T>, deps: readonly unknown[]): Read<T> {
  const core = useCore();
  const [n, setN] = useState(0);
  const [st, setSt] = useState<{ data?: T; error?: { kind: string } | null; done: boolean; at?: readonly unknown[] }>({ done: false });
  // The inputs this render reads for. data and isPending keep the earlier answer while a new read is out; ended does
  // not: it is true only once the read for exactly these inputs is back.
  const at = [core.gen, core.account, core.realm, n, ...deps];
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let live = true;
    setSt((p) => ({ ...p, done: false, error: null }));
    readRef.current().then(
      (data) => live && setSt({ data, done: true, error: null, at }),
      (e: unknown) => live && setSt({ done: true, error: { kind: (e as { kind?: string } | null)?.kind ?? 'server' }, at }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core.gen, core.account, core.realm, n, ...deps]);
  const refetch = useCallback(async () => setN((x) => x + 1), []);
  const ended = st.done && !!st.at && st.at.length === at.length && st.at.every((v, i) => Object.is(v, at[i]));
  return { data: st.data, isPending: !st.done && st.data === undefined, isError: st.done && !!st.error, error: st.error ?? null, refetch, ended };
}

const asRow = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

function useMarketRow(kind: 'rent' | 'reserve' | null, id: string | null): Read<commerceRules.MarketRow | null> {
  return useAsync(async () => {
    if (!kind || !id) return null;
    const l = await commerce.loadListing(capture());
    const rows = kind === 'rent' ? l.stock : l.offers;
    if (rows.length === 0 && (kind === 'rent' ? l.errStock : l.errOffers)) throw { kind: 'server' };
    return rows.find((r) => r.id === id) ?? null;
  }, [kind, id]);
}

export function useListingLive(kind?: 'rent' | 'reserve' | null, id?: string | null): Async<Listing | null> {
  const row = useMarketRow(kind ?? null, id ?? null);
  const data: Listing | null | undefined = row.data
    ? {
        kind: kind === 'reserve' ? 'reserve' : 'rent',
        id: row.data.id ?? '',
        name: row.data.name ?? '',
        place: [row.data.city, row.data.country].filter(Boolean).join(', '),
        terms: row.data.days.map((d) => Number(d)).filter((n) => Number.isFinite(n)),
        facts: listingRules.listingFacts(row.data),
        instant: listingRules.isInstant(row.data),
      }
    : row.data === null && !row.isPending
      ? null
      : undefined;
  return { ...row, data: data as Listing | null };
}

export function usePaymentReturnLive(): Async<ReturnState | null> {
  return useAsync(async () => {
    const r = commerce.readTopupReturn();
    if (!r) return null;
    return (await commerce.verifyReturn(capture(), r.payment, r.provider, r.status)) as ReturnState;
  }, []);
}

function useResumeLive(): Async<Resume> {
  return useAsync(async (): Promise<Resume> => {
    const b = commerce.readBuyResume() as { plan?: string; pay?: string } | null;
    if (b && typeof b.plan === 'string') return { kind: 'buy', plan: b.plan };
    if (b && typeof b.pay === 'string') return { kind: 'pay', sub: b.pay };
    return commerce.marketResume() ? { kind: 'market' } : null;
  }, []);
}
const subHandleOf = subHandle;

// Unknown purchases come from core's own stores (retained attempts and reservation intents), never a page mirror.
const unknownSubs = new Set<() => void>();
export function notifyUnknown(): void {
  unknownSubs.forEach((l) => l());
  // The Free badge hears a retained purchase appear or clear (a recovery check outside the drawer included).
  purchaseStoresChanged();
}
let unknownSig = '';
let unknownList: readonly UnknownCheckout[] = [];
function readUnknown(): readonly UnknownCheckout[] {
  const ctx = capture();
  const own = commerce.shownOwner(ctx)?.owner ?? null;
  const out: UnknownCheckout[] = [];
  if (own) {
    for (const e of commerceRules.readPendingAll()) {
      if (e.user_id !== own) continue;
      const x = e as unknown as Record<string, unknown>;
      if (e.kind === 'buy')
        out.push({
          key: e.key,
          title: String(x.title ?? ''),
          maxCents: e.max_charge_cents,
          // The kept request's own location (a code; none: Automatic): what a resend of it asks for.
          target: { kind: 'buy', item: String(x.plan_id ?? ''), sub: null, days: null, familyId: String(x.family_id ?? ''), ...(typeof x.region === 'string' && x.region ? { region: x.region } : {}) },
        });
      else if (e.kind === 'pay')
        out.push({
          key: e.key,
          title: String(x.title ?? ''),
          maxCents: e.max_charge_cents,
          target: { kind: 'pay', item: null, sub: subHandleOf(String(x.sub_id ?? '')), days: null, subId: String(x.sub_id ?? '') },
        });
    }
    // Every retained upgrade of this user, whether or not its subscription is still in the list.
    for (const u of commerce.pendingUpgrades(own))
      out.push({
        key: u.key,
        title: String(u.title ?? ''),
        maxCents: u.max_charge_cents,
        target: { kind: 'upgrade', item: u.plan_id, sub: subHandleOf(u.sub_id), days: null, subId: u.sub_id },
      });
    for (const p of commerce.marketPendingFor(ctx))
      out.push({ key: p.key, title: p.name ?? '', maxCents: p.ceiling, target: { kind: 'reserve', item: p.offer_id, sub: null, days: Number(p.days) } });
    // A rent has no key: core's marker says the rental may exist, and holds a second one until the attempt's own answer
    // ends it (a /rentals read is evidence only; Dismiss hides it, Rent again anyway sends a new one with a warning).
    for (const r of commerce.rentPendingFor(ctx))
      out.push({
        key: `rent:${r.server_id}`,
        title: r.name ?? '',
        sending: r.sending,
        persisted: r.persisted !== false,
        target: { kind: 'rent', item: r.server_id, sub: null, days: Number(r.days) },
      });
  }
  const sig = JSON.stringify(out);
  if (sig !== unknownSig) {
    unknownSig = sig;
    unknownList = out;
  }
  return unknownList;
}
export function useUnknownCheckoutsLive(): readonly UnknownCheckout[] {
  return useSyncExternalStore(
    (l) => {
      unknownSubs.add(l);
      // A rent marker changes inside core (a closed drawer's POST answers, another tab): the band follows the registry.
      const off = __HUB_FIXTURES__ ? () => undefined : commerce.subscribeRentPending(l);
      const offStorage = onStorage(l);
      return () => {
        unknownSubs.delete(l);
        off();
        offStorage();
      };
    },
    readUnknown,
    readUnknown,
  );
}

export function useTopUpLive(): TopUpApi {
  const { machine, state: snapState } = commerce.useTopUp();
  // Core restores a kept top-up only after the availability read: until then a send could outrun it.
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    void machine.load().finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [machine]);
  const reload = useCallback(async () => {
    setLoaded(false);
    await machine.load().finally(() => mounted.current && setLoaded(true));
  }, [machine]);
  const [running, setRunning] = useState(false);
  // This drawer's own submit is out: set and cleared by that call only (a second one never touches `running`).
  const submitRef = useRef(false);
  const settle = useCallback((method: TopUpMethod['key'], r: commerce.TopUpSubmit, sent?: string): TopUpResult => {
    const fail = (e: unknown, pending = false): TopUpResult => {
      const x = asRow(e);
      const w = topupWords(
        pending || x.pending === true || x.kind === 'pending'
          ? { pending: true, ...(x.code === 'STANDALONE_HANDOFF' ? { code: x.code } : {}) }
          : x.framed === true
            ? { code: 'FRAMED_ACTION_REFUSED' }
            : x.notSent === true
              ? { code: 'ACCOUNT_CHANGED' }
              : typeof x.code === 'string'
                ? { code: x.code }
                : {},
      );
      return { ok: false, word: w.word, unknown: w.unknown === true, rekey: w.rekey === true, info: errorInfo(e), ...(sent ? { key: sent } : {}) };
    };
    if (r.ok) return acceptCheckoutUrl(method, r.url) ? { ok: true, url: r.url, ...(sent ? { key: sent } : {}) } : fail({ code: 'BAD_CHECKOUT_URL' });
    // busy: a send of this top-up is already in flight, so its answer is unknown, never "nothing was sent".
    // Another drawer already answered this owner's top-up: nothing was sent here and the form starts again.
    if (r.reason === 'resolved') return { ok: false, word: { k: 'top.resolved' }, unknown: false, rekey: false, resolved: true, ...(sent ? { key: sent } : {}) };
    // This browser has no Web Locks: nothing was sent, and nothing can be sent safely from it.
    if (r.reason === 'noLocks') return { ok: false, word: { k: 'noLocks' }, unknown: false, rekey: false };
    // Storage could not keep the top-up's hold: nothing was sent, in the same words as a reserve's or a rent's
    // storage refusal (buy.storeErr), so the user learns storage is the cause.
    if (r.reason === 'storageFailed') return { ok: false, word: { k: 'buy.storeErr' }, unknown: false, rekey: false };
    if (r.reason === 'pending' || r.reason === 'busy') return fail(r.error, true);
    return fail(r.reason === 'failed' ? r.error : { notSent: true });
  }, []);
  const submit = useCallback<TopUpApi['submit']>(
    async (method, amount) => {
      // Busy rule: while this drawer's own send is out (the ref, or the machine's snapshot), a second submit (two
      // presses in one batch) changes nothing; the first one's answer is the outcome.
      if (submitRef.current || machine.snapshot().phase === 'submitting') return { ok: false, ignored: true };
      submitRef.current = true;
      setRunning(true);
      try {
        if (!machine.select(method)) {
          // The machine refuses while an earlier top-up is unread: that is unknown, never "nothing was sent".
          return machine.snapshot().pending
            ? settle(method, { ok: false, reason: 'pending', key: '', method, amount })
            : settle(method, { ok: false, reason: 'nomethod' });
        }
        // Core holds the top-up under its key before the request goes out and announces it: the key this send used is read
        // there (the hold is gone once the answer is definitive).
        let sent: string | undefined;
        const off = commerce.subscribeTopUpPending(() => {
          sent = commerce.topUpHeldFor(capture())?.key ?? sent;
        });
        try {
          const r = await machine.submit(amount);
          return settle(method, r, sent);
        } finally {
          off();
        }
      } finally {
        submitRef.current = false;
        setRunning(false);
      }
    },
    [machine, settle],
  );
  const balance = useBalance();
  // Check again reads only: core re-reads the held record and sends nothing; the balance is read again here.
  const checkAgain = useCallback<TopUpApi['checkAgain']>(async () => {
    // As submit and resend: while this drawer's own call is out, a Check again changes nothing, and only the owning
    // call clears `running`.
    if (submitRef.current || machine.snapshot().phase === 'submitting') return { ok: false, ignored: true };
    submitRef.current = true;
    setRunning(true);
    try {
      const p = machine.snapshot().pending;
      void balance.refetch();
      const r = await machine.checkAgain();
      return settle(p?.method ?? 'card', !r.ok && r.reason !== 'resolved' && r.reason !== 'busy' ? { ok: false, reason: 'pending', key: '', method: p?.method ?? 'card', amount: p?.amount ?? '' } : r);
    } finally {
      submitRef.current = false;
      setRunning(false);
    }
  }, [machine, settle, balance]);
  const resend = useCallback<TopUpApi['resend']>(async (shown) => {
    // As submit: while this drawer's own send is out, a second resend (two presses in one batch) changes nothing, and
    // only the owning call clears `running`.
    if (submitRef.current || machine.snapshot().phase === 'submitting') return { ok: false, ignored: true };
    submitRef.current = true;
    setRunning(true);
    try {
      const p = machine.snapshot().pending;
      // Only the held top-up the dialog was opened for (key, provider, amount): another one (or none) sends nothing
      // and stays unknown. Core checks it again against the shared record, and once more under the pending lock.
      if (!p || !shown || p.key !== shown.key || p.method !== shown.method || p.amount !== shown.amount)
        return settle(p?.method ?? 'card', { ok: false, reason: 'pending', key: '', method: p?.method ?? 'card', amount: p?.amount ?? '' });
      const r = await machine.resend(true, shown);
      // A resend is never "nothing was sent": the request is already out, so anything core does not call a definite
      // answer (account moved, no method, ...) is still unsure.
      const unsure = !r.ok && r.reason !== 'pending' && r.reason !== 'busy' && r.reason !== 'resolved' && r.reason !== 'failed';
      return settle(
        p?.method ?? 'card',
        unsure ? { ok: false, reason: 'pending', key: '', method: p?.method ?? 'card', amount: p?.amount ?? '' } : r,
      );
    } finally {
      submitRef.current = false;
      setRunning(false);
    }
  }, [machine, settle]);
  const p = snapState.pending;
  const avail = useMemo(() => liveAvail(snapState), [snapState]);
  return {
    submit,
    checkAgain,
    resend,
    forget: () => machine.forget(true),
    running,
    loading: !loaded,
    reload,
    avail,
    pending: p ? { key: p.key, method: p.method, amount: p.amount, persisted: p.persisted !== false, sending: p.sending === true } : null,
  };
}

/** Core still holds an unresolved rent of this server: the rental may exist. */
function rentHeldFor(kind: CheckoutKind, target: CheckoutTarget | null): boolean {
  return kind === 'rent' && !!target && commerce.rentPendingFor(capture()).some((m) => m.server_id === target.item);
}

/** This tab's own unresolved reserve of this offer (this term first, else any) whose key may be gone (core reserveUnknownFor):
 *  the drawer opens on it at outcome unknown, like a kept key. */
function reserveHeldFor(kind: CheckoutKind, target: CheckoutTarget | null, days: number | null): { since: number; days: string } | null {
  return kind === 'reserve' && target && days !== null ? commerce.reserveUnknownFor(capture(), target.item, String(days)) : null;
}

/** The rent POST of this server is still out (core's marker says sending): a second rent beside it is never offered. */
function rentSendingFor(kind: CheckoutKind, target: CheckoutTarget | null): boolean {
  return kind === 'rent' && !!target && commerce.rentPendingFor(capture()).some((m) => m.server_id === target.item && m.sending);
}

export function useCheckoutLive(kind: CheckoutKind, target: CheckoutTarget | null, title: string): CheckoutApi {
  const key = target ? targetKey(target) : '';
  const market = kind === 'rent' || kind === 'reserve';
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckout);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The drawer's target as last rendered (a refused location is named with the location the picker held).
  const targetNow = useRef(target);
  targetNow.current = target;
  const [gen, setGen] = useState(0);
  const balance = useBalance();
  const refetchBalance = balance.refetch;
  const subsRead = useSubs();
  // A server purchase spends Referral credit first, then the general wallet.
  const money = spendOf(balance.data);
  const row = useMarketRow(market ? (kind as 'rent' | 'reserve') : null, market ? (target?.item ?? null) : null);
  const days = target?.days ?? null;
  // The first POST settles inside core, possibly under another drawer: read its marker again when core announces it.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const sending = rentSendingFor(kind, target);
  useEffect(() => (__HUB_FIXTURES__ ? undefined : commerce.subscribeRentPending(bump)), []);

  const machine = useMemo(() => {
    if (!target) return null;
    if (market) {
      const pend = commerce.marketPendingFor(capture()).find((p) => p.offer_id === target.item && p.days === String(days)) ?? null;
      // A remembered hold with no kept key is held too: its outcome is shown even when the term no longer prices.
      const r = purchaseRow(row.data, target.item, days, (kind === 'reserve' && (pend !== null || reserveHeldFor(kind, target, days) !== null)) || rentHeldFor(kind, target));
      if (!r) return null;
      return { family: 'purchase' as const, row: r, pend };
    }
    return {
      family: 'attempt' as const,
      m: commerce.createAttempt(kind as 'buy' | 'pay' | 'upgrade', {
        plan: kind === 'pay' ? undefined : { id: target.item ?? '', family_id: target.familyId },
        sub: target.subId ? { id: target.subId } : undefined,
        title,
        // A buy's chosen location is fixed for its attempt: another choice makes another attempt (its own quote and key).
        ...(kind === 'buy' && target.region ? { region: target.region } : {}),
      }),
    };
    // a new machine per target (a buy's chosen location is part of it) and per fresh review
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, row.data, gen, kind === 'buy' ? (target?.region ?? null) : null]);

  // Purchase machine: created with the row, reports every change through onChange.
  const [snap, setSnap] = useState<commerce.PurchaseSnapshot | null>(null);
  const [requote, setRequote] = useState<{ days: string; totalCents: number } | null>(null);
  const pm = useMemo(() => {
    if (!machine || machine.family !== 'purchase') return null;
    return commerce.createPurchase(machine.row, String(days), { recover: machine.pend, requote, onChange: setSnap });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, requote]);
  const att = machine && machine.family === 'attempt' ? machine.m : null;
  // The machine resumed now: none once its effect is cleaned up (the drawer closed, or a re-read replaced it), set again
  // when the effect resumes. A kept Confirm of a disposed machine sends nothing.
  const liveRef = useRef<unknown>(null);
  // When this drawer last confirmed a market purchase: a Check again of its own unresolved reserve whose key is no longer
  // kept reads the reservations made since then (checkAgain).
  const confirmAtRef = useRef<number | null>(null);
  // Each Check again's own number: an answer settles the check only while it is still the newest one (checkAgain).
  const checkSeqRef = useRef(0);
  // The attempt this drawer last sent, with its target: Check again reads that attempt's kept entry (checkAgain).
  // Its key as sent: a refusal resets the attempt's own key, and a refused send drops only the entry of that key.
  const sentRef = useRef<{ att: commerce.Attempt; t: commerce.HeldPlanTarget; key: string | null } | null>(null);
  useEffect(() => {
    const m = pm ?? att;
    liveRef.current = m;
    m?.resume();
    return () => {
      // A purchase machine replaced (a re-read, a new review) while its own send is out, or while the drawer still waits
      // on it: that send may go through and its answer never reaches this drawer (disposed), so the drawer reads "outcome
      // unknown" with Check again, never "not sent", never left posting. An attempt's dispose only silences it: its
      // answer() still lands, so it is left alone.
      // A machine that already reached its outcome (confirmed, failed, not found, unknown) published it through
      // onChange: the snapshot effect settles that answer, so a success is never turned into unknown here. A Retry whose
      // admission is out keeps the machine indeterminate with `retrying` and publishes nothing (the snapshot effect skips
      // it): that is no answer, so the drawer still ends unknown.
      const ps = pm ? pm.snapshot() : null;
      const out = ps ? ps.state : null;
      const ph = stateRef.current.phase;
      const answered = !!ps && !ps.retrying && (out === 'confirmed' || out === 'failed' || out === 'not-found' || out === 'indeterminate');
      m?.dispose();
      if (liveRef.current === m) liveRef.current = null;
      if (pm && !answered && (out === 'posting' || out === 'reconciling' || ph === 'posting' || ph === 'reconciling')) {
        stateRef.current = checkoutReducer(stateRef.current, { type: 'unknown', retryIn: 0 });
        dispatch({ type: 'unknown', retryIn: 0 });
      }
    };
  }, [pm, att]);

  // The quote.
  const env = { generalCents: money.generalCents, referralCents: money.referralCents, spendableCents: money.spendableCents, server: target?.server ?? '', placeName: target?.region ? (target.regionName ?? null) : null, region: kind === 'buy' ? (att?.snapshot().region ?? null) : null };
  // Each quote answer is bound to the attempt that asked: an answer that comes back after its attempt was replaced (a
  // family link now resolving to another plan version) is dropped, so the drawer never shows one attempt's price while
  // Confirm sends another's ceiling.
  const [rawQuote, setRawQuote] = useState<{ att: commerce.Attempt; q: Parameters<typeof attemptQuote>[1] } | null>(null);
  const [quoteErr, setQuoteErr] = useState<unknown>(null);
  const attRef = useRef(att);
  attRef.current = att;
  const quoteNow = useCallback(() => {
    if (!att) return;
    setQuoteErr(null);
    att.quote().then(
      (q) => {
        if (attRef.current !== att) return;
        setRawQuote({ att, q });
        if (att.snapshot().pending && stateRef.current.phase === 'review') dispatch({ type: 'restore' });
      },
      (e: unknown) => {
        if (attRef.current === att) setQuoteErr(e ?? {});
      },
    );
  }, [att]);
  // The current attempt's quote call: a send's answer may land after its attempt was replaced, and must re-quote this one.
  const quoteNowRef = useRef(quoteNow);
  quoteNowRef.current = quoteNow;
  useEffect(() => {
    setRawQuote(null);
    // A review priced for the replaced attempt goes back to quoting: no price, consent or Confirm until this one's quote.
    if (att) {
      dispatch({ type: 'marketStale' });
      // As confirm: the ref moves now, so a Confirm before the next render finds no review to send from.
      stateRef.current = checkoutReducer(stateRef.current, { type: 'marketStale' });
    }
    quoteNow();
  }, [quoteNow, att]);
  const quote = useMemo(() => {
    // subject: what is bought, so a same-price quote for another purchase (a family link now resolving to a new plan
    // version) never inherits the consent.
    // A buy's chosen location is part of the subject too: consent given for one location never carries to another.
    if (att) return rawQuote && rawQuote.att === att ? { ...attemptQuote(kind, rawQuote.q, env), subject: `${kind}:${target?.item ?? ''}:${target?.subId ?? ''}${kind === 'buy' && target?.region ? `:${target.region}` : ''}` } : null;
    if (pm && machine?.family === 'purchase') {
      const q = purchaseQuote(machine.row, String(days), env, requote);
      return q ? { ...q, subject: `${kind}:${target?.item ?? ''}:${days}` } : null;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawQuote, money.generalCents, money.referralCents, money.spendableCents, att, pm, kind, requote, target?.item, target?.subId, target?.region, target?.regionName, days]);
  // What a second rent may be sent at, read when it is asked for (a kept api's rentAgain sees the latest render).
  const rowEnded = row.ended;
  const priceRef = useRef({ ended: rowEnded, quote, pm, att });
  priceRef.current = { ended: rowEnded, quote, pm, att };
  const rentPriceHeld = (shown: CheckoutQuote) => priceRef.current.ended && priceRef.current.quote?.chargeCents === shown.chargeCents;
  useEffect(() => {
    if (quote) {
      dispatch({ type: 'quoted', quote });
      // A retained purchase of this target is still unknown: the drawer opens on it.
      if (att?.snapshot().pending || pm?.snapshot().state === 'indeterminate' || rentHeldFor(kind, target) || (pm && reserveHeldFor(kind, target, days))) dispatch({ type: 'restore' });
    } else if (quoteErr) {
      // A kept attempt is recovered from its own entry: a quote that fails must not strand its Check again.
      if (att?.snapshot().pending) dispatch({ type: 'restore' });
      else dispatch(commerceRules.isAccountBannedError(quoteErr) ? { type: 'banned' } : { type: 'quoteFailed', info: errorInfo(quoteErr) });
      // A held purchase whose row no longer prices its term: no quote, but its outcome is still unknown.
    } else if (pm && (pm.snapshot().state === 'indeterminate' || rentHeldFor(kind, target) || reserveHeldFor(kind, target, days))) dispatch({ type: 'restore' });
    else if (market && target && machine === null && row.ended) dispatch({ type: 'quoteFailed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, quoteErr, machine, att, pm, market, key, row.ended, row.data]);

  // A market review stands only on the row read for the current inputs (a generation move re-reads it with the drawer
  // open, and the drawer keeps its earlier listing meanwhile): while that read is out, any arrival in review (the
  // review that stood, a requote, a send that came back not sent or refused, a fresh review) goes back to quoting, so
  // no price, consent or Confirm stands on the earlier row. Its answer quotes again, or (failed, row gone) ends at the
  // price error above.
  useEffect(() => {
    if (market && target && !row.ended) dispatch({ type: 'marketStale' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, key, row.ended, state.phase]);

  // Purchase machine answers (rent / reserve).
  useEffect(() => {
    if (!snap) return;
    notifyUnknown();
    // Suspended: a purchase that was sent keeps its outcome (unknown or not found: it may already have
    // gone through, and Check again still only reads; being read back; done), so the drawer is only marked suspended and
    // the answer settles as usual. Idle or failed means nothing went through: that answer settles first (a refused
    // send ends its posting step, an admission refusal its review or "may have gone through"), and only then does the
    // banned body replace a step from before the outcome. The drawer drops every control that could send.
    const keep = snap.state !== 'idle' && snap.state !== 'failed';
    if (snap.banned && keep) dispatch({ type: 'banned', keep: true });
    settle(snap);
    if (snap.banned && !keep) dispatch({ type: 'banned' });

    function settle(cur: commerce.PurchaseSnapshot): void {
      if (cur.state === 'reconciling') {
        dispatch({ type: 'reconciling' });
        return;
      }
      // A Retry still waiting on its admission under the pending lock: nothing was sent and nothing is known yet.
      if (cur.retrying) return;
      const ph = stateRef.current.phase;
      // Core's admission refused after the confirm was accepted (storage failed, another tab holds the offer): the
      // machine is idle again with a notice and nothing was sent, so the drawer goes back to its review.
      if (cur.state === 'idle' && cur.notice && ph === 'posting') {
        // An earlier unresolved purchase of this item (a reserve's kept key, or a rent's hold) appeared between the
        // check and the lock: nothing left this tab, but that earlier one may have gone through, so this is
        // "outcome unknown" with its Check again, the same as the early check in confirm(), never "nothing was charged".
        const e =
          cur.notice === 'unresolvedReserve' || cur.notice === 'unresolvedRent'
            ? ({ type: 'unknown', retryIn: 0 } as const)
            : cur.notice === 'noLocks'
              ? ({ type: 'notSent', word: { k: 'noLocks' } } as const)
              // Storage could not keep the reserve's key or the rent's hold: the same words as confirm's early
              // storage refusal (logic.ts attemptWords), so the user learns storage is the cause.
              : cur.notice === 'storageFailed'
                ? ({ type: 'notSent', word: { k: 'buy.storeErr' } } as const)
                : settleEvent(kind, { outcome: 'not_sent' }, 'send');
        if (e) dispatch(e);
        return;
      }
      // The admission gave up with no notice ('busy': the pending lock was not granted in time, its callback failed,
      // or a Rent again anyway found another rent of this server being sent). Core never sends after it, but the
      // drawer must not stay in posting. Busy rule: this machine is idle, so no send of its own is out, and busy is
      // "outcome unknown" with Check again (an earlier or another tab's send of it may be out), never "not sent".
      if (cur.state === 'idle' && !cur.notice && ph === 'posting') {
        dispatch({ type: 'unknown', retryIn: 0 });
        return;
      }
      const ch = purchaseChange(cur);
      if (!ch) return;
      if (cur.state === 'indeterminate' && (ph === 'quoting' || ph === 'review')) {
        dispatch({ type: 'restore' });
        return;
      }
      // A read-back that finds nothing is "not confirmed", never a failure: the purchase may still exist (C9).
      const e = settleEvent(kind, ch, purchasePhase(ph, ch), cur.retryIn);
      // A resend core's admission refused for want of a granted Web Lock (a Locks API that rejects): nothing was sent,
      // the outcome stays unknown, and the view says why.
      if (e) dispatch(e.type === 'unknown' && cur.notice === 'noLocks' ? { ...e, word: { k: 'noLocks' } } : e);
      // A refused purchase leaves its machine terminal: clear it, and carry the server's re-quote into the next one.
      if (e?.type === 'refused') {
        // A refusal may carry a stale balance (insufficient funds): read it again.
        void refetchBalance();
        pm?.dismiss();
        if (e.requote != null && days !== null) setRequote({ days: String(days), totalCents: e.requote });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, kind]);

  // A completed purchase changes the balance and the subscriptions: read both again, not after the stale window.
  const phaseNow = state.phase;
  // The Free badge stays off while a purchase of this browser is out or unresolved, and re-reads when it ends.
  usePurchaseActivity(phaseNow === 'posting' || phaseNow === 'reconciling' || phaseNow === 'checking' || phaseNow === 'unknown');
  useEffect(() => {
    if (phaseNow !== 'done' && phaseNow !== 'already') return;
    void balance.refetch();
    void subsRead.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseNow]);

  useRetryCountdown(state, dispatch);

  const answer = useCallback(
    (p: Promise<commerce.AttemptConfirm>, phase: 'send' | 'check') => {
      void p.then((r) => {
        const s = att?.snapshot();
        // Busy: while this machine's own send is out (its snapshot, never stateRef) that send's answer settles the
        // drawer, so busy changes nothing; with no send out the outcome is unknown, with Check again, never "not sent".
        if (!r.ok && r.reason === 'busy') {
          if (s?.phase === 'posting') return;
          const u = settleEvent(kind, { outcome: 'pending' }, phase);
          notifyUnknown();
          if (u) dispatch(u);
          return;
        }
        const e = namedRegionRefusal(settleEvent(kind, attemptChange(r, s?.error ? String(s.error.code ?? '') || null : null, s?.error?.info), phase), targetNow.current);
        notifyUnknown();
        if (e) dispatch(e);
        // A send of an attempt that was replaced while it was out came back with nothing sent or refused: the review it
        // returns to holds that attempt's price (and, not sent, its consent). Drop both and show the current attempt's own
        // quote (if it has one), so the next Confirm needs fresh consent on the price it will send.
        let staleKept = false;
        if ((e?.type === 'notSent' || e?.type === 'refused') && att !== attRef.current) {
          dispatch({ type: 'marketStale' });
          stateRef.current = checkoutReducer(stateRef.current, { type: 'marketStale' });
          const q = priceRef.current.quote;
          const cs = attRef.current?.snapshot();
          // A definite refusal drops the kept request the current attempt adopted from the refused send, but that
          // attempt still holds its copy: when the store no longer keeps that key, the attempt is replaced (a fresh one
          // quotes), instead of showing an outcome unknown that nothing can resolve.
          // Only the refused send's own entry is known gone: an adopted entry of another key (another tab's request,
          // which may have succeeded and been dropped) keeps the unknown outcome, never a fresh review that buys again.
          const sentKey = sentRef.current?.att === att ? sentRef.current.key : null;
          staleKept = e.type === 'refused' && !!cs?.pending && !!sentKey && cs.key === sentKey
            && commerce.heldPlanEntry(capture(), heldTargetOf(kind, target))?.key !== cs.key;
          if (staleKept) setGen((g) => g + 1);
          // The current attempt adopted a kept request: show its unknown outcome (resent only through its dialog,
          // under its own ceiling), never a plain review whose Confirm would resend it.
          else if (cs?.pending) dispatch({ type: 'restore' });
          else if (q) dispatch({ type: 'quoted', quote: q });
          // No current price (its quote failed while the drawer was posting, and that failure was not taken then):
          // ask again, else the drawer stays on quoting with no error and no Confirm. A quote only reads.
          else if (e.type === 'notSent') quoteNowRef.current();
        }
        // A refused ceiling is stale (CHARGE_EXCEEDS_MAX carries no re-quote here): ask again (the current attempt, also
        // when the refused one was replaced), so the next Confirm never re-sends it; a refusal may also carry a stale
        // balance (insufficient funds): read it again.
        if (e?.type === 'refused') {
          if (!staleKept) quoteNowRef.current();
          void refetchBalance();
        }
      });
    },
    [att, kind, refetchBalance, target],
  );

  const confirm = useCallback(() => {
    // A kept callback (an earlier render's) may hold a machine a re-read replaced and disposed: its confirm would answer
    // ok, send nothing and leave the drawer posting; an earlier attempt's would still send (core's dispose only silences
    // it). Only the current machines, purchase and attempt alike.
    // Disposed (the drawer closed): nothing either.
    if (pm !== priceRef.current.pm || att !== priceRef.current.att || (pm ?? att) !== liveRef.current) return;
    if (!confirmGate(stateRef.current).ok) return;
    // Backstop (marketStale keeps a review from standing without it): a market Confirm needs a purchase machine on
    // the row read for the current inputs.
    if (market && (!pm || !row.ended)) return;
    if (att) {
      // The attempt sends its own ceiling, which core moves as soon as a quote resolves, and a kept request when it
      // holds one: send only the amount the drawer shows, and never a kept request from a review.
      const a = att.snapshot();
      if (a.pending) {
        // A kept request is resent only through its own dialog: show its unknown outcome instead.
        dispatch({ type: 'restore' });
        return;
      }
      // The ceiling moved past the price shown (a quote resolved that the review never took, e.g. while posting):
      // send nothing; show the current price with fresh consent, or, with none to show, ask again so the drawer
      // reaches a review or the price error with its Retry instead of a Confirm that does nothing.
      if (a.ceiling !== stateRef.current.quote?.chargeCents) {
        dispatch({ type: 'marketStale' });
        stateRef.current = checkoutReducer(stateRef.current, { type: 'marketStale' });
        const q = priceRef.current.quote;
        if (q && q.chargeCents === a.ceiling) dispatch({ type: 'quoted', quote: q });
        else {
          // The shown price no longer stands: dropped, so a failing quote reaches the price error.
          setRawQuote(null);
          quoteNowRef.current();
        }
        return;
      }
    }
    dispatch({ type: 'confirmed' });
    // The ref moves now, not at the next render: a second Confirm in the same input batch finds the drawer posting and
    // never reaches the machine, whose 'busy' answer would otherwise settle the first request as "not sent".
    stateRef.current = checkoutReducer(stateRef.current, { type: 'confirmed' });
    if (att) {
      // The key is read right after confirm() starts: core sets it when the quote resolves, clears it on a refusal,
      // and mints it in confirm() itself when a refusal cleared it and the re-quote kept the same price. Read before
      // the send has begun, it would be null, and a later refusal of this send would not know its own entry is gone.
      const p = att.confirm(true);
      sentRef.current = { att, t: heldTargetOf(kind, target), key: att.snapshot().key };
      answer(p, 'send');
    } else if (pm) {
      confirmAtRef.current = Date.now();
      const r = pm.confirm(true);
      if (!r.ok && r.reason === 'busy') {
        // Busy rule: core answers busy only from a machine that is not idle. Its own send out (read from its snapshot,
        // never stateRef): that send's snapshot settles the drawer. Otherwise an earlier send of it may have gone
        // through: unknown with Check again, never "not sent".
        const st = pm.snapshot().state;
        if (st !== 'posting' && st !== 'reconciling') dispatch({ type: 'unknown', retryIn: 0 });
      } else if (!r.ok) {
        // Core held this send behind an earlier unresolved purchase of the same item: that one may have gone
        // through, so this is "outcome unknown" with its Check again, never "nothing was charged".
        const e = r.reason === 'unresolved' ? ({ type: 'unknown', retryIn: 0 } as const) : settleEvent(kind, { outcome: 'not_sent' }, 'send');
        if (e) dispatch(e);
      }
    }
  }, [att, pm, answer, kind, market, row.ended, target]);

  const checkAgain = useCallback(() => {
    if (stateRef.current.phase !== 'unknown' && stateRef.current.phase !== 'not_found') return;
    dispatch({ type: 'checkStarted' });
    // As confirm and resend: the ref moves now, so a resend in the same batch finds the drawer checking.
    stateRef.current = checkoutReducer(stateRef.current, { type: 'checkStarted' });
    const seq = ++checkSeqRef.current;
    // Reads only: no read settles a hold, so every answer keeps it, with what the read
    // saw. A rent has no key: one fresh read of the rentals is evidence, never a release.
    if (kind === 'rent') {
      void commerce.checkRentPending(capture(), String(target?.item)).then((r) => {
        notifyUnknown();
        // Only this check's answer settles it, never a newer check's. The reducer takes it
        // only while checking; the rendered phase is not asked here, as an answer may come before the checking render.
        if (seq === checkSeqRef.current) dispatch({ type: 'checkUnknown', word: r === 'active' ? { k: 'co.checkRented' } : undefined });
      });
      return;
    }
    // buy / pay / upgrade: never the kept request again.
    if (att) {
      // The outcome shown is the last send's: when that attempt was replaced by one for another plan and the current
      // one keeps nothing, its kept entry is found only by its own target.
      const sent = sentRef.current;
      const t = sent && sent.att !== att && !att.snapshot().pending ? sent.t : heldTargetOf(kind, target);
      void (kind === 'pay' ? commerce.checkPayHold(capture(), t) : commerce.checkPlanHold(capture(), t)).then((r) => {
        notifyUnknown();
        if (seq === checkSeqRef.current) dispatch({ type: 'checkUnknown', word: holdWord(r) });
      });
      return;
    }
    // A reservation: one read of the reservations (a match is shown as such). A machine at outcome unknown reads them
    // itself (refresh). An idle one (core refused this drawer's admission as unresolved, or a refusal left a key it
    // cannot rule out) reads nothing and moves nothing, so the drawer reads them here instead of asking it, as for a
    // held reservation (checkReserveHold: evidence only, the hold stays). Its key may be gone already (another tab sent
    // it and dropped it): then the read is for this drawer's term since its Confirm. The choice is made before any read, from the machine's last state, so
    // a refresh that read and then went stale (its answer false) never adds a second read. The state is
    // the current machine's own, read now: the last rendered snapshot may still be an earlier machine's.
    if (pm && kind === 'reserve' && days !== null && pm.snapshot().state === 'idle') {
      // This drawer's term since its Confirm, else the remembered reserve's own term since its Confirm (a reopened
      // drawer; the hold may be another term's); read only as the account that confirmed.
      // A hold that refused this drawer's own Confirm (another drawer's, or one its restore had not seen) is read too:
      // its own term since it began, or this term since the earlier of the two.
      const held = reserveHeldFor(kind, target, days);
      const at = confirmAtRef.current;
      const gone = !held
        ? { days: String(days), since: at }
        : at !== null && held.days === String(days)
          ? { days: held.days, since: Math.min(held.since, at) }
          : { days: held.days, since: held.since };
      void commerce.checkReserveHold(capture(), target?.item, { ...gone, owner: pm.snapshot().owner }).then(
        (h) => h,
        () => ({ check: 'unknown' as const, evidence: null }),
      ).then((h) => {
        notifyUnknown();
        // Only this check's answer settles it. A machine replaced while the read ran does not end the check, so its
        // answer still does (the same item), never a later check's (a dropped answer would leave it checking).
        if (seq === checkSeqRef.current) dispatch({ type: 'checkUnknown', word: holdWord(h) });
      });
      return;
    }
    // A machine that does not read here leaves no change to wait for: back to the unknown view, never stuck checking.
    // Only this check's answer settles it, never a later check's. A machine replaced (disposed) while
    // its refresh ran delivers no snapshot even when it read (true), so that check is settled here too, never left
    // checking.
    void (pm ? pm.refresh() : Promise.resolve(false)).then((r) => {
      const gone = !!pm && pm !== liveRef.current;
      if ((!r || gone) && seq === checkSeqRef.current) dispatch({ type: 'checkUnknown' });
    });
  }, [att, pm, kind, target, days]);

  // The person confirmed "Rent again anyway": only now may a second rent be sent beside an unresolved one.
  const rentAgain = useCallback(() => {
    const s = stateRef.current;
    // Core's marker is read now, not the render's copy: a second tab may have started sending since.
    // A second rent is priced like a first one: never from a drawer with no quote (its button needs one too), and only
    // at the price the drawer shows: the listing read must have ended and price the term as the shown quote does (the
    // unknown and not-found views keep their quote while a generation move re-reads the row).
    // A kept callback (an earlier render's) may hold a machine the re-read has replaced and disposed: its confirm would
    // answer ok, send nothing and never settle, leaving the drawer posting. Only the current one.
    if (pm !== priceRef.current.pm || pm !== liveRef.current) return;
    if (!pm || kind !== 'rent' || !s.quote || !rentPriceHeld(s.quote) || rentSendingFor(kind, target) || !(s.phase === 'not_found' || (s.phase === 'unknown' && s.stillUnknown))) return;
    dispatch({ type: 'rentAgain' });
    // As confirm: the ref moves now, so a second press in the same input batch finds the drawer posting and sends nothing.
    stateRef.current = checkoutReducer(stateRef.current, { type: 'rentAgain' });
    if (pm.snapshot().state === 'not-found') pm.retryRent();
    const r = pm.confirm(true, { rentAgainAnyway: true });
    // Busy rule: with this machine's own send out (its snapshot, never stateRef) that send's snapshot settles the drawer.
    if (!r.ok && r.reason === 'busy' && (pm.snapshot().state === 'posting' || pm.snapshot().state === 'reconciling')) return;
    if (!r.ok) {
      // busy / unresolved: the earlier rent is still unknown, so the drawer keeps "may have gone through" and
      // Check again; only a refusal that left before anything was held reads as "not sent".
      const e =
        r.reason === 'busy' || r.reason === 'unresolved'
          ? ({ type: 'unknown', retryIn: 0 } as const)
          : settleEvent(kind, { outcome: 'not_sent' }, 'send');
      if (e) dispatch(e);
    }
  }, [pm, kind, target]);

  // The kept request now, read from core's store (never a render's copy): what the resend dialog is opened for, and
  // what its confirm must still find. A reservation's ceiling is its MarketPending.ceiling (the body's max).
  const resendShown = useCallback((): ResendShown | null => {
    if (kind === 'rent' || !target) return null;
    const ctx = capture();
    if (kind === 'reserve') {
      const p = commerce.marketPendingFor(ctx).find((x) => x.offer_id === target.item && (days === null || x.days === String(days)));
      return p ? { key: p.key, maxCents: p.ceiling, sig: commerce.marketPendingSig(p) } : null;
    }
    const e = commerce.heldPlanEntry(ctx, heldTargetOf(kind, target));
    return e;
  }, [kind, target, days]);
  // The person's confirmed "Send the same request again": only the drawer's ConfirmDialog calls it, and only
  // the kept request the dialog was opened for is sent (core's claim refuses it again if it vanishes meanwhile).
  const resend = useCallback(
    (shown: ResendShown | null | undefined) => {
      // As confirm: only the current machines; a kept callback's replaced or disposed machine sends nothing.
      if (pm !== priceRef.current.pm || att !== priceRef.current.att || (pm ?? att) !== liveRef.current) return;
      const s = stateRef.current;
      if (s.phase !== 'unknown' || s.retryIn > 0 || !sameShown(shown, resendShown())) return;
      if (att) {
        const a = att.snapshot();
        if (!a.pending || a.key !== shown?.key) return;
        // A resend of the kept key has replay semantics: its answer is read as the old Check again's replay was
        // ('check'), so a refusal or a not-sent never reads as "nothing was charged" (the first request may have gone
        // through) and the drawer never drops back to review.
        dispatch({ type: 'checkStarted' });
        // As confirm: the ref moves now, so a second resend in the same batch finds the drawer checking and sends nothing.
        stateRef.current = checkoutReducer(stateRef.current, { type: 'checkStarted' });
        answer(att.confirm(true), 'check');
        return;
      }
      // Only a retry the machine accepted moves on: it refuses while its own Retry-After runs. The machine resends its
      // own key and ceiling: they must be the confirmed record's (resendShown matched the stored one just above).
      const ps = pm?.snapshot();
      if (kind === 'reserve' && pm && ps && ps.idemKey === shown?.key && ps.ceiling === shown.maxCents && pm.retry()) dispatch({ type: 'retrying' });
    },
    [att, pm, kind, answer, resendShown],
  );
  // The person confirmed "Start a new purchase" on a reservation whose outcome is unknown: only the kept request the dialog was opened for is abandoned, under core's pending
  // lock, and never while a live flight says a send of it may be on the wire in a tab (core's stated limits). Only
  // once core proved no tab sends it again does
  // the drawer open a fresh review, whose Confirm is a new key. A request already sent may still go through: the
  // dialog says so.
  const reserveNewShown = useCallback((): ReserveNewShown | null => {
    const kept = resendShown();
    if (kept) return { kept };
    const held = pm && pm.snapshot().state === 'idle' ? reserveHeldFor(kind, target, days) : null;
    return held ? { held: { days: held.days, since: held.since } } : null;
  }, [resendShown, pm, kind, target, days]);
  const reserveNew = useCallback(
    (shown: ReserveNewShown | null | undefined) => {
      if (kind !== 'reserve' || !pm || stateRef.current.phase !== 'unknown' || !shown) return;
      // The remembered reserve with no kept key: the dialog opened with nothing kept, and still nothing is. Only
      // the reserve the dialog was opened for goes, by its own term: a drawer that shows another one (or none)
      // forgets nothing, and a hold of another term stays (it may still go through) and reopens the drawer on it. Core
      // forgets it only once the store proves no key of this offer is kept; else nothing changes.
      if ('held' in shown) {
        if (resendShown() !== null || pm.snapshot().state !== 'idle') return;
        const now = reserveHeldFor(kind, target, days);
        if (!now || now.days !== shown.held.days || now.since !== shown.held.since) return;
        void commerce.reserveUnknownAbandon(capture(), target?.item, shown.held.days).then((r) => {
          if (stateRef.current.phase !== 'unknown') return;
          notifyUnknown();
          // 'kept': a key of the offer is still kept, maybe another term's; the notice names that term.
          const kept = r === 'kept' ? commerce.marketPendingFor(capture()).find((p) => p.offer_id === target?.item) : undefined;
          dispatch({ type: 'reserveNew', dropped: r === 'dropped', sending: false, keptDays: kept?.days });
          if (r === 'dropped') setGen((g) => g + 1);
        });
        return;
      }
      if (!sameShown(shown.kept, resendShown())) return;
      // One context for the whole confirmed abandon: the forget below runs under the one the person confirmed in, never a
      // later capture (an account shown since then is not the one that confirmed; core then forgets nothing).
      const ctx = capture();
      const key = shown.kept.key;
      void commerce.marketPendingAbandon(ctx, key).then((r) => {
        if (stateRef.current.phase !== 'unknown') return;
        const gone = r === 'dropped' || r === 'absent';
        // The remembered hold of this term goes with its abandoned key, else it would hold the fresh review: only that
        // key's own hold. A hold of another key (another admission) or of another term was not what the dialog showed and
        // may still go through, so it stays and the drawer reopens on it (outcome unknown) until settled on its own.
        if (gone && days !== null) commerce.reserveUnknownForget(ctx, target?.item, String(days), key);
        notifyUnknown();
        dispatch({ type: 'reserveNew', dropped: gone, sending: r === 'inflight' });
        if (gone) setGen((g) => g + 1);
      });
    },
    [pm, kind, resendShown, target, days],
  );
  const resendMax = resendShown()?.maxCents ?? null;
  // Whether `resend` can send the kept request at all: the attempt holds that key pending, or this
  // reservation's own machine is unknown on that key and ceiling. Otherwise (another tab's refused Confirm left this
  // machine idle, or no pending entry was adopted) the control is not drawn: it would only say a charge may follow.
  const canResend = ((): boolean => {
    const sh = resendShown();
    if (!sh) return false;
    if (att) {
      const a = att.snapshot();
      return !!a.pending && a.key === sh.key;
    }
    if (kind !== 'reserve' || !pm || !commerceRules.buy.hasWebLocks()) return false;
    const ps = pm.snapshot();
    // retry() also refuses while the market latch says suspended or a retry is being admitted.
    return ps.state === 'indeterminate' && ps.idemKey === sh.key && ps.ceiling === sh.maxCents && !ps.banned && !ps.retrying;
  })();

  // A buy adopts its family's kept request, whatever plan of the family was opened: name that request's own plan, only
  // while the attempt holds exactly that key pending and adopted it (this drawer's own Confirm, whose answer was lost, is
  // not an earlier request: it keeps the opened plan). Once named, the name stays with that attempt through its answer
  // (core clears pending and key then), so a done or failed resend still names the kept plan; a new attempt starts
  // over. A label read only: nothing is sent or changed here.
  const heldShownRef = useRef<{ att: commerce.Attempt; title: string } | null>(null);
  const heldTitle = ((): string | null => {
    if (kind !== 'buy' || !att || !target) return null;
    const kept = heldShownRef.current;
    if (kept && kept.att === att) return kept.title;
    const a = att.snapshot();
    if (!a.pending || !a.key) return null;
    // This drawer's own send (the key it used): not an earlier request. A request core adopted at Confirm holds another
    // key than the one this send minted, so it is named.
    const own = sentRef.current;
    if (own?.att === att && own.key === a.key) return null;
    const h = commerce.heldPlanTitle(capture(), heldTargetOf(kind, target));
    if (!h || h.key !== a.key) return null;
    heldShownRef.current = { att, title: h.title };
    return h.title;
  })();

  return {
    state,
    confirm,
    checkAgain,
    resendShown,
    resend,
    resendMax,
    canResend,
    heldTitle,
    keptRegion: ((): string | null => {
      if (kind !== 'buy' || !att) return null;
      const a = att.snapshot();
      return a.pending ? (a.region ?? null) : null;
    })(),
    reserveNoLocks: kind === 'reserve' && !!resendShown() && !commerceRules.buy.hasWebLocks(),
    rentHeld: rentHeldFor(kind, target),
    canRentAgain:
      kind === 'rent' &&
      !sending &&
      // After a Check again in this drawer the machine stays indeterminate and refuses any confirm (busy);
      // closing and reopening gives a fresh idle machine, which restores the unknown view and offers it.
      snap?.state !== 'indeterminate' &&
      (state.phase === 'not_found' || (state.phase === 'unknown' && state.stillUnknown)) &&
      // A second rent is priced like a first one: none from a row that no longer prices the term, is being re-read, or
      // prices it differently from the quote shown.
      !!state.quote &&
      rowEnded &&
      quote?.chargeCents === state.quote.chargeCents &&
      !!pm,
    rentAgain,
    // Or this tab's remembered reserve of this term, with no kept key and an idle machine.
    canReserveNew: kind === 'reserve' && !!state.quote && (canResend || (!!pm && pm.snapshot().state === 'idle' && !resendShown() && !!reserveHeldFor(kind, target, days))),
    reserveNewShown,
    reserveNew,
    // A rental of this server, or a reservation that looks like this one, was read: evidence only (the hold stays).
    match: (kind === 'reserve' || kind === 'rent') && !!snap && (snap.advisory || (kind === 'reserve' && snap.lateHint)),
    startOver: () => {
      dispatch({ type: 'startOver' });
      setGen((g) => g + 1);
    },
    again: () => {
      dispatch({ type: 'again' });
      setGen((g) => g + 1);
    },
    setConsent: (on) => dispatch({ type: 'consent', on }),
    clearPlan: () => dispatch({ type: 'planCleared' }),
    quoteRetrying: state.phase === 'quote_error' && !!att && quoteErr === null,
    reload: () => {
      quoteNow();
      if (market) void row.refetch();
      void balance.refetch();
    },
    locked: state.phase === 'posting' || state.phase === 'reconciling' || state.phase === 'checking',
  };
}

export const usePaymentReturn = __HUB_FIXTURES__ ? usePaymentReturnFx : usePaymentReturnLive;
export const useListing = __HUB_FIXTURES__ ? useListingFx : useListingLive;
export const useResume = __HUB_FIXTURES__ ? useResumeFx : useResumeLive;
export const useUnknownCheckouts = __HUB_FIXTURES__ ? useUnknownCheckoutsFx : useUnknownCheckoutsLive;
export const useCheckout = __HUB_FIXTURES__ ? useCheckoutFx : useCheckoutLive;
export const useTopUp = __HUB_FIXTURES__ ? useTopUpFx : useTopUpLive;

/**
 * The person is about to add funds in the middle of a purchase: remember it, so the payment-return band can offer the
 * way back ("Continue your purchase"). Core keeps the marker; only a verified credit shows it.
 */
/**
 * The location a purchase of this plan family had chosen when it left for Add funds (core's resume record of the
 * account shown), as a code. Only a wish: the drawer offers it again only when the plan's fresh list has room there.
 */
export function resumeRegion(familyId: string | null | undefined): string | null {
  if (__HUB_FIXTURES__ || !familyId) return null;
  const b = commerce.readBuyResume() as { plan?: string; region?: string } | null;
  return b && b.plan === familyId && typeof b.region === 'string' ? b.region : null;
}
/** That location was offered again, or found gone: asked once per trip to Add funds. */
export function forgetResumeRegion(): void {
  if (!__HUB_FIXTURES__) commerce.forgetBuyResumeRegion();
}

export function markResume(kind: CheckoutKind, target: CheckoutTarget | null, title: string): void {
  if (__HUB_FIXTURES__ || !target) return;
  const own = commerce.shownOwner(capture());
  if (kind === 'buy' && target.familyId) commerce.writeBuyResume(own, target.familyId, title, target.region ?? null);
  else if (kind === 'pay' && target.subId) commerce.writePayResume(own, { id: target.subId }, { title, name: target.server });
  else if (kind === 'rent' || kind === 'reserve')
    commerce.setMarketResume({ kind: kind === 'rent' ? 'stock' : 'offer', id: target.item }, String(target.days ?? ''));
}

/** A purchase of this listing is still unconfirmed in core (a rent marker or a kept reservation). */
export function hasHeldPurchase(kind: CheckoutKind, item: string | null | undefined): boolean {
  if (!item) return false;
  const ctx = capture();
  return kind === 'rent'
    ? commerce.rentPendingFor(ctx).some((m) => m.server_id === item)
    : commerce.marketPendingFor(ctx).some((p) => p.offer_id === item);
}

/** What Check again found for a held purchase: it exists (done), it does not (gone), or the read could not say (unknown). */
export type HeldCheck = 'done' | 'gone' | 'unknown';

/** What Check again (a read) or the confirmed resend found, with what a resend's answer said about the charge. */
export interface HeldResult {
  check: HeldCheck;
  /** What a read saw that may be this purchase (evidence only, the hold stays), or why a confirmed resend sent nothing
   *  (held.resendNotSent: the kept request changed or vanished, the machine or core's admission refused it, its claim or
   *  another preflight refused it, it timed out before the hand-over, or api() reported it unsent). */
  word?: Word;
  /** The charge was made but setting the server up failed. */
  setupFailed?: boolean;
  /** The server had already seen this request: false means this resend was the first time it reached it. */
  replayed?: boolean;
  ref?: string | null;
  /** The check was not sent: this browser has no Web Locks (another tab dropped the kept key). Still unknown. */
  noLocks?: boolean;
}

/** No kept request (another tab dropped it): still unknown. Without Web Locks this browser could not send a new one
 *  either, so it says why. */
export function heldMissing(): HeldResult {
  return commerceRules.buy.hasWebLocks() ? { check: 'unknown' } : { check: 'unknown', noLocks: true };
}

/** A read-only check's answer as the drawer's words: evidence at most, never "failed" or "not sent". */
function holdWord(r: commerce.HoldCheck): Word | undefined {
  if (r.check === 'running') return { k: 'co.checkRunning' };
  if (r.check !== 'unknown' || !r.evidence) return undefined;
  const ev = r.evidence;
  if (ev.kind === 'created') return ev.title ? { k: 'co.checkCreated', v: { title: ev.title, time: formatDateTime(ev.at) } } : { k: 'co.checkCreatedPlain', v: { time: formatDateTime(ev.at) } };
  if (ev.kind === 'paidThrough') return { k: 'co.checkPaid', v: { date: formatDate(ev.until) } };
  if (ev.kind === 'planReached') return { k: 'co.checkPlanReached' };
  if (ev.kind === 'rented') return { k: 'co.checkRented' };
  return { k: 'co.checkReserved', v: { time: formatDateTime(ev.at) } };
}
function heldTargetOf(kind: CheckoutKind, t: Pick<CheckoutTarget, 'item' | 'subId' | 'familyId'> | null | undefined): commerce.HeldPlanTarget {
  return { kind: kind as commerce.AttemptKind, subId: t?.subId ?? null, planId: t?.item ?? null, familyId: t?.familyId ?? null };
}

/**
 * Check again for a held purchase, from what core holds alone: the listing may have left the market (the rented server
 * is no longer for sale; a rotated plan is gone), so nothing here reads the catalogue. Reads only: a rent reads
 * the rentals, a reservation the reservations; either is evidence at most, and the hold stays.
 */
export async function checkHeldPurchase(kind: CheckoutKind, item: string | null | undefined): Promise<HeldResult> {
  if (!item) return { check: 'unknown' };
  const ctx = capture();
  if (kind === 'rent') {
    const r = await commerce.checkRentPending(ctx, item);
    notifyUnknown();
    return { check: 'unknown', word: r === 'active' ? { k: 'co.checkRented' } : undefined };
  }
  if (kind !== 'reserve') return { check: 'unknown' };
  try {
    return { check: 'unknown', word: holdWord(await commerce.checkReserveHold(ctx, item)) };
  } finally {
    notifyUnknown();
  }
}

/**
 * Check again for a held buy, pay or upgrade whose plan or subscription is no longer in the lists: a read only,
 * from core's own record, so nothing here needs the catalogue. It stays unknown, with what the read saw.
 */
export async function checkHeldAttempt(held: UnknownCheckout): Promise<HeldResult> {
  const k = held.target.kind;
  if (k !== 'buy' && k !== 'pay' && k !== 'upgrade') return { check: 'unknown' };
  const t = heldTargetOf(k, held.target);
  // The read goes by target, as core adopts a kept request: it is this request's answer only while the target still
  // adopts this very request (its key). Another kept request of the same target or family is never read in its place:
  // nothing is read, and it stays unknown.
  const adopted = commerce.heldPlanEntry(capture(), t);
  if (adopted && adopted.key !== held.key) return { check: 'unknown' };
  try {
    const r = await (k === 'pay' ? commerce.checkPayHold(capture(), t) : commerce.checkPlanHold(capture(), t));
    return r.check === 'none' ? heldMissing() : { check: 'unknown', word: holdWord(r) };
  } finally {
    notifyUnknown();
  }
}

/**
 * The person's confirmed "Send the same request again" for a held purchase whose listing has gone: a reservation's kept
 * request (same key and term), and only its answer settles it. A rent has nothing to resend.
 */
export async function resendHeldPurchase(kind: CheckoutKind, item: string | null | undefined, shown: ResendShown | null | undefined): Promise<HeldResult> {
  const check = await resendHeldMarket(kind, item, shown);
  // Refused for want of a granted Web Lock (none, or a Locks API that rejects: core's noLocks notice): still unknown, and why.
  if (check === 'noLocks') return { check: 'unknown', noLocks: true };
  // Refused before anything left: still unknown, and the view says this resend sent nothing.
  if (check === 'notSent') return { check: 'unknown', word: { k: 'held.resendNotSent' } };
  return check === 'unknown' && kind === 'reserve' && !commerceRules.buy.hasWebLocks() ? { check, noLocks: true } : { check };
}

/** The held reservation of `item` now, read from core's store: what a held view's resend dialog is opened for. */
export function heldMarketShown(item: string | null | undefined): ResendShown | null {
  const p = item ? commerce.marketPendingFor(capture()).find((x) => x.offer_id === item) : undefined;
  return p ? { key: p.key, maxCents: p.ceiling, sig: commerce.marketPendingSig(p) } : null;
}

// 'notSent': refused before anything left (the kept request changed or vanished, the machine refused the Retry, or core's
// admission refused it); 'unknown': a resend that went out without an answer, or one that cannot be told apart.
async function resendHeldMarket(kind: CheckoutKind, item: string | null | undefined, shown: ResendShown | null | undefined): Promise<HeldCheck | 'noLocks' | 'notSent'> {
  if (!item || kind !== 'reserve') return 'unknown';
  // Core sends a kept reservation only under a granted Web Lock: without one nothing is sent.
  if (!commerceRules.buy.hasWebLocks()) return 'unknown';
  const ctx = capture();
  const pend = commerce.marketPendingFor(ctx).find((p) => p.offer_id === item);
  // Re-read at the confirm: only the kept request the dialog was opened for, unchanged; a replaced or vanished one sends nothing.
  if (!pend || !sameShown(shown, { key: pend.key, maxCents: pend.ceiling, sig: commerce.marketPendingSig(pend) })) return 'notSent';
  // The machine is rebuilt from that record alone (the offer's id; its price and terms were fixed when the key was kept).
  const row = commerceRules.normalizeOfferRow({ id: pend.offer_id, name: pend.name }, 0);
  return new Promise<HeldCheck | 'noLocks' | 'notSent'>((resolve) => {
    let settled = false;
    let posted = false;
    let asked = false;
    let pm: commerce.Purchase | null = null;
    const finish = (r: HeldCheck | 'noLocks' | 'notSent') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pm?.dispose();
      notifyUnknown();
      resolve(r);
    };
    // No answer within 30 s: the resend may have left, and disposing the machine below does not call back a POST it
    // already handed over (core's dispatchPost never checks disposed), so plain unknown, never "not sent".
    const timer = setTimeout(() => finish('unknown'), 30000);
    pm = commerce.createPurchase(row, pend.days, {
      recover: pend,
      onChange: (snap) => {
        if (snap.state === 'posting' || snap.state === 'reconciling') posted = true;
        else if (snap.state === 'confirmed') finish('done');
        // A Retry its admission refused (a deadline another tab kept, no lock, no store): nothing was sent. A refusal
        // for want of a granted lock says so; a send that went out answers plain unknown.
        else if (snap.state === 'indeterminate' && (posted || (asked && !snap.retrying))) finish(posted ? 'unknown' : snap.notice === 'noLocks' ? 'noLocks' : 'notSent');
      },
    });
    // Refused (banned, Retry-After running, owner gone): nothing was replayed, so nothing new is known, and it says so.
    if (!pm.retry()) finish('notSent');
    else asked = true;
  });
}

/** The held buy, pay or upgrade now, read from core's store: what a held view's resend dialog is opened for. */
export function heldAttemptShown(held: UnknownCheckout): ResendShown | null {
  const k = held.target.kind;
  if (k !== 'buy' && k !== 'pay' && k !== 'upgrade') return null;
  // Only the very request the band named (its key): the target adopts the first kept request of its family, which may
  // be another one; then no dialog opens.
  const e = commerce.heldPlanEntry(capture(), heldTargetOf(k, held.target));
  return e && e.key === held.key ? e : null;
}

/**
 * The person's confirmed "Send the same request again" for a held buy, pay or upgrade whose plan or subscription is no
 * longer in the lists: the kept request (same key, same body) from core's own record, re-read at the confirm. A kept
 * request that vanished or changed since the dialog opened sends nothing. Only a definite refusal that is not an intent mismatch
 * proves the purchase did not happen; anything else stays unknown.
 */
export async function resendHeldAttempt(held: UnknownCheckout, shown: ResendShown | null | undefined): Promise<HeldResult> {
  const k = held.target.kind;
  if (k !== 'buy' && k !== 'pay' && k !== 'upgrade') return { check: 'unknown' };
  const t = held.target;
  // Re-read at the confirm: only the kept request the dialog was opened for, unchanged; a replaced or vanished one sends nothing.
  // It must also be the very request the band named (its key): the target adopts the first kept request of its family,
  // which may be another one.
  const now = commerce.heldPlanEntry(capture(), heldTargetOf(k, t));
  // Changed or vanished since the dialog opened: nothing was sent.
  if (!now || now.key !== held.key || !sameShown(shown, now)) return { check: 'unknown', word: { k: 'held.resendNotSent' } };
  const att = commerce.createAttempt(k, {
    plan: k === 'pay' ? undefined : { id: t.item ?? '', family_id: t.familyId },
    sub: t.subId ? { id: t.subId } : undefined,
    title: held.title,
  });
  try {
    // Never a fresh purchase, never another kept request: the machine must have adopted exactly that record (core's claim
    // refuses it again, 'gone', if it vanishes before the send).
    const a = att.snapshot();
    if (!a.pending || a.key !== now.key || a.ceiling !== now.maxCents) return { check: 'unknown', word: { k: 'held.resendNotSent' } };
    const r = await att.confirm(true);
    if (r.ok) {
      // The request may never have reached the server (replayed false): then this resend is the first charge. A charge whose
      // setup failed is still a charge, and its reference is what support needs.
      const c = attemptChange(r, null);
      return { check: 'done', setupFailed: c.data?.setupFailed === true, replayed: r.result.replayed === true, ref: c.data?.ref ?? null };
    }
    // Only a refusal that proves this purchase never happened is "gone". An intent mismatch proves only that this request
    // did not run beside an earlier one, so it stays unknown (may have gone through).
    const intent = /intent|mismatch/i.test(String(r.kind ?? ''));
    if (r.reason === 'noLocks') return { check: 'unknown', noLocks: true };
    // Core says nothing left for this resend (notSent: its claim or another preflight refused it, it timed out before the
    // hand-over, or api() reported it unsent): still unknown, and the view says so.
    if (r.notSent) return { check: 'unknown', word: { k: 'held.resendNotSent' } };
    return { check: r.reason === 'refused' && r.definitive && !intent ? 'gone' : 'unknown' };
  } finally {
    att.dispose();
    notifyUnknown();
  }
}

/** The payment return was seen and dealt with: it must not come back on reload. */
export function dropPaymentReturn(): void {
  if (!__HUB_FIXTURES__) commerce.dropTopupReturn();
}

/** A website "Get" link (?buy=subserver&plan=) captured at boot: the plan it named, once. */
export function takeBuyIntent(): string | null {
  return __HUB_FIXTURES__ ? null : commerce.consumeIntent();
}
