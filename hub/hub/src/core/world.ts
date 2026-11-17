// world.ts: the one sample world every fixture, shot and dev page draws from.
//
// Contract, in plain words:
//   - fixtureWorld is one coherent account: Ada, three realms (Personal, Acme client, Lab), three servers in real
//     cities, eight computers with atlas the current one, programs, Bots, schedules, scripts, keys, notifications,
//     logs, billing and market listings. Every id is stable (24 hex where the API uses 24 hex) and every name is a
//     plausible real one. Pages build their fixtures from it and never invent other names.
//   - Records are in the Hoody API's own answer shapes where the page reads that answer (computers, projects,
//     servers); the rest are plain records with the fields a page shows. Times are fixed around WORLD_NOW so shots
//     never drift.
//   - Secrets never appear: keys carry only a masked hint; nothing is a working credential.
//   - manyNames(n, seed?) and manyComputers(n) make large lists ("312 rows") with realistic, never numbered,
//     unique names, deterministically.
//   - worldRules() are core's fixture answers for the account, realm list, aliases and setup reads of this world;
//     bootFixtureCore() (fixture-boot.ts) boots core on it.
import { nameWords } from './names';

/** The fixed "now" of the world (all times are relative to it). */
export const WORLD_NOW = Date.parse('2026-10-23T09:00:00Z');
const ago = (min: number) => new Date(WORLD_NOW - min * 60000).toISOString();
const ahead = (days: number) => new Date(WORLD_NOW + days * 86400000).toISOString();

export type WorldColor = 'red' | 'orange' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export interface WorldAccount { readonly id: string; readonly username: string; readonly email: string; readonly name: string }
export interface WorldRealm { readonly id: string; readonly name: string; readonly tint: WorldColor }
export interface WorldProject { readonly id: string; readonly name: string; readonly is_default?: boolean; readonly realm: string }
export interface WorldServer {
  readonly id: string; readonly name: string; readonly city: string; readonly country: string; readonly country_name: string;
  readonly cpu: number; readonly ram: number; readonly disk: number; readonly free: boolean; readonly status: string; readonly days: number | null;
}
export interface WorldComputer {
  readonly id: string; readonly name: string; readonly status: string; readonly project_id: string; readonly server_id: string;
  readonly server_name: string; readonly realm_ids: readonly string[]; readonly created_at: string; readonly computer_image: string;
  readonly size: { readonly cpu: number; readonly ram: number; readonly disk: number }; readonly comment?: string;
  readonly server: { readonly id: string; readonly name: string; readonly city: string; readonly country: string; readonly country_name: string };
}
export interface WorldProgram { readonly computer: string; readonly program: 'terminal' | 'files' | 'screen' | 'browser' | 'agent'; readonly name: string; readonly port?: number }
export interface WorldBot { readonly name: string; readonly computer: string; readonly realm: string; readonly model: string; readonly status: 'running' | 'idle' | 'paused'; readonly last: string }
export interface WorldSchedule { readonly id: string; readonly name: string; readonly computer: string; readonly cron: string; readonly command: string; readonly enabled: boolean; readonly last: string; readonly lastOk: boolean }
export interface WorldScript { readonly id: string; readonly name: string; readonly computer: string; readonly method: string; readonly path: string; readonly updated: string }
export interface WorldKey { readonly id: string; readonly alias: string; readonly hint: string; readonly realm: string | 'all'; readonly created: string; readonly expires: string | null; readonly lastUsed: string | null }
export interface WorldNotification { readonly id: string; readonly kind: 'info' | 'warning' | 'success' | 'error'; readonly title: string; readonly body: string; readonly at: string; readonly read: boolean }
export interface WorldLog { readonly at: string; readonly level: 'info' | 'warn' | 'error'; readonly source: string; readonly computer: string; readonly text: string }
export interface WorldPlan { readonly id: string; readonly title: string; readonly cpu: number; readonly ram: number; readonly disk: number; readonly monthly: number }
export interface WorldSubscription { readonly id: string; readonly plan: string; readonly server: string; readonly state: 'active' | 'overdue' | 'cancelled'; readonly paidThrough: string; readonly autoRenew: boolean; readonly monthly: number }
export interface WorldListing { readonly id: string; readonly name: string; readonly city: string; readonly country: string; readonly cpu: number; readonly ram: number; readonly disk: number; readonly monthly: number; readonly stock: number }

const account: WorldAccount = { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com', name: 'Ada' };

const realms: readonly WorldRealm[] = [
  { id: 'f1f1f1f1f1f1f1f1f1f1f1f1', name: 'Personal', tint: 'teal' },
  { id: 'f2f2f2f2f2f2f2f2f2f2f2f2', name: 'Acme client', tint: 'orange' },
  { id: 'f3f3f3f3f3f3f3f3f3f3f3f3', name: 'Lab', tint: 'purple' },
];
const [PERSONAL, ACME, LAB] = realms.map((r) => r.id) as [string, string, string];

const projects: readonly WorldProject[] = [
  { id: '6a0000000000000000000001', name: 'Home base', is_default: true, realm: PERSONAL },
  { id: '6a0000000000000000000002', name: 'Acme storefront', realm: ACME },
  { id: '6a0000000000000000000003', name: 'Experiments', realm: LAB },
];
const [P_HOME, P_ACME, P_LAB] = projects.map((p) => p.id) as [string, string, string];

const servers: readonly WorldServer[] = [
  { id: '5e0000000000000000000012', name: 'n12', city: 'Singapore', country: 'SG', country_name: 'Singapore', cpu: 16, ram: 64, disk: 1000, free: false, status: 'active', days: 18 },
  { id: '5e0000000000000000000007', name: 'fra-7', city: 'Frankfurt', country: 'DE', country_name: 'Germany', cpu: 8, ram: 32, disk: 500, free: false, status: 'active', days: 3 },
  { id: '5e0000000000000000000003', name: 'ash-3', city: 'Ashburn', country: 'US', country_name: 'United States', cpu: 4, ram: 8, disk: 160, free: true, status: 'active', days: null },
];
const srv = (name: string) => servers.find((s) => s.name === name) as WorldServer;

function computer(id: string, name: string, status: string, project: string, server: string, realm: string, minutesOld: number, size: [number, number, number], comment?: string): WorldComputer {
  const s = srv(server);
  return {
    id, name, status, project_id: project, server_id: s.id, server_name: s.name, realm_ids: [realm], created_at: ago(minutesOld), computer_image: 'debian/13',
    size: { cpu: size[0], ram: size[1], disk: size[2] }, ...(comment ? { comment } : {}),
    server: { id: s.id, name: s.name, city: s.city, country: s.country, country_name: s.country_name },
  };
}

const computers: readonly WorldComputer[] = [
  computer('c0a7150000000000000000a1', 'atlas', 'running', P_HOME, 'n12', PERSONAL, 60 * 24 * 40, [4, 8, 80], 'Main workstation'),
  computer('c0a7150000000000000000b2', 'borealis', 'running', P_ACME, 'fra-7', ACME, 60 * 24 * 21, [2, 4, 40], 'Storefront staging'),
  computer('c0a7150000000000000000c3', 'cedar', 'stopped', P_HOME, 'n12', PERSONAL, 60 * 24 * 90, [2, 4, 40]),
  computer('c0a7150000000000000000d4', 'dune', 'creating', P_LAB, 'ash-3', LAB, 3, [1, 2, 20]),
  computer('c0a7150000000000000000e5', 'ember', 'failed', P_ACME, 'fra-7', ACME, 60 * 5, [2, 4, 40]),
  computer('c0a7150000000000000000f6', 'fjord', 'paused', P_HOME, 'ash-3', PERSONAL, 60 * 24 * 12, [1, 2, 20]),
  computer('c0a715000000000000000107', 'granite', 'running', P_ACME, 'n12', ACME, 60 * 24 * 7, [4, 16, 160], 'Acme database'),
  computer('c0a715000000000000000118', 'harbor', 'running', P_LAB, 'ash-3', LAB, 60 * 24 * 2, [1, 2, 20]),
];
const ATLAS = computers[0] as WorldComputer;

/** Computer colours as the API keeps them, by computer name. Not on the world's computers: a page's `colours`
 *  fixture state puts them on its list, so no other state, test or shot changes. cedar's value is not a hex colour
 *  (the Hub draws none); granite is white and harbor near-black (the mark's ring keeps them visible). */
// Computer colours are API data, not Hub colours (an exception listed in exceptions.ts).
export const worldColours: Readonly<Record<string, string>> = Object.freeze({ atlas: '#3B82F6', borealis: '#f59e0b', cedar: 'red;x:url()', dune: '#abc', ember: '#EF4444', fjord: '#10B981', granite: '#FFFFFF', harbor: '#111111' });

const programs: readonly WorldProgram[] = [
  { computer: 'atlas', program: 'terminal', name: 'terminal-1' }, { computer: 'atlas', program: 'terminal', name: 'terminal-2' },
  { computer: 'atlas', program: 'files', name: 'files-1' }, { computer: 'atlas', program: 'screen', name: 'screen-1' },
  { computer: 'atlas', program: 'browser', name: 'browser-1' }, { computer: 'atlas', program: 'agent', name: 'agent-1', port: 45 },
  { computer: 'borealis', program: 'terminal', name: 'terminal-1' }, { computer: 'borealis', program: 'agent', name: 'agent-1', port: 45 },
  { computer: 'granite', program: 'terminal', name: 'terminal-1' }, { computer: 'harbor', program: 'files', name: 'files-1' },
];

const bots: readonly WorldBot[] = [
  { name: 'support-desk', computer: 'atlas', realm: PERSONAL, model: 'hoody-ai/hoody-free', status: 'running', last: ago(4) },
  { name: 'release-notes', computer: 'atlas', realm: PERSONAL, model: 'hoody-ai/hoody-free', status: 'idle', last: ago(60 * 26) },
  { name: 'inbox-triage', computer: 'borealis', realm: ACME, model: 'hoody-ai/hoody-free', status: 'running', last: ago(12) },
  { name: 'order-watch', computer: 'granite', realm: ACME, model: 'hoody-ai/hoody-free', status: 'paused', last: ago(60 * 24 * 3) },
];

const schedules: readonly WorldSchedule[] = [
  { id: 'sch_nightly_backup', name: 'Nightly backup', computer: 'atlas', cron: '0 2 * * *', command: 'restic backup ~/projects', enabled: true, last: ago(60 * 7), lastOk: true },
  { id: 'sch_weekly_report', name: 'Weekly sales report', computer: 'granite', cron: '0 8 * * 1', command: 'python3 reports/weekly.py', enabled: true, last: ago(60 * 24 * 3), lastOk: false },
  { id: 'sch_cert_renew', name: 'Renew certificates', computer: 'borealis', cron: '30 4 1 * *', command: 'certbot renew', enabled: false, last: ago(60 * 24 * 22), lastOk: true },
];

const scripts: readonly WorldScript[] = [
  { id: 'scr_deploy_site', name: 'deploy-site', computer: 'atlas', method: 'POST', path: '/deploy', updated: ago(60 * 30) },
  { id: 'scr_rotate_logs', name: 'rotate-logs', computer: 'atlas', method: 'POST', path: '/rotate', updated: ago(60 * 24 * 9) },
  { id: 'scr_stock_check', name: 'stock-check', computer: 'granite', method: 'GET', path: '/stock', updated: ago(60 * 24 * 2) },
];

const keys: readonly WorldKey[] = [
  { id: 'key_ci_deploy', alias: 'ci-deploy', hint: 'hdy_…3f9a', realm: ACME, created: ago(60 * 24 * 60), expires: ahead(30), lastUsed: ago(45) },
  { id: 'key_laptop', alias: 'laptop', hint: 'hdy_…c71e', realm: 'all', created: ago(60 * 24 * 120), expires: null, lastUsed: ago(60 * 3) },
  { id: 'key_old_script', alias: 'old-backup-script', hint: 'hdy_…0b42', realm: PERSONAL, created: ago(60 * 24 * 300), expires: ago(60 * 24 * 10), lastUsed: null },
];

const notifications: readonly WorldNotification[] = [
  { id: 'ntf_1', kind: 'warning', title: 'Payment due for fra-7', body: 'Your fra-7 subscription is 3 days overdue.', at: ago(60 * 5), read: false },
  { id: 'ntf_2', kind: 'error', title: 'ember did not start', body: 'The computer ember on fra-7 failed to start.', at: ago(60 * 5 - 10), read: false },
  { id: 'ntf_3', kind: 'success', title: 'Nightly backup finished', body: 'atlas: 2.1 GB backed up.', at: ago(60 * 7), read: true },
  { id: 'ntf_4', kind: 'info', title: 'New sign-in', body: 'A new sign-in from Singapore.', at: ago(60 * 24), read: true },
];

const logs: readonly WorldLog[] = [
  { at: ago(1), level: 'info', source: 'agent', computer: 'atlas', text: 'support-desk answered a message in 2.4 s' },
  { at: ago(3), level: 'warn', source: 'proxy', computer: 'borealis', text: 'slow upstream: /checkout took 4.1 s' },
  { at: ago(9), level: 'error', source: 'system', computer: 'ember', text: 'start failed: disk quota exceeded' },
  { at: ago(14), level: 'info', source: 'schedule', computer: 'atlas', text: 'Nightly backup started' },
  { at: ago(30), level: 'info', source: 'terminal', computer: 'granite', text: 'session opened by ada' },
];

const plans: readonly WorldPlan[] = [
  { id: 'plan_small', title: 'Small', cpu: 2, ram: 4, disk: 40, monthly: 6 },
  { id: 'plan_medium', title: 'Medium', cpu: 4, ram: 8, disk: 80, monthly: 12 },
  { id: 'plan_large', title: 'Large', cpu: 8, ram: 32, disk: 320, monthly: 39 },
];

const subscriptions: readonly WorldSubscription[] = [
  { id: 'sub_n12', plan: 'plan_large', server: 'n12', state: 'active', paidThrough: ahead(18), autoRenew: true, monthly: 39 },
  { id: 'sub_fra7', plan: 'plan_medium', server: 'fra-7', state: 'overdue', paidThrough: ago(60 * 24 * 3), autoRenew: false, monthly: 12 },
];

const listings: readonly WorldListing[] = [
  { id: 'mkt_sin_m', name: 'Singapore M', city: 'Singapore', country: 'SG', cpu: 4, ram: 16, disk: 200, monthly: 18, stock: 6 },
  { id: 'mkt_fra_l', name: 'Frankfurt L', city: 'Frankfurt', country: 'DE', cpu: 8, ram: 32, disk: 500, monthly: 34, stock: 2 },
  { id: 'mkt_ash_s', name: 'Ashburn S', city: 'Ashburn', country: 'US', cpu: 2, ram: 4, disk: 80, monthly: 7, stock: 0 },
  { id: 'mkt_tyo_m', name: 'Tokyo M', city: 'Tokyo', country: 'JP', cpu: 4, ram: 16, disk: 200, monthly: 21, stock: 4 },
];

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

export const fixtureWorld = /*#__PURE__*/ deepFreeze({
  now: WORLD_NOW,
  account,
  realms,
  projects,
  servers,
  computers,
  /** The current computer (the top bar's). */
  current: ATLAS,
  programs,
  bots,
  schedules,
  scripts,
  keys,
  notifications,
  logs,
  billing: { wallet: { balance: 42.5, currency: 'USD' }, plans, subscriptions },
  listings,
  /** Every display name the world uses (account, realms, projects, servers, computers, programs, Bots, schedules, scripts,
   *  key aliases, plans, listings, cities): the only names page fixtures, shots and specs may show. */
  names: [...new Set([account.name, account.username, ...realms.map((r) => r.name), ...projects.map((p) => p.name),
    ...servers.flatMap((v) => [v.name, v.city]), ...computers.map((c) => c.name), ...programs.map((p) => p.name), ...bots.map((b) => b.name),
    ...schedules.map((x) => x.name), ...scripts.map((x) => x.name), ...keys.map((k) => k.alias), ...plans.map((x) => x.title),
    ...listings.flatMap((l) => [l.name, l.city])])] as readonly string[],
  /** Lookups by name, for page fixtures. */
  realm: (name: string) => realms.find((r) => r.name === name) as WorldRealm,
  computer: (name: string) => computers.find((c) => c.name === name) as WorldComputer,
  server: (name: string) => srv(name),
});

// ---- many rows ----

/** n unique, realistic, never numbered names ("amber-falcon", "brisk-coral-heron"), the same every time for a seed. */
export function manyNames(n: number, seed = 1): string[] {
  const A = nameWords.adjectives, C = nameWords.colors, N = nameWords.animals;
  const out: string[] = [], seen = new Set<string>();
  let x = (seed * 2654435761) >>> 0;
  const next = () => { x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return x; };
  for (let i = 0; out.length < n && i < n * 50; i++) {
    const three = out.length >= A.length * N.length / 2;
    const name = three ? `${A[next() % A.length]}-${C[next() % C.length]}-${N[next() % N.length]}` : `${A[next() % A.length]}-${N[next() % N.length]}`;
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

const STATES = ['running', 'running', 'running', 'stopped', 'running', 'paused', 'creating', 'running', 'failed', 'stopped'];
/** n computers across the world's servers, projects and realms, with ids and names that never repeat. */
export function manyComputers(n: number, seed = 1): WorldComputer[] {
  const names = manyNames(n, seed);
  return names.map((name, i) => {
    const s = servers[i % servers.length] as WorldServer;
    const p = projects[i % projects.length] as WorldProject;
    const id = 'cc' + (seed % 256).toString(16).padStart(2, '0') + i.toString(16).padStart(20, '0');
    return computer(id, name, STATES[i % STATES.length] as string, p.id, s.name, p.realm, 60 * (i + 1) * 7, [1 << (i % 3), 2 << (i % 4), 20 << (i % 3)]);
  });
}
