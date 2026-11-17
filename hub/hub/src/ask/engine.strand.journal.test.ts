// A journaled engine settles a stranded row (engine.ts strand) as Not sent only on proof: the key was
// minted by this page's journal and never admitted, and the entries, read for the engine's account, hold nothing of it. Anything else
// (a corrupt request store, a settled entry already removed, a malformed entry, another account shown, a key this page did not mint)
// reads unknown, never Not sent. Real journal over the fake storage.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { ACCOUNT, HANDLE, KEY, OTHER, REALM, showAccount, slot, world, type World } from './accept/env';
import { mintForTests, seedEntryForTests } from './journal/testing';
import { REQ_KEY } from './journal/storage';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const row = (eng: any, id: string) => eng.conv.users[id] as C.UserMsg | undefined;
function inject(eng: any, o: Partial<C.UserMsg> & { id: string; via: C.UserMsg['via'] }): void {
  const u = { text: '', at: 0, key: KEY('9'), state: 'sending', turnId: null, commandId: null, reason: '', ...o } as C.UserMsg;
  eng.conv = C.addUser(eng.conv, u);
}
/** A dock whose first turn has finished (the record holds its session), and another tab's turn entry for key K in this chat. */
async function chatWithOtherTabsKey(k: string, kind: 'turn' | 'message' = 'turn') {
  w = world();
  const eng: any = await w.dock();
  expect(eng.send('Build me a small dashboard')).toBe(true);
  await w.flush(3000);
  const rec = eng.rec;
  expect(rec?.s).toBeTruthy();
  expect(seedEntryForTests(w.j, { k, kind, h: HANDLE, r: REALM, s: rec.s, c: rec.k1, ct: slot.computer, at: 1 })).toBe('ok');
  return { eng, rec, w };
}

describe('a stranded row on a journaled engine', () => {
  it('readable entries holding the key (another tab sent it): unknown', async () => {
    const { eng } = await chatWithOtherTabsKey(KEY('a'));
    inject(eng, { id: 'uX', via: 'turn', key: KEY('a') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('a key this page minted and never admitted, readable entries holding nothing of it: Not sent', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('a'));
    mintForTests(x.j, KEY('b'));
    inject(eng, { id: 'uX', via: 'turn', key: KEY('b') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'notSent', reason: 'ask.startNotSent' });
  });
  it('turn: the entries cannot be read (corrupt request store), so the other tab\'s send is not seen: unknown, never Not sent', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('a'));
    x.fs.seed(REQ_KEY, '{not json');
    inject(eng, { id: 'uX', via: 'turn', key: KEY('a') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('turn: a key this page minted and never admitted, but the entries cannot be read: still unknown', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('a'));
    mintForTests(x.j, KEY('c'));
    x.fs.seed(REQ_KEY, '{not json');
    inject(eng, { id: 'uX', via: 'turn', key: KEY('c') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('follow-up: the entries cannot be read: unknown, never Not sent', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('d'), 'message');
    x.fs.seed(REQ_KEY, '{not json');
    inject(eng, { id: 'uX', via: 'command', key: KEY('d') });
    eng.command('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('a request that left and was settled (its entry removed, readable store, no record evidence): unknown, never Not sent', async () => {
    const { eng } = await chatWithOtherTabsKey(KEY('a'));
    const k = eng.rec.k2 as string;                       // the first turn's key: it left, and its entry was settled away
    expect(w!.fs.peek(REQ_KEY) ?? '').not.toContain(k);
    inject(eng, { id: 'uX', via: 'turn', key: k });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('a malformed entry in a readable request store (skipped by the scan): unknown, never Not sent', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('a'));
    const raw = JSON.parse(x.fs.peek(REQ_KEY)!);
    const name = HANDLE + ':' + KEY('a');
    expect(raw.a[ACCOUNT][name]).toBeTruthy();
    raw.a[ACCOUNT][name] = { k: KEY('a'), kind: 'nonsense' };
    x.fs.seed(REQ_KEY, JSON.stringify(raw));
    inject(eng, { id: 'uX', via: 'turn', key: KEY('a') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
  it('another account shown (the old engine not yet ended), with a key it minted: unknown, never Not sent', async () => {
    const { eng, w: x } = await chatWithOtherTabsKey(KEY('a'));
    mintForTests(x.j, KEY('e'));
    showAccount(OTHER);
    inject(eng, { id: 'uX', via: 'turn', key: KEY('e') });
    eng.dispatch('uX');
    expect(row(eng, 'uX')).toMatchObject({ state: 'unknown', reason: '' });
  });
});
