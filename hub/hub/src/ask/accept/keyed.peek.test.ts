// Journal.peekTurn is a READ by key. Whatever the agent answers, it settles nothing, retires nothing, admits nothing, writes no
// store and fences no key; the same read can be repeated. Its verdict is `settled` only for a turn the agent holds under the key.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { ACCOUNT, HANDLE, REALM, showAccount, storedEntries, world, type World } from './env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });
const flush = (n = 900) => w!.flush(n);
const text = (t: string) => [{ k: 'text' as const, text: t }];
const names = () => w!.agent.log.map((x) => x[0]);
/** Everything the agent saw and everything stored: a peek must leave both as they were (but for its own one read). */
const state = () => ({ stored: JSON.stringify([...Array(w!.fs.length).keys()].map((i) => [w!.fs.key(i), w!.fs.peek(w!.fs.key(i)!)])), entries: JSON.stringify(storedEntries(w!.fs)) });

async function lostSecond() {
  w = world({ script: [text('First.'), text('Second.')] });
  const a = await w.dock();
  a.send('One');
  await flush(2000);
  const real = (w.agent as any).turn.bind(w.agent);
  let done = false;
  (w.agent as any).turn = (...x: unknown[]) => { if (done) return real(...x); done = true; return real(...x).then(() => Promise.reject({ status: 502, pending: true })); };
  a.send('Two');
  await flush(300);
  return { k2: a.record!.k2, sid: a.record!.s as string, a };
}

describe('Journal.peekTurn', () => {
  it('a HIT is settled with the turn, and nothing else happens: no retire, no send, no store write, repeatable', async () => {
    const { k2, sid } = await lostSecond();
    const before = state();
    const sent = names().length;
    const v1 = await w!.j.peekTurn((w!.agent as any), HANDLE, sid, REALM, k2);
    const v2 = await w!.j.peekTurn((w!.agent as any), HANDLE, sid, REALM, k2);
    expect(v1).toMatchObject({ t: 'settled', route: 'turn', k: k2 });
    expect((v1.body as any).turn_id).toBe((w!.agent as any).session(sid).keys.get(k2).turn_id);
    expect(v2.t).toBe('settled');
    expect(names().slice(sent), 'two reads by key and nothing else').toEqual(['turnByKey', 'turnByKey']);
    expect(state(), 'no store changed').toEqual(before);
    expect((w!.agent as any).session(sid).fenced.has(k2), 'the key is not fenced').toBe(false);
  });

  it('a MISS is not settled, retires nothing and leaves the key free to be sent', async () => {
    w = world({ script: [text('First.')] });
    const a = await w.dock();
    a.send('One');
    await flush(2000);
    const sid = a.record!.s as string;
    const key = 'hx-' + 'd'.repeat(32);
    const before = state();
    const sent = names().length;
    const v = await w.j.peekTurn(w.agent as any, HANDLE, sid, REALM, key);
    expect(v.t).toBe('unknown');
    expect(v.why).toBe('miss');
    expect(names().slice(sent)).toEqual(['turnByKey']);
    expect(state()).toEqual(before);
    expect((w.agent as any).session(sid).fenced.has(key), 'a miss fenced nothing').toBe(false);
  });

  it('a failed read is unknown (readFailed), never a miss', async () => {
    w = world({ script: [text('First.')] });
    const a = await w.dock();
    a.send('One');
    await flush(2000);
    (w.agent as any).turnByKey = () => Promise.reject({ status: 500 });
    const v = await w.j.peekTurn(w.agent as any, HANDLE, a.record!.s as string, REALM, 'hx-' + 'e'.repeat(32));
    expect(v).toMatchObject({ t: 'unknown', why: 'readFailed' });
  });

  it('an account that moved while the read was out describes another account\'s page: unknown (account), nothing adopted', async () => {
    const { k2, sid } = await lostSecond();
    const real = (w!.agent as any).turnByKey.bind(w!.agent);
    (w!.agent as any).turnByKey = (...x: unknown[]) => { showAccount('other-' + ACCOUNT); return real(...x); };
    const v = await w!.j.peekTurn(w!.agent as any, HANDLE, sid, REALM, k2);
    expect(v).toMatchObject({ t: 'unknown', why: 'account' });
  });
});
