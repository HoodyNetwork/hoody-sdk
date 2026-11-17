// Fake-API states of the Board for hub:dev, hub:shots, tests and specs, in core's format. The Board reads the
// realm's computer list (core's containersRoute; core's fixtures answer it from fixtureWorld by default) and sends
// Start / Resume through core's lifecycle change.
// States: default (the fixture world; Start / Resume answer ok), failed (the list read fails), slow (the list never
// answers in time), empty (no computers in the realm), needsLook (cedar expired, fjord failed, borealis suspended
// and moved into the realm), expiredGone (cedar's server's rental ended: the list leaves cedar out, and the read with
// include_expired has it stopped with server_expired, as the API answers), rentalEnds (the same for the computers a
// test names with setRentalEnded, none at first), powerUnknown (Start / Resume get a gateway error: may have gone through),
// oneComputer (the realm holds atlas only; its browser starts and opens outside links as the default's),
// noneRunning (cedar and fjord: no computer runs, so none is remembered),
// powerRefused (Start / Resume are refused), flaky (the default, except that the list read fails while setListDown(true)
// holds: page tests turn it on and off).
// A running computer's picker extras (extras.ts) read the daemon overview (one program of yours on port 3000, one on
// a port range 8080-8081, one system kit) and the Exec list (two served scripts, one dynamic that is left out).
// A running computer's terminal sessions (termSessions.ts) are terminal-1 (bash in /home/user, one window open);
// state sessions lists more (one whose shell ended, an ssh one, a program's terminal, a short-lived one and one
// outside the Board's numbers), and sessionsFailed cannot read them. Change shell ends a session and starts
// it again: both answer ok. Notes lists two notebooks the viewer can open (Team, Personal) and one it cannot;
// Team holds three pages (Roadmap, an untitled one, Release notes) and a folder.
// Browsers: no browser runs until a start is answered (ok), then every DevTools read answers with a cdp
// address; state browserUp has one running from the start (the DevTools dialog's Open and Copy).
// Outside links: a browse opens its address as a new tab (ok) only when it is asked exactly as the Board asks it
// (url, start=false, waitUntil=commit, a timeout, nothing else) and only for example.org, so a spec that sees a
// browser tile knows the host it named is the one sent; any other host is refused (the browser did not open it).
// browsed lists the addresses sent this run. States: browserReadFailed (the DevTools read fails: nothing is started
// or sent), browserStartPending (the start's answer is lost), browsePending (the browse's answer is lost).
// The editor's extensions: Python, Prettier and ESLint installed, Go staged for the next start.
// Virtual machine: state vmServers puts atlas on bare metal that can run VMs, cedar on bare metal whose check
// is too old, fjord on bare metal that cannot, and leaves the rest on shared servers (the world's default).
// Computer colours: state colours gives every computer of the world its colour as the API would (atlas blue,
// borealis amber, granite white, harbor near-black), cedar a value that is not a hex colour (drawn as none), and
// answers the whole world's list whatever realm shows, so All realms has computers of every realm.
// Boards themselves live in this browser's storage, not in the API: shots and tests seed them through core's prefs.
import { FIXTURE_REALM, answers, boardFixtureRoute, computerLifecycleRoute, containersRoute, defineFixtures, fixtureWorld, programRoutes, reply } from '@core';
import { scriptList } from './extras';
import { SESSIONS_PATH } from './termSessions';

// Computer colours are API data the Board shows, not Hub colours (an exception in exceptions.ts).
const COLOURS: Readonly<Record<string, string>> = { atlas: '#3B82F6', borealis: '#f59e0b', cedar: 'red;x:url()', dune: '#abc', ember: '#EF4444', fjord: '#10B981', granite: '#FFFFFF', harbor: '#111111' };
const coloured = () => fixtureWorld.computers.map((c) => ({ ...c, color: COLOURS[c.name] }));

const NEEDS_LOOK: Readonly<Record<string, string>> = { cedar: 'expired', fjord: 'failed', borealis: 'suspended' };
const needsLook = () =>
  fixtureWorld.computers
    .filter((c) => c.realm_ids.includes(FIXTURE_REALM) || c.name in NEEDS_LOOK)
    .map((c) => (c.name in NEEDS_LOOK ? { ...c, status: NEEDS_LOOK[c.name] } : c));
const withoutCedar = () => fixtureWorld.computers.filter((c) => c.name !== 'cedar');
const cedarEnded = () => fixtureWorld.computers.map((c) => (c.name === 'cedar' ? { ...c, status: 'stopped', server_expired: true } : c));
// State rentalEnds: the computers named here (setRentalEnded; none at first) have their server's rental ended: the list
// leaves them out and the read with include_expired has them stopped with server_expired. A test ends one while the Board is open.
let rentalEnded: readonly string[] = [];
export function setRentalEnded(names: readonly string[]): void { rentalEnded = names; }
const powerOk = reply(computerLifecycleRoute, answers.ok({ data: {} }));
const VM_SERVERS: Readonly<Record<string, Record<string, unknown>>> = {
  atlas: { is_free: false, kvm_supported: true },
  cedar: { is_free: false, kvm_supported: null },
  fjord: { is_free: false, kvm_supported: false },
};
const vmServers = () =>
  fixtureWorld.computers
    .filter((c) => c.realm_ids.includes(FIXTURE_REALM))
    .map((c) => (c.name in VM_SERVERS ? { ...c, server: { ...c.server, ...VM_SERVERS[c.name] } } : c));
const extras = [
  reply(programRoutes.overview, answers.ok({
    programs: [
      { id: 1, name: 'shop', status: 'running', instances: [{ port: 3000, status: 'running' }] },
      { id: 2, name: 'api', status: 'running', port_range: { start: 8080, end: 8081 }, instances: [{ port: 8080, status: 'running' }, { port: 8081, status: 'running' }] },
      { id: 3, name: 'hoody-terminal', hoody_kit: true, status: 'running', instances: [{ port: 7681, status: 'running' }] },
    ],
  })),
  reply(scriptList, answers.ok({ scripts: [{ path: 'default/1/index.ts' }, { path: 'default/1/orders/list.ts' }, { path: 'default/1/orders/[id].ts' }] })),
];

const sessionsRoute = boardFixtureRoute('terminal', 'GET', SESSIONS_PATH);
const ago = (s: number) => Math.floor(Date.now() / 1000) - s;
const BASH1_INC = 'a'.repeat(32);
const bash1 = () => ({ id: '1', terminal_id: '1', shell: '/bin/bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: false, client_count: 1, last_activity: ago(120), cwd: '/home/user', ssh_host: null, ssh_user: null, ssh_port: null, incarnation: BASH1_INC });
// The ssh sessions Connect over SSH made in this run (the default state lists them after terminal-1, as the terminal
// would): resetFixtureSessions() forgets them (page tests, before each test).
const made = new Map<number, Record<string, unknown>>();
// terminal-1 ended by Change shell and not started again: not listed, and an exclusive create there goes through.
let bash1Ended = false;
// A browser start was answered in this run: DevTools reads answer from then on (the fixtures cannot tell browser numbers apart).
let browserStarted = false;
// The addresses outside links sent to a browse this run, in order.
export const browsed: string[] = [];
export function resetFixtureSessions(): void { made.clear(); bash1Ended = false; browserStarted = false; browsed.length = 0; }
const shellChange = [
  // As the terminal: the DELETE ends terminal-1 only while it runs the shell named, and an exclusive create on
  // terminal-1 is refused until it has ended (so a change that skipped the ending could not start the new shell).
  reply(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/1'), (req) => {
    if (bash1Ended) return { status: 404, body: { success: false, code: 'NOT_FOUND', error: 'no such session' } };
    if (req.query.incarnation !== BASH1_INC) return { status: 409, body: { success: false, code: 'INCARNATION_MISMATCH', error: 'nothing was deleted' } };
    bash1Ended = true;
    return { status: 200, body: { success: true, incarnation: BASH1_INC } };
  }),
  reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const n = Number(b.terminal_id);
    if (b.exclusive === true && (made.has(n) || (n === 1 && !bash1Ended))) return { status: 409, body: { success: false, code: 'SESSION_EXISTS', error: 'session exists' } };
    if (typeof b.ssh_host === 'string' && !made.has(n)) {
      made.set(n, { id: String(n), terminal_id: String(n), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, last_activity: ago(1), cwd: '/home/user', ssh_host: b.ssh_host, ssh_user: b.ssh_user, ssh_port: b.ssh_port });
    }
    if (n === 1) bash1Ended = false;
    return { status: 200, body: { success: true, incarnation: 'b'.repeat(32) } };
  }),
];
const sessions = [reply(sessionsRoute, () => ({ status: 200, body: [...(bash1Ended ? [] : [bash1()]), ...made.values()] })), ...shellChange];
const moreSessions = reply(sessionsRoute, () => ({
  status: 200,
  body: [
    bash1(),
    { id: '4', terminal_id: '4', shell: 'zsh', is_active: false, daemon_program: false, is_ephemeral: false, client_count: 0, last_activity: ago(7200), cwd: '/srv/app' },
    { id: '7', terminal_id: 7, shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 2, last_activity: ago(30), cwd: '/home/ops', ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 2222 },
    { id: '9', terminal_id: '9', shell: null, is_active: true, daemon_program: true, daemon: { program_name: 'console' }, client_count: 0, last_activity: null, cwd: '/opt/console' },
    { id: '8', terminal_id: '8', shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: true, is_ssh: true, client_count: 0, cwd: '/tmp', ssh_host: 'cache.example.com', ssh_user: 'ops', ssh_port: 22 },
    { id: '15001', terminal_id: '15001', shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 0 },
    // A launch's terminal in the Hub's launch band: Open by number opens it as a terminal, never as a display (sessionNumber.ts).
    { id: '8502', terminal_id: 8502, shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 1 },
  ],
}));

// flaky: the computer list read fails while this holds (setListDown; page tests reset it).
let listDown = false;
export function setListDown(down: boolean): void { listDown = down; }
// While a failing read is held (tests set wait), its answer waits for the promise: the read is still out.
export const holdList: { wait: Promise<void> | null } = { wait: null };

export const NOTES_USER = 'a1b2c3d4e5f6a7b8c9d0e1f2';
export const NOTES_TEAM = 'b1b2c3d4e5f6a7b8c9d0e1f2';
export const NOTES_ROADMAP = 'c1b2c3d4e5f6a7b8c9d0e1f2';
const notes = [
  reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), answers.ok({
    notebooks: [
      { id: NOTES_TEAM, name: 'Team', user: { id: NOTES_USER, role: 'owner' }, status: 1 },
      { id: 'd1b2c3d4e5f6a7b8c9d0e1f2', name: 'Personal', user: { id: 'e1b2c3d4e5f6a7b8c9d0e1f2', role: 'collaborator' }, status: 1 },
      { id: 'f1b2c3d4e5f6a7b8c9d0e1f2', name: 'Hidden', user: { id: NOTES_USER, role: 'none' }, status: 1 },
    ],
  })),
  reply(boardFixtureRoute('notes', 'GET', `/api/v1/notes/notebooks/${NOTES_TEAM}/nodes`), answers.ok({
    nodes: [
      { id: NOTES_ROADMAP, type: 'page', name: 'Roadmap', rootId: 'x', parentId: 'x' },
      { id: 'c2b2c3d4e5f6a7b8c9d0e1f2', type: 'page', name: '', rootId: 'x', parentId: 'x' },
      { id: 'c3b2c3d4e5f6a7b8c9d0e1f2', type: 'page', name: 'Release notes', rootId: 'x', parentId: 'x' },
      { id: 'c4b2c3d4e5f6a7b8c9d0e1f2', type: 'folder', name: 'Archive', rootId: 'x', parentId: 'x' },
    ],
    total: 4,
  })),
];

const codeExtension = (publisher: string, name: string) => ({ logicalKey: `${publisher}.${name}`, publisher, name, stagedVersion: null, installedVersion: '1.0.0', status: 'running', reason: '', installedOnly: true });
const codeExtensions = reply(boardFixtureRoute('code', 'GET', '/api/v1/code/extensions/list'), answers.ok({
  instance: { id: 1, state: 'running', startedAt: null },
  observed: { status: 'ok', scope: 'instance', instanceId: 1, extensions: [codeExtension('ms-python', 'python'), codeExtension('esbenp', 'prettier-vscode'), codeExtension('dbaeumer', 'vscode-eslint')] },
  desired: { status: 'ok', scope: 'shared-across-instances', extensions: [{ fileName: 'go.vsix', status: 'ok', reason: null, scannable: true, canonicalName: true, logicalKey: 'golang.go', publisher: 'golang', name: 'go', version: '0.42.0', targetPlatform: null, sha256: null, sizeBytes: 1, stagedAt: null }] },
  partial: false,
  message: '',
}));

const CDP = { webSocketDebuggerUrl: 'wss://p0000-c0a715-cdp-1.computers.example/devtools/browser/0b1c', devtoolsHttpUrl: 'https://p0000-c0a715-cdp-1.computers.example/json/version' };
const browsers = [
  reply(boardFixtureRoute('browser', 'GET', '/api/v1/browser/start'), () => { browserStarted = true; return answers.ok({ sessionId: 'f8e9d7c6', browserName: 'chromium' }); }),
  reply(boardFixtureRoute('browser', 'GET', '/api/v1/browser/devtools-url'), () => (browserStarted ? answers.ok(CDP) : answers.refused(404, 'NOT_FOUND'))),
];
const browserUp = reply(boardFixtureRoute('browser', 'GET', '/api/v1/browser/devtools-url'), answers.ok(CDP));
const BROWSE_KEYS = ['start', 'timeoutMs', 'url', 'waitUntil'];
const browseRoute = boardFixtureRoute('browser', 'GET', '/api/v1/browser/browse');
const browse = reply(browseRoute, (req) => {
  const q = req.query;
  const url = q.url ?? '';
  browsed.push(url);
  const asked = Object.keys(q).sort().join() === BROWSE_KEYS.join() && q.start === 'false' && q.waitUntil === 'commit';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* refused below */ }
  return asked && host === 'example.org' ? answers.ok({ success: true, tabId: 'tab-2', url }) : answers.refused(400, 'NAVIGATION_FAILED');
});

export default defineFixtures({
  default: 'default',
  states: {
    default: [powerOk, ...extras, ...sessions, ...notes, ...browsers, browse, codeExtensions],
    browserUp: [powerOk, ...extras, ...sessions, ...notes, browserUp, browse],
    browserReadFailed: [powerOk, ...extras, ...sessions, reply(boardFixtureRoute('browser', 'GET', '/api/v1/browser/devtools-url'), answers.refused(500, 'SERVER_ERROR')), browse],
    browserStartPending: [powerOk, ...extras, ...sessions, reply(boardFixtureRoute('browser', 'GET', '/api/v1/browser/start'), answers.pending5xx()), browsers[1]!, browse],
    browsePending: [powerOk, ...extras, ...sessions, browserUp, reply(browseRoute, (req) => { browsed.push(req.query.url ?? ''); return answers.pending5xx(); })],
    sessions: [powerOk, ...extras, moreSessions, ...shellChange],
    sessionsFailed: [powerOk, ...extras, reply(sessionsRoute, answers.refused(500, 'SERVER_ERROR')), ...shellChange],
    failed: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR'))],
    slow: [reply(containersRoute, answers.slow({ data: { computers: [] } }, 600000))],
    empty: [reply(containersRoute, answers.ok({ data: { computers: [] } }))],
    needsLook: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: needsLook() } } })), powerOk, ...extras, ...sessions],
    expiredGone: [
      reply(containersRoute, () => ({ status: 200, body: { data: { computers: cedarEnded() } } }), { when: (req) => req.query.include_expired === 'true' }),
      reply(containersRoute, () => ({ status: 200, body: { data: { computers: withoutCedar() } } }), { when: (req) => req.query.include_expired !== 'true' }),
      powerOk, ...extras, ...sessions,
    ],
    rentalEnds: [
      reply(containersRoute, () => ({ status: 200, body: { data: { computers: fixtureWorld.computers.map((c) => (rentalEnded.includes(c.name) ? { ...c, status: 'stopped', server_expired: true } : c)) } } }), { when: (req) => req.query.include_expired === 'true' }),
      reply(containersRoute, () => ({ status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => !rentalEnded.includes(c.name)) } } }), { when: (req) => req.query.include_expired !== 'true' }),
      powerOk, ...extras, ...sessions,
    ],
    powerUnknown: [reply(computerLifecycleRoute, answers.pending5xx())],
    powerRefused: [reply(computerLifecycleRoute, answers.refused(409, 'INVALID_STATE'))],
    oneComputer: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => c.name === 'atlas') } } })), powerOk, ...extras, ...sessions, ...notes, ...browsers, browse],
    noneRunning: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => c.name === 'cedar' || c.name === 'fjord') } } })), powerOk],
    vmServers: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: vmServers() } } })), powerOk, ...extras, ...sessions],
    colours: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: coloured() } } })), powerOk, ...extras, ...sessions],
    flaky: [reply(containersRoute, async () => { if (holdList.wait) await holdList.wait; return answers.refused(500, 'SERVER_ERROR'); }, { when: () => listDown }), powerOk, ...extras, ...sessions, ...notes],
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetFixtureSessions();
  listDown = false;
  holdList.wait = null;
}
