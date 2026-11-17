// One VM's logs and its console line: the log read (manual refresh only) and the one change of the Logs tab, a line typed
// at the VM's console.
//
// Contract, in plain words:
//   - The log is the end of one of the VM's logs (the console, the machine's own errors, or a helper's: network, TPM,
//     shared folder), at most LOG_TAIL lines, read when the tab opens, when the person picks another log and on Refresh.
//     Nothing re-reads it on a timer.
//   - Log text is written by the VM and its helpers, never by Hoody: it is shown as plain text only, every control,
//     escape and invisible character removed, each line cut at LOG_LINE_MAX characters, never more than LOG_TAIL lines.
//   - A 404 for a VM that exists means the VM never ran, or that helper did not run: no log yet, never a failure.
//   - A console line is sent once. Nothing a read shows proves it arrived, so a line whose answer is not known stays held
//     until the person stops tracking it; it is never sent again by the page. Its lock is the VM's input lock, apart
//     from the VM's change lock, so a held line never keeps Stop or Power off from being pressed.
//   - The line's text is never kept: the held change names the VM, never what was typed.
import { defineMutation, defineQuery, heldChanges, type HeldChange, type HubError, type Target } from '@core';
import type { StringKey as KitStringKey } from '@kit';
import { useEffect, useState } from 'react';
import { INPUT_LOCK } from './create';
import { isVmName, vmCode, type VmCode, type VmSpec } from './logic';
import { CONSOLE_WRITE_MAX_BYTES, routes } from './routes';
import type strings from './strings.en.json';

/** A key of the page's strings (the words a refusal or a held line maps to; logs.test.ts checks each exists). */
type StringKey = KitStringKey<typeof strings>;

// ── the log read ─────────────────────────────────────────────────────────────────────

/** The logs a VM keeps, in the order the page offers them. */
export const LOG_SOURCES = ['console', 'qemu', 'passt', 'swtpm', 'virtiofsd'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];
/** Lines asked for, counted from the end of the log. */
export const LOG_TAIL = 200;
/** Characters kept of one line; a longer one is cut and marked. */
export const LOG_LINE_MAX = 2000;

/** The logs this VM can have: its console when it has one, the machine's errors and its network always, its TPM and
 *  its shared folder only when it has them. */
export function logSources(spec: Pick<VmSpec, 'console' | 'tpm' | 'fileSharing'>): LogSource[] {
  return LOG_SOURCES.filter((s) => (s === 'console' ? spec.console : s === 'swtpm' ? spec.tpm : s === 'virtiofsd' ? spec.fileSharing : true));
}

// Controls (C0 but tab, DEL, C1), bidirectional overrides and marks, zero-width and other invisible characters.
const UNSEEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻]/g;
// An escape sequence a terminal would act on (CSI, OSC, and the two-character ones), removed whole before its
// characters would be.
const ESCAPES = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])|\u009b[0-?]*[ -/]*[@-~]/g;

/** One log's text as the page shows it: plain lines, at most `max` of them (the last ones), each at most LOG_LINE_MAX
 *  characters. `cut`: a line was shortened or lines were left out. */
export function logLines(content: string, max = LOG_TAIL): { lines: string[]; cut: boolean } {
  let all = content.replace(/\r\n?/g, '\n').split('\n');
  if (all.length > 0 && all[all.length - 1] === '') all.pop();
  let cut = false;
  if (all.length > max) {
    all = all.slice(all.length - max);
    cut = true;
  }
  const lines = all.map((raw) => {
    const clean = raw.replace(ESCAPES, '').replace(UNSEEN, '').replace(/\t/g, '  ');
    if (clean.length <= LOG_LINE_MAX) return clean;
    cut = true;
    return `${clean.slice(0, LOG_LINE_MAX - 1)}…`;
  });
  return { lines, cut };
}

export interface VmLog {
  readonly name: string;
  readonly source: LogSource;
  /** The lines to show, cleaned and bounded (logLines). */
  readonly lines: readonly string[];
  readonly cut: boolean;
}

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The log answer, or null when it is not one, or is about another VM or another log than the one asked for. */
export function parseLog(wire: unknown, asked: { name: string; source: LogSource }): VmLog | null {
  const w = rec(wire);
  if (!w || !isVmName(w.name) || w.name !== asked.name || w.source !== asked.source) return null;
  if (typeof w.content !== 'string' || typeof w.lines !== 'number' || !Number.isSafeInteger(w.lines) || w.lines < 0) return null;
  return { name: w.name, source: asked.source, ...logLines(w.content) };
}

export interface LogVars {
  readonly name: string;
  /** Which VM of that name: a new id is a new VM, whose tab reads again (an answer cached for the old one is not shown). */
  readonly vmId: string | null;
  readonly source: LogSource;
}

/** An answer the page cannot read: the read shows as failed with this, so nothing downstream takes it for "no log". */
const BAD_ANSWER = Object.freeze({ kind: 'unavailable', status: 0, code: 'BAD_ANSWER' });

// The select needs the asked log to check the answer against it; the answer names both, so it is checked here and the
// read keys on the variables.
const logQ = defineQuery<unknown, unknown, LogVars>(routes.log, {
  input: (v) => ({ params: { name: v.name }, query: { source: v.source, tail: LOG_TAIL } }),
  // Read on purpose only: never stale, so neither a remount nor a focus reads it again.
  staleTime: Infinity,
});

export interface LogRead {
  /** The log; undefined until an answer, or while there is none (never ran: `none`). */
  readonly log: VmLog | undefined;
  /** The VM program answered that this log does not exist yet. */
  readonly none: boolean;
  readonly loading: boolean;
  /** The last read failed for any other reason, or was not readable. */
  readonly failed: boolean;
  readonly error: unknown;
  readonly fetching: boolean;
  refresh(): void;
}

/** One log of one VM, read when the tab opens, once per pick and again on refresh. `enabled` false: not read at all.
 *  An answer cached before this VM's tab opened is never shown: it may be another VM's of the same name (made again
 *  since). The tab reads again and shows loading until that answer lands. */
export function useVmLog(v: LogVars, enabled: boolean): LogRead {
  const q = logQ.use(v, { enabled });
  // An opening is one VM's one log: a new pick of a log (even one shown before) reads it again.
  const vm = `${v.name}/${v.vmId ?? ''}/${v.source}`;
  const [opened, setOpened] = useState(() => ({ vm, at: Date.now() }));
  if (opened.vm !== vm) setOpened({ vm, at: Date.now() });
  const fresh = q.dataUpdatedAt >= opened.at;
  const freshError = q.errorUpdatedAt >= opened.at;
  // One read per opening: once an answer or a failure belongs to this opening, nothing is read again on its own.
  const stale = enabled && !fresh && !freshError && (q.data !== undefined || q.isError);
  useEffect(() => {
    if (stale && !q.isFetching) void q.refetch();
  }, [stale, q.isFetching, opened.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const raw = enabled && fresh ? q.data : undefined;
  let log: VmLog | undefined;
  let bad = false;
  if (raw !== undefined) {
    const parsed = parseLog(raw, v);
    if (parsed) log = parsed;
    else bad = true;
  }
  const isError = q.isError && freshError;
  const none = enabled && isError && q.error?.status === 404;
  const failed = enabled && ((isError && !none) || bad);
  return {
    log: none ? undefined : log,
    none,
    loading: enabled && (q.isPending || (raw === undefined && !isError)),
    failed,
    error: isError ? q.error : bad ? BAD_ANSWER : undefined,
    fetching: q.isFetching,
    refresh: () => void q.refetch(),
  };
}

/** Reads the console log of one VM now (Check again on a held line): true only when an answer for that VM came back. */
export async function readConsole(v: { name: string; vmId: string | null }): Promise<boolean> {
  const got = await logQ.readFresh({ ...v, source: 'console' });
  return got !== null && parseLog(got.data, { name: v.name, source: 'console' }) !== null;
}

// ── a line typed at the console ──────────────────────────────────────────────────────

/** The bytes a line takes on the wire: its text and the newline Enter adds. */
export const lineBytes = (text: string): number => new TextEncoder().encode(`${text}\n`).length;

/** Why a line cannot be sent as typed, or null when it can: nothing typed, or more than the console takes at once. */
export function lineProblem(text: string): 'empty' | 'tooLong' | null {
  if (text.length === 0) return 'empty';
  return lineBytes(text) > CONSOLE_WRITE_MAX_BYTES ? 'tooLong' : null;
}

/** Why the console takes no line from this VM now, or null when it does. `framed`: the Hub is inside another page. A VM
 *  the read gave no id for takes none: a held line names the VM by its id. */
export function sendBlock(vm: { state: string; vmId: string | null; spec: Pick<VmSpec, 'console' | 'consoleInput'> | null }, framed: boolean): 'framed' | 'noInput' | 'noId' | 'notRunning' | null {
  if (framed) return 'framed';
  if (!vm.spec || !vm.spec.console || !vm.spec.consoleInput) return 'noInput';
  if (!vm.vmId) return 'noId';
  return vm.state === 'Running' ? null : 'notRunning';
}

export interface LineVars {
  /** The computer the VM is inside, so the hold stays with it whatever the top bar shows later. */
  readonly target: Target;
  /** The VM's name, as the request names it. */
  readonly name: string;
  /** The VM's own id: the hold names this VM, never a later one under the same name. */
  readonly vmId: string;
  readonly text: string;
}

// The VM's input lock (create.ts INPUT_LOCK, keyed by the VM's id), shared with the Screen tab's key presses: a held key
// press or line keeps the next input from being sent, and never blocks a power change (the VM's own change lock).
const lineM = defineMutation<LineVars>(routes.consoleWrite, {
  input: (v) => ({ target: v.target, params: { name: v.name }, body: `${v.text}\n` }),
  lock: INPUT_LOCK,
  name: 'vms.line',
  lockKey: (v) => v.vmId,
  identity: (v) => ({ computer: v.target.container.id, vmId: v.vmId, name: v.name, what: 'line' }),
  page: 'vms',
});

/** The console line's hook: run (sends once, never rejects), outcome, error, running. */
export const useConsoleLine = () => lineM.use();

/** An input of this VM that may have arrived (a line from here, or a key press from the Screen tab), or null. `own`: a
 *  line this page sent from here, which Stop tracking frees; a key press is the Screen tab's to settle. */
export interface HeldInput {
  readonly change: HeldChange;
  readonly own: boolean;
  readonly what: 'line' | 'keys';
}

/** The held input of one VM on one computer (re-read on core's changes version). */
export function heldInput(target: Target | null, vmId: string | null): HeldInput | null {
  if (!target || !vmId) return null;
  const h = heldChanges(INPUT_LOCK).find((c) => c.target?.container.id === target.container.id && (c.identity as { vmId?: unknown } | null)?.vmId === vmId);
  if (!h) return null;
  const what = (h.identity as { what?: unknown }).what === 'line' ? 'line' : 'keys';
  return { change: h, own: what === 'line' && lineM.heldBy(h) === 'self', what };
}

/** Stops tracking a held line this page sent (the person was warned it may have arrived). */
export function dismissLine(h: HeldInput): Promise<boolean> {
  const i = h.change.identity as { vmId: string; name: string };
  return h.own && h.change.target && h.change.hold ? lineM.dismiss({ target: h.change.target as Target, name: i.name, vmId: i.vmId, text: '' }, h.change.hold) : Promise.resolve(false);
}

/** The codes that say a line was refused before anything reached the VM, each with its own words; the rest share one. */
const LINE_REFUSALS: readonly VmCode[] = ['BadState', 'OperationInProgress', 'NotFound', 'Orphaned', 'RequestBodyStalled', 'SpecInvalid'];
/** Codes the computer reports on an answer that leaves the outcome open (a 5xx): one says nothing reached the VM, one
 *  that part of the line may have. Shown with the held line; never read as "not sent". */
const LINE_HELD_REASONS: readonly VmCode[] = ['ConsoleUnavailable', 'ConsoleDeliveryIndeterminate'];

/** The strings key of a refused line's reason. */
export function lineRefusal(e: HubError | undefined): StringKey {
  const c = vmCode(e);
  return (c && LINE_REFUSALS.includes(c) ? `logs.send.refused.${c}` : 'logs.send.refused.other') as StringKey;
}

/** The strings key of what the computer said about a held line, or null when it said nothing this page knows. */
export function lineHeldReason(e: HubError | undefined): StringKey | null {
  const c = vmCode(e);
  return c && LINE_HELD_REASONS.includes(c) ? (`logs.held.${c}` as StringKey) : null;
}
