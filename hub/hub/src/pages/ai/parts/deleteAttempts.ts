// A delete that left the browser is owned by its TARGET, not by the dialog or the render that sent it (attempts
// bind to their target; the same rule as closeAttempts.ts, whose ChatId and attemptKey it uses). The record is filed
// under the chat's `attemptKey`, outlives the dialog and the menu, and holds the very Api that sent it, so Check again reads that
// chat through that Api whatever the props are now. While it is unknown, the only thing Delete offers for that chat is Check again.
import type { agent } from '@core';
import type { ChatId } from './closeAttempts';

export interface DeleteAttempt {
  /** The chat's `attemptKey`, captured at send. */
  readonly key: string;
  readonly chat: ChatId;
  readonly sid: string;
  readonly realm: string;
  /** The requests that sent it: Check again reads through these, never through the current props. */
  readonly calls: agent.SessionApi;
  /** 'sending': the request is out; 'unknown': the answer was lost; 'done' / 'failed': settled (the record is gone). */
  phase: 'sending' | 'unknown' | 'done' | 'failed';
  /** With 'failed': 'live' (attached somewhere else), 'missing' (the delete itself was answered "not found": nothing was deleted),
   *  'absent' (a read after a lost answer cannot find the chat: deleted, or hidden from this caller), 'there' (a read after a lost
   *  answer found the chat: it was not deleted), 'refused'. */
  failure?: 'live' | 'missing' | 'absent' | 'there' | 'refused';
}

export interface DeleteAttempts {
  get(key: string): DeleteAttempt | undefined;
  set(a: DeleteAttempt): void;
  /** Ends the record with a final phase. Only the record itself can end: a late settle of a replaced attempt does nothing. */
  end(a: DeleteAttempt, phase: 'done' | 'failed', failure?: DeleteAttempt['failure']): void;
  /** Turns the record from sending to unknown. */
  lost(a: DeleteAttempt): void;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
}

export function createDeleteAttempts(): DeleteAttempts {
  const m = new Map<string, DeleteAttempt>();
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
export const deleteAttempts: DeleteAttempts = createDeleteAttempts();
