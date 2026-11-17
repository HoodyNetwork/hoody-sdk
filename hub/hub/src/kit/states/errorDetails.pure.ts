// The pure part of Error details (ErrorDetails.tsx and its terminal sibling share it): the lines, the copied text, the
// mapped sentence, one ErrorInfo per rejection, the outcome reshaping and the pending test.
import { useMemo } from 'react';
import { errorInfo, errorPage, isErrorInfo, type ErrorInfo, type ErrorOutcome } from '@core';
import type { OutcomeKind } from '../outcome';
import { makeT, type Translate } from '../strings';
import { errorWords, type ErrorWordsOptions } from './errorWords';
import stateStrings from './strings.en.json';

export type T = Translate<typeof stateStrings>;

export interface ErrorLine {
  readonly label: string;
  readonly value: string;
  /** An in-app '#/' link for the value (the Page line, when core's errorPage names the page). */
  readonly href?: string;
}

/** The lines Details shows, in order. A missing fact reads "none"; a status with no answer says so. Core never keeps
 *  an API message (it can echo what was sent), so there is no Message line. The Page line is the page's title through
 *  core's errorPage (the plain id when no page is registered under it), linked when errorPage gives an in-app link. */
export function errorLines(info: ErrorInfo, t: T): ErrorLine[] {
  const none = t('err.v.none');
  return [
    { label: t('err.f.outcome'), value: t(`err.o.${info.outcome}`) },
    { label: t('err.f.status'), value: info.status === null ? t('err.v.noAnswer') : String(info.status) },
    { label: t('err.f.code'), value: info.code ?? none },
    { label: t('err.f.trace'), value: info.traceId ?? none },
    { label: t('err.f.route'), value: info.route ?? none },
    { label: t('err.f.time'), value: info.at },
    pageLine(info.page, t('err.f.page'), none),
  ];
}

function pageLine(id: string | null, label: string, none: string): ErrorLine {
  if (id === null) return { label, value: none };
  const p = errorPage(id);
  return p.href ? { label, value: p.title, href: p.href } : { label, value: p.title };
}

/** The text "Copy details for support" copies: the shown lines, one per line. */
export function errorText(info: ErrorInfo, t: T = makeT(stateStrings)): string {
  return errorLines(info, t)
    .map((l) => `${l.label}: ${l.value}`)
    .join('\n');
}

/** The mapped sentence for an error (errorWords), resolved. */
export function errorSentence(info: ErrorInfo, opts?: ErrorWordsOptions, t: T = makeT(stateStrings)): string {
  const w = errorWords(info, opts);
  return t(w.key, w.vars);
}

// One ErrorInfo per rejection object, kept from the first time any surface showed it: its Time is when the error
// was first seen, whatever mounts it again later (an inspector reopened, a second surface).
const seen = new WeakMap<object, ErrorInfo>();
// Infos this module reshaped (withOutcome): they pass through as they are.
const shaped = new WeakSet<object>();

/** The facts of a rejection: an ErrorInfo (core's, or reshaped here) as it is, else core's errorInfo, first seen. */
export function infoOf(error: unknown): ErrorInfo {
  if (isErrorInfo(error) || (typeof error === 'object' && error !== null && shaped.has(error))) return error as ErrorInfo;
  if (typeof error !== 'object' || error === null) return errorInfo(error);
  let info = seen.get(error);
  if (!info) {
    info = errorInfo(error);
    seen.set(error, info);
  }
  return info;
}

/**
 * The facts under the outcome the surface shows. A surface that knows its outcome (a pending banner, a failed line)
 * is the page's C9 decision: its Details and words follow it, never a kind core worked out again without knowing
 * the call was a change. C9 one way only: facts that say pending stay pending under any kind.
 */
export function withOutcome(info: ErrorInfo, outcome: ErrorOutcome | undefined): ErrorInfo {
  if (!outcome || outcome === info.outcome || info.outcome === 'pending') return info;
  const next: ErrorInfo = Object.freeze({ ...info, outcome });
  shaped.add(next);
  return next;
}

/** A shown outcome as an error outcome: `done` is no error. */
export const KIND_OUTCOME: Readonly<Record<OutcomeKind, ErrorOutcome | undefined>> = {
  done: undefined,
  pending: 'pending',
  failed: 'failed',
  not_sent: 'not_sent',
  stale: 'stale',
};

/** Facts that say the call may have gone through (C9): the one test every surface uses. */
export function pendingFacts(info: ErrorInfo | null | undefined): boolean {
  return info?.outcome === 'pending';
}

/**
 * The kind a surface shows: its own, except that facts saying pending make any kind but `done` pending (C9). The whole
 * surface follows it (title, icon, actions, close, send lock), not only its sentence.
 */
export function shownKind(kind: OutcomeKind, info: ErrorInfo | null | undefined): OutcomeKind {
  return kind !== 'done' && pendingFacts(info) ? 'pending' : kind;
}

/** The facts of an error value, under `outcome` when the surface knows it; null for no error. */
export function useErrorInfo(error: unknown, outcome?: ErrorOutcome): ErrorInfo | null {
  return useMemo(() => (error == null ? null : withOutcome(infoOf(error), outcome)), [error, outcome]);
}

