// Fake-API states of the guide page for hub:dev, hub:shots, tests and specs, in core's format:
// the computer list of the one fixture world (Ada, Personal, atlas).
import { answers, defineFixtures, fixtureWorld, reply } from '@core';
import { containersRoute } from './data';

const W = fixtureWorld;
const personal = W.realms[0]!.id;
const raw = (c: (typeof W.computers)[number], over: Record<string, unknown> = {}) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  project_id: c.project_id,
  realm_ids: c.realm_ids,
  server_name: c.server_name,
  ssh_hostname: `${c.name}.ssh.hoody.network`,
  server: { city: c.server.city, country: c.server.country },
  ...over,
});
const here = W.computers.filter((c) => c.realm_ids.includes(personal));
const atlas = here.find((c) => c.name === 'atlas') ?? here[0]!;
const list = (rows: Array<Record<string, unknown>>) => [reply(containersRoute, answers.ok({ data: { computers: rows } }))];

export default defineFixtures({
  default: 'ready',
  states: {
    ready: list(here.map((c) => raw(c))),
    loading: [reply(containersRoute, answers.slow({ data: { computers: [] } }, 600000))],
    unknown: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR'))],
    noComputer: list([]),
    stopped: list([raw(atlas, { status: 'stopped' })]),
    noSsh: list([raw(atlas, { ssh_hostname: undefined })]),
    longName: list([raw(atlas, { name: 'a-computer-with-a-really-long-name-that-keeps-going' })]),
    // A 200 whose body holds no list (a read error, never "no computers").
    badBody: [reply(containersRoute, answers.ok({ data: {} }))],
    // An empty list read once, then every read fails (a refetch keeps the empty rows with the error).
    emptyThenFail: [reply(containersRoute, answers.ok({ data: { computers: [] } }), { times: 1 }), reply(containersRoute, answers.refused(500, 'SERVER_ERROR'))],
    // atlas read once, then every read fails: the facts stay (a computer is no claim of absence).
    oneThenFail: [reply(containersRoute, answers.ok({ data: { computers: [raw(atlas)] } }), { times: 1 }), reply(containersRoute, answers.refused(500, 'SERVER_ERROR'))],
    // One row on page 1 of 2: not the whole list, so that row is not "the" computer.
    onePageOfMany: [reply(containersRoute, answers.ok({ data: { computers: [raw(atlas)], pagination: { totalPages: 2 } } }))],
    // A picked computer whose node is out of shape: its addresses cannot be built.
    badNode: list([raw(atlas, { server_name: 'Bad Node!' })]),
    // Realm host scoping off, the whole account's list. Only another realm's computer: not this realm's.
    otherRealmOnly: list([raw(atlas, { realm_ids: ['f'.repeat(24)] })]),
    // This realm's one computer beside another realm's: the realm's own is its only computer.
    mixedRealms: list([raw(atlas), raw(atlas, { id: 'e'.repeat(24), name: 'far', realm_ids: ['f'.repeat(24)] })]),
  },
});
