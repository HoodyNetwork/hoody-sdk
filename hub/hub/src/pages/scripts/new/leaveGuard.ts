// The New script draft's guard before a user-started realm switch or sign-out: while the
// draft holds something a reload cannot bring back (draft.ts dirty), core's leave question and the sign-out warning show
// "Leave New script? Your changes here aren't kept: {what}." Registered for as long as the draft is mounted; each read
// takes the draft as it is then. Path changes and reloads are the kit LeaveGuard's (same dirty()), not this.
import { useEffect, useRef } from 'react';
import { registerSwitchGuard } from '@core';
import { useStrings, type Translate } from '@kit';
import strings from '../strings.en.json';
import { dirty, type Draft } from './draft';

type T = Translate<typeof strings>;
const WHAT = { typed: 'new.leave.typed', settings: 'new.leave.settings', code: 'new.leave.code', fields: 'new.leave.fields' } as const;

/**
 * What leaving loses (dirty), plus `extra`: what the page holds outside the draft (Script settings not yet put in the code).
 * null when the draft leaves freely.
 */
export function draftLost(d: Draft | null, recoverable: Draft | null, extra: readonly string[] = []): string[] | null {
  if (!d) return null;
  const what = [...(dirty(d, recoverable) ?? [])];
  for (const x of extra) if (!what.includes(x)) what.push(x);
  return what.length > 0 ? what : null;
}

/** The words of draftLost's list, joined ("what you typed, the edited code"). */
export const lossWords = (t: T, what: readonly string[]): string => what.map((w) => t(WHAT[w as keyof typeof WHAT] ?? 'new.leave.typed')).join(', ');

/** The sentence a switch or sign-out shows for this draft, or null when it leaves freely. */
export function draftLoss(t: T, d: Draft | null, recoverable: Draft | null, extra: readonly string[] = []): string | null {
  const what = draftLost(d, recoverable, extra);
  return what ? t('new.leave', { what: lossWords(t, what) }) : null;
}

/** Registers the draft's guard while mounted; `d`, `recoverable` and `extra` are read as they are when a question is asked. */
export function useDraftSwitchGuard(d: Draft | null, recoverable: Draft | null, extra: readonly string[] = []): void {
  const t = useStrings(strings);
  const now = useRef({ t, d, recoverable, extra });
  now.current = { t, d, recoverable, extra };
  useEffect(() => registerSwitchGuard(() => draftLoss(now.current.t, now.current.d, now.current.recoverable, now.current.extra)), []);
}
