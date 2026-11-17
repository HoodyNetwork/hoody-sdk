// vault.test.ts: the IndexedDB vault over a small in-memory IndexedDB (structured clone on every put and read, as
// the browser does), and its refusals.
import { describe, expect, it } from 'vitest';
import { newBaseKey } from './envelope';
import { idbVault } from './vault';

type Row = Record<string, unknown>;

/** Just the IndexedDB surface idbVault uses: open/upgrade, transactions, put/get/delete, index getAll. */
function fakeIDB(o: { refuseOpen?: boolean } = {}): IDBFactory {
  const dbs = new Map<string, { version: number; stores: Map<string, { keyPath: string; indexes: Map<string, string>; rows: Map<string, Row> }> }>();
  const later = (f: () => void) => setTimeout(f, 0);
  function request<T>(t: { pending: number; settle: () => void } | null, work: () => T) {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    if (t) t.pending++;
    later(() => {
      try { r.result = work(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); }
      if (t) { t.pending--; t.settle(); }
    });
    return r;
  }
  const factory = {
    open(name: string, version: number) {
      const r: Row & { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void } = {};
      later(() => {
        if (o.refuseOpen) { r.error = new Error('denied'); r.onerror?.(); return; }
        let d = dbs.get(name);
        const upgrade = !d || d.version < version;
        if (!d) dbs.set(name, d = { version, stores: new Map() });
        const db = d;
        const conn = {
          objectStoreNames: { contains: (n: string) => db.stores.has(n) },
          createObjectStore(n: string, opt: { keyPath: string }) {
            const s = { keyPath: opt.keyPath, indexes: new Map<string, string>(), rows: new Map<string, Row>() };
            db.stores.set(n, s);
            return { createIndex: (iname: string, path: string) => { s.indexes.set(iname, path); } };
          },
          close() {},
          transaction(names: string[]) {
            const t = {
              pending: 0, done: false, oncomplete: null as null | (() => void), onerror: null as null | (() => void), onabort: null as null | (() => void), error: null,
              settle() { later(() => { if (!t.pending && !t.done) { t.done = true; t.oncomplete?.(); } }); },
              abort() { t.done = true; t.onabort?.(); },
              objectStore(n: string) {
                if (!names.includes(n)) throw new Error('not in scope');
                const s = db.stores.get(n)!;
                return {
                  put: (v: Row) => request(t, () => { const c = structuredClone(v); s.rows.set(String(c[s.keyPath]), c); return c[s.keyPath]; }),
                  get: (k: string) => request(t, () => { const v = s.rows.get(k); return v === undefined ? undefined : structuredClone(v); }),
                  delete: (k: string) => request(t, () => { s.rows.delete(k); }),
                  index: (iname: string) => ({
                    getAll: (val: unknown) => request(t, () => [...s.rows.values()].filter((row) => row[s.indexes.get(iname)!] === val).map((row) => structuredClone(row))),
                  }),
                };
              },
            };
            t.settle();
            return t;
          },
        };
        d.version = version;
        r.result = conn;
        if (upgrade) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
  return factory as unknown as IDBFactory;
}

describe('idbVault', () => {
  it('keeps CryptoKey objects per account, still non-extractable after the clone, and deletes all but one', async () => {
    const v = idbVault(fakeIDB());
    const k1 = await newBaseKey(), k2 = await newBaseKey();
    await v.putKey('u1', 'AAAAAAAAAAAAAAAAAAAAAA', k1);
    await v.putKey('u1', 'BBBBBBBBBBBBBBBBBBBBBB', k2);
    await v.putKey('u2', 'CCCCCCCCCCCCCCCCCCCCCC', k1);
    const got = await v.keys('u1');
    expect([...got.keys()].sort()).toEqual(['AAAAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBB']);
    const back = got.get('AAAAAAAAAAAAAAAAAAAAAA') as CryptoKey;
    expect(back.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', back)).rejects.toBeTruthy();
    await v.deleteKeys('u1', 'BBBBBBBBBBBBBBBBBBBBBB');
    expect([...(await v.keys('u1')).keys()]).toEqual(['BBBBBBBBBBBBBBBBBBBBBB']);
    expect([...(await v.keys('u2')).keys()]).toEqual(['CCCCCCCCCCCCCCCCCCCCCC']);
    await v.deleteKeys('u1', null);
    expect((await v.keys('u1')).size).toBe(0);
  });

  it('forget deletes every key of the account and leaves its record keyless with the new epoch, in one transaction', async () => {
    const v = idbVault(fakeIDB());
    const k = await newBaseKey();
    await v.putKey('u1', 'AAAAAAAAAAAAAAAAAAAAAA', k);
    await v.putKey('u2', 'CCCCCCCCCCCCCCCCCCCCCC', k);
    await v.putAccount({ account: 'u1', active: 'AAAAAAAAAAAAAAAAAAAAAA', signIn: 'h', migrated: ['hub_home_v1'], declared: { hub_home_v1: false } });
    await v.forget('u1', 'E2');
    expect((await v.keys('u1')).size).toBe(0);
    expect([...(await v.keys('u2')).keys()]).toEqual(['CCCCCCCCCCCCCCCCCCCCCC']);
    expect(await v.account('u1')).toEqual({ account: 'u1', active: null, signIn: null, migrated: ['hub_home_v1'], epoch: 'E2', declared: { hub_home_v1: false } });
  });

  it('keeps the account record and reads a malformed one fail-closed', async () => {
    const v = idbVault(fakeIDB());
    expect(await v.account('u1')).toBeNull();
    await v.putAccount({ account: 'u1', active: 'AAAAAAAAAAAAAAAAAAAAAA', signIn: 'h', migrated: ['hub_boards_v1'] });
    expect(await v.account('u1')).toEqual({ account: 'u1', active: 'AAAAAAAAAAAAAAAAAAAAAA', signIn: 'h', migrated: ['hub_boards_v1'], epoch: null, declared: {} });
    await v.putAccount({ account: 'u1', active: 'AAAAAAAAAAAAAAAAAAAAAA', signIn: 'h', migrated: [], epoch: 'E1' });
    expect((await v.account('u1'))?.epoch).toBe('E1'); // the forget epoch survives a round trip
    await v.putAccount({ account: 'u1', active: null, signIn: null, migrated: [], declared: { hub_boards_v1: true, hub_home_v1: false, bad: 1 as unknown as boolean } });
    expect((await v.account('u1'))?.declared).toEqual({ hub_boards_v1: true, hub_home_v1: false });
    await v.putAccount({ account: 'u1', active: 5 as unknown as string, signIn: null, migrated: [1, 'k'] as unknown as string[], epoch: 7 as unknown as string });
    expect(await v.account('u1')).toEqual({ account: 'u1', active: null, signIn: null, migrated: ['k'], epoch: null, declared: {} });
  });

  it('rejects when IndexedDB is missing or refuses to open', async () => {
    await expect(idbVault(undefined).keys('u1')).rejects.toThrow('IDB_UNAVAILABLE');
    await expect(idbVault(fakeIDB({ refuseOpen: true })).account('u1')).rejects.toBeTruthy();
  });
});
