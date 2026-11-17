// The draft's lifecycle record and its attempts' stored asks as this tab sees them (records.ts, core script-asks storage):
// read again on every store change, this tab's own or another tab's. The record is opened at the first send that needs it
// (a build, or a Make it live), bound where the draft is then; an open record bound elsewhere is rebound first (step 2 moved
// the draft). A record that is no longer open keeps its binding: rebindRecord refuses it, and nothing is sent.
import { subscribeScriptAsksVersion, type DraftMode, type DraftRecord, type ScriptAskPhase } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { bindingOfRecord, type Binding } from '../data';
import { attemptAsks, openRecord, readDraftRecord, rebindRecord, type Moved, type RecordRead } from './records';

/** Moves on every write of the store by this tab and on every change another tab made. */
function useStoreVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribeScriptAsksVersion(() => setV((x) => x + 1)), []);
  return v;
}

/**
 * The owner a binding records for a computer whose agent reported no writer (no AI build there): a draft written by hand or
 * made from an idea still needs a record (validDraftRecord wants an owner) and must restore after a reload. It names no
 * agent; Flow rebinds to the agent's real owner once one is reported, before any AI ask could carry it.
 */
export const NO_WRITER = 'no-writer';

/** The draft's record as stored now. `again` moves on an explicit retry (Check again): a store that could not be read is
 *  read again even when no write moved its version. */
export function useDraftRecord(draftId: string, again = 0): RecordRead {
  const v = useStoreVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the store's version and the retry are the triggers to read again
  return useMemo(() => readDraftRecord(draftId), [draftId, v, again]);
}

const boundTo = (r: DraftRecord, b: Binding): boolean =>
  r.project === b.target.project.id && r.compId === b.target.container.id && r.exec === b.exec && r.realm === b.realm && r.owner === b.owner;

/** The draft's record, opened (or rebound, while open) to `b` before a send. */
export async function ensureRecord(draftId: string, mode: DraftMode, b: Binding): Promise<Moved> {
  const m = await openRecord(draftId, mode, b);
  if (!m.ok || boundTo(m.record, b)) return m;
  return rebindRecord(m.record, b);
}

/** Attempt n's live identity, from its stored ask: the session and turn its progress follows. */
export interface BuildRun {
  phase: ScriptAskPhase;
  sid: string | null;
  turnId: string | null;
  sentAt: number;
}

/** The newest stored ask of attempt n, or null (none stored, or the store cannot be read). */
export function useBuildRun(draftId: string, n: number): BuildRun | null {
  const v = useStoreVersion();
  return useMemo(() => {
    if (n <= 0) return null;
    const asks = attemptAsks(draftId, n);
    if (asks === 'unreadable' || asks.length === 0) return null;
    const a = asks.reduce((x, y) => (y.sentAt > x.sentAt ? y : x));
    return { phase: a.phase, sid: a.sessionId, turnId: a.turnId, sentAt: a.sentAt };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store's version is the trigger to read again
  }, [draftId, n, v]);
}

/**
 * The binding a stored draft record names: its own project, computer, realm, owner and folder, never the editable draft's.
 * Only the containers row of the record's project counts (a container of the same id in another project is not its computer);
 * a row without a project cannot be told apart, so it is 'unknown'. null: gone from a whole list; 'unknown': can't tell yet.
 */
export function bindingOfDraft(r: Pick<DraftRecord, 'project' | 'compId' | 'realm' | 'owner' | 'exec'>, computers: unknown): Binding | null | 'unknown' {
  const o = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
  const body = o(computers).data ? o(o(computers).data) : o(computers);
  if (!Array.isArray(body.computers)) return 'unknown';
  const same = (body.computers as unknown[]).map(o).filter((c) => c.id === r.compId);
  if (same.some((c) => typeof c.project_id !== 'string' || !c.project_id)) return 'unknown';
  const mine = (body.computers as unknown[]).filter((c) => o(c).id !== r.compId || o(c).project_id === r.project);
  const b = bindingOfRecord(r, { data: { computers: mine, pagination: body.pagination } });
  return b && b !== 'unknown' && b.target.project.id !== r.project ? 'unknown' : b;
}
