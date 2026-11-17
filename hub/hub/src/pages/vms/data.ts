// The VMs page's reads, declared in one place on core (defineQuery over routes.ts): live in the Hub, core's fixture
// transport in dev, shots and tests. Every answer of the VM program goes through its parser in logic.ts; an answer that
// is not the shape the parser knows is the read's failure, never an empty value.
//
// Changes (KVM, create, power, settings, discs, snapshots, images) are declared by the parts that draw them, in files
// of their own beside this one; this file holds reads only.
import { commerce, computerHandle, computerState, defineQuery, useComputersAll, useCurrentComputer, type Target } from '@core';
import { useShellData } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import {
  hostFactsOf, hostState, parseCaps, parseVm, parseVmList, POLL_SLOW_MS, pollMs, wantsVmReads,
  type Caps, type CapsRead, type FactsRead, type HostState, type Vm, type VmRow,
} from './logic';
import { routes } from './routes';

/** An answer the page cannot read: the read fails with this, so nothing downstream takes it for "none". */
const BAD_ANSWER = 'BAD_ANSWER';
const unreadable = (): never => { throw { kind: 'unavailable', status: 0, code: BAD_ANSWER }; };
/** The read failed because the VM program's answer could not be read (it did answer). */
const isBadAnswer = (e: unknown): boolean => e !== null && typeof e === 'object' && (e as { code?: unknown }).code === BAD_ANSWER;
const must = <T,>(v: T | null): T => (v === null ? unreadable() : v);

const capsQ = defineQuery<unknown, Caps>(routes.caps, { select: (w) => must(parseCaps(w)) });
export const vmsQ = defineQuery<unknown, VmRow[]>(routes.vms, { select: (w) => must(parseVmList(w)) });
export const vmQ = defineQuery<unknown, Vm, string>(routes.vm, { input: (name) => ({ params: { name } }), select: (w) => must(parseVm(w)) });

// ── the computer the VMs live in ─────────────────────────────────────────────────────

export interface Host {
  /** Core's current computer; null: none is picked. */
  readonly target: Target | null;
  /** The computer's name ('' until a list names it) and its handle for links ('' with no name). */
  readonly name: string;
  readonly handle: string;
  /** The computer's row in the Hoody API's list. */
  readonly facts: FactsRead;
  /** The VM program's capability read. */
  readonly caps: CapsRead;
  /** The capability read's rejection while it failed (for Details). */
  readonly capsError: unknown;
  /** Which of the page's states applies. */
  readonly state: HostState;
  /** Whether the VM program is asked at all. */
  readonly reads: boolean;
  /** A read is out now (the person's Check again shows busy). */
  readonly checking: boolean;
  /** Reads the computer's row and the VM program's capabilities again. */
  recheck(): void;
}

/** How often the capabilities are read again while the page shows. */
const CAPS_REFRESH_MS = 30_000;

/** The current computer as this page needs it: its row, whether VMs can be read from it, and what the VM program says
 *  it can do. One hook, so every part of the page agrees on the state. */
export function useHost(): Host {
  const target = useCurrentComputer();
  const id = target?.container.id ?? '';
  const all = useComputersAll({ enabled: target !== null });
  const shell = useShellData();
  const row = id ? all.rows?.find((r) => r.id === id) : undefined;
  const facts = useMemo((): FactsRead => {
    if (row) {
      const f = hostFactsOf(row, computerState(row.status), commerce.planChip(row, null, {} as never).kind);
      return f ? { kind: 'ok', facts: f } : { kind: 'unknown' };
    }
    // Not in the rows read so far: still unknown while pages are out, and not readable once the walk ended without it.
    return all.loading || all.more ? { kind: 'loading' } : { kind: 'unknown' };
  }, [row, all.loading, all.more]);
  const reads = wantsVmReads(target !== null, facts);
  const q = capsQ.use(undefined, { enabled: reads, refetchInterval: CAPS_REFRESH_MS });
  const caps = useMemo((): CapsRead => {
    if (!reads) return { kind: 'idle' };
    if (q.isError) return isBadAnswer(q.error) ? { kind: 'unreadable' } : { kind: 'failed' };
    return q.data ? { kind: 'ok', caps: q.data } : { kind: 'loading' };
  }, [reads, q.isError, q.error, q.data]);
  const name = (facts.kind === 'ok' ? facts.facts.name : '') || shell.computers.find((c) => c.id === id)?.name || '';
  return {
    target, name, handle: name && id ? computerHandle({ id, name }) : '', facts, caps, capsError: q.isError ? q.error : undefined,
    state: hostState(target !== null, facts, caps), reads, checking: q.isFetching || all.loading,
    recheck: () => { all.retry(); if (reads) void q.refetch(); },
  };
}

// ── VMs ──────────────────────────────────────────────────────────────────────────────

export interface VmListRead {
  /** The VMs; undefined until the first answer, and kept from the last answer while a later read failed. */
  readonly rows: readonly VmRow[] | undefined;
  readonly loading: boolean;
  /** The last read failed or was not readable. */
  readonly failed: boolean;
  readonly error: unknown;
  readonly fetching: boolean;
  retry(): void;
}

/** The VM list of the current computer, read again at pollMs's pace. `enabled` false: not read at all.
 *  `lastChangeAt` (ms) is the person's own last change on this page, for the fast pace after it; null: none. */
export function useVmList(enabled: boolean, lastChangeAt: number | null = null): VmListRead {
  // The pace follows the rows just read: every answer renders again (the read's own fetching flag), so the pace is
  // worked out again after each one, and falls back to slow once nothing is changing.
  const [ms, setMs] = useState(POLL_SLOW_MS);
  const q = vmsQ.use(undefined, { enabled, refetchInterval: ms });
  // Rows kept from before a failed read say nothing about now: a failing read is asked again at the slow pace.
  const next = q.isError ? POLL_SLOW_MS : pollMs(q.data ?? null, lastChangeAt, Date.now());
  useEffect(() => setMs(next), [next]);
  return useMemo(
    () => ({ rows: enabled ? q.data : undefined, loading: enabled && q.isPending, failed: enabled && q.isError, error: q.isError ? q.error : undefined, fetching: q.isFetching, retry: () => void q.refetch() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, q.data, q.isPending, q.isError, q.error, q.isFetching],
  );
}

export interface VmRead {
  /** The VM; undefined until the first answer. An answer about another name is not this VM's. */
  readonly vm: Vm | undefined;
  readonly loading: boolean;
  /** The VM program answered that no VM has this name. */
  readonly missing: boolean;
  /** The last read failed for any other reason, or was not readable. */
  readonly failed: boolean;
  readonly error: unknown;
  readonly fetching: boolean;
  retry(): void;
}

/** One VM of the current computer by name. `enabled` false: not read at all. */
export function useVm(name: string, enabled: boolean): VmRead {
  const q = vmQ.use(name, { enabled, refetchInterval: 30_000 });
  return useMemo(() => {
    const vm = enabled && q.data && q.data.name === name ? q.data : undefined;
    const missing = enabled && q.isError && q.error?.status === 404;
    const wrong = enabled && q.data !== undefined && q.data.name !== name;
    return { vm, loading: enabled && q.isPending, missing, failed: enabled && ((q.isError && !missing) || wrong), error: q.isError ? q.error : undefined, fetching: q.isFetching, retry: () => void q.refetch() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, q.data, q.isPending, q.isError, q.error, q.isFetching]);
}

// ── reads of the list's rows and of one VM's screen ──────────────────────────────────

/** One VM by name, read again at pollMs's pace: fast while it is being created, starting or stopping, and for a minute
 *  after the person's own change (`lastChangeAt`, ms; null: none). */
export function useVmPaced(name: string, enabled: boolean, lastChangeAt: number | null): VmRead {
  const [ms, setMs] = useState(POLL_SLOW_MS);
  const q = vmQ.use(name, { enabled, refetchInterval: ms });
  const moving = q.data ? [{ phase: q.data.progress && q.data.progress.phase !== 'committed' && q.data.progress.phase !== 'failed' ? 'creating' as const : 'committed' as const, state: q.data.state }] : null;
  const next = q.isError ? POLL_SLOW_MS : pollMs(moving, lastChangeAt, Date.now());
  useEffect(() => setMs(next), [next]);
  return useMemo(() => {
    const vm = enabled && q.data && q.data.name === name ? q.data : undefined;
    const missing = enabled && q.isError && q.error?.status === 404;
    const wrong = enabled && q.data !== undefined && q.data.name !== name;
    return { vm, loading: enabled && q.isPending, missing, failed: enabled && ((q.isError && !missing) || wrong), error: q.isError ? q.error : undefined, fetching: q.isFetching, retry: () => void q.refetch() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, q.data, q.isPending, q.isError, q.error, q.isFetching]);
}

/** How many VMs the list reads one by one: the rows of one table page. */
export const VM_DETAIL_SLOTS = 10;

/** The VMs of the list's current table page, each read on its own (the list read gives only name and state). At most
 *  VM_DETAIL_SLOTS names are read; a name past that has no entry. `enabled` false: none is read. */
export function useVmDetails(names: readonly string[], enabled: boolean): ReadonlyMap<string, VmRead> {
  const at = (i: number): [string, boolean] => [names[i] ?? '', enabled && i < names.length];
  // A fixed number of reads, one per row place, so the hooks keep their order whatever the page shows.
  const r0 = useVm(...at(0)), r1 = useVm(...at(1)), r2 = useVm(...at(2)), r3 = useVm(...at(3)), r4 = useVm(...at(4));
  const r5 = useVm(...at(5)), r6 = useVm(...at(6)), r7 = useVm(...at(7)), r8 = useVm(...at(8)), r9 = useVm(...at(9));
  return useMemo(() => {
    const all = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9];
    return new Map(names.slice(0, VM_DETAIL_SLOTS).map((n, i) => [n, all[i]!]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join('\n'), r0, r1, r2, r3, r4, r5, r6, r7, r8, r9]);
}
