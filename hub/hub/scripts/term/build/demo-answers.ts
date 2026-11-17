// The sample account's answers to the Hoody API reads that have no recorded answer (demo-world.gen.json): each is
// written by hand from the API's response schema of that route (generated/openapi.public.json, GET 200) and names
// only what the sample world holds (Ada; servers n12, fra-7, ash-3; computers atlas …). Times are relative to the
// moment of the read, so the account never looks stale. Plain data and two helpers: nothing of hub/src is imported.
// The recording draws every page at its default state only, so what a person opens from a list (a ticket, a Bot, a
// folder, a program's sandbox) is answered here too, for every row the list shows.

/** The address label the sample account is offered for a new Bot's public address (never registered anywhere). */
export const DEMO_BOT_LABEL = 'amber-falcon-river-k7m2q';

export interface DemoAnswer {
  /** The Hub's route path (no /api/v1 prefix, no query; `:id` for one segment). */
  path: string;
  match: RegExp;
  /** The answer's `data`; undefined: nothing of that id in the sample world (the read is a 404). `p` is the read's
   *  path with its query. */
  data(now: number, p: string): unknown;
  /** Top-level fields beside `data` (list totals). */
  extra?: Record<string, unknown>;
  /** A path this answer answers whole, for the checks of a `:id` route (demo-world.term.test.ts). */
  sample?: string;
}

const MIN = 60_000, DAY = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString();
const ACCOUNT = '64f0ada00000000000000001';
const PERSONAL = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const N12 = '5e0000000000000000000012', FRA7 = '5e0000000000000000000007', ASH3 = '5e0000000000000000000003';
const ATLAS = 'c0a7150000000000000000a1', P_HOME = '6a0000000000000000000001';

interface Plan { id: string; family: string; title: string; label: string; cents: number; cpu: number; ram: number; disk: number; computers: number; snaps: number; net: number; aliases: number; bots: number; shares: number; tier: 'free' | 'plus' | 'pro'; mult: number; about: string; features: string[] }
const PLANS: readonly Plan[] = [
  { id: '7a0000000000000000000001', family: '7f0000000000000000000001', title: 'Small', label: 'Server slice', cents: 600, cpu: 2, ram: 4, disk: 40, computers: 5, snaps: 3, net: 500, aliases: 10, bots: 25, shares: 5, tier: 'plus', mult: 2, about: 'A first server of your own.', features: ['2 CPU cores', '4 GB memory', '40 GB disk'] },
  { id: '7a0000000000000000000002', family: '7f0000000000000000000002', title: 'Medium', label: 'Server slice', cents: 1200, cpu: 4, ram: 8, disk: 80, computers: 10, snaps: 5, net: 1000, aliases: 25, bots: 50, shares: 5, tier: 'plus', mult: 3, about: 'Room for a few busy computers.', features: ['4 CPU cores', '8 GB memory', '80 GB disk'] },
  { id: '7a0000000000000000000003', family: '7f0000000000000000000003', title: 'Large', label: 'Server slice', cents: 3900, cpu: 8, ram: 32, disk: 320, computers: 25, snaps: 10, net: 1000, aliases: 50, bots: 100, shares: 25, tier: 'pro', mult: 5, about: 'For teams and heavy workloads.', features: ['8 CPU cores', '32 GB memory', '320 GB disk'] },
];
const resources = (p: Plan) => ({ cpu_cores: p.cpu, ram_gb: p.ram, disk_limit_gb: p.disk, disk_io_read_mib: 400, disk_io_write_mib: 200, network_limit_mbps: p.net, max_computers: p.computers, snapshots_per_computer: p.snaps, ai_multiplier: p.mult });
const catalogue = () => ({
  requested_locale: 'en',
  plans: PLANS.map((p, i) => ({
    id: p.id, family_id: p.family, type: 'slice', sort_order: i + 1, price_cents_per_month: p.cents, hold_days: 7, resources: resources(p),
    max_proxy_aliases: p.aliases, max_bot_urls: p.bots, max_storage_shares: p.shares, ai_tier: p.tier,
    text: { title: p.title, description: p.about, type_label: p.label, features: p.features },
    text_locales: { title: 'en', description: 'en', type_label: 'en', features: 'en' },
  })),
});
const subPlan = (p: Plan) => ({ family_id: p.family, title: p.title, type_label: p.label, price_cents_per_month: p.cents, hold_days: 7, resources: resources(p), max_proxy_aliases: p.aliases, max_bot_urls: p.bots, max_storage_shares: p.shares, ai_tier: p.tier });
const subscriptions = (now: number) => [
  { id: '7b0000000000000000000012', plan_id: PLANS[2]!.id, state: 'active', server_id: N12, server_name: 'n12', anchor_day: 10, auto_renew: true, paid_through: iso(now + 18 * DAY), active_operation_id: null, delete_at: null, created_at: iso(now - 72 * DAY), updated_at: iso(now - 12 * DAY), plan: subPlan(PLANS[2]!) },
  { id: '7b0000000000000000000007', plan_id: PLANS[1]!.id, state: 'active', server_id: FRA7, server_name: 'fra-7', anchor_day: 3, auto_renew: true, paid_through: iso(now + 9 * DAY), active_operation_id: null, delete_at: null, created_at: iso(now - 51 * DAY), updated_at: iso(now - 21 * DAY), plan: subPlan(PLANS[1]!) },
];

const spec = (model: string, cores: number, ram: number, disks: Array<[number, number]>, mbps: number) => ({
  cpu: { model, cores, threads: cores * 2, score: null, score_type: null },
  ram: { capacity_gb: ram, type: 'ECC DDR4', speed_mhz: 3200 },
  disks: { config: disks.map(([count, gb]) => ({ count, capacity_gb: gb, type: 'NVMe', interface: 'NVMe', model: 'Enterprise NVMe' })), total_gb: disks.reduce((a, [c, g]) => a + c * g, 0), summary: disks.map(([c, g]) => `${c} x ${g} GB NVMe`).join(' + ') },
  network: { bandwidth_mbps: mbps, bandwidth_formatted: mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`, traffic_tb: null, traffic_unlimited: true },
  additional: { ipv4_count: 1, ipv6_enabled: true },
});
// Each duration as the API lists it (price, hold days, first payment = price + setup fee; no setup fee here), the
// shape core/commerce-pure.ts quotes from: a listing with no such tier is drawn "Not for sale".
const tiers = (prices: Record<string, string>) => Object.fromEntries(Object.entries(prices).map(([days, price]) => [days, { price, hold_days: 1, total_first_payment: price }]));
const pricing = (prices: Record<string, string>) => ({ prices, setup_fee: '0.00', setup_fee_cents: 0, price_tiers: tiers(prices) });
const available = () => [
  { id: '5e00000000000000000000a1', name: 'Singapore M', country: 'SG', region: 'West Region', city: 'Jurong', datacenter: 'SIN-2', model: 'AMD EPYC 7313P', is_vm: false, category: 'general', featured: true, popularity_rank: 1, setup_time_minutes: 30, delivery_hours: 0, discount: null,
    pricing: pricing({ '30': '79.00', '90': '225.15', '365': '853.20' }), specs: spec('AMD EPYC 7313P', 16, 64, [[2, 960]], 1000) },
  { id: '5e00000000000000000000a2', name: 'Frankfurt L', country: 'DE', region: 'Hesse', city: 'Frankfurt', datacenter: 'FRA-1', model: 'AMD EPYC 7443P', is_vm: false, category: 'compute', featured: false, popularity_rank: 2, setup_time_minutes: 30, delivery_hours: 0, discount: null,
    pricing: pricing({ '30': '129.00', '90': '367.65', '365': '1393.20' }), specs: spec('AMD EPYC 7443P', 24, 128, [[2, 1920]], 1000) },
  { id: '5e00000000000000000000a3', name: 'Tokyo M', country: 'JP', region: 'Chiba', city: 'Inzai', datacenter: 'TYO-3', model: 'Intel Xeon E-2388G', is_vm: false, category: 'general', featured: false, popularity_rank: 3, setup_time_minutes: 45, delivery_hours: 0, discount: null,
    pricing: pricing({ '30': '89.00', '90': '253.65', '365': '961.20' }), specs: spec('Intel Xeon E-2388G', 8, 64, [[2, 960]], 1000) },
];

const session = (now: number, id: string, o: { current?: boolean; method: string; client: string; name: string; agent: string; country: string; ip: string; madeDays: number; seenMin: number }) => ({
  id, current: o.current === true, active: true, method: o.method, client: o.client, client_name: o.name, user_agent: o.agent,
  created_at: iso(now - o.madeDays * DAY), created_ip: o.ip, created_country: o.country, last_refreshed_at: iso(now - o.seenMin * MIN), last_ip: o.ip, last_country: o.country,
  expires_at: iso(now + 30 * DAY), ended_at: null, end_reason: null, ended_by_session_id: null, ended_by_current: false, auth_tokens_created: { count: 0, tokens: [] },
});
const history = (now: number) => [
  { id: '8c0000000000000000000001', event: 'login', outcome: 'success', ip_address: '203.0.113.24', country: 'SG', client: 'Hoody CLI', created_at: iso(now - 12 * MIN) },
  { id: '8c0000000000000000000002', event: 'login', outcome: 'success', ip_address: '203.0.113.24', country: 'SG', client: 'Firefox on Linux', created_at: iso(now - 2 * DAY) },
  { id: '8c0000000000000000000003', event: 'two_factor_enabled', outcome: 'success', ip_address: '203.0.113.24', country: 'SG', client: 'Firefox on Linux', created_at: iso(now - 40 * DAY) },
  { id: '8c0000000000000000000004', event: 'password_changed', outcome: 'success', ip_address: '198.51.100.7', country: 'DE', client: 'Safari on macOS', created_at: iso(now - 96 * DAY) },
];
const lane = (percent: number, now: number) => ({ status: 'ok', percent_used: percent, resets_at: iso(now + DAY - (now % DAY)) });
const event = (now: number, n: number, type: string, min: number, payload: Record<string, unknown>) => ({
  id: `8e00000000000000000000${n.toString(16).padStart(2, '0')}`, event_type: type, resource_type: 'computer', resource_id: ATLAS, user_id: ACCOUNT, payload, realm_ids: [PERSONAL],
  created_at: iso(now - min * MIN), event: type, eventId: `8e00000000000000000000${n.toString(16).padStart(2, '0')}`, timestamp: iso(now - min * MIN), data: payload, cursor: null, schema_version: 1,
  change_id: null, operation_id: null, project_id: P_HOME, computer_id: ATLAS, all_realms: false, visibility: 'full', cause_event_id: null, actor: { kind: 'user', id: ACCOUNT }, ephemeral: false,
});
const events = (now: number) => [
  event(now, 1, 'computer.snapshot.created', 95, { id: ATLAS, name: 'atlas', snapshot: 'before-upgrade' }),
  event(now, 2, 'computer.running', 7 * 60, { id: ATLAS, name: 'atlas', status: 'running' }),
  event(now, 3, 'computer.stopped', 7 * 60 + 2, { id: ATLAS, name: 'atlas', status: 'stopped' }),
  event(now, 4, 'computer.ssh_key.added', 3 * 24 * 60, { id: ATLAS, name: 'atlas' }),
];

const A = (path: string, data: DemoAnswer['data'], extra?: DemoAnswer['extra']): DemoAnswer => ({ path, match: new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), data, ...(extra ? { extra } : {}) });
/** A route with one id segment (`:id`, 24 hex): `sample` is a path it answers. */
const R = (path: string, sample: string, data: DemoAnswer['data']): DemoAnswer => ({ path, match: new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(':id', '[0-9a-f]{24}') + '$'), data, sample });
const queryOf = (p: string): URLSearchParams => new URLSearchParams(p.replace(/#.*$/s, '').split('?')[1] ?? '');

// Support (pages/support/logic.ts selectList, selectThread): the sample account's tickets and their threads. The
// list is newest first; a thread arrives newest first, as the API sends it.
type DemoMessage = readonly [from: 'you' | 'support', minutesAgo: number, body: string];
interface DemoTicket { n: number; subject: string; category: string; status: 'open' | 'waiting_user' | 'closed'; unread: boolean; closedMin?: number; thread: readonly DemoMessage[] }
export const DEMO_TICKETS: readonly DemoTicket[] = [
  { n: 1, subject: 'My computer is slow since this morning', category: 'computers', status: 'waiting_user', unread: true, thread: [
    ['you', 60 * 5, 'Since about 08:00 UTC atlas takes a long time to open files, and the terminal lags.\nNothing changed on my side.'],
    ['support', 50, 'Thanks for the details. A disk on its host was busy with a check, which finished an hour ago.\nCould you try again and tell us whether it is back to normal?'],
  ] },
  { n: 2, subject: 'How do I put my own domain on a program?', category: 'networking', status: 'open', unread: false, thread: [
    ['you', 60 * 26, 'I would like shop.example.com to open the web program on atlas. Where do I set that up?'],
  ] },
  { n: 3, subject: 'Can one Bot answer in two Telegram groups?', category: 'bots', status: 'closed', unread: false, closedMin: 60 * 24 * 5 - 30, thread: [
    ['you', 60 * 24 * 6, 'Can one Bot answer in two Telegram groups, or do I need a second Bot?'],
    ['support', 60 * 24 * 6 - 95, 'One Bot can answer in both. Add it to the second group, then let the group in from the Bot\'s Chat apps tab.'],
    ['you', 60 * 24 * 5 - 20, 'That worked, thank you!'],
  ] },
];
const ticketId = (n: number): string => `6d1c${n.toString(16).padStart(20, '0')}`;
const messageId = (n: number, seq: number): string => `6d1d${(n * 256 + seq).toString(16).padStart(20, '0')}`;
const ticketOf = (t: DemoTicket, now: number) => {
  const first = t.thread[0]!, last = t.thread[t.thread.length - 1]!;
  return {
    id: ticketId(t.n), subject: t.subject, category: t.category, status: t.status, terminal: false, unread: t.unread,
    created_at: iso(now - first[1] * MIN), last_message_at: iso(now - last[1] * MIN),
    closed_at: t.closedMin === undefined ? null : iso(now - t.closedMin * MIN), reopenable: t.status === 'closed',
  };
};
function ticketList(now: number, p: string) {
  const q = queryOf(p);
  const status = q.get('status');
  const limit = Number(q.get('limit') ?? 20);
  const rows = DEMO_TICKETS.filter((t) => !status || t.status === status).map((t) => ticketOf(t, now));
  return { tickets: rows.slice(0, Number.isInteger(limit) && limit > 0 ? limit : 20), next_cursor: null };
}
function ticketThread(now: number, p: string) {
  const id = p.replace(/[?#].*$/s, '').split('/')[3];
  const t = DEMO_TICKETS.find((x) => ticketId(x.n) === id);
  if (!t) return undefined;
  const before = Number(queryOf(p).get('before_seq') ?? Infinity);
  const messages = t.thread.map(([from, min, body], i) => ({ id: messageId(t.n, i + 1), seq: i + 1, from, body, created_at: iso(now - min * MIN) }))
    .filter((m) => m.seq < before).reverse();
  return { ticket: ticketOf(t, now), messages, has_older: false };
}

// A project's people and access rules (pages/computers/parts/projectPerms.logic.ts membersFrom, access.logic.ts
// rulesFrom). The sample projects are the recorded project list's (demo-world.term.test.ts): Home base is Ada's alone
// and open to all; Acme storefront and Experiments let one documentation address range in.
const P_ACME = '6a0000000000000000000002', P_LAB = '6a0000000000000000000003';
export const DEMO_PROJECTS: readonly string[] = [P_HOME, P_ACME, P_LAB];
const segOf = (p: string, i: number): string => p.replace(/[?#].*$/s, '').split('/')[i] ?? '';
const GRACE = '64f0ada00000000000000002';
function projectPeople(now: number, p: string) {
  const id = segOf(p, 2);
  if (!DEMO_PROJECTS.includes(id)) return undefined;
  const rows = id === P_ACME ? [{ id: '9a0000000000000000000002', project_id: id, user_id: GRACE, permission_level: 'edit', created_at: iso(now - 9 * DAY), updated_at: iso(now - 9 * DAY), user: { id: GRACE, username: 'grace', alias: 'Grace' } }] : [];
  return { permissions: rows, pagination: { total: rows.length, page: 1, limit: 100, totalPages: rows.length ? 1 : 0 } };
}
const IP_GROUP = 'hub-ip-203-0-113-0-24';
function projectRules(_now: number, p: string) {
  const id = segOf(p, 2);
  if (!DEMO_PROJECTS.includes(id)) return undefined;
  return id === P_HOME
    ? { project: id, groups: {}, permissions: {}, default: 'allow', enable_proxy: true, schema_version: 2, file_version: 0, etag: 'file:v0' }
    : { project: id, groups: { [IP_GROUP]: { type: 'ip', range: '203.0.113.0/24' } }, permissions: { [IP_GROUP]: { '*': true, logs: true } }, default: 'deny', enable_proxy: true, schema_version: 2, file_version: 2, etag: 'file:v2' };
}
/** A server's commands (pages/computers/parts/ServerDetail.commands.logic.ts commandsOf): none offered on the sample servers. */
function serverCommands(_now: number, p: string) {
  const id = segOf(p, 2);
  const name = id === N12 ? 'n12' : id === FRA7 ? 'fra-7' : id === ASH3 ? 'ash-3' : null;
  return name ? { commands: [], server_info: { id, name, is_ready: true, rental_status: 'active' } } : undefined;
}
/** A server's live usage (GET /rentals/:id/runtime; ServerDetail.logic.ts runtimeOf): n12 is a whole bare-metal
 *  server (scope server), fra-7 and the free ash-3 are slices (scope subserver). Sizes are each server's listed specs. */
const gib = (x: number): number => Math.round(x * 1024 ** 3);
const pctOf = (used: number, of: number): number => Math.round((used / of) * 1000) / 10;
function serverRuntime(now: number, p: string) {
  const id = segOf(p, 2);
  const at = { ts: iso(now - 4000), cache_age_ms: 4000, stale: false };
  if (id === N12) {
    return {
      scope: 'server', ...at, uptime_s: 26 * 86_400 + 3 * 3600, cores: 16, load: { 1: 0.82, 5: 0.74, 15: 0.69 }, cpu: { busy_pct: 9.5 },
      mem: { used_bytes: gib(21.3), total_bytes: gib(64), pct: pctOf(21.3, 64) }, swap: { used_bytes: 0, total_bytes: gib(4) },
      storage: { used_bytes: gib(312), total_bytes: gib(1000), pct: pctOf(312, 1000) },
    };
  }
  const slice = (cores: number, used: number, ramGb: number, memGb: number, diskGb: number, usedGb: number, pids: number) => ({
    scope: 'subserver', ...at, health: 'ok', cpu: { usage_cores: used, usage_pct: pctOf(used, cores), limit_cores: cores },
    mem: { used_bytes: gib(memGb), limit_bytes: gib(ramGb), pct: pctOf(memGb, ramGb) }, disk: { used_bytes: gib(usedGb), limit_bytes: gib(diskGb), pct: pctOf(usedGb, diskGb) },
    pids: { current: pids, max: 8192 }, io: { read_bytes: gib(usedGb / 8), write_bytes: gib(usedGb / 20) },
  });
  if (id === FRA7) return slice(8, 1.2, 32, 9.6, 500, 140, 412);
  if (id === ASH3) return slice(4, 0.3, 8, 2.1, 160, 18, 96);
  return undefined;
}

// The sample person's own API calls, newest first (pages/logs Account activity; ActivityLogList). The support POSTs
// are tickets 1 and 2; the snapshot POST is the 95-minute change.
type DemoApiCall = readonly [minutesAgo: number, method: string, path: string, status: number, client: 'cli' | 'web'];
export const DEMO_ACTIVITY: readonly DemoApiCall[] = [
  [2, 'GET', '/api/v1/computers', 200, 'cli'], [6, 'GET', '/api/v1/proxy/aliases', 200, 'cli'], [11, 'GET', '/api/v1/users/auth/me', 200, 'cli'],
  [24, 'GET', '/api/v1/support/tickets', 200, 'web'], [38, 'GET', `/api/v1/computers/${ATLAS}/snapshots`, 200, 'web'], [47, 'POST', '/api/v1/proxy/aliases', 409, 'web'],
  [96, 'POST', `/api/v1/computers/${ATLAS}/snapshots`, 201, 'web'], [180, 'GET', '/api/v1/projects', 200, 'web'],
  [300, 'POST', '/api/v1/support/tickets', 201, 'web'], [60 * 26, 'POST', '/api/v1/support/tickets', 201, 'web'],
];
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const activity = (now: number) => DEMO_ACTIVITY.map(([min, method, path, status, client], i) => ({
  id: `8f00000000000000000000${(i + 1).toString(16).padStart(2, '0')}`, user_id: ACCOUNT, realm_id: null, method, path, status_code: status,
  ip_address: '203.0.113.24', user_agent: client === 'cli' ? 'hoody-cli' : FIREFOX, created_at: iso(now - min * MIN),
}));

// The sample account's notices (core/notifications.ts, pages/notifications), newest first: what happened to its own
// computers and servers (the recorded computer list's states and the sample changes above). Every one is read: opening
// an unread notice marks it read, a change the demo never sends, and the inbox would say it could not.
type DemoNotice = readonly [minutesAgo: number, title: string, message: string, severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR', type: 'MAINTENANCE' | 'STATUS_UPDATE'];
export const DEMO_NOTICES: readonly DemoNotice[] = [
  [95, 'Snapshot of atlas is ready', 'The snapshot before-upgrade of atlas is ready. You can restore it from the computer\'s Snapshots tab.', 'SUCCESS', 'STATUS_UPDATE'],
  [5 * 60, 'Computer ember did not start', 'ember on fra-7 did not start. Open its logs to see why, then start it again from Computers.', 'ERROR', 'STATUS_UPDATE'],
  [7 * 60, 'Computer atlas is running', 'atlas started again on n12.', 'SUCCESS', 'STATUS_UPDATE'],
  [7 * 60 + 2, 'Computer atlas stopped', 'atlas was stopped from the Hub.', 'INFO', 'STATUS_UPDATE'],
  [20 * 60, 'Maintenance on fra-7 finished', 'fra-7 restarted for maintenance. Its computers were back within ten minutes.', 'INFO', 'MAINTENANCE'],
  [2 * 24 * 60, 'Computer harbor is running', 'harbor finished being created and is running on ash-3.', 'SUCCESS', 'STATUS_UPDATE'],
  [3 * 24 * 60, 'SSH key added to atlas', 'A new SSH key can now sign in to atlas.', 'INFO', 'STATUS_UPDATE'],
  [6 * 24 * 60, 'Computer fjord paused', 'fjord was paused. Resume it from Computers when you need it again.', 'INFO', 'STATUS_UPDATE'],
];
const noticeId = (i: number): string => `4e0d${(i + 1).toString(16).padStart(20, '0')}`;
const notices = (now: number) => DEMO_NOTICES.map(([min, title, message, severity, type], i) => ({
  id: noticeId(i), title, message, severity, type, is_public: false, is_global: false, expires_at: null,
  created_at: iso(now - min * MIN), updated_at: iso(now - Math.max(0, min - 10) * MIN), is_read: true, read_at: iso(now - Math.max(0, min - 10) * MIN),
}));
const noticeSummary = (now: number) => ({ unread_count: 0, is_capped: false, unread_cap: 99, latest_id: noticeId(0), latest_created_at: iso(now - DEMO_NOTICES[0]![0] * MIN), poll_interval_seconds: 300 });

// A code typed for a new referral link (GET /referrals/me/codes/check; pages/referrals/logic.ts checkWords), checked as
// the API checks it: its spelling (4 to 20 lowercase letters or digits, single hyphens between), a few of the words it
// keeps back, and the codes that exist (the sample account's own: the recorded /referrals/me lists them).
export const DEMO_REFERRAL_CODES: readonly string[] = ['k7m2q9xa', 'maya-builds'];
// Each word kept back is matched as the API matches that word, against the code's comparison forms: as written, without
// its trailing digits, with its digits read as letters (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, 8 b), and both; for the whole
// code, its hyphens removed. Two kinds:
//   - refused anywhere in the code: 'staffordshire', 'ho-ody-fan' and 's7aff-fan' are kept back;
//   - refused only as the whole code or one hyphen-separated part: 'team-7', 'te-am' and 'h3lp' are kept back,
//     'teamwork' and 'helpful' are not.
// The API keeps back many more words; the demo checks these only.
const KEPT_BACK_ANYWHERE = ['hoody', 'admin', 'support', 'referral', 'staff'];
const KEPT_BACK_WORDS = ['team', 'help'];
const DIGIT_LETTERS: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
/** The comparison forms of a code, or of one of its parts (letters and digits only). */
const formsOf = (s: string): string[] => {
  const strip = (x: string): string => x.replace(/[0-9]+$/, '');
  const fold = (x: string): string => x.replace(/[0-9]/g, (d) => DIGIT_LETTERS[d] ?? d);
  return [s, strip(s), fold(s), strip(fold(s)), fold(strip(s)), strip(fold(strip(s)))].filter((f) => f !== '');
};
const keptBack = (code: string): boolean => {
  const whole = formsOf(code.replace(/-/g, ''));
  return whole.some((f) => KEPT_BACK_ANYWHERE.some((w) => f.includes(w))) || [...whole, ...code.split('-').flatMap(formsOf)].some((f) => KEPT_BACK_WORDS.includes(f));
};
function codeCheck(_now: number, p: string) {
  const code = (new URLSearchParams(p.replace(/#.*$/s, '').split('?')[1] ?? '').get('code') ?? '').trim().toLowerCase();
  if (code.length < 4 || code.length > 20 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) return { code: null, valid: false, available: false, reason: 'REFERRAL_CODE_INVALID' };
  if (keptBack(code)) return { code, valid: false, available: false, reason: 'REFERRAL_CODE_RESERVED' };
  const taken = DEMO_REFERRAL_CODES.includes(code);
  return { code, valid: true, available: !taken, reason: taken ? 'REFERRAL_CODE_TAKEN' : null };
}

/** The value behind each recorded vault entry (pages/vault/data.ts takeValue; the entry itself is the recorded list's
 *  row: demo-client.ts). db-password is the interop vector of pages/vault/crypto.vectors.ts (test password
 *  vector-pw-1 opens it to "hub-vault-vector-ascii"). */
export const DEMO_VAULT_VALUES: Readonly<Record<string, string>> = {
  'github-token': 'demo-sample-value-not-a-real-key',
  'deploy.notes': 'Deploy from main after review, never Friday.',
  'db-password': '{"_enc":1,"alg":"AES-GCM-256","kdf":"PBKDF2","hash":"SHA-512","iter":600000,"salt":"MaETHXNJifSFMrhX/xguFRP7+jIIPRmBudS+B20my0I=","iv":"VN7p5GGkMMSovKOU","ct":"ypq2fSKUlfJr9FngxnsU1Pa6kOf0CT3+rRlP7O1YgoeOW/iGt6Q=","impl":"webcrypto","rng":"webcrypto"}',
};

export const DEMO_ANSWERS: readonly DemoAnswer[] = Object.freeze([
  A('/wallet/balances', () => ({ general_balance: '42.50', referral_credit: '12.40', referral_credit_owed: '0.00', ai_limit: '10.00', ai_usage: '3.18', ai_remaining: '6.82', ai_reserved: '0.00', ai_usage_status: 'live' })),
  A('/wallet/payment-availability', () => ({ card: { enabled: true, min_usd: 5, max_usd: 2000 }, crypto: { enabled: true, min_usd: 10, max_usd: 5000 }, ai_credit_fee_bps: 0 })),
  A('/wallet/github-bonus', () => ({ enabled: false, repo: '', amount_usd: '0.00', github_linked: false, github_username: null, claimed: false, identity_claimed_elsewhere: false, claim: null, hold: null })),
  A('/subserver-plans', catalogue),
  A('/meta/subserver-plans', catalogue),
  A('/subserver-subscriptions', subscriptions, { total: 2, limit: 50, offset: 0 }),
  A('/servers/available', available),
  A('/offers', () => []),
  A('/rentals', () => []),
  A('/reservations', () => [], { total: 0, limit: 200, offset: 0 }),
  A('/users/me/free-tier-status', () => ({ gate_enabled: false, unlocked: true, has_free_server: true, can_claim: false, claim_blocked_reason: 'already_claimed', signup_code_failed: false, hold: null })),
  A('/users/me/free-ai-usage', (now) => ({ servers: [{ server: { id: ASH3, name: 'ash-3' }, status: 'ok', as_of: iso(now - 2 * MIN), lanes: { chat: lane(34, now), decisions: lane(12, now), search: lane(8, now), speech: lane(0, now), transcription: lane(0, now) } }], truncated: false })),
  // The account itself: the recorded answer holds only id, user name, email and the ban flag, so the Account page
  // (pages/account/data.ts profileOf) showed the address unverified, no display name and no joining date. Same
  // identity as recorded; joined before anything else in the sample world, last changed when 2FA was turned on.
  A('/users/auth/me', (now) => ({
    id: ACCOUNT, username: 'ada', email: 'ada@example.com', alias: 'Ada', is_banned: false, email_verified: true, signup_method: 'email', avatar_url: null,
    created_at: iso(now - 120 * DAY), updated_at: iso(now - 40 * DAY), pending_email: null, pending_email_expires_at: null, email_change_undo_until: null,
    pending_pool_invitations: 0, support_reply_email: true, support_reply_email_stored: false,
  })),
  A('/users/auth/2fa/status', (now) => ({ enabled: true, verified: true, enabled_at: iso(now - 40 * DAY), backup_codes_remaining: 8, require_for_tokens: false })),
  A('/users/auth/sessions', (now) => ({ sessions: [
    session(now, '8a0000000000000000000001', { current: true, method: 'device', client: 'cli', name: 'Hoody CLI', agent: 'hoody-cli', country: 'SG', ip: '203.0.113.24', madeDays: 0, seenMin: 1 }),
    session(now, '8a0000000000000000000002', { method: 'two_factor', client: 'web', name: 'Firefox on Linux', agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', country: 'SG', ip: '203.0.113.24', madeDays: 2, seenMin: 190 }),
  ], next_cursor: null })),
  A('/users/me/security-history', history, { metadata: { total: 4, page: 1, limit: 100, pages: 1 } }),
  A('/ip', (now) => ({ ip: '203.0.113.24', user_agent: 'hoody-cli', headers: {}, referer: '', timestamp: iso(now), is_logged: false, protocol: 'https', ip_info: null })),
  A('/bot-urls', () => ({ bot_urls: [], next_cursor: null })),
  A('/bot-urls/suggest-label', () => ({ label: DEMO_BOT_LABEL, url: `https://${DEMO_BOT_LABEL}.bots.demo.invalid` })),
  A('/events', events, undefined),
  A('/support/tickets', ticketList),
  R('/support/tickets/:id', `/support/tickets/${ticketId(1)}`, ticketThread),
  A('/abuse-notices', () => [], { pagination: { page: 1, limit: 100, total: 0, has_more: false } }),
  R('/projects/:id/permissions', `/projects/${P_HOME}/permissions`, projectPeople),
  R('/projects/:id/proxy/permissions', `/projects/${P_HOME}/proxy/permissions`, projectRules),
  R('/servers/:id/available-commands', `/servers/${N12}/available-commands`, serverCommands),
  R('/rentals/:id/runtime', `/rentals/${N12}/runtime`, serverRuntime),
  R('/computers/:id/proxy/permissions', `/computers/${ATLAS}/proxy/permissions`, computerRules),
  A('/users/auth/activity', activity),
  A('/notifications', notices),
  A('/notifications/summary', noticeSummary),
  A('/referrals/me/codes/check', codeCheck),
]);

// The reads every sample computer's agent answers alike (the Bot drawers and the model pickers ask them): what it
// is, who it is signed in as, the models it offers and its agents. Each shape is the one its reader takes
// (kit-io.ts versionRoute and pages/bots voiceCapsOf, core/agent-signin.ts agentLoginOf, core/providers/catalogue.ts,
// pages/bots helperAgentsOf).
export const DEMO_MODELS: ReadonlyArray<{ spec: string; display_name: string }> = [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
  { spec: 'hoody-ai/hoody-fast', display_name: 'Hoody Fast' },
];
export const DEMO_AGENT_CAPS: readonly string[] = ['computer_binding', 'gate_envelope', 'session_state', 'turn_idempotency'];
function agentAnswer(path: string): unknown {
  switch (path) {
    // The four capabilities Ask needs (ask/logic.ts REQUIRED_CAPS, capsOk), nothing more: no voice capability (speaking
    // to a sample Bot would be a change, and the demo sends none), no approval_policy (the Hub would take an approver
    // lease when a gate is parked), no acp_default (one more read).
    case '/version': return { version: '1.0.0', api_version: '1', supported: ['1'], available: ['1'], pinned_realm: null, session_protocol_version: 3,
      capabilities: DEMO_AGENT_CAPS.map((name) => ({ name, supported: true, available: true })) };
    case '/health': return { status: 'ok', service: 'hoody-agent' };
    // Ask's realm probe reads only the status (ask/logic.ts realmAuth).
    case '/computers': return { items: [], meta: { total: 0, page: 1, limit: 1 } };
    // New chat (pages/ai/new): no Claude Code agent; the sample agent's tools (pages/ai/agents/tools.ts).
    case '/acp/agents': return { report: { agents: [] } };
    case '/tools': return { items: [{ name: 'bash', description: 'Run a shell command.', read_only: false }, { name: 'read_file', description: 'Read a file.', read_only: true }, { name: 'edit_file', description: 'Change part of a file.', read_only: false }], meta: { total: 3 } };
    case '/hoody/auth/status': return { auth_active: true, account_id: ACCOUNT, owner_fingerprint: 'demo-owner', restriction: 'none', identity_unavailable: false, last_error: null };
    case '/providers': return { providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included' } }] };
    case '/models': return { models: DEMO_MODELS };
    case '/agents': return { items: [{ name: 'bot', model: '' }, { name: 'general', model: 'hoody-ai/hoody-free', is_configured_default: true }, { name: 'researcher', model: 'hoody-ai/hoody-fast' }] };
    default: return undefined;
  }
}

/** The hand-written answer of a GET, or null. */
export function demoAnswer(method: string, p: string, now: number): { statusCode: 200; message: string; data: unknown } | null {
  if (method !== 'GET') return null;
  const bare = p.replace(/[?#].*$/s, '');
  // A read that selects another computer or realm than the recorded one: the sample world holds none of these there.
  const q = new URLSearchParams(p.replace(/#.*$/s, '').split('?')[1] ?? '');
  const other = (key: string, recordedId: string): boolean => { const v = q.get(key); return v !== null && v !== recordedId; };
  if (bare === '/proxy/aliases' && other('computer_id', ATLAS)) return { statusCode: 200, message: 'OK', data: { aliases: [] } };
  if (bare === '/vault/keys' && other('realm_id', PERSONAL)) return { statusCode: 200, message: 'OK', data: [] };
  // The account-wide partition (All realms, Global): it holds the realm names only (recorded: /vault/keys/hoody.realm-aliases).
  if (bare === '/vault/keys' && !q.has('realm_id')) return { statusCode: 200, message: 'OK', data: [{ key: 'hoody.realm-aliases', realm_id: '', metadata: null, size_bytes: 113, created_at: iso(now - 40 * DAY), updated_at: iso(now - 12 * MIN) }] };
  if (bare === '/vault/stats' && !q.has('realm_id')) return { statusCode: 200, message: 'OK', data: { total_keys: 1, total_size_bytes: 113, total_size_mb: 113 / 1_048_576, limit_mb: 50, used_percentage: 0, remaining_mb: 50 } };
  if (bare === '/vault/stats' && other('realm_id', PERSONAL)) return { statusCode: 200, message: 'OK', data: { total_keys: 0, total_size_bytes: 0, total_size_mb: 0, limit_mb: 50, used_percentage: 0, remaining_mb: 50 } };
  const a = DEMO_ANSWERS.find((x) => x.match.test(bare));
  if (!a) return null;
  if (a.path === '/events') {
    // The sample changes are atlas's: another computer has none, and a time window holds only what happened in it.
    const from = Date.parse(q.get('start_date') ?? ''), to = Date.parse(q.get('end_date') ?? '');
    const all = other('computer_id', ATLAS) ? [] : (a.data(now, p) as Array<{ created_at: string }>);
    const rows = all.filter((e) => { const t = Date.parse(e.created_at); return !(t < from) && !(t > to); });
    return { statusCode: 200, message: 'OK', data: { events: rows, pagination: { total: rows.length, limit: 200, offset: 0, has_more: false, next_cursor: null, latest_cursor: null } } };
  }
  if (a.path === '/users/auth/activity') {
    // A time window, a status floor and a method select as the API does; one page holds them all.
    const from = Date.parse(q.get('start_date') ?? ''), to = Date.parse(q.get('end_date') ?? '');
    const floor = Number(q.get('min_status')) || 0, method = (q.get('method') ?? '').toUpperCase(), limit = Number(q.get('limit')) || 50;
    const rows = activity(now).filter((r) => { const t = Date.parse(r.created_at); return !(t < from) && !(t > to) && r.status_code >= floor && (!method || r.method === method); });
    const meta = { metadata: { total: rows.length, page: 1, limit, pages: 1 } };
    return { statusCode: 200, message: 'OK', ...meta, data: (Number(q.get('page')) || 1) > 1 ? [] : rows.slice(0, limit) };
  }
  if (a.path === '/notifications') {
    // Unread, read (the archive) or both, a page at a time, as the API pages them.
    const limit = Number(q.get('limit')) || 20, page = Number(q.get('page')) || 1;
    const rows = notices(now).filter((n) => (q.get('unread_only') === 'true' ? !n.is_read : q.get('read_only') === 'true' ? n.is_read : true));
    const pages = { pagination: { total: rows.length, page, limit, totalPages: Math.ceil(rows.length / limit), next_cursor: null } };
    return { statusCode: 200, message: 'OK', ...pages, data: rows.slice((page - 1) * limit, page * limit) };
  }
  const data = a.data(now, p);
  if (data === undefined) return null;
  return { statusCode: 200, message: 'OK', ...(a.extra ?? {}), data };
}

// ---- answers of a computer's own programs (the kit and agent leg) ----
// A program's address under the demo mount: <project>-<computer>-<program>-<n>.<server>.demo.invalid.
const KIT_HOST = /^([0-9a-f]{24})-([0-9a-f]{24})-([a-z]+)-(\d+)\.[a-z0-9-]+\.demo\.invalid$/;
const ACME = 'f2f2f2f2f2f2f2f2f2f2f2f2';
const BOREALIS = 'c0a7150000000000000000b2', GRANITE = 'c0a715000000000000000107', HARBOR = 'c0a715000000000000000118';
const CEDAR = 'c0a7150000000000000000c3', DUNE = 'c0a7150000000000000000d4', EMBER = 'c0a7150000000000000000e5', FJORD = 'c0a7150000000000000000f6';
/** The sample computers this file names, by id (the recorded computer list holds each: demo-world.term.test.ts). */
export const DEMO_COMPUTERS: Readonly<Record<string, string>> = {
  [ATLAS]: 'atlas', [BOREALIS]: 'borealis', [CEDAR]: 'cedar', [DUNE]: 'dune', [EMBER]: 'ember', [FJORD]: 'fjord', [GRANITE]: 'granite', [HARBOR]: 'harbor',
};

// Each computer's own access rules (GET /computers/:id/proxy/permissions; pages/computers/parts/access.logic.ts
// rulesFrom, modeOf), stored as the drawer's choices store them, and in its project (the recorded list's project_id).
// atlas lets in two address ranges (its visitors in Logs and the sample person's own address), granite its shop's
// range, dune only the sample person's address; borealis, ember and harbor add to their project's rules (ember with
// its web addresses switched off). cedar and fjord keep none: the API answers the empty document, version 0.
interface DemoAccess { project: string; version: number; deny?: true; ranges?: readonly string[]; mine?: string; proxyOff?: true }
const DEMO_ACCESS: Readonly<Record<string, DemoAccess>> = {
  [ATLAS]: { project: P_HOME, version: 3, deny: true, ranges: ['198.51.100.0/24', '203.0.113.0/24'] },
  [BOREALIS]: { project: P_ACME, version: 2, ranges: ['192.0.2.0/24'] },
  [CEDAR]: { project: P_HOME, version: 0 },
  [DUNE]: { project: P_LAB, version: 1, deny: true, mine: '203.0.113.24' },
  [EMBER]: { project: P_ACME, version: 1, proxyOff: true },
  [FJORD]: { project: P_HOME, version: 0 },
  [GRANITE]: { project: P_ACME, version: 2, deny: true, ranges: ['203.0.113.0/24'] },
  [HARBOR]: { project: P_LAB, version: 1, deny: true, ranges: ['198.51.100.0/24'] },
};
/** Whether a computer keeps a document of its own (the item reads' proxy_permissions_computer_state), or undefined. */
export const demoOwnRules = (computer: string): 'applied' | 'missing' | undefined => {
  const a = DEMO_ACCESS[computer];
  return a === undefined ? undefined : a.version > 0 ? 'applied' : 'missing';
};
function computerRules(_now: number, p: string) {
  const id = segOf(p, 2);
  const a = DEMO_ACCESS[id];
  if (!a) return undefined;
  const groups: Record<string, unknown> = {}, permissions: Record<string, unknown> = {};
  const allow = (name: string, range: string) => { groups[name] = { type: 'ip', range }; permissions[name] = { '*': true, logs: true }; };
  if (a.mine) allow('hub-my-ip', `${a.mine}/32`);
  for (const r of a.ranges ?? []) allow(`hub-ip-${r.replace(/[./]/g, '-')}`, r);
  return {
    project: a.project, computer: id, groups, permissions, default: a.deny ? 'deny' : 'inherit', ...(a.proxyOff ? { enable_proxy: false } : {}),
    hooks: {}, schema_version: 2, file_version: a.version, etag: `file:v${a.version}`,
  };
}

interface DemoBot { computer: string; id: string; uid: string; realm: string; role: string; session: string; running: boolean; atLimit: boolean; lastMin: number; madeDays: number; instructions: string }
/** The sample account's Bots, each on its own computer and in that computer's realm. */
export const DEMO_BOTS: readonly DemoBot[] = [
  { computer: ATLAS, id: 'support-desk', uid: '0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d01', realm: PERSONAL, role: 'Answers support mail', session: 's-support-desk', running: true, atLimit: false, lastMin: 4, madeDays: 34, instructions: 'Answer support mail politely and briefly. Tag anything about refunds for me.' },
  { computer: ATLAS, id: 'release-notes', uid: '0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d02', realm: PERSONAL, role: 'Drafts release notes', session: 's-release-notes', running: false, atLimit: false, lastMin: 60 * 26, madeDays: 21, instructions: 'Each week, draft release notes from the merged changes and save them in notes/.' },
  { computer: BOREALIS, id: 'inbox-triage', uid: '0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d03', realm: ACME, role: 'Sorts the shared inbox', session: 's-inbox-triage', running: true, atLimit: false, lastMin: 12, madeDays: 12, instructions: 'Sort the shared inbox into sales, support and other, and flag anything urgent.' },
  { computer: GRANITE, id: 'order-watch', uid: '0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d04', realm: ACME, role: 'Watches new orders', session: 's-order-watch', running: false, atLimit: true, lastMin: 60 * 24 * 3, madeDays: 9, instructions: 'Watch new orders and tell me when one is paid but not shipped within a day.' },
];
const botView = (b: DemoBot, now: number) => ({
  id: b.id, uid: b.uid, name: b.id, role: b.role, realm: b.realm, model: 'hoody-ai/hoody-free', session_id: b.session,
  turn_running: b.running, queued: 0, last_activity: iso(now - b.lastMin * MIN), autonomy: { used: b.atLimit ? 20 : 3, max: 20 }, channels: [],
});
/** One Bot as GET /bots/{id} answers it (pages/bots/data.ts viewOf): the list's view and the Bot's own settings. */
const botDetail = (b: DemoBot, now: number) => ({
  ...botView(b, now), instructions: b.instructions, yolo: false, guardrails: '', guardrail_check: 'strict', revision: 1,
  routing: { mode: 'off' }, async: false, wait_seconds: 0, open_delegates: 0, created: iso(now - b.madeDays * DAY),
});
// Each Bot's log, oldest first (pages/bots/data.ts logOf): what the person asked and what the Bot said. The newest
// row is the Bot's last activity in the list.
type DemoLogRow = readonly [role: 'user' | 'bot', minutesAgo: number, text: string];
export const DEMO_BOT_LOGS: Readonly<Record<string, readonly DemoLogRow[]>> = {
  'support-desk': [
    ['user', 60 * 3, 'Answer the new support mail and tag anything about refunds for me.'],
    ['bot', 60 * 3 - 4, 'Done: 6 messages answered. 2 are tagged "refund" for you to look at.'],
    ['user', 30, 'Thanks. Keep the replies short, three sentences at most.'],
    ['bot', 4, 'Understood. Every reply stays at three sentences or fewer.'],
  ],
  'release-notes': [
    ['user', 60 * 26 + 6, 'Draft the release notes for this week.'],
    ['bot', 60 * 26, 'The draft is in notes/release-1.4.md: 3 new features and 2 fixes, each with one line.'],
  ],
  'inbox-triage': [
    ['user', 60 * 2, 'Sort what came in this morning.'],
    ['bot', 60 * 2 - 3, '14 messages sorted: 5 sales, 7 support, 2 other. One support message is marked urgent.'],
    ['bot', 12, '3 new messages sorted into support.'],
  ],
  'order-watch': [
    ['bot', 60 * 24 * 3 + 40, 'Order 1042 is paid and was shipped the same day.'],
    ['bot', 60 * 24 * 3, 'Order 1043 is paid but not shipped after a day. I have reached my limit of actions and wait for you.'],
  ],
};
const botLog = (b: DemoBot, now: number) => ({
  items: (DEMO_BOT_LOGS[b.id] ?? []).map(([role, min, text], i) => ({ seq: i + 1, role, text, at: iso(now - min * MIN) })),
  has_more: false,
});
const CHANNEL_SETTINGS = {
  settings: {},
  effective: { lang: { value: 'en', source: 'default' }, max_channels: { value: 4, source: 'default' }, rate_bot_per_day: { value: 200, source: 'default' }, channels_paused: { value: false, source: 'default' } },
};
/** A read of one Bot's own routes (GET /bots/{id} and below), or undefined. */
function botRead(computer: string, rest: string, realm: string | null, now: number): unknown {
  const m = /^\/bots\/([a-z0-9-]+)(\/[a-z-]+)?$/.exec(rest);
  const b = m ? DEMO_BOTS.find((x) => x.computer === computer && x.id === m[1] && (realm === null || realm === 'all' || realm === x.realm)) : undefined;
  if (!m || !b) return undefined;
  switch (m[2]) {
    case undefined: return botDetail(b, now);
    case '/log': return botLog(b, now);
    case '/archive': return { items: [], has_more: false };
    case '/delegates': return { items: [], meta: { total: 0 } };
    case '/channels': return { items: [] };
    case '/channel-settings': return CHANNEL_SETTINGS;
    default: return undefined;
  }
}

// Notes (the Notes program's capabilities, the person's notebook and its recent notes; pages/notes/logic.ts reads them).
type DemoNote = readonly [title: string, section: string, minutesAgo: number, hasBody?: boolean];
/** Each sample computer's recent notes; a computer not named here has an empty notebook. */
export const DEMO_NOTES: Readonly<Record<string, readonly DemoNote[]>> = {
  [ATLAS]: [['Weekly plan', 'Work', 12], ['Deploy checklist', 'Work', 95], ['Reading list', 'Personal', 60 * 7], ['Meeting notes: storefront review', 'Work', 60 * 26], ['Trip ideas', 'Personal', 60 * 24 * 4, false], ['Backup schedule', 'Projects', 60 * 24 * 9]],
  [BOREALIS]: [['Staging release notes', 'Work', 40], ['Customer feedback', 'Work', 60 * 5], ['Launch timeline', 'Projects', 60 * 24 * 3]],
  [GRANITE]: [['Order export format', 'Work', 60 * 3], ['Weekly report outline', 'Work', 60 * 24 * 2]],
};
const noteId = (n: number): string => `0a1b2c3d4e5f6a7b8c9d${n.toString(16).padStart(4, '0')}`;
const notebookOf = (computer: string): string => `0b${computer.slice(2)}`;
function notesAnswer(computer: string, path: string, now: number): unknown {
  const nb = notebookOf(computer);
  if (path === '/capabilities') return { service: 'hoody-notes', version: '1', features: ['recent'] };
  if (path === '/me') return { userId: ACCOUNT, notebookId: nb, role: 'owner' };
  if (path !== `/notebooks/${nb}/recent`) return undefined;
  const at = Object.keys(DEMO_NOTES).indexOf(computer) + 1;
  return {
    notebookId: nb, partial: false, create: { parentId: noteId(at * 256), sectionName: 'Work' },
    items: (DEMO_NOTES[computer] ?? []).map(([name, sectionName, min, hasBody], i) => ({ nodeId: noteId(at * 256 + i + 1), name, sectionName, changedAt: iso(now - min * MIN), hasBody: hasBody !== false })),
  };
}

// Schedules (the cron program's entries; pages/schedules/live.ts reads them). The other sources of that page (script
// schedules, web request schedules, agent loops) answer empty lists: the sample account has none.
interface DemoSchedule { computer: string; id: string; name: string; cron: string; human: string; command: string; enabled: boolean; lastMin: number; exit: number; everyMin: number }
export const DEMO_SCHEDULES: readonly DemoSchedule[] = [
  { computer: ATLAS, id: '5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f01', name: 'Nightly backup', cron: '0 2 * * *', human: 'Every day at 02:00', command: 'restic backup ~/projects', enabled: true, lastMin: 60 * 7, exit: 0, everyMin: 60 * 24 },
  { computer: GRANITE, id: '5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f02', name: 'Weekly sales report', cron: '0 8 * * 1', human: 'Every Monday at 08:00', command: 'python3 reports/weekly.py', enabled: true, lastMin: 60 * 24 * 3, exit: 1, everyMin: 60 * 24 * 7 },
  { computer: BOREALIS, id: '5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f03', name: 'Renew certificates', cron: '30 4 1 * *', human: 'On day 1 of every month at 04:30', command: 'certbot renew', enabled: false, lastMin: 60 * 24 * 22, exit: 0, everyMin: 60 * 24 * 30 },
];
const CRON_FEATURES = ['entries_all', 'next_runs', 'history_persisted'];
/** Minutes before the read each schedule's entry was made: a month before its last run. */
const madeMin = (x: DemoSchedule): number => x.lastMin + 30 * 24 * 60;
function cronAnswer(computer: string, path: string, q: URLSearchParams, now: number): unknown {
  if (path === '/health') return { status: 'ok' };
  if (path === '/info') return { service: 'hoody-cron', features: CRON_FEATURES, utc_offset_seconds: 0 };
  const mine = DEMO_SCHEDULES.filter((x) => x.computer === computer);
  // Run k of a schedule: k = 0 its last run (with the schedule's exit code), each earlier one a period before and fine.
  const run = (x: DemoSchedule, k = 0) => {
    const at = now - (x.lastMin + k * x.everyMin) * MIN;
    return { run_id: k === 0 ? `r-${x.id.slice(-4)}` : `r-${x.id.slice(-4)}-${k}`, entry_id: x.id, user: 'user', status: 'finished', started_at: iso(at), finished_at: iso(at + 42_000), exit_code: k === 0 ? x.exit : 0 };
  };
  // Every run since the entry was made (20 at most per schedule), newest first; entry_id keeps one schedule's.
  if (path === '/runs') {
    const runs = mine.filter((x) => q.get('entry_id') === null || q.get('entry_id') === x.id)
      .flatMap((x) => Array.from({ length: 20 }, (_, k) => k).filter((k) => x.lastMin + k * x.everyMin < madeMin(x)).map((k) => run(x, k)))
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    return { runs: runs.slice(0, Math.min(Math.max(Math.floor(Number(q.get('limit') ?? 100)) || 100, 1), 500)) };
  }
  // One entry (as hoody-cron answers it): what "Show the command" reads (pages/schedules/data.ts useReveal).
  const one = /^\/users\/user\/entries\/([0-9a-f-]{36})$/.exec(path);
  if (one) {
    const x = mine.find((s) => s.id === one[1]);
    if (!x) return undefined;
    const made = iso(now - madeMin(x) * MIN);
    return {
      id: x.id, user: 'user', revision: x.id.replace(/-/g, '').padEnd(64, '0'), name: x.name, comment: null,
      schedule: x.cron, schedule_human: x.human, command: x.command, enabled: x.enabled, expired: false, expires_at: null,
      created_at: made, updated_at: made, revision_seen_at: made, run_reports: true, tz_override: false,
      next_runs: x.enabled ? [iso(now - x.lastMin * MIN + x.everyMin * MIN)] : null, last_run: run(x),
    };
  }
  if (path !== '/entries') return undefined;
  return {
    total: mine.length, job_lines: 0, unreadable_users: [],
    entries: mine.map((x) => ({
      type: 'managed', user: 'user', id: x.id, name: x.name, command: x.command, schedule: x.cron, schedule_human: x.human, enabled: x.enabled,
      next_runs: x.enabled ? [iso(now - x.lastMin * MIN + x.everyMin * MIN)] : [], last_run: run(x),
    })),
  };
}

// Scripts (the exec program's folder 1; pages/scripts/data.ts reads it): what each script is, and its calls.
interface DemoScript { computer: string; file: string; label: string; about: string }
export const DEMO_SCRIPTS: readonly DemoScript[] = [
  { computer: ATLAS, file: 'deploy-site.ts', label: 'Deploy site', about: 'Builds the site and puts it online.' },
  { computer: ATLAS, file: 'rotate-logs.ts', label: 'Rotate logs', about: 'Archives old logs.' },
  { computer: GRANITE, file: 'stock-check.ts', label: 'Stock check', about: 'Counts what is left in the shop.' },
];
// Each script's finished calls, newest first (hoody-exec's record of calls): minutes before the read, method, response
// status, duration and a failed call's error line. Every reader counts these: the list (scripts-summary), the Overview
// tab (script-usage, by clock hour), the Logs page's Scripts source (logs/executions) and its visits to the exec program.
// All fall inside the last 23 hours, so "the last 24 hours" of each reader holds all of them. A call that throws is a 500.
type DemoRun = readonly [minutesAgo: number, method: string, status: number, ms: number, error?: string];
export const DEMO_RUNS: Readonly<Record<string, readonly DemoRun[]>> = {
  'deploy-site.ts': [[48, 'POST', 200, 11_840], [135, 'POST', 200, 12_310], [330, 'POST', 200, 10_920], [545, 'POST', 200, 13_400], [1120, 'POST', 200, 11_250], [1330, 'POST', 200, 12_060]],
  'rotate-logs.ts': [[390, 'POST', 200, 340]],
  // About once an hour; the shop's own API was down for two of them.
  'stock-check.ts': Array.from({ length: 24 }, (_, i): DemoRun => (i === 9 || i === 10 ? [10 + i * 57, 'GET', 500, 180 + i, 'Error: shop answered 503'] : [10 + i * 57, 'GET', 200, 380 + ((i * 37) % 90)])),
};
const HOUR = 60 * MIN;
/** hoody-exec's outcome of a call: failed from 500, turned away on 401 and 403, else ok. */
const runOutcome = (status: number): 'ok' | 'failed' | 'turned_away' => (status >= 500 ? 'failed' : status === 401 || status === 403 ? 'turned_away' : 'ok');
/** The address a folder 1 script answers (pages/scripts/logic.ts routeOf). */
const routeOfScript = (x: DemoScript): string => `/${x.file.replace(/\.ts$/, '')}`;
/** A script's calls as logs/executions lists them, newest first; ids count up from the oldest. */
const runsOf = (x: DemoScript, now: number) => (DEMO_RUNS[x.file] ?? []).map(([min, method, status, ms, error], i, all) => ({
  executionId: `exec-${x.file.replace(/\.ts$/, '')}-${all.length - i}`, receivedAt: iso(now - min * MIN), method, path: routeOfScript(x), status, durationMs: ms,
  outcome: runOutcome(status), ...(error ? { error } : {}),
}));
/** Nearest-rank percentile of sorted numbers, null for none. */
const rank = (sorted: readonly number[], p: number): number | null => (sorted.length === 0 ? null : sorted[Math.ceil((p / 100) * sorted.length) - 1]!);
const figures = (rs: readonly DemoRun[]) => {
  const ms = rs.map((r) => r[3]).sort((a, b) => a - b);
  return { calls: rs.length, failed: rs.filter((r) => runOutcome(r[2]) === 'failed').length, p50Ms: rank(ms, 50), p95Ms: rank(ms, 95) };
};
/** monitor/script-usage: the last 24 clock hours, oldest first, the last one the current hour. */
function usageOf(x: DemoScript, path: string, now: number): unknown {
  const first = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const runs = (DEMO_RUNS[x.file] ?? []).filter((r) => now - r[0] * MIN >= first);
  const hours = Array.from({ length: 24 }, (_, i) => {
    const start = first + i * HOUR;
    return { start: iso(start), ...figures(runs.filter((r) => now - r[0] * MIN >= start && now - r[0] * MIN < start + HOUR)) };
  });
  return { scriptPath: path, hours, totals: figures(runs), coverage: { complete: true, sampled: runs.length } };
}
/** logs/executions: newest first, `failed` keeps failed calls only, since/until bound receivedAt, `next` is the last
 *  listed id while more remain (sent back as `before`). */
function executionsOf(x: DemoScript, path: string, q: URLSearchParams, now: number): unknown {
  const since = Date.parse(q.get('since') ?? ''), until = Date.parse(q.get('until') ?? '');
  const all = runsOf(x, now);
  let rows = all.filter((r) => (q.get('status') !== 'failed' || r.outcome === 'failed') && !(Date.parse(r.receivedAt) < since) && !(Date.parse(r.receivedAt) > until));
  const before = q.get('before');
  if (before) { const i = rows.findIndex((r) => r.executionId === before); rows = i < 0 ? [] : rows.slice(i + 1); }
  const limit = Math.min(Math.max(Math.floor(Number(q.get('limit') ?? 50)) || 50, 1), 500);
  const page = rows.slice(0, limit);
  return { scriptPath: path, resolvedPath: `default/1/${x.file}`, executions: page, next: rows.length > limit ? page[page.length - 1]!.executionId : null, coverage: { since: all[all.length - 1]?.receivedAt ?? null, logging: 'on' } };
}
const EXEC_FEATURES = ['revisions', 'history', 'env', 'executions', 'tests', 'publishable'];
// Each script's text (pages/scripts Code tab: scripts/read; Settings tab: magic-comments/read), its revision (16 hex)
// and its age.
interface DemoCode { rev: string; madeDays: number; savedDays: number; text: string }
export const DEMO_SCRIPT_CODE: Readonly<Record<string, DemoCode>> = {
  'deploy-site.ts': { rev: 'd3e1a7c09b4f6215', madeDays: 30, savedDays: 2, text: [
    '// @label Deploy site',
    '// @description Builds the site and puts it online.',
    'import { $ } from "bun";',
    '',
    'const SITE = "/home/ada/projects/site";',
    '',
    'export default async function () {',
    '  await $`npm run build`.cwd(SITE);',
    '  await $`cp -r dist/. /srv/app/public/`.cwd(SITE);',
    '  return Response.json({ deployed: true, at: new Date().toISOString() });',
    '}',
    '',
  ].join('\n') },
  'rotate-logs.ts': { rev: '6a0e9d3b71c4f282', madeDays: 14, savedDays: 14, text: [
    '// @label Rotate logs',
    '// @description Archives old logs.',
    'import { mkdir, readdir, rename, stat } from "node:fs/promises";',
    '',
    'const LOGS = "/var/log";',
    'const ARCHIVE = "/var/log/archive";',
    'const WEEK = 7 * 24 * 60 * 60 * 1000;',
    '',
    'export default async function () {',
    '  await mkdir(ARCHIVE, { recursive: true });',
    '  const archived: string[] = [];',
    '  for (const name of await readdir(LOGS)) {',
    '    if (!name.endsWith(".log")) continue;',
    '    const { mtimeMs } = await stat(LOGS + "/" + name);',
    '    if (Date.now() - mtimeMs < WEEK) continue;',
    '    await rename(LOGS + "/" + name, ARCHIVE + "/" + name);',
    '    archived.push(name);',
    '  }',
    '  return Response.json({ archived });',
    '}',
    '',
  ].join('\n') },
  'stock-check.ts': { rev: 'b85d2f1c6e07a493', madeDays: 20, savedDays: 3, text: [
    '// @label Stock check',
    '// @description Counts what is left in the shop.',
    'const SHOP = "https://shop.example.com/api/products";',
    '',
    'export default async function () {',
    '  const res = await fetch(SHOP, { headers: { authorization: "Bearer " + process.env.SHOP_API_KEY } });',
    '  if (!res.ok) throw new Error("shop answered " + res.status);',
    '  const products: Array<{ name: string; left: number }> = await res.json();',
    '  const low = products.filter((p) => p.left < 5).map((p) => p.name);',
    '  return Response.json({ left: products.reduce((n, p) => n + p.left, 0), low });',
    '}',
    '',
  ].join('\n') },
};
// The settings the Settings tab offers (hoody-exec's settings schema; scripts/magic.ts parseSchema): the
// program's own fields, the eight the sample scripts touch.
const mc = (key: string, category: string, type: string, description: string, runtime: unknown = null, sdk: unknown = null, more: Record<string, unknown> = {}) =>
  ({ key, directive: `@${key}`, category, type, description, defaults: { when_omitted: null, runtime, sdk_import: sdk }, ...more });
const MAGIC_FIELDS = [
  mc('enabled', 'execution', 'boolean', 'Enable or disable script execution.', true),
  mc('token', 'auth', 'string|string[]', 'Shared secret token for endpoint authentication. Repeatable: a request carrying any listed token passes.', null, null, { repeatable: true }),
  mc('mode', 'execution', 'enum', 'Execution model for the script.', 'serverless', 'serverless', { enum_values: ['worker', 'serverless'] }),
  mc('timeout', 'execution', 'integer', 'Script timeout. A bare number is milliseconds; a unit suffix is honoured (90s, 5m). 0 disables it.', 3_600_000, 30_000, { range: { min: 0, max: 2_147_483_647 } }),
  mc('log-level', 'logging', 'enum', 'Logging verbosity.', 'standard', 'standard', { enum_values: ['none', 'minimal', 'standard', 'full', 'debug'] }),
  mc('description', 'metadata', 'string', 'Human-readable description for the script.'),
  mc('label', 'metadata', 'string', 'Short label used for classification/filtering.'),
  mc('schedule', 'execution', 'string', 'Cron expression (minute hour day month weekday) that also runs the script on a schedule.'),
];
const MAGIC_SCHEMA = {
  schema_version: '1.0.0', total_fields: MAGIC_FIELDS.length, parse_window_lines: 30, unknown_keys_behavior: 'ignored-by-serializer',
  defaults_context: {
    when_omitted: 'Value represented when directive is absent from parsed magic comments.',
    runtime: 'Effective runtime value applied by hoody-exec when directive is omitted.',
    sdk_import: 'Default value written into generated proxy scripts during SDK import.',
  },
  categories: Object.fromEntries(['execution', 'logging', 'cors', 'ai', 'metadata', 'auth', 'remote'].map((c) => [c, MAGIC_FIELDS.filter((f) => f.category === c).map((f) => f.key)])),
  fields: MAGIC_FIELDS,
};
/** A script's kept versions, newest first (the one in use first): its first save, without the description it was given
 *  later, and the current text when it was saved again since. */
function versionsOf(code: DemoCode, now: number): Array<{ version: number; revision: string; savedAt: string; replacedBy?: string; text: string }> {
  const first = { version: 1, revision: [...code.rev].reverse().join(''), savedAt: iso(now - code.madeDays * DAY), text: code.text.split('\n').filter((l) => !l.startsWith('// @description ')).join('\n') };
  if (code.madeDays === code.savedDays) return [{ ...first, revision: code.rev, text: code.text }];
  return [{ version: 2, revision: code.rev, savedAt: iso(now - code.savedDays * DAY), text: code.text }, { ...first, replacedBy: code.rev }];
}
function execAnswer(computer: string, path: string, q: URLSearchParams, now: number): unknown {
  const mine = DEMO_SCRIPTS.filter((x) => x.computer === computer);
  const at = (x: DemoScript): string => `default/1/${x.file}`;
  if (path === '/health') return { status: 'ok', now: iso(now), features: EXEC_FEATURES };
  if (path === '/scripts/list') return { scripts: mine.map((x) => ({ path: at(x), type: 'file', magicComments: { label: x.label, description: x.about } })) };
  if (path === '/monitor/scripts-summary') {
    return { scripts: mine.map((x) => { const runs = runsOf(x, now); return { scriptPath: at(x), calls: runs.length, failed: runs.filter((r) => r.outcome === 'failed').length, lastOutcome: runs[0]?.outcome ?? null }; }) };
  }
  if (path === '/scripts/history/deleted') return { entries: [] };
  if (path === '/schedules/list') return { schedules: [] };
  if (path === '/magic-comments/schema') return MAGIC_SCHEMA;
  // One script's reads, by its path as the page sends it (from the folder root) or as its folder names it: `path` for
  // the file's own reads, `scriptPath` for its calls, figures, secrets and saved tests.
  const asked = q.get('path') ?? q.get('scriptPath');
  const x = asked === null ? undefined : mine.find((s) => asked === at(s) || asked === s.file);
  const code = x ? DEMO_SCRIPT_CODE[x.file] : undefined;
  if (!x || !code || asked === null) return undefined;
  const comments = { label: x.label, description: x.about, tokens: [] as string[] };
  if (path === '/scripts/read') {
    return { path: asked, resolvedPath: at(x), content: code.text, magicComments: comments, revision: code.rev,
      metadata: { size: code.text.length, created: iso(now - code.madeDays * DAY), modified: iso(now - code.savedDays * DAY), isDirectory: false, extension: '.ts' } };
  }
  if (path === '/magic-comments/read') return { path: asked, resolvedPath: at(x), comments, warnings: [], revision: code.rev };
  if (path === '/monitor/script-usage') return usageOf(x, asked, now);
  if (path === '/logs/executions') return executionsOf(x, asked, q, now);
  if (path === '/scripts/history') return { versions: versionsOf(code, now).map((v) => ({ version: v.version, revision: v.revision, savedAt: v.savedAt, ...(v.replacedBy ? { replacedBy: v.replacedBy } : {}) })) };
  if (path === '/scripts/history/read') {
    const v = versionsOf(code, now).find((o) => String(o.version) === q.get('version'));
    return v ? { path: asked, resolvedPath: at(x), content: v.text, magicComments: { label: x.label, ...(v.text.includes('// @description ') ? { description: x.about } : {}), tokens: [] as string[] }, revision: v.revision } : undefined;
  }
  // Secrets: the names the script reads from process.env, kept in its own file; the folder and the computer hold none.
  if (path === '/env/keys') {
    const names = [...new Set([...code.text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!))];
    return {
      files: [
        { scope: 'script', rel: `default/1/${x.file.replace(/\.ts$/, '.env')}`, exists: names.length > 0, revision: names.length > 0 ? code.rev.slice(0, 8) : null, keys: names.map((name) => ({ name })) },
        { scope: 'folder', rel: 'default/1/.env', exists: false, revision: null, keys: [] },
        { scope: 'computer', exists: false, revision: null, keys: [] },
      ],
      effective: names.map((name) => ({ name, from: 'script' })),
    };
  }
  // Saved tests: the stock check keeps one; the others none yet.
  if (path === '/tests/list') {
    return x.file === 'stock-check.ts'
      ? { revision: code.rev.slice(8), cases: [{ id: 'c1', name: 'answers with what is left', method: 'GET', route: routeOfScript(x), expect: { status: 200, contains: '"left"' } }] }
      : { revision: null, cases: [] };
  }
  return undefined;
}

// Logs (the logs program's own record of visits; pages/logs/controller.ts reads it through GET /_logs and /_logs/stats,
// the read pages/logs/fake-kit.ts plays): the visits to atlas's two web programs, the same requests their own output
// shows (DEMO_PROGRAM_LOGS web and api), and every script call above as a visit to its computer's exec program. The
// visitors are documentation addresses.
type DemoVisit = readonly [minutesAgo: number, port: number, method: string, url: string, status: number, ms: number, visitor: string];
export const DEMO_VISITS: Readonly<Record<string, readonly DemoVisit[]>> = {
  [ATLAS]: [
    [52, 3000, 'GET', '/', 200, 6, '203.0.113.24'], [51, 3000, 'GET', '/style.css', 200, 2, '203.0.113.24'], [44, 8000, 'GET', '/health', 200, 2, '198.51.100.7'],
    [27, 3000, 'GET', '/wp-login.php', 404, 2, '203.0.113.200'], [12, 8000, 'GET', '/orders', 200, 21, '198.51.100.7'], [9, 3000, 'GET', '/', 200, 5, '203.0.113.81'],
    [3, 3000, 'GET', '/index.html', 200, 3, '203.0.113.81'],
  ],
};
/** Who calls each script: Ada for the two of atlas, the shop's own checker for the stock check. */
const CALLER: Readonly<Record<string, string>> = { 'deploy-site.ts': '198.51.100.23', 'rotate-logs.ts': '198.51.100.23', 'stock-check.ts': '203.0.113.140' };
const LOGS_FEATURES = ['filters2', 'beforeId', 'buckets', 'retention'];
const LOGS_RETENTION = { hours: 168, maxRows: 50_000, maxBytes: 104_857_600 };
interface LogRow { id: number; tsMs: number; tsIso: string; kind: 'request'; level: string; source: 'edge'; computerId: string; serviceName: string; serviceIndex: number; method: string; url: string; status: number; durationMs: number; clientIp: string; traceId: string }
/** A request id in the shape the logs program keeps (a UUID), the same for the same row. */
function traceOf(computer: string, id: number): string {
  const h = [1, 2, 3, 4].map((k) => (Math.imul(id * 7919 + k * 104_729 + Number.parseInt(computer.slice(-4), 16), 2_654_435_761) >>> 0).toString(16).padStart(8, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** A computer's whole record, oldest first, ids 1… in that order. */
function logRowsOf(computer: string, now: number): LogRow[] {
  const raw: Array<Omit<LogRow, 'id' | 'tsIso' | 'traceId' | 'kind' | 'source' | 'computerId' | 'level'>> = [
    ...(DEMO_VISITS[computer] ?? []).map(([min, port, method, url, status, ms, ip]) => ({ tsMs: now - min * MIN, serviceName: 'http', serviceIndex: port, method, url, status, durationMs: ms, clientIp: ip })),
    ...DEMO_SCRIPTS.filter((x) => x.computer === computer).flatMap((x) => (DEMO_RUNS[x.file] ?? []).map(([min, method, status, ms]) => ({ tsMs: now - min * MIN, serviceName: 'exec', serviceIndex: 1, method, url: routeOfScript(x), status, durationMs: ms + 4, clientIp: CALLER[x.file] ?? '198.51.100.23' }))),
  ];
  return raw.sort((a, b) => a.tsMs - b.tsMs).map((r, i) => ({
    id: i + 1, tsIso: iso(r.tsMs), kind: 'request' as const, level: r.status >= 500 ? 'error' : r.status >= 400 ? 'warn' : 'info', source: 'edge' as const, computerId: computer, traceId: traceOf(computer, i + 1), ...r,
  }));
}
/** The filters /_logs and /_logs/stats take (pages/logs/rules.ts FILTER_KEYS) over one row. */
function logMatches(r: LogRow, q: URLSearchParams): boolean {
  const n = (k: string): number | null => (q.get(k) === null || q.get(k) === '' ? null : Number(q.get(k)));
  const s = (k: string): string | null => (q.get(k) === null || q.get(k) === '' ? null : q.get(k));
  const since = n('sinceMs'), until = n('untilMs'), min = n('minStatus'), status = n('status');
  if (since !== null && r.tsMs < since) return false;
  if (until !== null && r.tsMs > until) return false;
  if (s('source') !== null && r.source !== s('source')) return false;
  if (s('kind') !== null && r.kind !== s('kind')) return false;
  if (s('serviceName') !== null && r.serviceName !== s('serviceName')) return false;
  if (s('excludeService') !== null && r.serviceName === s('excludeService')) return false;
  if (s('level') !== null && !s('level')!.split(',').includes(r.level)) return false;
  if (min !== null && !(r.status >= min)) return false;
  if (s('path') !== null && !r.url.toLowerCase().includes(s('path')!.toLowerCase())) return false;
  if (status !== null && r.status !== status) return false;
  if (s('traceId') !== null && r.traceId !== s('traceId')!.toLowerCase()) return false;
  if (s('method') !== null && r.method !== s('method')) return false;
  // No row is a Bot call: a Bot URL filter matches none.
  if (s('botUrl') !== null) return false;
  return true;
}
/** GET /_logs: newest first without a cursor and with beforeId, ascending with afterId; the watermarks cover the whole
 *  record whatever the filters (newestId and retained null when it is empty). */
function logsList(computer: string, q: URLSearchParams, now: number): unknown {
  const rows = logRowsOf(computer, now);
  const m = rows.filter((r) => logMatches(r, q));
  const limit = Math.min(Math.max(Math.floor(Number(q.get('limit') ?? 100)) || 100, 1), 1000);
  const after = q.get('afterId'), before = q.get('beforeId');
  const entries = after !== null ? m.filter((r) => r.id > Number(after)).slice(0, limit)
    : before !== null ? m.filter((r) => r.id < Number(before)).reverse().slice(0, limit)
      : m.slice().reverse().slice(0, limit);
  const oldest = rows[0];
  return {
    entries, total: m.length, limit, offset: 0, bodiesOmitted: true,
    newestId: rows.length > 0 ? rows[rows.length - 1]!.id : null,
    retained: oldest ? { oldestId: oldest.id, oldestTsMs: oldest.tsMs } : null,
    retention: { ...LOGS_RETENTION },
  };
}
/** GET /_logs/stats: totals by level and status class, and one bucket of bucketMs from sinceMs to untilMs (or the last
 *  match), at most 501. */
function logsStats(computer: string, q: URLSearchParams, now: number): unknown {
  const m = logRowsOf(computer, now).filter((r) => logMatches(r, q));
  const width = Math.max(1, Number(q.get('bucketMs') || 60_000));
  const start = Number(q.get('sinceMs') || (m[0] ? m[0].tsMs : 0));
  const end = q.get('untilMs') ? Number(q.get('untilMs')) : m.length > 0 ? m[m.length - 1]!.tsMs : start;
  const count = Math.max(0, Math.min(500, Math.floor((end - start) / width))) + 1;
  const bump = (o: Record<string, number>, k: string): void => { o[k] = (o[k] ?? 0) + 1; };
  const byLevel: Record<string, number> = {}, byStatusClass: Record<string, number> = {};
  const buckets = Array.from({ length: count }, (_, i) => ({ startMs: start + i * width, byLevel: {} as Record<string, number>, byStatusClass: {} as Record<string, number> }));
  for (const r of m) {
    const cls = `${Math.floor(r.status / 100)}xx`;
    bump(byLevel, r.level); bump(byStatusClass, cls);
    const b = buckets[Math.max(0, Math.floor((r.tsMs - start) / width))];
    if (b) { bump(b.byLevel, r.level); bump(b.byStatusClass, cls); }
  }
  return { features: LOGS_FEATURES, total: m.length, byLevel, byStatusClass, buckets, retention: { ...LOGS_RETENTION } };
}

// Files (the files program; pages/files/logic.ts rootListingOf, folderOf, ro.data.ts usePreview): each computer's
// folders, every one of them listed, and the first lines of its text files. atlas holds the full tree; every other
// computer a short one.
type DemoFolder = { dirs: readonly string[]; files?: ReadonlyArray<readonly [name: string, bytes: number]> };
const ELF = '\u007fELF\u0002\u0001\u0001\u0000';
export const DEMO_FILES: Readonly<Record<string, DemoFolder>> = {
  '/': { dirs: ['bin', 'etc', 'home', 'srv', 'tmp', 'usr', 'var'] },
  '/bin': { dirs: [], files: [['bash', 1_265_648], ['cat', 44_016], ['ls', 151_344]] },
  '/etc': { dirs: ['nginx'], files: [['hostname', 6], ['hosts', 158]] },
  '/etc/nginx': { dirs: [], files: [['nginx.conf', 412]] },
  '/home': { dirs: ['ada'] },
  '/home/ada': { dirs: ['notes', 'projects'], files: [['todo.txt', 118]] },
  '/home/ada/notes': { dirs: [], files: [['release-1.4.md', 236]] },
  '/home/ada/projects': { dirs: ['site'], files: [['README.md', 164]] },
  '/home/ada/projects/site': { dirs: [], files: [['config.yaml', 96], ['deploy.sh', 121], ['index.html', 233]] },
  '/srv': { dirs: ['app'] },
  '/srv/app': { dirs: ['public'], files: [['package.json', 141], ['server.js', 297]] },
  '/srv/app/public': { dirs: [], files: [['index.html', 233], ['style.css', 88]] },
  '/tmp': { dirs: [] },
  '/usr': { dirs: ['bin', 'lib', 'share'] },
  '/usr/bin': { dirs: [], files: [['env', 43_976], ['node', 98_112_400], ['python3', 6_634_256]] },
  '/usr/lib': { dirs: [] },
  '/usr/share': { dirs: [] },
  '/var': { dirs: ['log'] },
  '/var/log': { dirs: [], files: [['syslog', 312]] },
};
const OTHER_FILES: Readonly<Record<string, DemoFolder>> = {
  '/': { dirs: ['home', 'srv', 'tmp'] },
  '/home': { dirs: ['ada'] },
  '/home/ada': { dirs: [], files: [['todo.txt', 118]] },
  '/srv': { dirs: [] },
  '/tmp': { dirs: [] },
};
/** The text of a file, by its name (binaries read as an executable's first bytes, which the preview does not show). */
export const DEMO_FILE_TEXT: Readonly<Record<string, string>> = {
  'hostname': 'atlas\n',
  'hosts': '127.0.0.1 localhost\n::1 localhost\n10.0.0.12 atlas\n',
  'nginx.conf': 'server {\n    listen 8080;\n    root /srv/app/public;\n    location /api/ {\n        proxy_pass http://localhost:3000;\n    }\n}\n',
  'todo.txt': '- Renew the shop certificate\n- Check the weekly sales report\n- Answer the storefront review notes\n',
  'release-1.4.md': '# Release 1.4\n\n## New\n- Search in the shop\n- Gift cards\n- Order export\n\n## Fixed\n- Prices on the cart page\n- Slow checkout on phones\n',
  'README.md': '# Projects\n\nsite/ is the shop\'s web site. Run deploy.sh to put it online.\n',
  'config.yaml': 'name: shop\nport: 3000\nlog_level: info\n',
  'deploy.sh': '#!/bin/sh\nset -e\nnpm run build\ncp -r dist/* /srv/app/public/\necho "Site deployed"\n',
  'index.html': '<!doctype html>\n<html lang="en">\n<head><title>Shop</title><link rel="stylesheet" href="style.css"></head>\n<body><h1>Welcome to the shop</h1></body>\n</html>\n',
  'style.css': 'body { font-family: sans-serif; margin: 2rem; }\nh1 { color: #2a6; }\n',
  'package.json': '{\n  "name": "shop",\n  "version": "1.4.0",\n  "scripts": { "start": "node server.js" }\n}\n',
  'server.js': 'const http = require("node:http");\nconst port = 3000;\nhttp.createServer((req, res) => {\n  res.end("Shop API is running");\n}).listen(port);\n',
  'syslog': 'atlas systemd[1]: Started Daily backup.\natlas systemd[1]: Finished Daily backup.\natlas cron[412]: (user) CMD (restic backup ~/projects)\n',
};
/** Whether a file runs (mode 755): a program (its text is an executable's) or a shell script. */
const runnable = (name: string): boolean => DEMO_FILE_TEXT[name] === undefined || name.endsWith('.sh');
/** A files-program read of `pathname` (with its query), or undefined. */
function filesRead(computer: string, u: URL, now: number): { body: unknown; type?: string } | undefined {
  const tree = computer === ATLAS ? DEMO_FILES : OTHER_FILES;
  // A folder's size is its item count (as the program gives it); a folder is older than the files in it.
  const items = (path: string): number => (tree[path]?.dirs.length ?? 0) + (tree[path]?.files?.length ?? 0);
  const listed = (path: string, d: DemoFolder) => [
    ...d.dirs.map((name, i) => ({ name, dir: true, size: items(path === '/' ? `/${name}` : `${path}/${name}`), at: now - (i + 2) * DAY })),
    ...(d.files ?? []).map(([name, size], i) => ({ name, dir: false, size, at: now - (i + 1) * 3 * 3_600_000 })),
  ];
  if (u.pathname === '/' && u.searchParams.has('json') && [...u.searchParams.keys()].length === 1) {
    return { body: {
      kind: 'Index', href: '/', uri_prefix: '/', allow_upload: true, allow_delete: true, allow_search: true, allow_archive: true, allow_remote: false,
      auth: false, user: null, dir_exists: true, remote_mounts: null,
      paths: listed('/', tree['/']!).map((e) => ({ path_type: e.dir ? 'Dir' : 'File', name: e.name, mtime: e.at, size: e.size })),
    } };
  }
  if (!u.pathname.startsWith('/api/v1/files/')) return undefined;
  const path = '/' + u.pathname.slice('/api/v1/files/'.length).split('/').filter(Boolean).map(decodeURIComponent).join('/');
  const keys = [...u.searchParams.keys()];
  if (keys.length === 0) {
    const d = tree[path];
    if (!d) return undefined;
    const entries = listed(path, d).map((e) => ({ name: e.name, is_dir: e.dir, size: e.dir ? 0 : e.size, modified: Math.floor(e.at / 1000), type: e.dir ? 'dir' : 'file', mode: e.dir || runnable(e.name) ? '755' : '644' }));
    return { body: { path, count: entries.length, skipped: [], entries } };
  }
  if (keys.length === 1 && keys[0] === 'q') {
    // Find by name (pages/files/ro.pure.ts foundOf): every folder and file below `path` whose name holds the words, named
    // by its path from the top. The top folder has no search (a 404, as the program answers).
    const words = (u.searchParams.get('q') ?? '').toLowerCase();
    if (!tree[path] || path === '/' || !words) return undefined;
    const entries: Array<{ name: string; is_dir: boolean; size: number; modified: number }> = [];
    const walk = (dir: string) => {
      for (const e of listed(dir, tree[dir]!)) {
        const full = `${dir}/${e.name}`;
        if (e.name.toLowerCase().includes(words)) entries.push({ name: full, is_dir: e.dir, size: e.dir ? 0 : e.size, modified: Math.floor(e.at / 1000) });
        if (e.dir && tree[full]) walk(full);
      }
    };
    walk(path);
    return { body: { path, count: entries.length, entries } };
  }
  if (keys.length === 1 && keys[0] === 'lines') {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const at = tree[path.slice(0, path.lastIndexOf('/')) || '/'];
    if (!at?.files?.some(([n]) => n === name)) return undefined;
    return { body: DEMO_FILE_TEXT[name] ?? ELF, type: 'text/plain; charset=utf-8' };
  }
  return undefined;
}

// Programs: each program's sandbox (pages/programs/sandbox/model.ts readStatus) and the host's sandbox parts
// (block.ts readHost). web keeps memory and process limits; every other program runs without a sandbox.
const NO_LIVE = { table_present: false, chain: null, rules: [] };
const SANDBOX_NONE = { success: true, configured: null, rev: null, effective: null, live: NO_LIVE, firewall: 'none', problems: [] };
const SANDBOX_LIMITS = {
  success: true, configured: { process: { max_memory: '512M', max_pids: 256, private_tmp: true } }, rev: '5d2e8a41c7b0',
  effective: { bwrap_argv: [], scope_argv: ['<process-limit runner>', '<limits: max_memory 512M, max_pids 256>', '<program argv>'] }, live: NO_LIVE, firewall: 'none', problems: [],
};
/** The daemon's program ids that keep a sandbox (the programs overview names them: 1 is atlas's web). */
export const DEMO_SANDBOXED: readonly string[] = ['1'];
const DAEMON_HEALTH = { status: 'ok', sandbox: { bwrap: true, nft: true, systemd_run: true, landlock_abi: 6, bwrap_version: '0.12.0', bwrap_tmpfs_size: true, firewall: 'ok' } };
// The daemon's programs (pages/logs Programs tab; a hoody-daemon program): atlas runs its own programs and every computer
// the Hoody Kit ones. Each has its last output (the log answer), oldest first, and its state in the overview below.
interface DemoProgram { id: number; name: string; command: string; boot?: boolean; autorestart?: boolean; enabled?: boolean; ports?: readonly [number, number] }
const USER_PROGRAMS: readonly DemoProgram[] = [
  { id: 1, name: 'web', command: 'node /srv/app/server.js', boot: true, autorestart: true },
  { id: 2, name: 'api', command: 'node /srv/app/api.js', ports: [8000, 8003] },
  { id: 3, name: 'worker', command: 'python3 worker/main.py', boot: true, autorestart: true },
  { id: 4, name: 'nightly-sync', command: 'sh bin/nightly-sync.sh', autorestart: false },
  { id: 5, name: 'backup', command: 'restic backup projects', autorestart: false },
  { id: 6, name: 'docs-preview', command: 'node docs/preview.js', autorestart: false },
  { id: 7, name: 'report-builder', command: 'node reports/build.js' },
  { id: 8, name: 'legacy-cron', command: 'sh bin/old-cron.sh', enabled: false },
  { id: 9, name: 'image-resizer', command: 'node jobs/resize-images.js' },
];
const KIT_PROGRAMS: readonly DemoProgram[] = ([[100, 'hoody-agent'], [101, 'hoody-terminal'], [102, 'hoody-cron'], [103, 'hoody-run'], [104, 'hoody-notes'], [105, 'hoody-display'], [106, 'hoody-files'], [107, 'hoody-daemon'], [108, 'hoody-tunnel'], [120, 'hoody-exec']] as const)
  .map(([id, name]) => ({ id, name, command: `/hoody/plugins/${name}/${name}`, boot: true, autorestart: true }));
export const DEMO_DAEMON_PROGRAMS = (computer: string): readonly DemoProgram[] => (computer === ATLAS ? [...USER_PROGRAMS, ...KIT_PROGRAMS] : KIT_PROGRAMS);
const programView = (p: DemoProgram) => ({
  id: p.id, name: p.name, command: p.command, user: p.id >= 100 ? 'root' : 'user', enabled: p.enabled !== false, boot: p.boot === true,
  delay_seconds: 0, autorestart: p.autorestart ?? 'unexpected', priority: p.id >= 100 ? 100 : 999, hoody_kit: p.id >= 100,
  ...(p.ports ? { port_range: { start: p.ports[0], end: p.ports[1] }, port_param: '--port' } : {}),
});
type DemoLine = readonly [minutesAgo: number, text: string];
export const DEMO_PROGRAM_LOGS: Readonly<Record<string, { stdout?: readonly DemoLine[]; stderr?: readonly DemoLine[] }>> = {
  web: { stdout: [[60 * 74, 'web listening on port 3000'], [52, 'GET / 200 4ms'], [51, 'GET /style.css 200 1ms'], [27, 'GET /wp-login.php 404 1ms'], [9, 'GET / 200 3ms'], [3, 'GET /index.html 200 2ms']] },
  api: { stdout: [[60, 'api listening on port 8000'], [44, 'GET /health 200 1ms'], [12, 'GET /orders 200 18ms']] },
  worker: { stderr: [[16, 'Traceback (most recent call last):'], [16, '  File "worker/main.py", line 3, in <module>'], [16, '    import redis'], [15, "ModuleNotFoundError: No module named 'redis'"]] },
  'nightly-sync': { stdout: [[121, 'nightly-sync: starting']], stderr: [[120, 'nightly-sync: folder /mnt/share/projects not found'], [120, 'nightly-sync: nothing copied (exit 2)']] },
  backup: { stdout: [[505, 'open repository'], [501, 'Files: 12 new, 41 changed, 2210 unmodified'], [500, 'snapshot 5d07c3b2 saved']] },
  'docs-preview': { stdout: [[1500, 'docs preview on port 4000'], [1440, 'docs preview stopped']] },
};
function programLogs(computer: string, id: string, q: URLSearchParams, now: number): unknown {
  const p = DEMO_DAEMON_PROGRAMS(computer).find((x) => String(x.id) === id);
  if (!p) return undefined;
  const type = q.get('type') === 'stderr' ? 'stderr' : 'stdout';
  const want = Math.min(Math.max(Math.floor(Number(q.get('lines') ?? 100)) || 0, 0), 10_000);
  const out = want === 0 ? [] : (DEMO_PROGRAM_LOGS[p.name]?.[type] ?? []).map(([min, text]) => `${iso(now - min * MIN)} ${text}`).slice(-want);
  return { success: true, error: null, logs: out.length > 0 ? out.join('\n') + '\n' : '', type, lines: out.length, log_file: `/hoody/storage/hoody-daemon/logs/${p.name}/${type}.log` };
}
// What each program is doing (GET /programs/overview: pages/programs, and the gates of Tunnels and Schedules read it).
// atlas's own: web and api serve (the visits in Logs), worker fails to start (its output says why), the night's sync
// and backup ran and ended, the rest wait. Every Hoody Kit program runs; the tunnel program is up on atlas, where a
// laptop is connected (Tunnels), and starts by itself elsewhere when one connects. Times are minutes before the read.
const KIT_UPTIME_S = 5 * 86_400;
const ended = (now: number, agoMin: number, exit: number, more: Record<string, unknown> = {}) => ({ final: true, exit_code: exit, ended_at: now - agoMin * MIN, ...more });
function atlasStates(now: number): Readonly<Record<number, Record<string, unknown>>> {
  return {
    1: { status: 'running', autorestart: 'always', instances: [{ port: 3000, status: 'running', pid: 7000, uptime_s: 74 * 3600 }] },
    2: { status: 'running', autorestart: 'unexpected', instances: [{ port: 8000, status: 'running', pid: 12000, uptime_s: 3600 }, { port: 8001, status: 'running', pid: 12001, uptime_s: 3600 }, { port: 8002, status: 'stopped' }] },
    3: { status: 'fatal', autorestart: 'always', instances: [{ port: 0, status: 'fatal' }], last_result: ended(now, 15, 1, { failure: 'launch_failed' }) },
    4: { status: 'exited', autorestart: 'never', last_result: ended(now, 120, 2), instances: [{ status: 'exited', last_result: ended(now, 120, 2) }] },
    5: { status: 'exited', autorestart: 'never', last_result: ended(now, 500, 0), instances: [{ status: 'exited', last_result: ended(now, 500, 0) }] },
    6: { status: 'stopped', autorestart: 'never', instances: [{ status: 'stopped' }], last_result: { ended_at: now - 1440 * MIN, exit_code: 0 } },
    7: { status: 'stopped', lazy_load: true, instances: [] },
    8: { status: 'stopped', instances: [] },
    9: { status: 'stopped', instances: [] },
  };
}
function overviewOf(computer: string, now: number): unknown {
  const own: Readonly<Record<number, Record<string, unknown>>> = computer === ATLAS ? atlasStates(now) : {};
  const programs = DEMO_DAEMON_PROGRAMS(computer).map((p) => {
    const head = { id: p.id, name: p.name, states_known: true, hoody_kit: p.id >= 100, ...(p.boot ? { boot: true } : {}), ...(p.enabled === false ? { enabled: false } : {}), ...(p.ports ? { port_range: { start: p.ports[0], end: p.ports[1] } } : {}) };
    if (p.id < 100) return { ...head, ...own[p.id] };
    if (p.name === 'hoody-tunnel' && computer !== ATLAS) return { ...head, status: 'stopped', lazy_load: true, autorestart: 'always', instances: [] };
    return { ...head, status: 'running', autorestart: 'always', instances: [{ port: 15_000 + (p.id - 100), status: 'running', pid: 19_000 + (p.id - 100), uptime_s: KIT_UPTIME_S }] };
  });
  return { programs, temporary: computer === ATLAS ? [{ temporary_id: 'quick_1760000000_1', name: 'http-server', status: 'running', expires_at: now + 40 * MIN }] : [], features: ['restart', 'boot_switch'] };
}
// Tunnels (the tunnel program on atlas; pages/tunnels/logic.ts parseTunnels, parseSessions, parseBindings, parseHealth):
// one laptop connected. It puts its dev server online through atlas's port 5173 (expose), and atlas reaches the
// laptop's database on 127.0.0.1:5432 (pull: the computer listens there; a port no program of atlas uses).
export const DEMO_TUNNEL_SESSION = 'sess-4f7a2c91';
const DEMO_TUNNEL_PORTS = { expose: 5173, pull: 5432 } as const;
function tunnelAnswer(computer: string, path: string, now: number): unknown {
  const on = computer === ATLAS;
  const sid = DEMO_TUNNEL_SESSION;
  switch (path) {
    case '/health': return { status: 'ok', started: iso(now - KIT_UPTIME_S * 1000) };
    case '/tunnels': return { sessions: on ? [{ sessionId: sid, peerAddr: '203.0.113.24:51234', protocol: 'v2', activeStreams: 2, exposeBindings: [{ bindId: 1, computerPort: DEMO_TUNNEL_PORTS.expose }], pullBindings: [{ bindId: 2, computerPort: DEMO_TUNNEL_PORTS.pull, bindAddr: '127.0.0.1' }] }] : [], orphanedSessions: 0 };
    case '/sessions': return { sessions: on ? [{ sessionId: sid, maxStreams: 1024 }] : [] };
    case '/bindings': return { bindings: on ? [{ sessionId: sid, bindId: 1, port: DEMO_TUNNEL_PORTS.expose, mode: 'expose' }, { sessionId: sid, bindId: 2, port: DEMO_TUNNEL_PORTS.pull, mode: 'pull', bindAddr: '127.0.0.1' }] : [] };
    default: return undefined;
  }
}

// What a running computer listens on (GET /computers/:id?runtime=true, its runtime_info; core/computerRuntime.ts
// classifyRuntime, the Ports tabs of Computers and Programs): sshd and the Hoody Kit programs the overview shows running
// (Hoody's own), and on atlas its web and api programs and the tunnel program's two ports. No terminal or display is open.
interface DemoListener { protocol: 'tcp'; port: number; ip: string; pid: number; user: string; program: string; path: string; args: string }
export function demoRuntimeInfo(computer: string): { network_services: DemoListener[]; terminals: []; displays: [] } {
  const on = (port: number, pid: number, program: string, path: string, args: string, ip = '0.0.0.0', user = 'user'): DemoListener => ({ protocol: 'tcp', port, ip, pid, user, program, path, args });
  const kit = DEMO_DAEMON_PROGRAMS(computer).filter((p) => p.id >= 100 && (p.name !== 'hoody-tunnel' || computer === ATLAS))
    .map((p) => on(15_000 + (p.id - 100), 19_000 + (p.id - 100), p.name, p.command, p.command, '127.0.0.1', 'root'));
  const tunnel = '/hoody/plugins/hoody-tunnel/hoody-tunnel', node = '/usr/bin/node';
  const own = computer !== ATLAS ? [] : [
    on(3000, 7000, 'node', node, 'node /srv/app/server.js'),
    on(8000, 12000, 'node', node, 'node /srv/app/api.js --port 8000'),
    on(8001, 12001, 'node', node, 'node /srv/app/api.js --port 8001'),
    on(DEMO_TUNNEL_PORTS.expose, 19_008, 'hoody-tunnel', tunnel, tunnel, '0.0.0.0', 'root'),
    on(DEMO_TUNNEL_PORTS.pull, 19_008, 'hoody-tunnel', tunnel, tunnel, '127.0.0.1', 'root'),
  ];
  const sshd = on(22, 410, 'sshd', '/usr/sbin/sshd', '/usr/sbin/sshd -D', '0.0.0.0', 'root');
  return { network_services: [sshd, ...own, ...kit].sort((a, b) => a.port - b.port), terminals: [], displays: [] };
}
function daemonRead(computer: string, path: string, q: URLSearchParams, now: number): unknown {
  if (path === '/health') return DAEMON_HEALTH;
  if (path === '/programs/overview') return overviewOf(computer, now);
  if (path === '/programs') return { programs: DEMO_DAEMON_PROGRAMS(computer).map(programView) };
  const logs = /^\/programs\/(\d+)\/logs$/.exec(path);
  if (logs) return programLogs(computer, logs[1]!, q, now);
  const m = /^\/programs\/(\d+)\/sandbox$/.exec(path);
  // Only a program of this computer has a sandbox to read; another id is a 404, as the daemon answers it.
  if (!m || !DEMO_DAEMON_PROGRAMS(computer).some((x) => String(x.id) === m[1])) return undefined;
  return DEMO_SANDBOXED.includes(m[1]!) ? SANDBOX_LIMITS : SANDBOX_NONE;
}

// The chats of atlas's recorded chat list (the agent's GET /sessions there, realm Personal): what opening one reads
// (ask/data.ts: the chat, its turns, its transcript, its state; ask/conv.ts historyFrom, gates.ts onState). Each is the
// list row's chat, as old as the row (minutes before the read). The chat waiting on a decision (s-wait) is parked on
// the recorded gate g1-0. The streams stay unanswered (404): with no turn running the Hub shows the chat as is and reads
// its state again; so a chat the list shows working (s-today) opens on its last finished turn.
type DemoBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; tool_id: string; tool_name: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; tool_id: string; output: string; is_error: boolean };
type DemoChatMessage = readonly [role: 'user' | 'assistant', blocks: readonly DemoBlock[]];
interface DemoChat { id: string; name?: string; cwd: string; agoMin: number; acp?: true; fromBot?: true; gate?: true; messages: readonly DemoChatMessage[] }
const say = (text: string): DemoBlock => ({ kind: 'text', text });
const use = (tool_id: string, tool_name: string, input: Record<string, unknown>): DemoBlock => ({ kind: 'tool_use', tool_id, tool_name, input });
const got = (tool_id: string, output: string, is_error = false): DemoBlock => ({ kind: 'tool_result', tool_id, output, is_error });
export const DEMO_WAIT_ASK = 'Deploy the shop to the staging site and send me its address.';
export const DEMO_CHATS: readonly DemoChat[] = [
  { id: 's-today', cwd: '/home/ada/projects/shop', agoMin: 2, messages: [
    ['user', [say('Fix the failing checkout tests')]],
    ['assistant', [say('I will run the checkout tests first.'), use('tu-1', 'bash', { command: 'npm test -- checkout' })]],
    ['user', [got('tu-1', 'Tests: 2 failed, 12 passed, 14 total\n  x total rounds the tax once\n  x discount and tax together', true)]],
    ['assistant', [say('Both failures round the tax on every line instead of once on the total. I changed that and ran the tests again.'),
      use('tu-2', 'edit_file', { path: 'src/cart/total.ts', old_string: 'lines.reduce((sum, l) => sum + round(l.price * TAX), 0)', new_string: 'round(lines.reduce((sum, l) => sum + l.price, 0) * TAX)' }),
      use('tu-3', 'bash', { command: 'npm test -- checkout' })]],
    ['user', [got('tu-2', 'Edited src/cart/total.ts'), got('tu-3', 'Tests: 14 passed, 14 total')]],
    ['assistant', [say('All 14 checkout tests pass now. The tax is rounded once, on the order total (src/cart/total.ts).')]],
  ] },
  { id: 's-claude', cwd: '/home/ada', agoMin: 3 * 60, acp: true, messages: [
    ['user', [say('Review the release notes')]],
    ['assistant', [use('tu-1', 'read_file', { path: 'notes/release-1.4.md' })]],
    ['user', [got('tu-1', DEMO_FILE_TEXT['release-1.4.md']!)]],
    ['assistant', [say('The notes are clear and short. Two suggestions: add the release date under the title, and say what changed for slow checkout on phones (for example "checkout loads twice as fast").')]],
  ] },
  { id: 's-wait', name: 'Deploy the staging site', cwd: '/home/ada/projects/shop', agoMin: 40 * 24 * 60, gate: true, messages: [
    ['user', [say(DEMO_WAIT_ASK)]],
    ['assistant', [say('I will build the shop first, then deploy it.'), use('tu-1', 'bash', { command: 'npm run build' })]],
    ['user', [got('tu-1', 'Build finished in 41 s.')]],
    ['assistant', [say('The build passed. Deploying to staging needs your OK.')]],
  ] },
  { id: 's-delegate', cwd: '/home/ada', agoMin: 26 * 60, fromBot: true, messages: [
    ['user', [say('Answer the support ticket')]],
    ['assistant', [say('I answered the customer: their order 1042 left the warehouse today, and the tracking link follows by mail. I tagged the ticket "shipping".')]],
  ] },
  { id: 's-old', cwd: '/home/ada', agoMin: 30 * 24 * 60, messages: [
    ['user', [say('Plan the backup job')]],
    ['assistant', [say('A plan for the backup:\n1. Back up ~/projects with restic every night at 02:00.\n2. Keep 7 daily and 4 weekly snapshots.\n3. Check the backup each Sunday and tell you if it fails.')]],
  ] },
];
const askOf = (c: DemoChat): string => (c.messages[0]![1][0] as { text: string }).text;
const chatTurns = (c: DemoChat): number => c.messages.filter(([role, b]) => role === 'user' && b.some((x) => x.kind === 'text')).length;
/** One chat's read (rest: '' the chat, /turns, /transcript, /state), or undefined. */
function chatRead(c: DemoChat, rest: string, now: number): unknown {
  const t0 = iso(now - c.agoMin * MIN); // the list row's started_at and last_request_at
  const row = {
    id: c.id, ...(c.name ? { name: c.name } : {}), first_message: askOf(c), realm: PERSONAL, model: 'hoody-ai/hoody-free', cwd: c.cwd, state: 'idle',
    ...(c.gate ? { pending_gate: true } : {}), ...(c.acp ? { backend_kind: 'acp' } : {}),
    ...(c.fromBot ? { origin: { kind: 'bot', bot_uid: 'uid-support-desk', bot_id: 'support-desk', realm: PERSONAL, ref: `work-${c.id}` } } : {}),
    started_at: t0, last_request_at: t0,
  };
  const n = chatTurns(c);
  switch (rest) {
    case '': return { session: row };
    // Newest first; the parked chat's last turn is still out (dispatched), every other one completed.
    case '/turns': return { session_id: c.id, turns: Array.from({ length: n }, (_, i) => ({ turn_id: `turn-demo-${n - i}`, state: c.gate && i === 0 ? 'dispatched' : 'completed', accepted_at: t0, dispatched_at: t0 })) };
    case '/transcript': return {
      session_id: c.id, live: true, realm: PERSONAL, name: c.name ?? '', model: row.model, cwd: c.cwd, turns_total: n, turns_returned: n, turn_boundaries: [], started_at: t0, last_request_at: t0,
      messages: c.messages.map(([role, blocks]) => ({ role, blocks })),
    };
    // A parked chat holds the recorded gate (g1-0, generation 1); no chat has a current turn (a current one would make the Hub replay it).
    case '/state': return {
      session_id: c.id, live: true, state: c.gate ? 'parked' : 'idle', current_turn_id: null, queued_turn_ids: [], incarnation: 'inc-demo-1', seq: 42,
      ...(c.gate ? {
        pending_gate: { type: 'confirm', gate_id: 1, generation: 1, tool_name: 'bash', gate_cause: 'static_stakes', risk: 'write', human_only: false, lease_required: false, params: { command: 'npm run deploy -- --target staging' }, detail: 'Deploys the shop to the staging site.' },
        pending_gate_ref: { id: 'g1-0', generation: 1, type: 'confirm', tool_name: 'bash', gate_cause: 'static_stakes', risk: 'write', human_only: false },
      } : {}),
    };
    default: return undefined;
  }
}
/** A chat read of atlas's agent (`/api/v1/agent/sessions/<id>…`) in its realm or over all realms, or undefined. */
function chatOf(pathname: string, realm: string | null, now: number): unknown {
  const m = /^\/api\/v1\/agent\/sessions\/(s-[a-z]+)((?:\/[a-z]+)?)$/.exec(pathname);
  const c = m ? DEMO_CHATS.find((x) => x.id === m[1]) : undefined;
  return c && (realm === null || realm === PERSONAL || realm === 'all') ? chatRead(c, m![2]!, now) : undefined;
}
// The chat lists of every computer's agent but atlas's (whose lists are the recorded ones): no chats, no gates, nothing
// changed, in any realm.
const NO_CHATS: Readonly<Record<string, unknown>> = {
  '/api/v1/agent/sessions': { items: [], meta: { total: 0, page: 1, limit: 50 } },
  '/api/v1/agent/gates': { items: [], meta: { total: 0, page: 1, limit: 100, omitted: 0 } },
  '/api/v1/agent/sessions/cwds': { cwds: [] },
  '/api/v1/agent/changes': { scope: 'scope-empty', tokens: { sessions: 'c0:s0', gates: 'c0:g0' } },
  '/api/v1/agent/pause': { paused: false, since_ms: 0, gen: 1 },
};

/** The hand-written answer of a GET to a computer's program, or null (the recorded answer, else 404, stands). A
 *  `type` other than JSON carries the body as text. */
export function demoKitAnswer(url: string, now: number): { status: number; body: unknown; type?: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const m = KIT_HOST.exec(u.hostname);
  if (!m) return null;
  const [, , computer, program] = m as unknown as [string, string, string, string];
  if (program === 'agent' && u.pathname === '/api/v1/agent/bots') {
    const realm = u.searchParams.get('realm') ?? 'all';
    const items = DEMO_BOTS.filter((b) => b.computer === computer && (realm === 'all' || b.realm === realm)).map((b) => botView(b, now));
    return { status: 200, body: { items, meta: { total: items.length } } };
  }
  if (program === 'agent' && u.pathname.startsWith('/api/v1/agent/bots/')) {
    const body = botRead(computer, u.pathname.slice('/api/v1/agent'.length), u.searchParams.get('realm'), now);
    return body === undefined ? null : { status: 200, body };
  }
  if (program === 'files') {
    const got = filesRead(computer, u, now);
    return got === undefined ? null : { status: 200, ...got };
  }
  if (program === 'daemon' && u.pathname.startsWith('/api/v1/daemon/')) {
    const body = daemonRead(computer, u.pathname.slice('/api/v1/daemon'.length), u.searchParams, now);
    return body === undefined ? null : { status: 200, body };
  }
  if (program === 'tunnel' && u.pathname.startsWith('/api/v1/tunnel/')) {
    const body = tunnelAnswer(computer, u.pathname.slice('/api/v1/tunnel'.length), now);
    return body === undefined ? null : { status: 200, body };
  }
  if (program === 'cron' && u.pathname.startsWith('/api/v1/cron/')) {
    const body = cronAnswer(computer, u.pathname.slice('/api/v1/cron'.length), u.searchParams, now);
    return body === undefined ? null : { status: 200, body };
  }
  if (program === 'exec' && u.pathname.startsWith('/api/v1/exec/')) {
    const body = execAnswer(computer, u.pathname.slice('/api/v1/exec'.length), u.searchParams, now);
    return body === undefined ? null : { status: 200, body };
  }
  if (program === 'agent' && computer === ATLAS) {
    const body = chatOf(u.pathname, u.searchParams.get('realm'), now);
    if (body !== undefined) return { status: 200, body };
  }
  if (program === 'agent' && computer !== ATLAS && NO_CHATS[u.pathname] !== undefined) return { status: 200, body: NO_CHATS[u.pathname] };
  if (program === 'agent' && u.pathname.startsWith('/api/v1/agent/')) {
    const own = agentAnswer(u.pathname.slice('/api/v1/agent'.length));
    if (own !== undefined) return { status: 200, body: own };
  }
  if (program === 'agent' && u.pathname === '/api/v1/agent/script-instances') return { status: 200, body: { instances: [] } };
  if (program === 'curl' && u.pathname === '/api/v1/curl/schedule') return { status: 200, body: { items: [] } };
  if (program === 'agent' && u.pathname === '/api/v1/agent/loops') return { status: 200, body: { items: [] } };
  if (program === 'logs' && u.pathname === '/_logs') return { status: 200, body: logsList(computer, u.searchParams, now) };
  if (program === 'logs' && u.pathname === '/_logs/stats') return { status: 200, body: logsStats(computer, u.searchParams, now) };
  if (program === 'notes' && u.pathname.startsWith('/api/v1/notes/')) {
    const body = notesAnswer(computer, u.pathname.slice('/api/v1/notes'.length), now);
    return body === undefined ? null : { status: 200, body };
  }
  return null;
}
