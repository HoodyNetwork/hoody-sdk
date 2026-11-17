// The terminal's kept boot keys (boot-producer.ts mints them): the list in the store's housekeeping key BOOT_KEYS_KEY
// (store.json; ids and full names, never a value) and their revoke. Two callers revoke: a live start, down to
// BOOT_KEYS_MAX - 1 (live-wire.ts), and `hoody logout`, down to 0 (scripts/term/build/hub-store-logout.ts, run by the
// CLI before it clears the sign-in). The second runs in the CLI's own process, without the Hub's bundle, so this file
// imports nothing of the Hub's core: only the secret-shape check and types.
import { SECRET_SHAPED } from '../env/secret-shaped';
import type { PersistArea } from '../env/persist';
import type { StoreMode } from './live-records';

export const BOOT_KEYS_KEY = 'term.boot_keys';
export const BOOT_KEYS_MAX = 8;
/** The id of an auth token as the API names it. */
export const TOKEN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** core/change-store.ts CHANGE_STORE_KEY and ATTEMPT_PREFIX, and live-direct.ts BOOT_MINT_LOCK_PREFIX, repeated so this
 *  file needs none of the Hub's core (boot-keys.term.test.ts pins each to its source). */
export const CHANGES_KEY = 'hub.v3.changes';
export const ATTEMPT_ID_PREFIX = 'attempt\u0002';
export const BOOT_MINT_LOCK = 'term.direct.boot-token-mint:';

export interface BootKey { readonly id: string; readonly alias: string; readonly expires_at: string; readonly at: number }
export type BootKeysArea = Pick<PersistArea, 'readOnly' | 'failed' | 'get' | 'set'>;

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ALIAS = /^hoody-agent auto term [a-z0-9]{10}$/;
const validKey = (v: unknown): v is BootKey => isRec(v) && Object.keys(v).every((k) => ['id', 'alias', 'expires_at', 'at'].includes(k))
  && typeof v.id === 'string' && TOKEN_ID.test(v.id) && typeof v.alias === 'string' && ALIAS.test(v.alias)
  && typeof v.expires_at === 'string' && v.expires_at.length <= 40 && Number.isFinite(Date.parse(v.expires_at))
  && typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0;

/** The kept boot keys, oldest first; [] when none; null when the store cannot be read or holds a value of another shape. */
export function readBootKeys(area: Pick<PersistArea, 'get'>): BootKey[] | null {
  let text: string | null;
  try { text = area.get(BOOT_KEYS_KEY); } catch { return null; }
  if (text === null) return [];
  if (SECRET_SHAPED.test(text)) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  return Array.isArray(v) && v.length <= BOOT_KEYS_MAX && v.every(validKey) ? [...v].sort((a, b) => a.at - b.at) : null;
}

/** Writes the list (fsynced by the store) and reads it back; false when it could not be kept. */
export function writeBootKeys(area: BootKeysArea, list: readonly BootKey[]): boolean {
  if (area.readOnly !== null || area.failed() || list.length > BOOT_KEYS_MAX || !list.every(validKey)) return false;
  const text = JSON.stringify(list);
  if (SECRET_SHAPED.test(text)) return false;
  try { area.set(BOOT_KEYS_KEY, text); } catch { return false; }
  let back: string | null;
  try { back = area.get(BOOT_KEYS_KEY); } catch { return false; }
  return back === text;
}

/**
 * How many boot-token mint records are still open in the journal (core's change store: an attempt whose lock is a
 * mint's). Such a mint may have made a key the list does not name; only the Hub's recovery settles it. A record list
 * that cannot be read counts as one: a key may exist.
 */
export function openBootMints(area: Pick<PersistArea, 'journalGet'>): number {
  let text: string | null;
  try { text = area.journalGet(CHANGES_KEY); } catch { return 1; }
  if (text === null) return 0;
  let list: unknown;
  try { list = JSON.parse(text); } catch { return 1; }
  if (!Array.isArray(list)) return 1;
  return list.filter((r) => isRec(r) && typeof r.id === 'string' && r.id.startsWith(ATTEMPT_ID_PREFIX)
    && isRec(r.meta) && typeof r.meta.base === 'string' && r.meta.base.startsWith(BOOT_MINT_LOCK)).length;
}

export interface RevokeOutcome {
  /** Ids revoked now (or found gone). */
  readonly revoked: number;
  /** Kept entries left; null when the list could not be read. */
  readonly left: number | null;
  /** True when the list is down to `keepAtMost` and every write landed. */
  readonly ok: boolean;
}

/**
 * Revokes kept boot keys, oldest first, until at most `keepAtMost` remain: BOOT_KEYS_MAX - 1 at a start (room for one
 * mint), 0 at `hoody logout`. An expired one is dropped without a request. Each revoke that answered 2xx or 404 removes
 * its entry (written before the next); the first failure stops, the entry kept for the next try. Only with a writable
 * store ('rw': the process holding the store lock); otherwise nothing is read or sent.
 */
export async function revokeBootKeys(mode: StoreMode, area: BootKeysArea, revoke: (id: string) => Promise<'gone' | 'failed'>, keepAtMost: number, now: () => number = Date.now): Promise<RevokeOutcome> {
  if (mode !== 'rw') return { revoked: 0, left: null, ok: false };
  let list = readBootKeys(area);
  if (list === null) return { revoked: 0, left: null, ok: false };
  const live = list.filter((k) => Date.parse(k.expires_at) > now());
  if (live.length !== list.length) {
    if (!writeBootKeys(area, live)) return { revoked: 0, left: list.length, ok: false };
    list = live;
  }
  let revoked = 0;
  while (list.length > Math.max(0, keepAtMost)) {
    const oldest = list[0]!;
    let r: 'gone' | 'failed';
    try { r = await revoke(oldest.id); } catch { r = 'failed'; }
    if (r !== 'gone') return { revoked, left: list.length, ok: false };
    const next = list.slice(1);
    if (!writeBootKeys(area, next)) return { revoked: revoked + 1, left: list.length, ok: false };
    list = next;
    revoked++;
  }
  return { revoked, left: list.length, ok: true };
}
