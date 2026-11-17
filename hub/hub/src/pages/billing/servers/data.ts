// The Bare metal view's data: its routes and queries, declared in one place. Live on a real page
// (coreSource over the declared routes), its fixtures under Billing's fixture states. No write is made here: the buy
// button opens Billing's Checkout drawer. Reservations go through core's
// own reservation walk (the classic market's), so their fixtures are core rules that answer each page by offset.
import { capture, commerce, commerceRules, coreSource, meRoute, stringOrEmpty as str, useCore, pageFixtures } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Listing, type Reservation, type ReservationPage, type Term, diskTypesOf } from './logic';

const { stockRoute, offersRoute, reservationsRoute, balancesRoute } = commerce.commerceRoutes;
// One route object per rail: core's own, so a fixture rule for it answers here too.
export const routes = { stock: stockRoute, offers: offersRoute, reservations: reservationsRoute, balances: balancesRoute, me: meRoute } as const;

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec => (x && typeof x === 'object' ? (x as Rec) : {});
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const list = (raw: unknown): unknown[] => {
  const d = rec(raw).data;
  if (!Array.isArray(d)) throw new Error('bad list');
  return d;
};

/** A raw row's disks with their kinds: stock rows under specs.disks.config, offer rows under disks. */
const rawDisks = (raw: unknown): unknown[] => {
  const o = rec(raw);
  const stock = rec(rec(o.specs).disks).config;
  return Array.isArray(stock) ? stock : Array.isArray(o.disks) ? o.disks : [];
};

/** A raw row of either rail as the page's listing (what the stock and offers reads select). */
export function listingOf(kind: 'stock' | 'offer', raw: unknown, i: number): Listing {
  return toListing(kind === 'stock' ? commerceRules.normalizeStockRow(raw, i) : commerceRules.normalizeOfferRow(raw, i), raw);
}

/** A normalised core row as the page's listing. Terms come from the row's own quotes. */
function toListing(r: commerceRules.MarketRow, raw: unknown = null): Listing {
  const terms: Term[] = [];
  for (const day of r.days) {
    const q = commerceRules.quoteFor(r, day);
    if (q && q.totalCents !== null) terms.push({ days: Number(day), priceCents: q.priceCents, feeCents: q.feeCents, totalCents: q.totalCents, holdDays: q.holdDays });
  }
  return {
    id: r.id ?? `${r.kind}-${r.seq}`,
    kind: r.kind,
    name: r.name ?? '',
    country: (r.country ?? '').toUpperCase(),
    city: r.city ?? '',
    datacenter: r.datacenter ?? '',
    cpu: r.model ?? '',
    featured: r.featured,
    stockLeft: r.stockLeft,
    deliveryHours: r.deliveryHours,
    setupMinutes: r.setupMinutes,
    cores: r.cores,
    threads: r.threads,
    ramGb: r.ramGb,
    ramType: r.ramType ?? '',
    diskGb: r.diskGb,
    diskSummary: r.diskSummary ?? '',
    diskTypes: diskTypesOf(rawDisks(raw), r.diskSummary ?? ''),
    disks: r.disks,
    ramMhz: r.ramMhz,
    region: r.region ?? '',
    ipv6: r.ipv6,
    isVm: r.isVm,
    category: r.category,
    bandwidthMbps: r.bandwidthMbps,
    trafficTb: r.trafficTb,
    trafficUnlimited: r.trafficUnlimited,
    ipv4: r.ipv4Count,
    cpuScore: r.cpuScore,
    cpuScoreType: r.cpuScoreType,
    terms,
  };
}

function toReservation(raw: unknown): Reservation {
  const r = rec(raw);
  const snap = rec(r.offer_snapshot);
  const row = Object.keys(snap).length ? commerceRules.normalizeOfferRow(snap, 0) : null;
  const state = r.state === 'fulfilled' || r.state === 'refunded' ? r.state : 'pending';
  const ready = Date.parse(str(r.ready_by));
  const created = Date.parse(str(r.created_at));
  return {
    id: str(r.id),
    name: row?.name ?? '',
    state,
    days: num(r.days),
    paidCents: num(r.total_paid_cents),
    cores: row?.cores ?? null,
    ramGb: row?.ramGb ?? null,
    diskGb: row?.diskGb ?? null,
    readyBy: Number.isFinite(ready) ? ready : null,
    createdAt: Number.isFinite(created) ? created : 0,
    quoted: {
      deliveryHours: num(r.delivery_hours_quoted),
      setupMinutes: num(r.setup_time_minutes_quoted),
      holdDays: num(r.hold_days_quoted),
      rentalCents: num(r.rental_cents),
      setupFeeCents: num(r.setup_fee_cents),
    },
    serverId: str(r.server_id) || null,
    rentalId: str(r.rental_id) || null,
  };
}

// Fixture mode: the Bare metal view's fake answers ride Billing's states under `servers.` names (billing/fixtures.ts
// merges this folder's fixtures), so the merged page answers both views from one state.
// Built only in a fixture build: the ship build (__HUB_FIXTURES__ false) holds no fixture module, and coreSource answers
// from a fallback only there (fixtureModeActive needs __HUB_FIXTURES__).
const servedFixtures = __HUB_FIXTURES__ ? (() => {
  const billingFixtures = pageFixtures('billing')!;
  return {
    useQuery: <T,>(key: string) => billingFixtures.useQuery<T>(`servers.${key}`),
    useMutation: <T, V = void>(key: string) => billingFixtures.useMutation<T, V>(`servers.${key}`),
  };
})() : undefined;

const source = coreSource(
  'market',
  {
    reads: {
      stock: { route: routes.stock, select: (raw) => list(raw).map((r, i) => listingOf('stock', r, i)) },
      offers: { route: routes.offers, select: (raw) => list(raw).map((r, i) => listingOf('offer', r, i)) },
      balance: {
        route: routes.balances,
        select: (raw) => {
          const d = rec(rec(raw).data ?? raw);
          // Wallet schema: general_balance is a dollar string with two decimals ("125.50").
          const general = commerceRules.market.centsFromUsdString(d.general_balance);
          if (general === null) throw new Error('no balance');
          // Renting and reserving spend Referral credit first, then the general wallet,
          // so the order footer compares the total with the sum. A missing or malformed
          // Referral credit counts as 0 (it only ever under-promises); what is owed is never read.
          const referral = commerceRules.market.centsFromUsdString(d.referral_credit) ?? 0;
          return { general, referral, cents: general + referral };
        },
      },
      account: { route: routes.me, select: (raw) => ({ banned: rec(rec(raw).data ?? raw).is_banned === true }) },
    },
  },
  servedFixtures,
);

export interface MarketRead {
  listings: Listing[];
  /** A rail that did not answer: its rows are missing, the other's are shown with a warning. */
  failed: ('stock' | 'offers')[];
}

/** The first read that answered 403 ACCOUNT_BANNED (the account is suspended, whatever the account read says); null
 * when none did. */
export const suspensionOf = (...errors: unknown[]): unknown => errors.find((e) => commerceRules.isAccountBannedError(e)) ?? null;
/** Any read that answered 403 ACCOUNT_BANNED. */
export const anySuspended = (...errors: unknown[]): boolean => suspensionOf(...errors) !== null;

/** The account's suspension as one state: banned when an account state says so or any read was refused 403
 * ACCOUNT_BANNED; `rejection` is the first such refusal (the band's details), null when only an account state says so. */
export interface Suspension {
  banned: boolean;
  rejection: unknown;
}
export function suspendedState(states: readonly (boolean | undefined)[], errors: readonly unknown[]): Suspension {
  const rejection = suspensionOf(...errors);
  return { banned: states.some((b) => b === true) || rejection !== null, rejection };
}

/** What the Bare metal view found: its suspension now, and when every one of its reads last answered clean (its
 * oldest such answer, epoch ms; 0 while any read is on its way, failed or has not answered). */
export interface Finding extends Suspension {
  answeredAt: number;
}
/** The suspension the page holds for one core context (account|realm|generation): `at` is when it was last found. */
export interface Held extends Suspension {
  ctx: string;
  at: number;
}
/** No suspension held. */
export const NOT_HELD: Held = { ctx: '', banned: false, rejection: null, at: 0 };

/**
 * The held suspension after a finding at `now`. A suspension found stays for its context until a finding in which
 * every read answered clean after it was found: a read on its way, a read that failed for another reason and an
 * answer from before it was found prove nothing (the reservations walk forgets its refusal as soon as it reads again,
 * on Check status or a return visit). A finding for another context starts over.
 */
export function holdSuspension(held: Held, ctx: string, x: Finding, now: number): Held {
  const mine = held.ctx === ctx && held.banned;
  if (x.banned) return mine && held.rejection === x.rejection ? held : { ctx, banned: true, rejection: x.rejection, at: now };
  if (mine && !(x.answeredAt > held.at)) return held;
  return held.ctx === ctx && !held.banned ? held : { ...NOT_HELD, ctx };
}

/** When a TanStack read last answered clean (epoch ms), or 0 while it is on its way, failed or has no answer. */
export const cleanAt = (q: { data: unknown; error: unknown; isFetching: boolean; dataUpdatedAt: number }): number =>
  q.data === undefined || q.error || q.isFetching ? 0 : q.dataUpdatedAt;

/** The account state: banned accounts see a band and no table. */
export function useAccount() {
  return source.useQuery<{ banned: boolean }>('account');
}

/** In-stock servers and offers, merged. One rail failing keeps the other with a warning. */
export function useListings() {
  const stock = source.useQuery<Listing[]>('stock');
  const offers = source.useQuery<Listing[]>('offers');
  const data = useMemo<MarketRead | undefined>(() => {
    if (stock.isPending || offers.isPending) return undefined;
    const failed: MarketRead['failed'] = [];
    if (stock.error) failed.push('stock');
    if (offers.error) failed.push('offers');
    if (failed.length === 2) return undefined;
    return { listings: [...(stock.data ?? []), ...(offers.data ?? [])], failed };
  }, [stock.data, offers.data, stock.error, offers.error, stock.isPending, offers.isPending]);
  const bothFailed = !!stock.error && !!offers.error;
  const { refetch: refetchStock } = stock;
  const { refetch: refetchOffers } = offers;
  const refetchRail = useCallback((rail: Rail) => (rail === 'stock' ? refetchStock() : refetchOffers()), [refetchStock, refetchOffers]);
  return {
    data,
    /** When both rails last answered clean (the older), 0 while either is on its way or failed. */
    answeredAt: Math.min(cleanAt(stock), cleanAt(offers)),
    /** A rail's 403 ACCOUNT_BANNED rejection (the suspended band's details); null when neither rail answered so. */
    suspension: suspensionOf(stock.error, offers.error),
    isPending: stock.isPending || offers.isPending,
    /** Both rails failed: the stock rejection stands for both (a kit error surface shows one rejection). */
    error: bothFailed ? stock.error : null,
    /** One rail's rejection while the other still answers (the warn band's details); null otherwise. */
    railError: bothFailed ? null : (stock.error ?? offers.error ?? null),
    refetch: () => Promise.all([stock.refetch(), offers.refetch()]),
    /** Each rail's clean answer on its own (railAnswer): what usePairedListings pairs into one read. */
    railAnswer: { stock: railAnswer(stock), offers: railAnswer(offers) },
    /** Read one rail again (usePairedListings finishes a read cycle with it). */
    refetchRail,
  };
}

/** The market's two rails. */
export type Rail = 'stock' | 'offers';

/**
 * A rail's clean answer as an identity: its stamp (cleanAt), its data (a new object whenever the answer's content
 * changed), its failure count (errorUpdateCount: a read that failed since, then answered clean, is a new answer even
 * when stamp and data repeat) and whether it answered since this read was mounted (`mounted`). Null while the rail is
 * on its way, failed or has not answered. Never ordered by the clock: two answers can share a millisecond and the
 * clock can step back. A read cancelled back to its cached answer changes none of these: it is not an answer.
 */
export interface RailAnswer {
  at: number;
  data: unknown;
  errors: number;
  mounted: boolean;
}
export const railAnswer = (q: { data: unknown; error: unknown; isFetching: boolean; dataUpdatedAt: number; errorUpdateCount: number; isFetchedAfterMount: boolean }): RailAnswer | null => {
  const at = cleanAt(q);
  return at ? { at, data: q.data, errors: q.errorUpdateCount, mounted: q.isFetchedAfterMount } : null;
};
const sameAnswer = (a: RailAnswer, b: RailAnswer): boolean => a.at === b.at && a.data === b.data && a.errors === b.errors;

/** The two rails' answers of one whole market read: both answered in the same read cycle. */
export interface MarketPair {
  stock: RailAnswer;
  offers: RailAnswer;
}

/**
 * The pair after the rails' answers `s` and `o`: a new pair once both rails have answered again since the last pair
 * (one read cycle), else the last pair. The first pair needs both rails answered since this read was mounted: cached
 * answers carry no proof of one cycle. A rail read again alone is half a cycle, never a pair.
 */
export function nextPair(last: MarketPair | null, s: RailAnswer | null, o: RailAnswer | null): MarketPair | null {
  if (!s || !o) return last;
  if (!last) return s.mounted && o.mounted ? { stock: s, offers: o } : null;
  return !sameAnswer(s, last.stock) && !sameAnswer(o, last.offers) ? { stock: s, offers: o } : last;
}

/**
 * The rails to read again so a cycle completes, both answers clean: before a first pair, each rail not answered since
 * mount (a read paused at mount, say offline); after one, the rail still on the pair while the other answered again.
 */
export function railsToRead(pair: MarketPair | null, s: RailAnswer | null, o: RailAnswer | null): Rail[] {
  if (!s || !o) return [];
  if (!pair) return (['stock', 'offers'] as const).filter((r) => !(r === 'stock' ? s : o).mounted);
  const ms = !sameAnswer(s, pair.stock);
  const mo = !sameAnswer(o, pair.offers);
  return ms && !mo ? ['offers'] : mo && !ms ? ['stock'] : [];
}

/** The key a read the band asked for is filed under before the first pair. */
const NO_PAIR = {} as MarketPair;

/**
 * useListings for a whole-market fact (the Bare metal band): `paired` only while both rails' answers are one read cycle
 * (nextPair). A rail read again alone (its own refetch) never joins the other rail's older answer, whatever the clock
 * says: until the other rail has answered again, which this hook asks for once per pair (railsToRead), nothing is
 * paired; a cycle whose other rail fails or is cancelled stays unpaired (fails closed: the band then says only what
 * bare metal is). useListings' own answeredAt is unchanged (the Bare metal view and the suspension hold read it).
 */
export function usePairedListings() {
  const list = useListings();
  const { stock: s, offers: o } = list.railAnswer;
  const [pair, setPair] = useState<MarketPair | null>(null);
  const next = nextPair(pair, s, o);
  // Derived from the rails' answers during render (React's state from earlier renders): no render shows a stale pair.
  if (next !== pair) setPair(next);
  const read = railsToRead(next, s, o).join(' ');
  const asked = useRef<MarketPair | null>(null);
  const { refetchRail } = list;
  useEffect(() => {
    const of = next ?? NO_PAIR;
    if (!read || asked.current === of) return;
    asked.current = of;
    for (const rail of read.split(' ') as Rail[]) void refetchRail(rail);
  }, [read, next, refetchRail]);
  const paired = !!next && !!s && !!o && sameAnswer(s, next.stock) && sameAnswer(o, next.offers);
  return { ...list, paired };
}

/** The wallet in cents: the general balance, Referral credit (0 when none) and what a server purchase can spend
 * (their sum). The query fails when the general balance cannot be read. */
export interface MarketBalance {
  general: number;
  referral: number;
  cents: number;
}
/** How long a balance answer stands while the view stays open: past it the answer is not known and is read again
 * (core reads are stale at once, but nothing reads a mounted, idle read again by itself). */
export const BALANCE = { freshMs: 30_000 };

/** The balance only while its answer is current: a failed refetch (TanStack keeps the old answer in `data`), a read
 * on its way and an answer past BALANCE.freshMs (`expired`) are not known, so no old amount and no enough/short
 * verdict is shown for them. A stale answer cached from an earlier visit is read again when the view mounts, so it is
 * a read on its way until it is answered. */
export function knownBalance<T>(q: { data: T | undefined; error: unknown; isFetching: boolean }, expired: boolean): T | undefined {
  return q.error || q.isFetching || expired ? undefined : q.data;
}

export function useBalance() {
  const q = source.useQuery<MarketBalance>('balance');
  // The answer that outlived BALANCE.freshMs (its dataUpdatedAt): it is not known from then, and read again once.
  // A new answer arms the bound again; a read again that fails leaves the error, with nothing armed.
  const [expired, setExpired] = useState(0);
  const at = q.data === undefined ? 0 : q.dataUpdatedAt;
  const { refetch } = q;
  useEffect(() => {
    if (!at || expired === at) return;
    const timer = setTimeout(
      () => {
        setExpired(at);
        void refetch();
      },
      Math.max(0, at + BALANCE.freshMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [at, expired, refetch]);
  return { ...q, data: knownBalance(q, at !== 0 && expired === at) };
}

type Walk = commerce.ResWalk;
interface ResState {
  /** The core context the walk belongs to: another account, realm or generation starts a new walk. */
  key: string;
  walk: Walk | null;
  error: unknown;
  moreError: unknown;
  /** A poll cycle refused 403 ACCOUNT_BANNED (core stops the cycle). It stays until the walk starts again (Check
   * status, a return visit, another context), so the suspension it proves is never dropped by a later clean cycle. */
  pollError: unknown;
  busy: 'first' | 'more' | null;
  /** Bumped whenever the walk (mutated in place by core) changed. */
  rev: number;
  /** When a read of the walk (its first, a Load more) last answered (epoch ms); 0 before. */
  at: number;
}

/**
 * Reservations through core's walk, as the classic market read them: pages of commerce.RES.page, the first
 * RES.maxAuto at once, then one more per more() (Load more). A short page ends the older tail; a Load more after
 * it reads the head for rows added meanwhile, and a walk that cannot converge starts again. A row's state only
 * advances (a stale answer never shows a fulfilled or refunded reservation as pending). While any row is pending,
 * core polls it every RES.intervalMs. One walk per core context.
 */
export function useReservations() {
  const core = useCore();
  const key = `${core.account ?? ''}|${core.realm}|${core.gen}`;
  const [st, setSt] = useState<ResState>({ key, walk: null, error: null, moreError: null, pollError: null, busy: 'first', rev: 0, at: 0 });
  // The walk run that may still write: a result from an older run (another context, a Refresh) is dropped.
  const run = useRef(0);
  // The run whose poll cycle is out: the next cycle is armed only once it settles, so cycles never overlap.
  const polling = useRef<number | null>(null);
  const cur = st.key === key ? st : null;

  const start = useCallback(() => {
    const mine = ++run.current;
    setSt({ key, walk: null, error: null, moreError: null, pollError: null, busy: 'first', rev: 0, at: 0 });
    commerce.walkReservations(capture()).then(
      (walk) => mine === run.current && setSt((s) => ({ ...s, walk, busy: null, rev: s.rev + 1, at: Date.now() })),
      (error: unknown) => mine === run.current && setSt((s) => ({ ...s, error, busy: null })),
    );
  }, [key]);

  useEffect(() => {
    const runs = run;
    start();
    return () => {
      runs.current++;
    };
  }, [start]);

  const walk = cur?.walk ?? null;
  const more = useCallback(() => {
    if (!walk || cur?.busy) return;
    if (walk.restart) return start();
    const mine = run.current;
    setSt((s) => ({ ...s, busy: 'more', moreError: null }));
    commerce.walkReservations(capture(), walk).then(
      () => mine === run.current && setSt((s) => ({ ...s, busy: null, rev: s.rev + 1, at: Date.now() })),
      // Pages read before the failing one are in the walk already: the revision publishes them with the warning.
      (moreError: unknown) => mine === run.current && setSt((s) => ({ ...s, busy: null, moreError, rev: s.rev + 1 })),
    );
  }, [walk, cur?.busy, start]);

  // Pending rows: one poll cycle every RES.intervalMs, never overlapping; a failed cycle tries again next time.
  const pending = walk ? commerce.resPendingCount(walk) : 0;
  useEffect(() => {
    const mine = run.current;
    // A render while this run's cycle is out (a Load more landing) arms nothing: the cycle's own end does.
    if (!walk || pending === 0 || polling.current === mine) return;
    const timer = setTimeout(() => {
      polling.current = mine;
      const done = (err: unknown) => {
        if (polling.current === mine) polling.current = null;
        if (mine === run.current) setSt((s) => ({ ...s, pollError: anySuspended(err) ? err : s.pollError, rev: s.rev + 1 }));
      };
      // A cycle refused 403 ACCOUNT_BANNED keeps that refusal: the view's suspension (band, hold) reads it.
      commerce.pollReservations(capture(), walk).then(() => done(null), done);
    }, commerce.RES.intervalMs);
    return () => clearTimeout(timer);
  }, [walk, pending, cur?.rev]);

  const rev = cur?.rev ?? 0;
  const data = useMemo<ReservationPage | undefined>(() => {
    if (!walk) return undefined;
    const rows = walk.rows.map(toReservation).filter((r) => r.id);
    return { rows, total: Math.max(walk.total ?? rows.length, rows.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- core mutates the walk in place; rev says when
  }, [walk, rev]);
  return {
    data,
    isPending: !cur || (cur.busy === 'first' && !cur.walk),
    /** The first read failed: the list cannot be shown. */
    error: cur?.walk ? null : (cur?.error ?? null),
    /** A Load more failed (the rows read stay); more() tries it again. */
    moreError: cur?.moreError ?? null,
    /** A poll cycle's 403 ACCOUNT_BANNED refusal, for the suspension only (the rows read stay). */
    pollError: cur?.pollError ?? null,
    /** When the walk's reads last answered clean (epoch ms), 0 while one is on its way or the last one failed. */
    answeredAt: cur && cur.walk && !cur.busy && !cur.error && !cur.moreError && !cur.pollError ? cur.at : 0,
    hasMore: !!walk && (walk.more || walk.restart),
    loadingMore: cur?.busy === 'more',
    more,
    refetch: async () => start(),
  };
}
