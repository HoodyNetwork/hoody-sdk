// Every held change on the AI page (an agent's model, the safety checker, Claude Code, an endpoint edit) goes through the
// page's api, which sends to the computer shown at each call. Its read-back and its Check again prove what was held for
// one computer, so they must read that computer or nothing: a switch while the write is out, or before Check again, must
// never read the computer shown next, whose own value could free this computer's hold without proof.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { heldAttempts, type HeldAttempt } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot, R1 } from '@core/test/env';
import type { Api } from './api';
import { checkChecker, checkerLock, sendChecker, type CheckerBody } from './checkerHold';
import { checkClaude, claudeLock, sendClaude, type ClaudeChange } from './claudeHold';
import { checkEdit, editLock, sendEdit, type HeldEdit } from './endpointEditHold';
import type { Saved } from './flows-endpoint';
import { checkHeld, modelLock, sendHeld, type ModelAt } from './modelHold';
import { shownComputer } from './shownGate';
import type { Settled } from './types';

const A = { project: { id: 'p1' }, container: { id: 'c1' } };
const B = { project: { id: 'p1' }, container: { id: 'c2' } };
/** Computer A as shownComputer() gives it: the computer every hold here belongs to. */
const ON_A = 'p1\nc1';
const AT: ModelAt = { project: 'p1', computer: 'c1', realm: R1 };
const GUARD = { realm: R1, realmSettings: true };
const GPT = 'openai/gpt-5';
const FREE = 'hoody-ai/hoody-free';
const EP = 'my-ep';
const BEFORE: Saved = { name: 'My endpoint', base_url: 'https://x.example/v1', models: ['m1'] };
const AFTER: Saved = { name: 'Renamed', base_url: 'https://x.example/v1', models: ['m1'] };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const endpoint = (name: string) =>
  ok({ provider: { id: EP, display_name: name, custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: `${EP}/m1` }] } });

/** One hold of the page: its write and read-back routes, a read that shows the change and one that does not yet. */
interface Hold {
  name: string;
  lock: () => string;
  write: keyof Api;
  read: keyof Api;
  shows: Settled<unknown>;
  notYet: Settled<unknown>;
  send: (api: Api) => Promise<{ state: string }>;
  /** Check again on `h` (the hold as core keeps it), from the computer `on` names; its state. */
  check: (api: Api, h: HeldAttempt, on: string) => Promise<string>;
}

const HOLDS: Hold[] = [
  {
    name: 'an agent model (Settings, Default model)',
    lock: () => modelLock(AT, 'helper')!,
    write: 'agentModel',
    read: 'agents',
    shows: ok({ agents: [{ name: 'helper', model: GPT }] }),
    notYet: ok({ agents: [{ name: 'helper', model: FREE }] }),
    send: (api) => sendHeld(api, AT, 'helper', GPT, false, { defaultAgent: '' }, { followsShown: true }),
    check: async (api, h, on) => (await checkHeld(api, AT, 'helper', { id: h.id, model: GPT, unknown: false, metaVersion: h.metaVersion, inFlight: false }, { on })).state,
  },
  {
    name: 'the safety checker',
    lock: () => checkerLock(AT)!,
    write: 'jevPut',
    read: 'jev',
    shows: ok({ effective: { enabled: true } }),
    notYet: ok({ effective: { enabled: false } }),
    send: (api) => sendChecker(api, AT, R1, GUARD, { enabled: true }),
    check: async (api, h, on) => (await checkChecker(api, R1, GUARD, { id: h.id, body: h.meta as CheckerBody, metaVersion: h.metaVersion, inFlight: false }, on)).state,
  },
  {
    name: 'Claude Code turned on',
    lock: () => claudeLock(AT)!,
    write: 'acpEnabled',
    read: 'acp',
    shows: ok({ report: { agents: [{ name: 'claude', enabled: true }] } }),
    notYet: ok({ report: { agents: [{ name: 'claude', enabled: false }] } }),
    send: (api) => sendClaude(api, AT, { kind: 'enabled', v: true }),
    check: async (api, h, on) => (await checkClaude(api, R1, { id: h.id, change: h.meta as ClaudeChange, metaVersion: h.metaVersion, inFlight: false }, on)).state,
  },
  {
    name: 'an endpoint edit',
    lock: () => editLock(AT, EP)!,
    write: 'customPatch',
    read: 'provider',
    shows: endpoint(AFTER.name),
    notYet: endpoint(BEFORE.name),
    send: (api) => sendEdit(api, AT, EP, BEFORE, AFTER),
    check: (api, h, on) => checkEdit(api, EP, { id: h.id, sent: h.meta as HeldEdit['sent'], metaVersion: h.metaVersion, inFlight: false }, on),
  },
];

/** The page's api as the tests drive it: the write answers only when the test says so; each read-back records the
 *  computer shown when it was sent and answers `f.answer`. Every other route answers lost. */
function fakeApi(h: Hold) {
  let answer: (r: Settled<unknown>) => void = () => undefined;
  const f = { writes: 0, reads: [] as string[], answer: lost };
  const calls = new Map<PropertyKey, () => Promise<Settled<unknown>>>([
    [h.write, () => {
      f.writes += 1;
      return new Promise<Settled<unknown>>((res) => { answer = res; });
    }],
    [h.read, () => {
      f.reads.push(shownComputer());
      return Promise.resolve(f.answer);
    }],
  ]);
  const api = new Proxy({} as Api, { get: (_t, k) => calls.get(k) ?? (() => Promise.resolve(lost)) });
  return { api, f, answerWrite: (r: Settled<unknown>) => answer(r) };
}

/** The hold `h` keeps in core, once its request has answered. */
function heldOf(h: Hold): HeldAttempt {
  const all = heldAttempts(h.lock());
  expect(all).toHaveLength(1);
  return all[0]!;
}

beforeEach(() => {
  boot({ realm: R1 });
  setTarget(A);
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('a held change reads back only the computer it was held for', () => {
  it.each(HOLDS)('$name: a switch while the write is out reads nothing back from the computer shown next, and the hold stays', async (h) => {
    const { api, f, answerWrite } = fakeApi(h);
    const send = h.send(api);
    await expect.poll(() => f.writes).toBe(1);
    // The person switches computer while the write is out; the computer shown next already has the same value.
    setTarget(B);
    f.answer = h.shows;
    answerWrite(lost);
    expect((await send).state).not.toBe('saved');
    expect(f.reads).toEqual([]);
    expect(heldAttempts(h.lock())).toHaveLength(1);
    expect(f.writes).toBe(1);
  });

  it.each(HOLDS)("$name: with no switch, the read-back reads the hold's own computer and a proof lets it go (control)", async (h) => {
    const { api, f, answerWrite } = fakeApi(h);
    f.answer = h.shows;
    const send = h.send(api);
    await expect.poll(() => f.writes).toBe(1);
    answerWrite(lost);
    expect((await send).state).toBe('saved');
    expect(f.reads).toEqual([ON_A]);
    expect(heldAttempts(h.lock())).toEqual([]);
  });

  it.each(HOLDS)('$name: Check again with another computer shown reads nothing and keeps the hold; on its own computer it reads and lets it go', async (h) => {
    const { api, f, answerWrite } = fakeApi(h);
    f.answer = h.notYet;
    const send = h.send(api);
    await expect.poll(() => f.writes).toBe(1);
    answerWrite(lost);
    expect((await send).state).toBe('not_confirmed');
    const held = heldOf(h);
    f.reads = [];
    f.answer = h.shows;
    // The page drew Check again for computer A; by the press, core shows B, which has the same value.
    setTarget(B);
    expect(await h.check(api, held, ON_A)).toBe('stale');
    expect(f.reads).toEqual([]);
    expect(heldAttempts(h.lock())).toHaveLength(1);
    // Back on A: the same Check again reads A and lets the hold go.
    setTarget(A);
    expect(await h.check(api, held, ON_A)).toBe('saved');
    expect(f.reads).toEqual([ON_A]);
    expect(heldAttempts(h.lock())).toEqual([]);
    expect(f.writes).toBe(1);
  });
});
