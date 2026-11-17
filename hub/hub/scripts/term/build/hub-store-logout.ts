// `hoody logout`: the boot keys a terminal Hub kept for the account (src/term/app/boot-keys.ts) are revoked before the
// CLI clears the sign-in. Host side, like hub-store-open.ts: the CLI's launcher calls it in its own process, with no
// engine and none of the Hub's core.
//
//   const r = await revokeKeptBootKeys({ home, apiOrigin, uid, tryLock, revoke });   // never throws
//
// Rules, each with a test in hub-store-logout.term.test.ts:
//  - no store for this account (no home directory, or its store directory was never made): nothing is created and
//    nothing is sent ('none');
//  - another Hub holds the store's lock: nothing is sent; that Hub keeps its own keys ('busy');
//  - a store that cannot be opened, or a list that cannot be read: nothing is sent, nothing is moved aside
//    ('unreadable');
//  - else every kept key is revoked, oldest first (revokeBootKeys down to 0). A key whose revoke did not answer 2xx
//    or 404 (a refusal, or an answer that never came) stays listed, and so does every key after it: 'kept', never
//    'done';
//  - a mint whose record is still open may have made a key the list does not name: counted in `open`, never revoked
//    here (the Hub's next start settles it), and the result is 'kept'.
import nodeFs from 'node:fs';
import { openBootMints, readBootKeys, revokeBootKeys } from '../../../src/term/app/boot-keys';
import { hubStoreDir, openHubStore, type HubStore, type StoreIo, type TryLock } from './hub-store';

export type LogoutKeysState = 'none' | 'busy' | 'unreadable' | 'done' | 'kept';
export interface LogoutKeys {
  readonly state: LogoutKeysState;
  /** Keys revoked now (or found gone already). */
  readonly revoked: number;
  /** Keys still listed: not known to be revoked. */
  readonly left: number;
  /** Mint records still open: each may have made a key that is not listed. */
  readonly open: number;
}
export interface RevokeKeptBootKeysOptions {
  /** The user's home directory (the launcher passes os.homedir()). */
  home: string | undefined;
  apiOrigin: string;
  /** The account uid of the sign-in that is ending. */
  uid: string;
  tryLock: TryLock;
  /** Deletes one key: 'gone' for a 2xx or a 404, 'failed' for anything else (a lost answer included). */
  revoke: (id: string) => Promise<'gone' | 'failed'>;
  now?: () => number;
  io?: Partial<StoreIo>;
}

const result = (state: LogoutKeysState, revoked = 0, left = 0, open = 0): LogoutKeys => ({ state, revoked, left, open });

/** Revokes the account's kept boot keys. Never throws, never creates a store. */
export async function revokeKeptBootKeys(o: RevokeKeptBootKeysOptions): Promise<LogoutKeys> {
  const dir = o.uid ? hubStoreDir(o.home, o.apiOrigin, o.uid) : null;
  if (!dir || !o.home) return result('none');
  // openHubStore makes a missing directory: look first, so a logout never leaves a store behind.
  try { nodeFs.lstatSync(dir); } catch (e) { return result((e as { code?: string }).code === 'ENOENT' ? 'none' : 'unreadable'); }
  let store: HubStore;
  try {
    store = openHubStore(dir, { home: o.home, tryLock: o.tryLock, ...(o.now ? { now: o.now } : {}), ...(o.io ? { io: o.io } : {}) });
  } catch {
    return result('unreadable');
  }
  try {
    if (store.readOnly !== null) return result('busy', 0, readBootKeys(store)?.length ?? 0);
    const open = openBootMints(store);
    const r = await revokeBootKeys('rw', store, o.revoke, 0, o.now);
    if (r.left === null) return result('unreadable', 0, 0, open);
    return result(r.ok && r.left === 0 && open === 0 ? 'done' : 'kept', r.revoked, r.left, open);
  } catch {
    return result('unreadable');
  } finally {
    try { store.close(); } catch { /* closing releases the lock */ }
  }
}
