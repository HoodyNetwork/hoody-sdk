// Acceptance, read and retire proofs: the classifiers of a read and a retire BY KEY. Ordered allow-lists, default unknown.
//   - A read MISS proves nothing: it is `unknown` with why `miss` and never settles; only a retire fences a key.
//   - notAdmitted comes ONLY from `{retired:true, admitted:"false"}` (a retire's answer, or a read of a key an earlier retire fenced).
//   - admitted "unknown", an in-flight create, an allocated row without a session, a bare 404 not_found (a hidden session), a refused or
//     failed call and every unlisted shape stay unknown.
import { describe, expect, it } from 'vitest';
import { classifyKeyRead, classifyKeyRetire, fromVerdict, type KeyRoute, type Result } from '../journal/proof';

const H = 'atlas.tlas', A = '64f0c0ffee0000000000c0de';
const K = 'hx-' + 'a'.repeat(32);
const id = (route: KeyRoute) => ({ acct: A, h: H, k: K, route });
const err = (status: number, code: string, details?: unknown): Result => ({ ok: false, e: { status, code, ...(details !== undefined ? { details } : {}) } });
const ok = (b: unknown): Result => ({ ok: true, b });
const MISS = { create: 'create_not_found', turn: 'turn_not_found', command: 'command_not_found' } as const;
const ROUTES: KeyRoute[] = ['create', 'turn', 'command'];

describe('a read by key', () => {
  for (const route of ROUTES) {
    it(`${route}: a miss is unknown/miss and never settles; a hidden session (bare 404 not_found) is not even a miss`, () => {
      const miss = classifyKeyRead(id(route), route === 'create' ? err(404, MISS[route]) : err(404, MISS[route], { retired: false }));
      expect(miss).toMatchObject({ t: 'unknown', why: 'miss' });
      expect(classifyKeyRead(id(route), err(404, 'not_found'))).toMatchObject({ t: 'unknown', why: 'readFailed' });
      expect(classifyKeyRead(id(route), err(404, 'session_not_found'))).toMatchObject({ t: 'unknown' });
    });
    it(`${route}: every failure, refusal and lost answer is unknown`, () => {
      for (const r of [err(0, ''), err(503, 'service_unavailable', { admitted: 'unknown' }), err(503, 'restriction_unknown'), err(500, 'internal_error'), err(409, 'turn_in_flight'), err(400, 'bad_request'),
        { ok: false, e: { kind: 'pending', pending: true } } as Result, { ok: false, e: null } as Result, ok(null), ok('x'), ok([]), ok({})]) {
        const v = classifyKeyRead(id(route), r);
        expect(v.t, JSON.stringify(r)).toBe('unknown');
        expect(v.why).not.toBe('miss');
      }
    });
  }
  it('turn: a miss on a key an earlier retire fenced says so: admitted "false" is notAdmitted, anything else stays unknown', () => {
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: true, admitted: 'false' }))).toMatchObject({ t: 'notAdmitted', src: 'receipt', why: 'retired' });
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: true, admitted: 'unknown' }))).toMatchObject({ t: 'unknown', why: 'retiredUnknown' });
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: true, admitted: 'true' })).t).toBe('unknown');
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: true })).t).toBe('unknown');
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', {})).t, 'a miss that does not say whether the key was retired is not a miss').toBe('unknown');
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: 'false' })).why).toBe('badMiss');
    expect(classifyKeyRead(id('turn'), err(404, 'turn_not_found')).why).toBe('badMiss');
  });
  it('command: the same, with its own code', () => {
    expect(classifyKeyRead(id('command'), err(404, 'command_not_found', { retired: true, admitted: 'false' })).t).toBe('notAdmitted');
    expect(classifyKeyRead(id('command'), err(404, 'turn_not_found', { retired: true, admitted: 'false' })).t, 'another route\'s miss code is not this route\'s').toBe('unknown');
  });
  it('turn: a receipt naming a turn settles; one that names none does not', () => {
    expect(classifyKeyRead(id('turn'), ok({ turn_id: 'turn-1', state: 'working' }))).toMatchObject({ t: 'settled', why: 'accepted', src: 'receipt' });
    expect(classifyKeyRead(id('turn'), ok({ state: 'working' })).t).toBe('unknown');
    expect(classifyKeyRead(id('turn'), ok({ turn_id: '../x' })).t, 'an id that is not a plain segment').toBe('unknown');
  });
  it('command: committed, superseded, refused and failed settle; queued is admitted (with its id); anything else is unknown', () => {
    for (const st of ['committed', 'superseded', 'refused', 'failed']) expect(classifyKeyRead(id('command'), ok({ command_id: 'cmd-1', state: st })).t, st).toBe('settled');
    const q = classifyKeyRead(id('command'), ok({ command_id: 'cmd-1', state: 'queued' }));
    expect(q).toMatchObject({ t: 'admitted', ref: { command: 'cmd-1' } });
    expect(classifyKeyRead(id('command'), ok({ command_id: 'cmd-1', state: 'weird' })).t).toBe('unknown');
    expect(classifyKeyRead(id('command'), ok({ state: 'committed' })).t).toBe('unknown');
  });
  describe('create', () => {
    it('started: settled with the session; with none, settled without one (the key admitted a create whose chat cannot be opened)', () => {
      expect(classifyKeyRead(id('create'), ok({ state: 'started', session_id: 'sess-1' }))).toMatchObject({ t: 'settled', sid: 'sess-1' });
      const none = classifyKeyRead(id('create'), ok({ state: 'started' }));
      expect(none.t).toBe('settled');
      expect(none.sid).toBeUndefined();
    });
    it('allocated: in flight is unknown (check later); not in flight with a session settles (attach); without one stays unknown', () => {
      expect(classifyKeyRead(id('create'), ok({ state: 'allocated', in_flight: true }))).toMatchObject({ t: 'unknown', why: 'inFlight' });
      expect(classifyKeyRead(id('create'), ok({ state: 'allocated', in_flight: true, session_id: 'sess-1' }))).toMatchObject({ t: 'unknown', why: 'inFlight' });
      expect(classifyKeyRead(id('create'), ok({ state: 'allocated', in_flight: false, session_id: 'sess-1' }))).toMatchObject({ t: 'settled', sid: 'sess-1', why: 'allocated' });
      expect(classifyKeyRead(id('create'), ok({ state: 'allocated', in_flight: false }))).toMatchObject({ t: 'unknown', why: 'allocatedNoSession' });
      expect(classifyKeyRead(id('create'), ok({ state: 'allocated' })).t, 'in_flight missing is not "not in flight"').toBe('unknown');
    });
    it('retired: only admitted "false" is notAdmitted', () => {
      expect(classifyKeyRead(id('create'), ok({ state: 'retired', admitted: 'false' })).t).toBe('notAdmitted');
      expect(classifyKeyRead(id('create'), ok({ state: 'retired', admitted: 'unknown' })).t).toBe('unknown');
      expect(classifyKeyRead(id('create'), ok({ state: 'retired', admitted: 'true' })).t).toBe('unknown');
      expect(classifyKeyRead(id('create'), ok({ state: 'retired' })).t).toBe('unknown');
    });
    it('an unlisted state is unknown', () => {
      expect(classifyKeyRead(id('create'), ok({ state: 'weird', session_id: 'sess-1' })).t).toBe('unknown');
    });
  });
});

describe('a retire by key', () => {
  for (const route of ROUTES) {
    it(`${route}: {retired:true, admitted:"false"} is notAdmitted (src retire); admitted "unknown" and every other shape stay unknown`, () => {
      expect(classifyKeyRetire(id(route), ok({ retired: true, admitted: 'false' }))).toMatchObject({ t: 'notAdmitted', src: 'retire', why: 'fenced' });
      expect(classifyKeyRetire(id(route), ok({ retired: true, admitted: 'unknown' }))).toMatchObject({ t: 'unknown', why: 'admittedUnknown' });
      expect(classifyKeyRetire(id(route), ok({ retired: true, admitted: 'true' })).t, 'a fence that admitted something is not a thing').toBe('unknown');
      expect(classifyKeyRetire(id(route), ok({ retired: true })).t).toBe('unknown');
      expect(classifyKeyRetire(id(route), ok({ admitted: 'false' })).t, 'no `retired` member: not a retire answer').toBe('unknown');
      expect(classifyKeyRetire(id(route), ok({ retired: 'true', admitted: 'false' })).t).toBe('unknown');
      expect(classifyKeyRetire(id(route), ok(null)).t).toBe('unknown');
    });
    it(`${route}: a refusal or a lost answer is unknown (a retire may have been written)`, () => {
      for (const r of [err(0, ''), err(503, 'service_unavailable', { admitted: 'unknown' }), err(409, `${route}_fences_exhausted`, { admitted: 'unknown' }), err(503, 'session_terminating'), err(404, 'not_found'),
        err(503, `${route}_unreadable`), { ok: false, e: { kind: 'pending', pending: true } } as Result]) {
        expect(classifyKeyRetire(id(route), r).t, JSON.stringify(r)).toBe('unknown');
      }
    });
  }
  it('turn: a key that admitted a turn answers its receipt; without a receipt that names a turn it proves nothing', () => {
    expect(classifyKeyRetire(id('turn'), ok({ retired: false, admitted: 'true', turn: { turn_id: 'turn-1', state: 'working' } }))).toMatchObject({ t: 'settled', src: 'retire' });
    expect(classifyKeyRetire(id('turn'), ok({ retired: false, admitted: 'true' })).t).toBe('unknown');
    expect(classifyKeyRetire(id('turn'), ok({ retired: false, admitted: 'true', turn: { state: 'working' } })).t).toBe('unknown');
    expect(classifyKeyRetire(id('turn'), ok({ retired: false, admitted: 'unknown', turn: { turn_id: 'turn-1' } })).t, 'a receipt beside a verdict that is not "true"').toBe('unknown');
  });
  it('command: a key that admitted a command answers its receipt (queued is admitted)', () => {
    expect(classifyKeyRetire(id('command'), ok({ retired: false, admitted: 'true', command: { command_id: 'cmd-1', state: 'committed' } })).t).toBe('settled');
    expect(classifyKeyRetire(id('command'), ok({ retired: false, admitted: 'true', command: { command_id: 'cmd-1', state: 'queued' } }))).toMatchObject({ t: 'admitted', ref: { command: 'cmd-1' } });
    expect(classifyKeyRetire(id('command'), ok({ retired: false, admitted: 'true' })).t).toBe('unknown');
  });
  describe('create', () => {
    it('a key that admitted a create (started): settled with the session, or without one (the chat cannot be opened now)', () => {
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'true', state: 'started', in_flight: false, session_id: 'sess-1' }))).toMatchObject({ t: 'settled', sid: 'sess-1', src: 'retire' });
      const none = classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'true', state: 'started', in_flight: false }));
      expect(none.t).toBe('settled');
      expect(none.sid).toBeUndefined();
    });
    it('allocated decides before `admitted` (the handler fills admitted "unknown" for a row it only describes)', () => {
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: true }))).toMatchObject({ t: 'unknown', why: 'inFlight' });
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: false, session_id: 'sess-1' }))).toMatchObject({ t: 'settled', sid: 'sess-1' });
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: false }))).toMatchObject({ t: 'unknown', why: 'allocatedNoSession' });
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown', state: 'allocated' })).t).toBe('unknown');
    });
    it('a row of another realm or one the ledger cannot describe: admitted "unknown" stays unknown', () => {
      expect(classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown' }))).toMatchObject({ t: 'unknown', why: 'admittedUnknown' });
      expect(classifyKeyRetire(id('create'), ok({ retired: false })).t).toBe('unknown');
    });
  });
});

describe('a verdict from a by-key call', () => {
  it('only notAdmitted and settled verdicts are removal proofs; a miss, an in-flight create and admitted "unknown" are none', () => {
    const none = [classifyKeyRead(id('turn'), err(404, 'turn_not_found', { retired: false })), classifyKeyRead(id('create'), ok({ state: 'allocated', in_flight: true })),
      classifyKeyRetire(id('turn'), ok({ retired: true, admitted: 'unknown' })), classifyKeyRetire(id('create'), ok({ retired: false, admitted: 'unknown' }))];
    for (const v of none) expect(fromVerdict(v), v.why).toBeNull();
    expect(fromVerdict(classifyKeyRetire(id('command'), ok({ retired: true, admitted: 'false' })))).not.toBeNull();
    // A turn entry goes only with the Kept of the chat record that replaces it (fromTurnKept): fromVerdict never proves a turn.
    expect(fromVerdict(classifyKeyRetire(id('turn'), ok({ retired: true, admitted: 'false' })))).toBeNull();
    expect(fromVerdict(classifyKeyRead(id('turn'), ok({ turn_id: 'turn-1' })))).toBeNull();
  });
});
