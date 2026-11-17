// The onboarding page's data: reads only, all through @core. The computer list (the shell's own read, one cache
// entry) and, while that list is empty, the account's setup state. The page sends nothing: every action that changes
// something lives on Home or Computers.
import { computerHandle, computersPage, pickComputer, useCan, useCurrentComputer, useRealms, useSetupState } from '@core';
import { maskId } from '@kit';
import { useShellData } from '@kit/hooks';
import { useCallback, useMemo } from 'react';
import { firstName, phaseOf, type Reads, type Row } from './logic';

interface RawComputer {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  project_id?: unknown;
  realm_ids?: unknown;
}

/** A list row this page can show: an object with a non-empty string id. Anything else proves no computer. */
export function rowOf(r: unknown): Row | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as RawComputer;
  if (typeof x.id !== 'string' || !x.id) return null;
  const named = typeof x.name === 'string' && x.name.trim() !== '';
  // The handle is built as Home and Computers build it; a computer without a name is shown by its masked id.
  const handle = computerHandle({ id: x.id, name: named ? (x.name as string) : x.id.slice(0, 8) });
  return { id: x.id, name: named ? (x.name as string) : maskId(x.id), handle, phase: phaseOf(x.status) };
}

/**
 * The rows of the selected realm. The list answer can be the whole account's: core's one rule decides (pickComputer
 * answers a row asked for by its own id only when the realm holds it), as Home and the shell's picker do.
 */
export function inRealm(rows: readonly unknown[], realm: string): unknown[] {
  return rows.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const x = r as RawComputer;
    if (typeof x.id !== 'string' || !x.id) return false;
    const c = { id: x.id, status: x.status, project_id: typeof x.project_id === 'string' ? x.project_id : '', realm_ids: Array.isArray(x.realm_ids) ? x.realm_ids.filter((v): v is string => typeof v === 'string') : [] };
    return pickComputer([c], { realm, remembered: x.id }) === c;
  });
}

export interface Onboarding {
  reads: Reads;
  /** The person's first name, in an account session. */
  name?: string;
  /** The rejection of the read that failed (the list's first read, or the setup state's), for the error's details. */
  error: unknown;
  /** A read again failed while an earlier answer is kept: the page shows that answer as old, with Check again. */
  stale: boolean;
  /** That read's rejection, for the band's details. */
  staleError: unknown;
  /** Reads the list (and the setup state while it is read) again. */
  reread: () => void;
}

type Refetch = (o: { cancelRefetch: false }) => unknown;
/** Reads again without cancelling a read still under way: a poll that cancelled a slow read would never see its answer. */
export function rereadAll(list: Refetch, setup: Refetch, readSetup: boolean): void {
  void list({ cancelRefetch: false });
  if (readSetup) void setup({ cancelRefetch: false });
}

/** Whether a read again failed over a kept answer (a first read that failed keeps none: that is the error band). */
export function staleRead(...reads: Array<{ isRefetchError: boolean; data: unknown }>): boolean {
  return reads.some((r) => r.isRefetchError && r.data !== undefined);
}

export function useOnboarding(): Onboarding {
  const account = useCan('account');
  const shell = useShellData();
  const current = useCurrentComputer();
  const list = computersPage.use(undefined);
  const realm = useRealms().selected;
  const rows = useMemo(() => (list.data ? inRealm(list.data.rows, realm).map(rowOf).filter((x): x is Row => x !== null) : undefined), [list.data, realm]);
  const whole = list.data?.complete === true;
  const empty = !!rows && rows.length === 0 && whole;
  // Read only while the account has no computer here: it says why (a claimed server, an invite wall, no room).
  const setup = useSetupState({ enabled: account && empty });
  const listRefetch = list.refetch;
  const setupRefetch = setup.refetch;
  const reread = useCallback(() => rereadAll(listRefetch, setupRefetch, account && empty), [listRefetch, setupRefetch, account, empty]);
  const reads: Reads = {
    // A failed refetch keeps the last rows (core restores them): only a first read that fails has none.
    rows: rows ?? (list.isError ? null : undefined),
    whole,
    setup: !empty || !account ? undefined : (setup.data ?? (setup.isError ? null : undefined)),
    account,
    currentId: current?.container.id,
  };
  // The rejection behind an 'unread' stage: the list's first read, or the setup read while the list is empty.
  const error = !rows ? list.error : empty && account && !setup.data && setup.isError ? setup.error : null;
  const kept = [list, ...(account && empty ? [setup] : [])];
  const stale = staleRead(...kept);
  const staleError = kept.find((r) => r.isRefetchError && r.data !== undefined)?.error ?? null;
  return { reads, name: account ? firstName(shell.account?.name) : undefined, error, stale, staleError, reread };
}
