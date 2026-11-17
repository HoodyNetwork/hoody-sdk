// Fake-API states of the keys page for hub:dev, hub:shots, tests and specs.
// Every secret below is a fixture value; no real credential is ever kept here.
import {
  answers,
  defineFixtures,
  fixtureWorld,
  reply,
  type FixtureAnswer,
  type FixtureRule,
} from "@core";
import { routes } from "./routes";
import type { RawTemplate, RawToken, TopComputer, Tree } from "./types";

const hex = (n: number): string =>
  ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").repeat(3);
const NOW = Date.now();
const DAY = 86400000;
const iso = (ms: number): string => new Date(ms).toISOString();

const world = fixtureWorld;
/** The realms of the fixture world: the shell shows Personal, so the list opens narrowed to it. */
export const REALM_A = (
  world.realms.find((r) => r.name === "Personal") as { id: string }
).id;
export const REALM_B = (
  world.realms.find((r) => r.name === "Acme client") as { id: string }
).id;

/** The server's full_access catalogue, as GET /auth/tokens/templates returns it. */
const FULL: Tree = {
  computers: {
    create: true,
    read: true,
    update: true,
    delete: true,
    actions: { start: true, stop: true, restart: true, exec: true, logs: true },
    features: {
      ai: true,
      hoody_kit: true,
      snapshots: true,
      networking: true,
      kvm: true,
      env_values: true,
    },
  },
  projects: {
    create: true,
    read: true,
    update: true,
    delete: true,
    members: { invite: true, remove: true, change_roles: true },
  },
  financial: {
    wallet: { read: true, transfer: true, withdraw: true },
    billing: {
      read: true,
      manage_payment_methods: true,
      download_invoices: true,
    },
    server_rental: {
      view_marketplace: true,
      rent_servers: true,
      extend_rentals: true,
      terminate_rentals: true,
    },
    subscriptions: { purchase: true },
  },
  resources: {
    vault: true,
    events: true,
    ssh_keys: true,
    storage_shares: true,
    proxy_aliases: true,
    bot_urls: true,
    firewalls: true,
    realms: true,
    auth_token_public_profile: true,
    read_account: true,
    create_tokens: true,
  },
  admin: { users: true },
};

export const templates: RawTemplate[] = [
  { name: "full_access", permissions: FULL },
  {
    name: "read_only",
    permissions: { computers: { read: true }, projects: { read: true } },
  },
  {
    name: "dev_team",
    permissions: {
      computers: {
        read: true,
        update: true,
        actions: {
          start: true,
          stop: true,
          restart: true,
          exec: true,
          logs: true,
        },
      },
      projects: { read: true },
      resources: { events: true },
    },
  },
  {
    name: "finance_team",
    permissions: {
      financial: {
        billing: { read: true, download_invoices: true },
        wallet: { read: true },
      },
    },
  },
];

const devRights: Tree = templates[2]?.permissions ?? {};

const keyRow = (n: number, over: Partial<RawToken>): RawToken => ({
  id: hex(n),
  alias: `key-${n}`,
  prefix: `hdy_${hex(n).slice(0, 4)}`,
  realm_ids: [],
  allow_no_realm: true,
  permissions: FULL,
  is_enabled: true,
  expires_at: null,
  ip_whitelist: [],
  vault_access: false,
  event_access: true,
  delegation_depth: 0,
  created_at: iso(NOW - n * 9 * DAY),
  ...over,
});

export const keys: RawToken[] = [
  keyRow(1, {
    alias: "ci-deploy",
    realm_ids: [REALM_A],
    allow_no_realm: false,
    permissions: devRights,
    expires_at: iso(NOW + 70 * DAY),
    ip_whitelist: ["203.0.113.7/32"],
  }),
  keyRow(2, {
    alias: "hoody-agent auto 7f3a",
    prefix: "hdy_77c1",
    permissions: {
      ...FULL,
      resources: { ...(FULL.resources as Tree), create_tokens: true },
    },
  }),
  keyRow(3, {
    alias: "hoody-agent realm Acme client",
    prefix: "hdy_a901",
    realm_ids: [REALM_B],
    allow_no_realm: false,
  }),
  keyRow(4, {
    alias: "sdk-readonly",
    prefix: "hdy_b2e4",
    permissions: templates[1]?.permissions,
    expires_at: iso(NOW + 9 * DAY),
  }),
  keyRow(5, {
    alias: "laptop-cli",
    prefix: "hdy_c8d0",
    realm_ids: [REALM_A, REALM_B],
    allow_no_realm: false,
    is_enabled: false,
  }),
  keyRow(6, {
    alias: "old-build-bot",
    prefix: "hdy_d114",
    expires_at: iso(NOW - 40 * DAY),
  }),
  keyRow(7, {
    alias: "finance-export",
    prefix: "hdy_e52b",
    realm_ids: [REALM_B],
    allow_no_realm: false,
    permissions: templates[3]?.permissions,
    ip_whitelist: ["198.51.100.0/24", "203.0.113.9"],
  }),
];

const NAMES = ["ci", "edge", "nightly", "docs", "staging", "metrics", "backup"];
const many: RawToken[] = Array.from({ length: 60 }, (_, i) =>
  i < keys.length
    ? (keys[i] as RawToken)
    : keyRow(i + 1, {
        alias: `${NAMES[i % NAMES.length]}-${Math.floor(i / 7) + 1}`,
        expires_at: i % 4 === 0 ? iso(NOW + (i + 10) * DAY) : null,
        is_enabled: i % 9 !== 0,
      }),
);

const SHARE_TOKEN = `hdy_${"a1".repeat(12)}_${"0f".repeat(24)}`;
const shareRow = (n: number, hours: number): RawToken => ({
  id: hex(500 + n),
  alias: `hoody share ${"abcdefghijklmnop".slice(n, n + 12).padEnd(12, "x")}`,
  prefix: "hdy_5a5a",
  realm_ids: [REALM_A],
  allow_no_realm: false,
  permissions: {
    computers: {
      read: true,
      actions: { start: true, stop: true, restart: true },
    },
    projects: { read: true },
  },
  is_enabled: true,
  expires_at: iso(NOW + hours * 3600000),
  created_at: iso(NOW - n * 5 * 3600000),
});
export const shares: RawToken[] = [shareRow(1, 70), shareRow(2, 20)];
/** A share made for someone (Advanced: "Who it's for", kept at the end of its alias). */
const namedShare: RawToken = { ...shareRow(3, 40), alias: "hoody share defghijklmno Alex" };

/** A share this page manages (shareConforms): the base, start/stop/restart, one realm, every flag fixed. */
export const managedShare = (n: number, hours: number, o: Partial<RawToken> = {}): RawToken => ({
  ...shareRow(n, hours),
  permissions: { computers: { read: true, actions: { start: true, stop: true, restart: true } }, projects: { read: true } },
  vault_access: false,
  event_access: false,
  ...o,
});

/** What a fake server's write does: applies and answers (done), answers "may have gone through" having applied it
 *  (landed) or not (lost), answers that the key is gone (404), or asks for the sign-in code and applies nothing (otp). */
export type ShareWrite = "done" | "landed" | "lost" | "gone" | "otp";
/**
 * Tests (state `sharedServer`): the shares a fake server keeps, changed by what the page sends to it. `reset()`
 * before each test; tests may change `rows` to play another tab or person changing a share.
 */
export const sharedServer = {
  rows: [] as RawToken[],
  remove: "done" as ShareWrite,
  setEnabled: "done" as ShareWrite,
  update: "done" as ShareWrite,
  /** The list answers as cut short (more shares than one page). */
  truncated: false,
  /** Runs once, before the next list read answers: another tab or page acting while that read is out. */
  beforeList: null as (() => Promise<void>) | null,
  /** Runs once, before the next write answers: holds a send on its way while a test acts. */
  beforeWrite: null as (() => Promise<void>) | null,
  /** Every write that reached the server, in order. */
  sent: [] as { kind: "remove" | "setEnabled" | "update"; id: string; body: unknown }[],
  reset(rows: RawToken[]) {
    this.rows = rows.map((r) => ({ ...r }));
    this.remove = "done";
    this.setEnabled = "done";
    this.update = "done";
    this.truncated = false;
    this.beforeList = null;
    this.beforeWrite = null;
    this.sent = [];
  },
};
const serverWrite =
  (kind: "remove" | "setEnabled" | "update") =>
  async (req: { path: string; body: unknown }): Promise<FixtureAnswer> => {
    const id = /[0-9a-f]{24}/.exec(req.path)?.[0] ?? "";
    sharedServer.sent.push({ kind, id, body: req.body });
    const go = sharedServer.beforeWrite;
    sharedServer.beforeWrite = null;
    if (go) await go();
    const how = sharedServer[kind];
    const at = sharedServer.rows.findIndex((r) => r.id === id);
    if (how === "otp") return refused("OTP_REQUIRED", 400);
    if (how === "gone" || at < 0) return refused("NOT_FOUND", 404);
    if (how !== "lost") {
      if (kind === "remove") sharedServer.rows.splice(at, 1);
      else sharedServer.rows[at] = { ...(sharedServer.rows[at] as RawToken), ...(req.body as Partial<RawToken>) };
    }
    return how === "done" ? done({ data: {} }) : pending();
  };

type Responder = Parameters<typeof reply>[1];

const wire = (rows: RawToken[], truncated = false) => ({
  data: rows,
  truncated,
});

const computer: TopComputer = {
  id: (world.computers.find((c) => c.name === "atlas") as { id: string }).id,
  name: "atlas",
  ssh_hostname: "atlas.ssh.hoody.example",
  ssh_public_key:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop",
};
const computerNoKey: TopComputer = { ...computer, ssh_public_key: "" };

const made = (
  alias: string,
  token: string | null = "hdy_" + "f3".repeat(26),
): { data: RawToken } => ({
  data: keyRow(900, {
    alias,
    prefix: "hdy_3f9a",
    token,
    realm_ids: [REALM_A],
    allow_no_realm: false,
    expires_at: iso(NOW + 90 * DAY),
  }),
});

const SHARE_MADE = {
  data: {
    id: hex(990),
    alias: "hoody share fixture0000",
    token: SHARE_TOKEN,
    expires_at: iso(NOW + 7 * DAY),
  },
};

/** The computer answer: `data: null` is "no computer picked". */
const containerOf = (c: TopComputer | null) => ({
  data: c ? { ...c } : null,
});

interface Opts {
  /** The answer of GET /ip (default MY_IP). */
  myIp?: unknown;
  rows?: RawToken[];
  truncated?: boolean;
  /** Tests: the live list's reads wait on slowGate while it is held (answers unchanged otherwise). */
  gateList?: boolean;
  /** The list read answer (default: the rows). */
  list?: Responder;
  templates?: FixtureAnswer;
  computer?: TopComputer | null;
  /** The answers of the changes (default: done). */
  setEnabled?: Responder;
  update?: Responder;
  remove?: Responder;
  /** A key read by id (default: an end date only). */
  read?: Responder;
  create?: Responder;
  copy?: Responder;
  setSsh?: FixtureAnswer;
  /** Mints ask for the 2FA code first. */
  otp?: boolean;
}

/** How many creates reached the fake server (tests: a double press sends once). */
export const sent = {
  create: 0,
  remove: 0,
  setEnabled: 0,
  /** Edits that reached the fake server. */
  edit: 0,
  computer: 0,
  setSsh: 0,
  /** Copies that reached the fake server (states without their own copy answer). */
  copy: 0,
  /** Tests (`copyUnnamedPending`): a key with the copied key's scope has appeared; (`namesake*Before`): the namesake
   *  listed is one made just now. */
  twin: 0,
  /** State `pendingAppeared`: creates and copies sent (the namesake is listed once one was); tests set it to 0. */
  appeared: 0,
  /** Tests: how many of the next list reads fail (state `listFailsNext`). */
  failList: 0,
  /** Tests: how many of the next list reads come back cut, without the first key (state `pauseCutNext`). */
  cutList: 0,
};

/** Tests: every edit body that reached the fake server, in order (tests empty it). */
export const editBodies: unknown[] = [];
/** Tests (state `liveThenHeld`): while a test sets `wait`, the state's answers stay on their way until it settles (the
 *  test says when the change turns held); unset, they are lost after 700 ms. */
export const liveGate: { wait: Promise<void> | null } = { wait: null };
const lostLater = () => liveGate.wait ?? new Promise((r) => setTimeout(r, 700));
/** Tests: a slow answer the test holds instead of racing its timer. While `hold()` is on,
 *  every gated answer that arrives is counted in `arrived` and waits until `release()`, then answers at once; unheld,
 *  it keeps its own delay, so a test that never holds sees the fixture as before. `reset()` releases and recounts.
 *  The hold sits BEFORE the send point: core's transport awaits the fixture answer before it calls `onSend`, so a held
 *  write is admitted but not yet counted as sent (not in `openMutations()`, no sign-out warning) until release. The
 *  timer of `answers.slow` runs after `onSend`: a test of the sent phase must not hold the gate. */
export const slowGate = {
  held: false,
  arrived: 0,
  waiting: [] as (() => void)[],
  hold() {
    this.held = true;
  },
  release() {
    this.held = false;
    for (const go of this.waiting.splice(0)) go();
  },
  reset() {
    this.release();
    this.arrived = 0;
  },
};
const gated = <R>(a: FixtureAnswer<R>): FixtureAnswer<R> | Promise<FixtureAnswer<R>> => {
  slowGate.arrived++;
  return slowGate.held ? new Promise((go) => slowGate.waiting.push(() => go({ ...a, delayMs: 0 }))) : a;
};
/** Tests (state `shareTextLost`): how the list answers from now on: as the world (`live`), a failed read, or a cut
 *  list without the share. Reset it after the test. */
export const shareLostReads: { mode: "live" | "fail" | "cut" } = { mode: "live" };
/** Tests (state `deleteUnknownListed`): true = a copy made there has no name. */
export const deleteUnknownMade: { unnamed: boolean } = { unnamed: false };
/** Tests (state `editHeld`): what a fresh read of a key by id answers; null: the read fails. */
export const editRead: { row: RawToken | null } = { row: null };
const editSent = (answer: () => FixtureAnswer | Promise<FixtureAnswer>) => (req: { body: unknown }) => {
  sent.edit++;
  editBodies.push(req.body);
  return answer();
};

/** Tests: every body the default create answered, in order (tests empty it). */
export const createBodies: unknown[] = [];

/** Tests (state `shareRejected`): reads of the rights catalogue so far, and rights the catalogue leaves out once
 *  a create was refused (the server no longer knows them). `reset()` before each test. */
export const catalogueFixture = {
  reads: 0,
  dropAfterRefusal: [] as string[],
  refused: 0,
  /** Drop `dropAfterRefusal` from the next read on, refusal or not (state `catalogueMoves`). */
  dropNow: false,
  /** The next reads answer an empty catalogue (state `catalogueMoves`). */
  emptyNow: false,
  reset(): void {
    this.emptyNow = false;
    this.reads = 0;
    this.dropAfterRefusal = [];
    this.refused = 0;
    this.dropNow = false;
  },
};
const withoutRights = (tree: Tree, drop: readonly string[], prefix = ""): Tree =>
  Object.fromEntries(
    Object.entries(tree)
      .filter(([k]) => !drop.includes(prefix + k))
      .map(([k, v]) => [k, typeof v === "object" ? withoutRights(v, drop, `${prefix}${k}.`) : v]),
  );
const countedTemplates = (): FixtureAnswer => {
  catalogueFixture.reads++;
  if (catalogueFixture.emptyNow) return done({ data: [] });
  const drop = catalogueFixture.refused > 0 || catalogueFixture.dropNow ? catalogueFixture.dropAfterRefusal : [];
  return done({ data: templates.map((t) => ({ ...t, permissions: withoutRights(t.permissions, drop) })) });
};

/** Tests (state `gatedShare`): answers the create in flight with a made key. */
let openShareGate: (() => void) | null = null;
export function releaseShare(): void {
  openShareGate?.();
  openShareGate = null;
}

/** Tests (state `sshMakeUse`): every SSH key sent, in order (the computer then reads back the last one). */
export const sshSetBodies: (string | null)[] = [];

/** Tests (state `heldMyIp`): GET /ip answers only once the test calls `release()`, so a test decides when the read
 *  lands relative to what it types. `reset()` closes it again. */
export const myIpGate = {
  open: false,
  waiting: [] as (() => void)[],
  reset() {
    this.open = false;
    this.waiting = [];
  },
  release() {
    this.open = true;
    for (const go of this.waiting.splice(0)) go();
  },
  wait(): Promise<void> {
    return this.open ? Promise.resolve() : new Promise<void>((go) => this.waiting.push(go));
  },
};

const done = (body: unknown = {}): FixtureAnswer => ({ status: 200, body });
/** Tests: the Share drawer's read of a realm's computers. `sent` keeps each query sent; `answer`, when set, answers
 *  instead of the fixture world (a failure, a slow or a long list). `reset()` clears both. */
export const shareComputersFixture = {
  sent: [] as Record<string, string>[],
  answer: null as
    | null
    | ((query: Readonly<Record<string, string>>) => FixtureAnswer | Promise<FixtureAnswer>),
  reset() {
    this.sent = [];
    this.answer = null;
  },
};
/** Only the Share drawer's read (a realm_id): an account-wide read without one (setup, Computers, Realms) falls through
 *  to its own page's rule, whichever page's rules come first. */
export const isRealmComputersRead = (req: { query: Readonly<Record<string, string>> }): boolean =>
  /^[0-9a-f]{24}$/.test(req.query.realm_id ?? "");
/** GET /computers/:id is core's route (computerRuntimeRoute), which other pages answer too: the whole-Hub run composes
 *  every page's rules. Keys reads it without ?runtime, so a runtime read (Computers' runtime list, a chat's local
 *  address card) is never given Keys' answer, whichever page booted first. */
export const isKeysComputerRead = (req: { query: Readonly<Record<string, string>> }): boolean => req.query.runtime === undefined;
/** GET /computers?realm_id=: the world's computers in that realm, as the base list answers them. */
const realmComputers = (query: Readonly<Record<string, string>>): FixtureAnswer => ({
  status: 200,
  body: {
    data: {
      computers: world.computers
        .filter((c) => c.realm_ids.includes(query.realm_id ?? ""))
        .map((c) => ({
          ...c,
          project_name: world.projects.find((p) => p.id === c.project_id)?.name ?? "",
        })),
    },
  },
});
/** GET /ip as the API answers it (asn serialises empty today). Documentation range. */
export const MY_IP = {
  data: {
    ip: "203.0.113.7",
    ip_info: { ip: "203.0.113.7", city: "Lisbon", region: "Lisbon", country: "PT", timezone: "Europe/Lisbon", asn: {}, is_hosting: false, is_mobile: false, is_anonymous: false, is_satellite: false, is_anycast: false },
  },
};
const pending = (): FixtureAnswer => answers.pending5xx();
const refused = (code: string, status = 409): FixtureAnswer =>
  answers.refused(status, code);

/** Each state's own list back to its first rows (resetFixtureServer): the states are built once, at module load, and one
 *  process draws many sessions (held-session.term.test.tsx). */
const stateResets: (() => void)[] = [];

/** One state: core-format rules over this page's routes. */
function state(o: Opts = {}): FixtureRule[] {
  const rows = o.rows ?? many.slice(0, 7);
  // The world's list, live: a create answered by the default responder adds its key (secret left out, as a list never
  // carries it) and a delete answered by the default responder takes it away, so a flow can prove the list follows
  // (web and terminal alike). States that pass their own list, create or remove keep their own answers.
  const live: RawToken[] = [...rows];
  let minted = 0;
  stateResets.push(() => {
    live.splice(0, live.length, ...rows);
    minted = 0;
  });
  // Two-step code: the first two sends ask for it (the first is cancelled in the tests), then the retry with
  // the code is answered. (A code in the body is not visible to a page's rules yet.)
  const ask = o.otp
    ? [
        reply(routes.create, answers.refused(400, "OTP_REQUIRED"), {
          times: 2,
        }),
        reply(routes.copy, answers.refused(400, "OTP_REQUIRED"), { times: 2 }),
      ]
    : [];
  return [
    ...ask,
    reply(
      routes.list,
      o.list ??
        (() => {
          const a: FixtureAnswer = { status: 200, body: wire(live, o.truncated) };
          return o.gateList ? gated(a) : a;
        }),
    ),
    reply(routes.templates, o.templates ?? done({ data: templates })),
    reply(routes.computer, () => {
      sent.computer++;
      return done(
        containerOf(o.computer === undefined ? computer : o.computer),
      );
    }, { when: isKeysComputerRead }),
    reply(routes.myIp, done(o.myIp ?? MY_IP)),
    reply(routes.realmComputers, (req) => {
      shareComputersFixture.sent.push({ ...req.query });
      return shareComputersFixture.answer
        ? shareComputersFixture.answer(req.query)
        : realmComputers(req.query);
    }, { when: isRealmComputersRead }),
    // A key read by id: a share's end date when the answer to its creation carried none.
    reply(routes.read, o.read ?? done({ data: { expires_at: iso(NOW + 7 * DAY) } })),
    reply(routes.setEnabled, o.setEnabled ?? done()),
    reply(routes.update, o.update ?? editSent(() => done({ data: {} }))),
    reply(
      routes.remove,
      o.remove ??
        ((req) => {
          sent.remove++;
          const id = /[0-9a-f]{24}/.exec(req.path)?.[0];
          const at = id ? live.findIndex((r) => r.id === id) : -1;
          if (at >= 0) live.splice(at, 1);
          return done();
        }),
    ),
    reply(routes.setSshKey, o.setSsh ?? done()),
    reply(
      routes.create,
      o.create ??
        ((req) => {
          sent.create++;
          createBodies.push(req.body);
          const b = req.body as { alias?: unknown } | null;
          const alias = typeof b?.alias === "string" ? b.alias : "";
          if (alias.startsWith("hoody share")) return done(SHARE_MADE);
          // The first key minted in a world keeps the id tests know (900); later ones get their own.
          const answer = made(alias || "ci-deploy");
          const key: RawToken = minted === 0 ? answer.data : { ...answer.data, id: hex(900 + minted), prefix: `hdy_${hex(900 + minted).slice(0, 4)}` };
          minted++;
          const { token: _secret, ...listed } = key;
          live.push(listed as RawToken);
          return done({ data: key });
        }),
    ),
    reply(
      routes.copy,
      o.copy ??
        (() => {
          sent.copy++;
          return done(made("ci-deploy copy"));
        }),
    ),
  ];
}

const withShares = (rows: RawToken[]) => [...many.slice(0, 7), ...rows];

// The list a lost create may or may not have changed: reads before the create was sent (page load, the
// snapshot before the send, however many a layout makes) show seven keys; reads after it (the read-back) show
// the namesake that appeared.
const appearing = (): FixtureRule[] => {
  const first = { status: 200, body: wire(many.slice(0, 7)) };
  const later = {
    status: 200,
    body: wire([
      ...many.slice(0, 7),
      keyRow(901, { alias: "ci", prefix: "hdy_3f9a" }),
    ]),
  };
  return [
    reply(routes.list, () => (sent.appeared > 0 ? later : first)),
    ...state({
      create: () => {
        sent.appeared++;
        return pending();
      },
      // A named copy lost the same way (tests: the copy drawer's pending panel).
      copy: () => {
        sent.appeared++;
        return pending();
      },
    }),
  ];
};

const okList = (rows: RawToken[]) => ({ status: 200, body: wire(rows) });

// The list as it is once the lost changes landed: ci-deploy (keys[0]) paused after a pause was sent, gone after
// a delete was sent. A read-back proves a change only by showing it (C9).
const landed = () => {
  const first = (keys[0] as RawToken).id;
  return okList(
    many
      .slice(0, 7)
      .filter((r) => !(sent.remove > 0 && r.id === first))
      .map((r) =>
        r.id === first && sent.setEnabled > 0 ? { ...r, is_enabled: false } : r,
      ),
  );
};

// A create named "ci" whose answer is lost, where the list from before it does not say which keys were there:
// "cut" (the snapshot is cut) or "fail" (every read before the send fails). After the send the list shows an OLD
// key named "ci" (made in 2020: another client's, or renamed), then (`sent.twin`) instead one made just now.
const namesakeUnknownBefore = (how: "cut" | "fail"): FixtureRule[] => {
  const old = keyRow(904, {
    alias: "ci",
    created_at: "2020-01-01T00:00:00.000Z",
  });
  return [
    reply(routes.list, () => {
      // Counted (sent.create), not a closure: the state is built once, so each test starts it again at 0.
      if (sent.create === 0)
        return how === "cut"
          ? { status: 200, body: wire(many.slice(0, 7), true) }
          : refused("SERVER_ERROR", 500);
      const newest = Math.max(
        ...many.slice(0, 7).map((r) => Date.parse(r.created_at ?? "")),
      );
      const ci =
        sent.twin === 2
          ? keyRow(905, { alias: "ci", created_at: iso(newest + 60_000) })
          : sent.twin > 0
            ? keyRow(905, { alias: "ci", created_at: new Date().toISOString() })
            : old;
      return okList([...many.slice(0, 7), ci]);
    }),
    ...state({
      create: () => {
        sent.create++;
        return pending();
      },
    }),
  ];
};

// An unnamed copy of ci-deploy (keys[0]) whose answer is lost. Reads after it first show only an unrelated new key
// (another client's, with other rights), then (`sent.twin`) also one with the source's realms and rights.
// With `newEnds`, the copy set its own end date: the matching key ends a year from now.
const unnamedCopy = (newEnds = false): FixtureRule[] => {
  let copied = false;
  const src = keys[0] as RawToken;
  const unrelated = keyRow(902, { alias: "laptop-2", permissions: FULL });
  const twin = keyRow(903, {
    ...src,
    id: hex(903),
    alias: "",
    prefix: "hdy_9c03",
    ...(newEnds ? { expires_at: iso(NOW + 365 * DAY) } : {}),
  });
  return [
    reply(routes.list, () =>
      okList([
        ...many.slice(0, 7),
        ...(copied ? [unrelated] : []),
        ...(copied && sent.twin > 0 ? [twin] : []),
      ]),
    ),
    ...state({
      copy: () => {
        copied = true;
        return pending();
      },
    }),
  ];
};

export default defineFixtures({
  default: "many",
  states: {
    /** Seven keys: full, template, some rights, agent sign-in, paused, expired, IP-limited. */
    many: state(),
    /** 60 keys for the long list. */
    long: state({ rows: many }),
    /** No key yet. */
    empty: state({ rows: [] }),
    loading: state({ list: answers.slow(wire([]), 600_000) }),
    error: state({ list: refused("SERVER_ERROR", 500) }),
    /** The rights catalogue did not load: only Full is offered, Access reads unknown. */
    noCatalogue: state({ templates: refused("SERVER_ERROR", 500) }),
    /** Tests: the catalogue answers with no rights at all, which is no catalogue to choose from. */
    emptyCatalogue: state({ templates: done({ data: [] }) }),
    /** Tests: the first share create is refused with a 400 whose code core does not keep, and the catalogue
     *  then leaves out `catalogueFixture.dropAfterRefusal`; later creates are made. */
    shareRejected: [
      reply(routes.templates, () => countedTemplates()),
      reply(routes.create, () => {
        catalogueFixture.refused++;
        return refused("UNKNOWN_FIELD", 400);
      }, { times: 1 }),
      ...state(),
    ],
    /** Tests: the catalogue leaves out `catalogueFixture.dropAfterRefusal` once `dropNow` is set. */
    catalogueMoves: [reply(routes.templates, () => countedTemplates()), ...state()],
    /** Tests: making a share is slow, then answers "may have gone through". */
    slowSharePending: state({ create: () => gated(answers.pending5xx(502, 500)) }),
    /** Tests: after the page load, every read of the list is slow (a send's preliminary read). */
    slowRead: [
      reply(routes.list, okList(many.slice(0, 7)), { times: 1 }),
      reply(routes.list, () => gated(answers.slow(wire(many.slice(0, 7)), 400))),
      ...state(),
    ],
    /** Tests: the first read of the list is slow and shows 7 keys; every later read shows 12 (a change landed). */
    staleFirst: [
      reply(routes.list, answers.slow(wire(many.slice(0, 7)), 500), {
        times: 1,
      }),
      ...state({ rows: many.slice(0, 12) }),
    ],
    /** Tests: an edit may have gone through (counted); a fresh read of the key answers `editRead.row`. */
    editHeld: [
      reply(routes.read, () =>
        editRead.row ? done({ data: editRead.row }) : refused("SERVER_ERROR", 500),
      ),
      ...state({ update: editSent(pending) }),
    ],
    /** Tests: an edit is answered after a moment (counted): the form is locked while it is on its way. */
    editSlow: state({ update: editSent(() => gated(answers.slow({}, 1500))) }),
    /** Tests: an edit is answered after a moment (counted), and reading the person's own address waits for
     *  `myIpGate.release()`: a lookup started before Save lands while it is on its way. */
    editSlowHeldIp: [
      reply(routes.myIp, async () => {
        await myIpGate.wait();
        return done(MY_IP);
      }),
      ...state({ update: editSent(() => gated(answers.slow({}, 1500))) }),
    ],
    /** Tests: an edit is refused (counted, the name is taken), and reading the person's own address waits for
     *  `myIpGate.release()`: a lookup started before a refused Save lands after it. */
    editDupHeldIp: [
      reply(routes.myIp, async () => {
        await myIpGate.wait();
        return done(MY_IP);
      }),
      ...state({ update: editSent(() => answers.refused(400, "DUPLICATE_ALIAS")) }),
    ],
    /** Tests: a delete, a pause or an edit goes out (counted) and, after a moment (or once `liveGate` opens), its
     *  answer is lost: live first, held after. */
    liveThenHeld: [
      reply(routes.remove, async () => {
        sent.remove++;
        await lostLater();
        return pending();
      }),
      reply(routes.setEnabled, async () => {
        sent.setEnabled++;
        await lostLater();
        return pending();
      }),
      ...state({
        update: editSent(async () => {
          await lostLater();
          return pending();
        }),
      }),
    ],
    /** Tests: a pause is answered after a moment (counted); an edit is counted. */
    pauseSlow: [
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return gated(answers.slow({}, 1500));
      }),
      ...state({ update: editSent(() => gated(answers.slow({}, 1500))) }),
    ],
    /** Tests: a pause is unconfirmed (counted), and any edit is too. */
    pauseHeld: [
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return pending();
      }),
      ...state({ update: editSent(pending) }),
    ],
    /** Tests: an edit is refused (counted): the name is taken. */
    editDup: state({ update: editSent(() => answers.refused(400, "DUPLICATE_ALIAS")) }),
    /** Tests: an edit is refused (counted) without a code the page knows. */
    editRefused: state({ update: editSent(() => answers.refused(400, "VALIDATION_ERROR")) }),
    /** Tests: an edit asks for the 2FA code (counted). */
    editOtp: state({ update: editSent(() => answers.refused(400, "OTP_REQUIRED")) }),
    /** Tests: the first pause is unconfirmed (counted), the next one is answered. */
    pauseOnce: [
      reply(
        routes.setEnabled,
        () => {
          sent.setEnabled++;
          return pending();
        },
        { times: 1 },
      ),
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return done();
      }),
      ...state(),
    ],
    /** Tests: the first pause is unconfirmed (counted) and lands: the list shows ci-deploy paused after it. */
    pauseLands: [
      reply(routes.list, landed),
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return sent.setEnabled === 1 ? pending() : done();
      }),
      ...state(),
    ],
    /** Tests: deleting is unconfirmed (counted) and lands: the list lacks ci-deploy after it. */
    deleteLands: [
      reply(routes.list, landed),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state(),
    ],
    /** Tests: deleting is unconfirmed, then the list read back is cut and lacks the first key. */
    pauseCut: [
      // The list is cut (and lacks the first key) only once the delete has been sent: a read before it is whole.
      reply(routes.list, () =>
        sent.remove > 0
          ? { status: 200, body: wire(many.slice(1, 7), true) }
          : okList(many.slice(0, 7)),
      ),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state(),
    ],
    /** Tests: a create made a key without a secret; the delete of it is unconfirmed (counted). List reads wait on
     *  slowGate while a test holds it. */
    deleteUnknown: [
      reply(routes.create, done(made("ci-deploy", null))),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state({ gateList: true }),
    ],
    /** Tests: as deleteUnknown, and the list still shows the made key (its delete may still go through). */
    deleteUnknownListed: [
      // Tests (deleteUnknownMade.unnamed): the key made has no name.
      reply(routes.copy, done(made("", null)), { when: () => deleteUnknownMade.unnamed }),
      reply(routes.create, done(made("ci-made", null))),
      reply(routes.copy, done(made("ci-made", null))),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state({ rows: [...many.slice(0, 7), made("ci-made", null).data] }),
    ],
    /** Tests: pausing is unconfirmed; the next `sent.cutList` list reads are cut and lack the first key. */
    pauseCutNext: [
      reply(routes.list, () => {
        if (sent.cutList > 0) {
          sent.cutList--;
          return { status: 200, body: wire(many.slice(1, 7), true) };
        }
        return okList(many.slice(0, 7));
      }),
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return pending();
      }),
      ...state(),
    ],
    /** Tests: as deleteUnknown; once the delete is sent, the list read back is cut and lacks the made key. */
    deleteUnknownCut: [
      reply(routes.create, done(made("ci-made", null))),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state({
        list: () =>
          sent.remove > 0
            ? { status: 200, body: wire(many.slice(0, 7), true) }
            : okList(many.slice(0, 7)),
      }),
    ],
    /** Tests: as deleteUnknown; once the delete is sent, every read of the list fails. */
    deleteUnknownReadFails: [
      reply(routes.create, done(made("ci-made", null))),
      reply(routes.remove, () => {
        sent.remove++;
        return pending();
      }),
      ...state({
        list: () => (sent.remove > 0 ? refused("SERVER_ERROR", 500) : okList(many.slice(0, 7))),
      }),
    ],
    /** Tests: pausing is unconfirmed and lands; the next `sent.failList` list reads fail, then the list answers again. */
    listFailsNext: [
      reply(routes.list, () => {
        if (sent.failList > 0) {
          sent.failList--;
          return refused("SERVER_ERROR", 500);
        }
        return landed();
      }),
      reply(routes.setEnabled, () => {
        sent.setEnabled++;
        return pending();
      }),
      ...state(),
    ],
    /** Tests: pausing is unconfirmed, and later reads of the list fail (a cached list stays behind). */
    readFails: [
      reply(routes.list, okList(many.slice(0, 7)), { times: 1 }),
      reply(routes.list, refused("SERVER_ERROR", 500)),
      ...state({ setEnabled: pending() }),
    ],
    /** Tests: a pause may have gone through, and every list read after the first waits on slowGate while it is held. */
    readSlow: [
      reply(routes.list, okList(many.slice(0, 7)), { times: 1 }),
      reply(routes.list, () => gated(okList(many.slice(0, 7)))),
      ...state({ setEnabled: pending() }),
    ],
    /** Tests: an unnamed copy may have gone through; an unrelated key appears, then (sent.twin) a matching one. */
    copyUnnamedPending: unnamedCopy(),
    /** Tests: a key with no name, beside the usual keys. */
    unnamedKey: state({ rows: [keyRow(904, { alias: "", realm_ids: [REALM_A], allow_no_realm: false }), ...many.slice(0, 3)] }),
    /** Tests: the only key works in Acme client alone, so Personal (the shell's realm) lists none. */
    realmEmpty: state({ rows: [keyRow(905, { alias: "acme-only", realm_ids: [REALM_B], allow_no_realm: false })] }),
    /** Tests: ci-deploy was used, and made one key (ci-child) that is listed beside it. */
    lineage: state({
      rows: [
        {
          ...(keys[0] as RawToken),
          last_used_at: iso(NOW - DAY),
          last_used_ip: "198.51.100.1",
        },
        ...many.slice(1, 7),
        keyRow(906, {
          alias: "ci-child",
          realm_ids: [REALM_A],
          allow_no_realm: false,
          created_by_token_id: (keys[0] as RawToken).id,
        }),
      ],
    }),
    /** Tests: as copyUnnamedPending, the copy with its own end date. */
    copyUnnamedNewEnds: unnamedCopy(true),
    /** Tests: a named create may have gone through; the list from before it is cut; an old namesake is listed. */
    namesakeCutBefore: namesakeUnknownBefore("cut"),
    /** Tests: a named create may have gone through; the list could not be read before it; an old namesake. */
    namesakeFailBefore: namesakeUnknownBefore("fail"),
    /** Tests: saving the SSH key is slow (the computer on screen can change meanwhile). */
    slowSsh: state({ setSsh: answers.slow(done(), 300) }),
    /** Tests: saving the SSH key may have gone through (after a pause, so the computer on screen can change). */
    slowSshPending: state({ setSsh: answers.pending5xx(502, 300) }),
    /** Tests: the computer holds no SSH key, and the key sent is one another computer already uses. */
    sshInUse: state({ computer: computerNoKey, setSsh: refused("SSH_PUBLIC_KEY_IN_USE", 409) }),
    /** Tests: the computer holds no SSH key, and saving one may have gone through. */
    sshNonePending: state({ computer: computerNoKey, setSsh: pending() }),
    /** The computer the top bar shows is in another realm (the realm's host refuses it: 403 INSUFFICIENT_PERMISSIONS). */
    /** The Share drawer could not list the realm's computers (it still says what the share reaches). */
    shareComputersFailed: [reply(routes.realmComputers, answers.refused(503, "SERVICE_UNAVAILABLE"), { when: isRealmComputersRead }), ...state({ rows: withShares(shares) })],
    sshReadRealm: [reply(routes.computer, answers.refused(403, "INSUFFICIENT_PERMISSIONS"), { when: isKeysComputerRead }), ...state()],
    /** Tests: the computer holds no SSH key; every save is counted and recorded, and the computer then reads back
     *  the key last sent (a key made here, used, shows as the current key). */
    sshMakeUse: [
      reply(routes.setSshKey, (req) => {
        sent.setSsh++;
        sshSetBodies.push((req.body as { ssh_public_key?: string | null } | undefined)?.ssh_public_key ?? null);
        return done();
      }),
      reply(routes.computer, (req) => {
        sent.computer++;
        // Another computer put on screen (a test's setTarget) reads as "zephyr", holding no key.
        const id = req.path.split("/").pop() ?? "";
        if (id !== computer.id) return done(containerOf({ ...computerNoKey, id, name: "zephyr" }));
        return done(containerOf({ ...computerNoKey, ssh_public_key: sshSetBodies.at(-1) ?? "" }));
      }, { when: isKeysComputerRead }),
      ...state({ computer: computerNoKey }),
    ],
    /** Reading the computer: a 403 that names no realm (another code): a missing right. */
    sshReadForbidden: [reply(routes.computer, answers.refused(403, "FORBIDDEN"), { when: isKeysComputerRead }), ...state()],
    /** Reading the computer: the sign-in ended (401). */
    sshReadSignin: [reply(routes.computer, answers.refused(401, "UNAUTHORIZED"), { when: isKeysComputerRead }), ...state()],
    /** Reading the computer: it no longer exists (404). */
    sshReadGone: [reply(routes.computer, answers.refused(404, "NOT_FOUND"), { when: isKeysComputerRead }), ...state()],
    /** Reading the computer: the server failed once (503); Try again reads it. */
    sshReadServer: [reply(routes.computer, answers.refused(503, "SERVICE_UNAVAILABLE"), { when: isKeysComputerRead, times: 1 }), ...state()],
    /** Reading the computer: no answer came back once; Try again reads it. */
    sshReadOffline: [reply(routes.computer, answers.lost(), { when: isKeysComputerRead, times: 1 }), ...state()],
    /** Reading the computer: a refusal this page has no words for (409). */
    sshReadOther: [reply(routes.computer, answers.refused(409, "CONFLICT"), { when: isKeysComputerRead }), ...state()],
    /** Tests: the computer holds no SSH key; the first save is refused, every later one may have gone through. */
    sshFailsThenHeld: [
      reply(routes.setSshKey, () => {
        sent.setSsh++;
        return sent.setSsh === 1 ? refused("INVALID_SSH_KEY", 422) : pending();
      }),
      ...state({ computer: computerNoKey }),
    ],
    /** Tests: saving the SSH key may have gone through, and every computer read after it is slow. */
    sshSlowCheck: [
      reply(routes.setSshKey, () => {
        sent.setSsh++;
        return pending();
      }),
      reply(routes.computer, () =>
        sent.setSsh > 0
          ? answers.slow(done(containerOf(computer)), 1500)
          : done(containerOf(computer)),
        { when: isKeysComputerRead },
      ),
      ...state(),
    ],
    /** Tests: saving the SSH key may have gone through, and every computer read after it fails (503). */
    sshCheckReadFails: [
      reply(routes.setSshKey, () => {
        sent.setSsh++;
        return pending();
      }),
      reply(routes.computer, () =>
        sent.setSsh > 0
          ? refused("SERVICE_UNAVAILABLE", 503)
          : done(containerOf(computer)),
        { when: isKeysComputerRead },
      ),
      ...state(),
    ],
    /** Tests: saving the SSH key may have gone through, and the computer is gone (404) once it was sent. */
    sshGone: [
      reply(routes.setSshKey, () => {
        sent.setSsh++;
        return pending();
      }),
      reply(routes.computer, () =>
        sent.setSsh > 0
          ? refused("NOT_FOUND", 404)
          : done(containerOf(computer)),
        { when: isKeysComputerRead },
      ),
      ...state(),
    ],
    /** Tests: two shares are live and stopping one may have gone through. */
    sharedStopPending: state({
      rows: withShares(shares),
      remove: () => {
        sent.remove++;
        return pending();
      },
    }),
    /** Tests: as sharedStopPending; once the stop is sent, the list read back is cut and lacks every share. */
    sharedStopCut: state({
      rows: withShares(shares),
      list: () =>
        sent.remove > 0
          ? { status: 200, body: wire(withShares([]), true) }
          : { status: 200, body: wire(withShares(shares)) },
      remove: () => {
        sent.remove++;
        return pending();
      },
    }),
    /** Tests: a share is made but its text does not reach the page; stopping it may have gone through. */
    shareTextLost: [
      // Tests (shareLostReads): a later read of the list fails, or comes back cut without the share.
      reply(routes.list, refused("SERVER_ERROR", 500), { when: () => shareLostReads.mode === "fail" }),
      reply(routes.list, { status: 200, body: wire([], true) }, { when: () => shareLostReads.mode === "cut" }),
      ...state({
        create: done({ data: { ...SHARE_MADE.data, token: null } }),
        remove: pending(),
      }),
    ],
    /** Tests: after the page load, every read of the list is slow and shows 12 keys. */
    slowLater: [
      reply(routes.list, okList(many.slice(0, 7)), { times: 1 }),
      reply(routes.list, () => gated(answers.slow(wire(many.slice(0, 12)), 300))),
      ...state(),
    ],
    /** Tests: after the page load, every read of the list is slow (gated) and lists two shares made under the
     *  ledger's aliases `hoody share one` and `hoody share two`, so a read can prove either. */
    slowLaterShares: [
      reply(routes.list, okList(many.slice(0, 7)), { times: 1 }),
      reply(routes.list, () =>
        gated(
          answers.slow(
            wire([
              ...many.slice(0, 7),
              { ...shareRow(1, 70), alias: "hoody share one" },
              { ...shareRow(2, 20), alias: "hoody share two" },
            ]),
            300,
          ),
        ),
      ),
      ...state(),
    ],
    /** Tests: a key is made without its secret; deleting it is slow. */
    slowDelete: [
      reply(routes.create, done(made("ci-deploy", null))),
      reply(routes.remove, answers.slow({}, 300)),
      ...state(),
    ],
    /** Tests: a delete is refused (the server answers that the key is in use). */
    deleteRefused: [reply(routes.remove, answers.refused(409, "CONFLICT")), ...state()],
    /** Tests: reading the person's own address is slow (they can type meanwhile). */
    slowMyIp: [
      reply(routes.myIp, answers.slow(MY_IP, 600)),
      ...state(),
    ],
    /** Tests: reading the person's own address waits for `myIpGate.release()`. */
    heldMyIp: [
      reply(routes.myIp, async () => {
        await myIpGate.wait();
        return done(MY_IP);
      }),
      ...state(),
    ],
    /** A key that holds one area whole (Projects): its panel marks the area Full. */
    rightsWhole: state({
      rows: [
        keyRow(31, {
          alias: "projects-admin",
          prefix: "hdy_f00d",
          permissions: { computers: { read: true }, projects: FULL.projects as Tree },
        }),
        ...keys,
      ],
    }),
    /** Tests: the person's own address is IPv6 (the list takes IPv4 only). */
    myIpV6: state({ myIp: { data: { ip: "2001:db8::7", ip_info: { country: "PT", city: "Porto" } } } }),
    /** Tests: a pause is slow. */
    slowPause: state({ setEnabled: answers.slow(done(), 3000) }),
    /** Tests: a share's answer is slow. */
    slowShare: [
      ...state({
        create: () => gated(answers.slow({ data: SHARE_MADE.data }, 300)),
      }),
    ],
    /** Tests: a share's create is counted and answered (made) only when the test calls `releaseShare()`. */
    gatedShare: state({
      create: () => {
        sent.create++;
        return new Promise((done) => {
          openShareGate = () => done({ status: 200, body: { data: SHARE_MADE.data } });
        });
      },
    }),
    /** Every change answers "may have gone through". */
    pendingOps: state({
      setEnabled: pending(),
      remove: () => {
        sent.remove++;
        return pending();
      },
      create: pending(),
      copy: pending(),
      setSsh: pending(),
    }),
    /** Tests: a create answers "may have gone through", and each one that arrives is counted. */
    pendingCreate: state({
      create: () => {
        sent.create++;
        return pending();
      },
    }),
    /** Tests: a create is slow, then answers "may have gone through" (counted when it is sent). */
    slowPendingCreate: state({
      create: () => {
        sent.create++;
        return gated(answers.pending5xx(502, 700));
      },
    }),
    /** A key was made, its answer lost: a namesake appeared in the list. */
    pendingAppeared: appearing(),
    /** Every change is refused. */
    failedOps: state({
      create: refused("DUPLICATE_ALIAS"),
      copy: refused("AUTH_TOKEN_LIMIT_REACHED"),
      setEnabled: refused("SERVER_ERROR", 500),
      remove: refused("SERVER_ERROR", 500),
      setSsh: refused("SERVER_ERROR", 500),
    }),
    /** The key was made but no secret came back. */
    noSecret: state({ create: done(made("ci-deploy", null)) }),
    /** Making a key asks for the 2FA code first (123456 in fixtures). */
    otp: state({ otp: true }),
    noComputer: state({ computer: null }),
    sshNone: state({ computer: computerNoKey }),
    /** Two live shares in one realm. */
    shared: state({ rows: withShares(shares) }),
    /** Tests: the shares `sharedServer` keeps; Stop, Pause/Resume and edits change them there. */
    sharedServer: state({
      list: async () => {
        const go = sharedServer.beforeList;
        sharedServer.beforeList = null;
        if (go) await go();
        return { status: 200, body: wire(withShares(sharedServer.rows), sharedServer.truncated) };
      },
      remove: serverWrite("remove"),
      setEnabled: serverWrite("setEnabled"),
      update: serverWrite("update"),
      read: (req) => {
        const row = sharedServer.rows.find((r) => req.path.includes(r.id));
        return row ? done({ data: row }) : refused("NOT_FOUND", 404);
      },
    }),
    /** Shots: two shares this page manages, one of them paused, beside two it does not manage. */
    sharedManaged: state({
      rows: withShares([
        managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" }),
        managedShare(5, 30, { alias: "hoody share fghijklmnopq Sam", is_enabled: false }),
        ...shares,
      ]),
    }),
    /** Tests: shares listed, and GET /ip answers something that is not an address (Add my IP in Share realm). */
    sharedMyIpOdd: state({ rows: withShares(shares), myIp: { data: { ip: "unknown" } } }),
    /** Tests: shares listed, and reading the person's own address fails (Add my IP in Share realm). */
    sharedMyIpFail: [
      reply(routes.myIp, answers.refused(503, "unavailable")),
      ...state({ rows: withShares(shares) }),
    ],
    /** Tests: one of the shares was made for someone. */
    sharedNamed: state({ rows: withShares([...shares, namedShare]) }),
    sharedEmpty: state(),
    /** The list is cut: older shares may not be listed. */
    sharedTruncated: state({
      rows: withShares(shares),
      truncated: true,
    }),
    /** The list does not load on the Shared tab. */
    sharedError: state({ list: refused("SERVER_ERROR", 500) }),
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  // Every `sent` key back to 0, its start value: the counters, and the knobs a test sets (twin, appeared, failList,
  // cutList; appeared also counts). A terminal test sets a knob AFTER renderPage, whose boot runs this; web tests
  // never boot through here.
  for (const k of Object.keys(sent) as (keyof typeof sent)[]) sent[k] = 0;
  for (const r of stateResets) r();
  editBodies.length = 0;
  createBodies.length = 0;
  sshSetBodies.length = 0;
  liveGate.wait = null;
  editRead.row = null;
  openShareGate = null;
}
