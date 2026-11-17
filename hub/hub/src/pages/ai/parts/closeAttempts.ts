// A close that left the browser is owned by its TARGET, not by the dialog or the render that sent it (attempts
// bind to their target; the same rule as renameAttempts.ts). The record is keyed by the chat and the computer captured
// at send, outlives the dialog and the menu, and holds the very Api that sent it, so Check again reads that chat through that
// Api whatever the props are now. While it is unknown, the only thing Close offers for that chat is Check again.
import type { agent } from '@core';

/** The whole identity of the chat an attempt was made for, captured at send and never rebuilt from props: the computer it lives on,
 *  its realm and session id, and the target (the container every request went to; 'api' for a test api). A host that moved on to
 *  another chat or computer uses it to route a late completion to the chat it belongs to. */
export interface ChatId {
  readonly computer: string;
  readonly realm: string;
  readonly sid: string;
  readonly target: string;
}

/** The key every attempt record (rename, close, trim) is filed under: the chat on its container, by identity that does not change.
 *  The computer HANDLE (name.last4) is left out on purpose: it follows the computer's name, so a rename of the computer would file
 *  the same chat under a second key and let a second request past an unknown first one. `'api'` (a test's injected Api) and `''`
 *  (no computer shown) name no container, so the handle stands in for them. Every host and menu builds the key HERE, never inline. */
export const attemptKey = (c: ChatId): string => `${c.target === '' || c.target === 'api' ? `${c.target}:${c.computer}` : c.target}|${c.realm}|${c.sid}`;

export interface CloseAttempt {
  /** Chat + computer, captured at send. */
  readonly key: string;
  readonly chat: ChatId;
  readonly sid: string;
  readonly realm: string;
  /** The requests that sent it: Check again reads through these, never through the current props. */
  readonly calls: agent.SessionApi;
  /** 'sending': the request is out; 'unknown': the answer was lost; 'done' / 'failed': settled (the record is gone). */
  phase: 'sending' | 'unknown' | 'done' | 'failed';
  /** With 'failed': what to say ('open': a read after a lost answer found it still attached). */
  failure?: 'gone' | 'refused' | 'open';
}

export interface CloseAttempts {
  get(key: string): CloseAttempt | undefined;
  set(a: CloseAttempt): void;
  /** Ends the record with a final phase. Only the record itself can end: a late settle of a replaced attempt does nothing. */
  end(a: CloseAttempt, phase: 'done' | 'failed', failure?: CloseAttempt['failure']): void;
  /** Turns the record from sending to unknown. */
  lost(a: CloseAttempt): void;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
}

export function createCloseAttempts(): CloseAttempts {
  const m = new Map<string, CloseAttempt>();
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
export const closeAttempts: CloseAttempts = createCloseAttempts();
