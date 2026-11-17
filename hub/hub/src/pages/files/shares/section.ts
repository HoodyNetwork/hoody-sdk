// The Shared folders section's pure parts: which rows a scope shows, what the Hub knows of each end, and the
// pill each state draws. No reads and no React: SharesSection.tsx draws what these say.
// A share always joins two computers of one owner, so "all my computers" is one list: the shares those computers give
// plus any share they receive that list does not hold (a source the realm view cannot list). Showing both
// lists there would show every share twice.
import { computerHandle, computerState } from '@core';
import type { Tone } from '@kit';
import type { ShareStateKind } from './state';
import type { ShareList, ShareRow } from './wire';

/** 'this': the computer shown (gives and receives). 'all': every computer of the realm view (gives, then receives). */
export type ShareScope = 'this' | 'all';

/** A computer as the section needs it: its name and handle for links, its status for the stopped states. */
export interface ShareComputer { readonly id: string; readonly name: string; readonly status: string }

/** The rows of the "all my computers" list: every given share, then each received one not already there. */
export function allRows(given: ShareList, received: ShareList): readonly ShareRow[] {
  const seen = new Set(given.rows.map((r) => r.id));
  return [...given.rows, ...received.rows.filter((r) => !seen.has(r.id))];
}

/** Whether a computer runs, from the Hub's own list: null when the list does not hold it (another realm, not read). */
export function runningOf(c: ShareComputer | undefined): boolean | null {
  if (!c) return null;
  const s = computerState(c.status);
  return s === 'running' ? true : s === 'stopped' ? false : null;
}

/** The handle a link may name for a computer (name.last4), or null: none while the list is not known whole (a computer
 *  on a page not read yet could share it), none when another listed computer has the same handle (a handle two listed
 *  computers share opens neither, logic.ts findByHandle). */
export function linkHandle(c: ShareComputer | undefined, listed: readonly ShareComputer[], whole: boolean): string | null {
  if (!c || !whole) return null;
  const h = computerHandle(c);
  return listed.some((o) => o.id !== c.id && computerHandle(o) === h) ? null : h;
}

/** What a section shows of its list reads: failed (one read failed with nothing to show), loading, stale (an older
 *  answer kept after a failed read), or ready. A list that cannot be read is never shown as empty. */
export function listKind(reads: readonly { readonly data?: unknown; readonly isError: boolean }[]): 'failed' | 'loading' | 'stale' | 'ready' {
  if (reads.some((r) => r.isError && r.data === undefined)) return 'failed';
  if (reads.some((r) => r.data === undefined)) return 'loading';
  return reads.some((r) => r.isError) ? 'stale' : 'ready';
}

/** The pill of each state: its tone and whether it moves (a dot while the Hub or the server is working on it). */
export const SHARE_PILL = {
  sending: { tone: 'info', dot: true },
  unsure: { tone: 'warn', dot: false },
  expired: { tone: 'neutral', dot: false },
  legacy: { tone: 'warn', dot: false },
  unreadable: { tone: 'neutral', dot: false },
  failed: { tone: 'danger', dot: false },
  off: { tone: 'neutral', dot: false },
  waiting: { tone: 'info', dot: true },
  pausedRw: { tone: 'warn', dot: false },
  interrupted: { tone: 'warn', dot: false },
  ownerDown: { tone: 'warn', dot: false },
  sourceStopped: { tone: 'neutral', dot: false },
  targetStopped: { tone: 'neutral', dot: false },
  unclear: { tone: 'neutral', dot: false },
  on: { tone: 'ok', dot: false },
} as const satisfies Record<ShareStateKind, { tone: Tone; dot: boolean }>;
