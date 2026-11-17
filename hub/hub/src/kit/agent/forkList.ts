// forkList.ts: how a page reaches the unconfirmed forks of a computer and realm without importing ask/. The twin of conversationsActive.ts for a LIST: a
// fork whose answer was lost is a stored record that can outlive its parent chat or be unreadable, so the AI page lists it without any chat's engine. The
// provider (registered in ask/index.ts) reads the page's journal and checks or hides a record by its create key; every Check is `ForkRecovery.check`, the
// same one the chat's menu and band run. Engine-free: nothing here imports ask/.
// It also owns the page's ONE fork-change signal (`forkChanged` / `useForkChanges`): a view that reads fork records (this list, a reply's Fork / Check
// the fork item) re-reads them when a Check, Hide or fork settles anywhere on the page, or another tab writes the stored records. Never a poll.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { hostEnv, useCore } from '@core';
import type { ShownComputer } from './conversations';
import type { ForkOutcome, ForkRowView } from './source';

/** One computer and realm of the shown account: the computer's handle (name.last4) and the realm ('global' or a 24-hex id). */
export interface ForkScope { computer: string; realm: string }
/** The unconfirmed forks of every other computer and realm of the account, counted per scope. */
export interface ForkElsewhereCount { computer: string; realm: string; n: number }
export interface ForkListOps {
  /** The unconfirmed forks of this scope, hidden ones included (flagged); null when they cannot be read now. */
  rows(): readonly ForkRowView[] | null;
  elsewhere(): readonly ForkElsewhereCount[] | null;
  check(k1: string): Promise<ForkOutcome>;
  hide(k1: string): Promise<boolean>;
}
export interface ForkListProvider {
  open(account: string, scope: ForkScope, at: ShownComputer): ForkListOps | null;
}

let provider: ForkListProvider | null = null;
const subs = new Set<() => void>();
/** Registers (or, with null, removes) the provider. */
export function provideForkList(p: ForkListProvider | null): void {
  provider = p;
  for (const f of [...subs]) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const current = () => provider;

let changes = 0;
const changeSubs = new Set<() => void>();
const onStorage = () => forkChanged();
/** Tells every mounted fork view to read the records again: a Check, Hide or fork settled on this page (another tab's write arrives as `storage`). */
export function forkChanged(): void {
  changes += 1;
  for (const f of [...changeSubs]) f();
}
/** The host's external-change listener (another tab's `storage` write on the web; none in a terminal session) is held
 *  only while some view is subscribed. */
let offStorage: (() => void) | null = null;
const subscribeChanges = (f: () => void) => {
  changeSubs.add(f);
  if (changeSubs.size === 1) offStorage = hostEnv().onExternalChange(onStorage);
  return () => {
    changeSubs.delete(f);
    if (changeSubs.size === 0) { offStorage?.(); offStorage = null; }
  };
};
const changesNow = () => changes;
/** Renders the caller again on every fork change while it is mounted; the number is the change count. */
export function useForkChanges(): number {
  return useSyncExternalStore(subscribeChanges, changesNow, changesNow);
}

export interface ForkListView {
  readonly rows: readonly ForkRowView[];
  readonly elsewhere: readonly ForkElsewhereCount[];
  check(k1: string): Promise<ForkOutcome>;
  hide(k1: string): Promise<boolean>;
}

/** The unconfirmed forks of `scope` while mounted, or null (no provider, no account, or the computer is not named). The list is read again after every
 *  fork change (forkChanged: a Check, Hide or fork settled on this page, or another tab's `storage` write); it is never a poll. */
export function useForkList(scope: ForkScope | null, at: ShownComputer | null): ForkListView | null {
  const account = useCore().account ?? '';
  const p = useSyncExternalStore(subscribe, current, current);
  useForkChanges();
  const key = scope && at ? `${account}|${scope.computer}|${scope.realm}|${at.project}|${at.id}|${at.name}|${at.server ?? ''}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names every input; the objects themselves may be rebuilt each render
  const ops = useMemo(() => (p && scope && at && account ? p.open(account, scope, at) : null), [p, key]);
  const check = useCallback(async (k1: string) => { try { return await ops!.check(k1); } finally { forkChanged(); } }, [ops]);
  const hide = useCallback(async (k1: string) => { try { return await ops!.hide(k1); } finally { forkChanged(); } }, [ops]);
  if (!ops) return null;
  const rows = ops.rows();
  if (!rows) return null;
  return { rows, elsewhere: ops.elsewhere() ?? [], check, hide };
}
