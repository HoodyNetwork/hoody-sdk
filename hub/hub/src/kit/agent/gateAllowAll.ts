// "Allow everything in this chat…" on an approval card: the host gives the function that opens its confirm (the approval
// mode's own, kit/agent/ApprovalMode.tsx) while that switch is on offer for the conversation, else null. The card sends
// nothing itself. No provider (the Board, the dock, a Bot): the card does not offer it. One context for both builds: the web
// card reads it; the terminal card (GateCard.term.tsx) offers no such choice and only re-exports it, so the kit barrel's
// export resolves in the terminal build too.
import { createContext } from 'react';

export const GateAllowAll = createContext<(() => void) | null>(null);
