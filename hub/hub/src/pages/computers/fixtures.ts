// Fake-API states of the computers page for hub:dev, hub:shots, tests and specs. Every name comes
// from core's fixtureWorld (ONE FIXTURE WORLD): atlas is the current computer, the top bar's.
import { accountContainersRoute, answers, realmsFixture, routingNode, computerLifecycleRoute, portAddress, containersRoute, defineFixtures, freeTierRoute, fixtureSession, fixtureWorld, manyComputers, probeRoute, programRoutes, redeemRoute, reply, retrySetupRoute, setupFixtures, subsListRoute, type FixtureAnswer, type FixtureRequest, type FixtureRule, type WorldComputer } from '@core';
import { routes } from './routes';
import { serverDetailRoutes } from './parts/ServerDetail.data';
import { accessRoutes, egressRoutes } from './data';
import { resetSnapshotTakes, snapshotRules } from './snapshots/fixtures';
import { filesRules } from './snapshots/files-fixtures';
import { shareRules, storageRules } from '../files/fixtures.links';
import { kvmSetRoute } from '../vms/fixtures.links';
import { featureRoute } from './features';
import { firewallFixtureRules } from './parts/Firewall.fixtures';
import type { Computer, Project, Server, Subscription, Usage } from './types';
import type { OwnState } from './parts/access.logic';

const W = fixtureWorld;
/** 18 realm ids beyond the world's (createManyRealms). */
const MANY_REALMS = Array.from({ length: 18 }, (_, i) => (i + 0x30).toString(16).repeat(12));

/** Tests only: how many sessions/overview reads the desktopsLost, programsLost, desktopsDown and programsDown states failed. */
export const lostReads = { desktops: 0, programs: 0, desktopsDown: 0, programsDown: 0 };
export const projects: Project[] = W.projects.map((p) => ({ id: p.id, name: p.name }));

const SCOPES = ['computer', 'both', 'none'] as const;
// The API gives every computer a colour (#RRGGBB, random when none was picked).
// Computer colours are API data the page shows, not Hub colours (an allowed exception, exceptions.ts).
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'] as const;

// What the API says about each world server on a computer row (container-server-projection.ts): n12 is a whole machine
// rented through its subscription, fra-7 a paid slice whose subscription is overdue, ash-3 the free slice.
// An active subscription is paid ahead: the world's date moves on by whole 30-day periods until it is after today, so
// a paid server never reads "Was paid until" in a shot taken later (an overdue one keeps its past date on purpose).
const DAY_MS = 86_400_000;
function paidAhead(iso: string | null | undefined, state: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || state === 'overdue') return iso;
  const behind = Date.now() - t;
  return behind < 0 ? iso : new Date(t + (Math.floor(behind / (30 * DAY_MS)) + 1) * 30 * DAY_MS).toISOString();
}
const paidThrough = (server: string) => {
  const x = W.billing.subscriptions.find((y) => y.server === server);
  return x ? paidAhead(x.paidThrough, x.state) : null;
};
const PLACE: Record<string, Partial<NonNullable<Computer['server']>> & { disk: number }> = {
  n12: { datacenter: 'SIN-DC1', is_free: false, paid_subserver: false, expires_at: paidThrough('n12'), disk: 200 },
  'fra-7': { datacenter: 'FRA-DC2', is_free: false, paid_subserver: true, expires_at: paidThrough('fra-7'), disk: 80 },
  'ash-3': { datacenter: 'IAD-DC1', is_free: true, paid_subserver: false, expires_at: null, disk: 20 },
};
const FINGERPRINT = 'SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo';

function fromWorld(w: WorldComputer, i: number): Computer {
  const scope = SCOPES[i % 3] as (typeof SCOPES)[number];
  const { disk, ...place } = PLACE[w.server_name] ?? { disk: 40 };
  const key = i % 2 === 0;
  return {
    id: w.id,
    name: w.name,
    status: w.status,
    project_id: w.project_id,
    server_id: w.server_id,
    server_name: w.server_name,
    server: { ...w.server, ...place, specs: { cpu_cores: w.size.cpu, ram_gb: w.size.ram, disk_gb: disk } },
    realm_ids: [...w.realm_ids],
    has_proxy_permissions: scope !== 'none',
    proxy_permissions_scope: scope,
    ssh_hostname: `${w.name}.ssh.hoody.example`,
    ssh_public_key: key ? 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop' : '',
    ssh_key_fingerprint: key ? FINGERPRINT : null,
    ssh_key_installed_at: key ? w.created_at : null,
    snapshot_count: i === 0 ? 3 : i % 3,
    last_used_snapshot: null,
    proxy_domains_count: i === 0 ? 1 : 0,
    ai: true,
    hoody_kit: true,
    dev_kit: i % 2 === 0,
    kvm: false,
    autostart: true,
    ramdisk: i === 0,
    computer_image: w.computer_image,
    ...(w.comment ? { comment: w.comment } : {}),
    color: COLORS[i % COLORS.length] as string,
    created_at: w.created_at,
  };
}

export const computers: Computer[] = W.computers.map(fromWorld);
const withoutColor = ({ color: _color, ...c }: Computer): Computer => c;
const many: Computer[] = [...computers, ...manyComputers(52).map((w, i) => fromWorld(w, i + 8))];
// 51 computers, each in its own project that no list holds: one more than the by-id reads' bound (MISSING_READS).
export const missingIds51: readonly string[] = Array.from({ length: 51 }, (_, i) => (0x7a0000 + i).toString(16).padStart(24, '0'));
const missing51: Computer[] = missingIds51.map((pid, i) => ({ ...computers[0]!, id: (0x7b0000 + i).toString(16).padStart(24, '0'), name: `lone-${i}`, project_id: pid }));

const CAP = 8;
// The world's paid servers: n12 is a whole machine, fra-7 a slice of a shared host (ash-3 is the free slice).
const KIND: Record<string, Server['kind']> = { n12: 'metal', 'fra-7': 'subserver' };
// The servers' AI use: ash-3 shows every kind of lane, fra-7 is at its limit, n12's answer could not read it.
const SOON = new Date(Date.now() + 5 * 3600_000).toISOString();
/** Each AI usage read the fixtures answered (tests: list mode makes none). */
export const aiReads: number[] = [];
const aiUsage = (list: readonly Server[], truncated = false) =>
  ok({
    data: {
      truncated,
      servers: list
        .filter((v) => v.name !== 'old-1')
        .map((v) =>
          v.name === 'n12'
            ? { server: { id: v.id, name: v.name }, status: 'error' }
            : {
                server: { id: v.id, name: v.name },
                status: 'ok',
                as_of: SOON,
                lanes:
                  v.name === 'fra-7'
                    ? { chat: { status: 'ok', percent_used: 100, resets_at: SOON }, decisions: { status: 'ok', percent_used: 85 }, search: { status: 'ok', percent_used: 20 }, speech: { status: 'ok', percent_used: 0 }, transcription: { status: 'off' } }
                    : { chat: { status: 'ok', percent_used: 43, resets_at: SOON }, decisions: { status: 'ok', percent_used: 0 }, search: { status: 'ok', percent_used: 90 }, speech: { status: 'off' } },
              },
        ),
    },
  });
const servers: Server[] = W.servers.map((v) => ({
  id: v.id,
  name: v.name,
  place: v.city,
  cc: v.country,
  cpu: v.cpu,
  ram: v.ram,
  disk: v.disk,
  free: v.free,
  kind: v.free ? 'free' : (KIND[v.name] ?? null),
  days: v.days,
  status: v.status,
  cap: { used: W.computers.filter((c) => c.server_id === v.id).length, max: CAP },
}));
/** The three groups plus a server whose answer does not say what it is (Other servers). */
const kindServers: Server[] = [...servers, { ...(servers[0] as Server), id: '5e0000000000000000000099', name: 'old-1', place: 'Oslo', cc: 'NO', kind: null, days: 9, cap: null }];
/** 18 rented servers for the long Servers list: the world's three, then more in the same cities. */
const manyServers: Server[] = [
  ...servers,
  ...Array.from({ length: 15 }, (_, i): Server => {
    const like = servers[i % servers.length] as Server;
    return { ...like, id: (0x5e1000 + i).toString(16).padStart(24, '0'), name: `${like.name.replace(/-?\d+$/, '')}-${20 + i}`, free: false, days: 2 + ((i * 7) % 40), cap: null };
  }),
];

const subs: Subscription[] = W.billing.subscriptions.map((x) => ({
  id: x.id,
  state: x.state === 'overdue' ? 'past_due' : x.state,
  plan: { title: W.billing.plans.find((p) => p.id === x.plan)?.title ?? '' },
  server_name: x.server,
  paid_through: paidAhead(x.paidThrough, x.state) ?? x.paidThrough,
  auto_renew: x.autoRenew,
}));
// A full page of subscriptions (the page reads 50): the world's two, then made-up ones on other servers.
const subsPage: Subscription[] = Array.from({ length: 50 }, (_, i) => subs[i] ?? { ...subs[0]!, id: `sub_pad${i}`, server_name: `pad-${i}` });

const usage: Record<string, Usage | null> = Object.fromEntries(
  computers.map((c, i) => [
    c.id,
    c.status === 'running'
      ? // Raw numbers as the API sends them (a CPU of 0.128…%, gigabytes from bytes): the page rounds them.
        { cpu: i === 0 ? 0.12884237357487155 : 8 + ((i * 17) % 70) + 0.4615384615, mem: { used: 1.1734 + (i % 4), total: 6 }, disk: { used: 4.2871 + i, total: 40 }, at: '2026-10-23T08:58:00Z', started: new Date(W.now - (2 * 86400 + 3 * 3600 + i * 600) * 1000).toISOString(), processes: 40 + i * 7 }
      : null,
  ]),
);

const runtime: Record<string, unknown> = Object.fromEntries(
  computers.map((c) => [
    c.id,
    {
      network_services: [
        { port: 3000, program: 'node', protocol: 'tcp', ip: '0.0.0.0' },
        { port: 5432, program: 'postgres', protocol: 'tcp', ip: '127.0.0.1' },
        { port: 8080, program: 'caddy', protocol: 'tcp', ip: '0.0.0.0' },
        // Hoody's own listeners carry their exe path: a system name alone would be the person's own program (computerRuntime isSystem).
        { port: 22, program: 'sshd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/sbin/sshd', args: '/usr/sbin/sshd -D' },
        { port: 7681, program: 'ttyd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/bin/ttyd', args: '/usr/bin/ttyd -p 7681' },
      ],
      terminals: [{}, {}],
      displays: [{}],
    },
  ]),
);

const GB = 1024 ** 3;
/** The terminal program's session list, in its wire shape (the Desktop tab keeps only the desktop numbers). */
const desktopSessions = [
  { terminal_id: '1', desktop_mode: false, display_id: null, command_history: ['ls'] },
  { terminal_id: '1601', desktop_mode: true, display_id: 1601, command_history: ['startxfce4'], incarnation: '0123456789abcdef0123456789abcdef' },
  { terminal_id: '1603', desktop_mode: true, display_id: 1603, command_history: [], incarnation: 'fedcba9876543210fedcba9876543210' },
];

/** The daemon's overview, in its wire shape (what the page reads through programsOf). */
const overview = {
  programs: [
    { id: 1, name: 'web', hoody_kit: false, status: 'running', boot: true, uptime_s: 266400, instances: [{ port: 3000, status: 'running', uptime_s: 266400 }] },
    { id: 2, name: 'worker', hoody_kit: false, status: 'fatal', boot: true, instances: [] },
    { id: 3, name: 'cron-sync', hoody_kit: false, status: 'stopped', boot: false, instances: [] },
    { id: 4, name: 'hoody-terminal', hoody_kit: true, status: 'running', boot: true, uptime_s: 900000, instances: [{ port: 7681, status: 'running', uptime_s: 900000 }] },
    { id: 5, name: 'hoody-agent', hoody_kit: true, status: 'running', boot: true, uptime_s: 900000, instances: [{ port: 45, status: 'running', uptime_s: 900000 }] },
    { id: 6, name: 'hoody-files', hoody_kit: true, status: 'running', boot: true, uptime_s: 900000, instances: [{ port: 8081, status: 'running', uptime_s: 900000 }] },
  ],
};

const aliasRows = [{ id: 'al1', alias: 'shop', url: 'https://shop.example.test', index: 3000, created_at: '2026-10-20T10:00:00Z' }];

const cidOf = (r: FixtureRequest): string => /\/computers\/([^/?]+)/.exec(r.path)?.[1] ?? '';
const ok = (body: unknown = {}): FixtureAnswer => answers.ok(body);
// cwd: the folder the terminal program reports it ran in (it echoes the folder it used); left out when undefined.
const run = (o: { code: number; out: string; err: string; ms: number; cwd?: string }) =>
  ok({ mode: 'raw', completion: 'exited', exit_code: o.code, signal: '', duration_ms: o.ms, stdout_b64: btoa(o.out), stderr_b64: btoa(o.err), stdout_truncated: false, stderr_truncated: false, ...(o.cwd === undefined ? {} : { cwd: o.cwd }) });
const ran = { code: 0, out: 'Linux atlas 6.8.0 #1 SMP x86_64 GNU/Linux\n', err: '', ms: 312 };

/** The Features switches a 200 answered (ai, ramdisk, autostart, kvm), per computer id: the list shows them from then
 *  on, so a press ends proven. Tests empty it. */
export const featureLanded: Record<string, Record<string, boolean>> = {};
const landFeature = (r: FixtureRequest, a: FixtureAnswer): FixtureAnswer => {
  if ('status' in a && a.status === 200 && r.body && typeof r.body === 'object') {
    const on = Object.fromEntries(Object.entries(r.body as Record<string, unknown>).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'));
    featureLanded[cidOf(r)] = { ...featureLanded[cidOf(r)], ...on };
  }
  return a;
};
const list = (rows: readonly Computer[]) =>
  reply(containersRoute, () => ok({ data: { computers: rows.map((c) => ({ ...c, ...featureLanded[c.id], ...(desktopReads.status[c.id] ? { status: desktopReads.status[c.id] } : {}) })) } }), { when: (r) => r.query.include_expired !== 'true' });
const rentals = (v: readonly Server[]) =>
  v.map((x) => ({
    server_id: x.id,
    server: { id: x.id, name: x.name, city: x.place, country: x.cc, specs: { cpu_cores: x.cpu, ram_gb: x.ram, disk_gb: x.disk }, ...(x.kind === null ? {} : { is_vm: x.kind !== 'metal' }) },
    is_free_tier: x.free,
    remaining_days: x.days,
    status: x.status,
  }));
/** The rentals with the first server a slice that reports its room (computer_capacity), as the strip's slots read it. */
const withRoom = (used: number, max: number) =>
  rentals(servers).map((r, i) => (i === 0 ? { ...r, server: { ...r.server, is_vm: true, computer_capacity: { used, max } } } : r));
const statsOf = (id: string) => {
  const u = usage[id];
  if (!u) return ok({ data: null });
  return ok({ data: { started_at: u.started ?? null, processes: u.processes ?? null, cpu: { usage_percent: u.cpu }, memory: { usage: (u.mem?.used ?? 0) * GB, total: (u.mem?.total ?? 0) * GB }, disk: { root: { usage: (u.disk?.used ?? 0) * GB, total: (u.disk?.total ?? 0) * GB } } } });
};

type Mut = 'lifecycle' | 'rename' | 'setColour' | 'setRealms' | 'setSshKey' | 'copy' | 'remove' | 'removeBase' | 'create' | 'execute' | 'programStart' | 'programStop' | 'programRestart' | 'programBoot' | 'aliasCreate' | 'aliasRemove' | 'aliasEdit' | 'redeem' | 'retrySetup' | 'projectCreate' | 'projectUpdate' | 'projectRemove' | 'displayStop' | 'desktopEnd' | 'feature' | 'kvmSet';
const mutationRoutes: Record<Mut, Parameters<typeof reply>[0]> = {
  lifecycle: computerLifecycleRoute,
  rename: routes.rename,
  setColour: routes.setColour,
  setRealms: routes.setRealms,
  setSshKey: routes.setSshKey,
  copy: routes.copy,
  remove: routes.remove,
  removeBase: routes.removeBase,
  create: routes.create,
  execute: routes.execute,
  programStart: programRoutes.start,
  programStop: programRoutes.stop,
  programRestart: programRoutes.restart,
  programBoot: programRoutes.boot,
  aliasCreate: routes.aliasCreate,
  aliasRemove: routes.aliasRemove,
  aliasEdit: routes.aliasEdit,
  redeem: redeemRoute,
  retrySetup: retrySetupRoute,
  projectCreate: routes.projectCreate,
  projectUpdate: routes.projectUpdate,
  projectRemove: routes.projectRemove,
  displayStop: routes.displayStop,
  desktopEnd: routes.desktopEnd,
  // The Overview's Features switches: Hoody AI, RAM disk, Autostart (one PUT of one key) and KVM (the VMs page's PUT).
  feature: featureRoute,
  kvmSet: kvmSetRoute,
};
/** Stop desktop's sends (the display stop, then the session's end) as they were sent, for tests; tests empty it. */
/** `framed`: a desktop frame was on the page when the send left (Stop takes the frame away first), as desktopFrameProbe
 *  reads it. */
export const desktopSends: { method: string; path: string; query: unknown; framed: boolean }[] = [];
/** Whether a desktop frame is on the page as a display stop or session end leaves. The default reads no global: a terminal
 *  test runs where `document` is a trap. The web test that asserts `framed` sets it to its DOM check. */
export const desktopFrameProbe = { framed: (): boolean => false };
/** The session paths whose DELETE was answered 200 (they leave the session list); tests empty it. */
export const desktopEnded = new Set<string>();
/** Tests' knobs for the Desktop tab, emptied by tests: `delayNext` (ms) delays the next session list answer (its body
 *  is the list when the request came in), `inc` gives a session another incarnation (opened again), `status` a
 *  computer (by id) another status in the computers list. `asked` counts the session list requests (a read seen sent). */
export const desktopReads: { delayNext: number; inc: Record<string, string>; status: Record<string, string>; asked: number } = { delayNext: 0, inc: {}, status: {}, asked: 0 };
/** Project changes as they were sent (method, path, query, body), and the single-project reads of a check, for tests. */
export const projectSends: { method: string; path: string; query: unknown; body: unknown }[] = [];
/** Every project request in order (the delete dialog's reads and sends as one trace), for tests; tests empty it. */
export const projectTrace: string[] = [];
/** The same reads and changes in one ordered list, each whole (method, path, query, body): counts too. */
export const projectCalls: { method: string; path: string; query: unknown; body: unknown }[] = [];
const called = (r: FixtureRequest) => projectCalls.push({ method: r.method, path: r.path, query: r.query, body: r.body ?? null });
const recorded = (a: FixtureAnswer) => (r: FixtureRequest): FixtureAnswer => (projectTrace.push(`${r.method} ${r.path}`), called(r), projectSends.push({ method: r.method, path: r.path, query: r.query, body: r.body }), a);
/** SSH key changes as they were sent (path, body), for tests; tests empty it. */
export const sshKeySends: { path: string; body: unknown }[] = [];
/** The one API body refusal this fixture models on a key change (the API's own check):
 *  an empty or blank key is a 400, never a removal (only null removes). A body without the field changes nothing there
 *  and is not refused, so it is not refused here either. Other key checks (format, in use) are the states' own. */
const sshKeyBodyProblem = (body: unknown): FixtureAnswer | null => {
  const v = typeof body === 'object' && body !== null ? (body as { ssh_public_key?: unknown }).ssh_public_key : undefined;
  return typeof v === 'string' && v.trim() === '' ? answers.refused(400, 'BAD_REQUEST') : null;
};
/** Colour changes as they were sent (path, body), for tests; tests empty it. */
export const colourSends: { path: string; body: unknown }[] = [];
// colourLanded: a colour send that went through although its answer was lost (state colourLanded, setColour answers
// unknown). Once `shown` (true unless a test lowers it), this realm's list shows the last sent colour, or `as` in its
// place, on the computer it was sent for, or on the computer named `on` instead (a read that proves nothing).
export const colourLanded: { shown: boolean; as?: string; on?: string } = { shown: true };
const colourLandedList = (): FixtureRule =>
  reply(containersRoute, () => {
    const s = colourLanded.shown ? colourSends.at(-1) : undefined;
    const sentFor = s ? decodeURIComponent(s.path.split('/')[2] ?? '') : '';
    const to = colourLanded.on ?? sentFor;
    const color = colourLanded.as ?? (s?.body as { color?: string } | undefined)?.color;
    return ok({ data: { computers: computers.map((c) => (s && c.id === to && color ? { ...c, color } : c)) } });
  }, { when: (r) => r.query.include_expired !== 'true' });
/** Copies as they were sent (the body), for tests. */
export const copySends: unknown[] = [];
/** The Run tab's runs as they were sent (the body), for tests. */
export const execSends: unknown[] = [];
/** Tests: while `wait` is set, every run's answer waits for it (`open` lets it through). */
export const execGate: { wait?: Promise<void>; open?: () => void } = {};
// A run's answer: the state's own, else a finished run in the folder that was sent.
const execAnswer = (a: FixtureAnswer | undefined) => async (r: FixtureRequest): Promise<FixtureAnswer> => {
  execSends.push(r.body);
  if (execGate.wait) await execGate.wait;
  return a ?? run({ ...ran, cwd: String((r.body as { cwd?: unknown } | null)?.cwd ?? '') });
};
/** Computer deletes as they were sent (the route's scope: 'realm' for the list's delete, 'base' for an expired computer's
 *  from a project's Computers tab), for tests; tests empty it. In a state with `projectRows` a sent delete takes the row
 *  away (from the project's list, its count and the computer's own read), unless `computerRead` is 'there'. */
export const removeSends: { scope: string; id: string }[] = [];
/** A project's list row: a computer with the API's expiry fields and its default flag. */
export type ProjectRow = Computer & { server_expired?: boolean; server_expired_reason?: string; is_default?: boolean };
/** Realm changes as they were sent (computer id, body), in the import states only, for tests. */
export const realmSends: { id: string; body: unknown }[] = [];
// An empty realm whose account has computers elsewhere. The account-wide list answers every realm's
// computers (setup's one-row check reads it too, so "elsewhere" holds), fjord in no realm (it shows in every realm, so
// it is never offered); `importList` replaces only the picker's 100-row read. The realm change is recorded and
// answers as given.
// landed: a realm send that did go through although its answer was lost: once `importLanded.shown` (true from the
// start unless a test lowers it), this realm's list and the computer's own read show the sent computer with exactly the
// sent realms (core's read-back proves it). Before that, both show it as it was. `read` overrides the computer's own
// read in every import state: 'fail' answers 500, 'malformed' a realm list with a non-id in it, a list is the
// computer's realms as moved since, `slow` that list after `ms` (tests set it).
export const importLanded: { shown: boolean; read?: 'fail' | 'malformed' | string[] | { slow: string[]; ms: number } } = { shown: true };
const landedRealms = (id: string, was: string[]): string[] => {
  const s = realmSends.at(-1);
  return importLanded.shown && s && s.id === id ? ((s.body as { realm_ids?: string[] } | undefined)?.realm_ids ?? []) : was;
};
const importState = (importList?: FixtureAnswer | ((r: FixtureRequest) => FixtureAnswer), setRealms: FixtureAnswer = ok({}), o: { landed?: boolean } = {}): FixtureRule[] => [
  ...(importList ? [reply(accountContainersRoute, importList, { when: (r: FixtureRequest) => String(r.query.limit) === '100' })] : []),
  ...(o.landed
    ? [reply(containersRoute, () => {
        const s = importLanded.shown ? realmSends.at(-1) : undefined;
        return ok({ data: { computers: s ? computers.filter((c) => c.id === s.id).map((c) => ({ ...c, realm_ids: landedRealms(c.id, c.realm_ids ?? []) })) : [] } });
      }, { when: (r) => r.query.include_expired !== 'true' })]
    : []),
  reply(routes.read, (r: FixtureRequest) => {
    const id = decodeURIComponent(r.path.split('/')[2] ?? '');
    const c = computers.find((x) => x.id === id);
    const read = importLanded.read;
    if (read === 'fail') return answers.refused(500, 'SERVER_ERROR');
    if (c && read === 'malformed') return ok({ data: { id, realm_ids: [c.realm_ids?.[0] ?? '', 5] } });
    if (c && Array.isArray(read)) return ok({ data: { id, realm_ids: read } });
    if (c && typeof read === 'object' && 'slow' in read) return answers.slow({ data: { id, realm_ids: read.slow } }, read.ms);
    return c ? ok({ data: { id, realm_ids: o.landed ? landedRealms(id, c.realm_ids ?? []) : c.realm_ids } }) : answers.refused(404, 'NOT_FOUND');
  }),
  reply(accountContainersRoute, ok({ data: { computers: computers.map((c) => (c.name === 'fjord' ? { ...c, realm_ids: [] } : c)), pagination: { totalPages: 1 } } })),
  reply(routes.setRealms, (r: FixtureRequest) => (realmSends.push({ id: decodeURIComponent(r.path.split('/')[2] ?? ''), body: r.body }), setRealms)),
  ...base({ computers: [], zero: 'empty' }),
];
const mutations = (over: Partial<Record<Mut, FixtureAnswer>> = {}): FixtureRule[] =>
  (Object.keys(mutationRoutes) as Mut[]).map((k) => {
    const a = over[k] ?? (k === 'aliasCreate' ? ok({ data: aliasRows[0] }) : ok({}));
    return reply(mutationRoutes[k], k === 'execute' ? execAnswer(over.execute) : k.startsWith('project') ? recorded(a) : k === 'remove' || k === 'removeBase' ? (r: FixtureRequest) => (removeSends.push({ scope: r.route.scope, id: cidOf(r) }), a) : k === 'feature' || k === 'kvmSet' ? (r: FixtureRequest) => landFeature(r, a) : k === 'setColour' ? (r: FixtureRequest) => (colourSends.push({ path: r.path, body: r.body }), a) : k === 'setSshKey' ? (r: FixtureRequest) => (sshKeySends.push({ path: r.path, body: r.body }), sshKeyBodyProblem(r.body) ?? a) : k === 'copy' ? (r: FixtureRequest) => (copySends.push(r.body), a) : k === 'displayStop' || k === 'desktopEnd' ? (r: FixtureRequest) => (desktopSends.push({ method: r.method, path: r.path, query: r.query, framed: desktopFrameProbe.framed() }), k === 'desktopEnd' && 'status' in a && a.status === 200 && desktopEnded.add(r.path), a) : a);
  });

/** The realm list reads state listEmptyThenMalformed answered since the last reset (the first is the empty list); a test
 *  using the state sets n = 0 before it renders. */
export const listReads = { n: 0 };
interface Opts { desktopEnvs?: unknown; desktopSessions?: unknown; projectsLater?: { keep: readonly number[] }; listLater?: { drop: number }; projectReadLater?: { place: number; name: string; color: string }; subs?: { rows?: readonly Subscription[]; total?: number | 'none' | 'text'; malformed?: boolean }; listAddsCreated?: boolean; createdListHeld?: boolean; memberWrite?: 'lost' | 'lostApplied' | 'lostLate' | 'exists' | 'notFound' | 'refused' | 'gone'; members?: 'people' | 'peopleFull' | 'peopleLab' | 'peopleLab7' | 'peopleLabCut' | 'peopleMember' | 'labAsread' | 'labAsedit' | 'labAsdelete' | 'peopleOdd' | 'peopleUnknownOnly' | 'peopleNoTotal' | 'people250' | 'people1200' | 'fail'; memberPageFails?: number; projectRules?: keyof typeof PROJECT_DOCS | 'fail' | 'level' | 'hold'; computers?: readonly Computer[]; apiCount?: readonly Computer[]; countDown?: boolean; projectRead?: 'gone' | 'goneSlow' | 'there' | 'thereSlow' | 'down'; listDropsDeleted?: boolean; countLateZero?: boolean; countZeroFor?: number; countSlowAt?: number; servers?: readonly Server[]; zero?: Parameters<typeof setupFixtures>[0]; failedSetup?: boolean; myIp?: string; accessGroup?: string; freshScope?: string; accessOnce?: boolean; realmProjects?: readonly number[]; projectReadHangs?: boolean; projectReadMoves?: boolean; projectsSlowLater?: boolean; accessShut?: boolean; accessPut?: 'stale' | 'lost' | 'lostApplied' | 'lostLate' | 'lostOther'; scopeLateAfterWrite?: boolean; accessStepLost?: { at: number; applied: boolean }; accessStepStale?: number; accessStepSlow?: number; accessWildOld?: boolean; accessReadFails?: { after: number; reads: number }; accessStepVersioned?: boolean; accessStepLostLate?: number; accessStepForeignAfter?: number; accessStepStaleOther?: number; own?: OwnState; accessClear?: 'stale' | 'lost' | 'lostApplied' | 'lostLate' | 'lostOther' | 'lostRecreate' | 'doneRecreate' | 'doneThenFail'; projectPut?: 'stale' | 'lost' | 'lostApplied' | 'lostLate' | 'lostOther'; projectOwn?: readonly string[]; projectListFails?: boolean; projectListTotal?: number; projectListRefused?: boolean; projectListMalformed?: 'row' | 'status' | 'total'; listMalformed?: boolean | 'afterEmpty'; projectRows?: readonly ProjectRow[]; computerRead?: 'gone' | 'there' | 'down'; }
// Each computer's access rules, by its place in the list (as its proxy_permissions_scope): 0 the drawer's own
// "only my IP" document, 1 rules set elsewhere (a password group and a hook; its project has rules too), 2 none
// yet (the open default, version 0). The password is in the answer, as the API gives it: the page must drop it.
// accessOnce: the first read answers, every later one fails (a re-read on reopening that does not come back).
// accessShut: place 2 is the shut document instead (default deny, nothing else: Private).
const accessReads = (o: Opts) => {
  let n = 0;
  const read = (r: FixtureRequest): FixtureAnswer => {
    accessReadCount.n++;
    // own: a computer that keeps no document, or a stored open one, reads as the API gives it (the API's
    // default document at version 0, or the open document it stores), so its rules agree with its own document state.
    const id = cidOf(r);
    // A missing document answers `default: inherit` (the project's applies), as the API does.
    if ((o.own === 'missing' || o.own === 'default') && !accessStore.has(id)) accessStore.set(id, { doc: { groups: {}, permissions: {}, default: o.own === 'missing' ? 'inherit' : 'allow' }, version: o.own === 'missing' ? 0 : 3 });
    if (accessReadFailLeft.n > 0) {
      accessReadFailLeft.n--;
      return answers.refused(500, 'SERVER_ERROR');
    }
    return o.accessOnce && n++ > 0 ? answers.refused(500, 'SERVER_ERROR') : accessDoc(cidOf(r), o.accessGroup, o.accessShut);
  };
  // accessReadHold: parked until released, then answered as at that moment.
  return (r: FixtureRequest): FixtureAnswer | Promise<FixtureAnswer> =>
    accessReadHold.on ? new Promise((done) => accessReadHold.parked.push(() => done(read(r)))) : read(r);
};
/** Access writes as they were sent (computer, If-Match, body), for tests; `resetAccess()` empties it and the
 *  written documents (states are built once, so each test starts from the fixture documents). */
export const accessSends: { id: string; ifMatch: string | undefined; body: unknown }[] = [];
const accessStore = new Map<string, { doc: Record<string, unknown>; version: number }>();
// A write the API has taken but not stored yet (lostLate): it lands once `reads` more reads have answered.
const accessLate = new Map<string, { doc: Record<string, unknown>; version: number; reads: number }>();
export function resetAccess(): void {
  accessSends.length = 0;
  accessStepSends.length = 0;
  accessReadFailLeft.n = 0;
  accessReadFailLeft.gen++;
  accessReadCount.n = 0;
  accessReadHold.on = false;
  for (const release of accessReadHold.parked.splice(0)) release();
  accessStore.clear();
  accessLate.clear();
  clearSends.length = 0;
  accessOwnStore.clear();
  clearLate.clear();
  accessOwnFails.on = false;
  accessOwnSlow.ms = 0;
  delete accessOwnSlow.left;
  accessOwnHold.on = false;
  for (const release of accessOwnHold.parked.splice(0)) release();
  projectRulesSwap.to = null;
  projectRulesStore.clear();
  projectRulesLate.clear();
  projectRulesSends.length = 0;
  projectListReads.length = 0;
  projectListQueries.length = 0;
  projectRulesFails.on = false;
  projectRulesElsewhere.to = null;
  delete projectRulesElsewhere.doc;
  projectPutNext.length = 0;
  myIpServer.fail = false;
  myIpServer.ip = null;
  projectListServer.hold = false;
  projectListServer.own = null;
  for (const release of projectListServer.parked.splice(0)) release();
}
// A computer's own access state (proxy_permissions_computer_state, the computer's own document: missing/default/applied/invalid/
// unknown) is in the Hoody API but not in the API copy these fixtures model, so the fixtures model it: GET /computers/:id answers it
// only when the state names `own` (or after a clear), as an API with that state does. Clears as they were sent, for tests.
export const clearSends: { id: string; ifMatch: string | undefined }[] = [];
const accessOwnStore = new Map<string, OwnState>();
// A clear the API has taken but not stored yet (lostLate): it lands once that many more state reads have answered.
const clearLate = new Map<string, { n: number; version: number }>();
/** Tests: while on, GET /computers/:id answers 500 (the state and scope reads fail). */
export const accessOwnFails = { on: false };
/** Tests: GET /computers/:id answers `ms` late (0: at once); with `left` set, only the next `left` answers are. */
export const accessOwnSlow: { ms: number; left?: number } = { ms: 0 };
/** Tests: while `on`, GET /computers/:id answers only when its release in `parked` is called (read at that moment). */
export const accessOwnHold: { on: boolean; parked: Array<() => void> } = { on: false, parked: [] };
/** Tests: the first project's access rules read as this PROJECT_DOCS entry from now on (another tab changed them). */
export const projectRulesSwap: { to: 'rulesIp' | 'rulesSecret' | 'rulesOpenStored' | null } = { to: null };
// Project rules writes, as the API takes them. The written documents by project (their reads answer them), a
// write the API has taken but not stored yet (lostLate: it lands once that many more rules reads have answered), and
// the writes as they were sent, for tests (resetAccess empties all three).
const projectRulesStore = new Map<string, { doc: Record<string, unknown>; version: number }>();
const projectRulesLate = new Map<string, { doc: Record<string, unknown>; version: number; reads: number }>();
export const projectRulesSends: { method: string; pid: string; ifMatch: string | undefined; body: unknown }[] = [];
/** Project computer list reads (not counts) as they were sent (the project id), for tests (resetAccess empties it). */
export const projectListReads: string[] = [];
/** The same list reads' whole query (page, limit, include_expired, include_deleting), for tests. */
export const projectListQueries: Record<string, string>[] = [];
/** Tests: while `hold`, a list read answers only when its release in `parked` is called (with the rows it read when it
 *  arrived); `own`
 *  replaces the state's projectOwn from now on (a computer's own rules changed meanwhile). */
export const projectListServer: { hold: boolean; parked: Array<() => void>; own: readonly string[] | null } = { hold: false, parked: [], own: null };
/** Tests: while on, the project rules read answers 500. */
export const projectRulesFails = { on: false };
/** Tests: the first project's next rules read finds this PROJECT_DOCS entry (or `doc`) stored by another tab, one
 *  version on. */
export const projectRulesElsewhere: { to: keyof typeof PROJECT_DOCS | null; doc?: Record<string, unknown> } = { to: null };
/** Tests: the next project rules writes answer these, one each, before the state's projectPut ('refused': a 403). */
export const projectPutNext: Array<NonNullable<Opts['projectPut']> | 'refused'> = [];
/** Tests: the address read fails while `fail`; `ip` replaces the state's address from now on (the person moved). */
export const myIpServer: { fail: boolean; ip: string | null } = { fail: false, ip: null };
const PROJECT_OPEN = { groups: {}, permissions: {}, default: 'allow', enable_proxy: true };
const projectRulesVersion = (pid: string, o: Opts): number => {
  const w = projectRulesStore.get(pid);
  if (w) return w.version;
  const named = projectRulesSwap.to ?? (o.projectRules && o.projectRules in PROJECT_DOCS ? o.projectRules as keyof typeof PROJECT_DOCS : null);
  return named && pid === W.projects[0]!.id ? PROJECT_DOCS[named].file_version : 0;
};
// PUT and DELETE …/projects/:pid/proxy/permissions as the API does: If-Match must name the current version (412
// otherwise); a PUT stores the body, a DELETE leaves the open document; either moves the version on one (the API's
// version floor). projectPut: 'stale' answers 412; 'lost' loses the answer and writes nothing; 'lostApplied' writes,
// then loses the answer; 'lostLate' loses the answer and writes after two more reads; 'lostOther' loses the answer,
// writes nothing, and another tab stores Private over the same version.
const projectRulesWrites = (o: Opts) => (r: FixtureRequest): FixtureAnswer => {
  const pid = r.path.split('/')[2] ?? '';
  projectRulesSends.push({ method: r.method, pid, ifMatch: r.ifMatch, body: r.body });
  const put = projectPutNext.length ? projectPutNext.shift() : o.projectPut;
  if (put === 'refused') return answers.refused(403, 'INSUFFICIENT_PERMISSIONS');
  if (put === 'lost') return answers.lost();
  const now = projectRulesVersion(pid, o);
  if (put === 'stale' || r.ifMatch !== `file:v${now}`) return answers.refused(412, 'PRECONDITION_FAILED');
  const doc = r.method === 'DELETE' ? PROJECT_OPEN : (r.body as Record<string, unknown>);
  if (put === 'lostLate') {
    projectRulesLate.set(pid, { doc, version: now + 1, reads: 2 });
    return answers.lost();
  }
  if (put === 'lostOther') {
    projectRulesStore.set(pid, { doc: { groups: {}, permissions: {}, default: 'deny' }, version: now + 1 });
    return answers.lost();
  }
  projectRulesStore.set(pid, { doc, version: now + 1 });
  return put === 'lostApplied' ? answers.lost() : ok({ data: { project: pid, file_version: now + 1 } });
};
const ownOf = (id: string, o: Opts): OwnState | undefined => {
  const late = clearLate.get(id);
  if (late && late.n <= 0) {
    clearLate.delete(id);
    accessOwnStore.set(id, 'missing');
    accessStore.set(id, { doc: { groups: {}, permissions: {}, default: 'inherit' }, version: late.version });
  } else if (late) clearLate.set(id, { ...late, n: late.n - 1 });
  return accessOwnStore.get(id) ?? o.own;
};
// DELETE …/proxy/permissions as the API does: If-Match must name the current version (412 otherwise); the computer
// then keeps no document of its own (state missing; its rules read as the API's default) and the version moves on
// one (the API keeps a version floor, so a document written later continues the sequence). accessClear:
// 'stale' answers 412; 'lost' loses the answer and deletes nothing; 'lostApplied' deletes, then loses the answer;
// 'lostLate' loses the answer and deletes only after two more state reads; 'lostOther' loses the answer, deletes
// nothing, and another tab writes "Anyone" one version on; 'lostRecreate' deletes, loses the answer, and another tab
// writes a new document of the computer's own (two versions on); 'doneRecreate' deletes and answers, and another tab
// at once writes a new document of the computer's own (two versions on); 'doneThenFail' deletes and answers, then
// the state reads fail (accessOwnFails) until a test turns them back on.
const accessClears = (o: Opts) => (r: FixtureRequest): FixtureAnswer => {
  const id = cidOf(r);
  clearSends.push({ id, ifMatch: r.ifMatch });
  if (o.accessClear === 'lost') return answers.lost();
  const now = accessVersion(id, o.accessShut);
  if (o.accessClear === 'stale' || r.ifMatch !== `file:v${now}`) return answers.refused(412, 'PRECONDITION_FAILED');
  if (o.accessClear === 'lostLate') {
    clearLate.set(id, { n: 2, version: now + 1 });
    return answers.lost();
  }
  if (o.accessClear === 'lostOther') {
    accessStore.set(id, { doc: { groups: {}, permissions: {}, default: 'allow' }, version: now + 1 });
    // The API classes a stored open document as default (classifyProxyDoc).
    accessOwnStore.set(id, 'default');
    return answers.lost();
  }
  if (o.accessClear === 'lostRecreate') {
    accessStore.set(id, { doc: { groups: {}, permissions: {}, default: 'deny' }, version: now + 2 });
    accessOwnStore.set(id, 'applied');
    return answers.lost();
  }
  if (o.accessClear === 'doneRecreate') {
    accessStore.set(id, { doc: { groups: {}, permissions: {}, default: 'deny' }, version: now + 2 });
    accessOwnStore.set(id, 'applied');
    return ok({ data: { container: id } });
  }
  accessOwnStore.set(id, 'missing');
  accessStore.set(id, { doc: { groups: {}, permissions: {}, default: 'inherit' }, version: now + 1 });
  if (o.accessClear === 'doneThenFail') accessOwnFails.on = true;
  return o.accessClear === 'lostApplied' ? answers.lost() : ok({ data: { container: id } });
};
// PUT …/proxy/permissions as the API does: If-Match must name the current version (412 otherwise), a write
// bumps it. accessPut: 'stale' answers 412 whatever was sent; 'lost' loses the answer and writes nothing;
// 'lostApplied' writes, then loses the answer. 'lostLate' loses the answer and stores the write only after two
// more reads (a PUT still on its way when the first read answers). 'lostOther' loses the answer, writes nothing,
// and another writer stores a different document (Only my IP from 198.51.100.9) over the same version.
const accessWrites = (o: Opts) => (r: FixtureRequest): FixtureAnswer => {
  const id = cidOf(r);
  accessSends.push({ id, ifMatch: r.ifMatch, body: r.body });
  if (o.accessPut === 'lost') return answers.lost();
  const now = accessVersion(id, o.accessShut);
  if (o.accessPut === 'stale' || r.ifMatch !== `file:v${now}`) return answers.refused(412, 'PRECONDITION_FAILED');
  if (o.accessPut === 'lostLate') {
    accessLate.set(id, { doc: r.body as Record<string, unknown>, version: now + 1, reads: 2 });
    return answers.lost();
  }
  if (o.accessPut === 'lostOther') {
    accessStore.set(id, { doc: { ...(r.body as Record<string, unknown>), groups: { 'hub-my-ip': { type: 'ip', range: '198.51.100.9/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' }, version: now + 1 });
    return answers.lost();
  }
  accessStore.set(id, { doc: r.body as Record<string, unknown>, version: now + 1 });
  return o.accessPut === 'lostApplied' ? answers.lost() : ok({ data: { file_version: now + 1 } });
};
const accessVersion = (id: string, shut = false): number => {
  const w = accessStore.get(id);
  if (w) return w.version;
  const i = computers.findIndex((c) => c.id === id) % 3;
  return i === 0 ? 4 : i === 1 ? 9 : shut ? 2 : 0;
};
const accessDoc = (id: string, group = 'team', shut = false): FixtureAnswer => {
  const late = accessLate.get(id);
  if (late && late.reads-- <= 0) {
    accessLate.delete(id);
    accessStore.set(id, { doc: late.doc, version: late.version });
  }
  return ok({ data: accessData(id, group, shut) });
};
const accessData = (id: string, group = 'team', shut = false): Record<string, unknown> => {
  const w = accessStore.get(id);
  if (w) return { ...w.doc, file_version: w.version, etag: `file:v${w.version}` };
  const i = computers.findIndex((c) => c.id === id) % 3;
  const head = { project: computers.find((c) => c.id === id)?.project_id ?? '', container: id };
  if (i === 0) return { ...head, groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny', file_version: 4, etag: 'file:v4' };
  if (i === 1) {
    return { ...head, groups: { [group]: { type: 'password', password: 'fixture-password-not-shown' } }, permissions: { [group]: { terminal: [1], files: true, http: 8080, https: '8000-8100' } }, default: 'deny', hooks: { terminal: [{ url: 'https://hooks.example/t' }] }, file_version: 9, etag: 'file:v9' };
  }
  // Version 0: no document of its own, so `default: inherit` (the project's applies).
  return { ...head, groups: {}, permissions: {}, default: shut ? 'deny' : 'inherit', file_version: shut ? 2 : 0, etag: shut ? 'file:v2' : 'file:v0' };
};
// The people-or-keys step writes (group, program rule, default, group delete) as the API does them: If-Match must
// name the current version (412 otherwise), a write bumps it and answers the whole stored document, credentials
// included (the page must drop them). A program rule needs its group (404) and a known program; '*' takes only
// true or false (422 otherwise, as the API does). accessWildOld: '*' is an unknown program (400), as on an API from
// before the single-rule write took it. accessStepLost: that step send (from 1) loses its answer, having
// written (`applied`) or not. accessStepStale: that send answers 412 (changed elsewhere). accessStepSlow: that send
// is written at once and answers 1.5 s later. The answers carry no file_version, as the API's step answers do (their
// answer schema leaves it out); accessStepVersioned: they carry it. accessReadFails: after that send (from 1), the
// next `reads` reads of the rules fail. accessStepLostLate: that send loses its answer and is written 600 ms later
// (the automatic read-back still sees the version it was sent against). accessStepForeignAfter: right after that
// send is stored, another writer adds a hook (one version more), so the rules read as Advanced.
// accessStepStaleOther: that send answers 412 because another tab just made a key group of the same name.
export const accessReadFailLeft = { n: 0, gen: 0 };
/** How many reads of the access rules were answered since `resetAccess()`, for tests. */
export const accessReadCount = { n: 0 };
/** Tests: while `on`, reads of the access rules wait until their release is called (`resetAccess()` releases them). */
export const accessReadHold: { on: boolean; parked: Array<() => void> } = { on: false, parked: [] };
/** Tests: another tab adds a key group `group` (with Files) to computer `id`, one version on. */
export function accessAddElsewhere(id: string, group: string): void {
  const was = accessData(id);
  const { file_version: v, etag: _e, ...rest } = was;
  accessStore.set(id, { doc: { ...rest, groups: { ...(was.groups as Record<string, unknown>), [group]: { type: 'token', param: 'hub_key', value: 'another-tab' } }, permissions: { ...(was.permissions as Record<string, unknown>), [group]: { files: true } } }, version: (v as number) + 1 });
}
export const accessStepSends: { id: string; path: string; ifMatch: string | undefined; body: unknown }[] = [];
const STEP_PROGRAMS = new Set(['agent', 'terminal', 'display', 'files', 'browser', 'logs']);
const accessSteps = (o: Opts) => (r: FixtureRequest): FixtureAnswer => {
  const id = cidOf(r);
  accessStepSends.push({ id, path: r.path, ifMatch: r.ifMatch, body: r.body });
  const lost = o.accessStepLost && accessStepSends.length === o.accessStepLost.at;
  if (lost && !o.accessStepLost?.applied) return answers.lost();
  if (o.accessStepStale === accessStepSends.length) return answers.refused(412, 'PRECONDITION_FAILED');
  if (o.accessStepStaleOther === accessStepSends.length) {
    const was = accessData(id, o.accessGroup, o.accessShut);
    const g = /\/groups\/([^/]+)\/token$/.exec(r.path)?.[1] ?? 'hub-key-other';
    const { file_version: v, etag: _e, ...rest } = was;
    accessStore.set(id, { doc: { ...rest, groups: { ...(was.groups as Record<string, unknown>), [decodeURIComponent(g)]: { type: 'token', param: 'hub_key', value: 'another-tab' } } }, version: (v as number) + 1 });
    return answers.refused(412, 'PRECONDITION_FAILED');
  }
  const now = accessData(id, o.accessGroup, o.accessShut);
  const version = now.file_version as number;
  if (r.ifMatch !== `file:v${version}`) return answers.refused(412, 'PRECONDITION_FAILED');
  const groups = { ...(now.groups as Record<string, unknown>) };
  const permissions = { ...(now.permissions as Record<string, Record<string, unknown>>) };
  const b = (r.body ?? {}) as Record<string, unknown>;
  const m = /\/proxy\/permissions\/(groups\/([^/]+)\/(password|token)|permissions\/([^/]+)|default|groups\/([^/]+))$/.exec(r.path);
  if (!m) return answers.refused(404, 'NOT_FOUND');
  let doc: Record<string, unknown>;
  if (m[3] === 'password') doc = { ...now, groups: { ...groups, [decodeURIComponent(m[2] ?? '')]: { type: 'password', username: b.username, password: 'f'.repeat(64), salt: b.salt, algorithm: 'sha256' } } };
  else if (m[3] === 'token') doc = { ...now, groups: { ...groups, [decodeURIComponent(m[2] ?? '')]: { type: 'token', param: b.param, value: b.value } } };
  else if (m[4] !== undefined) {
    const g = decodeURIComponent(m[4]);
    if (!(g in groups)) return answers.refused(404, 'NOT_FOUND');
    if (b.program === '*' && !o.accessWildOld) {
      if (typeof b.access !== 'boolean') return answers.refused(422, 'VALIDATION_ERROR');
    } else if (typeof b.program !== 'string' || !STEP_PROGRAMS.has(b.program)) return answers.refused(400, 'VALIDATION_ERROR');
    doc = { ...now, permissions: { ...permissions, [g]: { ...permissions[g], [b.program]: b.access } } };
  } else if (m[1] === 'default') doc = { ...now, default: b.default };
  else {
    const g = decodeURIComponent(m[5] ?? '');
    delete groups[g];
    delete permissions[g];
    doc = { ...now, groups, permissions };
  }
  if (o.accessStepLostLate === accessStepSends.length) {
    const gen = accessReadFailLeft.gen;
    setTimeout(() => { if (accessReadFailLeft.gen === gen) accessStore.set(id, { doc, version: version + 1 }); }, 600);
    return answers.lost();
  }
  accessStore.set(id, { doc, version: version + 1 });
  if (o.accessStepForeignAfter === accessStepSends.length) accessStore.set(id, { doc: { ...doc, hooks: { terminal: [{ url: 'https://hooks.example/t' }] } }, version: version + 2 });
  if (o.accessReadFails?.after === accessStepSends.length) accessReadFailLeft.n = o.accessReadFails.reads;
  const { file_version: _v, etag: _e, ...shown } = doc;
  const data = o.accessStepVersioned ? { ...shown, file_version: version + 1 } : shown;
  if (o.accessStepSlow === accessStepSends.length) return answers.slow({ data }, 1500);
  return lost ? answers.lost() : ok({ data });
};
// The projects list in the API's shape: alias, colour, realms and the default flag.
const projectRows = W.projects.map((p, i) => ({ id: p.id, alias: p.name, color: COLORS[i % COLORS.length], realm_ids: [p.realm], is_default: p.is_default === true, user_id: W.account.id }));
/** Project access rules reads as they were sent (the project id), for tests; tests empty it. */
export const projectRulesReads: string[] = [];
/** The held project rules reads ('hold'): each answers when its release is called. */
export const projectRulesHeld: Array<() => void> = [];
/** Project access rules documents for the first project; the others keep the API's default (open) document. */
const PROJECT_DOCS = {
  // Only an IP range, every program.
  rulesIp: { groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny', enable_proxy: true, file_version: 3 },
  // A password group and a token group, with a hook (the edge never runs a project's hooks): no secret reaches the page.
  rulesSecret: {
    groups: { team: { type: 'password', username: 'ops', password: 'fixture-project-password-not-shown', salt: 'fixture-salt-not-shown' }, bots: { type: 'token', token: 'fixture-project-token-not-shown' } },
    permissions: { team: { terminal: true, files: true }, bots: { http: 8080 } },
    default: 'deny', enable_proxy: true, hooks: { terminal: [{ url: 'https://hooks.example/p' }] }, file_version: 7,
  },
  // A stored document that still opens to anyone (the edge treats it as no rules).
  rulesOpenStored: { groups: {}, permissions: {}, default: 'allow', enable_proxy: true, file_version: 2 },
} as const;

/** Project people reads as they were sent (the project id), for tests; tests empty it. */
export const memberReads: string[] = [];
/** The page each people read asked for (Check again reads every page), for tests; tests empty it. */
export const memberPages: number[] = [];
/** A roster row as the API sends it: the membership id, the account, its level and user names. */
const memberRow = (n: number, level: string, name: string, accountId = `a${String(n).padStart(23, '0')}`) => ({ id: `m${String(n).padStart(23, '0')}`, project_id: '', user_id: accountId, permission_level: level, user: { id: accountId, username: name, alias: null } });
/** The people of projects, by place (default: nobody on any project). */
const ROSTERS: Record<string, Record<number, unknown[]>> = {
  people: { 0: [memberRow(1, 'edit', 'jane_smith'), memberRow(2, 'read', 'bob')] },
  // The owner's own row (the API does not refuse one), an unknown level and a cut list (total says 5).
  peopleOdd: { 0: [memberRow(1, 'edit', 'jane_smith'), memberRow(3, 'delete', 'ada', W.account.id), memberRow(4, 'owner', 'weird')] },
  // Every row of a level the Hub doesn't know (total 1), and an answer without its pagination.
  peopleUnknownOnly: { 0: [memberRow(4, 'owner', 'weird')] },
  peopleNoTotal: { 0: [] },
  // People on the third project (Lab), which the delete tests empty: the delete dialog names them.
  peopleLab: { 2: [memberRow(5, 'edit', 'jane_smith'), memberRow(6, 'read', 'bob'), memberRow(7, 'delete', 'ada', W.account.id)] },
  // Seven people on Lab (the dialog names five, then "and 2 more"), and a cut list of Lab (2 rows read, total 5).
  peopleLab7: { 2: ['ann', 'ben', 'cat', 'dan', 'eve', 'fay', 'gus'].map((n, i) => memberRow(10 + i, 'read', n)) },
  peopleLabCut: { 2: [memberRow(5, 'edit', 'jane_smith'), memberRow(6, 'read', 'bob')] },
  // The first project seen by a member at Work on (ada, the signed-in account; its owner is someone else, ownedBy):
  // jane_smith at Full control is above them, bob at See is not.
  // The first project seen by a member at Full control (ada, the signed-in account; its owner is someone else).
  peopleFull: { 0: [memberRow(2, 'read', 'bob'), memberRow(8, 'delete', 'ada', W.account.id)] },
  peopleMember: { 0: [memberRow(1, 'delete', 'jane_smith'), memberRow(2, 'read', 'bob'), memberRow(8, 'edit', 'ada', W.account.id)] },
  // Experiments shared with the signed-in account (ada) at each level, beside jane_smith (the actions a level allows).
  labAsread: { 2: [memberRow(1, 'edit', 'jane_smith'), memberRow(8, 'read', 'ada', W.account.id)] },
  labAsedit: { 2: [memberRow(1, 'edit', 'jane_smith'), memberRow(8, 'edit', 'ada', W.account.id)] },
  labAsdelete: { 2: [memberRow(1, 'edit', 'jane_smith'), memberRow(8, 'delete', 'ada', W.account.id)] },
  // Long lists of the first project (Check again pages through them): 250 rows, and 1,200 (past the 1,000 bound).
  people250: { 0: Array.from({ length: 250 }, (_, i) => memberRow(1000 + i, 'read', `p${i}`)) },
  people1200: { 0: Array.from({ length: 1200 }, (_, i) => memberRow(3000 + i, 'read', `q${i}`)) },
};
// People writes as they were sent, with whether the fixture API took them: `applied` true at once, 'late'
// once a test sets memberLate.land (a write still on its way), false never. The roster read is ROSTERS with every
// taken write on top, so a test that empties this list (and lowers memberLate.land) starts from ROSTERS again.
export const memberSends: { method: string; path: string; body: unknown; applied: boolean | 'late' }[] = [];
export const memberLate = { land: false };
/** The server's roster moving under a shown list: `level` sets a member's level by username, `fail` fails every
 *  people read from now on, `holdNext` holds that many next people reads (see held), each answering the roster as it
 *  was when asked, or failing if `fail` is set by the time it is let go. Tests set it after the list is shown and
 *  reset it. */
export const memberServer: { level: Record<string, string>; fail: boolean; holdNext: number } = { level: {}, fail: false, holdNext: 0 };
/** Counts held from now on: `holdNext` holds that many next computer counts (see held). Tests reset it. */
export const countServer = { holdNext: 0 };
/** Accounts the fixture API finds by username or ID (the people step adds them); any other name or ID answers the API's uniform 404. */
const ACCOUNTS: Record<string, string> = { carol: 'c'.repeat(24), dave: 'd'.repeat(24) };
const takenNow = (x: (typeof memberSends)[number]) => x.applied === true || (x.applied === 'late' && memberLate.land);
/** A project's roster now: its ROSTERS rows with the taken writes applied in order. */
function rosterNow(o: Opts, pid: string): unknown[] {
  if (pid.startsWith('6b')) return [memberRow(8, 'read', 'ada', W.account.id)];
  let rows = ((o.members ? ROSTERS[o.members]?.[W.projects.findIndex((p) => p.id === pid)] : undefined) ?? []) as ReturnType<typeof memberRow>[];
  for (const x of memberSends.filter((m) => m.path.split('/')[2] === pid && takenNow(m))) {
    const b = (x.body ?? {}) as { user_id?: string; username?: string; permission_level?: string };
    const mid = x.path.split('/')[4];
    if (x.method === 'POST') {
      const name = b.username ?? Object.keys(ACCOUNTS).find((k) => ACCOUNTS[k] === b.user_id) ?? '';
      rows = [...rows, memberRow(90 + rows.length, b.permission_level ?? 'read', name, ACCOUNTS[name] ?? b.user_id)];
    } else if (x.method === 'PUT') rows = rows.map((m) => (m.id === mid ? { ...m, permission_level: b.permission_level ?? m.permission_level } : m));
    else if (x.method === 'DELETE') rows = rows.filter((m) => m.id !== mid);
  }
  return rows.map((m) => (memberServer.level[m.user.username] ? { ...m, permission_level: memberServer.level[m.user.username]! } : m));
}
/** The fixture API's answer to a people write (o.memberWrite: lost answers, refusals), recording it in memberSends. */
const memberWrites = (o: Opts) => (r: FixtureRequest): FixtureAnswer => {
  const b = (r.body ?? {}) as { user_id?: string; username?: string };
  const pid = r.path.split('/')[2] ?? '';
  const mid = r.path.split('/')[4];
  const send = (applied: boolean | 'late') => memberSends.push({ method: r.method, path: r.path, body: r.body, applied });
  const w = o.memberWrite;
  if (w === 'refused') return (send(false), answers.refused(403, 'FORBIDDEN'));
  if (r.method === 'POST') {
    const known = b.username !== undefined ? b.username in ACCOUNTS : Object.values(ACCOUNTS).includes(b.user_id ?? '');
    if (!known || w === 'notFound') return (send(false), answers.refused(404, 'NOT_FOUND'));
    const name = b.username ?? Object.keys(ACCOUNTS).find((k) => ACCOUNTS[k] === b.user_id);
    if (w === 'exists' || rosterNow(o, pid).some((m) => (m as { user: { username: string } }).user.username === name)) return (send(false), answers.refused(409, 'PERMISSION_ALREADY_EXISTS'));
  } else if (w === 'gone' || !rosterNow(o, pid).some((m) => (m as { id: string }).id === mid)) return (send(false), answers.refused(404, 'NOT_FOUND'));
  if (w === 'lost') return (send(false), answers.lost());
  if (w === 'lostApplied') return (send(true), answers.lost());
  if (w === 'lostLate') return (send('late'), answers.lost());
  send(true);
  return r.method === 'POST' ? ok({ statusCode: 201, data: {} }) : ok({ data: {} });
};
/** The realm's projects list with the first project owned by another account (a member's view). */
/** The realm's projects plus `n` projects of another account shared with the signed-in one at See (levels past
 *  the first MISSING_READS shared projects). Their ids start 6b; each lists the signed-in account at See. */
export const manyShared = (n: number): FixtureRule => reply(probeRoute, ok({ data: { projects: [...projectRows, ...Array.from({ length: n }, (_, i) => ({ id: `6b${String(i + 1).padStart(22, '0')}`, alias: `Shared ${i + 1}`, color: COLORS[i % COLORS.length], realm_ids: [W.projects[0]!.realm], is_default: false, user_id: 'f'.repeat(24) }))] } }));
export const ownedBy = (owner: string, at = 0): FixtureRule => reply(probeRoute, ok({ data: { projects: projectRows.map((p, i) => (i === at ? { ...p, user_id: owner } : p)) } }));
const pidOf = (r: FixtureRequest): string => /\/projects\/([^/?]+)/.exec(r.path)?.[1] ?? '';
// projectRows: what the project lists hold (expired computers too, which the realm's list never shows), less every
// computer a sent delete took away (unless computerRead 'there': the delete never took). Else the state's computers.
const goneIds = (o: Opts): Set<string> => new Set(o.computerRead === 'there' ? [] : removeSends.map((x) => x.id));
const projectRowsOf = (o: Opts): readonly ProjectRow[] => (o.projectRows ? o.projectRows.filter((c) => !goneIds(o).has(c.id)) : (o.computers ?? computers));
const expiryOf = (c: ProjectRow) => ({
  ...(c.server_expired !== undefined ? { server_expired: c.server_expired } : {}),
  ...(c.server_expired_reason !== undefined ? { server_expired_reason: c.server_expired_reason } : {}),
  ...(c.is_default !== undefined ? { is_default: c.is_default } : {}),
});
// countLateZero: the first count answers 0 late; every later one answers at once with the real count.
// countZeroFor: the first N counts answer 0, later ones the real count. countSlowAt: that count (from 1) answers 0, late.
/** The projects each computer count asked for, for tests; tests empty it. */
export const countReads: string[] = [];
const counts = (o: Opts) => {
  let n = 0;
  return (r: FixtureRequest): FixtureAnswer | Promise<FixtureAnswer> => {
    countReads.push(pidOf(r));
    projectTrace.push(`COUNT ${pidOf(r)}`);
    called(r);
    if (o.countDown) return answers.refused(500, 'SERVER_ERROR');
    // A list read (the rules confirm: limit 100) answers the rows, each with the computer's own document state
    // from projectOwn, by place in the project; projectListFails answers it 500. Counts (limit 1) answer no rows.
    // The page and limit are kept as the API does (a page past the rows is empty).
    if (r.query.limit !== '1') {
      projectListReads.push(pidOf(r));
      projectListQueries.push({ ...r.query });
      if (o.projectListFails) return answers.refused(500, 'SERVER_ERROR');
      // An older API (or a caller who is no longer a member) refuses a member's list read.
      if (o.projectListRefused) return answers.refused(403, 'FORBIDDEN');
      const answer = () => {
        const own = projectListServer.own ?? o.projectOwn;
        const all = projectRowsOf(o).filter((c) => c.project_id === pidOf(r)).map((c, i) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, proxy_permissions_scope: 'project', ...(own?.[i] ? { proxy_permissions_computer_state: own[i] } : {}), ...expiryOf(c) }));
        const limit = Number(r.query.limit) || 20;
        const page = Number(r.query.page) || 1;
        const shown = all.slice((page - 1) * limit, page * limit);
        // A malformed answer: one row without an id, a row without its status, or no pagination total.
        if (o.projectListMalformed === 'status') return ok({ data: { computers: shown.map((c, i) => (i === 0 ? { id: c.id, name: c.name } : c)), pagination: { total: all.length } } });
        if (o.projectListMalformed === 'row') return ok({ data: { computers: [...shown, { name: 'no id' }], pagination: { total: all.length + 1 } } });
        if (o.projectListMalformed === 'total') return ok({ data: { computers: shown } });
        return ok({ data: { computers: shown, pagination: { total: o.projectListTotal ?? all.length } } });
      };
      // Read when the request arrives; a held one is answered later with what it read then.
      const got = answer();
      if (projectListServer.hold) return new Promise((done) => projectListServer.parked.push(() => done(got)));
      return got;
    }
    const total = (o.apiCount ?? (o.projectRows ? projectRowsOf(o) : undefined) ?? o.computers ?? computers).filter((c) => c.project_id === pidOf(r)).length;
    n++;
    const zero = { data: { computers: [], pagination: { total: 0 } } };
    if (countServer.holdNext > 0) {
      countServer.holdNext--;
      return held.wait().then(() => ok({ data: { computers: [], pagination: { total } } }));
    }
    if ((o.countLateZero && n === 1) || o.countSlowAt === n) return answers.slow(zero, 600);
    if (o.countZeroFor !== undefined && n <= o.countZeroFor) return ok(zero);
    return ok({ data: { computers: [], pagination: { total } } });
  };
};
/** Answers held until a test lets them go: a read again stays in flight for exactly as long as the
 *  test needs. waiting counts the answers held now; release() lets every one go. Outside a test (the dev page) a
 *  held answer goes by itself after a minute. */
export const held = {
  waiting: 0,
  open: [] as (() => void)[],
  wait(): Promise<void> {
    this.waiting++;
    return new Promise((done) => {
      const go = () => { clearTimeout(t); this.waiting--; done(); };
      const t = setTimeout(() => { this.open = this.open.filter((f) => f !== go); go(); }, 60_000);
      this.open.push(go);
    });
  },
  release() { for (const go of this.open.splice(0)) go(); },
};
// listLater: every computers-list read after the first is held (see held), then answers without the computer at drop.
const laterList = (rows: readonly Computer[], l: { drop: number }) => {
  let n = 0;
  return reply(containersRoute, async () => (n++ === 0 ? ok({ data: { computers: rows } }) : (await held.wait(), ok({ data: { computers: rows.filter((_, i) => i !== l.drop) } }))), { when: (r) => r.query.include_expired !== 'true' });
};
const reads = (o: Opts = {}): FixtureRule[] => [
  // listMalformed: the realm's list answers 2xx without data.containers (out of contract): a read error, never an empty list.
  // 'afterEmpty': the first read is an empty list, every later one is malformed.
  o.listMalformed ? reply(containersRoute, () => ok(o.listMalformed === 'afterEmpty' && listReads.n++ === 0 ? { data: { computers: [] } } : { data: {} }), { when: (r) => r.query.include_expired !== 'true' }) : o.listLater ? laterList(o.computers ?? computers, o.listLater) : list(o.computers ?? computers),
  // listDropsDeleted: once a DELETE was sent for a project, this realm's list leaves it out (it moved out of view).
  // realmProjects: the realm's list holds only these projects (by place); the account's whole list keeps every one.
  // projectsSlowLater: every realm-list read after the first answers the same, late (a refresh in flight).
  reply(probeRoute, (() => {
    let n = 0;
    return () => {
      const rows = (o.listDropsDeleted ? projectRows.filter((p) => !projectSends.some((x) => x.method === 'DELETE' && x.path.endsWith('/' + p.id))) : projectRows).filter((_, i) => !o.realmProjects || o.realmProjects.includes(i));
      // listAddsCreated: a project made with New project is in this realm's list from the next read on.
      const made = o.listAddsCreated ? projectSends.filter((x) => x.method === 'POST').map((x, i) => ({ id: `e${String(i).padStart(23, '0')}`, alias: String((x.body as { alias?: string } | undefined)?.alias ?? ''), color: COLORS[0], realm_ids: [W.projects[0]?.realm ?? ''], is_default: false })) : [];
      const a = ok({ data: { projects: [...rows, ...made] } });
      // createdListHeld: a read whose list holds a project made here waits (see held), then answers with it.
      if (o.createdListHeld && made.length > 0) {
        n++;
        return held.wait().then(() => a);
      }
      // projectsLater: every realm-list read after the first is held (see held), then holds only the places in keep.
      if (n > 0 && o.projectsLater) {
        n++;
        const keep = o.projectsLater.keep;
        return held.wait().then(() => ok({ data: { projects: projectRows.filter((_, i) => keep.includes(i)) } }));
      }
      return n++ > 0 && o.projectsSlowLater ? { ...a, delayMs: 600000 } : a;
    };
  })()),
  // The API's own count of a project's computers (the delete check): whatever this state's list holds there.
  reply(routes.projectComputers, counts(o)),
  // An expired delete's proof (computerGone): the computer's own read on the base host, 404 once a delete took it away;
  // computerRead 'down' answers 500.
  ...(o.projectRows ? [reply(routes.read, (r: FixtureRequest) => {
    const id = cidOf(r);
    if (o.computerRead === 'down') return answers.refused(500, 'SERVER_ERROR');
    return projectRowsOf(o).some((c) => c.id === id) ? ok({ data: { id } }) : answers.refused(404, 'NOT_FOUND');
  })] : []),
  // A project's people: `members` names a ROSTERS entry (with the people writes taken since); 'fail' answers 500.
  reply(routes.members, (r: FixtureRequest) => {
    const pid = r.path.split('/')[2] ?? '';
    const page = Math.max(1, Number(r.query.page) || 1);
    const limit = Math.max(1, Number(r.query.limit) || 100);
    memberReads.push(pid);
    memberPages.push(page);
    if (o.members === 'fail' || o.memberPageFails === page || memberServer.fail) return answers.refused(500, 'SERVER_ERROR');
    const all = rosterNow(o, pid);
    const rows = all.slice((page - 1) * limit, page * limit);
    const total = (o.members === 'peopleOdd' || o.members === 'peopleLabCut') && all.length ? 5 : all.length;
    if (o.members === 'peopleNoTotal') return ok({ data: { permissions: rows } });
    const a = ok({ data: { permissions: rows, pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } } });
    if (memberServer.holdNext > 0) {
      memberServer.holdNext--;
      return held.wait().then(() => (memberServer.fail ? answers.refused(500, 'SERVER_ERROR') : a));
    }
    return a;
  }),
  ...[routes.memberAdd, routes.memberSet, routes.memberRemove].map((route) => reply(route, memberWrites(o))),
  // A project's access rules: the API's default open document (file_version 0) unless `projectRules` names a
  // PROJECT_DOCS entry for the first project; 'fail' answers 500, 'level' the API's 403 (below Full control), 'hold'
  // answers only when released.
  reply(routes.projectRulesSet, projectRulesWrites(o)),
  reply(routes.projectRulesClear, projectRulesWrites(o)),
  reply(routes.projectRules, (r: FixtureRequest) => {
    const pid = r.path.split('/')[2] ?? '';
    projectRulesReads.push(pid);
    if (o.projectRules === 'fail') return answers.refused(500, 'SERVER_ERROR');
    if (o.projectRules === 'level') return answers.refused(403, 'INSUFFICIENT_PERMISSIONS');
    if (projectRulesFails.on) return answers.refused(500, 'SERVER_ERROR');
    const elsewhere = projectRulesElsewhere.doc ?? (projectRulesElsewhere.to ? PROJECT_DOCS[projectRulesElsewhere.to] : null);
    if (elsewhere && pid === W.projects[0]!.id) {
      projectRulesElsewhere.to = null;
      delete projectRulesElsewhere.doc;
      const { file_version: _v, ...stored } = elsewhere as Record<string, unknown>;
      projectRulesStore.set(pid, { doc: stored, version: projectRulesVersion(pid, o) + 1 });
    }
    const open = { project: pid, groups: {}, permissions: {}, default: 'allow', enable_proxy: true, file_version: 0, etag: 'file:v0' };
    const named = projectRulesSwap.to ?? (o.projectRules && o.projectRules in PROJECT_DOCS ? o.projectRules as keyof typeof PROJECT_DOCS : null);
    const late = projectRulesLate.get(pid);
    if (late && late.reads-- <= 0) {
      projectRulesLate.delete(pid);
      projectRulesStore.set(pid, { doc: late.doc, version: late.version });
    }
    const w = projectRulesStore.get(pid);
    const doc = w ? { project: pid, ...w.doc, file_version: w.version, etag: `file:v${w.version}` } : named && pid === W.projects[0]!.id ? { project: pid, ...PROJECT_DOCS[named] } : open;
    if (o.projectRules === 'hold') return new Promise((done) => projectRulesHeld.push(() => done(ok({ data: open }))));
    return ok({ data: doc });
  }),
  // One project read on the base host (a lost delete's check): there by default; gone answers the API's 404.
  reply(routes.project, (r) => {
    projectTrace.push(`${r.method} ${r.path}`);
    called(r);
    projectSends.push({ method: r.method, path: r.path, query: r.query, body: r.body });
    const row = projectRows.find((p) => p.id === pidOf(r));
    if (o.projectRead === 'goneSlow') return { ...answers.refused(404, 'NOT_FOUND'), delayMs: 600 };
    // projectReadHangs: a project read that never answers (the page must keep loading, never show "No projects").
    if (o.projectReadHangs) return { ...ok({ data: row }), delayMs: 600000 };
    // projectReadMoves: a project's first read names the first realm too; later reads give its own realms only.
    if (o.projectReadMoves && row && !projectSends.slice(0, -1).some((x) => x.method === 'GET' && x.path === r.path)) return ok({ data: { ...row, realm_ids: [...row.realm_ids, W.projects[0]!.realm] } });
    if (o.projectRead === 'thereSlow' && row) return { ...ok({ data: row }), delayMs: 2500 };
    // projectReadLater: the project at place's later reads are held (see held), then give the same id a new name and colour.
    const later = o.projectReadLater;
    if (later && row && row.id === projectRows[later.place]?.id && projectSends.slice(0, -1).some((x) => x.method === 'GET' && x.path === r.path)) return held.wait().then(() => ok({ data: { ...row, alias: later.name, color: later.color } }));
    return o.projectRead === 'gone' || !row ? answers.refused(404, 'NOT_FOUND') : o.projectRead === 'down' ? answers.refused(500, 'SERVER_ERROR') : ok({ data: row });
  }),
  reply(routes.servers, ok({ data: rentals(o.servers ?? servers) })),
  reply(routes.aiUsage, () => (aiReads.push(Date.now()), aiUsage(o.servers ?? servers))),
  // The API answers { data, total, limit, offset }. subs: rows and total ('none' leaves total out, 'text' sends a
  // string); malformed answers data as an object instead of a list.
  reply(subsListRoute, ok({ data: o.subs?.malformed ? {} : (o.subs?.rows ?? subs), ...(o.subs?.total === 'none' ? {} : { total: o.subs?.total === 'text' ? String((o.subs.rows ?? subs).length) : (o.subs?.total ?? (o.subs?.rows ?? subs).length) }), limit: 50, offset: 0 })),
  // scopeLateAfterWrite: once an access write was sent, the project-scope read answers late (the rules come back first).
  // own: the computer's own document state, left out unless named or cleared; accessOwnFails: 500;
  // accessOwnHold: parked until released.
  reply(routes.runtime, (r) => {
    if (accessOwnFails.on) return answers.refused(500, 'SERVER_ERROR');
    const slow = accessOwnSlow.ms && (accessOwnSlow.left === undefined || accessOwnSlow.left-- > 0) ? accessOwnSlow.ms : 0;
    const answer = () => {
      const own = ownOf(cidOf(r), o);
      return { ...ok({ data: { runtime_info: runtime[computers[0]!.id], proxy_permissions_scope: o.freshScope ?? computers.find((c) => c.id === cidOf(r))?.proxy_permissions_scope, ...(own ? { proxy_permissions_computer_state: own } : {}) } }), ...(o.scopeLateAfterWrite && accessSends.length > 0 ? { delayMs: 1500 } : slow ? { delayMs: slow } : {}) };
    };
    return accessOwnHold.on ? new Promise((done) => accessOwnHold.parked.push(() => done(answer()))) : answer();
  }),
  reply(routes.stats, (r) => statsOf(cidOf(r))),
  // The server panel's own reads (ServerDetail.data.ts): its rows read (the same rentals) and a server's live usage,
  // the dedicated-server shape runtimeOf reads.
  reply(serverDetailRoutes.rows, ok({ data: rentals(o.servers ?? servers) })),
  reply(serverDetailRoutes.runtime, ok({ data: { scope: 'server', uptime_s: 1036800, cpu: { busy_pct: 37 }, mem: { pct: 61 }, storage: { pct: 48 } } })),
  reply(programRoutes.overview, ok(overview)),
  // The terminal program's sessions: a plain terminal, desktops 1 and 3 (with a history the page never keeps).
  // A session whose DELETE was answered 200 leaves the list, as on a real program.
  reply(routes.desktopSessions, () => {
    const delay = desktopReads.delayNext;
    desktopReads.delayNext = 0;
    desktopReads.asked++;
    const rows = desktopSessions.filter((r) => !desktopEnded.has(`/api/v1/terminal/${r.terminal_id}`)).map((r) => (desktopReads.inc[r.terminal_id] ? { ...r, incarnation: desktopReads.inc[r.terminal_id] } : r));
    return answers.ok(o.desktopSessions ?? rows, delay || undefined);
  }),
  // The environments route: a terminal program without it (today's) answers 404; a listing or a failure on request.
  reply(routes.desktopEnvs, o.desktopEnvs === undefined ? answers.refused(404, 'NOT_FOUND') : o.desktopEnvs === 'down' ? answers.refused(500, 'SERVER_ERROR') : ok(o.desktopEnvs)),
  reply(routes.accessRules, accessReads(o)),
  reply(accessRoutes.set, accessWrites(o)),
  reply(accessRoutes.clear, accessClears(o)),
  ...[accessRoutes.person, accessRoutes.key, accessRoutes.grant, accessRoutes.deny, accessRoutes.drop].map((route) => reply(route, accessSteps(o))),
  reply(routes.myIp, () => (myIpServer.fail ? answers.refused(500, 'SERVER_ERROR') : ok({ data: { ip: myIpServer.ip ?? o.myIp ?? '203.0.113.7', ip_info: { city: 'Singapore', region: 'Singapore', country: 'SG', asn: { asn: 'AS64500', name: 'Example Net' } } } }))),
  reply(routes.aliases, (r) => ok({ data: { aliases: computers.findIndex((c) => c.id === r.query.computer_id) % 2 === 0 ? aliasRows : [] } })),
  // Setup's server read (reinstalled's room) is core's serversRoute, answered above by the page's servers rule.
  ...setupFixtures(o.zero ?? 'provisioning', o.failedSetup ? { signupCodeFailed: false } : {}),
  ...snapshotRules(),
  ...filesRules(),
  // The Storage tab's files-program answers: last, so the error and loading states that drop base()[0] keep working.
  ...storageRules(),
  // The Storage tab's Shared folders lists: no share.
  ...shareRules({ shares: [] }),
  ...firewallFixtureRules(),
];
const base = (o: Opts = {}, over: Partial<Record<Mut, FixtureAnswer>> = {}): FixtureRule[] => [...reads(o), ...mutations(over)];
/** The reason the API writes on a computer whose server was reinstalled (the API's own text). */
const REINSTALLED = 'The server this computer ran on was reinstalled. Its files are gone.';
const expire = (c: Computer, status: string, extra: Partial<ProjectRow> = {}): ProjectRow => ({ ...c, status, server_expired: true, server_expired_reason: status === 'host_reinstalled' ? REINSTALLED : 'Server rental ended', ...extra });
const expiredRows: readonly ProjectRow[] = computers.map((c) => (c.name === 'cedar' ? expire(c, 'host_reinstalled', { is_default: true, realm_ids: [] }) : c.name === 'fjord' ? expire(c, 'stopped') : c));
const liveOnly: readonly Computer[] = computers.filter((c) => c.name !== 'cedar' && c.name !== 'fjord');
const labExpired: readonly ProjectRow[] = computers.map((c) => (c.project_id !== W.projects[2]!.id ? c : expire(c, c.name === 'dune' ? 'host_reinstalled' : 'stopped')));
const unknown = answers.pending5xx(502);
// The Network tab's exit (GET /api/v1/egress/upstream on the computer's egress program), one state per diagram.
const exitAs = (blob: Record<string, unknown> | null): FixtureRule[] => [reply(egressRoutes.upstream, blob ? ok({ ...blob, config_path: '/hoody/storage/hoody-egress/config/upstream_proxy.txt' }) : answers.refused(500, 'SERVER_ERROR')), ...base()];
const socks = { scheme: 'socks5h', host: 'exit.example.net', port: 1080, auth: false };
/** The proxy host of a running computer on another server than atlas's: the shape the exit choice sets. */
const viaHost = (): string => {
  const me = computers.find((c) => c.name === 'atlas');
  const o = computers.find((c) => c.status === 'running' && c.name !== 'atlas' && routingNode(c) !== routingNode(me));
  // Read at request time: the proxy domain is the page's (fixture mode sets it after this module loads).
  const u = o ? portAddress({ id: o.project_id }, { id: o.id, server_name: routingNode(o) }, 1, 'egress') : '';
  return u ? new URL(u).hostname : 'exit.example.net';
};

export default defineFixtures({
  default: 'many',
  states: {
    /** 12 computers, mixed states, two servers. */
    many: base(),
    /** 60 rows for the long list. */
    long: base({ computers: many }),
    /** No computer yet: the account's free-tier / invite / retry offer. */
    empty: base({ computers: [], zero: 'invite' }),
    emptyProvisioning: base({ computers: [], zero: 'provisioning' }),
    /** No computer and no setup record (claim reason none): the create offer, never "being prepared". */
    emptyNone: base({ computers: [], zero: 'empty' }),
    /** No computer, and a create sent from here loses its answer (outcome unknown): core holds it for real. */
    emptyCreateUnknown: base({ computers: [], zero: 'empty' }, { create: unknown }),
    /** The 50 subscriptions read and a total of 63: the Servers panel says more are not shown. */
    subsMore: base({ subs: { rows: subsPage, total: 63 } }),
    /** A full page whose total is 50: the whole list, no notice. */
    subsFullWhole: base({ subs: { rows: subsPage, total: 50 } }),
    /** A total below the rows (0 with rows): total <= rows, so the notice stays off. */
    subsTotalLow: base({ subs: { total: 0 } }),
    /** No total in the answer: the list is not known to be whole, so the notice shows. */
    subsNoTotal: base({ subs: { total: 'none' } }),
    /** A total that is not a number: as unknown as none. */
    subsTotalText: base({ subs: { total: 'text' } }),
    /** An answer whose data is not a list: a failed read, never an empty whole list. */
    subsMalformed: base({ subs: { malformed: true } }),
    /** No computer, the free server owned (already_claimed) but nothing reports preparation. */
    emptyClaimed: base({ computers: [], zero: 'provisioning' }),
    /** No computer and the setup state cannot be read (the free-tier status fails). */
    emptySetupDown: [reply(freeTierRoute, answers.refused(500, 'SERVER_ERROR')), ...base({ computers: [], zero: 'empty' })],
    /** A token session with no computer (never reads the setup state; create needs the account). */
    emptyLimited: [fixtureSession({ kind: 'token', caps: ['computers.actions.start', 'computers.read', 'projects.read'] }), ...base({ computers: [], zero: 'empty' })],
    /** No computer and the setup read still out (the free-tier status answers late). */
    emptySetupSlow: [reply(freeTierRoute, answers.slow({ data: { gate_enabled: false, claim_blocked_reason: 'none' } }, 60000)), ...base({ computers: [], zero: 'empty' })],
    /** No room on the free servers: rent one or see plans. */
    emptyCapacity: base({ computers: [], zero: 'capacity' }),
    /** Access ended: renew. */
    emptyExpired: base({ computers: [], zero: 'expired' }),
    /** host_reinstalled: the server of the account's expired computers was reinstalled: delete them in Projects. The
     *  account has no server left (its rental ended too): Rent a server. */
    emptyReinstalled: base({ computers: [], zero: 'reinstalled', servers: [] }),
    /** host_reinstalled, and the account still has a server with room: Create beside Projects. */
    emptyReinstalledServer: base({ computers: [], zero: 'reinstalled' }),
    /** host_reinstalled, and only a free slice whose room a realm host does not say: Create and Rent. */
    emptyReinstalledSlice: [reply(routes.servers, ok({ data: [{ status: 'active', is_free_tier: true, server: { id: '5e00000000000000000000f1', name: 'ash-3', is_vm: true } }] })), ...base({ computers: [], zero: 'reinstalled' })],
    /** host_reinstalled, and the server list could not be read: room unknown, so Rent (never Create on a guess). */
    emptyReinstalledServersDown: [reply(routes.servers, answers.refused(500, 'SERVER_ERROR')), ...base({ computers: [], zero: 'reinstalled' })],
    emptyReinstalledLimited: [fixtureSession({ kind: 'token', caps: ['computers.actions.start', 'computers.read', 'projects.read'] }), ...base({ computers: [], zero: 'reinstalled' })],
    error: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR'), { when: (r) => r.query.include_expired !== 'true' }), ...base().slice(1)],
    loading: [reply(containersRoute, answers.slow({ data: { computers: computers } }, 60000), { when: (r) => r.query.include_expired !== 'true' }), ...base().slice(1)],
    /** A shared-access (token) session: lifecycle only. */
    limited: [fixtureSession({ kind: 'token', caps: ['computers.actions.start', 'computers.actions.stop', 'computers.actions.restart', 'computers.read', 'projects.read'] }), ...base()],
    /** A token that may start and stop but not restart: a failed computer's Restart shows off, with why. */
    noRestart: [fixtureSession({ kind: 'token', caps: ['computers.actions.start', 'computers.actions.stop', 'computers.read', 'projects.read'] }), ...base()],
    /** Every change answers "may have gone through". */
    colourLanded: [colourLandedList(), ...base({}, { setColour: unknown })],
    /** A live computer's delete loses its answer: held until the list (remove.check) proves it. */
    removeLost: base({}, { remove: unknown }),
    /** The snapshot list holds a row the page cannot read: listed, not complete. */
    snapshotsPartial: [...snapshotRules({ partial: true }), ...base()],
    pendingOps: [...snapshotRules({ pending: true }), ...base({}, { lifecycle: unknown, rename: unknown, setColour: unknown, setSshKey: unknown, create: unknown, execute: unknown, copy: unknown, projectCreate: unknown, projectUpdate: unknown, projectRemove: unknown })],
    /** Experiments holds no computer (its two are left out): a project that can be deleted. */
    /** This realm's projects list holds only the first project, but its computers belong to all three. */
    projectOutside: base({ realmProjects: [0] }),
    // No project of the realm's own: every listed computer's project is outside, read by id.
    projectOutsideOnly: base({ realmProjects: [] }),
    projectOutsideOnlyCreates: base({ realmProjects: [], listAddsCreated: true }),
    // Get a computer's own New project; a made project is in the list from the next read on.
    projectsCreate: base({ listAddsCreated: true }),
    // A lost create that core's own read-back proves; a create answered after 1.5 s; a done create whose
    // list refresh is held until the test lets it go; a lost create whose read-back is held the same way.
    projectCreateLostMade: base({ listAddsCreated: true }, { projectCreate: unknown }),
    projectCreateSlow: base({ listAddsCreated: true }, { projectCreate: answers.ok({}, 1500) }),
    projectCreateListHeld: base({ listAddsCreated: true, createdListHeld: true }),
    projectCreateLostHeld: base({ listAddsCreated: true, createdListHeld: true }, { projectCreate: unknown }),
    projectCreateLostSlow: base({ listAddsCreated: true, createdListHeld: true }, { projectCreate: answers.pending5xx(502, 1500) }),
    // A same-named project shows in the list (made elsewhere) while this create is still out; the create is then refused.
    projectCreateTakenSlow: base({ listAddsCreated: true }, { projectCreate: { ...answers.refused(409, 'DUPLICATE_ALIAS'), delayMs: 1500 } }),
    // Project people.
    projectPeople: base({ members: 'people' }),
    projectPeopleOdd: base({ members: 'peopleOdd' }),
    projectPeopleFail: base({ members: 'fail' }),
    // Both reads of the project's Permissions fail: each failure keeps its own details.
    projectPermsBothFail: base({ members: 'fail', projectRules: 'fail' }),
    projectPeopleUnknownOnly: base({ members: 'peopleUnknownOnly' }),
    projectPeopleNoTotal: base({ members: 'peopleNoTotal' }),
    // A shared-access key, even an unrestricted one holding every members capability and the rules leaf, and a
    // realm-limited one: no people or rules read at all (the page stops it, not only core).
    projectPeopleKey: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'projects.members.invite', 'projects.members.remove', 'projects.members.change_roles', 'resources.proxy_aliases'], realm: 'all' }), ...base({ members: 'people' })],
    // Project access rules.
    projectRulesIp: base({ projectRules: 'rulesIp' }),
    projectRulesSecret: base({ projectRules: 'rulesSecret' }),
    projectRulesOpenStored: base({ projectRules: 'rulesOpenStored' }),
    projectRulesFail: base({ projectRules: 'fail' }),
    projectRulesLevel: base({ projectRules: 'level' }),
    projectRulesHold: base({ projectRules: 'hold' }),
    // The owner changes the first project's rules (Only my IP from 203.0.113.7); its three computers keep no
    // document, one of their own, and one the API could not check. The writes as projectPut names.
    rulesChange: base({ projectRules: 'rulesIp', projectOwn: ['missing', 'applied', 'unknown'] }),
    rulesChangePrivate: base({ projectRules: 'rulesIp', projectOwn: ['missing', 'missing', 'missing'], myIp: '198.51.100.4' }),
    rulesChangeOpen: base({ projectRules: 'rulesOpenStored', projectOwn: ['missing', 'applied', 'unknown'] }),
    rulesChangeNoState: base({ projectRules: 'rulesIp' }),
    rulesChangeSecret: base({ projectRules: 'rulesSecret', projectOwn: ['missing', 'applied', 'unknown'] }),
    rulesChangeV6: base({ projectRules: 'rulesOpenStored', myIp: '2001:db8::7', projectOwn: ['missing'] }),
    rulesChangeListFails: base({ projectRules: 'rulesIp', projectListFails: true }),
    // The API says the project has more computers than the page it answered.
    projectComputersMore: base({ projectRules: 'rulesIp', projectOwn: ['missing', 'applied', 'unknown'], projectListTotal: 140 }),
    // host_reinstalled: the first project holds atlas (live), cedar (its server was reinstalled: host_reinstalled,
    // the account's default computer, in no realm) and fjord (its rental ended: stopped). The realm's list shows atlas
    // only (expired computers are hidden there). A sent delete takes a row away (removeSends); Lost: its answer is lost
    // (There: it never took; Down: the computer's own read fails).
    projectExpired: base({ computers: liveOnly, projectRows: expiredRows, projectRules: 'rulesIp' }),
    projectExpiredLost: base({ computers: liveOnly, projectRows: expiredRows, projectRules: 'rulesIp' }, { removeBase: unknown }),
    projectExpiredLostThere: base({ computers: liveOnly, projectRows: expiredRows, projectRules: 'rulesIp', computerRead: 'there' }, { removeBase: unknown }),
    projectExpiredLostDown: base({ computers: liveOnly, projectRows: expiredRows, projectRules: 'rulesIp', computerRead: 'down' }, { removeBase: unknown }),
    projectExpiredMember: [ownedBy('f'.repeat(24)), ...base({ computers: liveOnly, projectRows: expiredRows, members: 'peopleMember', projectRules: 'rulesIp' })],
    // Experiments holds only expired computers (dune: host_reinstalled, harbor: rental ended), so the realm's list shows
    // none of it: its rows are deleted one by one in the tab, then the project itself.
    projectOnlyExpired: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRows: labExpired }),
    // The member read: a Work on member of the first project
    // gets the member view rows (the list rows here carry only member-view fields: id, name, status, project_id and the
    // two proxy-permissions summary fields).
    memberComputers: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember', projectRules: 'rulesIp', projectOwn: ['missing', 'applied', 'unknown'] })],
    memberComputersRulesFail: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember', projectRules: 'fail', projectOwn: ['missing', 'applied', 'unknown'] })],
    memberComputersNoState: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember', projectRules: 'rulesIp' })],
    rulesChangeListBadRow: base({ projectRules: 'rulesIp', projectListMalformed: 'row' }),
    rulesChangeListBadStatus: base({ projectRules: 'rulesIp', projectListMalformed: 'status' }),
    rulesChangeListNoTotal: base({ projectRules: 'rulesIp', projectListMalformed: 'total' }),
    memberComputersRefused: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember', projectRules: 'rulesIp', projectListRefused: true })],
    rulesChangeStale: base({ projectRules: 'rulesIp', projectOwn: ['missing'], projectPut: 'stale' }),
    rulesChangeLost: base({ projectRules: 'rulesIp', projectOwn: ['missing'], projectPut: 'lost' }),
    rulesChangeLostApplied: base({ projectRules: 'rulesIp', projectOwn: ['missing'], projectPut: 'lostApplied' }),
    rulesChangeLostLate: base({ projectRules: 'rulesIp', projectOwn: ['missing'], projectPut: 'lostLate' }),
    rulesChangeLostOther: base({ projectRules: 'rulesIp', projectOwn: ['missing'], projectPut: 'lostOther' }),
    // A Full control member (no computer list for them: the confirm says so) and one at Work on (no change offered).
    rulesChangeFull: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleFull', projectRules: 'rulesIp' })],
    rulesChangeWorkOn: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember', projectRules: 'rulesIp' })],
    // The first project ('Home base', the first computer's) keeps rules of its own, and the computers read as
    // following them (scope both); `own` is the computer's own document state.
    // The cards view: atlas in every realm (one chip and +N), fjord in none ("No realm").
    cardsRealms: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, realm_ids: W.realms.map((r) => r.id) } : c.name === 'fjord' ? { ...c, realm_ids: [] } : c)) }),
    // Every computer has access rules, so each card's footer carries the longest access word ("Has access rules").
    cardsLongAccess: base({ computers: computers.map((c) => ({ ...c, has_proxy_permissions: true, proxy_permissions_scope: 'both' as const })) }),
    useRulesApplied: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied' }),
    useRulesDefault: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'default' }),
    useRulesMissing: base({ projectRules: 'rulesIp', freshScope: 'project', own: 'missing' }),
    useRulesInvalid: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'invalid' }),
    useRulesNoState: base({ projectRules: 'rulesIp', freshScope: 'both' }),
    useRulesProjectOpen: base({ projectRules: 'rulesOpenStored', freshScope: 'both', own: 'applied' }),
    useRulesStale: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'stale' }),
    useRulesLost: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'lost' }),
    useRulesLostApplied: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'lostApplied' }),
    useRulesLostLate: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'lostLate' }),
    useRulesLostOther: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'lostOther' }),
    useRulesDoneRecreate: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'doneRecreate' }),
    useRulesDoneThenFail: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'doneThenFail' }),
    useRulesLostRecreate: base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied', accessClear: 'lostRecreate' }),
    // A key without the rules leaf (unrestricted), and one holding it but limited to a realm (core refuses it the
    // project's rules, a base-host read).
    useRulesKeyNoLeaf: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read'], realm: 'all' }), ...base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied' })],
    useRulesKeyRealm: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'resources.proxy_aliases'], realm: W.projects[0]!.realm }), ...base({ projectRules: 'rulesIp', freshScope: 'both', own: 'applied' })],
    projectPeopleKeyRealm: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'projects.members.invite'], realm: W.projects[0]!.realm }), ...base({ members: 'people' })],
    projectCreateRefused: base({}, { projectCreate: answers.refused(403, 'INSUFFICIENT_PERMISSIONS') }),
    // The copy refused by the shown realm (the project is not in it), as the API answers.
    copyRealmRefused: base({}, { copy: answers.refused(403, 'INSUFFICIENT_PERMISSIONS') }),
    copySlow: base({}, { copy: answers.slow({ data: {} }, 1500) }),
    projectOutsideOnlyDown: base({ realmProjects: [], projectRead: 'down' }),
    projectOutsideOnlyHangs: base({ realmProjects: [], projectReadHangs: true }),
    projectOutsideMoves: base({ realmProjects: [], projectReadMoves: true }),
    // Nothing anywhere, and a refresh of the realm's list that does not answer.
    projectNoneRefreshing: base({ computers: [], realmProjects: [], projectsSlowLater: true }),
    /** The realm's list read again is held, then answers without any project. */
    projectsRefetchDrops: base({ projectsLater: { keep: [] } }),
    /** The computers list read again is held, then answers without its second computer. */
    listRefetchDrops: base({ listLater: { drop: 1 } }),
    /** An outside project read again by id is held, then answers renamed and recoloured (same id). */
    projectOutsideRenames: base({ realmProjects: [0], projectReadLater: { place: 1, name: 'Acme Renamed', color: '#EC4899' } }),
    /** 51 computers in 51 projects no list holds: only the first 50 are read by id. */
    missing51: base({ computers: missing51, realmProjects: [] }),
    projectEmpty: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id) }),
    projectEmptyPeople: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'peopleLab' }),
    projectEmptyPeopleFail: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'fail' }),
    projectEmptyPeople7: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'peopleLab7' }),
    projectEmptyPeopleCut: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'peopleLabCut' }),
    // A lost delete of Lab, which has people: while it is held the dialog names nobody.
    // People writes on the first project (owner: the signed-in account), and as a member at Work on.
    projectPeopleLost: base({ members: 'people', memberWrite: 'lost' }),
    projectPeopleLostLate: base({ members: 'people', memberWrite: 'lostLate' }),
    projectPeopleExists: base({ members: 'people', memberWrite: 'exists' }),
    projectPeopleNotFound: base({ members: 'people', memberWrite: 'notFound' }),
    // Check again pages through a long list: the added account lands past row 100; a later page fails; past 1,000.
    projectPeople250Applied: base({ members: 'people250', memberWrite: 'lostApplied' }),
    projectPeople250PageFails: base({ members: 'people250', memberWrite: 'lost', memberPageFails: 2 }),
    projectPeople1200Lost: base({ members: 'people1200', memberWrite: 'lost' }),
    projectPeopleRefused: base({ members: 'people', memberWrite: 'refused' }),
    projectPeopleGone: base({ members: 'people', memberWrite: 'gone' }),
    projectPeopleCutLost: base({ members: 'peopleOdd', memberWrite: 'lost' }),
    projectPeopleMember: [ownedBy('f'.repeat(24)), ...base({ members: 'peopleMember' })],
    // Experiments is someone else's, shared with the signed-in account at See, Work on or Full control; the
    // account's own list has none of its computers, but a member counts them through the project's own list
    // (the API's member view), as the owner does. 'Unknown': the member list
    // fails, so the level is not known. 55 shared projects: levels past the first MISSING_READS.
    projectManyShared: [manyShared(55), ...base({})],
    projectMemberread: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'labAsread' })],
    projectMemberedit: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'labAsedit' })],
    projectMemberdelete: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'labAsdelete' })],
    projectMemberUnknown: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'fail' })],
    // The member's count sees computers in it (their own list doesn't: the count is the project's).
    projectMemberdeleteFull: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), apiCount: computers, members: 'labAsdelete' })],
    // The member's count fails: no count is guessed.
    projectMemberdeleteCountFails: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), countDown: true, members: 'labAsdelete' })],
    // The API refuses the member's delete: the project still holds computers the count can't see (on a server the member has no access to).
    projectMemberdeleteHas: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'labAsdelete' }, { projectRemove: answers.refused(422, 'PROJECT_HAS_COMPUTERS') })],
    // The member's delete answer is lost; the project read then finds it still there, doesn't answer, or finds it gone.
    // MemberUnknownLost: the same for a level not known (the member list fails), project still there.
    projectMemberdeleteLost: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'there', members: 'labAsdelete' }, { projectRemove: unknown })],
    projectMemberdeleteLostDown: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'down', members: 'labAsdelete' }, { projectRemove: unknown })],
    projectMemberUnknownLost: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'there', members: 'fail' }, { projectRemove: unknown })],
    projectMemberdeleteLostGone: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'gone', members: 'labAsdelete' }, { projectRemove: unknown })],
    projectPendingPeople: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'there', members: 'peopleLab' }, { projectRemove: unknown }),
    projectEmptyPeopleKey: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'projects.delete', 'projects.members.invite'] }), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'peopleLab' })],
    /** The list shows Experiments empty, but the API still counts its computers (in another realm, say). */
    projectHidden: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), apiCount: computers }),
    /** The list and every count show Experiments empty, but the API refuses the delete: it holds computers this
     *  account cannot list (on a server it no longer has access to). */
    projectMemberUnknownRefused: [ownedBy('f'.repeat(24), 2), ...base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), members: 'fail' }, { projectRemove: answers.refused(422, 'PROJECT_HAS_COMPUTERS') })],
    projectRefused: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id) }, { projectRemove: answers.refused(422, 'PROJECT_HAS_COMPUTERS') }),
    /** The counts before sending show Experiments empty; a computer lands in it meanwhile, so the API refuses and the
     *  count after the refusal shows it. */
    projectRefusedListed: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), apiCount: computers, countZeroFor: 2 }, { projectRemove: answers.refused(422, 'PROJECT_HAS_COMPUTERS') }),
    /** Experiments is empty; the count just before sending answers late. */
    projectCountSlowSend: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), countSlowAt: 2 }),
    /** Experiments is empty and its delete answers "may have gone through"; reading the project then finds it
     *  gone (404), still there, or gets no answer. */
    projectPending: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'gone' }, { projectRemove: unknown }),
    projectPendingThere: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'there' }, { projectRemove: unknown }),
    /** The same lost delete, but this realm's list no longer shows Experiments while the base host still has it. */
    projectPendingOutOfView: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'there', listDropsDeleted: true }, { projectRemove: unknown }),
    /** A lost delete of Lab whose check answers gone, late; Acme is empty too, so its Delete can open meanwhile. */
    projectPendingSlowGone: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id && c.project_id !== W.projects[1]!.id), projectRead: 'goneSlow' }, { projectRemove: unknown }),
    /** The same, with every read of the project answering "still there" late. */
    projectPendingThereSlow: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'thereSlow' }, { projectRemove: unknown }),
    projectPendingDown: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), projectRead: 'down' }, { projectRemove: unknown }),
    /** The list shows Experiments empty; the API counts its computers, but its first count answers 0, late. */
    projectCountLate: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), apiCount: computers, countLateZero: true }),
    /** The API's count of a project's computers does not answer. */
    projectCountDown: base({ computers: computers.filter((c) => c.project_id !== W.projects[2]!.id), countDown: true }),
    /** Every program start, stop, restart and boot answers "may have gone through". */
    pendingPrograms: base({}, { programStart: unknown, programStop: unknown, programRestart: unknown, programBoot: unknown }),
    /** The realm's list answers 2xx without its containers array. */
    listMalformed: base({ listMalformed: true }),
    listEmptyThenMalformed: base({ listMalformed: 'afterEmpty' }),
    /** Every change is refused. */
    failedOps: base({}, {
      lifecycle: answers.refused(409, 'COMPUTER_BUSY'),
      create: answers.refused(409, 'COMPUTER_NAME_IN_USE'),
      setSshKey: answers.refused(409, 'SSH_PUBLIC_KEY_IN_USE'),
      execute: answers.refused(422, 'COMMAND_REFUSED'),
      projectCreate: answers.refused(409, 'DUPLICATE_ALIAS'),
    }),
    /** A long Servers list (18 rented servers). */
    serversMany: base({ servers: manyServers }),
    /** Free, Subservers, Bare metal and one server whose kind is not known. */
    serversKinds: base({ servers: kindServers }),
    /** The summary's slots near and at the limit: the first server is a slice reporting its room, 7 of 8 or 8 of 8, so
     *  the strip's slots cell carries the near or full upgrade link. */
    slotsNear: [reply(routes.servers, ok({ data: withRoom(7, 8) })), ...base()],
    slotsFull: [reply(routes.servers, ok({ data: withRoom(8, 8) })), ...base()],
    /** The AI usage read fails: each card says it could not be read, never 0. */
    serversAiDown: [reply(routes.aiUsage, () => (aiReads.push(Date.now()), answers.refused(500, 'SERVER_ERROR'))), ...base()],
    /** The AI usage answer stopped after the first server: the others say they were not read. */
    serversAiCapped: [reply(routes.aiUsage, aiUsage(servers.filter((v) => v.name === 'ash-3'), true)), ...base()],
    /** One server rented twice: an ended rental the list keeps, then the live one. */
    rentalHistory: [
      reply(routes.servers, ok({ data: [{ ...rentals(servers.slice(0, 1))[0], id: 'rent-old', status: 'expired', remaining_days: 0 }, { ...rentals(servers.slice(0, 1))[0], id: 'rent-new', status: 'active' }, ...rentals(servers.slice(1))] })),
      ...base(),
    ],
    serversError: [reply(routes.servers, answers.refused(500, 'SERVER_ERROR')), reply(subsListRoute, answers.refused(500, 'SERVER_ERROR')), ...base()],
    /** atlas (running) and cedar (stopped) with no server known: no program address can be built (Desktop: no address). */
    // atlas names its server but carries no server id (server_id and server.id absent).
    serverNameOnly: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, server_id: undefined, ...(c.server ? { server: { ...c.server, id: undefined } } : {}) } : c)) }),
    noServer: base({ computers: computers.map((c) => (c.name === 'atlas' || c.name === 'cedar' ? { ...c, server_name: '', server: undefined } : c)) }),
    /** Stop desktop: the display stop is refused busy (a screenshot), finds no display, is refused, or loses its
     *  answer; the session's end loses its answer, is refused, or finds the shell replaced. */
    desktopStopBusy: base({}, { displayStop: answers.refused(409, 'DISPLAY_BUSY') }),
    desktopStopGone: base({}, { displayStop: answers.refused(404, 'DISPLAY_NOT_FOUND') }),
    desktopStopDenied: base({}, { displayStop: answers.refused(403, 'PERMISSION_DENIED') }),
    // The first Stop's answer is lost; a Stop again is refused (403).
    desktopStopLostThenDenied: [
      reply(routes.displayStop, (r: FixtureRequest) => (desktopSends.push({ method: r.method, path: r.path, query: r.query, framed: false }), unknown), { times: 1 }),
      ...base({}, { displayStop: answers.refused(403, 'PERMISSION_DENIED') }),
    ],
    // The first Stop's answer is lost; a Stop again finds the display busy (409).
    desktopStopLostThenBusy: [
      reply(routes.displayStop, (r: FixtureRequest) => (desktopSends.push({ method: r.method, path: r.path, query: r.query, framed: false }), unknown), { times: 1 }),
      ...base({}, { displayStop: answers.refused(409, 'DISPLAY_BUSY') }),
    ],
    desktopStopLost: base({}, { displayStop: unknown }),
    desktopStopLostSlow: base({}, { displayStop: answers.pending5xx(502, 3000) }),
    /** The stop answers only after a minute: its send stays out (a reload meanwhile finds it sending). */
    desktopStopSlow: base({}, { displayStop: answers.slow({ ok: true }, 60000) }),
    desktopStopSlowShort: base({}, { displayStop: answers.slow({ ok: true }, 4000) }),
    desktopEndLost: base({}, { desktopEnd: unknown }),
    desktopEndLostSlow: base({}, { desktopEnd: answers.pending5xx(502, 4000) }),
    desktopEndFailed: base({}, { desktopEnd: answers.refused(400, 'VALIDATION_ERROR') }),
    desktopEndReplaced: base({}, { desktopEnd: answers.refused(409, 'INCARNATION_MISMATCH') }),
    desktopEndGone: base({}, { desktopEnd: answers.refused(404, 'SESSION_NOT_FOUND') }),
    /** A 404 or 409 without the program's own code (something in between answered): proves nothing. */
    desktopStopRoute404: base({}, { displayStop: answers.refused(404, 'NOT_FOUND') }),
    desktopEndRoute404: base({}, { desktopEnd: answers.refused(404, 'NOT_FOUND') }),
    desktopEndConflict: base({}, { desktopEnd: answers.refused(409, 'SESSION_BUSY') }),
    /** Desktop 1's session is listed without a shell id, or the list is not a list. */
    desktopNoShellId: base({ desktopSessions: [{ terminal_id: '1601', desktop_mode: true, display_id: 1601 }] }),
    desktopListOdd: base({ desktopSessions: { sessions: [] } }),
    /** The terminal program lists its environments (one not installed, one id the Hub never sends). */
    desktopEnvsListed: base({ desktopEnvs: [{ id: 'xfce', label: 'Xfce', installed: true }, { id: 'mate', label: 'MATE', installed: false }, { id: 'kde', label: 'KDE Plasma', installed: true }, { id: 'Bad Id', label: 'x' }] }),
    desktopEnvsDown: base({ desktopEnvs: 'down' }),
    /** The terminal program's session list does not answer (the Desktop tab keeps desktop 1). */
    desktopsDown: [reply(routes.desktopSessions, () => { lostReads.desktopsDown++; return answers.refused(500, 'SERVER_ERROR'); }), ...base()],
    /** The terminal program's session list gets no answer at all (the computer is not reachable). */
    desktopsLost: [reply(routes.desktopSessions, () => { lostReads.desktops++; return answers.lost(); }), ...base()],
    /** The programs overview gets no answer at all (the computer is not reachable). */
    programsLost: [reply(routes.programsOverview, () => { lostReads.programs++; return answers.lost(); }), ...base()],
    /** The programs overview answers 500 (the computer is reachable). */
    programsDown: [reply(routes.programsOverview, () => { lostReads.programsDown++; return answers.refused(500, 'SERVER_ERROR'); }), ...base()],
    programsDenied: [reply(routes.programsOverview, () => answers.refused(403, 'FORBIDDEN')), ...base()],
    /** The computer lists no program at all (the empty state's actions). */
    programsEmpty: [reply(routes.programsOverview, () => ok({ programs: [] })), ...base()],
    noUsage: [reply(routes.stats, answers.refused(500, 'SERVER_ERROR')), ...base()],
    /** The caller reaches the API over IPv6: "Only my IP" cannot be used from here. */
    accessV6: base({ myIp: '2001:db8::7' }),
    /** A group named after an id (the drawer masks it). */
    accessIdGroup: base({ accessGroup: W.projects[1]!.id }),
    /** A project rule was added after the list was read: the fresh read says so. */
    accessScopeMoved: base({ freshScope: 'project' }),
    /** The third computer's rules shut every address (Private). */
    accessShut: base({ accessShut: true }),
    /** Access writes: refused as changed elsewhere (412); answer lost, nothing written; written, answer lost. */
    accessStale: base({ accessPut: 'stale' }),
    accessLost: base({ accessPut: 'lost' }),
    accessLostApplied: base({ accessPut: 'lostApplied' }),
    accessLostLate: base({ accessPut: 'lostLate' }),
    accessLostOther: base({ accessPut: 'lostOther' }),
    /** People-or-keys steps: the second step's answer is lost, written (`Applied`) or not. */
    accessStepLost: base({ accessStepLost: { at: 2, applied: false } }),
    accessStepLostApplied: base({ accessStepLost: { at: 2, applied: true } }),
    /** The group step's answer is lost (nothing written); the group step meets changed rules (412); the second step answers late. */
    accessStepLostFirst: base({ accessStepLost: { at: 1, applied: false } }),
    accessStepStaleFirst: base({ accessStepStale: 1 }),
    accessStepSlow: base({ accessStepSlow: 2 }),
    /** An API from before the single-rule write took "*": All programs is refused as an unknown program. */
    accessWildOld: base({ accessWildOld: true }),
    /** People-or-keys steps: after the group step the next two reads of the rules fail; the step answers carry their version. */
    accessStepReadFails: base({ accessReadFails: { after: 1, reads: 2 } }),
    /** After the group step every read of the rules fails (for the shot: the browser reads more often than a test). */
    accessStepReadDown: base({ accessReadFails: { after: 1, reads: 1000 } }),
    accessStepVersioned: base({ accessStepVersioned: true }),
    /** The second step's answer is lost and it is written only after the automatic read-back; the last of three steps meets changed rules. */
    accessStepLostLate: base({ accessStepLostLate: 2 }),
    accessStepStaleLast: base({ accessStepStale: 3 }),
    /** Right after the group step, another writer adds a hook: the rules read as Advanced partway. */
    accessStepForeign: base({ accessStepForeignAfter: 1 }),
    /** The group step meets changed rules: another tab has just made a key of the same name. */
    accessStepStaleOther: base({ accessStepStaleOther: 1 }),
    /** The address in use now is not the one atlas's Only my IP rule names (the person moved). */
    accessNewIp: base({ myIp: '198.51.100.4' }),
    accessScopeLate: base({ scopeLateAfterWrite: true }),
    /** The access rules answer once; a re-read on reopening fails. */
    accessOnce: base({ accessOnce: true }),
    /** The access rules cannot be read. */
    accessError: [reply(routes.accessRules, answers.refused(500, 'SERVER_ERROR')), ...base()],
    runFailed: base({}, { execute: answers.refused(422, 'COMMAND_REFUSED') }),
    runNonZero: base({}, { execute: run({ code: 127, out: '', err: 'bash: nope: command not found\n', ms: 40 }) }),
    // The Run tab's Folder: the program refuses the folder (nothing ran), names it in a 5xx (proves nothing), or ran
    // somewhere else than asked.
    runFolderMissing: base({}, { execute: answers.refused(400, 'INVALID_CWD') }),
    runFolderBroken: base({}, { execute: answers.refused(500, 'CWD_PREPARE_FAILED') }),
    runFolderOther: base({}, { execute: run({ ...ran, cwd: '/root' }) }),
    /** atlas is in no realm (seen under All realms): the Realms fact and Advanced say what that means. */
    /** The API couldn't check atlas's proxy rules (scope 'unknown', has_proxy_permissions null). */
    scopeUnknown: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, has_proxy_permissions: null, proxy_permissions_scope: 'unknown' as const } : c)) }),
    noRealm: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, realm_ids: [] } : c)) }),
    /** The same, in a shared-access (token) session: no realm changes, so no Manage, realm buttons or Add to a realm. */
    noRealmLimited: [fixtureSession({ kind: 'token', caps: ['computers.actions.start', 'computers.actions.stop', 'computers.actions.restart', 'computers.read', 'projects.read'] }), ...base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, realm_ids: [] } : c)) })],
    /** atlas in the world's three realms, then in 30 (27 more that have no alias): the Overview's one-line Realms. */
    realms3: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, realm_ids: ['f1f1f1f1f1f1f1f1f1f1f1f1', 'f2f2f2f2f2f2f2f2f2f2f2f2', 'f3f3f3f3f3f3f3f3f3f3f3f3'] } : c)) }),
    /** The Overview of a computer whose server ended (the list leaves such a row out today; the detail must still say
     *  it plainly, with the date): atlas stopped, server_expired with its date and reason. */
    detailExpired: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, status: 'stopped', server_expired: true, server_expired_at: '2026-11-02T09:00:00Z', server_expired_reason: 'Server rental ended', ...(c.server ? { server: { ...c.server, expires_at: '2026-11-02T09:00:00Z' } } : {}) } as Computer : c)) }),
    realms30: base({ computers: computers.map((c) => (c.name === 'atlas' ? { ...c, realm_ids: ['f1f1f1f1f1f1f1f1f1f1f1f1', 'f2f2f2f2f2f2f2f2f2f2f2f2', 'f3f3f3f3f3f3f3f3f3f3f3f3', ...Array.from({ length: 27 }, (_, i) => `${(i + 16).toString(16).padStart(2, '0')}`.repeat(12))] } : c)) }),
    /** Get a computer with every server full: nothing has room, so the Server row says so and offers more room. */
    createNoRoom: [reply(routes.servers, ok({ data: rentals(servers).map((r) => ({ ...r, server: { ...r.server, is_vm: true, computer_capacity: { used: 8, max: 8 } } })) })), ...base()],
    /** A long realm list: the world's realms plus 18 more (a few named), for Get a computer's capped Other realms. */
    createManyRealms: [
      ...realmsFixture([...W.realms.map((r) => r.id), ...MANY_REALMS], Object.fromEntries(MANY_REALMS.slice(0, 6).map((id, i) => [id, ['Staging', 'Clients', 'Research', 'Ops', 'Design', 'Archive'][i]!]))),
      ...base(),
    ],
    /** Network: requests leave from the computer's own address. */
    netDirect: exitAs({ enabled: false, state: 'direct' }),
    /** Network: No internet on: the switch's three rules are there. */
    netNoInternet: [...firewallFixtureRules({ noInternet: 'on' }), ...exitAs({ enabled: false, state: 'direct' })],
    /** Network: No internet partly set: one of its three rules. */
    netNoInternetPartial: [...firewallFixtureRules({ noInternet: 'partial' }), ...exitAs({ enabled: false, state: 'direct' })],
    /** Network: an exit in use, with a login. */
    netActive: exitAs({ enabled: true, state: 'active', ...socks, auth: true }),
    /** Network: an exit from someone's own machine (hoody egress local start). */
    netLocal: exitAs({ enabled: true, state: 'active', scheme: 'socks5h', host: '127.0.0.1', port: 40001, auth: false }),
    /** Network: an older egress program that does not report whether its exit works. */
    netOld: exitAs({ enabled: true, ...socks }),
    /** Network: the exit cannot be used; requests are refused (502). */
    netUnavailable: exitAs({ enabled: true, state: 'unavailable', ...socks }),
    /** Network: an exit the program cannot read. */
    netUnnamed: exitAs({ enabled: true, state: 'unavailable' }),
    /** Network: the exit setting cannot be read. */
    netReadFailed: exitAs(null),
    /** Network: another computer of yours (on another server) is the exit, its proxy as an https upstream. */
    netVia: [reply(egressRoutes.upstream, () => ok({ enabled: true, state: 'active', scheme: 'https', host: viaHost(), port: 443, auth: false, config_path: '/hoody/storage/hoody-egress/config/upstream_proxy.txt' })), ...base()],
    /** No computer in this realm, some in others: create, or add one from another realm. */
    emptyElsewhere: importState(),
    /** The picker's list is a full page with more behind it. */
    emptyElsewhereMore: importState(ok({ data: { computers: computers, pagination: { totalPages: 2 } } })),
    /** The picker's list with atlas's colour hostile ('red;x:url()') and borealis's missing; the rest as
     *  the API gives them. */
    emptyElsewhereColours: importState(ok({ data: { computers: computers.map((c) => (c.name === 'atlas' ? { ...c, color: 'red;x:url()' } : c.name === 'borealis' ? withoutColor(c) : c)) } })),
    /** The picker's list cannot be read. */
    emptyElsewhereDown: importState(answers.refused(500, 'SERVER_ERROR')),
    /** The realm change's answer is lost (it may have gone through). */
    emptyElsewhereLost: importState(undefined, unknown),
    // The lost answer did go through: the read-back proves it.
    emptyElsewhereLanded: importState(undefined, unknown, { landed: true }),
    // The picker's first read answers, every later one fails (a refetch on reopening keeps the old rows cached).
    emptyElsewhereFlaky: importState(((): ((r: FixtureRequest) => FixtureAnswer) => { let n = 0; return () => (n++ === 0 ? ok({ data: { computers: computers, pagination: { totalPages: 1 } } }) : answers.refused(500, 'SERVER_ERROR')); })()),
    // The picker's first read answers, every later one is still on its way (the old rows stay cached meanwhile).
    emptyElsewhereSlowReopen: importState(((): ((r: FixtureRequest) => FixtureAnswer) => { let n = 0; return () => (n++ === 0 ? ok({ data: { computers: computers, pagination: { totalPages: 1 } } }) : answers.slow({ data: { computers: computers, pagination: { totalPages: 1 } } }, 60000)); })()),
    /** Storage tab: one SFTP storage connected and open as a folder. */
    storageRows: [
      ...storageRules({
        seed: {
          backends: [{ id: 'a'.repeat(16), backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: ['/mnt/hoody/box'] }],
          mounts: [{ id: 'mount_' + 'b'.repeat(32), backend_id: 'a'.repeat(16), mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' }],
        },
      }),
      ...base(),
    ],
    /** Storage tab: two storages, one open as a folder with files waiting to upload. */
    storageWaiting: [
      ...storageRules({
        seed: {
          backends: [
            { id: 'a'.repeat(16), backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: ['/mnt/hoody/box'] },
            { id: 'c'.repeat(16), backend_type: 's3', server: 's3:aws', user: '', connected: true, created_at: '2026-10-25T06:00:00Z', mount_paths: [] },
          ],
          mounts: [{ id: 'mount_' + 'b'.repeat(32), backend_id: 'a'.repeat(16), mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active', auto_deliver: true, pending_uploads: { count: 2, bytes: 2048 }, uploads: { state: 'idle', dirty: 0, open_handles: 0 } }],
          held: [{
            id: '1'.repeat(32), backend_id: 'a'.repeat(16), mount_id: 'mount_' + 'b'.repeat(32), state: 'pending', since: 1_793_000_000, file_count: 2, incomplete_count: 0, total_bytes: 2048,
            reasons: { open_when_stopped: 0, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
            deliverable: true,
            files: [{ path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }],
          }],
        },
      }),
      ...base(),
    ],
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetAccess();
  resetSnapshotTakes();
  for (const log of [aiReads, desktopSends, projectSends, projectTrace, projectCalls, sshKeySends, colourSends, copySends, removeSends, realmSends, projectRulesReads, memberReads, memberPages, memberSends, countReads]) log.length = 0;
  desktopEnded.clear();
  Object.assign(lostReads, { desktops: 0, programs: 0, desktopsDown: 0, programsDown: 0 });
  Object.assign(desktopReads, { delayNext: 0, inc: {}, status: {}, asked: 0 });
  colourLanded.shown = true;
  delete colourLanded.as;
  delete colourLanded.on;
  importLanded.shown = true;
  delete importLanded.read;
  listReads.n = 0;
  memberLate.land = false;
  countServer.holdNext = 0;
}
