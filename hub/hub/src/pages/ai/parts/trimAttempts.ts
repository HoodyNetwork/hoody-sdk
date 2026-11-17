// A trim that left the browser is owned by its TARGET, not by the dialog or the menu that sent it (attempts
// bind to their target; the same rule as renameAttempts.ts and closeAttempts.ts). ONE record per chat and computer:
// it holds the full identity captured at send, the turn index that was sent, and the very Api that sent it, so Check again reads
// THAT chat through THAT Api whatever the props are now. While it is unknown the only thing Trim offers for that chat is Check
// again: a second trim could cut a history the first one already cut.
import type { agent } from '@core';
import type { ChatId } from './closeAttempts';

export interface TrimAttempt {
  /** Chat + computer, captured at send. */
  readonly key: string;
  readonly chat: ChatId;
  /** The finished turn the history was to be kept through (0-based), as sent. */
  readonly turn: number;
  /** The requests that sent it: Check again reads through these, never through the current props. */
  readonly calls: agent.SessionApi;
  /** 'sending': the request is out; 'unknown': the outcome is not known; 'done' / 'failed': settled (the record is gone). */
  phase: 'sending' | 'unknown' | 'done' | 'failed';
  /** With 'failed': what to say. */
  failure?: 'busy' | 'cannot' | 'gone' | 'failed' | 'refused';
}

export interface TrimAttempts {
  get(key: string): TrimAttempt | undefined;
  set(a: TrimAttempt): void;
  /** Ends the record with a final phase. Only the record itself can end: a late settle of a replaced attempt does nothing. */
  end(a: TrimAttempt, phase: 'done' | 'failed', failure?: TrimAttempt['failure']): void;
  /** Turns the record from sending to unknown. */
  lost(a: TrimAttempt): void;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
}

export function createTrimAttempts(): TrimAttempts {
  const m = new Map<string, TrimAttempt>();
  const subs = new Set<() => void>();
  let v = 0;
  const publish = () => { v++; for (const f of [...subs]) { try { f(); } catch { /* the subscriber's */ } } };
  return {
    get: (k) => m.get(k),
    set: (a) => { m.set(a.key, a); publish(); },
    end: (a, phase, failure) => {
      if (m.get(a.key) === a) m.delete(a.key);
      a.phase = phase;
      if (failure) a.failure = failure;
      publish();
    },
    lost: (a) => { if (m.get(a.key) === a) { a.phase = 'unknown'; publish(); } },
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    version: () => v,
  };
}

/** The tab's attempts: they outlive a menu that unmounts and mounts again for the same chat. */
export const trimAttempts: TrimAttempts = createTrimAttempts();
