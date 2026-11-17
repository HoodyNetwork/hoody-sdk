// The writing assistant's sign-in hook bound to this page (split out of AgentSignIn.tsx so the terminal build shares
// it; the notes are at the top of AgentSignIn.tsx, which re-exports it).
import { agentLoginOf, capture, refreshFresh, sourceReads } from '@core';
import { useAgentSignIn as useSharedSignIn, type AgentSignInState, type SignInComp } from '@app/AgentSignIn.pure';
import type { CompScripts } from '../types';

// The page's status read of this computer, read again now (refreshFresh): the caps follow the agent's answer.
const reread = async (comp: SignInComp): Promise<boolean> => {
  const f = await refreshFresh(sourceReads('scripts', 'authStatus', { computer: comp.id }));
  return f.state === 'fresh' && f.answers.length > 0 && f.answers.every((a) => agentLoginOf(a.data, capture().account) === 'ready');
};

/** The sign-in of one place on this page. `send`: the place's own ask; `view`: the place's own lifetime (the drawer passes open or
 *  closed). */
export function useAgentSignIn(comp: CompScripts | undefined, send: () => void, view = ''): AgentSignInState {
  return useSharedSignIn(comp, send, reread, view);
}

/** The sign-in alone, for a place whose own send needs the agent signed in but no assistant (New script's idea way): nothing is
 *  sent after it; the page's status read follows the proof. */
export function useAgentSignInOnly(comp: SignInComp | undefined, view = ''): AgentSignInState {
  return useSharedSignIn(comp, null, reread, view);
}

/** The page's status read of a computer's agent, read again now: after the agent itself said its login is out, so the page's
 *  own note and sign-in follow what the agent says. */
export function rereadAgentStatus(compId: string): void {
  void refreshFresh(sourceReads('scripts', 'authStatus', { computer: compId }));
}
