// The copies of one account: a module store, outside React, owns each copy's whole lifecycle, so no unmount,
// remount, section reload or realm switch can lose a copy, orphan its toast or drop a read that settles it. Components
// only subscribe and hand it their sends:
//   - A copy is `out` from just before its apply is sent until the answer, then settled (dropped) or `unknown`.
//   - While no Claude Code section is attached (the page left, no computer chosen, another realm's page remounting),
//     every out or unknown copy holds exactly one sticky toast, which shows the copy's current state: a copy turning
//     unknown replaces its own toast with one that offers Check again, never a second one. A section attaching shows them
//     inline again and closes the toasts.
//   - The apply is sent with the copy's own context (copyCtx), marked as already noticed: core never adds a pending notice
//     of its own for it, whatever the realm or page by the time it answers. The copy's toast is its only notice.
//   - A definite answer, or a read that settles every path (settleCopies), drops the copy and closes its toast, whatever
//     is mounted. Every read is settled here (settle), the drawer's previews too: a drawer that unmounts before its
//     preview answers changes nothing.
//   - Check again (the line's and the toast's) reads the copy's CAPTURED target: its realm, source, target computer and
//     what was asked, never the drawer's current inputs.
//   - A realm switch keeps everything (the copies are the account's). Signing out, or another account, drops every copy of
//     the account captured at its send and closes its toast; a copy still out hands its notice back to core, whose
//     sign-out names the changes that may have gone through.
import { capture, onBump, type Ctx, type Target } from '@core';
import { closeToast, showToast } from '@kit';
import { eligibleOf, settleCopies, type TargetRead, type UnknownCopy } from './transfer';

/** A copy with the words of its toast and its Check again, both fixed when its apply is sent (the store has no strings
 *  of its own). `check` reads the captured target; null when that read could not say what is there. `ctx`: the apply's
 *  context (copyCtx), whose account owns the copy. */
export interface CopyRecord extends UnknownCopy {
  toast: { title: string; body: string; check: string };
  check: () => Promise<TargetRead | null>;
  ctx: Ctx;
}
export type NewCopy = Omit<CopyRecord, 'id' | 'unreadable' | 'state'>;

/** The context an apply is sent with: the copy's toast is its notice, so core shows none for it. */
export function copyCtx(target: Target): Ctx {
  const ctx = capture(target);
  ctx.pendingShown = true;
  return ctx;
}

// Signing out, being signed out or another account: the copies of the account that was shown go.
const ENDS: ReadonlySet<string> = new Set(['logout', 'signout', 'account', 'suspended']);

let seq = 0;
let list: CopyRecord[] = [];
const toasts = new Map<number, string>();
const listeners = new Set<() => void>();
let attached = 0;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let offBump: (() => void) | null = null;

const currentAccount = (): string | null => {
  try { return capture().account; } catch { return null; }
};
const emit = () => { for (const l of [...listeners]) l(); };
const shut = (id: number) => {
  const key = toasts.get(id);
  if (key === undefined) return;
  toasts.delete(id);
  closeToast(key);
};
const show = (c: CopyRecord) => {
  const action = c.state === 'unknown' ? { action: { label: c.toast.check, onAction: () => copyStore.check(c.id) } } : {};
  toasts.set(c.id, showToast({
    // noDetails: a copy whose answer never came, not a refusal: there are no facts to show, and Check again reads the target.
    tone: 'unknown', title: c.toast.title, body: c.toast.body, ...action,
  }));
};
const put = (next: CopyRecord[]) => {
  const kept = new Map(next.map((c) => [c.id, c] as const));
  for (const id of [...toasts.keys()]) {
    const c = kept.get(id);
    // A copy that left the list (settled) takes its toast with it; one whose state moved shows its new state in its place.
    if (!c) shut(id);
    else if (list.find((x) => x.id === id)?.state !== c.state) { shut(id); show(c); }
  }
  list = next;
  emit();
};
const open = () => { for (const c of list) if (!toasts.has(c.id)) show(c); };

/** Drops the copies `gone` names (all by default), and their toasts. */
export function clearCopies(gone: (c: CopyRecord) => boolean = () => true): void {
  const drop = list.filter(gone);
  if (drop.length === list.length) clearTimeout(leaveTimer);
  for (const c of drop) {
    // Still out: its notice is core's again (the sign-out names it), as for any change of a context that ended.
    if (c.state === 'out') c.ctx.pendingShown = false;
  }
  put(list.filter((c) => !gone(c)));
}

/** The copies are their account's: signing out drops the shown account's; another account drops every other one's. */
function own(): void {
  if (!offBump) {
    offBump = onBump((reason) => {
      const now = currentAccount();
      clearCopies((c) => c.ctx.account !== now || ENDS.has(reason));
    });
  }
  const now = currentAccount();
  if (list.some((c) => c.ctx.account !== now)) clearCopies((c) => c.ctx.account !== now);
}

export const copyStore = {
  /** The current list (useSyncExternalStore). */
  get: (): readonly CopyRecord[] => list,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  /** A Claude Code section is shown: the copies show inline, so their toasts close. Returns its detach. */
  attach(): () => void {
    own();
    attached++;
    clearTimeout(leaveTimer);
    for (const id of [...toasts.keys()]) shut(id);
    return () => {
      attached--;
      // A tick later, so StrictMode's simulated unmount/remount opens nothing.
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { if (attached === 0) open(); }, 0);
    };
  },
  /** An apply is about to be sent with `c.ctx`. Returns the copy's id. */
  begin(c: NewCopy): number {
    own();
    const id = ++seq;
    put([...list, { ...c, id, unreadable: false, state: 'out' }]);
    if (attached === 0) open();
    return id;
  },
  /** The apply's answer: definite (the copy is dropped) or still unknown. A copy already dropped (purged) stays dropped. */
  end(id: number, how: 'settled' | 'unknown' | 'unreadable'): void {
    put(how === 'settled' ? list.filter((c) => c.id !== id) : list.map((c) => (c.id !== id ? c : { ...c, state: 'unknown', unreadable: how === 'unreadable' })));
  },
  /**
   * A read of `op` to `to` in `realm` (a drawer's preview, or Check again): the copies it may settle are the ones unknown
   * when it is sent, then `read` runs and its answer settles them here, whatever is mounted by then. Returns the answer.
   */
  async settle<A>(op: UnknownCopy['op'], to: string, realm: string, read: () => Promise<A>, readOf: (a: A) => TargetRead | null): Promise<A> {
    const from = eligibleOf(list, op, to, realm);
    const a = await read();
    const r = readOf(a);
    if (r) put(settleCopies(list, r, from).filter((c) => c.state !== 'settled'));
    return a;
  },
  /** Check again: reads the copy's captured target (never resends). A read that cannot say keeps it unknown. */
  async check(id: number): Promise<void> {
    const c = list.find((x) => x.id === id && x.state === 'unknown');
    if (!c) return;
    await copyStore.settle(c.op, c.to, c.realm, c.check, (r) => r);
  },
};
