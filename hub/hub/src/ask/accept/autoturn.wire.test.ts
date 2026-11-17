// "Auto-approve this reply" leaves liveIO as ?policy=auto_approve on the turn's POST (never in the body),
// beside the one journal ticket; a turn without it carries no query.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { boot, calls, onFetch, settle, TARGET, UID, R1 } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { liveIO } from '../data';
import { Journal, SendToken, guardIO, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';

const K = (c: string, n = 32) => 'hx-' + c.repeat(n);

async function postTurn(policy?: 'auto_approve') {
  resetPageForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  onFetch(() => ({ status: 200, body: { session_id: 's1', turn_id: 't1', state: 'accepted' } }));
  const j = new Journal();
  const g = guardIO(liveIO(TARGET), { acct: UID, container: TARGET.container.id }) as any;
  const k = j.mint('turn')!;
  const a = j.admit({ acct: UID, container: TARGET.container.id, h: 'atlas.tlas', r: R1, route: 'turn', key: k, sid: 's1', c: K('1'), files: false } as Op, new SendToken()) as any;
  const before = calls.length;
  const out = await j.post(a, (t) => g.turn('s1', 'hi', k, R1, undefined, policy, [t]));
  await settle(5);
  expect(out).toMatchObject({ kind: 'sent' });
  const sent = calls.slice(before).filter((c) => c.method === 'POST');
  expect(sent).toHaveLength(1);
  return { call: sent[0]!, key: k };
}

describe('Auto-approve this reply on the wire', () => {
  it('the policy is a query on the turn POST, under the same key, and never in the body', async () => {
    const { call, key } = await postTurn('auto_approve');
    const url = new URL(call.url, 'https://x.invalid');
    expect(url.pathname.endsWith('/sessions/s1/turns')).toBe(true);
    expect(url.searchParams.getAll('policy')).toEqual(['auto_approve']);
    expect(call.headers['Idempotency-Key'] ?? call.headers['idempotency-key']).toBe(key);
    expect(typeof call.body === 'string' ? JSON.parse(call.body) : call.body).toEqual({ text: 'hi' });
  });
  it('a turn without it carries no policy at all', async () => {
    const { call } = await postTurn();
    expect(new URL(call.url, 'https://x.invalid').searchParams.has('policy')).toBe(false);
  });
});
