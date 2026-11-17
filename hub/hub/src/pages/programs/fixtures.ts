// Fake-API states of the programs page for hub:dev, hub:shots, tests and specs: core-format rules
// over the routes data.ts declares. The computer is the fixture world's current one (atlas).
import { aliasRoutes, answers, computerRuntimeRoute, defineFixtures, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { routes, scriptListRoute } from './data';
import type { RawInstance, RawOverview, RawProgram } from './logic';
import { sandboxRules } from './sandbox/fixtures';
import { sandboxRoutes } from './sandbox/routes';

const NOW = Date.now();
const ago = (sec: number) => NOW - sec * 1000;

const features = ['restart', 'boot_switch'];

const run = (port: number, uptime: number): RawInstance => ({ port, status: 'running', pid: 4000 + port, uptime_s: uptime });

const own: RawProgram[] = [
  { id: 1, name: 'web', status: 'running', states_known: true, boot: true, autorestart: 'always', hoody_kit: false, instances: [run(3000, 3 * 86400 + 7200)] },
  {
    id: 2, name: 'api', status: 'running', states_known: true, boot: false, autorestart: 'unexpected', hoody_kit: false, port_range: { start: 8000, end: 8003 },
    instances: [run(8000, 3600), run(8001, 3600), { port: 8002, status: 'stopped' }],
  },
  {
    id: 3, name: 'worker', status: 'fatal', states_known: true, boot: true, autorestart: 'always', hoody_kit: false, instances: [{ port: 0, status: 'fatal' }],
    last_result: { final: true, exit_code: 1, ended_at: ago(900), failure: 'launch_failed' },
  },
  {
    id: 4, name: 'nightly-sync', status: 'exited', states_known: true, boot: false, autorestart: 'never', hoody_kit: false,
    last_result: { final: true, exit_code: 2, ended_at: ago(7200) }, instances: [{ status: 'exited', last_result: { final: true, exit_code: 2, ended_at: ago(7200) } }],
  },
  {
    id: 5, name: 'backup', status: 'exited', states_known: true, boot: false, autorestart: 'never', hoody_kit: false,
    last_result: { final: true, exit_code: 0, ended_at: ago(30000) }, instances: [{ status: 'exited', last_result: { final: true, exit_code: 0, ended_at: ago(30000) } }],
  },
  { id: 6, name: 'docs-preview', status: 'stopped', states_known: true, boot: false, autorestart: 'never', hoody_kit: false, instances: [{ status: 'stopped' }], last_result: { ended_at: ago(86400), exit_code: 0 } },
  { id: 7, name: 'report-builder', status: 'stopped', states_known: true, lazy_load: true, hoody_kit: false, instances: [] },
  { id: 8, name: 'legacy-cron', status: 'stopped', states_known: true, enabled: false, hoody_kit: false, instances: [] },
  { id: 9, name: 'mystery', status: 'unknown', states_known: false, hoody_kit: false, instances: [] },
];

const system: RawProgram[] = ['agent', 'terminal', 'cron', 'run', 'notes', 'display', 'files', 'daemon'].map((kit, i) => ({
  id: 100 + i, name: `hoody-${kit}`, status: 'running', states_known: true, hoody_kit: true, autorestart: 'always', instances: [run(15000 + i, 5 * 86400)],
}));
const exec: RawProgram = { id: 120, name: 'hoody-exec', status: 'fatal', states_known: true, hoody_kit: true, autorestart: 'always', instances: [{ status: 'fatal' }], last_result: { final: true, exit_code: 1, ended_at: ago(300) } };

export const many: RawOverview = {
  programs: [...own, ...system, exec],
  temporary: [{ temporary_id: 'quick_1760000000_1', name: 'http-server', status: 'running', expires_at: NOW + 40 * 60000 }],
  features,
};

const attentionOnly: RawOverview = { programs: [own[2], own[3]].filter((p): p is RawProgram => !!p), features };
const small: RawOverview = { programs: [own[0], own[5]].filter((p): p is RawProgram => !!p), features };

const never = () => new Promise<never>(() => undefined);
// A system program with a port range (hoody_kit + port_range): per-port Stop/Restart ask first.
const sysRange: RawProgram = {
  id: 130, name: 'hoody-pool', status: 'running', states_known: true, hoody_kit: true, autorestart: 'always', port_range: { start: 16000, end: 16002 },
  instances: [run(16000, 3600), run(16001, 3600)],
};
const withSysRange: RawOverview = { ...many, programs: [...(many.programs ?? []), sysRange] };
// Enough programs for a second page (50 per page): job-01 … job-60, then the usual ones.
const jobs: RawProgram[] = Array.from({ length: 60 }, (_, i) => ({
  id: 200 + i, name: `job-${String(i + 1).padStart(2, '0')}`, status: 'running', states_known: true, boot: false, autorestart: 'never', hoody_kit: false, instances: [run(20000 + i, 600)],
}));
const paged: RawOverview = { ...many, programs: [...jobs, ...(many.programs ?? [])] };
let stopSent = false;
const webStopped: RawOverview = { ...many, programs: (many.programs ?? []).map((p) => (p.id === 1 ? { ...p, status: 'stopped', instances: [{ port: 3000, status: 'stopped' }] } : p)) };
const presses = (answer: Parameters<typeof reply>[1]): FixtureRule[] => [routes.start, routes.stop, routes.restart, routes.boot, routes.tempStop].map((r) => reply(r, answer));
// A restart's receipt, as the daemon answers it (RestartAnswer): restarted, stopped and not started again, not known.
const receiptDone = answers.ok({ success: true, code: null, error: null, state: 'completed', outcome: 'restarted', instances: [], row: null });
const receiptFailed = answers.ok({ success: false, code: 'START_FAILED', error: 'It was stopped and did not start again.', state: 'completed', outcome: 'failed', instances: [], row: null });
const receiptUnknown = answers.ok({ success: false, code: 'INDETERMINATE', error: null, state: 'unknown', outcome: null, instances: [], row: null });
// The computer's proxy aliases (GET /proxy/aliases), as the proxy answers them: each url is the proxy's own address for
// the alias, deliberately not the shape a page could build from the name. web's port 3000 (http); a terminal alias whose
// index is 3000 too (a program alias: an instance number, not a port); api's port 8001 (https) and its unstarted 8003 (no
// program: an older API); hoody-agent's port 15000 (a system program, which shows no aliases).
export const aliasRows = [
  { id: 'al-web', alias: 'shop-front', url: 'https://shop-front.custom-domain.example.test/', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-term', alias: 'term-desk', url: 'https://term-desk.custom-domain.example.test/', index: 3000, program: 'terminal', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-api', alias: 'api-two', url: 'https://api-two.custom-domain.example.test/v1', index: 8001, program: 'https', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-old', alias: 'api-four', url: 'https://api-four.custom-domain.example.test/', index: 8003, created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-sys', alias: 'agent-door', url: 'https://agent-door.custom-domain.example.test/', index: 15000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
];
const aliasRule = reply(aliasRoutes.list, answers.ok({ data: { aliases: aliasRows } }));
// Aliases with long names, as the API names them (a word pair and a random ending) on a long server name, one of each
// kind: a script's public link (folder 1's probe-ai.ts), a port alias, a name at the 61-character limit, a public link
// whose script is gone, a terminal and a desktop (each its instance number).
export const longAliasRows = [
  { id: 'al-long-1', alias: 'lively-harbor-aik27wtzxcjd0vw3', url: 'https://lively-harbor-aik27wtzxcjd0vw3.atlas.computers.example.test/', index: 1, program: 'exec', target_path: '/probe-ai', allow_path_override: false, created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-long-2', alias: 'humble-robin-h4fg2pflcajyi9md', url: 'https://humble-robin-h4fg2pflcajyi9md.atlas.computers.example.test/', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-long-3', alias: 'customer-portal-staging-environment-for-the-spring-release-v2', url: 'https://customer-portal-staging-environment-for-the-spring-release-v2.atlas.computers.example.test/', index: 8001, program: 'https', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-long-4', alias: 'quiet-otter-p2k9d7fh1smq0x', url: 'https://quiet-otter-p2k9d7fh1smq0x.atlas.computers.example.test/', index: 1, program: 'exec', target_path: '/old-report', allow_path_override: false, created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-long-5', alias: 'brave-falcon-7tq2m', url: 'https://brave-falcon-7tq2m.atlas.computers.example.test/', index: 2, program: 'terminal', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-long-6', alias: 'calm-meadow-z8r1v', url: 'https://calm-meadow-z8r1v.atlas.computers.example.test/', index: 1, program: 'display', created_at: '2026-10-20T10:00:00Z' },
];
/** Folder 1's scripts (GET /api/v1/exec/scripts/list), as Exec lists them: probe-ai.ts and a labelled weather script. */
export const folderScripts = { scripts: [{ path: 'probe-ai.ts', isDirectory: false }, { path: 'api/weather.ts', isDirectory: false, magicComments: { label: 'Weather' } }, { path: 'api', isDirectory: true }] };
// Tests only: aliases whose url is not an absolute http(s) address (relative, scheme-relative, malformed, another
// scheme, a script), beside one good https alias. Only the good one may open or copy.
export const oddAliasRows = [
  { id: 'al-rel', alias: 'rel-path', url: '/keys', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-sch', alias: 'no-scheme', url: '//evil.test', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-bad', alias: 'malformed', url: 'http//x', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-ftp', alias: 'ftp-site', url: 'ftp://x', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-js', alias: 'script-url', url: 'javascript:alert(1)', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
  { id: 'al-ok', alias: 'good-one', url: 'https://good-one.custom-domain.example.test/', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' },
];
// The computer's listeners (GET /computers/:id?runtime=true) for the Ports & aliases tab: web's 3000 and api's 8001 (web),
// postgres (not a web port), a debugger only inside the computer, a Hoody kit plugin's web port (no alias offered), and
// Hoody's own sshd and ttyd (counted, not listed).
export const listeners = [
  { port: 3000, program: 'node', protocol: 'tcp', ip: '0.0.0.0' },
  { port: 8001, program: 'node', protocol: 'tcp', ip: '0.0.0.0' },
  { port: 5432, program: 'postgres', protocol: 'tcp', ip: '0.0.0.0' },
  { port: 9229, program: 'node', protocol: 'tcp', ip: '127.0.0.1' },
  { port: 4100, program: 'node', protocol: 'tcp', ip: '0.0.0.0', args: 'node /hoody/plugins/hoody-notes/main.js' },
  { port: 22, program: 'sshd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/sbin/sshd' },
  { port: 7681, program: 'ttyd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/bin/ttyd' },
];
const runtimeOf = (services: readonly object[]) => answers.ok({ data: { runtime_info: { network_services: services, terminals: [], displays: [] } } });
const runtimeRule = reply(computerRuntimeRoute, runtimeOf(listeners));
const done = [...presses(answers.ok({ ok: true })), reply(routes.restartReceipt, receiptDone), ...sandboxRules, aliasRule, runtimeRule];
const list = (ov: RawOverview): FixtureRule[] => [reply(routes.overview, answers.ok(ov)), ...done];
const failing = (a: Parameters<typeof reply>[1]): FixtureRule[] => [reply(routes.overview, a), ...done];
/** Tests only: how many overview reads the 'unreachable' state left unanswered. */
export const lostReads = { overview: 0 };
/** Tests only: the alias list reads of the 'aliases-fail-once' state; its first one is refused, the rest answer. */
export const aliasReads = { n: 0 };
const aliasFailOnce = reply(aliasRoutes.list, () => (aliasReads.n++ === 0 ? answers.refused(500, 'INTERNAL') : answers.ok({ data: { aliases: aliasRows } })));
// The 'aliases-held' state's alias list reads: each one waits until a test calls aliasHold.release(), which answers every
// read waiting then with the usual list (`out`: how many wait now). In hub:dev the first read never answers.
const aliasWaiting: ((a: FixtureAnswer) => void)[] = [];
/** Tests only: the held alias list reads of the 'aliases-held' state. */
export const aliasHold = {
  get out(): number { return aliasWaiting.length; },
  release(): void { for (const done of aliasWaiting.splice(0)) done(answers.ok({ data: { aliases: aliasRows } })); },
};
const aliasHeld = reply(aliasRoutes.list, () => new Promise<FixtureAnswer>((done) => { aliasWaiting.push(done); }));

export default defineFixtures({
  default: 'many',
  states: {
    many: list(many),
    small: list(small),
    // web stopped with its port 3000 (the inspector still gives the port's address).
    'web-stopped': list(webStopped),
    // The alias list read fails once (the overview answers): a failed read shows its own line, Try again reads it again.
    'aliases-fail-once': [reply(routes.overview, answers.ok(many)), aliasFailOnce, ...done],
    // The alias list read is out and has not answered (aliasHold): each port's address says its aliases are being read
    // (with hoody-pool, a system program with a port range, which shows no aliases).
    'aliases-held': [reply(routes.overview, answers.ok(withSysRange)), aliasHeld, ...done],
    // An 18-port range with no instance (more ports than the model offers as stopped parts).
    'big-range': list({ ...many, programs: [...(many.programs ?? []), { id: 40, name: 'shards', status: 'stopped', states_known: true, boot: false, autorestart: 'never', hoody_kit: false, port_range: { start: 9000, end: 9017 }, instances: [] }, { id: 41, name: 'shards-wide', status: 'stopped', states_known: true, boot: false, autorestart: 'never', hoody_kit: false, port_range: { start: 9100, end: 9139 }, instances: [] }] }),
    // The Ports & aliases tab's own states: the listener read out, refused, or empty, and no alias yet.
    'ports-loading': [reply(routes.overview, answers.ok(many)), reply(computerRuntimeRoute, never), reply(aliasRoutes.list, never), ...done],
    'ports-error': [reply(routes.overview, answers.ok(many)), reply(computerRuntimeRoute, answers.refused(500, 'INTERNAL')), reply(aliasRoutes.list, answers.refused(500, 'INTERNAL')), ...done],
    'ports-empty': [reply(routes.overview, answers.ok(many)), reply(computerRuntimeRoute, runtimeOf([{ port: 22, program: 'sshd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/sbin/sshd' }])), reply(aliasRoutes.list, answers.ok({ data: { aliases: [] } })), ...done],
    // The person's own program named agent (a home path) on 3000, beside Hoody's sshd: the agent is theirs.
    'ports-own-agent': [reply(routes.overview, answers.ok(many)), reply(computerRuntimeRoute, runtimeOf([{ port: 3000, program: 'agent', protocol: 'tcp', ip: '0.0.0.0', path: '/home/me/agent/bin/agent' }, { port: 22, program: 'sshd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/sbin/sshd' }])), ...done],
    // The system's avahi-daemon (network discovery) on its three UDP ports, beside one web port and Hoody's sshd: counted, not listed.
    'ports-avahi': [reply(routes.overview, answers.ok(many)), reply(computerRuntimeRoute, runtimeOf([
      { port: 3000, program: 'node', protocol: 'tcp', ip: '0.0.0.0' },
      ...[5353, 34135, 39180].map((port) => ({ port, program: 'avahi-daemon', protocol: 'udp', ip: '0.0.0.0', path: '/usr/sbin/avahi-daemon', args: 'avahi-daemon: running [atlas.local]' })),
      { port: 22, program: 'sshd', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/sbin/sshd' },
    ])), ...done],
    // Long alias names on a long server name (longAliasRows).
    'ports-long': [reply(routes.overview, answers.ok(many)), reply(aliasRoutes.list, answers.ok({ data: { aliases: longAliasRows } })), reply(scriptListRoute, answers.ok(folderScripts)), ...done],
    // The same aliases while folder 1's script list is refused: a public link names its path, unchecked.
    'ports-long-noscripts': [reply(routes.overview, answers.ok(many)), reply(aliasRoutes.list, answers.ok({ data: { aliases: longAliasRows } })), reply(scriptListRoute, answers.refused(500, 'INTERNAL')), ...done],
    'ports-odd-urls': [reply(routes.overview, answers.ok(many)), reply(aliasRoutes.list, answers.ok({ data: { aliases: oddAliasRows } })), ...done],
    attention: list(attentionOnly),
    empty: list({ programs: [], features }),
    loading: failing(never),
    error: failing(answers.refused(500, 'INTERNAL')),
    // The computer did not answer at all: the not-reachable state, never the generic error.
    unreachable: failing(() => { lostReads.overview++; return answers.lost(); }),
    private: failing(answers.refused(403, 'FORBIDDEN')),
    old: failing(answers.refused(404, 'NOT_FOUND')),
    // Presses that do not end well: the row keeps the outcome until the user checks or dismisses it.
    'press-pending': [reply(routes.overview, answers.ok(many)), ...presses(answers.pending5xx()), reply(routes.restartReceipt, receiptUnknown), ...sandboxRules, aliasRule],
    // Presses stay unknown, so the held op (and the port it was sent for) can be read.
    paged: list(paged),
    'system-range': [reply(routes.overview, answers.ok(withSysRange)), ...presses(answers.pending5xx()), reply(routes.restartReceipt, receiptUnknown)],
    // A restart that may have gone through, whose receipt then proves it applied.
    'receipt-done': [reply(routes.overview, answers.ok(many)), ...presses(answers.pending5xx()), reply(routes.restartReceipt, receiptDone)],
    // A stop of web that may have gone through; every read of the list after it shows web stopped.
    'press-proved': [
      reply(routes.overview, (req) => {
        if (req.n === 1) stopSent = false;
        return answers.ok(stopSent ? webStopped : many);
      }),
      reply(routes.stop, () => {
        stopSent = true;
        return answers.pending5xx();
      }),
      ...presses(answers.pending5xx()),
      reply(routes.restartReceipt, receiptUnknown),
    ],
    // A restart that may have gone through, whose receipt then says it stopped and did not start again.
    'receipt-failed': [reply(routes.overview, answers.ok(many)), ...presses(answers.pending5xx()), reply(routes.restartReceipt, receiptFailed)],
    'press-failed': [reply(routes.overview, answers.ok(many)), ...presses(answers.refused(409, 'START_FAILED')), reply(routes.restartReceipt, receiptDone), ...sandboxRules, aliasRule],
    'press-slow': [reply(routes.overview, answers.ok(many)), ...presses(answers.ok({ ok: true }, 4000)), reply(routes.restartReceipt, receiptDone), ...sandboxRules, aliasRule],
    // New program's send has no answer (502): the drawer holds it, and Check again reads the list (never there).
    'add-unknown': [reply(routes.overview, answers.ok(many)), reply(sandboxRoutes.add, answers.pending5xx()), ...done],
    // The Apps tab's own states (pages/apps/fixtures.ts, by the same names): this page's list answers as usual under them.
    'no-open': list(many),
    'open-error': list(many),
    held: list(many),
    'stop-pending': list(many),
    board: list(many),
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  stopSent = false;
  lostReads.overview = 0;
  aliasReads.n = 0;
}
