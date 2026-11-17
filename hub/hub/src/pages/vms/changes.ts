// A VM's power changes and its delete, as one flow the VM list and a VM's own screen both use.
//
// Contract, in plain words:
//   - Seven changes, one definition each (start, shut down, power off, pause, resume, reset, delete), all under ONE lock
//     per VM: the lock VM_LOCK keyed by the VM's own id (vmLockKey). Every other change of a VM this page declares
//     (settings, ports, discs, snapshots) names the same lock and key, so while one change of a VM may have gone
//     through, no other change of that VM is sent from the Hub. The id, never the name: a later VM under the same name
//     is another VM with its own lock.
//   - A press captures its target then: the computer, the VM's id and name, and the run it had. The request, its lock,
//     its proof and its band all read that capture, never what the screen shows later.
//   - Shut down, pause, resume and start act at once. Power off, reset and delete ask first, in a dialog bound to the
//     computer and the VM id that opened it: when either is no longer what the screen shows, the dialog closes and its
//     confirm sends nothing. A press and a confirm are judged against what the screen shows NOW (its last committed
//     render), never against the render that made the handler: a handler kept from an earlier render sends nothing for
//     a VM the screen no longer shows under that name.
//   - An answer that is lost, or any 5xx, is held: never shown as done or failed, never sent again. It is freed only by
//     a fresh read that proves it (power-logic proveChange: the VM's state for power, a new run on the VM's own read
//     for a start, the VM's id gone from a whole list for delete) or by the person's Stop tracking of exactly that hold. Reset has no proof: it stays until the
//     person stops tracking it. While a hold is young the flow reads again by itself; Check again reads once more.
//   - A definite refusal (a 4xx, or a change core did not send) stays as that VM's last result until its next press or
//     until the person closes it.
import { defineMutation, heldChanges, isFramed, useChangesVersion, type HubError, type MutationDef, type Target } from '@core';
import type { OutcomeKind } from '@kit';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { vmQ, vmsQ } from './data';
import { POLL_AFTER_CHANGE_MS, POLL_FAST_MS, vmCode, type VmCode } from './logic';
import { CONFIRMED_OPS, detailsOf, heldVmId, listsOf, parseIdentity, proveChange, REPORTED_CODES, VM_OPS, type ChangeIdentity, type VmOp } from './power-logic';
import { routes } from './routes';

/** The page that sends these changes (core's held change names it). */
const PAGE = 'vms';
/** The one lock of a VM's changes: shared by every definition that changes a VM, keyed by vmLockKey. */
export const VM_LOCK = 'vm.change';
/** The lock key of a VM: its own id. */
export const vmLockKey = (vmId: string): { vm: string } => ({ vm: vmId });

/** A press as it is sent: where, which VM (its id and name at the press) and the run it had then. */
export interface VmVars {
  readonly target: Target;
  readonly vmId: string;
  readonly name: string;
  readonly run: string | null;
}

const ROUTE = { start: routes.vmStart, stop: routes.vmStop, forceStop: routes.vmForceStop, pause: routes.vmPause, resume: routes.vmResume, reset: routes.vmReset, delete: routes.vmDelete } as const;

function define(op: VmOp): MutationDef<VmVars, unknown> {
  return defineMutation<VmVars>(ROUTE[op], {
    input: (v) => {
      if (!v || !v.target || typeof v.vmId !== 'string' || !v.vmId || typeof v.name !== 'string' || !v.name) throw new Error('vm vars');
      // Shut down always carries an empty object: the VM's own wait applies (the program refuses a missing body).
      return { target: v.target, params: { name: v.name }, ...(op === 'stop' ? { body: {} } : {}) };
    },
    lock: VM_LOCK,
    lockKey: (v) => vmLockKey(v.vmId),
    identity: (v): ChangeIdentity => ({ vm: v.vmId, name: v.name, op, run: v.run }),
    name: `vms.${op}`,
    page: PAGE,
    // Judged by the list alone: it gives each VM's state, and a deleted VM's own read answers "not there", which is no
    // fresh answer. A reset has no proof. A start is proved by this VM's own read only (it names the run), which the
    // flow's check sends for that one VM: a declared read would read every VM's detail on screen again and fail as a
    // whole when any other VM's read fails.
    ...(op === 'reset' || op === 'start'
      ? {}
      : { reads: [vmsQ], proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => proveChange(identity, listsOf(answers[0]), []) }),
  });
}

/** The seven definitions, by operation. */
export const vmChange: Readonly<Record<VmOp, MutationDef<VmVars, unknown>>> = Object.fromEntries(VM_OPS.map((op) => [op, define(op)])) as Record<VmOp, MutationDef<VmVars, unknown>>;

// ── the flow ─────────────────────────────────────────────────────────────────────────

/** The VM a press is for, as the screen shows it at the press. */
export interface VmRef {
  readonly vmId: string;
  readonly name: string;
  readonly run: string | null;
  /** The VM was not created (a failed create kept in the list): its delete only removes what is left. */
  readonly neverCreated?: boolean;
}

/** A change of a VM that may have gone through. */
export interface VmHeld {
  readonly vmId: string;
  /** This flow's own change (start, delete, …); null: another part of the page sent it (settings, a snapshot). */
  readonly id: ChangeIdentity | null;
  /** This page's power or delete change: Check again and Stop tracking act on it. False: read-only here. */
  readonly own: boolean;
  readonly hold: string | undefined;
  readonly at: number;
  /** The reason the VM program gave with an answer that still reads "may have gone through"; null: none. */
  readonly reported: VmCode | null;
}

/** The last definite answer of a press on a VM. */
export interface VmResult {
  readonly op: VmOp;
  readonly name: string;
  readonly outcome: Exclude<OutcomeKind, 'pending'>;
  readonly error?: HubError;
}

/** What the confirm dialog asks, bound to the computer and VM that opened it. */
export interface VmAsk {
  readonly op: VmOp;
  readonly vm: VmRef;
  readonly target: Target;
}

export interface VmFlow {
  /** The Hub is shown inside another page: nothing is sent. */
  readonly framed: boolean;
  readonly ask: VmAsk | null;
  /** A press: sends at once, or opens the confirm dialog (power off, reset, delete). */
  press(op: VmOp, vm: VmRef): void;
  confirm(): void;
  cancel(): void;
  readonly confirming: boolean;
  /** The dialog's last definite refusal, shown in it. */
  readonly askResult: VmResult | null;
  sending(vmId: string): boolean;
  /** The held change of a VM (this flow's own first), or null. */
  held(vmId: string): VmHeld | null;
  /** Every held change of this computer's VMs, oldest first. */
  readonly allHeld: readonly VmHeld[];
  result(vmId: string): VmResult | null;
  /** Every last result, for a screen that lists them. */
  readonly results: readonly (VmResult & { readonly vmId: string })[];
  clearResult(vmId: string): void;
  /** Reads again for a held change (never a resend). True when the read proved it. */
  check(h: VmHeld): Promise<boolean>;
  /** The person's warned Stop tracking of the hold shown. */
  dismiss(h: VmHeld): Promise<boolean>;
}

/** The reason codes of held sends, by hold token: kept outside the render so a band still says it after a remount. */
const reportedBy = new Map<string, VmCode>();

const sameTarget = (a: { project: { id: string }; container: { id: string } } | null, b: Target | null): boolean =>
  !!a && !!b && a.container.id === b.container.id && a.project.id === b.project.id;

export interface VmFlowOptions {
  /** The computer shown. */
  readonly target: Target | null;
  /** Reads the screen's reads again after an answer (`name`: the VM the answer was about). */
  readonly reread: (name?: string) => void;
  /** The id each name on screen has now (undefined: no read to tell): the dialog closes when its VM is not that. */
  readonly present: ReadonlyMap<string, string | null> | undefined;
  /** Called once a change this flow sent was seen done or proved. */
  readonly onDone?: (op: VmOp, vm: { vmId: string; name: string }) => void;
}

export function useVmFlow({ target, reread, present, onDone }: VmFlowOptions): VmFlow {
  const version = useChangesVersion();
  const framed = isFramed();
  const [ask, setAsk] = useState<VmAsk | null>(null);
  const [askResult, setAskResult] = useState<VmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<Readonly<Record<string, VmResult>>>({});
  const inFlight = useRef(new Set<string>());
  // Moves when a held send's reason is noted, so the bands read it.
  const [noted, setNoted] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  // The held changes of this computer's VMs (any part's), read again whenever core's registry moves.
  const allHeld = useMemo((): VmHeld[] => {
    const rows: VmHeld[] = [];
    for (const h of heldChanges(VM_LOCK)) {
      if (!sameTarget(h.target, target)) continue;
      const vmId = heldVmId(h.identity);
      if (!vmId) continue;
      const id = parseIdentity(h.identity);
      const own = id !== null && vmChange[id.op].heldBy(h) === 'self';
      rows.push({ vmId, id: own ? id : null, own, hold: h.hold, at: h.at, reported: (own && h.hold && reportedBy.get(h.hold)) || null });
    }
    return rows.sort((a, b) => a.at - b.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's held-change signal, noted the reasons'
  }, [version, noted, target?.container.id, target?.project.id]);
  const held = useCallback((vmId: string) => allHeld.find((h) => h.vmId === vmId && h.own) ?? allHeld.find((h) => h.vmId === vmId) ?? null, [allHeld]);

  const mark = useCallback((vmId: string, on: boolean) => {
    if (on) inFlight.current.add(vmId);
    else inFlight.current.delete(vmId);
    setOut((s) => { const n = new Set(s); if (on) n.add(vmId); else n.delete(vmId); return n; });
  }, []);
  const setResult = useCallback((vmId: string, r: VmResult | null) => {
    setResults(({ [vmId]: _, ...rest }) => (r ? { ...rest, [vmId]: r } : rest));
  }, []);

  /** Sends one change, once, for the VM and computer captured at the press. */
  const send = useCallback(async (op: VmOp, vm: VmRef, to: Target): Promise<VmResult | 'pending' | 'busy'> => {
    if (framed || inFlight.current.has(vm.vmId) || allHeld.some((h) => h.vmId === vm.vmId)) return 'busy';
    mark(vm.vmId, true);
    setResult(vm.vmId, null);
    const r = await vmChange[op].run({ target: to, vmId: vm.vmId, name: vm.name, run: vm.run }).finally(() => mark(vm.vmId, false));
    reread(vm.name);
    if (r.outcome === 'pending') {
      const code = vmCode(r.error);
      if (r.hold && code && REPORTED_CODES.includes(code)) { reportedBy.set(r.hold, code); setNoted((n) => n + 1); }
      return 'pending';
    }
    if (r.outcome === 'done') done.current?.(op, { vmId: vm.vmId, name: vm.name });
    return { op, name: vm.name, outcome: r.outcome, ...(r.error ? { error: r.error } : {}) };
  }, [framed, allHeld, mark, reread, setResult]);

  // What the screen shows now: kept from its last committed render, so a handler made by an earlier render still judges
  // against it.
  const shownNow = useRef({ target, present });
  useLayoutEffect(() => { shownNow.current = { target, present }; }, [target, present]);
  /** The press or dialog still names what the screen shows: the same computer, and the same VM under that name. */
  const bound = useCallback((a: VmAsk): boolean => {
    const now = shownNow.current;
    if (!sameTarget(a.target, now.target) || !sameTarget(a.target, target)) return false;
    return (present === undefined || present.get(a.vm.name) === a.vm.vmId) && (now.present === undefined || now.present.get(a.vm.name) === a.vm.vmId);
  }, [target, present]);
  useEffect(() => {
    if (ask && !confirming && !bound(ask)) { setAsk(null); setAskResult(null); }
  }, [ask, confirming, bound]);

  const press = useCallback((op: VmOp, vm: VmRef) => {
    if (!target || framed) return;
    setAskResult(null);
    // A press for a VM the screen no longer shows under that name opens nothing and sends nothing.
    if (!bound({ op, vm, target })) return;
    if (CONFIRMED_OPS.includes(op)) { setAsk({ op, vm, target }); return; }
    void send(op, vm, target).then((r) => { if (typeof r === 'object' && r.outcome !== 'done') setResult(vm.vmId, r); });
  }, [target, framed, bound, send, setResult]);

  const confirm = useCallback(() => {
    if (!ask || confirming) return;
    const a = ask;
    // The screen moved on from what the dialog asked about: nothing is sent.
    if (!bound(a)) { setAsk(null); return; }
    setConfirming(true);
    setAskResult(null);
    void send(a.op, a.vm, a.target).then((r) => {
      setConfirming(false);
      // A definite refusal stays in the dialog, where the person reads it. Done, held (the band shows it) or refused by
      // a hold: the dialog closes.
      if (typeof r === 'object' && r.outcome !== 'done') { setAskResult(r); return; }
      setAsk(null);
    });
  }, [ask, confirming, bound, send]);

  const cancel = useCallback(() => { if (!confirming) { setAsk(null); setAskResult(null); } }, [confirming]);

  const varsOf = (h: VmHeld): VmVars | null => (h.own && h.id && target ? { target, vmId: h.id.vm, name: h.id.name, run: h.id.run } : null);

  const check = useCallback(async (h: VmHeld) => {
    const vars = varsOf(h);
    if (!vars || !h.id) return false;
    let ok = false;
    if (h.id.op === 'start') {
      // One read of this VM, sent now: a read already out may have been asked before the change, so it is never taken
      // for this one (core readFresh). A failed, cancelled or cache-only read proves nothing.
      const got = h.hold ? await vmQ.readFresh(h.id.name).catch(() => null) : null;
      if (got && h.hold && proveChange(h.id, [], detailsOf([got.data])) === 'applied') ok = await vmChange.start.complete(vars, h.hold);
    } else ok = await vmChange[h.id.op].readBack(vars);
    if (ok) {
      if (h.hold) reportedBy.delete(h.hold);
      done.current?.(h.id.op, { vmId: h.id.vm, name: h.id.name });
      reread(h.id.name);
    }
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- varsOf reads only target
  }, [target, reread]);

  const dismiss = useCallback(async (h: VmHeld) => {
    const vars = varsOf(h);
    if (!vars || !h.id || !h.hold) return false;
    const ok = await vmChange[h.id.op].dismiss(vars, h.hold);
    if (ok) reportedBy.delete(h.hold);
    reread(h.id.name);
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- varsOf reads only target
  }, [target, reread]);

  // A young hold with a proof is read again by the flow itself, at the fast pace, until it is proved or a minute old:
  // after that only the person's Check again reads.
  const young = allHeld.filter((h) => h.own && h.id && h.id.op !== 'reset');
  const youngKey = young.map((h) => `${h.hold ?? ''}@${h.at}`).join('|');
  const checkRef = useRef(check);
  checkRef.current = check;
  const youngRef = useRef(young);
  youngRef.current = young;
  useEffect(() => {
    if (!youngKey) return undefined;
    const timer = setInterval(() => {
      for (const h of youngRef.current) if (Date.now() - h.at < POLL_AFTER_CHANGE_MS) void checkRef.current(h);
    }, POLL_FAST_MS);
    return () => clearInterval(timer);
  }, [youngKey]);

  const resultRows = useMemo(() => Object.entries(results).map(([vmId, r]) => ({ ...r, vmId })), [results]);
  return {
    framed, ask, askResult, confirming, press, confirm, cancel, allHeld, held, check, dismiss,
    sending: (vmId) => out.has(vmId),
    result: (vmId) => results[vmId] ?? null,
    results: resultRows,
    clearResult: (vmId) => setResult(vmId, null),
  };
}
