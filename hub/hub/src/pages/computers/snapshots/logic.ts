// Pure rules of the snapshots feature: names, the list answer, and what proves a sent change.

import { stringOrEmpty as str } from '@core';

export interface Snapshot {
  name: string;
  alias: string | null;
  createdAt: string;
  /** When the snapshot was last restored or started a computer; null until then. A restore moves it. */
  lastUsedAt: string | null;
  expiresAt: string | null;
  /** The snapshot also holds the computer's running state (memory), not only its files. */
  stateful: boolean;
  size: number | null;
}

/** One computer's snapshots as the list read selects them (`max` is null when the API names no cap). */
export interface SnapshotList {
  id: string;
  count: number;
  max: number | null;
  items: Snapshot[];
  /** The answer carried a snapshot array. Without one nothing is known, and the tab says the list could not be read. */
  listed: boolean;
  /** Every row was readable and the answer named this computer (or none): only then can a missing name prove a
   *  delete. */
  complete: boolean;
}

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** GET /computers/:id/snapshots, newest first. Rows without a name are left out (the list is then not complete). */
export function snapshotsOf(raw: unknown, id: string): SnapshotList {
  const d = obj(obj(raw)?.data);
  const listed = Array.isArray(d?.snapshots);
  const rows: unknown[] = listed ? (d?.snapshots as unknown[]) : [];
  const items = rows.flatMap((x): Snapshot[] => {
    const s = obj(x);
    const name = str(s?.name);
    if (!s || !name) return [];
    return [{ name, alias: str(s.alias) || null, createdAt: str(s.created_at), lastUsedAt: str(s.last_used_at) || null, expiresAt: str(s.expires_at) || null, stateful: s.stateful === true, size: num(s.size) }];
  });
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const named = d?.computer_id === undefined || d.computer_id === id;
  return { id, count: num(d?.snapshot_count) ?? items.length, max: num(d?.max_snapshots), items, listed, complete: listed && named && items.length === rows.length };
}

/**
 * A name the API keeps as sent: it turns an alias into the snapshot name by keeping letters, digits, `_` and `-`,
 * stripping `-`/`_` at both ends and cutting at 64. A name that already passes is kept whole, so the list shows
 * exactly the sent name (the proof of a lost answer).
 */
export const SNAP_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$/;
export const validSnapName = (v: string): boolean => SNAP_RE.test(v);

/** The longest alias the API takes (UpdateSnapshotAliasRequest / CreateSnapshotRequest). */
export const MAX_LABEL = 100;
/** The characters the API refuses in an alias (the same rule as the API's own): control and format
 *  characters, default-ignorable code points, lone surrogates, private use, and every space but the ASCII space, except
 *  ZWNJ/ZWJ, variation and Mongolian selectors and the visible prepended marks; the three subdivision flags are allowed. */
const ALLOWED_FORMAT = '\\u{200C}\\u{200D}\\u{FE00}-\\u{FE0F}\\u{E0100}-\\u{E01EF}\\u{180B}-\\u{180F}\\u{0600}-\\u{0605}\\u{06DD}\\u{070F}\\u{0890}\\u{0891}\\u{08E2}\\u{110BD}\\u{110CD}';
const REFUSED = new RegExp(`(?![ ${ALLOWED_FORMAT}])[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Z}\\p{Default_Ignorable_Code_Point}]`, 'u');
const FLAG = /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/gu;
const hidden = (v: string): boolean => REFUSED.test(v.replace(FLAG, ' '));
/** A new label for a snapshot: empty removes it (null); otherwise at most MAX_LABEL characters, none hidden. Returns
 *  the clean label, null for none, or undefined when it is not valid. */
export function cleanLabel(raw: string): string | null | undefined {
  const v = raw.trim();
  if (v === '') return null;
  // The API counts characters (code points), not UTF-16 units: an emoji is one.
  return [...v].length <= MAX_LABEL && !hidden(v) ? v : undefined;
}

/** The days a new snapshot is kept: empty is none sent (the server's default); otherwise a whole number of 1 to 3650.
 *  Returns the days, null for none, or undefined when it is not valid. */
export function cleanExpiry(raw: string): number | null | undefined {
  const v = raw.trim();
  if (v === '') return null;
  if (!/^\d{1,4}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 1 && n <= 3650 ? n : undefined;
}

/** Only a running or stopped computer can take a snapshot (the Backups tab's Take and the computer menu's item). */
export const canTakeNow = (status: string | undefined): boolean => status === 'running' || status === 'stopped';

/** snap-YYYYMMDD-HHMM in UTC; freeName adds a suffix when the list already holds it. */
export function defaultSnapName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `snap-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

/** `base`, or base-2, base-3 … when the list already holds it (the API refuses a duplicate name). */
export function freeName(base: string, taken: readonly Snapshot[]): string {
  const names = new Set(taken.flatMap((s) => [s.name, s.alias ?? '']));
  if (!names.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!names.has(`${base}-${n}`)) return `${base}-${n}`;
  return base;
}

/** The suggested name of a computer made from a snapshot: "<computer>-<snapshot>", within the 100-character limit. */
export function copyNameFrom(computer: string, snapshot: string): string {
  return `${computer}-${snapshot}`.slice(0, 100).replace(/[-_]+$/, '');
}

/** The list row's count (container list rows carry snapshot_count), or null when the row has none. */
export function countOf(c: object): number | null {
  return num((c as { snapshot_count?: unknown }).snapshot_count);
}

/** A taken snapshot is proved only by a fresh list of that computer showing the sent name, and only for a take sent
 *  after a fresh, complete list lacked that name (`fresh`): otherwise a snapshot of that name may be an older one the
 *  API refused to take again. Anything else proves nothing. */
export function snapshotProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; name?: string; fresh?: unknown };
  if (!i.computer || !i.name || i.fresh !== true) return undefined;
  return (answers[0] ?? []).some((a) => {
    const l = a as SnapshotList | undefined;
    return !!l && l.id === i.computer && l.items.some((s) => s.name === i.name);
  })
    ? 'applied'
    : undefined;
}

/** A restore is proved only by a fresh, complete list of that computer in which the snapshot's last_used_at is set and differs
 *  from the one read before the send (the API moves it when a restore reaches the snapshot); anything else proves
 *  nothing, so an unknown restore stays unknown. */
export function snapshotRestoredProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; name?: string; before?: string | null };
  if (!i.computer || !i.name) return undefined;
  return (answers[0] ?? []).some((a) => {
    const l = a as SnapshotList | undefined;
    const x = l && l.complete && l.id === i.computer ? l.items.find((y) => y.name === i.name) : undefined;
    return !!x && x.lastUsedAt !== null && x.lastUsedAt !== (i.before ?? null);
  })
    ? 'applied'
    : undefined;
}

/** A rename is proved only by a fresh list of that computer in which the snapshot carries exactly the sent label (none
 *  when the label was removed); anything else proves nothing. */
export function snapshotRenamedProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; name?: string; alias?: string | null };
  if (!i.computer || !i.name || i.alias === undefined) return undefined;
  return (answers[0] ?? []).some((a) => {
    const l = a as SnapshotList | undefined;
    const x = l && l.complete && l.id === i.computer ? l.items.find((y) => y.name === i.name) : undefined;
    return !!x && x.alias === i.alias;
  })
    ? 'applied'
    : undefined;
}

/** A deleted snapshot is proved only by a fresh, complete list of that computer without the sent name; anything else
 *  (a malformed answer, an unreadable row) proves nothing. */
export function snapshotGoneProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; name?: string };
  if (!i.computer || !i.name) return undefined;
  return (answers[0] ?? []).some((a) => {
    const l = a as SnapshotList | undefined;
    return !!l && l.complete && l.id === i.computer && !l.items.some((s) => s.name === i.name);
  })
    ? 'applied'
    : undefined;
}
