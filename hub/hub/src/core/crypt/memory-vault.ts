// crypt/memory-vault.ts: tests only, a vault in memory (crypt/vault.ts holds the contract).
import type { AccountRecord, Vault } from './vault';

/** Tests only: a vault in memory. `fail` makes the named method reject (a crash or a refusal at that step). */
export function memoryVault(): Vault & { fail: Set<string>; dump(): { keys: string[]; accounts: AccountRecord[] } } {
  const keys = new Map<string, Map<string, CryptoKey>>();
  const accounts = new Map<string, AccountRecord>();
  const fail = new Set<string>();
  const check = (m: string) => { if (fail.has(m) || fail.has('*')) throw new Error('VAULT_FAIL'); };
  return {
    fail,
    async keys(a) { check('keys'); return new Map(keys.get(a) || []); },
    async putKey(a, id, k) { check('putKey'); let m = keys.get(a); if (!m) keys.set(a, m = new Map()); m.set(id, k); },
    async deleteKeys(a, keep) { check('deleteKeys'); const m = keys.get(a); if (m) for (const id of [...m.keys()]) if (id !== keep) m.delete(id); },
    async account(a) { check('account'); const r = accounts.get(a); return r ? { ...r, migrated: [...r.migrated] } : null; },
    async putAccount(r) { check('putAccount'); accounts.set(r.account, { ...r, migrated: [...r.migrated] }); },
    async forget(a, epoch) {
      check('forget'); // all or nothing, as the one IndexedDB transaction
      keys.delete(a);
      const r = accounts.get(a);
      accounts.set(a, { account: a, active: null, signIn: null, migrated: r ? [...r.migrated] : [], epoch, declared: { ...(r?.declared ?? {}) } });
    },
    dump() { return { keys: [...keys].flatMap(([a, m]) => [...m.keys()].map((id) => a + '/' + id)), accounts: [...accounts.values()] }; },
  };
}
