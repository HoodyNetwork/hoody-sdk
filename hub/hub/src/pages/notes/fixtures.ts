// Fake-API states of the notes page for hub:dev, hub:shots, tests and specs (names from fixtureWorld only).
// States: default (a mix of computers), none, onlyStopped, loading, error (every Notes unreachable), empty, emptyRunning
// (only the running computers, each with no note), mixed (one of each refusal), refusals (the other four), many (ten notes
// on each computer), pages (twenty), long (long titles, a partial list),
// noPlace (notes but nowhere to add one), createPending (the New note answer is lost), createFound (lost, but the note is there),
// createNotSent, createFailed (Notes refuses), createProtected, createTaken (the id was taken once), downloadFailed, downloadTooBig,
// colours (each computer takes its core worldColours value; cedar's is not a hex colour, so it draws no mark),
// computersPending, computersFailed (the computer list never answers, or fails: the agent prompt keeps a filtered id),
// hostileId (atlas's Notes answers a notebook id no command can carry), nine (a ninth running computer, past the page's
// first MAX_COMPUTERS, with notes of its own: a copied link to one still opens), noAddress (atlas has no routing host, so
// its Notes has no web address: Copy link is disabled with its reason).
import { defineFixtures, type MutationAnswer, type QueryAnswer } from '@app/fixtures';
import { fixtureWorld, manyComputers, worldColours } from '@core';
import type { Computer, FxNotes, NoteRow } from './types';
import { fixtureApi, resetFixtureServer as resetApi } from './fixtureApi';
import { installFixtureApi } from './fixtureApiSeam';

installFixtureApi(fixtureApi);

const W = fixtureWorld.computers;
// Relative to the page's own clock, so "Changed" never reads as the future.
const base = Date.now();
const MIN = 60_000;
const ago = (min: number): number => base - min * MIN;
const nid = (n: number): string => ('0a1b2c3d4e5f6a7b8c9d0e1f' + n.toString(16)).slice(-24);

const stateOfStatus = (s: string): Computer['state'] => (s === 'running' ? 'running' : s === 'stopped' || s === 'paused' ? 'stopped' : s === 'creating' ? 'starting' : 'attention');
const computers: Computer[] = W.map((c) => ({ id: c.id, projectId: c.project_id, name: c.name, serverName: c.server_name, state: stateOfStatus(c.status), realms: c.realm_ids }));
// The ninth computer (state nine): a world-made name, running, after the eight.
const ninth: Computer = (([c]) => ({ id: c!.id, projectId: c!.project_id, name: c!.name, serverName: c!.server_name, state: stateOfStatus(c!.status), realms: c!.realm_ids }))(manyComputers(1, 9));
const idOf = (name: string): string => (W.find((c) => c.name === name) as { id: string }).id;

let seq = 1;
const note = (title: string, section: string, min: number | null, hasBody = true): NoteRow => ({ id: nid(seq++), title, section, at: min === null ? null : ago(min), hasBody });
const PLACE = { parentId: nid(900), section: 'Work' };
const ok = (notes: NoteRow[], extra: Partial<FxNotes> = {}): FxNotes => ({ state: 'ok', notes, place: PLACE, ...extra });

const atlasNotes = (): NoteRow[] => [
  note('Weekly plan', 'Work', 12),
  note('Deploy checklist', 'Work', 95),
  note('Reading list', 'Personal', 60 * 7),
  note('Meeting notes: storefront review', 'Work', 60 * 26),
  note('Trip ideas', 'Personal', 60 * 24 * 4, false),
  note('Backup schedule', 'Projects', 60 * 24 * 9),
];
const borealisNotes = (): NoteRow[] => [
  note('Staging release notes', 'Work', 40),
  note('Customer feedback', 'Work', 60 * 5),
  note('Launch timeline', 'Projects', 60 * 24 * 3),
  note('Open questions', 'Work', null),
];

const TITLES = ['Weekly plan', 'Deploy checklist', 'Reading list', 'Meeting notes', 'Trip ideas', 'Backup schedule', 'Release notes', 'Customer feedback', 'Launch timeline', 'Open questions', 'Schema changes', 'Index review'];
const LONG = ['A very long note title that goes on and on to show how the table cuts it at the end of the line: quarterly review of the storefront staging environment and its deploy checklist', 'Notes from the meeting about the backup schedule, retention, restore tests and who is on call next week'];
const many = (offset: number, long = false, n = 10): NoteRow[] => Array.from({ length: n }, (_, i) => note(long && i < 2 ? LONG[i] as string : TITLES[(i + offset) % TITLES.length] as string, ['Work', 'Personal', 'Projects'][i % 3] as string, 10 + i * 190));

const mix = (o: Record<string, FxNotes>): Record<string, FxNotes> => o;
const defaultNotes = () =>
  mix({
    [idOf('atlas')]: ok(atlasNotes()),
    [idOf('borealis')]: ok(borealisNotes()),
    [idOf('granite')]: { state: 'older' },
    [idOf('harbor')]: ok([]),
  });

const data = (v: unknown, delayMs?: number): QueryAnswer => ({ data: v, ...(delayMs !== undefined ? { delayMs } : {}) });
const created: MutationAnswer = { outcome: 'done' };
const matching: QueryAnswer = { data: { matching: true } };

const state = (notes: Record<string, FxNotes>, o: { computers?: Computer[]; create?: MutationAnswer; node?: QueryAnswer; download?: MutationAnswer } = {}) => ({
  computers: data(o.computers ?? computers),
  notes: data(notes),
  create: o.create ?? created,
  node: o.node ?? matching,
  download: o.download ?? ({ outcome: 'done' } as MutationAnswer),
});

const running = computers.filter((c) => c.state === 'running');
const all = (f: (c: Computer) => FxNotes): Record<string, FxNotes> => Object.fromEntries(running.map((c) => [c.id, f(c)]));

export default defineFixtures({
  default: 'default',
  states: {
    default: state(defaultNotes()),
    none: state({}, { computers: [] }),
    onlyStopped: state({}, { computers: computers.filter((c) => c.state !== 'running') }),
    loading: state(all(() => ({ state: 'ok', hang: true }))),
    error: state(all(() => ({ state: 'unreachable' }))),
    empty: state(all(() => ok([]))),
    emptyRunning: state(all(() => ok([])), { computers: running }),
    mixed: state(
      mix({
        [idOf('atlas')]: ok(atlasNotes()),
        [idOf('borealis')]: { state: 'protected' },
        [idOf('granite')]: { state: 'notOwner' },
        [idOf('harbor')]: { state: 'busy' },
      }),
    ),
    refusals: state(mix({ [idOf('atlas')]: { state: 'noAccess' }, [idOf('borealis')]: { state: 'cantTell' }, [idOf('granite')]: { state: 'unexpected' }, [idOf('harbor')]: { state: 'older' } })),
    many: state(all((c) => ok(many(c.name.length)))),
    // More rows than one page (50): the pager and ?page.
    pages: state(all((c) => ok(many(c.name.length, false, 20)))),
    long: state(all((c) => ok(many(c.name.length, true), { partial: true }))),
    noPlace: state(mix({ ...defaultNotes(), [idOf('atlas')]: ok(atlasNotes(), { place: null }) })),
    createPending: state(defaultNotes(), { create: { outcome: 'pending', code: 'network' }, node: { error: 'not_found' } }),
    createFound: state(defaultNotes(), { create: { outcome: 'pending', code: 'network' }, node: matching }),
    createNotSent: state(defaultNotes(), { create: { outcome: 'not_sent' } }),
    createFailed: state(defaultNotes(), { create: { outcome: 'failed', code: 'cantAdd' } }),
    createProtected: state(defaultNotes(), { create: { outcome: 'failed', code: 'protected' } }),
    createTaken: state(defaultNotes(), { create: { outcome: 'failed', code: 'taken' } }),
    downloadFailed: state(defaultNotes(), { download: { outcome: 'failed', code: 'failed' } }),
    downloadTooBig: state(defaultNotes(), { download: { outcome: 'failed', code: 'TOO_BIG' } }),
    colours: state(defaultNotes(), { computers: computers.map((c) => (worldColours[c.name] === undefined ? c : { ...c, color: worldColours[c.name] })) }),
    hostileId: state(mix({ ...defaultNotes(), [idOf('atlas')]: ok(atlasNotes(), { notebookId: "b2c3'$(id) x\nrm" }) })),
    nine: state({ ...defaultNotes(), [ninth.id]: ok(many(3)) }, { computers: [...computers, ninth] }),
    noAddress: state(defaultNotes(), { computers: computers.map((c) => (c.name === 'atlas' ? { ...c, serverName: '' } : c)) }),
    computersPending: { ...state(defaultNotes()), computers: { pending: true } },
    computersFailed: { ...state(defaultNotes()), computers: { error: 'server' } },
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetApi();
}
