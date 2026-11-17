// The sample account of `hoody hub --demo` (demo-client.ts, demo-answers.ts, demo-world.gen.json): it is plain data
// recorded from the current fixtures, holds nothing secret-shaped and no real host, every hand-written answer is what
// the API's schema of that route accepts, every read it answers is one the Hub declares, and it refuses every change.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_ACTIVITY, DEMO_AGENT_CAPS, DEMO_ANSWERS, DEMO_BOT_LABEL, DEMO_BOT_LOGS, DEMO_BOTS, DEMO_CHATS, DEMO_DAEMON_PROGRAMS, DEMO_FILE_TEXT, DEMO_FILES, DEMO_MODELS, DEMO_COMPUTERS, DEMO_NOTES, DEMO_NOTICES, DEMO_PROGRAM_LOGS, DEMO_PROJECTS, DEMO_REFERRAL_CODES, DEMO_RUNS, DEMO_SANDBOXED, DEMO_SCHEDULES, DEMO_SCRIPT_CODE, DEMO_SCRIPTS, DEMO_TICKETS, DEMO_TUNNEL_SESSION, DEMO_VAULT_VALUES, DEMO_VISITS, DEMO_WAIT_ASK, demoAnswer, demoKitAnswer, demoRuntimeInfo } from './demo-answers';
import { capsState, parseMe, parseRecent } from '../../../src/pages/notes/logic';
import { caps as scriptCaps, execOf } from '../../../src/pages/scripts/logic';
import { zoneOfUrl } from '../../../src/pages/bots/logic';
import { channelSettingsOf, logOf, viewOf, voiceCapsOf } from '../../../src/pages/bots/data';
import { capsOk, readiness } from '../../../src/ask/logic';
import { historyFrom } from '../../../src/ask/conv';
import { emptyBook, onState } from '../../../src/ask/gates';
import { selectList, selectThread } from '../../../src/pages/support/logic';
import { folderOf, rootListingOf } from '../../../src/pages/files/logic';
import { foundOf, textOf } from '../../../src/pages/files/ro.pure';
import { readStatus } from '../../../src/pages/programs/sandbox/model';
import { readHost } from '../../../src/pages/programs/sandbox/block';
import { membersFrom, ownOf, projectComputersOf } from '../../../src/pages/computers/parts/projectPerms.logic';
import { modeOf, projectRulesOf, rulesFrom } from '../../../src/pages/computers/parts/access.logic';
import { classifyRuntime, portListening } from '../../../src/core/computerRuntime';
import { checkWords } from '../../../src/pages/referrals/logic';
import { profileOf } from '../../../src/pages/account/data';
import { normalizeStockRow } from '../../../src/core/commerce-pure';
import { commandsOf } from '../../../src/pages/computers/parts/ServerDetail.commands.logic';
import { runtimeOf } from '../../../src/pages/computers/parts/ServerDetail.logic';
import { programModel } from '../../../src/core/program-model';
import { joinRows, parseBindings, parseHealth, parseSessions, parseTunnels, tunnelProgram } from '../../../src/pages/tunnels/logic';
import { loadSchedules, type Call } from '../../../src/pages/schedules/live';
import { parseNoticeList } from '../../../src/pages/notifications/abuseLogic';
import { parseSchema } from '../../../src/pages/scripts/magic';
import * as LR from '../../../src/pages/logs/rules';
import { fakeLogsDb } from '../../../src/pages/logs/fake-kit';
import { DEMO_CLIENT, DEMO_CONTEXT, demoClient, realmOfBase, selectorOf, shiftTimes } from './demo-client';
import { DEMO_DOMAIN, demoSourceHash } from './demo-source';
import world from './demo-world.gen.json';

const W = world as unknown as { source: string; recordedAt: string; account: string; records: Array<{ leg: string; method: string; url: string; status: number; body: unknown; raw?: boolean; at?: string }> };
const SRC = path.join(import.meta.dir, '../../../src');
/** The path a hand answer is checked at: its own, or a `:id` route's sample. */
const at = (a: (typeof DEMO_ANSWERS)[number]): string => a.sample ?? a.path;
const TEXT = fs.readFileSync(path.join(import.meta.dir, 'demo-world.gen.json'), 'utf8') + '\n' + JSON.stringify(DEMO_ANSWERS.map((a) => demoAnswer('GET', at(a), 0))) + '\n' + JSON.stringify([DEMO_BOTS, DEMO_NOTES, DEMO_SCHEDULES, DEMO_SCRIPTS, DEMO_TICKETS, DEMO_BOT_LOGS, DEMO_FILES, DEMO_FILE_TEXT, DEMO_ACTIVITY, DEMO_SCRIPT_CODE, DEMO_PROGRAM_LOGS, DEMO_VAULT_VALUES, DEMO_CHATS, DEMO_RUNS, DEMO_VISITS])
  + '\n' + JSON.stringify(['/version', '/tools', ...DEMO_CHATS.flatMap((x) => ['', '/turns', '/transcript', '/state'].map((r) => `/sessions/${x.id}${r}`))].map((p) => demoKitAnswer(`https://${DEMO_CONTEXT.projectId}-${DEMO_CONTEXT.containerId}-agent-1.n12.${DEMO_DOMAIN}/api/v1/agent${p}`, 0)))
  + '\n' + JSON.stringify(['daemon/programs/overview', 'tunnel/tunnels', 'tunnel/sessions', 'tunnel/bindings', 'tunnel/health'].map((p) => demoKitAnswer(`https://${DEMO_CONTEXT.projectId}-${DEMO_CONTEXT.containerId}-${p.split('/')[0]}-1.n12.${DEMO_DOMAIN}/api/v1/${p}`, 0)));

type Schema = { $ref?: string; type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; nullable?: boolean; additionalProperties?: boolean | Schema; anyOf?: Schema[]; oneOf?: Schema[]; allOf?: Schema[] };
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '..', '..', '..', '..', '..', 'generated', 'openapi.public.json'), 'utf8')) as { paths: Record<string, Record<string, { operationId?: string; responses: Record<string, { content?: Record<string, { schema: Schema }> }> }>>; components: { schemas: Record<string, Schema> } };
function apiGet(hubPath: string) {
  for (const p of [`/api/v1${hubPath}`, `/api/v1${hubPath}/`]) { const op = spec.paths[p]?.get; if (op?.operationId?.startsWith('api_')) return op; }
  return undefined;
}
/** Problems of `v` against `s` (the rule of fake-empty.term.test.ts, without patterns). */
function check(v: unknown, s: Schema, at: string): string[] {
  if (s.$ref) return check(v, spec.components.schemas[s.$ref.split('/').pop()!]!, at);
  if (s.allOf) return s.allOf.flatMap((x) => check(v, x, at));
  if (s.anyOf || s.oneOf) return (s.anyOf ?? s.oneOf)!.some((x) => check(v, x, at).length === 0) ? [] : [`${at}: matches no alternative`];
  if (Array.isArray(s.type)) {
    const types = s.type.filter((t) => t !== 'null');
    if (v === null) return s.type.includes('null') ? [] : [`${at}: null where ${types.join(' or ')} is required`];
    const each = types.map((t) => check(v, { ...s, type: t }, at));
    return each.some((e) => e.length === 0) ? [] : (each[0] ?? []);
  }
  if (v === null) return s.nullable ? [] : [`${at}: null where ${s.type ?? 'a value'} is required`];
  const out: string[] = [];
  if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} not in ${JSON.stringify(s.enum)}`);
  switch (s.type) {
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) return [`${at}: not an object`];
      const o = v as Record<string, unknown>;
      for (const r of s.required ?? []) if (!(r in o)) out.push(`${at}.${r}: required`);
      for (const [k, x] of Object.entries(o)) { const ps = s.properties?.[k]; if (ps) out.push(...check(x, ps, `${at}.${k}`)); else if (s.additionalProperties === false || s.properties) out.push(`${at}.${k}: not in the schema`); }
      return out;
    }
    case 'array': return Array.isArray(v) ? [...out, ...v.flatMap((x, i) => (s.items ? check(x, s.items, `${at}[${i}]`) : []))] : [`${at}: not an array`];
    case 'string': return typeof v === 'string' ? out : [`${at}: not a string`];
    case 'integer': return Number.isInteger(v) ? out : [`${at}: not an integer`];
    case 'number': return typeof v === 'number' ? out : [`${at}: not a number`];
    case 'boolean': return typeof v === 'boolean' ? out : [`${at}: not a boolean`];
    default: return out;
  }
}
/** Every GET path the Hub declares for the Hoody API (defineRoute, tests excluded), as matchers (`:id` = one segment). */
function declaredGets(): RegExp[] {
  const out: RegExp[] = [];
  for (const f of new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: SRC })) {
    if (/\.(test|spec)\.tsx?$/.test(f)) continue;
    for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/defineRoute(?:<[^(]*?>)?\(\s*\{\s*method:\s*["']GET["'],\s*path:\s*["']([^"']+)["']/g)) {
      out.push(new RegExp('^' + m[1]!.split('/').map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$'));
    }
  }
  return out;
}

const GETS = declaredGets();

describe('the recorded sample world', () => {
  test('is recorded from the current fixture sources (run scripts/term/demo-record.ts after a fixture change)', () => {
    expect(W.source).toBe(demoSourceHash(SRC));
  });
  test('holds only GET answers, every Hoody API read is a route the Hub declares, every other read goes to the demo domain', () => {
    const gets = GETS;
    expect(W.records.length).toBeGreaterThan(20);
    for (const r of W.records) {
      expect(r.method).toBe('GET');
      if (r.leg === 'hoody') expect(gets.some((g) => g.test(r.url.replace(/[?#].*$/s, ''))), r.url).toBe(true);
      else expect(new URL(r.url).hostname.endsWith('.' + DEMO_DOMAIN), r.url).toBe(true);
    }
  });
  test('holds nothing secret-shaped, no real host and no address but the sample person\'s', () => {
    // Key and token shapes of the platform (a masked hint like `hdy_…3f9a` is not one).
    expect(TEXT.match(/\b(?:hdy|hbk|hsk|sk|pk|ghp|gho)_[A-Za-z0-9]{8,}/g) ?? []).toEqual([]);
    expect(TEXT.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g) ?? []).toEqual([]);
    // Reserved names (RFC 2606) and their subdomains; and the product's own public site, that exact host only (a
    // notification links its help page): no subdomain of it, no other real domain.
    const reserved = /^hoody\.com$|(?:^|\.)(?:invalid|test|example|localhost|example\.(?:com|net|org))$/;
    expect(['hoody.com', 'a.example.com', 'x.demo.invalid'].every((h) => reserved.test(h))).toBe(true);
    expect(['api.hoody.com', 'www.hoody.com', 'nothoody.com', 'hoody.com.evil.net', 'hoody.net'].some((h) => reserved.test(h))).toBe(false);
    const hosts = new Set<string>();
    for (const m of TEXT.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) hosts.add(m[1]!.toLowerCase());
    for (const m of TEXT.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) hosts.add(m[1]!.toLowerCase());
    expect([...hosts].filter((h) => !reserved.test(h))).toEqual([]);
    // Outside an address too: the product's name before a dot is its public site, a reserved example name or the vault
    // key of the realm names, nothing else.
    expect(TEXT.match(/\bhoody\.(?!(?:com|example|realm-aliases)\b)[a-z]{2,}\b/gi) ?? []).toEqual([]);
    const mails = new Set([...TEXT.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase()));
    for (const m of mails) expect(/@(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$|\.(?:invalid|test|example)$/.test(m), m).toBe(true);
  });
  test('every IPv4 address is a documentation, private or loopback one (recorded and hand-written)', () => {
    const sample = (ip: string): boolean => /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.|^10\.|^127\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\.|^0\.0\.0\.0$/.test(ip);
    expect(['203.0.113.9', '10.1.2.3', '172.31.0.1'].every(sample)).toBe(true);
    expect(['93.184.216.34', '172.32.0.1', '8.8.8.8'].some(sample)).toBe(false);
    const hand = JSON.stringify(DEMO_ANSWERS.map((a) => demoAnswer('GET', at(a), 0)));
    const ips = new Set([...(TEXT + hand).matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)].map((m) => m[0]));
    expect(ips.size).toBeGreaterThan(3);
    expect([...ips].filter((ip) => !sample(ip))).toEqual([]);
  });
});

/** The API's GET of a recorded address (`{id}` segments matched), or undefined. */
function apiGetOf(url: string) {
  const bare = `/api/v1${url.replace(/[?#].*$/s, '')}`;
  for (const [p, ops] of Object.entries(spec.paths)) {
    if (!ops.get?.operationId?.startsWith('api_')) continue;
    if (new RegExp('^' + p.replace(/\/$/, '').split('/').map((x) => (/^\{.*\}$/.test(x) ? '[^/]+' : x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '/?$').test(bare)) return ops.get;
  }
  return undefined;
}
/** Required fields the recorded answers lack, per read (the sample world comes from the Hub's fixtures, which hold
 *  what the pages read, not every field the API sends). A page that starts to read one of these gets nothing in the
 *  demo: complete the fixture, record again, and take the line out. A new gap fails here. */
const ENVELOPE = ['.message', '.statusCode'];
const KNOWN_GAPS: Readonly<Record<string, readonly string[]>> = {
  '/auth/tokens': ENVELOPE,
  '/auth/tokens/templates': ['.data[].description'],
  '/projects': ['.data.projects[].created_at', '.data.projects[].updated_at', ...ENVELOPE],
  '/proxy/aliases': ENVELOPE,
  '/realms': ['.data.total', ...ENVELOPE],
  '/servers': ['.data[].id'],
  '/users/auth/me': ENVELOPE,
  '/vault/keys': ['.message'],
  '/vault/keys/hoody.realm-aliases': ['.data.created_at', '.data.key', '.data.realm_id', '.data.size_bytes', '.data.updated_at', ...ENVELOPE],
  '/vault/stats': ['.message'],
};
describe('recorded answers against the API\'s schemas', () => {
  test('every recorded Hoody API read has a 200 schema; the required fields it lacks are exactly the listed ones', () => {
    const gaps: Record<string, string[]> = {};
    let checked = 0;
    for (const r of W.records) {
      if (r.leg !== 'hoody' || r.status !== 200) continue;
      const schema = apiGetOf(r.url)?.responses['200']?.content?.['application/json']?.schema;
      expect(schema, r.url).toBeDefined();
      checked++;
      const missing = [...new Set(check(r.body, schema!, '').filter((x) => x.endsWith(': required')).map((x) => x.replace(/\[\d+\]/g, '[]').replace(/: required$/, '')))].sort();
      if (missing.length > 0) gaps[r.url.replace(/[?#].*$/s, '')] = [...new Set([...(gaps[r.url.replace(/[?#].*$/s, '')] ?? []), ...missing])].sort();
    }
    expect(checked).toBeGreaterThan(15);
    expect(gaps).toEqual(KNOWN_GAPS as Record<string, string[]>);
  });
});

describe('the hand-written answers', () => {
  const gets = GETS;
  for (const a of DEMO_ANSWERS) {
    test(`${a.path}: a declared Hub GET route, and the API's 200 schema accepts the body`, () => {
      expect(gets.some((g) => g.test(a.path))).toBe(true);
      const schema = (a.sample ? apiGetOf(a.sample) : apiGet(a.path))?.responses['200']?.content?.['application/json']?.schema;
      expect(schema).toBeDefined();
      const got = demoAnswer('GET', at(a), Date.parse('2026-11-12T00:00:00Z'));
      expect(got).not.toBeNull();
      expect(check(got, schema!, a.path)).toEqual([]);
    });
  }
  test('the checker refuses a wrong body', () => {
    const s = apiGet('/wallet/balances')!.responses['200']!.content!['application/json']!.schema;
    expect(check({ statusCode: 200, message: 'OK', data: { general_balance: 0, extra: 1 } }, s, 'x').length).toBe(2);
  });
});

describe('the sample Bots', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string; realm_ids: string[] }> } }).data.computers;
  const agentOf = (id: string, q: string): string => `https://${computers.find((c) => c.id === id)!.project_id}-${id}-agent-1.n12.${DEMO_DOMAIN}/api/v1/agent/bots${q}`;
  const names = (id: string, q = '?limit=100&realm=all'): string[] => (demoKitAnswer(agentOf(id, q), NOW)!.body as { items: Array<{ name: string }> }).items.map((b) => b.name);
  test('every computer this file names is a recorded computer of that name, and a Bot lives in its computer\'s realm', () => {
    for (const [id, name] of Object.entries(DEMO_COMPUTERS)) expect(computers.find((c) => c.id === id)?.name).toBe(name);
    for (const b of DEMO_BOTS) {
      expect(computers.find((c) => c.id === b.computer)!.realm_ids).toContain(b.realm);
      expect(b.uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(DEMO_BOTS.map((b) => b.uid)).size).toBe(DEMO_BOTS.length);
  });
  test('each computer answers its own Bots, by realm, and a computer with none answers an empty list', () => {
    const [atlas, borealis, cedar] = ['atlas', 'borealis', 'cedar'].map((n) => computers.find((c) => c.name === n)!.id) as [string, string, string];
    expect(names(atlas)).toEqual(['support-desk', 'release-notes']);
    expect(names(borealis)).toEqual(['inbox-triage']);
    expect(names(cedar)).toEqual([]);
    expect(names(atlas, `?realm=${computers.find((c) => c.id === borealis)!.realm_ids[0]}`)).toEqual([]);
    expect(demoKitAnswer('https://example.com/api/v1/agent/bots', NOW)).toBeNull();
    expect(demoKitAnswer(agentOf(atlas, '').replace('/bots', '/other'), NOW)).toBeNull();
  });
  test('every computer\'s agent answers what the Bot drawers and the model pickers read, in the shape each reader takes', () => {
    const [atlas, borealis] = ['atlas', 'borealis'].map((n) => computers.find((c) => c.name === n)!.id) as [string, string];
    for (const id of [atlas, borealis]) {
      const get = (path: string): Record<string, unknown> => demoKitAnswer(agentOf(id, '').replace('/bots', path), NOW)!.body as Record<string, unknown>;
      // Ask's four capabilities at session protocol 3 (ask/logic.ts capsOk), each supported and available; no voice one
      // (pages/bots voiceCapsOf: voice is off in the demo), no approval_policy, no acp_default.
      const version = get('/version');
      expect(version).toMatchObject({ session_protocol_version: 3, api_version: '1' });
      expect((version.capabilities as Array<{ name: string; supported: boolean; available: boolean }>).map((x) => `${x.name}:${x.supported}:${x.available}`)).toEqual(DEMO_AGENT_CAPS.map((n) => `${n}:true:true`));
      expect(capsOk(version)).toBe(true);
      expect(Object.values(voiceCapsOf(version)).some(Boolean)).toBe(false);
      expect(readiness(version, get('/hoody/auth/status'), W.account)).toMatchObject({ state: 'ready', restricted: false, pinned: null });
      for (const p of ['/health', '/computers', '/acp/agents', '/tools']) expect(demoKitAnswer(agentOf(id, '').replace('/bots', p), NOW)?.status, p).toBe(200);
      // core/agent-signin.ts agentLoginOf answers 'ready' for exactly this: active, this account, a fingerprint, a known restriction.
      expect(get('/hoody/auth/status')).toEqual({ auth_active: true, account_id: W.account, owner_fingerprint: expect.stringMatching(/.+/), restriction: 'none', identity_unavailable: false, last_error: null });
      // core/providers/catalogue.ts: providers with a prefix and a status; models by spec, each under a listed provider.
      const provs = get('/providers').providers as Array<{ id: string; prefix: string; status: { state: string } }>;
      expect(provs.every((p) => p.prefix === `${p.id}/` && p.status.state === 'ready')).toBe(true);
      const models = (demoKitAnswer(agentOf(id, '').replace('/bots', '/models') + '?ready=true', NOW)!.body as { models: typeof DEMO_MODELS }).models;
      expect(models).toEqual(DEMO_MODELS);
      for (const m of models) expect(provs.some((p) => m.spec.startsWith(p.prefix)), m.spec).toBe(true);
      // pages/bots helperAgentsOf: an items list; 'bot' is the Bot's own agent; one configured default; distinct names.
      const agents = get('/agents').items as Array<{ name: string; model: string; is_configured_default?: boolean }>;
      expect(agents.map((a) => a.name)).toContain('bot');
      expect(new Set(agents.map((a) => a.name)).size).toBe(agents.length);
      expect(agents.filter((a) => a.is_configured_default === true)).toHaveLength(1);
      for (const a of agents) if (a.model) expect(models.some((m) => m.spec === a.model), a.model).toBe(true);
    }
  });
  test('a new Bot is offered an address label the page accepts, under the demo domain', async () => {
    const d = (await demoClient(() => NOW).request('GET', '/bot-urls/suggest-label')) as { data: { label: string; url: string } };
    expect(d.data.label).toBe(DEMO_BOT_LABEL);
    expect(zoneOfUrl(d.data.url, d.data.label)).toBe(`bots.${DEMO_DOMAIN}`);
  });
  test('the client serves them: two computers never show the same Bot', async () => {
    const c = demoClient(() => NOW);
    const read = async (id: string): Promise<string[]> => ((await (await c.fetch(agentOf(id, '?limit=100&realm=all'))).json()) as { items: Array<{ name: string; last_activity: string }> }).items.map((b) => b.name);
    const all = (await Promise.all(computers.map((x) => read(x.id)))).flat();
    expect(all.sort()).toEqual(DEMO_BOTS.map((b) => b.id).sort());
  });
});

describe('the sample computers\' programs', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string }> } }).data.computers;
  const kit = (id: string, program: string, p: string): unknown => demoKitAnswer(`https://${computers.find((c) => c.id === id)!.project_id}-${id}-${program}-1.n12.${DEMO_DOMAIN}${p}`, NOW)?.body;
  test('Notes: the page\'s own parsers take every computer\'s answers, whole', () => {
    for (const c of computers) {
      expect(capsState(kit(c.id, 'notes', '/api/v1/notes/capabilities'))).toBe('ok');
      const me = parseMe(kit(c.id, 'notes', '/api/v1/notes/me'));
      expect(me).not.toBeNull();
      const recent = parseRecent(kit(c.id, 'notes', `/api/v1/notes/notebooks/${me!.notebookId}/recent`), me);
      expect(recent, c.name).not.toBeNull();
      expect(recent!.partial).toBe(false);
      expect(recent!.items.map((n) => n.title)).toEqual((DEMO_NOTES[c.id] ?? []).map((n) => n[0]));
      for (const n of recent!.items) expect(n.at! <= NOW).toBe(true);
      expect(new Set(recent!.items.map((n) => n.id)).size).toBe(recent!.items.length);
    }
    expect(Object.keys(DEMO_NOTES).every((id) => DEMO_COMPUTERS[id] !== undefined)).toBe(true);
    expect(kit(computers[0]!.id, 'notes', '/api/v1/notes/notebooks/0b0000000000000000000000/recent')).toBeUndefined();
  });
  test('Schedules: each entry is one the page keeps (its id and user rules), on its own computer, with its last run', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/; // pages/schedules/live.ts RE_UUID
    const seen: string[] = [];
    for (const c of computers) {
      expect(kit(c.id, 'cron', '/api/v1/cron/health')).toEqual({ status: 'ok' });
      expect((kit(c.id, 'cron', '/api/v1/cron/info') as { features: string[] }).features).toContain('entries_all');
      const list = kit(c.id, 'cron', '/api/v1/cron/entries') as { total: number; entries: Array<{ id: string; user: string; type: string; name: string; last_run: { entry_id: string; started_at: string } }> };
      expect(list.total).toBe(list.entries.length);
      for (const e of list.entries) {
        expect(e.id).toMatch(UUID);
        expect(e.user).toBe('user');
        expect(e.type).toBe('managed');
        expect(e.last_run.entry_id).toBe(e.id);
        expect(Date.parse(e.last_run.started_at)).toBeLessThan(NOW);
        seen.push(e.name);
      }
      for (const [program, p, key] of [['exec', '/api/v1/exec/schedules/list', 'schedules'], ['curl', '/api/v1/curl/schedule', 'items'], ['agent', '/api/v1/agent/loops', 'items']] as const) expect((kit(c.id, program, p) as Record<string, unknown>)[key]).toEqual([]);
    }
    expect(seen.sort()).toEqual(DEMO_SCHEDULES.map((x) => x.name).sort());
    for (const x of DEMO_SCHEDULES) expect(DEMO_COMPUTERS[x.computer]).toBeDefined();
  });
  test('Scripts: each computer lists its own files under folder 1, with a summary row each, and the page\'s capabilities', () => {
    const seen: string[] = [];
    for (const c of computers) {
      const health = kit(c.id, 'exec', '/api/v1/exec/health');
      expect(scriptCaps(health)).toEqual({ now: NOW, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true });
      const list = kit(c.id, 'exec', '/api/v1/exec/scripts/list') as { scripts: Array<{ path: string; type: string; magicComments: { label: string } }> };
      const sums = kit(c.id, 'exec', '/api/v1/exec/monitor/scripts-summary') as { scripts: Array<{ scriptPath: string; calls: number; failed: number }> };
      for (const r of list.scripts) { expect(execOf(r.path)).toBe(1); expect(r.type).toBe('file'); seen.push(r.magicComments.label); }
      expect(sums.scripts.map((x) => x.scriptPath)).toEqual(list.scripts.map((r) => r.path));
      for (const x of sums.scripts) expect(x.failed).toBeLessThanOrEqual(x.calls);
      expect(kit(c.id, 'exec', '/api/v1/exec/scripts/history/deleted')).toEqual({ entries: [] });
      expect(kit(c.id, 'agent', '/api/v1/agent/script-instances')).toEqual({ instances: [] });
    }
    expect(seen.sort()).toEqual(DEMO_SCRIPTS.map((x) => x.label).sort());
    for (const x of DEMO_SCRIPTS) expect(DEMO_COMPUTERS[x.computer]).toBeDefined();
    expect(kit(computers[0]!.id, 'exec', '/api/v1/exec/scripts/read')).toBeUndefined();
  });
  test('Logs: every computer\'s record names the features the page asks for and answers the overview read', () => {
    for (const c of computers) {
      for (const f of ['filters2', 'beforeId', 'buckets', 'retention']) expect((kit(c.id, 'logs', '/_logs/stats') as { features: string[] }).features).toContain(f);
      const all = kit(c.id, 'logs', '/_logs?limit=1000') as { entries: Array<{ id: number }>; newestId: number | null; retained: { oldestId: number } | null; retention: { hours: number } };
      expect(all.retention.hours).toBe(168);
      if (all.entries.length === 0) { expect(all.newestId).toBeNull(); expect(all.retained).toBeNull(); continue; }
      expect(all.newestId).toBe(all.entries[0]!.id);
      expect(all.retained!.oldestId).toBe(all.entries[all.entries.length - 1]!.id);
    }
  });
});

describe('what each computer runs (Programs, Tunnels and Schedules read the programs overview)', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string }> } }).data.computers;
  const kit = (id: string, program: string, p: string): unknown => demoKitAnswer(`https://${computers.find((c) => c.id === id)!.project_id}-${id}-${program}-1.n12.${DEMO_DOMAIN}${p}`, NOW)?.body;
  const atlas = DEMO_CONTEXT.containerId;
  type Prog = { id: number; name: string; status: string; states_known: boolean; hoody_kit: boolean; lazy_load?: boolean; instances: Array<{ port?: number; status: string; pid?: number }> };
  const overviewOf = (id: string) => kit(id, 'daemon', '/api/v1/daemon/programs/overview') as { programs: Prog[]; temporary: unknown[]; features: string[] };

  test('every computer: the daemon\'s programs, every Hoody Kit one running but the tunnel program, which waits for a laptop off atlas', () => {
    for (const c of computers) {
      const o = overviewOf(c.id);
      expect(o.programs.map((p) => [p.id, p.name]), c.name).toEqual(DEMO_DAEMON_PROGRAMS(c.id).map((p) => [p.id, p.name]));
      expect((kit(c.id, 'daemon', '/api/v1/daemon/programs') as { programs: Array<{ id: number }> }).programs.map((p) => p.id)).toEqual(o.programs.map((p) => p.id));
      for (const p of o.programs.filter((x) => x.hoody_kit)) {
        const waits = p.name === 'hoody-tunnel' && c.id !== atlas;
        expect(p.status, `${c.name} ${p.name}`).toBe(waits ? 'stopped' : 'running');
        expect(p.lazy_load === true).toBe(waits);
      }
      expect(o.programs.some((p) => p.name === 'hoody-agent' && p.status === 'running')).toBe(true);
      expect(o.programs.some((p) => p.name === 'hoody-exec' && p.status === 'running')).toBe(true);
      // The Programs page's own model: no Hoody Kit program needs attention; on atlas, only the two of its own that
      // ended badly (the worker that cannot start, the night's sync that exited 2).
      const m = programModel(o, NOW);
      expect(m, c.name).not.toBeNull();
      expect(m!.counts.systemAttention).toBe(0);
      expect(m!.rows.filter((r) => r.attention).map((r) => r.name).sort()).toEqual(c.id === atlas ? ['nightly-sync', 'worker'] : []);
      expect(o.temporary.length).toBe(c.id === atlas ? 1 : 0);
    }
  });

  test('atlas: the recorded overview, with the program of no known name now a stopped image-resizer, the exec program (which serves the scripts) running, and the tunnel program', () => {
    const recorded = W.records.find((r) => r.url.includes('-daemon-1.') && r.url.endsWith('/programs/overview'))!.body as { programs: Prog[] };
    const served = overviewOf(atlas).programs;
    const pick = (p: Prog) => ({ name: p.name, status: p.status, states_known: p.states_known, instances: p.instances.map((i) => [i.port ?? null, i.status, i.pid ?? null]) });
    for (const r of recorded.programs) {
      const s = served.find((x) => x.id === r.id);
      expect(s, r.name).toBeDefined();
      if (r.id === 9) expect(pick(s!)).toEqual({ name: 'image-resizer', status: 'stopped', states_known: true, instances: [] });
      else if (r.name === 'hoody-exec') expect(pick(s!)).toEqual({ ...pick(r), status: 'running', instances: [[15_020, 'running', 19_020]] });
      else expect(pick(s!), r.name).toEqual(pick(r));
    }
    expect(served.filter((s) => !recorded.programs.some((r) => r.id === s.id)).map((s) => s.name)).toEqual(['hoody-tunnel']);
  });

  test('Tunnels: atlas\'s tunnel program runs with one laptop connected, which puts its dev server online through atlas and lets atlas reach its database; elsewhere the page reads nothing', () => {
    for (const c of computers) expect(tunnelProgram(overviewOf(c.id)), c.name).toBe(c.id === atlas ? 'running' : 'stopped');
    const t = parseTunnels(kit(atlas, 'tunnel', '/api/v1/tunnel/tunnels'));
    expect(t).toMatchObject({ orphans: 0, full: true });
    expect(t.sessions).toEqual([{ id: DEMO_TUNNEL_SESSION, peer: '203.0.113.24', protocol: 'v2', streams: 2, expose: [{ bindId: 1, port: 5173, addr: null }], pull: [{ bindId: 2, port: 5432, addr: '127.0.0.1' }] }]);
    const max = parseSessions(kit(atlas, 'tunnel', '/api/v1/tunnel/sessions'));
    expect(max).toEqual({ [DEMO_TUNNEL_SESSION]: 1024 });
    const b = parseBindings(kit(atlas, 'tunnel', '/api/v1/tunnel/bindings'));
    expect(b.list.map((l) => [l.sessionId, l.bindId, l.port, l.mode, l.addr])).toEqual([[DEMO_TUNNEL_SESSION, 1, 5173, 'expose', null], [DEMO_TUNNEL_SESSION, 2, 5432, 'pull', '127.0.0.1']]);
    const rows = joinRows(t, max, b.list);
    expect(rows.rows.map((r) => [r.kind, r.port, r.reconnecting])).toEqual([['expose', 5173, false], ['pull', 5432, false]]);
    expect(rows.reconnecting).toBe(0);
    const started = parseHealth(kit(atlas, 'tunnel', '/api/v1/tunnel/health'));
    expect(started).not.toBeNull();
    expect(started!).toBeLessThan(NOW);
    // Both ports are the tunnel program's on atlas (Hoody's own in its Ports tab): no program of atlas's own uses either,
    // and atlas reaches the laptop's database only from inside (127.0.0.1).
    const ownPorts = overviewOf(atlas).programs.filter((p) => !p.hoody_kit).flatMap((p) => p.instances.map((i) => i.port));
    expect(ownPorts.filter((x) => x === 5173 || x === 5432)).toEqual([]);
    const listens = demoRuntimeInfo(atlas).network_services.filter((x) => x.port === 5173 || x.port === 5432).map((x) => [x.port, x.ip, x.program]);
    expect(listens).toEqual([[5173, '0.0.0.0', 'hoody-tunnel'], [5432, '127.0.0.1', 'hoody-tunnel']]);
    expect([5173, 5432].map((n) => portListening(classifyRuntime(demoRuntimeInfo(atlas)), n))).toEqual(['system', 'system']);
    for (const c of computers.filter((x) => x.id !== atlas)) expect((kit(c.id, 'tunnel', '/api/v1/tunnel/tunnels') as { sessions: unknown[] }).sessions).toEqual([]);
  });

  test('Schedules: on every computer the page reads its schedules, its scripts\' and the agent\'s loops; the web-request program is not there', async () => {
    const PATHS: Record<string, readonly [program: string, path: string]> = {
      overview: ['daemon', '/api/v1/daemon/programs/overview'], health: ['cron', '/api/v1/cron/health'], info: ['cron', '/api/v1/cron/info'],
      entries: ['cron', '/api/v1/cron/entries'], userEntries: ['cron', '/api/v1/cron/users/:user/entries'], runs: ['cron', '/api/v1/cron/runs'],
      execList: ['exec', '/api/v1/exec/schedules/list'], curlList: ['curl', '/api/v1/curl/schedule'], loops: ['agent', '/api/v1/agent/loops'],
    };
    for (const c of computers) {
      const call: Call = async (name, input) => {
        const [program, p] = PATHS[name]!;
        const q = new URLSearchParams(Object.entries(input?.query ?? {}).map(([k, v]) => [k, String(v)])).toString();
        const path = p.replace(':user', input?.params?.user ?? '') + (q ? `?${q}` : '');
        const got = demoKitAnswer(`https://${c.project_id}-${c.id}-${program}-1.n12.${DEMO_DOMAIN}${path}`, NOW);
        if (!got || got.status !== 200) throw { status: got?.status ?? 404 };
        return got.body;
      };
      const r = await loadSchedules(call, async () => ({ supported: [] }), () => NOW);
      expect([r.cron.state, r.exec.state, r.curl.state, r.loop.state], c.name).toEqual(['ok', 'ok', 'absent', 'ok']);
      expect(r.curl.complete).toBe(true);
      expect(r.programsRunning).toBeGreaterThan(5);
      const mine = DEMO_SCHEDULES.filter((x) => x.computer === c.id);
      expect(r.cron.items.map((e) => e.id).sort()).toEqual(mine.map((x) => x.id).sort());
      for (const e of r.cron.items) expect<unknown>(e.last_run, e.id).toEqual((kit(c.id, 'cron', `/api/v1/cron/users/user/entries/${e.id}`) as { last_run: unknown }).last_run);
    }
  });

  test('Schedules: each entry\'s runs, newest first, start at its last run and go back one period at a time to when it was made', () => {
    for (const x of DEMO_SCHEDULES) {
      const one = kit(x.computer, 'cron', `/api/v1/cron/users/user/entries/${x.id}`) as { created_at: string; last_run: unknown };
      const runs = (kit(x.computer, 'cron', `/api/v1/cron/runs?entry_id=${x.id}&limit=50`) as { runs: Array<{ run_id: string; entry_id: string; started_at: string; exit_code: number }> }).runs;
      expect(runs.length, x.name).toBeGreaterThan(0);
      expect(runs.length).toBeLessThanOrEqual(20);
      expect<unknown>(runs[0]).toEqual(one.last_run);
      expect(new Set(runs.map((r) => r.run_id)).size).toBe(runs.length);
      const t = runs.map((r) => Date.parse(r.started_at));
      for (let i = 1; i < t.length; i++) expect(t[i - 1]! - t[i]!).toBe(x.everyMin * 60_000);
      for (const r of runs) { expect(r.entry_id).toBe(x.id); expect(Date.parse(r.started_at)).toBeGreaterThan(Date.parse(one.created_at)); }
      expect(runs.slice(1).every((r) => r.exit_code === 0)).toBe(true);
    }
    const atlasRuns = (n: string) => (kit(atlas, 'cron', `/api/v1/cron/runs${n}`) as { runs: unknown[] }).runs.length;
    expect(atlasRuns('?limit=5')).toBe(5);
    expect(atlasRuns('')).toBe(20);
    expect(atlasRuns('?entry_id=00000000-0000-4000-8000-000000000000')).toBe(0);
  });
});

describe('the record of calls and visits (Scripts and Logs read the same calls)', () => {
  const NOW = Date.parse('2027-03-01T12:07:00Z');
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string }> } }).data.computers;
  const kit = (id: string, program: string, p: string, now = NOW): unknown => demoKitAnswer(`https://${computers.find((c) => c.id === id)!.project_id}-${id}-${program}-1.n12.${DEMO_DOMAIN}${p}`, now)?.body;
  const atlas = DEMO_CONTEXT.containerId;
  const RETENTION = { hours: 168, maxRows: 50_000, maxBytes: 104_857_600 };
  type Run = { executionId: string; receivedAt: string; status: number; durationMs: number; outcome: string; error?: string };
  type LogRow = { id: number; tsMs: number; serviceName: string; serviceIndex: number; method: string; url: string; status: number; clientIp: string; traceId: string };

  test('Scripts: the list, the Overview figures, its failures and the Logs Scripts source count the same calls', () => {
    for (const x of DEMO_SCRIPTS) {
      const runs = DEMO_RUNS[x.file]!;
      const failed = runs.filter((r) => r[2] >= 500).length;
      expect(runs.length, x.file).toBeGreaterThan(0);
      for (const r of runs) expect(r[0], x.file).toBeLessThan(23 * 60);
      const sums = (kit(x.computer, 'exec', '/api/v1/exec/monitor/scripts-summary') as { scripts: Array<{ scriptPath: string; calls: number; failed: number; lastOutcome: string }> }).scripts;
      expect(sums.find((s) => s.scriptPath === `default/1/${x.file}`), x.file).toMatchObject({ calls: runs.length, failed });
      // Overview (pages/scripts/data.ts usage): 24 clock hours, oldest first, the last one the current hour, adding up to the totals.
      const usage = kit(x.computer, 'exec', `/api/v1/exec/monitor/script-usage?scriptPath=${encodeURIComponent(`default/1/${x.file}`)}`) as { hours: Array<{ start: string; calls: number; failed: number }>; totals: { calls: number; failed: number; p50Ms: number | null }; coverage: { complete: boolean } };
      expect(usage.totals, x.file).toMatchObject({ calls: runs.length, failed });
      expect(usage.totals.p50Ms).not.toBeNull();
      expect(usage.coverage.complete).toBe(true);
      expect(usage.hours.length).toBe(24);
      expect(usage.hours.reduce((n, h) => n + h.calls, 0)).toBe(runs.length);
      expect(usage.hours.reduce((n, h) => n + h.failed, 0)).toBe(failed);
      const starts = usage.hours.map((h) => Date.parse(h.start));
      expect(starts[23]).toBe(Math.floor(NOW / 3_600_000) * 3_600_000);
      for (let i = 1; i < 24; i++) expect(starts[i]! - starts[i - 1]!).toBe(3_600_000);
      // Overview's recent failures (status=failed, limit 5) and the Logs page's Scripts source (its own path builder, last 24 h).
      const fails = (kit(x.computer, 'exec', `/api/v1/exec/logs/executions?scriptPath=${encodeURIComponent(`default/1/${x.file}`)}&status=failed&limit=5`) as { executions: Run[] }).executions;
      expect(fails.length).toBe(Math.min(5, failed));
      for (const f of fails) expect(f).toMatchObject({ outcome: 'failed', status: 500, error: 'Error: shop answered 503' });
      const P = LR.predicate({ source: 'scripts', window: '24h' }, NOW);
      if (!P.ok) throw new Error(P.code);
      const listed = kit(x.computer, 'exec', LR.scriptsPath(P.P, { script: x.file, limit: 100 })!) as { executions: Run[]; next: string | null };
      expect(listed.next).toBeNull();
      expect(listed.executions.length).toBe(runs.length);
      const times = listed.executions.map((r) => Date.parse(r.receivedAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(new Set(listed.executions.map((r) => r.executionId)).size).toBe(runs.length);
      for (const r of listed.executions) expect(r.executionId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      // Paged: `next` sent back as `before` reads on from there, nothing twice.
      const p1 = kit(x.computer, 'exec', LR.scriptsPath(P.P, { script: x.file, limit: 2 })!) as { executions: Run[]; next: string | null };
      if (runs.length > 2) {
        const p2 = kit(x.computer, 'exec', LR.scriptsPath(P.P, { script: x.file, limit: 100, before: p1.next })!) as { executions: Run[] };
        expect([...p1.executions, ...p2.executions].map((r) => r.executionId)).toEqual(listed.executions.map((r) => r.executionId));
      } else expect(p1.next).toBeNull();
      // Another computer has no such script.
      expect(kit(computers.find((o) => o.id !== x.computer)!.id, 'exec', `/api/v1/exec/monitor/script-usage?scriptPath=${encodeURIComponent(`default/1/${x.file}`)}`)).toBeUndefined();
    }
  });

  test('Scripts: each script\'s versions (the one in use first, read back whole), secrets and saved tests', () => {
    for (const x of DEMO_SCRIPTS) {
      const q = `?path=${encodeURIComponent(`default/1/${x.file}`)}`;
      const code = DEMO_SCRIPT_CODE[x.file]!;
      const versions = (kit(x.computer, 'exec', `/api/v1/exec/scripts/history${q}&limit=30`) as { versions: Array<{ version: number; revision: string; savedAt: string; replacedBy?: string }> }).versions;
      expect(versions.length, x.file).toBe(code.madeDays === code.savedDays ? 1 : 2);
      expect(versions[0]!.revision).toBe(code.rev);
      expect(versions[0]!.replacedBy).toBeUndefined();
      expect(Date.parse(versions[0]!.savedAt)).toBe(NOW - code.savedDays * 86_400_000);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]!.replacedBy).toBe(versions[i - 1]!.revision);
        expect(versions[i]!.revision).toMatch(/^[0-9a-f]{16}$/);
      }
      for (const v of versions) {
        const read = kit(x.computer, 'exec', `/api/v1/exec/scripts/history/read${q}&version=${v.version}`) as { content: string; revision: string };
        expect(read.revision).toBe(v.revision);
        expect(read.content).toContain(`// @label ${x.label}`);
        if (v === versions[0]) expect(read.content).toBe(code.text);
      }
      expect(kit(x.computer, 'exec', `/api/v1/exec/scripts/history/read${q}&version=9`)).toBeUndefined();
      const sq = `?scriptPath=${encodeURIComponent(`default/1/${x.file}`)}`;
      const env = kit(x.computer, 'exec', `/api/v1/exec/env/keys${sq}`) as { files: Array<{ scope: string; keys: Array<{ name: string }> }>; effective: Array<{ name: string; from: string }> };
      const names = [...new Set([...code.text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!))];
      expect(env.effective.map((k) => k.name), x.file).toEqual(names);
      expect(env.files.map((f) => f.scope)).toEqual(['script', 'folder', 'computer']);
      const tests = kit(x.computer, 'exec', `/api/v1/exec/tests/list${sq}`) as { cases: Array<{ route: string }>; revision: string | null };
      expect(tests.revision === null).toBe(tests.cases.length === 0);
      for (const c of tests.cases) expect(c.route).toBe(`/${x.file.replace(/\.ts$/, '')}`);
    }
    expect(DEMO_SCRIPTS.some((x) => (kit(x.computer, 'exec', `/api/v1/exec/env/keys?scriptPath=${encodeURIComponent(`default/1/${x.file}`)}`) as { effective: unknown[] }).effective.length > 0)).toBe(true);
  });

  test('Logs: every computer\'s record answers the reads the page builds as the reference logs kit (pages/logs/fake-kit.ts) does', () => {
    const views: LR.ViewInput[] = [];
    for (const source of ['everything', 'visits', 'bots', 'execVisits'] as const) for (const window of ['15m', '1h', '24h', '7d']) views.push({ source, window });
    for (const severity of ['problems', 'failed']) views.push({ source: 'everything', severity, window: '24h' }, { source: 'visits', severity, window: '7d' });
    views.push({ source: 'everything', window: '24h', search: '/orders' }, { source: 'everything', window: '24h', search: '404' }, { source: 'everything', window: '24h', method: 'POST' });
    for (const c of computers) {
      const rows = (kit(c.id, 'logs', '/_logs?limit=1000') as { entries: LogRow[] }).entries.slice().reverse();
      const db = fakeLogsDb(rows as never, RETENTION);
      const vs = [...views];
      if (rows.length > 0) vs.push({ source: 'everything', window: '24h', search: rows[0]!.traceId.toUpperCase() });
      for (const v of vs) {
        const P = LR.predicate(v, NOW);
        if (!P.ok) throw new Error(`${JSON.stringify(v)}: ${P.code}`);
        const paths = [LR.kitPath(P.P, null, 200), LR.kitPath(P.P, null, 2), LR.kitPath(P.P, { beforeId: 3 }, 200), LR.kitPath(P.P, { afterId: 1 }, 200)];
        for (const p of paths) {
          // The reference kit leaves out bodiesOmitted (the API's flag that no request body is kept).
          const got = { ...(kit(c.id, 'logs', p!) as Record<string, unknown>) };
          expect(got.bodiesOmitted).toBe(true);
          delete got.bodiesOmitted;
          expect(got, `${c.name} ${p}`).toEqual(db.answer(p!) as never);
        }
        const sp = LR.statsPath(P.P, NOW)!;
        expect(kit(c.id, 'logs', sp), `${c.name} ${sp}`).toEqual(db.stats(sp) as never);
      }
    }
  });

  test('Logs: the default view (Everything, last hour) on the computer the demo opens on shows its visits; the visits are the requests the web programs wrote and the script calls', () => {
    const P = LR.predicate({ source: 'everything' }, NOW);
    if (!P.ok) throw new Error(P.code);
    expect(LR.parts(P.P).parts).toEqual(['kit', 'changes']);
    const hour = kit(atlas, 'logs', LR.kitPath(P.P, null, 200)!) as { entries: LogRow[]; total: number };
    expect(hour.entries.length).toBeGreaterThan(4);
    expect(hour.total).toBe(hour.entries.length);
    const stats = kit(atlas, 'logs', LR.statsPath(P.P, NOW)!) as { total: number; byStatusClass: Record<string, number> };
    expect(stats.total).toBe(hour.total);
    expect(stats.byStatusClass['4xx']).toBe(1);
    // Each web program's request lines ("GET / 200 4ms") are its visits through http-<port>, minute for minute.
    for (const [name, port] of [['web', 3000], ['api', 8000]] as const) {
      const lines = (DEMO_PROGRAM_LOGS[name]!.stdout ?? []).flatMap(([min, text]) => { const m = /^([A-Z]+) (\S+) (\d{3}) /.exec(text); return m ? [[NOW - min * 60_000, m[1], m[2], Number(m[3])]] : []; });
      const visits = (kit(atlas, 'logs', '/_logs?limit=1000') as { entries: LogRow[] }).entries.filter((r) => r.serviceName === 'http' && r.serviceIndex === port).map((r) => [r.tsMs, r.method, r.url, r.status]).reverse();
      expect<unknown>(visits, name).toEqual(lines);
    }
    // Every script call is one visit to its computer's exec program, with the call's method, address and status.
    for (const c of computers) {
      const exec = (kit(c.id, 'logs', '/_logs?limit=1000&serviceName=exec') as { entries: LogRow[] }).entries;
      const calls = DEMO_SCRIPTS.filter((x) => x.computer === c.id).flatMap((x) => DEMO_RUNS[x.file]!.map(([min, method, status]) => [NOW - min * 60_000, method, `/${x.file.replace(/\.ts$/, '')}`, status]));
      expect(exec.map((r) => [r.tsMs, r.method, r.url, r.status]).sort(), c.name).toEqual(calls.sort());
    }
    // The visitors are documentation addresses: the Hub looks none of them up.
    for (const r of (kit(atlas, 'logs', '/_logs?limit=1000') as { entries: LogRow[] }).entries) expect(r.clientIp).toMatch(/^(?:198\.51\.100|203\.0\.113)\.\d{1,3}$/);
    // Ids follow time on every read: the same row keeps its id a minute later.
    const later = kit(atlas, 'logs', '/_logs?limit=1000', NOW + 60_000) as { entries: LogRow[] };
    expect(later.entries.map((r) => [r.id, r.url])).toEqual((kit(atlas, 'logs', '/_logs?limit=1000') as { entries: LogRow[] }).entries.map((r) => [r.id, r.url]));
  });
});

describe('recorded times', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const ISO_TIME = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
  /** The fields that name a moment still to come (an expiry, a reset, what is paid for): the future is their place. By exact name; a new one is added here on purpose. */
  const AHEAD = new Set(['expires_at', 'resets_at', 'paid_through']);
  /** Every time a body holds, with the field it is under. */
  const times = (v: unknown, key = '', out: Array<{ key: string; t: number }> = []): Array<{ key: string; t: number }> => {
    if (typeof v === 'string') { if (ISO_TIME.test(v)) out.push({ key, t: Date.parse(v) }); }
    else if (Array.isArray(v)) for (const x of v) times(x, key, out);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) times(x, k, out);
    return out;
  };
  const past = (v: unknown): Array<{ key: string; t: number }> => times(v).filter((x) => !AHEAD.has(x.key));
  test('some reads are dated from the world\'s own moment, before the recording\'s, and some from the recording\'s', () => {
    const own = W.records.filter((r) => r.at !== undefined);
    expect(own.length).toBeGreaterThan(0);
    for (const r of own) expect(Date.parse(r.at!)).toBeLessThan(Date.parse(W.recordedAt));
    expect(W.records.some((r) => r.at === undefined)).toBe(true);
  });
  test('the newest notification is hours old at the moment of the read, not as old as the recording', async () => {
    const list = await c.request('GET', '/notifications?read_only=true&limit=100&page=1') as { data: Array<{ created_at: string }> };
    const ages = list.data.map((n) => NOW - Date.parse(n.created_at));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...ages)).toBeLessThan(12 * 3_600_000);
    expect(new Set(ages.map((a) => Math.floor(a / 86_400_000))).size).toBeGreaterThan(1);
  });
  test('no read answers a time of its own clock in the future, and each own-clock read ends within a few days of now', async () => {
    let checked = 0;
    for (const r of W.records) {
      if (r.leg !== 'hoody' || r.status !== 200 || r.at === undefined) continue;
      // A read a hand answer takes is not this record's replay: its times are the hand answer's own (the next tests).
      if (demoAnswer('GET', r.url, NOW) !== null) continue;
      checked++;
      const got = past(await c.request('GET', r.url));
      // Field by field: a future value fails here, it is never dropped before the check.
      for (const x of got) expect(NOW - x.t, `${r.url} ${x.key}`).toBeGreaterThanOrEqual(0);
      if (got.length) expect(NOW - Math.max(...got.map((x) => x.t)), r.url).toBeLessThan(4 * 86_400_000);
    }
    expect(checked).toBeGreaterThan(0);
  });
  test('the check sees a time ahead of now under an ordinary field, and leaves a field that names what is to come', () => {
    expect(past({ data: [{ created_at: '2099-01-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' }] })).toEqual([{ key: 'created_at', t: Date.parse('2099-01-01T00:00:00.000Z') }]);
  });
  test('the hand-written answers: the same rule, every field', () => {
    for (const a of DEMO_ANSWERS) for (const x of past(demoAnswer('GET', at(a), NOW))) expect(NOW - x.t, `${a.path} ${x.key}`).toBeGreaterThanOrEqual(0);
  });
});

describe('what the demo shows reads as a real, tidy account', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ name: string; server: { name: string } }> } }).data.computers;
  /** Markup, Markdown emphasis or a test's own words in text a person reads. */
  const UNTIDY = /<\/?[a-z]|\*\*|\b(?:fake|fixture|hostile|lorem|test ticket)\b/i;

  test('support: the sample tickets only, in plain words (the recorded fixture list, hostile subject included, is never served)', async () => {
    for (const limit of [20, 50]) {
      const got = (await c.request('GET', `/support/tickets?limit=${limit}`)) as { data: { tickets: Array<{ subject: string }> } };
      expect(got.data.tickets.map((t) => t.subject)).toEqual(DEMO_TICKETS.map((t) => t.subject));
    }
    for (const t of DEMO_TICKETS) for (const text of [t.subject, ...t.thread.map((m) => m[2])]) expect(text).not.toMatch(UNTIDY);
  });
  test('notifications: every one read, newest first, naming only the sample computers and servers; the summary agrees', async () => {
    type List = { data: Array<{ id: string; title: string; message: string; is_read: boolean; created_at: string }>; pagination: { total: number; totalPages: number } };
    const unread = (await c.request('GET', '/notifications?unread_only=true&limit=100&page=1')) as List;
    expect(unread.data).toEqual([]);
    expect(unread.pagination.total).toBe(0);
    const read = (await c.request('GET', '/notifications?read_only=true&limit=100&page=1')) as List;
    expect(read.data.map((n) => n.title)).toEqual(DEMO_NOTICES.map((n) => n[1]));
    expect(read.data.every((n) => n.is_read)).toBe(true);
    const at = read.data.map((n) => Date.parse(n.created_at));
    expect(at).toEqual([...at].sort((a, b) => b - a));
    const page2 = (await c.request('GET', '/notifications?read_only=true&limit=5&page=2')) as List;
    expect(page2.data.map((n) => n.id)).toEqual(read.data.slice(5).map((n) => n.id));
    expect(page2.pagination.totalPages).toBe(Math.ceil(DEMO_NOTICES.length / 5));
    const summary = (await c.request('GET', '/notifications/summary')) as { data: { unread_count: number; latest_id: string; latest_created_at: string } };
    expect(summary.data).toMatchObject({ unread_count: 0, latest_id: read.data[0]!.id, latest_created_at: read.data[0]!.created_at });
    const names = new Set([...computers.map((x) => x.name), ...computers.map((x) => x.server.name)]);
    for (const n of read.data) {
      expect(`${n.title} ${n.message}`).not.toMatch(UNTIDY);
      // Each title names one computer or server: "Computer atlas …", "… of atlas …", "… on fra-7 …", "… to atlas".
      const m = /^Computer ([a-z0-9-]+)|\b(?:of|on|to) ([a-z0-9-]+)/.exec(n.title);
      expect(m, n.title).not.toBeNull();
      expect(names.has(m![1] ?? m![2]!), n.title).toBe(true);
    }
    // The snapshot notice is the sample change of the same snapshot, at the same moment.
    const snap = (await c.request('GET', `/events?computer_id=${DEMO_CONTEXT.containerId}`)) as { data: { events: Array<{ event_type: string; created_at: string }> } };
    expect(snap.data.events.find((e) => e.event_type === 'computer.snapshot.created')!.created_at).toBe(read.data[0]!.created_at);
  });
  test('referrals: a new code is checked as the API checks it; the account\'s own codes are taken', async () => {
    const words = async (code: string) => checkWords(await c.request('GET', `/referrals/me/codes/check?code=${encodeURIComponent(code)}`));
    const me = W.records.find((r) => r.url === '/referrals/me')!.body as { data: { codes: Array<{ code: string }> } };
    expect([...DEMO_REFERRAL_CODES].sort()).toEqual(me.data.codes.map((x) => x.code).sort());
    for (const code of DEMO_REFERRAL_CODES) expect(await words(code.toUpperCase()), code).toEqual({ k: 'check.taken' });
    expect(await words('ada-builds')).toEqual({ k: 'check.available' });
    expect(await words('ab')).toEqual({ k: 'check.invalid' });
    expect(await words('two--hyphens')).toEqual({ k: 'check.invalid' });
    expect(await words('hoody-fan')).toEqual({ k: 'check.reserved' });
    // Each kept-back word as the API matches it. Anywhere in the code (hyphens removed, digits read as letters):
    for (const code of ['ho-ody-fan', 'staff-7', 'staffordshire', 's7aff-fan']) expect(await words(code), code).toEqual({ k: 'check.reserved' });
    // Only as the whole code or one hyphen-separated part, digits read as letters or dropped from the end:
    for (const code of ['team-7', 'te-am', 'h3lp']) expect(await words(code), code).toEqual({ k: 'check.reserved' });
    for (const code of ['teamwork', 'helpful']) expect(await words(code), code).toEqual({ k: 'check.available' });
    const got = (await c.request('GET', '/referrals/me/codes/check?code=%20Ada-Builds%20')) as { data: unknown };
    expect(got.data).toEqual({ code: 'ada-builds', valid: true, available: true, reason: null });
  });
  test('profile: the recorded account, its address verified, with a display name, joined before any sample computer', async () => {
    const recorded = W.records.find((r) => r.url === '/users/auth/me')!.body as { data: { id: string; username: string; email: string } };
    const me = (await c.request('GET', '/users/auth/me')) as { data: Record<string, unknown> };
    expect(me.data).toMatchObject({ id: recorded.data.id, username: recorded.data.username, email: recorded.data.email, is_banned: false });
    const p = profileOf(me.data);
    expect(p).toMatchObject({ id: W.account, emailVerified: true, alias: 'Ada', pendingEmail: null, pendingUntil: null, undoUntil: null });
    expect(p.alias).not.toMatch(UNTIDY);
    const since = Date.parse(p.since!);
    expect(since).toBeLessThan(NOW);
    const list = (await c.request('GET', '/computers?limit=100')) as { data: { computers: Array<{ created_at: string }> } };
    for (const x of list.data.computers) expect(since).toBeLessThan(Date.parse(x.created_at));
  });
  test('servers for rent: every listed duration is a priced term, in the API\'s tier shape, so each listing is for sale', async () => {
    const deref = (s: Schema): Schema => (s.$ref ? deref(spec.components.schemas[s.$ref.split('/').pop()!]!) : s);
    const rowSchema = deref(deref(deref(apiGet('/servers/available')!.responses['200']!.content!['application/json']!.schema).properties!.data!).items!);
    const tierSchema = deref(deref(rowSchema.properties!.pricing!).properties!.price_tiers!).additionalProperties as Schema;
    expect(tierSchema.properties).toBeDefined();
    const rows = ((await c.request('GET', '/servers/available')) as { data: Array<{ name: string; pricing: { prices: Record<string, string>; price_tiers: Record<string, unknown> } }> }).data;
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((raw, i) => {
      const days = Object.keys(raw.pricing.prices);
      expect(Object.keys(raw.pricing.price_tiers), raw.name).toEqual(days);
      for (const d of days) expect(check(raw.pricing.price_tiers[d], tierSchema, `${raw.name}.${d}`)).toEqual([]);
      const row = normalizeStockRow(raw, i);
      expect(row.buyable, raw.name).toBe(true);
      expect(row.days).toEqual([...days].sort((a, b) => Number(a) - Number(b)));
      // The cheapest first payment is the shortest term here (no setup fee).
      expect(row.fromDays).toBe('30');
      expect(row.fromCents).toBe(Math.round(Number(raw.pricing.prices['30']) * 100));
    });
  });
  test('the rent drawer\'s listing: both rails the live drawer reads (core/commerce.ts loadListing) answer a list, and the listing it opens is for sale on 30 days', async () => {
    // demo-first-rows cannot draw this drawer (its process builds the Hub with fixtures on, so the drawer reads the
    // fixture-only listing); the built bundle draws it in scripts/term/build/ship-gate.ts DEMO_CHECKS 'billing-rent'.
    const stock = ((await c.request('GET', '/servers/available')) as { data: unknown }).data;
    const offers = ((await c.request('GET', '/offers')) as { data: unknown }).data;
    expect(Array.isArray(stock)).toBe(true);
    expect(Array.isArray(offers)).toBe(true);
    const rows = (stock as unknown[]).map((r, i) => normalizeStockRow(r, i));
    // The first rows and the ship gate open (demo-answers.ts: Singapore M).
    const one = rows.find((r) => r.id === '5e00000000000000000000a1');
    expect(one?.buyable).toBe(true);
    expect(one?.days).toContain('30');
  });
  test('referral credit: one number wherever it shows (the wallet\'s balances and the referral page)', async () => {
    const referrals = (await c.request('GET', '/referrals/me')) as { data: { credit: { available: string; owed: string } } };
    const wallet = (await c.request('GET', '/wallet/balances')) as { data: { referral_credit: string; referral_credit_owed: string } };
    expect(wallet.data.referral_credit).toBe(referrals.data.credit.available);
    expect(wallet.data.referral_credit_owed).toBe(referrals.data.credit.owed);
  });
});

describe('the demo client', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  test('carries the demo mark, names the recorded account and starts on its current computer', () => {
    expect((c as unknown as Record<symbol, unknown>)[DEMO_CLIENT]).toBe(true);
    expect(c.identity).toEqual({ kind: 'account', uid: W.account, sid: 'demo' });
    for (const k of ['realmId', 'projectId', 'containerId'] as const) expect(DEMO_CONTEXT[k]).toMatch(/^[0-9a-f]{24}$/);
  });
  test('answers the boot reads and a page read; a recorded time moves with the clock', async () => {
    const me = await c.request('GET', '/users/auth/me') as { data: { id: string } };
    expect(me.data.id).toBe(W.account);
    expect(await c.request('GET', '/realms?include_usage=true')).toMatchObject({ data: { realm_ids: expect.any(Array) } });
    const list = await c.request('GET', '/computers?limit=100') as { data: { computers: Array<{ created_at: string }> } };
    expect(list.data.computers.length).toBeGreaterThan(3);
    for (const x of list.data.computers) expect(Date.parse(x.created_at)).toBeLessThan(NOW);
    expect(shiftTimes({ a: ['2026-10-23T09:00:00.000Z', 'x'], b: 1 }, 60_000)).toEqual({ a: ['2026-10-23T09:01:00.000Z', 'x'], b: 1 });
  });
  test('refuses every change unsent, on both legs, and never calls the send note', async () => {
    let sent = 0;
    const o = { beforeWire: () => { sent++; return true; } };
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) await expect(c.request(m, '/computers', {}, o)).rejects.toEqual({ status: 0, notSent: true, code: 'DEMO_READ_ONLY' });
    await expect(c.fetch(`https://x.${DEMO_DOMAIN}/api/v1/agent/bots`, { method: 'POST' }, o)).rejects.toEqual({ status: 0, notSent: true, code: 'DEMO_READ_ONLY' });
    expect(sent).toBe(0);
  });
  test('a read that selects another computer or realm never gets the recorded one\'s answer', async () => {
    const other = 'c0a7150000000000000000b2';
    const own = await c.request('GET', `/proxy/aliases?computer_id=${DEMO_CONTEXT.containerId}`) as { data: { aliases: unknown[] } };
    expect(own.data.aliases.length).toBeGreaterThan(0);
    expect(await c.request('GET', `/proxy/aliases?computer_id=${other}`)).toMatchObject({ data: { aliases: [] } });
    expect(await c.request('GET', '/vault/keys?realm_id=f2f2f2f2f2f2f2f2f2f2f2f2')).toMatchObject({ data: [] });
    // No hand answer: the same address with another selector is unknown, with the same selector and other dressing it is the record.
    await expect(c.request('GET', '/computers?limit=100&project_id=6a0000000000000000000009')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    await expect(c.request('GET', '/ip/lookup?ip=198.51.100.9')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(await c.request('GET', '/computers?limit=25&page=1')).toMatchObject({ data: { computers: expect.any(Array) } });
    const agent = W.records.find((r) => r.leg === 'fetch' && r.url.includes('/agent/gates?'))!.url;
    expect((await c.fetch(agent)).status).toBe(200);
    expect((await c.fetch(agent.replace(/realm=[0-9a-f]+/, 'realm=f2f2f2f2f2f2f2f2f2f2f2f2'))).status).toBe(404);
    expect(selectorOf('/x?limit=5&page=1&offset=0&order=a')).toBe('');
    expect(selectorOf('/x?realm=b&page=2&computer_id=a')).toBe('computer_id=a&page=2&realm=b');
  });
  test('a time held as a number moves with the clock too; a count or a size never does', async () => {
    const at = Date.parse(W.recordedAt);
    expect(shiftTimes({ expires_at: at + 5, mtime: [at], ended_at: 12, size: at, total: 3 }, 1000)).toEqual({ expires_at: at + 1005, mtime: [at + 1000], ended_at: 12, size: at, total: 3 });
    const later = at + 2 * 86_400_000;
    const d = demoClient(() => later);
    const numbers: Array<[string, number]> = [];
    const walk = (v: unknown, k: string): void => {
      if (typeof v === 'number' && /(_at|mtime)$/.test(k) && v > 1e12) numbers.push([k, v]);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
      else if (v && typeof v === 'object') for (const [a, b] of Object.entries(v)) walk(b, a);
    };
    const raw: Array<[string, number]> = [];
    // The recorded times judged through the replay's rule: what the client replays, and the records a hand answer takes.
    let recordedTimes = 0;
    for (const r of W.records) {
      let before = numbers.length;
      // A read a hand answer takes (demo-answers.ts: the programs overview, the files program's top folder) is answered by
      // it: that answer is judged, made at the recording's time and again two days on.
      const hand = (now: number): unknown => (r.leg === 'hoody' ? demoAnswer('GET', r.url, now) : demoKitAnswer(r.url, now));
      const taken = hand(later) !== null;
      if (taken) {
        walk(hand(at), '');
        raw.push(...numbers.splice(before));
        walk(hand(later), '');
        before = numbers.length;
      }
      walk(r.body, '');
      const recorded = numbers.splice(before);
      raw.push(...recorded);
      if (taken) {
        // Its record too, as the replay would serve it (demo-client.ts: shiftTimes over the body, by the record's own
        // shift). These two are the only records holding a time as a number, so the replay's rule is judged on them.
        recordedTimes += recorded.length;
        walk(shiftTimes(r.body, later - Date.parse(r.at ?? W.recordedAt)), '');
        continue;
      }
      if (r.status !== 200 || r.raw) continue;
      recordedTimes += recorded.length;
      walk(r.leg === 'hoody' ? await d.request('GET', r.url) : await (await d.fetch(r.url)).json(), '');
    }
    expect(raw.length).toBeGreaterThan(5);
    expect(recordedTimes).toBeGreaterThan(5);
    expect(numbers.length).toBe(raw.length);
    // Each moved by at least the two days: what was to expire after the recording still expires after now.
    numbers.forEach(([k, v], i) => { expect(v - raw[i]![1], k).toBeGreaterThanOrEqual(2 * 86_400_000); });
    const expires = numbers.filter(([k]) => k === 'expires_at');
    expect(expires.length).toBeGreaterThan(0);
    for (const [, v] of expires) expect(v).toBeGreaterThan(later);
  });
  test('an unknown read is a plain 404, never a throw of another shape', async () => {
    await expect(c.request('GET', '/no/such/route')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    expect((await c.fetch(`https://x.${DEMO_DOMAIN}/nothing`)).status).toBe(404);
  });
});

describe('reads that select another place or time', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  type Events = { data: { events: Array<{ computer_id: string; created_at: string }>; pagination: { total: number } } };
  const events = (q: string): Promise<Events> => c.request('GET', `/events?${q}`) as Promise<Events>;
  const atlas = DEMO_CONTEXT.containerId;
  test('changes: another computer has none of atlas\'s, and the total is the count', async () => {
    const own = await events(`computer_id=${atlas}&start_date=2026-01-01T00:00:00.000Z`);
    expect(own.data.events.length).toBeGreaterThan(1);
    expect(own.data.pagination.total).toBe(own.data.events.length);
    for (const other of Object.keys(DEMO_COMPUTERS).filter((id) => id !== atlas)) {
      const got = await events(`computer_id=${other}&start_date=2026-01-01T00:00:00.000Z`);
      expect(got.data, other).toMatchObject({ events: [], pagination: { total: 0 } });
    }
  });
  test('changes: a time window holds only what happened in it', async () => {
    const all = (await events(`computer_id=${atlas}`)).data.events.map((e) => Date.parse(e.created_at)).sort((a, b) => a - b);
    const mid = new Date((all[0]! + all[all.length - 1]!) / 2).toISOString();
    const late = await events(`computer_id=${atlas}&start_date=${mid}`), early = await events(`computer_id=${atlas}&end_date=${mid}`);
    expect(late.data.events.length).toBeGreaterThan(0);
    expect(early.data.events.length).toBeGreaterThan(0);
    expect(late.data.events.length + early.data.events.length).toBe(all.length);
    for (const e of late.data.events) expect(Date.parse(e.created_at)).toBeGreaterThanOrEqual(Date.parse(mid));
    expect(late.data.pagination.total).toBe(late.data.events.length);
  });
  test('a computer\'s read over all realms answers what the recorded realm holds (Bots, chats, gates: never a 404)', async () => {
    const inRealm = W.records.filter((r) => r.leg === 'fetch' && r.status === 200 && new RegExp(`[?&]realm=${DEMO_CONTEXT.realmId}(&|$)`).test(r.url));
    for (const part of ['/agent/bots', '/agent/sessions', '/agent/gates']) expect(inRealm.some((r) => r.url.includes(part)), part).toBe(true);
    for (const r of inRealm) {
      const all = await c.fetch(r.url.replace(`realm=${DEMO_CONTEXT.realmId}`, 'realm=all'));
      expect(all.status, r.url).toBe(200);
      if (!r.url.includes('/agent/bots')) expect(await all.text(), r.url).toBe(await (await c.fetch(r.url)).text());
    }
  });
});

describe('a realm\'s host answers what that realm holds (the Hub with one realm selected)', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; realm_ids: string[] }> } }).data.computers;
  const projects = (W.records.find((r) => r.url === '/projects?limit=100')!.body as { data: { projects: Array<{ id: string; realm_ids: string[] }> } }).data.projects;
  const realms = [...new Set(computers.flatMap((x) => x.realm_ids))].sort();
  /** What core/session.ts hubApiBase gives a realm-scoped call while `r` is selected. */
  const host = (r: string) => ({ base: `https://${r}.${c.realmApiDomain}/api/v1` });
  const ids = (v: unknown, key: string): string[] => ((v as { data: Record<string, Array<{ id: string }>> }).data[key] ?? []).map((x) => x.id).sort();
  const atlas = DEMO_CONTEXT.containerId;
  const NOT_FOUND = { status: 404, code: 'NOT_FOUND' };

  test('each realm lists exactly its own computers and projects; the base host lists them all', async () => {
    expect(realms.length).toBeGreaterThan(1);
    for (const r of realms) {
      expect(realmOfBase(host(r).base)).toBe(r);
      const own = computers.filter((x) => x.realm_ids.includes(r)).map((x) => x.id).sort();
      expect(own.length, r).toBeGreaterThan(0);
      expect(own.length, r).toBeLessThan(computers.length);
      for (const url of ['/computers?page=1&limit=100', '/computers?limit=100']) expect(ids(await c.request('GET', url, null, host(r)), 'computers'), `${r} ${url}`).toEqual(own);
      expect(ids(await c.request('GET', '/projects?limit=100', null, host(r)), 'projects'), r).toEqual(projects.filter((x) => x.realm_ids.includes(r)).map((x) => x.id).sort());
    }
    for (const o of [undefined, { base: '/api/v1' }]) expect(ids(await c.request('GET', '/computers?page=1&limit=100', null, o), 'computers')).toEqual(computers.map((x) => x.id).sort());
    expect(realmOfBase('/api/v1')).toBeNull();
    expect(realmOfBase(`https://${DEMO_CONTEXT.realmId}.example.invalid/api/v1`)).toBeNull();
    expect(ids(await c.request('GET', '/computers?page=1&limit=100', null, host('f0f0f0f0f0f0f0f0f0f0f0f0')), 'computers')).toEqual([]);
  });

  test('a computer or project of another realm is a 404 there, by path or by selector; in its own realm the base host\'s answer', async () => {
    for (const x of computers) {
      for (const r of realms) {
        const url = `/computers/${x.id}`;
        if (x.realm_ids.includes(r)) expect(await c.request('GET', url, null, host(r)), `${x.id} ${r}`).toEqual(await c.request('GET', url));
        else await expect(c.request('GET', url, null, host(r)), `${x.id} ${r}`).rejects.toEqual(NOT_FOUND);
      }
    }
    const other = realms.find((r) => !computers.find((x) => x.id === atlas)!.realm_ids.includes(r))!;
    for (const url of [`/proxy/aliases?computer_id=${atlas}`, `/events?computer_id=${atlas}`, `/projects/${DEMO_CONTEXT.projectId}/permissions`, `/projects/${DEMO_CONTEXT.projectId}/computers`]) {
      await expect(c.request('GET', url, null, host(other)), url).rejects.toEqual(NOT_FOUND);
      expect(await c.request('GET', url, null, host(DEMO_CONTEXT.realmId)), url).toEqual(await c.request('GET', url));
    }
  });

  test('changes: a realm lists its own only, and its total counts them', async () => {
    type Ev = { data: { events: Array<{ realm_ids: string[] }>; pagination: { total: number } } };
    const url = '/events?start_date=2026-01-01T00:00:00.000Z';
    const all = (await c.request('GET', url)) as Ev;
    expect(all.data.events.length).toBeGreaterThan(0);
    for (const r of realms) {
      const got = (await c.request('GET', url, null, host(r))) as Ev;
      expect(got.data.events.length, r).toBe(all.data.events.filter((e) => e.realm_ids.includes(r)).length);
      expect(got.data.pagination.total, r).toBe(got.data.events.length);
    }
    expect(((await c.request('GET', url, null, host(DEMO_CONTEXT.realmId))) as Ev).data.events.length).toBe(all.data.events.length);
  });
});

describe('what a person opens from a list (each page\'s own readers take it whole)', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string }> } }).data.computers;
  const kitUrl = (id: string, program: string, p: string): string => `https://${computers.find((x) => x.id === id)!.project_id}-${id}-${program}-1.n12.${DEMO_DOMAIN}${p}`;
  const kit = (id: string, program: string, p: string): unknown => demoKitAnswer(kitUrl(id, program, p), NOW)?.body;

  test('Support: every listed ticket opens, its thread holds both sides, and a status filter lists only that status', async () => {
    const list = selectList(await c.request('GET', '/support/tickets?limit=20'));
    expect(list.dropped).toBe(0);
    expect(list.tickets.map((t) => t.subject)).toEqual(DEMO_TICKETS.map((t) => t.subject));
    const froms = new Set<string>();
    for (const t of list.tickets) {
      const th = selectThread(await c.request('GET', `/support/tickets/${t.id}`));
      expect(th.ticket).toEqual(t);
      expect(th.messages.length).toBeGreaterThan(0);
      // Oldest first once read; the newest message is the ticket's last message.
      expect(th.messages.map((m) => m.seq)).toEqual(th.messages.map((_, i) => i + 1));
      expect(th.messages[th.messages.length - 1]!.createdAt).toBe(t.lastMessageAt);
      expect(th.messages[0]!.createdAt).toBe(t.createdAt);
      for (const m of th.messages) { froms.add(m.from); expect(Date.parse(m.createdAt)).toBeLessThanOrEqual(NOW); expect(m.body).not.toMatch(/[<>*]/); }
      if (t.closedAt) expect(Date.parse(t.closedAt)).toBeGreaterThanOrEqual(Date.parse(t.lastMessageAt));
    }
    expect([...froms].sort()).toEqual(['support', 'you']);
    expect(list.tickets.filter((t) => t.unread)).toHaveLength(1);
    for (const status of ['open', 'waiting_user', 'closed'] as const) {
      const only = selectList(await c.request('GET', `/support/tickets?status=${status}&limit=20`));
      expect(only.tickets.length, status).toBeGreaterThan(0);
      expect(only.tickets.every((t) => t.status === status), status).toBe(true);
    }
    await expect(c.request('GET', '/support/tickets/6d1c00000000000000000999')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  test('Bots: every Bot opens on its own computer and realm, with its log, no tasks and no chat apps', () => {
    for (const b of DEMO_BOTS) {
      const own = (rest: string, realm = b.realm): unknown => kit(b.computer, 'agent', `/api/v1/agent/bots/${b.id}${rest}?realm=${realm}`);
      const v = viewOf(own('') as Record<string, unknown>, `${b.computer}~${b.realm}~${b.id}`);
      expect({ id: v.id, uid: v.uid, role: v.role, sessionId: v.sessionId }).toEqual({ id: b.id, uid: b.uid, role: b.role, sessionId: b.session });
      expect(v.instructions.length).toBeGreaterThan(0);
      expect(v.pausedAtLimit).toBe(b.atLimit);
      expect(Date.parse(v.createdAt)).toBeLessThan(NOW);
      const log = logOf(own('/log'));
      expect(log.rows.length, b.id).toBeGreaterThan(0);
      expect(log.rows.map((r) => r.seq)).toEqual(log.rows.map((_, i) => i + 1));
      // The newest row is the list's last activity, and every row is in the past.
      const listed = (kit(b.computer, 'agent', '/api/v1/agent/bots?limit=100&realm=all') as { items: Array<{ id: string; last_activity: string }> }).items.find((x) => x.id === b.id)!;
      expect(log.rows[log.rows.length - 1]!.at).toBe(listed.last_activity);
      for (const r of log.rows) { expect(['user', 'bot']).toContain(r.kind); expect(Date.parse(r.at)).toBeLessThanOrEqual(NOW); }
      expect(own('/delegates')).toEqual({ items: [], meta: { total: 0 } });
      expect(own('/channels')).toEqual({ items: [] });
      expect(channelSettingsOf(own('/channel-settings'))).toMatchObject({ ok: true, paused: false });
      // Another realm's read, another computer's and a Bot the sample world lacks: no answer.
      expect(own('', 'f0f0f0f0f0f0f0f0f0f0f0f0')).toBeUndefined();
      expect(kit(computers.find((x) => x.id !== b.computer)!.id, 'agent', `/api/v1/agent/bots/${b.id}?realm=all`)).toBeUndefined();
    }
    expect(Object.keys(DEMO_BOT_LOGS).sort()).toEqual(DEMO_BOTS.map((b) => b.id).sort());
    expect(kit(DEMO_BOTS[0]!.computer, 'agent', '/api/v1/agent/bots/no-such-bot?realm=all')).toBeUndefined();
  });

  test('Files: every folder the top folder leads to opens, and every file in it reads as text or as a binary', async () => {
    const atlas = DEMO_CONTEXT.containerId;
    for (const id of [atlas, computers.find((x) => x.id !== atlas)!.id]) {
      const top = rootListingOf(kit(id, 'files', '/?json='));
      expect(top, id).not.toBeNull();
      expect(top!.hidden).toBe(0);
      const opened: string[] = [];
      const walk = async (dir: string, entries: Array<{ name: string; dir: boolean }>): Promise<void> => {
        for (const e of entries) {
          const p = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`;
          if (e.dir) {
            const f = folderOf(kit(id, 'files', `/api/v1/files${p.split('/').map(encodeURIComponent).join('/')}`));
            expect(f, `${id} ${p}`).not.toBeNull();
            expect(f!.whole).toBe(true);
            opened.push(p);
            await walk(p, f!.entries);
          } else {
            const res = await c.fetch(kitUrl(id, 'files', `/api/v1/files${p}?lines=1-40`));
            expect(res.status, p).toBe(200);
            // A text file reads as its text; a program (an executable's bytes) as no text.
            expect(textOf(new Uint8Array(await res.arrayBuffer())), p).toBe(DEMO_FILE_TEXT[e.name] ?? null);
          }
        }
      };
      await walk('/', top!.entries);
      if (id === atlas) {
        expect(opened[0]).toBe('/bin');
        expect(['/', ...opened].sort()).toEqual(Object.keys(DEMO_FILES).sort());
      }
    }
    // The client serves the same folder (what the page sends: the folder's parts, no query).
    const bin = folderOf(await (await c.fetch(kitUrl(atlas, 'files', '/api/v1/files/bin'))).json());
    expect(bin!.entries.map((e) => e.name)).toEqual(['bash', 'cat', 'ls']);
    // Programs and shell scripts run (mode 755); every other file does not.
    const modes = (p: string) => Object.fromEntries((kit(atlas, 'files', `/api/v1/files${p}`) as { entries: Array<{ name: string; mode: string }> }).entries.map((e) => [e.name, e.mode]));
    expect(modes('/bin')).toEqual({ bash: '755', cat: '755', ls: '755' });
    expect(modes('/home/ada/projects/site')).toEqual({ 'config.yaml': '644', 'deploy.sh': '755', 'index.html': '644' });
    // Find by name, as the page reads it: below the folder, any case, as paths from the top; the top folder has no search.
    const find = (base: string, q: string) => foundOf(kit(atlas, 'files', `/api/v1/files${base}?q=${q}`), base)?.items.map((x) => x.path);
    expect(find('/home', 'READ')).toEqual(['/home/ada/projects/README.md']);
    expect(find('/srv', 'index')).toEqual(['/srv/app/public/index.html']);
    expect(find('/home/ada', 'no-such-name')).toEqual([]);
    expect(kit(atlas, 'files', '/api/v1/files/no-such-folder?q=a')).toBeUndefined();
    expect(kit(atlas, 'files', '/api/v1/files/no-such-folder')).toBeUndefined();
    expect(kit(atlas, 'files', '/?extraction_history=')).toBeUndefined();
  });

  test('Programs: every program the overview lists has its sandbox read, and the host names its sandbox parts', () => {
    const atlas = DEMO_CONTEXT.containerId;
    const overview = kit(atlas, 'daemon', '/api/v1/daemon/programs/overview') as { programs: Array<{ id: number; name: string }> };
    expect(overview.programs.length).toBeGreaterThan(5);
    for (const p of overview.programs) {
      const st = readStatus(kit(atlas, 'daemon', `/api/v1/daemon/programs/${p.id}/sandbox`));
      expect(st, p.name).not.toBeNull();
      expect(st!.problems).toEqual([]);
      expect(st!.configured !== null).toBe(DEMO_SANDBOXED.includes(String(p.id)));
    }
    for (const id of DEMO_SANDBOXED) expect(overview.programs.some((p) => String(p.id) === id)).toBe(true);
    // A program the computer does not have has no sandbox to read (atlas's web is not on borealis).
    expect(kit(atlas, 'daemon', '/api/v1/daemon/programs/999/sandbox')).toBeUndefined();
    expect(kit(computers.find((x) => x.name === 'borealis')!.id, 'daemon', '/api/v1/daemon/programs/1/sandbox')).toBeUndefined();
    expect(readHost((kit(atlas, 'daemon', '/api/v1/daemon/health') as { sandbox: unknown }).sandbox)).not.toBeNull();
  });
});

describe('what a person opens in a tab (each page\'s own readers take it whole)', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string; realm_ids: string[]; ssh_hostname: string }> } }).data.computers;
  const kit = (id: string, program: string, p: string): unknown => demoKitAnswer(`https://${computers.find((x) => x.id === id)!.project_id}-${id}-${program}-1.n12.${DEMO_DOMAIN}${p}`, NOW)?.body;
  const atlas = DEMO_CONTEXT.containerId;
  const schemaOf = (url: string) => apiGetOf(url)?.responses['200']?.content?.['application/json']?.schema;
  const P_HOME = DEMO_CONTEXT.projectId;

  test('an item of a recorded list is that list\'s row, in the API\'s schema; an id the list lacks is a 404', async () => {
    const realms = [...new Set(computers.flatMap((x) => x.realm_ids))];
    const reads = [
      `/computers/${atlas}`,
      `/computers/${atlas}?runtime=true`,
      `/computers?realm_id=${realms[0]}&page=1&limit=100`,
      `/projects/${P_HOME}/computers?page=1&limit=100&include_expired=true&include_deleting=true`,
      `/vault/keys/github-token?realm_id=${DEMO_CONTEXT.realmId}`,
    ];
    for (const url of reads) {
      const got = await c.request('GET', url);
      expect(check(got, schemaOf(url)!, url), url).toEqual([]);
    }
    for (const x of computers) {
      const one = (await c.request('GET', `/computers/${x.id}`)) as { data: { id: string; name: string; ssh_hostname: string; realm_ids: string[] } };
      expect({ id: one.data.id, name: one.data.name, ssh_hostname: one.data.ssh_hostname, realm_ids: one.data.realm_ids }).toEqual({ id: x.id, name: x.name, ssh_hostname: x.ssh_hostname, realm_ids: x.realm_ids });
    }
    // Every realm's computers are exactly the list's rows in that realm; every project's, those of that project.
    const inRealm = async (r: string) => ((await c.request('GET', `/computers?realm_id=${r}`)) as { data: { computers: Array<{ id: string }> } }).data.computers.map((x) => x.id).sort();
    for (const r of realms) expect(await inRealm(r)).toEqual(computers.filter((x) => x.realm_ids.includes(r)).map((x) => x.id).sort());
    expect(await inRealm('f0f0f0f0f0f0f0f0f0f0f0f0')).toEqual([]);
    for (const pid of DEMO_PROJECTS) {
      const got = projectComputersOf(await c.request('GET', `/projects/${pid}/computers?page=1&limit=100&include_expired=true&include_deleting=true`));
      expect(got!.rows.map((x) => x.id).sort(), pid).toEqual(computers.filter((x) => x.project_id === pid).map((x) => x.id).sort());
      expect(got!.total).toBe(got!.rows.length);
    }
    for (const bad of [`/computers/c0a715000000000000000999`, `/computers/c0a715000000000000000999?runtime=true`, `/vault/keys/no-such-key?realm_id=${DEMO_CONTEXT.realmId}`, `/vault/keys/github-token?realm_id=f2f2f2f2f2f2f2f2f2f2f2f2`, `/projects/6a0000000000000000000009/computers`]) {
      await expect(c.request('GET', bad), bad).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    }
  });

  test('Computers: a computer\'s Ports read is what it listens on (nothing while it does not run): its own programs\' ports and Hoody\'s', async () => {
    for (const x of computers) {
      const url = `/computers/${x.id}?runtime=true`;
      const got = (await c.request('GET', url)) as { data: { status: string; runtime_info: unknown } };
      expect(check(got, schemaOf(url)!, url), x.name).toEqual([]);
      if (got.data.status !== 'running') { expect(got.data.runtime_info, x.name).toBeNull(); continue; }
      const r = classifyRuntime(got.data.runtime_info as never);
      // The ports of the programs the overview shows running: the computer's own are "yours", the Hoody Kit ones Hoody's.
      const overview = kit(x.id, 'daemon', '/api/v1/daemon/programs/overview') as { programs: Array<{ hoody_kit: boolean; instances: Array<{ port?: number; status: string }> }> };
      const running = (hoodyKit: boolean) => overview.programs.filter((p) => p.hoody_kit === hoodyKit).flatMap((p) => p.instances.filter((i) => i.status === 'running' && i.port).map((i) => i.port!));
      expect(r.yours.map((l) => l.port), x.name).toEqual(running(false).sort((a, b) => a - b));
      expect(r.yours.every((l) => l.kind === 'web')).toBe(true);
      expect(running(true).every((n) => r.system.includes(n)), x.name).toBe(true);
      expect(r.system, x.name).toContain(22);
      expect([r.terminals, r.displays]).toEqual([0, 0]);
    }
    expect(classifyRuntime(((await c.request('GET', `/computers/${atlas}?runtime=true`)) as { data: { runtime_info: never } }).data.runtime_info).yours.map((l) => l.port)).toEqual([3000, 8000, 8001]);
  });

  test('Computers: every computer\'s own access rules open in the drawer, in the mode they were saved in; another realm\'s are a 404', async () => {
    const modes: Record<string, string> = {};
    for (const x of computers) {
      const item = (await c.request('GET', `/computers/${x.id}`)) as { data: { proxy_permissions_scope: string; proxy_permissions_computer_state?: string } };
      const rules = rulesFrom(await c.request('GET', `/computers/${x.id}/proxy/permissions`));
      expect(rules, x.name).not.toBeNull();
      expect(rules!.project).toBe(x.project_id);
      // A computer keeps a document of its own exactly when its scope says so (computer or both), and only that one has a version.
      const own = ownOf(item.data);
      expect(own, x.name).toBe(['computer', 'both'].includes(item.data.proxy_permissions_scope) ? 'yes' : 'no');
      expect(rules!.version > 0, x.name).toBe(own === 'yes');
      modes[x.name] = modeOf(rules!, projectRulesOf(item.data.proxy_permissions_scope)).kind;
    }
    // Where the project has rules too the drawer says so (advanced); cedar and fjord follow the open Home base project.
    expect(modes).toEqual({ atlas: 'ips', borealis: 'advanced', cedar: 'anyone', dune: 'myIp', ember: 'advanced', fjord: 'anyone', granite: 'ips', harbor: 'advanced' });
    // The project list says the same of each of its computers.
    for (const pid of DEMO_PROJECTS) {
      const got = projectComputersOf(await c.request('GET', `/projects/${pid}/computers?page=1&limit=100&include_expired=true&include_deleting=true`));
      for (const row of got!.rows) expect(ownOf(row), row.name).toBe(['computer', 'both'].includes(String(row.proxy_permissions_scope)) ? 'yes' : 'no');
    }
    await expect(c.request('GET', '/computers/c0a715000000000000000999/proxy/permissions')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    await expect(c.request('GET', `/computers/${atlas}/proxy/permissions`, undefined, { base: 'https://f2f2f2f2f2f2f2f2f2f2f2f2.realms.demo.invalid/api/v1' })).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  test('Vault: every recorded entry shows its value; the account-wide partition holds the realm names only', async () => {
    const list = (await c.request('GET', `/vault/keys?realm_id=${DEMO_CONTEXT.realmId}`)) as { data: Array<{ key: string; size_bytes: number }> };
    expect(list.data.map((x) => x.key).sort()).toEqual(Object.keys(DEMO_VAULT_VALUES).sort());
    for (const row of list.data) {
      const got = (await c.request('GET', `/vault/keys/${encodeURIComponent(row.key)}?realm_id=${DEMO_CONTEXT.realmId}`)) as { data: { key: string; value: string } };
      expect(got.data).toMatchObject({ key: row.key, value: DEMO_VAULT_VALUES[row.key] });
    }
    const global = (await c.request('GET', '/vault/keys')) as { data: Array<{ key: string; realm_id: string }> };
    expect(global.data).toMatchObject([{ key: 'hoody.realm-aliases', realm_id: '' }]);
    expect(((await c.request('GET', '/vault/stats')) as { data: { total_keys: number } }).data.total_keys).toBe(1);
  });

  test('Computers and Notifications: a project\'s people and rules, a server\'s commands, the notices', async () => {
    const projects = (W.records.find((r) => r.url === '/projects?limit=100')!.body as { data: { projects: Array<{ id: string }> } }).data.projects.map((x) => x.id);
    expect([...DEMO_PROJECTS].sort()).toEqual([...projects].sort());
    for (const pid of DEMO_PROJECTS) {
      expect(membersFrom(await c.request('GET', `/projects/${pid}/permissions?page=1&limit=100`)), pid).not.toBeNull();
      expect(rulesFrom(await c.request('GET', `/projects/${pid}/proxy/permissions`)), pid).not.toBeNull();
    }
    await expect(c.request('GET', '/projects/6a0000000000000000000009/permissions')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
    const servers = [...new Set(computers.map((x) => (x as unknown as { server_id: string }).server_id))];
    for (const id of servers) expect(commandsOf(await c.request('GET', `/servers/${id}/available-commands`)), id).not.toBeNull();
    expect(parseNoticeList(await c.request('GET', '/abuse-notices?page=1&limit=100'))).not.toBeNull();
  });

  test('Computers: every server\'s drawer reads its live usage (the whole machine or a slice), within its listed specs', async () => {
    const servers = (W.records.find((r) => r.url === '/servers')!.body as { data: Array<{ server_id: string; server: { name: string; is_vm: boolean; specs: { cpu_cores: number; ram_gb: number; disk_gb: number } } }> }).data;
    expect(servers.length).toBe(3);
    for (const s of servers) {
      const url = `/rentals/${s.server_id}/runtime`;
      const got = await c.request('GET', url);
      expect(check(got, schemaOf(url)!, url), s.server.name).toEqual([]);
      const r = runtimeOf(got, s.server_id);
      expect(r, s.server.name).toMatchObject({ rentalId: s.server_id, scope: s.server.is_vm ? 'subserver' : 'server', stale: false });
      for (const v of [r!.cpu, r!.mem, r!.disk]) { expect(v).not.toBeNull(); expect(v!).toBeGreaterThan(0); expect(v!).toBeLessThan(100); }
      const d = (got as { data: Record<string, Record<string, number>> }).data;
      const GIB = 1024 ** 3;
      if (s.server.is_vm) expect([d.cpu!.limit_cores, d.mem!.limit_bytes! / GIB, d.disk!.limit_bytes! / GIB]).toEqual([s.server.specs.cpu_cores, s.server.specs.ram_gb, s.server.specs.disk_gb]);
      else expect([(d as unknown as { cores: number }).cores, d.mem!.total_bytes! / GIB, d.storage!.total_bytes! / GIB]).toEqual([s.server.specs.cpu_cores, s.server.specs.ram_gb, s.server.specs.disk_gb]);
    }
    await expect(c.request('GET', '/rentals/5e0000000000000000000099/runtime')).rejects.toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  test('Scripts: each script\'s text and settings read; the settings list parses', () => {
    expect(parseSchema(kit(atlas, 'exec', '/api/v1/exec/magic-comments/schema'))).not.toBeNull();
    for (const x of DEMO_SCRIPTS) {
      const q = `?path=${encodeURIComponent(`default/1/${x.file}`)}`;
      const read = kit(x.computer, 'exec', `/api/v1/exec/scripts/read${q}`) as { content: string; revision: string; magicComments: { label: string } };
      expect(read.content, x.file).toBe(DEMO_SCRIPT_CODE[x.file]!.text);
      expect(read.content).toContain(`// @label ${x.label}`);
      expect(read.revision).toMatch(/^[0-9a-f]{16}$/);
      expect((kit(x.computer, 'exec', `/api/v1/exec/magic-comments/read${q}`) as { comments: { label: string } }).comments.label).toBe(x.label);
      // Another computer has no such script.
      expect(kit(computers.find((o) => o.id !== x.computer)!.id, 'exec', `/api/v1/exec/scripts/read${q}`)).toBeUndefined();
    }
  });

  test('Schedules: "Show the command" reads each entry\'s command; an unknown entry is a 404', () => {
    for (const x of DEMO_SCHEDULES) {
      const e = kit(x.computer, 'cron', `/api/v1/cron/users/user/entries/${x.id}`) as { id: string; command: string; enabled: boolean };
      expect(e, x.name).toMatchObject({ id: x.id, command: x.command, enabled: x.enabled });
    }
    expect(kit(atlas, 'cron', '/api/v1/cron/users/user/entries/00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });

  test('Logs: the programs are the overview\'s, each with its output; account activity filters as the API does', async () => {
    const overview = kit(atlas, 'daemon', '/api/v1/daemon/programs/overview') as { programs: Array<{ id: number; name: string }> };
    const listed = (kit(atlas, 'daemon', '/api/v1/daemon/programs') as { programs: Array<{ id: number; name: string }> }).programs;
    expect(listed.map((p) => [p.id, p.name])).toEqual(overview.programs.map((p) => [p.id, p.name]));
    for (const p of DEMO_DAEMON_PROGRAMS(atlas)) {
      for (const type of ['stdout', 'stderr']) {
        const got = kit(atlas, 'daemon', `/api/v1/daemon/programs/${p.id}/logs?type=${type}&lines=2000`) as { success: boolean; logs: string; lines: number };
        expect(got.success).toBe(true);
        expect(got.logs.split('\n').filter(Boolean).length).toBe(got.lines);
        expect(got.lines).toBe((DEMO_PROGRAM_LOGS[p.name]?.[type as 'stdout'] ?? []).length);
      }
    }
    expect(kit(atlas, 'daemon', '/api/v1/daemon/programs/999/logs')).toBeUndefined();
    type Activity = { data: Array<{ created_at: string; status_code: number }>; metadata: { total: number } };
    const hour = (await c.request('GET', `/users/auth/activity?page=1&limit=100&start_date=${new Date(NOW - 3_600_000).toISOString()}`)) as Activity;
    expect(hour.data.length).toBe(DEMO_ACTIVITY.filter(([min]) => min <= 60).length);
    expect(hour.metadata.total).toBe(hour.data.length);
    const problems = (await c.request('GET', `/users/auth/activity?page=1&limit=100&start_date=2026-01-01T00:00:00.000Z&min_status=400`)) as Activity;
    expect(problems.data.map((r) => r.status_code)).toEqual([409]);
    const times = hour.data.map((r) => Date.parse(r.created_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe('the listed chats: what opening one reads', () => {
  const NOW = Date.parse('2027-03-01T12:00:00Z');
  const c = demoClient(() => NOW);
  const computers = (W.records.find((r) => r.url === '/computers?limit=100')!.body as { data: { computers: Array<{ id: string; name: string; project_id: string; realm_ids: string[] }> } }).data.computers;
  const atlas = DEMO_CONTEXT.containerId;
  const agentUrl = (id: string, p: string, realm: string | null): string => `https://${computers.find((x) => x.id === id)!.project_id}-${id}-agent-1.n12.${DEMO_DOMAIN}/api/v1/agent${p}${realm === null ? '' : `?realm=${realm}`}`;
  const url = (id: string, sid: string, rest: string, realm: string): string => agentUrl(id, `/sessions/${sid}${rest}`, realm);
  const read = async (id: string, sid: string, rest: string, realm: string): Promise<{ status: number; body: Record<string, unknown> | null }> => {
    const r = await c.fetch(url(id, sid, rest, realm));
    return { status: r.status, body: r.status === 200 ? ((await r.json()) as Record<string, unknown>) : null };
  };
  const PARTS = ['', '/turns', '/transcript', '/state'];
  const list = W.records.find((r) => r.leg === 'fetch' && r.url.includes('/agent/sessions?') && r.url.includes(atlas))!;
  type Row = Record<string, unknown> & { id: string; started_at: string; last_request_at: string };
  const served = async (): Promise<Row[]> => ((await (await c.fetch(list.url)).json()) as { items: Row[] }).items;

  test('every chat the list shows opens (Bot sessions and the draft are never listed)', async () => {
    const shown = (list.body as { items: Array<{ id: string; first_message?: string; agent?: string; origin?: { ref?: string } }> }).items
      .filter((x) => x.first_message && x.agent !== 'bot' && !(x.origin && !x.origin.ref)).map((x) => x.id);
    expect(DEMO_CHATS.map((x) => x.id).sort()).toEqual([...shown].sort());
  });
  test('atlas answers each chat, its turns, its transcript and its state, alike in its realm and over all realms', async () => {
    for (const x of DEMO_CHATS) {
      for (const rest of PARTS) {
        const own = await read(atlas, x.id, rest, DEMO_CONTEXT.realmId);
        expect(own.status, `${x.id}${rest}`).toBe(200);
        expect(await read(atlas, x.id, rest, 'all'), `${x.id}${rest}`).toEqual(own);
      }
    }
  });
  test('another realm, another computer or another chat is not this chat', async () => {
    const other = computers.find((x) => x.id !== atlas && x.name === 'borealis')!.id;
    for (const x of DEMO_CHATS) {
      for (const rest of PARTS) {
        expect((await read(atlas, x.id, rest, 'f2f2f2f2f2f2f2f2f2f2f2f2')).status, `${x.id}${rest}`).toBe(404);
        expect((await read(other, x.id, rest, DEMO_CONTEXT.realmId)).status, `${x.id}${rest}`).toBe(404);
      }
    }
    expect((await c.fetch(url(atlas, 's-none', '', DEMO_CONTEXT.realmId))).status).toBe(404);
    expect((await c.fetch(url(atlas, 's-wait', '/stream', DEMO_CONTEXT.realmId))).status).toBe(404);
  });
  test('each chat is its list row (a working one opens on its finished turn), as old as the row', async () => {
    const rows = await served();
    for (const x of DEMO_CHATS) {
      const row = rows.find((r) => r.id === x.id)!;
      const chat = (await read(atlas, x.id, '', DEMO_CONTEXT.realmId)).body!.session as Row;
      for (const k of ['id', 'name', 'realm', 'model', 'cwd', 'pending_gate', 'backend_kind', 'origin', 'started_at', 'last_request_at']) expect(chat[k], `${x.id} ${k}`).toEqual(row[k]);
      expect(chat.state, x.id).toBe(row.state === 'running' ? 'idle' : row.state);
      // An unnamed chat shows the first line of what was asked (a named one shows its name).
      if (!x.name) expect<unknown>(String(row.first_message).split('\n')[0], x.id).toBe(chat.first_message);
    }
  });
  test('each transcript reads as its turns with their steps; the state parks only the waiting chat, on the recorded gate', async () => {
    const gate = (W.records.find((r) => r.leg === 'fetch' && r.url.includes('/agent/gates?') && r.url.includes(atlas))!.body as { items: Array<{ gate_id: string; generation: number; kind: string; session_id: string }> }).items[0]!;
    expect(gate.session_id).toBe('s-wait');
    for (const x of DEMO_CHATS) {
      const h = historyFrom((await read(atlas, x.id, '/transcript', DEMO_CONTEXT.realmId)).body, { liveTail: false, idOf: (i) => `u${i}`, at: NOW });
      expect(h.users.length, x.id).toBeGreaterThan(0);
      expect(h.turns, x.id).toHaveLength(h.users.length);
      for (const t of h.turns) { expect(t.s.segs.join('').length, x.id).toBeGreaterThan(0); for (const st of t.s.steps) expect(st.ok, `${x.id} ${st.name}`).not.toBeNull(); }
      const turns = (await read(atlas, x.id, '/turns', DEMO_CONTEXT.realmId)).body!.turns as Array<{ state: string }>;
      expect(turns, x.id).toHaveLength(h.turns.length);
      const st = onState(emptyBook(), (await read(atlas, x.id, '/state', DEMO_CONTEXT.realmId)).body);
      expect(st.stale, x.id).toBe(false);
      expect(st.addressing, x.id).toBe(false);
      expect(st.book.list.map((g) => [g.key, g.gate.generation, g.gate.kind]), x.id).toEqual(x.id === gate.session_id ? [[gate.gate_id, gate.generation, gate.kind]] : []);
      expect(turns[0]!.state, x.id).toBe(x.id === gate.session_id ? 'dispatched' : 'completed');
    }
    const wait = historyFrom((await read(atlas, 's-wait', '/transcript', DEMO_CONTEXT.realmId)).body, { liveTail: false, idOf: (i) => `u${i}`, at: NOW });
    expect(wait.users.map((u) => u.text)).toEqual([DEMO_WAIT_ASK]);
    expect(wait.turns[0]!.s.segs.join(' ')).toContain('The build passed');
    expect(wait.turns[0]!.s.steps.map((s) => [s.name, s.ok])).toEqual([['bash', true]]);
    // The working chat's fix: a failed test run, the edit, a passing run.
    const today = historyFrom((await read(atlas, 's-today', '/transcript', DEMO_CONTEXT.realmId)).body, { liveTail: false, idOf: (i) => `u${i}`, at: NOW });
    expect(today.turns[0]!.s.steps.map((s) => [s.name, s.ok])).toEqual([['bash', false], ['edit_file', true], ['bash', true]]);
  });
  test('every other computer\'s agent lists no chats, gates or changes, in any realm; atlas\'s own lists stay the recorded ones', async () => {
    const lists = ['/sessions?limit=50&page=1&order=last_active', '/gates?limit=100&page=1', '/sessions/cwds', '/changes'];
    for (const x of computers.filter((o) => o.id !== atlas)) {
      for (const realm of [...x.realm_ids, 'all']) {
        for (const p of lists) {
          const r = await c.fetch(agentUrl(x.id, p, null).replace(/$/, `${p.includes('?') ? '&' : '?'}realm=${realm}`));
          expect(r.status, `${x.name} ${p}`).toBe(200);
          const b = (await r.json()) as { items?: unknown[]; cwds?: unknown[]; tokens?: unknown };
          expect(b.items ?? b.cwds ?? (b.tokens ? [] : null), `${x.name} ${p}`).toEqual([]);
        }
      }
      expect((await c.fetch(agentUrl(x.id, '/pause', null))).status).toBe(200);
    }
    for (const p of lists) {
      const rec = W.records.find((r) => r.leg === 'fetch' && r.url.includes(atlas) && r.url.includes(`/agent${p.split('?')[0]}?`))!;
      expect(await (await c.fetch(rec.url)).text(), p).toBe(JSON.stringify(shiftTimes(rec.body, NOW - Date.parse(W.recordedAt))));
    }
  });
});
