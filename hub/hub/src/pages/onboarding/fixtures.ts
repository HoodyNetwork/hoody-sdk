// Fake-API states of the onboarding page for hub:dev, hub:shots, tests and specs, in core's format: the answers of
// the routes the page reads, built from the one fixture world (Ada and her computer atlas).
import { answers, containersRoute, defineFixtures, fixtureWorld, reply, setupFixtures, type FixtureRule } from '@core';
import { WORDED } from './questions';
import { routes } from './routes';

const W = fixtureWorld;
const atlas = W.computers[0]!;
const raw = (status: string) => ({ id: atlas.id, name: atlas.name, status, project_id: atlas.project_id, server_name: atlas.server_name, realm_ids: atlas.realm_ids, created_at: atlas.created_at });
// The setup read asks the same route with include_expired: core's setup rule answers that one, this rule the rest.
const list = (rows: Array<Record<string, unknown>>): FixtureRule => reply(containersRoute, answers.ok({ data: { computers: rows } }), { when: (r) => !r.query.include_expired });
const none = (kind: Parameters<typeof setupFixtures>[0]): FixtureRule[] => [list([]), ...setupFixtures(kind)];

// The questions the API lists (its catalogue), the answers the account has stored, and a write that answers as the
// API does: the stored row back.
const MAX: Readonly<Record<string, number>> = { first_goal: 2, main_users: 1, found_via: 1, ai_access: 8 };
const catalogue = WORDED.map((q) => ({ key: q.key, version: q.version, min_picks: 1, max_picks: MAX[q.key] ?? 1, options: [...q.options], exclusive: q.key === 'ai_access' ? ['none'] : [] }));
const stored = (key: string, options: string[] = []) => ({ question: key, version: 1, state: options.length ? 'answered' : 'skipped', options, answered_at: '2026-11-18T10:00:00.000Z' });
const asked = (answered: Array<ReturnType<typeof stored>>): FixtureRule[] => [
  reply(routes.answers, answers.ok({ data: { questions: catalogue, answers: answered } })),
  reply(routes.answer, (req) => {
    const body = (req.body ?? {}) as { version?: number; options?: string[] };
    const options = body.options ?? [];
    return answers.ok({ data: { ...stored(req.path.split('/').pop() ?? '', options), version: body.version ?? 1, changed: true } });
  }),
];
/** Nothing left to ask: every question has a stored answer or skip. The page's states are about the computer. */
const quiet = asked([stored('first_goal', ['ai_agents']), stored('main_users', ['me']), stored('found_via'), stored('ai_access', ['none'])]);

let firstReadAt = 0;
const sinceFirstRead = () => Date.now() - (firstReadAt ||= Date.now());
/** A new session starts the first run over: without this, a second boot in one process begins with the row already running. */
export function resetFixtureServer(): void {
  firstReadAt = 0;
}

export default defineFixtures({
  default: 'ready',
  states: {
    // The computer runs: every step done, Open my computer.
    ready: [list([raw('running')]), ...quiet],
    // A row exists and is still being made.
    making: [list([raw('claiming')]), ...quiet],
    // No row yet; the free-tier status says the account's server is claimed.
    reserved: none('provisioning'),
    // No row yet and the setup state does not answer: nothing is claimed either way.
    looking: [list([]), reply(containersRoute, answers.slow({ data: { computers: [] } }, 600000), { when: (r) => r.query.include_expired === 'true' })],
    // The whole first run: no row, then a row being made, then running (the page's own reads move it).
    firstRun: [
      reply(containersRoute, answers.ok({ data: { computers: [] } }), { when: (r) => !r.query.include_expired && sinceFirstRead() < 4000 }),
      reply(containersRoute, answers.ok({ data: { computers: [raw('claiming')] } }), { when: (r) => !r.query.include_expired && sinceFirstRead() < 9000 }),
      ...setupFixtures('provisioning'),
      list([raw('running')]),
      ...asked([]),
    ],
    stopped: [list([raw('stopped')]), ...quiet],
    failed: [list([raw('failed')]), ...quiet],
    // A row whose status the page cannot read: its state is unknown, never "not running".
    unknown: [list([{ ...raw('running'), status: undefined }]), ...quiet],
    invite: none('invite'),
    capacity: none('capacity'),
    unclaimed: none('empty'),
    loading: [reply(containersRoute, answers.slow({ data: { computers: [] } }, 600000))],
    // The questions, while the computer is being made: all four still to ask; only the last one; a read that fails.
    asking: [list([raw('claiming')]), ...asked([])],
    askingLast: [list([raw('claiming')]), ...asked([stored('first_goal', ['ai_agents']), stored('main_users', ['me']), stored('found_via')])],
    // The computer runs and questions are left: Open my computer stays the one accent button.
    askingReady: [list([raw('running')]), ...asked([])],
    askingUnread: [list([raw('claiming')]), reply(routes.answers, answers.refused(500, 'SERVER_ERROR'))],
    error: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR'))],
  },
});
