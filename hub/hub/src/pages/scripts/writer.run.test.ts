// Vitest on one ask of the writing assistant over core's real request path (writer.ts, advance): only the network is replaced, by
// a fake agent that records every request. What is pinned: the order of the requests, what each carries (no model, one
// Idempotency-Key per create and per turn), that nothing is sent to a session without the script-writer ceiling, and C9: a turn is
// sent once, a lost answer is read back from the session's own receipts, and unknown is never shown as failed.
/* eslint-disable no-restricted-globals -- one test plays a browser that stops accepting writes (as pages/ai/holds.test.tsx) */
import { claimScriptAsk, dropScriptAsks, providers, putScriptAsk, readScriptAsks, SCRIPT_ASKS_KEY, SCRIPT_ASKS_MAX, subscribeScriptAsksVersion, type ScriptAsk } from '@core';
import { bump } from '@core/ctx';
import { endAccount } from '@core/realm';
import { clearAuthTokens } from '@core/session';
import { AGENT, boot, calls, onFetch as envOnFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, askIdOf, cancelRun, claimAnswer, closeAsk, forgetRuns, heldCount, forgetHeldValues, incarnationOf, openRun, resume, restoreRun, runOf, startRun, storedAsk, subscribeAsks, timing, valuesOf, type AiAnswer, type Place, type WriterRun } from './writer';

const STARTED = { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp1', tool_ceiling: 'script-writer' };
const created = { session_id: 's1', started: STARTED, replayed: false };
const text = (t: string) => ({ kind: 'text', text: t });
const ANSWER = 'Summary: it works\n```ts\nreturn 1;\n```';
const transcript = (final = ANSWER) => ({ messages: [
  { role: 'user', blocks: [text('write it')] },
  { role: 'assistant', blocks: [text('Let me check that.'), { kind: 'tool_use', tool_name: 'hoody_exec_validate', input: {} }] },
  { role: 'assistant', blocks: [{ kind: 'thinking', text: 'private' }, text(final)] },
] });

const V3 = { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) };
interface World {
  version: Reply;
  create: Array<Reply | ((n: number) => Reply)>;
  turn: Reply;
  receipts: Array<Record<string, unknown>>;
  turns: Reply;
  transcript: Reply;
  stream: Reply;
  cancel: Reply;
}
const fresh = (): World => ({
  version: { status: 200, body: V3 },
  create: [{ status: 201, body: created }],
  turn: { status: 202, body: { turn_id: 't1', state: 'accepted' } },
  receipts: [{ turn_id: 't1', state: 'dispatched' }, { turn_id: 't1', state: 'completed' }],
  turns: { status: 200, body: { session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }] } },
  transcript: { status: 200, body: transcript() },
  stream: { status: 200, headers: { 'content-type': 'text/event-stream' }, text: '' },
  cancel: { status: 200, body: { status: 'ok', matched: true } },
});
let w = fresh();
let creates = 0;
let reads = 0;
/** Every handler of this file answers the create's /version read with the world's gateway (`w.version`, protocol 3 unless a test sets another). */
const onFetch = (h: (c: Call) => Reply | Promise<Reply>): void => { envOnFetch((c) => (c.method === 'GET' && route(c) === '/version' ? w.version : h(c))); };
const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const sent = (method: string, path: string): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === method && route(c) === path);

function fake(): void {
  creates = 0;
  reads = 0;
  onFetch(baseHandler());
}
const onFetchBase = (): ((c: Call) => Reply) => baseHandler();
function baseHandler(): (c: Call) => Reply {
  return (c): Reply => {
    const p = route(c);
    if (c.method === 'GET' && p === '/version') return w.version;
    if (c.method === 'POST' && p === '/sessions') { const r = w.create[Math.min(creates++, w.create.length - 1)]!; return typeof r === 'function' ? r(creates) : r; }
    if (c.method === 'POST' && p === '/sessions/s1/turns') return w.turn;
    if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: w.receipts[Math.min(reads++, w.receipts.length - 1)] };
    if (c.method === 'GET' && p === '/sessions/s1/turns') return w.turns;
    if (c.method === 'GET' && p === '/sessions/s1/transcript') return w.transcript;
    if (c.method === 'GET' && p === '/sessions/s1/stream') return w.stream;
    if (c.method === 'POST' && p === '/sessions/s1/cancel') return w.cancel;
    return { status: 404, body: { code: 'not_found' } };
  };
}
const env = { target: TARGET, realm: R1, owner: 'fp1' };
let n = 0;
const mint = (): string => `key-${++n}`;
const begin = (extra: Partial<WriterRun> = {}): WriterRun => ({ ...startRun({ compId: 'c1', path: null, text: 'write it', realm: R1, owner: 'fp1' }, env, mint), ...extra });
/** One view's press: the run, and its answer taken at once (a claim), as a view that shows the place does. */
const run = async (rec: WriterRun): Promise<AiAnswer> => {
  const a = await advance(rec);
  await claimAnswer(a);
  return a;
};
/** The run alone: nobody takes its answer. */
const runKeep = (rec: WriterRun): Promise<AiAnswer> => advance(rec);
/** No run in memory and nothing stored: a new page of a new browser. */
const wipe = async (): Promise<void> => {
  forgetRuns();
  const all = readScriptAsks();
  if (Array.isArray(all)) await dropScriptAsks(all);
};
const place = (path: string | null = null, extra: Partial<Place> = {}): Place => ({ compId: 'c1', path, realm: R1, owner: 'fp1', ...extra });
const turnPosts = (): number => sent('POST', '/sessions/s1/turns').length;

describe('one ask of the writing assistant', () => {
  beforeEach(async () => {
    boot({ realm: R1 });
    w = fresh();
    fake();
    await wipe();
    Object.assign(timing, { everyMs: 5, wakeMs: 2, maxMs: 3000 });
    n = 0;
  });
  afterEach(() => forgetRuns());

  it('creates a script-writer session, sends one turn, waits for its receipt and returns the last assistant text', async () => {
    const r = await run(begin());
    expect(r).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    const order = calls.filter((c) => c.url.startsWith(AGENT) && !route(c).endsWith('/stream')).map((c) => `${c.method} ${route(c)}`);
    expect(order.slice(0, 3), 'the create reads /version first (the gate), then creates, then the turn').toEqual(['GET /version', 'POST /sessions', 'POST /sessions/s1/turns']);
    expect(order[order.length - 1]).toBe('GET /sessions/s1/transcript');
    expect(order.filter((o) => o === 'GET /sessions/s1/turns/t1').length).toBeGreaterThanOrEqual(2);
  });

  it("the session names the script-writer, New chat's default model, the realm and the computer", async () => {
    await run(begin());
    const body = sent('POST', '/sessions')[0]!.body;
    expect(body).toMatchObject({ agent: 'script-writer', realm: R1, computer: 'c1', expected_binding: { realm: R1, computer: 'c1' } });
    // The free Hoody model, the constant New chat starts with (pages/ai/new/logic.ts defaultModel): never the computer's default pin.
    expect((body as Record<string, unknown>).model).toBe(providers.FREE);
    expect(JSON.stringify(body)).not.toMatch(/claude|anthropic|gpt/i);
    expect(sent('POST', '/sessions')[0]!.url).toContain(`realm=${R1}`);
  });

  it('the create and the turn each carry their own Idempotency-Key, and the turn body is only the text', async () => {
    await run(begin());
    expect(sent('POST', '/sessions')[0]!.headers['idempotency-key']).toBe('key-1');
    const t = sent('POST', '/sessions/s1/turns')[0]!;
    expect(t.headers['idempotency-key']).toBe('key-2');
    expect(t.body).toEqual({ text: 'write it' });
  });

  it('nothing is sent to a session whose tools are not fixed to the script-writer ceiling', async () => {
    for (const started of [{ ...STARTED, tool_ceiling: undefined }, { ...STARTED, tool_ceiling: 'other' }]) {
      calls.length = 0;
      w.create = [{ status: 201, body: { ...created, started } }];
      expect(await run(begin())).toEqual({ outcome: 'not_sent', code: 'NO_CEILING' });
      expect(turnPosts()).toBe(0);
      expect(runOf(place())).toBeUndefined();
    }
  });

  it('nothing is sent to a session bound to another owner, realm or computer', async () => {
    for (const started of [{ ...STARTED, owner_fingerprint: 'fp2' }, { ...STARTED, realm_selector: 'bbbbbbbbbbbbbbbbbbbbbbb2' }, { ...STARTED, computer_id: 'c9' }, { ...STARTED, computer_id: '' }, { ...STARTED, computer_id: undefined }, { ...STARTED, realm_selector: undefined }, { ...STARTED, realm_selector: '' }]) {
      calls.length = 0;
      w.create = [{ status: 201, body: { ...created, started } }];
      expect(await run(begin())).toEqual({ outcome: 'not_sent', code: 'BINDING' });
      expect(turnPosts()).toBe(0);
    }
  });

  it('a gateway below session protocol 3, or without computer_binding, gets zero creates and zero turns; the ask stays pending', async () => {
    const caps = (f: (c: { name: string; supported: boolean; available: boolean }) => { name: string; supported: boolean; available: boolean } | null) => V3.capabilities.map(f).filter(Boolean);
    const gateways: Array<[string, unknown]> = [
      ['protocol 2 with every capability', { ...V3, session_protocol_version: 2 }],
      ['no protocol version', { ...V3, session_protocol_version: undefined }],
      ['computer_binding missing', { ...V3, capabilities: caps((c) => (c.name === 'computer_binding' ? null : c)) }],
      ['computer_binding not available', { ...V3, capabilities: caps((c) => (c.name === 'computer_binding' ? { ...c, available: false } : c)) }],
      ['computer_binding not supported', { ...V3, capabilities: caps((c) => (c.name === 'computer_binding' ? { ...c, supported: false } : c)) }],
    ];
    for (const [name, body] of gateways) {
      calls.length = 0;
      w.version = { status: 200, body };
      const r = await run(begin());
      expect(sent('POST', '/sessions'), `${name}: no create`).toHaveLength(0);
      expect(turnPosts(), `${name}: no turn`).toBe(0);
      expect(r.outcome, name).toBe('pending');
    }
  });

  it('a version that cannot be read sends nothing either, and the ask stays pending under its key', async () => {
    w.version = { status: 503, body: {} };
    const r = await run(begin());
    expect(sent('POST', '/sessions')).toHaveLength(0);
    expect(turnPosts()).toBe(0);
    expect(r.outcome).toBe('pending');
  });

  it('the same ask is sent once the gateway binds, under the same Idempotency-Key', async () => {
    w.version = { status: 200, body: { ...V3, session_protocol_version: 2 } };
    const rec = begin();
    expect((await runKeep(rec)).outcome).toBe('pending');
    expect(sent('POST', '/sessions')).toHaveLength(0);
    w.version = { status: 200, body: V3 };
    expect((await run(rec)).outcome).toBe('done');
    const posts = sent('POST', '/sessions');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.headers['idempotency-key']).toBe(rec.createKey);
    expect(turnPosts()).toBe(1);
  });

  it('a create reply that carries the retired container_id never reaches a turn, alone or beside a matching computer_id', async () => {
    for (const extra of [{ container_id: 'c9' }, { container_id: 'c1' }, { container_id: 7 }, { container_id: null }, { container_id: '' }]) {
      calls.length = 0;
      w.create = [{ status: 201, body: { ...created, started: { ...STARTED, ...extra } } }];
      expect(await run(begin()), JSON.stringify(extra)).toEqual({ outcome: 'not_sent', code: 'BINDING' });
      expect(turnPosts()).toBe(0);
    }
    calls.length = 0;
    const { computer_id: _c, ...bare } = STARTED;
    w.create = [{ status: 201, body: { ...created, started: { ...bare, container_id: 'c1' } } }];
    expect(await run(begin())).toEqual({ outcome: 'not_sent', code: 'BINDING' });
    expect(turnPosts()).toBe(0);
  });

  it('a create that agent refuses is failed with its code and sends no turn', async () => {
    w.create = [{ status: 422, body: { code: 'unknown_chat_agent', message: 'x' } }];
    const r = await run(begin());
    expect(r.outcome).toBe('failed');
    expect(r.code).toBe('unknown_chat_agent');
    expect(turnPosts()).toBe(0);
  });

  describe('a create whose answer is lost', () => {
    it('is asked once more with the same Idempotency-Key, and the ask goes on with the session it names', async () => {
      w.create = [{ status: 502, body: {} }, { status: 201, body: { ...created, replayed: true } }];
      expect((await run(begin())).outcome).toBe('done');
      const posts = sent('POST', '/sessions');
      expect(posts).toHaveLength(2);
      expect(posts[1]!.headers['idempotency-key']).toBe(posts[0]!.headers['idempotency-key']);
      expect(turnPosts()).toBe(1);
    });

    it('lost twice is pending, never failed, and no turn is sent; a Check again asks with that same key again', async () => {
      w.create = [{ status: 502, body: {} }, { network: true, status: 0 }, { status: 201, body: created }];
      const rec = begin();
      expect(await run(rec)).toEqual({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
      expect(turnPosts()).toBe(0);
      expect(runOf(place())).toBe(rec);
      expect((await run(rec)).outcome).toBe('done');
      const keys = new Set(sent('POST', '/sessions').map((c) => c.headers['idempotency-key']));
      expect(keys.size).toBe(1);
      expect(sent('POST', '/sessions')).toHaveLength(3);
    });
  });

  describe('a turn whose answer is lost', () => {
    it('is never sent again: the session\'s own receipts say it was admitted, and the ask goes on with that turn', async () => {
      w.turn = { status: 502, body: {} };
      expect((await run(begin())).outcome).toBe('done');
      expect(turnPosts()).toBe(1);
      expect(sent('GET', '/sessions/s1/turns')).toHaveLength(1);
    });

    it('is pending when no receipt shows it yet (it may still be admitted), never failed and never sent again; a Check again reads the receipts', async () => {
      w.turn = { network: true, status: 0 };
      w.turns = { status: 200, body: { session_id: 's1', turns: [] } };
      const rec = begin();
      expect(await run(rec)).toEqual({ outcome: 'pending', code: 'TURN_UNKNOWN' });
      expect(turnPosts()).toBe(1);
      w.turns = { status: 200, body: { session_id: 's1', turns: [{ turn_id: 't1', state: 'dispatched' }] } };
      expect((await run(rec)).outcome).toBe('done');
      expect(turnPosts()).toBe(1);
      expect(sent('POST', '/sessions')).toHaveLength(1);
    });

    it('is pending, not failed, when the receipts cannot be read either', async () => {
      w.turn = { status: 503, body: { code: 'admission_unconfirmed' } };
      w.turns = { status: 500, body: {} };
      const r = await run(begin());
      expect(r).toEqual({ outcome: 'pending', code: 'TURN_UNKNOWN' });
      expect(turnPosts()).toBe(1);
    });

    it('several receipts are not this ask\'s alone: pending, and none is taken', async () => {
      w.turn = { status: 502, body: {} };
      w.turns = { status: 200, body: { session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }, { turn_id: 't0', state: 'completed' }] } };
      expect((await run(begin())).outcome).toBe('pending');
      expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(0);
    });
  });

  it('a turn the agent refuses before running it is failed with its code (a definite refusal)', async () => {
    w.turn = { status: 409, body: { code: 'gate_parked' } };
    const r = await run(begin());
    expect(r.outcome).toBe('failed');
    expect(r.code).toBe('gate_parked');
    expect(turnPosts()).toBe(1);
    expect(runOf(place())).toBeUndefined();
  });

  it('a turn that ends without completing is a plain failure with the agent\'s code, and its reply is never read', async () => {
    for (const [receipt, code] of [[{ state: 'failed', error_code: 'provider_error' }, 'provider_error'], [{ state: 'cancelled' }, 'cancelled'], [{ state: 'interrupted', effects_may_have_occurred: false }, 'interrupted']] as const) {
      calls.length = 0;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }, { turn_id: 't1', ...receipt }];
      reads = 0;
      expect(await run(begin())).toEqual({ outcome: 'failed', code });
      expect(sent('GET', '/sessions/s1/transcript')).toHaveLength(0);
    }
  });

  it('a turn still running when the press stops waiting is pending, not failed; a Check again waits for it again and returns the answer', async () => {
    timing.maxMs = 30;
    w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
    const rec = begin();
    expect(await run(rec)).toEqual({ outcome: 'pending', code: 'TURN_RUNNING' });
    expect(runOf(place())).toBe(rec);
    timing.maxMs = 3000;
    w.receipts = [{ turn_id: 't1', state: 'completed' }];
    expect((await run(rec)).outcome).toBe('done');
    expect(turnPosts()).toBe(1);
    expect(sent('POST', '/sessions')).toHaveLength(1);
  });

  it('an unreadable receipt is pending after three tries, never failed', async () => {
    reads = 0;
    onFetch((c) => (c.method === 'GET' && route(c) === '/sessions/s1/turns/t1' ? { status: 500, body: {} } : c.method === 'POST' && route(c) === '/sessions' ? { status: 201, body: created } : { status: 202, body: { turn_id: 't1', state: 'accepted' } }));
    expect(await run(begin())).toEqual({ outcome: 'pending', code: 'RECEIPT_UNREADABLE' });
    expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(3);
    expect(turnPosts()).toBe(1);
  });

  describe('the answer is read from the session\'s record', () => {
    it('a transcript that cannot be read leaves the ask pending, and a Check again reads only the transcript', async () => {
      w.transcript = { status: 503, body: {} };
      const rec = begin();
      expect(await run(rec)).toEqual({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
      calls.length = 0;
      w.transcript = { status: 200, body: transcript() };
      expect((await run(rec)).outcome).toBe('done');
      expect(calls.filter((c) => c.url.startsWith(AGENT) && c.method === 'POST')).toHaveLength(0);
      expect(sent('GET', '/sessions/s1/transcript')).toHaveLength(1);
    });

    it('a whole transcript whose assistant has no text after the prompt is a failure that names no reply', async () => {
      w.transcript = { status: 200, body: { messages: [{ role: 'user', blocks: [text('write it')] }, { role: 'assistant', blocks: [{ kind: 'tool_use', tool_name: 'x', input: {} }] }] } };
      expect(await run(begin())).toEqual({ outcome: 'failed', code: 'NO_REPLY' });
    });

    it('a transcript that reports no completed turn holds only a mid-turn tail: pending with the ask kept, never a failure, until the turn is whole', async () => {
      timing.maxMs = 30;
      w.transcript = { status: 200, body: { turns_total: 0, turns_returned: 0, turn_boundaries: [], messages: [{ role: 'user', blocks: [text('write it')] }, { role: 'assistant', blocks: [{ kind: 'tool_use', tool_name: 'x', input: {} }] }] } };
      const rec = begin();
      const a = await run(rec);
      expect(a.outcome).toBe('pending');
      expect(openRun(place())).toBe(true);
      w.transcript = { status: 200, body: { ...(transcript() as object), turns_total: 1 } };
      expect(await run(rec)).toEqual({ outcome: 'done', data: { reply: ANSWER } });
      expect(turnPosts()).toBe(1);
    });

    it('a transcript that is not whole is pending, never a failure: no list, a message that is not one, no prompt, nothing of the assistant yet', async () => {
      const bad: unknown[] = [
        {}, { messages: 'x' }, { messages: [null] }, { messages: [{ role: 'assistant' }] }, { messages: [{ blocks: [] }] },
        { messages: [{ role: 'assistant', blocks: [text('Summary: a')] }] },
        { messages: [{ role: 'user', blocks: [text('write it')] }] },
        { messages: [{ role: 'user', blocks: [text('write it')] }, { role: 'user', blocks: [{ kind: 'tool_result', output: 'ok' }] }] },
      ];
      for (const body of bad) {
        await wipe();
        w.transcript = { status: 200, body };
        expect(await run(begin()), JSON.stringify(body)).toEqual({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
      }
    });

    it('a block that is not a block is pending with the run kept, never a failure', async () => {
      for (const blocks of [[null], [{}], [{ kind: 'text', text: 7 }]]) {
        await wipe();
        w.transcript = { status: 200, body: { messages: [{ role: 'user', blocks: [text('write it')] }, { role: 'assistant', blocks }] } };
        const rec = begin();
        expect(await run(rec), JSON.stringify(blocks)).toEqual({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
        expect(runOf(place())).toBe(rec);
      }
    });

    it('an earlier turn\'s answer is never taken for this one: the text before the prompt is not the reply', async () => {
      w.transcript = { status: 200, body: { messages: [
        { role: 'user', blocks: [text('earlier ask')] }, { role: 'assistant', blocks: [text('Summary: earlier\n```ts\nold();\n```')] },
        { role: 'user', blocks: [text('write it')] },
      ] } };
      const rec = begin();
      expect(await run(rec)).toEqual({ outcome: 'pending', code: 'REPLY_UNREADABLE' });
      w.transcript = { status: 200, body: transcript() };
      expect(await run(rec)).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    });
  });

  describe('the stream only wakes the next read', () => {
    it('a frame makes the receipt be read at once, long before the next poll', async () => {
      timing.everyMs = 5000;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }, { turn_id: 't1', state: 'completed' }];
      w.stream = { status: 200, headers: { 'content-type': 'text/event-stream' }, text: 'event: tool_call\ndata: {"seq":1}\n\n' };
      const t0 = Date.now();
      expect((await run(begin())).outcome).toBe('done');
      expect(Date.now() - t0).toBeLessThan(2000);
    });

    it('a stream the agent refuses changes nothing: the receipts are still read', async () => {
      w.stream = { status: 403, body: { code: 'forbidden' } };
      expect((await run(begin())).outcome).toBe('done');
    });

    it('the stream is read with GET only, never decides, and is closed when the ask ends', async () => {
      await run(begin());
      expect(calls.filter((c) => route(c) === '/sessions/s1/stream').every((c) => c.method === 'GET')).toBe(true);
    });
  });

  it('Stop asks the agent to cancel only the turn of this ask, with its own Idempotency-Key', async () => {
    const rec = begin({ sid: 's1', turnId: 't1', phase: 'wait' });
    expect(await cancelRun(rec)).toBe(true);
    const c = sent('POST', '/sessions/s1/cancel')[0]!;
    expect(c.body).toEqual({ turn_id: 't1' });
    expect(c.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('Stop before there is a turn sends nothing', async () => {
    expect(await cancelRun(begin())).toBe(false);
    expect(sent('POST', '/sessions/s1/cancel')).toHaveLength(0);
  });

  it('an account change before the ask is sent sends nothing', async () => {
    const rec = begin();
    bump('account');
    expect((await run(rec)).outcome).toBe('stale');
    expect(calls.filter((c) => c.url.startsWith(AGENT))).toHaveLength(0);
  });

  it('a settled ask is forgotten, a pending one is kept for its Check again', async () => {
    const a = begin();
    await run(a);
    expect(runOf(place())).toBeUndefined();
    w.transcript = { status: 503, body: {} };
    const b = begin();
    await run(b);
    expect(runOf(place())).toBe(b);
    expect(runOf(place('default/1/a.ts'))).toBeUndefined();
  });
  describe('the list of receipts that proves a lost turn must be whole and this session\'s', () => {
    const lost = async (turns: unknown): Promise<{ r: AiAnswer; rec: WriterRun }> => {
      w.turn = { status: 502, body: {} };
      w.turns = { status: 200, body: turns };
      const rec = begin();
      return { r: await run(rec), rec };
    };

    it('a list with an element that is not a receipt proves nothing, even next to a receipt: pending, never read as admitted', async () => {
      for (const turns of [
        { session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }, 7] },
        { session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }, { nope: true }] },
        { session_id: 's1', turns: [{ nope: true }] },
        { session_id: 's1', turns: [null] },
        { session_id: 's1', turns: [{ turn_id: 't1' }] },
      ]) {
        await wipe();
        calls.length = 0;
        const { r, rec } = await lost(turns);
        expect(r, JSON.stringify(turns)).toEqual({ outcome: 'pending', code: 'TURN_UNKNOWN' });
        expect(rec.turnId).toBeNull();
        expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(0);
        expect(turnPosts()).toBe(1);
      }
    });

    it('another session\'s list, or one that names no session, proves nothing', async () => {
      for (const turns of [
        { session_id: 's2', turns: [{ turn_id: 't1', state: 'completed' }] },
        { turns: [{ turn_id: 't1', state: 'completed' }] },
        { session_id: 1, turns: [{ turn_id: 't1', state: 'completed' }] },
        { session_id: 's1', turns: 'x' },
        { session_id: 's1' },
      ]) {
        await wipe();
        calls.length = 0;
        const { r } = await lost(turns);
        expect(r, JSON.stringify(turns)).toEqual({ outcome: 'pending', code: 'TURN_UNKNOWN' });
        expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(0);
      }
    });

    it('exactly one receipt of this session is taken, and the ask goes on with it', async () => {
      const { r, rec } = await lost({ session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }] });
      expect(r.outcome).toBe('done');
      expect(rec.turnId).toBe('t1');
      expect(turnPosts()).toBe(1);
    });
  });

  describe('an ask that is not settled belongs to its place, not to the view that made it', () => {
    it('a pending ask is found again by its computer, script, realm and owner, and by nothing else', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = begin();
      await run(rec);
      expect(runOf(place())).toBe(rec);
      expect(runOf(place(null, { realm: 'bbbbbbbbbbbbbbbbbbbbbbb2' }))).toBeUndefined();
      expect(runOf(place(null, { owner: 'fp2' }))).toBeUndefined();
      expect(runOf(place(null, { compId: 'c2' }))).toBeUndefined();
      expect(runOf(place('default/1/a.ts'))).toBeUndefined();
    });

    it('an ask cut off by a change of account after its turn was sent stays, and continues with the same turn when it is read again', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = begin();
      expect((await run(rec)).code).toBe('TURN_RUNNING');
      bump('account');
      expect((await run(rec)).outcome).toBe('stale');
      expect(runOf(place())).toBe(rec);
      timing.maxMs = 3000;
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      expect(await run(resume(rec, TARGET))).toEqual({ outcome: 'done', data: { reply: ANSWER } });
      expect(turnPosts()).toBe(1);
      expect(sent('POST', '/sessions')).toHaveLength(1);
      expect(runOf(place())).toBeUndefined();
    });

    it('an ask cut off while its turn was being sent stays "lost": it reads the session\'s receipts, and never sends the turn again', async () => {
      onFetch((c): Reply => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') return { status: 201, body: created };
        if (c.method === 'POST' && p === '/sessions/s1/turns') { bump('account'); return { status: 202, body: { turn_id: 't1', state: 'accepted' } }; }
        if (c.method === 'GET' && p === '/sessions/s1/turns') return { status: 200, body: { session_id: 's1', turns: [{ turn_id: 't1', state: 'completed' }] } };
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: 'completed' } };
        if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: transcript() };
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
      const rec = begin();
      expect((await run(rec)).outcome).toBe('stale');
      expect(rec.phase).toBe('lost');
      expect(rec.text).toBeNull();
      expect(runOf(place())).toBe(rec);
      expect((await run(resume(rec, TARGET))).outcome).toBe('done');
      expect(turnPosts()).toBe(1);
    });

    it('an ask cut off before its turn is sent leaves nothing behind', async () => {
      const rec = begin();
      bump('account');
      expect((await run(rec)).outcome).toBe('stale');
      expect(runOf(place())).toBeUndefined();
      // nothing was sent, so there is no ask to keep and the place is free
      expect(storedAsk(place())).toBeNull();
      expect(openRun(place())).toBe(false);
    });

    it('pressing again while the ask is being driven joins it: one session, one turn', async () => {
      const rec = begin();
      const a = advance(rec);
      const b = advance(rec);
      expect(b).toBe(a);
      expect((await a).outcome).toBe('done');
      expect(sent('POST', '/sessions')).toHaveLength(1);
      expect(turnPosts()).toBe(1);
    });

    it('a view opened again takes the wait over: the old view\'s stop does not end it', async () => {
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }, { turn_id: 't1', state: 'dispatched' }, { turn_id: 't1', state: 'completed' }];
      const rec = begin();
      const oldView = { stop: false };
      const first = advance(rec, oldView);
      const newView = { stop: false };
      const second = advance(rec, newView);
      oldView.stop = true;
      expect(second).toBe(first);
      expect((await second).outcome).toBe('done');
      expect(turnPosts()).toBe(1);
    });

    it('the view going away ends the wait but keeps the ask, to be read again', async () => {
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const view = { stop: false };
      const rec = begin();
      const p = advance(rec, view);
      view.stop = true;
      expect((await p).outcome).toBe('stale');
      expect(runOf(place())).toBe(rec);
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      expect((await advance(rec)).outcome).toBe('done');
      expect(turnPosts()).toBe(1);
    });

    it('the warned close ends the ask: its turn is not read again, the place is free, and a second close finds nothing', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = begin();
      await run(rec);
      expect(openRun(place())).toBe(true);
      await closeAsk(place());
      expect(runOf(place())).toBeUndefined();
      expect(rec.text).toBeNull();
      expect(rec.dead).toBe(true);
      expect(openRun(place())).toBe(false);
      const reads = sent('GET', '/sessions/s1/turns/t1').length;
      expect((await advance(rec)).code).toBe('SUPERSEDED');
      expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(reads);
      await closeAsk(place());
      expect(openRun(place())).toBe(false);
    });

    it('an ask that ended with a refusal or a failed turn is stored until its answer is taken once', async () => {
      w.receipts = [{ turn_id: 't1', state: 'failed', error_code: 'provider_error' }];
      const a = await runKeep(begin());
      expect(a.outcome).toBe('failed');
      expect(runOf(place())).toBeUndefined();
      expect(openRun(place())).toBe(true);
      expect(await claimAnswer(a)).toBe(true);
      expect(openRun(place())).toBe(false);
    });
  });

  describe('an answer that comes in while no view is waiting stays with the store, and is read again for the view that comes back', () => {
    /** The fake agent holds one read (`receipt` or `transcript`) until the test lets it go. */
    const hold = (which: 'receipt' | 'transcript'): { release: () => void } => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') return { status: 201, body: created };
        if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') { if (which === 'receipt') await gate; return { status: 200, body: { turn_id: 't1', state: 'completed' } }; }
        if (c.method === 'GET' && p === '/sessions/s1/transcript') { if (which === 'transcript') await gate; return { status: 200, body: transcript() }; }
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
      return { release: () => release() };
    };
    for (const which of ['receipt', 'transcript'] as const) {
      it(`the view goes away while the ${which} is being read: the ask stays stored, is read again without a send, and its answer is taken once`, async () => {
        const h = hold(which);
        const view = { stop: false };
        const rec = begin();
        const p = advance(rec, view);
        await vi.waitFor(() => expect(sent('GET', which === 'receipt' ? '/sessions/s1/turns/t1' : '/sessions/s1/transcript').length).toBeGreaterThan(0));
        view.stop = true;
        h.release();
        const first = await p;
        expect(first).toEqual({ outcome: 'done', data: { reply: ANSWER } });
        expect(runOf(place())).toBeUndefined();
        expect(openRun(place())).toBe(true);
        expect(openRun(place('default/1/a.ts'))).toBe(false);
        // the answer is kept nowhere but where it is read from: a view that comes back restores the ask and reads it again
        const stored = storedAsk(place()) as ScriptAsk;
        expect(stored.sessionId).toBe('s1');
        expect(stored.turnId).toBe('t1');
        const back = restoreRun(stored, env)!;
        const again = await advance(back);
        expect(again).toEqual({ outcome: 'done', data: { reply: ANSWER } });
        expect(openRun(place())).toBe(true);
        // one claim wins; the other answer, and any later one, is refused
        expect(await claimAnswer(again)).toBe(true);
        expect(openRun(place())).toBe(false);
        expect(await claimAnswer(again)).toBe(false);
        expect(await claimAnswer(first)).toBe(false);
        expect(sent('POST', '/sessions')).toHaveLength(1);
        expect(turnPosts()).toBe(1);
      });
    }

    it('a view that took the wait over before it ended gets the very answer of the departing one, and only one of them takes it', async () => {
      const h = hold('receipt');
      const oldView = { stop: false };
      const rec = begin();
      const p = advance(rec, oldView);
      await vi.waitFor(() => expect(sent('GET', '/sessions/s1/turns/t1').length).toBeGreaterThan(0));
      oldView.stop = true;
      const mine = advance(rec, { stop: false });
      h.release();
      expect((await mine).outcome).toBe('done');
      expect(await p).toBe(await mine);
      expect(openRun(place())).toBe(true);
      expect(await claimAnswer(await mine)).toBe(true);
      expect(await claimAnswer(await p)).toBe(false);
      expect(openRun(place())).toBe(false);
    });

    it('a failure no view was waiting for stays stored the same way, and the warned close ends it', async () => {
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') return { status: 201, body: created };
        if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') { await new Promise((r) => setTimeout(r, 200)); return { status: 200, body: { turn_id: 't1', state: 'failed', error_code: 'provider_error' } }; }
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
      const view = { stop: false };
      const p = advance(begin(), view);
      await vi.waitFor(() => expect(sent('GET', '/sessions/s1/turns/t1').length).toBeGreaterThan(0));
      view.stop = true;
      const a = await p;
      expect(a).toEqual({ outcome: 'failed', code: 'provider_error' });
      expect(openRun(place())).toBe(true);
      await closeAsk(place());
      expect(openRun(place())).toBe(false);
      // the close took the ask first: a late view's claim of the answer loses and shows nothing
      expect(await claimAnswer(a)).toBe(false);
    });

    it('an answer is delivered once: the first claim wins, the second is refused, and the place is free after the first', async () => {
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const a = await runKeep(begin());
      expect(await claimAnswer(a)).toBe(true);
      expect(await claimAnswer(a)).toBe(false);
      expect(openRun(place())).toBe(false);
      // an answer of an ask that never reached the turn has no record: it is its caller's
      const none: AiAnswer = { outcome: 'not_sent', code: 'NOT_WIRED' };
      expect(await claimAnswer(none)).toBe(true);
    });

    it('a claim does not take an ask that was replaced by a newer one at the place', async () => {
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const a = await runKeep(begin());
      await closeAsk(place());
      const second = begin();
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      timing.maxMs = 30;
      expect((await runKeep(second)).outcome).toBe('pending');
      expect(openRun(place())).toBe(true);
      // the old answer came from a record that is gone: it takes nothing of the newer ask
      expect(await claimAnswer(a)).toBe(false);
      expect(openRun(place())).toBe(true);
    });

    it('closing one place leaves the asks of other places alone', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      await runKeep(begin());
      await runKeep({ ...startRun({ compId: 'c1', path: 'default/1/a.ts', text: 'write it', realm: R1, owner: 'fp1' }, env, mint) });
      expect(openRun(place())).toBe(true);
      expect(openRun(place('default/1/a.ts'))).toBe(true);
      await closeAsk(place());
      expect(openRun(place())).toBe(false);
      expect(openRun(place('default/1/a.ts'))).toBe(true);
    });

    it('a finished ask is stored at its own place only (not for another script, realm or owner)', async () => {
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const a = await runKeep(begin());
      expect(a.outcome).toBe('done');
      expect(storedAsk(place())).not.toBeNull();
      expect(storedAsk(place('default/1/a.ts'))).toBeNull();
      expect(storedAsk(place(null, { realm: 'bbbbbbbbbbbbbbbbbbbbbbb2' }))).toBeNull();
      expect(storedAsk(place(null, { owner: 'fp2' }))).toBeNull();
      expect(await claimAnswer(a)).toBe(true);
      expect(storedAsk(place())).toBeNull();
    });
  });

  describe('the ask is stored before anything is sent, and a run that no longer owns it sends nothing more', () => {
    const rec11 = (i: number): ScriptAsk => ({ askId: `fill-${i}`, compId: 'c9', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: Date.now(), createKey: `ck${i}`, turnKey: `tk${i}` });

    it('the record is in the store, at the "lost" phase with its session, when the turn is sent, and never holds the prompt', async () => {
      let atTurn: ScriptAsk | null | 'unreadable' = null;
      const base = w.turn;
      onFetch((c): Reply => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') return { status: 201, body: created };
        if (c.method === 'POST' && p === '/sessions/s1/turns') { atTurn = storedAsk(place()); return base; }
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: 'completed' } };
        if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: transcript() };
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
      expect((await runKeep(begin())).outcome).toBe('done');
      expect(atTurn).not.toBeNull();
      expect(atTurn).not.toBe('unreadable');
      const r = atTurn as unknown as ScriptAsk;
      expect(r.phase).toBe('lost');
      expect(r.sessionId).toBe('s1');
      expect(JSON.stringify(r)).not.toContain('write it');
      expect(JSON.stringify(readScriptAsks())).not.toContain('write it');
    });

    it('an ask that another view or tab closes while its session is being made sends no turn, and shows nothing', async () => {
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') { await closeAsk(place()); return { status: 201, body: created }; }
        return { status: 404, body: { code: 'not_found' } };
      });
      const rec = begin();
      const a = await runKeep(rec);
      expect(a).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(turnPosts()).toBe(0);
      expect(rec.dead).toBe(true);
      expect(runOf(place())).toBeUndefined();
      expect(openRun(place())).toBe(false);
      // it gives nothing to claim and nothing is left to unlock
      expect(await claimAnswer(a)).toBe(false);
    });

    it('a place that already holds an ask stores no second one and sends nothing: the new ask is left unsent', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const first = begin();
      await runKeep(first);
      const posts = sent('POST', '/sessions').length;
      const second = begin();
      const a = await runKeep(second);
      expect(a).toEqual({ outcome: 'pending', code: 'ASK_OPEN' });
      expect(second.dead).toBe(true);
      // the first run is still the place's run: the second never replaced it
      expect(runOf(place())).toBe(first);
      expect(sent('POST', '/sessions')).toHaveLength(posts);
      expect(turnPosts()).toBe(1);
    });

    it('a store that cannot keep the ask sends nothing: not sent, with its own code', async () => {
      for (let i = 0; i < SCRIPT_ASKS_MAX; i++) expect(await putScriptAsk(rec11(i), null)).toBe('ok');
      const a = await runKeep(begin());
      expect(a).toEqual({ outcome: 'not_sent', code: 'NO_RECORD' });
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(turnPosts()).toBe(0);
      expect(openRun(place())).toBe(false);
    });

    /** The fake agent with a hook at each step a test needs to act at: another tab's claim, a browser that stops writing. */
    const agent = (on: { create?: () => unknown; turnPost?: () => unknown; list?: () => unknown; receipt?: () => unknown }): void => {
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') { await on.create?.(); return { status: 201, body: created }; }
        if (c.method === 'POST' && p === '/sessions/s1/turns') { await on.turnPost?.(); return on.list ? { status: 502, body: {} } : { status: 202, body: { turn_id: 't1', state: 'accepted' } }; }
        if (c.method === 'GET' && p === '/sessions/s1/turns') { await on.list?.(); return { status: 200, body: { session_id: 's1', turns: [{ turn_id: 't1', state: 'dispatched' }] } }; }
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') { await on.receipt?.(); return { status: 200, body: { turn_id: 't1', state: 'completed' } }; }
        if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: transcript() };
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
    };
    /** Another tab ends the ask stored at the place (the warned close, or a delivery): the claim of the stored record, not this tab's own close. */
    const otherTabClaims = async (): Promise<void> => {
      const s = storedAsk(place());
      if (s && s !== 'unreadable') await claimScriptAsk(s);
    };

    it('an ask another tab ended while its session was being made sends no turn: the store says so, whatever this run thinks', async () => {
      agent({ create: otherTabClaims });
      const rec = begin();
      expect(await runKeep(rec)).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(turnPosts()).toBe(0);
      expect(rec.dead).toBe(true);
      expect(openRun(place())).toBe(false);
    });

    it('a browser that stops accepting writes after the session was made: the turn is not sent, and it is said not sent', async () => {
      let refusing: { mockRestore: () => void } | null = null;
      agent({ create: () => { refusing = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); }); } });
      let a: AiAnswer;
      try { a = await runKeep(begin()); } finally { (refusing as { mockRestore: () => void } | null)?.mockRestore(); }
      expect(a).toEqual({ outcome: 'not_sent', code: 'NO_RECORD' });
      expect(turnPosts()).toBe(0);
    });

    it('an ask another tab ended while its turn was being sent stops there: nothing is read, the turn went out once', async () => {
      agent({ turnPost: otherTabClaims });
      expect(await runKeep(begin())).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(turnPosts()).toBe(1);
      expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(0);
      expect(openRun(place())).toBe(false);
    });

    it('an ask another tab ended while the session\'s receipts were read for a lost turn stops there', async () => {
      agent({ list: otherTabClaims });
      expect(await runKeep(begin())).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(turnPosts()).toBe(1);
      expect(sent('GET', '/sessions/s1/turns/t1')).toHaveLength(0);
    });

    it('an ask another tab ended while its receipt was read stops before the transcript is read', async () => {
      agent({ receipt: otherTabClaims });
      expect(await runKeep(begin())).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(sent('GET', '/sessions/s1/transcript')).toHaveLength(0);
      expect(openRun(place())).toBe(false);
    });

    it('the warned close of this tab ends a run that is waiting for its turn at once, not when the wait runs out', async () => {
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = begin();
      const p = runKeep(rec);
      await vi.waitFor(() => expect(sent('GET', '/sessions/s1/turns/t1').length).toBeGreaterThan(0));
      const t0 = Date.now();
      await closeAsk(place());
      expect(await p).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(Date.now() - t0).toBeLessThan(1500);
    });

    it('an ask closed while its transcript is being read hands nothing over: SUPERSEDED, and a claim of it never wins, however often it is tried', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') return { status: 201, body: created };
        if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
        if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: 'completed' } };
        if (c.method === 'GET' && p === '/sessions/s1/transcript') { await gate; return { status: 200, body: transcript() }; }
        return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
      });
      const rec = begin();
      const p = runKeep(rec);
      await vi.waitFor(() => expect(sent('GET', '/sessions/s1/transcript').length).toBeGreaterThan(0));
      await closeAsk(place());
      // a newer ask at the same place is stored meanwhile
      const newer: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: Date.now(), createKey: 'newer', turnKey: 'newer-t' };
      expect(await putScriptAsk(newer, null)).toBe('ok');
      release();
      const a = await p;
      expect(a).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(await claimAnswer(a)).toBe(false);
      expect(await claimAnswer(a)).toBe(false);
      expect(storedAsk(place())).toEqual(newer);
    });

    it('a claim whose view left is never taken: the record stays as it was for the next view there, and the claim wins nothing', async () => {
      const a = await runKeep(begin());
      expect(a.outcome).toBe('done');
      const before = storedAsk(place());
      expect(before).not.toBeNull();
      expect(await claimAnswer(a, () => false)).toBe(false);
      // the record was never out of the store (same phase, same keys), and the answer is claimed by the view that is there
      expect(storedAsk(place())).toEqual(before);
      expect(await claimAnswer(a, () => true)).toBe(true);
      expect(storedAsk(place())).toBeNull();
    });

    it('the view is asked while the store is held: a view that left while the claim waited behind another write leaves the ask in the store, a full store included', async () => {
      const a = await runKeep(begin());
      const mine = storedAsk(place()) as ScriptAsk;
      for (let i = 0; i < SCRIPT_ASKS_MAX - 1; i++) expect(await putScriptAsk(rec11(i), null)).toBe('ok');
      expect(readScriptAsks()).toHaveLength(SCRIPT_ASKS_MAX);
      let release: () => void = () => undefined;
      const lock = new Promise<void>((r) => { release = r; });
      void navigator.locks.request('hub_changes', () => lock); // the store's own lock (underChangeStore refuses an async callback and lets go at once)
      let here = true;
      const claim = claimAnswer(a, () => here);
      // another place's ask is queued behind the claim; the view leaves while both wait
      const extra = putScriptAsk(rec11(99), null);
      here = false;
      release();
      expect(await claim).toBe(false);
      // the claim took nothing out, so nothing could take its place and nothing had to be put back
      expect(await extra).toBe('full');
      expect(storedAsk(place())).toEqual(mine);
      expect(await claimAnswer(a, () => true)).toBe(true);
    });

    it('a warned close that runs behind a claim whose view left is not undone: the ask stays closed', async () => {
      const a = await runKeep(begin());
      expect(storedAsk(place())).not.toBeNull();
      let release: () => void = () => undefined;
      const lock = new Promise<void>((r) => { release = r; });
      void navigator.locks.request('hub_changes', () => lock); // the store's own lock (underChangeStore refuses an async callback and lets go at once)
      const claim = claimAnswer(a, () => false);
      const close = closeAsk(place());
      release();
      expect(await claim).toBe(false);
      await close;
      expect(storedAsk(place())).toBeNull();
    });

    it('an unreadable store is not the absence of an ask: open says so', async () => {
      expect(openRun(place())).toBe(false);
      const real = localStorage.getItem.bind(localStorage);
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      vi.stubGlobal('localStorage', { getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
      try { expect(openRun(place())).toBe('unreadable'); } finally { vi.unstubAllGlobals(); spy.mockRestore(); void real; }
    });

    it('every answer of a run names the ask it came from, and two asks at one place never share a name', async () => {
      const first = await runKeep(begin());
      const inc1 = incarnationOf(first);
      expect(inc1).toBe('key-1');
      await closeAsk(place());
      forgetRuns();
      const second = await runKeep(begin());
      expect(incarnationOf(second)).toBe('key-3');
      expect(incarnationOf({ outcome: 'pending' })).toBeNull();
    });

    it('a run that was closed before its first step sends nothing at all: not a session, not a turn', async () => {
      const rec = begin();
      rec.dead = true;
      expect(await runKeep(rec)).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(turnPosts()).toBe(0);
      expect(openRun(place())).toBe(false);
    });

    it('a record in the turn phase (one that never got a session id) is restored as not yet created', () => {
      const r: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'turn', sentAt: Date.now(), createKey: 'ck', turnKey: 'tk' };
      expect(restoreRun(r, env)!.phase).toBe('create');
    });

    it('an ask restored from the store continues from its phase: it reads, and sends neither a session nor a turn', async () => {
      const r: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'wait', sentAt: Date.now(), createKey: 'ck', turnKey: 'tk' };
      expect(await putScriptAsk(r, null)).toBe('ok');
      const back = restoreRun(r, env)!;
      expect(back.text).toBeNull();
      expect(back.phase).toBe('wait');
      const first = await advance(back);
      expect(first).toEqual({ outcome: 'done', data: { reply: ANSWER } });
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(turnPosts()).toBe(0);
      expect(await claimAnswer(first)).toBe(true);
      expect(await claimAnswer(first)).toBe(false);
    });

    it('a record with no realm or owner cannot be restored', () => {
      const r: ScriptAsk = { askId: 'x', compId: 'c1', path: null, realm: null, owner: null, sessionId: 's1', turnId: 't1', phase: 'wait', sentAt: Date.now(), createKey: 'ck', turnKey: 'tk' };
      expect(restoreRun(r, env)).toBeNull();
    });

    it('an earlier ask that never got a session is pending while it is young, and is ended as not sent when it is old', async () => {
      const young: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: Date.now() - 60_000, createKey: 'ck', turnKey: 'tk' };
      expect(await putScriptAsk(young, null)).toBe('ok');
      expect(await advance(restoreRun(young, env)!)).toEqual({ outcome: 'pending', code: 'EARLIER_ASK' });
      expect(openRun(place())).toBe(true);
      const old: ScriptAsk = { ...young, sentAt: Date.now() - 11 * 60_000 };
      expect(await putScriptAsk(old, young)).toBe('ok');
      expect(await advance(restoreRun(old, env)!)).toEqual({ outcome: 'not_sent', code: 'EARLIER_UNSENT' });
      expect(openRun(place())).toBe(false);
      expect(sent('POST', '/sessions')).toHaveLength(0);
    });

    it('a record stored with a path of over 128 characters is cut to what the store holds, and the ask still runs', async () => {
      const long = `default/1/${'a'.repeat(200)}.ts`;
      const rec = { ...startRun({ compId: 'c1', path: long, text: 'write it', realm: R1, owner: 'fp1' }, env, mint) };
      expect((await runKeep(rec)).outcome).toBe('done');
      expect(openRun(place(long))).toBe(true);
      expect((storedAsk(place(long)) as ScriptAsk).path).toHaveLength(128);
    });
  });

  describe('Stop only asks: the ask stays what it is until a read says otherwise', () => {
    it('a cancel the agent refuses leaves the ask pending and its turn running', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      w.cancel = { status: 409, body: { code: 'busy' } };
      const rec = begin();
      expect((await run(rec)).code).toBe('TURN_RUNNING');
      expect(await cancelRun(rec)).toBe(false);
      expect(runOf(place())).toBe(rec);
      w.cancel = { network: true, status: 0 };
      expect(await cancelRun(rec)).toBe(false);
      expect(runOf(place())).toBe(rec);
    });

    it('the ask ends as cancelled only when the turn\'s receipt says so', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = begin();
      await run(rec);
      expect(await cancelRun(rec)).toBe(true);
      timing.maxMs = 3000;
      w.receipts = [{ turn_id: 't1', state: 'cancelled' }];
      expect(await run(rec)).toEqual({ outcome: 'failed', code: 'cancelled' });
      expect(runOf(place())).toBeUndefined();
    });
  });
  describe('the hidden values of an ask are held in memory under its create key, and go with the ask', () => {
    const HIDDEN = { map: [{ ph: '__HOODY_SECRET_0__', value: 'plain-hidden-value-4711' }] };
    const beginV = (values: unknown = HIDDEN, path: string | null = null): WriterRun => ({ ...startRun({ compId: 'c1', path, text: 'write it', realm: R1, owner: 'fp1', values }, env, mint) });
    /** Another tab's change reaches this tab as a storage event: the writer re-reads the store then. */
    const otherTabEvent = (): void => { window.dispatchEvent(new StorageEvent('storage', { key: SCRIPT_ASKS_KEY })); };
    /** The browser refuses every read of its storage until the returned function is called. */
    const unreadable = (): (() => void) => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      vi.stubGlobal('localStorage', { getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
      return () => { vi.unstubAllGlobals(); spy.mockRestore(); };
    };
    /** Only the ask store cannot be read: authentication and everything else keep working. */
    const unreadableAsks = (): (() => void) => {
      const real = localStorage;
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => { if (k === SCRIPT_ASKS_KEY) throw new DOMException('denied', 'SecurityError'); return real.getItem(k); },
        setItem: (k: string, v: string) => real.setItem(k, v), removeItem: (k: string) => real.removeItem(k),
        key: (i: number) => real.key(i), get length() { return real.length; }, clear: () => real.clear(),
      });
      return () => { vi.unstubAllGlobals(); };
    };
    let unsub: () => void = () => undefined;
    beforeEach(() => { unsub = subscribeAsks(() => undefined); });
    afterEach(() => unsub());

    it('an answer reads what its ask hid, and the claim that ends the ask deletes it', async () => {
      const a = await runKeep(beginV());
      expect(a.outcome).toBe('done');
      expect(valuesOf(a)).toBe(HIDDEN);
      expect(heldCount()).toBe(1);
      expect(await claimAnswer(a)).toBe(true);
      expect(valuesOf(a)).toBeUndefined();
      expect(heldCount()).toBe(0);
    });

    it('a claim that loses (the view left, or another view won) deletes nothing: the ask is still stored', async () => {
      const a = await runKeep(beginV());
      expect(await claimAnswer(a, () => false)).toBe(false);
      expect(valuesOf(a)).toBe(HIDDEN);
      expect(heldCount()).toBe(1);
      expect(storedAsk(place())).not.toBeNull();
    });

    it('nothing hidden is ever written to the store, in any phase', async () => {
      const seen: string[] = [];
      const base = onFetchBase();
      onFetch((c): Reply => { seen.push(JSON.stringify(readScriptAsks()) + (localStorage.getItem(SCRIPT_ASKS_KEY) ?? '')); return base(c); });
      await runKeep(beginV());
      expect(seen.length).toBeGreaterThan(2);
      expect(seen.join('')).not.toContain('plain-hidden-value-4711');
      expect(JSON.stringify(Object.entries(localStorage))).not.toContain('plain-hidden-value-4711');
    });

    it('an ask without values holds nothing, and a run restored from the store never holds any', async () => {
      await runKeep(begin());
      expect(heldCount()).toBe(0);
      const rec = beginV();
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      timing.maxMs = 30;
      expect((await runKeep(rec)).outcome).toBe('pending');
      forgetRuns();
      expect(heldCount()).toBe(0);
      const back = restoreRun(storedAsk(place()) as ScriptAsk, { target: TARGET })!;
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const a = await runKeep(back);
      expect(a.outcome).toBe('done');
      expect(valuesOf(a)).toBeUndefined();
    });

    it('a claim made in this tab ends the values at once, with no view of the page mounted', async () => {
      unsub();
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      expect(heldCount()).toBe(1);
      expect(await claimScriptAsk(storedAsk(place()) as ScriptAsk)).toBe('ok');
      expect(heldCount()).toBe(0);
    });

    it('another tab\'s removal reaches the values by its storage event, with no view of the page mounted', async () => {
      unsub();
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      expect(heldCount()).toBe(1);
      // the other tab's write reaches this tab as a changed store and a storage event
      localStorage.removeItem(SCRIPT_ASKS_KEY);
      expect(heldCount()).toBe(1);
      otherTabEvent();
      expect(heldCount()).toBe(0);
    });

    it('a view that reads the place after a missed change finds the values gone with the ask', async () => {
      unsub();
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      localStorage.removeItem(SCRIPT_ASKS_KEY);
      expect(heldCount()).toBe(1);
      expect(storedAsk(place())).toBeNull();
      expect(heldCount()).toBe(0);
    });

    it('a drop of the shown asks by this tab (the sign-out\'s drop) ends their values, though the account stays open', async () => {
      unsub();
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      const mine = readScriptAsks();
      expect(await dropScriptAsks(mine as ScriptAsk[])).toBe('ok');
      expect(heldCount()).toBe(0);
    });

    it('an auth purge (sign-out, expiry, any end of the account) clears every value, whatever the store still holds', async () => {
      unsub();
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      expect(heldCount()).toBe(1);
      clearAuthTokens();
      expect(heldCount()).toBe(0);
      expect(storedAsk(place())).not.toBeNull();
    });

    it('another tab that replaces the ask with a new one at the place takes the old values too, with no gap in the store', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      const mine = storedAsk(place()) as ScriptAsk;
      expect(await putScriptAsk({ ...mine, createKey: 'ck-theirs', turnKey: 'tk-theirs', sessionId: 's9' }, mine)).toBe('ok');
      otherTabEvent();
      expect(heldCount()).toBe(0);
    });

    it('the warned close deletes them, for the run in memory and for the stored ask', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const rec = beginV();
      expect((await runKeep(rec)).outcome).toBe('pending');
      await closeAsk(place());
      expect(heldCount()).toBe(0);
      // an ask whose run is gone (a reload of the page keeps the stored ask only) is closed the same way
      const x = beginV(HIDDEN, 'b.ts');
      await runKeep(x);
      forgetRuns();
      expect(heldCount()).toBe(0);
    });

    it('the warned close deletes the run\'s values even when the store cannot be read to end the stored ask', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      const back = unreadable();
      try { await closeAsk(place()); } finally { back(); }
      expect(heldCount()).toBe(0);
    });

    it('a store that refused the first write holds nothing for the ask it never kept', async () => {
      for (let i = 0; i < SCRIPT_ASKS_MAX; i++) expect(await putScriptAsk({ askId: `fill-${i}`, compId: 'c9', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: Date.now(), createKey: `ck${i}`, turnKey: `tk${i}` }, null)).toBe('ok');
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'not_sent', code: 'NO_RECORD' });
      expect(heldCount()).toBe(0);
    });

    it('an answer that names no ask reads nothing, whatever else is held', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      await runKeep(beginV());
      expect(heldCount()).toBe(1);
      expect(valuesOf({ outcome: 'done', data: { reply: 'x' } })).toBeUndefined();
    });

    it('a close while the session is being made deletes them, and the run sends nothing more', async () => {
      onFetch(async (c): Promise<Reply> => {
        const p = route(c);
        if (c.method === 'POST' && p === '/sessions') { await closeAsk(place()); return { status: 201, body: created }; }
        return { status: 404, body: { code: 'not_found' } };
      });
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(heldCount()).toBe(0);
      expect(turnPosts()).toBe(0);
    });

    it('a close while the turn is being sent deletes them, and no answer is handed over', async () => {
      const base = onFetchBase();
      onFetch(async (c): Promise<Reply> => {
        if (c.method === 'POST' && route(c) === '/sessions/s1/turns') await closeAsk(place());
        return base(c);
      });
      const a = await runKeep(beginV());
      expect(a.outcome).toBe('stale');
      expect(valuesOf(a)).toBeUndefined();
      expect(heldCount()).toBe(0);
    });

    it('an ask that another tab stored first is not this press\'s: its values are deleted at once', async () => {
      const theirs: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'wait', sentAt: Date.now(), createKey: 'ck-theirs', turnKey: 'tk-theirs' };
      expect(await putScriptAsk(theirs, null)).toBe('ok');
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'pending', code: 'ASK_OPEN' });
      expect(heldCount()).toBe(0);
      expect(turnPosts()).toBe(0);
    });

    it('an ask that ends before anything was sent leaves nothing held: refused, not sent, or failed at its create', async () => {
      w.create = [{ status: 201, body: { ...created, started: { ...STARTED, tool_ceiling: undefined } } }];
      expect((await runKeep(beginV())).code).toBe('NO_CEILING');
      expect(heldCount()).toBe(0);
      w.create = [{ status: 422, body: { code: 'unknown_chat_agent', message: 'x' } }];
      await wipe();
      expect((await runKeep(beginV())).outcome).toBe('failed');
      expect(heldCount()).toBe(0);
    });

    it('an ask cut off after its turn may be out keeps them: it is still stored, and a later read puts the answer back together', async () => {
      const rec = beginV();
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const cut = await advance(rec, { stop: true });
      expect(cut.outcome).toBe('stale');
      expect(storedAsk(place())).not.toBeNull();
      expect(heldCount()).toBe(1);
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const a = await advance(rec);
      expect(a.outcome).toBe('done');
      expect(valuesOf(a)).toBe(HIDDEN);
    });

    it('a store that cannot be read proves nothing: the values stay until a read says the ask is gone', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      const back = unreadable();
      let heard = 0;
      const off = subscribeAsks(() => { heard++; });
      try { otherTabEvent(); expect(heldCount()).toBe(1); } finally { back(); }
      // the views are still told, and the values are still held
      expect(heard).toBe(1);
      off();
      otherTabEvent();
      expect(heldCount()).toBe(1);
    });

    it('an account end that comes while the store is admitting the ask drops the values at the handoff: nothing is held after it', async () => {
      let first = true;
      const off = subscribeScriptAsksVersion(() => { if (first) { first = false; bump('logout'); } });
      try {
        const rec = beginV();
        const a = await runKeep(rec);
        // the run is cut off (never shown as failed), and nothing is held for it
        expect(['stale', 'not_sent']).toContain(a.outcome);
        expect(heldCount()).toBe(0);
        expect(rec.values).toBeUndefined();
      } finally { off(); }
    });

    it('an ask removed from the store between its first write and the handoff ends before anything is sent: not_sent, nothing held', async () => {
      let first = true;
      const off = subscribeScriptAsksVersion(() => { if (first) { first = false; localStorage.removeItem(SCRIPT_ASKS_KEY); } });
      try {
        const rec = beginV();
        const a = await runKeep(rec);
        expect(a).toEqual({ outcome: 'not_sent', code: 'NOT_KEPT' });
        expect(sent('POST', '/sessions')).toHaveLength(0);
        expect(turnPosts()).toBe(0);
        expect(heldCount()).toBe(0);
        expect(rec.text).toBeNull();
      } finally { off(); }
    });

    it('another ask stored at the place between the first write and the handoff is not this run\'s: it ends unsent and leaves the other ask alone', async () => {
      let first = true;
      const off = subscribeScriptAsksVersion(() => {
        if (!first) return;
        first = false;
        const raw = JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? '{}') as { accounts: Record<string, Array<Record<string, unknown>>> };
        for (const list of Object.values(raw.accounts)) for (const r of list) r.createKey = 'ck-theirs';
        localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify(raw));
      });
      try {
        expect(await runKeep(beginV())).toEqual({ outcome: 'not_sent', code: 'NOT_KEPT' });
      } finally { off(); }
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(heldCount()).toBe(0);
      expect((storedAsk(place()) as ScriptAsk | null)?.createKey).toBe('ck-theirs');
    });

    it('only the ask store unreadable at the handoff (authentication valid): the run ends unsent, no session is created, nothing is held', async () => {
      let restore: () => void = () => undefined;
      let first = true;
      const off = subscribeScriptAsksVersion(() => { if (first) { first = false; restore = unreadableAsks(); } });
      try {
        expect(await runKeep(beginV())).toEqual({ outcome: 'not_sent', code: 'NOT_KEPT' });
      } finally { off(); restore(); }
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(turnPosts()).toBe(0);
      expect(heldCount()).toBe(0);
    });

    it('the store reading again after the refused handoff does not revive the run: a later check finds no prompt, sends nothing and claims nothing', async () => {
      let restore: () => void = () => undefined;
      let first = true;
      const off = subscribeScriptAsksVersion(() => { if (first) { first = false; restore = unreadableAsks(); } });
      let rec: WriterRun;
      try {
        rec = beginV();
        expect(await runKeep(rec)).toEqual({ outcome: 'not_sent', code: 'NOT_KEPT' });
      } finally { off(); restore(); }
      // the record could not be removed while the store was unreadable: it is still there, and a check of it finds nothing to send
      const left = storedAsk(place());
      expect(left).not.toBeNull();
      expect(await advance(restoreRun(left as ScriptAsk, env)!)).toEqual({ outcome: 'pending', code: 'EARLIER_ASK' });
      // the same run object advanced once more also sends nothing
      expect(['not_sent', 'pending', 'stale']).toContain((await advance(rec)).outcome);
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(turnPosts()).toBe(0);
      expect(heldCount()).toBe(0);
    });

    it('a claim that wins while the store cannot be read at that instant still releases the values at once (the prune alone would keep them)', async () => {
      let restore: () => void = () => undefined;
      let armed = false;
      // registered before the run, so it fires before the holder's own store listener on the claim's change
      const off = subscribeScriptAsksVersion(() => { if (armed) { armed = false; restore = unreadableAsks(); } });
      try {
        const a = await runKeep(beginV());
        expect(a.outcome).toBe('done');
        expect(heldCount()).toBe(1);
        armed = true;
        expect(await claimAnswer(a)).toBe(true);
        expect(heldCount()).toBe(0);
      } finally { off(); restore(); }
    });

    it('a run that lost its ask to a change nobody told this tab about releases its values when it ends', async () => {
      const base = onFetchBase();
      onFetch((c): Reply => {
        if (c.method === 'POST' && route(c) === '/sessions') {
          const raw = JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? '{}') as { accounts: Record<string, Array<Record<string, unknown>>> };
          for (const list of Object.values(raw.accounts)) for (const r of list) r.createKey = 'ck-theirs';
          localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify(raw));
        }
        return base(c);
      });
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(heldCount()).toBe(0);
    });

    it('a generation change that keeps the ask stored ends the run unsent at the handoff: nothing is held, its record is removed', async () => {
      let first = true;
      const off = subscribeScriptAsksVersion(() => { if (first) { first = false; bump('late'); } });
      let a: AiAnswer;
      try { a = await runKeep(beginV()); } finally { off(); }
      expect(a).toEqual({ outcome: 'not_sent', code: 'NOT_KEPT' });
      expect(sent('POST', '/sessions')).toHaveLength(0);
      expect(heldCount()).toBe(0);
      // its own record is removed when it still can be: the place is free to ask again
      expect(storedAsk(place())).toBeNull();
    });

    it('a run that lost its ask after its turn went out releases its values at once, whatever the store still holds', async () => {
      w.turn = { status: 202, body: { turn_id: 't1' } };
      const base = onFetchBase();
      onFetch((c): Reply => {
        const r = base(c);
        if (c.method === 'POST' && route(c) === '/sessions/s1/turns') {
          const raw = JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? '{}') as { accounts: Record<string, Array<Record<string, unknown>>> };
          for (const list of Object.values(raw.accounts)) for (const x of list) x.createKey = 'ck-theirs';
          localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify(raw));
        }
        return r;
      });
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
      expect(turnPosts()).toBe(1);
      expect(heldCount()).toBe(0);
    });

    it('an account end while the first write waits for the store\'s lock clears the values on the waiting run too', async () => {
      let free: () => void = () => undefined;
      const gate = new Promise<void>((r) => { free = r; });
      void navigator.locks.request('hub_changes', () => gate);
      const rec = beginV();
      const p = advance(rec);
      await new Promise((r) => setTimeout(r, 30));
      expect(rec.values).toBeDefined();
      // nothing is held until the store admitted the ask
      expect(heldCount()).toBe(0);
      forgetHeldValues();
      expect(rec.values).toBeUndefined();
      free();
      await p;
      expect(heldCount()).toBe(0);
    });

    it('an ask that ends before anything was sent releases its values even when its record cannot be removed', async () => {
      w.create = [{ status: 201, body: { ...created, started: { ...STARTED, tool_ceiling: undefined } } }];
      const base = onFetchBase();
      onFetch((c): Reply => {
        if (c.method === 'POST' && route(c) === '/sessions') {
          // another tab's record now sits at this place: the cleanup claim of this run's own record finds it changed and removes nothing
          const raw = JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? '{}') as { accounts: Record<string, Array<Record<string, unknown>>> };
          for (const list of Object.values(raw.accounts)) for (const r of list) r.createKey = 'ck-theirs';
          localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify(raw));
        }
        return base(c);
      });
      const a = await runKeep(beginV());
      expect(a).toEqual({ outcome: 'not_sent', code: 'NO_CEILING' });
      // (read before anything reads the place: a read prunes what the store no longer holds, and must not be what cleans up here)
      expect(heldCount()).toBe(0);
      expect(storedAsk(place())).not.toBeNull();
    });

    it('the end of the account clears the values with no auth purge (a logout that finds another tab\'s newer session purges nothing)', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      expect(heldCount()).toBe(1);
      endAccount('logout');
      expect(heldCount()).toBe(0);
    });

    it('each reason that ends the account clears the values, and a realm switch or fallback keeps them', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      expect((await runKeep(beginV())).outcome).toBe('pending');
      for (const keep of ['switch', 'fallback', 'late']) { bump(keep); expect(heldCount()).toBe(1); }
      for (const end of ['account', 'signout', 'logout', 'suspended']) {
        await wipe();
        timing.maxMs = 30;
        expect((await runKeep(beginV())).outcome).toBe('pending');
        expect(heldCount()).toBe(1);
        bump(end);
        expect(heldCount()).toBe(0);
      }
    });

    it('a refused 33rd ask holds nothing and leaves the values of the live asks alone', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      const a0 = await runKeep(beginV({ n: 0 }, 'p0.ts'));
      expect(a0.outcome).toBe('pending');
      for (let i = 0; i < SCRIPT_ASKS_MAX - 1; i++) expect(await putScriptAsk({ askId: `fill-${i}`, compId: 'c9', path: null, realm: R1, owner: 'fp1', sessionId: null, turnId: null, phase: 'create', sentAt: Date.now(), createKey: `ck${i}`, turnKey: `tk${i}` }, null)).toBe('ok');
      const refused = await runKeep(beginV({ n: 1 }, 'p1.ts'));
      expect(refused).toEqual({ outcome: 'not_sent', code: 'NO_RECORD' });
      expect(heldCount()).toBe(1);
      expect(valuesOf(a0)).toEqual({ n: 0 });
      // the live ask still answers with its values
      w.receipts = [{ turn_id: 't1', state: 'completed' }];
      const done = await advance(runOf(place(null, { path: 'p0.ts' }))!);
      expect(done.outcome).toBe('done');
      expect(valuesOf(done)).toEqual({ n: 0 });
    });

    it('values are held only once the store admitted the ask: not while its first write is out, never for a refused or lost one', async () => {
      let during = -1;
      const base = onFetchBase();
      onFetch((c): Reply => { if (c.method === 'POST' && route(c) === '/sessions') during = heldCount(); return base(c); });
      expect((await runKeep(beginV())).outcome).toBe('done');
      // by the time the session is created the ask is stored, so its values are held
      expect(during).toBe(1);
      await wipe();
      const theirs: ScriptAsk = { askId: askIdOf(place()), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'wait', sentAt: Date.now(), createKey: 'ck-theirs', turnKey: 'tk-theirs' };
      expect(await putScriptAsk(theirs, null)).toBe('ok');
      const rec = beginV();
      await runKeep(rec);
      expect(heldCount()).toBe(0);
      expect(rec.values).toBeUndefined();
    });

    it('forgetting the runs forgets the values', async () => {
      timing.maxMs = 30;
      w.receipts = [{ turn_id: 't1', state: 'dispatched' }];
      await runKeep(beginV());
      expect(heldCount()).toBe(1);
      forgetRuns();
      expect(heldCount()).toBe(0);
    });
  });
});
