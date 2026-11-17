// The vault page's pure rules: partitions, key names, the hoody.* guard, the metadata a write sends and the
// proof of a held write. No React, no core calls (data.ts and the view call these).
//
// Partitions: the vault keeps one set of entries per realm plus a global set. A key in realm A, in realm B and in
// Global are three different entries. On the wire only the realm_id query names the partition: Global sends
// none (the API refuses `realm_id=`), a realm sends its 24-hex id in lower case; 'all' is never a partition.
import { utf8Bytes } from '@core/pure';
import { isEncrypted } from './crypto';

/** '' is Global; anything else a lower-case 24-hex realm id. */
export type Partition = string;
export const GLOBAL: Partition = '';

const RE24 = /^[0-9a-fA-F]{24}$/;

/** A partition from a realm id ('' or 'global' → Global); null for anything else, 'all' included. */
export function partitionOf(realm: string | null | undefined): Partition | null {
  if (realm === '' || realm === 'global') return GLOBAL;
  if (typeof realm === 'string' && RE24.test(realm)) return realm.toLowerCase();
  return null;
}

/** The query a vault call carries for a partition: none for Global, {realm_id} for a realm. */
export function partitionQuery(p: Partition): { realm_id?: string } {
  if (p === GLOBAL) return {};
  if (!RE24.test(p)) throw new Error('VAULT_PARTITION');
  return { realm_id: p.toLowerCase() };
}

/** Key names the API takes: [a-zA-Z0-9._-]; the router answers 404 past 100 characters (maxParamLength). */
export const KEY_MAX = 100;
const KEY_RE = /^[a-zA-Z0-9._-]+$/;

export type KeyProblem = 'empty' | 'too_long' | 'chars' | 'reserved';

/** Why a NEW key name cannot be used (null: it can). hoody.* names belong to Hoody's own tools. */
export function keyProblem(name: string): KeyProblem | null {
  if (!name) return 'empty';
  if (name.length > KEY_MAX) return 'too_long';
  if (!KEY_RE.test(name)) return 'chars';
  if (isHoodyKey(name)) return 'reserved';
  return null;
}

/** An entry Hoody's own tools keep (realm nicknames, keys, backups…): read-only in the Hub. */
export function isHoodyKey(key: string): boolean {
  return key.startsWith('hoody.');
}

/** The Hub's own entry: realm nicknames (core/realm.ts). */
export const ALIAS_KEY = 'hoody.realm-aliases';

/** One row of GET /vault/keys (metadata only: the list never carries a value). */
export interface VaultRow {
  readonly key: string;
  readonly realm_id: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly size_bytes: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The rows of a list answer ({data: rows}); malformed rows are left out. An answer without a `data` array is no list:
 *  it throws BAD_LIST (the read's error state), never reads as an empty partition, so New and Import never take a name
 *  for free on it and overwrite the entry it holds. */
export function rowsOf(answer: unknown): VaultRow[] {
  const data = asRecord(answer)?.data;
  if (!Array.isArray(data)) throw { kind: 'unavailable', status: 0, code: 'BAD_LIST' };
  const out: VaultRow[] = [];
  for (const r of data) {
    const o = asRecord(r);
    if (!o || typeof o.key !== 'string' || !o.key) continue;
    out.push({
      key: o.key,
      realm_id: typeof o.realm_id === 'string' ? o.realm_id : '',
      metadata: asRecord(o.metadata),
      size_bytes: typeof o.size_bytes === 'number' && Number.isFinite(o.size_bytes) ? o.size_bytes : 0,
      created_at: typeof o.created_at === 'string' ? o.created_at : '',
      updated_at: typeof o.updated_at === 'string' ? o.updated_at : '',
    });
  }
  return out;
}

/**
 * The lock hint: the reserved metadata.encrypted marker, or this view has seen the value is an envelope. False means
 * only "not marked": an envelope saved without the marker reads false until its value is read, so the words for
 * false never say "not encrypted".
 */
export function looksEncrypted(row: Pick<VaultRow, 'key' | 'metadata'>, seen: ReadonlySet<string>): boolean {
  return seen.has(row.key) || row.metadata?.encrypted === true;
}

/** Metadata the API takes (JSON, at most 256 KB). */
export const METADATA_MAX_BYTES = 256 * 1024;

/** The metadata keys the Hub keeps itself (the lock marker and the write id): never the person's to set. */
const HUB_METADATA_KEYS: readonly string[] = ['encrypted', 'write_id'];

/**
 * The person's own metadata: the entry's, without the Hub's keys. Built with Object.fromEntries (data properties),
 * so any JSON key survives, `__proto__` included (an assignment would call the prototype setter and drop it).
 */
export function userMetadata(m: Readonly<Record<string, unknown>> | null | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m ?? {}).filter(([k]) => !HUB_METADATA_KEYS.includes(k)));
}

/** Nesting deeper than this is shown compact: indentation grows with depth, so pretty text could explode. */
const PRETTY_DEPTH = 20;

/** True when `v` nests deeper than `limit` (an explicit stack: no recursion on a deep value). */
function deeperThan(v: unknown, limit: number): boolean {
  const stack: Array<[unknown, number]> = [[v, 0]];
  while (stack.length) {
    const [x, d] = stack.pop()!;
    if (x === null || typeof x !== 'object') continue;
    if (d >= limit) return true;
    for (const c of Object.values(x as object)) stack.push([c, d + 1]);
  }
  return false;
}

/**
 * The person's metadata as the form shows it: JSON of an object (pretty unless it nests deeply), or empty when
 * there is none. null when it cannot be written out here (a value too deep for the browser): it is then not
 * editable, never shown as empty (an empty field clears it).
 */
export function metadataText(m: Readonly<Record<string, unknown>> | null | undefined): string | null {
  const own = userMetadata(m);
  if (!Object.keys(own).length) return '';
  try {
    return deeperThan(own, PRETTY_DEPTH) ? JSON.stringify(own) : JSON.stringify(own, null, 2); // reason: the text the person edits in the metadata TextArea, never shown as a block to read
  } catch {
    return null;
  }
}

export type MetadataParse =
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; why: 'json' | 'object' | 'reserved' };

/** Metadata typed in the form: empty text is none (null); otherwise a JSON object without the Hub's keys. */
export function parseMetadata(text: string): MetadataParse {
  if (!text.trim()) return { ok: true, value: null };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, why: 'json' };
  }
  const o = asRecord(v);
  if (!o) return { ok: false, why: 'object' };
  if (Object.keys(o).some((k) => HUB_METADATA_KEYS.includes(k))) return { ok: false, why: 'reserved' };
  return { ok: true, value: o };
}

/** One metadata value as text: a string as it is, anything else as JSON; null when it cannot be written out. */
export function metadataValueText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return null;
  }
}

export type MetadataWrite =
  | { ok: true; metadata: Record<string, unknown> }
  // 'size': over the API's limit; 'unwritable': this browser cannot write it out (nested too deeply), so it
  // cannot be sent at all: the request body is written the same way.
  | { ok: false; why: 'size' | 'unwritable' };

/**
 * The metadata a PUT sends: the person's metadata (`own` when the form set it, null for none; otherwise the
 * entry's current metadata from a list read just before), never the old `encrypted` marker or write id, plus this
 * write's id, plus `encrypted: true` when the value is an envelope. Never empty, so it is always sent: an omitted
 * metadata would keep a stale marker server-side.
 */
export function metadataWrite(
  prior: Readonly<Record<string, unknown>> | null,
  writeId: string,
  value: string,
  own?: Readonly<Record<string, unknown>> | null,
): MetadataWrite {
  const rest = userMetadata(own === undefined ? prior : own);
  const meta: Record<string, unknown> = { ...rest, write_id: writeId };
  if (isEncrypted(value)) meta.encrypted = true;
  let text: string;
  try {
    text = JSON.stringify(meta);
  } catch {
    return { ok: false, why: 'unwritable' };
  }
  return utf8Bytes(text) > METADATA_MAX_BYTES ? { ok: false, why: 'size' } : { ok: true, metadata: meta };
}

/** metadataWrite's metadata, or null when it cannot be sent (over the limit, or not writable here). */
export function writeMetadata(
  prior: Readonly<Record<string, unknown>> | null,
  writeId: string,
  value: string,
  own?: Readonly<Record<string, unknown>> | null,
): Record<string, unknown> | null {
  const w = metadataWrite(prior, writeId, value, own);
  return w.ok ? w.metadata : null;
}

/** The safe identity a held write keeps (never a value, a password, an envelope or a digest of one). */
export type HeldIdentity =
  | { readonly partition: Partition; readonly op: 'put'; readonly key: string; readonly write_id: string }
  | { readonly partition: Partition; readonly op: 'delete'; readonly key: string }
  | { readonly partition: Partition; readonly op: 'clear' };

/** A held identity read back from core (a deep-frozen copy), or null when it is not one of ours. */
export function heldIdentity(v: unknown): HeldIdentity | null {
  const o = asRecord(v);
  if (!o || typeof o.partition !== 'string' || partitionOf(o.partition) !== o.partition) return null;
  if (o.op === 'put' && typeof o.key === 'string' && typeof o.write_id === 'string' && o.write_id) return { partition: o.partition, op: 'put', key: o.key, write_id: o.write_id };
  if (o.op === 'delete' && typeof o.key === 'string') return { partition: o.partition, op: 'delete', key: o.key };
  if (o.op === 'clear') return { partition: o.partition, op: 'clear' };
  return null;
}

/**
 * The proof of a held PUT from a fresh list of ITS partition: 'applied' only when the entry carries this write's
 * id. Anything else proves nothing (a late commit can still land), so the hold stays. DELETE and Clear are never
 * proved by a read (an empty read can come before a queued delete); only a warned Dismiss frees them.
 */
export function putProved(id: HeldIdentity, rows: readonly VaultRow[]): boolean {
  if (id.op !== 'put') return false;
  const row = rows.find((r) => r.key === id.key);
  return !!row && row.metadata?.write_id === id.write_id;
}

/** "Clear vault" asks the person to type the partition's name; exact match after trimming the ends. */
export function typedConfirmMatches(typed: string, name: string): boolean {
  return name.length > 0 && typed.trim() === name;
}
