// socket.ts: the voice WebSocket's admission, budget slot, outcomes and
// generation fence, over the fixture socket (transport.ts fixtureSocket) and the real leg (hostEnv().webSocket).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bump, capture, startLoggingOut } from './ctx';
import { botVoiceRoute, openSocket, type SocketHandlers, type SocketInput, type SocketOutcome } from './socket';
import { createStreamBudget, type StreamBudget } from './stream-budget';
import { fixtureSocket, fixtureTransport, installTransport, type FixtureRule, type FixtureSocketServer, type Transport } from './transport';
import { boot, PROXY, R1, TARGET } from './test/env';
import { monorepoPath } from './test/monorepo';
import { installWebLocks, type WebLocks } from './test/web-locks';

const COMP = 'p1/c1';
const HOST = `wss://p1-c1-agent-1.sv1.${PROXY}/api/v1/agent`;
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };

let locks: WebLocks;
let budget: StreamBudget;
let legCalls: Array<{ url: string; protocols: readonly string[]; slots: number }>;
let server: FixtureSocketServer | null;
let fromClient: Array<string | ArrayBuffer>;
let clientClose: Array<[number, string]>;

/** The fixture transport with its socket leg recorded: the URL, the subprotocols and the budget slots held at the call. */
function install(rules: readonly FixtureRule[]): void {
  const t = fixtureTransport(rules);
  const leg = t.socket!.bind(t);
  installTransport({ ...t, socket: (url, protocols, meta, on) => { legCalls.push({ url, protocols, slots: budget.slotsInUse(COMP) }); return leg(url, protocols, meta, on); } } as Transport);
}
/** One scripted server: it keeps its handle for the case to drive, and records the client's frames and close. */
const scripted = (open: (s: FixtureSocketServer) => void = (s) => s.accept()) => fixtureSocket(botVoiceRoute, (s) => {
  server = s;
  s.onMessage((d) => fromClient.push(d));
  s.onClose((c, r) => clientClose.push([c, r]));
  open(s);
});

function voice(input: Partial<SocketInput> = {}) {
  const outcomes: SocketOutcome[] = [], texts: string[] = [], bins: ArrayBuffer[] = [];
  const h: SocketHandlers = { onOutcome: (o) => outcomes.push(o), onText: (t) => texts.push(t), onBinary: (b) => bins.push(b) };
  const sock = openSocket(botVoiceRoute, { params: { id: 'b1' }, target: TARGET, realm: R1, ...input }, h, budget);
  return { sock, outcomes, texts, bins, kinds: () => outcomes.map((o) => o.kind) };
}
const session = JSON.stringify({ type: 'session', epoch: 1, conn: 'c-1', in_rate: 16000, out_rate: 24000, vad: true });

beforeEach(() => {
  boot({ realm: R1 });
  locks = installWebLocks();
  budget = createStreamBudget({ limit: 2, reserve: 0, retryMs: 30, cutWaitMs: 40 });
  legCalls = []; server = null; fromClient = []; clientClose = [];
  install([scripted()]);
});
afterEach(() => { budget.reset(); installTransport(null); });

describe('admission', () => {
  it('goes to the captured target as wss:, with the declared query, refuse=frame, the realm and the voice subprotocol', async () => {
    voice({ query: { mode: 'ptt', out_rate: 24000, takeover: false, play_lead: true } });
    await settle();
    expect(legCalls).toHaveLength(1);
    expect(legCalls[0]!.url).toBe(`${HOST}/bots/b1/voice?mode=ptt&out_rate=24000&takeover=false&play_lead=true&refuse=frame&realm=${R1}`);
    expect(legCalls[0]!.protocols).toEqual(['hoody.voice.v1']);
  });
  it('declares exactly the query keys the agent publishes for getBotVoice', (ctx) => {
    const kits = monorepoPath(process.env.HUB_LIMITS_KITS, 'hoody-kit');
    if (kits === null) return ctx.skip();
    const spec = join(kits, 'hoody-agent/internal/httpapi/openapi.json');
    if (!existsSync(spec)) return;
    const op = JSON.parse(readFileSync(spec, 'utf8')).paths['/api/v1/agent/bots/{id}/voice'].get as { parameters: Array<{ in: string; name: string }>; 'x-websocket': { subprotocol: string } };
    const published = op.parameters.filter((p) => p.in === 'query' && p.name !== 'realm').map((p) => p.name).sort();
    expect([...botVoiceRoute.query].sort()).toEqual(published);
    expect(op['x-websocket'].subprotocol).toBe('hoody.voice.v1');
  });
  it('refuses unsent: an undeclared key, refuse other than frame, a realm in the query, no target, a non-ws route', async () => {
    const cases: Array<[Partial<SocketInput>, string]> = [
      [{ query: { nope: 1 } }, 'ROUTE_QUERY'],
      [{ query: { refuse: 'http' } }, 'ROUTE_QUERY'],
      [{ query: { realm: R1 } }, 'ROUTE_QUERY'],
      [{ target: null }, 'NO_AGENT_URL'],
      [{ realm: 'all' }, 'AGENT_REALM_REQUIRED'],
      [{ params: { id: '..' } }, 'ROUTE_PARAMS'],
    ];
    boot({ realm: R1, target: null });
    install([scripted()]);
    for (const [input, code] of cases) {
      const v = voice(input);
      expect(v.outcomes).toEqual([]); // never before openSocket() returned
      await settle(2);
      expect(v.outcomes, code).toEqual([{ kind: 'not_sent', code }]);
    }
    const plain = { ...botVoiceRoute };
    const out: SocketOutcome[] = [];
    openSocket(plain as typeof botVoiceRoute, { params: { id: 'b1' }, target: TARGET }, { onOutcome: (o) => out.push(o) }, budget);
    await settle(2);
    expect(out).toEqual([{ kind: 'not_sent', code: 'ROUTE_NOT_ALLOWED' }]);
    expect(legCalls).toEqual([]);
    expect(budget.slotsInUse(COMP)).toBe(0);
  });
  it('refuses a framed page and a dead context unsent', async () => {
    boot({ realm: R1, framed: true });
    install([scripted()]);
    const f = voice();
    boot({ realm: R1 });
    install([scripted()]);
    const ctx = capture(TARGET);
    bump('test');
    const d = voice({ ctx });
    await settle();
    expect(f.outcomes).toEqual([{ kind: 'not_sent', code: 'FRAMED_ACTION_REFUSED' }]);
    expect(d.outcomes).toEqual([{ kind: 'not_sent', code: 'STALE' }]);
    expect(legCalls).toEqual([]);
  });
  it('refuses a transport without a socket leg, and a leg that throws', async () => {
    installTransport({ hoody: () => Promise.reject(new Error('x')), fetch: () => Promise.reject(new Error('x')) });
    const a = voice();
    await settle();
    installTransport({ hoody: () => Promise.reject(new Error('x')), fetch: () => Promise.reject(new Error('x')), socket: () => { throw new Error('csp'); } });
    const b = voice();
    await settle();
    expect(a.outcomes).toEqual([{ kind: 'not_sent', code: 'NO_SOCKET' }]);
    expect(b.outcomes).toEqual([{ kind: 'not_sent', code: 'SOCKET_REFUSED' }]);
    expect(budget.slotsInUse(COMP)).toBe(0);
  });
});

describe('outcomes', () => {
  it('open at the session frame; frames pass raw both ways; a close after session is closed {code, reason}', async () => {
    const v = voice();
    await settle();
    expect(v.sock.send('early')).toBe(true); // the socket is open; the codec decides what it sends before session
    server!.text(session);
    server!.text('{"type":"vad.start"}');
    server!.binary(new Uint8Array([1, 0, 0, 0, 1]).buffer);
    await settle();
    expect(v.outcomes).toEqual([{ kind: 'open', protocol: 'hoody.voice.v1' }]);
    expect(v.texts).toEqual([session, '{"type":"vad.start"}']);
    expect([...new Uint8Array(v.bins[0]!)]).toEqual([1, 0, 0, 0, 1]);
    expect(v.sock.send(new Uint8Array([0, 0, 0, 0, 7]))).toBe(true);
    await settle();
    expect(fromClient[0]).toBe('early');
    expect([...new Uint8Array(fromClient[1] as ArrayBuffer)]).toEqual([0, 0, 0, 0, 7]);
    server!.close(1001, 'the Bot was stopped');
    await settle();
    expect(v.outcomes.at(-1)).toEqual({ kind: 'closed', code: 1001, reason: 'the Bot was stopped' });
    expect(v.sock.send('late')).toBe(false);
  });
  it('a refused frame then 4000+status is refused {code, status, details, retryAfterMs}, never passed on', async () => {
    install([scripted((s) => s.refuse(503, 'service_unavailable', { retryAfterSecs: 7, details: { stage: 'stt' } }))]);
    const a = voice();
    await settle();
    install([scripted((s) => s.refuse(404, 'not_found'))]);
    const b = voice();
    await settle();
    install([scripted((s) => s.refuse(409, 'voice_busy', { retryAfterSecs: 1e9 }))]);
    const c = voice();
    await settle();
    expect(a.outcomes).toEqual([{ kind: 'refused', code: 'service_unavailable', status: 503, details: { stage: 'stt' }, retryAfterMs: 7000 }]);
    expect(b.outcomes).toEqual([{ kind: 'refused', code: 'not_found', status: 404, details: null, retryAfterMs: null }]);
    expect(c.outcomes).toEqual([{ kind: 'refused', code: 'voice_busy', status: 409, details: null, retryAfterMs: null }]);
    expect([...a.texts, ...b.texts, ...c.texts]).toEqual([]);
    expect(legCalls).toHaveLength(3); // reported, never retried
  });
  it('unknown: a 1006 (before or after session), or a close before session without a refused frame', async () => {
    install([scripted((s) => { s.accept(); s.drop(); })]);
    const a = voice();
    await settle();
    install([scripted((s) => { s.accept(); s.close(1000); })]);
    const b = voice();
    await settle();
    install([scripted((s) => { s.accept(); s.close(4409); })]);
    const c = voice();
    await settle();
    install([scripted((s) => { s.accept(); s.text(session); s.drop(); })]);
    const d = voice();
    await settle();
    install([scripted((s) => { s.accept(); s.text(JSON.stringify({ type: 'refused', code: 'service_unavailable' })); s.drop(); })]);
    const e = voice();
    await settle();
    expect(e.outcomes).toEqual([{ kind: 'unknown', code: 1006 }]); // a refused frame, then the connection lost: still unknown
    expect(a.outcomes).toEqual([{ kind: 'unknown', code: 1006 }]);
    expect(b.outcomes).toEqual([{ kind: 'unknown', code: 1000 }]);
    expect(c.outcomes).toEqual([{ kind: 'unknown', code: 4409 }]);
    expect(d.kinds()).toEqual(['open', 'unknown']);
  });
  it('a ws route with no socket rule is the fixture refusal NO_FIXTURE 501; the leg refuses on a live page', async () => {
    install([]);
    const a = voice();
    await settle();
    expect(a.outcomes).toEqual([{ kind: 'refused', code: 'NO_FIXTURE', status: 501, details: null, retryAfterMs: null }]);
    const g = globalThis as { apiCall?: unknown };
    g.apiCall = () => undefined; // the real shared.js is loaded: fixtures are refused
    try {
      const b = voice();
      await settle();
      expect(b.outcomes).toEqual([{ kind: 'not_sent', code: 'SOCKET_REFUSED' }]);
    } finally { delete g.apiCall; }
  });
});

describe('budget slot', () => {
  it('is taken before the socket opens and freed when the socket ends', async () => {
    const v = voice();
    await settle();
    expect(legCalls[0]!.slots).toBe(1);
    server!.text(session);
    server!.close(1000);
    await settle();
    expect(v.kinds()).toEqual(['open', 'closed']);
    expect(budget.slotsInUse(COMP)).toBe(0);
  });
  it('the owner close() closes the socket, frees the slot and delivers nothing more', async () => {
    const v = voice();
    await settle();
    server!.text(session);
    await settle();
    v.sock.close();
    server!.text('{"type":"pong"}');
    await settle();
    expect(budget.slotsInUse(COMP)).toBe(0);
    expect(clientClose).toEqual([[1000, '']]);
    expect(v.kinds()).toEqual(['open']);
    expect(v.texts).toEqual([session]);
    expect(v.sock.send('x')).toBe(false);
  });
  it('a close() while waiting for the slot never opens the socket', async () => {
    const v = voice();
    v.sock.close();
    await settle();
    expect(legCalls).toEqual([]);
    expect(v.outcomes).toEqual([]);
  });
  it('no slot is outcome budget, unsent; locks held by another tab is locks', async () => {
    const hold = (k: string) => budget.watch({ computer: COMP, key: k, kind: 'session', level: 'stream', rank: 'open', open: () => ({ close() {} }) });
    hold('a'); hold('b');
    const v = voice();
    await settle();
    expect(v.outcomes).toEqual([{ kind: 'budget' }]);
    budget.reset();
    budget = createStreamBudget({ limit: 2, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    for (let n = 1; n <= 2; n++) locks.asClient('other', () => { void navigator.locks.request(`hoody-agent-stream:${COMP}:${n}`, { ifAvailable: true }, () => new Promise<void>(() => {})); });
    const w = voice();
    await settle();
    expect(w.outcomes).toEqual([{ kind: 'locks' }]);
    expect(legCalls).toEqual([]);
  });
  it('ranks voice right after open: it cuts a focused stream, and yields to the change feed', async () => {
    budget = createStreamBudget({ limit: 1, reserve: 0, retryMs: 30, cutWaitMs: 40 });
    let cut = 0;
    budget.watch({ computer: COMP, key: 'f', kind: 'session', level: 'stream', rank: 'focused', open: () => ({ close() { cut++; } }) });
    await settle();
    const v = voice();
    await settle();
    expect(cut).toBe(1);
    expect(legCalls).toHaveLength(1);
    server!.text(session);
    await settle();
    budget.watch({ computer: COMP, key: 'feed', kind: 'changes', level: 'stream', open: () => ({ close() {} }) });
    await settle();
    expect(v.kinds()).toEqual(['open', 'budget']);
    expect(clientClose).toEqual([[1000, '']]);
  });
});

describe('generation fence', () => {
  it('a context that dies ends the call as stale: the socket closes, later frames are dropped, the slot is freed', async () => {
    const v = voice();
    await settle();
    server!.text(session);
    await settle();
    bump('test');
    server!.text('{"type":"pong"}');
    await settle();
    expect(v.kinds()).toEqual(['open', 'stale']);
    expect(v.texts).toEqual([session]);
    expect(clientClose).toEqual([[1000, '']]);
    expect(budget.slotsInUse(COMP)).toBe(0);
  });
  it('a context that dies without a bump (sign-out started) ends the call as stale at its next frame, which is dropped', async () => {
    const v = voice();
    await settle();
    server!.text(session);
    await settle();
    startLoggingOut();
    server!.binary(new Uint8Array([1, 0, 0, 0, 1]).buffer);
    server!.text('{"type":"pong"}');
    await settle();
    expect(v.kinds()).toEqual(['open', 'stale']);
    expect(v.texts).toEqual([session]);
    expect(v.bins).toEqual([]);
    expect(clientClose).toEqual([[1000, '']]);
    expect(budget.slotsInUse(COMP)).toBe(0);
  });
  it('a context that dies while waiting for the slot is stale, unsent', async () => {
    const v = voice();
    bump('test');
    await settle();
    expect(v.outcomes).toEqual([{ kind: 'stale' }]);
    expect(legCalls).toEqual([]);
  });
  it('every call has its own, growing generation; a closed call hears nothing of its socket', async () => {
    const a = voice();
    const b = voice();
    expect(b.sock.gen).toBeGreaterThan(a.sock.gen);
    await settle();
    a.sock.close();
    await settle();
    expect(a.outcomes).toEqual([]);
    expect(b.outcomes).toEqual([]);
  });
});

describe('the real leg', () => {
  it('opens hostEnv().webSocket with the subprotocol, reads binary as ArrayBuffer, reports open, frames and close', async () => {
    const made: FakeWs[] = [];
    class FakeWs {
      binaryType = 'blob'; readyState = 0; protocol = ''; sent: unknown[] = []; closed: Array<[number?, string?]> = [];
      onopen: (() => void) | null = null; onmessage: ((e: { data: unknown }) => void) | null = null; onclose: ((e: { code: number; reason: string }) => void) | null = null;
      constructor(public url: string, public protocols: string[]) { made.push(this); }
      send(d: unknown) { this.sent.push(d); }
      close(c?: number, r?: string) { this.closed.push([c, r]); }
    }
    const g = globalThis as { WebSocket?: unknown };
    const real = g.WebSocket;
    g.WebSocket = FakeWs;
    installTransport(null);
    try {
      const v = voice();
      await settle();
      const ws = made[0]!;
      expect(ws.url).toBe(`${HOST}/bots/b1/voice?refuse=frame&realm=${R1}`);
      expect(ws.protocols).toEqual(['hoody.voice.v1']);
      expect(ws.binaryType).toBe('arraybuffer');
      ws.readyState = 1; ws.protocol = 'hoody.voice.v1'; ws.onopen!();
      ws.onmessage!({ data: session });
      ws.onmessage!({ data: new ArrayBuffer(3) });
      expect(v.sock.send('x')).toBe(true);
      expect(ws.sent).toEqual(['x']);
      ws.onclose!({ code: 1000, reason: '' });
      await settle();
      expect(v.kinds()).toEqual(['open', 'closed']);
      expect(v.texts).toEqual([session]);
      expect(v.bins[0]!.byteLength).toBe(3);
    } finally { g.WebSocket = real; }
  });
});
