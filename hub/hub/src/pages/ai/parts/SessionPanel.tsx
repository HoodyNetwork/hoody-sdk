// SessionPanel: Details → Session of the open chat, the kit's SessionTab on this page's data. It mounts only while the
// Session tab is open, so the agents list is read then and not for every chat opened.
//
// The agents the chat may switch to come from the agents list of the chat's own realm (sessionAgents.ts). Claude Code models are
// offered (`claudeCode`): a Claude Code chat switches among the ones its computer lists, a Hoody chat never sees them. A provider that
// needs setting up leads to Models & keys (Claude Code's own section for Claude Code), as the new-chat screen does. The line under the model
// list ("Set up a provider") leads to the same place with no provider chosen. Ensembles stay off
// (`fusion`): a chat does not switch to one here.
import { useSyncExternalStore } from 'react';
import { agent, type Target } from '@core';
import { SessionTab, useGo, useStrings, type ApprovalData, type ConversationSource, type ModelChoice } from '@kit';
import { pageFaq } from '../faq';
import { links } from '../links';
import strings from '../strings.en.json';
import { useSessionAgents } from './sessionAgents';

export interface SessionPanelProps {
  /** The computer whose agent runs the chat. */
  target: Target;
  session: string;
  /** The computer's and the realm's names as the header shows them. */
  computer: string;
  realm: string;
  /** The chat's realm as the link names it (the wire value). */
  realmId: string;
  /** The open chat's source: its capability table tells the tab when the chat is asleep on the computer (live changes wait for a message). */
  source?: ConversationSource;
  /** The page's approvals read of this chat and the source's switch of Allow everything: the tab shows and changes the same
   *  state as the composer's approval-mode chip. */
  approval?: ApprovalData;
  setYolo?: (want: boolean) => boolean;
}

const none = () => () => undefined;
const nothing = () => null;

export function SessionPanel({ target, session, computer, realm, realmId, source, approval, setYolo }: SessionPanelProps) {
  // Drawn again whenever the chat's facts move (asleep → awake), so the tab reads the table afresh.
  useSyncExternalStore(source ? source.subscribe : none, source ? source.snapshot : nothing);
  const { names: agents } = useSessionAgents(target, realmId);
  const go = useGo();
  // The approvals' Strict option ends its Why with the tab's question (the kit cannot read a page's FAQ).
  const { byId } = pageFaq(useStrings(strings));
  const setUp = (m: ModelChoice) => go(m.providerId === agent.CLAUDE ? links.section('claude') : links.connect(m.providerId));
  return <SessionTab target={target} session={session} computer={computer} realm={realm} realmId={realmId} claudeCode onSetup={setUp} onProviders={() => go(links.connect())} strictFaq={byId.strictApprovals} {...(agents !== undefined ? { agents } : {})} {...(source ? { chat: source } : {})} {...(approval ? { approval } : {})} {...(setYolo ? { setYolo } : {})} />;
}
