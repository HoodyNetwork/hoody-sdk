// Vitest: the Referrals page's pure rules.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ErrorInfo } from '@core';
import { above0, bandWords, checkRefusalWords, checkWords, codeArea, invites, monthLabel, normCode, readState, releaseDay, selectMe, stateOf } from './logic';
import strings from './strings.en.json';

const me = (over: Record<string, unknown> = {}) => ({
  data: {
    eligible: true,
    enrolled: true,
    state: 'active',
    enrolment_open: true,
    level: 'referrer',
    rate_percent: '7.5',
    creator_threshold_active_customers: 11,
    codes: [{ code: 'k7m2q9xa', kind: 'random', state: 'active', link: 'https://api.hoody.com/auth/signup?ref=k7m2q9xa' }],
    vanity_codes_left: 3,
    counts: { signed_up: '7', paying: 'fewer_than_3', active: '0' },
    credit: { pending: '8.00', available: '12.40', reversed: '0.00', owed: '0.00' },
    monthly: [{ month: '2026-10', earned: '20.40', reversed: '0.00' }],
    next_release_at: '2026-12-03T00:00:00.000Z',
    ...over,
  },
});

const info = (o: Partial<ErrorInfo>): ErrorInfo => ({ outcome: 'failed', status: null, code: null, message: null, traceId: null, route: null, at: '', page: null, retryAfterMs: null, perm: null, ...o }) as ErrorInfo;

describe('normCode', () => {
  it('trims then lowercases, once (the server first step)', () => {
    expect(normCode(' Maya-Builds ')).toBe('maya-builds');
    expect(normCode(' abcd\t')).toBe('abcd');
  });
});

describe('band_words_never_numbers', () => {
  it('maps each band to words and keeps the number only from 3', () => {
    expect(bandWords('0')).toEqual({ k: 'band.none' });
    expect(bandWords('fewer_than_3')).toEqual({ k: 'band.few' });
    expect(bandWords('3')).toEqual({ k: 'band.n', v: { n: '3' } });
    expect(bandWords('42')).toEqual({ k: 'band.n', v: { n: '42' } });
    for (const b of ['1', '2', '03', '-1', 'many', null]) expect(bandWords(b)).toEqual({ k: 'band.unknown' });
  });
  it('selectMe keeps a known band and drops anything else to null (shown as a dash)', () => {
    const m = selectMe(me({ counts: { signed_up: 'fewer_than_3', paying: '2', active: 12 } }));
    expect(m.counts).toEqual({ signedUp: 'fewer_than_3', paying: null, active: null });
  });
});

describe('link_shown_as_given', () => {
  it('keeps the API link byte for byte, and a blocked code has no link', () => {
    const odd = 'https://api.hoody.com/auth/signup?ref=Maya%2DB&x=1';
    const m = selectMe(me({ codes: [{ code: 'maya-b', kind: 'vanity', state: 'active', link: odd }, { code: 'gone1', kind: 'vanity', state: 'blocked', link: 'https://api.hoody.com/auth/signup?ref=gone1' }] }));
    expect(m.codes[0]).toEqual({ code: 'maya-b', kind: 'vanity', state: 'active', link: odd });
    expect(m.codes[1]?.link).toBeNull();
    expect(m.codes[1]?.state).toBe('blocked');
  });
});

describe('selectMe', () => {
  it('reads every field of the answer', () => {
    const m = selectMe(me());
    expect(m).toMatchObject({ eligible: true, enrolled: true, state: 'active', enrolmentOpen: true, level: 'referrer', ratePercent: '7.5', creatorThreshold: 11, vanityLeft: 3, nextReleaseAt: '2026-12-03T00:00:00.000Z' });
    expect(m.credit).toEqual({ pending: '8.00', available: '12.40', reversed: '0.00', owed: '0.00' });
    expect(m.monthly).toEqual([{ month: '2026-10', earned: '20.40', reversed: '0.00' }]);
  });
  it('a level the API names with neither word is unknown, never Referrer', () => {
    expect(selectMe(me({ level: 'creator' })).level).toBe('creator');
    expect(selectMe(me({ level: 'referrer' })).level).toBe('referrer');
    for (const level of ['partner', '', null, undefined, 3]) expect(selectMe(me({ level })).level).toBe('unknown');
  });
  it('money that fails the shape is null, never a guess ("12.5", "abc", -1, 12)', () => {
    const m = selectMe(me({ credit: { pending: '12.5', available: 'abc', reversed: -1, owed: 12 }, monthly: [{ month: '2026-09', earned: '1,000.00', reversed: '0.00' }] }));
    expect(m.credit).toEqual({ pending: null, available: null, reversed: null, owed: null });
    expect(m.monthly[0]?.earned).toBeNull();
  });
  it('drops a month that is not YYYY-MM and keeps the API order (only months with earnings)', () => {
    const m = selectMe(me({ monthly: [{ month: '2026-10', earned: '1.00', reversed: '0.00' }, { month: 'Oct', earned: '1.00' }, { month: '2026-07', earned: '2.00', reversed: '0.50' }] }));
    expect(m.monthly.map((x) => x.month)).toEqual(['2026-10', '2026-07']);
  });
  it('a body that is not the answer throws (a malformed read proves nothing)', () => {
    expect(() => selectMe({ data: { enrolled: true } })).toThrow();
    expect(() => selectMe(null)).toThrow();
    expect(() => selectMe(me({ codes: 'x' }))).toThrow();
    expect(() => selectMe(me({ state: null }))).toThrow();
    expect(() => selectMe(me({ codes: [{ kind: 'random' }] }))).toThrow();
    // Structure the API always sends: missing or mistyped, the body is not the answer (never canJoin or an empty history).
    expect(() => selectMe({ data: { eligible: true, enrolled: false, codes: [] } })).toThrow();
    expect(() => selectMe(me({ enrolment_open: undefined }))).toThrow();
    expect(() => selectMe(me({ enrolment_open: 'yes' }))).toThrow();
    expect(() => selectMe(me({ monthly: undefined }))).toThrow();
    expect(() => selectMe(me({ monthly: {} }))).toThrow();
  });
  it('reads the Creator share and the customers who count for Creator (a band, never a number below 3)', () => {
    const m = selectMe(me({ creator_rate_percent: '10', creator_customers: 'fewer_than_3' }));
    expect(m.creatorRatePercent).toBe('10');
    expect(m.creatorCustomers).toBe('fewer_than_3');
    expect(selectMe(me({ creator_rate_percent: '12.5', creator_customers: '14' }))).toMatchObject({ creatorRatePercent: '12.5', creatorCustomers: '14' });
    expect(selectMe(me({ creator_customers: '0' })).creatorCustomers).toBe('0');
  });
  it('an answer without the Creator fields (an older API) is still the answer: no share, no count', () => {
    const m = selectMe(me());
    expect(m.creatorRatePercent).toBe('');
    expect(m.creatorCustomers).toBeNull();
  });
  it('a Creator share or count in no known shape is empty or null, never a guess', () => {
    for (const r of [10, '10%', 'ten', '', null, '1000', '10\n', ' 10']) expect(selectMe(me({ creator_rate_percent: r })).creatorRatePercent).toBe('');
    for (const c of [2, '2', '1', '03', 'many', -1, null, '', '3\n', '12 ']) expect(selectMe(me({ creator_customers: c })).creatorCustomers).toBeNull();
  });
  it('a rate that is not a percent string is empty; a bad threshold is null', () => {
    expect(selectMe(me({ rate_percent: 5 })).ratePercent).toBe('');
    expect(selectMe(me({ rate_percent: '5%' })).ratePercent).toBe('');
    expect(selectMe(me({ creator_threshold_active_customers: 0 })).creatorThreshold).toBeNull();
    expect(selectMe(me({ next_release_at: 'soon' })).nextReleaseAt).toBeNull();
  });
});

describe('states_match_fixtures and earning_paused_state', () => {
  const s = (o: Record<string, unknown>) => stateOf(selectMe(me(o)));
  it('maps each answer to its page state', () => {
    expect(s({})).toBe('member');
    expect(s({ eligible: false })).toBe('earningPaused');
    expect(s({ state: 'removed' })).toBe('removed');
    expect(s({ state: 'removed', eligible: false })).toBe('removed');
    expect(s({ enrolled: false, state: null, eligible: false })).toBe('notEligible');
    expect(s({ enrolled: false, state: null, enrolment_open: false })).toBe('paused');
    expect(s({ enrolled: false, state: null })).toBe('canJoin');
  });
  it('a read without an answer: loading, the token refusal, or an error', () => {
    expect(readState({ account: true, isPending: true, info: null, me: undefined })).toBe('loading');
    expect(readState({ account: true, isPending: false, info: info({ outcome: 'not_sent', code: 'TOKEN_SESSION_REFUSED' }), me: undefined })).toBe('token');
    expect(readState({ account: true, isPending: false, info: info({ status: 500 }), me: undefined })).toBe('error');
    // A token session is the token state whatever the read holds.
    expect(readState({ account: false, isPending: false, info: null, me: selectMe(me()) })).toBe('token');
  });
  it('Copy and the form only while earning; removed and earning paused get neither (and no Release)', () => {
    const m = selectMe(me());
    expect(codeArea('member', m)).toEqual({ copy: true, release: true, form: true, noCustom: false });
    expect(codeArea('earningPaused', m)).toEqual({ copy: false, release: false, form: false, noCustom: false });
    expect(codeArea('removed', m)).toEqual({ copy: false, release: false, form: false, noCustom: false });
  });
  it('the header invites only an account that earns or may join, never before the state is known', () => {
    for (const st of ['member', 'notEligible', 'paused', 'canJoin'] as const) expect(invites(st)).toBe(true);
    for (const st of ['earningPaused', 'removed', 'loading', 'error', 'token'] as const) expect(invites(st)).toBe(false);
  });
});

describe('no_custom_codes_neutral', () => {
  it('a member with 0 custom codes left gets the neutral line, no form', () => {
    const m = selectMe(me({ vanity_codes_left: 0 }));
    expect(codeArea('member', m)).toEqual({ copy: true, release: true, form: false, noCustom: true });
    // A value that is not a whole number from 0 is unknown capacity, never a 0: no form, no unavailable line
    for (const bad of [undefined, null, -1, 1.5, '2', Number.NaN]) {
      const u = selectMe(me({ vanity_codes_left: bad }));
      expect(u.vanityLeft).toBeNull();
      expect(codeArea('member', u)).toEqual({ copy: true, release: true, form: false, noCustom: false });
    }
    // The Hub can't tell why no code can be made (3 active, 10 made, an admin block, or
    // eligibility the read doesn't show; LIMIT_REACHED covers 3 active and 10 made),
    // so neither line names a cause; the Your own codes rule line states both limits
    expect(strings['codes.unavailable']).toBe('No more codes of your own can be made now.');
    expect(strings['check.unavailable']).toBe('No more codes of your own can be made now.');
    for (const k of ['codes.unavailable', 'check.unavailable', 'codes.unavailableFull'] as const) expect(strings[k]).not.toMatch(/10|never resets|retire/i);
  });
});

describe('release_date_label: the day in UTC', () => {
  const tz = process.env.TZ;
  // West of UTC, a local format shows 00:00 UTC of the 3rd as the 2nd.
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = tz;
  });
  it('formats 00:00 UTC of the release day as that day, west of UTC too', () => {
    expect(new Date('2026-12-03T00:00:00.000Z').getDate()).toBe(2);
    expect(releaseDay('2026-12-03T00:00:00.000Z')).toBe('3 Dec');
    expect(releaseDay(null)).toBeNull();
    expect(releaseDay('soon')).toBeNull();
  });
  it('labels the date "Next credit due" with the review and refund hint', () => {
    expect(strings['credit.release']).toBe('Next credit due {{date}}');
    expect(strings['credit.releaseNote']).toBe('Processing or a review can make it arrive later; refunds can reduce or reverse credit.');
  });
  it('a month key is a calendar month, also in UTC', () => {
    expect(monthLabel('2026-10')).toBe('Oct 2026');
    expect(monthLabel('2026-01')).toBe('Jan 2026');
    expect(monthLabel('bad')).toBe('bad');
  });
});

describe('monthly_caption_and_empty', () => {
  it('says earned includes held credit, that empty months are not listed, and has its empty line', () => {
    expect(strings['monthly.caption']).toContain('including credit still on hold');
    expect(strings['monthly.caption']).toContain('Months without earnings are not listed.');
    expect(strings['monthly.empty']).toBe('No earnings recorded yet.');
    expect(JSON.stringify(strings)).not.toContain('after the 60-day hold');
  });
});

describe('earning_words_match_program_rules', () => {
  // The page's questions carry the rules of How you earn, every limit kept.
  const how = (['rate', 'notCounted', 'window', 'bareMetal', 'hold', 'spend', 'privacy'] as const).map((id) => strings[`faq.${id}.a`]).join(' ');
  it('names what counts and what does not, and every window', () => {
    for (const w of ['card or crypto', 'setup fees', 'Hoody AI', 'promotional', 'bonus', 'Referral credit', '12 months', '90 days', 'three calendar months', '60 days', 'refunds']) expect(how).toContain(w);
  });
  it('the Join confirm says the share, that credit is not cash and that the Hub cannot undo joining', () => {
    expect(strings['join.body.unknown']).toBe(strings['join.body'].replace('{{rate}}%', 'a share'));
    expect(strings['join.creditOnly']).toMatch(/servers only/);
    expect(strings['join.creditOnly']).toMatch(/not cash/);
    expect(strings['join.creditOnly']).toMatch(/can't be sent to another account or moved to AI, and it can't be withdrawn, except that Creators can ask Hoody support about withdrawing their credit/);
  });
  it('writes no share as a number: the rate is always {{rate}} from the API', () => {
    expect(JSON.stringify(strings)).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(strings['join.body']).toContain('{{rate}}%');
    expect(strings['level.referrer']).toBe('Referrer · {{rate}}%');
    expect(strings['level.creator']).toBe('Creator · {{rate}}%');
  });
  // The rule names customers who count for Creator, never paying ones (Paying is a
  // different count), and a missing number reads as words, never a figure.
  it('the level words name customers who count, never paying customers, and write no figure', () => {
    expect(strings['levels.creatorLead']).toBe("from the month after {{n}} or more customers you referred have earned you credit that wasn't all reversed");
    expect(strings['levels.creatorLeadUnknown']).toBe("from the month after the Creator number of customers you referred have earned you credit that wasn't all reversed");
    expect(strings['stand.lead']).toBe('Customers who count for Creator');
    expect(strings['levels.caption']).toBe("Your share depends on your level. Each purchase earns at the level of the month it's activated.");
    for (const [k, v] of Object.entries(strings)) if (/^(ladder|levels|stand)\./.test(k)) expect(v.replace(/\{\{[^}]*\}\}/g, '')).not.toMatch(/paying|\d/i);
    // band.few is the API's own band ("fewer_than_3") in words, one wording on every section.
    expect(strings['band.few']).toBe('Fewer than 3');
  });
  it('the code kinds are chips with names, never a word after a "·"', () => {
    expect(strings['code.main']).toBe('Main');
    expect(strings['code.custom']).toBe('Your own');
    expect(Object.keys(strings)).not.toContain('code.line');
  });
  it('the Guide summary is as true as the rules: activation, bare metal, the hold under review, refunds', () => {
    const g = strings['guide.how.body'];
    for (const w of ['card or crypto', '12 months', 'qualifying server purchase activates', '3 calendar months', 'Setup fees', 'promotional, bonus or Referral credit', '60 days from activation', 'under review', 'Refunds'])
      expect(g).toContain(w);
    expect(g).not.toMatch(/from their first server purchase/);
  });
  // Any delivered server purchase counts, a plan, a bare-metal rental or a fulfilled
  // reservation, but only what was paid by card or crypto.
  // Mixed funding qualifies while some card or crypto part stays unrefunded (eligibility service paid_cents > refunded_paid_cents).
  // The rule itself is the eligible question's answer; the empty state keeps one short line and links to it.
  it('the not-eligible words name any paid server purchase, not only a plan, and say what does not count', () => {
    expect(strings['first.notEligible.title']).toBe('Join after a paid purchase');
    expect(strings['first.notEligible.body']).toBe('Join after your first paid server purchase.');
    expect(strings['faq.eligible.a']).toBe("Any delivered server purchase counts, including a plan, bare-metal rental or fulfilled reservation, if some of what you paid by card or crypto remains unrefunded. Credits and promotions don't count toward that paid amount.");
    for (const k of ['first.notEligible.title', 'first.notEligible.body', 'faq.eligible.a'] as const) expect(strings[k]).not.toMatch(/server plan/i);
  });
});

describe('check_words_follow_api_reason: no local shape rule', () => {
  const ans = (o: Record<string, unknown>) => ({ data: { code: 'x', valid: true, available: true, reason: null, ...o } });
  it('follows valid, available and reason', () => {
    expect(checkWords(ans({}))).toEqual({ k: 'check.available' });
    expect(checkWords(ans({ available: false, reason: 'REFERRAL_CODE_TAKEN' }))).toEqual({ k: 'check.taken' });
    expect(checkWords(ans({ valid: false, available: false, reason: 'REFERRAL_CODE_INVALID' }))).toEqual({ k: 'check.invalid' });
    expect(checkWords(ans({ valid: false, available: false, reason: 'REFERRAL_CODE_RESERVED' }))).toEqual({ k: 'check.reserved' });
    expect(checkWords(ans({ available: false }))).toEqual({ k: 'check.taken' });
    expect(checkWords({ data: {} })).toBeNull();
  });
  it('a code the Hub would think odd is still the API\'s call ("UP" with valid true is available)', () => {
    expect(checkWords({ data: { code: 'UP', valid: true, available: true, reason: null } })).toEqual({ k: 'check.available' });
  });
  it('TAKEN says taken or used before', () => {
    expect(strings['check.taken']).toBe('That code is taken or was used before.');
  });
});

describe('check_refusals_rereads_me', () => {
  it('a refusal saying the account cannot make codes hides the form and reads the program again', () => {
    for (const code of ['REFERRAL_CODE_ISSUANCE_BLOCKED', 'AFFILIATE_NOT_ENROLLED', 'AFFILIATE_REMOVED', 'AFFILIATE_NOT_ELIGIBLE', 'REFERRAL_CODE_LIMIT_REACHED'])
      expect(checkRefusalWords(info({ status: 403, code }))).toEqual({ k: 'check.unavailable', reread: true });
  });
  it('a 429 asks to slow down; a bare 400 reads as not allowed; anything else has no words of its own', () => {
    expect(checkRefusalWords(info({ status: 429 }))).toEqual({ k: 'check.tooFast' });
    expect(checkRefusalWords(info({ status: 400 }))).toEqual({ k: 'check.invalid' });
    expect(checkRefusalWords(info({ status: 400, code: 'VALIDATION_ERROR' }))).toEqual({ k: 'check.failed' });
    expect(checkRefusalWords(info({ status: 500 }))).toEqual({ k: 'check.failed' });
  });
});

describe('above0', () => {
  it('only a known amount above zero', () => {
    expect(above0('3.00')).toBe(true);
    expect(above0('0.01')).toBe(true);
    expect(above0('0.00')).toBe(false);
    expect(above0(null)).toBe(false);
  });
});
