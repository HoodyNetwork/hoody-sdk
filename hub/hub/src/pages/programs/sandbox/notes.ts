// The panel's record of the last save of each program that reached the computer (or may have), for the tab, keyed
// by account/realm/computer partition and program: the inspector remounts the panel per selected program, and an
// unclear save must keep blocking sends (here and in the list's row actions) when the person comes back to it.
// Each record carries a token (seq): an action that awaited writes only while the record is still the one it
// started from, so an older Check never replaces a newer outcome.
import { useSyncExternalStore } from 'react';
import type { SentOutcome } from './SandboxEditor';

export interface Shown extends SentOutcome {
  at: string;
  seq: number;
  /** A Check again found another block stored, or could not read: the words under "may have gone through". */
  note?: 'stillUnknown' | 'readFailed' | 'storedUnconfirmed';
  reapply?: boolean;
  /** A Re-apply found another block stored and sent nothing. */
  reapplyChanged?: boolean;
  /** A Re-apply could not read the stored block first and sent nothing. */
  reapplyReadFailed?: boolean;
  /** The program was running when this save settled: the policy applies from its next restart. */
  wasRunning?: boolean;
}

const notes = new Map<string, Shown>();
const listeners = new Set<() => void>();
let ver = 0;
let seq = 0;

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const version = () => ver;
function changed() {
  ver++;
  for (const f of listeners) f();
}

/** Re-renders the caller on every note change. */
export function useNotesVersion(): number {
  return useSyncExternalStore(subscribe, version, version);
}
export function getNote(at: string): Shown | null {
  return notes.get(at) ?? null;
}
/** A new outcome (a send, a proof): a fresh token. */
export function putNote(at: string, s: Omit<Shown, 'at' | 'seq'>): void {
  notes.set(at, { ...s, at, seq: ++seq });
  changed();
}
/** Writes only while `at` still holds the record with token `from` (undefined: no record): false when another
 *  outcome came meanwhile, and nothing changes. `s` null drops the record. */
export function swapNote(at: string, from: number | undefined, s: Omit<Shown, 'at' | 'seq'> | null): boolean {
  if (notes.get(at)?.seq !== from) return false;
  if (s) notes.set(at, { ...s, at, seq: ++seq });
  else notes.delete(at);
  changed();
  return true;
}
/** Tests only: every record kept (kept.test proves no environment value is among them). */
export function allNotesForTests(): Shown[] {
  return [...notes.values()];
}
/** Tests only. */
export function resetSandboxNotesForTests(): void {
  notes.clear();
  changed();
}
