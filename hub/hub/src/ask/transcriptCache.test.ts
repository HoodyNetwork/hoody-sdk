// transcriptCache.test.ts: the saved copy of a chat, over the real crypt store (memory vault, real WebCrypto)
// and a map for the rows: sealed per account and chat, only finished blocks, capped, purged, and never opened by another
// account's key.
import { beforeEach, describe, expect, it } from 'vitest';
import { setIdentity } from '@core/ctx';
import { memoryVault } from '@core/crypt/memory-vault';
import { cryptIdleForTests, cryptReady, forgetThisBrowser, openBlob, resetCryptForTests, sealBlob } from '@core/cryptStore';
import { runAuthPurge } from '@core/realm';
import { boot, OTHER, UID } from '@core/test/env';
import type { ConvBlock, ConvRef } from '@kit/agent/source';
import { CACHE_BYTES, CACHE_MAX, CACHE_SLOT, cacheBlocks, readCached, setCacheStoreForTests, setSealForTests, writeCached, type CacheRow, type CacheStore } from './transcriptCache';

function mapStore(): CacheStore & { rows: Map<string, CacheRow> } {
  const rows = new Map<string, CacheRow>();
  return {
    rows,
    get: async (id) => rows.get(id) ?? null,
    put: async (row) => { rows.set(row.id, row); },
    list: async () => [...rows.values()].map((r) => ({ id: r.id, uid: r.uid, at: r.at })),
    del: async (ids) => { for (const id of ids) rows.delete(id); },
    clear: async () => { rows.clear(); },
  };
}

const REF: ConvRef = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
const BLOCKS: ConvBlock[] = [
  { k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1, req: { id: 'r1' } as never, actions: [], files: [{ id: 'f1', kind: 'text', name: 'a.txt', url: 'blob:x' }] },
  { k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 's1', state: 'ok', verb: 'Run', summary: 'npm test' }] },
  { k: 'reply', key: 'r1', text: 'All green.', streaming: false, final: true, cost: null, at: 2 },
];
let store = mapStore();
const show = async (id: string | null) => { setIdentity(id === null ? null : { id, banned: false }); await cryptReady(); await cryptIdleForTests(); };

beforeEach(async () => {
  boot();
  resetCryptForTests(memoryVault(), { newPage: true });
  await cryptReady();
  await cryptIdleForTests();
  store = mapStore();
  setCacheStoreForTests(store);
});

describe('a copy written before the source hid keys in step words', () => {
  it('reads back with a key in a step\'s words or in why it failed hidden, the rest as written', async () => {
    const KEY = 'sk-live0123456789abcdef';
    await writeCached(REF, [
      { k: 'steps', key: 't1', label: '1 step', state: 'failed', rows: [{ id: 's1', state: 'failed', verb: 'Run', summary: `$ curl -H "x: ${KEY}" https://example.com`, note: `Error: key ${KEY} was refused` }] },
      { k: 'reply', key: 'r1', text: 'Checked.', streaming: false, final: true, cost: null, at: 2 },
    ], 1000);
    const got = await readCached(REF);
    const steps = got?.blocks.find((b) => b.k === 'steps') as Extract<ConvBlock, { k: 'steps' }> | undefined;
    expect(JSON.stringify(got?.blocks ?? null)).not.toContain(KEY);
    // What is around the key is shown as written.
    expect(steps?.rows[0]?.summary).toContain('https://example.com');
    expect(steps?.rows[0]?.summary).toContain('[hidden]');
    expect(steps?.rows[0]?.note).toContain('was refused');
    expect(steps?.rows[0]?.note).toContain('[hidden]');
    expect(steps?.label).toBe('1 step');
  });
});

describe('a saved copy', () => {
  it('reads back for the same account and chat, sealed: the row holds no transcript text', async () => {
    await writeCached(REF, BLOCKS, 1000);
    expect(store.rows.size).toBe(1);
    expect(JSON.stringify([...store.rows.values()])).not.toContain('checkout');
    const got = await readCached(REF);
    expect(got?.at).toBe(1000);
    expect(got?.blocks.map((b) => b.k)).toEqual(['user', 'steps', 'reply']);
    expect(await readCached({ ...REF, sid: 's-2' })).toBeNull();
  });

  it('keeps nothing that names a request, an action or a file\'s address, and no block still running or streaming', () => {
    const kept = cacheBlocks([
      ...BLOCKS,
      { k: 'reply', key: 'r2', text: 'Working', streaming: true, final: false, cost: null, at: null },
      { k: 'steps', key: 't2', label: '1 step', state: 'running', rows: [{ id: 's2', state: 'running', verb: 'Run' }] },
      { k: 'line', key: 'reach', text: "Can't reach", tone: 'bad' },
    ]);
    expect(kept.map((b) => b.key)).toEqual(['u1', 't1', 'r1']);
    expect(kept[0], 'no request, actions or file url').toEqual({ k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1, files: [{ id: 'f1', kind: 'text', name: 'a.txt' }] });
  });

  it('another account\'s key never opens it: the envelope reads null for OTHER, and OTHER sees no copy (the row goes)', async () => {
    const sealed = await sealBlob(CACHE_SLOT, 'chat', 'secret transcript');
    expect(sealed?.uid).toBe(UID);
    expect(await openBlob(UID, CACHE_SLOT, 'chat', sealed!.env)).toBe('secret transcript');
    expect(await openBlob(UID, CACHE_SLOT, 'another chat', sealed!.env), 'another chat\'s slot').toBeNull();
    await writeCached(REF, BLOCKS);
    await show(OTHER);
    expect(await openBlob(OTHER, CACHE_SLOT, 'chat', sealed!.env)).toBeNull();
    expect(await openBlob(UID, CACHE_SLOT, 'chat', sealed!.env), 'not the shown account').toBeNull();
    expect(await readCached(REF)).toBeNull();
    expect(store.rows.size, 'an account switch removes the other account\'s rows').toBe(0);
  });

  it('a copy over CACHE_BYTES is not kept, and the chat\'s earlier copy goes (never a cut one)', async () => {
    await writeCached(REF, BLOCKS);
    expect(store.rows.size).toBe(1);
    await writeCached(REF, [{ k: 'reply', key: 'big', text: 'x'.repeat(CACHE_BYTES), streaming: false, final: true, cost: null, at: 3 }]);
    expect(store.rows.size).toBe(0);
  });

  it('a message\'s note (Not sent, refused, not delivered) and its files\' facts read back with it; an image-only message is no empty bubble', async () => {
    const notes: ConvBlock[] = [
      { k: 'user', key: 'n1', text: 'Deploy it', at: 1, note: { text: 'Not sent', bad: true }, req: { id: 'r1' } as never, actions: [] },
      { k: 'user', key: 'n2', text: 'Stop that', at: 2, note: { text: 'Your agent did not take this message.' } },
      { k: 'user', key: 'n3', text: '', at: 3, note: { text: 'Reached your agent.' }, files: [{ id: 'f1', kind: 'image', name: 'shot.png', url: 'blob:x', meta: '12 KB' }] },
    ];
    expect(cacheBlocks(notes)).toEqual([
      { k: 'user', key: 'n1', text: 'Deploy it', at: 1, note: { text: 'Not sent', bad: true } },
      { k: 'user', key: 'n2', text: 'Stop that', at: 2, note: { text: 'Your agent did not take this message.' } },
      { k: 'user', key: 'n3', text: '', at: 3, note: { text: 'Reached your agent.' }, files: [{ id: 'f1', kind: 'image', name: 'shot.png', meta: '12 KB' }] },
    ]);
    await writeCached(REF, notes);
    const back = (await readCached(REF))?.blocks;
    expect(back).toEqual(cacheBlocks(notes));
  });
  it('a stored note or file of the wrong shape: the copy is not shown at all', async () => {
    const row = (await (async () => { await writeCached(REF, BLOCKS); return [...store.rows.values()][0]!; })());
    const bad = [{ k: 'user', key: 'u', text: 'x', at: 1, note: { text: 5 } }];
    const sealed = await sealBlob(CACHE_SLOT, JSON.stringify([REF.computer, REF.realm, REF.sid]), JSON.stringify({ v: 1, at: 1, blocks: bad }));
    store.rows.set(row.id, { ...row, env: sealed!.env });
    expect(await readCached(REF)).toBeNull();
    const badFile = [{ k: 'user', key: 'u', text: 'x', at: 1, files: [{ id: 'f', kind: 'exe', name: 'a' }] }];
    const sealed2 = await sealBlob(CACHE_SLOT, JSON.stringify([REF.computer, REF.realm, REF.sid]), JSON.stringify({ v: 1, at: 1, blocks: badFile }));
    store.rows.set(row.id, { ...row, env: sealed2!.env });
    expect(await readCached(REF)).toBeNull();
  });
  it('the byte cap is on UTF-8 bytes: a copy under CACHE_BYTES in UTF-16 units but over it in bytes is not kept', async () => {
    await writeCached(REF, BLOCKS);
    expect(store.rows.size).toBe(1);
    // '€' is 1 UTF-16 unit and 3 UTF-8 bytes: a third of the cap in units, the whole cap in bytes.
    await writeCached(REF, [{ k: 'reply', key: 'big', text: '€'.repeat(Math.ceil(CACHE_BYTES / 3)), streaming: false, final: true, cost: null, at: 3 }]);
    expect(store.rows.size).toBe(0);
  });
  it('an earlier finished part of a turn (final false, not streaming) is kept with the rest', async () => {
    const parts: ConvBlock[] = [...BLOCKS.slice(0, 2), { k: 'reply', key: 'r0', text: 'First part.', streaming: false, final: false, cost: null, at: 2 }, BLOCKS[2]!];
    expect(cacheBlocks(parts).map((b) => b.key)).toEqual(['u1', 't1', 'r0', 'r1']);
    await writeCached(REF, parts);
    expect((await readCached(REF))?.blocks.map((b) => b.key)).toEqual(['u1', 't1', 'r0', 'r1']);
  });
  it('a write meant for one account keeps nothing once another is shown (a pending write never seals for the next account)', async () => {
    await show(OTHER);
    await writeCached(REF, BLOCKS, 5, UID);
    expect(store.rows.size).toBe(0);
    expect(await readCached(REF)).toBeNull();
  });
  it('writes started together still keep at most CACHE_MAX chats (one write at a time, the cap on the store as it is)', async () => {
    for (let i = 0; i < CACHE_MAX - 1; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    await Promise.all([writeCached({ ...REF, sid: 'x-1' }, BLOCKS, 2000), writeCached({ ...REF, sid: 'x-2' }, BLOCKS, 2001), writeCached({ ...REF, sid: 'x-3' }, BLOCKS, 2002)]);
    expect(store.rows.size).toBe(CACHE_MAX);
    expect(await readCached({ ...REF, sid: 'x-3' })).not.toBeNull();
  });
  it('a write says whether it kept the copy: false for another account, true when stored', async () => {
    expect(await writeCached(REF, BLOCKS)).toBe(true);
    expect(await writeCached(REF, BLOCKS, 9, OTHER)).toBe(false);
  });
  it('a clock that went back: the store still holds CACHE_MAX, and the oldest-stamped (the new one) is the one that goes', async () => {
    for (let i = 0; i < CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    expect(await writeCached({ ...REF, sid: 'late' }, BLOCKS, 10)).toBe(false);
    expect(store.rows.size).toBe(CACHE_MAX);
    expect(await readCached({ ...REF, sid: 'late' })).toBeNull();
  });
  it('a seal that waits on a lock held elsewhere stores nothing, the next write goes on, and a late answer never writes', async () => {
    let late!: (v: Awaited<ReturnType<typeof sealBlob>>) => void;
    const real = sealBlob;
    let calls = 0;
    setSealForTests(50, (k, part, text) => (++calls === 1 ? new Promise((res) => { late = res; }) : real(k, part, text)));
    try {
      const older = [{ ...BLOCKS[0]!, key: 'old' } as ConvBlock];
      expect(await writeCached(REF, older, 1)).toBe(false);
      expect(store.rows.size).toBe(0);
      expect(await writeCached(REF, BLOCKS, 2)).toBe(true);
      // The first seal answers now: it stores nothing, and the newer copy stays.
      late(await real(CACHE_SLOT, 'x', 'old'));
      await new Promise((r) => setTimeout(r, 0));
      expect((await readCached(REF))?.blocks.map((b) => b.key)).toEqual(['u1', 't1', 'r1']);
    } finally { setSealForTests(10_000); }
  });
  it('a store call that never answers (another tab\'s transaction) ends that write; the next write goes on', async () => {
    setSealForTests(50);
    try {
      let stuck = true;
      const slow: CacheStore = { ...store, list: () => (stuck ? new Promise<never>(() => {}) : store.list()) };
      setCacheStoreForTests(slow);
      expect(await writeCached(REF, BLOCKS, 1)).toBe(false);
      stuck = false;
      expect(await writeCached({ ...REF, sid: 's-next' }, BLOCKS, 2)).toBe(true);
      expect(store.rows.size).toBe(1);
    } finally { setSealForTests(10_000); }
  });
  it('the cap holds even when the store answers the eviction late: the delete is issued, never skipped', async () => {
    for (let i = 0; i < CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    setSealForTests(50);
    try {
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const slow: CacheStore = { ...store, del: async (ids) => { await gate; await store.del(ids); } };
      setCacheStoreForTests(slow);
      await writeCached({ ...REF, sid: 'new' }, BLOCKS, 5000);
      release();
      await new Promise((r) => setTimeout(r, 0));
      expect(store.rows.size).toBe(CACHE_MAX);
      setCacheStoreForTests(store);
      expect(await readCached({ ...REF, sid: 's-0' }), 'the oldest went').toBeNull();
      expect(await readCached({ ...REF, sid: 'new' })).not.toBeNull();
    } finally { setSealForTests(10_000); }
  });
  it('a listing after the put that answers late: the eviction still runs, on the opening listing', async () => {
    for (let i = 0; i < CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    setSealForTests(50);
    try {
      let lists = 0;
      const slow: CacheStore = { ...store, list: () => (++lists === 2 ? new Promise<never>(() => {}) : store.list()) };
      setCacheStoreForTests(slow);
      expect(await writeCached({ ...REF, sid: 'new' }, BLOCKS, 5000)).toBe(true);
      setCacheStoreForTests(store);
      expect(store.rows.size).toBe(CACHE_MAX);
      expect(await readCached({ ...REF, sid: 's-0' })).toBeNull();
    } finally { setSealForTests(10_000); }
  });
  it('a listing after the put that fails: the eviction still runs, on the opening listing', async () => {
    for (let i = 0; i < CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    let lists = 0;
    const failing: CacheStore = { ...store, list: () => (++lists === 2 ? Promise.reject(new Error('aborted')) : store.list()) };
    setCacheStoreForTests(failing);
    expect(await writeCached({ ...REF, sid: 'new' }, BLOCKS, 5000)).toBe(true);
    setCacheStoreForTests(store);
    expect(store.rows.size).toBe(CACHE_MAX);
  });
  it('another tab\'s write between this write\'s listing and its put counts: the copy it refreshed stays', async () => {
    for (let i = 0; i < CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    const s0 = [...store.rows.values()].find((r) => r.at === 1000)!;
    let lists = 0;
    const racing: CacheStore = { ...store, list: async () => { const r = await store.list(); if (++lists === 1) store.rows.set(s0.id, { ...s0, at: 9000 }); return r; } };
    setCacheStoreForTests(racing);
    await writeCached({ ...REF, sid: 'new' }, BLOCKS, 5000);
    expect(store.rows.size).toBe(CACHE_MAX);
    expect(store.rows.has(s0.id), 'refreshed by the other tab').toBe(true);
  });
  it('keeps at most CACHE_MAX chats: the oldest written goes', async () => {
    for (let i = 0; i <= CACHE_MAX; i++) await writeCached({ ...REF, sid: `s-${i}` }, BLOCKS, 1000 + i);
    expect(store.rows.size).toBe(CACHE_MAX);
    expect(await readCached({ ...REF, sid: 's-0' })).toBeNull();
    expect(await readCached({ ...REF, sid: `s-${CACHE_MAX}` })).not.toBeNull();
  });

  it('a sign-out purge removes every row; Forget on this browser removes the account\'s', async () => {
    await writeCached(REF, BLOCKS);
    runAuthPurge();
    await Promise.resolve();
    expect(store.rows.size).toBe(0);
    boot();
    resetCryptForTests(memoryVault(), { newPage: true });
    await show(UID);
    setCacheStoreForTests(store);
    await writeCached(REF, BLOCKS);
    expect(store.rows.size).toBe(1);
    await forgetThisBrowser();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.rows.size).toBe(0);
  });

  it('a copy this browser cannot open (other keys here now) reads as none and stays until the chat is written again', async () => {
    await writeCached(REF, BLOCKS, 1000);
    resetCryptForTests(memoryVault(), { newPage: true });
    await cryptReady();
    await cryptIdleForTests();
    setCacheStoreForTests(store);
    expect(await readCached(REF)).toBeNull();
    expect(store.rows.size, 'not removed: it may be one whose account is still opening').toBe(1);
    await writeCached(REF, BLOCKS, 2000);
    expect(store.rows.size).toBe(1);
    expect((await readCached(REF))?.at).toBe(2000);
  });

  it('signed out (no account shown here) nothing is kept or read', async () => {
    await writeCached(REF, BLOCKS);
    expect(store.rows.size).toBe(1);
    boot({ signedIn: false });
    resetCryptForTests(memoryVault(), { newPage: true });
    await cryptReady();
    await cryptIdleForTests();
    setCacheStoreForTests(store);
    expect(await readCached(REF)).toBeNull();
    await writeCached({ ...REF, sid: 's-2' }, BLOCKS);
    expect([...store.rows.keys()].some((k) => k.includes('s-2')), 'nothing written without an account').toBe(false);
  });
});
