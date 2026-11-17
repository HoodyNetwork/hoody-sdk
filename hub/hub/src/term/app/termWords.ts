// termWords: the terminal's own wording for web strings that name the web's surface ("this browser", "tap the realm
// square", "the eye", "on a touch keyboard"). The components that draw them are shared with the web and have no terminal
// twin, so the terminal app puts its variants into the same string tables (applyTermWords, which createTermApp calls
// before any page draws): every reader of a table then reads the terminal text. Importing this module changes nothing;
// only the terminal app applies it, so the web build and the web tests keep the web text.
// termWords.json lists each variant by table file (relative to src) and key, only where it is true of the terminal;
// termWords.term.test.tsx pins that each key exists, keeps its {{placeholders}} and says no "browser", "tap" or "click".
import ask from '../../ask/strings.en.json';
import kitFormsForms from '../../kit/forms/forms.strings.en.json';
import kitPerf from '../../kit/perf.strings.en.json';
import account from '../../pages/account/strings.en.json';
import support from '../../pages/support/strings.en.json';
import aiAgentsTools from '../../pages/ai/agents/Tools.strings.en.json';
import aiAgents from '../../pages/ai/agents/strings.en.json';
import aiAutoTodosList from '../../pages/ai/auto/todos/List.strings.en.json';
import aiAutoWorkflows from '../../pages/ai/auto/workflows/strings.en.json';
import aiFolders from '../../pages/ai/folders/strings.en.json';
import aiKnowledgeInstructions from '../../pages/ai/knowledge/instructions/strings.en.json';
import aiKnowledgeMemoryMemory from '../../pages/ai/knowledge/memory/Memory.strings.en.json';
import aiKnowledgeSkills from '../../pages/ai/knowledge/skills/strings.en.json';
import aiModelsClaudeTransfer from '../../pages/ai/models/claude/Transfer.strings.en.json';
import aiNewNewChat from '../../pages/ai/new/NewChat.strings.en.json';
import aiPartsConversation from '../../pages/ai/parts/Conversation.strings.en.json';
import aiSettingsConnectionsMcp from '../../pages/ai/settings/connections/Mcp.strings.en.json';
import aiSettingsRules from '../../pages/ai/settings/rules/strings.en.json';
import ai from '../../pages/ai/strings.en.json';
import billing from '../../pages/billing/strings.en.json';
import bots from '../../pages/bots/strings.en.json';
import computers from '../../pages/computers/strings.en.json';
import computersPartsAccessDrawer from '../../pages/computers/parts/AccessDrawer.strings.en.json';
import computersPartsFirewall from '../../pages/computers/parts/Firewall.strings.en.json';
import computersSnapshots from '../../pages/computers/snapshots/strings.en.json';
import filesUpload from '../../pages/files/Upload.strings.en.json';
import filesLinkLink from '../../pages/files/link/link.strings.en.json';
import files from '../../pages/files/strings.en.json';
import filesTransfersTransfers from '../../pages/files/transfers/transfers.strings.en.json';
import guide from '../../pages/guide/strings.en.json';
import keys from '../../pages/keys/strings.en.json';
import notifications from '../../pages/notifications/strings.en.json';
import realms from '../../pages/realms/strings.en.json';
import vault from '../../pages/vault/strings.en.json';
import shell from '../../shell/strings.en.json';
import scripts from '../../pages/scripts/strings.en.json';
import kitAgentConversation from '../../kit/agent/Conversation.strings.en.json';
import aiAutoWorkflowsRuns from '../../pages/ai/auto/workflows/Runs.strings.en.json';
import schedules from '../../pages/schedules/strings.en.json';
import apps from '../../pages/apps/strings.en.json';
import kit from '../../kit/strings.en.json';
import kitPickersProviderSetup from '../../kit/pickers/ProviderSetup.strings.en.json';
import kitAgentSessionView from '../../kit/agent/SessionView.strings.en.json';
import kitAgentApprover from '../../kit/agent/Approver.strings.en.json';
import kitAgentStatesAgentStates from '../../kit/agent/states/AgentStates.strings.en.json';
import kitAgentLinkMark from '../../kit/agent/LinkMark.strings.en.json';
import kitControlsLink from '../../kit/controls/Link.strings.en.json';
import kitDataAddress from '../../kit/data/Address.strings.en.json';
import appsLaunchOpenWith from '../../pages/apps/launch/openWith/strings.en.json';
import board from '../../pages/board/strings.en.json';
import homeWidgets from '../../pages/home/widgets/strings.en.json';
import notes from '../../pages/notes/strings.en.json';
import programs from '../../pages/programs/strings.en.json';
import vms from '../../pages/vms/strings.en.json';
import filesTransfer from '../../pages/files/Transfer.strings.en.json';
import filesStorage from '../../pages/files/storage/strings.en.json';
import logs from '../../pages/logs/strings.en.json';
import home from '../../pages/home/strings.en.json';
import programsSandbox from '../../pages/programs/sandbox/strings.en.json';
import kitStates from '../../kit/states/strings.en.json';
import computersExitIp from '../../pages/computers/parts/ExitIp.strings.en.json';
import words from './termWords.json';

export const TERM_WORD_TABLES: Readonly<Record<string, Record<string, string>>> = {
  'ask/strings.en.json': ask,
  'kit/forms/forms.strings.en.json': kitFormsForms,
  'kit/perf.strings.en.json': kitPerf,
  'pages/account/strings.en.json': account,
  'pages/support/strings.en.json': support,
  'pages/ai/agents/Tools.strings.en.json': aiAgentsTools,
  'pages/ai/agents/strings.en.json': aiAgents,
  'pages/ai/auto/todos/List.strings.en.json': aiAutoTodosList,
  'pages/ai/auto/workflows/strings.en.json': aiAutoWorkflows,
  'pages/ai/folders/strings.en.json': aiFolders,
  'pages/ai/knowledge/instructions/strings.en.json': aiKnowledgeInstructions,
  'pages/ai/knowledge/memory/Memory.strings.en.json': aiKnowledgeMemoryMemory,
  'pages/ai/knowledge/skills/strings.en.json': aiKnowledgeSkills,
  'pages/ai/models/claude/Transfer.strings.en.json': aiModelsClaudeTransfer,
  'pages/ai/new/NewChat.strings.en.json': aiNewNewChat,
  'pages/ai/parts/Conversation.strings.en.json': aiPartsConversation,
  'pages/ai/settings/connections/Mcp.strings.en.json': aiSettingsConnectionsMcp,
  'pages/ai/settings/rules/strings.en.json': aiSettingsRules,
  'pages/ai/strings.en.json': ai,
  'pages/billing/strings.en.json': billing,
  'pages/bots/strings.en.json': bots,
  'pages/computers/strings.en.json': computers,
  'pages/computers/parts/AccessDrawer.strings.en.json': computersPartsAccessDrawer,
  'pages/computers/parts/Firewall.strings.en.json': computersPartsFirewall,
  'pages/computers/snapshots/strings.en.json': computersSnapshots,
  'pages/files/Upload.strings.en.json': filesUpload,
  'pages/files/link/link.strings.en.json': filesLinkLink,
  'pages/files/strings.en.json': files,
  'pages/files/transfers/transfers.strings.en.json': filesTransfersTransfers,
  'pages/guide/strings.en.json': guide,
  'pages/keys/strings.en.json': keys,
  'pages/notifications/strings.en.json': notifications,
  'pages/realms/strings.en.json': realms,
  'pages/vault/strings.en.json': vault,
  'shell/strings.en.json': shell,
  'pages/scripts/strings.en.json': scripts,
  'kit/agent/Conversation.strings.en.json': kitAgentConversation,
  'pages/ai/auto/workflows/Runs.strings.en.json': aiAutoWorkflowsRuns,
  'pages/schedules/strings.en.json': schedules,
  'pages/apps/strings.en.json': apps,
  'kit/strings.en.json': kit,
  'kit/pickers/ProviderSetup.strings.en.json': kitPickersProviderSetup,
  'kit/agent/SessionView.strings.en.json': kitAgentSessionView,
  'kit/agent/Approver.strings.en.json': kitAgentApprover,
  'kit/agent/states/AgentStates.strings.en.json': kitAgentStatesAgentStates,
  'kit/agent/LinkMark.strings.en.json': kitAgentLinkMark,
  'kit/controls/Link.strings.en.json': kitControlsLink,
  'kit/data/Address.strings.en.json': kitDataAddress,
  'pages/apps/launch/openWith/strings.en.json': appsLaunchOpenWith,
  'pages/board/strings.en.json': board,
  'pages/home/widgets/strings.en.json': homeWidgets,
  'pages/notes/strings.en.json': notes,
  'pages/programs/strings.en.json': programs,
  'pages/vms/strings.en.json': vms,
  'pages/files/Transfer.strings.en.json': filesTransfer,
  'pages/files/storage/strings.en.json': filesStorage,
  'pages/logs/strings.en.json': logs,
  'pages/home/strings.en.json': home,
  'pages/programs/sandbox/strings.en.json': programsSandbox,
  'kit/states/strings.en.json': kitStates,
  'pages/computers/parts/ExitIp.strings.en.json': computersExitIp,
};
export const TERM_WORDS: Readonly<Record<string, Readonly<Record<string, string>>>> = words;

/** Puts the variants into their tables (again: the same text). Only the terminal app calls it (App.tsx). */
export function applyTermWords(): void {
  for (const [name, variants] of Object.entries(TERM_WORDS)) {
    const table = TERM_WORD_TABLES[name];
    if (table) Object.assign(table, variants);
  }
}
