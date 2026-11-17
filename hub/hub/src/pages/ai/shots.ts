// Named screenshot states of the ai page (`bun run hub:shots --page ai`). They show Models & keys, which live at
// /ai/models, so their paths start with /models; the Instructions shots start
// with /knowledge/instructions.
import type { ActStep, Shots } from '@app/shots.types';

// Type a fake key into the key step and press Enter.
const TYPE_KEY = ['s', 'k', '-', 'f', 'i', 'x', 't', 'u', 'r', 'e', '-', '1', 'Enter'];
const KEY_FIELD = 'role=textbox[name=/API key/]';
// The OpenAI row's menu: Hoody AI is included and has no row actions, so its row has no menu button (logic.ts actionsFor).
const ROW = 'role=row[name=/OpenAI/] >> role=button[name="Row actions"]';
const DISCONNECT = [{ click: ROW }, { click: 'role=menuitem[name="Disconnect"]' }, { click: 'role=button[name="Remove key"]' }] as const;
const CONFIRM = ['Tab', 'Enter'];
// Instructions: add a line to the text, Save, wait for the band, then any further steps (the fixture's seed text plus one line).
const INSTR_TEXT = 'role=textbox[name="Instructions text"]';
const INSTR_MINE = 'Answer in English.\nKeep pull requests small and explain why a change is needed.\nRun the tests before you say a change is done.\nWrite the summary first.';
const INSTR_SAVE = (band: string, then: readonly ActStep[] = []): readonly ActStep[] => [
  { waitFor: INSTR_TEXT }, { fill: INSTR_TEXT, text: INSTR_MINE }, { click: 'role=button[name="Save"]' }, { waitFor: `text=${band}` }, ...then,
];
// Instructions shots are taken at 1350 and 390, light and dark.
const INSTR_EXTRA = ['1350-light', '1350-dark', '390-dark'] as const;
// A chat the fixture agent has on atlas, and the steps that open its composer's add menu.
const CONV = '/c/s-old?computer=atlas.00a1&realm=f1f1f1f1f1f1f1f1f1f1f1f1';
const ADD_MENU: readonly ActStep[] = [{ click: 'role=button[name="Add files"]' }, { waitFor: 'role=menuitem[name=/From a computer/]' }];
// The automations, skills and agents shots are taken at 1350 and 390, light and dark.
const REVIEW = ['1350-light', '1350-dark', '390-dark'] as const;
const LOOP_BAR = 'role=group[name="Actions for this loop"]';
// Open the Skill Hub and search it for "change" (the fixture hub's changelog skill).
const HUB_SEARCH: readonly ActStep[] = [
  { click: 'role=button[name="Skill Hub"]' }, { fill: 'role=searchbox[name="Search the Skill Hub"]', text: 'change' },
  { click: 'role=dialog >> role=button[name="Search"]' }, { waitFor: 'role=dialog >> role=table' },
];

export default [
  { name: 'default', path: '/models' },
  { name: 'empty', state: 'empty', path: '/models' },
  { name: 'loading', state: 'loading', path: '/models' },
  { name: 'error', state: 'error', path: '/models' },
  // A deep link to the Claude Code section: it opens scrolled to that section, as the web does.
  { name: 'partial', state: 'partial', path: '/models?section=claude', scrolled: true },
  { name: 'long-text', state: 'long', path: '/models' },
  { name: 'many-rows', state: 'many', path: '/models' },
  { name: 'needs-key', state: 'needsKey', path: '/models' },
  { name: 'claude-ready', state: 'claude', path: '/models?section=claude', scrolled: true, extra: ['390-dark'] },
  { name: 'claude-signed-out', state: 'claudeSignedOut', path: '/models?section=claude', scrolled: true },
  { name: 'realms', state: 'noRealm', path: '/models' },
  { name: 'allowance', path: '/models?section=allowance', scrolled: true },
  { name: 'allowance-empty', state: 'empty', path: '/models?section=allowance', scrolled: true },
  { name: 'allowance-error', state: 'error', path: '/models?section=allowance', scrolled: true },
  { name: 'spending', path: '/models?section=spending', scrolled: true },
  { name: 'failed-default', state: 'failed', path: '/models?pick=helper', click: 'role=dialog >> role=option[name=/GPT-5/]', keys: CONFIRM },
  { name: 'advanced', path: '/models?section=advanced', click: 'text=Show advanced', scrolled: true, extra: ['390-dark'] },
  { name: 'agent-overview', path: '/agents/reviewer', waitForText: 'Reasoning effort', extra: ['390-dark'] },
  // The drawer and its directory are drawn before the capture (a dark run once caught the page under it).
  { name: 'connect-pick', path: '/models', act: [{ click: 'Connect an account' }, { waitFor: 'role=dialog >> role=region[name="Connected"]' }] },
  { name: 'connect-key', path: '/models?connect=google' },
  { name: 'connect-key-pending', state: 'pending', path: '/models?connect=google', click: KEY_FIELD, keys: TYPE_KEY },
  { name: 'connect-key-failed', state: 'failed', path: '/models?connect=google', click: KEY_FIELD, keys: TYPE_KEY },
  { name: 'connect-choice', path: '/models?connect=openai' },
  // Anthropic's two ways: it opens on "Use your Claude plan" (Claude Code's own rows drawn in the drawer); the key beside it.
  { name: 'connect-plan-install', path: '/models?connect=anthropic' },
  { name: 'connect-plan-signed-out', state: 'claudeSignedOut', path: '/models?connect=anthropic', extra: ['390-dark'] },
  { name: 'connect-plan-ready', state: 'claude', path: '/models?connect=anthropic' },
  { name: 'connect-plan-key', path: '/models?connect=anthropic', click: 'text=Use an API key' },
  { name: 'connect-chatgpt', path: '/models?connect=openai', click: 'Sign in with ChatGPT' },
  { name: 'connect-openrouter-choice', path: '/models?connect=openrouter' },
  { name: 'connect-openrouter', path: '/models?connect=openrouter', click: 'Sign in with OpenRouter' },
  { name: 'connect-openrouter-nocode', path: '/models?connect=openrouter', act: [{ click: 'Sign in with OpenRouter' }, { click: 'role=button[name="Finish sign-in"]' }] },
  { name: 'connect-openrouter-finishing', path: '/models?connect=openrouter', act: [{ click: 'Sign in with OpenRouter' }, { fill: 'css=input[type=password]', text: 'http://localhost:53781/callback?code=fixture-code' }, { click: 'role=button[name="Finish sign-in"]' }] },
  { name: 'connect-openrouter-refused', state: 'failed', path: '/models?connect=openrouter', click: 'Sign in with OpenRouter' },
  { name: 'connect-endpoint-key', state: 'endpointKey', path: '/models?connect=my-endpoint', waitForText: 'My endpoint API key' },
  { name: 'connect-endpoint-key-reading', state: 'endpointReading', path: '/models?connect=my-endpoint', waitForText: 'Reading My endpoint' },
  {
    name: 'connect-endpoint-key-read-failed',
    state: 'endpointReadFailed',
    path: '/models?connect=my-endpoint',
    waitForText: "Couldn't read My endpoint",
    noOutcome: "A failed read of the endpoint's revision sends nothing: the step says it couldn't read and offers Try again.",
  },
  {
    name: 'connect-endpoint-key-changed',
    state: 'endpointChanged',
    path: '/models?connect=my-endpoint',
    act: [{ waitFor: 'role=button[name="Check and save"]' }, { fill: KEY_FIELD, text: 'sk-fixture-1' }, { press: 'Enter' }, { waitFor: 'text=changed since this step opened' }],
    noOutcome: 'A changed endpoint is not a send outcome: the step says the endpoint changed and offers Read again.',
  },
  { name: 'connect-endpoint', path: '/models', act: [{ click: 'Connect an account' }, { click: 'role=dialog >> role=button[name="Your own endpoint"]' }] },
  { name: 'picker', path: '/models?pick=helper' },
  { name: 'picker-many', state: 'many', path: '/models?pick=helper' },
  // Model picker: the Default rows on the shared chooser; the 7k catalogue opens on its Ready view.
  { name: 'default-pick', path: '/models?pick=bots', act: [{ waitFor: 'role=dialog >> role=option' }] },
  { name: 'default-pick-7k', state: 'catalogue7k', path: '/models?pick=helper', act: [{ waitFor: 'role=dialog >> role=option' }] },
  { name: 'impact', path: '/models?pick=helper', click: 'role=dialog >> role=option[name=/GPT-5/]' },
  { name: 'impact-pending', state: 'pending', path: '/models?pick=helper', click: 'role=dialog >> role=option[name=/GPT-5/]', keys: CONFIRM },
  { name: 'disconnect-failed', state: 'failed', path: '/models', act: DISCONNECT },
  { name: 'disconnect-pending', state: 'pending', path: '/models', act: DISCONNECT },
  { name: 'row-menu', path: '/models', click: ROW },
  { name: 'disconnect', path: '/models', act: [{ click: ROW }, { click: 'role=menuitem[name="Disconnect"]' }] },
  // Knowledge → Instructions: the edit, a conflict with Compare open, and a save whose answer was lost.
  { name: 'instructions', path: '/knowledge/instructions', waitForText: 'Give agents these instructions', extra: INSTR_EXTRA },
  {
    name: 'instructions-conflict',
    state: 'instructionsConflict',
    path: '/knowledge/instructions',
    act: INSTR_SAVE('changed since you opened them', [{ click: 'role=button[name="Compare"]' }, { waitFor: 'text=would change them like this' }]),
    extra: INSTR_EXTRA,
  },
  { name: 'instructions-lost', state: 'instructionsLost', path: '/knowledge/instructions', act: INSTR_SAVE("didn't arrive"), extra: INSTR_EXTRA },
  // An open chat at rest (turns, the activity ledger, the reply's foot, a failed and an unknown step) and with a turn running.
  // A chat opens at its newest message (SessionView's follow rule, web and terminal), so where the transcript is taller
  // than the screen (80x24) it opens scrolled on purpose: `scrolled` here and on conv-thinking / conv-compacting.
  { name: 'conv', path: CONV, scrolled: true, extra: ['1350-light', '1350-dark', '390-dark'] },
  // conv-running: the second turn waits on an approval, with a follow-up typed under it (not sent: a message sent while an
  // approval waits answers it as declined, which is a different state).
  {
    name: 'conv-running',
    path: CONV.replace('s-old', 's-today'),
    act: [
      { waitFor: 'text=npm install chart.js' },
      { fill: 'role=textbox[name="Message to your agent"]', text: 'Then add a disk chart too.' },
    ],
    extra: ['1350-light', '1350-dark', '390-dark'],
  },
  // The working row while the model works on the next step (Thinking) and while the agent compacts the conversation; a reply's
  // Copy shown by the pointer on that reply (it is quiet otherwise).
  { name: 'conv-thinking', path: CONV.replace('s-old', 's-think'), waitForText: 'Thinking…', scrolled: true, extra: ['1350-light', '390-dark'] },
  { name: 'conv-compacting', path: CONV.replace('s-old', 's-compact'), waitForText: 'Compacting the conversation…', scrolled: true, extra: ['1350-light', '390-dark'] },
  { name: 'conv-copy-hover', path: CONV, act: [{ waitFor: 'text=Run it once now' }, { hover: 'role=log >> role=button[name="Copy"] >> nth=0' }], extra: ['1350-light'] },
  // The composer's add menu and the two dialogs it opens, in a chat on atlas (the fixtures' Personal realm).
  { name: 'conv-add-menu', path: CONV, act: [...ADD_MENU] },
  { name: 'conv-add-computer', path: CONV, act: [...ADD_MENU, { click: 'role=menuitem[name=/From a computer/]' }, { waitFor: 'role=dialog[name="Attach files from a computer"]' }] },
  { name: 'conv-add-notes', path: CONV, act: [...ADD_MENU, { click: 'role=menuitem[name=/Notes/]' }, { waitFor: 'role=dialog[name="Attach notes"]' }] },
  // From a URL…: the dialog as it opens, a page longer than one text file (Attach the first 24 KB), and a site's 404.
  { name: 'conv-add-url', path: CONV, act: [...ADD_MENU, { click: 'role=menuitem[name=/From a URL/]' }, { waitFor: 'role=dialog[name="Attach a web page"]' }], extra: ['1350-light', '390-dark'] },
  {
    name: 'conv-add-url-long',
    path: CONV,
    act: [...ADD_MENU, { click: 'role=menuitem[name=/From a URL/]' }, { fill: 'role=textbox[name="Web address"]', text: 'https://example.com/long-page' }, { click: 'role=button[name="Attach"]' }, { waitFor: 'role=button[name=/Attach the first/]' }],
    extra: ['1350-light', '390-dark'],
  },
  {
    name: 'conv-add-url-site-404',
    path: CONV,
    act: [...ADD_MENU, { click: 'role=menuitem[name=/From a URL/]' }, { fill: 'role=textbox[name="Web address"]', text: 'https://example.com/missing' }, { click: 'role=button[name="Attach"]' }, { waitFor: 'text=/answered with error 404/' }],
    extra: ['1350-light', '390-dark'],
  },
  // New chat (the AI start page): the composer plate with its agent, model and Options chips over the ways to start; then
  // the agent picker and Options, each in its panel.
  { name: 'new-chat', path: '/new', waitForText: 'What should we do?', extra: ['390-dark'] },
  { name: 'new-chat-agent-picker', path: '/new', act: [{ click: 'role=button[name=/^Agent: /]' }, { waitFor: 'role=dialog[name="Choose an agent"]' }] },
  { name: 'new-chat-options', path: '/new', act: [{ click: 'role=button[name=/^Options/]' }, { waitFor: 'role=dialog[name="Options for this chat"]' }] },
  // The pause read failed: "Pause state unknown" with Try again in the pane foot (where the pane is beside the screen)
  // and on Rules & safety.
  { name: 'pause-unread', state: 'pauseUnread', path: '/new', waitForText: 'What should we do?', extra: ['1350-light', '1350-dark'] },
  // Waits for the page's own subtitle: the terminal gate's settle can end in the moment before the Rules view's reads
  // start, which drew the bare "Loading…" frame.
  { name: 'pause-unread-rules', state: 'pauseUnread', path: '/rules', waitForText: 'The checked rules and hooks of a realm', extra: REVIEW },
  // Loops: a running loop's detail (header actions, ⋯ open), a paused one (its Verdict line), and the new-loop drawer.
  { name: 'loop-detail', path: '/auto/loops', act: [{ click: 'text=Check CI on main and fix a red build' }, { waitFor: LOOP_BAR }], extra: REVIEW },
  { name: 'loop-detail-menu', path: '/auto/loops', act: [{ click: 'text=Check CI on main and fix a red build' }, { waitFor: LOOP_BAR }, { click: `${LOOP_BAR} >> role=button[name="More actions"]` }, { waitFor: 'role=menuitem[name="Delete"]' }] },
  { name: 'loop-paused', path: '/auto/loops', act: [{ click: 'text=Look for dependency updates' }, { waitFor: LOOP_BAR }], extra: REVIEW },
  { name: 'loop-new', path: '/auto/loops', act: [{ click: 'role=button[name="New loop in a chat…"]' }, { waitFor: 'role=dialog[name="New loop"]' }], extra: REVIEW },
  // Skills: the Skill Hub's results and a preview (one trust band, Back in the drawer header), and a skill's trust row.
  { name: 'skill-hub', path: '/knowledge/skills', act: HUB_SEARCH, extra: REVIEW },
  // Knowledge → Memory with Details open: the store's hosts and the on/off switch; then a store that cannot be read.
  { name: 'memory', path: '/knowledge/memory', waitForText: 'shop', act: [{ click: 'Details' }], extra: REVIEW },
  { name: 'memory-down', state: 'memoryDown', path: '/knowledge/memory', act: [{ click: 'Details' }], extra: REVIEW },
  { name: 'skill-hub-preview', path: '/knowledge/skills', act: [...HUB_SEARCH, { click: 'role=dialog >> role=button[name=/^Read /]' }, { waitFor: 'role=dialog >> text=Package' }], extra: REVIEW },
  { name: 'skill-hub-install', path: '/knowledge/skills', act: [...HUB_SEARCH, { click: 'role=dialog >> role=button[name=/^Read /]' }, { waitFor: 'role=dialog >> text=Package' }, { hover: 'role=dialog >> role=button[name="Install"]' }], extra: ['390-dark'] },
  { name: 'skill-trust', path: `/knowledge/skills?sel=${encodeURIComponent('/home/ada/.hoody/skills/deploy-check')}`, waitForText: 'Review and trust…', extra: REVIEW },
] satisfies Shots;
