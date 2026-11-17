// Fake-API states of the ai page for hub:dev, hub:shots, tests and specs.
// The key, the fingerprint and every id here are fake. States:
//   default (Hoody Free + a connected OpenAI key), empty (Hoody AI only), loading, error, partial
//   (some sections fail), pending (changes "may have gone through"), failed (changes refused),
//   limited (a shared-access session: reads work, changes are refused), long (long names),
//   many (many providers/models/rows), needsKey (the default model's account has no key),
//   claude (Claude Code states), echo (the agent already shows what a read-back looks for), external (a key set
//   outside Hoody), endpointKey / endpointReading / endpointReadFailed / endpointChanged (a custom endpoint's key step:
//   its definition revision read, still reading, read without a revision, and a save answered definition_changed),
//   catalogue7k (the real chat catalogue's size: 206 providers, 7,078 models, only Hoody Free ready), readyLost (the
//   ready list fails: nothing can be proven ready; switched to mid-flow, it makes a pick unknown before Confirm).
import { agent, answers, fixtureAgentKnows, fixtureAgentYolo, fixtureWorld, manyNames, reply, type FixtureRequest } from '@core';
import { defineFixtures, type FixtureState, type MutationAnswer, type QueryAnswer } from '@app/fixtures';
import { loadCatalogue7k } from '@kit';
import { agentRules, loopRules, runRules, safetyRules, todoRules, workflowRules } from './autoFixtures';
import { skillRules, skillSeed, type SkillOpts } from './knowledge/skills/fixtures';
import { trustRules } from './knowledge/skills/fixtures.trust';
import { githubRules, mcpRules, type GitHubOpts, type SettingsSessions } from './settings/connections/fixtures';
import { featureRules, ruleHookRules } from './settings/rules/fixtures';
import { folderRules, repoRules } from './folders/fixtures';
import { instructionsRules, type InstructionsOpts } from './knowledge/instructions/fixtures';
import { memoryRules, type MemoryFixtureOpts } from './knowledge/memory/fixtures';
import { loopRoutes } from './auto/loops/data';
import { todoRoutes } from './auto/todos/data';
import { workflowRoutes } from './auto/workflows/data';
import { skillRoutes } from './knowledge/skills/routes';
import { chatRoutes } from './parts/data';
import { attachRules } from './parts/fixtures.attach';
import { urlRules } from './parts/fixtures.url';
import { shotRules } from './parts/fixtures.shot';
import { folderRoute, rootRoute } from '../files/fixtures.links';
import { chatRules, chatWorld, type ChatRuleOpts, type ChatWorld } from './parts/fixtures.chats';
import { routes } from './routes';
import { githubRoutes } from './settings/connections/routes';

const atlas = fixtureWorld.current;
// The chat computer's home folder for the composer's file pickers (From a computer…, an @ mention), in the files program's
// listing shape (`GET /api/v1/files/<path>`): a few folders and files a chat would attach; any other folder answers 404.
// The top folder is the other read (`GET /?json`, a DirectoryListing): the pickers walk down from it.

const HOME: Record<string, { dirs: string[]; files: [string, number][] }> = {
  '/home': { dirs: ['ada'], files: [] },
  '/home/ada': { dirs: ['projects', 'backups'], files: [['plan.md', 1_204], ['notes.txt', 3_310], ['screenshot.png', 482_113]] },
  '/home/ada/projects': { dirs: ['site'], files: [['README.md', 2_048]] },
};
const HOME_T0 = Math.floor(Date.parse('2026-11-10T09:00:00Z') / 1000);

/** The folder a request names, from its path after `/api/v1/files/`. */
const homePathOf = (r: FixtureRequest) => '/' + (r.path.split('?')[0] ?? '').split('/').slice(4).filter(Boolean).map(decodeURIComponent).join('/');

function homeFolderRules() {
  return [
    reply(rootRoute, (r: FixtureRequest) => (r.query.json === ''
      ? answers.ok({ breadcrumb: '', paths: [{ path_type: 'Dir', name: 'home', mtime: HOME_T0, size: 0 }], allow_upload: false, allow_delete: false })
      : answers.refused(404, 'NOT_FOUND'))),
    reply(folderRoute, (r: FixtureRequest) => {
      const path = homePathOf(r);
      const n = HOME[path];
      if (!n) return answers.refused(404, 'NOT_FOUND');
      const entries = [
        ...n.dirs.map((name, i) => ({ name, is_dir: true, size: 0, modified: HOME_T0 - i * 86_400, type: 'dir', mode: '755' })),
        ...n.files.map(([name, size], i) => ({ name, is_dir: false, size, modified: HOME_T0 - i * 3_600, type: 'file', mode: '644' })),
      ];
      return answers.ok({ path, count: entries.length, skipped: [], entries });
    }),
  ];
}

export const REALM_A = atlas.realm_ids[0] as string;
export const REALM_B = (fixtureWorld.realms[1] as { id: string }).id;
/** The key fingerprint the fixtures report for the stored OpenAI key: a fixed made-up value, derived from no key. */
export const FAKE_FP = '9f2c5a1d7e3b4086';
/** OpenRouter's sign-in page as the agent publishes it (the challenge here is fake). */
export const OR_AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=fixture-challenge&code_challenge_method=S256';

const ok = (data: unknown, delayMs?: number): QueryAnswer => ({ data, ...(delayMs !== undefined ? { delayMs } : {}) });
const err = (error: 'server' | 'network' | 'forbidden' | 'not_found' | 'bad_request'): QueryAnswer => ({ error });
const done = (data: unknown = {}): MutationAnswer => ({ outcome: 'done', data });
const pend = (code = 'network'): MutationAnswer => ({ outcome: 'pending', code });
const fail = (code: string, data?: unknown): MutationAnswer => ({ outcome: 'failed', code, ...(data !== undefined ? { data } : {}) });
// A key send takes a short while, as on the network: the step's busy render (which disables the key field and so takes
// its focus, prim/focus.ts dropDisabled) always commits before the answer. Answered at once, the race between that render
// and the answer decided whether the refused field showed its empty fill, and the shot frames flipped with machine load.
const SEND_MS = 50;
const sent = (a: MutationAnswer): MutationAnswer => ({ ...a, delayMs: SEND_MS });

const prov = (id: string, name: string, state: 'ready' | 'needs_key', via?: string, extra: Record<string, unknown> = {}) => ({
  id,
  prefix: `${id}/`,
  display_name: name,
  // How it connects, as the agent lists it (the provider directory's card words read it): Hoody AI is included.
  status: { state, ...(via ? { via } : {}), methods: via === 'included' ? [] : id === 'openai' ? ['api_key', 'signin'] : ['api_key'] },
  ...extra,
});
const mod = (spec: string, name: string, extra: Record<string, unknown> = {}) => ({ spec, display_name: name, ...extra });

const providersBase = [
  prov('hoody-ai', 'Hoody AI', 'ready', 'included'),
  prov('openai', 'OpenAI', 'ready', 'stored_key'),
  prov('anthropic', 'Anthropic', 'needs_key'),
  prov('google', 'Google Gemini', 'needs_key'),
  prov('openrouter', 'OpenRouter', 'needs_key', undefined, { status: { state: 'needs_key', methods: ['api_key', 'signin'] } }),
  prov('mimo', 'Xiaomi MiMo', 'needs_key'),
];
const modelsBase = [
  mod('hoody-ai/hoody-free', 'Hoody Free'),
  mod('hoody-ai/hoody-decide', 'Hoody safety checker'),
  mod('openai/gpt-5', 'GPT-5'),
  mod('openai/gpt-5-mini', 'GPT-5 mini'),
  mod('anthropic/claude-sonnet', 'Claude Sonnet'),
  mod('google/gemini-pro', 'Gemini Pro'),
  mod('mimo/mimo-v2', 'MiMo v2'),
  // The provider directory lists a provider by its models (the model picker): OpenRouter needs one to be offered.
  mod('openrouter/auto', 'OpenRouter Auto'),
  mod('fusion/duo', 'Duo ensemble', { source: 'fusion', members: ['hoody-ai/hoody-free', 'openai/gpt-5'] }),
];
/** The model picker's benchmark: the real chat catalogue (catalogue7k 'freeOnly'). */
const { catalogue7k, okBody } = await loadCatalogue7k();
// Built on first read of the catalogue7k state only: most files that load these fixtures never show it.
let state7k: { providers: QueryAnswer; models: QueryAnswer; ready: QueryAnswer } | undefined;
const parts7k = () => {
  if (state7k) return state7k;
  const reads7k = catalogue7k('freeOnly');
  return (state7k = { providers: ok(okBody(reads7k.providers)), models: ok(okBody(reads7k.models)), ready: ok(okBody(reads7k.ready)) });
};

const readyBase = [{ spec: 'hoody-ai/hoody-free' }, { spec: 'hoody-ai/hoody-decide' }, { spec: 'openai/gpt-5' }, { spec: 'openai/gpt-5-mini' }];

const agentsFree = { agents: [{ name: 'general', model: '', is_configured_default: true }, { name: 'bot', model: '' }, { name: 'reviewer', model: 'openai/gpt-5-mini' }] };
const worldBots = fixtureWorld.bots.filter((b) => b.computer === 'atlas').map((b, i) => ({ id: `b${i + 1}`, name: b.name, model: i === 1 ? 'openai/gpt-5' : '', realm: 'global' }));
const botsBase = { items: [...worldBots, { id: 'b9', name: 'night-watch', model: '', realm: 'global', guardrails: 'Never delete data.' }] };
const authBase = {
  'hoody-ai': { auth: { ready: true, no_auth_ready: true } },
  openai: { auth: { ready: true, api_key_stored: true, oauth_stored: false, default: 'api_key', api_key_fingerprint: FAKE_FP } },
  anthropic: { auth: { ready: false, api_key_stored: false } },
  google: { auth: { ready: false, api_key_stored: false } },
  openrouter: { auth: { ready: false, api_key_stored: false, oauth_stored: false } },
  mimo: { auth: { ready: false, api_key_stored: false } },
};
const providerBase = Object.fromEntries(providersBase.map((p) => [p.id, { provider: p }]));
// A custom endpoint that needs its key; `rev` is its definition revision (none: a read that cannot be trusted).
const endpointProv = prov('my-endpoint', 'My endpoint', 'needs_key', undefined, { custom: true });
const withEndpoint = (rev: string | null, readDelayMs?: number) => ({
  providers: ok({ providers: [...providersBase, endpointProv] }),
  provider: ok(
    { ...providerBase, 'my-endpoint': { provider: { ...endpointProv, ...(rev ? { definition_rev: rev } : {}), custom_definition: { base_url: 'https://llm.example.com/v1', wire_format: 'openai' } } } },
    readDelayMs,
  ),
});

// The gateway at the computer-binding contract (session protocol 3 + the four ask capabilities): the settings chat opens only on it.
const versionBase = { session_protocol_version: 3, capabilities: [...['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })), { name: 'provider_oauth_device', supported: true, available: true }, { name: 'jev_realm_settings', supported: true, available: true }, { name: 'acp_default', supported: true, available: true }] };

const claudeRow = (over: Record<string, unknown> = {}) => ({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ready', logged_in: 'logged_in', enabled: true, startable: true, login_verified: true, ...over }] } });

const spendRows = {
  rollup: [
    { Model: 'hoody-ai/hoody-free', Provider: 'hoody-ai', Calls: 412, SuccessRate: 0.99, TotalCostUSD: 0 },
    { Model: 'openai/gpt-5', Provider: 'openai', Calls: 63, SuccessRate: 0.97, TotalCostUSD: 4.82 },
    { Model: 'openai/gpt-5-mini', Provider: 'openai', Calls: 130, SuccessRate: 1, TotalCostUSD: 0.004 },
    { Model: 'openai/gpt-4-turbo', Provider: 'openai', Calls: 3, SuccessRate: 0.66, TotalCostUSD: 0.11 },
    { Model: 'openai/gpt-3.5-turbo', Provider: 'openai', Calls: 9, SuccessRate: 1, TotalCostUSD: 0 },
  ],
};
// 30 days shows fewer models than 7 days here, so a period change (and a reload that keeps it) is observable.
const spendAll = { d7: spendRows, d30: { rollup: spendRows.rollup.slice(0, 2) }, all: spendRows };
const spendNone = { d7: { rollup: [] }, d30: { rollup: [] }, all: { rollup: [] } };

const computer = { id: atlas.id, name: atlas.name, realmIds: [...atlas.realm_ids], selectedRealm: null };

const chk = { effective: { enabled: true, usable: true, key_ready: true, model: 'hoody-ai/hoody-decide' } };
const jevModels = { models: [{ spec: 'hoody-ai/hoody-decide', display_name: 'Hoody safety checker', key_set: true }, { spec: 'openai/gpt-5-mini', display_name: 'GPT-5 mini', key_set: true }] };

const terminal = {
  termCaps: done({ ok: true }),
  termSessions: done({ items: [] }),
  termCreate: done({ status: 'ok', terminal_id: '15001', incarnation: 'inc-1' }),
  termWait: done({}),
  termWrite: done({}),
  termDelete: done({}),
};

const writesDone = {
  keyPut: done({ check: 'valid' }),
  keyDelete: done(),
  authTest: done({ check: 'valid' }),
  authDefault: done(),
  oauthStart: done({ job_id: 'job-1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' }),
  oauthCancel: done({ state: 'cancelled' }),
  pkceStart: done({ job_id: 'job-or-1', verification_uri: OR_AUTH }),
  pkceCode: done({ submitted: true }),
  pkceCancel: done({ state: 'cancelled' }),
  signOut: done(),
  customCreate: done({ provider: { id: 'my-endpoint' } }),
  customPatch: done(),
  customDelete: done(),
  agentModel: done(),
  agentEffort: done(),
  acpEnabled: done(),
  acpDefaultPut: done(),
  jevPut: done(),
  ...terminal,
} satisfies FixtureState;

// The account's Hoody AI allowance as the page reads it (data.ts `allowance`): a free server part used, a paid one with a
// lane at its limit, and one whose reading is unavailable.
const at = (h: number) => new Date(Date.UTC(2026, 10, 11, h, 0, 0)).toISOString();
const allowance = {
  servers: [
    { id: '64f0a1b2c3d4e5f6a7b8c9d0', name: 'atlas', ok: true, lanes: [
      { lane: 'chat', off: false, pct: 30, resets: at(18) }, { lane: 'decisions', off: false, pct: 10, resets: null },
      { lane: 'search', off: false, pct: 0, resets: null }, { lane: 'speech', off: true, pct: null, resets: null },
      { lane: 'transcription', off: false, pct: null, resets: null },
    ] },
    { id: '64f0a1b2c3d4e5f6a7b8c9d1', name: 'build-box', ok: true, lanes: [
      { lane: 'chat', off: false, pct: 100, resets: at(20) }, { lane: 'decisions', off: false, pct: 80, resets: at(19) },
      { lane: 'search', off: false, pct: 50, resets: null }, { lane: 'speech', off: false, pct: 0, resets: null },
      { lane: 'transcription', off: false, pct: 20, resets: null },
    ] },
    { id: '64f0a1b2c3d4e5f6a7b8c9d2', name: 'spare', ok: false, lanes: [] },
  ],
  truncated: false,
};

const base = {
  computer: ok(computer),
  allowance: ok(allowance),
  version: ok(versionBase),
  providers: ok({ providers: providersBase }),
  provider: ok(providerBase),
  auth: ok(authBase),
  models: ok({ models: modelsBase }),
  ready: ok({ models: readyBase }),
  agents: ok(agentsFree),
  bots: ok(botsBase),
  acp: ok(claudeRow({ installed: false, install_state: 'missing_binary', logged_in: 'unknown', enabled: false, startable: false, login_verified: false, install_hint: 'sudo npm install -g @anthropic-ai/claude-code' })),
  acpDefault: ok({ delegated_agent: '' }),
  jev: ok(chk),
  jevModels: ok(jevModels),
  oauthPoll: ok({ state: 'pending', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' }),
  pkcePoll: ok({ state: 'pending', needs_code: true, verification_uri: OR_AUTH }),
  spend: ok(spendAll),
  credit: ok({ aiLive: true, aiRemaining: 4.2 }),
  ...writesDone,
  // The tab's screens on core: Skills, Instructions, Workflows, Loops, TODOs, GitHub accounts, Agents, Pause,
  // Stop, agent features, checked rules and hooks.
  rules: tabRules(),
} satisfies FixtureState;

/** getSessionUsage's body for any chat: three calls over two models, totals that add up, no further page. */
function usageAnswer() {
  // Unix seconds; attempt -1 = the call's outcome row (0 and up would be failed attempts: "Not finished · 1 retry").
  const at = Date.UTC(2026, 10, 11, 8, 40, 0) / 1000;
  const call = (id: number, turn: string, model: string, provider: string, inp: number, out: number, cache: number, cost: number, ms: number) => ({
    id, ts: at + id * 60, turn_id: turn, attempt: -1, model, provider, input_tokens: inp, output_tokens: out, cache_read_tokens: cache,
    cache_write_tokens: 0, cost_usd: cost, latency_ms: ms, success: true, kind: 'chat',
  });
  const items = [
    call(1, 't1', 'hoody-ai/hoody-free', 'hoody', 2400, 380, 0, 0, 2100),
    call(2, 't2', 'openai/gpt-5', 'openai', 5200, 910, 3100, 0.0412, 4800),
    call(3, 't3', 'openai/gpt-5', 'openai', 6100, 1250, 4800, 0.0533, 5300),
  ];
  const sum = (k: 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cost_usd') => items.reduce((n, x) => n + x[k], 0);
  const input = sum('input_tokens');
  return {
    items,
    totals: { calls: items.length, input_tokens: input, output_tokens: sum('output_tokens'), cache_read_tokens: sum('cache_read_tokens'), cache_write_tokens: 0, cost_usd: Math.round(sum('cost_usd') * 10000) / 10000, cache_read_pct: Math.round((sum('cache_read_tokens') / input) * 1000) / 10 },
    next_after_id: 3,
    has_more: false,
  };
}

function approvalRules() {
  const modes = new Map<string, { mode: 'default' | 'always'; revision: number }>();
  const sidOf = (r: FixtureRequest) => decodeURIComponent(((r.path.split('?')[0] ?? '').split('/sessions/')[1] ?? '').split('/')[0] ?? '');
  const row = (sid: string) => modes.get(sid) ?? { mode: 'default' as const, revision: 1 };
  const view = (sid: string) => { const m = row(sid); return { mode: m.mode, locked: false, revision: m.revision, yolo: m.mode === 'always' ? false : (fixtureAgentYolo(sid) ?? false) }; };
  return [
    reply(agent.agentRoutes.approval, (r) => (fixtureAgentYolo(sidOf(r)) === null ? answers.refused(404, 'not_found') : answers.ok(view(sidOf(r))))),
    reply(agent.approvalRoutes.setMode, (r) => {
      const sid = sidOf(r), m = row(sid), mode = (r.body as { mode?: unknown } | null)?.mode;
      if (fixtureAgentYolo(sid) === null) return answers.refused(404, 'not_found');
      if (r.ifMatch !== `"${m.revision}"`) return answers.refused(412, 'precondition_failed');
      if (mode !== 'default' && mode !== 'always') return answers.refused(400, 'invalid_request');
      if (mode === 'always' && fixtureAgentYolo(sid)) return answers.refused(409, 'approval_policy_unsatisfiable');
      modes.set(sid, { mode, revision: m.revision + 1 });
      return answers.ok(view(sid));
    }),
  ];
}

/** The core-format rules of the tab's screens and the pane's chat list; `many` gives each Automations list a second page. */
function tabRules(o: { skills?: SkillOpts; github?: GitHubOpts; many?: boolean; refuse?: 'pause' | 'resume' | 'read'; instructions?: InstructionsOpts; loopsFail?: boolean; chats?: ChatRuleOpts; memory?: MemoryFixtureOpts } = {}) {
  const many = { many: o.many };
  // the settings sessions open now, each with its folder: mcpRules opens and closes them, the hooks list reads on them
  const settings: SettingsSessions = new Map();
  return [
    ...skillRules(o.skills), ...instructionsRules(o.instructions), ...memoryRules(o.memory), ...workflowRules(many), ...runRules(), ...loopRules({ ...many, fail: o.loopsFail }), ...todoRules(many), ...githubRules(o.github), ...agentRules(),
    ...safetyRules({ refuse: o.refuse }), ...featureRules(),
    // The checked rules and the hooks of Rules & safety (the hooks list reads on a settings session mcpRules opened).
    ...ruleHookRules(settings),
    // The settings session and the MCP servers list read on it (Connections, MCP servers).
    ...mcpRules(settings),
    // The AI pane's chat list.
    ...chatRules(o.chats),
    // An open chat's usage (Details → Usage): a few readable calls on two models, so the Usage tab and its By model
    // table draw with figures in page renders.
    reply(agent.usageRoutes.session, () => answers.ok(usageAnswer())),
    // An open chat's attachment lease, for the sessions the chat list has.
    // Sessions a fixture fake agent made (a chat started on /ai/new with ?askfx / HUB_ASKFX) hold a keep-alive too, so they can send.
    ...attachRules(() => { const world = new Set(chatWorld().sessions.map((x) => x.id)); return { has: (sid: string) => world.has(sid) || fixtureAgentKnows(sid) }; }),
    // An open chat's approvals (the composer's chip, Details > Session), as the agent answers them: the mode with its revision,
    // and auto-approve as the fixture fake agent holds it (the chat's own switch writes there). A session no fake agent holds: 404.
    ...approvalRules(),
    ...homeFolderRules(),
    // From a URL… (the composer's add menu): the chat computer's page reader and fetch.
    ...urlRules(),
    // Screenshot of a display (the composer's add menu): the chat computer's displays and its display program's capture.
    ...shotRules(),
    // A folder link's page: its computer in the account's list, and the folder's repository.
    ...folderRules(), ...repoRules(),
  ];
}

/** A realm no fixture login serves (core's fixture world lists other realms). */
export const UNSERVED_REALM = 'abcdefabcdefabcdefabcdef';

/** The chat-attention states' chat list (see the states). */
function attentionChats(o: { gates?: ChatWorld['gates'] } = {}): ChatRuleOpts {
  const world = chatWorld();
  const flags = globalThis as { aiGatesSent?: number; aiAttnIdle?: boolean };
  world.sessions.push({
    id: 'sess-1',
    first_message: 'Build the status page',
    cwd: '/home/ada',
    last_request_at: new Date().toISOString(),
    get state() { return flags.aiAttnIdle ? 'idle' : 'running'; },
  });
  if (o.gates) world.gates = o.gates;
  return {
    world,
    onSend: (r) => {
      if (r.route === chatRoutes.gates || r.route === chatRoutes.gatesHere) flags.aiGatesSent = (flags.aiGatesSent ?? 0) + 1;
    },
  };
}

/** A gate that opens `ms` after each wait on it starts (a thenable: every `await` starts its own timer). */
const afterEachAsk = (ms: number) => ({ then: (open: () => void) => void setTimeout(open, ms) }) as unknown as Promise<void>;

/** How long the loading state's core reads wait. */
const LOADING_MS = 600_000;

/** The loading state: every list read of the tab's screens stays unanswered (ten minutes: a timer's longest safe wait
 *  is far beyond it). */
function loadingRules() {
  const wait = <R,>(body: R) => answers.slow(body, LOADING_MS);
  return [
    reply(skillRoutes.list, wait({ items: [], meta: { total: 0 } })),
    reply(workflowRoutes.list, wait({ items: [] })),
    reply(loopRoutes.loops, wait({ items: [] })),
    reply(todoRoutes.list, wait({ items: [], revision: 0 })),
    reply(githubRoutes.status, wait({ accounts: [] })),
    reply(routes.agents, wait({ items: [] })),
    reply(agent.pauseRoutes.get, wait({ paused: false, since_ms: 0, gen: 1 })),
    reply(chatRoutes.sessions, wait({ items: [], meta: { total: 0 } })),
  ];
}

/** The default skills and 54 more, so the list has a second page (50 a page). */
const manySkills = [
  ...skillSeed(),
  ...Array.from({ length: 54 }, (_, i) => {
    const name = `notes-${String(i + 1).padStart(2, '0')}`;
    return { name, description: 'Write notes for a team.', root_id: 'user', root_dir: '/home/ada/.hoody/skills', rel_dir: name, dir: `/home/ada/.hoody/skills/${name}`, realm: 'global' };
  }),
];

const longName = 'A provider display name that goes on and on to prove that the table row truncates it and keeps every action reachable';
const MANY = ['Mistral', 'Cohere', 'Groq', 'Perplexity', 'DeepSeek', 'Together AI', 'Fireworks', 'Cerebras', 'Replicate', 'Hugging Face', 'Nvidia NIM', 'Ollama Cloud', 'AI21 Labs', 'Moonshot', 'Zhipu', 'Alibaba Qwen', 'Baidu Ernie', 'xAI', 'Reka', 'Lepton', 'Novita', 'SambaNova', 'Hyperbolic', 'Venice'];
const manyProviders = [
  ...providersBase.map((p) => ({ ...p, status: { state: 'ready', via: p.id === 'hoody-ai' ? 'included' : 'stored_key' } })),
  ...MANY.map((n) => prov(n.toLowerCase().replace(/\W+/g, '-'), n, 'ready', 'stored_key')),
];
const slugs = MANY.map((n) => n.toLowerCase().replace(/\W+/g, '-'));
const modelNames = manyNames(60, 7);
const manyModels = [...modelsBase, ...modelNames.map((n, i) => mod(`${slugs[i % slugs.length]}/${n}`, n))];

export default defineFixtures({
  default: 'default',
  states: {
    default: base,
    empty: {
      ...base,
      providers: ok({ providers: [providersBase[0]] }),
      provider: ok({ 'hoody-ai': providerBase['hoody-ai'] }),
      models: ok({ models: modelsBase.slice(0, 2) }),
      ready: ok({ models: readyBase.slice(0, 2) }),
      auth: ok({ 'hoody-ai': authBase['hoody-ai'] }),
      bots: ok({ items: [] }),
      spend: ok(spendNone),
      credit: err('not_found'),
      allowance: ok({ servers: [], truncated: false }),
    },
    loading: {
      ...(Object.fromEntries(Object.keys(base).filter((k) => k !== 'rules').map((k) => [k, { pending: true } as QueryAnswer])) as FixtureState),
      rules: loadingRules(),
    },
    error: {
      ...base,
      computer: ok(computer),
      version: err('server'),
      providers: err('server'),
      models: err('server'),
      ready: err('server'),
      auth: err('server'),
      agents: err('server'),
      bots: err('server'),
      acp: err('server'),
      acpDefault: err('server'),
      jev: err('server'),
      jevModels: err('server'),
      spend: err('server'),
      credit: err('server'),
      allowance: err('server'),
    },
    // The agent's platform login is gone (restriction_unknown on its session lists): the chat list offers the sign-in.
    chatsSignedOut: { ...base, rules: tabRules({ chats: { signedOut: { on: true } } }) },
    // Rules & safety: the agent refuses every Pause (from running) or Resume (from paused).
    pauseRefused: { ...base, rules: tabRules({ refuse: 'pause' }) },
    resumeRefused: { ...base, rules: tabRules({ refuse: 'resume' }) },
    // The pause read fails: the pane foot and Rules & safety show "Pause state unknown" with Try again.
    pauseUnread: { ...base, rules: tabRules({ refuse: 'read' }) },
    // Instructions: every save meets another writer's change, or its answer is lost.
    instructionsConflict: { ...base, rules: tabRules({ instructions: { save: 'conflict' } }) },
    instructionsLost: { ...base, rules: tabRules({ instructions: { save: 'lost' } }) },
    // Connections: each device-flow poll answers 2.5 s after it is asked, so the code and the GitHub link stay on screen
    // long enough to be read (and seen by a spec on a busy machine) before "Linked as".
    githubSlowLink: { ...base, rules: tabRules({ github: { pollGate: afterEachAsk(2_500) } }) },
    partial: { ...base, acp: err('not_found'), acpDefault: err('server'), jev: err('server'), spend: err('server'), bots: err('network') },
    needsKey: {
      ...base,
      agents: ok({ agents: [{ name: 'general', model: 'anthropic/claude-sonnet', is_configured_default: true }, { name: 'bot', model: '' }] }),
    },
    pending: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, 'outcome' in v ? pend() : v])) as FixtureState,
    failed: {
      ...base,
      keyPut: sent(fail('api_key_refused')),
      keyDelete: fail('store_failed'),
      authTest: fail('credential_not_stored'),
      oauthStart: fail('oauth_unsupported'),
      pkceStart: fail('oauth_unsupported'),
      customCreate: fail('provider_exists'),
      agentModel: fail('model_unavailable', { details: { reason: 'no_credentials' } }),
      agentEffort: fail('bad_request'),
      acpEnabled: fail('forbidden'),
      jevPut: fail('forbidden'),
    },
    limited: {
      ...base,
      ...Object.fromEntries(Object.entries(writesDone).map(([k]) => [k, fail('forbidden')])),
    },
    long: {
      ...base,
      providers: ok({ providers: [providersBase[0], prov('openai', longName, 'ready', 'stored_key'), prov('custom-long', longName, 'ready', 'stored_key', { custom: true })] }),
      models: ok({ models: [...modelsBase, mod('openai/long', longName)] }),
      agents: ok({ agents: [{ name: 'general', model: 'openai/long', is_configured_default: true }, { name: 'bot', model: '' }] }),
    },
    many: {
      ...base,
      providers: ok({ providers: manyProviders }),
      models: ok({ models: manyModels }),
      ready: ok({ models: manyModels.map((m) => ({ spec: m.spec })) }),
      bots: ok({ items: manyNames(40, 3).map((n, i) => ({ id: `b${i}`, name: n, model: i % 3 ? `${slugs[i % slugs.length]}/${modelNames[i % modelNames.length]}` : '', realm: 'global' })) }),
    },
    claude: {
      ...base,
      acp: ok(claudeRow()),
      acpDefault: ok({ delegated_agent: 'claude' }),
    },
    claudeSignedOut: { ...base, acp: ok(claudeRow({ logged_in: 'logged_out', login_verified: false, startable: false, login_hint: 'claude auth login' })) },
    // The agent already shows what the read-back looks for: a model pick, a stored key, a signed-out account.
    echo: {
      ...base,
      agentModel: pend(),
      agentEffort: pend(),
      agents: ok({ agents: [{ name: 'general', model: 'openai/gpt-5', is_configured_default: true }, { name: 'bot', model: '' }] }),
      keyPut: pend(),
      keyDelete: pend(),
    },
    // An account whose key was set outside Hoody: the longest "How it connects" label.
    external: {
      ...base,
      providers: ok({ providers: providersBase.map((p) => (p.id === 'anthropic' ? prov('anthropic', 'Anthropic', 'ready', 'external_key') : p)) }),
    },
    endpointKey: { ...base, ...withEndpoint('rev-fixture-1') },
    // The revision read never answers while the shot is taken (an hour).
    endpointReading: { ...base, ...withEndpoint('rev-fixture-1', 3_600_000) },
    endpointReadFailed: { ...base, ...withEndpoint(null) },
    endpointChanged: { ...base, ...withEndpoint('rev-fixture-1'), keyPut: sent(fail('definition_changed')) },
    realms: { ...base, computer: ok({ ...computer, realmIds: [REALM_A, REALM_B], selectedRealm: REALM_A }) },
    // Two realms and none chosen: the per-realm reads cannot run, and the page asks for a realm instead of waiting.
    noRealm: { ...base, computer: ok({ ...computer, realmIds: [REALM_A, REALM_B], selectedRealm: null }) },
    // Knowledge → Skills: a switch whose answer is lost (it may have gone through), and a list with a second page.
    skillsLost: { ...base, rules: tabRules({ skills: { lost: true } }) },
    skillsMany: { ...base, rules: tabRules({ skills: { seed: manySkills } }) },
    // Skills with trust: the list and the trust change share one store per computer, so a grant shows in the next list.
    skillsTrust: { ...base, rules: [...trustRules(), ...tabRules()] },
    // Automations lists past one page; a GitHub login whose answer is lost.
    autoMany: { ...base, rules: tabRules({ many: true }) },
    // The loops listing cannot be read (its error view keeps the FAQ link).
    loopsFailed: { ...base, rules: tabRules({ loopsFail: true }) },
    githubLost: { ...base, rules: tabRules({ github: { login: 'lost' } }) },
    catalogue7k: {
      ...base,
      get providers() { return parts7k().providers; },
      get models() { return parts7k().models; },
      get ready() { return parts7k().ready; },
    },
    readyLost: { ...base, ready: err('server') },
    // Chat attention (shell observer, core/chat-attention.ts): every GET /gates sent is counted in the page
    // (globalThis.aiGatesSent), and the first chat a page starts on the scripted agent (`sess-1`) is listed running until
    // globalThis.aiAttnIdle is set, then idle.
    attention: { ...base, rules: tabRules({ chats: attentionChats() }) },
    // As `attention`, with GET /changes down: the list falls back to its 30 s re-read (the observer's tick must stay the
    // only GET /gates page-1 timer).
    attentionFeedDown: { ...base, rules: tabRules({ chats: { ...attentionChats(), feedDown: true } }) },
    // The only gate waits in a realm this login does not serve.
    attentionUnserved: { ...base, rules: tabRules({ chats: attentionChats({ gates: [{ session_id: 's-wait', realm: UNSERVED_REALM }] }) }) },
    // Knowledge → Memory while the realm's memory host is being chosen and its store cannot be read.
    memoryDown: { ...base, rules: tabRules({ memory: { down: true } }) },
  },
});
