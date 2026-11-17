// New workflow with AI: what the drawer's start says and which agent runs it. The rest of the start is the kit's starter, the
// same one New chat uses.
import { ASK_MAX_TEXT, composerCount } from '@kit';

/** The shipped agent that writes workflows. The Hub sends only its name: a person's edited copy of it is what runs. */
export const WORKFLOW_AGENT = 'workflow-editor';

/** The chat's first message, shown in the chat as the person's own, so it names no tool. It asks in words for a name nothing else holds;
 *  the agent's instructions turn that into the save's own guard. */
export function firstMessage(text: string): string {
  return `Create a new workflow, under a name that isn't taken, so nothing gets replaced. What it should do: ${text.trim()}`;
}

/** Room left for the person's words: the whole first message has to fit in a chat's first message. */
export const roomFor = (text: string): number => ASK_MAX_TEXT - composerCount(firstMessage(text));
