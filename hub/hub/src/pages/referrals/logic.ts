// The Referrals page's rules without DOM or network. The page shows
// totals and bands only; counts are words, never arithmetic. Money is the API's dollar string or a dash, never a
// guess (C9). Words leave as { k, v } so the view owns the strings.
import { commerceRules, type ErrorInfo } from '@core';

/** The public program rules (docs): the one place every number of the program is written in full. */
export const RULES_URL = 'https://docs.hoody.com/foundation/wallet/referral-program/';
/** The docs' Code rules (limits, refusals, retiring) and, beside it, who a link or code does not refer. */
export const CODE_RULES_URL = 'https://docs.hoody.com/foundation/wallet/referral-program/reference/#code-rules';

/** A referral code as the server stores and looks it up: its own first step. */
export const normCode = (raw: string): string => raw.trim().toLowerCase();

const BAND = /^(0|fewer_than_3|[3-9]|[1-9]\d+)$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : {});
/** The API's dollar string when it has the money shape (core's usdText decides, one rule with Billing), else null. */
const money = (x: unknown): string | null => (typeof x === 'string' && commerceRules.usdText(x) !== commerceRules.usdText(null) ? x : null);
const band = (x: unknown): string | null => (typeof x === 'string' && BAND.test(x) ? x : null);

export interface Code {
  code: string;
  kind: 'random' | 'vanity';
  state: 'active' | 'blocked';
  /** The API's signup link as given; null while blocked. */
  link: string | null;
}

export interface Month {
  /** YYYY-MM. */
  month: string;
  earned: string | null;
  reversed: string | null;
}

export interface Me {
  eligible: boolean;
  enrolled: boolean;
  state: 'active' | 'removed' | null;
  enrolmentOpen: boolean;
  /** The level as the API sends it; 'unknown' when it sent neither word (never read as Referrer). */
  level: 'referrer' | 'creator' | 'unknown';
  /** The share in percent as the API sends it ("5", "7.5"); '' when it is not one. */
  ratePercent: string;
  /** `creator_threshold_active_customers`: the customers who count for Creator, never the Paying
   *  or Active tile; null names no figure. */
  creatorThreshold: number | null;
  /** `creator_rate_percent`: the Creator share this month as the API sends it ("10"); '' when it is not one (an older
   *  API sends none). The Hub never writes a share of its own. */
  creatorRatePercent: string;
  /** `creator_customers`: the customers who count for Creator, measured the way next month's level will be, as a band
   *  ("0", "fewer_than_3", or the number from 3); null names none. Never a ratio or a "how many to go". */
  creatorCustomers: string | null;
  codes: Code[];
  /** `vanity_codes_left`; null when the answer's value is not a whole number from 0: capacity unknown, so neither the form
   *  nor the unavailable line shows (only a real 0 says no more codes can be made). */
  vanityLeft: number | null;
  counts: { signedUp: string | null; paying: string | null; active: string | null };
  credit: { pending: string | null; available: string | null; reversed: string | null; owed: string | null };
  /** Only months with earnings, newest first (the API lists no empty month). */
  monthly: Month[];
  /** ISO, 00:00 UTC of the release day; null hides the line. */
  nextReleaseAt: string | null;
}

/**
 * The /referrals/me answer, or a throw on a body that is not one (core then keeps a held change held: a malformed
 * read-back proves nothing). Unknown bands and money that fails the shape are null, shown as a dash.
 */
export function selectMe(raw: unknown): Me {
  const d = rec(rec(raw).data);
  // The API always sends these: a body missing one is not the answer, never a guess.
  if (typeof d.eligible !== 'boolean' || typeof d.enrolled !== 'boolean' || typeof d.enrolment_open !== 'boolean' || !Array.isArray(d.codes) || !Array.isArray(d.monthly))
    throw new Error('referrals: malformed answer');
  const state = d.state === 'active' || d.state === 'removed' ? d.state : null;
  if (d.enrolled && state === null) throw new Error('referrals: enrolled without a state');
  const counts = rec(d.counts);
  const credit = rec(d.credit);
  const left = d.vanity_codes_left;
  const threshold = d.creator_threshold_active_customers;
  const codes: Code[] = [];
  for (const c of d.codes) {
    const r = rec(c);
    if (typeof r.code !== 'string' || !r.code) throw new Error('referrals: malformed code');
    const active = r.state === 'active';
    codes.push({
      code: r.code,
      kind: r.kind === 'vanity' ? 'vanity' : 'random',
      state: active ? 'active' : 'blocked',
      link: active && typeof r.link === 'string' && r.link ? r.link : null,
    });
  }
  const next = typeof d.next_release_at === 'string' && !Number.isNaN(Date.parse(d.next_release_at)) ? d.next_release_at : null;
  return {
    eligible: d.eligible,
    enrolled: d.enrolled,
    state,
    enrolmentOpen: d.enrolment_open as boolean,
    level: d.level === 'creator' || d.level === 'referrer' ? d.level : 'unknown',
    ratePercent: typeof d.rate_percent === 'string' && RATE.test(d.rate_percent) ? d.rate_percent : '',
    creatorThreshold: typeof threshold === 'number' && Number.isSafeInteger(threshold) && threshold > 0 ? threshold : null,
    creatorRatePercent: typeof d.creator_rate_percent === 'string' && RATE.test(d.creator_rate_percent) ? d.creator_rate_percent : '',
    creatorCustomers: band(d.creator_customers),
    codes,
    vanityLeft: typeof left === 'number' && Number.isSafeInteger(left) && left >= 0 ? left : null,
    counts: { signedUp: band(counts.signed_up), paying: band(counts.paying), active: band(counts.active) },
    credit: { pending: money(credit.pending), available: money(credit.available), reversed: money(credit.reversed), owed: money(credit.owed) },
    monthly: (d.monthly as unknown[])
      .map(rec)
      .filter((m) => typeof m.month === 'string' && MONTH.test(m.month))
      .map((m) => ({ month: m.month as string, earned: money(m.earned), reversed: money(m.reversed) })),
    nextReleaseAt: next,
  };
}

/** A known amount above zero ("0.00" is the only zero the money shape allows); unknown money is never above 0. */
export const above0 = (m: string | null): boolean => m !== null && m !== '0.00';

export type BandWords ={ k: 'band.none' | 'band.few' | 'band.n' | 'band.unknown'; v?: { n: string } };

/** A band as words: "None yet", "Fewer than 3", the number from 3; anything else a dash. Never arithmetic. */
export function bandWords(b: string | null): BandWords {
  if (b === '0') return { k: 'band.none' };
  if (b === 'fewer_than_3') return { k: 'band.few' };
  if (b !== null && BAND.test(b)) return { k: 'band.n', v: { n: b } };
  return { k: 'band.unknown' };
}

export type State = 'loading' | 'error' | 'token' | 'notEligible' | 'paused' | 'canJoin' | 'member' | 'earningPaused' | 'removed';

/** Which page state an answer shows. Enrolled and active but not eligible is Earning paused, never Member. */
export function stateOf(me: Me): Exclude<State, 'loading' | 'error' | 'token'> {
  if (me.enrolled) {
    if (me.state === 'removed') return 'removed';
    return me.eligible ? 'member' : 'earningPaused';
  }
  if (!me.eligible) return 'notEligible';
  return me.enrolmentOpen ? 'canJoin' : 'paused';
}

/** The page's state: a token session first (nothing is sent; a session that changed under a read is refused unsent
 *  by core, TOKEN_SESSION_REFUSED), then the answer, then the read's error, else loading. */
export function readState(read: { account: boolean; isPending: boolean; info: ErrorInfo | null; me: Me | undefined }): State {
  if (!read.account) return 'token';
  if (read.me) return stateOf(read.me);
  if (read.info?.code === 'TOKEN_SESSION_REFUSED') return 'token';
  if (read.info) return 'error';
  return 'loading';
}

/** The header invites ("Invite people… you earn") only an account that earns or may join: never one whose earning is
 *  paused or removed, nor before the state is known (loading, error, token). */
export const invites = (state: State): boolean => state === 'member' || state === 'notEligible' || state === 'paused' || state === 'canJoin';

/** What the enrolled view shows: Copy, the share sentence and the Creator hint only while earning (`copy`); the form
 *  only with codes left. The page's questions follow `invites`. */
export function codeArea(state: State, me: Me): { copy: boolean; release: boolean; form: boolean; noCustom: boolean } {
  const earning = state === 'member';
  return {
    copy: earning,
    release: earning,
    form: earning && me.vanityLeft !== null && me.vanityLeft > 0,
    noCustom: earning && me.vanityLeft === 0,
  };
}

/** The release day in UTC ("3 Dec"): the API sends 00:00 UTC of the day, which a local format shows a day early west of UTC. */
export function releaseDay(iso: string | null, locale = 'en-GB'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/** A YYYY-MM month as "Oct 2026", in UTC (the month key is a calendar month, never a local time). */
export function monthLabel(month: string, locale = 'en-GB'): string {
  const m = MONTH.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export type CheckWords = {
  k: 'check.available' | 'check.taken' | 'check.invalid' | 'check.reserved' | 'check.unavailable' | 'check.tooFast' | 'check.failed';
  /** The form hides and `me` is read again, so the page state takes over. */
  reread?: true;
};

/** The words for a check answer: the API's `valid`, `available` and `reason` decide; there is no local shape rule. */
export function checkWords(raw: unknown): CheckWords | null {
  const d = rec(rec(raw).data);
  if (typeof d.valid !== 'boolean' || typeof d.available !== 'boolean') return null;
  if (d.reason === 'REFERRAL_CODE_INVALID') return { k: 'check.invalid' };
  if (d.reason === 'REFERRAL_CODE_RESERVED') return { k: 'check.reserved' };
  if (d.reason === 'REFERRAL_CODE_TAKEN') return { k: 'check.taken' };
  if (d.valid && d.available) return { k: 'check.available' };
  // Valid but not free with no reason: the code exists (codes are never reused).
  if (d.valid) return { k: 'check.taken' };
  return { k: 'check.invalid' };
}

const ISSUE_GONE = new Set(['REFERRAL_CODE_ISSUANCE_BLOCKED', 'AFFILIATE_NOT_ENROLLED', 'AFFILIATE_REMOVED', 'AFFILIATE_NOT_ELIGIBLE', 'REFERRAL_CODE_LIMIT_REACHED']);

/** The words for a check refusal: the account can't make codes now → the form hides and `me` is read again; a
 *  429 asks to slow down; a bare 400 (an out-of-bound code, no code in the body) reads as not allowed. Any other
 *  failure (a ban, a permission refusal, a 5xx, the network) says the check failed, with its Details: never silence. */
export function checkRefusalWords(info: ErrorInfo): CheckWords {
  if (info.code && ISSUE_GONE.has(info.code)) return { k: 'check.unavailable', reread: true };
  if (info.status === 429) return { k: 'check.tooFast' };
  if (info.status === 400 && info.code === null) return { k: 'check.invalid' };
  return { k: 'check.failed' };
}

// ── Writes ────────────────────────────────────────────────────────────────────────

/** A create's variables: the field as the server stores it, computed once at the press; the body, the lock and the
 *  proof all read this one frozen value. */
export const createVars = (field: string): Readonly<{ code: string }> => Object.freeze({ code: normCode(field) });

/** The newest fresh `me` (the page's shape) of a read-back, or null when there is none that is one. */
function freshMe(answers: readonly (readonly unknown[])[]): Me | null {
  const reads = answers[0] ?? [];
  const m = rec(reads[reads.length - 1]);
  return typeof m.enrolled === 'boolean' && Array.isArray(m.codes) ? (m as unknown as Me) : null;
}
const codeOfIdentity = (identity: unknown): string | null => {
  const c = rec(identity).code;
  return typeof c === 'string' && c ? c : null;
};
const lists = (m: Me, code: string): boolean => m.codes.some((c) => c.code === code);

/** The join: only a fresh `me` that reads enrolled proves it. Not enrolled proves nothing: the join may commit late. */
export function joinProves(_identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  return freshMe(answers)?.enrolled === true ? 'applied' : undefined;
}

/** A created code: only the code in the fresh listing proves it (blocked included: it was made). */
export function createProves(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const code = codeOfIdentity(identity);
  const m = freshMe(answers);
  return code && m && lists(m, code) ? 'applied' : undefined;
}

/** A released code: only a fresh listing without it proves it (the listing holds every active and blocked code of
 *  the account, so a released one is the only kind that leaves it). */
export function releaseProves(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const code = codeOfIdentity(identity);
  const m = freshMe(answers);
  return code && m && !lists(m, code) ? 'applied' : undefined;
}

export type ChangeKind = 'join' | 'create' | 'release';
type Refusal = { k: 'change.already' | 'first.paused.body' | 'first.notEligible.body' | 'band.removed' | 'check.taken' | 'check.invalid' | 'check.reserved' | 'codes.unavailable' | 'change.notRemovable' | 'change.notFound'; reread?: true };
const GONE: Refusal = { k: 'codes.unavailable', reread: true };

/** Each write's definite refusals, by the code its route lists. Banned and forbidden take the kit's words. */
export const REFUSALS: Readonly<Record<ChangeKind, Readonly<Record<string, Refusal>>>> = {
  join: {
    AFFILIATE_ALREADY_ENROLLED: { k: 'change.already', reread: true },
    AFFILIATE_ENROLMENT_PAUSED: { k: 'first.paused.body', reread: true },
    AFFILIATE_NOT_ELIGIBLE: { k: 'first.notEligible.body', reread: true },
    AFFILIATE_REMOVED: { k: 'band.removed', reread: true },
  },
  create: {
    REFERRAL_CODE_TAKEN: { k: 'check.taken' },
    REFERRAL_CODE_INVALID: { k: 'check.invalid' },
    REFERRAL_CODE_RESERVED: { k: 'check.reserved' },
    REFERRAL_CODE_LIMIT_REACHED: GONE,
    REFERRAL_CODE_ISSUANCE_BLOCKED: GONE,
    AFFILIATE_NOT_ENROLLED: GONE,
    AFFILIATE_REMOVED: GONE,
    AFFILIATE_NOT_ELIGIBLE: GONE,
  },
  release: {
    REFERRAL_CODE_NOT_REMOVABLE: { k: 'change.notRemovable', reread: true },
    REFERRAL_CODE_NOT_FOUND: { k: 'change.notFound', reread: true },
  },
};

export type ChangeNote =
  /** May have gone through: the page shows core's hold (Check again, the warned Stop watching), never words. */
  | { kind: 'held' }
  | { kind: 'words'; k: Refusal['k'] | 'change.checkFirst' | 'change.tooFast' | 'change.tooFastSoon'; v?: { n: string }; reread?: true }
  /** The kit's banner for this outcome and refusal (banned, forbidden, a refusal no route lists, unsent, late). */
  | { kind: 'kit'; outcome: 'failed' | 'not_sent' | 'stale'; error: { status?: number; code?: string } };

/** What the page says after a write (core's SourceResult). Pending is never words and never "failed" (C9). */
export function changeNote(kind: ChangeKind, r: { outcome: string; code?: string; status?: number; retryAfter?: number }): ChangeNote | null {
  if (r.outcome === 'done') return null;
  if (r.outcome === 'pending') return { kind: 'held' };
  if (r.outcome === 'not_sent' && r.code === 'READ_BACK_FIRST') return { kind: 'held' };
  // Another change of the same code (a create and a release share the lock) may have gone through: check it first.
  if (r.outcome === 'not_sent' && r.code === 'HELD_BY_OTHER') return { kind: 'words', k: 'change.checkFirst' };
  const error = { ...(r.status !== undefined ? { status: r.status } : {}), ...(r.code !== undefined ? { code: r.code } : {}) };
  if (r.outcome === 'failed') {
    if (r.status === 429) return r.retryAfter !== undefined ? { kind: 'words', k: 'change.tooFast', v: { n: String(r.retryAfter) } } : { kind: 'words', k: 'change.tooFastSoon' };
    // An out-of-bound code is a 400 with no code in the body: on create it reads as the check's INVALID words.
    if (kind === 'create' && r.status === 400 && !r.code) return { kind: 'words', k: 'check.invalid' };
    const words = r.code ? REFUSALS[kind][r.code] : undefined;
    if (words) return { kind: 'words', ...words };
    return { kind: 'kit', outcome: 'failed', error };
  }
  return { kind: 'kit', outcome: r.outcome === 'stale' ? 'stale' : 'not_sent', error };
}
