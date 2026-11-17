// The Referrals page's data: the program read, the code check and the three writes (join, create a custom code,
// release one) under core's change controls. A write whose answer is lost is held by core's lock until
// a fresh `me` proves it (joinProves, createProves, releaseProves: only "applied") or the person stops watching it;
// a press meanwhile sends nothing (READ_BACK_FIRST). The locks are account-wide: /referrals is base in every realm view.
import { coreSource, errorInfo, useCan, useChangesVersion, type HeldRow, type SourceResult, type SourceTable } from '@core';
import { useCallback, useRef, useState } from 'react';
import { changeNote, createProves, joinProves, releaseProves, selectMe, type ChangeKind, type ChangeNote, type Me } from './logic';
import { routes } from './routes';

/** Shared with any page that ever sends these changes: the join, and every change of one code (create, release). */
export const JOIN_LOCK = 'referrals-join';
export const CODE_LOCK = 'referrals-code';
type CodeVars = { code: string };

export const referralsTable: SourceTable = {
  reads: {
    me: { route: routes.me, select: selectMe },
    check: { route: routes.check, input: (p: { code: string }) => ({ query: { code: p.code } }), select: (raw: unknown) => raw },
  },
  changes: {
    join: {
      route: routes.join,
      input: () => ({ body: {} }),
      select: () => undefined,
      reads: ['me'],
      lock: JOIN_LOCK,
      // One join per account: the empty identity keeps the lock addressable by hold.
      lockKey: () => ({}),
      proves: joinProves,
    },
    create: {
      route: routes.create,
      input: (v: CodeVars) => ({ body: { code: v.code } }),
      select: () => undefined,
      reads: ['me'],
      lock: CODE_LOCK,
      lockKey: (v: CodeVars) => ({ code: v.code }),
      proves: createProves,
    },
    release: {
      route: routes.release,
      input: (v: CodeVars) => ({ params: { code: v.code } }),
      select: () => undefined,
      reads: ['me'],
      lock: CODE_LOCK,
      lockKey: (v: CodeVars) => ({ code: v.code }),
      proves: releaseProves,
    },
  },
};
const source = coreSource('referrals', referralsTable);

/** The program: an answer, the read's error, or neither while it loads. A token session (`account` false) sends
 *  nothing: the program is the account's own, and core would refuse it unsent anyway. */
export function useMe() {
  const account = useCan('account');
  const q = source.useQuery<Me, void>('me', undefined, { enabled: account });
  return {
    account,
    me: q.data,
    isPending: q.isPending,
    isFetching: q.isFetching,
    error: q.isError ? q.error : null,
    refetch: () => void source.invalidate(['me']),
  };
}

/** One custom-code check (a GET: nothing is reserved). Disabled while the code is empty. */
export function useCheck(code: string) {
  return source.useQuery<unknown, { code: string }>('check', { code }, { enabled: code.length > 0 });
}

export const invalidateMe = () => source.invalidate(['me']);

export type WriteResult = Pick<SourceResult<unknown>, 'outcome' | 'code' | 'status' | 'retryAfter' | 'traceId' | 'route'>;

export interface Write<V> {
  /** One press: core sends it once, or refuses it unsent while an earlier one of the same change may have gone through. */
  run(vars: V): Promise<WriteResult>;
  running: boolean;
  /** This change's sends core holds now (from any mount, reload or tab), oldest first. */
  held: readonly HeldRow[];
  /** Check again: read `me` now; a proof frees the hold, anything else keeps it. */
  check(): Promise<void>;
  checking: boolean;
  /** The person's warned Stop watching for one listed hold (the kit's dialog warned first). */
  stopWatching(row: HeldRow): Promise<void>;
}

function useWrite<V>(key: ChangeKind): Write<V> {
  const m = source.useMutation<unknown, V>(key);
  // The held rows are read at render: re-render on every change of core's holds (another tab proving or dismissing one
  // of several leaves the mutation's pending/busy as they were).
  useChangesVersion();
  const mref = useRef(m);
  mref.current = m;
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const run = useCallback(async (vars: V): Promise<WriteResult> => {
    setRunning(true);
    try {
      const r = await mref.current.mutateAsync(vars);
      const { outcome, status, retryAfter, traceId, route } = r;
      // The code as the kit reads it: a body's `error` that is no code (a bare 400's "Bad Request") is none.
      const code = errorInfo(r).code ?? undefined;
      return { outcome, ...(code !== undefined ? { code } : {}), ...(status !== undefined ? { status } : {}), ...(retryAfter !== undefined ? { retryAfter } : {}), ...(traceId ? { traceId } : {}), ...(route ? { route } : {}) };
    } catch {
      // Core answered no outcome: it may have gone through, never "failed" (C9).
      return { outcome: 'pending' };
    } finally {
      setRunning(false);
    }
  }, []);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      await mref.current.readBack();
    } finally {
      setChecking(false);
    }
  }, []);
  const stopWatching = useCallback(async (row: HeldRow) => {
    await mref.current.dismissHeld(row);
    void invalidateMe();
  }, []);
  return { run, running, held: m.held(), check, checking, stopWatching };
}

export const useJoin = () => useWrite<Record<string, never>>('join');
export const useCreateCode = () => useWrite<CodeVars>('create');
export const useReleaseCode = () => useWrite<CodeVars>('release');

/** What the page says about the last write: its note and the rejection's facts (for the banner's Details). */
export interface Said {
  readonly note: ChangeNote;
  readonly error: { status?: number; code?: string; traceId?: string; route?: string };
}
/** Tell the page a write's result (`say(null)` clears the note). */
export type Say = (kind: ChangeKind | null, r?: WriteResult) => void;

/** The page's one note about the last write, and its rule: a refusal that means the program changed under the page
 *  reads `me` again, so the state it shows takes over. */
export function useNote(): [Said | null, Say] {
  const [said, setSaid] = useState<Said | null>(null);
  const say = useCallback<Say>((kind, r) => {
    const note = kind && r ? changeNote(kind, r) : null;
    setSaid(note && r ? { note, error: { ...(r.status !== undefined ? { status: r.status } : {}), ...(r.code !== undefined ? { code: r.code } : {}), ...(r.traceId ? { traceId: r.traceId } : {}), ...(r.route ? { route: r.route } : {}) } } : null);
    if (note?.kind === 'words' && note.reread) void invalidateMe();
  }, []);
  return [said, say];
}
