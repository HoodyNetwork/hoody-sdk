// crypt/vault.ts: where the base keys live. IndexedDB holds the CryptoKey objects themselves (structured clone keeps
// a non-extractable key non-extractable), never raw bytes; the per-account record holds the active key id, the
// sign-in the last rotation was made for (a SHA-256 of the session id, not the id) and the pref keys already
// migrated off plaintext.
//
// Database 'hoody-hub-crypt' v1: store 'keys' {id: '<account>/<keyId>', account, keyId, key} and store 'accounts'
// {account, active, signIn, migrated}. Every method rejects when IndexedDB is missing or refuses; cryptStore then
// treats this browser as unable to open saved settings.

export interface AccountRecord {
  readonly account: string;
  /** The key new writes use; null after "forget on this browser". */
  readonly active: string | null;
  /** The sign-in the last completed rotation was made for (hashed), or null. */
  readonly signIn: string | null;
  /** Pref keys whose plaintext was migrated: plaintext under them is never read again. Survives forget. */
  readonly migrated: readonly string[];
  /** Changes at every "forget on this browser" (random, not secret; absent on older records = null): a tab that
   *  opened the account under another epoch stores nothing more. */
  readonly epoch?: string | null;
  /** Pref keys this browser's store has used, with whether they are split in parts (absent on older records = {}):
   *  their old plaintext is migrated at each open, and deleted by "forget on this browser". */
  readonly declared?: Readonly<Record<string, boolean>>;
}

export interface Vault {
  keys(account: string): Promise<Map<string, CryptoKey>>;
  putKey(account: string, keyId: string, key: CryptoKey): Promise<void>;
  /** Deletes every key of the account except `keep` (null: all of them). */
  deleteKeys(account: string, keep: string | null): Promise<void>;
  account(account: string): Promise<AccountRecord | null>;
  putAccount(rec: AccountRecord): Promise<void>;
  /** "Forget on this browser", in one transaction: every key of the account deleted, and its record left with no
   *  active key, no sign-in and the new `epoch` (all or nothing). */
  forget(account: string, epoch: string): Promise<void>;
}

const DB = 'hoody-hub-crypt';

function declaredOf(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'boolean' && k !== '__proto__') out[k] = x;
  return out;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IDB_FAILED'));
  });
}

/** The IndexedDB vault. The connection opens on first use and is reopened after a failure or a version change. */
export function idbVault(factory: IDBFactory | undefined): Vault {
  let conn: Promise<IDBDatabase> | null = null;
  function db(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error('IDB_UNAVAILABLE'));
    if (!conn) {
      conn = new Promise<IDBDatabase>((resolve, reject) => {
        let o: IDBOpenDBRequest;
        try { o = factory.open(DB, 1); } catch (e) { reject(e); return; }
        o.onupgradeneeded = () => {
          const d = o.result;
          if (!d.objectStoreNames.contains('keys')) d.createObjectStore('keys', { keyPath: 'id' }).createIndex('account', 'account');
          if (!d.objectStoreNames.contains('accounts')) d.createObjectStore('accounts', { keyPath: 'account' });
        };
        o.onsuccess = () => {
          const d = o.result;
          d.onversionchange = () => { d.close(); conn = null; };
          d.onclose = () => { conn = null; };
          resolve(d);
        };
        o.onerror = () => reject(o.error || new Error('IDB_FAILED'));
        o.onblocked = () => reject(new Error('IDB_BLOCKED'));
      });
      conn.catch(() => { conn = null; });
    }
    return conn;
  }
  async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
    const d = await db();
    const t = d.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = t.onerror = () => reject(t.error || new Error('IDB_FAILED'));
    });
    done.catch(() => {});
    let out: T;
    try { out = await fn(t); } catch (e) { try { t.abort(); } catch { /* already finished */ } throw e; }
    await done;
    return out;
  }
  return Object.freeze({
    keys: (account: string) => tx(['keys'], 'readonly', async (t) => {
      const rows = await req(t.objectStore('keys').index('account').getAll(account)) as Array<{ keyId?: unknown; key?: unknown }>;
      const m = new Map<string, CryptoKey>();
      for (const r of rows) if (typeof r.keyId === 'string' && r.key && typeof r.key === 'object') m.set(r.keyId, r.key as CryptoKey);
      return m;
    }),
    putKey: (account: string, keyId: string, key: CryptoKey) => tx(['keys'], 'readwrite', async (t) => {
      await req(t.objectStore('keys').put({ id: account + '/' + keyId, account, keyId, key }));
    }),
    deleteKeys: (account: string, keep: string | null) => tx(['keys'], 'readwrite', async (t) => {
      const s = t.objectStore('keys');
      const rows = await req(s.index('account').getAll(account)) as Array<{ id: string; keyId: string }>;
      for (const r of rows) if (r.keyId !== keep) await req(s.delete(r.id));
    }),
    account: (account: string) => tx(['accounts'], 'readonly', async (t) => {
      const r = await req(t.objectStore('accounts').get(account)) as Partial<AccountRecord> | undefined;
      if (!r) return null;
      return {
        account,
        active: typeof r.active === 'string' ? r.active : null,
        signIn: typeof r.signIn === 'string' ? r.signIn : null,
        migrated: Array.isArray(r.migrated) ? r.migrated.filter((k): k is string => typeof k === 'string') : [],
        epoch: typeof r.epoch === 'string' ? r.epoch : null,
        declared: declaredOf(r.declared),
      };
    }),
    forget: (account: string, epoch: string) => tx(['keys', 'accounts'], 'readwrite', async (t) => {
      const s = t.objectStore('keys'), acc = t.objectStore('accounts');
      const rows = await req(s.index('account').getAll(account)) as Array<{ id: string }>;
      for (const r of rows) await req(s.delete(r.id));
      const r = await req(acc.get(account)) as Partial<AccountRecord> | undefined;
      const migrated = r && Array.isArray(r.migrated) ? r.migrated.filter((k): k is string => typeof k === 'string') : [];
      await req(acc.put({ account, active: null, signIn: null, migrated, epoch, declared: declaredOf(r?.declared) }));
    }),
    putAccount: (rec: AccountRecord) => tx(['accounts'], 'readwrite', async (t) => {
      await req(t.objectStore('accounts').put({ account: rec.account, active: rec.active, signIn: rec.signIn, migrated: [...rec.migrated], epoch: rec.epoch ?? null, declared: declaredOf(rec.declared) }));
    }),
  });
}
