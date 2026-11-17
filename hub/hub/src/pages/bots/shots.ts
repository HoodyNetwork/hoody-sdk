// Named screenshot states of the bots page (`bun run hub:shots --page bots`): the list in each
// state, the Bot page and each tab in each state, every drawer and the dialogs that guard a change.
import type { Shots } from '@app/shots.types';

const SEL = '?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const bot = (extra = '') => `${SEL}${extra}`;
const NEW = '?drawer=new&initial=c-atlas';
// New Bot's Public link switch (its row names it).
export const LINK_ON = 'role=dialog[name="New Bot"] >> [data-sg-row]:has-text("Public link") >> span[aria-hidden="true"]';

export default [
  // List
  { name: 'list-many', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'agent-hint', act: [{ click: 'role=button[name="Use with your agent"]' }] },
  { name: 'list-filtered', path: '?status=working' },
  { name: 'list-no-match', path: '?status=paused&computer=c-atlas', waitForText: 'Nothing matches these filters' },
  { name: 'list-empty', state: 'empty' },
  { name: 'list-no-computer', state: 'noComputer', waitForText: 'Bots run on a computer' },
  { name: 'list-none-running', state: 'noRunning', waitForText: 'None of your computers is running' },
  { name: 'start-unknown', state: 'startUnknown', act: [{ click: 'role=button[name="Start atlas"]' }, { waitFor: 'text=may have gone through' }] },
  { name: 'start-pending', state: 'startUnknown', act: [{ click: 'role=button[name="Start atlas"]' }, { waitFor: 'text=may have gone through' }, { click: 'role=button[name=/Check again/] >> visible=true' }, { waitFor: 'text=may have gone through' }] },
  { name: 'start-dismiss-confirm', state: 'startUnknown', act: [{ click: 'role=button[name="Start atlas"]' }, { waitFor: 'text=may have gone through' }, { click: 'role=alert >> role=button[name="Stop tracking…"]' }, { waitFor: 'text=Stop tracking the change to atlas' }] },
  { name: 'list-partial', state: 'partial' },
  // A Bot whose Telegram app has privacy on, and groups waiting: the list's warn tags and the privacy tip.
  { name: 'list-privacy', state: 'chatsWaiting', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'list-error', state: 'error' },
  { name: 'list-loading', state: 'pending' },
  { name: 'row-menu', path: '', click: "role=button[name='Row actions'] >> nth=2" },
  // The Bot: header, waiting card, tabs
  { name: 'bot-waiting-approve', state: 'waitingApprove', path: bot() },
  { name: 'bot-waiting-answer', state: 'waitingAnswer', path: bot() },
  { name: 'bot-gate-recovery', state: 'gateRecovery', path: bot(), click: 'role=button[name=/^Allow once/]' },
  { name: 'bot-idle', state: 'idle', path: bot() },
  { name: 'bot-working', state: 'working', path: bot() },
  { name: 'bot-paused', state: 'paused', path: bot() },
  { name: 'bot-needs-key', state: 'needsKey', path: bot() },
  { name: 'bot-auto-approve', state: 'autoApprove', path: bot() },
  // A Chief-like conversation in markdown (paragraphs, lists, code, a hidden key, HTML-looking text, Arabic).
  { name: 'bot-markdown', state: 'markdown', path: bot(), waitForText: 'Here is yesterday', act: [{ hover: 'text=Can you sum up' }] },
  { name: 'bot-no-expect', state: 'noExpect', path: bot() },
  { name: 'bot-gone', path: '?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~nobody' },
  { name: 'bot-menu', state: 'idle', path: bot(), click: 'More actions' },
  // Where the Bot lives (its server and realm) is behind the meta's "+N".
  { name: 'bot-hosting', state: 'idle', path: bot(), click: 'role=button[name=/^\\+\\d+ more/]' },
  // A chat app needs the person, so the header's Fix says why beside it.
  { name: 'bot-fix-why', state: 'chatAppAttention', path: bot() },
  { name: 'bot-reset-confirm', state: 'idle', path: bot('&do=reset') },
  { name: 'bot-delete-confirm', state: 'idle', path: bot('&do=delete') },
  { name: 'bot-stop-confirm', state: 'working', path: bot('&do=stop') },
  // Activity
  { name: 'activity-reconnecting', state: 'reconnecting', path: bot() },
  { name: 'activity-no-stream', state: 'noStream', path: bot() },
  { name: 'activity-empty', state: 'logEmpty', path: bot() },
  { name: 'activity-error', state: 'logError', path: bot() },
  // Link and keys
  { name: 'link', state: 'idle', path: bot('&tab=link') },
  { name: 'link-none', state: 'noLink', path: bot('&tab=link') },
  { name: 'link-propagating', state: 'linkPropagating', path: bot('&tab=link') },
  { name: 'link-frozen', state: 'linkFrozen', path: bot('&tab=link') },
  { name: 'link-off', state: 'linkOff', path: bot('&tab=link') },
  { name: 'link-no-zone', state: 'linkNoZone', path: bot('&tab=link') },
  { name: 'keys-full', state: 'keysFull', path: bot('&tab=link') },
  { name: 'link-give', state: 'noLink', path: bot('&tab=link&drawer=link') },
  // A first link made now: the drawer gives way to the Link and keys tab, New key has the keyboard.
  { name: 'link-first-key', state: 'noKeys', path: bot('&drawer=link'), act: [{ click: 'role=button[name="Create link"]' }, { waitFor: 'css=[data-keys-block]' }] },
  { name: 'link-limits', state: 'idle', path: bot('&tab=link&drawer=linkset') },
  { name: 'link-repoint', state: 'idle', path: bot('&tab=link&drawer=repoint') },
  { name: 'key-new', state: 'idle', path: bot('&tab=link&drawer=key') },
  { name: 'key-new-myip', state: 'idle', path: bot('&tab=link&drawer=key'), act: [{ click: 'role=button[name="Add my IP"]' }, { waitFor: 'Added' }] },
  { name: 'key-edit', state: 'idle', path: bot('&tab=link&drawer=key:k1a2b3c4d5e6') },
  { name: 'key-secret', state: 'idle', path: bot('&tab=link&drawer=key'), click: 'Make key' },
  { name: 'link-panic', state: 'idle', path: bot('&tab=link'), act: [{ click: '#bot-link-addresses >> role=button[name="More actions"]' }, { click: 'role=menuitem[name=/Panic: turn the link off/]' }] },
  { name: 'link-door', state: 'idle', path: bot('&tab=link'), act: [{ click: '#bot-link-addresses >> role=row[name=/OpenAI-compatible/] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name=/How to use the OpenAI-compatible address/]' }] },
  { name: 'link-qr', state: 'idle', path: bot('&tab=link'), act: [{ click: '#bot-link-addresses >> role=row[name=/Chat page/] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name=/How to use the Chat page address/]' }, { click: 'role=dialog >> role=button[name=/QR/i]' }] },
  // Chat apps
  { name: 'apps', state: 'idle', path: bot('&tab=apps') },
  { name: 'apps-none', state: 'noChannels', path: bot('&tab=apps') },
  { name: 'apps-paused', state: 'channelsPaused', path: bot('&tab=apps') },
  { name: 'apps-add', state: 'idle', path: bot('&tab=apps&app=new') },
  // Invites allowed (pairing policy): the invite button is enabled, so this shot fails on the owner-only state.
  { name: 'apps-people', state: 'channelPairing', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="People"]' }, { waitFor: 'text=Ana' }, { waitFor: 'role=button[name="Create invite code"][disabled=false]' }] },
  { name: 'apps-people-add', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="People"]' }, { click: 'role=button[name="Add a person"]' }, { waitFor: 'text=Add person' }] },
  { name: 'apps-people-nopairing', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="People"]' }, { hover: 'text=Invite codes work only' }, { waitFor: 'text=Invite codes work only' }] }, // the hover scrolls the note into view, and fails without it
  { name: 'apps-people-invite', state: 'channelPairing', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="People"]' }, { click: 'role=button[name="Create invite code"]' }, { waitFor: 'text=Invite code' }] },
  { name: 'apps-chats', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="Chats"]' }, { waitFor: 'text=Direct message' }] },
  { name: 'apps-chats-approve', state: 'idle', path: bot('&tab=apps&app=ch-dc'), act: [{ click: 'role=button[name="Chats"]' }, { click: 'role=button[name="Approve"]' }, { waitFor: 'text=Approve group' }] },
  { name: 'apps-settings', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="Settings"]' }, { waitFor: 'text=Rename' }] },
  { name: 'apps-settings-all', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="Settings"]' }, { click: 'role=button[name=/All settings/]' }, { waitFor: 'text=Who can talk' }] },
  { name: 'apps-chat-settings', state: 'idle', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="Chats"]' }, { click: 'role=button[name="Chat settings"] >> nth=0' }, { waitFor: 'text=Message formatting' }] },
  { name: 'apps-webhook', state: 'channelWebhook', path: bot('&tab=apps&app=ch-tg'), act: [{ waitFor: 'text=Remove the webhook' }] },
  // @BotFather as a link: the Setup privacy step, and the group steps in Chats.
  { name: 'apps-setup-privacy', state: 'channelGroupAsks', path: bot('&tab=apps&app=ch-tg'), act: [{ waitFor: 'role=link[name="@BotFather"] >> nth=0' }, { hover: 'role=link[name="@BotFather"] >> nth=0' }], extra: ['390-dark'] },
  { name: 'apps-chats-group-steps', state: 'channelGroupAsks', path: bot('&tab=apps&app=ch-tg'), act: [{ click: 'role=button[name="Chats"]' }, { click: 'role=button[name="Add the Bot to a group"]' }, { hover: 'text=/setprivacy >> nth=0' }] },
  { name: 'apps-manage', state: 'idle', path: bot('&tab=apps'), click: 'Manage' },
  // Work
  { name: 'work', state: 'working', path: bot('&tab=work') },
  // Settings
  { name: 'settings-model', state: 'idle', path: bot('&settings=model') },
  // The catalogue read is slow (20 s): the wait shows only the Agent's default and the held model, then the real list replaces it.
  { name: 'settings-model-loading', state: 'modelsSlow', path: bot('&settings=model'), waitForText: 'Checking models' },
  { name: 'settings-model-loading-search', state: 'modelsSlow', path: bot('&settings=model'), act: [{ fill: 'role=searchbox[name="Search models and providers"]', text: 'zzz' }], waitForText: 'Checking models' },
  { name: 'settings-model-settled', state: 'modelsSoon', path: bot('&settings=model'), act: [{ waitFor: 'role=heading[name="Ready to use"]' }] },
  // The kit ModelChooser in Settings: a search, and the agent's default saved.
  { name: 'settings-model-search', state: 'idle', path: bot('&settings=model'), act: [{ fill: 'role=searchbox[name="Search models and providers"]', text: 'gemini' }, { waitFor: 'role=option[name=/Gemini 3 Pro/]' }] },
  { name: 'settings-model-inherit', state: 'idle', path: bot('&settings=model'), act: [{ click: 'role=option[name=/Agent.s default/]' }, { waitFor: "text=Saved. It uses the agent's configured model." }] },
  { name: 'settings-behaviour', state: 'idle', path: bot('&settings=behaviour') },
  { name: 'settings-guardrails', state: 'idle', path: bot('&settings=guardrails') },
  { name: 'settings-voice', state: 'idle', path: bot('&settings=voice') },
  { name: 'settings-advanced', state: 'idle', path: bot('&settings=advanced') },
  // What each kind of helper runs on, Routing per task, the agents a task may name, Claude Code's model.
  { name: 'settings-helpers', state: 'workersRouting', path: bot('&settings=workers') },
  { name: 'settings-helpers-llm', state: 'idle', path: bot('&settings=workers') },
  { name: 'settings-no-expect', state: 'noExpect', path: bot('&settings=guardrails') },
  // New Bot
  { name: 'new-bot', path: NEW },
  // Opened from the list with no computer named: it starts on the computer the top bar shows.
  { name: 'new-bot-shown-computer', path: '?drawer=new', act: [{ waitFor: 'text=Included' }] },
  // No computer runs: the Computer row says so, and the model cannot be changed yet.
  { name: 'new-bot-none-running', state: 'noRunning', path: '?drawer=new' },
  // Change swaps the drawer's body for the model chooser; a pick returns to the form, whose Model row names it.
  { name: 'new-bot-model-chooser', path: NEW, act: [{ click: 'role=button[name="Change the model"]' }, { waitFor: 'role=option[name=/Hoody Free/]' }] },
  { name: 'new-bot-model-changed', path: NEW, act: [{ click: 'role=button[name="Change the model"]' }, { click: 'role=option[name=/Agent\'s default/]' }, { waitFor: 'role=button[name="Create Bot"]' }] },
  { name: 'new-bot-more', path: NEW, act: [{ click: 'role=button[name=/More options/]' }, { waitFor: 'role=textbox[name="Instructions"]' }] },
  { name: 'new-bot-many-models', state: 'manyModels', path: NEW, act: [{ click: 'role=button[name="Change the model"]' }, { waitFor: 'role=option[name=/Hoody Free/]' }] },
  // The starting model is gone from the computer, so Create names it and asks for another.
  { name: 'new-bot-model-gone', state: 'noModels', path: NEW, act: [{ click: 'role=button[name="Create Bot"]' }, { waitFor: 'text=is no longer on' }] },
  // The kit ComputerPicker open (place city · server, realm chip, search).
  { name: 'new-bot-picker', path: NEW, act: [{ click: 'role=dialog[name="New Bot"] >> role=button[name=/Computer/]' }, { waitFor: 'role=searchbox[name="Find a computer"]' }] },
  { name: 'new-bot-link', path: `${NEW}`, click: LINK_ON },
  { name: 'new-bot-maybe', state: 'newBotUnknown', path: NEW, click: 'Create Bot' },
  // The agent mints a link and its secret only when one is asked for (POST /bots link): the done screen with one, and without.
  { name: 'new-bot-done', path: NEW, click: LINK_ON, act: [{ click: 'Create Bot' }] },
  { name: 'new-bot-done-nolink', state: 'newBotNoLink', path: NEW, click: 'Create Bot' },
  { name: 'new-bot-key-lost', state: 'newBotKeyLost', path: NEW, click: LINK_ON, act: [{ click: 'Create Bot' }] },
  { name: 'new-bot-name-taken', state: 'newBotNameTaken', path: NEW, click: LINK_ON, act: [{ click: 'Create Bot' }] },
  { name: 'new-bot-failed', state: 'newBotFailed', path: NEW, click: 'Create Bot' },
] satisfies Shots;
