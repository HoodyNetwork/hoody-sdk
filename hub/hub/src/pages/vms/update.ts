// The changes of the Settings, Ports and Storage tabs: an update of a stopped VM (settings, ports, discs, a bigger disk)
// and, while the VM runs or is paused, a disc swapped or ejected in place.
//
// Contract, in plain words:
//   - Every change is sent once, under the VM's change lock (one per VM: its own id, changes.ts VM_LOCK, shared with
//     every other change to that VM: power, snapshots), so nothing else is sent to that VM while one is not confirmed.
//   - A 4xx is a definite refusal with the VM program's code. A lost answer or any 5xx is held: never sent again by the
//     page, proved only by a fresh read of the same VM (same vm_id) that shows every sent field (update-logic proofOf),
//     or let go by the person (Stop tracking). A read of another VM under the same name proves nothing.
//   - That read is this VM's own, sent by Check again for it alone: a declared read would read every VM's detail on
//     screen again and fail as a whole when any other VM's read fails.
//   - A disc swapped in place has no read that proves it (the program saves it in the VM's settings before the running
//     VM is asked): it stays held until the person stops tracking it. An eject is proved by the slot reading empty.
//   - Each change carries the computer it was pressed on, so a switch of computer while it is out never moves it.
import { defineMutation, heldChanges, useChangesVersion, type HeldChange, type HeldFrom, type HubError, type MutationResult, type Target } from '@core';
import { useCallback, useMemo, useRef, useState } from 'react';
import { vmQ } from './data';
import type { Vm } from './logic';
import { routes } from './routes';
import { VM_LOCK, vmLockKey } from './changes';
import { isVmUnsure } from './parts/unsure';
import { ejectProof, proofOf, type UpdateBody } from './update-logic';

/** The page that sends these changes. */
const PAGE = 'vms';

/** What the change is about, for the held note's words. */
export type UpdateOp = 'settings' | 'ports' | 'discs' | 'disk';

/** Every change names the computer it was pressed on, the VM (its own id and its name). */
export interface VmVars { readonly target: Target; readonly computer: string; readonly vm: string; readonly name: string }
export interface UpdateVars extends VmVars { readonly op: UpdateOp; readonly body: UpdateBody }
export interface DiscVars extends VmVars { readonly slot: number }
export interface SwapVars extends DiscVars { readonly source: string }

const idn = (v: VmVars) => ({ computer: v.computer, vm: v.vm, name: v.name });

export const vmUpdate = defineMutation<UpdateVars>(routes.vmUpdate, {
  input: (v) => ({ target: v.target, params: { name: v.name }, body: v.body as Record<string, unknown> }),
  lock: VM_LOCK,
  lockKey: (v) => vmLockKey(v.vm),
  identity: (v) => ({ ...idn(v), op: v.op, body: v.body }),
  page: PAGE,
});

export const discSwap = defineMutation<SwapVars>(routes.cdChange, {
  input: (v) => ({ target: v.target, params: { name: v.name, slot: String(v.slot) }, body: { source: v.source } }),
  lock: VM_LOCK,
  lockKey: (v) => vmLockKey(v.vm),
  // The path is the person's own text about their computer; the held note names the slot only.
  identity: (v) => ({ ...idn(v), op: 'swap', slot: v.slot }),
  page: PAGE,
});

export const discEject = defineMutation<DiscVars>(routes.cdEject, {
  input: (v) => ({ target: v.target, params: { name: v.name, slot: String(v.slot) } }),
  lock: VM_LOCK,
  lockKey: (v) => vmLockKey(v.vm),
  identity: (v) => ({ ...idn(v), op: 'eject', slot: v.slot }),
  page: PAGE,
});

// ── the hook the tabs use ───────────────────────────────────────────────────────────────

export type HeldOp = UpdateOp | 'swap' | 'eject' | 'other';

/** The newest held change of this VM's lock. */
export interface VmHeld {
  readonly op: HeldOp;
  /** Sent by one of this file's changes (Check again and Stop tracking act on it); false: read-only. */
  readonly own: boolean;
  readonly from: HeldFrom | null;
  readonly hold: string | undefined;
  readonly change: HeldChange;
  /** It names an earlier VM under this name (another vm_id): that VM is gone. It blocks nothing of this one. */
  readonly gone: boolean;
}

/** The last definite answer of a send from a tab (done, refused, not sent), with what it was about. */
export interface VmResult {
  readonly op: HeldOp;
  readonly outcome: 'done' | 'failed' | 'not_sent' | 'stale';
  readonly error?: HubError;
  /** The update's own answer (its warnings), on done. */
  readonly data?: unknown;
}

const OWN = [vmUpdate, discSwap, discEject] as const;

/** The variables of a held change, taken from its own record (its computer and VM), never from the screen. */
function capturedVars(h: VmHeld): VmVars | null {
  const i = h.change.identity as { computer?: unknown; vm?: unknown; name?: unknown } | null;
  const t = h.change.target;
  if (!i || !t || typeof i.vm !== 'string' || typeof i.name !== 'string') return null;
  return { target: t, computer: t.container.id, vm: i.vm, name: i.name };
}

/** The held change of one VM (its lock: computer + vm_id), sends from the tabs, and the person's Check again and Stop
 *  tracking. `vm` null: nothing is shown and nothing can be sent. */
export function useVmChanges(target: Target | null, vm: Pick<Vm, 'name' | 'vmId'> | null) {
  const version = useChangesVersion();
  const computer = target?.container.id ?? '';
  const [sending, setSending] = useState<HeldOp | null>(null);
  const [result, setResult] = useState<VmResult | null>(null);
  /** The code in the pending answer (a 5xx the program uses for "not enough free disk"), for the held note. */
  const [heldError, setHeldError] = useState<HubError | undefined>(undefined);
  const out = useRef(false);

  const held = useMemo((): VmHeld | null => {
    if (!vm || !vm.vmId || !computer) return null;
    let best: VmHeld | null = null;
    for (const h of heldChanges(VM_LOCK)) {
      // Any change of this VM on this computer (power, snapshots and these share the lock and its { vm, name } words).
      const i = h.identity as { vm?: unknown; name?: unknown; op?: unknown } | null;
      if (!i || !h.target || !target || h.target.container.id !== target.container.id || h.target.project.id !== target.project.id) continue;
      if (i.vm !== vm.vmId && i.name !== vm.name) continue;
      const gone = i.vm !== vm.vmId;
      const mine = OWN.some((d) => d.heldBy(h) === 'self');
      const op: HeldOp = mine && typeof i.op === 'string' && ['settings', 'ports', 'discs', 'disk', 'swap', 'eject'].includes(i.op) ? (i.op as HeldOp) : 'other';
      // This VM's own hold wins over an earlier VM's of the same name; then the newest.
      if (!best || (best.gone && !gone) || (best.gone === gone && h.at >= best.change.at)) best = { op, own: mine, from: h.from, hold: h.hold, change: h, gone };
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's held-change signal
  }, [version, computer, target?.project.id, vm?.vmId, vm?.name]);

  const finish = useCallback((op: HeldOp, name: string, r: MutationResult<unknown>) => {
    out.current = false;
    setSending(null);
    // The VM's own read again, so the tab shows what was saved.
    if (r.outcome === 'done') void vmQ.fetch(name).catch(() => undefined);
    if (r.outcome === 'pending') { setHeldError(r.error); return; }
    setResult({ op, outcome: r.outcome, ...(r.error ? { error: r.error } : {}), ...(r.data !== undefined ? { data: r.data } : {}) });
  }, []);

  // Every send passes here, last: the name is asked once more (parts/unsure.ts), since a change goes by name.
  const base = (): VmVars | null => (target && vm && vm.vmId && !out.current && (!held || held.gone) && !isVmUnsure(vm.name) ? { target, computer, vm: vm.vmId, name: vm.name } : null);

  return {
    held,
    /** The pending answer's error while this mount holds it (lost after a reload). */
    heldError: held?.own ? heldError : undefined,
    sending,
    result,
    clearResult: () => setResult(null),
    /** Sends an update; false when nothing could be sent (a change is out or held). */
    update(op: UpdateOp, body: UpdateBody): boolean {
      const v = base();
      if (!v) return false;
      out.current = true;
      setSending(op);
      setResult(null);
      void vmUpdate.run({ ...v, op, body }).then((r) => finish(op, v.name, r));
      return true;
    },
    swap(slot: number, source: string): boolean {
      const v = base();
      if (!v) return false;
      out.current = true;
      setSending('swap');
      setResult(null);
      void discSwap.run({ ...v, slot, source }).then((r) => finish('swap', v.name, r));
      return true;
    },
    eject(slot: number): boolean {
      const v = base();
      if (!v) return false;
      out.current = true;
      setSending('eject');
      setResult(null);
      void discEject.run({ ...v, slot }).then((r) => finish('eject', v.name, r));
      return true;
    },
    /** Reads the VM again for the held change the band SHOWS (never a resend), on the computer it was sent to.
     *  True when the read proved it. */
    async check(shown: VmHeld): Promise<boolean> {
      if (!shown.own) { await vmQ.invalidate(); return false; }
      const vars = capturedVars(shown);
      if (!vars || shown.hold === undefined) return false;
      const i = shown.change.identity as Record<string, unknown>;
      // One read of this VM, asked now: a read already under way may have been asked before the change, so it is cancelled,
      // never joined. A failed read proves nothing.
      const got = await vmQ.readFresh(vars.name).catch(() => null);
      if (!got) return false;
      const read = got.data;
      // A disc swapped in place: no read proves it (the program saves it before the running VM is asked).
      if (shown.op === 'swap') return false;
      if (shown.op === 'eject') {
        const slot = Number(i.slot);
        return ejectProof({ name: vars.name, vmId: vars.vm, slot }, [read]) === 'applied' && discEject.complete({ ...vars, slot }, shown.hold);
      }
      const body = i.body as UpdateBody;
      return proofOf({ name: vars.name, vmId: vars.vm, body }, [read]) === 'applied' && vmUpdate.complete({ ...vars, op: shown.op as UpdateOp, body }, shown.hold);
    },
    /** The person's warned Stop tracking of the held change the band SHOWS: only that send (its hold) is let go,
     *  never a newer hold that took its place while the question was open. */
    async dismiss(shown: VmHeld): Promise<boolean> {
      if (!shown.own || shown.hold === undefined) return false;
      const vars = capturedVars(shown);
      if (!vars) return false;
      const i = shown.change.identity as Record<string, unknown>;
      setHeldError(undefined);
      if (shown.op === 'swap') return discSwap.dismiss({ ...vars, slot: Number(i.slot), source: '' }, shown.hold);
      if (shown.op === 'eject') return discEject.dismiss({ ...vars, slot: Number(i.slot) }, shown.hold);
      return vmUpdate.dismiss({ ...vars, op: shown.op as UpdateOp, body: i.body as UpdateBody }, shown.hold);
    },
  };
}

export type VmChanges = ReturnType<typeof useVmChanges>;
