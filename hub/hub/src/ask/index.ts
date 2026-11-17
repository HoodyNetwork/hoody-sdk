// The Ask conversation: what the shell mounts inside its Ask dock, and what the shell reads for the
// top-bar toggle's "needs you" dot and Ctrl/⌘J. Mount agreement: AppShell (shell/AppShell.tsx) renders <AskPanel /> in its Ask dock unless the router passes another dock.
import { provideConversations } from '@kit/agent/conversations';
import { provideActiveConversations } from '@kit/agent/conversationsActive';
import { askActiveConversations } from './active';
import { provideForkList } from '@kit/agent/forkList';
import { askForkList } from './forkList';
import { askConversations } from './source';
export { AskPanel, useAskWaiting, useAskActivityLabel, focusAsk, askHasFocus } from './AskPanel';
// Pages reach a conversation's (read-only) source through kit/agent/conversations, never ask/.
provideConversations(askConversations);
// The active twin: a source that can send, only through the activateSource door (ask/active.ts).
provideActiveConversations(askActiveConversations);
// The unconfirmed forks of a computer and realm, with no chat's engine.
provideForkList(askForkList);
