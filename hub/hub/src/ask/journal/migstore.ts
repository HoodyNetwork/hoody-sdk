// migstore.ts: the layout of hub_ai_mig_v1 as pure functions over its value.
//
//   { v: 1, g: [[h, r, s, c, ct, at] | null, ...], m: { "<b64 key>": "<group index><kind>[<id>]" }, t: { "<day>": ".<b64>.<b64>" } }
//
// A migrated request is a MEMBER keyed by its request key (so any number of decisions for one gate coexist); the key is its hex
// body as base64url (22 characters for a 32-hex key, 16 for a 24-hex request id), which is shorter than any copy of the key in
// the legacy source. A removed member leaves a TOMBSTONE: its key in a day bucket of `t`. `t` always keeps at least one bucket,
// and a removal that would open a new day renames the newest bucket to today instead, so a removal never grows the value.
// Tombstones are collected only inside a write that would pass its limit (collect()), when they are old enough and the key has
// left the legacy source. The same key is at most one of a member and a tombstone.
import * as L from '../logic';
import { okHandle } from './shape';
import type { Entry } from './types';

export type Group = [h: string, r: string, s: string | null, c: string, ct: string, at: number];
export interface Mig { v: 1; g: Array<Group | null>; m: Record<string, string>; t: Record<string, string> }
/** k create, t turn, f turn with files, m message (id = command id, optional), d decision (id = the gate id). */
export type MemberKind = 'k' | 't' | 'f' | 'm' | 'd';
export const DAY_MS = 86_400_000;
export const TOMB_MIN_AGE_DAYS = 7;
/** Tombstones past TOMB_MIN_AGE_DAYS are collected. */
export const TOMB_COLLECT = true;

const HEX32 = /^hx-([0-9a-f]{32})$/, HEX24 = /^hx-([0-9a-f]{24})$/;
const B64 = /^[A-Za-z0-9_-]{16}$|^[A-Za-z0-9_-]{22}$/;
const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The key's hex body as base64url, or null for a key that is not an hx- key of 24 or 32 hex characters. */
export function b64(key: string): string | null {
  const m = HEX32.exec(key) || HEX24.exec(key);
  if (!m) return null;
  const hex = m[1]!;
  let bits = 0, acc = 0, out = '';
  for (let i = 0; i < hex.length; i += 2) {
    acc = (acc << 8) | parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 6) { bits -= 6; out += URLSAFE[(acc >> bits) & 63]; }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += URLSAFE[(acc << (6 - bits)) & 63];
  return out;
}
/** The inverse of b64. */
export function unb64(s: string): string | null {
  if (!B64.test(s)) return null;
  let bits = 0, acc = 0, hex = '';
  for (const ch of s) {
    acc = (acc << 6) | URLSAFE.indexOf(ch);
    bits += 6;
    while (bits >= 8) { bits -= 8; hex += ((acc >> bits) & 255).toString(16).padStart(2, '0'); }
    acc &= (1 << bits) - 1;
  }
  return 'hx-' + hex;
}

export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);
export const emptyMig = (day: number): Mig => ({ v: 1, g: [], m: {}, t: { [String(day)]: '' } });
export const sizeOf = (m: Mig): number => JSON.stringify(m).length;
export const cloneMig = (m: Mig): Mig => ({ v: 1, g: m.g.map((x) => (x ? ([...x] as Group) : null)), m: { ...m.m }, t: { ...m.t } });

const MEMBER = /^(\d{1,5})([ktfmd])(.*)$/;
/** The validated value, or null when it is not a Mig (corrupt: unreadable, never an empty import). */
export function parseMig(v: unknown): Mig | null {
  if (!L.isObj(v) || Array.isArray(v) || v.v !== 1 || !Array.isArray(v.g) || !L.isObj(v.m) || Array.isArray(v.m) || !L.isObj(v.t) || Array.isArray(v.t)) return null;
  const g: Array<Group | null> = [];
  for (const x of v.g as unknown[]) {
    if (x === null) { g.push(null); continue; }
    if (!Array.isArray(x) || x.length !== 6) return null;
    const [h, r, s, c, ct, at] = x as unknown[];
    if (!okHandle(h) || typeof r !== 'string' || (s !== null && !L.seg(s)) || typeof c !== 'string' || typeof ct !== 'string' || typeof at !== 'number') return null;
    g.push([h, r, s as string | null, c, ct, at]);
  }
  const m: Record<string, string> = {};
  for (const k of Object.keys(v.m)) {
    const val = (v.m as Record<string, unknown>)[k];
    if (!B64.test(k) || typeof val !== 'string') return null;
    const mm = MEMBER.exec(val);
    if (!mm || !g[Number(mm[1])]) return null;
    m[k] = val;
  }
  const t: Record<string, string> = {};
  for (const k of Object.keys(v.t)) {
    const val = (v.t as Record<string, unknown>)[k];
    if (!/^\d{4,6}$/.test(k) || typeof val !== 'string' || !/^(\.[A-Za-z0-9_-]{16}|\.[A-Za-z0-9_-]{22})*$/.test(val)) return null;
    t[k] = val;
  }
  if (Object.keys(t).length === 0) return null;
  return { v: 1, g, m, t };
}

const tokens = (bucket: string): string[] => bucket.split('.').filter(Boolean);
/** Whether `key` is tombstoned in any bucket. */
export function hasTomb(m: Mig, key: string): boolean {
  const b = b64(key);
  if (!b) return false;
  for (const day of Object.keys(m.t)) if (tokens(m.t[day]!).includes(b)) return true;
  return false;
}
export const isMember = (m: Mig, key: string): boolean => { const b = b64(key); return !!b && Object.prototype.hasOwnProperty.call(m.m, b); };

/** The group's slot (an existing group with the same tuple, ignoring `at`, or a new one in the first null slot or at the end). */
export function groupIndex(m: Mig, g: Group): number {
  for (let i = 0; i < m.g.length; i++) {
    const x = m.g[i];
    if (x && x[0] === g[0] && x[1] === g[1] && x[2] === g[2] && x[3] === g[3] && x[4] === g[4]) return i;
  }
  const free = m.g.indexOf(null);
  if (free >= 0) { m.g[free] = g; return free; }
  m.g.push(g);
  return m.g.length - 1;
}
/** Adds a member (mutates m). false: the key cannot be encoded, or is already a member or a tombstone. */
export function addMember(m: Mig, g: Group, kind: MemberKind, key: string, id?: string): boolean {
  const b = b64(key);
  if (!b || isMember(m, key) || hasTomb(m, key)) return false;
  const i = groupIndex(m, g);
  m.m[b] = `${i}${kind}${id ?? ''}`;
  return true;
}

/** The members as scan entries (m: 1). */
export function members(m: Mig): Entry[] {
  const out: Entry[] = [];
  for (const b of Object.keys(m.m)) {
    const key = unb64(b), mm = MEMBER.exec(m.m[b]!);
    const grp = mm ? m.g[Number(mm[1])] : null;
    if (!key || !mm || !grp) continue;
    const kind = mm[2] as MemberKind, id = mm[3]!;
    const [h, r, s, c, ct, at] = grp;
    const e: Entry = { k: key, kind: kind === 'k' ? 'create' : kind === 'd' ? 'decision' : kind === 'm' ? 'message' : 'turn', h, r, s, c, ct, at, m: 1 };
    if (kind === 'f') e.f = 1;
    if (kind === 'd' && id) e.g = id;
    if (kind === 'm' && id) e.ci = id;
    out.push(e);
  }
  return out;
}
/** The command id a migrated message member carries, if any. */
export function memberId(m: Mig, key: string): string {
  const b = b64(key), mm = b ? MEMBER.exec(m.m[b] ?? '') : null;
  return mm ? mm[3]! : '';
}

/** Adds a tombstone for `key` (mutates m): to today's bucket, else by renaming the newest bucket to today (same byte length). */
export function addTomb(m: Mig, key: string, day: number): boolean {
  const b = b64(key);
  if (!b) return false;
  if (hasTomb(m, key)) return true;
  const today = String(day);
  if (!Object.prototype.hasOwnProperty.call(m.t, today)) {
    const newest = Object.keys(m.t).sort().pop();
    if (newest === undefined) m.t[today] = '';
    else if (newest.length === today.length) { m.t[today] = m.t[newest]!; delete m.t[newest]; }
    else m.t[today] = '';
  }
  m.t[today] += '.' + b;
  return true;
}
/** Removes the member and leaves its tombstone (mutates m). 'absent': it was not a member. */
export function removeMember(m: Mig, key: string, day: number): 'removed' | 'absent' {
  const b = b64(key);
  if (!b || !Object.prototype.hasOwnProperty.call(m.m, b)) return 'absent';
  const mm = MEMBER.exec(m.m[b]!);
  delete m.m[b];
  addTomb(m, key, day);
  if (mm) {
    const i = Number(mm[1]);
    if (!Object.values(m.m).some((v) => MEMBER.exec(v)?.[1] === mm[1])) m.g[i] = null;
    while (m.g.length && m.g[m.g.length - 1] === null) m.g.pop();
  }
  return 'removed';
}

/** Drops tombstones until `fits()` holds: only buckets at least TOMB_MIN_AGE_DAYS old, only keys `inSource` says have left the
 *  legacy source, oldest bucket first, never deleting the last bucket (it is emptied). Returns how many were dropped. */
export function collect(m: Mig, day: number, inSource: (key: string) => boolean, fits: () => boolean): number {
  if (!TOMB_COLLECT) return 0;
  let dropped = 0;
  for (const d of Object.keys(m.t).sort()) {
    if (fits()) break;
    if (day - Number(d) < TOMB_MIN_AGE_DAYS) continue;
    const left = tokens(m.t[d]!);
    for (let i = 0; i < left.length && !fits();) {
      const key = unb64(left[i]!);
      if (key && !inSource(key)) { left.splice(i, 1); dropped++; m.t[d] = left.map((x) => '.' + x).join(''); }
      else i++;
    }
  }
  return dropped;
}
