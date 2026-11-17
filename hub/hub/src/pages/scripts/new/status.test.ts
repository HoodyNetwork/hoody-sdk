// Vitest (C9): what a stored build of one attempt reads as. Only an ended, completed turn with a readable reply
// is ready (or no_script); a running turn is running; a turn that ended otherwise is failed with its code. Anything that cannot
// be read (store, receipt, reply, an ask whose turn never started) is unknown, never failed or ready.
import { putScriptAsk, readScriptAsks, dropScriptAsks, type ScriptAsk } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStatus, storedBuildReads, type Binding } from '../data';
import { askIdOf, attemptPath, type Receipt } from '../writer';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const ID = 'statusdraf';
const text = (t: string) => ({ kind: 'text', text: t });
const ANSWER = 'Summary: it works\n```ts\nreturn 1;\n```';
const tr = (final: string) => ({ turns_total: 1, messages: [{ role: 'user', blocks: [text('every monday')] }, { role: 'assistant', blocks: [text(final)] }] });
const ask = (o: Partial<ScriptAsk> = {}) => {
  const p = { compId: TARGET.container.id, path: attemptPath(TARGET.project.id, ID, 1), realm: R1, owner: 'fp1' };
  const a: ScriptAsk = { askId: askIdOf(p), ...p, sessionId: 's1', turnId: 't1', phase: 'read', sentAt: 1, createKey: 'ck', turnKey: 'tk', ...o };
  return putScriptAsk(a, null);
};
const receipt = (r: Receipt | null | 'unreadable') => vi.spyOn(storedBuildReads, 'receipt').mockResolvedValue(r);
const transcript = (t: unknown) => vi.spyOn(storedBuildReads, 'transcript').mockResolvedValue(t);
const R = (state: string, ended: boolean, code = state): Receipt => ({ turnId: 't1', state, ended, code });

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => {
  vi.restoreAllMocks();
  const a = readScriptAsks();
  if (Array.isArray(a)) await dropScriptAsks(a);
});

describe('buildStatus', () => {
  it('no stored ask: none (nothing is read)', async () => {
    const r = receipt(null);
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'none' });
    expect(r).not.toHaveBeenCalled();
  });

  it('an ask whose turn never started: unknown, not failed', async () => {
    await ask({ turnId: null, phase: 'turn' });
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'not_started' });
  });

  it('a receipt that cannot be read, or none: unknown', async () => {
    await ask();
    receipt('unreadable');
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'receipt' });
    receipt(null);
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'receipt' });
  });

  it('a turn not ended: running', async () => {
    await ask();
    receipt(R('dispatched', false));
    const t = transcript(tr(ANSWER));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'running' });
    expect(t).not.toHaveBeenCalled();
  });

  it('a receipt state this page does not know is not running: unknown', async () => {
    await ask();
    receipt(R('paused_forever', false));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'receipt' });
    receipt(R('accepted', false));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'running' });
  });

  it('a turn that ended other than completed: failed with its code', async () => {
    await ask();
    receipt(R('failed', true, 'max_steps'));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'failed', code: 'max_steps' });
  });

  it('completed with a script: ready, with the person\'s prompt', async () => {
    await ask();
    receipt(R('completed', true));
    transcript(tr(ANSWER));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'ready', reply: ANSWER, prompt: 'every monday' });
  });

  it('completed without a script: no_script', async () => {
    await ask();
    receipt(R('completed', true));
    transcript(tr('I could not write that.'));
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'no_script', prompt: 'every monday' });
  });

  it('completed but the transcript cannot be read (or holds only a mid-turn tail): unknown', async () => {
    await ask();
    receipt(R('completed', true));
    transcript('unreadable');
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'reply' });
    transcript({ ...tr(ANSWER), turns_total: 0 });
    expect(await buildStatus(B, ID, 1)).toEqual({ kind: 'unknown', why: 'reply' });
  });

  it('another attempt number reads its own place: none', async () => {
    await ask();
    receipt(R('completed', true));
    expect(await buildStatus(B, ID, 2)).toEqual({ kind: 'none' });
  });
});
