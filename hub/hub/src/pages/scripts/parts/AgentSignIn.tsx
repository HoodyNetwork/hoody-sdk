// The agent sign-in of the writing assistant, as New script and the Ask drawer use it: the shared hook and box
// (app/AgentSignIn.tsx: one sign-in path through core for every place) bound to this page. What the binding
// adds: the page's own status read of the computer (the assistant is ready only when every answer reads ready for this account)
// and the page's own note for any other reason the assistant is not there (no realm chosen, an old agent).
import { useStrings } from '@kit';
export { useAgentSignIn, useAgentSignInOnly, rereadAgentStatus } from './AgentSignIn.pure';
import { AgentSignIn as SignInBox, type AgentSignInState, type SignInComp } from '@app/AgentSignIn';
import strings from '../strings.en.json';
import type { CompScripts } from '../types';
import { writerNote } from './useAsk';
import s from './parts.module.css';
export type { AgentSignInState, SignInShown, SignInComp } from '@app/AgentSignIn';

/** The shared box with this page's words for its own press. `button`: the label of the place's press (Write it for me, Send);
 *  `myself`: the place has Write the code myself; `blocked`: why that press cannot go now, in the place's words; empty when it can (Try again follows it). */
export function AgentSignIn({ comp, state, button, myself, blocked = '' }: { comp: CompScripts | undefined; state: AgentSignInState; button: string; myself: boolean; blocked?: string }) {
  const t = useStrings(strings);
  // The shared box says the signed-out (shared access), other-account and identity notes itself; this page says the rest.
  const key = comp ? writerNote(comp.agent, { offered: state.offered, myself }) : null;
  const pageNote = key && key !== 'new.writerShared' && key !== 'signin.shared' && key !== 'new.writerOtherAccount' && key !== 'new.writerIdentity'
    ? <p className={s.hint}>{t(key)}</p>
    : null;
  return <SignInBox comp={comp} state={state} place="writer" button={button} myself={myself} pageNote={pageNote} blocked={blocked} />;
}

/** The idea way's sign-in (New script): an idea is made by the agent, which refuses while it is signed out. The shared box with
 *  its own Sign the agent in button; nothing else is sent by it. */
export function IdeaSignIn({ comp, state }: { comp: SignInComp | undefined; state: AgentSignInState }) {
  const t = useStrings(strings);
  if (!comp) return null;
  return <SignInBox comp={comp} state={state} place="own" need={t('flow.idea.signIn', { computer: comp.name })} />;
}
