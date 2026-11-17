// rowActions.ts: which per-message actions a conversation row offers, in ONE place. The dock's column (Column.tsx) and the kit
// block the page draws (source.ts userBlock) both read it, so Send again, Retry and Edit are on offer under the same conditions in
// both and cannot drift.
//
// The rule (C9): an action that puts a message on its way again, or takes it out of the transcript, is offered only on a DEFINITE
// outcome: a message the agent did not take (Not sent) or the prompt of a turn that failed. A row whose outcome is unknown or still
// sending offers none of them; it keeps Check status and Stop tracking. A queued follow-up offers Edit and Remove, which ASK the agent to
// take it back first: the row goes (and its text comes back) only when the agent answers withdrawn. Offering one is not sending one: the engine still
// refuses a resend when the row is no longer Not sent, and a journaled engine never asks a key that was tried again (the row goes
// under a new one, which is only legal because the old one was refused).
import type { PendingRef, RowAction } from '@kit/agent/source';
import type * as C from './conv';
import { failureKey } from './logic';

/** The request a conversation row stands for, named as the journal names it: a first message whose session does not exist yet is
 *  the CREATE (under the create key the snapshot carries); once the session exists it is a turn under its own key; a follow-up is
 *  a message. The same row keeps one identity before and after the session exists: the journal files it under the same key and kind. */
export const requestOf = (u: C.UserMsg, s: { createKey?: string }): { key: string; kind: PendingRef['kind'] } =>
  u.via === 'create' ? (s.createKey !== undefined ? { key: s.createKey, kind: 'create' } : { key: u.key, kind: 'turn' }) : { key: u.key, kind: u.via === 'command' ? 'message' : 'turn' };

/** How many files (images and text files) the row carries. */
export const fileCount = (u: C.UserMsg): number => (u.imgs?.length ?? 0) + (u.files?.length ?? 0);

/** Edit and Remove on a queued follow-up: the agent is asked to take it back by its command id. Only while nothing about taking it back
 *  is pending or known to be refused (`wd`); the row goes only when the agent answers withdrawn. */
export const canWithdraw = (u: C.UserMsg): boolean => u.state === 'queued' && u.via === 'command' && !!u.commandId && u.wd === undefined;

/** Send again: a message the agent definitely refused (Not sent), with its text, unless the refusal is one sending again cannot help (NO_RESEND). */
export const canResend = (u: C.UserMsg): boolean => u.state === 'notSent' && !!u.text && !NO_RESEND.has(u.reason);

/** Refusals that sending the same message again cannot help: its files (Edit fixes them), an auto-approve pick on a Strict chat, and a
 *  message taken back (its key keeps answering the withdrawn receipt: a changed message goes under a new key, through Edit). */
const NO_RESEND: ReadonlySet<string> = new Set(['ask.attRefused', 'ask.autoTurnStrict', 'ask.withdrawn']);

/** Edit (take back): a Not sent message whose text can come back to the composer, when it carries files, was handed off or taken by
 *  another tab, or was taken back from the agent's queue (a plain refusal is fixed by Send again). */
export const canEdit = (u: C.UserMsg): boolean =>
  u.state === 'notSent' && !!u.text && (fileCount(u) > 0 || u.reason === 'ask.handedOff' || u.reason === 'ask.takenElsewhere' || u.reason === 'ask.withdrawn');

/** A failure after which the same prompt must not go again (it runs out of room, has no model, or the policy changed). */
export const RETRY_NEVER: ReadonlySet<string> = new Set(['ask.noModel', 'ask.policyChanged', 'ask.tooLong']);

type Outcome = Extract<C.Block, { k: 'outcome' }>;

/** The prompt row a failed turn's Retry belongs to, or null: only the newest block, a failed turn read live (not from history), and
 *  not a failure Retry cannot help. Time is not judged here (see `retryWaits`). */
export function retryFor(b: Outcome, last: boolean): string | null {
  if (!last || b.state !== 'failed' || !b.retry) return null;
  return RETRY_NEVER.has(failureKey(b.code)) ? null : b.retry;
}

/** A rate-limited failure whose retry time has not come: the dock shows a countdown, the kit offers no Retry yet. */
export function retryWaits(b: Outcome, now: number): boolean {
  if (failureKey(b.code) !== 'ask.rateLimited' || !b.retryAt) return false;
  const at = Date.parse(b.retryAt);
  return Number.isFinite(at) && at > now;
}

/** The actions a user row offers now, in display order. `retryUid` is the prompt row `retryFor` named (and `retryWaits` cleared). */
export function actionsOf(u: C.UserMsg, retryUid: string | null): RowAction[] {
  const out: RowAction[] = [];
  if (canResend(u)) out.push('resend');
  if (canEdit(u)) out.push('takeBack');
  if (canWithdraw(u)) {
    // Edit brings back the text only: a row with files can be removed, not edited (the engine refuses it too).
    if (u.text && fileCount(u) === 0) out.push('editQueued');
    out.push('withdraw');
  }
  // A take-back whose answer was lost: Check again reads the row back (C9); it never asks again.
  if (u.state === 'queued' && u.wd === 'unknown') out.push('check');
  if (retryUid !== null && retryUid === u.id && !!u.text) out.push('retry');
  return out;
}

/** The one line a queued row shows: what taking it back came to while that matters, else when the agent reads it: at its next step,
 *  or (`gate`: an approval or a question waits now) once the person has answered, since a message never declines a waiting request. */
export function queuedWords(u: C.UserMsg, gate = false): 'ask.queued' | 'ask.queuedGate' | 'ask.withdrawing' | 'ask.withdrawUnknown' | 'ask.withdrawTaken' | 'ask.withdrawOff' | 'ask.withdrawClosed' | 'ask.withdrawFailed' {
  switch (u.wd) {
    case 'sending': return 'ask.withdrawing';
    case 'unknown': return 'ask.withdrawUnknown';
    case 'taken': return 'ask.withdrawTaken';
    case 'off': return 'ask.withdrawOff';
    case 'closed': return 'ask.withdrawClosed';
    default: return u.reason === 'ask.withdrawFailed' ? 'ask.withdrawFailed' : gate ? 'ask.queuedGate' : 'ask.queued';
  }
}

/** Check status on a row still waiting (Queued) or of unknown outcome: the dock's column and the dock's SessionView tail read this one rule.
 *  A queued row is read back by its command id (or by the journal); an unknown one unless its reason says nothing can be read. */
export function canCheckRow(u: C.UserMsg, journaled: boolean): boolean {
  if (u.state === 'queued') return !!(u.commandId || journaled);
  if (u.state !== 'unknown') return false;
  return journaled || ((!!u.text || u.via !== 'command' || !!u.commandId) && u.reason !== 'ask.cannotTell' && u.reason !== 'ask.tooOld' && u.reason !== 'ask.otherTab');
}

/** Stop tracking: a queued row unless Remove can take it back (or a take-back is out: its answer settles the row); an unknown one when
 *  nothing else can settle it. Beside Remove it would be a second, weaker way out that leaves the message on its way. */
export function canStopTracking(u: C.UserMsg, journaled: boolean): boolean {
  if (u.state === 'queued') return u.wd !== 'sending' && !canWithdraw(u);
  if (u.state !== 'unknown') return false;
  return journaled || u.reason === 'ask.cannotTell' || u.reason === 'ask.tooOld' || u.reason === 'ask.notStarted' || (u.via === 'turn' && !u.text) || (u.via === 'command' && !u.text && !u.commandId);
}

/** What an unknown row without its text (a reload lost it) can be told: the strings key of the one line that says what to do, or null. */
export function unknownWords(u: C.UserMsg, journaled: boolean): 'ask.followLost' | 'ask.lostFilesOther' | 'ask.lostFilesRow' | 'ask.checkOnly' | 'ask.retypeSameKey' | null {
  if (u.state !== 'unknown' || u.text) return null;
  if (u.via === 'command') return 'ask.followLost';
  if (u.lostFiles) return u.reason === 'ask.otherTab' ? 'ask.lostFilesOther' : 'ask.lostFilesRow';
  return journaled ? 'ask.checkOnly' : 'ask.retypeSameKey';
}
