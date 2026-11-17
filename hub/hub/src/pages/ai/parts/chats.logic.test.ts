// Chat list rules: what is listed, groups and marks, gate paging ("and more"), the bounded
// state reads and the change tokens.
import { describe, expect, it } from 'vitest';
import {
  chatRows, dayGroup, gatesOf, gatesSoFar, botsOf, delegatesOf, keyOf, listed, missingGateChats, moved, sessionAnswerOf, sessionOf, sessionsOf,
  stateReads, titleOf, tokensOf, type ChatRow, type Session,
} from './chats.logic';

const NOW = new Date(2026, 9, 28, 15, 0, 0).getTime();
const MIN = 60_000;
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

function raw(id: string, o: Record<string, unknown> = {}) {
  return { id, realm: 'global', cwd: '/home/ada', model: 'hoody-ai/hoody-free', first_message: `do ${id}`, started_at: iso(NOW - DAY), ...o };
}
const sess = (id: string, o: Record<string, unknown> = {}) => sessionOf(raw(id, o)) as Session;
const rows = (sessions: Session[], o: Partial<Parameters<typeof chatRows>[0]> = {}): ChatRow[] =>
  chatRows({ sessions, gates: [], bots: [], delegates: new Map(), states: new Map(), now: NOW, ...o });

describe('what the list shows', () => {
  it('hides the Bot own session (agent bot, or a Bot session_id) and drafts with no first message', () => {
    const s = [sess('a'), sess('b', { agent: 'bot' }), sess('c'), sess('d', { first_message: '' }), sess('e', { first_message: '  \n ' })];
    const bots = [{ id: 'juno', realm: 'global', name: 'Juno', session: 'c', uid: '' }];
    expect(rows(s, { bots }).map((r) => r.sid)).toEqual(['a']);
    expect(listed(sess('n', { first_message: undefined, name: 'Named' }), new Set())).toBe(false);
  });

  it('titles: the name, else the first non-empty line of the first message', () => {
    expect(titleOf({ name: ' Fix it ', firstMessage: 'x' })).toBe('Fix it');
    expect(titleOf({ firstMessage: '\n  first line \nsecond' })).toBe('first line');
  });

  it('one row per chat and realm: the same sid in two realms is two rows; a repeat is dropped', () => {
    const s = [sess('a'), sess('a', { realm: 'aaaaaaaaaaaaaaaaaaaaaaaa' }), sess('a')];
    expect(rows(s).map((r) => r.key)).toEqual(['global/a', 'aaaaaaaaaaaaaaaaaaaaaaaa/a']);
  });

  it('tags: Claude Code for backend_kind acp; Bot <name> for a delegate of this realm', () => {
    const r = rows([sess('a', { backend_kind: 'acp' }), sess('b')], { delegates: new Map([[keyOf('global', 'b'), 'Juno']]) });
    expect(r[0]).toMatchObject({ claude: true, bot: undefined });
    expect(r[1]).toMatchObject({ claude: false, bot: 'Juno' });
  });
});

describe('groups and marks', () => {
  it('Needs you comes from the gates (accent mark); others by last activity, else started', () => {
    const s = [
      sess('t', { last_request_at: iso(NOW - 5 * MIN) }),
      sess('y', { last_request_at: iso(NOW - DAY) }),
      sess('w', { last_request_at: iso(NOW - 4 * DAY) }),
      sess('o', { last_request_at: iso(NOW - 30 * DAY) }),
      sess('s', { started_at: iso(NOW - 2 * MIN) }),
      sess('n', { last_request_at: iso(NOW - 30 * DAY) }),
    ];
    const r = rows(s, { gates: [{ sid: 'n', realm: 'global' }] });
    expect(Object.fromEntries(r.map((x) => [x.sid, x.group]))).toEqual({ t: 'today', y: 'yesterday', w: 'week', o: 'older', s: 'today', n: 'needs' });
    expect(r.find((x) => x.sid === 'n')!.mark).toBe('needs');
  });

  it('a gate in another realm, or a Bot gate, marks nothing', () => {
    const r = rows([sess('a')], { gates: [{ sid: 'a', realm: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, { sid: 'a', realm: 'global', agent: 'bot' }] });
    expect(r[0]!.group).not.toBe('needs');
  });

  it('running only from a state read that said running; otherwise no mark', () => {
    const r = rows([sess('a'), sess('b'), sess('c')], { states: new Map([['global/a', 'running'], ['global/b', 'parked']]) });
    expect(r.map((x) => x.mark)).toEqual(['running', null, null]);
  });

  it('day groups follow the reader calendar; a missing time is Older', () => {
    const midnight = new Date(2026, 9, 28, 0, 0, 0).getTime();
    expect(dayGroup(midnight, NOW)).toBe('today');
    expect(dayGroup(midnight - 1, NOW)).toBe('yesterday');
    expect(dayGroup(midnight - DAY, NOW)).toBe('yesterday');
    expect(dayGroup(midnight - DAY - 1, NOW)).toBe('week');
    expect(dayGroup(null, NOW)).toBe('older');
  });

  it('a gate chat no loaded page holds is shown once its own read answers', () => {
    const r = rows([sess('a')], { gates: [{ sid: 'z', realm: 'global' }], extra: [sess('z')] });
    expect(r.map((x) => [x.sid, x.group])).toEqual([['a', 'yesterday'], ['z', 'needs']]);
  });
});

describe('gate pages (meta.omitted)', () => {
  it('reads items, total and omitted', () => {
    const p = gatesOf({ items: [{ session_id: 'a', realm: 'global', gate_id: 'g', kind: 'confirm' }, { gate_id: 'x' }], meta: { total: 3, page: 1, limit: 100, omitted: 1 } });
    expect(p).toEqual({ gates: [{ sid: 'a', realm: 'global', agent: undefined }], total: 3, omitted: 1 });
  });

  it('"and more" when a page left gates out, or the total is beyond what is read; not otherwise', () => {
    const g = (n: number) => Array.from({ length: n }, (_, i) => ({ sid: `s${i}`, realm: 'global' }));
    expect(gatesSoFar([{ gates: g(2), total: 2, omitted: 0 }]).more).toBe(false);
    expect(gatesSoFar([{ gates: g(1), total: 2, omitted: 1 }]).more).toBe(true);
    // A page that left a gate out says so even when the total (read at another moment) matches what was read.
    expect(gatesSoFar([{ gates: g(2), total: 2, omitted: 1 }]).more).toBe(true);
    expect(gatesSoFar([{ gates: g(100), total: 150, omitted: 0 }]).more).toBe(true);
    expect(gatesSoFar([{ gates: g(100), total: 150, omitted: 0 }, { gates: g(50), total: 150, omitted: 0 }]).more).toBe(false);
    expect(gatesSoFar([]).more).toBe(false);
  });

  it('gate chats to read one by one: not loaded, not Bot, once each, at most 20', () => {
    const gates = [{ sid: 'a', realm: 'global' }, { sid: 'b', realm: 'global' }, { sid: 'b', realm: 'global' }, { sid: 'c', realm: 'global', agent: 'bot' }];
    expect(missingGateChats(gates, [sess('a')])).toEqual([{ sid: 'b', realm: 'global' }]);
    const many = Array.from({ length: 30 }, (_, i) => ({ sid: `m${i}`, realm: 'global' }));
    expect(missingGateChats(many, [])).toHaveLength(20);
    expect(missingGateChats(many, [], 40)).toHaveLength(30);
  });

  it("GET /sessions/{id}: the row is read from the answer's `session`, never from the top level", () => {
    expect(sessionAnswerOf({ session: { id: 'x', realm: 'global', name: 'N' }, attached: true })).toMatchObject({ id: 'x', name: 'N' });
    expect(sessionAnswerOf({ id: 'x', realm: 'global' })).toBeNull();
    expect(sessionAnswerOf(null)).toBeNull();
  });
});

describe('bounded state reads (≤ 20, last 30 minutes)', () => {
  it('only listed chats active in the last 30 minutes, not waiting, most recent first, at most 20', () => {
    const s = Array.from({ length: 25 }, (_, i) => sess(`r${i}`, { last_request_at: iso(NOW - i * MIN) }));
    s.push(sess('old', { last_request_at: iso(NOW - 31 * MIN) }), sess('wait', { last_request_at: iso(NOW) }));
    const r = rows(s, { gates: [{ sid: 'wait', realm: 'global' }] });
    const reads = stateReads(r, NOW);
    expect(reads).toHaveLength(20);
    expect(reads[0]).toEqual({ sid: 'r0', realm: 'global' });
    expect(reads.map((x) => x.sid)).not.toContain('old');
    expect(reads.map((x) => x.sid)).not.toContain('wait');
    expect(reads.map((x) => x.sid)).not.toContain('r20');
    // The 30-minute window, apart from the 20 cap: a few chats, one active 31 minutes ago, is not read.
    const few = rows([sess('n1', { last_request_at: iso(NOW - MIN) }), sess('o1', { last_request_at: iso(NOW - 31 * MIN) })]);
    expect(stateReads(few, NOW).map((x) => x.sid)).toEqual(['n1']);
  });
});

describe('answers', () => {
  it('sessions: items and meta.total; a row without an id is dropped', () => {
    expect(sessionsOf({ items: [raw('a'), { realm: 'global' }], meta: { total: 9 } })).toMatchObject({ total: 9, sessions: [{ id: 'a' }] });
    expect(sessionsOf({ items: [] }).total).toBeNull();
  });

  it('bots: locked rows skipped, name falls back to id; delegates: session ids', () => {
    expect(botsOf({ items: [{ id: 'juno', uid: 'u-juno', realm: 'global', name: 'Juno', session_id: 's1' }, { id: 'x', realm: 'global', owned_elsewhere: true }, { id: 'k', realm: 'global' }] })).toEqual([
      { id: 'juno', realm: 'global', name: 'Juno', session: 's1', uid: 'u-juno' },
      { id: 'k', realm: 'global', name: 'k', session: '', uid: '' },
    ]);
    expect(delegatesOf({ items: [{ session_id: 'd1' }, {}] })).toEqual(['d1']);
  });
});

describe('change tokens (re-list on token moves)', () => {
  const t = (scope: string, tokens: Record<string, unknown>) => tokensOf({ scope, tokens });
  it('the first answer moves nothing; a changed, new or vanished token moves its topic only; a new scope moves all', () => {
    const a = t('s1', { sessions: 'c1:a', gates: 'c1:g' });
    expect(moved(null, a, 'sessions')).toBe(false);
    expect(moved(a, t('s1', { sessions: 'c1:b', gates: 'c1:g' }), 'sessions')).toBe(true);
    expect(moved(a, t('s1', { sessions: 'c1:b', gates: 'c1:g' }), 'gates')).toBe(false);
    expect(moved(a, t('s1', { gates: 'c1:g' }), 'sessions')).toBe(true);
    expect(moved(a, t('s2', { sessions: 'c1:a', gates: 'c1:g' }), 'gates')).toBe(true);
    expect(tokensOf({ scope: 's', tokens: { sessions: 'x', bad: 3 } }).tokens).toEqual({ sessions: 'x' });
  });
});

// Rows carry state, pending_gate and origin; marks and Bot tags come from them.
describe('rows with state, pending gate and origin', () => {
  const R = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const bot = (o: Record<string, unknown> = {}) => ({ kind: 'bot', bot_uid: 'u-juno', bot_id: 'juno', realm: 'global', ...o });

  it('reads state, pending_gate and origin; a row without state is an older agent row', () => {
    expect(sess('a', { state: 'running', pending_gate: true, origin: bot({ ref: 'r1' }) })).toMatchObject({
      state: 'running', pendingGate: true, origin: { botId: 'juno', uid: 'u-juno', realm: 'global', ref: 'r1' },
    });
    expect(sess('b')).toMatchObject({ pendingGate: false, origin: null });
    expect(sess('f', { state: 'idle', pending_gate: false })).toMatchObject({ pendingGate: false });
    expect(sess('b').state).toBeUndefined();
    // Only a Bot origin with a Bot id counts; anything else is no origin.
    expect(sess('c', { state: 'idle', origin: { kind: 'other', bot_id: 'x' } }).origin).toBeNull();
    expect(sess('d', { state: 'idle', origin: { kind: 'bot' } }).origin).toBeNull();
    expect(sessionAnswerOf({ session: raw('e', { state: 'parked', pending_gate: true }) })).toMatchObject({ state: 'parked', pendingGate: true });
  });

  it('running from the row state, with no state read; idle, parked and closed show no running mark', () => {
    const r = rows([sess('a', { state: 'running' }), sess('b', { state: 'idle' }), sess('c', { state: 'closed' })]);
    expect(r.map((x) => x.mark)).toEqual(['running', null, null]);
    // A row that carries its own state wins over a stale state read.
    expect(rows([sess('a', { state: 'idle' })], { states: new Map([[keyOf('global', 'a'), 'running']]) })[0]!.mark).toBeNull();
  });

  it('needs you from pending_gate even when no gates page lists it', () => {
    const r = rows([sess('a', { state: 'parked', pending_gate: true, last_request_at: iso(NOW - 30 * DAY) }), sess('b', { state: 'running', pending_gate: true })]);
    expect(r.map((x) => [x.group, x.mark])).toEqual([['needs', 'needs'], ['needs', 'needs']]);
  });

  it("a Bot's own session (origin without ref) is never listed; a delegate (origin with ref) gets its Bot's name", () => {
    const bots = [{ id: 'juno', realm: 'global', name: 'Juno', session: '', uid: 'u-juno' }, { id: 'juno', realm: R, name: 'Other Juno', session: '', uid: 'u-other' }];
    const r = rows([sess('own', { state: 'idle', origin: bot() }), sess('del', { state: 'idle', origin: bot({ ref: 'w1' }) }), sess('x', { state: 'idle', realm: R, origin: bot({ ref: 'w2', realm: R, bot_uid: 'u-other' }) })], { bots });
    expect(r.map((x) => [x.sid, x.bot])).toEqual([['del', 'Juno'], ['x', 'Other Juno']]);
  });

  it('a Bot deleted and created again under the same id does not name the old delegates (uid differs or is missing)', () => {
    const bots = [{ id: 'juno', realm: 'global', name: 'Replacement', session: '', uid: 'u-new' }];
    const r = rows([
      sess('old', { state: 'idle', origin: bot({ ref: 'w1' }) }),
      sess('nouid', { state: 'idle', origin: bot({ ref: 'w2', bot_uid: undefined }) }),
      sess('new', { state: 'idle', origin: bot({ ref: 'w3', bot_uid: 'u-new' }) }),
    ], { bots });
    expect(r.map((x) => [x.sid, x.bot])).toEqual([['old', ''], ['nouid', ''], ['new', 'Replacement']]);
    // A list row without a uid cannot be checked either.
    expect(rows([sess('d', { state: 'idle', origin: bot({ ref: 'w1' }) })], { bots: [{ ...bots[0]!, uid: '' }] })[0]!.bot).toBe('');
    expect(rows([sess('e', { state: 'idle', origin: bot({ ref: 'w1', bot_uid: undefined }) })], { bots: [{ ...bots[0]!, uid: '' }] })[0]!.bot).toBe('');
  });

  it('a delegate of a Bot the list cannot name is still tagged (no name), never untagged', () => {
    const r = rows([sess('del', { state: 'idle', origin: bot({ bot_id: 'ghost', ref: 'w1' }) })]);
    expect(r[0]!.bot).toBe('');
  });

  it('rows ignore the delegate lookups: no origin means no Bot tag', () => {
    const r = rows([sess('a', { state: 'idle' })], { delegates: new Map([[keyOf('global', 'a'), 'Juno']]) });
    expect(r[0]!.bot).toBeUndefined();
  });

  it('state reads only for rows without state (an older agent); rows that carry their state are never read', () => {
    const s = [sess('new', { state: 'idle', last_request_at: iso(NOW - MIN) }), sess('old', { last_request_at: iso(NOW - MIN) })];
    expect(stateReads(rows(s), NOW).map((x) => x.sid)).toEqual(['old']);
  });
});
