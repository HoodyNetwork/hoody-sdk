// A key save (a built-in provider's key, or an own endpoint's) whose answer is unknown, held as a durable attempt
// (attempts.ts: stored, every tab of the account sees it) under its own sender, on the lock of the provider's stored
// credential on one computer: ai.credential:<project>/<container>/<provider>. The AI page's key and endpoint removals
// take the same lock, so one credential change of a provider on a computer is admitted at a time: such a removal is never
// sent while a key may still land (a late save would leave a key the person believes removed), and no key is sent while
// such a removal may. The AI page's key step and the kit's KeySetup both save through here, so each sees the other's
// unknown save.
//   - The hold is taken before the key leaves. Refused (a key or endpoint removal or another save of this provider is
//     held, or storage that cannot keep it): nothing is sent. A held sign-out takes its own lock and refuses nothing here.
//   - `still`, when given, is asked as the save begins and again once the hold is taken: false sends nothing and holds
//     nothing. A caller whose Api follows the computer shown passes its computer check there and gates its Api itself.
//   - It is let go when the PUT's own answer is known (saved, refused, never sent), whatever the step made of it (a step
//     that moved on reads that answer as 'ended'), or when a read-back shows this key's fingerprint. A lost answer that no
//     read-back proved keeps it.
//   - A read-back proves the PUT only when the key stored before it was another one (or none): GET auth is read once as
//     the save starts, never waited on before the key leaves. Whichever of the two the agent answers first, a read that
//     already shows this key (the same key saved again), or no read at all, leaves nothing a later read could prove:
//     such a save stays held until its answer comes or the person stops tracking it.
//   - The record holds no key material: no key, fingerprint or prefix (it has no meta). The fingerprint a read-back needs
//     (the agent's short one-way one, as putKey takes it) is taken from the PUT as it leaves and kept in this tab's memory
//     only, by hold id, until this tab lets the hold go or the account ends (a save still out when it ends keeps none). So
//     only the tab that sent the key can prove it; anywhere else (another tab, after a reload) Check again says it cannot
//     tell, and stopping tracking it is the way out.
import { useMemo } from 'react';
import { attemptFor, heldAttempts, holdAttempt, useAttemptsVersion, type HeldAttempt } from '../attempts';
import { onAuthPurge } from '../realm';
import { isUnknown, type Env, type ProvidersApi } from './api';
import { confirmKey, READ_WAITS, type KeyResult } from './flows-key';

/** The sender of these holds: only it lets them go. */
export const KEY_SAVE_HOLD_BY = 'ai.key-save';
/** A project id and a container id as a hold names them, and a provider id (an own endpoint's included: ':' allowed). */
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;
const COMPUTER = /^[A-Za-z0-9_.-]{1,48}$/;
const PROVIDER = /^[A-Za-z0-9_.:-]{1,64}$/;

/** The computer a stored credential belongs to: its project and container id (a container id alone is not unique across
 *  projects). */
export interface CredentialAt { project: string; computer: string }

/** Every credential lock on `at` starts with this; null when the computer cannot be named. */
export function credentialLockBase(at: CredentialAt): string | null {
  return PROJECT.test(at.project) && COMPUTER.test(at.computer) ? `ai.credential:${at.project}/${at.computer}/` : null;
}

/** The lock of one provider's stored credential on one computer: its key save, and its key or endpoint removal. Null when
 *  a part cannot be named (nothing is sent). */
export function credentialLock(at: CredentialAt, provider: string): string | null {
  const base = credentialLockBase(at);
  return base && PROVIDER.test(provider) ? base + provider : null;
}

/** A held key save as a step or a removal shows it. `inFlight`: its PUT may still be out. */
export interface HeldKeySave { id: string; metaVersion: number; inFlight: boolean }

/** The fingerprint each held save of this tab needs for its read-back, by hold id. Memory only, never stored. */
const proofs = new Map<string, string>();
/** The holds this tab proved (Check again read this key back), by hold id: a later Check again of the same save (the
 *  leave toast of the step that sent it, after a band proved it) answers 'saved' without a read. Memory only. */
const proved = new Set<string>();
/** Moves on every account end: a save that began before one keeps no fingerprint. */
let purges = 0;
onAuthPurge(() => {
  purges += 1;
  proofs.clear();
  proved.clear();
});

/** How long the save waits for its first read of what was stored (once the PUT's answer is lost): the read-back's own
 *  waits added up. Past it, that read counts as unreadable: no read proves the save, and it can be let go (Stop
 *  tracking) instead of staying busy and in flight. */
export const FIRST_READ_WAIT_MS = READ_WAITS.reduce((a, b) => a + b, 0);

const viewOf = (h: HeldAttempt): HeldKeySave => ({ id: h.id, metaVersion: h.metaVersion, inFlight: h.inFlight !== false });

/** The held key save of `provider` at `at`, re-read whenever the holds move; null when none. */
export function useHeldKeySave(at: CredentialAt | null, provider: string | null): HeldKeySave | null {
  const version = useAttemptsVersion();
  const lock = at && provider ? credentialLock(at, provider) : null;
  return useMemo(() => {
    const h = lock ? heldAttempts(lock).find((x) => x.by === KEY_SAVE_HOLD_BY) : undefined;
    return h ? viewOf(h) : null;
    // `version` is the signal that the holds moved: the read is redone on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, version]);
}

/** A send's result: the save's, with its hold while that stays (the answer is unknown), or a refusal that sent nothing:
 *  `held` (a key or endpoint removal or another save of this provider is held), `not_held` (no computer named, or the
 *  hold could not be kept) or the save's `stale` (`still` answered false before the key left). */
export type KeySaveResult = (KeyResult & { held?: HeldKeySave }) | { state: 'held' } | { state: 'not_held' };

/** Holds the save, runs `save` once over an Api whose key PUT reports its own answer here, and lets the hold go on a known
 *  answer or a read-back that proves it (a key not stored before). `at` is the computer `api` sends to; `still`, the
 *  caller's check that the save may still go (asked before the hold is taken and once it is). */
export async function holdKeySave<A extends ProvidersApi>(api: A, env: Env, at: CredentialAt | null, provider: string, save: (api: A) => Promise<KeyResult>, still: () => boolean = () => true): Promise<KeySaveResult> {
  const lock = at ? credentialLock(at, provider) : null;
  if (!at || !lock) return { state: 'not_held' };
  if (!still()) return { state: 'stale' };
  const got = await holdAttempt(lock, { by: KEY_SAVE_HOLD_BY, identity: { project: at.project, computer: at.computer, provider } }).catch(() => null);
  if (!got || !got.ok) return got && got.code === 'HELD' ? { state: 'held' } : { state: 'not_held' };
  const hold = got.hold;
  // The save may no longer go (the caller's check moved while the hold was being taken): nothing is sent, nothing held.
  if (!still()) {
    hold.release();
    return { state: 'stale' };
  }
  const era = purges;
  // What was stored before the key left: read alongside the save, never waited on before the PUT.
  const before = storedFingerprint(api, provider);
  // The PUT's own answer ('none' until it leaves, 'unknown' while it is out or when it was lost) and the fingerprint of
  // the key it carried.
  const seen: { put: 'none' | 'known' | 'unknown'; fp: Promise<string | null> | null } = { put: 'none', fp: null };
  const keyPut: ProvidersApi['keyPut'] = async (pid, body) => {
    seen.put = 'unknown';
    seen.fp = env.digest(body.api_key).catch(() => null);
    const r = await api.keyPut(pid, body);
    seen.put = r.ok || !isUnknown(r) ? 'known' : 'unknown';
    return r;
  };
  const watched = Object.create(api, { keyPut: { value: keyPut } }) as A;
  const r = await save(watched).catch((): KeyResult => ({ state: 'not_confirmed' }));
  if (seen.put !== 'unknown') {
    hold.release();
    return r;
  }
  const fp = seen.fp ? await seen.fp : null;
  // Only a key that was not stored before can be proved by its fingerprint.
  const was = await bounded(before, FIRST_READ_WAIT_MS);
  const provable = fp !== null && was !== undefined && was !== fp;
  if (provable && r.state === 'saved') {
    hold.release();
    return r;
  }
  if (provable && era === purges) proofs.set(hold.id, fp);
  hold.sent();
  return { ...r, held: { id: hold.id, metaVersion: 0, inFlight: false } };
}

/** `p`, or undefined once `ms` passed (the timer is cleared when `p` settles first). */
function bounded<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** The fingerprint GET auth shows for `provider`: null only when it says no key is stored (no fingerprint and
 *  api_key_stored false), undefined when it could not be read or shows no fingerprint while a key may be stored (then no
 *  read proves the save: an answer without the field is unknown, never "no key"). */
async function storedFingerprint(api: ProvidersApi, provider: string): Promise<string | null | undefined> {
  try {
    const r = await api.auth(provider);
    if (!r.ok) return undefined;
    const b: unknown = r.body;
    const a: unknown = b && typeof b === 'object' ? (b as { auth?: unknown }).auth : undefined;
    if (!a || typeof a !== 'object') return undefined;
    const { api_key_fingerprint: f, api_key_stored: stored } = a as { api_key_fingerprint?: unknown; api_key_stored?: unknown };
    if (typeof f === 'string') return f;
    return stored === false ? null : undefined;
  } catch {
    return undefined;
  }
}

/** Check again: one read of the stored fingerprint, never a second send, over `api` (the computer the save went to).
 *  'saved' once it is this key's and the checked free let the hold go (never while the PUT may still be out); 'unproved'
 *  when no read can tell (this tab does not know the key's fingerprint, or the same key was stored before); else
 *  'not_confirmed', and the hold stays. `live` is the caller's guard on the read (confirmKey). */
export async function checkKeySave(api: ProvidersApi, env: Env, provider: string, held: HeldKeySave, live?: () => boolean): Promise<'saved' | 'not_confirmed' | 'unproved'> {
  // Its PUT may still be out (here or in another tab): nothing proves it yet, and the free would be refused.
  if (held.inFlight) return 'not_confirmed';
  // Already proved by this tab (another Check again of the same save): no read, the hold is gone.
  if (proved.has(held.id)) return 'saved';
  const fp = proofs.get(held.id);
  if (fp === undefined) return 'unproved';
  const r = await confirmKey(api, env, provider, fp, [0], live);
  if (r.state !== 'saved') return 'not_confirmed';
  // This tab cannot let the hold go (no copy of it here) while it is still held: not done. Gone from the holds = done.
  // Such a hold is another sender's: that sender's own check or the person's Stop tracking lets it go.
  const h = attemptFor(held.id, KEY_SAVE_HOLD_BY);
  const freed = h ? await h.free('proved', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const) : stillHeld(held.id) ? 'unresolved' : 'freed';
  if (freed !== 'freed') return 'not_confirmed';
  proofs.delete(held.id);
  proved.add(held.id);
  return 'saved';
}

const stillHeld = (id: string): boolean => heldAttempts().some((x) => x.id === id);

/** The person's Stop tracking: true once the hold was let go. */
export async function stopKeySave(held: HeldKeySave): Promise<boolean> {
  const h = attemptFor(held.id, KEY_SAVE_HOLD_BY);
  if (!h) return false;
  const freed = (await h.free('dismissed', { metaVersion: held.metaVersion }).catch(() => 'unresolved' as const)) === 'freed';
  if (freed) proofs.delete(held.id);
  return freed;
}
