// Vitest (New script): real exec and agent error envelopes go through api() (the
// write and instantiate routes are secret, so core rebuilds a refusal from safe fields and keeps a code only when the
// route lists it), and what reaches the page becomes the page's words. A may-have-gone-through code is pending with its
// hold kept, never a refusal; a 400 without a code is neutral; a create never says "while you were editing".
import { CoreQueryProvider, queryClient } from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeT } from '@kit';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';
import { useInstantiate, useWrite } from '../data';
import strings from '../strings.en.json';
import { liveError, promoteAfterUnknown, type LiveInput } from './liveErrors';

const t = makeT(strings);
const AT = { computer: 'atlas', route: '/probe' };
// exec's envelope (openapi errorEnvelopeSchema): { error, code, timestamp, details }; the agent's: { code, message, details }.
const exec = (status: number, code?: string, details?: unknown): Reply => ({ status, body: { error: 'refused [x]', ...(code ? { code } : {}), timestamp: '2026-10-28T01:00:00Z', ...(details ? { details } : {}) } });
const agent = (status: number, code: string): Reply => ({ status, body: { code, message: 'refused [x]', details: { path: 'default/1/probe.ts' } } });

let answer: Reply = { status: 200, body: { data: {} } };
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  onFetch((c: Call): Reply => (c.url.includes('/exec/scripts/write') || c.url.includes('/script-templates/') ? answer : { status: 200, body: { data: {} } }));
  setTarget(TARGET);
});

type Got = { outcome: string; code?: string; hold?: unknown };
async function sendWrite(reply: Reply): Promise<Got> {
  answer = reply;
  const { result } = renderHook(() => useWrite(), { wrapper: CoreQueryProvider });
  let r: Got | undefined;
  await act(async () => {
    r = (await result.current.mutateAsync({ compId: TARGET.container.id, path: 'default/1/probe.ts', content: 'export default 1;\n', ifRevision: null, opId: `op-s2-${calls.length}-0001`, expectRoute: { route: '/probe', answeredBy: 'default/1/probe.ts' } })) as Got;
    for (let i = 0; i < 20; i++) await settle();
  });
  expect(calls.filter((c) => c.url.includes('/exec/scripts/write'))).toHaveLength(1);
  calls.length = 0;
  return r!;
}
async function sendIdea(reply: Reply): Promise<Got> {
  answer = reply;
  const { result } = renderHook(() => useInstantiate(), { wrapper: CoreQueryProvider });
  let r: Got | undefined;
  await act(async () => {
    r = (await result.current.mutateAsync({ compId: TARGET.container.id, realm: R1, name: 'hello', path: 'default/1/probe.ts', vars: {}, callerKey: 'ck_secret_0001' })) as Got;
    for (let i = 0; i < 20; i++) await settle();
  });
  expect(calls.filter((c) => c.url.includes('/script-templates/hello/instantiate'))).toHaveLength(1);
  calls.length = 0;
  return r!;
}
const words = (x: Omit<LiveInput, 'computer' | 'route'>) => {
  const e = liveError({ ...AT, ...x });
  const w = (k: { key: string; vars?: Record<string, string | number> }) => t(k.key as never, k.vars);
  return { tone: e.tone, title: w(e.title), body: w(e.body), extra: e.extra ? w(e.extra) : undefined, actions: e.actions };
};
const asInput = (r: Got) => ({ kind: r.outcome as 'failed' | 'pending' | 'not_sent', code: r.code ?? null });
const editWords = [strings['err.REVISION_MISMATCH'], strings['err.BAD_REVISION']];

describe('write (exec) envelopes through api() become the create\'s words', () => {
  it('409 ROUTE_EFFECT_CHANGED with details keeps only its code; the words say the address would not reach it, plus the fresh read', async () => {
    const r = await sendWrite(exec(409, 'ROUTE_EFFECT_CHANGED', { route: '/probe', expected: 'default/1/probe.ts', answeredBy: 'default/1/other.ts' }));
    expect(r).toMatchObject({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' });
    expect(JSON.stringify(r)).not.toContain('[x]');
    expect(JSON.stringify(r)).not.toContain('other.ts');
    expect(words({ via: 'write', ...asInput(r), fresh: { name: 'other.ts' } })).toMatchObject({ tone: 'refused', title: strings['live.route.title'], extra: 'Currently answered by other.ts.', actions: ['changeAddress', 'tryAgain'] });
    expect(words({ via: 'write', ...asInput(r), fresh: null }).extra).toBe('Currently nothing answers /probe.');
    expect(words({ via: 'write', ...asInput(r) }).extra).toBeUndefined();
  });
  for (const code of ['OP_IN_PROGRESS', 'OP_OUTCOME_UNKNOWN']) {
    it(`409 ${code} is pending with its hold kept: "it may have been made", Check again, never refused`, async () => {
      const r = await sendWrite(exec(409, code, { opId: 'op-1' }));
      expect(r.outcome).toBe('pending');
      expect(r.hold).toBeTruthy();
      const w = words({ via: 'write', ...asInput(r) });
      expect(w).toMatchObject({ tone: 'unknown', title: strings['live.unknown.title'], actions: ['checkAgain'] });
      expect(w.body).toBe("atlas didn't confirm. Don't send it again: Check again reads atlas and shows what happened.");
    });
  }
  it('a 5xx after the send is pending too', async () => {
    const r = await sendWrite(exec(503, 'RECEIPT_UNAVAILABLE'));
    expect(r.outcome).toBe('pending');
    expect(words({ via: 'write', ...asInput(r) }).tone).toBe('unknown');
  });
  it('400 without a code is neutral: refused, nothing changed, Check the code again; never "the code has problems"', async () => {
    const r = await sendWrite(exec(400));
    expect(r.outcome).toBe('failed');
    expect(r.code ?? null).toBeNull();
    const w = words({ via: 'write', ...asInput(r) });
    expect(w).toMatchObject({ tone: 'refused', title: strings['live.notMade'], body: 'atlas refused it, so nothing was changed.', actions: ['checkCode', 'back'] });
    expect(`${w.title} ${w.body}`).not.toMatch(/problem/i);
  });
  it('409 REVISION_MISMATCH on a create: the address was just taken, never "changed while you were editing"', async () => {
    const r = await sendWrite(exec(409, 'REVISION_MISMATCH'));
    expect(r).toMatchObject({ outcome: 'failed', code: 'REVISION_MISMATCH' });
    const w = words({ via: 'write', ...asInput(r) });
    expect(w).toMatchObject({ title: strings['live.taken.title'], body: 'A script was saved at /probe on atlas after you checked it, so nothing was changed. Pick another address.' });
    for (const e of editWords) expect(w.body).not.toBe(e);
  });
  it('400 INVALID_REVISION reaches the page by its code and reads as a plain refusal (BAD_REVISION is gone from the route)', async () => {
    const r = await sendWrite(exec(400, 'INVALID_REVISION'));
    expect(r).toMatchObject({ outcome: 'failed', code: 'INVALID_REVISION' });
    expect(words({ via: 'write', ...asInput(r) })).toMatchObject({ tone: 'refused', body: 'atlas refused it, so nothing was changed.', actions: ['back'] });
    const bad = await sendWrite(exec(409, 'BAD_REVISION'));
    expect(bad.code ?? null).toBeNull();
  });
  it('409 OP_FENCED: settled as never received, you can make it live again', async () => {
    const r = await sendWrite(exec(409, 'OP_FENCED', { opId: 'op-1' }));
    expect(r).toMatchObject({ outcome: 'failed', code: 'OP_FENCED' });
    expect(words({ via: 'write', ...asInput(r) })).toMatchObject({ body: 'atlas settled this as never received, so nothing was changed. You can make it live again.', actions: ['makeLive'] });
  });
  it('400 UNROUTABLE_PATH: this address cannot be used', async () => {
    const r = await sendWrite(exec(400, 'UNROUTABLE_PATH', { allowed: 'A-Z a-z 0-9 - _ . /' }));
    expect(r).toMatchObject({ outcome: 'failed', code: 'UNROUTABLE_PATH' });
    expect(words({ via: 'write', ...asInput(r) }).title).toBe(strings['live.unroutable.title']);
  });
});

describe('instantiate (agent) envelopes through api() become the idea\'s words', () => {
  it('409 script_exists on a first send: the address is taken', async () => {
    const r = await sendIdea(agent(409, 'script_exists'));
    expect(r).toMatchObject({ outcome: 'failed', code: 'script_exists' });
    expect(JSON.stringify(r)).not.toContain('ck_secret');
    expect(words({ via: 'idea', ...asInput(r) })).toMatchObject({ tone: 'refused', title: strings['live.exists.title'], actions: ['changeAddress'] });
  });
  it('script_exists after an unknown first send is promoted to pending (it may be that send\'s own effect): unknown words, Check again, never "taken"', async () => {
    const r = promoteAfterUnknown(await sendIdea(agent(409, 'script_exists')), true);
    expect(r).toMatchObject({ outcome: 'pending', code: 'script_exists' });
    const w = words({ via: 'idea', ...asInput(r), afterUnknown: true });
    expect(w).toMatchObject({ tone: 'unknown', title: strings['live.unknown.title'], actions: ['checkAgain', 'openScripts'] });
    expect(w.body).toBe("An earlier try may have made /probe on atlas. Don't send it again: Check again reads atlas and shows whether it is there.");
    expect(w.title).not.toBe(strings['live.exists.title']);
    // A caller that did not promote still never reads it as "taken": the failed answer after an unknown is unknown too.
    const raw = words({ via: 'idea', kind: 'failed', code: 'script_exists', afterUnknown: true });
    expect(raw).toMatchObject({ tone: 'unknown', title: strings['live.unknown.title'], body: w.body });
  });
  it('promoteAfterUnknown changes nothing else: a first send, another code, or another outcome passes through', async () => {
    const first = await sendIdea(agent(409, 'script_exists'));
    expect(promoteAfterUnknown(first, false)).toBe(first);
    const reserved = await sendIdea(agent(409, 'path_reserved'));
    expect(promoteAfterUnknown(reserved, true)).toBe(reserved);
    const pend = { outcome: 'pending', code: 'script_exists' };
    expect(promoteAfterUnknown(pend, true)).toBe(pend);
  });
  it('409 path_reserved: the address is held', async () => {
    const r = await sendIdea(agent(409, 'path_reserved'));
    expect(r).toMatchObject({ outcome: 'failed', code: 'path_reserved' });
    expect(words({ via: 'idea', ...asInput(r) })).toMatchObject({ title: strings['live.reserved.title'], actions: ['changeAddress', 'tryAgain'] });
  });
  it('503 outcome_unknown is pending with its hold kept: it may have been made', async () => {
    const r = await sendIdea(agent(503, 'outcome_unknown'));
    expect(r.outcome).toBe('pending');
    expect(r.hold).toBeTruthy();
    expect(words({ via: 'idea', ...asInput(r) }).tone).toBe('unknown');
  });
  for (const code of ['template_needs_token', 'caller_key_unplaceable']) {
    it(`422 ${code}: this idea can't be made here right now`, async () => {
      const r = await sendIdea(agent(422, code));
      expect(r.code).toBe(code);
      expect(words({ via: 'idea', ...asInput(r) }).body).toBe(strings['live.ideaHere']);
    });
  }
});

describe('nothing sent', () => {
  it('not_sent says nothing was sent, try again', () => {
    expect(words({ via: 'write', kind: 'not_sent' })).toMatchObject({ tone: 'not_sent', body: strings['live.notSent'], actions: ['tryAgain'] });
  });
});
