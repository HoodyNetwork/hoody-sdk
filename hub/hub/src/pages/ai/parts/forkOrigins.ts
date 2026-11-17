// Where a fork was made: the chat (computer, realm, session) a fork or a Check was STARTED on, kept by the session id it opened, until
// the kit's open() takes it. The answer of a fork can come after the page moved, so the new chat is linked under the computer and realm the
// operation was made for, and only while that chat is still the one shown (Conversation.tsx). An entry is taken once by open(), or dropped when
// the account guard turns its outcome into unknown (nothing opens then); the store keeps at most MAX entries, the oldest going first.
//
// One parent per new session: a session id exists once and is a fork of exactly one chat, so two operations that return the same new sid were
// made on the same computer, realm and chat, and the records they put are equal. A later put over an earlier one therefore changes nothing
// about where the new chat is linked. The one effect of sharing a key is that the first settle to take (open) or drop (a guard that says
// moved) removes the record for both: the other settle then finds none, open() answers false, nothing navigates and the kit says the fork
// was made and can be opened from the chat list. That is the safe side; the store never lets one operation open under another's origin.
export interface ForkAt {
  readonly computer: string;
  readonly realm: string;
  readonly sid: string;
}

const MAX = 32;
const origins = new Map<string, ForkAt>();

export const forkOrigins = {
  put(newSid: string, at: ForkAt): void {
    origins.delete(newSid);
    origins.set(newSid, at);
    while (origins.size > MAX) origins.delete(origins.keys().next().value as string);
  },
  /** The chat the fork of `newSid` was started on, once. */
  take(newSid: string): ForkAt | undefined {
    const at = origins.get(newSid);
    origins.delete(newSid);
    return at;
  },
  /** Tests: how many forks wait to be opened. */
  size: (): number => origins.size,
  /** Tests: forget them all. */
  clear: (): void => origins.clear(),
};
