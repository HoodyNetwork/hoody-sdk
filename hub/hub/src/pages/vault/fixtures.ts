// Fake-API states of the vault page for hub:dev, hub:shots, tests and specs. Every value below is a fixture
// value; no real credential is ever kept here. The encrypted entries use the SDK-made test vectors
// (crypto.vectors.ts), so their test passwords open them.
//
// Each state keeps a small in-memory vault per partition ('' = Global): PUT, DELETE and Clear change it, so
// the page reads back what it wrote. hoody.realm-aliases sits in Global and its value is never answered here:
// core's own rule answers it with the world's realm names (core reads the nicknames from it), so these rules
// never shadow the alias read.
import { answers, defineFixtures, fixtureSession, fixtureWorld, reply, utf8Bytes, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { sdkVectors } from './crypto.vectors';
import { ALIAS_KEY } from './logic';
import { routes } from './routes';

export const REALM_A = (fixtureWorld.realms.find((r) => r.name === 'Personal') as { id: string }).id;
export const REALM_B = (fixtureWorld.realms.find((r) => r.name === 'Acme client') as { id: string }).id;

/** A fixture entry: what the list shows plus the stored value. */
interface Entry {
  value: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
type Vault = Map<string, Map<string, Entry>>;

const T0 = '2026-10-20T09:15:00.000Z';
const T1 = '2026-10-23T16:40:00.000Z';
const ENC = sdkVectors[0]!;
/** The test password of the encrypted fixture entries (an SDK test vector, not a credential). */
export const FIXTURE_PASSWORD = ENC.password;
export const FIXTURE_PLAINTEXT = ENC.plaintext;

const aliasesJson = (): string => JSON.stringify(Object.fromEntries(fixtureWorld.realms.map((r) => [r.id, r.name])));

function seed(rows: Record<string, Record<string, Partial<Entry> & { value: string }>>): () => Vault {
  return () => {
    const v: Vault = new Map();
    for (const [p, entries] of Object.entries(rows)) {
      const m = new Map<string, Entry>();
      for (const [k, e] of Object.entries(entries)) m.set(k, { metadata: null, created_at: T0, updated_at: T1, ...e });
      v.set(p, m);
    }
    return v;
  };
}

const DEFAULT = seed({
  '': {
    [ALIAS_KEY]: { value: aliasesJson(), metadata: null },
    'shared-webhook-url': { value: 'fixture-webhook-value-0001', metadata: { source: 'hub' } },
  },
  [REALM_A]: {
    'github-token': { value: 'fixture-token-value-000000000001', metadata: null },
    'db-password': { value: ENC.envelope, metadata: { encrypted: true } },
    'deploy.notes': { value: 'Deploy on Fridays only after the backup ran.', metadata: { owner: 'ops' } },
  },
  [REALM_B]: {
    'stripe-key': { value: 'fixture-stripe-value-0000000001', metadata: null },
  },
});

const LONG = seed({
  '': { [ALIAS_KEY]: { value: aliasesJson() } },
  [REALM_A]: Object.fromEntries(Array.from({ length: 140 }, (_, i) => [`entry-${String(i + 1).padStart(3, '0')}`, i % 4 === 0 ? { value: ENC.envelope, metadata: { encrypted: true } } : { value: `fixture-value-${i + 1}` }])),
});

/** DEFAULT plus an entry whose name is `new` (a valid name; Replace must still treat it as an entry). */
const WITH_NEW = seed({
  '': { [ALIAS_KEY]: { value: aliasesJson() } },
  [REALM_A]: { new: { value: 'fixture-new-value-0001', metadata: null }, 'github-token': { value: 'fixture-token-value-000000000001', metadata: null } },
});

/** An envelope saved by another tool without the encrypted marker: the list cannot tell it from plain text. */
const UNMARKED = seed({
  '': { [ALIAS_KEY]: { value: aliasesJson() } },
  [REALM_A]: { 'old-secret': { value: ENC.envelope, metadata: null } },
});

const EMPTY = seed({ '': { [ALIAS_KEY]: { value: aliasesJson() } } });

const partitionOfReq = (req: FixtureRequest): string => req.query.realm_id ?? '';
const keyOfReq = (req: FixtureRequest): string => {
  const last = req.path.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};
const row = (p: string, key: string, e: Entry) => ({ key, realm_id: p, metadata: e.metadata, size_bytes: utf8Bytes(e.value), created_at: e.created_at, updated_at: e.updated_at });
const notFound: FixtureAnswer = { status: 404, body: { error: 'Not Found' } };

/** Metadata nested this deep (arrays in arrays) stays under the API's size limit but is too deep to indent. */
const deepTree = (depth: number): unknown => {
  let v: unknown = 'leaf';
  for (let i = 0; i < depth; i++) v = [v];
  return v;
};

/** Entries whose metadata exercises the editor and inspector: odd keys, depth, many values, an envelope. */
const META_RICH = seed({
  [REALM_A]: {
    'proto.meta': { value: 'fixture-proto-value-01', metadata: JSON.parse('{"__proto__":{"owner":"ops"},"label":"example"}') as Record<string, unknown> },
    'deep.meta': { value: 'fixture-deep-value-01', metadata: { tree: deepTree(300) } },
    'many.meta': {
      value: 'fixture-many-value-01',
      metadata: { long: 'x'.repeat(600), edge: 'y'.repeat(500), nested: { a: { b: [1, 2] } }, count: 5, on: true, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, `v${i}`])) },
    },
    'enc.meta': { value: ENC.envelope, metadata: { encrypted: true, owner: 'ops' } },
    'plain.meta': { value: 'fixture-plain-value-01', metadata: { owner: 'ops' } },
  },
});

/** JSON values for the formatted view: an ordinary object, one nested deeper than the formatter takes, and a
 *  plain value beside them. */
export const JSON_FIXTURE_VALUE = '{"retries":3,"hosts":["a.example","b.example"],"tls":{"verify":true}}';
const JSON_VALUES = seed({
  [REALM_A]: {
    'app.config': { value: JSON_FIXTURE_VALUE, metadata: null },
    'deep.config': { value: `${'['.repeat(100)}0${']'.repeat(100)}`, metadata: null },
    'github-token': { value: 'fixture-token-value-000000000001', metadata: null },
    // Stored with no value (the API refuses one now; older writes left it): the field says so.
    'blank.value': { value: '', metadata: null },
  },
});

/** Every vault request the page made under these fixtures, in order (method, path, query; a PUT's body too:
 *  fixture values only). Tests read it to prove what was and was not sent. */
export const requestLog: Array<{ method: string; path: string; query: Readonly<Record<string, string>>; body?: unknown }> = [];
const log = (req: FixtureRequest): void => {
  requestLog.push({ method: req.method, path: req.path, query: { ...req.query }, ...(req.method === 'PUT' ? { body: req.body } : {}) });
};

interface StateOpts {
  /** Answer for the list (instead of the vault's rows). */
  list?: FixtureAnswer;
  /** Answer for every change (PUT, DELETE, Clear) instead of applying it. */
  change?: FixtureAnswer;
  /** Apply the change, then answer this (an answer lost after the server applied it). */
  appliedThen?: FixtureAnswer;
  /** Answer value reads after this many ms (a read still in flight while the view changes). */
  readSlowMs?: number;
  /** Answer the first list read after this many ms (the page waits for its list). */
  firstListSlowMs?: number;
  /** Ask importScript before answering a PUT or a list (the import tests' per-request answers). */
  scripted?: boolean;
}

/** One scripted answer: `answer` in place of the vault's, applied first when `apply` (an answer lost after it landed). */
export interface ScriptedAnswer {
  answer?: FixtureAnswer;
  apply?: boolean;
}

/** Import tests: per-request answers of the `import` state. `put` gets the key and how many PUTs came before (0-based);
 *  `list` how many list reads came before. Undefined (or null hooks): the vault answers as usual. `listSlowMs`: the
 *  vault's own list answers come this many ms late (0: at once). Reset by resetFixtureVaults. */
export const importScript: {
  put: ((key: string, n: number) => ScriptedAnswer | undefined) | null;
  list: ((n: number) => FixtureAnswer | undefined) | null;
  listSlowMs: number;
} = { put: null, list: null, listSlowMs: 0 };

/** Tests: add (or overwrite) an entry in a state's vault behind the page's back, as another tab or tool would. */
export function fixtureAdd(state: string, partition: string, key: string, value: string): void {
  const v = vaultsByState.get(state)?.();
  if (!v) return;
  const m = v.get(partition) ?? new Map<string, Entry>();
  v.set(partition, m);
  m.set(key, { value, metadata: null, created_at: T0, updated_at: T1 });
}

/** Each named state's vault, for tests that change an entry behind the page's back (fixtureEntry). */
const vaultsByState = new Map<string, () => Vault>();

/** Tests: set an entry's metadata in a state's vault, as another tab or tool would, without the page knowing. */
export function fixtureEntry(state: string, partition: string, key: string, metadata: Record<string, unknown> | null): void {
  const e = vaultsByState.get(state)?.().get(partition)?.get(key);
  if (e) e.metadata = metadata;
}

const resets: Array<() => void> = [];
/** Every state's vault back to its seed (tests: each test starts from the seeded vaults). */
export function resetFixtureVaults(): void {
  for (const r of resets) r();
  importScript.put = null;
  importScript.list = null;
  importScript.listSlowMs = 0;
}

/** One state's rules over its own in-memory vault (made when the state is first used). */
function vaultRules(make: () => Vault, o: StateOpts = {}, name?: string): FixtureRule[] {
  let v: Vault | null = null;
  let lists = 0;
  let puts = 0;
  resets.push(() => {
    v = null;
    lists = 0;
    puts = 0;
  });
  const vault = (): Vault => (v ??= make());
  if (name) vaultsByState.set(name, vault);
  const part = (p: string): Map<string, Entry> => {
    const m = vault().get(p) ?? new Map<string, Entry>();
    vault().set(p, m);
    return m;
  };
  const now = (): string => new Date().toISOString();
  const after = (applied: unknown): FixtureAnswer => o.appliedThen ?? answers.ok(applied);
  return [
    reply(routes.list, (req) => {
      log(req);
      if (o.list) return o.list;
      const scripted = o.scripted ? importScript.list?.(lists) : undefined;
      if (o.scripted) lists++;
      if (scripted) return scripted;
      const body = { statusCode: 200, data: [...part(partitionOfReq(req))].map(([k, e]) => row(partitionOfReq(req), k, e)) };
      if (o.scripted && importScript.listSlowMs > 0) return answers.slow(body, importScript.listSlowMs);
      return o.firstListSlowMs && lists++ === 0 ? answers.slow(body, o.firstListSlowMs) : answers.ok(body);
    }),
    reply(routes.stats, (req) => {
      log(req);
      const m = part(partitionOfReq(req));
      const size = [...m.values()].reduce((n, e) => n + utf8Bytes(e.value), 0);
      return answers.ok({ statusCode: 200, data: { total_keys: m.size, total_size_bytes: size, total_size_mb: size / 1048576, limit_mb: 50, used_percentage: 3.2, remaining_mb: 48.4 } });
    }),
    // A value is answered only for a key that is not core's alias read (that one falls through to core's rule).
    reply(
      routes.read,
      (req) => {
        log(req);
        const e = part(partitionOfReq(req)).get(keyOfReq(req));
        if (!e) return notFound;
        const body = { statusCode: 200, data: { ...row(partitionOfReq(req), keyOfReq(req), e), value: e.value } };
        return o.readSlowMs ? answers.slow(body, o.readSlowMs) : answers.ok(body);
      },
      { when: (req) => !(keyOfReq(req) === ALIAS_KEY && partitionOfReq(req) === '') },
    ),
    reply(
      routes.put,
      (req) => {
        log(req);
        if (o.change) return o.change;
        const m = part(partitionOfReq(req));
        const key = keyOfReq(req);
        const s = o.scripted ? importScript.put?.(key, puts++) : undefined;
        if (s?.answer && !s.apply) return s.answer;
        const body = (req.body ?? {}) as { value?: unknown; metadata?: unknown };
        const prev = m.get(key);
        const value = typeof body.value === 'string' ? body.value : '';
        if (!value) return { status: 400, body: { error: 'Bad Request' } };
        const t = now();
        const e: Entry = {
          value,
          metadata: body.metadata === undefined ? (prev?.metadata ?? null) : (body.metadata as Record<string, unknown> | null),
          created_at: prev?.created_at ?? t,
          updated_at: t,
        };
        m.set(key, e);
        if (s?.answer) return s.answer;
        return after({ statusCode: prev ? 200 : 201, data: { ...row(partitionOfReq(req), key, e), value } });
      },
      { when: (req) => !(keyOfReq(req) === ALIAS_KEY && partitionOfReq(req) === '') },
    ),
    reply(routes.remove, (req) => {
      log(req);
      if (o.change) return o.change;
      const m = part(partitionOfReq(req));
      if (!m.delete(keyOfReq(req))) return notFound;
      return after({ statusCode: 200 });
    }),
    reply(routes.clear, (req) => {
      log(req);
      if (o.change) return o.change;
      const m = part(partitionOfReq(req));
      const n = m.size;
      m.clear();
      return after({ statusCode: 200, data: { deleted_count: n } });
    }),
  ];
}

const RATE: FixtureAnswer = { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '60' } };

export default defineFixtures({
  default: 'default',
  states: {
    default: vaultRules(DEFAULT),
    long: vaultRules(LONG),
    empty: vaultRules(EMPTY),
    loading: [reply(routes.list, answers.slow({ data: [] }, 600_000)), reply(routes.stats, answers.slow({ data: null }, 600_000))],
    error: vaultRules(DEFAULT, { list: answers.pending5xx(503) }),
    forbidden: vaultRules(DEFAULT, { list: answers.refused(403, 'INSUFFICIENT_PERMISSIONS') }),
    rateLimited: vaultRules(DEFAULT, { change: RATE }),
    full: vaultRules(DEFAULT, { change: answers.refused(400, 'VAULT_LIMIT_EXCEEDED') }),
    /** Every change answers 502: it may have gone through (it did not, here). */
    unknown: vaultRules(DEFAULT, { change: answers.pending5xx(502) }),
    /** The change is applied, then its answer is lost: a held PUT that Check again proves. */
    appliedLost: vaultRules(DEFAULT, { appliedThen: answers.lost() }),
    /** An access-key session (core refuses /vault there): the page shows the account-only state. */
    accessKey: [fixtureSession({ kind: 'token', caps: ['vault'], realm: REALM_A }), ...vaultRules(DEFAULT)],
    /** Value reads answer after 400 ms. */
    slowRead: vaultRules(DEFAULT, { readSlowMs: 400 }),
    /** An entry named `new` beside an ordinary one. */
    withNew: vaultRules(WITH_NEW),
    /** An encrypted value without the encrypted marker. */
    unmarked: vaultRules(UNMARKED),
    /** Metadata of every shape the editor and inspector handle (odd keys, depth, many values, an envelope). */
    metaRich: vaultRules(META_RICH, {}, 'metaRich'),
    /** JSON values: formatted, too deep to format, plain. */
    jsonValues: vaultRules(JSON_VALUES, {}, 'jsonValues'),
    /** The first list read answers after 1.5 s (a drawer opened before the list is there). */
    slowList: vaultRules(DEFAULT, { firstListSlowMs: 1500 }),
    /** Applied, answered after 1.5 s (the window a change is in flight). */
    slowSave: vaultRules(DEFAULT, { appliedThen: answers.slow({ statusCode: 200 }, 1500) }),
    /** Import: the default vault with per-request answers from importScript (tests). */
    import: vaultRules(DEFAULT, { scripted: true }, 'import'),
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetFixtureVaults();
  requestLog.length = 0;
}
