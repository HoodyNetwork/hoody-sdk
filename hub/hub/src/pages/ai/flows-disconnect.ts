// Disconnect: remove a key, sign out of ChatGPT, or delete an endpoint. An unknown outcome is read back
// (the stored flags in GET auth); only the read-back showing it gone is "removed".
import { isStale, isUnknown, type Api } from './api';
import { deleteEndpoint } from './flows-endpoint';
import { readAuth } from './flows-oauth';
import { disconnectWhat, obj, type Account } from './logic';
import type { Outcome } from './types';

export type DisconnectResult = { state: 'removed' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome };
/** What a disconnect removes (disconnectWhat): kept with the press, so a later read checks that and not the row as shown. */
export type DisconnectWhat = ReturnType<typeof disconnectWhat>;
/** A read-back: `removed` (read whole, it is gone), `present` (read whole, it is still there), `not_confirmed` (nothing
 *  read whole: no answer, or one that proves neither) or `stale`. */
export type GoneResult = { state: 'removed' | 'present' | 'not_confirmed' | 'stale' };

export async function disconnect(api: Api, a: Account): Promise<DisconnectResult> {
  const what = disconnectWhat(a);
  if (what === 'endpoint') {
    const r = await deleteEndpoint(api, a.id);
    return r.state === 'saved' ? { state: 'removed' } : r.state === 'failed' ? r : { state: r.state };
  }
  const r = what === 'signin' ? await api.signOut() : await api.keyDelete(a.id);
  if (r.ok) return { state: 'removed' };
  if (isStale(r)) return { state: 'stale' };
  if (!isUnknown(r)) return r.err.status === 404 ? { state: 'removed' } : { state: 'failed', err: r.err };
  const g = await goneByAuth(api, a.id, what);
  return g.state === 'present' ? { state: 'not_confirmed' } : { state: g.state };
}

/** Reads GET auth back: the sign-in or key is removed only when its stored flag reads false, and still there only when it
 *  reads true (a missing flag proves neither). */
async function goneByAuth(api: Api, id: string, what: 'signin' | 'key'): Promise<GoneResult> {
  const au = await readAuth(api, id);
  if (au.state !== 'ok') return { state: au.state };
  const flag = what === 'signin' ? au.auth.oauth_stored : au.auth.api_key_stored;
  return flag === false ? { state: 'removed' } : flag === true ? { state: 'present' } : { state: 'not_confirmed' };
}

/** "Check again": only reads. removed when the read-back shows `what` of provider `id` gone: both as captured at the press
 *  (disconnectHold.ts), never the account as the page shows it now (its row may read otherwise by then). */
export async function confirmGone(api: Api, id: string, what: DisconnectWhat): Promise<GoneResult> {
  if (what === 'endpoint') {
    const list = await api.providers();
    if (isStale(list)) return { state: 'stale' };
    if (!list.ok) return { state: 'not_confirmed' };
    // providers before items, as this confirmation has always read the list (deleteEndpoint reads items first)
    const arr = obj(list.body) ? (Array.isArray(list.body.providers) ? list.body.providers : Array.isArray(list.body.items) ? list.body.items : null) : null;
    // Absence is proved only by a list read whole: no list, or a row with no id (it may be this very endpoint), proves
    // nothing, so the outcome stays not confirmed.
    if (!arr || arr.some((p) => !obj(p) || typeof p.id !== 'string')) return { state: 'not_confirmed' };
    return arr.some((p) => obj(p) && p.id === id) ? { state: 'present' } : { state: 'removed' };
  }
  return goneByAuth(api, id, what);
}
