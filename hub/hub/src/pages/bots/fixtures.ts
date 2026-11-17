// Fake-API states of the bots page for hub:dev, hub:shots, tests and specs.
// The list states (many, empty, none running, partial, error, pending) and the Bot states
// (waiting for approval or an answer, gate recovery, working, paused, link and key states,
// chat app states) all build on one base dataset; each state changes only what it names.
import { answers, lifecycleFixtures, providers, reply, worldColours, type FixtureRequest, type FixtureRule, type agent } from '@core';
import { defineFixtures } from '@app/fixtures';
import type {
  AudioModel,
  BotLink,
  BotRow,
  BotView,
  Channel,
  ChannelKind,
  ChannelSettings,
  ChannelSetup,
  Computer,
  Delegate,
  HelperAgents,
  LinkKey,
  LinkOffer,
  LogPage,
  LogRow,
  MintResult,
  ModelRow,
  NewBotResult,
  RealmInfo,
  SpeechConfig,
  Voice,
  VoiceCheck,
} from './data';
import type { SettingsView } from './chatSettings';
import { botKey, statusOf } from './logic';
import { specLabel } from './models.logic';
import { countryFlag, loadCatalogue7k } from '@kit';

const R_MAIN = 'a1b2c3d4e5f60718293a4b5c';
const R_LAB = 'c0ffee00c0ffee00c0ffee01';
const NOW = Date.UTC(2026, 9, 23, 3, 40);
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();

// The shared fixture world: computers atlas (current), boreal and cinder; realms Acme client and
// Personal; account Ada.
const computers: Computer[] = [
  { id: 'c-atlas', name: 'atlas', server: 'n12 Singapore', flag: countryFlag('SG'), state: 'running', listState: 'ok', suspended: 0, hasMore: false, realmIds: [R_MAIN] },
  { id: 'c-boreal', name: 'boreal', server: 'f4 Frankfurt', flag: countryFlag('DE'), state: 'stopped', listState: 'ok', suspended: 0, hasMore: false },
  { id: 'c-cinder', name: 'cinder', server: 'a2 Ashburn', flag: countryFlag('US'), state: 'running', listState: 'ok', suspended: 0, hasMore: true, realmIds: [R_LAB] },
];

const realms: RealmInfo[] = [
  { id: R_MAIN, name: 'Acme client', isGlobal: false },
  { id: R_LAB, name: 'Personal', isGlobal: false },
  { id: 'global', name: 'Global', isGlobal: true },
];

const models: ModelRow[] = [
  { spec: 'hoody-ai/hoody-free', label: 'Hoody Free', provider: 'hoody-ai', providerLabel: 'Hoody AI', source: 'provider', ready: 'ready', computerDefault: true },
  { spec: 'hoody-ai/hoody-fast', label: 'Hoody Fast', provider: 'hoody-ai', providerLabel: 'Hoody AI', source: 'provider', ready: 'ready', computerDefault: false },
  { spec: 'openai/gpt-5', label: 'GPT-5', provider: 'openai', providerLabel: 'OpenAI', source: 'provider', ready: 'needs_key', computerDefault: false, reasoning: true },
  { spec: 'google/gemini-3-pro', label: 'Gemini 3 Pro', provider: 'google', providerLabel: 'Google', source: 'provider', ready: 'unknown', computerDefault: false },
  { spec: 'fusion/best-of-three', label: 'Best of three', provider: 'fusion', providerLabel: 'Ensembles', source: 'fusion', ready: 'ready', computerDefault: false },
];

/**
 * What the model picker reads from the computer's agent for readiness: the providers with their status, the models, the ready
 * models (?ready=true) and the version. Without them the picker reads readiness as failed and offers only Try again.
 */
const providerRulesFor = (list: readonly ModelRow[], delayMs?: number): FixtureRule[] => {
  const ids = [...new Set(list.map((m) => m.provider))];
  const provs = ids.map((id) => {
    const rows = list.filter((m) => m.provider === id);
    const state = rows.some((m) => m.ready === 'ready') ? 'ready' : rows.some((m) => m.ready === 'needs_key') ? 'needs_key' : 'unknown';
    return { id, prefix: `${id}/`, display_name: rows[0]?.providerLabel ?? id, status: { state, via: id === 'hoody-ai' ? 'included' : 'stored_key' } };
  });
  // An ensemble is ready through its members, so the fixture ensembles name the ready models of their computer.
  const members = list.filter((m) => m.source === 'provider' && m.ready === 'ready').map((m) => m.spec);
  const all = list.map((m) => (m.source === 'fusion' ? { spec: m.spec, display_name: m.label, source: 'fusion', members } : { spec: m.spec, display_name: m.label }));
  const ready = all.filter((m) => list.find((x) => x.spec === m.spec)?.ready === 'ready');
  return [
    reply(providers.providerRoutes.version, answers.ok({ api_version: '1', supported: ['1'], available: ['1'], pinned_realm: null })),
    reply(providers.providerRoutes.providers, answers.ok({ providers: provs }, delayMs)),
    reply(providers.providerRoutes.models, (req: FixtureRequest) => answers.ok({ models: req.query.ready === 'true' ? ready : all }, delayMs)),
  ];
};
const providerRules = providerRulesFor(models);

/** A computer listing thousands of models, few of them ready (the model list opens short). */
const manyModels: ModelRow[] = [
  ...models.filter((m) => m.source !== 'fusion'),
  ...Array.from({ length: 9 }, (_, i): ModelRow => ({ spec: `anthropic/claude-${i + 1}`, label: `Claude ${i + 1}`, provider: 'anthropic', providerLabel: 'Anthropic', source: 'provider', ready: 'ready', computerDefault: false })),
  ...Array.from({ length: 2400 }, (_, i): ModelRow => ({ spec: `mistral/model-${i + 1}`, label: `Mistral ${i + 1}`, provider: 'mistral', providerLabel: 'Mistral', source: 'provider', ready: 'needs_key', computerDefault: false })),
];

/**
 * The model picker's benchmark: the real chat catalogue, 206 providers and 7,078 models, of which only Hoody Free
 * is ready (catalogue7k 'freeOnly'). The agent reads answer from the fixture as the agent would; the page's own model rows
 * are the same catalogue in ModelRow form.
 */
// The fixture module loads on demand (it stays out of every chunk but this dev-only one).
const { catalogue7k, okBody } = await loadCatalogue7k();

const models7kRules = (): { rules: FixtureRule[]; data: ModelRow[] } => {
  const reads = catalogue7k('freeOnly');
  const provs = okBody(reads.providers)?.providers ?? [];
  const all = okBody(reads.models)?.models ?? [];
  const ready = new Set((okBody(reads.ready)?.models ?? []).map((m) => m.spec));
  const data = all.map((m): ModelRow => {
    const p = provs.find((x) => m.spec.startsWith(x.prefix));
    const id = p?.id ?? m.spec.slice(0, m.spec.indexOf('/'));
    const state = ready.has(m.spec) ? 'ready' : p?.status?.state === 'needs_key' ? 'needs_key' : 'unknown';
    return { spec: m.spec, label: m.display_name, provider: id, providerLabel: p?.display_name ?? id, source: 'provider', ready: state, computerDefault: m.spec === 'hoody-ai/hoody-free' };
  });
  const pid = (req: FixtureRequest) => req.path.split('/')[2] ?? '';
  const rules = [
    reply(providers.providerRoutes.version, reads.version),
    reply(providers.providerRoutes.providers, reads.providers),
    reply(providers.providerRoutes.models, (req: FixtureRequest) => (req.query.ready === 'true' ? reads.ready : reads.models)),
    reply(providers.providerRoutes.auth, (req: FixtureRequest) => reads.auth(pid(req))),
  ];
  return { rules, data };
};

interface Seed {
  id: string;
  name: string;
  computer: string;
  realm: string;
  role: string;
  status: BotRow['status'];
  link: BotRow['link'] | 'off';
  model?: string;
  idle: number | null;
  queued?: number;
  locked?: boolean;
  apps?: ChannelKind[];
  waiting?: number;
  privacy?: boolean;
}

const SEEDS: Seed[] = [
  { id: 'chief', name: 'Chief', computer: 'c-atlas', realm: R_MAIN, role: 'Runs the team day: triage, approvals and summaries', status: 'waiting', link: 'active', idle: 2, apps: ['telegram', 'slack', 'discord'] },
  { id: 'support', name: 'Support', computer: 'c-atlas', realm: R_MAIN, role: 'Answers questions about the shop and drafts replies', status: 'working', link: 'off', idle: 0, apps: ['discord'] },
  { id: 'digest', name: 'Digest', computer: 'c-atlas', realm: R_MAIN, role: 'Writes the daily summary of what changed', status: 'queued', link: 'none', idle: 12, queued: 2 },
  { id: 'scout', name: 'Scout', computer: 'c-cinder', realm: R_MAIN, role: 'Watches deploys and reports failures', status: 'idle', link: 'active', model: 'openai/gpt-5', idle: 55, apps: ['telegram'] },
  { id: 'ledger', name: 'Ledger', computer: 'c-cinder', realm: R_LAB, role: 'Keeps the monthly numbers tidy', status: 'paused', link: 'none', idle: 640 },
  { id: 'notes', name: 'Notes', computer: 'c-atlas', realm: R_LAB, role: 'Files meeting notes where they belong', status: 'idle', link: 'none', idle: 190 },
  { id: 'relay', name: 'Relay', computer: 'c-cinder', realm: 'global', role: 'General helper for every realm', status: 'idle', link: 'detached', idle: 3000 },
  { id: 'harbor', name: 'Harbor', computer: 'c-cinder', realm: R_MAIN, role: 'Another agent program serves this Bot', status: 'idle', link: 'none', idle: null, locked: true },
  { id: 'iris', name: 'Iris', computer: 'c-cinder', realm: R_LAB, role: 'Translates release notes', status: 'idle', link: 'frozen', model: 'fusion/best-of-three', idle: 5000 },
];
for (let i = 0; i < 14; i++) {
  const id = `helper-${String(i + 1).padStart(2, '0')}`;
  SEEDS.push({ id, name: `Helper ${i + 1}`, computer: i % 2 ? 'c-cinder' : 'c-atlas', realm: R_MAIN, role: 'Short-lived task helper', status: 'idle', link: 'none', idle: 700 + i * 90 });
}

function row(s: Seed): BotRow {
  const modelSpec = s.model ?? 'hoody-ai/hoody-free';
  return {
    key: botKey(s.computer, s.realm, s.id),
    id: s.id,
    uid: `0192f3a0-7c11-7${s.id.length}${(s.id.charCodeAt(0) % 10).toString()}2-8b1d-5c0a9e3f4d${String(s.id.length).padStart(2, '0')}`,
    name: s.name,
    role: s.role,
    realm: s.realm,
    realmName: realms.find((r) => r.id === s.realm)?.name ?? 'Global',
    computerId: s.computer,
    status: s.status,
    queued: s.queued ?? 0,
    model: modelSpec,
    modelLabel: specLabel(modelSpec), // as the live adapter labels a held model: the spec's own name, never a catalogue label
    lastActivityAt: s.idle === null ? null : ago(s.idle),
    link: s.link === 'off' ? 'disabled' : s.link,
    chatApps: s.apps ?? [],
    chatsWaiting: s.waiting ?? 0,
    privacyOn: s.privacy === true,
    locked: s.locked === true,
  };
}

const rows: BotRow[] = SEEDS.map(row);
const first = rows[0] as BotRow;
const second = rows[1] as BotRow;

function viewOf(r: BotRow, over: Partial<BotView> = {}): BotView {
  return {
    key: r.key,
    id: r.id,
    uid: r.uid,
    name: r.name,
    role: r.role,
    instructions: 'Be brief and kind. Ask before anything that costs money. Never reveal keys or addresses.',
    model: r.model,
    modelLabel: r.modelLabel,
    provider: { id: r.model.split('/')[0] ?? '', label: r.model.split('/')[0] ?? '', ready: 'unknown' }, // data.ts reads no readiness from the view: needsKey (FIXTURE_ONLY_STATES) is the one state with it
    yolo: false,
    yoloUnapplied: { pending: 0, refused: 0 },
    gate: null,
    turnRunning: r.status === 'working' || r.status === 'waiting',
    turnId: r.status === 'working' || r.status === 'waiting' ? 'turn-7f3a' : null,
    sessionModel: r.status === 'working' || r.status === 'waiting' ? r.model : null,
    pausedAtLimit: r.status === 'paused',
    queued: r.queued,
    tasksOpen: r.status === 'working' ? 2 : 0,
    allowedComputers: null,
    allowedAgents: null,
    guardrails: ['Never delete data without asking.', 'Stay inside the shop repository.'],
    guardrailCheck: 'strict',
    guardrailRevision: 3,
    checkerOk: true,
    routing: 'off',
    routingSet: { mode: 'off', light: null, heavy: null },
    async: false,
    waitSeconds: 30,
    realtimeMaxItems: 200,
    speech: { enabled: false, ready: null, why: null, config: null },
    workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' },
    caps: { botExpect: true, botGateHttp: true, botTurnCancel: true },
    attention: [],
    createdAt: ago(60 * 24 * 12),
    ...over,
  };
}

function keyOf(id: string, name: string, over: Partial<LinkKey> = {}): LinkKey {
  return { id, name, prefix: `hk_${id.slice(-4)}`, enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: ago(60 * 24 * 9), rotatedAt: null, ...over };
}

function linkOf(r: BotRow, over: Partial<BotLink> = {}): BotLink {
  const label = `${r.id}-shop-bot`;
  return {
    id: `url-${r.id}`,
    label,
    url: `https://${label}.hoody.bot`,
    status: r.link === 'none' ? 'active' : r.link,
    statusReason: null,
    ownerEnabled: r.link !== 'disabled',
    cors: true,
    limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 8 },
    keys: [
      keyOf('k1a2b3c4d5e6', 'website widget', { allowlist: ['203.0.113.0/24'], notes: 'Used by the shop widget', holderNote: 'Questions about this key: ask the shop team.' }),
      keyOf('k9z8y7x6w5v4', 'ci checks', { enabled: false }),
      keyOf('k5t6u7i8o9p0', 'old demo', { expiresAt: ago(60 * 24 * 2) }),
    ],
    keysKnown: true,
    propagation: { state: 'applied', pending: 0, failed: 0, succeeded: 3, targets: 3 },
    createdAt: ago(60 * 24 * 12),
    ...over,
  };
}

function logRows(count: number): LogRow[] {
  const sample: Array<[LogRow['kind'], string, string | null]> = [
    ['user', 'Can you check why the last deploy of the shop failed?', null],
    ['bot', 'I opened a task to read the deploy log. It is working on it now.', null],
    ['note', 'Task "Read deploy log" started on atlas.', 'dispatch: task=Read deploy log computer=c-atlas'],
    ['report', 'The deploy failed because the build step ran out of memory. I suggest raising the limit to 2 GB.', null],
    ['user', 'Do that, but ask me before restarting anything.', null],
    ['bot', 'Understood. I will change the limit and ask before any restart.', null],
    ['provider', 'The model provider stopped the answer. Earlier steps may have completed.', 'abnormal_stop: refusal'],
    ['gone', 'Task "Read deploy log" finished.', null],
  ];
  return Array.from({ length: count }, (_, i) => {
    const [kind, text, raw] = sample[i % sample.length] as [LogRow['kind'], string, string | null];
    // The first message came through Telegram, the second through a key on the OpenAI-style door; later ones have no door recorded (a plain post).
    const sender = kind !== 'user' ? null : i === 0 ? { via: 'telegram', who: 'Sam' } : i === 4 ? { via: 'openai', who: 'key:website widget' } : null;
    return { seq: 100 + i, kind, text, at: ago((count - i) * 7), raw, delegateTitle: kind === 'note' || kind === 'gone' ? 'Read deploy log' : null, sessionId: kind === 'note' || kind === 'report' || kind === 'gone' ? 'sess-a1' : null, sender };
  });
}

// A Chief-like thread in markdown: paragraphs, lists, inline and fenced code, a secret, HTML-looking text and an
// Arabic message. The page draws it as prose, never as HTML.
const markdownRows: LogRow[] = ([
  ['user', 'Can you sum up yesterday\'s deploys?\nAlso: which ones failed?', { via: 'telegram', who: 'Sam' }],
  ['bot', 'Here is yesterday:\n\n1. **shop** deployed at 09:12, fine.\n2. **blog** failed: the build ran out of memory.\n\nWhat I did:\n- opened a task to read the log\n- raised the limit to `2 GB`\n\nThe new limit in `deploy.yml`:\n\n```yaml\nbuild:\n  memory: 2g\n```\n\nShall I restart the blog now?', null],
  ['user', 'Yes. The CDN key is sk-live_abcdefghijklmnop1234 if you need it.\nWhy does the banner show <b>Sale</b> instead of bold?', null],
  ['bot', 'Restarted, and I did not keep the key.\n\nThe banner template escapes HTML, so `<b>` shows as text and a <script>alert(1)</script> would too. Write **Sale** in the banner text instead.', null],
  ['user', 'هل يمكنك إعادة تشغيل المدونة غدًا أيضًا؟', null],
] as Array<[LogRow['kind'], string, LogRow['sender']]>).map(([kind, text, sender], i) => ({ seq: 300 + i, kind, text, at: ago((5 - i) * 3), raw: null, delegateTitle: null, sender }));

const delegates: Delegate[] = [
  { sessionId: 'sess-a1', title: 'Read deploy log', state: 'working', computerId: 'c-atlas', model: 'hoody-ai/hoody-free', waitingOn: null, startedAt: ago(14) },
  { sessionId: 'sess-a2', title: 'Draft reply to a reader', state: 'waiting', computerId: 'c-atlas', model: 'hoody-ai/hoody-free', waitingOn: 'Run a command that changes files in the shop repository', startedAt: ago(30) },
  { sessionId: 'sess-a3', title: 'Check dependencies', state: 'closed', computerId: 'c-cinder', model: 'hoody-ai/hoody-fast', waitingOn: null, startedAt: ago(600) },
];

// Work: finished tasks. Their count is its own read (the agent's closed total) and the tasks are read by page when the tab opens them.
const closedTask = (n: number): Delegate => ({ sessionId: `sess-f${n}`, title: `Finished task ${n}`, state: 'closed', computerId: 'c-atlas', model: 'hoody-ai/hoody-free', waitingOn: null, startedAt: ago(700 + n) });
const manyClosed = Array.from({ length: 25 }, (_, i) => closedTask(i + 1));
const openTasks = delegates.filter((d) => d.state !== 'closed');

// The agent's `effective` values for a chat app: every setting at its default, with the overrides named by the state. A value the app
// or the chat sets itself shows its source; `settings` holds only those.
const CHAN_DEFAULTS: Record<string, unknown> = {
  dm_policy: 'owner', group_mode: 'owner_approves', mention_only: true, default_rights: ['chat'], blocked_users: [], blocked_chats: [], allowed_chats: [],
  unpaired_reply: 'hint', command_denied_reply: 'hint', pairing_ttl_minutes: 15, pairing_rights: ['chat'], max_principals: 8, pairing_user_burn_tries: 5,
  pairing_user_burn_minutes: 60, pairing_code_burn_tries: 20, gate_cards: 'on', gate_deciders: 'owner', decide_in_groups: false, gate_detail: 'summary',
  gate_ttl_minutes: 0, push_events: [], push_detail: 'brief', wake_replies: true, mirror_other_doors: false, home_chat: null, no_reply_notice: true,
  delivery_expiry_hours: 24, typing: true, reply_style: 'thread', format: 'rich', parse_mode: 'html', part_chars: 4096, split_at: 'paragraph', max_parts: 8,
  overflow_note: true, lang: 'en', show_sender_name: true, max_text_bytes: 65536, rate_user_per_min: 10, rate_user_per_hour: 20, rate_user_per_day: 100,
  rate_chat_per_min: 20, outbound_rate: 1, reconnect_backoff_max_seconds: 60, command_prefix: '/', chat_commands: ['status', 'stop', 'bind', 'unbind', 'help'],
  hide_secrets: true, enabled: true, channel_lease: true,
};
const settingsView = (own: Record<string, unknown> = {}, home: string | null = null): SettingsView => {
  const effective: Record<string, { value: unknown; source: string }> = {};
  for (const [k, v] of Object.entries(CHAN_DEFAULTS)) effective[k] = { value: k in own ? own[k] : v, source: k in own ? 'channel' : 'default' };
  effective.home_chat = { value: home, source: home ? 'channel' : 'default' };
  return { settings: own, effective };
};
const chatView = (own: Record<string, unknown> = {}): SettingsView => ({
  settings: own,
  effective: { mention_only: { value: own.mention_only ?? true, source: 'mention_only' in own ? 'chat' : 'default' }, reply_style: { value: own.reply_style ?? 'thread', source: 'reply_style' in own ? 'chat' : 'default' }, format: { value: 'rich', source: 'default' }, rate_user_per_min: { value: 10, source: 'default' }, rate_user_per_hour: { value: 20, source: 'default' }, rate_user_per_day: { value: 100, source: 'default' }, rate_chat_per_min: { value: 20, source: 'default' } },
});

const channelList: Channel[] = [
  {
    id: 'ch-tg', kind: 'telegram', label: 'Support chat', enabled: true, state: 'running', needsOwner: false, people: 3, chats: 2, homeChat: 'cht-support', reason: '', identity: { name: 'Atlas support', username: 'atlas_support_bot', inviteUrl: '' },
    principals: [
      { id: 'pr-ana', platformUser: '5151001', name: 'Ana', rights: ['chat', 'control', 'gates'], owner: true, lang: 'en' },
      { id: 'pr-ben', platformUser: '5151002', name: 'Ben', rights: ['chat', 'control'], owner: false, lang: '' },
      { id: 'pr-chi', platformUser: '5151003', name: '', rights: ['chat'], owner: false, lang: 'fr' },
    ],
    view: settingsView({ gate_deciders: 'named', push_events: ['report', 'gate'] }, 'cht-support'), notes: [{ code: 'telegram_privacy_on', field: 'mention_only' }],
    chatRows: [
      { id: 'cht-support', platformChat: '-100123', kind: 'group', title: 'Support chat', state: 'approved', view: chatView({ reply_style: 'plain' }) },
      { id: 'cht-ana', platformChat: '5151001', kind: 'dm', title: 'Ana', state: 'approved', view: chatView() },
    ],
  },
  { id: 'ch-sl', kind: 'slack', label: 'Team workspace', enabled: true, state: 'needs_owner', needsOwner: true, people: 0, chats: 0, homeChat: null, reason: '', principals: [], chatRows: [], view: settingsView({ command_prefix: '!' }), notes: [] },
  {
    id: 'ch-dc', kind: 'discord', label: 'Community server', enabled: false, state: 'paused', needsOwner: false, people: 1, chats: 1, homeChat: null, reason: '',
    principals: [{ id: 'pr-dee', platformUser: '90210', name: 'Dee', rights: ['chat', 'control', 'gates'], owner: true, lang: 'en' }],
    view: settingsView({ dm_policy: 'allowlist', command_prefix: '!' }), notes: [],
    chatRows: [{ id: 'cht-general', platformChat: '4455', kind: 'group', title: 'general', state: 'muted', view: chatView() }],
  },
];
const telegramSetup: ChannelSetup = {
  kind: 'telegram',
  steps: ['Open Telegram and start a chat with @BotFather.', 'Send /newbot and follow the questions.', 'Copy the token BotFather gives you.'],
  needs: ['token'],
  available: true,
  manifest: '',
};
const slackSetup: ChannelSetup = {
  kind: 'slack',
  steps: ['Create a Slack app from the manifest.', 'Install it to your workspace and copy the bot token (xoxb-).', 'Create an app-level token (xapp-) with connections:write.'],
  needs: ['token', 'app_token'],
  available: true,
  manifest: '{"display_information":{"name":"Hoody Bot"},"settings":{"socket_mode_enabled":true}}',
};
const channelSettings: ChannelSettings = {
  ok: true, paused: false, maxChannels: 4, rateBotPerDay: 200,
  view: {
    settings: { max_channels: 4, rate_bot_per_day: 200 },
    effective: { lang: { value: 'en', source: 'default' }, max_channels: { value: 4, source: 'bot' }, rate_bot_per_day: { value: 200, source: 'bot' }, hide_secrets: { value: true, source: 'default' }, shared_identity: { value: 'off', source: 'default' }, channels_paused: { value: false, source: 'default' } },
  },
};

const offer: LinkOffer = { door: 'ready', suggestedLabel: 'quiet-amber-heron-bot', zone: 'hoody.bot' };

const minted: MintResult = {
  key: keyOf('knew00112233', 'new key'),
  secret: 'hk_live_EXAMPLE_NOT_A_REAL_KEY',
  curl: 'curl https://chief-shop-bot.hoody.bot/v1/models -H "Authorization: Bearer $HOODY_BOT_KEY"',
};

const newBotDone: NewBotResult = { state: 'done', botKey: first.key, link: linkOf(first), secret: minted.secret };

// ── base dataset and the states built on it ─────────────────────────────────────────

const confirmGate = {
  id: 'gate-1',
  generation: 2,
  type: 'confirm' as const,
  summary: 'Run a command that changes files in the shop repository: npm install && npm run build',
  // The agent's pending_gate carries no tool and no helper: a gate here never shows either.
  tool: null,
  advanced: null,
};

const views: Record<string, BotView> = Object.fromEntries(rows.map((r) => [r.key, viewOf(r, r === first ? { gate: confirmGate } : {})]));
const links: Record<string, BotLink | null> = Object.fromEntries(rows.map((r) => [r.key, r.link === 'none' ? null : linkOf(r)]));
const delegateMap: Record<string, Delegate[]> = { [first.key]: delegates, [second.key]: delegates.slice(0, 1) };
const logs: Record<string, LogPage> = {
  [first.key]: { rows: logRows(14), live: 'up_to_date', hasOlder: true, archiveRows: 340 },
  [second.key]: { rows: logRows(5), live: 'up_to_date', hasOlder: false, archiveRows: 0 },
};
// The archive: Chief has two pages (the newest, then the one before message 101), Support has none.
const archived = (from: number, count: number): LogRow[] => logRows(count).map((r, i) => ({ ...r, seq: from + i }));
const archives: Record<string, LogPage> = {
  [`${first.key}|`]: { rows: archived(101, 6), live: 'up_to_date', hasOlder: true, archiveRows: 0 },
  [`${first.key}|101`]: { rows: archived(1, 4), live: 'up_to_date', hasOlder: false, archiveRows: 0 },
  [`${second.key}|`]: { rows: [], live: 'up_to_date', hasOlder: false, archiveRows: 0 },
};
const channelMap: Record<string, { channels: Channel[] }> = {
  [first.key]: { channels: channelList },
};

const ok = { outcome: 'done' } as const;
const mutations = {
  createBot: { ...ok, data: newBotDone },
  saveSettings: { ...ok },
  decideGate: { ...ok, data: { replayed: false } },
  stopTurn: { ...ok, data: { matched: true } },
  botAction: { ...ok },
  createLink: { ...ok, data: linkOf(first) },
  patchLink: { ...ok, data: linkOf(first) },
  panic: { ...ok, data: linkOf(first, { status: 'disabled', ownerEnabled: false, keys: [] }) },
  repoint: { ...ok, data: linkOf(first) },
  mintKey: { ...ok, data: minted },
  rotateKey: { ...ok, data: minted },
  keyChange: { ...ok },
  keyRevokeAll: { ...ok, data: { revoked: 3 } },
  stopDelegate: { ...ok },
  sendMessage: { ...ok, data: { queued: false } },
  say: { ...ok, data: { messageId: 'msg-fx-1', state: 'posted', turnId: 'turn-7f3a' } },
  loadOlder: { ...ok, data: { rows: logRows(8).map((r, i) => ({ ...r, seq: 50 + i })), hasOlder: false } },
  channelChange: { ...ok, data: { issued: true, demo: { code: '4F7K-92QX', expiresAt: 0 } } },
  channelsPause: { ...ok },
} as const;

const audioModels: AudioModel[] = [
  { id: 'hoody-ai/hoody-stt', capabilities: ['stt'], languages: [], available: true, reason: '' },
  { id: 'hoody-ai/hoody-tts', capabilities: ['tts'], languages: [], available: true, reason: '' },
  { id: 'openai/gpt-4o-transcribe', capabilities: ['stt'], languages: ['en', 'pt', 'es'], available: true, reason: '' },
  { id: 'openai/gpt-4o-mini-tts', capabilities: ['tts'], languages: ['en'], available: true, reason: '' },
  { id: 'acme/speech-turbo', capabilities: ['tts'], languages: ['en', 'zh'], available: false, reason: 'no_credentials' },
];
const voices: Voice[] = [
  { id: 'alloy', languages: ['en'] },
  { id: 'nova', languages: ['en'] },
  { id: 'verse', languages: ['en'] },
];
const voiceReady: VoiceCheck = {
  ready: true,
  stt: { ok: true, model: 'hoody-ai/hoody-stt', voice: '', code: '', reason: '', message: '', retryable: null },
  tts: { ok: true, model: 'hoody-ai/hoody-tts', voice: 'alloy', code: '', reason: '', message: '', retryable: null },
};
const voiceBroken: VoiceCheck = {
  ready: false,
  stt: voiceReady.stt,
  tts: { ok: false, model: 'acme/speech-turbo', voice: '', code: 'speech_unavailable', reason: 'no_credentials', message: 'The speaking model has no credentials on this computer.', retryable: false },
};
const ownVoice: SpeechConfig = {
  raw: { stt_model: 'openai/gpt-4o-transcribe', tts_model: 'openai/gpt-4o-mini-tts', voice: 'nova', language: 'en', speed: 1.1, speak_wakes: false, speak_gates: true, stt_prompt: 'Hoody, Bot', limits: { tts_chars: 50000 } },
  sttModel: 'openai/gpt-4o-transcribe',
  ttsModel: 'openai/gpt-4o-mini-tts',
  voice: 'nova',
  language: 'en',
  speed: 1.1,
  speakWakes: false,
  speakGates: true,
};

/** Settings > Helpers: the realm's agents (general is the AI helper, on Hoody Fast) and Claude Code's models on the Bot's computer. */
const helperAgents: HelperAgents = {
  helperModel: 'hoody-ai/hoody-fast',
  botModel: '',
  agents: [
    { name: 'general', model: 'hoody-ai/hoody-fast' },
    { name: 'research', model: 'openai/gpt-5' },
    { name: 'writer', model: '' },
  ],
};
const claudeSet: agent.ClaudeSet = {
  state: 'ready',
  models: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'sonnet', label: 'sonnet' },
  ],
  efforts: ['low', 'medium', 'high'],
};

const base = {
  rules: providerRules,
  helperAgents: { data: helperAgents },
  claudeSet: { data: claudeSet },
  audioTts: { data: audioModels },
  audioStt: { data: audioModels },
  audioVoices: { data: voices },
  voiceCheck: { data: voiceReady },
  computers: { data: computers },
  realms: { data: realms },
  bots: { data: rows },
  models: { data: models },
  linkOffer: { data: offer },
  myIp: { data: { ip: '203.0.113.57', version: 4 as const, city: 'Lisbon', region: 'Lisbon', country: 'PT', timezone: 'Europe/Lisbon', network: { asn: 'AS64500', name: 'Example Net' } } },
  view: { data: views },
  link: { data: links },
  delegates: { data: delegateMap },
  log: { data: logs },
  archive: { data: archives },
  channels: { data: channelMap },
  // One page of finished tasks (under fixtures every page asked for answers with this one) and the agent's count of them.
  delegatesFinished: { data: { [first.key]: delegates.filter((d) => d.state === 'closed') } },
  delegatesClosedCount: { data: { [first.key]: delegates.filter((d) => d.state === 'closed').length } },
  delegatesClosedProof: { data: { ['closed:' + first.key]: delegates.filter((d) => d.state === 'closed') } },
  channelSettings: { data: { [first.key]: channelSettings } },
  channelSetup: { data: { [first.key]: telegramSetup } },
  ...mutations,
} as const;

/** A row as data.ts rowOf builds it from the Bot that viewOf also reads: the fields they share. */
const rowFromView = (r: BotRow, v: BotView): BotRow => ({ ...r, name: v.name, role: v.role, uid: v.uid, model: v.model, modelLabel: v.modelLabel, queued: v.queued, status: statusOf(v) });

/** The list with the first Bot's row built from its page's view: the agent builds both from one Bot. */
const listFor = (v: BotView) => ({ bots: { data: rows.map((r) => (r === first ? rowFromView(r, v) : r)) } });

/** The view of the first Bot with changes, for the Bot states; its list row says the same. */
function withFirst(over: Partial<BotView>) {
  const v = viewOf(first, over);
  return { ...base, ...listFor(v), view: { data: { ...views, [first.key]: v } } };
}

/** Chief with nothing waiting: the quiet Bot page, and its list row idle. */
const quietView = viewOf(first, { turnRunning: false, turnId: null, sessionModel: null });
const quiet = { ...listFor(quietView), view: { data: { ...views, [first.key]: quietView } } };

/** Digest and Notes with three- and four-digit queues; their pages (manyQueued's views, one per changed row) read the same counts. */
// 120 and 4321 show the short form; 99, the longest full form, shows whole.
const manyQueuedRows = rows.map((r) =>
  r.id === 'digest' ? { ...r, queued: 120 } : r.id === 'notes' ? { ...r, status: 'queued' as const, queued: 4321 } : r.id === 'relay' ? { ...r, status: 'queued' as const, queued: 99 } : r,
);

function withLink(link: BotLink | null) {
  return { ...base, ...quiet, link: { data: { ...links, [first.key]: link } } };
}


const noRunningState = {
  ...base,
  computers: { data: computers.map((c) => ({ ...c, state: 'stopped' as const, hasMore: false, suspended: 0 })) },
  bots: { data: [] as BotRow[] },
};

/** States no current agent sends, kept because they guard a screen an older or a future agent reaches (fixtures.truth.test.ts):
 *  needsKey: the Bot view carries no provider readiness today (data.ts reads it as unknown), so the model's Fix never shows live;
 *    it also carries a model/provider attention data.ts never derives (attention comes only from chat apps);
 *  needsKeyChatsPausedBot: needsKey with a chat app's line beside it, while the apps are paused;
 *  noExpect: an agent older than the bot_expect capability (the Hub reads every capability as present today);
 *  newBotKeyLost, newBotNameTaken: createBotFlow (data.ts) never returns keylost or nametaken (its live twins are keyunknown and
 *    exists); kept for the drawer's two texts. */
export const FIXTURE_ONLY_STATES = ['needsKey', 'needsKeyChatsPausedBot', 'noExpect', 'newBotKeyLost', 'newBotNameTaken'] as const;

export default defineFixtures({
  default: 'many',
  states: {
    many: base,
    // The rail spec's states (kit/layouts/railgrid.spec.ts): paused computers' notices, and names too long for a rail.
    railPaused: (() => {
      const cs = [
        { ...(computers[0] as Computer), id: 'c-atlas', name: 'sunny-red-lemur', suspended: 2 },
        { ...(computers[2] as Computer), id: 'c-cinder', name: 'daring-mint-walrus', hasMore: false },
        { ...(computers[1] as Computer), id: 'c-boreal', name: 'glad-silver-falcon', state: 'running' as const, suspended: 1 },
      ];
      const pick = rows.filter((r) => r.id === 'chief' || r.id === 'scout').map((r) => ({ ...r, name: r.id === 'chief' ? 'bright-crimson-lynx' : 'Chief', status: 'idle' as const }));
      return { ...base, computers: { data: cs }, bots: { data: pick }, view: { data: { ...views, ...Object.fromEntries(pick.map((r) => [r.key, viewOf(r)])) } } };
    })(),
    railLong: (() => {
      const nm = 'a-computer-name-that-goes-on-and-on-and-on-to-sixty-three-chars';
      const cs = [
        { ...(computers[0] as Computer), name: nm, suspended: 12, hasMore: true },
        { ...(computers[2] as Computer), name: 'cinder-production-worker-eu-central-01', listState: 'failed' as const, hasMore: false },
      ];
      // cinder's list failed: no Bot of it was read (data.ts useBots).
      const pick = rows
        .slice(0, 8)
        .map((r, i) => (i % 2 ? r : { ...r, name: `${r.name} with a very long Bot name that keeps going past the rail edge` }))
        .filter((r) => r.computerId !== 'c-cinder');
      return { ...base, computers: { data: cs }, bots: { data: pick }, view: { data: { ...views, ...Object.fromEntries(pick.map((r) => [r.key, { ...views[r.key]!, name: r.name }])) } } };
    })(),
    // Bots on one computer: only atlas has Bots and no computer has a note, so the list does not group by computer and draws its
    // Computer column (hidden once the Bots span computers). table.fit.test, page.spec.
    oneComputer: { ...base, computers: { data: computers.map((c) => ({ ...c, hasMore: false })) }, bots: { data: rows.filter((r) => r.computerId === 'c-atlas') } },
    // The same with a computer name that fits a 180 px column but not 166 px: the link ends in an ellipsis inside its cell.
    longComputer: {
      ...base,
      computers: { data: computers.map((c) => (c.id === 'c-atlas' ? { ...c, name: 'production-worker-01' } : { ...c, hasMore: false })) },
      bots: { data: rows.filter((r) => r.computerId === 'c-atlas') },
    },
    railOne: { ...base, computers: { data: [computers[0] as Computer] }, bots: { data: rows.filter((r) => r.id === 'chief') } },
    railGroups: (() => {
      const cs = Array.from({ length: 7 }, (_, i) => ({ ...(computers[0] as Computer), id: i === 0 ? 'c-atlas' : `c-g${i}`, name: i === 0 ? 'atlas' : `computer-${i}`, suspended: i === 2 ? 1 : 0 }));
      const moved = rows.slice(0, 21).map((r, i) => ({ from: r.key, row: { ...r, computerId: cs[i % 7]!.id, key: botKey(cs[i % 7]!.id, r.realm, r.id) } }));
      const pick = moved.map((m) => m.row);
      // Each moved Bot's page sits under its new key (the agent reads a Bot by its computer).
      return { ...base, computers: { data: cs }, bots: { data: pick }, view: { data: { ...views, ...Object.fromEntries(moved.map((m) => [m.row.key, { ...views[m.from]!, key: m.row.key }])) } } };
    })(),
    noComputer: { ...base, computers: { data: [] as Computer[] }, bots: { data: [] as BotRow[] } },
    // Computer colours (core worldColours): atlas blue; cinder takes cedar's value, which is not a hex colour (no mark).
    colours: { ...base, computers: { data: computers.map((c) => (c.id === 'c-atlas' ? { ...c, color: worldColours.atlas } : c.id === 'c-cinder' ? { ...c, color: worldColours.cedar } : c)) } },
    // An empty list has nothing past it: no computer reads "more than listed" (meta.total is 0).
    empty: { ...base, bots: { data: [] as BotRow[] }, computers: { data: computers.map((c) => ({ ...c, hasMore: false })) } },
    // Two of atlas's Bots are paused after a sign-in change: the list notice with its Resume button.
    suspendedNotice: { ...base, computers: { data: computers.map((c) => (c.id === 'c-atlas' ? { ...c, suspended: 2 } : c)) } },
    // atlas has two notes in one notice (more Bots than listed, and 2 paused): Resume still ends the notice.
    // A running computer with every Bot paused and none listed: the table draws its empty state, the notes stay above it.
    suspendedNoBots: { ...base, bots: { data: [] as BotRow[] }, computers: { data: computers.map((c) => (c.id === 'c-atlas' ? { ...c, suspended: 2, hasMore: false } : { ...c, hasMore: false })) } },
    suspendedCombined: { ...base, computers: { data: computers.map((c) => (c.id === 'c-atlas' ? { ...c, suspended: 2, hasMore: true } : c)) } },
    noRunning: {
      ...base,
      computers: { data: computers.map((c) => ({ ...c, state: 'stopped' as const, hasMore: false, suspended: 0 })) },
      bots: { data: [] as BotRow[] },
    },
    // No computer running, one with a long name: the Start column holds the chip button whatever the name.
    noRunningLong: { ...noRunningState, computers: { data: noRunningState.computers.data.map((c) => (c.id === 'c-atlas' ? { ...c, name: 'production-worker-eu-central-01' } : c)) } },
    // The start of a stopped computer got no answer (a 5xx): the change stays held, the page never resends it.
    startUnknown: { ...noRunningState, rules: [...providerRules, ...lifecycleFixtures.unknown] },
    partial: {
      ...base,
      computers: {
        data: [
          computers[0] as Computer,
          { ...(computers[1] as Computer), state: 'starting' as const },
          { ...(computers[2] as Computer), listState: 'failed' as const, hasMore: false },
        ],
      },
      bots: { data: rows.filter((r) => r.computerId !== 'c-cinder') },
    },
    error: { ...base, computers: { error: 'server' as const }, bots: { error: 'server' as const } },
    pending: { ...base, bots: { pending: true as const }, computers: { pending: true as const } },
    // Bot page states
    waitingApprove: withFirst({ gate: confirmGate, attention: [] }),
    waitingAnswer: withFirst({ gate: { ...confirmGate, id: 'gate-2', type: 'question', summary: 'Which branch should I deploy from: main or release?', tool: null, advanced: null } }),
    gateRecovery: { ...withFirst({ gate: confirmGate }), decideGate: { outcome: 'pending' as const } },
    idle: { ...base, ...quiet },
    working: withFirst({ turnRunning: true, turnId: 'turn-7f3a', tasksOpen: 2, queued: 1 }),
    // Paused at its limit once the turn that spent the last unit has ended (the agent's refusal comes after it).
    paused: withFirst({ pausedAtLimit: true, autonomy: { used: 20, max: 20 }, turnRunning: false, turnId: null, sessionModel: null }),
    // Three- and four-digit queues, for the list's status column (it shows the short form, the full count stays).
    manyQueued: { ...base, bots: { data: manyQueuedRows }, view: { data: { ...views, ...Object.fromEntries(manyQueuedRows.filter((r, i) => r !== rows[i]).map((r) => [r.key, viewOf(r)])) } } },
    // The Bot's only attention is a chat app (no gate), so the header's Fix is the primary button.
    chatAppAttention: withFirst({ gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }] }),
    // Two groups ask the first Bot's Telegram app to be let in, whose privacy is on; one approved group it cannot read.
    chatsWaiting: {
      ...withFirst({ gate: null, attention: [{ row: 'channels', key: 'chatwait' }], turnRunning: false, turnId: null, sessionModel: null }),
      bots: { data: rows.map((r) => (r === first ? { ...r, status: 'idle' as const, chatsWaiting: 2, privacyOn: true } : r)) },
      channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, chatRows: c.chatRows.map((x) => (x.id === 'cht-support' ? { ...x, canRead: false } : x)) } : c)) } } },
    },
    needsKey: withFirst({ provider: { id: 'openai', label: 'openai', ready: 'needs_key' }, model: 'openai/gpt-5', modelLabel: specLabel('openai/gpt-5'), attention: [{ row: 'model', key: 'provider' }] }),
    // The first Bot follows the AI page (no model of its own). The agents read names no Bots pin, so it answers with
    // the bot agent's shipped Hoody Free; with the agents read failed the Hub cannot tell which, and says the Bots default.
    // One state builds both the page and its list row (withFirst → listFor), so they agree on every field.
    followsAiPage: withFirst({ model: '', modelLabel: 'Bots default (AI page)', provider: { id: '', label: '', ready: 'unknown' } }),
    followsAiPageUnread: { ...withFirst({ model: '', modelLabel: 'Bots default (AI page)', provider: { id: '', label: '', ready: 'unknown' } }), helperAgents: { error: 'server' as const } },
    voiceOwn: withFirst({ speech: { enabled: true, ready: null, why: null, config: ownVoice } }),
    voiceBroken: { ...base, voiceCheck: { data: voiceBroken } },
    voiceCheckLost: { ...base, voiceCheck: { error: 'server' as const } },
    voiceModelsLost: { ...base, audioTts: { error: 'server' as const }, audioStt: { error: 'server' as const } },
    voiceSaveRefused: { ...withFirst({ speech: { enabled: true, ready: null, why: null, config: ownVoice } }), saveSettings: { outcome: 'failed' as const, code: 'model_unavailable' } },
    workersClaude: withFirst({ workers: { known: true, backend: 'acp', allowed: ['llm', 'acp'], agent: 'claude', model: 'claude-sonnet-5-5' } }),
    // Routing per task, two agents allowed, Claude Code allowed too.
    workersRouting: withFirst({
      workers: { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: '' },
      routing: 'auto',
      routingSet: { mode: 'auto', light: { model: 'hoody-ai/hoody-free', thinking: '' }, heavy: { model: 'openai/gpt-5', thinking: 'high' } },
      allowedAgents: ['research', 'writer'],
    }),
    workersOld: withFirst({ workers: { known: false, backend: 'llm', allowed: ['llm'], agent: '', model: '' } }),
    workersRefused: { ...withFirst({ workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' } }), saveSettings: { outcome: 'failed' as const, code: 'model_unavailable' } },
    // The first Bot's conversation in markdown.
    markdown: { ...withFirst({ gate: null, attention: [] }), log: { data: { ...logs, [first.key]: { rows: markdownRows, live: 'up_to_date' as const, hasOlder: false, archiveRows: 0 } } } },
    noExpect: withFirst({ caps: { botExpect: false, botGateHttp: false, botTurnCancel: false } }),
    autoApprove: withFirst({ yolo: true }),
    // Link states
    noLink: withLink(null),
    // The addresses read has not answered, or failed: no row can say whether its Bot has an address.
    linkReadPending: { ...base, ...quiet, link: { pending: true as const } },
    linkReadFailed: { ...base, ...quiet, link: { error: 'server' as const } },
    // Delete Bot stopped at its link (data.ts deleteBotFlow): only the project's owner may remove it, so the Bot stays.
    deleteLinkOwnerOnly: { ...base, botAction: { outcome: 'failed' as const, code: 'BOT_LINK_OWNER_ONLY' } },
    linkPropagating: withLink(linkOf(first, { propagation: { state: 'pending', pending: 2, failed: 0, succeeded: 1, targets: 3 } })),
    // A link the server made at 8 o'clock UTC (tests set the clock just after it).
    linkFresh: withLink(linkOf(first, { createdAt: '2026-10-25T08:00:00.000Z' })),
    linkFrozen: withLink(linkOf(first, { status: 'frozen', statusReason: 'The account has an unpaid balance.' })),
    linkOff: withLink(linkOf(first, { status: 'disabled', ownerEnabled: false })),
    // The suggestion carries no zone: it is read from the address of a link that exists, or unknown before the first link.
    noModels: { ...base, rules: providerRulesFor([]), models: { data: [] as ModelRow[] } },
    manyModels: { ...base, rules: providerRulesFor(manyModels), models: { data: manyModels } },
    // The computer's agent is slow to answer: the chooser waits, then shows the real list.
    modelsSlow: { ...base, rules: providerRulesFor(models, 20000) },
    modelsSoon: { ...base, rules: providerRulesFor(models, 3000) },
    models7k: (() => {
      const m = models7kRules();
      return { ...base, rules: m.rules, models: { data: m.data } };
    })(),
    zoneFromLink: { ...base, linkOffer: { data: { ...offer, zone: '' } } },
    zoneOtherDomain: {
      ...base,
      link: { data: Object.fromEntries(rows.map((r) => [r.key, r.link === 'none' ? null : { ...linkOf(r), url: `https://${r.id}-shop-bot.pals.example.test` }])) },
      linkOffer: { data: { ...offer, zone: '' } },
    },
    newBotModelRefused: { ...base, createBot: { outcome: 'failed' as const, code: 'model_unavailable' } },
    myIpV6: { ...base, myIp: { data: { ip: '2001:db8::7', version: 6 as const, country: 'PT', city: 'Porto' } } },
    zoneUnknown: { ...base, link: { data: Object.fromEntries(Object.keys(links).map((k) => [k, null])) }, linkOffer: { data: { ...offer, zone: '' } } },
    linkNoZone: { ...withLink(linkOf(first, { url: '' })), linkOffer: { data: { ...offer, door: 'unavailable' as const, zone: '' } } },
    keyLost: { ...base, ...quiet, rotateKey: { outcome: 'pending' as const } },
    noKeys: withLink(linkOf(first, { keys: [] })),
    // An answer that carried no key list (data.ts linkOf: keysKnown false): the keys are unknown, not none.
    keysUnknown: withLink(linkOf(first, { keys: [], keysKnown: false })),
    // A link with its own call limits (the glance says them, not the 60 / 120 defaults).
    linkLimits: withLink(linkOf(first, { limits: { key_rpm: 30, bot_rpm: 90 } })),
    // A first link whose create was refused, or got no answer (the page stays on the drawer).
    linkCreateFailed: { ...withLink(null), createLink: { outcome: 'failed' as const, code: 'url_create_failed' } },
    linkCreateUnknown: { ...withLink(null), createLink: { outcome: 'pending' as const } },
    // A first link whose create answers late (done after 600 ms): what the person does meanwhile must stand.
    linkCreateSlow: { ...withLink(linkOf(first, { keys: [] })), createLink: { outcome: 'done' as const, data: linkOf(first, { keys: [] }), delayMs: 600 } },
    revokeAllUnknown: { ...base, ...quiet, keyRevokeAll: { outcome: 'pending' as const } },
    keysFull: withLink(linkOf(first, { keys: Array.from({ length: 20 }, (_, i) => keyOf(`kfull${String(i).padStart(7, '0')}`, `key ${i + 1}`)) })),
    // Activity, work, chat apps
    reconnecting: { ...base, ...quiet, log: { data: { ...logs, [first.key]: { ...(logs[first.key] as LogPage), live: 'reconnecting' as const } } } },
    noStream: { ...base, ...quiet, log: { data: { ...logs, [first.key]: { ...(logs[first.key] as LogPage), live: 'no_stream' as const } } } },
    logEmpty: { ...base, ...quiet, log: { data: { ...logs, [first.key]: { rows: [], live: 'up_to_date' as const, hasOlder: false, archiveRows: 0 } } } },
    logError: { ...base, ...quiet, log: { error: 'server' as const } },
    stopUnknown: { ...base, ...quiet, stopDelegate: { outcome: 'pending' as const } },
    stopFailed: { ...base, ...quiet, stopDelegate: { outcome: 'failed' as const, code: 'stop_failed' } },
    stopNotSent: { ...base, ...quiet, stopDelegate: { outcome: 'not_sent' as const, code: 'READ_BACK_FIRST' } },
    noChannels: { ...base, ...quiet, channels: { data: { [first.key]: { channels: [] } } } },
    channelsPaused: { ...base, ...quiet, channels: { data: { [first.key]: { channels: channelList.map((c) => ({ ...c, state: 'paused' as const, enabled: false })) } } }, channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } } },
    // The Bot has its chat apps paused while the list still reads them as running (the apps' own state follows later).
    channelsPausedBot: { ...base, ...quiet, channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } } },
    // The Bot's view still says a chat app needs a fix (a group waiting, no owner) while its channel settings
    // already say the apps are paused (one refetch after the pause, or a second writer until the poll): a paused app asks nothing.
    chatsWaitingPausedBot: {
      ...withFirst({ gate: null, attention: [{ row: 'channels', key: 'chatwait' }], turnRunning: false, turnId: null, sessionModel: null }),
      bots: { data: rows.map((r) => (r === first ? { ...r, status: 'idle' as const, chatsWaiting: 2, privacyOn: true } : r)) },
      channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } },
    },
    // Both of the chat apps' lines at once (an app with no owner, and a group waiting), while the apps are paused: neither may leave a Fix.
    chatAppsBothPausedBot: {
      ...withFirst({ gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }, { row: 'channels', key: 'chatwait' }], turnRunning: false, turnId: null, sessionModel: null }),
      bots: { data: rows.map((r) => (r === first ? { ...r, status: 'idle' as const, chatsWaiting: 2, privacyOn: true } : r)) },
      channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } },
    },
    // The model needs a key as well: pausing the apps takes only the chat apps' line away, the Fix to the settings stays.
    needsKeyChatsPausedBot: {
      ...withFirst({ gate: null, provider: { id: 'openai', label: 'openai', ready: 'needs_key' }, model: 'openai/gpt-5', modelLabel: specLabel('openai/gpt-5'), attention: [{ row: 'model', key: 'provider' }, { row: 'channels', key: 'chatwait' }], turnRunning: false, turnId: null, sessionModel: null }),
      bots: { data: rows.map((r) => (r === first ? { ...r, status: 'idle' as const, chatsWaiting: 2, privacyOn: true, model: 'openai/gpt-5', modelLabel: specLabel('openai/gpt-5') } : r)) },
      channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } },
    },
    chatAppAttentionPausedBot: {
      ...withFirst({ gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }], turnRunning: false, turnId: null, sessionModel: null }),
      channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } },
    },
    noChannelsPaused: { ...base, ...quiet, channels: { data: { [first.key]: { channels: [] } } }, channelSettings: { data: { [first.key]: { ...channelSettings, paused: true } } } },
    pauseUnknown: { ...base, ...quiet, channelsPause: { outcome: 'pending' as const } },
    // New Bot flow outcomes
    newBotUnknown: { ...base, createBot: { outcome: 'pending' as const } },
    newBotNameTaken: { ...base, createBot: { outcome: 'done' as const, data: { ...newBotDone, state: 'nametaken' as const, secret: null } } },
    newBotNoLink: { ...base, createBot: { outcome: 'done' as const, data: { ...newBotDone, link: null, secret: null } } },
    newBotKeyLost: { ...base, createBot: { outcome: 'done' as const, data: { ...newBotDone, state: 'keylost' as const, secret: null } } },
    channelChangeFailed: { ...base, channelChange: { outcome: 'failed' as const, code: 'channel_failed' } },
    noFinished: { ...base, ...quiet, delegates: { data: { ...delegateMap, [first.key]: openTasks } }, delegatesFinished: { data: { [first.key]: [] } }, delegatesClosedCount: { data: { [first.key]: 0 } } },
    // The open list holds only open tasks (it may be cut); the count and the pages of finished ones come from their own reads.
    manyFinished: { ...base, ...quiet, delegates: { data: { ...delegateMap, [first.key]: openTasks } }, delegatesFinished: { data: { [first.key]: manyClosed.slice(15, 25) } }, delegatesClosedCount: { data: { [first.key]: 25 } } },
    // A count the page cannot read (the open tasks stay as in the base state): the button still offers the finished tasks, without a number.
    finishedCountLost: { ...base, ...quiet, delegatesClosedCount: { error: 'server' as const } },
    channelSetupSlack: { ...base, channelSetup: { data: { [first.key]: slackSetup } } },
    channelSetupUnavailable: { ...base, channelSetup: { data: { [first.key]: { ...telegramSetup, available: false } } } },
    // The agent-side hold refused the press before sending it (another change of the app is still being read back).
    channelChangeNotSent: { ...base, channelChange: { outcome: 'not_sent' as const, code: 'READ_BACK_FIRST' } },
    channelChangePending: { ...base, channelChange: { outcome: 'pending' as const } },
    // Two Bots with chat apps read: a draft opened on one must not follow the person to the other.
    channelsBoth: { ...base, channels: { data: { [first.key]: { channels: channelList }, [second.key]: { channels: channelList } } }, channelSettings: { data: { [first.key]: channelSettings, [second.key]: channelSettings } } },
    // A chat app that has people but no owner, with direct messages on the pairing policy: the agent does not flag it
    // needs_owner, yet its first owner can only pair with an owner code (redeemed under the owner and pairing policies).
    channelOwnerless: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, principals: c.principals.map((p) => ({ ...p, owner: false })), view: settingsView({ dm_policy: 'pairing' }) } : c)) } } } },
    // The same, with direct messages open to anyone: the agent never redeems an owner code under that policy.
    channelOwnerlessOpen: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, principals: c.principals.map((p) => ({ ...p, owner: false })), view: settingsView({ dm_policy: 'open' }) } : c)) } } } },
    // Direct messages take invite codes only under the pairing policy: this app has it (the base app is owner-only).
    channelPairing: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, view: settingsView({ gate_deciders: 'named', push_events: ['report', 'gate'], dm_policy: 'pairing' }, 'cht-support') } : c)) } } } },
    // Telegram refuses to connect while the bot has a webhook set: the agent's conflict state.
    channelWebhook: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, state: 'stopped' as const, reason: 'webhook_set' } : c)) } } } },
    newBotFailed: { ...base, createBot: { outcome: 'failed' as const, code: 'bot_exists' } },
    // A group sent /bind and waits for the owner's approval: the Telegram app also has privacy mode on (its note).
    channelGroupAsks: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, chats: 3, chatRows: [...c.chatRows, { id: 'cht-test', platformChat: '-100777', kind: 'group' as const, title: 'testgroup', state: 'requested', view: chatView() }] } : c)) } } } },
    // The group steps follow the app's group access (open: a requested group is already read; off; allowlist).
    channelGroupOpen: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, chats: 3, view: settingsView({ gate_deciders: 'named', push_events: ['report', 'gate'], group_mode: 'open' }, 'cht-support'), chatRows: [...c.chatRows, { id: 'cht-test', platformChat: '-100777', kind: 'group' as const, title: 'testgroup', state: 'requested', view: chatView() }] } : c)) } } } },
    channelGroupsOff: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-sl' ? { ...c, view: settingsView({ command_prefix: '!', group_mode: 'off' }) } : c)) } } } },
    // A group access value this page does not know (a newer agent): the steps make no claim.
    channelGroupModeUnknown: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, chats: 3, view: settingsView({ gate_deciders: 'named', push_events: ['report', 'gate'], group_mode: 'members_vote' }, 'cht-support'), chatRows: [...c.chatRows, { id: 'cht-test', platformChat: '-100777', kind: 'group' as const, title: 'testgroup', state: 'requested', view: chatView() }] } : c)) } } } },
    channelGroupAllowlist: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-sl' ? { ...c, view: settingsView({ command_prefix: '!', group_mode: 'allowlist' }) } : c)) } } } },
    // The agent sent no privacy note: privacy may be off, or never checked (the step stays unknown).
    channelPrivacyUnknown: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, notes: [] } : c)) } } } },
    // Mentions only off while Telegram privacy is on: Telegram still passes only commands and replies.
    channelMentionAllPrivacy: { ...base, channels: { data: { [first.key]: { channels: channelList.map((c) => (c.id === 'ch-tg' ? { ...c, view: settingsView({ gate_deciders: 'named', push_events: ['report', 'gate'], mention_only: false }, 'cht-support') } : c)) } } } },
  },
});
