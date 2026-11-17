// Vitest: the Referrals writes' pure rules: what a fresh `me` proves about a join,
// a created code and a released code (only "applied", never "not applied"), and the words of every answer.
import { describe, expect, it } from 'vitest';
import { REFUSALS, changeNote, createProves, createVars, joinProves, releaseProves, selectMe, type Me } from './logic';
import { routes } from './routes';
import strings from './strings.en.json';

const raw = (over: Record<string, unknown> = {}) => ({
  data: {
    eligible: true,
    enrolled: true,
    state: 'active',
    enrolment_open: true,
    level: 'referrer',
    rate_percent: '5',
    codes: [
      { code: 'k7m2q9xa', kind: 'random', state: 'active', link: 'https://api.hoody.com/auth/signup?ref=k7m2q9xa' },
      { code: 'maya-builds', kind: 'vanity', state: 'active', link: 'https://api.hoody.com/auth/signup?ref=maya-builds' },
    ],
    vanity_codes_left: 2,
    counts: {},
    credit: {},
    monthly: [],
    ...over,
  },
});
const me = (over: Record<string, unknown> = {}): Me => selectMe(raw(over));
/** proves' answers: reads[0] = the fresh `me` answers, the newest last. */
const fresh = (...m: Me[]): readonly (readonly unknown[])[] => [m];

describe('join_proof_only_applied_on_enrolled', () => {
  it('a fresh me that reads enrolled proves the join; anything else proves nothing (never not_applied)', () => {
    expect(joinProves({}, fresh(me()))).toBe('applied');
    expect(joinProves({}, fresh(me({ enrolled: false, state: null, codes: [] })))).toBeUndefined();
    expect(joinProves({}, fresh(me({ enrolled: true, state: 'removed' })))).toBe('applied');
  });
  it('no answer, an empty read or a non-answer proves nothing', () => {
    expect(joinProves({}, [])).toBeUndefined();
    expect(joinProves({}, [[]])).toBeUndefined();
    expect(joinProves({}, [[null]])).toBeUndefined();
    expect(joinProves({}, [[{ enrolled: 'true' }]])).toBeUndefined();
  });
  it('the newest answer decides', () => {
    expect(joinProves({}, fresh(me(), me({ enrolled: false, state: null })))).toBeUndefined();
  });
});

describe('create_proof_on_presence_only', () => {
  it('the code listed proves the create; absent proves nothing', () => {
    expect(createProves({ code: 'maya-builds' }, fresh(me()))).toBe('applied');
    expect(createProves({ code: 'new-one' }, fresh(me()))).toBeUndefined();
  });
  it('a blocked listing still holds the code: the create happened', () => {
    const blocked = me({ codes: [{ code: 'new-one', kind: 'vanity', state: 'blocked', link: null }] });
    expect(createProves({ code: 'new-one' }, fresh(blocked))).toBe('applied');
  });
  it('an identity without a code, or no answer, proves nothing', () => {
    expect(createProves({}, fresh(me()))).toBeUndefined();
    expect(createProves({ code: '' }, fresh(me()))).toBeUndefined();
    expect(createProves({ code: 'maya-builds' }, [[]])).toBeUndefined();
    expect(createProves({ code: 'maya-builds' }, [[{ codes: 'x' }]])).toBeUndefined();
  });
});

describe('release_proof_on_absence_only', () => {
  it('the code gone from the listing proves the release; still listed proves nothing', () => {
    expect(releaseProves({ code: 'maya-builds' }, fresh(me()))).toBeUndefined();
    expect(releaseProves({ code: 'maya-builds' }, fresh(me({ codes: [] })))).toBe('applied');
  });
  it('no answer, a non-answer or an identity without a code proves nothing (absence needs a real listing)', () => {
    expect(releaseProves({ code: 'maya-builds' }, [])).toBeUndefined();
    expect(releaseProves({ code: 'maya-builds' }, [[]])).toBeUndefined();
    expect(releaseProves({ code: 'maya-builds' }, [[null]])).toBeUndefined();
    expect(releaseProves({ code: 'maya-builds' }, [[{ enrolled: true }]])).toBeUndefined();
    expect(releaseProves({}, fresh(me({ codes: [] })))).toBeUndefined();
  });
});

describe('create_code_normalized_once (pure part)', () => {
  it('the variables are the stored form of the field: trimmed, lower case', () => {
    expect(createVars(' Maya-Builds ')).toEqual({ code: 'maya-builds' });
    expect(createVars('\tUP-Code\n')).toEqual({ code: 'up-code' });
  });
  it('the variables are a fresh frozen object (the body, lock and proof read the same value)', () => {
    const v = createVars('Abc1');
    expect(Object.isFrozen(v)).toBe(true);
  });
});

describe('pending_never_worded_failed', () => {
  it('a pending answer is the held banner, never words', () => {
    for (const kind of ['join', 'create', 'release'] as const) expect(changeNote(kind, { outcome: 'pending' })).toEqual({ kind: 'held' });
  });
  it('a second press refused because the first is unread is the held banner too', () => {
    for (const kind of ['join', 'create', 'release'] as const) {
      expect(changeNote(kind, { outcome: 'not_sent', code: 'READ_BACK_FIRST' })).toEqual({ kind: 'held' });
      expect(changeNote(kind, { outcome: 'not_sent', code: 'HELD_BY_OTHER' })).toEqual({ kind: 'words', k: 'change.checkFirst' });
    }
  });
  it('no word the page can show for a held change says failed', () => {
    for (const k of ['held.join', 'held.create', 'held.release', 'change.checkFirst'] as const) expect(strings[k]).not.toMatch(/fail|didn't|not go through|error/i);
  });
  it('done says nothing (the fresh me shows it)', () => {
    expect(changeNote('join', { outcome: 'done' })).toBeNull();
  });
});

describe('refusal_literals_mapped', () => {
  const ANY = ['INSUFFICIENT_PERMISSIONS', 'ACCOUNT_BANNED'];
  it('every code a write route lists has its words, and every mapped code is listed on its route', () => {
    for (const kind of ['join', 'create', 'release'] as const) {
      const listed = routes[kind].codes ?? [];
      const mapped = Object.keys(REFUSALS[kind]);
      for (const c of mapped) expect(listed, `${kind} lists ${c}`).toContain(c);
      for (const c of listed) expect([...mapped, ...ANY], `${kind} maps ${c}`).toContain(c);
      for (const c of ANY) expect(listed, `${kind} lists ${c}`).toContain(c);
    }
  });
  it('the design table, code by code', () => {
    const w = (kind: 'join' | 'create' | 'release', code: string, status = 409) => changeNote(kind, { outcome: 'failed', code, status });
    expect(w('join', 'AFFILIATE_ALREADY_ENROLLED')).toEqual({ kind: 'words', k: 'change.already', reread: true });
    expect(w('join', 'AFFILIATE_ENROLMENT_PAUSED')).toEqual({ kind: 'words', k: 'first.paused.body', reread: true });
    expect(w('join', 'AFFILIATE_NOT_ELIGIBLE', 403)).toEqual({ kind: 'words', k: 'first.notEligible.body', reread: true });
    expect(w('join', 'AFFILIATE_REMOVED', 403)).toEqual({ kind: 'words', k: 'band.removed', reread: true });
    expect(w('create', 'REFERRAL_CODE_TAKEN')).toEqual({ kind: 'words', k: 'check.taken' });
    expect(w('create', 'REFERRAL_CODE_INVALID', 400)).toEqual({ kind: 'words', k: 'check.invalid' });
    expect(w('create', 'REFERRAL_CODE_RESERVED', 400)).toEqual({ kind: 'words', k: 'check.reserved' });
    for (const c of ['REFERRAL_CODE_LIMIT_REACHED', 'REFERRAL_CODE_ISSUANCE_BLOCKED', 'AFFILIATE_NOT_ENROLLED', 'AFFILIATE_REMOVED', 'AFFILIATE_NOT_ELIGIBLE'])
      expect(w('create', c, 403)).toEqual({ kind: 'words', k: 'codes.unavailable', reread: true });
    expect(w('release', 'REFERRAL_CODE_NOT_REMOVABLE')).toEqual({ kind: 'words', k: 'change.notRemovable', reread: true });
    expect(w('release', 'REFERRAL_CODE_NOT_FOUND', 404)).toEqual({ kind: 'words', k: 'change.notFound', reread: true });
  });
  it('a bare 400 on create (an out-of-bound code, no code in the body) takes the INVALID words; on join or release it stays the kit refusal', () => {
    expect(changeNote('create', { outcome: 'failed', status: 400 })).toEqual({ kind: 'words', k: 'check.invalid' });
    expect(changeNote('join', { outcome: 'failed', status: 400 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 400 } });
    expect(changeNote('release', { outcome: 'failed', status: 400 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 400 } });
  });
  it('a code of another route has no words here (the same literal can mean something else elsewhere)', () => {
    expect(changeNote('join', { outcome: 'failed', code: 'REFERRAL_CODE_TAKEN', status: 409 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 409, code: 'REFERRAL_CODE_TAKEN' } });
  });
  it('banned, forbidden and anything unmapped take the kit words of the refusal', () => {
    expect(changeNote('create', { outcome: 'failed', code: 'ACCOUNT_BANNED', status: 403 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 403, code: 'ACCOUNT_BANNED' } });
    expect(changeNote('release', { outcome: 'failed', code: 'INSUFFICIENT_PERMISSIONS', status: 403 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 403, code: 'INSUFFICIENT_PERMISSIONS' } });
    expect(changeNote('join', { outcome: 'failed', status: 403 })).toEqual({ kind: 'kit', outcome: 'failed', error: { status: 403 } });
    expect(changeNote('join', { outcome: 'not_sent', code: 'TOKEN_SESSION_REFUSED' })).toEqual({ kind: 'kit', outcome: 'not_sent', error: { code: 'TOKEN_SESSION_REFUSED' } });
    expect(changeNote('join', { outcome: 'stale' })).toEqual({ kind: 'kit', outcome: 'stale', error: {} });
  });
});

describe('retry_after_shown_on_429', () => {
  it('a 429 says how long to wait when the answer said; otherwise "in a moment"', () => {
    for (const kind of ['join', 'create', 'release'] as const) {
      expect(changeNote(kind, { outcome: 'failed', status: 429, retryAfter: 42 })).toEqual({ kind: 'words', k: 'change.tooFast', v: { n: '42' } });
      expect(changeNote(kind, { outcome: 'failed', status: 429 })).toEqual({ kind: 'words', k: 'change.tooFastSoon' });
    }
    expect(strings['change.tooFast']).toBe('Too many changes. Try again in {{n}} s.');
  });
});
