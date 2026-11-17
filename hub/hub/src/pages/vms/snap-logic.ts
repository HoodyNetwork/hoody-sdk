// Pure rules of a VM's Snapshots tab: no React, no I/O.
//
// Contract, in plain words:
//   - parseSnapshots and parseSnapshotTaken read the VM program's two snapshot shapes: every field checked, a typed
//     value or null. A snapshot that cannot be restored says why, and one that can says nothing: an answer that breaks
//     that is unreadable.
//   - A snapshot is taken and restored only while the VM is stopped (snapBlock); it can be deleted in any state.
//   - labelCheck says whether a typed label can be sent: the VM name rule, and not one the list already holds.
//   - restoreCheck and removeCheck judge a confirmed question against a list read after the confirm: the very snapshot
//     it named (label and time) must still be there.
//   - The proofs are bound to the VM's own id, never its name: they read a fresh detail of the VM next to the fresh
//     snapshot list, and a VM with another id under the same name proves nothing. Taking is proved by the label in the
//     list, only when a list read right before the send lacked it; deleting by the label gone from it. A list that shows neither proves nothing
//     (the request may still be at work). Restoring has no proof at all: no read shows it.
import { isVmName, type Vm, type VmCode } from './logic';

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const text = (v: unknown, max = 4096): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const BAD = Symbol('bad');
function opt<T>(o: Record<string, unknown>, key: string, read: (v: unknown) => T | null): T | null | typeof BAD {
  if (!Object.hasOwn(o, key) || o[key] === undefined) return null;
  const v = read(o[key]);
  return v === null ? BAD : v;
}

// ── snapshots ────────────────────────────────────────────────────────────────────────

export interface Snapshot {
  readonly label: string;
  /** When it was taken, by the computer's clock (seconds). */
  readonly createdUnix: number;
  /** The size of the disk it holds. */
  readonly diskBytes: number;
  /** Whether the VM, as it is now, can go back to it. */
  readonly restorable: boolean;
  /** The VM program's sentence for why not; null when it can. */
  readonly blockedReason: string | null;
}

/** One VM's snapshots as read: the VM's name rides along so a proof never reads another VM's list. */
export interface SnapshotList {
  readonly vm: string;
  readonly items: readonly Snapshot[];
}

/** A VM's snapshot list, or null when the answer is not one. */
export function parseSnapshots(wire: unknown): Snapshot[] | null {
  if (!Array.isArray(wire)) return null;
  const out: Snapshot[] = [];
  const seen = new Set<string>();
  for (const it of wire) {
    const r = rec(it);
    if (!r || !isVmName(r.label)) return null;
    const createdUnix = count(r.created_unix), diskBytes = count(r.disk_bytes), restorable = flag(r.restorable);
    const nvram = opt(r, 'nvram_bytes', count), tpm = opt(r, 'tpm_bytes', count), reason = opt(r, 'blocked_reason', (v) => text(v));
    if (createdUnix === null || diskBytes === null || restorable === null || nvram === BAD || tpm === BAD || reason === BAD) return null;
    // A reason exactly when it cannot be restored.
    if (restorable !== (reason === null)) return null;
    // One label, one snapshot.
    if (seen.has(r.label)) return null;
    seen.add(r.label);
    out.push({ label: r.label, createdUnix, diskBytes, restorable, blockedReason: reason });
  }
  return out;
}

export interface SnapshotTaken {
  readonly label: string;
  /** Things the VM program noticed while taking it, as its own sentences. */
  readonly warnings: readonly string[];
}

/** The answer to "take a snapshot", or null when it is not one, or is about another VM or label. */
export function parseSnapshotTaken(wire: unknown, vm: string, label: string): SnapshotTaken | null {
  const r = rec(wire);
  if (!r || r.name !== vm || r.label !== label || count(r.disk_bytes) === null || flag(r.reflinked) === null) return null;
  let warnings: string[] = [];
  if (r.warnings !== undefined) {
    if (!Array.isArray(r.warnings) || r.warnings.some((x) => text(x) === null)) return null;
    warnings = (r.warnings as string[]).filter((x) => x.trim() !== '');
  }
  return { label, warnings };
}

// ── what can be done ─────────────────────────────────────────────────────────────────

/** Why a snapshot cannot be taken or restored now: the VM is still being made (or was never made), or it is not
 *  stopped. Null: it can. */
export function snapBlock(vm: Pick<Vm, 'state' | 'spec'>): 'notReady' | 'notStopped' | null {
  if (vm.spec === null || vm.state === 'Creating') return 'notReady';
  return vm.state === 'Stopped' ? null : 'notStopped';
}

/** Whether a typed label can be sent: `empty`, `invalid` (not the name rule), `taken` (the list holds it), or `ok`. */
export function labelCheck(typed: string, existing: readonly Pick<Snapshot, 'label'>[]): 'empty' | 'invalid' | 'taken' | 'ok' {
  if (typed === '') return 'empty';
  if (!isVmName(typed)) return 'invalid';
  return existing.some((s) => s.label === typed) ? 'taken' : 'ok';
}

const two = (n: number) => String(n).padStart(2, '0');
/** A label to start from: the day and time, and a number after it when the list already holds that one. */
export function suggestLabel(now: Date, existing: readonly Pick<Snapshot, 'label'>[]): string {
  const base = `snap-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  if (labelCheck(base, existing) === 'ok') return base;
  for (let n = 2; n < 1000; n++) if (labelCheck(`${base}-${n}`, existing) === 'ok') return `${base}-${n}`;
  return base;
}

// ── proofs ───────────────────────────────────────────────────────────────────────────

type Verdict = 'applied' | 'not_applied' | undefined;

/** The fresh snapshot lists of the VM a held change names, only while a fresh detail shows that same VM (its own id)
 *  still under that name. Null: no evidence. answers[0]: snapshot lists; answers[1]: VM details. */
function evidence(identity: unknown, answers: readonly (readonly unknown[])[]): { id: Record<string, unknown>; lists: readonly SnapshotList[] } | null {
  const id = rec(identity);
  const name = id?.name, vmId = id?.vm;
  if (!id || typeof name !== 'string' || typeof vmId !== 'string' || vmId === '') return null;
  const vms = (answers[1] ?? []).filter((v): v is Vm => rec(v)?.name === name);
  // The VM's id is the binding: no fresh detail of it, or another VM under the name, is no evidence.
  if (vms.length === 0 || vms.some((v) => v.vmId !== vmId)) return null;
  const lists = (answers[0] ?? []).filter((l): l is SnapshotList => rec(l)?.vm === name && Array.isArray(rec(l)?.items));
  return lists.length > 0 ? { id, lists } : null;
}

/** Taking a snapshot: proved when every fresh list of that VM holds the label, and only for a take that was sent
 *  right after a fresh list of that VM lacked it (`absentBefore: true` in the identity). Without that record a listed
 *  label may be someone else's snapshot, whose existence refused this take: it proves nothing. No clock is compared. */
export function snapTakenProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const e = evidence(identity, answers);
  const label = e?.id.label;
  if (!e || typeof label !== 'string' || e.id.absentBefore !== true) return undefined;
  return e.lists.every((l) => l.items.some((s) => s.label === label)) ? 'applied' : undefined;
}

/** The list a read made for a press answered, or null when it is not that: the read failed, has no data, or its data
 *  is not newer than the press (a read that was cancelled, as when the tab is left or core cancels it, resolves with
 *  what was kept before it: that is not a fresh answer). `press.at` is the press and `press.had` the stamp of the list
 *  held at the press, both this device's clock in ms. An answer stamped in the very millisecond of the press counts
 *  only when it is newer than the list held then: a kept list that landed in that millisecond never does. */
export function freshList(
  result: { readonly isError: boolean; readonly data: SnapshotList | undefined; readonly dataUpdatedAt: number } | null | undefined,
  press: { readonly at: number; readonly had: number },
): readonly Snapshot[] | null {
  if (!result || result.isError || result.data === undefined) return null;
  return result.dataUpdatedAt > press.at || (result.dataUpdatedAt === press.at && result.dataUpdatedAt > press.had) ? result.data.items : null;
}

/** Whether the tab's own read of the VM names another VM than the screen shows under the name. An id either side lacks
 *  says nothing (the screen's own guard covers a VM that cannot be told apart). */
export const vmReadDisagrees = (shown: string, read: string | null | undefined): boolean =>
  shown !== '' && typeof read === 'string' && read !== '' && read !== shown;

/** Whether a confirmed restore may still be sent, judged right before the send: the tab still shows the computer and
 *  the VM (its own id) the question named, and the list read after the confirm still holds that very snapshot (same
 *  label, same time) as restorable. `changed`: it does not; nothing is sent. */
export function restoreCheck(ask: SnapAsk, now: { readonly computer: string; readonly vm: string }, fresh: readonly Snapshot[]): 'ok' | 'changed' {
  const s = askedSnapshot(ask, now, fresh);
  return s && s.restorable ? 'ok' : 'changed';
}

/** Whether a confirmed delete may still be sent, judged right before the send like restoreCheck: same computer and VM,
 *  and the fresh list still holds that very snapshot (same label, same time; restorable or not). A snapshot deleted
 *  and taken again under the label since the question opened is another one: `changed`, nothing is sent. */
export function removeCheck(ask: SnapAsk, now: { readonly computer: string; readonly vm: string }, fresh: readonly Snapshot[]): 'ok' | 'changed' {
  return askedSnapshot(ask, now, fresh) ? 'ok' : 'changed';
}

/** What a restore or delete question names: the computer, the VM's own id and the snapshot (label and time). */
export interface SnapAsk { readonly computer: string; readonly vm: string; readonly label: string; readonly createdUnix: number }
function askedSnapshot(ask: SnapAsk, now: { readonly computer: string; readonly vm: string }, fresh: readonly Snapshot[]): Snapshot | null {
  if (ask.vm === '' || ask.computer !== now.computer || ask.vm !== now.vm) return null;
  const s = fresh.find((x) => x.label === ask.label);
  return s && s.createdUnix === ask.createdUnix ? s : null;
}

/** Deleting a snapshot: proved when every fresh list of that VM lacks the label. */
export function snapGoneProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const e = evidence(identity, answers);
  const label = e?.id.label;
  if (!e || typeof label !== 'string') return undefined;
  return e.lists.every((l) => !l.items.some((s) => s.label === label)) ? 'applied' : undefined;
}

// ── refusals ─────────────────────────────────────────────────────────────────────────

/** The VM program's codes the tab has its own sentence for, per change: definite refusals (4xx). */
export const SNAP_CODES = {
  take: ['AlreadyExists', 'BadState', 'SourceBusy', 'OperationInProgress', 'NotFound'],
  restore: ['BadState', 'SourceBusy', 'OperationInProgress', 'NotFound'],
  remove: ['OperationInProgress', 'NotFound'],
} as const satisfies Record<string, readonly VmCode[]>;
export type SnapChange = keyof typeof SNAP_CODES;
export type SnapErrKey = { [C in SnapChange]: `snap.err.${C}.${(typeof SNAP_CODES)[C][number]}` }[SnapChange];

/** The string key of a refusal's own sentence (`snap.err.<change>.<code>`), or null when the tab has none. */
export function snapErrKey(change: SnapChange, code: unknown): SnapErrKey | null {
  return typeof code === 'string' && (SNAP_CODES[change] as readonly string[]).includes(code) ? (`snap.err.${change}.${code}` as SnapErrKey) : null;
}

/** Codes the VM program answers with a 5xx although nothing was changed: the outcome stays held (core's rule for a
 *  5xx), and the held note adds what the computer reported. */
export const SNAP_REASONS = ['InsufficientSpace'] as const satisfies readonly VmCode[];
export type SnapReasonKey = `snap.reason.${(typeof SNAP_REASONS)[number]}`;
export const snapReasonKey = (code: unknown): SnapReasonKey | null =>
  typeof code === 'string' && (SNAP_REASONS as readonly string[]).includes(code) ? (`snap.reason.${code}` as SnapReasonKey) : null;
