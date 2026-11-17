// Fake-API states of the scripts page for hub:dev, hub:shots, tests and specs.
// Keys are the ones data.ts reads. Per-script maps are keyed by the selection id `<computer handle>~<path>`.
import { defineFixtures } from '@app/fixtures';
import { agentSignInRoutes, answers, computerHandle, fixtureWorld, reply, worldColours, type DraftRecord, type FixtureAnswer, type ScriptAsk } from '@core';
import { itemId, ROOT } from './logic';
import { routes as R } from './routes';
import type { Alias, CompScripts, DeletedEntry, EnvKeys, Failure, Instance, ScriptFile, ScriptRow, Summary, TestsDoc, Usage, Version } from './types';

const KEY = 'fakeKEYfakeKEYfakeKEYfakeKEYfakeKEYfakeKEY0';

const CAPS_ALL = { now: Date.UTC(2026, 9, 23, 4, 0), revisions: true, history: true, env: true, executions: true, tests: true, publishable: true };
const CAPS_OLD = { now: null, revisions: false, history: false, env: false, executions: false, tests: false, publishable: false };
const AGENT = { templates: true, writer: true, writerOwner: 'fp-atlas', guardedDelete: true };

interface Def {
  path: string;
  label?: string;
  description?: string;
  schedule?: string;
  enabled?: boolean;
  key?: boolean;
  /** The header still has a line the computer no longer acts on (@await-promises). */
  oldLine?: boolean;
  calls?: number;
  failed?: number;
  last?: string;
  code: string;
}

const body = (lines: string[]): string => `${lines.join('\n')}\n`;

const DEFS: Def[] = [
  {
    path: 'weather.ts', label: 'Weather lookup', description: 'Current weather for a city.', calls: 412, failed: 3, last: 'ok',
    code: body(['// @label Weather lookup', '// @description Current weather for a city.', 'export default async function (request: Request) {', '  const city = new URL(request.url).searchParams.get("city") ?? "Singapore";', '  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);', '  return Response.json(await res.json());', '}']),
  },
  {
    path: 'orders/[id].ts', label: 'Order status', description: 'Look up one order by its id.', key: true, oldLine: true, calls: 1290, failed: 61, last: 'failed',
    code: body(['// @label Order status', `// @token ${KEY}`, 'export default async function (request: Request, { params }: { params: { id: string } }) {', '  const order = await sharedState.get(`order:${params.id}`);', '  if (!order) return new Response("not found", { status: 404 });', '  return Response.json(order);', '}']),
  },
  {
    path: 'daily-digest.ts', label: 'Daily digest', description: 'Writes a summary of the day.', schedule: '0 8 * * *', calls: 30, failed: 0, last: 'ok',
    code: body(['// @label Daily digest', '// @schedule 0 8 * * *', 'import { hoodyAi } from "hoody";', 'export default async function () {', '  return Response.json(await hoodyAi.summarize("today"));', '}']),
  },
  {
    path: 'webhooks/stripe.ts', label: 'Stripe webhook', description: 'Receives payment events.', key: true, calls: 88, failed: 2, last: 'ok',
    code: body(['// @label Stripe webhook', `// @token ${KEY}`, 'export default async function (request: Request) {', '  const event = await request.json();', '  await sharedState.set(`event:${event.id}`, event);', '  return new Response("ok");', '}']),
  },
  {
    path: 'health.ts', label: 'Health check', description: 'Answers ok.', calls: 5120, failed: 0, last: 'ok',
    code: body(['// @label Health check', 'export default function () {', '  return new Response("ok");', '}']),
  },
  {
    path: 'old-report.ts', label: 'Old report', description: 'Turned off while we move to the digest.', enabled: false,
    code: body(['// @label Old report', '// @enabled false', 'export default function () {', '  return new Response("retired");', '}']),
  },
  {
    path: 'notify.ts', label: 'Notify me', description: 'Sends a push notification.', calls: 9, failed: 0, last: 'ok',
    code: body(['// @label Notify me', 'export default async function (request: Request) {', '  const { title, body } = await request.json();', '  await fetch("https://notify.example.test/send", { method: "POST", body: JSON.stringify({ title, body }) });', '  return new Response("sent");', '}']),
  },
];

const FAILURE_PATH = 'orders/[id].ts';

function build(def: Def[], handle: string): { rows: ScriptRow[]; summary: Record<string, Summary>; files: Record<string, ScriptFile> } {
  const rows: ScriptRow[] = [];
  const summary: Record<string, Summary> = {};
  const files: Record<string, ScriptFile> = {};
  for (const d of def) {
    const path = ROOT + d.path;
    rows.push({
      path,
      magicComments: {
        ...(d.label ? { label: d.label } : {}),
        ...(d.description ? { description: d.description } : {}),
        ...(d.schedule ? { schedule: d.schedule } : {}),
        ...(d.enabled === false ? { enabled: false } : {}),
        ...(d.key ? { tokens: ['redacted'] } : {}),
      },
    });
    if (d.calls !== undefined) summary[path] = { scriptPath: path, calls: d.calls, failed: d.failed ?? 0, lastOutcome: d.last ?? 'ok' };
    files[itemId(handle, path)] = { revision: `r-${d.path.length}-${(d.calls ?? 0) % 97}`, content: d.code };
  }
  return { rows, summary, files };
}

const alias = (n: number, target: string, over: Partial<Alias> = {}): Alias => ({
  id: `al${n}`, alias: `atlas-${n}`, url: `https://atlas-${n}.hoody.example.test`, target_path: target, enabled: true, allow_path_override: false, program: 'exec', index: 1, ...over,
});

const atlasId = 'c0a7150000000000000000a1';
const atlas = 'atlas';
const mh = computerHandle({ name: atlas, id: atlasId });
const b = build(DEFS, mh);
// Exec folder 3 of atlas (the page at ?exec=3): its own scripts, beside folder 1's (which that page never shows).
const F3 = 'default/3/';
const F3_DEFS: Def[] = [
  { path: 'inventory.ts', label: 'Inventory count', description: 'Counts what is left in the shop.', calls: 57, failed: 0, last: 'ok', code: body(['// @label Inventory count', 'export default function () {', '  return Response.json({ left: 12 });', '}']) },
  { path: 'reports/weekly.ts', label: 'Weekly report', description: 'A short report every Monday.', schedule: '0 9 * * 1', calls: 4, failed: 0, last: 'ok', code: body(['// @label Weekly report', '// @schedule 0 9 * * 1', 'export default function () {', '  return new Response("report");', '}']) },
];
const b3 = ((): ReturnType<typeof build> => {
  const r = build(F3_DEFS, mh);
  const move = (p: string): string => F3 + p.slice(ROOT.length);
  return {
    rows: r.rows.map((x) => ({ ...x, path: move(x.path) })),
    summary: Object.fromEntries(Object.entries(r.summary).map(([k, v]) => [move(k), { ...v, scriptPath: move(k) }])),
    files: r.files,
  };
})();

const instances: Record<string, Instance> = {
  [`${ROOT}notify.ts`]: { path: `${ROOT}notify.ts`, template: 'webhook-to-notification', state: 'active', elsewhere: false, hasToken: true, aliasId: null },
  [`${ROOT}daily-digest.ts`]: { path: `${ROOT}daily-digest.ts`, template: 'scheduled-ai-digest', state: 'active', elsewhere: true, hasToken: false, aliasId: null },
};
const deleted: DeletedEntry[] = [
  { path: `${ROOT}scratch.ts`, version: 4, retainedUntil: '2026-11-18T14:25:00Z' },
  { path: `${ROOT}legacy/report.ts`, version: 9, retainedUntil: '2026-11-02T07:40:00Z' },
];

const atlasComp: CompScripts = {
  id: atlasId, name: atlas, handle: mh, state: 'on', serverName: 'n12', realmIds: ['f1f1f1f1f1f1f1f1f1f1f1f1'], origin: 'https://atlas-exec-1.hoody.example.test', err: null,
  caps: CAPS_ALL, agent: AGENT, rows: b.rows, summary: b.summary, instances, deleted,
  aliases: [alias(1, '/weather'), alias(2, '/orders/42'), alias(3, '/health', { enabled: false })],
};

const oldId = 'c0a7150000000000000000b2';
const oldH = computerHandle({ name: 'borealis', id: oldId });
const ob = build(DEFS.slice(0, 3).map((d) => ({ ...d, calls: undefined, key: false })), oldH);
const oldComp: CompScripts = {
  id: oldId, name: 'borealis', handle: oldH, state: 'on', serverName: 'fra-7', realmIds: ['f2f2f2f2f2f2f2f2f2f2f2f2'], origin: 'https://borealis-exec-1.hoody.example.test', err: null,
  caps: CAPS_OLD, agent: { templates: false, writer: false, guardedDelete: false }, rows: ob.rows, summary: {}, instances: {}, aliases: [], deleted: null,
};
const offComp: CompScripts = {
  id: 'c0a7150000000000000000c3', name: 'cedar', handle: computerHandle({ name: 'cedar', id: 'c0a7150000000000000000c3' }), state: 'off', serverName: 'n12', realmIds: ['f1f1f1f1f1f1f1f1f1f1f1f1'], origin: '', err: null,
  caps: null, agent: { templates: false, writer: false, guardedDelete: false }, rows: [], summary: {}, instances: {}, aliases: [], deleted: null,
};
const privComp: CompScripts = {
  id: 'c0a715000000000000000118', name: 'harbor', handle: computerHandle({ name: 'harbor', id: 'c0a715000000000000000118' }), state: 'on', serverName: 'ash-3', realmIds: ['f3f3f3f3f3f3f3f3f3f3f3f3'], origin: '', err: 'private',
  caps: null, agent: { templates: false, writer: false, guardedDelete: false }, rows: [], summary: {}, instances: {}, aliases: [], deleted: null,
};

const overview = { computers: [atlasComp, oldComp, offComp, privComp] };

/** Many scripts on one computer, for the long list. */
const LONG: Def[] = Array.from({ length: 70 }, (_, i) => ({
  path: `jobs/job-${String(i + 1).padStart(2, '0')}.ts`, label: `Job ${i + 1}`, description: `Background job number ${i + 1}.`,
  calls: (i * 37) % 900, failed: i % 9 === 0 ? 40 : 0, last: i % 9 === 0 ? 'failed' : 'ok', ...(i % 4 === 0 ? { schedule: '0 * * * *' } : {}),
  code: body([`// @label Job ${i + 1}`, 'export default () => new Response("done");']),
}));
const lb = build(LONG, mh);
const longOverview = { computers: [{ ...atlasComp, rows: lb.rows, summary: lb.summary, instances: {} }] };

const usage = (calls: number, failed: number): Usage => ({
  totals: { calls, failed, p50Ms: 38 },
  hours: Array.from({ length: 24 }, (_, i) => ({ calls: Math.round((calls / 24) * (0.4 + ((i * 7) % 10) / 8)) })),
  coverage: { complete: true },
});
const usages: Record<string, Usage> = Object.fromEntries(DEFS.filter((d) => d.calls !== undefined).map((d) => [itemId(mh, ROOT + d.path), usage(d.calls ?? 0, d.failed ?? 0)]));

const failures: Record<string, Failure[]> = {
  [itemId(mh, ROOT + FAILURE_PATH)]: [
    { executionId: 'ex_01HZ8', status: 500, receivedAt: '2026-10-23T03:41:00Z', error: 'TypeError: order.items is undefined' },
    { executionId: 'ex_01HZ7', status: 404, receivedAt: '2026-10-23T02:12:00Z', error: 'not found' },
    { executionId: 'ex_01HZ6', status: 500, receivedAt: '2026-10-22T21:30:00Z', error: 'TypeError: order.items is undefined' },
  ],
};

const versions: Record<string, Version[]> = Object.fromEntries(
  DEFS.map((d) => [
    itemId(mh, ROOT + d.path),
    [
      // The computer's answer: an opaque id per kept copy, newest first, with what replaced it and its size.
      { version: 'h-mh1q2w3e-0a1b2c3d', revision: 'r3', savedAt: '2026-10-22T09:12:00Z', replacedBy: 'write', size: 1834 },
      { version: 'h-mgxk7p2a-4e5f6a7b', revision: 'r2', savedAt: '2026-10-19T16:40:00Z', replacedBy: 'restore', size: 1790 },
      { version: 'h-mgq9d4s1-8c9d0e1f', revision: 'r1', savedAt: '2026-10-15T08:00:00Z', replacedBy: 'magic-comments', size: 1202 },
    ] satisfies Version[],
  ]),
);

// An older version of each script, for Preview before a restore: the fixture ignores which version was asked for.
const olderFiles: Record<string, ScriptFile> = Object.fromEntries(Object.entries(b.files).map(([id, f]) => [id, { ...f, content: `// An earlier take\n${f.content}` }]));

const envKeys: EnvKeys = {
  files: [
    { scope: 'script', rel: 'default/1/orders/[id].env', exists: true, revision: 'e1', keys: [{ name: 'DB_URL' }, { name: 'STRIPE_KEY' }] },
    { scope: 'folder', rel: 'default/1/.env', exists: true, revision: 'e2', keys: [{ name: 'REGION' }] },
    { scope: 'computer', exists: false, revision: null, keys: [] },
  ],
  effective: [{ name: 'DB_URL', from: 'script' }, { name: 'STRIPE_KEY', from: 'script' }, { name: 'REGION', from: 'folder' }],
};
const envs: Record<string, EnvKeys> = Object.fromEntries(DEFS.map((d) => [itemId(mh, ROOT + d.path), envKeys]));

const testDoc: TestsDoc = {
  revision: 't1',
  cases: [
    { id: 'c1', name: 'finds an order', method: 'GET', route: '/orders/42', expect: { status: 200 } },
    { id: 'c2', name: 'unknown order is 404', method: 'GET', route: '/orders/0', expect: { status: 404 } },
  ],
};
const tests: Record<string, TestsDoc> = Object.fromEntries(DEFS.map((d) => [itemId(mh, ROOT + d.path), d.path.startsWith('orders') ? testDoc : { revision: null, cases: [] }]));

// The computer's own field list (a subset of magic-comments/schema) and, per script, what magic-comments/read answers: a key reads
// as the sentinel, never its value.
const fld = (key: string, category: string, type: string, description: string, extra: Record<string, unknown> = {}, when = null as unknown, runtime = when) => ({ key, directive: `@${key}`, category, type, description, defaults: { when_omitted: when, runtime, sdk_import: when }, ...extra });
const schemaDoc = {
  schema_version: '1.0.0',
  total_fields: 26,
  parse_window_lines: 50,
  unknown_keys_behavior: 'ignored-by-serializer',
  defaults_context: { when_omitted: 'x', runtime: 'x', sdk_import: 'x' },
  categories: { execution: [], logging: [], cors: [], ai: [], metadata: [], auth: [], remote: [] },
  fields: [
    fld('enabled', 'execution', 'boolean', 'Enable or disable script execution.', {}, true),
    fld('token', 'auth', 'string|string[]', 'Shared secret token for endpoint authentication.', { repeatable: true }),
    fld('mode', 'execution', 'enum', 'Execution model for the script.', { enum_values: ['worker', 'serverless'] }, null, 'serverless'),
    fld('timeout', 'execution', 'integer', 'Script timeout. A bare number is milliseconds; a unit suffix is honoured.', { range: { min: 0, max: 2147483647 } }),
    fld('log-level', 'logging', 'enum', 'Logging verbosity.', { enum_values: ['none', 'minimal', 'standard', 'full', 'debug'] }),
    fld('debug', 'logging', 'boolean', 'Shortcut to set log level to debug.', {}, false),
    fld('concurrent', 'execution', 'boolean|integer', 'Concurrency policy: true, false, or a max concurrency integer.'),
    fld('cors', 'cors', 'string|null', 'CORS origin strategy: reflective, none or one origin.'),
    fld('cors-credentials', 'cors', 'boolean', 'Enable CORS credentials.', {}, false),
    fld('websocket', 'execution', 'boolean', 'Enable WebSocket mode for the script.', {}, false),
    // As the computer lists it (hoody-exec's own schema): no stated default, on at run time.
    fld('websocket-pre', 'execution', 'boolean', "Run the directory's pre.js once per WebSocket upgrade, before the handshake (default true).", {}, null, true),
    fld('await-promises', 'execution', 'boolean', 'No effect: a returned promise is always awaited and its resolved value is the response. Accepted so existing scripts keep working.', {}, null, true),
    fld('log-request-body', 'logging', 'boolean|enum', 'Include request body in logs.', { enum_values: ['full', 'redacted', 'off'] }),
    fld('log-retention-days', 'logging', 'integer', 'Days to retain logs.'),
    fld('cors-methods', 'cors', 'string', 'Comma-separated CORS allowed methods.'),
    fld('ai-temperature', 'ai', 'number', 'AI temperature between 0 and 2.', { range: { min: 0, max: 2 } }),
    fld('ai', 'ai', 'boolean', 'Enable or disable AI helpers.', {}, false),
    fld('ai-model', 'ai', 'string', 'Override default AI model identifier (one word).'),
    fld('ai-key', 'ai', 'string', 'Override AI API key for the script (one word).'),
    fld('description', 'metadata', 'string', 'Human-readable description for the script.'),
    fld('tags', 'metadata', 'string[]', 'Comma-separated tags used for grouping and filtering.'),
    fld('label', 'metadata', 'string', 'Short label used for classification and filtering.'),
    fld('schedule', 'execution', 'string', 'Cron expression (5-field), UTC only. Registers the script as a scheduled run.'),
    fld('schedule-timeout', 'execution', 'integer', 'Per-fire wall-clock timeout.', { range: { min: 0, max: 2147483647 } }),
    fld('remote-messages', 'remote', 'boolean', 'Allow remote messages on the script\'s own URL.', {}, false),
    fld('remote-token', 'remote', 'object[]', 'Named secrets that unlock the remote features.', { repeatable: true }),
  ],
};
const commentReads: Record<string, { revision: string; comments: Record<string, unknown>; warnings: unknown[] }> = Object.fromEntries(
  DEFS.map((d) => [
    itemId(mh, ROOT + d.path),
    {
      revision: 'r3',
      comments: { ...(d.label ? { label: d.label } : {}), ...(d.description ? { description: d.description } : {}), ...(d.schedule ? { schedule: d.schedule } : {}), ...(d.enabled === false ? { enabled: false } : {}), ...(d.key ? { token: '[REDACTED]', tokens: ['[REDACTED]'] } : {}), ...(d.oldLine ? { 'await-promises': true } : {}) },
      warnings: [],
    },
  ]),
);

const validOk = { publishable: true, results: { syntax: { valid: true }, dependencies: { missingModules: [] }, magicComments: { tokens: ['redacted'] } } };
const validBad = { publishable: false, results: { syntax: { valid: false, error: 'Unexpected token (8:1)' } } };
const ok = (data?: unknown) => ({ outcome: 'done' as const, ...(data === undefined ? {} : { data }) });

const mutations = {
  validate: ok(validOk),
  resolve: ok({ matched: false }),
  write: ok({ revision: 'r-new', previousRevision: 'r3' }),
  restore: ok({ revision: 'r-restored' }),
  comments: ok({ revision: 'r-set' }),
  commentsCheck: ok({ current: {}, proposed: {}, changes: [], ignored: [] }),
  commentsParse: ok({ directives: [], problems: [] }),
  commentsPrint: ok({ edits: [], changed_lines: [], removed_lines: [], verify: { lines: 1 } }),
  remove: ok(),
  removeManaged: ok(),
  instantiate: ok({ path: `${ROOT}notify.ts` }),
  envUpdate: ok(),
  testsPut: ok({ revision: 't2' }),
  testsDelete: ok(),
  runTest: ok({ status: 200, ms: 41, body: '{"id":"42","status":"shipped"}', headers: [['content-type', 'application/json'], ['x-execution-id', 'ex_42']], size: 30 }),
  trigger: ok(),
  aiTurn: ok({
    reply: 'Summary: Adds a 404 for unknown cities.\n```ts\n// @label Weather lookup\nexport default async function (request: Request) {\n  const city = new URL(request.url).searchParams.get("city");\n  if (!city) return new Response("city is required", { status: 400 });\n  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);\n  return Response.json(await res.json());\n}\n```\n',
  }),
  aliasCreate: ok(alias(9, '/weather')),
  aliasState: ok(),
  aliasRemove: ok(),
  settle: ok({ outcome: 'committed', revision: 'r-new' }),
};

// The kit's clock (health.now): a New script deploy reads it before it sends (deploy.ts sentAfter).
const HEALTH = reply(R.health, answers.ok({ now: CAPS_ALL.now, features: ['revisions', 'history', 'env', 'executions', 'tests', 'publishable'] }));
const base = {
  rules: [HEALTH],
  overview: { data: overview },
  files: { data: b.files },
  usage: { data: usages },
  failures: { data: failures },
  versions: { data: versions },
  versionRead: { data: olderFiles },
  commentsSchema: { data: schemaDoc },
  commentsRead: { data: commentReads },
  env: { data: envs },
  tests: { data: tests },
  ...mutations,
};

const pend = { outcome: 'pending' as const };

// Being built: this browser's New script builds, as the store and each build's own computer answer.
// Three builds: one building on atlas, one ready on atlas, one stopped on borealis (not the computer shown). Each
// attempt's place names its project; the containers answer is the whole list of the two computers.
const wAtlas = fixtureWorld.computer('atlas'), wBorealis = fixtureWorld.computer('borealis');
const bRealm = 'f1f1f1f1f1f1f1f1f1f1f1f1';
// Ages are shown against this browser's clock ("3 min ago"), so the asks are dated from it.
const WORLD_T = Date.now();
const bContainers = { computers: [wAtlas, wBorealis].map((c) => ({ id: c.id, name: c.name, project_id: c.project_id, server_name: c.server_name })), pagination: { totalPages: 1 } };
const bDraft = (draftId: string, c: typeof wAtlas, o: Partial<DraftRecord> = {}): DraftRecord => ({ draftId, mode: 'ai', project: c.project_id, compId: c.id, realm: bRealm, owner: 'fp-atlas', exec: 1, current: 1, retained: null, state: 'open', deploy: null, updatedAt: WORLD_T, ...o });
const bAsk = (draftId: string, c: typeof wAtlas, sid: string, min: number, o: Partial<ScriptAsk> = {}): ScriptAsk => ({ askId: `ask-${draftId}`, compId: c.id, path: `new:${c.project_id}/${draftId}.1`, realm: bRealm, owner: 'fp-atlas', sessionId: sid, turnId: `t-${sid}`, phase: 'read', sentAt: WORLD_T - min * 60_000, createKey: `ck-${draftId}`, turnKey: `tk-${draftId}`, ...o });
const bReady = 'Summary: Counts last week\'s new signups and posts the total.\n```ts\n// @schedule 0 9 * * 1\nexport default async function () {\n  return Response.json({ signups: 0 });\n}\n```\n';
const builds = {
  drafts: [bDraft('bld0000001', wAtlas), bDraft('bld0000002', wAtlas), bDraft('bld0000003', wBorealis)],
  asks: [bAsk('bld0000001', wAtlas, 's-mon', 3), bAsk('bld0000002', wAtlas, 's-disk', 12), bAsk('bld0000003', wBorealis, 's-feed', 40)],
  computers: bContainers,
  sessions: {
    's-mon': { first: "Every Monday at 9:00, count last week's new signups and post the total\n\n[Hoody New script v1]\nAddress: /monday-at-9", receipt: 'dispatched', step: { kind: 'tool', tool: 'hoody_exec_validate' } },
    's-disk': { first: 'Warn me when the disk fills up', receipt: 'completed', answer: bReady },
    's-feed': { first: 'Turn the store feed into a daily summary', receipt: 'cancelled' },
  },
};
// The shared store full: the three builds and 29 change requests.
const changeAsks: ScriptAsk[] = Array.from({ length: 29 }, (_, i) => ({ askId: `chg-${i}`, compId: wAtlas.id, path: `${ROOT}jobs/job-${String(i + 1).padStart(2, '0')}.ts`, realm: bRealm, owner: 'fp-atlas', sessionId: `s-chg-${i}`, turnId: `t-chg-${i}`, phase: 'read', sentAt: WORLD_T - i * 60_000, createKey: `ck-chg-${i}`, turnKey: `tk-chg-${i}` }));
const buildsFull = { ...builds, asks: [...builds.asks, ...changeAsks] };
// A legacy New script ask (path null: an ask stored without a step path) beside one build.
const buildsLegacy = { ...builds, drafts: builds.drafts.slice(0, 1), asks: [builds.asks[0]!, { ...bAsk('legacy0001', wAtlas, 's-old', 90), askId: 'ask-legacy', path: null }] };

// The agent sign-in: atlas's agent signed out, and core's sign-in and status routes as the state says. The fixture
// boot token stands for the key.
const atlasAgent = (agent: CompScripts['agent']) => ({ data: { computers: overview.computers.map((c) => (c === atlasComp ? { ...c, agent } : c)) } });
const READY_STATUS = { auth_active: true, account_id: fixtureWorld.account.id, owner_fingerprint: 'fp-atlas', restriction: 'none' };
const OUT = { auth_active: false };
const signedOut = (o: Partial<CompScripts['agent']> = {}, boot: FixtureAnswer = answers.ok({}), status: unknown = READY_STATUS) => ({
  ...base,
  overview: atlasAgent({ templates: true, writer: false, writerWhy: 'login' as const, signIn: 'offer' as const, guardedDelete: true, ...o }),
  aiTurn: { outcome: 'failed' as const, code: 'AGENT_DOWN' },
  rules: [HEALTH, reply(agentSignInRoutes.bootstrap, boot), reply(agentSignInRoutes.status, answers.ok(status))],
});


export default defineFixtures({
  default: 'many',
  states: {
    /** Four computers: one ready with 7 scripts, one old kit (read-only), one off, one private. */
    many: base,
    /** 70 scripts on one computer. */
    long: { ...base, overview: { data: longOverview } },
    loading: { ...base, overview: { pending: true } },
    error: { ...base, overview: { error: 'server' } },
    /** No computer has any script yet. */
    empty: { ...base, overview: { data: { computers: [{ ...atlasComp, rows: [], summary: {}, instances: {}, aliases: [], deleted: [] }] } } },
    /** No script anywhere: atlas has none, cedar is turned off (its note still shows). */
    emptyOff: { ...base, overview: { data: { computers: [{ ...atlasComp, rows: [], summary: {}, instances: {}, aliases: [], deleted: [] }, offComp] } } },
    /** No computer at all. */
    noComputers: { ...base, overview: { data: { computers: [] } } },
    /** The only computer is on and did not answer (live: its reads failed): it says so, with Try again, never "No computer
     *  selected". */
    noAnswer: { ...base, overview: { data: { computers: [{ ...atlasComp, err: 'unreachable' as const, caps: null, rows: [], summary: {}, instances: {}, aliases: [], deleted: null }] } } },
    /** Computer colours (core worldColours): two computers that can take a script, so New script shows its picker:
     *  atlas blue; borealis (here with a current kit) takes cedar's value, which is not a hex colour (no mark). */
    colours: { ...base, overview: { data: { computers: [{ ...atlasComp, color: worldColours.atlas }, { ...oldComp, caps: CAPS_ALL, agent: AGENT, color: worldColours.cedar }, offComp, privComp] } } },
    /** The only computer has an old Exec kit: read, test and copy, nothing that changes it. */
    oldKit: { ...base, overview: { data: { computers: [oldComp] } } },
    /** Ownership of idea-made scripts could not be read. */
    ownershipUnknown: { ...base, overview: { data: { computers: [{ ...atlasComp, instances: null }] } } },
    /** The checker says the code is broken. */
    invalid: { ...base, validate: ok(validBad) },
    /** The address is taken by another script. */
    addressTaken: { ...base, resolve: ok({ matched: true, scriptPath: `${ROOT}weather.ts`, type: 'static' }) },
    /** Somebody else saved first. */
    conflict: { ...base, write: { outcome: 'stale' as const }, restore: { outcome: 'stale' as const } },
    /** Every change answers "may have gone through". */
    pendingOps: { ...base, commentsCheck: ok({ current: {}, proposed: {}, changes: [], ignored: [] }), write: pend, restore: pend, comments: pend, remove: pend, removeManaged: pend, instantiate: pend, envUpdate: pend, testsPut: pend, testsDelete: pend },
    /** Every change is refused. */
    failedOps: { ...base, write: { outcome: 'failed' as const, code: 'REVISION_MISMATCH' }, comments: { outcome: 'failed' as const, code: 'BAD_REVISION' }, remove: { outcome: 'failed' as const, code: 'SCRIPT_BUSY' }, removeManaged: { outcome: 'failed' as const, code: 'SCRIPT_BUSY' }, envUpdate: { outcome: 'failed' as const, code: 'ENV_TOO_LARGE' } },
    /** The writing assistant does not answer. */
    aiDown: { ...base, overview: { data: { computers: overview.computers.map((c) => (c === atlasComp ? { ...c, agent: { templates: true, writer: false, writerWhy: 'old' as const, guardedDelete: true } } : c)) } }, aiTurn: { outcome: 'failed' as const, code: 'AGENT_DOWN' } },
    /** The computer's agent is not signed in to this account: the assistant says so. */
    /** The computer's agent is signed out: the box offers to sign it in at the press. The press signs it in
     *  and the status proves it; the page's own status stays signed out here, so the box then says to press again. */
    aiLogin: signedOut(),
    /** Its login was rejected (a Hub sign-out revokes the key): signed out again. */
    aiLoginRenew: signedOut({ signIn: 'renew' as const }),
    /** The sign-in is still out (to shoot the busy line). */
    aiLoginBusy: signedOut({}, answers.slow({}, 120_000)),
    /** The sign-in's answer is lost and the status never says signed in: may have been signed in, Check again. */
    aiLoginUnknown: signedOut({}, answers.pending5xx(502), OUT),
    /** Refusals, each with its words. */
    aiLoginKey: signedOut({}, answers.refused(401, 'token_rejected')),
    aiLoginComputer: signedOut({}, answers.refused(409, 'credential_present')),
    aiLoginNotBox: signedOut({}, answers.refused(403, 'login_not_for_this_box')),
    aiLoginDisabled: signedOut({}, answers.refused(404, 'not_found')),
    aiLoginOther: signedOut({}, answers.refused(409, 'agent_login_conflict')),
    aiLoginAdmin: signedOut({}, answers.refused(403, 'admin_login_refused')),
    /** The agent is signed in to another account, or has not said which: the assistant says so, no box. */
    aiAccount: { ...base, overview: atlasAgent({ templates: true, writer: false, writerWhy: 'account' as const, guardedDelete: true }) },
    aiIdentity: { ...base, overview: atlasAgent({ templates: true, writer: false, writerWhy: 'identity' as const, guardedDelete: true }) },
    /** A row's Run now answers "may have gone through". */
    triggerPending: { ...base, overview: { data: longOverview }, trigger: pend },
    /** A second Run now while the earlier run is still unsettled: the kit refuses it. */
    triggerHeld: { ...base, overview: { data: longOverview }, trigger: { outcome: 'not_sent' as const, code: 'READ_BACK_FIRST' } },
    /** A row's Run now is refused by the kit (a definite failure: nothing started). */
    triggerFailed: { ...base, overview: { data: longOverview }, trigger: { outcome: 'failed' as const, code: 'SCRIPT_BUSY' } },
    /** A row's Run now was never sent. */
    triggerNotSent: { ...base, overview: { data: longOverview }, trigger: { outcome: 'not_sent' as const, code: 'OFFLINE' } },
    /** Atlas keeps scripts in Exec folder 3 too, and that folder is exclusive (open the page at ?exec=3). */
    folder3: { ...base, overview: { data: { computers: overview.computers.map((c) => (c === atlasComp ? { ...c, rows: [...c.rows, ...b3.rows], summary: { ...c.summary, ...b3.summary } } : c)) } }, files: { data: { ...b.files, ...b3.files } }, exclusive: { data: true } },
    /** Being built: three builds, one on a computer not shown. */
    builds: { ...base, builds: { data: builds } },
    /** No script on the computer yet, and a build. */
    buildsEmpty: { ...base, overview: { data: { computers: [{ ...atlasComp, rows: [], summary: {}, instances: {}, aliases: [], deleted: [] }] } }, builds: { data: { ...builds, drafts: builds.drafts.slice(0, 1), asks: builds.asks.slice(0, 1) } } },
    /** No computer ready, and the builds: the section stays above the no-computer state. */
    buildsNoComputer: { ...base, overview: { data: { computers: [] } }, builds: { data: builds } },
    /** The shared store is full: the note counts builds and change requests. */
    buildsFull: { ...base, builds: { data: buildsFull } },
    /** A legacy New script ask beside a build. */
    buildsLegacy: { ...base, builds: { data: buildsLegacy } },
    /** The store cannot be read. */
    buildsUnreadable: { ...base, builds: { data: { ...builds, asks: 'unreadable' } } },
    /** The test fails. */
    testFails: { ...base, runTest: ok({ status: 500, ms: 120, body: 'TypeError: order.items is undefined', headers: [['content-type', 'text/plain']], size: 35 }) },
  },
});
