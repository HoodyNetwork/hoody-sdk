// Vitest: an idea draft's Make it live that the agent refuses for its own sign-in state (409 not_logged_in / hoody_auth_expired,
// the agent's own login refusals). The agent answers these before it takes the request's Idempotency-Key, so this request made
// nothing: the refusal is shown as such and the reservation is stored didnt (never held, never freed), and Try again sends the same
// key once more. Any other refusal of the agent's stays held (deploy.idea.test.ts).
import { dropDraftRecord, readDraftRecords, type DraftRecord } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Binding, BoundSends } from '../data';
import strings from '../strings.en.json';
import { LOGIN_REFUSALS, deployInstantiate } from './deploy';
import { INSTANTIATE_CODES, liveError } from './liveErrors';
import { openRecord, readDraftRecord } from './records';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const ID = 'loginidea0';
type I = Awaited<ReturnType<BoundSends['instantiate']>>;
const sends = (answer: (n: number) => I) => {
  const sent: Array<Record<string, unknown>> = [];
  const s = {
    sent,
    write: async () => ({ outcome: 'not_sent' }) as never,
    clock: async () => 1_700_000_000_000,
    exists: async () => null,
    instantiate: async (v: Record<string, unknown>) => {
      sent.push(JSON.parse(JSON.stringify(v)) as Record<string, unknown>);
      return answer(sent.length);
    },
  };
  return s as unknown as Pick<BoundSends, 'write' | 'clock' | 'exists' | 'instantiate'> & { sent: typeof sent };
};
const go = (s: ReturnType<typeof sends>) =>
  deployInstantiate({ sends: s }, { draftId: ID, project: TARGET.project.id, compId: TARGET.container.id, exec: 1, name: 'cron-hello', path: 'default/1/hello.ts', vars: { WHO: 'x' } });
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const reset = async (): Promise<void> => {
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};

beforeEach(async () => { boot({ realm: R1 }); await openRecord(ID, 'idea', B); });
afterEach(reset);

describe('idea draft: the agent refuses for its own sign-in state', () => {
  it('the two codes are the route\'s listed codes (core keeps them on the secret route)', () => {
    expect([...LOGIN_REFUSALS].sort()).toEqual(['hoody_auth_expired', 'not_logged_in']);
    for (const code of LOGIN_REFUSALS) expect(INSTANTIATE_CODES as readonly string[]).toContain(code);
  });

  for (const code of ['not_logged_in', 'hoody_auth_expired']) {
    it(`${code}: shown as the refusal, the reservation stored didnt; Try again sends the same key once`, async () => {
      const s = sends((n) => (n === 1 ? { outcome: 'failed', code } : { outcome: 'done', data: { path: 'default/1/hello.ts' } }) as I);
      expect(await go(s)).toEqual({ outcome: 'failed', code });
      expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'instantiate', path: 'default/1/hello.ts', phase: 'didnt', opId: s.sent[0]?.idem } });
      expect(await go(s)).toEqual({ outcome: 'done', live: 'consumed' });
      expect(s.sent).toHaveLength(2);
      expect(s.sent[1]!.idem).toBe(s.sent[0]!.idem);
      expect(rec().state).toBe('consumed');
    });

    it(`${code} again on Try again: still didnt, same key`, async () => {
      const s = sends(() => ({ outcome: 'failed', code }) as I);
      expect(await go(s)).toEqual({ outcome: 'failed', code });
      expect(await go(s)).toEqual({ outcome: 'failed', code });
      expect(s.sent).toHaveLength(2);
      expect(s.sent[1]!.idem).toBe(s.sent[0]!.idem);
      expect(rec().deploy).toMatchObject({ phase: 'didnt', opId: s.sent[0]!.idem });
    });
  }

  it('an unknown answer after the sign-in refusal is held: nothing is sent again', async () => {
    const s = sends((n) => (n === 1 ? { outcome: 'failed', code: 'not_logged_in' } : { outcome: 'pending', code: 'UNKNOWN' }) as I);
    expect(await go(s)).toEqual({ outcome: 'failed', code: 'not_logged_in' });
    expect(await go(s)).toEqual({ outcome: 'pending', code: 'UNKNOWN' });
    expect(await go(s)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(s.sent).toHaveLength(2);
    expect(rec().deploy).toMatchObject({ phase: 'held' });
  });

  it('the words: not made, the agent is signed out, no action of their own; each key is in the strings', () => {
    const table = strings as Record<string, string | undefined>;
    for (const [code, key] of [['not_logged_in', 'live.agentSignedOut'], ['hoody_auth_expired', 'live.agentRejected']] as const) {
      const e = liveError({ via: 'idea', kind: 'failed', code, computer: 'atlas', route: '/hello' });
      expect(e).toMatchObject({ tone: 'refused', title: { key: 'live.notMade' }, body: { key, vars: { computer: 'atlas' } }, actions: [] });
      expect(table[key]).toContain('{{computer}}');
    }
    expect(table['flow.idea.signIn']).toContain('{{computer}}');
    expect(table['flow.idea.signInFirst']).toBeTruthy();
  });
});
