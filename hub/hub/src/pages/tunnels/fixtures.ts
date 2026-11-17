// Fake-API states of the Tunnels page for hub:dev, hub:shots, tests and specs: core-format rules over the routes the
// page declares. The computer is the fixture world's current one (atlas). Addresses use documentation ranges.
import { answers, defineFixtures, fixtureSession, programRoutes, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { routes } from './routes';

const S1 = 'S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51';
const S2 = 'S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02';
const OLD = 'S-77aa31c5-2d4e-4b6f-8a9b-1c2d3e4f5a09';

const program = (status: string, known = true) => ({ id: 140, name: 'hoody-tunnel', status, states_known: known, hoody_kit: true, lazy_load: true, autorestart: 'always', instances: [] });
const others = ['agent', 'files', 'daemon'].map((kit, i) => ({ id: 100 + i, name: `hoody-${kit}`, status: 'running', states_known: true, hoody_kit: true, instances: [] }));
const overview = (status: string | null, known = true) => ({ programs: [...others, ...(status ? [program(status, known)] : [])], features: [] });

interface B { bindId: number; computerPort: number; bindAddr?: string }
interface Sess { sessionId: string; peerAddr: string; streams: number; max: number; expose: B[]; pull: B[] }

const two: Sess[] = [
  { sessionId: S1, peerAddr: '203.0.113.42:51234', streams: 3, max: 1024, expose: [{ bindId: 1, computerPort: 3000 }, { bindId: 2, computerPort: 5173 }], pull: [{ bindId: 3, computerPort: 5432, bindAddr: '127.0.0.1' }] },
  { sessionId: S2, peerAddr: '192.0.2.44:40112', streams: 0, max: 1024, expose: [], pull: [{ bindId: 1, computerPort: 5432, bindAddr: '127.0.0.2' }, { bindId: 2, computerPort: 6379, bindAddr: '127.0.0.1' }] },
];
const held = [{ port: 8080, kind: 'http', mode: 'expose', sessionId: OLD, bindId: 4 }];

const tunnelsOf = (ss: readonly Sess[], orphans = 0) => ({
  sessions: ss.map((s) => ({ sessionId: s.sessionId, peerAddr: s.peerAddr, protocol: 'v2', connectionsGranted: 4, activeStreams: s.streams, exposeBindings: s.expose, pullBindings: s.pull })),
  orphanedSessions: orphans,
  totalStreams: ss.reduce((n, s) => n + s.streams, 0),
  totalBindings: ss.reduce((n, s) => n + s.expose.length + s.pull.length, 0),
  fdPermitsAvailable: 900,
});
const sessionsOf = (ss: readonly Sess[]) => ({
  sessions: ss.map((s) => ({
    sessionId: s.sessionId, peerAddr: s.peerAddr, isV2: true, connectionsGranted: 4, activeStreams: s.streams, maxStreams: s.max,
    bindings: [...s.expose.map((b) => ({ ...b, kind: 'http', mode: 'expose' })), ...s.pull.map((b) => ({ ...b, kind: 'tcp', mode: 'pull' }))],
  })),
  total: ss.length,
});
const bindingsOf = (ss: readonly Sess[], extra: readonly object[] = []) => {
  const bindings = [
    ...ss.flatMap((s) => s.expose.map((b) => ({ port: b.computerPort, kind: 'http', mode: 'expose', sessionId: s.sessionId, bindId: b.bindId }))),
    ...ss.flatMap((s) => s.pull.map((b) => ({ port: b.computerPort, kind: 'tcp', mode: 'pull', sessionId: s.sessionId, bindId: b.bindId, bindAddr: b.bindAddr }))),
    ...extra,
  ];
  return { bindings, total: bindings.length };
};
const health = { status: 'ok', service: 'hoody-tunnel', built: null, started: new Date(Date.now() - 3 * 3600_000).toISOString(), memory: null, fds: 40, pid: 812, ip: '', user_agent: '' };

const never = () => new Promise<never>(() => undefined);
const running = reply(programRoutes.overview, answers.ok(overview('running')));
/** The tunnel program answering with these sessions (and listeners held for no live session). */
const live = (ss: readonly Sess[], o: { orphans?: number; extra?: readonly object[] } = {}): FixtureRule[] => [
  running,
  reply(routes.tunnels, answers.ok(tunnelsOf(ss, o.orphans ?? 0))),
  reply(routes.sessions, answers.ok(sessionsOf(ss))),
  reply(routes.bindings, answers.ok(bindingsOf(ss, o.extra))),
  reply(routes.health, answers.ok(health)),
];
/** Every tunnel read answering this way (the program running). */
const kitAll = (a: Parameters<typeof reply>[1]): FixtureRule[] => [routes.tunnels, routes.sessions, routes.bindings, routes.health].map((r) => reply(r, a));

// Disconnect: the kit's answer to the DELETE, and whether the session (with its listeners) then leaves every
// read. Sessions closed in this state are forgotten when its first /tunnels read comes (a state starts afresh).
const closed = new Set<string>();
const left = () => two.filter((x) => !closed.has(x.sessionId));
const leftHeld = () => held.filter((x) => !closed.has(x.sessionId));
const accepted = (id: string): FixtureAnswer => ({ status: 202, body: { sessionId: id, status: 'closing' }, delayMs: 200 });
const disconnecting = (answer: (id: string) => FixtureAnswer, closes: boolean, flaky = false): FixtureRule[] => [
  running,
  reply(routes.tunnels, (req) => {
    if (req.n === 1) closed.clear();
    // flaky: every odd /tunnels read after the first fails (a read-back then cannot prove anything).
    if (flaky && req.n > 1 && req.n % 2 === 1) return answers.pending5xx(503);
    return answers.ok(tunnelsOf(left(), 1));
  }),
  reply(routes.sessions, () => answers.ok(sessionsOf(left()))),
  reply(routes.bindings, () => answers.ok(bindingsOf(left(), leftHeld()))),
  reply(routes.health, answers.ok(health)),
  reply(routes.disconnect, (req) => {
    const id = decodeURIComponent(req.path.split('/').pop() ?? '');
    if (closes) closed.add(id);
    return answer(id);
  }),
];

// More rows than one page (50): one session sharing 60 web addresses.
const many: Sess[] = [{ sessionId: S1, peerAddr: '203.0.113.42:51234', streams: 12, max: 1024, expose: Array.from({ length: 60 }, (_, i) => ({ bindId: i + 1, computerPort: 3000 + i })), pull: [] }];

export default defineFixtures({
  default: 'two',
  states: {
    // Two sessions, two PULL listeners on port 5432 at different loopback addresses, a PULL listener on 127.0.0.1:6379,
    // and a listener waiting for a session that reconnects.
    two: live(two, { orphans: 1, extra: held }),
    many: live(many),
    idle: live([]),
    'nothing-shared': live([{ sessionId: S1, peerAddr: '203.0.113.42:51234', streams: 0, max: 1024, expose: [], pull: [] }]),
    // Nothing accounts for the kit's orphan count: the note says so.
    orphans: live([], { orphans: 2 }),
    // A name of its own, not 'stopped': with every page visible (the whole-Hub run), a page that has the asked state puts
    // its rules first, and other pages' 'stopped' states stop the computer itself.
    'program-stopped': [reply(programRoutes.overview, answers.ok(overview('stopped'))), ...kitAll(answers.ok({}))],
    'not-installed': [reply(programRoutes.overview, answers.ok(overview(null))), ...kitAll(answers.ok({}))],
    loading: [reply(programRoutes.overview, never), ...kitAll(never)],
    'kit-loading': [running, ...kitAll(never)],
    error: [running, ...kitAll(answers.pending5xx(503))],
    // The first read answers; every later one fails (Refresh shows the kept rows "as of").
    stale: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf(two, 1)), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf(two)), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf(two, held)), { times: 1 }),
      ...kitAll(answers.pending5xx(503)),
    ],
    // A later refresh where one read fails and the others answer empty: the last complete rows stay, never a mix.
    partial: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf(two, 1)), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf(two)), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf(two, held)), { times: 1 }),
      reply(routes.tunnels, answers.ok(tunnelsOf([]))),
      // The failure lands last, after the other two answered: nothing is shown from that refresh.
      reply(routes.sessions, answers.pending5xx(503, 400)),
      reply(routes.bindings, answers.ok(bindingsOf([]))),
      reply(routes.health, answers.ok(health)),
    ],
    // Unequal answer times, then an automatic poll where /sessions fails after the other two answered empty.
    drift: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf(two, 1)), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf(two), 250), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf(two, held), 120), { times: 1 }),
      reply(routes.tunnels, answers.ok(tunnelsOf([]))),
      reply(routes.sessions, answers.pending5xx(503, 300)),
      reply(routes.bindings, answers.ok(bindingsOf([]))),
      reply(routes.health, answers.ok(health)),
    ],
    // A later refresh whose answers do not parse: the last rows stay, with the time they were read.
    malformed: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf(two, 1)), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf(two)), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf(two, held)), { times: 1 }),
      ...kitAll(answers.ok({ error: 'not a tunnel answer' })),
    ],
    // The daemon could not read the program's state (supervisord did not answer): unknown, nothing read from it.
    'program-unknown': [reply(programRoutes.overview, answers.ok(overview('unknown', false))), ...kitAll(answers.ok({}))],
    // The computer's access settings keep the Hub out of the daemon too.
    'daemon-forbidden': [reply(programRoutes.overview, answers.refused(403, 'FORBIDDEN')), ...kitAll(answers.ok({}))],
    // Nothing connected at first; a laptop connects after the Setup panel opened (its rows are marked New).
    appears: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf([])), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf([])), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf([])), { times: 1 }),
      ...live(two).slice(1),
    ],
    // Stopped when the page opens; the laptop connects a little later (the overview's next read says running).
    starts: [reply(programRoutes.overview, answers.ok(overview('stopped')), { times: 1 }), ...live(two)],
    // The overview's later reads fail (the last answer, running, stays).
    'overview-flaky': [reply(programRoutes.overview, answers.ok(overview('running')), { times: 1 }), reply(programRoutes.overview, answers.pending5xx(502)), ...live(two).slice(1)],
    // Session S1 drops after the first read: its places wait for it under Reconnecting or closing.
    reconnects: [
      running,
      reply(routes.tunnels, answers.ok(tunnelsOf(two)), { times: 1 }),
      reply(routes.sessions, answers.ok(sessionsOf(two)), { times: 1 }),
      reply(routes.bindings, answers.ok(bindingsOf(two)), { times: 1 }),
      reply(routes.tunnels, answers.ok(tunnelsOf(two.slice(1)))),
      reply(routes.sessions, answers.ok(sessionsOf(two.slice(1)))),
      reply(routes.bindings, answers.ok(bindingsOf(two))),
      reply(routes.health, answers.ok(health)),
    ],
    // A body that is not the kit's answer: a read error, never "nothing connected".
    unreadable: [running, ...kitAll(answers.ok({ error: 'not a tunnel answer' }))],
    forbidden: [running, ...kitAll(answers.refused(403, 'FORBIDDEN'))],
    'daemon-error': [reply(programRoutes.overview, answers.pending5xx(502)), ...kitAll(answers.ok({}))],
    // Disconnect: accepted and gone at the next read; accepted but still listed (the kit has not closed it); the answer
    // lost after the kit closed it, or with the session still there; not found (already gone); refused.
    disconnect: disconnecting(accepted, true),
    'disconnect-slow': disconnecting(accepted, false),
    'disconnect-lost': disconnecting(() => answers.lost(300), true),
    'disconnect-lost-listed': disconnecting(() => answers.lost(300), false),
    // The answer lost after the kit closed it, and every other /tunnels read failing.
    'disconnect-lost-flaky': disconnecting(() => answers.lost(300), true, true),
    'disconnect-gone': disconnecting(() => ({ status: 404, body: { code: 'SESSION_NOT_FOUND', error: 'session not found' } }), true),
    'disconnect-refused': disconnecting(() => answers.refused(403, 'FORBIDDEN'), false),
    // A shared-access (token) session: the connection address is never shown.
    token: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read'] }), ...live(two, { orphans: 1, extra: held })],
  },
});
