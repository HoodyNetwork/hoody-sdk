// evidence.ts: what a LEGACY chat record (hub_ask_v1, from an earlier release) holds as request evidence, as journal entries.
// Used by migration (members of hub_ai_mig_v1), by scan() (source rows) and by the dock writer (copy-through).
import type { AskRecord } from '../logic';
import type { Entry } from './types';
import { b64, type Group, type MemberKind } from './migstore';
import { okHandle } from './shape';

/** The record fields that are request evidence: the dock never stores a key of this release in them. */
export const EVIDENCE = ['w', 'wf', 'k3', 'c3', 'kw', 'kwf', 'da'] as const;

export interface Ev { key: string; kind: MemberKind; id?: string }

/** The evidence keys of one record, minus those the person dismissed in an earlier release (its own `dk`) and those that cannot be
 *  encoded (not an hx- key of 24 or 32 hex characters). */
export function evidenceOf(rec: AskRecord): Ev[] {
  const out: Ev[] = [];
  if (rec.s === null) out.push({ key: rec.k1, kind: 'k' });
  if (rec.w) out.push({ key: rec.k2, kind: rec.wf ? 'f' : 't' });
  for (const k of rec.kw ?? []) out.push({ key: k, kind: rec.kwf?.includes(k) ? 'f' : 't' });
  for (const k of rec.k3 ?? []) out.push({ key: k, kind: 'm', ...(rec.c3?.[k] ? { id: rec.c3[k] } : {}) });
  for (const [g, rid] of Object.entries(rec.da ?? {})) out.push({ key: rid, kind: 'd', id: g });
  const dk = new Set(rec.dk ?? []);
  const seen = new Set<string>();
  return out.filter((e) => !dk.has(e.key) && b64(e.key) !== null && !seen.has(e.key) && (seen.add(e.key), true));
}

/** The record's group tuple, or null when its computer does not resolve. */
export function groupOf(rec: AskRecord, handleOf: (container: string) => string | null, at: number): Group | null {
  const h = handleOf(rec.c);
  return okHandle(h) ? [h, rec.r, rec.s, rec.k1, rec.c, at] : null;
}

/** The entry view of one evidence key of a record (a source row: m 2). */
export function viewOf(g: Group, ev: Ev, m: 1 | 2): Entry {
  const [h, r, s, c, ct, at] = g;
  const e: Entry = { k: ev.key, kind: ev.kind === 'k' ? 'create' : ev.kind === 'd' ? 'decision' : ev.kind === 'm' ? 'message' : 'turn', h, r, s, c, ct, at, m };
  if (ev.kind === 'f') e.f = 1;
  if (ev.kind === 'd' && ev.id) e.g = ev.id;
  if (ev.kind === 'm' && ev.id) e.ci = ev.id;
  return e;
}
