// The Building section's pure part (split out of Building.tsx so the terminal build shares it; the design notes are at
// the top of Building.tsx): the build IO (live and fixture), timings, held deploys and the open links. Building.tsx
// re-exports the public names; handleOf, factsKey, turnAskOf, isObj, TurnHandle and Got are for Building.tsx.
import { chooseComputer, computerHandle, EXEC_DEFAULT, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '@core';
import { stopStoredBuild, storedBuildReads, type Binding, type StoredBuildReads } from '../data';
import type { BuildEntry, BuildFacts, BuildRow, StepWord } from '../building';
import { execOf, itemId } from '../logic';
import { discardDraft } from '../new/records';
import { closeAsk, receiptOf } from '../writer';

type Records = { drafts: readonly DraftRecord[]; asks: readonly ScriptAsk[] } | 'unreadable';
/** What the section reads and sends. The live one is this browser's store and each build's own computer; fixture mode and
 *  tests give theirs. */
export interface BuildIO {
  records: () => Records;
  reads: StoredBuildReads;
  /** Stop one turn on the build's computer (stopStoredBuild). 'unknown': it may have been taken (C9). */
  stop: (b: Binding, sid: string, turnId: string) => Promise<boolean | 'unknown'>;
  /** discardDraft: `removed` is each ask as the discard removed it (it may hold a turn stored after the row was read).
   *  `mayBeDeployed`: a draft under a deploy nobody answered for, discarded after the warning that it may be live. */
  discard: (r: DraftRecord, o?: { mayBeDeployed?: boolean }) => Promise<{ ok: true; clean: boolean; removed?: readonly ScriptAsk[] } | { ok: false; why: string }>;
  /** End one stored ask where it was made (a row without its draft record); `removed` gets the ask exactly as it was removed. */
  close: (a: ScriptAsk, removed?: (s: ScriptAsk) => void) => Promise<'ok' | 'unknown'>;
}
export const liveBuildIO: BuildIO = {
  records: () => {
    const drafts = readDraftRecords(), asks = readScriptAsks();
    return drafts === 'unreadable' || asks === 'unreadable' ? 'unreadable' : { drafts, asks };
  },
  reads: storedBuildReads,
  stop: (b, sid, turnId) => stopStoredBuild(b, sid, turnId),
  discard: (r, o) => discardDraft(r, o),
  close: (a, removed) => (a.realm && a.owner ? closeAsk({ compId: a.compId, path: a.path, realm: a.realm, owner: a.owner }, removed) : Promise.resolve('unknown')),
};

/** How often unsettled rows are read again, and how often a deploy's heartbeat is looked at again (a local
 *  clock: nothing is read or sent). Tests move them. */
export const buildTiming = { everyMs: 5000, clockMs: 5000 };

/** What a stop, a cancel or its read is addressed to: the row's own turn on the row's own computer. */
export type TurnHandle = { b: Binding; sid: string; turnId: string };
export const handleOf = (l: BuildLine): TurnHandle | null => {
  const a = l.entry.ask;
  return a?.sessionId && a.turnId && l.binding && l.binding !== 'unknown' ? { b: l.binding, sid: a.sessionId, turnId: a.turnId } : null;
};

/** A row of a draft under a deploy nobody answered for (held, or its sender's beat stale): Check reads its script, and Discard
 *  warns that it may already be live. */
export const heldDeploy = (l: BuildLine): boolean => l.entry.record?.state === 'deploying' && l.row.pill === 'goingLiveUnknown';

export interface Got extends BuildFacts {
  session?: unknown;
  state?: unknown;
}
/** A row's reads belong to its ask as read: an ask that moved on (phase, session, turn) starts over. */
export const factsKey = (a: ScriptAsk): string => `${a.askId}|${a.phase}|${a.sessionId ?? ''}|${a.turnId ?? ''}`;

export interface BuildLine {
  entry: BuildEntry;
  row: BuildRow;
  binding: Binding | null | 'unknown';
  name: string | null;
  /** null: no session yet ("Starting…"); '': unreadable ("A new script"); else the description. */
  label: string | null;
  step: StepWord | null;
  stopping: boolean;
}

/** The fixture state's builds (fixtures.ts `builds`): the store, the containers answer, and what each session's reads answer. */
export interface FxBuilds {
  drafts: DraftRecord[];
  asks: ScriptAsk[] | 'unreadable';
  computers: unknown;
  /** Per session id: first_message, the receipt state, the answer (null: no text), and current_step. */
  sessions?: Record<string, { first?: string; receipt?: string; answer?: string | null; step?: { kind: string; tool?: string } }>;
}
/** A BuildIO over a fixture state: Stop and Discard change only this IO's copy. */
export function fixtureBuildIO(fx: FxBuilds): BuildIO {
  let drafts = [...fx.drafts];
  let asks = fx.asks === 'unreadable' ? ('unreadable' as const) : [...fx.asks];
  const ses = Object.fromEntries(Object.entries(fx.sessions ?? {}).map(([k, v]) => [k, { ...v }]));
  const fail = (): 'unreadable' => 'unreadable';
  return {
    records: () => (asks === 'unreadable' ? 'unreadable' : { drafts, asks }),
    reads: {
      session: async (_b, sid) => (ses[sid]?.first !== undefined ? { session: { id: sid, first_message: ses[sid]!.first } } : fail()),
      receipt: async (_b, sid, tid) => (ses[sid]?.receipt ? receiptOf({ turn_id: tid, state: ses[sid]!.receipt }) ?? fail() : fail()),
      transcript: async (_b, sid) => {
        const a = ses[sid]?.answer;
        return a === undefined ? fail() : { turns_total: 1, messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: a === null ? [{ kind: 'tool_use' }] : [{ kind: 'text', text: a }] }] };
      },
      state: async (_b, sid) => (ses[sid]?.step ? { session_id: sid, state: 'running', live: true, current_step: ses[sid]!.step } : fail()),
      replay: async () => fail(),
    },
    stop: async (_b, sid) => { if (ses[sid]) ses[sid]!.receipt = 'cancelled'; return true; },
    discard: async (r) => {
      drafts = drafts.map((d) => (d.draftId === r.draftId ? { ...d, state: 'discarded' as const } : d));
      if (asks !== 'unreadable') asks = asks.filter((a) => !a.path?.includes(`/${r.draftId}.`));
      return { ok: true, clean: true };
    },
    close: async (x) => { if (asks !== 'unreadable') asks = asks.filter((a) => a.askId !== x.askId); return 'ok'; },
  };
}

/** Open a build: show its computer when the binding names one, then its New script page at its own folder. */
export function openBuild(l: BuildLine, go: (to: string) => void): void {
  const b = l.binding;
  if (b && b !== 'unknown') chooseComputer({ id: b.target.container.id, project_id: b.target.project.id, ...(b.target.container.server_name !== undefined ? { server_name: b.target.container.server_name } : {}) });
  const r = l.entry.record;
  if (l.entry.legacy || !r) { go('/scripts/new'); return; }
  go(`/scripts/new/${encodeURIComponent(r.draftId)}${r.exec !== EXEC_DEFAULT ? `?exec=${r.exec}` : ''}`);
}

/** Open a change request's drawer: its computer shown when one containers row names it, then the script with its AI drawer. */
export function openChange(a: ScriptAsk, computers: unknown, go: (to: string) => void): void {
  const body = isObj(computers) && isObj(computers.data) ? computers.data : computers;
  const rows = (isObj(body) && Array.isArray(body.computers) ? body.computers : []).filter((c): c is Record<string, unknown> => isObj(c) && c.id === a.compId);
  const row = rows.length === 1 ? rows[0]! : null;
  if (row && typeof row.project_id === 'string') chooseComputer({ id: a.compId, project_id: row.project_id, ...(typeof row.server_name === 'string' ? { server_name: row.server_name } : {}) });
  const path = a.path ?? '';
  const ex = execOf(path) ?? EXEC_DEFAULT;
  go(`/scripts?sel=${encodeURIComponent(itemId(computerHandle({ id: a.compId, name: row && typeof row.name === 'string' ? row.name : '' }), path))}&ai=1${ex !== EXEC_DEFAULT ? `&exec=${ex}` : ''}`);
}
/** The ask whose recorded turn a discard reports: the removed copy of the row's own ask, else the row's ask, else the latest other
 *  removed ask; only one holding a session and a turn. */
export function turnAskOf(removed: readonly ScriptAsk[], shown: ScriptAsk | null): ScriptAsk | null {
  const latest = [...removed].sort((x, y) => y.sentAt - x.sentAt);
  const order = [...latest.filter((a) => a.askId === shown?.askId), ...(shown ? [shown] : []), ...latest];
  return order.find((a) => !!a.sessionId && !!a.turnId) ?? null;
}
export const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
