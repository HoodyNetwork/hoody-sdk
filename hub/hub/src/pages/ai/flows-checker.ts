// The safety checker's settings (on/off and its model). Saved only when the read-back shows it.
import { isStale, isUnknown, type Api } from './api';
import { checkerOf } from './logic';
import type { Outcome } from './types';

export type CheckerResult = { state: 'saved' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome };
type Guard = { realm: string; realmSettings: boolean };

/** The realm a checker read or change is sent with: the settings' own realm, except Global on an agent without per-realm
 *  settings (one setting for every realm), which is sent with no realm. One rule for the page's read (data.ts) and the
 *  Advanced row's save and Check again: with no realm a call takes the top bar's, and All realms is refused there. */
export function checkerWireRealm(realm: string | null, realmSettings: boolean): string | null {
  return realm === 'global' && !realmSettings ? null : realm;
}

export async function setChecker(api: Api, realm: string | null, guard: Guard, body: { enabled?: boolean; model?: string }): Promise<CheckerResult> {
  const r = await api.jevPut(realm, guard, body);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  return confirmChecker(api, realm, guard, body);
}

/** Check again: one read, nothing sent. `realm` is the one the read is sent with (checkerWireRealm); the answer is judged
 *  for the settings' own realm (guard.realm), as the page's model judges it. */
export async function confirmChecker(api: Api, realm: string | null, guard: Guard, body: { enabled?: boolean; model?: string }): Promise<CheckerResult> {
  const back = await api.jev(realm, guard);
  if (isStale(back)) return { state: 'stale' };
  if (!back.ok) return { state: 'not_confirmed' };
  const c = checkerOf(back, { realm: guard.realm, realmSettings: guard.realmSettings });
  if (body.enabled !== undefined && c.enabled !== body.enabled) return { state: 'not_confirmed' };
  if (body.model !== undefined && c.model !== body.model) return { state: 'not_confirmed' };
  return { state: 'saved' };
}
