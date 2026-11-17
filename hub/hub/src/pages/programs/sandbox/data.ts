// The sandbox panel's data: status and host reads, the scrubbed program read, and the one change (a whole-block
// save or a removal) under C9.
//
// Settlement of a save (the daemon's own answers to a program update):
//   - 2xx: saved. Nothing here says the running program is sandboxed: the status read that follows says what the
//     daemon reports.
//   - 400 whose raw text starts with one of the post-save templates on this program's id ("program {id} saved but
//     NOT applied", "… persisted but its configuration was NOT applied", "… was updated but its configuration was
//     NOT removed"): the edit was PERSISTED, then the apply failed. Shown as saved but not applied, never refused.
//   - a 400 with no readable text (an error body over kit.ts's 64 KiB cap arrives empty): unclear, may have saved.
//   - any other 400 (an unknown id included) and 413: refused before anything was saved.
//   - 5xx, timeout, network: may have gone through. Core holds the change; only the page's own fresh status read
//     proves it, and only by the stored block equalling the block this send carried (its fingerprint in the hold's
//     identity). A read showing the old block proves nothing (another sender may have put it back), so the hold
//     never frees as "not applied": the person's warned Dismiss frees it.
import { api, capture, defineMutation, defineQuery, heldChanges, useCore, type HeldChange, type HubError, type Target } from '@core';
import { useSyncExternalStore } from 'react';
import { fingerprint, readHost, restricts, type HostSupport, type SandboxBlock } from './block';
import { factsOf, type ProgramFacts } from './form';
import { readStatus, type SandboxStatus } from './model';
import { sandboxRoutes as routes } from './routes';

const IDX = 1;
const PAGE = 'programs';
export const SANDBOX_LOCK = 'daemon.program.sandbox';

// ── Reads ────────────────────────────────────────────────────────────────────────────

type StatusP = { id: string; target: Target | null };
const statusQ = defineQuery<unknown, SandboxStatus | null, StatusP>(routes.status, {
  input: (p) => ({ index: IDX, params: { id: p.id }, ...(p.target ? { target: p.target } : {}) }),
  select: readStatus,
});

/** One program's sandbox status, read again every 30 s while shown. data null: a malformed answer. */
export function useStatus(id: string, target: Target | null, enabled = true) {
  return statusQ.use({ id, target }, { enabled, refetchInterval: 30000 });
}

/** A status read sent now (Check, after a save): null when no fresh answer came; {status: null} for a malformed
 *  answer. */
export async function readStatusFresh(id: string, target: Target | null): Promise<{ status: SandboxStatus | null } | null> {
  const got = await statusQ.readFresh({ id, target });
  return got ? { status: got.data } : null;
}

/** Drops cached status answers so every shown status reads again (after a save that reached the computer). */
export function refreshStatus(): Promise<void> {
  return statusQ.invalidate();
}

const hostQ = defineQuery<unknown, HostSupport | null, Target | null>(routes.health, {
  input: (t) => ({ index: IDX, ...(t ? { target: t } : {}) }),
  select: (w) => readHost(typeof w === 'object' && w !== null ? (w as { sandbox?: unknown }).sandbox : undefined),
});

/** The host's sandbox parts (one /health read per computer, every 5 min while shown). data null: not reported. */
export function useHost(target: Target | null, enabled = true) {
  return hostQ.use(target, { enabled: enabled && !!target, refetchInterval: 300000 });
}

/** The program's facts for the editor, through the secret route's scrub: environment values and webhook headers are
 *  wiped from the raw answer before anything else sees it (core api: scrub runs first, exactly once). Never cached:
 *  the editor holds the result while it is open. null when the read failed or the answer was not a program. */
export async function readFacts(id: string, target: Target | null): Promise<ProgramFacts | null> {
  let facts: ProgramFacts | null = null;
  const scrub = (a: unknown) => {
    facts = factsOf(a);
    const p = typeof a === 'object' && a !== null ? (a as Record<string, unknown>) : null;
    const prog = p && typeof p.program === 'object' && p.program !== null ? (p.program as Record<string, unknown>) : p;
    if (prog) for (const k of Object.keys(prog)) delete prog[k];
  };
  try {
    await api(routes.program, { index: IDX, params: { id }, ...(target ? { target } : {}), scrub });
  } catch {
    return null;
  }
  return facts;
}

// ── The change ───────────────────────────────────────────────────────────────────────

export interface SaveVars {
  id: string;
  /** The whole block to store, or null to remove the sandbox. */
  block: SandboxBlock | null;
  /** Fingerprint of the stored block the editor started from (shown with the hold; never a proof on its own). */
  beforeFp: string;
  target: Target;
}

/** The identity a hold carries: the program and the two fingerprints. Never the block itself. */
export interface SaveIdentity {
  id: string;
  sentFp: string;
  beforeFp: string;
}

const saveM = defineMutation<SaveVars>(routes.edit, {
  input: (v) => ({ index: IDX, recovers: true, target: v.target, params: { id: v.id }, body: { sandbox: v.block } }),
  lock: SANDBOX_LOCK,
  lockKey: (v) => ({ id: v.id }),
  identity: (v): SaveIdentity => ({ id: v.id, sentFp: fingerprint(v.block), beforeFp: v.beforeFp }),
  page: PAGE,
});

export type SaveOutcome =
  | { kind: 'saved' }
  | { kind: 'savedNotApplied'; text: string }
  | { kind: 'refused'; text: string; tooLarge: boolean }
  | { kind: 'pending'; hold: string | undefined }
  /** A refusal that carried no readable text (or another status core calls failed): may have been saved. */
  | { kind: 'unclear' }
  | { kind: 'notSent'; code: string | null }
  | { kind: 'stale' };

/** Replaces each `%(` reference through its balanced closing parenthesis (names may hold parentheses, as Python's
 *  mapping keys do) and an optional `s`; an unbalanced one hides the rest of the text. */
function hideTokens(s: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = s.indexOf('%(', i);
    if (at < 0) return out + s.slice(i);
    out += s.slice(i, at) + '%(…)s';
    let depth = 0;
    let j = at + 1;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) break;
    }
    if (j >= s.length) return out;
    i = s[j + 1] === 's' ? j + 2 : j + 1;
  }
}

/** The daemon's refusal text from a kit error (core kit.ts keeps the answer body as `data`), cleaned for display:
 *  control characters out, at most 600 characters. '' when there is none. */
export function daemonText(e: HubError | undefined): string {
  const d = e?.data as { error?: unknown } | undefined;
  const raw = typeof d?.error === 'string' ? d.error : typeof e?.code === 'string' ? e.code : '';
  // A supervisord interpolation token (`%(NAME)s`) is the only stored environment text an apply failure can quote
  // (the daemon's own rule for a refusal's reason): hidden, so a value written as one is never shown.
  const clean = hideTokens(raw.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')).trim();
  return clean.length > 600 ? clean.slice(0, 599) + '…' : clean;
}

/** The daemon's raw refusal text, uncut, or null when the answer carried none (kit.ts drops an error body over
 *  64 KiB, or one that is not JSON). */
function rawText(e: HubError | undefined): string | null {
  const d = e?.data as { error?: unknown } | undefined;
  return typeof d?.error === 'string' ? d.error : null;
}

/** A definite 400 after the edit was persisted: the four templates of the daemon's program update, anchored
 *  at the start and on this program's id, read on the RAW text (a pre-save refusal quoting a path that holds
 *  "NOT applied" does not start this way). Also read by Edit (parts/edit.ts), the route's other sender. */
export function persistedThenFailed(raw: string, id: string): boolean {
  const p = `program ${id} `;
  if (!raw.startsWith(p)) return false;
  const rest = raw.slice(p.length);
  return (
    rest.startsWith('saved but NOT applied') ||
    rest.startsWith('persisted but its configuration was NOT applied') ||
    rest.startsWith('was updated but its configuration was NOT removed')
  );
}

/** Sends the save once. Never throws. The 2xx answer (the whole program, environment included) is dropped here:
 *  only the outcome leaves this function (a standalone run, never the mutation hook, which keeps its result). */
export async function save(v: SaveVars): Promise<SaveOutcome> {
  const k = sendKey(capture().account, v.id, v.target);
  moveSends(k, 1);
  let res: Awaited<ReturnType<typeof saveM.run>>;
  try {
    res = await saveM.run(v);
  } finally {
    moveSends(k, -1);
  }
  if (res.outcome === 'done') return { kind: 'saved' };
  if (res.outcome === 'pending') return { kind: 'pending', hold: res.hold };
  if (res.outcome === 'stale') return { kind: 'stale' };
  if (res.outcome === 'not_sent') return { kind: 'notSent', code: res.error?.code ?? null };
  const status = res.error?.status;
  if (status === 413) return { kind: 'refused', text: daemonText(res.error), tooLarge: true };
  const raw = rawText(res.error);
  // A 400 with no readable text cannot be told apart from a post-save failure: its outcome is unknown. Core has
  // already released its lock (a 4xx is 'failed' there), so the page holds it itself (SandboxPanel's tab hold),
  // until a status read proves the sent block or the person dismisses it.
  if (status !== 400 || raw === null) return { kind: 'unclear' };
  if (persistedThenFailed(raw, v.id)) return { kind: 'savedNotApplied', text: daemonText(res.error) };
  return { kind: 'refused', text: daemonText(res.error), tooLarge: false };
}

/** This program's held sandbox save on this computer (any sender), with what it carried; undefined when none. */
// This tab's saves still out, by account, computer and program: core's hold (heldChanges) starts only once the answer
// says the change may have gone through, so while the request is out busy.ts reads it here. Another account's send
// never counts (an account switch shows none of it).
// Another tab's send still out is not counted here: busy.ts reads it from core (sendingChanges).
const sends = new Map<string, number>();
const sendListeners = new Set<() => void>();
let sendsVer = 0;
const sendKey = (account: string | null, id: string, t: Target) => `${account ?? '-'}|${t.project.id}/${t.container.id}|${id}`;
function moveSends(k: string, by: 1 | -1) {
  const n = (sends.get(k) ?? 0) + by;
  if (n > 0) sends.set(k, n);
  else sends.delete(k);
  sendsVer++;
  for (const f of sendListeners) f();
}
const subscribeSends = (f: () => void) => {
  sendListeners.add(f);
  return () => void sendListeners.delete(f);
};
const sendsVersion = () => sendsVer;
/** True while this tab's save of this program on this computer, sent in the account shown now, has not answered. */
export function sandboxSending(id: string, target: Target | null): boolean {
  return !!target && sends.has(sendKey(capture().account, id, target));
}
/** Re-renders on every save that leaves or answers (busy.ts). */
export function useSandboxSendsVersion(): number {
  return useSyncExternalStore(subscribeSends, sendsVersion, sendsVersion);
}

export interface SandboxHold {
  hold: string | undefined;
  own: boolean;
  identity: SaveIdentity | null;
  fromPage: string | undefined;
}
export function sandboxHold(id: string, target: Target | null): SandboxHold | undefined {
  if (!target) return undefined;
  const h = heldChanges(SANDBOX_LOCK).find((c) => sameTarget(c, target) && idOf(c) === id);
  if (!h) return undefined;
  return { hold: h.hold, own: saveM.heldBy(h) === 'self', identity: identityOf(h), fromPage: h.from?.page };
}
const sameTarget = (h: HeldChange, t: Target) => h.target?.container.id === t.container.id && h.target?.project.id === t.project.id;
const idOf = (h: HeldChange) => {
  const i = h.identity as { id?: unknown } | null;
  return i && (typeof i.id === 'string' || typeof i.id === 'number') ? String(i.id) : null;
};
function identityOf(h: HeldChange): SaveIdentity | null {
  const i = h.identity as Partial<SaveIdentity> | null;
  return i && typeof i.sentFp === 'string' && typeof i.beforeFp === 'string' && i.id !== undefined ? { id: String(i.id), sentFp: i.sentFp, beforeFp: i.beforeFp } : null;
}

export type CheckVerdict = 'applied' | 'savedNotApplied' | 'storedUnconfirmed' | 'unknown' | 'readFailed';

/** What a fresh status proves about a send that carried `sentFp` over `beforeFp`. The stored block equal to the
 *  sent one proves it was saved; whether it is applied is what the status shows (no problem, firewall not
 *  degraded, and a restricting block has a revision). A re-apply (sentFp === beforeFp) stored nothing new, and no
 *  status field reports the installed definition (`rev` is computed from validation, by the daemon's
 *  status read), so a status never proves it: 'storedUnconfirmed' keeps it held until the person dismisses it. */
export function proofOf(status: SandboxStatus, sentFp: string, beforeFp: string): Exclude<CheckVerdict, 'readFailed'> {
  if (fingerprint(status.configured) !== sentFp) return 'unknown';
  const applied = status.problems.length === 0 && status.firewall !== 'degraded' && (!restricts(status.configured) || status.rev !== null);
  if (sentFp === beforeFp) return 'storedUnconfirmed';
  return applied ? 'applied' : 'savedNotApplied';
}

/** Check, for the hold that was SHOWN: one fresh status read; a proof (proofOf: saved, applied or not) frees that
 *  send (core complete). Anything else keeps it held. Reads only, never resends. */
export async function checkHold(v: Pick<SaveVars, 'id' | 'target'>, shown: SandboxHold): Promise<CheckVerdict> {
  if (!shown.own || !shown.identity || shown.hold === undefined) return 'unknown';
  const got = await readStatusFresh(v.id, v.target);
  if (!got || !got.status) return 'readFailed';
  const proof = proofOf(got.status, shown.identity.sentFp, shown.identity.beforeFp);
  if (proof === 'unknown' || proof === 'storedUnconfirmed') return proof;
  const freed = await saveM.complete(varsOf(v, shown.identity), shown.hold);
  return freed ? proof : 'unknown';
}

/** The person's warned Dismiss of the hold that was shown (own sender only): frees that send, keeps nothing else. */
export async function dismissHold(v: Pick<SaveVars, 'id' | 'target'>, shown: SandboxHold): Promise<boolean> {
  if (!shown.own || shown.hold === undefined) return false;
  return saveM.dismiss(varsOf(v, shown.identity), shown.hold);
}

// The lock is keyed by {id} (lockKey), so the variables only need the id and the computer to name it.
const varsOf = (v: Pick<SaveVars, 'id' | 'target'>, i: SaveIdentity | null): SaveVars => ({ id: v.id, target: v.target, block: null, beforeFp: i?.beforeFp ?? '' });

/** The account/realm/computer partition the panel's local state belongs to (a switch drops it). */
export function usePart(): string {
  const c = useCore();
  const t = c.target;
  return `${c.account ?? '-'}|${c.realm}|${t ? `${t.project.id}/${t.container.id}` : '-'}`;
}

export { saveM as __saveMutationForTests };
