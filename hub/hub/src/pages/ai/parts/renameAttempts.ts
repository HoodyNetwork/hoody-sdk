// A rename that left the browser is owned by its TARGET, not by the dialog or the render that sent it (attempts
// bind to their target). The record is keyed by the chat and the computer captured at send, outlives the dialog (and
// the menu), and holds the very Api that sent it, so Check again reads that chat through that Api whatever the props are now.
// While it is unknown, the chat's rename offers only Check again and the warned Stop tracking (drop). Every change is published
// (subscribe/version), so a menu mounted again while the request is out follows it to its end.
import type { agent } from '@core';
import type { ChatId } from './closeAttempts';

export interface RenameAttempt {
  /** Chat + computer, captured at send. */
  readonly key: string;
  readonly chat: ChatId;
  readonly sid: string;
  readonly realm: string;
  /** The requests that sent it: Check again reads through these, never through the current props. */
  readonly calls: agent.SessionApi;
  /** The name that was sent (trimmed); '' = clear the title. */
  readonly name: string;
  /** 'sending': the request is out; 'unknown': the answer was lost; 'done' / 'failed': settled; 'dropped': the person stopped
   *  tracking it, neither done nor failed (each of the last three: the record is gone). */
  phase: 'sending' | 'unknown' | 'done' | 'failed' | 'dropped';
  /** With 'failed': what to say. */
  failure?: 'gone' | 'bad' | 'refused';
}

export interface RenameAttempts {
  /** The live record (sending or unknown) for a key. */
  get(key: string): RenameAttempt | undefined;
  set(a: RenameAttempt): void;
  /** Ends the record with a final phase. Only the record itself can end: a late settle of a replaced attempt does nothing. */
  end(a: RenameAttempt, phase: 'done' | 'failed', failure?: RenameAttempt['failure']): void;
  /** Turns the record from sending to unknown. */
  lost(a: RenameAttempt): void;
  /** Stop tracking: removes the record while it is this unknown one (nothing is sent). False when it is not (settled, or another). */
  drop(a: RenameAttempt): boolean;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
}

export function createRenameAttempts(): RenameAttempts {
  const m = new Map<string, RenameAttempt>();
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
    drop: (a) => {
      if (m.get(a.key) !== a || a.phase !== 'unknown') return false;
      m.delete(a.key);
      a.phase = 'dropped';
      publish();
      return true;
    },
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    version: () => v,
  };
}

/** The tab's attempts: they outlive a menu that unmounts and mounts again for the same chat. */
export const renameAttempts: RenameAttempts = createRenameAttempts();
