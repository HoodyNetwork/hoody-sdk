// The billing page's rules without DOM or network.
// Money rules, keys and the C9 outcome machines are hub-core's; this file
// only decides what the page shows. Sentences leave as { k, v } words, never as server prose.
import { commerceRules, errorInfo, readLanes, type LaneReading } from '@core';
import { formatDate, formatDateTime, formatStorage } from '@kit/format';
import { type PaidPlace, placeName } from './plans-regions';
import type { AiTier, BonusResult, Key, PlanTerms, RawBonus, RawPlan, RawSub, RawUsage, ReturnState, Tone, TopUpMethod, Vars, Word } from './types';

const USD = /^(0|[1-9]\d{0,12})\.\d{2}$/;
const HEX24 = /^[0-9a-f]{24}$/;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string => (typeof v === 'string' && v ? v.slice(0, max) : '');
const word = (k: Key, v?: Vars): Word => (v ? { k, v } : { k });

// ── Money and dates ─────────────────────────────────────────────────────────────────

/** Whole dollars with thousands separators ("1234" is "1,234"). */
const grouped = (whole: string): string => whole.replace(/\B(?=(\d{3})+$)/g, ',');

/** An amount as the API sends it: a USD string ("12.50"). Anything else is a dash. (Core's, shared with Referrals.) */
export const usd = commerceRules.usdText;

/** Integer cents. Anything else is a dash. */
export function cents(c: unknown): string {
  if (!isCount(c)) return '—';
  const f = c % 100;
  return `$${grouped(String((c - f) / 100))}.${f < 10 ? '0' : ''}${f}`;
}

/** USD string to cents; null when it is not an amount. */
export function centsFromUsd(s: unknown): number | null {
  if (typeof s !== 'string' || !USD.test(s)) return null;
  const dot = s.indexOf('.');
  return parseInt(s.slice(0, dot), 10) * 100 + parseInt(s.slice(dot + 1), 10);
}

/** What a server purchase can spend, split as the server spends it (Referral credit first, then the wallet). */
export interface Spend {
  /** The general wallet; null when its amount could not be read. */
  generalCents: number | null;
  /** Referral credit; 0 when the answer has none or it is not an amount (it only ever under-promises, never a guess). */
  referralCents: number;
  /** general + Referral credit; null while the general wallet is unknown. */
  spendableCents: number | null;
}

/**
 * A server purchase spends Referral credit first, then the general wallet.
 * Reads the balances answer only: what is owed is never added or subtracted, and the
 * Referrals page's pending credit is never spendable.
 */
export function spendOf(b: { general: string; referral?: string | null } | null | undefined): Spend {
  const generalCents = b ? centsFromUsd(b.general) : null;
  const referralCents = (b && centsFromUsd(b.referral)) || 0;
  return { generalCents, referralCents, spendableCents: generalCents === null ? null : generalCents + referralCents };
}

export function day(iso: unknown): string | null {
  const d = typeof iso === 'string' ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? formatDate(d) : null;
}

/** A date in UTC, for the moments the server counts in UTC (hold deadlines). */
function utcDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(d)} UTC`;
}

// The AI lane rules live in core (core/ai-usage.ts): Billing's usage table and the Servers cards read one rule.
export { LANES, clock, laneLevel, laneWords, type Lane, type LaneReading } from '@core';

// ── GitHub bonus ────────────────────────────────────────────────────────────────────

const BONUS_END = new Set(['granted', 'already_claimed', 'identity_claimed_elsewhere', 'offer_ended', 'not_linked']);
const BONUS_MSG: Record<string, Key> = {
  granted: 'bonus.ghBonusGranted',
  already_claimed: 'bonus.ghBonusDup',
  identity_claimed_elsewhere: 'bonus.ghBonusOtherAccount',
  not_linked: 'bonus.ghBonusNotLinkedShort',
  offer_ended: 'bonus.ghBonusEnded',
  retry: 'bonus.ghBonusRetry',
  rate_limited: 'bonus.ghBonusRateLimited',
};

function bonusMsg(res: BonusResult): Word {
  const k = BONUS_MSG[res.result] ?? 'bonus.ghBonusError';
  return res.result === 'granted' ? word(k, { amount: usd(res.amount_usd) }) : word(k);
}

export interface BonusView {
  badge: { tone: Tone; word: Word } | null;
  lines: Word[];
  note?: Word | null;
  user?: string;
  claim?: boolean;
  retry?: boolean;
  cooling?: boolean;
  /** The claim may have gone through: the one action is a read-back, never a second claim. */
  unknown?: boolean;
}

/** The GitHub bonus card. null: draw nothing, an offer that can only be refused is noise. */
export function bonusView(st: RawBonus | null | undefined, res?: BonusResult | null): BonusView | null {
  if (!st || typeof st !== 'object') return null;
  const user = str(st.github_username, 39);
  const r = res?.result;
  if (st.claimed === true) {
    const c = st.claim ?? {};
    const amt = c.amount_usd ? usd(c.amount_usd) : null;
    const when = day(c.at);
    return {
      badge: {
        tone: 'ok',
        word: word(r === 'granted' ? 'bonus.ghBonusBadgeAdded' : 'bonus.ghBonusBadgeClaimed'),
      },
      lines: [
        amt && when
          ? word('bonus.ghBonusClaimedOn', { amount: amt, date: when })
          : amt
            ? word('bonus.ghBonusGranted', { amount: amt })
            : word('bonus.ghBonusClaimed'),
      ],
    };
  }
  if (!st.enabled) return null;
  if (st.identity_claimed_elsewhere) {
    return {
      badge: { tone: 'neutral', word: word('bonus.ghBonusBadgeUnavailable') },
      lines: [user ? word('bonus.ghBonusOtherAccountNamed', { user }) : word('bonus.ghBonusOtherAccount')],
    };
  }
  if (r && BONUS_END.has(r)) {
    const won = r === 'granted' || r === 'already_claimed';
    const badge: Key =
      r === 'granted'
        ? 'bonus.ghBonusBadgeAdded'
        : r === 'already_claimed'
          ? 'bonus.ghBonusBadgeClaimed'
          : r === 'offer_ended'
            ? 'bonus.ghBonusBadgeEnded'
            : 'bonus.ghBonusBadgeUnavailable';
    return {
      badge: { tone: won ? 'ok' : 'neutral', word: word(badge) },
      lines: [bonusMsg(res as BonusResult)],
    };
  }
  if (!st.github_linked) return null;
  const failed = r === 'retry' || r === 'rate_limited' || r === 'error';
  return {
    badge: null,
    lines: [word('bonus.ghBonusOffer', { amount: usd(st.amount_usd) })],
    note: failed ? bonusMsg(res as BonusResult) : null,
    user,
    claim: true,
    retry: failed,
    cooling: r === 'rate_limited',
    unknown: r === 'retry',
  };
}

/** The amount of an open bonus offer, for the wallet card's headline. */
export function bonusAmount(st: RawBonus | null | undefined): string {
  return usd(st?.amount_usd);
}

// ── Payment return ──────────────────────────────────────────────────────────────────

export interface ReturnView {
  tone: Tone;
  word: Word;
  /** "Check again" is offered. */
  refresh: boolean;
  /** The stash goes away (received, failed, review); the others survive a reload. */
  terminal: boolean;
  busy?: boolean;
}

export function returnView(r: ReturnState | null | undefined): ReturnView {
  switch (r?.state) {
    case 'received':
      return {
        tone: 'ok',
        word: word('ret.received'),
        refresh: false,
        terminal: true,
      };
    case 'review':
      return {
        tone: 'warn',
        word: word(r.credited ? 'ret.reviewCredited' : 'ret.review'),
        refresh: false,
        terminal: true,
      };
    case 'failed':
      return {
        tone: 'danger',
        word: word('ret.failed'),
        refresh: false,
        terminal: true,
      };
    case 'cancelled':
      return {
        tone: 'info',
        word: word('ret.cancelled'),
        refresh: true,
        terminal: false,
      };
    case 'processing':
      return {
        tone: 'info',
        word: word('ret.processing'),
        refresh: true,
        terminal: false,
      };
    case 'unverified':
      return {
        tone: 'warn',
        word: word('ret.unverified'),
        refresh: true,
        terminal: false,
      };
    default:
      return {
        tone: 'info',
        word: word('ret.checking'),
        refresh: false,
        terminal: false,
        busy: true,
      };
  }
}

// ── Subscriptions ───────────────────────────────────────────────────────────────────

const ORDER: Record<string, number> = {
  held: 0,
  past_due: 1,
  provisioning: 2,
  delivery_failed: 3,
  change_stuck: 4,
  active: 5,
  wiping: 6,
  terminated: 8,
  host_wiped: 8,
};
const TOGGLE = new Set(['provisioning', 'active']);
const BUSY = new Set(['provisioning', 'wiping']);

export type PayKind = 'pay' | 'retry' | null;

/** Tone and "Pay now" kind of a subscription state (no words). */
export function cardView(sub: Pick<RawSub, 'state' | 'delete_at' | 'active_operation_id'>): { tone: Tone | 'busy' | 'muted'; pay: PayKind } {
  const op = !!sub.active_operation_id;
  switch (sub.state) {
    case 'provisioning':
      return { tone: 'busy', pay: null };
    case 'active':
      return { tone: 'ok', pay: null };
    case 'past_due':
      return op ? { tone: 'busy', pay: null } : { tone: 'warn', pay: 'pay' };
    case 'held':
      if (sub.delete_at === null) return op ? { tone: 'busy', pay: null } : { tone: 'warn', pay: 'retry' };
      return { tone: 'danger', pay: 'pay' };
    case 'wiping':
      return { tone: 'danger', pay: null };
    case 'terminated':
    case 'host_wiped':
      return { tone: 'muted', pay: null };
    case 'delivery_failed':
    case 'change_stuck':
      return { tone: 'warn', pay: null };
    default:
      return { tone: 'muted', pay: null };
  }
}

const ST: Record<string, Key> = {
  provisioning: 'subs.stProvisioning',
  active: 'subs.stActive',
  wiping: 'subs.stWiping',
  terminated: 'subs.stEnded',
  host_wiped: 'subs.stEnded',
  delivery_failed: 'subs.stFailed',
  change_stuck: 'subs.stStuck',
};

/** The state in words. `short` is the one-word chip text; `long` the full sentence. */
export function stateWords(sub: Pick<RawSub, 'state' | 'delete_at' | 'active_operation_id' | 'auto_renew'>): Word {
  const op = !!sub.active_operation_id;
  switch (sub.state) {
    case 'past_due':
      return word(!op ? 'subs.stPastDue' : sub.auto_renew === false ? 'subs.stStoppingOff' : 'subs.stStopping');
    case 'held': {
      if (sub.delete_at === null) return word(op ? 'subs.stResuming' : 'subs.stResumeFailed');
      const when = utcDate(sub.delete_at);
      return when ? word('subs.stHeld', { date: when }) : word('subs.stHeldNoDate');
    }
    default:
      return word(ST[sub.state] ?? 'subs.stOther');
  }
}

/** One word for the state chip; the long sentence goes in the row's second line or tooltip. */
export function stateChip(sub: Pick<RawSub, 'state' | 'delete_at' | 'active_operation_id'>): Word {
  const op = !!sub.active_operation_id;
  switch (sub.state) {
    case 'provisioning':
      return word('subs.chipSettingUp');
    case 'active':
      return word('subs.chipActive');
    case 'past_due':
      return word(op ? 'subs.chipStopping' : 'subs.chipUnpaid');
    case 'held':
      return word(sub.delete_at === null ? (op ? 'subs.chipResuming' : 'subs.chipResumeFailed') : 'subs.chipOnHold');
    case 'wiping':
      return word('subs.chipDeleting');
    case 'terminated':
    case 'host_wiped':
      return word('subs.chipEnded');
    case 'delivery_failed':
      return word('subs.chipSetupFailed');
    case 'change_stuck':
      return word('subs.chipFinishing');
    default:
      return word('subs.chipUnavailable');
  }
}

export interface PlanInfo {
  title: string;
  priceCents: number | null;
  holdDays: number | null;
}

function planTitle(p: (Pick<RawPlan, 'text'> & { type?: string }) | null | undefined): string {
  const t = p?.text ?? {};
  return str(t.title, 120) || str(t.type_label, 120) || str(p?.type, 120);
}

export function planIndex(plans: readonly RawPlan[] | null | undefined): Record<string, PlanInfo> {
  const idx: Record<string, PlanInfo> = Object.create(null) as Record<string, PlanInfo>;
  for (const p of plans ?? []) {
    if (!p || typeof p.id !== 'string' || !p.id) continue;
    idx[p.id] = {
      title: planTitle(p),
      priceCents: isCount(p.price_cents_per_month) ? p.price_cents_per_month : null,
      holdDays: isCount(p.hold_days) ? p.hold_days : null,
    };
  }
  return idx;
}

/** The subscription's own plan terms first, the catalogue by that exact version second. */
export function infoFor(sub: RawSub, idx: Record<string, PlanInfo>): PlanInfo {
  const own: PlanTerms | null = sub.plan && typeof sub.plan === 'object' ? sub.plan : null;
  const cat = sub.plan_id !== undefined && Object.prototype.hasOwnProperty.call(idx, sub.plan_id) ? idx[sub.plan_id] : undefined;
  return {
    title: (own && typeof own.title === 'string' && own.title) || cat?.title || '',
    priceCents: own && isCount(own.price_cents_per_month) ? own.price_cents_per_month : (cat?.priceCents ?? null),
    holdDays: own && isCount(own.hold_days) ? own.hold_days : (cat?.holdDays ?? null),
  };
}

const PAID_NAME = /^paid-[0-9a-f]{24}$/;

/** The server's name for a row; a bare machine id shows its last 8 characters only. */
export function hostLabel(sub: Pick<RawSub, 'server_name' | 'server_id' | 'id'>): string {
  if (typeof sub.server_name === 'string' && sub.server_name)
    return PAID_NAME.test(sub.server_name) ? `#${sub.server_name.slice(-8)}` : sub.server_name.slice(0, 80);
  return `#${String(sub.server_id || sub.id).slice(-8)}`;
}

/** Billing's reading of core's upgrade gate (active, no change running, inside a paid period): ok, busy, or not offered (period ended or another state). */
export function upgradeState(sub: RawSub | null | undefined, now: number = Date.now()): 'ok' | 'busy' | null {
  const g = commerceRules.upgradeGate(sub, now);
  return g === 'ok' || g === 'busy' ? g : null;
}

export interface SubRow {
  id: string;
  serverId: string | null;
  title: string;
  host: string;
  country: string | null;
  /** Where the server is ("Frankfurt, Germany"), from the subscription's own region; null when it names none. */
  place: string | null;
  tone: Tone | 'busy' | 'muted';
  chip: Word;
  words: Word;
  /** Paid until / Renews / Runs until / Unpaid since, with the date. */
  dates: Word | null;
  priceCents: number | null;
  holdDays: number | null;
  /** The auto-renew switch applies (the renewal worker selects only provisioning and active). */
  renewable: boolean;
  renewOn: boolean;
  /** A row the page re-reads while it is shown. */
  busy: boolean;
  pay: PayKind;
  upgrade: 'ok' | 'busy' | null;
}

/** Where a subscription's server is, as the API sent it; null when it names no region. */
export const subPlace = (sub: Pick<RawSub, 'region'> | null | undefined): PaidPlace | null => commerceRules.paidPlace(sub?.region);
/** The same as words ("Frankfurt, Germany"), or null. */
export const subPlaceName = (sub: Pick<RawSub, 'region'> | null | undefined): string | null => {
  const p = subPlace(sub);
  return p ? placeName(p) : null;
};

export function subRow(sub: RawSub, idx: Record<string, PlanInfo>, now: number = Date.now()): SubRow {
  const info = infoFor(sub, idx);
  const view = cardView(sub);
  const pd = day(sub.paid_through);
  let dates: Word | null = null;
  if (pd && TOGGLE.has(sub.state))
    dates = word(sub.auto_renew === false ? 'subs.stops' : 'subs.renews', {
      date: pd,
    });
  else if (pd && (sub.state === 'held' || sub.state === 'past_due'))
    dates = word(sub.state === 'held' && sub.delete_at === null ? 'subs.paidUntil' : 'subs.unpaidSince', { date: pd });
  const up = upgradeState(sub, now);
  return {
    id: sub.id,
    serverId: sub.server_id ?? null,
    title: str(info.title, 120),
    host: hostLabel(sub),
    // The flag is the region's own country when the subscription names its region.
    country: (subPlace(sub)?.country || sub.country) ?? null,
    place: subPlaceName(sub),
    tone: view.tone,
    chip: stateChip(sub),
    words: stateWords(sub),
    dates,
    priceCents: info.priceCents,
    holdDays: info.holdDays,
    renewable: TOGGLE.has(sub.state) && typeof sub.auto_renew === 'boolean',
    renewOn: sub.auto_renew === true,
    busy: BUSY.has(sub.state) || !!sub.active_operation_id,
    pay: view.pay,
    upgrade: up,
  };
}

/** Rows ordered by what needs attention first (held, unpaid, setting up ... ended). */
export function subRows(subs: readonly RawSub[], plans: readonly RawPlan[] | null | undefined, now: number = Date.now()): SubRow[] {
  const idx = planIndex(plans);
  return subs
    .filter((s) => s && typeof s.id === 'string' && s.id && typeof s.state === 'string')
    .slice()
    .sort((a, b) => (ORDER[a.state] ?? 7) - (ORDER[b.state] ?? 7))
    .map((s) => subRow(s, idx, now));
}

/** The servers on hold that have something to press: Pay now, or Start it again. A held server with a change running has nothing to press yet. */
export function heldRows(subs: readonly RawSub[], plans: readonly RawPlan[] | null | undefined, now: number = Date.now()): SubRow[] {
  return subRows(subs.filter((s) => s?.state === 'held'), plans, now).filter((r) => r.pay);
}

/** A handle this long is a whole id: it names the subscription with that id or none, never one whose id ends with it (a
 *  whole-id link never opens another subscription). Subscription ids are 24 characters. */
const WHOLE_ID_MIN = 24;

/** The subscription a pay or upgrade link names: only by its whole id (every link the hub makes carries it).
 *  A shorter handle names none here: an ending may name another subscription once the list changes. */
export function subByWholeId(subs: readonly RawSub[] | null | undefined, id: string | null | undefined): RawSub | null {
  return id && id.length >= WHOLE_ID_MIN ? ((subs ?? []).find((s) => s.id === id) ?? null) : null;
}

/** A link handle shorter than a whole id: an old short link, which no checkout opens by (it reads "can't tell"). */
export function subHandleShort(id: string | null | undefined): boolean {
  return !!id && id.length < WHOLE_ID_MIN;
}

/** The short handle of a subscription for URLs: the last 8 characters (never the whole id). Pay and upgrade links carry
 *  the whole id instead: a shared ending names neither, and an ending can name another
 *  subscription once the list changes. */
export function subHandle(id: string): string {
  return id.slice(-8);
}

/** True when a handle's ending belongs to more than one subscription, so it names none of them. */
export function subHandleShared(subs: readonly RawSub[] | null | undefined, handle: string | null | undefined): boolean {
  return subsNamed(subs, handle).length > 1;
}

function subsNamed(subs: readonly RawSub[] | null | undefined, handle: string | null | undefined): readonly RawSub[] {
  if (!handle) return [];
  const list = subs ?? [];
  const exact = list.find((s) => s.id === handle);
  if (exact) return [exact];
  return handle.length >= 6 && handle.length < WHOLE_ID_MIN ? list.filter((s) => s.id.endsWith(handle)) : [];
}

/** The list is read again while a row is changing (setting up, stopping, resuming, upgrading). */
export function anyBusy(rows: readonly SubRow[]): boolean {
  return rows.some((r) => r.busy || r.upgrade === 'busy');
}

// ── Plans ───────────────────────────────────────────────────────────────────────────

export function tierOf(p: { ai_tier?: string } | null | undefined): AiTier | null {
  const t = p?.ai_tier;
  return t === 'free' || t === 'plus' || t === 'pro' || t === 'bare_metal' ? t : null;
}

function multOf(p: { resources?: { ai_multiplier?: number } } | null | undefined): number | null {
  const m = p?.resources?.ai_multiplier;
  return isCount(m) && m >= 1 ? m : null;
}

export interface SpecRow {
  id: commerceRules.PlanFactId;
  label: Key;
  /** A number with its unit, or a word when the value needs words (disk read and write that differ). */
  value: string | Word;
  /** Memory and disk only: the catalogue's own size in GB behind `value`, for a reader that needs the number (the Plans
   *  "Next" hint leaves a memory of 0 out), never the formatted text. */
  gb?: number;
}

const FACT_LABEL: Record<commerceRules.PlanFactId, Key> = {
  cores: 'buy.resCpu',
  ram: 'buy.resRam',
  disk: 'buy.resDisk',
  computers: 'buy.resComputers',
  io: 'buy.resDiskIo',
  net: 'buy.resNetwork',
  snapshots: 'buy.resSnapshots',
  aliases: 'buy.resAliases',
  boturls: 'buy.resBotUrls',
  ai: 'buy.resAi',
};

/**
 * The comparison rows one plan has: core's planFacts (the Market reads the same list), in its order, with Billing's
 * labels. A field the API left out is left out.
 */
export function planRows(p: RawPlan): SpecRow[] {
  return commerceRules.planFacts(p).map((f): SpecRow => {
    const label = FACT_LABEL[f.id];
    switch (f.id) {
      // Sizes by the kit's formatStorage, the words the Market uses for the same catalogue (1024 GB reads 1 TB).
      case 'ram':
      case 'disk':
        return { id: f.id, label, value: formatStorage(f.value), gb: f.value };
      case 'io':
        return { id: f.id, label, value: f.write === undefined ? `${f.value} MiB/s` : word('buy.resDiskIoSplit', { r: f.value, w: f.write }) };
      case 'net':
        return { id: f.id, label, value: `${f.value} Mbps` };
      case 'ai':
        return { id: f.id, label, value: `×${f.value}` };
      default:
        return { id: f.id, label, value: String(f.value) };
    }
  });
}

export interface PlanCard {
  id: string;
  family: string;
  title: string;
  label: string;
  tier: AiTier | null;
  mult: number | null;
  priceCents: number | null;
  computers: number | null;
  desc: string;
  features: string[];
  holdDays: number | null;
  rows: SpecRow[];
}

export function planCard(p: RawPlan): PlanCard {
  const t = p.text ?? {};
  const label = str(t.type_label, 60);
  const title = planTitle(p);
  return {
    id: p.id,
    family: p.family_id,
    title,
    label: label && label !== title ? label : '',
    tier: tierOf(p),
    mult: multOf(p),
    priceCents: isCount(p.price_cents_per_month) ? p.price_cents_per_month : null,
    computers: isCount(p.resources?.max_computers) ? (p.resources?.max_computers ?? null) : null,
    desc: str(t.description, 600),
    features: Array.isArray(t.features)
      ? t.features
          .filter((f) => typeof f === 'string' && f)
          .slice(0, 12)
          .map((f) => f.slice(0, 200))
      : [],
    holdDays: isCount(p.hold_days) ? p.hold_days : null,
    rows: planRows(p),
  };
}

/** A plan the page can sell: an id, a family, a price above zero and a hold. */
export function validPlan(p: unknown): p is RawPlan {
  const r = p as Partial<RawPlan> | null | undefined;
  return !!(
    r &&
    typeof r.id === 'string' &&
    r.id &&
    typeof r.family_id === 'string' &&
    isCount(r.price_cents_per_month) &&
    r.price_cents_per_month > 0 &&
    isCount(r.hold_days)
  );
}

/** Plans in the catalogue's own order, then price. An id the read lists more than once (entries no column shows
 *  included) is no column: which entry it names would hang on the read's order, so it names none, as an exact link's
 *  id does (planByHandle: each plan once). */
function orderPlans(plans: readonly RawPlan[]): RawPlan[] {
  const seen = new Map<unknown, number>();
  for (const p of plans as readonly unknown[]) {
    const id = (p as { id?: unknown } | null | undefined)?.id;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  return plans
    .filter((p) => validPlan(p) && seen.get(p.id) === 1)
    .slice()
    .sort((a, b) => (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0) || a.price_cents_per_month - b.price_cents_per_month);
}

/** One plan's answer in one row. A dash says which: a count of 0 is not included, a field left out is not listed. */
export type CompareCell =
  | { kind: 'value'; value: string | Word }
  | { kind: 'ai'; tier: AiTier | null; mult: number | null }
  | { kind: 'none'; why: 'notIncluded' | 'notListed' };

export interface CompareRow {
  id: commerceRules.PlanFactId;
  label: Key;
  /** The one grey line under the row's title. */
  hint: Key;
  cells: CompareCell[];
}

export interface CompareGroup {
  id: 'usage' | 'server' | 'network';
  label: Key;
  /** "00", "01": consecutive over the groups drawn. */
  num: string;
  rows: CompareRow[];
}

export interface Comparison {
  /** One column per plan. */
  plans: PlanCard[];
  /** The groups with a row any plan has, in the shown order. */
  groups: CompareGroup[];
}

/** Every plan fact sits in exactly one group (plan-compare.test.ts checks it against core's list). */
export const COMPARE_GROUPS: readonly { id: CompareGroup['id']; label: Key; facts: readonly commerceRules.PlanFactId[] }[] = [
  { id: 'usage', label: 'plans.group.usage', facts: ['ai'] },
  { id: 'server', label: 'plans.group.server', facts: ['cores', 'ram', 'disk', 'io', 'computers', 'snapshots'] },
  { id: 'network', label: 'plans.group.network', facts: ['net', 'aliases', 'boturls'] },
];

const FACT_HINT: Record<commerceRules.PlanFactId, Key> = {
  ai: 'plans.hint.ai',
  cores: 'plans.hint.cores',
  ram: 'plans.hint.ram',
  disk: 'plans.hint.disk',
  io: 'plans.hint.io',
  computers: 'plans.hint.computers',
  snapshots: 'plans.hint.snapshots',
  net: 'plans.hint.net',
  aliases: 'plans.hint.aliases',
  boturls: 'plans.hint.boturls',
};

/**
 * One plan's cell for a fact. The AI row is built here for every plan from the tier and the multiple, with core's rule for
 * the multiple: below 2 it says nothing, since an equal multiple does not prove an equal
 * allowance. So those plans show the tier word alone.
 */
function compareCell(p: RawPlan, id: commerceRules.PlanFactId): CompareCell {
  if (id === 'ai') {
    const tier = tierOf(p);
    const m = multOf(p);
    const mult = m !== null && m >= 2 ? m : null;
    return tier === null && mult === null ? { kind: 'none', why: 'notListed' } : { kind: 'ai', tier, mult };
  }
  const fact = commerceRules.planFacts(p).find((f) => f.id === id);
  if (!fact) return { kind: 'none', why: 'notListed' };
  if (fact.value === 0 && !fact.write) return { kind: 'none', why: 'notIncluded' };
  const row = planRows(p).find((r) => r.id === id);
  return row ? { kind: 'value', value: row.value } : { kind: 'none', why: 'notListed' };
}

/** The plans' facts: one column per plan, the facts as rows in numbered groups (the Plans view draws each column's rows
 *  in this order). A row no plan has, and a group with no row, is not drawn; the AI row always is (every plan has a tier). */
export function comparison(plans: readonly RawPlan[]): Comparison {
  const ordered = orderPlans(plans);
  const groups: CompareGroup[] = [];
  for (const g of COMPARE_GROUPS) {
    const rows: CompareRow[] = [];
    for (const id of g.facts) {
      const cells = ordered.map((p) => compareCell(p, id));
      if (id !== 'ai' && cells.every((c) => c.kind === 'none' && c.why === 'notListed')) continue;
      rows.push({ id, label: FACT_LABEL[id], hint: FACT_HINT[id], cells });
    }
    if (rows.length) groups.push({ id: g.id, label: g.label, num: String(groups.length).padStart(2, '0'), rows });
  }
  return { plans: ordered.map(planCard), groups };
}

/** Which plan the page suggests: the hand-off's plan (by family or version id). */
export function isSuggested(card: Pick<PlanCard, 'id' | 'family'>, want: string | null): boolean {
  return !!want && (want === card.family || want === card.id);
}

/** The subscription is on this column's version. plan_id is always a version id; a retired version of the same family is
 *  another plan, so it is not this column. */
export function isCurrentPlan(card: Pick<PlanCard, 'id' | 'family'>, sub: Pick<RawSub, 'plan_id' | 'plan'> | null | undefined): boolean {
  return !!sub && typeof sub.plan_id === 'string' && !!sub.plan_id && sub.plan_id === card.id;
}

/** A plan's price as its column shows it in large type: whole dollars when the cents are 0 ("$10"), else exact ("$12.50"). The
 *  exact amount ("$10.00") is the line under it and the checkout's. */
export function priceShort(c: unknown): string {
  const exact = cents(c);
  return isCount(c) && c % 100 === 0 ? exact.slice(0, -3) : exact;
}

/** The states of a server that still holds its plan (ended and wiped ones do not count as "your servers"). */
const PLAN_HOLDING = new Set(['active', 'provisioning', 'held', 'past_due', 'change_stuck', 'delivery_failed']);

/** How many of the account's servers are on this column's version (isCurrentPlan). */
export function serversOn(card: Pick<PlanCard, 'id' | 'family'>, subs: readonly RawSub[] | null | undefined): number {
  return (subs ?? []).filter((x) => x && PLAN_HOLDING.has(x.state) && isCurrentPlan(card, x)).length;
}

/** The paid servers "Plans for" offers: those that can upgrade now (core's gate), in the list's order. A held one or one
 *  with a change running is left out; it is still counted on its plan. */
export function plansForSubs(subs: readonly RawSub[] | null | undefined, now: number = Date.now()): RawSub[] {
  return (subs ?? []).filter((x) => x && typeof x.id === 'string' && x.id && upgradeState(x, now) === 'ok');
}

/** "Plans for" labels: each server's name (hostLabel); a name two servers share adds the id's last 8 characters, and
 *  an ending they share too adds the whole id, so no two choices read the same. */
export function subLabels(subs: readonly Pick<RawSub, 'id' | 'server_name' | 'server_id'>[]): string[] {
  const names = subs.map((x) => hostLabel(x));
  const twice = (list: readonly string[], i: number) => list.filter((n) => n === list[i]).length > 1;
  const short = names.map((n, i) => (twice(names, i) ? `${n} #${subHandle((subs[i] as RawSub).id)}` : n));
  return short.map((n, i) => (twice(short, i) ? `${names[i]} #${(subs[i] as RawSub).id}` : n));
}

/** The plan handle a column's checkout link carries, buy and upgrade alike: the version id, only when it names this
 *  version alone in the catalogue (`raw`, the read the checkout drawer searches): no other entry has it as id or family.
 *  Else null, and the column has no action. Never the family: a family names whichever of its versions a later catalogue
 *  read lists first (a second version put on sale between). The column's
 *  link is exact (`links.checkout(kind, { plan, exact: true })`): the drawer opens that version id or says the plan is
 *  gone (planByHandle), so a family with two versions on sale never opens the other version. */
export function checkoutPlan(c: Pick<PlanCard, 'id'>, raw: readonly Pick<RawPlan, 'id' | 'family_id'>[]): string | null {
  const named = raw.filter((p) => p.id === c.id || p.family_id === c.id);
  return named.length === 1 && named[0]?.id === c.id ? c.id : null;
}

/** The catalogue entry the checkout drawer opens for a link's plan handle. An exact link (a Plans column's: `exact=true`)
 *  names a version: the entry with that id or none (the plan is gone), never an entry whose family has that name, in any
 *  later read of the catalogue. Any other link (a family hand-off, a website Get
 *  link) keeps the drawer's lookup: the first entry whose id or family is the handle. An exact id that a
 *  later read lists twice names none: which entry it opens would hang on that read's order. */
export function planByHandle<P extends Pick<RawPlan, 'id' | 'family_id'>>(raw: readonly P[] | null | undefined, handle: string | null | undefined, exact = false): P | null {
  if (!raw || !handle) return null;
  if (!exact) return raw.find((p) => p.id === handle || p.family_id === handle) ?? null;
  const named = raw.filter((p) => p.id === handle);
  return named.length === 1 ? (named[0] as P) : null;
}

/** An entry of the catalogue read, as ownCatalogue judges plan_id against it. */
export type CatalogueHandle = Pick<RawPlan, 'id' | 'family_id'>;
const handlesOf = (plans: readonly Pick<PlanCard, 'id' | 'family'>[]): CatalogueHandle[] => plans.map((p) => ({ id: p.id, family_id: p.family }));

/** The catalogue's entry for the server's own plan: its version (plan_id), when the catalogue lists it. Never the
 *  subscription's own recorded terms, and nothing when the version is not on sale (the column's
 *  money figures are the catalogue's, as the checkout quote's are). plan_id must name that one entry by id and no entry by
 *  family, and the entry must be of the family the server's record names (when it names one): a plan_id the catalogue
 *  reads two ways, or a version of another family, names none. A plan_id that names only
 *  a family (an older record) names none either, even with one plan of the family on sale: the server may run another
 *  version of it; columnMode then offers no Upgrade on that family's columns. `raw` is the
 *  whole catalogue read, entries no column shows included (PlansSection passes it; the columns when left out): plan_id
 *  must be the id of one entry there and the family of none, the entry itself included, or the record may name a family. */
export function ownCatalogue<C extends Pick<PlanCard, 'id' | 'family'>>(sub: Pick<RawSub, 'plan_id' | 'plan'>, plans: readonly C[], raw: readonly CatalogueHandle[] = handlesOf(plans)): C | null {
  const id = sub.plan_id;
  if (typeof id !== 'string' || !id) return null;
  if (raw.filter((p) => p.id === id).length !== 1 || raw.some((p) => p.family_id === id)) return null;
  const named = plans.filter((p) => p.id === id || p.family === id);
  const own = named[0];
  if (named.length !== 1 || !own || own.id !== id) return null;
  const fam = sub.plan?.family_id;
  return typeof fam === 'string' && fam && own.family !== fam ? null : own;
}

/** What an upgrade adds to the monthly price, from catalogue prices only: the plan's price minus the catalogue price of
 *  the server's own plan (ownCatalogue). Null when either is unknown or the difference is not above 0 (the checkout's
 *  quote is the amount charged). */
export function upgradeDelta(sub: Pick<RawSub, 'plan_id' | 'plan'>, card: Pick<PlanCard, 'priceCents'>, plans: readonly Pick<PlanCard, 'id' | 'family' | 'priceCents'>[], raw?: readonly CatalogueHandle[]): number | null {
  const own = ownCatalogue(sub, plans, raw)?.priceCents ?? null;
  if (own === null || card.priceCents === null) return null;
  const d = card.priceCents - own;
  return d > 0 ? d : null;
}

/** What one plan's column offers for the server the plans speak about: Get (no server picked), Upgrade (a candidate),
 *  the server's own plan, or a plan it cannot move to. */
export type ColumnMode = 'get' | 'upgrade' | 'current' | 'notUp';

/** The column of the server's own plan: the catalogue's entry for it (ownCatalogue: its version), and no other. Never a sibling version of its family (never "on this plan" on
 *  v3 for a server on v2), and none while its version is off sale, even with one version of its family on sale (the
 *  server is not on that version, which may be an upgrade). */
export function isOwnColumn(card: Pick<PlanCard, 'id' | 'family'>, sub: Pick<RawSub, 'plan_id' | 'plan'>, plans: readonly Pick<PlanCard, 'id' | 'family'>[], raw?: readonly CatalogueHandle[]): boolean {
  const own = ownCatalogue(sub, plans, raw);
  return !!own && own.id === card.id;
}

/** Get with no server; `current` on the server's own column. When the own entry cannot be told (ownCatalogue none while
 *  plan_id names this column by id or family), the column may be the server's own version: no Upgrade there, since
 *  upgradeCandidates leaves out only an id equal to plan_id. A version off sale names no
 *  column, so a sibling can still be an upgrade. */
export function columnMode(card: Pick<PlanCard, 'id' | 'family'>, target: RawSub | null | undefined, ups: ReadonlySet<string>, plans: readonly Pick<PlanCard, 'id' | 'family'>[], raw?: readonly CatalogueHandle[]): ColumnMode {
  if (!target) return 'get';
  if (ownCatalogue(target, plans, raw)) return isOwnColumn(card, target, plans, raw) ? 'current' : ups.has(card.id) ? 'upgrade' : 'notUp';
  if (card.id === target.plan_id || card.family === target.plan_id) return 'notUp';
  return ups.has(card.id) ? 'upgrade' : 'notUp';
}

/** A buy quote's paid server limit as the API sends it: `reached` always, `used` only for an unrestricted caller (a
 *  token limited to realms gets no `used`, since the count spans every realm of the account). */
export interface QuoteCap {
  max?: unknown;
  used?: unknown;
  reached?: unknown;
}

/**
 * The quote says the plan cannot be bought now: the account limit or no room on any host. `cap.reached` decides the limit
 * first, whatever `used` says. With no `reached` flag the counts decide only when both are readable; a missing count is
 * unknown, never 0 used, so the cause stays unnamed (buy.notNow). No cap at all: no room (only a host can block it).
 */
export function quoteBlock(q: { available?: unknown; cap?: QuoteCap | null } | null | undefined, place?: string | null): Word | null {
  if (!q || q.available !== false) return null;
  const cap = q.cap;
  // With a location chosen, "no room" is about that location: another one may have room.
  const noRoom = (): Word => (place ? word('loc.noRoomIn', { place }) : word('buy.noRoom'));
  if (!cap) return noRoom();
  // A limit of 0 has no number worth saying ("your limit of 0 paid servers"): the plain words.
  const atLimit = (): Word => (isCount(cap.max) && cap.max > 0 ? word('buy.limit', { max: cap.max }) : word('limitPlain'));
  if (cap.reached === true) return atLimit();
  if (cap.reached === false) return noRoom();
  if (isCount(cap.max) && isCount(cap.used)) return cap.used >= cap.max ? atLimit() : noRoom();
  return word('buy.notNow');
}

// ── Upgrade in place ────────────────────────────────────────────────────────────────

/**
 * The plans an active paid subscription can move to in place: core's one copy (the Market reads it too). Every field
 * of the server's own version kept or raised, one at least raised; never its own version or a refused plan.
 */
export const upgradeCandidates: (sub: RawSub | null | undefined, plans: readonly RawPlan[] | null | undefined, refused?: readonly string[]) => RawPlan[] =
  commerceRules.upgradeCandidates;

/** The AI line of an upgrade choice: "×N the free AI allowance" when the plan raises the multiple. */
export function upgradeAi(sub: RawSub, p: RawPlan): Word | null {
  const a = multOf(sub.plan) ?? 1;
  const b = multOf(p);
  return b && b > a ? word('up.aiMore', { n: b }) : null;
}

// ── Refusal words ───────────────────────────────────────────────────────────────────

export interface Refusal {
  reason?: string;
  kind?: string;
  code?: string;
  notSent?: boolean;
}

export interface AttemptWord {
  word: Word;
  /** The wallet is short: offer Add funds. */
  funds?: boolean;
  /** The price moved: the review asks again. */
  requote?: boolean;
  /** The offer changed: read it again. */
  gone?: boolean;
  /** A refusal of the chosen location (it has no room, or it left the list): back to the review, where another is chosen. */
  region?: boolean;
}

/** A refusal or a nothing-sent reason of a buy, pay or upgrade → words. Never the server's prose. */
export function attemptWords(r: Refusal | null | undefined, pay: boolean, recovery = false): AttemptWord | null {
  const reason = r?.reason;
  if (reason === 'unquoted' || reason === 'unquotable') return { word: word('requote'), requote: true };
  if (reason === 'accountChanged' || reason === 'account') return { word: word(pay ? 'subs.accountChanged' : 'buy.accountChanged') };
  if (reason === 'check' || reason === 'auth') return { word: word('buy.accountCheckErr') };
  if (reason === 'adopted') return { word: word('buy.adopted') };
  if (reason === 'heldUpgrade') return { word: word('up.heldOther') };
  if (reason === 'store' || reason === 'storage') return { word: word('buy.storeErr') };
  // No Web Locks: nothing was sent, and nothing can be sent safely from this browser.
  if (reason === 'noLocks') return { word: word('noLocks') };
  if (reason === 'timeout' || reason === 'expired') return { word: word('notSentSlow') };
  if (reason !== 'refused') return null;
  const kind = r?.kind;
  if (r?.notSent && (kind === 'auth' || kind === 'unknown' || !kind)) return { word: word(kind === 'auth' ? 'buy.accountCheckErr' : 'notSent') };
  switch (kind) {
    case 'funds':
      return { word: word('buy.noFundsPlain'), funds: true };
    case 'priceChanged':
      return { word: word('buy.priceChanged'), requote: true };
    case 'gone':
      return { word: word('buy.updated'), gone: true };
    // A refusal after Confirm: the plan card's blocked words plus what happened to the money.
    case 'limit':
      return { word: word('buy.limitRefused') };
    case 'capacity':
      return { word: word('buy.noRoomRefused') };
    case 'regionFull':
      return { word: word('loc.refusedFull'), region: true };
    case 'regionUnknown':
      return { word: word('loc.refusedUnknown'), region: true };
    case 'rate':
      return { word: word('buy.rateLimited') };
    case 'permission':
      return {
        word: word(pay ? (recovery ? 'subs.recoveryNoPermission' : 'subs.noPermission') : 'buy.noPermission'),
      };
    case 'intent':
      return { word: word('buy.adopted') };
    default:
      return {
        word: word(pay ? (recovery ? 'subs.recoveryRefused' : 'subs.payRefused') : 'buy.refused'),
      };
  }
}

/** An upgrade refusal: words, or `reread` when only a fresh read of the subscription can say what is true. */
export function upgradeWords(r: Refusal | null | undefined): (AttemptWord & { reread?: boolean; pay?: boolean }) | null {
  if (!r || r.reason !== 'refused') return attemptWords(r, false, false);
  switch (r.code) {
    case 'PLAN_CHANGE_NOT_UPGRADE':
    case 'SUBSERVER_DORMANT':
      return { word: word('up.notUpgrade'), reread: true };
    case 'SUBSCRIPTION_PERIOD_ENDED':
      return { word: word('up.ended'), pay: true };
    case 'HOST_UNAVAILABLE':
      return { word: word('up.host') };
    case 'NO_PAID_CAPACITY':
      return { word: word('up.noRoom') };
    case 'PLAN_NOT_AVAILABLE':
      return { word: word('up.gone'), reread: true };
    default: {
      const w = attemptWords(r, false, false);
      return w && w.word.k === 'buy.refused' ? { word: word('up.refused') } : w;
    }
  }
}

// ── Top up ──────────────────────────────────────────────────────────────────────────

const PRESETS = [10, 20, 50, 100];

export function methodsFor(av: { methods?: readonly TopUpMethod[] } | null | undefined): TopUpMethod[] {
  return (av?.methods ?? []).filter((m) => m && (m.key === 'card' || m.key === 'crypto'));
}

/** The preset amounts at least one method accepts. */
export function presets(methods: readonly TopUpMethod[]): number[] {
  return PRESETS.filter((n) => methods.some((m) => n >= m.min && n <= m.max));
}

/** "12.5" → "12.50"; null when it is not an amount. */
export function normalizeAmount(raw: unknown): string | null {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) return null;
  if (!s.includes('.')) return `${s}.00`;
  const [whole, frac] = s.split('.');
  return `${whole}.${`${frac}00`.slice(0, 2)}`;
}

export function amountFits(amount: string | null, m: TopUpMethod | null | undefined): boolean {
  if (!amount || amount === '0.00' || !m) return false;
  const c = Math.round(parseFloat(amount) * 100);
  return c >= Math.round(m.min * 100) && c <= Math.round(m.max * 100);
}

export interface TopUpError {
  code?: string;
  status?: number;
  pending?: boolean;
  kind?: string;
  framed?: boolean;
}

export function topupWords(err: TopUpError | null | undefined): AttemptWord & { rekey?: boolean; unknown?: boolean } {
  const code = err?.code;
  // A framed Hub never sends a payment: nothing went out, and the way forward is the Hub in its own tab.
  if (code === 'FRAMED_ACTION_REFUSED' || err?.framed === true) return { word: word('top.framed') };
  // The standalone Hub's replay of a held top-up: refused unsent (payments are made in the served Hub), and the first
  // request is still unknown, so the hold stays.
  if (code === 'STANDALONE_HANDOFF' && err?.pending) return { word: word('top.handoff'), unknown: true };
  if (code === 'ACCOUNT_CHANGED' || code === 'NO_SHELL') return { word: word('accountChanged') };
  if (code === 'BAD_CHECKOUT_URL') return { word: word('top.badUrl') };
  if (code === 'OUT_OF_RANGE' || code === 'PAYMENT_AMOUNT_OUT_OF_RANGE') return { word: word('top.range') };
  if (code === 'PAYMENT_VELOCITY_LIMIT_EXCEEDED') return { word: word('top.velocity') };
  if (code === 'PAYMENT_CHECKOUT_IN_PROGRESS') return { word: word('top.inProgress') };
  if (code === 'PAYMENT_IDEMPOTENCY_KEY_REUSED') return { word: word('top.again'), rekey: true };
  if (err?.status === 503) return { word: word('top.unavailable') };
  if (err?.status === 429) return { word: word('top.throttle') };
  if (err?.pending || err?.kind === 'pending') return { word: word('top.unknown'), unknown: true };
  return { word: word('top.failed') };
}

// ── AI usage ────────────────────────────────────────────────────────────────────────

const MAX_SERVERS = 24;

export interface UsageRow {
  id: string;
  name: string;
  ok: boolean;
  asOf: string | null;
  lanes: LaneReading[];
  plan: string | null;
  tier: AiTier | null;
  mult: number | null;
  bare: boolean;
  /** Family id of the plan to suggest for more AI. */
  suggest: string | null;
  bareNext: boolean;
  /** The subscription that can upgrade now. */
  sub: string | null;
  upPlan: string | null;
}

export interface Usage {
  servers: UsageRow[];
  truncated: boolean;
  more: string | null;
}

/**
 * The cheapest plan that gives more AI than a server on `tier` with multiple `mult` (null = the free allowance, ×1):
 * a higher AI tier, or a larger multiple. Equal public multiples are common, so the tier counts on its own.
 */
function moreAi(plans: readonly RawPlan[] | null | undefined, mult: number | null, tier: AiTier | null): RawPlan | null {
  let best: RawPlan | null = null;
  const base = mult ?? 1;
  const rank = commerceRules.aiRank(tier ?? 'free');
  for (const p of plans ?? []) {
    const m = multOf(p) ?? 1;
    const more = commerceRules.aiRank(p.ai_tier) > rank || m > base;
    if (!more || !isCount(p.price_cents_per_month) || p.price_cents_per_month <= 0 || typeof p.family_id !== 'string' || !p.family_id) continue;
    if (!best || p.price_cents_per_month < best.price_cents_per_month) best = p;
  }
  return best;
}

/**
 * Each server's lanes and plan, from the AI usage answer, the subscriptions and the catalogue. `kinds` says which
 * servers are free or rented (from the account's rentals). AI is sold only with a server: every "more" is a server plan
 * or a bare-metal machine.
 */
export function aiUsage(
  data: RawUsage | null | undefined,
  subs: readonly RawSub[] | null | undefined,
  plans: readonly RawPlan[] | null | undefined,
  kinds: Readonly<Record<string, 'free' | 'paid' | 'bare_metal'>> = {},
): Usage {
  const list = Array.isArray(data?.servers) ? data.servers : [];
  const out: UsageRow[] = [];
  const bySrv = new Map<string, RawSub>();
  for (const sub of subs ?? []) {
    if (sub && typeof sub.server_id === 'string') {
      const have = bySrv.get(sub.server_id);
      if (!have || sub.state === 'active') bySrv.set(sub.server_id, sub);
    }
  }
  for (const row of list) {
    const sv = row?.server;
    if (!sv || typeof sv.id !== 'string' || !HEX24.test(sv.id) || out.length >= MAX_SERVERS) continue;
    const sub = bySrv.get(sv.id) ?? null;
    const own = sub?.plan && typeof sub.plan === 'object' ? sub.plan : null;
    const plan = sub ? ((plans ?? []).find((p) => p && p.id === sub.plan_id) ?? null) : null;
    const lanes = readLanes(row.lanes);
    const mult = sub ? (multOf(own) ?? multOf(plan)) : null;
    const kind = !sub ? (kinds[sv.id] ?? null) : null;
    const bare = kind === 'bare_metal';
    const free = kind === 'free';
    const tier: AiTier | null = bare ? 'bare_metal' : free ? 'free' : (tierOf(own) ?? tierOf(plan));
    const sugg = sub ? moreAi(upgradeCandidates(sub, plans), mult, tier) : free ? moreAi(plans, null, 'free') : null;
    out.push({
      id: sv.id,
      name: str(sv.name, 80) || `#${sv.id.slice(-8)}`,
      ok: row.status === 'ok',
      asOf: typeof row.as_of === 'string' ? row.as_of : null,
      lanes: row.status === 'ok' ? lanes : [],
      plan: (own && str(own.title, 120)) || (plan && planTitle(plan)) || null,
      tier,
      // Shown from ×2 up only, as in the plan comparison: an equal public multiple proves no larger allowance.
      mult: !bare && mult !== null && mult >= 2 ? mult : null,
      bare,
      suggest: sugg ? sugg.family_id : null,
      bareNext: !bare && !sugg && !!sub && !!sub.plan && Array.isArray(plans),
      sub: sub && upgradeState(sub) === 'ok' ? sub.id : null,
      upPlan: sub && sugg ? sugg.id : null,
    });
  }
  const more = out.length ? null : moreAi(plans, null, 'free');
  return {
    servers: out,
    truncated: data?.truncated === true || list.length > out.length,
    more: more ? more.family_id : null,
  };
}

/** The free server's name for "Your free server X stays as it is"; null when none is known. */
export function freeName(data: RawUsage | null | undefined, kinds: Readonly<Record<string, string>>): string | null {
  for (const row of data?.servers ?? []) {
    const sv = row?.server;
    if (sv && typeof sv.id === 'string' && kinds[sv.id] === 'free') return str(sv.name, 80) || null;
  }
  return null;
}

/** Time for "as of" lines. */
export function asOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDateTime(d);
}

// ── Server codes to refusals ────────────────────────────────────────────────────────

/** A definitive money answer's code (and status) as a refusal kind for attemptWords. */
export function refusalFromCode(code: string | undefined, status?: number): Refusal {
  if (status === 429 || code === 'RATE_LIMITED') return { reason: 'refused', kind: 'rate', code };
  if (status === 403 || code === 'FORBIDDEN') return { reason: 'refused', kind: 'permission', code };
  switch (code) {
    case 'PLAN_NOT_AVAILABLE':
      return { reason: 'refused', kind: 'gone', code };
    case 'INSUFFICIENT_BALANCE':
      return { reason: 'refused', kind: 'funds', code };
    case 'CHARGE_EXCEEDS_MAX':
    case 'CHARGE_CONFIRMATION_REQUIRED':
    case 'SETUP_FEE_CONFIRMATION_REQUIRED':
      return { reason: 'refused', kind: 'priceChanged', code };
    case 'PAID_SUBSERVER_LIMIT_REACHED':
      return { reason: 'refused', kind: 'limit', code };
    case 'NO_PAID_CAPACITY':
    case 'HOST_UNAVAILABLE':
      return { reason: 'refused', kind: 'capacity', code };
    case 'NO_PAID_CAPACITY_IN_REGION':
      return { reason: 'refused', kind: 'regionFull', code };
    case 'PAID_REGION_UNKNOWN':
      return { reason: 'refused', kind: 'regionUnknown', code };
    case 'IDEMPOTENCY_INTENT_MISMATCH':
      return { reason: 'refused', kind: 'intent', code };
    default:
      return { reason: 'refused', kind: 'refused', code };
  }
}

/** A Market (rent or reserve) refusal → words. `totalCents` is the server's re-quote when it sent one. */
export function marketWords(code: string | undefined, status?: number, totalCents?: number | null): AttemptWord {
  if (status === 429 || code === 'RATE_LIMITED') return { word: word('mkt.tooMany') };
  if (code === 'ACCOUNT_BANNED') return { word: word('mkt.suspended') };
  switch (code) {
    case 'CHARGE_EXCEEDS_MAX':
    case 'CHARGE_CONFIRMATION_REQUIRED':
    case 'SETUP_FEE_CONFIRMATION_REQUIRED':
      return {
        word: totalCents != null ? word('mkt.priceChanged', { total: cents(totalCents) }) : word('mkt.priceChangedNoQuote'),
        requote: true,
      };
    case 'INVALID_DURATION':
      return { word: word('mkt.invalidDuration'), gone: true };
    case 'INSUFFICIENT_BALANCE':
      return { word: word('mkt.insufficient'), funds: true };
    case 'OUT_OF_STOCK':
      return { word: word('mkt.outOfStock') };
    case 'OFFER_UNAVAILABLE':
      return { word: word('mkt.offerGone'), gone: true };
    case 'SERVER_UNAVAILABLE':
      return { word: word('mkt.justTaken') };
    case 'IDEMPOTENCY_INTENT_MISMATCH':
      return { word: word('mkt.intentMismatch') };
    case 'PRICING_INVALID':
      return { word: word('mkt.pricingInvalid') };
    case 'NO_PRICING':
      return { word: word('mkt.noPricing') };
    default:
      return { word: word('mkt.failedGeneric') };
  }
}

/**
 * The market row a purchase may be built from: the row read for this target's own item, with a term chosen. A row of
 * any other listing (an earlier answer kept while a new read is out) is never one: a purchase built from it would buy
 * that other server (kept even though the drawer remounts per item). Nor is a row that cannot price
 * the chosen term (a link's term the listing does not offer, or a total that does not parse): with no purchase the
 * drawer shows the price error with Try again, instead of waiting for a quote that never comes. `held`: core holds an
 * unresolved purchase of exactly this item and term; it recovers from its own kept request (key, ceiling), so its
 * outcome is shown whatever the row's price says. Only a fresh purchase needs one.
 */
export function purchaseRow(
  row: commerceRules.MarketRow | null | undefined,
  item: string | null | undefined,
  days: number | null,
  held = false,
): commerceRules.MarketRow | null {
  if (!row || days === null || !item || row.id !== item) return null;
  if (!held && commerceRules.quoteFor(row, String(days))?.totalCents == null) return null;
  return row;
}

/**
 * A kept request's name in a URL: 64 bits (16 hex) of SHA-256 over its key. Never the key itself, which is the money
 * send's idempotency key and stays out of URLs and history.
 */
export async function heldRef(key: string): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return Array.from(d.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The kept request a URL's fingerprint names, among this kind's kept requests (`refs`: key -> fingerprint). Exactly one
 * match is the pick; two or more name none (`shared`), the same as a handle two subscriptions share, never the first.
 */
export function pickHeld<U extends { key: string; target: { kind: string } }>(
  unknowns: readonly U[],
  refs: ReadonlyMap<string, string>,
  kind: string,
  ref: string,
): { entry: U | undefined; shared: boolean } {
  const named = unknowns.filter((u) => u.target.kind === kind && refs.get(u.key) === ref);
  return { entry: named.length === 1 ? named[0] : undefined, shared: named.length > 1 };
}

/** A read the Hub refused itself and sent nowhere, which a retry cannot change: an access-key session asking for an
 *  account-only route (TOKEN_SESSION_REFUSED) or a route its key lacks the right for (TOKEN_LACKS). Its state says why
 *  (kit errorWords) and offers no "Try again". */
export function refusedHere(error: unknown): boolean {
  if (!error) return false;
  const info = errorInfo(error);
  return info.outcome === 'not_sent' && (info.code === 'TOKEN_SESSION_REFUSED' || info.code === 'TOKEN_LACKS');
}
