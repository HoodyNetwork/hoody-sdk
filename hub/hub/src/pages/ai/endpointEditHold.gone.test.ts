// A held endpoint edit whose endpoint the list no longer shows has no form to read it back (the form opens only from the
// endpoint's row). settleGoneEdits reads such a hold from its own computer and lets it go only on the agent's answer that
// the endpoint does not exist. Every other answer keeps it for the next list read, and nothing is ever sent.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { heldAttempts, holdAttempt } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import type { Api } from './api';
import { EDIT_HOLD_BY, editLock, sendEdit, settleGoneEdits, type EditAt } from './endpointEditHold';
import type { Saved } from './flows-endpoint';
import type { Outcome, Settled } from './types';

const AT: EditAt = { project: 'p1', computer: 'c1' };
/** The computer AT names, as shownComputer() gives it. */
const ON = 'p1\nc1';
const EP = 'my-ep';
const LOCK = () => editLock(AT, EP)!;
const BEFORE: Saved = { name: 'My endpoint', base_url: 'https://x.example/v1', models: ['m1'] };
const AFTER: Saved = { name: 'Renamed', base_url: 'https://x.example/v1', models: ['m1'] };
const refused = (kind: Outcome['kind'], status: number, code: string): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const lost = refused('pending', 502, '');
/** The agent's answer for an endpoint it does not have (its GET and its PATCH alike). */
const gone = refused('failed', 404, 'not_found');
const stillThere: Settled<unknown> = {
  ok: true,
  body: { provider: { id: EP, display_name: 'My endpoint', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: [{ spec: 'my-ep/m1' }] } },
};

let patches = 0;
let reads: string[] = [];
let patchAnswer: () => Promise<Settled<unknown>>;
let readAnswer: Settled<unknown>;
const api = {
  customPatch: () => {
    patches += 1;
    return patchAnswer();
  },
  provider: (pid: string) => {
    reads.push(pid);
    return Promise.resolve(readAnswer);
  },
} as unknown as Api;

/** An edit whose PATCH and read-back were both lost: held by core, its request answered (no longer out). */
async function heldEdit(): Promise<void> {
  readAnswer = lost;
  expect(await sendEdit(api, AT, EP, BEFORE, AFTER)).toEqual({ state: 'not_confirmed' });
  expect(heldAttempts(LOCK())).toHaveLength(1);
  expect(patches).toBe(1);
  reads = [];
}

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1' } });
  patches = 0;
  reads = [];
  patchAnswer = () => Promise.resolve(lost);
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('settleGoneEdits: a held edit whose endpoint the list no longer shows', () => {
  it("is read back once and let go on the agent's answer that the endpoint does not exist; nothing is sent", async () => {
    await heldEdit();
    readAnswer = gone;
    await settleGoneEdits([{ id: 'anthropic' }], api, ON);
    expect(reads).toEqual([EP]);
    expect(heldAttempts(LOCK())).toEqual([]);
    expect(patches).toBe(1);
  });

  it.each<[string, Settled<unknown>]>([
    ['the endpoint read back', stillThere],
    ['a lost read', lost],
    ['a 404 without the not_found code', refused('failed', 404, '')],
    ['another refusal', refused('failed', 403, 'forbidden')],
  ])('%s keeps it, and the next list read reads it again', async (_why, answer) => {
    await heldEdit();
    readAnswer = answer;
    await settleGoneEdits([], api, ON);
    expect(reads).toEqual([EP]);
    expect(heldAttempts(LOCK())).toHaveLength(1);
    await settleGoneEdits([], api, ON);
    expect(reads).toEqual([EP, EP]);
    expect(heldAttempts(LOCK())).toHaveLength(1);
    expect(patches).toBe(1);
  });

  it('a hold whose stored meta cannot be read goes too: what was sent does not matter once the endpoint is gone', async () => {
    const got = await holdAttempt(LOCK(), { by: EDIT_HOLD_BY, identity: { project: 'p1', computer: 'c1', endpoint: EP }, meta: { name: 'Renamed' } });
    if (!got.ok) throw new Error('the hold was refused');
    got.hold.sent();
    readAnswer = gone;
    await settleGoneEdits([], api, ON);
    expect(reads).toEqual([EP]);
    expect(heldAttempts(LOCK())).toEqual([]);
  });
});

describe('settleGoneEdits: what it leaves alone', () => {
  it('an endpoint the list still shows: its form is the reader, nothing is read', async () => {
    await heldEdit();
    readAnswer = gone;
    await settleGoneEdits([{ id: EP }], api, ON);
    expect(reads).toEqual([]);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('while its request may still be out nothing is read; once it is answered, the next pass reads it', async () => {
    readAnswer = lost;
    let answer: (r: Settled<unknown>) => void = () => undefined;
    patchAnswer = () => new Promise((res) => { answer = res; });
    const send = sendEdit(api, AT, EP, BEFORE, AFTER);
    await expect.poll(() => patches).toBe(1);
    await settleGoneEdits([], api, ON);
    expect(reads).toEqual([]);
    answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    reads = [];
    readAnswer = gone;
    await settleGoneEdits([], api, ON);
    expect(reads).toEqual([EP]);
    expect(heldAttempts(LOCK())).toEqual([]);
  });

  it('another computer shown: nothing is read from it, and the hold of this one stays', async () => {
    await heldEdit();
    readAnswer = gone;
    setTarget({ project: { id: 'p1' }, container: { id: 'c2' } });
    // The pass named this computer, but core shows another one now: its read is never sent.
    await settleGoneEdits([], api, ON);
    // A pass for the computer shown reads only that computer's holds.
    await settleGoneEdits([], api, 'p1\nc2');
    expect(reads).toEqual([]);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });
});
