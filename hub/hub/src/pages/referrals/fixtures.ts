// Fake-API states of the Referrals page for hub:dev, hub:shots, tests and specs: one fixture
// per page state. Every link is the API's own (`https://api.hoody.com/auth/signup?ref=…`); the page shows it as given.
// The check answers by the code asked: "maya-builds" is free, "taken-one" is taken, anything else follows the API's
// own shape rule only in this fake (the page has none). The write states (Set C) keep one account per render: the
// world starts again at the first program read of a render (a rule's attempt count starts at 1 per render), and a
// write changes it, so the read-back after it shows what the server would. "lost" loses the answer of a write that did
// not apply (it stays held: nothing proves it); "lostApplied" applies it and loses the answer.
import { answers, defineFixtures, fixtureSession, fixtureWorld, reply, type FixtureRequest, type FixtureRule } from '@core';
import { routes } from './routes';

const LINK = 'https://api.hoody.com/auth/signup?ref=';
const code = (c: string, kind: 'random' | 'vanity', state: 'active' | 'blocked' = 'active') => ({
  code: c,
  kind,
  state,
  link: state === 'active' ? LINK + c : null,
});

/** The sample member: an earning Referrer with a random and a custom code. */
export const MEMBER = {
  eligible: true,
  enrolled: true,
  state: 'active',
  enrolment_open: true,
  level: 'referrer',
  rate_percent: '5',
  creator_threshold_active_customers: 11,
  creator_rate_percent: '10',
  creator_customers: 'fewer_than_3',
  codes: [code('k7m2q9xa', 'random'), code('maya-builds', 'vanity')],
  vanity_codes_left: 2,
  counts: { signed_up: '7', paying: 'fewer_than_3', active: 'fewer_than_3' },
  credit: { pending: '8.00', available: '12.40', reversed: '0.00', owed: '0.00' },
  monthly: [
    { month: '2026-10', earned: '6.40', reversed: '0.00' },
    { month: '2026-09', earned: '9.00', reversed: '0.00' },
    { month: '2026-07', earned: '5.00', reversed: '0.00' },
  ],
  next_release_at: '2026-12-03T00:00:00.000Z',
};

const NEWCOMER = {
  ...MEMBER,
  enrolled: false,
  state: null,
  codes: [],
  vanity_codes_left: 0,
  creator_customers: '0',
  counts: { signed_up: '0', paying: '0', active: '0' },
  credit: { pending: '0.00', available: '0.00', reversed: '0.00', owed: '0.00' },
  monthly: [],
  next_release_at: null,
};

type Me = Record<string, unknown>;
const me = (data: Me | 'error' | 'slow'): FixtureRule =>
  reply(routes.me, () =>
    data === 'error' ? answers.refused(500, 'SERVER_ERROR') : data === 'slow' ? answers.slow({ data: MEMBER }, 60000) : answers.ok({ data }));

const codeOf = (r: FixtureRequest): string => r.query.code ?? '';
const check = (o: { refuse?: [number, string | null] } = {}): FixtureRule =>
  reply(routes.check, (r) => {
    // A bare refusal (a 429, or the schema's 400) carries no code in its body.
    if (o.refuse) return o.refuse[1] === null ? { status: o.refuse[0], body: {} } : answers.refused(o.refuse[0], o.refuse[1]);
    const c = codeOf(r);
    if (c === 'taken-one') return answers.ok({ data: { code: c, valid: true, available: false, reason: 'REFERRAL_CODE_TAKEN' } });
    if (c === 'admin') return answers.ok({ data: { code: c, valid: false, available: false, reason: 'REFERRAL_CODE_RESERVED' } });
    if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){3,19}$/.test(c)) return answers.ok({ data: { code: null, valid: false, available: false, reason: 'REFERRAL_CODE_INVALID' } });
    return answers.ok({ data: { code: c, valid: true, available: true, reason: null } });
  });

const rules = (data: Me | 'error' | 'slow', o: Parameters<typeof check>[0] = {}): FixtureRule[] => [me(data), check(o)];

type Mode = 'ok' | 'lost' | 'lostApplied' | readonly [number, string];
interface WorldOpts {
  join?: Mode;
  create?: Mode;
  release?: Mode;
  /** After a write applied, the program read answers this (a malformed body or a failed read: nothing is proved). */
  readBack?: 'malformed' | 'error';
}
/** One account that the writes change, starting again at each render's first program read. */
function world(base: Me, o: WorldOpts = {}): FixtureRule[] {
  let w = { ...base, codes: [...(base.codes as unknown[])] } as Me & { codes: unknown[] };
  let wrote = false;
  const answer = (mode: Mode | undefined, apply: () => void, ok: () => unknown, status = 200) => {
    const m = mode ?? 'ok';
    if (m === 'lost') return answers.pending5xx();
    if (m === 'lostApplied') {
      apply();
      wrote = true;
      return answers.pending5xx();
    }
    if (m !== 'ok') return answers.refused(m[0], m[1]);
    apply();
    wrote = true;
    return { status, body: ok() };
  };
  return [
    reply(routes.me, (r) => {
      if (r.n === 1) {
        w = { ...base, codes: [...(base.codes as unknown[])] } as typeof w;
        wrote = false;
      }
      if (wrote && o.readBack === 'malformed') return answers.ok({ data: { enrolled: true, codes: w.codes } });
      if (wrote && o.readBack === 'error') return answers.refused(500, 'SERVER_ERROR');
      return answers.ok({ data: w });
    }),
    check(),
    reply(routes.join, () =>
      answer(o.join, () => {
        w = { ...w, enrolled: true, state: 'active', codes: [code('q4n8w2zt', 'random')], vanity_codes_left: 3 };
      }, () => ({ data: w }), 201),
    ),
    reply(routes.create, (r) => {
      const c = String((r.body as { code?: unknown } | null)?.code ?? '');
      return answer(o.create, () => {
        w = { ...w, codes: [...w.codes, code(c, 'vanity')], vanity_codes_left: Math.max(0, Number(w.vanity_codes_left) - 1) };
      }, () => ({ data: code(c, 'vanity') }), 201);
    }),
    reply(routes.release, (r) => {
      const c = decodeURIComponent(r.path.split('/').pop() ?? '');
      return answer(o.release, () => {
        w = { ...w, codes: w.codes.filter((x) => (x as { code: string }).code !== c) };
      }, () => ({ data: { code: c, released: true } }));
    }),
  ];
}

export default defineFixtures({
  default: 'default',
  states: {
    /** An earning member: link, codes, credit, level, counts and the months with earnings. Create and Release work. */
    default: world(MEMBER),
    loading: rules('slow'),
    /** The program read fails. */
    error: rules('error'),
    /** A shared-access (token) session: every /referrals call is refused unsent. */
    token: [fixtureSession({ kind: 'token', caps: ['financial.wallet.read'], realm: fixtureWorld.realms[0]?.id ?? '' }), ...rules(MEMBER)],
    /** Not eligible yet and not enrolled: pay for a plan first. */
    notEligible: rules({ ...NEWCOMER, eligible: false }),
    /** Eligible, but joining is paused for everyone. */
    paused: rules({ ...NEWCOMER, enrolment_open: false }),
    /** Eligible and joining is open: Join… joins (the read-back shows a member). */
    canJoin: world(NEWCOMER),
    /** The same with no share sent (rate_percent null): the Join confirm says "a share", never a number. */
    canJoinNoRate: world({ ...NEWCOMER, rate_percent: null }),
    /** Join's answer is lost and it did not apply: held, Check again keeps it held, nothing is sent again. */
    joinPending: world(NEWCOMER, { join: 'lost' }),
    /** A custom code's answer is lost and it did not apply. */
    createPending: world(MEMBER, { create: 'lost' }),
    /** A release's answer is lost and it did not apply. */
    releasePending: world(MEMBER, { release: 'lost' }),
    /** A create applied but its answer was lost, and the read-back is malformed: still held (a bad read proves nothing). */
    readbackMalformed: world(MEMBER, { create: 'lostApplied', readBack: 'malformed' }),
    /** The same with a failed read-back. */
    readbackError: world(MEMBER, { create: 'lostApplied', readBack: 'error' }),
    /** Create refused: someone has the code (or had it). */
    createTaken: world(MEMBER, { create: [409, 'REFERRAL_CODE_TAKEN'] }),
    /** Create refused: the account can't make codes now; the form hides and the program is read again. */
    createIssuanceBlocked: world(MEMBER, { create: [403, 'REFERRAL_CODE_ISSUANCE_BLOCKED'] }),
    /** The check is refused for going too fast; Create stays allowed. */
    check429: [me(MEMBER), check({ refuse: [429, null] })],
    /** The check fails for another reason (a 5xx): it says so, with Details; never silence. */
    check500: [me(MEMBER), check({ refuse: [500, null] })],
    /** The check answers that the account can't make codes now: the form hides and the program is read again. */
    checkGone: [me(MEMBER), check({ refuse: [403, 'REFERRAL_CODE_ISSUANCE_BLOCKED'] })],
    /** Release refused: only an active custom code can be released. */
    releaseNotRemovable: world(MEMBER, { release: [409, 'REFERRAL_CODE_NOT_REMOVABLE'] }),
    /** Enrolled and active but not eligible: no Copy, no form, credit and history kept. */
    earningPaused: rules({ ...MEMBER, eligible: false, vanity_codes_left: 0 }),
    /** Removed from the program. */
    removed: rules({ ...MEMBER, state: 'removed', vanity_codes_left: 0 }),
    /** The custom code was blocked: no link, no Copy. */
    blocked: rules({ ...MEMBER, codes: [code('k7m2q9xa', 'random'), code('maya-builds', 'vanity', 'blocked')] }),
    /** No custom codes left (or issuance blocked): one neutral line, no reason guessed. */
    noCustomCodes: rules({ ...MEMBER, vanity_codes_left: 0 }),
    /** Credit taken back after it was spent. */
    owed: rules({ ...MEMBER, credit: { ...MEMBER.credit, available: '0.00', owed: '3.00', reversed: '3.00' } }),
    /** Credit on hold but no release date in the answer: the date line hides, the hold hint and its FAQ peek stay. */
    heldNoDate: rules({ ...MEMBER, next_release_at: null }),
    /** The largest amounts usdText takes (13 digits): every digit and every label stays readable at 390. */
    bigCredit: rules({ ...MEMBER, credit: { ...MEMBER.credit, available: '9999999999999.99', pending: '8888888888888.88' } }),
    /** No earnings yet and no release scheduled. */
    noMonthly: rules({ ...MEMBER, monthly: [], credit: { pending: '0.00', available: '0.00', reversed: '0.00', owed: '0.00' }, next_release_at: null, counts: { signed_up: '0', paying: '0', active: '0' }, creator_customers: '0' }),
    /** An earning Referrer whose answer has no Creator number: the ladder names no figure. */
    noThreshold: rules({ ...MEMBER, creator_threshold_active_customers: null }),
    /** An earning Referrer whose answer sends no share: a dash, never a guessed number. */
    noRate: rules({ ...MEMBER, rate_percent: null }),
    /** An older API answer without the Creator share and count: no Creator number and no "where you stand" figure. */
    noCreatorFields: rules({ ...MEMBER, creator_rate_percent: undefined, creator_customers: undefined }),
    /** A Creator at a share the API sends (7.5): no percentage is written in the Hub. */
    creator: rules({ ...MEMBER, level: 'creator', rate_percent: '7.5', creator_rate_percent: '7.5', creator_customers: '12', counts: { signed_up: '42', paying: '14', active: '12' } }),
    /** A Creator whose earning is paused: Withdraw… still says how a Creator asks. */
    creatorPaused: rules({ ...MEMBER, eligible: false, vanity_codes_left: 0, level: 'creator', rate_percent: '7.5', creator_rate_percent: '7.5', creator_customers: '12' }),
    /** A level the API names with neither word (or not at all): the page says it is not known, never Referrer.
     *  Its share this month (7.5) is neither tier's, so the Referrer card must not show it. */
    unknownLevel: rules({ ...MEMBER, level: 'partner', rate_percent: '7.5' }),
    /** The same, with earning paused: the plain level tile says it is not known. */
    unknownLevelPaused: rules({ ...MEMBER, eligible: false, vanity_codes_left: 0, level: undefined }),
    /** Money the API sent in no known shape: dashes, never a guess. */
    oddMoney: rules({ ...MEMBER, credit: { pending: '8', available: 'abc', reversed: '-1.00', owed: 12 } }),
  },
});
