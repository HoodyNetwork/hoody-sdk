// The settings session: opened on the first request and not before, one per scope, leased from its create, closed when
// the last view leaves or the scope changes or the page goes, replaced once when the agent lost it, and never asked twice
// under one create key. The agent and the lease manager are scripted here; nothing leaves.
import { afterEach, describe, expect, it } from 'vitest';
import { installTransport, type Transport } from '@core/transport';
import { boot, TARGET } from '@core/test/env';
import { errorWords, type LeaseHandle, type LeaseManager, type LeaseRef } from '@kit';
import { errorInfo } from '@core';
import { createBody, createSettingsSessions, isLostSession, liveApi, scopeKeyOf, SessionError, type SessionApi, type SettingsAt } from './Session';
import { sessionCode, unsent } from './data';
import { sessionCode as mcpSessionCode } from '../connections/mcp.data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const target = { project: { id: 'p1' }, container: { id: 'c1' } };
const at = (over: Partial<SettingsAt> = {}): SettingsAt => ({ target, realm: R1, ...over });
const READY = { connected: true, account_id: 'acct', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' };

class Err extends Error {
  constructor(readonly status: number, readonly code?: string, extra: Record<string, unknown> = {}) { super('x'); Object.assign(this, extra); }
}

interface Rig {
  calls: string[];
  keys: string[];
  created: { at: SettingsAt; body: ReturnType<typeof createBody>; key: string }[];
  closed: { sid: string; keepalive: boolean }[];
  handles: { ref: LeaseRef; closed: boolean }[];
  api: SessionApi;
  leases: LeaseManager;
  /** Next create answers, consumed in order (undefined: a normal session). */
  next: Array<() => Promise<unknown>>;
  status: () => Promise<unknown>;
  /** What GET /version answers (default: a gateway that binds by `computer`, session protocol 3). */
  version: () => Promise<unknown>;
  leasePhase: () => string;
}
function rig(): Rig {
  let n = 0;
  const r: Rig = {
    calls: [], keys: [], created: [], closed: [], handles: [], next: [],
    status: async () => READY,
    version: async () => ({ session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })) }),
    leasePhase: () => 'held',
    api: null as never,
    leases: null as never,
  };
  r.api = {
    status: async () => { r.calls.push('status'); return r.status(); },
    version: async () => r.version(),
    create: async (a, body, key) => {
      r.calls.push('create'); r.keys.push(key); r.created.push({ at: a, body, key });
      const f = r.next.shift();
      if (f) return f();
      n++;
      return { session_id: `s${n}`, started: { realm_selector: a.realm, computer_id: 'c1', owner_fingerprint: 'fp' } };
    },
    close: async (_a, sid, keepalive) => { r.calls.push('close:' + sid); r.closed.push({ sid, keepalive }); },
  };
  r.leases = {
    track: (ref: LeaseRef, need): LeaseHandle => {
      const rec = { ref, closed: false };
      r.handles.push(rec);
      r.calls.push('track:' + ref.sid + (need?.pinned ? ':pinned' : ''));
      return { set: () => undefined, close: () => { rec.closed = true; r.calls.push('lease-close:' + ref.sid); } };
    },
    ensure: async (ref: LeaseRef) => { r.calls.push('ensure:' + ref.sid); },
    state: () => ({ phase: r.leasePhase() as never }),
    subscribe: () => () => undefined,
    forget: () => undefined,
    releaseAll: () => undefined,
    resume: () => undefined,
    reset: () => undefined,
  };
  return r;
}
const make = (r: Rig) => createSettingsSessions({ api: r.api, leases: r.leases, newKey: (() => { let k = 0; return () => `key-${++k}`; })(), account: () => 'acct' });

const opened: ReturnType<typeof make>[] = [];
afterEach(() => { for (const m of opened.splice(0)) m.reset(); });
const sessions = (r: Rig) => { const m = make(r); opened.push(m); return m; };

describe('createBody', () => {
  it('a chat agent in the folder, standard tools mode, home access, default approval, bound to the computer and realm', () => {
    expect(createBody(at({ cwd: '/w/shop' }))).toEqual({
      agent: 'chat', realm: R1, computer: 'c1', cwd: '/w/shop', tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' },
      expected_binding: { realm: R1, computer: 'c1' },
    });
  });
  it('a realm-only scope sends no cwd at all', () => {
    expect('cwd' in createBody(at())).toBe(false);
  });
});

describe('isLostSession', () => {
  it.each([[404, 'not_found'], [410, 'attachment_expired'], [410, undefined], [404, undefined]])('%s %s is a lost session', (status, code) => {
    expect(isLostSession(new Err(status as number, code))).toBe(true);
  });
  it.each([[409, 'write_intent_invalid'], [500, undefined], [400, 'bad_request'], [404, 'realm_scope_unsupported']])('%s %s is not', (status, code) => {
    expect(isLostSession(new Err(status as number, code))).toBe(false);
  });
  it('a thing that is not an error is not', () => {
    expect(isLostSession(null)).toBe(false);
    expect(isLostSession('x')).toBe(false);
  });
});

describe('opening', () => {
  it('holding a scope opens nothing: no status read, no create (a rules-only view)', () => {
    const r = rig();
    const s = sessions(r);
    s.hold(at());
    expect(r.calls).toEqual([]);
    expect(s.state().phase).toBe('idle');
  });
  it('the first run reads the agent\'s sign-in, creates one keyed chat session, leases it (pinned) and holds the lease before the request', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at({ cwd: '/w/shop' }));
    let sid = '';
    await s.run(h, async (id) => { sid = id; r.calls.push('use:' + id); });
    expect(sid).toBe('s1');
    expect(r.calls).toEqual(['status', 'create', 'track:s1:pinned', 'ensure:s1', 'use:s1']);
    expect(r.created[0]!.body.agent).toBe('chat');
    expect(r.created[0]!.key).toBe('key-1');
    expect(s.state()).toMatchObject({ phase: 'open', sid: 's1', replaced: 0 });
  });
  it('two requests and two holds of the same scope share one session', async () => {
    const r = rig();
    const s = sessions(r);
    const a = s.hold(at()), b = s.hold(at());
    const seen: string[] = [];
    await Promise.all([s.run(a, async (id) => { seen.push(id); }), s.run(b, async (id) => { seen.push(id); }), s.run(a, async (id) => { seen.push(id); })]);
    expect(seen).toEqual(['s1', 's1', 's1']);
    expect(r.created).toHaveLength(1);
  });
  it('an agent that is not signed in as this account makes no session', async () => {
    const r = rig();
    r.status = async () => ({ ...READY, account_id: 'other' });
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'not_ready' });
    expect(r.created).toHaveLength(0);
  });
  it.each([
    ['signed out', { ...READY, auth_active: false }],
    ['no owner fingerprint', { ...READY, owner_fingerprint: '' }],
    ['no answer to read', null],
  ])('%s makes no session', async (_n, status) => {
    const r = rig();
    r.status = async () => status;
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'not_ready' });
    expect(r.created).toHaveLength(0);
  });
  it('All realms and a relative folder are refused before any request', async () => {
    const r = rig();
    const s = sessions(r);
    await expect(s.run(s.hold(at({ realm: '__all__' })), async () => 1)).rejects.toMatchObject({ kind: 'scope' });
    await expect(s.run(s.hold(at({ cwd: 'shop' })), async () => 1)).rejects.toMatchObject({ kind: 'scope' });
    expect(r.calls).toEqual([]);
  });
  it('a session that reports another realm or computer is closed and refused', async () => {
    const r = rig();
    r.next.push(async () => ({ session_id: 'sx', started: { realm_selector: R2, computer_id: 'c1', owner_fingerprint: 'fp' } }));
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'binding' });
    expect(r.closed).toEqual([{ sid: 'sx', keepalive: false }]);
    expect(s.state().phase).toBe('failed');
  });
  it.each([
    ['a retired container_id naming another computer', { container_id: 'other' }],
    ['a retired container_id naming this computer', { container_id: 'c1' }],
    ['a malformed retired container_id', { container_id: 7 }],
    ['both spellings at once', { computer_id: 'c1', container_id: 'c1' }],
  ])('%s is no proof of the binding: closed, unknown (not a binding failure), never tracked or used', async (_n, ident) => {
    const r = rig();
    r.next.push(async () => ({ session_id: 'sx', started: { realm_selector: R1, owner_fingerprint: 'fp', ...ident } }));
    const s = sessions(r);
    let ran = 0;
    await expect(s.run(s.hold(at()), async () => { ran++; })).rejects.toMatchObject({ kind: 'unknown' });
    expect(ran).toBe(0);
    expect(r.closed).toEqual([{ sid: 'sx', keepalive: false }]);
    expect(r.handles).toHaveLength(0);
  });
  it.each([
    ['session protocol 2', { session_protocol_version: 2, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'] }],
    ['no computer_binding', { session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope'] }],
    ['computer_binding not available', { session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope'].map((name) => ({ name, supported: true, available: true })).concat([{ name: 'computer_binding', supported: true, available: false }] as never) }],
    ['no protocol version', { capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'] }],
  ])('a gateway with %s gets no create', async (_n, v) => {
    const r = rig();
    const caps = (v as { capabilities: unknown[] }).capabilities.map((c) => (typeof c === 'string' ? { name: c, supported: true, available: true } : c));
    r.version = async () => ({ ...v, capabilities: caps });
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'not_ready' });
    expect(r.created).toHaveLength(0);
  });
  // A reply that only lacks the evidence (checkStarted missing) proves nothing: it reads
  // unknown, never a binding failure. The session it names came from this create and is never used, so it is still closed.
  it.each([
    ['no started member', { session_id: 'sx' }],
    ['an empty realm_selector', { session_id: 'sx', started: { realm_selector: ' ', computer_id: 'c1', owner_fingerprint: 'fp' } }],
    ['no owner_fingerprint', { session_id: 'sx', started: { realm_selector: R1, computer_id: 'c1' } }],
    ['a computer_id that is not a string', { session_id: 'sx', started: { realm_selector: R1, computer_id: 7, owner_fingerprint: 'fp' } }],
  ])('a create reply with %s is unknown, not a binding failure: closed, never tracked or used', async (_n, reply) => {
    const r = rig();
    r.next.push(async () => reply);
    const s = sessions(r);
    let ran = 0;
    await expect(s.run(s.hold(at()), async () => { ran++; })).rejects.toMatchObject({ kind: 'unknown' });
    expect(ran).toBe(0);
    expect(r.closed).toEqual([{ sid: 'sx', keepalive: false }]);
    expect(r.handles).toHaveLength(0);
  });
  it('a session of another owner is closed and refused', async () => {
    const r = rig();
    r.next.push(async () => ({ session_id: 'sx', started: { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'someone' } }));
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'binding' });
    expect(r.closed.map((c) => c.sid)).toEqual(['sx']);
  });
  it('a lease that cannot be held closes the session and refuses', async () => {
    const r = rig();
    r.leasePhase = () => 'failing';
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'lease' });
    expect(r.closed.map((c) => c.sid)).toEqual(['s1']);
    expect(r.handles[0]!.closed).toBe(true);
  });
});

describe('a create whose answer is lost', () => {
  it('is unknown, is not asked again under its key, and the next open uses a new key', async () => {
    const r = rig();
    r.next.push(async () => { throw new Err(0, 'NETWORK', { kind: 'pending', pending: true }); });
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => 1)).rejects.toMatchObject({ kind: 'unknown' });
    expect(r.keys).toEqual(['key-1']);
    await s.run(h, async () => 1);
    expect(r.keys).toEqual(['key-1', 'key-2']);
    expect(new Set(r.keys).size).toBe(r.keys.length);
  });
  it('an answer with no session id is unknown too', async () => {
    const r = rig();
    r.next.push(async () => ({ started: {} }));
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'unknown' });
  });
  it('a definite refusal is refused, with the agent\'s code', async () => {
    const r = rig();
    r.next.push(async () => { throw new Err(400, 'agent_not_found'); });
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'refused', code: 'agent_not_found', status: 400 });
  });
  it('a request that never left is refused, not unknown', async () => {
    const r = rig();
    r.next.push(async () => { throw new Err(0, 'STALE', { kind: 'not_sent', notSent: true }); });
    const s = sessions(r);
    await expect(s.run(s.hold(at()), async () => 1)).rejects.toMatchObject({ kind: 'refused' });
  });
  it('the terminal demo\'s unsent refusal is the demo, not an agent refusal; nothing is made or closed', async () => {
    const r = rig();
    r.next.push(async () => { throw new Err(0, 'DEMO_READ_ONLY', { kind: 'not_sent', notSent: true }); });
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => 1)).rejects.toMatchObject({ kind: 'demo', code: 'DEMO_READ_ONLY' });
    expect(s.state()).toMatchObject({ phase: 'failed', failure: 'demo' });
    expect(r.closed).toEqual([]);
    expect(r.handles).toEqual([]);
    // The same code answered by the agent (sent) is an ordinary refusal.
    r.next.push(async () => { throw new Err(403, 'DEMO_READ_ONLY'); });
    await expect(s.run(h, async () => 1)).rejects.toMatchObject({ kind: 'refused', code: 'DEMO_READ_ONLY', status: 403 });
  });
  it('a change the demo stopped keeps the demo\'s own code, so the kit\'s words say it is the demo', () => {
    const demo = new SessionError('demo', 'DEMO_READ_ONLY', null);
    expect(sessionCode(demo)).toBe('DEMO_READ_ONLY');
    expect(mcpSessionCode(demo)).toBe('DEMO_READ_ONLY');
    expect(errorWords(errorInfo(unsent(demo, sessionCode(demo)))).key).toBe('err.demoReadOnly');
    // Every other failure keeps its SETTINGS_ code, which each page words itself.
    expect(sessionCode(new SessionError('refused', 'DEMO_READ_ONLY', 403))).toBe('SETTINGS_REFUSED');
    expect(mcpSessionCode(new SessionError('lost'))).toBe('SETTINGS_LOST');
  });
});

describe('leaving', () => {
  it('releasing the last hold closes the session (hard) and the lease', async () => {
    const r = rig();
    const s = sessions(r);
    const a = s.hold(at()), b = s.hold(at());
    await s.run(a, async () => 1);
    a.release();
    expect(r.closed).toEqual([]);
    b.release();
    expect(r.closed).toEqual([{ sid: 's1', keepalive: false }]);
    expect(r.handles[0]!.closed).toBe(true);
    expect(s.state().phase).toBe('idle');
  });
  it('releasing twice closes once', async () => {
    const r = rig();
    const s = sessions(r);
    const a = s.hold(at());
    await s.run(a, async () => 1);
    a.release();
    a.release();
    expect(r.closed).toHaveLength(1);
  });
  it('a view that never ran closes nothing', () => {
    const r = rig();
    const s = sessions(r);
    s.hold(at()).release();
    expect(r.calls).toEqual([]);
  });
  it('a request after release is refused (superseded) and makes no session', async () => {
    const r = rig();
    const s = sessions(r);
    const a = s.hold(at());
    a.release();
    await expect(s.run(a, async () => 1)).rejects.toMatchObject({ kind: 'superseded' });
    expect(r.created).toHaveLength(0);
  });
  it('pagehide closes it with keepalive requests', async () => {
    const r = rig();
    const s = sessions(r);
    await s.run(s.hold(at()), async () => 1);
    window.dispatchEvent(new Event('pagehide'));
    expect(r.closed).toEqual([{ sid: 's1', keepalive: true }]);
    expect(s.state().phase).toBe('idle');
  });
  it('the pagehide listener goes with the last hold', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await s.run(h, async () => 1);
    h.release();
    r.closed.length = 0;
    window.dispatchEvent(new Event('pagehide'));
    expect(r.closed).toEqual([]);
  });
});

describe('a scope switch', () => {
  it('closes the old session at once, ends the old holds and opens a new session in the new scope on the next request', async () => {
    const r = rig();
    const s = sessions(r);
    const old = s.hold(at());
    await s.run(old, async () => 1);
    const next = s.hold(at({ cwd: '/w/shop' }));
    expect(r.closed).toEqual([{ sid: 's1', keepalive: false }]);
    await expect(s.run(old, async () => 1)).rejects.toMatchObject({ kind: 'superseded' });
    let sid = '';
    await s.run(next, async (id) => { sid = id; });
    expect(sid).toBe('s2');
    expect(r.created[1]!.at.cwd).toBe('/w/shop');
    expect(scopeKeyOf(r.created[1]!.at)).not.toBe(scopeKeyOf(r.created[0]!.at));
  });
  it('another realm and another computer are other scopes', () => {
    expect(scopeKeyOf(at())).not.toBe(scopeKeyOf(at({ realm: R2 })));
    expect(scopeKeyOf(at())).not.toBe(scopeKeyOf(at({ target: { project: { id: 'p1' }, container: { id: 'c2' } } })));
  });
  it('a request in flight when the scope changes answers into nothing: its session is closed and the request is refused', async () => {
    const r = rig();
    let release: (v: unknown) => void = () => undefined;
    r.next.push(() => new Promise((res) => { release = res; }));
    const s = sessions(r);
    const old = s.hold(at());
    const p = s.run(old, async () => 1);
    p.catch(() => undefined);
    await new Promise((res) => setTimeout(res, 0));
    expect(r.created).toHaveLength(1);
    s.hold(at({ realm: R2 }));
    release({ session_id: 'late', started: { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp' } });
    await expect(p).rejects.toMatchObject({ kind: 'superseded' });
    expect(r.closed.map((c) => c.sid)).toContain('late');
    expect(s.state().sid).toBeNull();
  });
  it('a hold released while its create is out also closes the session that arrives late', async () => {
    const r = rig();
    let release: (v: unknown) => void = () => undefined;
    r.next.push(() => new Promise((res) => { release = res; }));
    const s = sessions(r);
    const h = s.hold(at());
    const p = s.run(h, async () => 1);
    p.catch(() => undefined);
    await new Promise((res) => setTimeout(res, 0));
    h.release();
    release({ session_id: 'late', started: { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp' } });
    await expect(p).rejects.toMatchObject({ kind: 'superseded' });
    expect(r.closed.map((c) => c.sid)).toContain('late');
    // it never took a lease on a session nobody wants
    expect(r.handles).toHaveLength(0);
    expect(r.calls.some((c) => c.startsWith('ensure:'))).toBe(false);
  });
});

describe('a session the agent lost', () => {
  it('is replaced once and the request runs again on the new session', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    const seen: string[] = [];
    const out = await s.run(h, async (sid) => {
      seen.push(sid);
      if (sid === 's1') throw new Err(404, 'not_found');
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(seen).toEqual(['s1', 's2']);
    expect(r.created).toHaveLength(2);
    expect(s.state()).toMatchObject({ sid: 's2', replaced: 1 });
    // the lost one is closed best-effort, its lease handle dropped
    expect(r.closed.map((c) => c.sid)).toEqual(['s1']);
    expect(r.handles[0]!.closed).toBe(true);
    expect(r.keys[0]).not.toBe(r.keys[1]);
  });
  it('a second loss in the same run ends it: no third session', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => { throw new Err(410, 'attachment_expired'); })).rejects.toMatchObject({ kind: 'lost' });
    expect(r.created).toHaveLength(2);
  });
  it('two requests that lose the same session together make one new session', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await s.run(h, async () => 1);
    const used: string[] = [];
    const use = async (sid: string) => { used.push(sid); if (sid === 's1') throw new Err(404, 'not_found'); return sid; };
    const out = await Promise.all([s.run(h, use), s.run(h, use)]);
    expect(out).toEqual(['s2', 's2']);
    expect(r.created).toHaveLength(2);
  });
  it('an error that is not a lost session passes through untouched', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => { throw new Err(409, 'write_intent_invalid'); })).rejects.toMatchObject({ status: 409, code: 'write_intent_invalid' });
    expect(r.created).toHaveLength(1);
  });
  it('a request that is superseded while it runs is not replaced', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => { h.release(); throw new Err(404, 'not_found'); })).rejects.toMatchObject({ status: 404 });
    expect(r.created).toHaveLength(1);
  });
});

describe('a hold is its own', () => {
  it('a released hold cannot run while another hold of the same scope remains', async () => {
    const r = rig();
    const s = sessions(r);
    const a = s.hold(at());
    const b = s.hold(at());
    a.release();
    let ran = 0;
    await expect(s.run(a, async () => { ran++; })).rejects.toMatchObject({ kind: 'superseded' });
    expect(ran).toBe(0);
    await s.run(b, async () => { ran++; });
    expect(ran).toBe(1);
  });
  it('a hold of a scope left and returned to stays superseded (A to B to A)', async () => {
    const r = rig();
    const s = sessions(r);
    const first = s.hold(at());
    s.hold(at({ realm: R2 }));
    s.hold(at());
    let ran = 0;
    await expect(s.run(first, async () => { ran++; })).rejects.toMatchObject({ kind: 'superseded' });
    expect(ran).toBe(0);
  });
});

describe('work that ends after its hold or session did', () => {
  const deferred = () => { let go!: () => void; const p = new Promise<void>((res) => { go = res; }); return { p, go }; };
  it('a result that comes after the scope changed is dropped (superseded), and alive() said so', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    const d = deferred();
    let aliveAfter: boolean | null = null;
    const run = s.run(h, async (_sid, alive) => { await d.p; aliveAfter = alive(); return 'old'; });
    await Promise.resolve();
    await new Promise((res) => setTimeout(res, 0));
    s.hold(at({ realm: R2 }));
    d.go();
    await expect(run).rejects.toMatchObject({ kind: 'superseded' });
    expect(aliveAfter).toBe(false);
  });
  it('a result that comes after the last release is dropped', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    const d = deferred();
    const run = s.run(h, async () => { await d.p; return 'old'; });
    await new Promise((res) => setTimeout(res, 0));
    h.release();
    d.go();
    await expect(run).rejects.toMatchObject({ kind: 'superseded' });
  });
  it('a result that comes after the session was replaced is dropped', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    const d = deferred();
    const slow = s.run(h, async () => { await d.p; return 'old'; });
    await new Promise((res) => setTimeout(res, 0));
    // another request on the same hold loses the session: it is replaced
    let n = 0;
    await s.run(h, async () => { if (n++ === 0) throw new Err(404, 'not_found'); });
    d.go();
    await expect(slow).rejects.toMatchObject({ kind: 'superseded' });
  });
  it('alive() is true while nothing changed', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    expect(await s.run(h, async (_sid, alive) => alive())).toBe(true);
  });
});

describe('a page restored from the back/forward cache', () => {
  it('keeps its mounted hold: pagehide closes the session and the next run opens a new one under a new key', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    await s.run(h, async () => 1);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    let sid = '';
    await s.run(h, async (x) => { sid = x; });
    expect(sid).toBe('s2');
    expect(r.keys).toEqual(['key-1', 'key-2']);
  });
  it('a late "session gone" answer of a run begun before pagehide does not start it over; a new press does', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    let fail!: () => void;
    const lost = new Promise<void>((_res, rej) => { fail = () => rej(new Err(404, 'not_found')); });
    let steps = 0;
    const old = s.run(h, async () => { steps++; await lost; });
    await new Promise((res) => setTimeout(res, 0));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    fail();
    await expect(old).rejects.toMatchObject({ kind: 'superseded' });
    expect(steps).toBe(1);
    expect(r.created).toHaveLength(1);
    // an explicit new run opens a fresh session
    expect(await s.run(h, async (x) => x)).toBe('s2');
  });
  it('a rules-only view that saw pagehide before any session opened can still save afterwards', async () => {
    const r = rig();
    const s = sessions(r);
    const h = s.hold(at());
    window.dispatchEvent(new Event('pagehide'));
    expect(await s.run(h, async (x) => x)).toBe('s1');
  });
});

describe('state', () => {
  it('tells subscribers when it moves and stops when they leave', async () => {
    const r = rig();
    const s = sessions(r);
    let n = 0;
    const off = s.subscribe(() => { n++; });
    const h = s.hold(at());
    await s.run(h, async () => 1);
    expect(n).toBeGreaterThan(0);
    off();
    const was = n;
    h.release();
    expect(n).toBe(was);
  });
  it('a failed open shows as failed with its reason until the next try or the scope changes', async () => {
    const r = rig();
    r.status = async () => ({ ...READY, auth_active: false });
    const s = sessions(r);
    const h = s.hold(at());
    await expect(s.run(h, async () => 1)).rejects.toBeInstanceOf(SessionError);
    expect(s.state()).toMatchObject({ phase: 'failed', failure: 'not_ready' });
    r.status = async () => READY;
    await s.run(h, async () => 1);
    expect(s.state()).toMatchObject({ phase: 'open', failure: null });
  });
});

describe('the hard close on the wire (the one core route for DELETE /sessions/:id)', () => {
  const sent: { method: string; url: URL }[] = [];
  const tr: Transport = {
    hoody: () => Promise.reject(new Error('x')),
    fetch(url, init) {
      sent.push({ method: String(init.method), url: new URL(url) });
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok', closed: true, hard: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    },
  };
  afterEach(() => { installTransport(null); sent.length = 0; });

  it('sends DELETE /sessions/<id>?hard=true to the settings session\'s own realm, once, and resolves whatever the answer shape', async () => {
    boot({ realm: R1 });
    installTransport(tr);
    await expect(liveApi.close({ target: TARGET, realm: R2 }, 'sx', false)).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('DELETE');
    expect(sent[0]!.url.pathname).toBe('/api/v1/agent/sessions/sx');
    expect(sent[0]!.url.searchParams.get('hard')).toBe('true');
    expect(sent[0]!.url.searchParams.get('realm')).toBe(R2);
  });
  it('a leaving page asks the browser to let the close outlive it (keepalive)', async () => {
    boot({ realm: R1 });
    let keepalive: unknown;
    installTransport({ ...tr, fetch: (url, init, meta) => { keepalive = init.keepalive; return tr.fetch(url, init, meta); } });
    await liveApi.close({ target: TARGET, realm: R1 }, 'sx', true);
    expect(keepalive).toBe(true);
  });
});

// A write that carries `when` is sent only to an agent that lists call_when. The capability is read from the GET /version the
// create already makes (no other request), and answers for the agent of the session the work runs on.
describe('has: the session agent\'s capabilities', () => {
  const caps = (names: string[], off: string[] = []) => async () => ({
    session_protocol_version: 3,
    capabilities: [...['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', ...names].map((name) => ({ name, supported: true, available: true })), ...off.map((name) => ({ name, supported: true, available: false }))],
  });
  it('lists what the create\'s version read lists, supported and available', async () => {
    const r = rig();
    r.version = caps(['call_when']);
    const s = sessions(r);
    const h = s.hold(at());
    expect(await s.run(h, async (_sid, _alive, has) => [has('call_when'), has('computer_binding'), has('nope')])).toEqual([true, true, false]);
  });
  it('a capability the agent lists as not available is not had', async () => {
    const r = rig();
    r.version = caps([], ['call_when']);
    const s = sessions(r);
    expect(await s.run(s.hold(at()), async (_sid, _alive, has) => has('call_when'))).toBe(false);
  });
  it('answers for the agent of the session the work runs on: a replacement session reads its own', async () => {
    const r = rig();
    let n = 0;
    r.version = async () => (++n === 1 ? caps([])() : caps(['call_when'])());
    const s = sessions(r);
    const h = s.hold(at());
    const seen: boolean[] = [];
    await s.run(h, async (sid, _alive, has) => {
      seen.push(has('call_when'));
      if (sid === 's1') throw new Err(404, 'not_found');
    });
    expect(seen).toEqual([false, true]);
  });
});
