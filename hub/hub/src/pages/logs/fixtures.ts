// Fake-API states of the logs page for hub:dev, hub:shots, tests and specs. Every name comes from
// core's fixture world (atlas, support-desk, the world's programs and scripts). A state is a
// `world` (what the computer holds and how its reads go, world.ts) and the `computer` the page
// shows; data.ts answers every read from it through the page's real controller.
import { defineFixtures } from '@app/fixtures';
import { answers, fixtureWorld as W, ipLookupRoute, providers, reply, worldColours, type FixtureRequest, type FixtureRule } from '@core';
import { loadCatalogue7k } from '@kit';
import type { Row } from './fake-kit';
import { fixtureApi, type World } from './world';
import { installFixtureApi } from './fixtureApiSeam';

// The page reaches the fixture api through the seam only (fixtureApiSeam.ts): installed when these fixtures load.
installFixtureApi(fixtureApi);

const NOW = Date.now();
const MIN = 60_000;
const atlas = W.computer('atlas');
const running = { id: atlas.id, projectId: atlas.project_id, name: atlas.name, running: true };
const stopped = { ...running, running: false };

const FREE = 'hoody-ai/hoody-free';
const programNames = W.programs.filter((p) => p.computer === 'atlas').map((p) => p.program);
const botNames = W.bots.filter((b) => b.computer === 'atlas').map((b) => b.name);
const PATHS: Record<string, string[]> = {
  files: ['/download/report.pdf', '/upload', '/list', '/download/backup.tar.gz', '/share/ada'],
  terminal: ['/session', '/session/resize', '/ws'],
  agent: ['/api/v1/sessions', '/api/v1/chat', '/health'],
  browser: ['/tab/1', '/tab/2/screenshot'],
  screen: ['/stream', '/input'],
};
const METHOD = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE'];
const hex = (n: number, len: number) => (Math.imul(n + 1, 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(Math.ceil(len / 8)).slice(0, len);

/** `count` kit rows over the last `spanMin` minutes (ids ascending), about one row in ten a problem; `burst` failures land in one minute `burstAgoMin` ago. */
function visits(count: number, spanMin = 58, o: { burst?: number; burstAgoMin?: number; long?: boolean } = {}): Row[] {
  const rows: Row[] = [];
  const step = (spanMin * MIN) / count;
  for (let i = 0; i < count; i++) {
    const service = programNames[i % programNames.length] === 'terminal' ? 'terminal' : (programNames[(i * 7) % programNames.length] as string);
    const status = i % 23 === 5 ? 500 : i % 11 === 3 ? 404 : i % 29 === 7 ? 403 : i % 37 === 9 ? 429 : 200;
    const path = (PATHS[service] || ['/'])[i % (PATHS[service] || ['/']).length] as string;
    rows.push({
      id: 0, tsMs: Math.round(NOW - spanMin * MIN + i * step), level: 'info', status, source: 'edge', kind: 'request', serviceName: service,
      method: METHOD[i % METHOD.length] as string, url: o.long && i % 5 === 0 ? `${path}?token_ref=${hex(i, 48)}&redirect=/very/long/path/${hex(i + 1, 64)}/${hex(i + 2, 64)}` : path,
      durationMs: 12 + ((i * 37) % 480), traceId: hex(i, 32), clientIp: `93.184.216.${1 + ((i * 13) % 250)}`,
    });
  }
  if (o.burst) {
    const at = NOW - (o.burstAgoMin ?? 14) * MIN;
    for (let i = 0; i < o.burst; i++) {
      rows.push({ id: 0, tsMs: at + i * 1200, level: 'error', status: 500, source: 'edge', kind: 'request', serviceName: 'files', method: 'GET', url: '/download/report.pdf', durationMs: 900 + i * 7, traceId: hex(900 + i, 32), clientIp: `203.0.113.${(i * 7) % 250}` });
    }
  }
  rows.sort((a, b) => a.tsMs - b.tsMs);
  rows.forEach((r, i) => { r.id = i + 1; });
  return rows;
}

/** Bot calls (data.bot_label and the door and result the Bot call row names). */
function botCalls(from: number, n: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 0, tsMs: NOW - (50 - i * 4) * MIN, level: i % 6 === 2 ? 'error' : i % 6 === 4 ? 'warn' : 'info', status: i % 6 === 2 ? 502 : 200, source: 'edge', kind: 'request', serviceName: 'bots', method: 'POST',
      url: '/bots/' + (botNames[i % botNames.length] as string), durationMs: 800 + i * 53, traceId: hex(300 + i, 32),
      data: { bot_label: botNames[i % botNames.length], bot_door: i % 2 ? 'link' : 'chat', bot_exposure: i % 2 ? 'public' : 'private', bot_caller_name: i % 2 ? 'Visitor' : 'Ada', bot_result: i % 6 === 2 ? 'failed' : 'answered', ...(i % 6 === 2 ? { bot_limit: { scope: 'bot', kind: 'daily', max: 200, retry_at: '2026-10-31T00:00:00Z' } } : {}) },
    });
  }
  return out.map((r, i) => ({ ...r, id: from + i }));
}

function decisions(from: number): Row[] {
  return [0, 1, 2].map((i) => ({ id: from + i, tsMs: NOW - (20 + i * 9) * MIN, level: i === 1 ? 'warn' : 'info', source: 'backend', kind: 'decision', url: i === 1 ? '/admin' : '/', data: { decision: i === 1 ? 'refused' : 'allowed' } }));
}

function merged(base: Row[]): Row[] {
  const all = [...base, ...botCalls(0, 8), ...decisions(0)].sort((a, b) => a.tsMs - b.tsMs);
  all.forEach((r, i) => { r.id = i + 1; });
  return all;
}

const changes = ['computer.started', 'computer.renamed', 'realm.assigned', 'ssh_key.replaced', 'computer.stopped', 'program.started'].map((event_type, i) => ({
  id: `chg${i + 1}`, created_at: new Date(NOW - (25 + i * 130) * MIN).toISOString(), event_type, resource_type: i === 2 ? 'realm' : 'computer', resource_id: atlas.name,
}));
const account = [['POST', 200, '/users/auth/login'], ['GET', 200, '/users/auth/activity'], ['POST', 401, '/users/auth/login'], ['DELETE', 200, '/keys/ci-deploy'], ['POST', 500, '/billing/topup']].map(([method, status_code, path], i) => ({
  id: `act${i + 1}`, created_at: new Date(NOW - (10 + i * 70) * MIN).toISOString(), method, status_code, path, ip_address: `93.184.216.${40 + i}`,
}));
const helper = Array.from({ length: 24 }, (_, i) => ({
  seq: i + 1, time: new Date(NOW - (60 - i * 2) * MIN).toISOString(), level: i % 9 === 4 ? 'error' : i % 5 === 2 ? 'warn' : 'info', component: i % 2 ? 'session' : 'tools',
  message: i % 9 === 4 ? 'tool call failed: the command exited with status 2' : i % 5 === 2 ? 'model answered slowly (6.2 s)' : 'turn finished',
}));

const programs = [
  { id: 1, name: 'web', port_range: undefined },
  { id: 2, name: 'api', port_range: { start: 8000, end: 8003 } },
  { id: 3, name: 'worker', port_range: undefined },
  { id: 4, name: 'hoody-terminal', port_range: undefined, hoody_kit: true },
  { id: 5, name: 'hoody-exec', port_range: undefined, hoody_kit: true },
];
const programLogs: Record<string, string> = {
  '1:stdout': Array.from({ length: 60 }, (_, i) => `[${new Date(NOW - (60 - i) * 30_000).toISOString().slice(11, 19)}] GET /health 200 ${3 + (i % 5)}ms`).join('\n'),
  '1:stderr': 'warning: deprecated option "legacy_cache" ignored\nwarning: slow query (1.2 s)\n',
  '2:stdout': Array.from({ length: 40 }, (_, i) => `request ${i + 1} handled in ${10 + i} ms`).join('\n'),
  '2:stderr': '',
  '3:stdout': 'worker started\nwaiting for jobs\n',
  '3:stderr': Array.from({ length: 12 }, (_, i) => `error: job ${i + 40} failed: connection refused`).join('\n'),
  '4:stdout': 'terminal server listening\n',
  '4:stderr': '',
  '5:stdout': 'exec server listening\n',
  '5:stderr': '',
};
const runs = {
  'deploy-site.sh': Array.from({ length: 14 }, (_, i) => ({
    executionId: `run${String(i + 1).padStart(4, '0')}`, receivedAt: new Date(NOW - (12 + i * 41) * MIN).toISOString(), method: 'POST', path: 'deploy-site.sh', status: i % 5 === 1 ? 500 : 200,
    durationMs: 4200 + i * 310, outcome: i % 5 === 1 ? 'failed' : 'ok', error: i % 5 === 1 ? 'exit status 2' : undefined,
  })),
};
const runOutput = Object.fromEntries(runs['deploy-site.sh'].map((r, i) => [r.executionId, {
  lines: ['building site…', 'copying 212 files', i % 5 === 1 ? 'error: upload failed: connection reset' : 'done in 4.2 s'], totalLines: 3,
}]));

const models = { items: [{ spec: FREE, display_name: 'Hoody Free', source: 'provider' }, { spec: 'openai/gpt-5', display_name: 'GPT-5', source: 'provider', cost_in: 1.25, cost_out: 10 }] };
const answer = { status: 'ok', model: FREE, stop_reason: 'end_turn', text: 'The same download failed **18 times** in two minutes, all on `files-1`.\n\n- **HTTP 507** means the disk behind the Files program ran out of space, around 14:02.\n- Nothing else in these lines failed.\n\nFree some space, then try the download again.' };

/**
 * The computer's agent as the Explain drawer's model chooser reads it (core provider routes): Hoody AI included and
 * ready, OpenAI's key not set, so GPT-5 reads "needs a key" and Hoody Free ready.
 */
const st = (state: string) => ({ state, via: state === 'ready' ? 'included' : 'stored_key', methods: state === 'ready' ? [] : ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });
// GET /ip/lookup: a country for each public address, by its last number (about one in seven has none), so the fixture
// states show flags, a few bare addresses and the loading slot.
const COUNTRIES = ['FR', 'US', 'DE', 'SG', 'JP', 'BR', 'GB', 'IN', 'AU', 'ZA'];
const ipLookup = reply(ipLookupRoute, (req: FixtureRequest) => ({
  status: 200,
  body: {
    data: Object.fromEntries(
      (req.query.ip ?? '').split(',').filter(Boolean).map((ip) => {
        const n = Number(ip.split('.')[3]);
        return [ip, n % 7 === 6 ? null : { ip, country: COUNTRIES[n % COUNTRIES.length] }];
      }),
    ),
  },
}));

const providerRules: FixtureRule[] = [
  ipLookup,
  reply(providers.providerRoutes.version, answers.ok({ api_version: '1', supported: ['1'], available: ['1'], pinned_realm: null })),
  reply(providers.providerRoutes.providers, answers.ok({ providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('needs_key') },
  ] })),
  reply(providers.providerRoutes.models, (req: FixtureRequest) => answers.ok({ models: req.query.ready === 'true' ? [{ spec: FREE }] : models.items.map((m) => ({ spec: m.spec, display_name: m.display_name })) })),
];

/**
 * The model picker's benchmark for Explain: the real chat catalogue (catalogue7k 'freeOnly': 206 providers, 7,078
 * models, only Hoody Free ready), on the chooser's reads and on the page's own /models read alike. Loaded on demand, so
 * the fixture stays out of every chunk but this dev-only one.
 */
const { catalogue7k, okBody } = await loadCatalogue7k();
// Built on the first request or read of the explain7k state only: most files that load these fixtures never show it.
let reads7kOnce: ReturnType<typeof catalogue7k> | undefined;
const reads7k = () => (reads7kOnce ??= catalogue7k('freeOnly'));
const rules7k: FixtureRule[] = [
  ipLookup,
  reply(providers.providerRoutes.version, () => reads7k().version),
  reply(providers.providerRoutes.providers, () => reads7k().providers),
  reply(providers.providerRoutes.models, (req: FixtureRequest) => (req.query.ready === 'true' ? reads7k().ready : reads7k().models)),
  reply(providers.providerRoutes.auth, (req: FixtureRequest) => reads7k().auth(req.path.split('/')[2] ?? '')),
];
type Model7k = { spec: string; display_name: string; source: 'provider' | 'fusion' };
let models7kItems: Model7k[] | undefined;
const models7k: { readonly items: Model7k[] } = {
  get items() {
    return (models7kItems ??= (okBody(reads7k().models)?.models ?? []).map((m) => ({ spec: m.spec, display_name: m.display_name, source: m.source })));
  },
};

function world(kit: Row[], extra: Partial<World> = {}): World {
  return {
    kit, changes, account, helper, programs, programLogs, runs, runOutput, models, agents: { items: [{ name: 'general', is_configured_default: true }] }, complete: answer,
    helperExport: '', delayMs: 120, ...extra,
  };
}

const many = merged(visits(320, 58, { burst: 40 }));
const state = (w: World, computer: unknown = running, rules: FixtureRule[] = providerRules) => ({ computer: { data: computer }, world: { data: w }, rules });

export default defineFixtures({
  default: 'many',
  states: {
    many: state(world(many)),
    quiet: state(world(merged(visits(40)))),
    long: state(world(merged(visits(120, 58, { long: true })))),
    manyRows: state(world(merged(visits(1900, 58, { burst: 60 })), { delayMs: 60 })),
    empty: state(world([], { changes: [], account: [], helper: [] })),
    loading: { computer: { data: running }, world: { pending: true } },
    error: state(world(many, { faults: { logs: { status: 500, code: 'internal_error' }, stats: { status: 500 } } })),
    private: state(world(many, { faults: { logs: { status: 403 }, stats: { status: 403 } } })),
    blocked: state(world(many, { faults: { logs: { kind: 'unreachable' }, stats: { kind: 'unreachable' } } })),
    rate: state(world(many, { faults: { logs: { status: 429, retryAfterMs: 20 } } })),
    quota: state(world(many, { faults: { logs: { code: 'audit_quota_exceeded', retryAfterMs: 600_000 } } })),
    oldKit: state(world(many, { oldKit: true })),
    partial: state(world(many, { faults: { changes: { status: 500 } } })),
    stopped: { computer: { data: stopped }, world: { data: world(many) } },
    noComputer: { computer: { data: null }, world: { data: world(many) } },
    live: state(world(many, { liveEveryMs: 2500, liveMax: 20 })),
    exportFails: state(world(many, { failAfter: { logs: 4 } })),
    explainLost: state(world(many, { faults: { complete: { kind: 'pending', pending: true } } })),
    explainBusy: state(world(many, { faults: { complete: { status: 429, code: 'rate_limited' } } })),
    explain7k: state(world(many, { models: models7k }), running, rules7k),
    helperOld: state(world(many, { faults: { helper: { status: 404 } } })),
    scriptsOld: state(world(many, { noRuns: true })),
    // The computer's colour (core worldColours): atlas blue, on the Computer filter's option.
    colours: state(world(many), { ...running, color: worldColours.atlas }),
  },
});
