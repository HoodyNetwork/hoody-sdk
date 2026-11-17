// Fake-API states of New realm for hub:dev, hub:shots, tests and specs. Names come from core's fixtureWorld. The
// vault and the computers keep what was written (a PUT changes the next GET), so a lost answer can be checked.
// Tests call resetRealmsWorld() first: the states are built once and share one world.
import { answers, defineFixtures, fixtureSession, fixtureWorld, reply, vaultKeyPutRoute, vaultKeyRoute, worldColours, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { routes } from './routes';

const W = fixtureWorld;
const projectOf = (id: string) => W.projects.find((p) => p.id === id)?.name ?? '';

// failNext: the next names read fails (set by a name write under namesRead 'failAfterPut'). namesVer: the names
// map's version, in the read's ETag as the API sends it (a name write moves it).
const world = { names: {} as Record<string, string>, namesVer: 1, realms: {} as Record<string, string[]>, failNext: false };
/** Every write this page sent (method, path, body), for tests. */
export const realmSends: { method: string; path: string; body: unknown }[] = [];
export function resetRealmsWorld(): void {
  world.names = Object.fromEntries(W.realms.map((r) => [r.id, r.name]));
  world.realms = Object.fromEntries(W.computers.map((c) => [c.id, [...c.realm_ids]]));
  world.namesVer = 1;
  world.failNext = false;
  realmSends.length = 0;
}
resetRealmsWorld();

const cidOf = (r: FixtureRequest): string => /\/computers\/([^/?]+)/.exec(r.path)?.[1] ?? '';
const row = (c: (typeof W.computers)[number]) => ({ id: c.id, name: c.name, status: c.status, project_id: c.project_id, project_alias: projectOf(c.project_id), server_name: c.server_name, realm_ids: world.realms[c.id] ?? [] });
const sent = (r: FixtureRequest) => realmSends.push({ method: r.method, path: r.path, body: r.body });
/** `applies`: the write lands even when its answer is lost or refused (a lost answer that did go through).
 *  `also`: realms someone else adds to the computer right after it lands (the read-back is not the exact set sent).
 *  `once`: only the first write gets `answer`; later ones land and answer ok (a hiccup, then a good try), or, with
 *  `then`, get that answer and do not land (a hiccup, then a refused try). */
const write = (o: Write | undefined, apply: (r: FixtureRequest) => void) => (r: FixtureRequest): FixtureAnswer => {
  sent(r);
  const later = o?.once === true && r.n > 1;
  if (later && o.then) return o.then;
  const odd = o && !later;
  if (!odd || o.applies) apply(r);
  if (odd && o.applies && o.also) world.realms[cidOf(r)] = [...new Set([...(world.realms[cidOf(r)] ?? []), ...o.also])];
  return odd ? o.answer : answers.ok({});
};
const putName = (r: FixtureRequest) => {
  const v = (r.body as { value?: unknown } | null)?.value;
  if (typeof v === 'string') { world.names = JSON.parse(v) as Record<string, string>; world.namesVer++; }
};
const putRealms = (r: FixtureRequest) => {
  const v = (r.body as { realm_ids?: unknown } | null)?.realm_ids;
  if (Array.isArray(v)) world.realms[cidOf(r)] = v.filter((x): x is string => typeof x === 'string');
};

interface Write { answer: FixtureAnswer; applies: boolean; also?: string[]; once?: boolean; then?: FixtureAnswer }
interface Opts {
  /** many: the world's computers plus MANY_EXTRA more (node-01...), so a pick can pass the rail's scroll point. */
  computers?: 'all' | 'none' | 'error' | 'slow' | 'many';
  /** failAfterPut: only the names read right after each name write fails (the write itself landed). noEtag: the read
   *  answers without an ETag, so no name write is sent. */
  namesRead?: 'ok' | 'error' | 'failAfterPut' | 'noEtag';
  name?: Write;
  computer?: Write;
  /** A computer's own write outcome, by computer name, over `computer` (a run with mixed outcomes). */
  computerBy?: Readonly<Record<string, Write>>;
  /** Each computer with its colour as the API keeps it (core worldColours; cedar's is not a hex colour). */
  colours?: boolean;
}
export const MANY_EXTRA = 16;
// The extra computers take the world's valid colours in turn (core worldColours; cedar's is not a colour).
const MANY_COLOURS = ['atlas', 'borealis', 'ember', 'fjord'].map((n) => worldColours[n] ?? '');
/** The extra computers' names (node-01...), the last one long, and with colours their colour as the API keeps it. */
export const manyExtra: readonly { name: string; color: string }[] = Array.from({ length: MANY_EXTRA }, (_, i) => ({
  name: i === MANY_EXTRA - 1 ? 'node-16-build-and-release-runner-eu-west-long-name' : `node-${String(i + 1).padStart(2, '0')}`,
  color: MANY_COLOURS[i % MANY_COLOURS.length] ?? '',
}));
const manyRows = (colours: boolean) => {
  const [first] = W.computers;
  return first ? manyExtra.map((x, i) => ({ ...row(first), id: `c0a7159${String(i).padStart(17, '0')}`, name: x.name, realm_ids: [], ...(colours ? { color: x.color } : {}) })) : [];
};
// Only the realm-name key: other vault keys fall through to core's own rules.
const names = { when: (r: FixtureRequest) => r.path.endsWith('/hoody.realm-aliases') };
const rules = (o: Opts = {}): FixtureRule[] => [
  reply(vaultKeyRoute, () => {
    const fail = o.namesRead === 'error' || world.failNext;
    world.failNext = false;
    if (fail) return answers.refused(500, 'SERVER_ERROR');
    const ok = answers.ok({ data: { value: JSON.stringify(world.names) } });
    return o.namesRead === 'noEtag' ? ok : { ...ok, headers: { etag: `"names-${world.namesVer}"` } };
  }, names),
  reply(vaultKeyPutRoute, (r) => { if (o.namesRead === 'failAfterPut') world.failNext = true; return write(o.name, putName)(r); }, names),
  reply(routes.computers, () =>
    o.computers === 'error' ? answers.refused(500, 'SERVER_ERROR')
      : o.computers === 'slow' ? answers.slow({ data: { computers: W.computers.map(row) } }, 60000)
        : answers.ok({ data: { computers: o.computers === 'none' ? [] : [...W.computers.map((c) => (o.colours ? { ...row(c), color: worldColours[c.name] } : row(c))), ...(o.computers === 'many' ? manyRows(!!o.colours) : [])] } })),
  reply(routes.computer, (r) => answers.ok({ data: { id: cidOf(r), realm_ids: world.realms[cidOf(r)] ?? [] } })),
  reply(routes.setRealms, (r) => write(o.computerBy?.[W.computers.find((c) => c.id === cidOf(r))?.name ?? ''] ?? o.computer, putRealms)(r)),
];

const lost = answers.pending5xx(502);

export default defineFixtures({
  default: 'default',
  states: {
    default: rules(),
    /** No computer yet: the realm can only start empty. */
    empty: rules({ computers: 'none' }),
    /** The computers list does not answer. */
    error: rules({ computers: 'error' }),
    loading: rules({ computers: 'slow' }),
    /** The realm names cannot be read: the name cannot be checked, so Next waits. */
    namesFailed: rules({ namesRead: 'error' }),
    /** The name's first answer is lost and it did not land; a second send lands. */
    nameLost: rules({ name: { answer: lost, applies: false, once: true } }),
    /** The name's first answer is lost and it did not land; the second send is refused. */
    nameLostThenRefused: rules({ name: { answer: lost, applies: false, once: true, then: answers.refused(400, 'VALIDATION_ERROR') } }),
    /** The name's answer is lost but it did land. */
    nameLanded: rules({ name: { answer: lost, applies: true } }),
    /** The names read answers without an ETag: the name is refused before it is sent. */
    nameNoEtag: rules({ namesRead: 'noEtag' }),
    /** The name is refused. */
    nameRefused: rules({ name: { answer: answers.refused(400, 'VALIDATION_ERROR'), applies: false } }),
    /** The name write is answered, but the names read right after fails: not called made until Check again. */
    nameUnchecked: rules({ namesRead: 'failAfterPut' }),
    /** Each computer's answer is lost but the change landed. */
    computerLanded: rules({ computer: { answer: lost, applies: true } }),
    /** Each computer's answer is lost; it landed, but another realm was added right after, so the read-back is not
     *  the exact set sent: saved, with the lost send still held (HELD) until a check proves it or Dismiss frees it. */
    computerHeld: rules({ computer: { answer: lost, applies: true, also: [W.realms[W.realms.length - 1]?.id ?? ''] } }),
    /** Each computer's change is refused. */
    computerRefused: rules({ computer: { answer: answers.refused(403, 'FORBIDDEN'), applies: false } }),
    /** Each computer's answer is lost and the change did not land: whether it was added stays unknown. */
    computerUnknown: rules({ computer: { answer: lost, applies: false } }),
    /** Mixed outcomes: the first computer is added, the second's answer is lost (it did not land), the third is
     *  refused. */
    computerMixed: rules({ computerBy: {
      [W.computers[1]?.name ?? '']: { answer: lost, applies: false },
      [W.computers[2]?.name ?? '']: { answer: answers.refused(403, 'FORBIDDEN'), applies: false },
    } }),
    /** More computers than the rail lists without scrolling. */
    many: rules({ computers: 'many', colours: true }),
    /** Computer colours: the Computers step draws each computer's mark; cedar's value is not a hex colour (none). */
    colours: rules({ colours: true }),
    /** A shared-access (token) session: no realm can be made. */
    pinned: [fixtureSession({ kind: 'token', caps: ['computers.read'], realm: W.realms[0]?.id ?? '' }), ...rules()],
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetRealmsWorld();
}
