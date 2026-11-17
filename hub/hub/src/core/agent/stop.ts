// Stop everything in a realm: POST /stop (stopAll). Realm-scoped (the context's realm,
// or the one named), paged: one call acts on at most 256 items and answers a cursor for the rest. One declared route,
// one settled Api (sent once: a lost answer is pending) and the reading of the answer. The answer is read defensively
// and never as more than it says: `complete` is that the call reached everything it could see, not that everything
// stopped; an item with an outcome this page does not know is not stopped.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';
import { isRecord } from '../shape';

export const stopRoutes = {
  stop: defineRoute<unknown, { after?: string }>({ method: 'POST', path: '/stop', scope: 'agent', body: ['after'] }),
} as const;

export interface StopApi {
  /** `after`: a next_cursor this very run's earlier call returned, unchanged; never any other value. `realm`: default the context's. */
  stop(after?: string, realm?: string): Promise<Settled<unknown>>;
}

export function stopApi(target?: Target): StopApi {
  return {
    stop: (after, realm) => {
      const input = { ...(after === undefined ? {} : { body: { after } }), ...(realm ? { realm } : {}), ...(target ? { target } : {}) } as CallInput;
      return call(stopRoutes.stop as Route, input, true);
    },
  };
}

export type StopOutcome = 'stopped' | 'already_done' | 'failed' | 'unknown';
export interface StopItem { kind: string; id: string; outcome: StopOutcome; detail?: string }
export interface StopRef { kind: string; id: string }
export interface NotCovered { kind: string; reason: string; count?: number }
/** One call's answer. */
export interface StopPage {
  items: StopItem[];
  /** Running at the end of the call, not at its start: not stopped. */
  started: StopRef[];
  /** With `after`: still running at or before the cursor, not acted on by this call. */
  behind: StopRef[];
  complete: boolean;
  next: string | null;
  notCovered: NotCovered[];
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const refs = (v: unknown): StopRef[] | null => {
  if (!Array.isArray(v)) return null;
  const out: StopRef[] = [];
  for (const x of v) {
    if (!isRecord(x)) return null;
    const kind = text(x.kind, 64), id = text(x.id, 512);
    if (kind === null || id === null) return null;
    out.push({ kind, id });
  }
  return out;
};

/** The answer as a page; null when it is not readable as one (then nothing is claimed about what stopped). */
export function stopPageOf(body: unknown): StopPage | null {
  if (!isRecord(body) || !Array.isArray(body.items) || typeof body.complete !== 'boolean') return null;
  const items: StopItem[] = [];
  for (const x of body.items) {
    if (!isRecord(x)) return null;
    const kind = text(x.kind, 64), id = text(x.id, 512);
    if (kind === null || id === null) return null;
    const o = x.outcome;
    const outcome: StopOutcome = o === 'stopped' || o === 'already_done' || o === 'failed' ? o : 'unknown';
    const detail = text(x.detail, 2000);
    items.push({ kind, id, outcome, ...(detail ? { detail } : {}) });
  }
  // The route always sends all three arrays: a page without them says nothing about what was left.
  const started = refs(body.started_during_call);
  const behind = refs(body.behind_cursor);
  if (started === null || behind === null) return null;
  const next = body.next_cursor === undefined ? null : text(body.next_cursor, 4096);
  if (body.next_cursor !== undefined && next === null) return null;
  const notCovered: NotCovered[] = [];
  if (!Array.isArray(body.not_covered)) return null;
  for (const x of body.not_covered) {
    if (!isRecord(x)) return null;
    const kind = text(x.kind, 64), reason = text(x.reason, 2000);
    if (kind === null || reason === null) return null;
    notCovered.push({ kind, reason, ...(typeof x.count === 'number' && Number.isSafeInteger(x.count) && x.count >= 0 ? { count: x.count } : {}) });
  }
  return { items, started, behind, complete: body.complete, next, notCovered };
}
