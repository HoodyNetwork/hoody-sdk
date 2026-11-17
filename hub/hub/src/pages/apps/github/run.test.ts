// Vitest: the "From GitHub" run (run.ts) over a scripted AgentIO (testing.ts). The C9 rules are the point: the
// create and the turn go out once under their own key, a lost answer is "may have started" and Check repeats exactly
// that request, Stop has its own key, a decision names the gate shown, and nothing unknown is ever shown as failed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENDING_STALE_MS } from '@core/change-store';
import * as A from '@ask/io';
import type { AgentIO } from '@ask/io';
import { heldAttempts } from '@core';
import { BY, heldHandle } from './held';
import { promptFor, type Repo } from '../github';
import { DEFAULT_MODEL, GitHubRun, READ_MS, REOPEN_MS, WAKE_MS } from './run';
import { ACCT, bindCoreEnv, COMPUTER, INC, SID, flush, holds, manual, scripted } from './testing';
import * as coreEnv from '@core/test/env';
import { resetAttempts } from '@core/attempts';

/** A scripted IO behind the create gate, composed as liveIO composes it (ask/data.ts): the create reads /version (the IO's own) and goes
 *  out only through gatedCreate. The gate-on-resume tests use this; every other scripted run keeps the bare IO. */
function gatedScripted(io: AgentIO): AgentIO {
  const gated = new Proxy(io, {
    get: (t, m, r) => (m === 'create'
      ? (...a: Parameters<AgentIO['create']>) => A.gatedCreate(() => t.version(), () => t.create(...a))
      : Reflect.get(t, m, r)),
  });
  return A.withFixtureDest(gated, COMPUTER);
}

bindCoreEnv({ UID: coreEnv.UID, boot: coreEnv.boot, resetAttempts });

const REPO: Repo = { owner: 'octo', name: 'demo' };

async function started(over: Parameters<typeof scripted>[0] = {}, input: Partial<{ realm: string; model: string }> = {}, store = holds()) {
  const m = manual();
  const io = scripted(over);
  // core's realm selection: 'all' (the agent picks Global for an unrestricted login) or one realm id.
  const run = new GitHubRun(io.io, { computer: 'c1', account: ACCT, realm: 'all', admit: store.admit, ...input }, m.clock);
  expect(run.start(REPO)).toBe(true);
  for (let i = 0; i < 12; i++) await flush();
  return { m, io, run, store, snap: () => run.getSnapshot() };
}
/** The old page is gone: a request of it that was still out is lost (its transport and its send lock die with the page). */
function pageGone(first: { run: GitHubRun; io: ReturnType<typeof scripted> }): void {
  first.run.end();
  for (const h of first.io.held.splice(0)) h.rej({ status: 0 });
}
/** A reload: this machine is gone; a new one is built from the stored hold alone, over a fresh IO. */
function reloaded(store: ReturnType<typeof holds>, over: Parameters<typeof scripted>[0] = {}, gate = false) {
  // The old page's sending stamp (its beat died with it) is stale once the page has been gone long enough (as the pane tests do).
  const stored = store.reload();
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(Date.now() + SENDING_STALE_MS + 1000);
  const m = manual();
  const io = scripted(over);
  const run = GitHubRun.resume(gate ? gatedScripted(io.io) : io.io, { computer: 'c1', account: ACCT, realm: 'all', admit: store.admit }, stored, m.clock);
  if (!run) throw new Error('not resumed');
  return { m, io, run, snap: () => run.getSnapshot() };
}
afterEach(() => vi.useRealTimers());
const settle = async () => { for (let i = 0; i < 12; i++) await flush(); };

// Whether anything of a run was sent is the run's own fact (sent), read when it is needed, never
// from a render; a run is dropped only while nothing was sent, and ended at once so its checks can't go on to a create.
describe('sent and abandonUnsent', () => {
  it('a run whose checks are out: nothing sent; abandonUnsent ends it and no create follows', async () => {
    const m = manual();
    const io = scripted({ health: ['hold'] });
    const run = new GitHubRun(io.io, { computer: 'c1', account: ACCT, realm: 'all', admit: holds().admit }, m.clock);
    expect(run.start(REPO)).toBe(true);
    await settle();
    expect(run.getSnapshot()).toMatchObject({ phase: 'checking', sent: false });
    expect(run.abandonUnsent()).toBe(true);
    for (const h of io.held.splice(0)) h.res({ ok: true });
    await settle();
    expect(io.of('create')).toHaveLength(0);
  });

  it('a create handed to the agent: sent, and abandonUnsent refuses (the run keeps its watch)', async () => {
    const { io, run, snap } = await started({ create: ['hold'] });
    expect(io.of('create')).toHaveLength(1);
    expect(snap()).toMatchObject({ phase: 'creating', sent: true });
    expect(run.abandonUnsent()).toBe(false);
  });

  it('a turn refused after the session was created stays sent (notSent of the turn is not "nothing was sent")', async () => {
    const { snap, run } = await started({ turn: [{ err: { status: 409, code: 'turn_in_flight' } }] });
    expect(snap()).toMatchObject({ phase: 'notSent', sent: true, held: false });
    expect(run.abandonUnsent()).toBe(false);
  });

  it('a check that refused before any send: not sent', async () => {
    const { snap } = await started({ computer: [{ ok: { data: { id: 'c1', status: 'stopped', realm_ids: [] } } }] });
    expect(snap()).toMatchObject({ phase: 'blocked', sent: false, block: { key: 'stopped' } });
  });
});

describe('the happy path', () => {
  it('checks the agent, creates once, sends the turn once, follows it and reads the RESULT line', async () => {
    const { io, snap } = await started();
    expect(io.of('create')).toHaveLength(1);
    const [body, key, realm] = io.of('create')[0]!.args as [A.CreateBody, string, string];
    expect(JSON.stringify(body)).toBe(JSON.stringify(A.createBody('global', 'c1', { model: DEFAULT_MODEL })));
    expect(body).toMatchObject({ model: 'hoody-ai/hoody-free', tool_mode: 'standard', approval: { mode: 'default' } });
    expect(body).not.toHaveProperty('follow_realm_backend');
    expect(realm).toBe('global');
    expect(typeof key).toBe('string');
    expect(io.of('turn')).toHaveLength(1);
    const [sid, text, k2] = io.of('turn')[0]!.args as [string, string, string];
    expect(sid).toBe(SID);
    expect(text).toBe(promptFor(REPO));
    expect(k2).not.toBe(key);
    expect(snap().phase).toBe('working');
    io.frame('stream_chunk', { text: 'Cloned and started.\nRESULT {"kind":"web","port":3000}' });
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(io.of('receipt')).toHaveLength(1);
    expect(snap().phase).toBe('done');
    expect(snap().result).toEqual({ kind: 'web', port: 3000 });
    expect(io.open()).toBe(false);
  });

  it('a streamed reply without a RESULT line falls back to the transcript\'s last reply', async () => {
    const { io, snap } = await started({ transcript: [{ ok: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: 'Done.\nRESULT {"kind":"terminal","terminal":7}' }] }] } }] });
    io.frame('stream_chunk', { text: 'Done.' });
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(io.of('transcript')).toHaveLength(1);
    expect(snap().result).toEqual({ kind: 'terminal', terminal: 7 });
  });
});

describe('a create resumed from persisted metadata passes the same create gate as a fresh one', () => {
  const caps = (f: (n: string) => { name: string; supported: boolean; available: boolean } | null) => A.REQUIRED_CAPS.map(f).filter((c) => c !== null);
  const on = (name: string) => ({ name, supported: true, available: true });
  const gateways: Array<[string, unknown]> = [
    ['protocol 2 with all four capabilities', { session_protocol_version: 2, capabilities: caps(on) }],
    ['no protocol version', { capabilities: caps(on) }],
    ['computer_binding missing', { session_protocol_version: 3, capabilities: caps((n) => (n === 'computer_binding' ? null : on(n))) }],
    ['computer_binding disabled (available false)', { session_protocol_version: 3, capabilities: caps((n) => (n === 'computer_binding' ? { ...on(n), available: false } : on(n))) }],
  ];
  /** A first page that lost its create's answer and went away, then a reload over a gateway that answers `version`. */
  async function lost(version?: unknown) {
    const first = await started({ create: [{ err: { status: 0 } }] });
    expect(first.snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
    const key = first.io.of('create')[0]!.args[1] as string;
    const body = JSON.stringify(first.io.of('create')[0]!.args[0]);
    pageGone(first);
    const second = reloaded(first.store, version === undefined ? {} : { version: [{ ok: version }] }, true);
    return { first, second, key, body, store: first.store };
  }
  for (const [name, version] of gateways) {
    it(`${name}: Check sends nothing, keeps the key, the body and the hold, and stays unknown`, async () => {
      const { second, key, store } = await lost(version);
      expect(second.run.check()).toBe(true);
      await settle();
      expect(second.io.of('create'), 'no create left').toHaveLength(0);
      expect(second.io.of('turn')).toHaveLength(0);
      expect(second.snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
      // The unresolved hold is kept: a later page still finds it under the same key.
      const again = store.reload();
      expect(again.hold, 'the hold is still there').toBeTruthy();
      expect(again.hold!.key).toBe(key);
    });
  }
  it('a version that cannot be read sends nothing either, and the operation stays unknown', async () => {
    const first = await started({ create: [{ err: { status: 0 } }] });
    pageGone(first);
    const second = reloaded(first.store, { version: [{ err: { status: 0 } }] }, true);
    expect(second.run.check()).toBe(true);
    await settle();
    expect(second.io.of('create')).toHaveLength(0);
    expect(second.snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
  });
  it('protocol 3 with computer_binding: the create is sent, under the same key and the same body', async () => {
    const { second, key, body } = await lost();
    expect(second.run.check()).toBe(true);
    await settle();
    const sent = second.io.of('create');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.args[1]).toBe(key);
    expect(JSON.stringify(sent[0]!.args[0])).toBe(body);
    expect(second.snap().phase).toBe('working');
  });
  it('after a refused Check the same run sends the create once the gateway binds (Check again, same key)', async () => {
    const first = await started({ create: [{ err: { status: 0 } }] });
    const key = first.io.of('create')[0]!.args[1] as string;
    pageGone(first);
    const second = reloaded(first.store, { version: [{ ok: gateways[0]![1] }] }, true);
    second.run.check();
    await settle();
    expect(second.io.of('create')).toHaveLength(0);
    expect(second.run.check()).toBe(true);
    await settle();
    expect(second.io.of('create')).toHaveLength(1);
    expect(second.io.of('create')[0]!.args[1]).toBe(key);
  });
});

describe('C9: lost answers', () => {
  it('a lost create is "may have started"; Check repeats the same create under the same key, never a new one', async () => {
    const { io, run, snap } = await started({ create: [{ err: { status: 0 } }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
    expect(io.of('turn')).toHaveLength(0);
    expect(run.retry()).toBe(false);
    expect(run.check()).toBe(true);
    expect(run.check()).toBe(false);
    await settle();
    const [a, b] = io.of('create');
    expect(b!.args[1]).toBe(a!.args[1]);
    expect(JSON.stringify(b!.args[0])).toBe(JSON.stringify(a!.args[0]));
    expect(io.of('create')).toHaveLength(2);
    expect(io.of('turn')).toHaveLength(1);
    expect(snap().phase).toBe('working');
  });

  it('a lost turn is "may have started", never failed; Check repeats the same turn (key, text), the create is not sent again', async () => {
    const { io, run, snap } = await started({ turn: [{ err: { status: 502, pending: true } }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn' });
    expect(snap().phase).not.toBe('failed');
    run.check();
    await settle();
    const [a, b] = io.of('turn');
    expect(b!.args).toEqual(a!.args);
    expect(io.of('create')).toHaveLength(1);
    expect(snap().phase).toBe('working');
  });

  it('a definite create refusal sent nothing that runs: Try again starts over under a new key', async () => {
    const { io, run, snap } = await started({ create: [{ err: { status: 403, code: 'forbidden' } }] });
    expect(snap()).toMatchObject({ phase: 'notSent', block: { key: 'accessRefused', act: 'retry' } });
    expect(run.check()).toBe(false);
    expect(run.retry()).toBe(true);
    await settle();
    const [a, b] = io.of('create');
    expect(b!.args[1]).not.toBe(a!.args[1]);
  });

  it('a busy refusal of the turn keeps the session; Try again sends the turn again under a new key', async () => {
    const { io, run, snap } = await started({ turn: [{ err: { status: 409, code: 'turn_in_flight' } }] });
    expect(snap()).toMatchObject({ phase: 'notSent', block: { key: 'busy' } });
    run.retry();
    await settle();
    expect(io.of('create')).toHaveLength(1);
    const [a, b] = io.of('turn');
    expect(b!.args[1]).toBe(a!.args[1]);
    expect(b!.args[2]).not.toBe(a!.args[2]);
  });

  it('a session that comes back bound elsewhere is not used', async () => {
    const { io, snap } = await started({ create: [{ ok: { session_id: SID, started: { realm_selector: 'global', computer_id: 'other', owner_fingerprint: 'fp' } } }] });
    expect(snap()).toMatchObject({ phase: 'failed', block: { key: 'binding' } });
    expect(io.of('turn')).toHaveLength(0);
  });
  // sweep-ai-checkstarted-callers (FU:2210): a reply that only lacks the binding evidence (checkStarted MISSING) proves nothing either
  // way: the create stays unknown, with no block, its hold and key kept for Check; only MISMATCH is a binding failure.
  it.each([
    ['no started member', { session_id: SID }],
    ['a realm_selector that is not a non-empty string', { session_id: SID, started: { realm_selector: '', computer_id: 'c1', owner_fingerprint: 'fp' } }],
    ['a retired container_id', { session_id: SID, started: { realm_selector: 'global', container_id: 'c1', owner_fingerprint: 'fp' } }],
    ['no owner_fingerprint', { session_id: SID, started: { realm_selector: 'global', computer_id: 'c1' } }],
  ])('a create reply with %s is unknown, not a binding failure: no block, no turn, the hold and its key kept', async (_n, reply) => {
    const { io, snap, store } = await started({ create: [{ ok: reply }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create', block: null });
    expect(io.of('turn')).toHaveLength(0);
    const key = io.of('create')[0]!.args[1] as string;
    const again = store.reload();
    expect(again.hold, 'the hold is still there').toBeTruthy();
    expect(again.hold!.key).toBe(key);
  });
  it('Check after a reply without evidence repeats the create under the same key; a proven binding then sends the turn', async () => {
    const good = { session_id: SID, started: { realm_selector: 'global', computer_id: 'c1', owner_fingerprint: 'fp' } };
    const { io, run, snap } = await started({ create: [{ ok: { session_id: SID } }, { ok: good }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
    expect(run.check()).toBe(true);
    await settle();
    const [a, b] = io.of('create');
    expect(b, 'Check sent the create again').toBeTruthy();
    expect(b!.args[1]).toBe(a!.args[1]);
    expect(io.of('turn')).toHaveLength(1);
  });
  it('Check whose repeated create again lacks the evidence stays unknown: checking ends, no turn, the hold kept; Dismiss then frees it', async () => {
    const { io, run, snap, store } = await started({ create: [{ ok: { session_id: SID } }, { ok: { session_id: SID } }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create' });
    expect(run.check()).toBe(true);
    await settle();
    const [a, b] = io.of('create');
    expect(b, 'Check sent the create again').toBeTruthy();
    expect(b!.args[1]).toBe(a!.args[1]);
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create', block: null, checking: false, held: true });
    expect(io.of('turn')).toHaveLength(0);
    expect(store.rows.size).toBe(1);
    // The hold as shown now (the version the pane reads from the run).
    const shown = run.holdVersion();
    expect(shown, 'the hold is still held').not.toBeNull();
    expect(await run.dismiss({ metaVersion: shown! })).toBe('freed');
    expect(store.rows.size).toBe(0);
  });
});

describe('Stop', () => {
  it('sends one stop under its own key; the turn ends cancelled and says earlier steps may have run', async () => {
    const { io, run, snap } = await started({ receipt: [{ ok: { turn_id: 't1', state: 'cancelled', effects_may_have_occurred: true } }] });
    expect(run.stop()).toBe(true);
    expect(run.stop()).toBe(false);
    expect(snap().phase).toBe('stopping');
    await settle();
    expect(io.of('stop')).toHaveLength(1);
    const [sid, key, realm] = io.of('stop')[0]!.args as string[];
    expect([sid, realm]).toEqual([SID, 'global']);
    expect(key).not.toBe(io.of('create')[0]!.args[1]);
    expect(key).not.toBe(io.of('turn')[0]!.args[2]);
    io.frame('agent_done', { outcome: 'cancelled' });
    await settle();
    expect(snap()).toMatchObject({ phase: 'cancelled', effects: true });
  });

  it('a lost stop is "may have stopped"; Check sends the same stop key again', async () => {
    const { io, run, snap } = await started({ stop: [{ err: { status: 0 } }] });
    run.stop();
    await settle();
    // The turn is still followed (it may have stopped); the question stays open with Check.
    expect(snap()).toMatchObject({ phase: 'stopping', unknown: 'stop' });
    expect(run.stop()).toBe(false);
    run.check();
    await settle();
    const [a, b] = io.of('stop');
    expect(b!.args).toEqual(a!.args);
  });

  it('a definite stop refusal leaves the turn running as before, and Stop can be pressed again (a new key)', async () => {
    const { io, run, snap } = await started({ stop: [{ err: { status: 409, code: 'command_queue_full' } }] });
    run.stop();
    await settle();
    expect(snap().phase).toBe('working');
    expect(run.stop()).toBe(true);
    await settle();
    const [a, b] = io.of('stop');
    expect(b!.args[1]).not.toBe(a!.args[1]);
  });

  it('a definite stop refusal settles the run\'s own turn: Stop shows again for t1 and the refused stop key leaves the hold', async () => {
    const { io, run, snap, store } = await started({ stop: [{ err: { status: 429, code: 'rate_limited' } }] });
    run.stop();
    await settle();
    expect(snap().phase, 'back to working, not stuck stopping').toBe('working');
    expect(store.meta()?.turnId).toBe('t1');
    expect(store.meta()?.k4, 'the refused stop key left the hold').toBeUndefined();
    expect(run.stop(), 'Stop can be pressed again for the same turn').toBe(true);
    await settle();
    expect(io.of('stop')).toHaveLength(2);
  });

  it('a lost stop\'s question ends when the turn ends', async () => {
    const { io, run, snap } = await started({ stop: [{ err: { status: 0 } }], receipt: [{ ok: { turn_id: 't1', state: 'cancelled', effects_may_have_occurred: true } }] });
    run.stop();
    await settle();
    io.frame('agent_done', { outcome: 'cancelled' });
    await settle();
    expect(snap()).toMatchObject({ phase: 'cancelled', unknown: null });
    expect(run.check()).toBe(false);
  });

  it('a computer read that never answers ends at the read budget', async () => {
    const { m, io, snap } = await started({ computer: ['hold'] });
    m.run(READ_MS);
    expect(snap().block).toEqual({ key: 'unreachable', act: 'programs' });
    io.held[0]!.res({ data: { status: 'running' } });
    await settle();
    expect(io.of('health')).toHaveLength(0);
  });

  it('nothing to stop before the turn is accepted', async () => {
    const { run } = await started({ turn: ['hold'] });
    expect(run.stop()).toBe(false);
  });
});

describe('gates', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });

  it('an approval is shown, decided once for the gate shown, and the turn goes on', async () => {
    const { io, run, snap } = await started();
    ask(io);
    expect(snap().phase).toBe('waiting');
    expect(snap().gate).toMatchObject({ id: 'gate-5', generation: 1, kind: 'confirm' });
    expect(run.decide('once', { id: 'gate-4', generation: 1 })).toBe(false);
    expect(run.decide('once', { id: 'gate-5', generation: 2 })).toBe(false);
    expect(run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
    expect(run.decide('once', { id: 'gate-5', generation: 1 })).toBe(false);
    expect(snap().deciding).toBe(true);
    await settle();
    expect(io.of('confirm')).toHaveLength(1);
    expect(io.of('confirm')[0]!.args[1]).toMatchObject({ gate_id: 'gate-5', generation: 1, approved: true, remember: false });
  });

  it('sent only for a gate that offers it, as session_scope with remember off', async () => {
    const { io, run } = await started();
    ask(io);
    // Not offered: refused, nothing sent; the gate stays decidable.
    expect(run.decide('session', { id: 'gate-5', generation: 1 })).toBe(false);
    await settle();
    expect(io.of('confirm')).toHaveLength(0);
    io.frame('confirm_request', { gate_id: 6, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: true }, { gate: { id: 'gate-6', generation: 1, type: 'confirm' } });
    expect(run.decide('session', { id: 'gate-6', generation: 1 })).toBe(true);
    await settle();
    expect(io.of('confirm')).toHaveLength(1);
    expect(io.of('confirm')[0]!.args[1]).toMatchObject({ gate_id: 'gate-6', generation: 1, approved: true, remember: false, session_scope: true });
  });

  it('a session allow the agent applied once only (a locked policy) is said in the snapshot until the next gate', async () => {
    const { io, run, snap } = await started({ confirm: [{ ok: { status: 'ok', session_scope_applied: false, note: 'approval policy is locked' } }] });
    io.frame('confirm_request', { gate_id: 6, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: true }, { gate: { id: 'gate-6', generation: 1, type: 'confirm' } });
    expect(snap().onceOnly).toBe(false);
    run.decide('session', { id: 'gate-6', generation: 1 });
    await settle();
    expect(snap()).toMatchObject({ onceOnly: true, gate: null });
    ask(io);
    expect(snap().onceOnly).toBe(false);
  });

  it('a lost decision is read back from the session, never sent again', async () => {
    const { io, run } = await started({ confirm: [{ err: { status: 502, pending: true } }] });
    ask(io);
    run.decide('deny', { id: 'gate-5', generation: 1 });
    await settle();
    expect(io.of('confirm')).toHaveLength(1);
    expect(io.of('state')).toHaveLength(1);
  });

  it('a question is answered for the question shown', async () => {
    const { io, run } = await started();
    io.frame('user_question', { question_id: 6, question: 'Which port?', options: [] }, { gate: { id: 'gate-6', generation: 1, type: 'question' } });
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    expect(run.answer('8080', { id: 'gate-6', generation: 1 })).toBe(true);
    await settle();
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-6', answer: '8080' });
  });
});

describe('the agent check', () => {
  it('a waking agent (503) is asked once more after the wake wait', async () => {
    const { m, io, snap } = await started({ health: [{ err: { status: 503 } }] });
    expect(io.of('health')).toHaveLength(1);
    expect(snap().phase).toBe('checking');
    m.run(WAKE_MS);
    await settle();
    expect(io.of('health')).toHaveLength(2);
    expect(io.of('create')).toHaveLength(1);
  });

  it('an agent without the needed features is "update the agent", nothing created', async () => {
    const { io, snap } = await started({ version: [{ ok: { capabilities: [] } }] });
    expect(snap()).toMatchObject({ phase: 'blocked', block: { key: 'unsupported', act: 'agent' } });
    expect(io.of('create')).toHaveLength(0);
  });

  it('an agent signed in to another account is refused', async () => {
    const { snap } = await started({ authStatus: [{ ok: { account_id: 'other', auth_active: true, owner_fingerprint: 'fp', restriction: 'none' } }] });
    expect(snap().block).toEqual({ key: 'otherAccount', act: 'agent' });
  });

  it('a signed-out agent asks for a sign-in in the Agent', async () => {
    const { snap } = await started({ authStatus: [{ ok: { account_id: ACCT, auth_active: false } }] });
    expect(snap().block).toEqual({ key: 'signIn', act: 'agent' });
  });

  it('an unreachable agent (a CORS-hidden refusal looks the same) points to Programs and a new computer', async () => {
    const { io, snap } = await started({ health: [{ err: { status: 0 } }] });
    expect(snap().block).toEqual({ key: 'unreachable', act: 'programs' });
    expect(io.of('version')).toHaveLength(0);
  });

  it('the computer\'s row is read first: stopped, starting or failed says so, and the agent is not asked', async () => {
    for (const [status, block] of [
      ['stopped', { key: 'stopped', act: 'computers' }],
      ['paused', { key: 'stopped', act: 'computers' }],
      ['starting', { key: 'starting', act: 'retry' }],
      ['provisioning', { key: 'starting', act: 'retry' }],
      ['failed', { key: 'computerFailed', act: 'computers' }],
    ] as const) {
      const { io, snap } = await started({ computer: [{ ok: { data: { status, realm_ids: [] } } }] });
      expect(snap().block, status).toEqual(block);
      expect(io.of('health'), status).toHaveLength(0);
    }
  });

  it('a 403 forbidden from the agent is an access refusal, not "can\'t reach"', async () => {
    const { snap } = await started({ version: [{ err: { status: 403, code: 'forbidden' } }] });
    expect(snap().block).toEqual({ key: 'accessRefused', act: 'retry' });
  });

  it('a check that never answers ends at the read budget', async () => {
    const { m, snap } = await started({ health: ['hold'] });
    m.run(READ_MS);
    expect(snap().block).toEqual({ key: 'unreachable', act: 'programs' });
  });

  it('a realm the computer is not in is refused before anything is created', async () => {
    const realm = 'a'.repeat(24);
    const { io, snap } = await started({ computer: [{ ok: { data: { realm_ids: ['b'.repeat(24)] } } }] }, { realm });
    expect(snap().block).toMatchObject({ key: 'realm' });
    expect(io.of('create')).toHaveLength(0);
  });

  it('a realm other than Global is read first so the agent resolves its token', async () => {
    const realm = 'a'.repeat(24);
    const { io } = await started({ computer: [{ ok: { data: { realm_ids: [realm] } } }] }, { realm });
    expect(io.of('probe')).toHaveLength(1);
    expect(io.of('create')[0]!.args[2]).toBe(realm);
  });
});

describe('the stream and the end', () => {
  it('a dropped stream reads the receipt and opens again where it was', async () => {
    const { m, io } = await started({ receipt: [{ ok: { turn_id: 't1', state: 'dispatched' } }] });
    io.frame('stream_chunk', { text: 'a' });
    io.drop();
    expect(io.streams()).toBe(1);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('receipt').length).toBeGreaterThanOrEqual(1);
    expect(io.streams()).toBe(2);
  });

  it('end(): an answer that arrives later changes nothing and no timer is left', async () => {
    const { m, io, run, snap } = await started({ turn: ['hold'] });
    const before = snap();
    run.end();
    io.held[0]!.res({ turn_id: 't1', stream_url: `/api/v1/agent/sessions/${SID}/stream?since=0&incarnation=${INC}` });
    await settle();
    expect(snap()).toBe(before);
    expect(m.pending()).toBe(0);
    expect(io.streams()).toBe(0);
  });

  it('end() during the wake wait clears its timer: nothing is asked again', async () => {
    const { m, io, run } = await started({ health: [{ err: { status: 503 } }] });
    expect(m.pending()).toBeGreaterThan(0);
    run.end();
    expect(m.pending()).toBe(0);
    m.run(WAKE_MS + READ_MS);
    await settle();
    expect(io.of('health')).toHaveLength(1);
  });

  it('a hold admitted after end() is freed again, and nothing is sent', async () => {
    const store = holds();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const admit: typeof store.admit = (meta, realm) => gate.then(() => store.admit(meta, realm));
    const { io, run } = await started({}, {}, { ...store, admit });
    run.end();
    open();
    await settle();
    expect(store.log).toEqual(['admit:create', 'release']);
    expect(io.of('create')).toHaveLength(0);
  });

  it('an IO for another account or computer (not alive) drops every answer', async () => {
    const m = manual();
    const store = holds();
    const io = scripted({ turn: ['hold'] });
    const run = new GitHubRun(io.io, { computer: 'c1', account: ACCT, realm: 'all', admit: store.admit }, m.clock);
    run.start(REPO);
    await settle();
    io.kill();
    io.held[0]!.res({ turn_id: 't1' });
    await settle();
    expect(run.getSnapshot().phase).toBe('sending');
  });
});

describe('C9 across a reload: the keys and the step are held in core', () => {
  it('the create is held before it is sent, under the hold\'s own key; a known end frees the hold', async () => {
    const { io, store, snap } = await started();
    expect(store.log.slice(0, 2)).toEqual(['admit:create', 'save:turn']);
    expect(io.of('create')[0]!.args[1]).toBe(store.keyOf('h1'));
    expect(store.meta()).toMatchObject({ v: 1, step: 'running', sid: SID, turnId: 't1', computer: 'c1', realm: 'global', repo: REPO });
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(snap().phase).toBe('done');
    expect(store.rows.size).toBe(0);
  });

  it('(a) a reload while the create is unanswered is unknown; Check finds the session under the saved key, no second create', async () => {
    const first = await started({ create: ['hold'] });
    pageGone(first);
    await settle();
    const { io, run, snap } = reloaded(first.store);
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create', held: true });
    await settle();
    // Nothing goes out on its own.
    expect(io.calls).toHaveLength(0);
    expect(run.check()).toBe(true);
    await settle();
    expect(io.of('create')).toHaveLength(1);
    const [body, key] = io.of('create')[0]!.args as [A.CreateBody, string];
    expect(key).toBe(first.io.of('create')[0]!.args[1]);
    expect(JSON.stringify(body)).toBe(JSON.stringify(first.io.of('create')[0]!.args[0]));
    // The session found, the install's one turn goes out (it was never sent: the step said create).
    expect(io.of('turn')).toHaveLength(1);
    expect(io.of('turn')[0]!.args[1]).toBe(promptFor(REPO));
    expect(snap().phase).toBe('working');
  });

  it('(b) a reload mid-turn is unknown; Check reads the turn by its id and follows it to the end', async () => {
    const first = await started();
    first.run.end();
    const { io, run, snap } = reloaded(first.store, { receipt: [{ ok: { turn_id: 't1', state: 'completed', reply: 'ok\nRESULT {"kind":"web","port":8080}' } }], transcript: [{ ok: { messages: [{ role: 'assistant', blocks: [{ kind: 'text', text: 'RESULT {"kind":"web","port":8080}' }] }] } }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'running', held: true });
    await settle();
    expect(io.calls).toHaveLength(0);
    run.check();
    await settle();
    expect(io.of('receipt')[0]!.args.slice(0, 3)).toEqual([SID, 't1', 'global']);
    expect(io.of('create')).toHaveLength(0);
    expect(io.of('turn')).toHaveLength(0);
    expect(snap()).toMatchObject({ phase: 'done', result: { kind: 'web', port: 8080 } });
    expect(first.store.rows.size).toBe(0);
  });

  it('(b) a turn still running after the reload is followed again on its stream; Stop works', async () => {
    const first = await started();
    first.run.end();
    const { io, run, snap } = reloaded(first.store, { receipt: [{ ok: { turn_id: 't1', state: 'dispatched' } }] });
    run.check();
    await settle();
    expect(snap().phase).toBe('working');
    expect(io.streams()).toBe(1);
    expect(run.stop()).toBe(true);
    await settle();
    expect(io.of('stop')).toHaveLength(1);
    expect(first.store.meta()?.k4).toBe(io.of('stop')[0]!.args[1]);
  });

  it('(b) a reload after the turn was sent but before its answer: Check repeats that turn under its saved key', async () => {
    const first = await started({ turn: ['hold'] });
    pageGone(first);
    await settle();
    const { io, run, snap } = reloaded(first.store);
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn' });
    run.check();
    await settle();
    expect(io.of('create')).toHaveLength(0);
    // Same session, same text, same key, same realm.
    expect(io.of('turn')[0]!.args).toEqual(first.io.of('turn')[0]!.args);
    expect(snap().phase).toBe('working');
  });

  it('a lost check answer after a reload stays unknown, never failed', async () => {
    const first = await started();
    first.run.end();
    const { run, snap } = reloaded(first.store, { receipt: [{ err: { status: 0 } }] });
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'running', checking: false });
    expect(first.store.rows.size).toBe(1);
  });

  it('(c) a new run is refused while a hold is open: nothing is created', async () => {
    const first = await started({ create: ['hold'] });
    first.run.end();
    const { io, snap } = await started({}, {}, first.store);
    expect(snap()).toMatchObject({ phase: 'blocked', block: { key: 'held', act: 'none' } });
    expect(io.of('create')).toHaveLength(0);
  });

  it('a hold that cannot be stored sends nothing; neither does a turn whose step cannot be saved', async () => {
    const s1 = holds();
    s1.o.refuse = 'storage';
    const a = await started({}, {}, s1);
    expect(a.snap()).toMatchObject({ phase: 'blocked', block: { key: 'storage' } });
    expect(a.io.of('create')).toHaveLength(0);
    const s2 = holds();
    s2.o.failSave = true;
    const b = await started({}, {}, s2);
    expect(b.io.of('create')).toHaveLength(1);
    expect(b.io.of('turn')).toHaveLength(0);
    expect(b.snap()).toMatchObject({ phase: 'notSent', block: { key: 'storage', act: 'retry' } });
  });

  it('Dismiss frees the hold and ends the machine; a definite refusal frees it too', async () => {
    const first = await started({ create: [{ err: { status: 0 } }] });
    expect(first.snap().held).toBe(true);
    // The hold as shown: one save (the create admitted at 0) — a stale version is refused, the shown one frees it.
    expect(await first.run.dismiss({ metaVersion: 5 })).toBe('refused');
    expect(first.store.rows.size).toBe(1);
    expect(await first.run.dismiss({ metaVersion: 0 })).toBe('freed');
    expect(first.store.rows.size).toBe(0);
    expect(first.run.check()).toBe(false);
    const second = await started({ create: [{ err: { status: 403, code: 'forbidden' } }] });
    expect(second.snap().phase).toBe('notSent');
    expect(second.store.rows.size).toBe(0);
  });

  it('a stored record that does not read as a run is not resumed', async () => {
    const store = holds();
    await store.admit({ v: 1 } as never, 'global');
    const r = GitHubRun.resume(scripted().io, { computer: 'c1', account: ACCT, realm: 'all', admit: store.admit }, { hold: store.reload().hold, meta: { v: 1, step: 'create' } });
    expect(r).toBeNull();
  });
});

// Lost answers, unsettled receipts and gates the pane must not decide, each shown failing first.
describe('C9 fixes', () => {
  const retired = (code: string, admitted: string) => ({ err: { status: 409, code, details: { admitted } } });

  it('a retired turn key whose turn may have run stays unknown under the same key and hold, never a fresh turn', async () => {
    const { io, run, store, snap } = await started({ turn: [retired('turn_key_retired', 'unknown')] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn', held: true });
    expect(store.rows.size).toBe(1);
    expect(run.retry()).toBe(false);
    run.check();
    await settle();
    const [a, b] = io.of('turn');
    expect(b!.args[2]).toBe(a!.args[2]);
  });

  it('a retired turn key that admitted nothing is a definite refusal (Try again, a new key)', async () => {
    const { io, run, snap } = await started({ turn: [retired('turn_key_retired', 'false')] });
    expect(snap().phase).toBe('notSent');
    run.retry();
    await settle();
    const [a, b] = io.of('turn');
    expect(b!.args[2]).not.toBe(a!.args[2]);
  });

  it('a retired stop key whose stop may have run keeps the stop unknown (Check, same key), never a new stop key', async () => {
    const { io, run, snap } = await started({ stop: [retired('command_key_retired', 'unknown')] });
    run.stop();
    await settle();
    expect(snap()).toMatchObject({ unknown: 'stop' });
    expect(run.stop()).toBe(false);
    run.check();
    await settle();
    const [a, b] = io.of('stop');
    expect(b!.args[1]).toBe(a!.args[1]);
  });

  it('Dismiss is refused while a send of the hold is out, and says so; the hold stays', async () => {
    const { run, store, snap } = await started({ create: [{ err: { status: 0 } }] });
    store.rows.get('h1')!.sending = true;
    expect(await run.dismiss({ metaVersion: 0 })).toBe('refused');
    expect(store.rows.size).toBe(1);
    expect(snap()).toMatchObject({ phase: 'unknown', held: true });
    store.rows.get('h1')!.sending = false;
    expect(await run.dismiss({ metaVersion: 0 })).toBe('freed');
    expect(store.rows.size).toBe(0);
  });

  it('a Dismiss storage could not settle is unresolved: the hold and the card stay', async () => {
    const { run, store, snap } = await started({ create: [{ err: { status: 0 } }] });
    store.o.failFree = true;
    expect(await run.dismiss({ metaVersion: 0 })).toBe('unresolved');
    expect(snap()).toMatchObject({ phase: 'unknown', held: true });
  });

  it('the Check of a lost stop stamps the stop as out before it repeats it; a refused stamp sends nothing', async () => {
    const { io, run, store } = await started({ stop: [{ err: { status: 0 } }, { err: { status: 0 } }] });
    run.stop();
    await settle();
    const n = store.saves.length;
    run.check();
    await settle();
    expect(store.saves.slice(n)).toMatchObject([{ step: 'running', sending: true }]);
    expect(io.of('stop')).toHaveLength(2);
    store.o.failSave = true;
    run.check();
    await settle();
    expect(io.of('stop')).toHaveLength(2);
  });

  it('an answer that comes after end() still ends the send\'s stamp (create, turn and stop)', async () => {
    const a = await started({ create: ['hold'] });
    expect(a.store.rows.get('h1')!.sending).toBe(true);
    a.run.end();
    a.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(a.store.rows.get('h1')!.sending).toBe(false);
    expect(a.store.rows.size).toBe(1);
    const b = await started({ turn: ['hold'] });
    b.run.end();
    b.io.held[0]!.res({ turn_id: 't1' });
    await settle();
    expect(b.store.rows.get('h1')!.sending).toBe(false);
    const c = await started({ stop: ['hold'] });
    c.run.stop();
    await settle();
    expect(c.store.rows.get('h1')!.sending).toBe(true);
    c.run.end();
    c.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(c.store.rows.get('h1')!.sending).toBe(false);
  });

  it('a definite refusal of the first stop drops its key from the hold; Stop can be pressed again', async () => {
    const { io, run, store, snap } = await started({ stop: [{ err: { status: 409, code: 'command_queue_full' } }] });
    run.stop();
    await settle();
    expect(snap()).toMatchObject({ phase: 'working', unknown: null });
    expect(store.meta()!.k4).toBeUndefined();
    expect(run.stop()).toBe(true);
    await settle();
    expect(io.of('stop')).toHaveLength(2);
  });
});

describe('stream and gates', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>, o: Record<string, unknown> = {}) =>
    io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false, ...o }, { gate: { ...ref, ...o } });

  it('a replay gap reads the receipt, state and replay, reopens the stream, and a later approval shows', async () => {
    const { m, io, snap } = await started({ receipt: [{ ok: { turn_id: 't1', state: 'dispatched' } }] });
    io.raw('lagged', '{"code":"replay_gap"}');
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(1);
    expect(io.of('replay')).toHaveLength(1);
    expect(io.streams()).toBe(2);
    ask(io);
    expect(snap()).toMatchObject({ phase: 'waiting' });
    expect(snap().gate).toMatchObject({ id: 'gate-5' });
    expect(io.streams()).toBe(2);
  });

  it('an unsettled receipt after the turn\'s end is read again after a wait, a few times, then unknown with Check', async () => {
    const { m, io, run, snap } = await started({ receipt: Array.from({ length: 20 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } })) });
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(io.of('receipt')).toHaveLength(1);
    expect(snap().phase).toBe('finishing');
    for (let i = 0; i < 10; i++) { m.run(REOPEN_MS); await settle(); }
    expect(io.of('receipt').length).toBeLessThanOrEqual(6);
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'running', held: true });
    expect(run.check()).toBe(true);
  });

  it('a decision answered gate_decision_pending is read back from the session', async () => {
    // The live rejection's shape (core's HubError): the agent's reply under data.
    const { io, run, snap } = await started({ confirm: [{ err: { status: 409, code: 'gate_decision_pending', data: { error: { code: 'gate_decision_pending', message: 'pending' } } } }] });
    ask(io);
    run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    expect(io.of('confirm')).toHaveLength(1);
    expect(io.of('state')).toHaveLength(1);
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(false);
  });

  it('a read-back that answers after the turn ended brings no gate back, and nothing is decided after the end', async () => {
    const { io, run, snap } = await started({
      confirm: [{ err: { status: 0 } }],
      state: ['hold'],
      receipt: [{ ok: { turn_id: 't1', state: 'completed' } }],
    });
    ask(io);
    run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(snap().phase).toBe('done');
    io.held[0]!.res({ incarnation: INC, seq: 1, pending_gate_ref: ref, pending_gate: { type: 'confirm', tool_name: 'bash' } });
    await settle();
    expect(snap().gate).toBeNull();
    expect(run.decide('once', { id: 'gate-5', generation: 1 })).toBe(false);
  });

  it('a batch of questions is answered as one map of every question', async () => {
    const { io, run } = await started();
    io.frame('user_question', { question_id: 7, questions: [{ id: 'stack', question: 'Which stack?', options: ['node', 'go'] }, { id: 'port', question: 'Which port?', options: [] }] }, { gate: { id: 'gate-7', generation: 1, type: 'question' } });
    expect(run.answer('node', { id: 'gate-7', generation: 1 })).toBe(false);
    expect(run.answer({ stack: 'node', port: '8080' }, { id: 'gate-7', generation: 1 })).toBe(true);
    await settle();
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-7', answers: { stack: 'node', port: '8080' } });
  });

  it('a gate that needs an approver lease is not decided here', async () => {
    const { io, run, snap } = await started();
    ask(io, { lease_required: true });
    expect(snap().gate).toMatchObject({ blocked: 'policy' });
    expect(run.decide('once', { id: 'gate-5', generation: 1 })).toBe(false);
    await settle();
    expect(io.of('confirm')).toHaveLength(0);
  });

  it('a late health answer after end() schedules and asks nothing more', async () => {
    const { m, io, run } = await started({ health: ['hold'] });
    run.end();
    io.held[0]!.rej({ status: 503 });
    await settle();
    expect(m.pending()).toBe(0);
    m.run(WAKE_MS + READ_MS);
    await settle();
    expect(io.of('health')).toHaveLength(1);
    expect(io.of('version')).toHaveLength(0);
  });
});

// Live error shapes from the agent, each shown failing first.
describe('live error shapes', () => {
  const lost = { err: { status: 0 } };
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });

  it('1 a 429 on the Check of a lost turn says nothing about the first turn: unknown, same key, hold kept', async () => {
    const { io, run, store, snap } = await started({ turn: [lost, { err: { status: 429, code: 'rate_limited', data: { error: { code: 'rate_limited' } } } }] });
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn', held: true });
    expect(store.rows.size).toBe(1);
    expect(run.retry()).toBe(false);
    run.check();
    await settle();
    const keys = io.of('turn').map((c) => c.args[2]);
    expect(new Set(keys).size).toBe(1);
    expect(keys).toHaveLength(3);
  });

  it('1 a refused Check of a lost create keeps the create unknown under its key', async () => {
    const { io, run, store, snap } = await started({ create: [lost, { err: { status: 429, code: 'rate_limited' } }] });
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create', held: true });
    expect(store.rows.size).toBe(1);
    expect(io.of('create')[1]!.args[1]).toBe(io.of('create')[0]!.args[1]);
  });

  it('1 409 creation_interrupted (an earlier send may have made the session) is unknown, never "not started"', async () => {
    const { run, store, snap } = await started({ create: [{ err: { status: 409, code: 'creation_interrupted', data: { error: { code: 'creation_interrupted' } } } }] });
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'create', held: true });
    expect(store.rows.size).toBe(1);
    expect(run.retry()).toBe(false);
  });

  it('1 a refused Check of a lost stop keeps the stop question and its key', async () => {
    const { io, run, store, snap } = await started({ stop: [lost, { err: { status: 409, code: 'session_busy' } }] });
    run.stop();
    await settle();
    run.check();
    await settle();
    expect(snap()).toMatchObject({ unknown: 'stop' });
    expect(store.meta()!.k4).toBe(io.of('stop')[0]!.args[1]);
    expect(run.stop()).toBe(false);
  });

  it('2 a refusal that asks to read again (live shape) is read back, and no second decision is taken meanwhile', async () => {
    const { io, run } = await started({ confirm: [{ err: { status: 409, code: 'gate_conflict', data: { error: { code: 'gate_conflict' } } } }] });
    ask(io);
    run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    expect(io.of('state')).toHaveLength(1);
  });

  it('3 a sending save that lands after end() ends its stamp (turn, Stop); nothing is sent', async () => {
    const a = await started({ create: ['hold'] });
    let open!: () => void;
    a.store.o.gate = new Promise<void>((r) => (open = r));
    a.io.held[0]!.res({ session_id: SID, started: { realm_selector: 'global', computer_id: 'c1', owner_fingerprint: 'fp' } });
    await settle();
    a.run.end();
    open();
    await settle();
    expect(a.store.meta()!.step).toBe('turn');
    expect(a.store.rows.get('h1')!.sending).toBe(false);
    expect(a.io.of('turn')).toHaveLength(0);
    const b = await started();
    let open2!: () => void;
    b.store.o.gate = new Promise<void>((r) => (open2 = r));
    b.run.stop();
    b.run.end();
    open2();
    await settle();
    expect(b.store.rows.get('h1')!.sending).toBe(false);
    expect(b.io.of('stop')).toHaveLength(0);
  });

  it('4 a refused save on the Check of a lost turn keeps it unknown with Check, never "not started"', async () => {
    const { io, run, store, snap } = await started({ turn: [lost] });
    store.o.failSave = true;
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn', checking: false, held: true });
    expect(io.of('turn')).toHaveLength(1);
    store.o.failSave = false;
    expect(run.check()).toBe(true);
  });

  it('5 a Check whose answer is the stored receipt of a finished turn ends at once with its result', async () => {
    const { io, run, store, snap } = await started({
      turn: [lost, { ok: { turn_id: 't1', state: 'completed', stream_url: `/api/v1/agent/sessions/${SID}/stream?since=9&incarnation=${INC}` } }],
      transcript: [{ ok: { messages: [{ role: 'assistant', blocks: [{ kind: 'text', text: 'RESULT {"kind":"web","port":3000}' }] }] } }],
    });
    const streams = io.streams();
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'done', result: { kind: 'web', port: 3000 } });
    expect(store.rows.size).toBe(0);
    expect(io.streams()).toBe(streams);
  });

  it('a late realm probe answer after end() reads nothing more', async () => {
    const realm = 'a'.repeat(24);
    const { io, run } = await started({ computer: [{ ok: { data: { realm_ids: [realm] } } }], probe: ['hold'] }, { realm });
    const n = io.of('authStatus').length;
    run.end();
    io.held[0]!.res({});
    await settle();
    expect(io.of('authStatus')).toHaveLength(n);
  });
});

// Two more live error shapes, each shown failing first.
describe('two more live error shapes', () => {
  const lost = { err: { status: 0 } };
  const refused = { err: { status: 429, code: 'rate_limited', data: { error: { code: 'rate_limited' } } } };
  const failed = { err: { status: 500, code: 'internal' } };
  const notAdmitted = (code: string) => ({ err: { status: 409, code, details: { admitted: 'false' }, data: { error: { code, details: { admitted: 'false' } } } } });
  const ask = (io: ReturnType<typeof scripted>) =>
    io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: { id: 'gate-5', generation: 1, type: 'confirm' } });
  const seen = { id: 'gate-5', generation: 1 };

  it('1 a Check answered "retired, admitted nothing" settles the lost turn as not run: hold freed, Try again with a new key', async () => {
    const { io, run, store, snap } = await started({ turn: [lost, notAdmitted('turn_key_retired')] });
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'notSent', unknown: null, held: false });
    expect(store.rows.size).toBe(0);
    expect(run.retry()).toBe(true);
    await settle();
    const keys = io.of('turn').map((c) => c.args[2]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('1 a stop Check answered "retired, admitted nothing" settles the stop as not run: its key leaves the hold, Stop works again', async () => {
    const { io, run, store, snap } = await started({ stop: [lost, notAdmitted('command_key_retired')] });
    run.stop();
    await settle();
    run.check();
    await settle();
    expect(snap()).toMatchObject({ unknown: null });
    expect(store.meta()!.k4).toBeUndefined();
    expect(run.stop()).toBe(true);
    await settle();
    const keys = io.of('stop').map((c) => c.args[1]);
    expect(keys).toHaveLength(3);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('1 any other Check refusal still keeps the outcome unknown (a retired key that may have run included)', async () => {
    const { run, snap } = await started({ turn: [lost, { err: { status: 409, code: 'turn_key_retired', details: { admitted: 'unknown' } } }] });
    run.check();
    await settle();
    expect(snap()).toMatchObject({ phase: 'unknown', unknown: 'turn', held: true });
  });

  it('2 a refused decision is reconciled before another: failed reads retry on a timer, and nothing can be decided meanwhile', async () => {
    // The turn goes on (dispatched) through every read: only the reads decide when the decision is free again.
    const going = { ok: { turn_id: 't1', state: 'dispatched' } };
    const { m, io, run, snap } = await started({ confirm: [refused], state: [failed, failed], replay: [failed, failed], receipt: [going, going, going, going] });
    ask(io);
    expect(run.decide('once', seen)).toBe(true);
    await settle();
    expect(io.of('state')).toHaveLength(1);
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', seen)).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', seen)).toBe(false);
    // The third read answers: reconciled, the timer stops and the decision is free again.
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(3);
    expect(snap()).toMatchObject({ deciding: false, phase: 'waiting' });
    m.run(REOPEN_MS * 3);
    await settle();
    expect(io.of('state')).toHaveLength(3);
    expect(io.of('confirm')).toHaveLength(1);
    // The gate the read left parked can be decided again, once.
    expect(run.decide('deny', seen)).toBe(true);
    await settle();
    expect(io.of('confirm')).toHaveLength(2);
  });

  it('2 a lost decision stays undecidable until a read answers: a failed read is read again after a wait', async () => {
    const going = { ok: { turn_id: 't1', state: 'dispatched' } };
    const { m, io, run, snap } = await started({ confirm: [lost], state: [failed], receipt: [going, going] });
    ask(io);
    run.decide('once', seen);
    await settle();
    expect(io.of('state')).toHaveLength(1);
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', seen)).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(io.of('confirm')).toHaveLength(1);
  });

  it('2 a pending decision whose read fails is read again, and stays undecidable meanwhile', async () => {
    const pending = { err: { status: 409, code: 'gate_decision_pending', data: { error: { code: 'gate_decision_pending' } } } };
    const { m, io, run, snap } = await started({ confirm: [pending], state: [failed] });
    ask(io);
    run.decide('once', seen);
    await settle();
    expect(snap().deciding).toBe(true);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(run.decide('deny', seen)).toBe(false);
    expect(io.of('confirm')).toHaveLength(1);
  });

  it('2 a reconciliation ends with the turn: a finished run shows no decision out', async () => {
    const { io, run, snap } = await started({ confirm: [lost], state: ['hold'], replay: ['hold'] });
    ask(io);
    run.decide('once', seen);
    await settle();
    expect(snap().deciding).toBe(true);
    io.frame('agent_done', { outcome: 'completed' });
    await settle();
    expect(snap().phase).toBe('done');
    expect(snap().deciding).toBe(false);
  });

  it('2 Stop while a decision is being reconciled keeps the gate undecidable', async () => {
    const going = { ok: { turn_id: 't1', state: 'dispatched' } };
    const { io, run, snap } = await started({ confirm: [refused], state: ['hold'], replay: ['hold'], receipt: [going, going, going] });
    ask(io);
    run.decide('once', seen);
    await settle();
    expect(run.stop()).toBe(true);
    await settle();
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', seen)).toBe(false);
    expect(io.of('confirm')).toHaveLength(1);
  });
});

// A lost decision is read back, and while that read is out a gate_resolved frame may
// clear the decision. Only a read that answered AND was applied settles it: a failed read, a reply dropped because the
// incarnation moved, or a snapshot left out because the gate moved meanwhile is read again, and until then no new gate
// is decidable.
describe('a read-back settles only when it answered and was applied', () => {
  const g5 = { id: 'gate-5', generation: 1, type: 'confirm' };
  const g6 = { id: 'gate-6', generation: 1, type: 'confirm' };
  const confirmFrame = (io: ReturnType<typeof scripted>, id: number, gate: typeof g5) =>
    io.frame('confirm_request', { gate_id: id, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate });
  /** gate-5's decision is lost; its read-back is dispatched (held when `hold`); gate-5 resolves and gate-6 is asked meanwhile. */
  async function lostThenNewGate(over: Parameters<typeof scripted>[0]) {
    const s = await started({ confirm: [{ err: { status: 0 } }], ...over });
    confirmFrame(s.io, 5, g5);
    expect(s.run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    expect(s.io.of('state')).toHaveLength(1);
    s.io.frame('gate_resolved', { kind: 'confirm', gate_id: 5, outcome: 'answered' });
    confirmFrame(s.io, 6, g6);
    await settle();
    return s;
  }

  it.each(['state', 'replay'] as const)('readback_failed_read_keeps_new_gate_undecidable: the %s read fails, then gate-5 resolves and gate-6 asks: gate-6 waits for a read that answers', async (failing) => {
    const { m, io, run, snap } = await lostThenNewGate({ [failing]: ['hold'] });
    io.held.find((x) => x.m === failing)!.rej({ status: 0 }); // fails after gate-5 resolved and gate-6 asked
    await settle();
    expect(snap().gate).toMatchObject({ id: 'gate-6' });
    expect(snap().deciding).toBe(true);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
    await settle();
    // gate-5 was never decided again: the only other decision is gate-6's
    expect(io.of('confirm').map((c) => (c.args[1] as { gate_id: string }).gate_id)).toEqual(['gate-5', 'gate-6']);
  });

  it('readback_answer_with_decision_out_is_read_again: the read answers while the decision is still out; gate-5 resolves and gate-6 asks after it: gate-6 waits for the next read', async () => {
    const { m, io, run, snap } = await lostThenNewGate({});
    expect(snap().gate).toMatchObject({ id: 'gate-6' });
    expect(snap().deciding).toBe(true);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
  });

  it('readback_failed_replay_with_state_clearing_is_read_again: the snapshot shows gate-5 gone but the replay read fails: not settled; gate-6 waits for the next read', async () => {
    const { m, io, run, snap } = await started({ confirm: [{ err: { status: 0 } }], state: [{ ok: { incarnation: INC, seq: 50 } }], replay: [{ err: { status: 0 } }] });
    confirmFrame(io, 5, g5);
    expect(run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    expect(io.of('replay')).toHaveLength(1);
    expect(snap().gate).toBeNull(); // the snapshot (seq 50, no gate) cleared gate-5 and its decision
    confirmFrame(io, 6, g6);
    await settle();
    expect(snap().deciding).toBe(true);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('replay')).toHaveLength(2);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
  });

  it('readback_left_out_state_is_read_again: the read answers after gate-5 resolved and gate-6 asked (its snapshot is left out): not settled, read again', async () => {
    const { m, io, run, snap } = await lostThenNewGate({ state: ['hold'] });
    io.held.find((x) => x.m === 'state')!.res({ incarnation: INC, seq: 0 });
    await settle();
    expect(snap().gate).toMatchObject({ id: 'gate-6' });
    expect(snap().deciding).toBe(true);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    m.run(REOPEN_MS);
    await settle();
    expect(io.of('state')).toHaveLength(2);
    expect(run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
    await settle();
    expect(io.of('confirm').map((c) => (c.args[1] as { gate_id: string }).gate_id)).toEqual(['gate-5', 'gate-6']);
  });

  const running = Array.from({ length: 12 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } }));
  const g6Snap = (seq: number) => ({ incarnation: 'inc2', seq, pending_gate_ref: g6, pending_gate: { type: 'confirm', tool_name: 'bash' } });

  it('readback_dropped_reply_is_read_again: the incarnation moves on the stream while the read is out: its reply is dropped and the turn is read again; only that read settles it', async () => {
    const s = await started({ confirm: [{ err: { status: 0 } }], state: ['hold', 'hold'], receipt: running });
    confirmFrame(s.io, 5, g5);
    expect(s.run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    s.io.frame('gate_resolved', { kind: 'confirm', gate_id: 5, outcome: 'answered' });
    await settle();
    s.io.raw('confirm_request', JSON.stringify({ seq: 1, incarnation: 'inc2', turn_id: 't1', event: { type: 'event.confirm_request', data: { gate_id: 6, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false } }, gate: g6 }));
    await settle();
    s.io.held.find((x) => x.m === 'state')!.res({ incarnation: INC, seq: 0 });
    await settle();
    // The reply named the old incarnation: nothing settled; the turn is read again (receipt, state, replay).
    expect(s.io.of('state')).toHaveLength(2);
    expect(s.snap().deciding).toBe(true);
    expect(s.run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    s.io.held.filter((x) => x.m === 'state')[1]!.res(g6Snap(1));
    await settle();
    expect(s.snap().phase).toBe('waiting'); // the turn still runs: settled by the read, not by an end
    expect(s.run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
  });

  it('readback_dropped_reply_after_adopted_snapshot_is_read_again: the stream drops, recovery adopts a newer incarnation\'s snapshot while its replay fails, then the old read answers: dropped, not settled; the next applied read settles it', async () => {
    const s = await started({
      confirm: [{ err: { status: 0 } }],
      state: ['hold', ...Array.from({ length: 8 }, () => ({ ok: g6Snap(1) }))],
      replay: [{ ok: { incarnation: INC, min_seq: 1, max_seq: 0, events: [] } }, { err: { status: 0 } }, ...Array.from({ length: 8 }, () => ({ ok: { incarnation: 'inc2', min_seq: 1, max_seq: 1, events: [] } }))],
      receipt: running,
    });
    confirmFrame(s.io, 5, g5);
    expect(s.run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    s.io.drop(); // the stream breaks; recovery reads the turn after the wait
    s.m.run(REOPEN_MS);
    await settle();
    expect(s.snap().gate).toMatchObject({ id: 'gate-6' }); // the inc2 snapshot was adopted (its replay failed)
    s.io.held.find((x) => x.m === 'state')!.res({ incarnation: INC, seq: 0 });
    await settle();
    expect(s.snap().deciding).toBe(true);
    expect(s.run.decide('once', { id: 'gate-6', generation: 1 })).toBe(false);
    for (let i = 0; i < 3 && s.snap().deciding; i++) { s.m.run(REOPEN_MS); await settle(); }
    expect(s.snap().phase).toBe('waiting');
    expect(s.run.decide('once', { id: 'gate-6', generation: 1 })).toBe(true);
  });
});

// Journal acceptance: the stamp of a send ends only when every send of the hold has settled in
// the transport, whatever the run's own state; a stored decision is read back after a reload and never sent again.
describe('the sending stamp follows the transport (leases) and a stored decision survives a reload', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });

  it('a decision is stored, posted, its answer lost and the page reloaded: the resumed run sees d, reads the turn back and sends nothing', async () => {
    const first = await started({ confirm: [{ err: { status: 502, pending: true } }] });
    ask(first.io);
    first.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    expect(first.io.of('confirm')).toHaveLength(1);
    expect(first.store.meta()).toMatchObject({ d: { gate: 'gate-5', gen: 1, kind: 'confirm' } });
    pageGone(first);
    const { io, run } = reloaded(first.store);
    run.check();
    await settle();
    expect(io.of('confirm'), 'the decision was sent again').toHaveLength(0);
    expect(io.calls.map((c) => c.m), 'it reads the turn back instead').toEqual(expect.arrayContaining(['receipt']));
  });
  it('a session decision whose answer is lost is stored, read back after a reload and never sent again', async () => {
    const offer = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: true }, { gate: ref });
    const first = await started({ confirm: [{ err: { status: 502, pending: true } }] });
    offer(first.io);
    expect(first.run.decide('session', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    expect(first.io.of('confirm')).toHaveLength(1);
    expect(first.io.of('confirm')[0]!.args[1]).toMatchObject({ approved: true, remember: false, session_scope: true });
    expect(first.store.meta()).toMatchObject({ d: { gate: 'gate-5', gen: 1, kind: 'confirm' } });
    // Lost in place: no second decision of any kind while it is read back.
    expect(first.run.decide('session', { id: 'gate-5', generation: 1 })).toBe(false);
    expect(first.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(false);
    pageGone(first);
    const { io, run } = reloaded(first.store);
    run.check();
    await settle();
    expect(io.of('confirm'), 'the session grant was sent again').toHaveLength(0);
    expect(io.calls.map((c) => c.m)).toEqual(expect.arrayContaining(['receipt']));
  });
  it('end() while a claimed turn is outstanding: the stamp stays until the transport settles', async () => {
    const s = await started({ turn: ['hold'] });
    expect(s.store.rows.get('h1')!.sending).toBe(true);
    s.run.end();
    await settle();
    expect(s.store.rows.get('h1')!.sending, 'the claimed turn is still out').toBe(true);
    s.io.held[0]!.res({ turn_id: 't1' });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(false);
  });
  it('a decision and a Stop overlap, both claimed; end() in between; the stamp survives until the last transport settles, in either order', async () => {
    for (const decisionFirst of [true, false]) {
      const s = await started({ confirm: ['hold'], stop: ['hold'] });
      ask(s.io);
      s.run.decide('once', { id: 'gate-5', generation: 1 });
      await settle();
      s.run.stop();
      await settle();
      const dec = s.io.held.find((x) => x.m === 'confirm')!, stop = s.io.held.find((x) => x.m === 'stop')!;
      expect(!!dec && !!stop, 'both are out').toBe(true);
      s.run.end();
      await settle();
      expect(s.store.rows.get('h1')!.sending).toBe(true);
      (decisionFirst ? dec : stop).rej({ status: 0 });
      await settle();
      expect(s.store.rows.get('h1')!.sending, 'the other send is still out').toBe(true);
      (decisionFirst ? stop : dec).rej({ status: 0 });
      await settle();
      expect(s.store.rows.get('h1')!.sending).toBe(false);
    }
  });
  it('a second instance resumed on the same hold shares its leases: the first instance\'s claimed decision keeps the stamp until it settles', async () => {
    const first = await started({ confirm: ['hold'] });
    ask(first.io);
    first.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    first.run.end();
    const row = heldAttempts().find((h) => h.by === BY)!;
    const second = GitHubRun.resume(scripted({ stop: [{ err: { status: 0 } }] }).io, { computer: 'c1', account: ACCT, realm: 'all', admit: first.store.admit }, { hold: heldHandle(row.id, row.metaVersion)!, meta: JSON.parse(JSON.stringify(row.meta)) }, manual().clock);
    expect(second).not.toBeNull();
    second!.end();
    await settle();
    expect(first.store.rows.get('h1')!.sending, 'the first instance\'s decision is still out').toBe(true);
    first.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(first.store.rows.get('h1')!.sending).toBe(false);
  });
});

// Reload and decision cases, each written failing first.
describe('a stored decision and a refusal are judged by the journal\'s route rules', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });
  const g5Snap = { incarnation: INC, seq: 1, pending_gate_ref: ref, pending_gate: { type: 'confirm', tool_name: 'bash' } };
  const dispatched = Array.from({ length: 12 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } }));
  const parked = Array.from({ length: 12 }, () => ({ ok: g5Snap }));

  it('after a reload, a read that still shows the same gate parked keeps the stored decision; no second decision is taken', async () => {
    const first = await started({ confirm: [{ err: { status: 502, pending: true } }] });
    ask(first.io);
    expect(first.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    expect(first.store.meta()).toMatchObject({ d: { gate: 'gate-5', gen: 1, kind: 'confirm' } });
    pageGone(first);
    const { io, run, snap } = reloaded(first.store, { receipt: dispatched, state: parked });
    run.check();
    await settle();
    expect(snap().gate, 'the read shows the gate parked').toMatchObject({ id: 'gate-5' });
    expect(first.store.meta(), 'the decision left the stored hold while its gate is still parked').toMatchObject({ d: { gate: 'gate-5' } });
    expect(snap().deciding).toBe(true);
    expect(run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(false);
    expect(io.of('confirm'), 'a second decision was sent').toHaveLength(0);
  });
  it('a 2xx reply that is not the documented success does not settle the decision; it is read back', async () => {
    const s = await started({ confirm: [{ ok: { status: 'pending' } }], state: parked, receipt: dispatched });
    ask(s.io);
    expect(s.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    expect(s.store.meta(), 'the decision marker was erased on an unproven reply').toMatchObject({ d: { gate: 'gate-5' } });
    expect(s.snap().gate).toMatchObject({ id: 'gate-5' });
    expect(s.snap().deciding).toBe(true);
    expect(s.run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(false);
  });
  it('a turn refused 409 session_terminating (documented as may have run) is unknown, not "not sent": the key and the hold stay', async () => {
    const s = await started({ turn: [{ err: { status: 409, code: 'session_terminating' } }] });
    expect(s.snap().phase).toBe('unknown');
    expect(s.snap().held).toBe(true);
  });
});

// The three Stop schedules, each on its own and asserted at every boundary.
describe('the leases keep the sending stamp through each specified schedule', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });
  const g5Snap = { incarnation: INC, seq: 1, pending_gate_ref: ref, pending_gate: { type: 'confirm', tool_name: 'bash' } };
  const dispatched = Array.from({ length: 12 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } }));
  const parked = Array.from({ length: 12 }, () => ({ ok: g5Snap }));

  it('a decision is claimed and a Stop whose sending save is refused is not sent; the stamp stays until the decision settles', async () => {
    const s = await started({ confirm: ['hold'] });
    ask(s.io);
    s.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(true);
    s.store.o.failSave = true;
    s.run.stop();
    await settle();
    s.store.o.failSave = false;
    expect(s.io.of('stop'), 'a Stop whose save was refused left').toHaveLength(0);
    expect(s.store.rows.get('h1')!.sending, 'the refused Stop ended the decision\'s stamp').toBe(true);
    s.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(false);
  });
  it('a decision is claimed, a Stop\'s sending save is queued, the run ends, the save lands: the Stop does not leave and the stamp survives until the decision settles', async () => {
    const s = await started({ confirm: ['hold'] });
    ask(s.io);
    s.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    let open!: () => void;
    s.store.o.gate = new Promise<void>((r) => { open = r; });
    s.run.stop();
    await settle();
    s.run.end();
    await settle();
    s.store.o.gate = null;
    open();
    await settle();
    expect(s.store.saves.some((x) => x.sending), 'control: the Stop\'s sending save landed').toBe(true);
    expect(s.io.of('stop'), 'a Stop of an ended run left').toHaveLength(0);
    expect(s.store.rows.get('h1')!.sending, 'the queued save\'s lease ended the decision\'s stamp').toBe(true);
    s.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(false);
  });
  it('a second instance on the same hold sends a Stop that is refused; neither instance\'s settle clears the other\'s stamp', async () => {
    const first = await started({ confirm: ['hold'] });
    ask(first.io);
    first.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    first.run.end();
    const row = heldAttempts().find((h) => h.by === BY)!;
    const sIo = scripted({ stop: [{ err: { status: 409, code: 'command_queue_full' } }], receipt: dispatched, state: parked });
    const m = manual();
    const second = GitHubRun.resume(sIo.io, { computer: 'c1', account: ACCT, realm: 'all', admit: first.store.admit }, { hold: heldHandle(row.id, row.metaVersion)!, meta: JSON.parse(JSON.stringify(row.meta)) }, m.clock)!;
    expect(second).not.toBeNull();
    second.check();
    await settle();
    expect(second.getSnapshot().phase).toBe('waiting');
    expect(second.stop(), 'the second instance may stop the turn').toBe(true);
    await settle();
    expect(sIo.of('stop'), 'the second instance\'s Stop was sent and refused').toHaveLength(1);
    expect(first.store.rows.get('h1')!.sending, 'the second instance\'s refusal cleared the first\'s stamp').toBe(true);
    first.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(first.store.rows.get('h1')!.sending).toBe(false);
  });
});

// Snapshot shape and Stop cases, each written failing first.
describe('a stored decision is cleared only by positive closure evidence', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });
  const g5Snap = { incarnation: INC, seq: 1, pending_gate_ref: ref, pending_gate: { type: 'confirm', tool_name: 'bash' } };
  const dispatched = Array.from({ length: 12 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } }));
  const parked = Array.from({ length: 12 }, () => ({ ok: g5Snap }));
  const reads = (body: unknown) => Array.from({ length: 12 }, () => ({ ok: body }));

  for (const [name, body] of [['null', null], ['empty', {}], ['without a watermark', { pending_gate_ref: null }], ['malformed', { incarnation: INC, seq: 'x', pending_gate_ref: 5 }],
    // Bodies that pass a coarse shape check but are not a snapshot the reducer evaluates whole
    ['a gate ref without its gate', { incarnation: INC, seq: 3, pending_gate_ref: ref }],
    ['a negative seq', { incarnation: INC, seq: -1, pending_gate_ref: null }],
    ['a bad incarnation', { incarnation: 'bad inc', seq: 3, pending_gate_ref: null }],
    ['an empty gate ref', { incarnation: INC, seq: 3, pending_gate_ref: {}, pending_gate: { type: 'confirm' } }],
    ['a gate of an unknown type', { incarnation: INC, seq: 3, pending_gate_ref: ref, pending_gate: { type: 'other' } }],
    ['a falsy gate ref', { incarnation: INC, seq: 3, pending_gate_ref: 0 }]] as const) {
    it(`a ${name} /state body after a reload keeps the stored decision; the original gate appearing again takes no second decision`, async () => {
      const first = await started({ confirm: [{ err: { status: 502, pending: true } }] });
      ask(first.io);
      expect(first.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
      await settle();
      pageGone(first);
      const { io, run, snap } = reloaded(first.store, { receipt: dispatched, state: reads(body) });
      run.check();
      await settle();
      expect(first.store.meta(), 'the decision was erased by a read that proves nothing').toMatchObject({ d: { gate: 'gate-5', gen: 1, kind: 'confirm' } });
      ask(io);
      await settle();
      expect(snap().deciding).toBe(true);
      expect(run.decide('deny', { id: 'gate-5', generation: 1 })).toBe(false);
      expect(io.of('confirm'), 'a second decision was sent').toHaveLength(0);
    });
  }
  it('a validated snapshot that shows the gate gone settles the stored decision (closure evidence)', async () => {
    const first = await started({ confirm: [{ err: { status: 502, pending: true } }] });
    ask(first.io);
    first.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    pageGone(first);
    const { run, snap } = reloaded(first.store, { receipt: dispatched, state: reads({ incarnation: INC, seq: 3, pending_gate_ref: null }) });
    run.check();
    await settle();
    expect(first.store.meta()?.d, 'a snapshot with a watermark and no gate closes the decision').toBeUndefined();
    expect(snap().deciding).toBe(false);
  });
  it('a decision refused at the held door after its save landed never left: its marker goes at once, the same parked gate can be decided again', async () => {
    const s = await started({ confirm: ['hold'], state: parked, receipt: dispatched });
    ask(s.io);
    s.store.o.badVersion = true;
    expect(s.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
    await settle();
    s.store.o.badVersion = false;
    expect(s.io.of('confirm'), 'nothing left').toHaveLength(0);
    expect(s.store.meta()?.d, 'the marker of a request that never left stayed').toBeUndefined();
    await settle();
    expect(s.snap().gate).toMatchObject({ id: 'gate-5' });
    expect(s.snap().deciding, 'the gate stayed blocked').toBe(false);
    expect(s.run.decide('once', { id: 'gate-5', generation: 1 })).toBe(true);
  });
});

describe('the lease schedules with an admission refusal and with answered requests', () => {
  const ref = { id: 'gate-5', generation: 1, type: 'confirm' };
  const ask = (io: ReturnType<typeof scripted>) => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false }, { gate: ref });
  const g5Snap = { incarnation: INC, seq: 1, pending_gate_ref: ref, pending_gate: { type: 'confirm', tool_name: 'bash' } };
  const dispatched = Array.from({ length: 12 }, () => ({ ok: { turn_id: 't1', state: 'dispatched' } }));
  const parked = Array.from({ length: 12 }, () => ({ ok: g5Snap }));

  it('a Stop whose sending save LANDED but whose admission is refused is not sent; the claimed decision keeps the stamp', async () => {
    const s = await started({ confirm: ['hold'] });
    ask(s.io);
    s.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    const before = s.store.saves.length;
    s.store.o.badVersion = true;
    s.run.stop();
    await settle();
    s.store.o.badVersion = false;
    expect(s.store.saves.slice(before).filter((x) => x.sending && x.k4), 'the Stop\'s sending save landed (once)').toHaveLength(1);
    expect(s.io.of('stop'), 'a refused admission left').toHaveLength(0);
    expect(s.store.rows.get('h1')!.sending, 'the refused admission ended the decision\'s stamp').toBe(true);
    s.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(false);
  });
  it('the queued Stop save is identified by its key and lands exactly once, after the run ended', async () => {
    const s = await started({ confirm: ['hold'] });
    ask(s.io);
    s.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    const before = s.store.saves.length;
    let open!: () => void;
    s.store.o.gate = new Promise<void>((r) => { open = r; });
    s.run.stop();
    await settle();
    s.run.end();
    s.store.o.gate = null;
    open();
    await settle();
    const added = s.store.saves.slice(before);
    expect(added, 'exactly one save landed after the gate opened: the Stop\'s').toHaveLength(1);
    expect(added[0], 'it carries the Stop\'s key and stamps the send').toMatchObject({ sending: true, k4: expect.any(String) });
    expect(s.io.of('stop')).toHaveLength(0);
    expect(s.store.rows.get('h1')!.sending).toBe(true);
    s.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(s.store.rows.get('h1')!.sending).toBe(false);
  });
  it('a RESUMED second instance whose Stop save landed but whose held admission is refused sends nothing and leaves the first instance\'s decision its stamp', async () => {
    const first = await started({ confirm: ['hold'] });
    ask(first.io);
    first.run.decide('once', { id: 'gate-5', generation: 1 });
    await settle();
    first.run.end();
    const row = heldAttempts().find((h) => h.by === BY)!;
    const real = heldHandle(row.id, row.metaVersion)!;
    let bad = false;
    const landed: boolean[] = [];
    // R2's real handle (and so its real shared lease), offering a version that is not the stored one once `bad` is set: the held door refuses its admission.
    const hold: typeof real = { id: real.id, key: real.key, version: () => (bad ? real.version() + 1000 : real.version()), lease: () => real.lease(), save: (meta, sending) => real.save(meta, sending).then((ok) => { if (sending && ok) landed.push(ok); return ok; }), release: () => real.release(), dismiss: (shown) => real.dismiss(shown) };
    const sIo = scripted({ stop: ['hold'], receipt: dispatched, state: parked });
    const second = GitHubRun.resume(sIo.io, { computer: 'c1', account: ACCT, realm: 'all', admit: first.store.admit }, { hold, meta: JSON.parse(JSON.stringify(row.meta)) }, manual().clock)!;
    second.check();
    await settle();
    bad = true;
    expect(second.stop()).toBe(true);
    await settle();
    expect(landed, 'the Stop\'s sending save landed (once)').toHaveLength(1);
    expect(sIo.of('stop'), 'a refused admission left').toHaveLength(0);
    expect(first.store.rows.get('h1')!.sending, 'the resumed instance\'s refused admission ended the first instance\'s stamp').toBe(true);
    bad = false;
    first.io.held[0]!.rej({ status: 0 });
    await settle();
    expect(first.store.rows.get('h1')!.sending, 'the decision settled: the stamp ends').toBe(false);
  });
  for (const stopFirst of [true, false]) {
    it(`a second instance's Stop is answered while the first instance's decision is out; ${stopFirst ? 'the Stop' : 'the decision'} settles first`, async () => {
      const first = await started({ confirm: ['hold'] });
      ask(first.io);
      first.run.decide('once', { id: 'gate-5', generation: 1 });
      await settle();
      first.run.end();
      const row = heldAttempts().find((h) => h.by === BY)!;
      const sIo = scripted({ stop: ['hold'], receipt: dispatched, state: parked });
      const second = GitHubRun.resume(sIo.io, { computer: 'c1', account: ACCT, realm: 'all', admit: first.store.admit }, { hold: heldHandle(row.id, row.metaVersion)!, meta: JSON.parse(JSON.stringify(row.meta)) }, manual().clock)!;
      second.check();
      await settle();
      expect(second.stop()).toBe(true);
      await settle();
      expect(sIo.held, 'the second instance\'s Stop is out').toHaveLength(1);
      expect(first.store.rows.get('h1')!.sending).toBe(true);
      const stopDone = () => sIo.held[0]!.res({ command_id: 'cmd9', kind: 'stop', state: 'committed', stopped: [{ kind: 'session', id: 'sess-1', outcome: 'stopped' }] });
      const decisionDone = () => first.io.held[0]!.rej({ status: 0 });
      (stopFirst ? stopDone : decisionDone)();
      await settle();
      expect(first.store.rows.get('h1')!.sending, 'the other send is still out').toBe(true);
      (stopFirst ? decisionDone : stopDone)();
      await settle();
      expect(first.store.rows.get('h1')!.sending).toBe(false);
    });
  }
});
