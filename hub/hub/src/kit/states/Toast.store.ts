// The toast store: the one queue and every rule about what a toast is, shared by the web Toaster
// (Toast.tsx) and the terminal ToastHost (Toast.term.tsx). The copy and tone rules are written at the top of Toast.tsx.
// Nothing here draws or touches a document.
import { outcomeOf, type ErrorInfo } from '@core';
import type { DialogFaq } from '../overlays/Dialog';
import type { IconName } from '../icons';
import { OUTCOME_ICON } from '../outcome';
import { makeT } from '../strings';
import kitStrings from '../strings.en.json';
import { errorSentence, infoOf, withOutcome } from './errorDetails.pure';
import type { ErrorWordsOptions } from './errorWords';
import stateStrings from './strings.en.json';
import { createToastQueue, type ToastQueue } from './Toast.queue';

export type ToastTone = 'ok' | 'info' | 'warn' | 'error' | 'unknown';

export interface ToastAction {
  /** A resolved label ("Undo", "Try again", "Check again"). */
  label: string;
  /**
   * Runs the action. A promise (a read-back) keeps the toast open and busy until it settles. On
   * `unknown` the toast closes only on `true` (returned or resolved: the read proved the outcome);
   * `false` or a rejection adds a "couldn't check" line, anything else leaves it as it was. On other
   * tones it closes on any answer but `false` (an Undo that returns nothing closes at once).
   */
  onAction: () => unknown;
}

export interface ToastContentData {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** One action. On `unknown` it must only read the current state. */
  action?: ToastAction;
  /** The facts behind an error/unknown toast: a Details button opens them (showErrorToast sets it). */
  details?: ErrorInfo;
  /** One toast per id: showing it again while the earlier one is still up replaces that one and says how many times
   *  it happened ("This happened 3 times."), instead of stacking copies. */
  id?: string;
  /** A FAQ answer the toast points at: drawn as `<FaqLink item={item}>{label}</FaqLink>` under the body. The toast then stays until closed. */
  faq?: DialogFaq;
}

/** At most this many toasts show at once (newest first); the rest wait in the queue. */
export const TOAST_MAX_VISIBLE = 3;
/** The default time an ok/info/warn toast shows (ms). */
export const TOAST_TIMEOUT_MS = 4000;

let queue: ToastQueue<ToastContentData> | null = null;
/** The app's one toast queue, made on first use (loading this module does nothing: kitpure). */
export const toastQueue = (): ToastQueue<ToastContentData> => (queue ??= createToastQueue<ToastContentData>({ maxVisibleToasts: TOAST_MAX_VISIBLE }));

// `unknown` is the C9 pending outcome: the same clock as every other pending surface (OUTCOME_ICON).
export const TOAST_ICON: Readonly<Record<ToastTone, IconName>> = { ok: 'check', info: 'info', warn: 'warn', error: 'error', unknown: OUTCOME_ICON.pending };

/** Tones that stay until the person closes them (they need a decision). */
export const STICKY: ReadonlySet<ToastTone> = new Set(['error', 'unknown']);

/** Whether a toast stays until closed (no timer). */
export const toastStays = (c: ToastContentData): boolean => STICKY.has(c.tone ?? 'ok') || c.faq !== undefined;

// The toast showing for each id, and how many times it was shown while up (showToast `id`).
const byId = new Map<string, { key: string; count: number }>();

/**
 * Show a toast. ok/info/warn close after `timeout` ms (default 4 s, paused while hovered or
 * focused); error and unknown stay until closed whatever `timeout` says.
 */
export function showToast(content: ToastContentData, timeout = TOAST_TIMEOUT_MS): string {
  const id = content.id;
  const stays = toastStays(content);
  if (id === undefined) return toastQueue().add(content, stays ? {} : { timeout });
  const was = byId.get(id);
  const count = was ? was.count + 1 : 1;
  if (was) { byId.delete(id); toastQueue().close(was.key); }
  const more = count > 1 ? makeT(stateStrings)('toast.repeats', { count }) : '';
  const shown = more ? { ...content, body: content.body ? content.body + ' ' + more : more } : content;
  const key = toastQueue().add(shown, { ...(stays ? {} : { timeout }), onClose: () => { if (byId.get(id)?.key === key) byId.delete(id); } });
  byId.set(id, { key, count });
  return key;
}

// Only a definite failure is an error toast; nothing sent, a dropped answer or a cancel is information.
const ERROR_TONE: Readonly<Record<ErrorInfo['outcome'], ToastTone>> = { failed: 'error', pending: 'unknown', not_sent: 'info', stale: 'info', cancelled: 'info' };

export interface ErrorToastOptions {
  /** Send again: shown only when the result is not pending (C9). */
  retry?: ToastAction;
  /** Read the current state back (never a resend): shown only when the result is pending. */
  check?: ToastAction;
  words?: ErrorWordsOptions;
  /** The title when the result is pending (default "This may have gone through"): the page's `title` is written for
   *  a failure ("Couldn't delete the key") and is never shown over what may have gone through. */
  pendingTitle?: string;
  /** Default true, the C9-safe side: the call was a change, so an answer that could not be read or a "still
   *  running" 409 may have gone through. Pass false for a read. */
  change?: boolean;
}

/** Core marked this refusal said by the shell's toast (tokenSaid): on the rejection itself, or on the rejection a
 *  query.ts MutationResult carries in `error` (read as errorInfo reads it). An ErrorInfo carries no mark: its page
 *  toasts (a repeat, never a refusal nobody says). */
function tokenSaidOf(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const top = error as { tokenSaid?: unknown; outcome?: unknown; error?: unknown };
  if (top.tokenSaid === true) return true;
  const inner = typeof top.outcome === 'string' && top.error && typeof top.error === 'object' ? (top.error as { tokenSaid?: unknown }) : null;
  return inner?.tokenSaid === true;
}

/**
 * A toast for a rejection (core): the page's title ("Couldn't delete the key"), the mapped sentence as its
 * line, and Details. A pending outcome becomes the C9 `unknown` toast, never an error: its title is the pending one
 * and its only action is `check`.
 */
export function showErrorToast(title: string, error: unknown, opts: ErrorToastOptions = {}): string {
  // A refusal the shell's toast already named (core token.ts: a shared link's change it lacks the permission for,
  // marked tokenSaid exactly when that toast fired): the page's copy would only repeat it. Its inline line still
  // shows the same words (errorWords). Unmarked, the page's toast shows as ever: never a refusal nobody says.
  if (tokenSaidOf(error)) return '';
  const found = infoOf(error);
  const info = found.outcome === 'failed' && opts.change !== false && outcomeOf(error, true) === 'pending' ? withOutcome(found, 'pending') : found;
  const pending = info.outcome === 'pending';
  const action = pending ? opts.check : opts.retry;
  return showToast({
    title: pending ? (opts.pendingTitle ?? makeT(kitStrings)('outcome.pending.title')) : title,
    body: errorSentence(info, opts.words),
    tone: ERROR_TONE[info.outcome],
    details: info,
    ...(action ? { action } : {}),
  });
}

/** Close a toast early (its result showed up somewhere else). */
export function closeToast(key: string): void {
  toastQueue().close(key);
}

/** What a toast's action press does to its toast (both platforms draw this state). */
export interface ToastRunHooks {
  close: () => void;
  setBusy: (busy: boolean) => void;
  setNoAnswer: (noAnswer: boolean) => void;
}

/**
 * Run a toast's action by the rules above: a promise keeps it busy until it settles; `unknown` closes only on `true`
 * (C9), other tones on anything but `false`; `false`, a throw or a rejection shows the "couldn't check" line.
 */
export function runToastAction(content: ToastContentData, busy: boolean, h: ToastRunHooks): void {
  const action = content.action;
  if (!action || busy) return;
  const tone = content.tone ?? 'ok';
  let r: unknown;
  try {
    r = action.onAction();
  } catch {
    h.setNoAnswer(true);
    return;
  }
  // C9: an unknown outcome stays on screen until a read proves it (`true`).
  const settle = (v: unknown) => {
    if (tone === 'unknown' ? v === true : v !== false) {
      h.close();
      return;
    }
    h.setBusy(false);
    h.setNoAnswer(v === false);
  };
  if (!r || typeof (r as Promise<unknown>).then !== 'function') {
    settle(r);
    return;
  }
  h.setBusy(true);
  h.setNoAnswer(false);
  (r as Promise<unknown>).then(settle, () => {
    h.setBusy(false);
    h.setNoAnswer(true);
  });
}
