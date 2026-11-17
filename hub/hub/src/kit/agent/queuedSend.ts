// queuedSend.ts: the ONE message a chat's composer holds for the next turn (the AI page's chat and the Ask dock share the rule).
// A message with an image cannot join a running turn (a follow-up carries text only), so Send while a turn runs or an approval
// waits marks the draft as queued instead of refusing it. Nothing is copied: the queued message IS the draft and its chips, still
// editable and removable, and it goes out once, through the composer's own send, when the turn is over.
// The mark is bound to the chat it was made for (the host's own key: the attempts' target on the AI page, the engine and its
// conversation in the dock) and lives in memory only:
//   'on'    queued, waiting for the turn to end;
//   'left'  the person left the chat first: nothing was sent (its files went with the composer; its text is still the draft);
//   'gone'  the composer went away while the chat stayed (the chat could not be shown for a moment): nothing was sent either;
//   {no}    the turn ended and Send could not take it: nothing was sent, the draft and its chips stay, `no` says why.
// A mark other than 'on' is only a note the person closes. Nothing here sends: the composer does, once, after clearing the mark.
import { useCallback, useSyncExternalStore } from 'react';

export type QueuedSend = 'on' | 'left' | 'gone' | { readonly no: string };

const byTarget = new Map<string, QueuedSend>();
const subs = new Set<() => void>();

export function queuedOf(target: string): QueuedSend | null { return byTarget.get(target) ?? null; }

export function setQueued(target: string, q: QueuedSend | null): void {
  if ((byTarget.get(target) ?? null) === q) return;
  if (q === null) byTarget.delete(target); else byTarget.set(target, q);
  for (const fn of [...subs]) fn();
}

const subscribe = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function useQueuedSend(target: string): QueuedSend | null {
  const read = useCallback(() => queuedOf(target), [target]);
  return useSyncExternalStore(subscribe, read, read);
}

/** A draft that is a command ("/clear", "/trim 3") is never sent by itself: a command is the person's press, with its own confirm. */
export function queuedIsCommand(plain: string): boolean { return plain.trimStart().startsWith('/'); }

/** Tests only. */
export function resetQueuedForTests(): void { byTarget.clear(); }
