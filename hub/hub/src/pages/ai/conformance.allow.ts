import type { PageAllow } from '@app/conformance/allow';

// Conformance allow-list rows of this page (types and rule ids in app/conformance/allow.ts).
// Paths are relative to this folder. Rows only shrink: a fixed site leaves its row in the same change,
// and the test that owns the rule fails on a row that is no longer needed (noarg rows excepted: a call that is gone
// passes, so drop its row when convenient). Delete the file when it is empty.
export const allow: PageAllow = {
  'std.breakpoint': {
    'parts/parts.module.css': 1,
  }, // the AI page's other style files write the canonical --bp-phone form, so they have no row
  'literal.debt': {
    // Done step of a model chooser's trip: "Go back to {origin}" names the chooser.
    'parts/Connect.tsx': 1,
    'parts/Summary.tsx': 1,
  },
  'noarg.allowed': {
    'agents/Tools.tsx': { 'run.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'folders/Commit.tsx': { 'held.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'knowledge/memory/Create.tsx': { 'runner.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'knowledge/skills/Hub.tsx': { 'run.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'knowledge/skills/Import.tsx': { 'run.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'knowledge/skills/List.tsx': { 'runner.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'knowledge/skills/Trust.tsx': { 'runner.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'settings/rules/Features.tsx': { 'run.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss' },
    'settings/connections/Accounts.tsx': {
      'runner.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss',
      'login.dismiss()': 'core useRunner with a lock: frees only the hold its band shows (vars + that hold token), never core\'s no-argument dismiss',
    },
  },
  // layout:begin (page-anatomy debt, one row per file and scope. Lower or delete rows as sites are fixed; never add one.)
  'layout.actionRow': {
    'folders/Repository.tsx': 1,
    'knowledge/memory/Admin.tsx': 2,
    // New chat: the composer's chip row and the Do-it-every-day links; ActionSpec slots are not read by the rule
    'new/NewChat.tsx': 2,
    'parts/ChatList.tsx': 1,
    'parts/EndpointStep.tsx': 2,
    'parts/GptStep.tsx': 2,
    'parts/KeyStep.tsx': 1,
  },
  'layout.bandsPerSection': {
    'auto/workflows/RunForm.tsx overlay:ai-workflow-run': 1,
    'knowledge/memory/Detail.tsx': 1,
    'models/claude/Transfer.tsx overlay:claude-copy-files': 1,
    'models/claude/Transfer.tsx overlay:claude-copy-login': 1,
    'settings/connections/Mcp.tsx overlay:ai.mcp.details': 1,
    'settings/connections/Mcp.tsx overlay:ai.mcp.server': 1,
    'settings/rules/HookEdit.tsx overlay:ai-hook-edit': 1,
    'settings/rules/Trust.tsx overlay:ai-hook-trust': 1,
  },
  'layout.cssGap': {
    'agents/Source.module.css': 1,
    'agents/agents.module.css': 2,
    'auto/todos/List.module.css': 1,
    'auto/workflows/Source.module.css': 1,
    'folders/FolderPage.module.css': 1,
    'folders/Repository.module.css': 2,
    'knowledge/memory/Admin.module.css': 1,
    'knowledge/memory/Memory.module.css': 2,
    'new/NewChat.module.css': 1,
    'parts/parts.module.css': 5,
  },
  'layout.cssMargin': {
    'parts/parts.module.css': 1,
  },
  'layout.cssReach': {
    'parts/parts.module.css': 2,
  },
  'layout.cssType': {
    'parts/Pane.module.css': 1,
    'parts/parts.module.css': 2,
  },
  'layout.explain': {
    'agents/AgentsView.tsx': 4, // the view's own words; the file editor's state lines sit above its fold
    'agents/Source.tsx': 3,
    'auto/loops/Edit.tsx overlay:ai-loops-pause': 1,
    'auto/loops/List.tsx': 2,
    'auto/workflows/Source.tsx': 5, // the Source disclosure and confirm text; sibling conditionals on exclusive conditions count once (the longest)
    'folders/Branches.tsx overlay:ai-folders-worktree-add': 1, // the Add worktree dialog's body and its three fields' help lines, 206 characters (budget 150)
    'folders/Commit.tsx': 1,
    'folders/Repository.tsx': 1,
    'knowledge/instructions/InstructionsView.tsx overlay:ai-instructions-abandon': 3,
    'knowledge/skills/Hub.tsx': 1,
    'knowledge/skills/List.tsx': 1,
    'knowledge/skills/Trust.tsx': 5,
    'parts/Claude.tsx': 1,
    'parts/Connect.tsx': 2, // sibling conditionals on exclusive conditions count once (the longest); the disconnect body is the kit's consequence list
    'parts/Default.tsx': 2,
    'parts/EndpointStep.tsx': 1,
    'settings/connections/Accounts.tsx': 3, // the section's own words: subtitle, place help, the table's empty state
    'settings/connections/Accounts.tsx overlay:ai-github-add': 2, // the add drawer's own words
    'settings/connections/Accounts.tsx overlay:ai-github-logout': 3, // the log-out confirm's words
    'settings/rules/Features.tsx': 1, // the rows' help in a SettingGroup
    'settings/rules/Hooks.tsx overlay:ai-hooks-switch': 2, // the disable-all confirm's body, keyed to its overlay
    'safety.tsx': 1, // the Pause row's help (the kit's pause description, usePauseDescription) counts as authored text
    'settings/rules/Rules.tsx overlay:ai-rule-edit': 2, // the rule dialog's field hints, keyed to its overlay
  },
  'layout.explainGap': {
    'parts/raw.tsx': 1, // the raw view's one explain gap
    'agents/AgentsView.tsx': 4, // the agent detail's gaps, and the Tools save bar's FormFooter props and its portal into the page's footer
    'agents/Model.tsx overlay:ai.agent.model': 3, // the ModelChooser's catalogue, computer and rules props, which the rule cannot read (as parts/Default.tsx and logs ExplainDrawer)
    'agents/Tools.tsx': 1, // each tools group is a kit Disclosure, so its tool list's gap is counted in the fold's region
    'auto/loops/Edit.tsx overlay:ai-loops-delete': 1,
    'auto/loops/Edit.tsx overlay:ai-loops-extend': 2,
    'auto/loops/Edit.tsx overlay:ai-loops-pause': 1,
    'auto/loops/Edit.tsx overlay:ai-loops-restart': 2, // the Start again confirm body is one joined sentence list, as the end-time confirm (the same kit gap)
    'auto/todos/Actions.tsx overlay:ai-todos-approve': 1,
    'auto/todos/Actions.tsx overlay:ai-todos-cancel-run': 1,
    'auto/todos/Actions.tsx overlay:ai-todos-run': 1,
    'auto/todos/Thread.tsx': 4,
    'auto/workflows/List.tsx': 1,
    'auto/workflows/Source.tsx': 1, // the TheirsView diff rows
    'autoFixtures.ts': 1,
    'folders/FolderPage.tsx': 1,
    'folders/PRs.tsx': 11,
    'folders/Repository.tsx': 1,
    'knowledge/memory/Detail.tsx': 3,
    'knowledge/memory/Library.tsx': 1,
    'knowledge/memory/Memory.tsx': 2,
    'knowledge/skills/Import.tsx': 1, // each skill is one kit ItemList row
    'new/NewChat.tsx overlay:ai.new.model': 1,
    'parts/Advanced.tsx': 3, // the rule counts a spread or member component it cannot read
    'parts/CloseDialog.tsx overlay:ai-chat-close': 2,
    'parts/Connect.tsx': 3,
    'parts/Default.tsx': 4,
    'parts/DeleteDialog.tsx overlay:ai-chat-delete': 1,
    'parts/GptStep.tsx': 1,
    'parts/Pane.tsx': 7, // All computers with no row names each computer's gap above the empty state (GroupNotes notes, a prop the rule does not know)
    'parts/RenameDialog.tsx overlay:ai-chat-rename': 2,
    'parts/Rows.tsx': 3, // no caller is left; the file is due for deletion
    'safety.tsx': 4, // the rule reads usePauseDescription as the kit's pause description; the rest are the page's own lines
    'settings/connections/Accounts.tsx': 1, // the log-out lines mapped under the table
    'settings/connections/Mcp.tsx': 5,
    'settings/connections/Mcp.tsx overlay:ai.mcp.server': 1,
    'settings/rules/Features.tsx': 1,
    'settings/rules/HookEdit.tsx overlay:ai-hook-edit': 1, // measured with the page's place provider read through (Place.tsx)
    'settings/rules/Hooks.tsx': 5,
    'settings/rules/Rules.tsx': 3, // Stop tracking's confirm counts on the page root (safety.tsx); the card's state words are one gap
    'settings/rules/Where.tsx': 1, // the section's choose-a-folder words in state=, the same gap as Rules.tsx
    // the chat composer's "@" picker host (LiveComposer mention prop, call-derived)
    'tab.tsx': 25, // the AI tab's own gaps (Conversation's main/source/composer/usage/activityExtra/session props, Pane, Summary, the tab's routed views); the header's capability line is read as text (anatomy literalText ConversationView.capability)
    'models/claude/Transfer.tsx': 1, // the rule counts a spread or member component it cannot read
    'parts/Claude.tsx': 1, // the rule counts a spread or member component it cannot read
  },
  'layout.heading': {
    'agents/Overview.tsx': 1,
    'agents/Source.tsx': 1,
    'auto/workflows/Source.tsx': 1,
    'parts/Main.tsx': 1,
    'parts/Pane.tsx': 1,
  },
  'layout.landmark': {
    'agents/Overview.tsx': 3,
    'folders/FolderPage.tsx': 3,
    'folders/Repository.tsx': 1,
    'parts/Main.tsx': 1,
  },
  'layout.legacy': {
    'auto/todos/Thread.tsx': 4,
    'folders/FolderPage.tsx': 1,
    'knowledge/instructions/InstructionsView.tsx': 1,
    'knowledge/memory/Detail.tsx': 4,
    'knowledge/skills/List.tsx': 3,
  },
  'layout.localChrome': {
    'agents/Overview.tsx': 1,
    'agents/Source.tsx': 1,
    'auto/workflows/Source.tsx': 1,
    'folders/FolderPage.tsx': 3,
    'folders/Repository.tsx': 1,
    'parts/Main.tsx': 1,
    'parts/Pane.tsx': 1,
  },
  'layout.looseFaqLink': {
    'auto/loops/Edit.tsx': 5,
    'auto/loops/List.tsx': 1,
    'auto/todos/Actions.tsx': 7,
    'knowledge/skills/Hub.tsx': 1,
    'knowledge/skills/List.tsx': 1,
    'settings/rules/Rules.tsx': 1,
  },
  'layout.marker': {
    'parts/Pane.tsx': 1,
  },
  'layout.overlayId': {
    'agents/Source.tsx': 6,
    'auto/workflows/Source.tsx': 7,
    'folders/PRs.tsx': 5,
    'knowledge/memory/Detail.tsx': 3,
    'knowledge/memory/Memory.tsx': 1,
    'knowledge/skills/Hub.tsx': 3,
    'knowledge/skills/Import.tsx': 3,
    'knowledge/skills/List.tsx': 1,
    'knowledge/skills/Trust.tsx': 2,
    'parts/Connect.tsx': 3,
    'parts/Default.tsx': 2,
    'parts/EndpointStep.tsx': 1,
  },
  'layout.screens': {
    'page.ts': 1,
    'tab.tsx': 2,
  },
  'layout.slot': {
    // a raw <p> in the ListDetailPage detail pane (the pane slots take no raw markup yet)
    'agents/AgentsView.tsx': 3, // a value written directly in a slot that takes no text must be one the check can read; DetailPage.footer (the kit's sticky save bar) is not in the slot table
    'agents/List.tsx': 5, // DataTable name/tools/where cells hold an icon, tip and Tag (rich cells in a text slot; same as auto/loops/List.tsx), and the Where Tag's tip is an icon-form InfoTip beside it so a click on the words opens the agent
    'agents/Tools.tsx': 1, // a tool's details are a kit Popover whose trigger is the info IconButton; Popover.trigger is not in the kit slot table (the same kit gap as computers/parts/Bits.tsx)
    'auto/loops/Edit.tsx overlay:ai-loops-new': 1, // Drawer.outcome holds ChangeOutcome, which renders a raw <div>
    'auto/loops/List.tsx': 2, // the Chat cell's <bdi> (a rich cell in a text slot, as agents/List.tsx) and a raw <bdi> cell from a same-file helper (:75)
    'auto/todos/List.tsx': 4,
    'auto/workflows/List.tsx': 1, // ListDetailPage.toolbar holds HeldCreates (ListDetailPage.toolbar is not in the kit slot table, as Runs.tsx)
    'auto/workflows/Runs.tsx': 2, // ListDetailPage.toolbar is not in the kit slot table; RunDetail renders a raw <div> into the detail pane
    'folders/FolderPage.tsx': 2,
    'folders/PRs.tsx': 2,
    'folders/Repository.tsx': 4,
    'knowledge/memory/Detail.tsx': 2, // a value written directly in a slot that takes no text must be one the check can read
    // a raw <span> cell from a same-file helper (:44)
    'knowledge/memory/Library.tsx': 3, // a value written directly in a slot that takes no text must be one the check can read
    'knowledge/memory/Memory.tsx': 4,
    'knowledge/memory/Relations.tsx': 1, // a value written directly in a slot that takes no text must be one the check can read
    'knowledge/skills/Trust.tsx': 1,
    // New chat: Composer.tools and Composer.below are not in the slot table, and
    // PageHeader.meta holds the arrival's screen-reader-only live region, nothing drawn
    'new/NewChat.tsx': 3,
    'models/claude/Transfer.tsx': 1,
    'parts/Accounts.tsx': 2,
    // the coverage note sits outside the toolbarNote slot (two sites)
    'parts/ChatList.tsx': 7, // a value written directly in a slot that takes no text must be one the check can read, and the agent sign-in box (app/AgentSignIn) sits in DataTable's empty slot for a signed-out agent; the kit has no empty-slot part for it
    // LiveComposer mounts RateLimitChip in Composer.tools, which is not in the slot table (the same gap as new/NewChat.tsx), and activityExtra takes <ShellJobRows> from a same-file helper (:95)
    'parts/Conversation.tsx': 4, // a value written directly in a slot that takes no text must be one the check can read
    'parts/Default.tsx': 1,
    'parts/Pane.tsx': 1, // a value written directly in a slot that takes no text must be one the check can read
    'parts/Spending.tsx': 6,
    'parts/Summary.tsx': 1, // a value written directly in a slot that takes no text must be one the check can read
    'safety.tsx': 1, // the Pause row's control is the kit's PauseControl (its strip and states render spans), not in the SettingRow field kind
    'view.tsx': 2, // SettingsPage.notice holds an <ErrorState>
    'settings/connections/Mcp.tsx': 1, // Widget.actions holds Add and the Import/Reconnect strip (Widget.actions is not in the kit slot table)
  },
  'layout.state': {
    'agents/AgentsView.tsx': 2,
    'agents/List.tsx': 1, // the table's `empty` prop holds an EmptyState (the DataTable empty slot; the kit state renderer is a Section's)
    'agents/Source.tsx': 3,
    'agents/Tools.tsx': 4,
    'auto/loops/List.tsx': 3,
    'auto/todos/List.tsx': 3,
    'auto/todos/Thread.tsx': 2,
    'auto/workflows/Graph.tsx': 1,
    'auto/workflows/List.tsx': 2,
    'auto/workflows/Source.tsx': 2,
    'folders/FolderPage.tsx': 5,
    'folders/PRs.tsx': 7,
    'folders/Repository.tsx': 6,
    'knowledge/instructions/InstructionsView.tsx': 2,
    'knowledge/memory/Detail.tsx': 3,
    'knowledge/memory/Library.tsx': 1,
    'knowledge/memory/Memory.tsx': 7,
    'knowledge/skills/Hub.tsx': 5,
    'knowledge/skills/Import.tsx': 4,
    'knowledge/skills/List.tsx': 2,
    // New chat: the bands' ErrorState sits outside a Section state (the no-computer state is the shell's)
    'new/NewChat.tsx': 1,
    'models/claude/Transfer.tsx': 1,
    'parts/Accounts.tsx': 2,
    'parts/ChatList.tsx': 1,
    'parts/Claude.tsx': 3,
    'parts/Connect.tsx': 2,
    'parts/Default.tsx': 3,
    'parts/EndpointStep.tsx': 2,
    'parts/GptStep.tsx': 1,
    'parts/Spending.tsx': 1,
    'parts/Summary.tsx': 1,
    'tab.tsx': 1,
    'view.tsx': 2,
  },
  'layout.text': {
    'agents/AgentsView.tsx': 1,
    'agents/Overview.tsx': 2,
    'agents/Source.tsx': 13,
    'agents/Tools.tsx': 4, // the tools fold's own text lines
    'auto/todos/List.tsx': 1,
    'auto/todos/Thread.tsx': 4,
    'auto/workflows/Source.tsx': 17,
    'folders/Repository.tsx': 5,
    'knowledge/memory/Admin.tsx': 3,
    'knowledge/memory/Memory.tsx': 1,
    'knowledge/skills/Hub.tsx': 2,
    'knowledge/skills/Import.tsx': 1,
    'knowledge/skills/List.tsx': 1,
    'knowledge/skills/Trust.tsx': 5,
    // New chat: the ways-to-start cells' title and line in <strong>/<span> (the strip is page-drawn until the kit has a part for it)
    'new/NewChat.tsx': 8,
    'parts/Accounts.tsx': 1,
    'parts/Advanced.tsx': 3, // ids shown in code type (data leaves)
    'parts/ChatList.tsx': 3, // the chat list's own text styling, until the kit has a part for it
    'parts/Conversation.tsx': 1,
    'parts/GptStep.tsx': 5,
    'parts/KeyStep.tsx': 1,
    'parts/Main.tsx': 1,
    'parts/Spending.tsx': 2,
    'parts/Summary.tsx': 2,
  },
  // layout:end
  // ui:begin (UI-standard debt, one row per file and scope. Lower or delete rows as sites are fixed; never add one.)
  'ui.actionTwice': {
    'knowledge/memory/Library.tsx': 1,
    'knowledge/skills/List.tsx': 1,
  },
  'ui.kitClass': {
    'agents/Tools.tsx': 1,
    'auto/loops/Edit.tsx': 3,
    'parts/Advanced.tsx': 1,
    'parts/EndpointStep.tsx': 1,
  },
  'ui.nativeTitle': {
    'folders/Repository.tsx': 2,
    'parts/ChatList.tsx': 1,
  },
  'ui.pageLook': {
    'agents/Source.module.css': 13,
    'agents/Tools.module.css': 2, // the tools fold's own head and title rules
    'agents/agents.module.css': 6,
    'auto/todos/List.module.css': 5,
    'auto/workflows/Source.module.css': 15,
    'folders/Repository.module.css': 8,
    'knowledge/memory/Admin.module.css': 2,
    'knowledge/memory/Memory.module.css': 3,
    'new/NewChat.module.css': 17, // the ways-to-start strip's own look; the Options and Runs-on rules are gone
    'parts/Conversation.module.css': 1,
    'parts/Pane.module.css': 10,
    'parts/parts.module.css': 48,
    'settings/rules/Trust.module.css': 1,
  },
  'ui.rawControl': {
    'new/NewChat.tsx': 3,
  },
  // ui:end
};
