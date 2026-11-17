// The Tunnels page's pure rules: the program gate, the kit's answers, the row join and the masked address.
import { describe, expect, it } from 'vitest';
import { disconnectProved, disconnectState, failOf, hostPort, joinRows, markEnded, maskIp, MAX_BINDINGS, MAX_SESSIONS, nextSnapshot, parseBindings, parseHealth, parseSessions, parseTunnels, peerIp, shortSession, stillListed, STILL_MS, tunnelProgram, Unreadable, type Snapshot } from './logic';

const S1 = 'S-4f2a9c1e-0000-4000-8000-000000000001';
const S2 = 'S-9b1d7e20-0000-4000-8000-000000000002';
const OLD = 'S-77aa0000-0000-4000-8000-000000000009';

describe('tunnelProgram', () => {
  it('reads running, stopped and not installed from the overview', () => {
    expect(tunnelProgram({ programs: [{ id: 1, name: 'hoody-tunnel', status: 'running' }] })).toBe('running');
    expect(tunnelProgram({ programs: [{ id: 1, name: 'hoody-tunnel', status: 'starting' }] })).toBe('running');
    expect(tunnelProgram({ programs: [{ id: 1, name: 'hoody-tunnel', status: 'stopped', lazy_load: true }] })).toBe('stopped');
    expect(tunnelProgram({ programs: [{ id: 1, name: 'hoody-tunnel', status: 'fatal' }] })).toBe('stopped');
    expect(tunnelProgram({ programs: [{ id: 2, name: 'hoody-files', status: 'running' }] })).toBe('none');
  });
  it('an unknown state is unknown, never stopped (the daemon could not read it), unless it is a program not loaded', () => {
    const tp = (p: object) => tunnelProgram({ programs: [{ id: 1, name: 'hoody-tunnel', ...p }] });
    expect(tp({ status: 'unknown', states_known: false, instances: [] })).toBe('unknown');
    expect(tp({ status: 'running', states_known: false })).toBe('unknown');
    expect(tp({ status: 'unknown', states_known: true, instances: [{ port: null, status: 'unknown' }] })).toBe('unknown');
    expect(tp({ states_known: true })).toBe('unknown');
    expect(tp({ status: 'sleeping', states_known: true })).toBe('unknown');
    // Known, and no process loaded: the daemon has not loaded it, so it is stopped (core program-model's rule).
    expect(tp({ status: 'unknown', states_known: true, instances: [] })).toBe('stopped');
  });
  it('a body that is not the overview throws, never "not installed"', () => {
    expect(() => tunnelProgram({ error: 'x' })).toThrow(Unreadable);
    expect(() => tunnelProgram(null)).toThrow(Unreadable);
  });
});

describe('addresses', () => {
  it('takes the IPv4 address of a socket address; Hoody networks are IPv4 only, so anything else is not an address', () => {
    expect(peerIp('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(peerIp('203.0.113.7')).toBe('203.0.113.7');
    expect(peerIp('[2001:DB8::1]:443')).toBeNull();
    expect(peerIp('2001:db8::1')).toBeNull();
    expect(peerIp('nonsense')).toBeNull();
    expect(peerIp('999.0.0.1:1')).toBeNull();
    expect(peerIp(42)).toBeNull();
  });
  it('masks the connection address', () => {
    expect(maskIp('203.0.113.7')).toBe('203.0.113.x');
    expect(maskIp('relay.example:5000')).toBe('…');
  });
  it('brackets an IPv6 host with its port', () => {
    expect(hostPort('127.0.0.2', 5432)).toBe('127.0.0.2:5432');
    expect(hostPort('::1', 6379)).toBe('[::1]:6379');
  });
  it('a connection address that is not IPv4 shows as its raw text; empty, control characters or over 64 characters show nothing', () => {
    const peerOf = (peerAddr: unknown) => parseTunnels({ sessions: [{ sessionId: S1, peerAddr, exposeBindings: [], pullBindings: [] }] }).sessions[0]?.peer;
    expect(peerOf('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(peerOf(' relay.example:5000 ')).toBe('relay.example:5000');
    expect(peerOf('[2001:db8::1]:443')).toBe('[2001:db8::1]:443');
    expect(peerOf('a\u0007b')).toBeNull();
    expect(peerOf('x'.repeat(65))).toBeNull();
    expect(peerOf('  ')).toBeNull();
    expect(peerOf(42)).toBeNull();
  });
  it('shortens a session id', () => {
    expect(shortSession(S1)).toBe('4f2a9c…');
  });
});

describe('the kit answers', () => {
  it('a body without its list throws (a read error, never "nothing connected")', () => {
    expect(() => parseTunnels({})).toThrow(Unreadable);
    expect(() => parseSessions({ total: 0 })).toThrow(Unreadable);
    expect(() => parseBindings('nope')).toThrow(Unreadable);
  });
  it('drops rows that do not check', () => {
    const t = parseTunnels({
      sessions: [
        { sessionId: S1, peerAddr: '203.0.113.7:1', protocol: 'v2', activeStreams: 3, exposeBindings: [{ bindId: 1, computerPort: 3000 }, { bindId: 2, computerPort: 70000 }], pullBindings: [{ bindId: 3, computerPort: 5432, bindAddr: 'evil' }] },
        { sessionId: '../x', peerAddr: '203.0.113.8:1', exposeBindings: [], pullBindings: [] },
        { sessionId: S1, peerAddr: '203.0.113.9:1', exposeBindings: [], pullBindings: [] },
      ],
      orphanedSessions: 2,
    });
    expect(t.sessions).toHaveLength(1);
    expect(t.sessions[0]!.expose).toEqual([{ bindId: 1, port: 3000, addr: null }]);
    expect(t.sessions[0]!.pull).toEqual([]);
    expect(t.orphans).toBe(2);
  });
  it('reads each session\'s most streams and the start time', () => {
    expect(parseSessions({ sessions: [{ sessionId: S1, maxStreams: 1024 }, { sessionId: S2 }] })).toEqual({ [S1]: 1024 });
    expect(parseHealth({ started: '2026-10-26T05:00:00Z' })).toBe(Date.parse('2026-10-26T05:00:00Z'));
    expect(parseHealth({ started: 'soon' })).toBeNull();
  });
});

describe('joinRows', () => {
  const tunnels = parseTunnels({
    sessions: [
      { sessionId: S2, peerAddr: 'relay.example:5000', protocol: 'v2', activeStreams: 0, exposeBindings: [], pullBindings: [] },
      {
        sessionId: S1, peerAddr: '203.0.113.7:51234', protocol: 'v2', activeStreams: 3,
        exposeBindings: [{ bindId: 1, computerPort: 3000 }],
        pullBindings: [{ bindId: 2, computerPort: 5432, bindAddr: '127.0.0.1' }, { bindId: 3, computerPort: 5432, bindAddr: '127.0.0.2' }],
      },
    ],
    orphanedSessions: 1,
  });
  const listeners = parseBindings({
    bindings: [
      { port: 3000, mode: 'expose', kind: 'http', sessionId: S1, bindId: 1 },
      { port: 5432, mode: 'pull', kind: 'tcp', sessionId: S1, bindId: 2, bindAddr: '127.0.0.1' },
      { port: 8080, mode: 'expose', kind: 'http', sessionId: OLD, bindId: 7 },
    ],
  }).list;

  it('keys rows by session and bind id: two PULL bindings on one port stay two rows', () => {
    const j = joinRows(tunnels, { [S1]: 1024 }, listeners);
    const pulls = j.rows.filter((r) => r.kind === 'pull');
    expect(pulls.map((r) => r.addr)).toEqual(['127.0.0.1', '127.0.0.2']);
    expect(new Set(pulls.map((r) => r.id)).size).toBe(2);
    expect(new Set(j.rows.map((r) => r.id)).size).toBe(j.rows.length);
  });
  it('a session that shares nothing gets one idle row; a listener of no live session goes in the reconnecting group', () => {
    const j = joinRows(tunnels, { [S1]: 1024 }, listeners);
    expect(j.rows.filter((r) => r.sessionId === S2).map((r) => r.kind)).toEqual(['idle']);
    const held = j.rows.filter((r) => r.reconnecting);
    expect(held).toEqual([expect.objectContaining({ kind: 'expose', port: 8080, group: 'reconnecting', sessionId: OLD })]);
    expect(j.reconnecting).toBe(1);
    // The reconnecting row accounts for the orphan: no separate note.
    expect(j.orphanNote).toBe(0);
    expect(j.groups.find((g) => g.id === S1)?.maxStreams).toBe(1024);
    expect(j.groups.find((g) => g.id === S2)?.maxStreams).toBeNull();
  });
  it('the orphan count shows only when nothing else accounts for it', () => {
    expect(joinRows(tunnels, null, []).orphanNote).toBe(1);
    expect(joinRows(tunnels, null, null).orphanNote).toBe(1);
  });
});

describe('read failures', () => {
  it('401/403 is Not allowed; anything else is a failed read', () => {
    expect(failOf({ status: 403 })).toBe('forbidden');
    expect(failOf({ status: 401 })).toBe('forbidden');
    expect(failOf({ status: 503 })).toBe('failed');
    expect(failOf(new Unreadable('x'))).toBe('failed');
  });
});

describe('nextSnapshot: rows and their time change only on a complete read', () => {
  const t1 = parseTunnels({ sessions: [], orphanedSessions: 0 });
  const t2 = parseTunnels({ sessions: [], orphanedSessions: 1 });
  const s1 = parseSessions({ sessions: [] });
  const b1 = parseBindings({ bindings: [] });
  const ok = <T,>(data: T, at: number) => ({ data, ok: true, fetching: false, at });
  it('takes the first complete read, at the earliest of its three times', () => {
    const snap = nextSnapshot(null, ok(t1, 300), ok(s1, 100), ok(b1, 200));
    expect(snap?.tunnels).toBe(t1);
    expect(snap?.at).toBe(100);
  });
  it('one read failing keeps the whole last snapshot, rows and time (never a mix)', () => {
    const prev = nextSnapshot(null, ok(t1, 100), ok(s1, 100), ok(b1, 100)) as Snapshot;
    expect(nextSnapshot(prev, ok(t2, 500), { data: s1, ok: false, fetching: false, at: 500 }, ok(b1, 500))).toBe(prev);
  });
  it('a read whose body did not parse keeps the old time, though its answer is newer', () => {
    const prev = nextSnapshot(null, ok(t1, 100), ok(s1, 100), ok(b1, 100)) as Snapshot;
    // The query keeps the old parsed data and reports the new answer's time: not ok, so nothing moves.
    const kept = nextSnapshot(prev, { data: t1, ok: false, fetching: false, at: 900 }, ok(s1, 900), ok(b1, 900));
    expect(kept).toBe(prev);
    expect(kept?.at).toBe(100);
  });
  it('nothing complete yet: none', () => {
    expect(nextSnapshot(null, ok(t1, 1), { data: undefined, ok: false, fetching: false, at: 0 }, ok(b1, 1))).toBeNull();
  });
  it('the same three answers again keep the same snapshot (no new render loop)', () => {
    const prev = nextSnapshot(null, ok(t1, 100), ok(s1, 100), ok(b1, 100)) as Snapshot;
    expect(nextSnapshot(prev, ok(t1, 100), ok(s1, 100), ok(b1, 100))).toBe(prev);
  });
  it('a read still in flight holds the commit: two new answers and one pending never mix', () => {
    const prev = nextSnapshot(null, ok(t1, 100), ok(s1, 100), ok(b1, 100)) as Snapshot;
    // /sessions is refetching (its old data still marked success): nothing moves until all three settle.
    expect(nextSnapshot(prev, ok(t2, 500), { data: s1, ok: true, fetching: true, at: 100 }, ok(b1, 500))).toBe(prev);
  });
  it('unchanged answers read again move the time forward, rows kept', () => {
    const prev = nextSnapshot(null, ok(t1, 100), ok(s1, 100), ok(b1, 100)) as Snapshot;
    const next = nextSnapshot(prev, ok(t1, 200), ok(s1, 250), ok(b1, 300));
    expect(next?.tunnels).toBe(t1);
    expect(next?.at).toBe(200);
  });
});

describe('disconnect: what a read proves', () => {
  const ID = 'S-aaaa';
  const live = parseTunnels({ sessions: [{ sessionId: ID, exposeBindings: [], pullBindings: [] }], orphanedSessions: 0 });
  const none = parseTunnels({ sessions: [], orphanedSessions: 0 });
  const owned = parseBindings({ bindings: [{ port: 3000, mode: 'expose', sessionId: ID, bindId: 1 }] });
  const ownedBadRow = parseBindings({ bindings: [{ port: 0, mode: 'expose', sessionId: ID, bindId: 1 }] });
  const empty = parseBindings({ bindings: [] });
  const cutT = parseTunnels({ sessions: Array.from({ length: MAX_SESSIONS + 1 }, (_, i) => ({ sessionId: `S-${i}` })), orphanedSessions: 0 });
  const cutB = parseBindings({ bindings: Array.from({ length: MAX_BINDINGS + 1 }, (_, i) => ({ port: 1000 + (i % 60000), mode: 'expose', sessionId: `S-${i}`, bindId: i })) });

  it('gone from the sessions and from every listener: applied', () => {
    expect(stillListed(ID, none, empty)).toBe(false);
    expect(disconnectProved({ computer: 'c', id: ID }, [[none], [empty]])).toBe('applied');
  });
  it('a live session, or a listener it still owns: no verdict (the kit may still be closing it; the hold stays)', () => {
    expect(disconnectProved({ computer: 'c', id: ID }, [[live], [empty]])).toBeUndefined();
    expect(disconnectProved({ computer: 'c', id: ID }, [[none], [owned]])).toBeUndefined();
  });
  it('a listener entry that does not check still names its owner: never read as gone', () => {
    expect(ownedBadRow.list).toEqual([]);
    expect(disconnectProved({ computer: 'c', id: ID }, [[none], [ownedBadRow]])).toBeUndefined();
  });
  it('a list cut at its bound proves nothing', () => {
    expect(cutT.full).toBe(false);
    expect(cutB.full).toBe(false);
    expect(disconnectProved({ id: ID }, [[cutT], [empty]])).toBeUndefined();
    expect(disconnectProved({ id: ID }, [[none], [cutB]])).toBeUndefined();
  });
  it('no answer, two answers, an unparsed answer or no id: nothing proved', () => {
    expect(disconnectProved({ id: ID }, [[], [empty]])).toBeUndefined();
    expect(disconnectProved({ id: ID }, [[none, none], [empty]])).toBeUndefined();
    expect(disconnectProved({ id: ID }, [[{ sessions: [] }], [empty]])).toBeUndefined();
    expect(disconnectProved({ id: ID }, [[none]])).toBeUndefined();
    expect(disconnectProved(undefined, [[none], [empty]])).toBeUndefined();
  });
});

describe('disconnect: the state shown', () => {
  it('a send in flight, then a hold, then the mark', () => {
    const closing = { kind: 'closing' as const, at: 1000 };
    expect(disconnectState({ sending: true, pending: true, mark: closing, now: 1000 })).toBe('sending');
    expect(disconnectState({ sending: false, pending: true, mark: closing, now: 1000 })).toBe('pending');
    expect(disconnectState({ sending: false, pending: false, mark: undefined, now: 1000 })).toBe('idle');
  });
  it('Disconnecting turns Still listed at STILL_MS, not before', () => {
    const closing = { kind: 'closing' as const, at: 1000 };
    expect(disconnectState({ sending: false, pending: false, mark: closing, now: 1000 + STILL_MS - 1 })).toBe('closing');
    expect(disconnectState({ sending: false, pending: false, mark: closing, now: 1000 + STILL_MS })).toBe('still');
  });
  const snapOf = (t: ReturnType<typeof parseTunnels>, b: ReturnType<typeof parseBindings>, at: number): Snapshot => ({ tunnels: t, sessions: {}, bindings: b, at });
  const ID = 'S-aaaa';
  const live = parseTunnels({ sessions: [{ sessionId: ID }], orphanedSessions: 0 });
  const none = parseTunnels({ sessions: [], orphanedSessions: 0 });
  const empty = parseBindings({ bindings: [] });
  it('a mark ends only on a read made after it that no longer lists the session', () => {
    const m = { kind: 'closing' as const, at: 1000 };
    expect(markEnded(m, snapOf(none, empty, 1000), ID)).toBe(false);
    expect(markEnded(m, snapOf(live, empty, 2000), ID)).toBe(false);
    expect(markEnded(m, snapOf(none, empty, 2000), ID)).toBe(true);
  });
  it('Already disconnected ends at any later read (the live list is the truth)', () => {
    const m = { kind: 'already' as const, at: 1000 };
    expect(markEnded(m, snapOf(live, empty, 999), ID)).toBe(false);
    expect(markEnded(m, snapOf(live, empty, 2000), ID)).toBe(true);
  });
});
