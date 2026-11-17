// Vitest: the checkout drawer may show more than one Band at once. That is accepted only
// while no two of them repeat one fact; this pins it.
// - What the drawer draws: `bands()` below is the drawer's own Band list, and the drawer's source is pinned to it (every
//   Band, its condition and its words), so a Band added, removed or re-conditioned there fails here.
// - What states exist: a breadth-first walk of the real reducer from `initialCheckout`, per kind, over every event the
//   adapters dispatch: every settleEvent answer (send and check) plus data.ts's own events and words
//   (only reachable states, each with its event path).
import { describe, expect, it } from 'vitest';
import {
  type CheckoutEvent,
  type CheckoutKind,
  type CheckoutQuote,
  type CheckoutState,
  checkoutReducer,
  confirmFooter,
  initialCheckout,
  shortfall,
} from './checkout-logic';
import drawer from './parts/CheckoutDrawer.tsx?raw';
import { type Change, type SendData, settleEvent } from './settle';
import type { Word } from './types';

/** What the drawer reads besides the reducer state: a suspended account, and a reserve in a browser without Web Locks. */
interface Env {
  banned: boolean;
  reserveNoLocks: boolean;
}

/**
 * The Bands CheckoutDrawer.tsx draws, by word key, in its order:
 * - the review body (review, posting, reconciling, with a quote): requote, notice, blocked, balance;
 * - UnknownBody (checking, unknown): the notice and the no-Web-Locks Band, neither while checking; a noLocks notice is
 *   left out where that Band shows (one fact);
 * - SuspendedLine (checking, unknown, done, already, not_found, when suspended).
 */
function bands(kind: CheckoutKind, s: CheckoutState, env: Env): string[] {
  const out: string[] = [];
  const p = s.phase;
  if ((p === 'review' || p === 'posting' || p === 'reconciling') && s.quote) {
    if (s.requote !== null) out.push('co.requoted');
    if (s.notice) out.push(s.notice.k);
    if (s.quote.blocked) out.push(s.quote.blocked.k);
    if (s.quote.balanceCents === null) out.push('mkt.balanceUnavailable');
  }
  if (p === 'unknown') {
    const noLocksBand = env.reserveNoLocks && kind === 'reserve';
    if (s.notice && !(noLocksBand && s.notice.k === 'noLocks')) out.push(s.notice.k);
    if (noLocksBand) out.push('mkt.reserveNoLocks');
  }
  if (env.banned && (p === 'checking' || p === 'unknown' || p === 'done' || p === 'already' || p === 'not_found')) out.push('mkt.suspended');
  return out;
}

/** Words that state one fact in other words. Any other word is its own fact. */
const FACT: Readonly<Record<string, string>> = {
  'co.requoted': 'the price changed',
  requote: 'the price changed',
  'buy.priceChanged': 'the price changed',
  'mkt.priceChanged': 'the price changed',
  'mkt.priceChangedNoQuote': 'the price changed',
  'buy.noRoom': 'no server is free',
  'buy.noRoomRefused': 'no server is free',
  'mkt.outOfStock': 'no server is free',
  'mkt.justTaken': 'no server is free',
  'buy.limit': 'at the plan limit',
  limitPlain: 'at the plan limit',
  'buy.limitRefused': 'at the plan limit',
  'mkt.balanceUnavailable': 'the balance is unreadable',
  noLocks: 'this browser cannot stop two tabs sending it twice',
  'mkt.reserveNoLocks': 'this browser cannot stop two tabs sending it twice',
  'mkt.suspended': 'the account is suspended',
};
const factOf = (k: string): string => FACT[k] ?? k;

/** The steps whose footer draws the reason line (renderFooter's review case). */
const FOOTER_REASON_PHASES: ReadonlySet<string> = new Set(['review', 'quoting', 'quote_error']);
/** The steps that draw the review body (with a quote): its Bands and the shortfall line. */
const REVIEW_BODY_PHASES: ReadonlySet<string> = new Set(['review', 'posting', 'reconciling']);

const quote = (o: Partial<CheckoutQuote> = {}): CheckoutQuote => ({
  chargeCents: 2500,
  balanceCents: 4000,
  blocked: null,
  warnings: [],
  notes: [],
  lines: [{ label: 'co.plan', cents: 2500 }],
  ...o,
});

const QUOTES: Array<[string, CheckoutQuote]> = [
  ['ok', quote()],
  ['no room', quote({ blocked: { k: 'buy.noRoom' } })],
  ['at the limit', quote({ blocked: { k: 'buy.limit', v: { max: 3 } } })],
  ['balance unknown', quote({ balanceCents: null })],
  ['short', quote({ chargeCents: 1200, balanceCents: 880 })],
];

const KINDS: CheckoutKind[] = ['buy', 'pay', 'upgrade', 'rent', 'reserve'];

const CODES: Array<string | undefined> = [
  undefined,
  'PLAN_NOT_AVAILABLE',
  'INSUFFICIENT_BALANCE',
  'CHARGE_EXCEEDS_MAX',
  'CHARGE_CONFIRMATION_REQUIRED',
  'SETUP_FEE_CONFIRMATION_REQUIRED',
  'PAID_SUBSERVER_LIMIT_REACHED',
  'NO_PAID_CAPACITY',
  'HOST_UNAVAILABLE',
  'IDEMPOTENCY_INTENT_MISMATCH',
  'RATE_LIMITED',
  'FORBIDDEN',
  'ACCOUNT_BANNED',
  'INVALID_DURATION',
  'OUT_OF_STOCK',
  'OFFER_UNAVAILABLE',
  'SERVER_UNAVAILABLE',
  'PRICING_INVALID',
  'NO_PRICING',
  'NOT_FOUND',
  'noLocks',
  'SOMETHING_NEW',
];

/** Every distinct event settleEvent gives this kind: each outcome, code, re-quote total and balance (absent, null, set). */
function settleEvents(kind: CheckoutKind): Array<[string, CheckoutEvent]> {
  const out = new Map<string, [string, CheckoutEvent]>();
  for (const outcome of ['done', 'pending', 'failed', 'not_sent', 'stale'] as const)
    for (const code of CODES)
      for (const totalCents of [undefined, null, 3000])
        for (const balanceCents of [undefined, null, 100])
          for (const phase of ['send', 'check'] as const) {
            const r: Change<SendData> = { outcome, code, data: { totalCents, balanceCents } };
            const e = settleEvent(kind, r, phase);
            if (e) out.set(JSON.stringify(e), [`${phase} ${outcome} ${code ?? '-'} total ${String(totalCents)} balance ${String(balanceCents)}`, e]);
          }
  return [...out.values()];
}

const w = (k: string): Word => ({ k }) as Word;

/** data.ts's own dispatches (beside settleEvent), with every word it passes. */
const OWN: Array<[string, CheckoutEvent]> = [
  ...QUOTES.map(([n, q]): [string, CheckoutEvent] => [`quoted ${n}`, { type: 'quoted', quote: q }]),
  ['quoteFailed', { type: 'quoteFailed' }],
  ['marketStale', { type: 'marketStale' }],
  ['banned', { type: 'banned' }],
  ['banned keep', { type: 'banned', keep: true }],
  ['consent on', { type: 'consent', on: true }],
  ['consent off', { type: 'consent', on: false }],
  ['confirmed', { type: 'confirmed' }],
  ['rentAgain', { type: 'rentAgain' }],
  ['tick', { type: 'tick' }],
  ['retrying', { type: 'retrying' }],
  ['restore', { type: 'restore' }],
  ['startOver', { type: 'startOver' }],
  ['again', { type: 'again' }],
  ['reconciling', { type: 'reconciling' }],
  ['checkStarted', { type: 'checkStarted' }],
  ['unknown', { type: 'unknown', retryIn: 0 }],
  // A resend core's admission refused for want of a granted Web Lock (data.ts, the settled machine's change).
  ['unknown noLocks', { type: 'unknown', retryIn: 0, word: w('noLocks') }],
  ['unknown noLocks, countdown', { type: 'unknown', retryIn: 20, word: w('noLocks') }],
  ['notSent noLocks', { type: 'notSent', word: w('noLocks') }],
  ['notSent buy.storeErr', { type: 'notSent', word: w('buy.storeErr') }],
  ...(['co.checkRented', 'co.checkRunning', 'co.checkPlanReached', 'co.checkPaid', 'co.checkCreated', 'co.checkCreatedPlain', 'co.checkReserved'] as const).map(
    (k): [string, CheckoutEvent] => [`checkUnknown ${k}`, { type: 'checkUnknown', word: w(k) }],
  ),
  ...[true, false].flatMap((dropped) =>
    [true, false].map((sending): [string, CheckoutEvent] => [`reserveNew dropped ${dropped} sending ${sending}`, { type: 'reserveNew', dropped, sending }]),
  ),
];

/**
 * Counters count only as zero or not, so the walk closes. Sound for `retryIn` because `tick` changes nothing else and
 * the walk also takes "the countdown runs out" in one step (one tick of 20 gives 19, the same key, so ticks
 * alone never reached zero). Nothing else reads a positive countdown's value; no Band reads `checks`.
 */
const keyOf = (s: CheckoutState): string => JSON.stringify({ ...s, checks: Math.min(s.checks, 1), retryIn: Math.min(s.retryIn, 1) });

function runOut(s: CheckoutState): CheckoutState {
  let cur = s;
  for (let i = 0; i < 1000; i++) {
    const n = checkoutReducer(cur, { type: 'tick' });
    if (n === cur) return cur;
    cur = n;
  }
  throw new Error('a countdown that never runs out');
}

interface Reached {
  kind: CheckoutKind;
  path: string[];
  s: CheckoutState;
}

/** The walk ends only when no new state is left (closure), within this bound. */
const MAX_STATES = 400_000;
const closed = new Map<CheckoutKind, boolean>();

function walk(kind: CheckoutKind): Reached[] {
  const steps: Array<[string, (s: CheckoutState) => CheckoutState]> = [
    ...[...OWN, ...settleEvents(kind)].map(([label, e]): [string, (s: CheckoutState) => CheckoutState] => [label, (s) => checkoutReducer(s, e)]),
    ['the countdown runs out', runOut],
  ];
  const seen = new Map<string, Reached>();
  let frontier: Reached[] = [{ kind, path: [], s: initialCheckout }];
  seen.set(keyOf(initialCheckout), frontier[0]!);
  while (frontier.length > 0 && seen.size < MAX_STATES) {
    const next: Reached[] = [];
    for (const r of frontier)
      for (const [label, step] of steps) {
        const s = step(r.s);
        const k = keyOf(s);
        if (seen.has(k)) continue;
        const n = { kind, path: [...r.path, label], s };
        seen.set(k, n);
        next.push(n);
      }
    frontier = next;
  }
  closed.set(kind, frontier.length === 0);
  return [...seen.values()];
}

const REACHED = KINDS.flatMap(walk);
const ENVS: Env[] = [false, true].flatMap((banned) => [false, true].map((reserveNoLocks) => ({ banned, reserveNoLocks })));
const find = (kind: CheckoutKind, ok: (s: CheckoutState) => boolean): Reached | undefined => REACHED.find((r) => r.kind === kind && ok(r.s));

describe('checkout Bands never repeat one fact', () => {
  it('the walk closes for every kind, and reaches from the start the paths the no-repeat rule is about', () => {
    expect(KINDS.map((k) => [k, closed.get(k)])).toEqual(KINDS.map((k) => [k, true]));
    const counting = find('reserve', (s) => s.phase === 'unknown' && s.retryIn > 0);
    expect(counting?.path, 'a reserve unknown with a countdown').toBeDefined();
    expect(checkoutReducer(runOut(counting!.s), { type: 'retrying' }).phase, 'its countdown runs out, then it retries').toBe('posting');
    const two = find('buy', (s) => bands('buy', s, { banned: false, reserveNoLocks: false }).length >= 2);
    expect(two?.path, 'a buy review with two Bands').toBeDefined();
    const dropped = find('buy', (s) => s.phase === 'review' && s.requote !== null && s.notice === null);
    expect(dropped?.path, 'a buy re-quote with the price word dropped').toBeDefined();
    const kept = find('reserve', (s) => s.phase === 'unknown' && s.notice?.k === 'mkt.reserveNewSending');
    expect(kept?.path, 'a reserve kept unknown with its reserveNew notice').toBeDefined();
    // A reserve kept unknown while Web Locks are missing is reachable, so the check below
    // judges it in the no-Web-Locks environment.
    const noLocks = find('reserve', (s) => s.phase === 'unknown' && s.notice?.k === 'noLocks');
    expect(noLocks?.path, 'a reserve unknown with its noLocks notice').toBeDefined();
  });

  it('no two Bands in any reached state, in any environment, say the same fact', () => {
    const repeats: string[] = [];
    for (const { kind, path, s } of REACHED)
      for (const env of ENVS) {
        const b = bands(kind, s, env);
        const facts = b.map(factOf);
        if (new Set(facts).size !== facts.length)
          repeats.push(`${kind}${env.banned ? ' suspended' : ''}${env.reserveNoLocks ? ' no-locks' : ''}: ${path.join(' > ')} => ${b.join(' + ')}`);
      }
    // One line per distinct repeat (kind and Bands), with the first path that reaches it.
    const first = new Map<string, string>();
    for (const r of repeats) {
      const k = r.slice(0, r.indexOf(':')) + ' => ' + r.slice(r.indexOf(' => ') + 4);
      if (!first.has(k)) first.set(k, r);
    }
    expect([...first.values()], `${repeats.length} states`).toEqual([]);
  });

  it("the footer reason never repeats a fact the body says (the no-repeat rule covers the footer line)", () => {
    // The drawer's footer line: Buy a plan's confirmFooter reason (pinned in checkout-confirm-tie.test.ts), drawn on the
    // review, quoting and quote_error steps only (pinned below). The body says the Bands and, on the review body, the
    // shortfall line beside Add funds (pinned below).
    const footer = (kind: CheckoutKind, s: CheckoutState, env: Env): Word | null =>
      kind === 'buy' && FOOTER_REASON_PHASES.has(s.phase) ? confirmFooter(s, env.banned).reason : null;
    const body = (kind: CheckoutKind, s: CheckoutState, env: Env): string[] => [
      ...bands(kind, s, env),
      ...(REVIEW_BODY_PHASES.has(s.phase) && s.quote && shortfall(s.quote) > 0 ? ['buy.short'] : []),
    ];
    // One entry per distinct repeat (kind, step, body, footer), with the first path that reaches it.
    const repeats = new Map<string, string>();
    const said = new Set<string>();
    let above = 0;
    for (const { kind, path, s } of REACHED)
      for (const env of ENVS) {
        const r = footer(kind, s, env);
        if (kind === 'buy' && confirmFooter(s, env.banned).saidAbove) above++;
        if (!r) continue;
        said.add(r.k);
        const b = body(kind, s, env);
        const k = `${kind}${env.banned ? ' suspended' : ''} ${s.phase}: ${b.join(' + ')} | footer ${r.k}`;
        if (b.map(factOf).includes(factOf(r.k)) && !repeats.has(k)) repeats.set(k, path.join(' > '));
      }
    expect([...repeats].map(([k, p]) => `${k} (${p})`)).toEqual([]);
    // Not vacuous: the walk reaches a buy footer that speaks, and the states whose reason the body says.
    expect(said.size, [...said].join(', ')).toBeGreaterThan(0);
    expect(above).toBeGreaterThan(0);
  });
});

/** The drawer's source between two markers, each found exactly once. */
function slice(from: string, to: string): string {
  expect(drawer.split(from)).toHaveLength(2);
  const rest = drawer.slice(drawer.indexOf(from));
  expect(rest.includes(to), to).toBe(true);
  return rest.slice(0, rest.indexOf(to));
}
const bandAttrs = (src: string): string[] => [...src.matchAll(/<Band\s+tone=(?:"[a-z]+"|\{[^}]+\})\s+dataAttr="([a-z-]+)"/g)].map((m) => m[1]!);

describe("bands() is the drawer's own Band list (source pin)", () => {
  it('the drawer draws exactly these Bands, in this order, and no other', () => {
    expect(bandAttrs(drawer)).toEqual(['locations-unread', 'handoff', 'blocked', 'requote', 'notice', 'balance', 'suspended', 'notice', 'nolocks']);
    expect(drawer.match(/<Band\b/g)).toHaveLength(9);
    // The first is the Location choice's own (LocationField): the plan's locations could not be read, with Try again.
    // It closes no gate (Automatic still buys), so the footer never says it, and it is drawn once, under the choice.
    expect(drawer).toMatch(/\{read\.isError && \(\s*<Band\s+tone="warn"\s+dataAttr="locations-unread"\s+error=\{read\.error\}/);
    expect(drawer.match(/<LocationField\b/g)).toHaveLength(1);
    // The hand-off band exists only on the standalone Hub (handoff !== null), so the served review this file models
    // never draws it: it says why there is no Confirm, a fact no other band or the footer states. It is made once and
    // placed on the three steps whose footer has no Confirm there: quoting, quote error and the review. The live terminal
    // draws its own hand-off in that slot instead (moneyHandoff.term.tsx, no Band; on the web moneyInWebHub() is false),
    // only on the steps that send nothing (noSendStep; the pattern also matches the form without that guard).
    expect(drawer).toMatch(/const handoffBand = handoff === null && moneyInWebHub\(\) \? (?:noSendStep && )?<MoneyHandoff \/> : handoff !== null && \(\s*<Band\s+tone="info"\s+dataAttr="handoff"/);
    expect(drawer.match(/\{handoffBand\}/g)).toHaveLength(3);
    // Each body that holds Bands is drawn from one place: the body once, UnknownBody once, and
    // SuspendedLine only at its three outcome sites.
    expect(drawer.match(/\brenderBody\(/g)).toHaveLength(2);
    expect(drawer.match(/body: renderBody\(/g)).toHaveLength(1);
    expect(drawer.match(/<UnknownBody\b/g)).toHaveLength(1);
    expect(drawer.match(/<SuspendedLine\b/g)).toHaveLength(3);
  });

  // The warn Bands carry a `noDetails:` reason (app/conformance.errors E1: state notices, no rejection to show).
  it('the review body: blocked, requote, notice and balance, on these conditions and words', () => {
    const review = slice("    case 'review':\n    case 'posting':\n    case 'reconciling': {", "    case 'checking':\n");
    expect(review).toContain('if (!q) return null;');
    // A refused location is said by its notice alone: the price read's "no room in <place>" for that place is not drawn again.
    // A price for another place than the one chosen carries Check again (a new read) on its Band.
    expect(review).toMatch(
      /const blocked = q\.blocked && !\(refusedLoc && q\.blocked\.k === 'loc\.noRoomIn'\) && \(\s*<Band\s+tone="warn"\s+dataAttr="blocked"(?: \/\* noDetails: [^*]+\*\/)?\s+actions=\{\s*q\.blocked\.k === 'loc\.mismatch' \|\| q\.blocked\.k === 'loc\.unread' \? \([\s\S]*?onPress=\{co\.reload\}[\s\S]*?\) : undefined\s*\}\s*>\s*\{say\(t, q\.blocked\)\}/,
    );
    expect(review).toMatch(/const refusedLoc = !!state\.notice && LOC_REFUSALS\.has\(state\.notice\.k\);/);
    expect(review).toMatch(/\{state\.requote !== null && \(\s*<Band tone="warn" dataAttr="requote"(?: \/\* noDetails: [^*]+\*\/)?>\s*\{t\('co\.requoted'/);
    // A purchase refused for its location is a warning; every other notice stays info.
    expect(review).toMatch(/\{state\.notice && \(\s*<Band tone=\{refusedLoc \? 'warn' : 'info'\} dataAttr="notice"(?: \/\* noDetails: [^*]+\*\/)?>\s*\{say\(t, state\.notice\)\}/);
    expect(review).toMatch(/\{q\.balanceCents === null && \(\s*<Band tone="warn" dataAttr="balance"(?: \/\* noDetails: [^*]+\*\/)?>\s*\{t\('mkt\.balanceUnavailable'\)\}/);
    expect(review.match(/\{kind === 'buy' && blocked\}/g)).toHaveLength(1);
    expect(review.match(/\{kind !== 'buy' && blocked\}/g)).toHaveLength(1);
    // Each Band is drawn once: the blocked element is named only where it is made and placed, and the
    // only lists the body maps are the money lines (other checkouts; Buy a plan's go through BuyMoney), the warnings and
    // the notes (the quote's notes less the one Buy a plan's plate says).
    const code = review.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/(?<![."\w])blocked\b(?!")/g)).toHaveLength(3);
    expect(review.match(/\.map\(/g)).toHaveLength(3);
    expect(review.match(/(?<![.\w])(?:q\.lines|q\.warnings|notes)\.map\(/g)).toHaveLength(3);
  });

  it('UnknownBody: the notice (not a noLocks one beside the no-Web-Locks Band) and that Band, neither while checking', () => {
    const unknown = slice('function UnknownBody(', 'function DoneBody(');
    expect(unknown).toMatch(
      /\{state\.notice && !checking && !\(co\.reserveNoLocks && state\.notice\.k === 'noLocks'\) && !\(co\.match && kind === 'rent' && state\.notice\.k === 'co\.checkRented'\) && \(\s*<Band tone="info" dataAttr="notice">\s*\{say\(t, state\.notice\)\}/,
    );
    expect(unknown).toMatch(/\{co\.reserveNoLocks && !checking && \(\s*<Band tone="info" dataAttr="nolocks">\s*\{t\('mkt\.reserveNoLocks'\)\}/);
    expect(unknown.match(/\.map\(|Array\.from|\.flatMap\(/g)).toBeNull();
  });

  it('SuspendedLine shows beside checking, unknown, done, already and not found only', () => {
    expect(drawer.match(/\{banned && <SuspendedLine t=\{t\} \/>\}/g)).toHaveLength(3);
    const outcomes = slice("    case 'checking':\n    case 'unknown':\n", '    case \'failed\':\n');
    expect(outcomes.match(/<SuspendedLine/g)).toHaveLength(3);
  });

  it("the footer's reason line is drawn once, on the review, quoting and quote_error steps only", () => {
    const footer = slice('function renderFooter(', '\n}\n');
    expect(footer.match(/\{reason && \(/g)).toHaveLength(1);
    // `reason` is read only there: the parameter, the line's guard and words, and Confirm's aria-describedby. (The
    // reasoned Confirm's own `reason=` prop takes `why`, the gate's words whether or not the body shows them.)
    const code = footer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/(?<![.\w])reason\b(?!=)/g)).toHaveLength(4);
    expect(code.match(/(?<![.\w])why\b/g)).toHaveLength(3);
    expect(footer).toMatch(/case 'review':\s*case 'quoting':\s*case 'quote_error':\s*return \(\s*<>\s*\{reason && \(\s*<span id=\{REASON_ID\}[^>]*>\s*\{say\(t, reason\)\}/);
    expect([...footer.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]).slice(2, 5)).toEqual(['review', 'quoting', 'quote_error']);
    expect(drawer.match(/REASON_ID\b/g)).toHaveLength(3);
  });

  it('the review body draws the shortfall sentence, the footer reason in other words, on shortfall(q) > 0', () => {
    const review = slice("    case 'review':\n    case 'posting':\n    case 'reconciling': {", "    case 'checking':\n");
    expect(review).toContain('const short = shortfall(q);');
    // Buy a plan: the wallet Ledger's strip, with a Short by warn row of the same number.
    expect(review.match(/<BuyMoney t=\{t\} q=\{q\} short=\{short\}/g)).toHaveLength(1);
    const money = slice('function BuyMoney(', 'function Consent(');
    expect(money).toMatch(/\.\.\.\(short > 0 \? \[\{ id: 'short', label: t\('buy\.shortBy'\), amount: <Money cents=\{short\} \/>, tone: 'warn' as const \}\] : \[\]\)/);
    expect(money).toMatch(/\.\.\.\(short > 0\s*\?\s*\{\s*attach: \{\s*text: t\('buy\.short', \{ amount: cents\(short\) \}\),/);
    // The other checkouts: the short box beside Add funds.
    // Each in its own words: a payment, an upgrade, else a purchase.
    expect(review).toMatch(/\{short > 0 && kind !== 'buy' && \(\s*<div className=\{s\.short\} data-short="">\s*<span>\{t\(kind === 'pay' \? 'subs\.payShort' : kind === 'upgrade' \? 'up\.short' : 'buy\.short', \{ amount: cents\(short\) \}\)\}<\/span>/);
    expect(drawer.match(/'buy\.short'/g)).toHaveLength(2);
  });
});
