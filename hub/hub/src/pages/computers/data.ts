// The computers page's data: its queries and mutations, declared in one place.
// Every read and change goes through core (coreSource over the routes in routes.ts); in fixture mode core's rules
// answer (fixtures.ts, in core's format). The pure rules are in logic.ts.
import { aliasList, aliasLock, aliasRowsOf, computerLifecycle, queryClient, computersPage, computersPageOf, coreSource, readLanes, realmDomain, subjectOf, targetOf, defineQuery, defineRoute, heldChanges, nobodysHeld, programLock, programOp, programProves, sendingChanges, setupLocks, useCan, useChangesVersion, useCurrentComputer, useRealms as useCoreRealms, useSetupState, stringOrEmpty as str, type SetupRoom, type Subject, type HeldChange, type HeldRow, type ProgramAct, type SourceTable } from '@core';
import { bytesToGb, ipDetailsFrom, type IpDetails } from '@kit';
import { useEffect, useMemo } from 'react';
import { fromAnswer, requestBody } from './cmd-logic';
import { createdKey } from './create-logic';
import { desktopDisplay, desktopEnvsOf, desktopSessionsOf, desktopShellOf, desktopsOf, type DesktopEnv, type DesktopShell } from './desktop';
import { bucket, classifyRuntime, type Caps } from './logic';
import { clearVerdict, ownStateOf, projectRulesOf, rulesFrom, writeVerdict, type AccessRules, type AccessWrite, type ClearWrite, type OwnState, type ProjectRules } from './parts/access.logic';
import { KEY_PARAM, personName, stepVerdict, type StepWrite } from './parts/access.picked';
import { factsOf } from './parts/ServerDetail.logic';
import { computerKey, forgetComputer } from './parts/desktopSlots';
import { membersFrom, myLevel, projectComputersOf, projectWriteVerdict, sharedWithMe, type AddTarget, type Level, type Member, type Mine, type ProjectComputer, type ProjectWant, type Roster } from './parts/projectPerms.logic';
import { routes } from './routes';
import type { Alias, CommandResult, Computer, Program, ProgramState, Project, Realm, RuntimeInfo, Server, ServerAi, ServersAi, Subscription, Usage } from './types';

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** A projects list answer (realm or base host) as rows: alias, colour, realms, the default flag and the owner. */
const projectRow = (p: unknown): Project => {
  const x = obj(p);
  const realms = arr(x?.realm_ids).filter((r): r is string => typeof r === 'string');
  const owner = str(x?.user_id);
  return { id: str(x?.id), name: str(x?.alias), color: str(x?.color) || undefined, realm_ids: realms, is_default: x?.is_default === true, ...(owner ? { owner } : {}) };
};
const projectRows = (raw: unknown): Project[] => arr(obj(obj(raw)?.data)?.projects).map(projectRow);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Environment values are secrets: whatever the create answer echoes is wiped before anything sees it. */
function scrubEnv(answer: unknown): void {
  const c = obj(obj(obj(answer)?.data)?.computer ?? obj(answer)?.data);
  if (c && 'environment_vars' in c) delete c.environment_vars;
}

// Real API shapes (openapi.json). Changes are never resent: a lost answer is read back through `reads`.
// Not wired (no route): botsHere, usageAll (one stats read per computer is too many for the list). They fail
// 'not_wired' on a live page and read as "nothing to show", never fixtures.
// Bytes as GB by the kit's storage policy (one switch, kit/format.ts). Unrounded: the page rounds at display time
// (logic.ts usageOfText and pctText), so percentages use the exact ratio.
const gb = (v: unknown): number | null => { const n = num(v); return n === null ? null : bytesToGb(n); };
const STATE: Record<string, ProgramState> = {
  running: 'running', starting: 'starting', stopping: 'restarting', restarting: 'restarting', stopped: 'stopped', idle: 'idle', finished: 'stopped',
  off: 'stopped', fatal: 'failed', ended: 'failed', failed: 'failed', unknown: 'unknown',
};
// The daemon's overview, only what the Programs tab shows (the full rules live on the Programs page).
/** The wire answer behind each selected programs value: the shared proves judges the wire, not the page shape. */
const programsWire = new WeakMap<object, unknown>();
function programsOf(raw: unknown): Program[] {
  return arr(obj(raw)?.programs).flatMap((p) => {
    const x = obj(p);
    const id = num(x?.id);
    if (!x || id === null) return [];
    const inst = arr(x.instances).map(obj);
    const status = str(x.status) || str(inst[0]?.status);
    const ports = inst.map((i) => num(i?.port)).filter((n): n is number => n !== null);
    const pr = obj(x.port_range);
    const range = !!pr && num(pr.start) !== null && num(pr.end) !== null;
    return [{
      id: String(id), name: str(x.name).slice(0, 80), system: x.hoody_kit === true,
      state: STATE[status === 'backoff' ? 'restarting' : status === 'exited' ? 'stopped' : status] ?? 'unknown',
      ports, uptimeSeconds: num(x.uptime_s) ?? num(inst[0]?.uptime_s), boot: typeof x.boot === 'boolean' ? x.boot : null,
      ...(range ? { range: true } : {}),
    }];
  });
}
// The computer a change or kit read is for (Subject, subjectOf) and the core target it is sent to (targetOf, which
// refuses when the server is unknown): core's one copy (core/storage/subject.ts, moved there from this file).
export { subjectOf, targetOf, type Subject };
/** A program change. `range`: a port-range program; programOp makes a whole stop or restart cover every part (`all`). */
type PV = Subject & { program: string; port?: number; range?: boolean; boot?: boolean };
// Program changes come from core's programOp, the one builder the Programs page sends with too:
// the same press is the same body under the same shared lock on both pages.
const progOp = (act: ProgramAct) => (v: PV) => programOp({ id: v.program, act, port: v.port ?? null, range: !!v.range, ...(v.boot !== undefined ? { boot: v.boot } : {}) });
const progChange = (act: ProgramAct) => {
  const op = progOp(act);
  return { input: (v: PV) => ({ target: targetOf(v), params: { id: v.program }, body: op(v).body }), lock: programLock[act], lockKey: (v: PV) => op(v).identity };
};
// The computer's egress program (kit 'egress', port 1: its proxy, shown in the Network tab): its upstream proxy, read,
// set and cleared by parts/ExitIp.tsx. The set body is the proxy URL as plain text, login included, so core treats it
// as secret; none of the three takes an idempotency key (a lost answer is read back, never resent).
const egressKit = { scope: 'kit', kit: 'egress', index: 1 } as const;
export const egressRoutes = {
  upstream: defineRoute({ method: 'GET', path: '/api/v1/egress/upstream', ...egressKit }),
  set: defineRoute({ method: 'PUT', path: '/api/v1/egress/upstream', ...egressKit, bodyText: true }),
  clear: defineRoute({ method: 'DELETE', path: '/api/v1/egress/upstream', ...egressKit }),
} as const;
// A people-or-keys step change: its If-Match is the version the previous answer (or a fresh read) gave, its answer
// read through rulesFrom (no credential), its lock and identity the computer and the step's names.
const stepChange = (input: (v: StepWrite) => { params?: Record<string, string>; body?: Record<string, unknown> }) => ({
  input: (v: StepWrite) => ({ params: { id: v.id }, ...input(v), ifMatch: `file:v${v.from}` }),
  reads: ['accessRules', 'accessScope'],
  select: (raw: unknown) => rulesFrom(raw),
  lock: 'computer.access', lockKey: (v: StepWrite) => ({ computer: v.id }),
  identity: (v: StepWrite) => ({ computer: v.id, from: v.from, ...v.step }),
  proves: stepVerdict,
});
// The computer's access rules document, replaced whole (parts/AccessDrawer.tsx): the API requires If-Match, the
// version the drawer read (428 without it, 412 when stale), and echoes the stored document, so the answer is secret.
// The one refusal these secret routes may name: the computer's server ended or was reinstalled (the kit has its words).
const ACCESS_CODES = ['COMPUTER_EXPIRED'] as const;
export const accessRoutes = {
  set: defineRoute({ method: 'PUT', path: '/computers/:id/proxy/permissions', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true, body: ['project', 'computer', 'groups', 'permissions', 'default', 'enable_proxy'] }),
  // "Only people or keys I pick" (parts/access.picked.ts): one step per write, each with If-Match, each answering the
  // whole stored document (secret: it holds every group's credential).
  person: defineRoute({ method: 'PUT', path: '/computers/:id/proxy/permissions/groups/:groupName/password', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true, body: ['username', 'password', 'salt'] }),
  key: defineRoute({ method: 'PUT', path: '/computers/:id/proxy/permissions/groups/:groupName/token', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true, body: ['param', 'value'] }),
  grant: defineRoute({ method: 'PUT', path: '/computers/:id/proxy/permissions/permissions/:groupName', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true, body: ['program', 'access'] }),
  deny: defineRoute({ method: 'PATCH', path: '/computers/:id/proxy/permissions/default', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true, body: ['default'] }),
  drop: defineRoute({ method: 'DELETE', path: '/computers/:id/proxy/permissions/groups/:groupName', scope: 'realm', secret: true, codes: ACCESS_CODES, ifMatch: true }),
  // "Use only the project's rules": removes the computer's own document, If-Match the version the drawer read.
  clear: defineRoute({ method: 'DELETE', path: '/computers/:id/proxy/permissions', scope: 'realm', ifMatch: true }),
} as const;
/** The live table (exported so a test can check what each call sends and to whom). */
const rowsOf = (answers: readonly (readonly unknown[])[]): Computer[] => (answers[0] ?? []).flatMap((a) => (Array.isArray(a) ? (a as Computer[]) : [a as Computer]));
const projectsOf = (answers: readonly (readonly unknown[])[]): Project[] => (answers[0] ?? []).flatMap((a) => (Array.isArray(a) ? (a as Project[]) : [a as Project]));
/** The API keeps colours upper case with '#': compare them that way. */
const hex = (v: unknown): string => (typeof v === 'string' ? v.replace(/^#?/, '#').toUpperCase() : '');
const aliasesOf = (answers: readonly (readonly unknown[])[]): Alias[] => (answers[0] ?? []).flatMap((a) => Object.values((a ?? {}) as Record<string, Alias[]>).flat());
/** A short, non-reversible fingerprint of an SSH public key (what a held change may show; never the key). */
function keyPrint(key: string | null): string {
  const k = (key ?? '').trim();
  if (!k) return 'none';
  let h = 0x811c9dc5;
  for (let n = 0; n < k.length; n++) h = Math.imul(h ^ k.charCodeAt(n), 0x01000193) >>> 0;
  return h.toString(16);
}
/** 'applied' when a fresh computers list holds a row with these fields; anything else proves nothing (the change stays held). */
function listHas(identity: unknown, answers: readonly (readonly unknown[])[], want: (i: Record<string, string>) => Record<string, string>): 'applied' | undefined {
  const w = want((identity ?? {}) as Record<string, string>);
  return rowsOf(answers).some((r) => Object.entries(w).every(([k, v]) => v !== '' && (r as unknown as Record<string, unknown>)[k] === v)) ? 'applied' : undefined;
}
/** The proof of a create, a copy and a computer made from a snapshot (snapshots/data.ts copyFrom, the copy route): a
 *  fresh list holds a computer of the sent name in the sent project that the page's list did not show at the press
 *  (`before`, every id that list showed). The API refuses a name its project already holds (409,
 *  project-wide: the API's own name check, for a create and a copy alike), so a row
 *  that was there before proves nothing, and neither does one the list showed under another name that was renamed into
 *  the sent name after the press (another tab, another client). `realm` is the realm the change was sent under
 *  ('all' for the base host). `before` holds only what that realm's list showed, while the name check is project-wide
 *  and an All-realms read also judges a realm's hold: so a realm's change counts only a row in that realm (the API puts
 *  the request realm on the new computer, a create's and a copy's); 'all' counts any. `server` is the server it was
 *  sent to (a create's body `server_id`, a copy's `target_server_id`), where the API puts the new computer: a row on
 *  another server proves nothing. The list leaves out computers the name check still sees: one on a pooled server the
 *  person is not admitted to, which a later read shows once they are. While not admitted, the
 *  person cannot send the change to that server, so such a row does not prove it. Known limits, which hold only when
 *  the earlier answer was lost: (1) the person is admitted to the pool after the list read, and the servers read
 *  offers the server before the computers list is read again. A press then takes `before` from the earlier list,
 *  which lacked the hidden row, so that row proves a change the API refused. (2) A computer of the same name, project,
 *  realm and server made by ANOTHER held change proves this one too (a create, a copy of another computer and a
 *  computer from a snapshot hold separate locks). No `before` (no list at the press, or one that may not be the
 *  whole list: pressBefore), no `realm` or no `server` (a hold recorded before it was kept) proves nothing: held
 *  until the person's warned Dismiss, never "any server". A row with no id proves nothing. */
export function listMadeNew(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const i = (identity ?? {}) as { project?: unknown; name?: unknown; before?: unknown; realm?: unknown; server?: unknown };
  const before = Array.isArray(i.before) ? (i.before as unknown[]) : null;
  const realm = typeof i.realm === 'string' && i.realm !== '' ? i.realm : null;
  const server = typeof i.server === 'string' && i.server !== '' ? i.server : null;
  const inRealm = (r: Computer) => realm === 'all' || (Array.isArray(r.realm_ids) && r.realm_ids.includes(realm ?? ''));
  const made = (r: Computer) =>
    typeof r.id === 'string' && r.id !== '' && r.name === i.name && r.project_id === i.project && r.server_id === server && !before?.includes(r.id) && inRealm(r);
  return before && realm && server && i.name && i.project && rowsOf(answers).some(made) ? 'applied' : undefined;
}

/** The `server` a create's, a copy's and a snapshot copy's identity keeps for listMadeNew: the server id sent, when
 *  it is one. */
export const sentServer = (id: unknown): { server?: string } => (typeof id === 'string' && id !== '' ? { server: id } : {});

/** The rows the page's list read asks for (its `limit`, the API's most for GET /computers): one page. pressBefore and
 *  remove.proves judge "the whole list" by it, so the request and those checks cannot drift apart. */
const LIST_ROWS = 100;

/** listMadeNew's `before`, taken at the press from the page's list (`listed`, the 'computers' read): every id it
 *  shows, whatever the name or project (at most LIST_ROWS - 1). Not only the rows under the sent name: a computer the
 *  list showed under another name may be renamed into it after the press, and must not prove the change. Only a list
 *  known to be whole gives one. The read is one page of at most LIST_ROWS rows (its limit, the API's most), so a full
 *  page may leave a computer of that name beyond it, which a later read can show (a computer gone moves it up) and
 *  which would then prove a change the API refused. So no list, or a full page: no `before`, and nothing proves the
 *  change (held until the warned Dismiss). Fewer rows than the limit is the whole list as read (the API's LIMIT left
 *  nothing for a later page), the rule remove.proves counts by too. A row with no id adds nothing. */
export function pressBefore(listed: readonly Computer[] | undefined): string[] | undefined {
  if (!listed || listed.length >= LIST_ROWS) return undefined;
  return listed.flatMap((c) => (typeof c.id === 'string' && c.id !== '' ? [c.id] : []));
}
/** The top bar's computer list (core computersPage, one cache entry with the shell's read): a change that adds,
 *  removes or renames a computer, or moves its colour or realms, reads it again once proved. */
const TOP_BAR = [computersPage] as const;
// core's alias list (Programs shows each port's aliases from it): read again once an alias create or remove is proved.
const ALIAS_READS = [aliasList] as const;

export const computersTable: SourceTable = {
    reads: {
      // The list as core reads it (pageAt): a body without data.containers is a read error, never an empty list, so it
      // cannot prove a held delete (remove.proves).
      computers: { route: routes.list, input: () => ({ query: { limit: LIST_ROWS } }), select: (raw) => computersPageOf(raw).rows },
      // Every realm's computers (one page): rows plus whether that page is the whole list (core's reading; a body
      // without a list is a read error, never "none").
      accountComputers: { route: routes.accountList, input: () => ({ query: { page: 1, limit: 100 } }), select: computersPageOf },
      // The Import drawer's own copy of the every-realm list. The page keeps that drawer mounted while closed (a query
      // switched off): on the accountComputers key it would stop a realm change's Check again from reading the
      // every-realm list itself (core reads a key no page holds once, off-page), and a computer moved out of the realm
      // in view could never be proved. Same route and answer; read only while the drawer is open.
      importComputers: { route: routes.accountList, input: () => ({ query: { page: 1, limit: 100 } }), select: computersPageOf },
      projects: { route: routes.projects, input: () => ({ query: { limit: 100 } }), select: projectRows },
      // One project read on the base host, by id: the name (and realms) of a listed computer's project that the realm's
      // list lacks. By id, so a project past any page of a list is still found.
      projectOne: { route: routes.project, input: (p: { id: string }) => ({ params: { pid: p.id } }), select: (raw) => projectRow(obj(raw)?.data) },
      // A project's people, base host, the first 100 rows (the API's page maximum): more shows as "at least".
      // The owner (when known) marks an owner's own row. A body without rows is a read error, never "nobody".
      members: {
        route: routes.members,
        input: (p: { id: string; owner?: string }) => ({ params: { pid: p.id }, query: { page: 1, limit: 100 } }),
        select: (raw, p: { id: string; owner?: string }) => {
          const r = membersFrom(raw, p.owner);
          if (!r) throw new Error('members: no rows list');
          return r;
        },
      },
      // A project's access rules, as rulesFrom keeps them (no credential). An answer that is not a document is
      // a read error, never "no rules". Keyed by the project (useProjectRules unwraps it): a change's read-back judges
      // every project's answer it re-reads (projectWriteVerdict), so each names its own.
      projectRules: {
        route: routes.projectRules,
        input: (p: { id: string }) => ({ params: { pid: p.id } }),
        select: (raw, p: { id: string }) => {
          const r = rulesFrom(raw);
          if (!r) throw new Error('projectRules: not a document');
          return { [p.id]: r };
        },
      },
      // A project's computers for its Computers tab (a member gets the API's member view), base host, the
      // first 100 (the API's page maximum; past it the tab says so), expired and deleting ones too. A body that is not
      // whole (projectComputersOf) is a read error, never "no computers" or a partial list.
      projectComputerList: {
        route: routes.projectComputers,
        input: (p: { id: string }) => ({ params: { pid: p.id }, query: { page: 1, limit: 100, include_expired: 'true', include_deleting: 'true' } }),
        select: (raw) => {
          const r = projectComputersOf(raw);
          if (!r) throw new Error('projectComputerList: no list');
          return r;
        },
      },
      servers: {
        route: routes.servers,
        select: (raw) =>
          arr(obj(raw)?.data).map((r) => {
            const x = obj(r);
            const v = obj(x?.server);
            // GET /servers (rentals): specs.cpu.cores, specs.ram.capacity_gb, specs.disks.total_gb (the flat
            // cpu_cores/ram_gb/disk_gb of a slice too) and server.computer_capacity, read by ServerDetail's factsOf.
            const f = factsOf(r);
            return {
              id: str(v?.id) || str(x?.server_id),
              name: str(v?.name),
              place: str(v?.city),
              cc: str(v?.country) || undefined,
              cpu: f?.cores ?? null,
              ram: f?.ramGb ?? null,
              disk: f?.diskGb ?? null,
              free: x?.is_free_tier === true,
              // server.is_vm: true = a slice of a shared host, false = a dedicated machine; absent = not known.
              kind: x?.is_free_tier === true ? 'free' : v?.is_vm === true ? 'subserver' : v?.is_vm === false ? 'metal' : null,
              days: num(x?.remaining_days),
              status: str(x?.status),
              cap: f?.cap ?? null,
              ...(str(x?.id) ? { rentalId: str(x?.id) } : {}),
            };
          }),
      },
      // The Servers cards' AI footer; each server's lanes by core's lane rule (the one Billing uses).
      aiUsage: {
        route: routes.aiUsage,
        select: (raw) => {
          const d = obj(obj(raw)?.data);
          const byId: Record<string, ServerAi> = {};
          for (const r of arr(d?.servers)) {
            const x = obj(r);
            const id = str(obj(x?.server)?.id);
            if (!id || id in byId) continue;
            byId[id] = { ok: x?.status === 'ok', lanes: x?.status === 'ok' ? readLanes(obj(x?.lanes) as Parameters<typeof readLanes>[0]) : [] };
          }
          return { byId, truncated: d?.truncated === true };
        },
      },
      subscriptions: {
        route: routes.subscriptions,
        input: () => ({ query: { limit: 50 } }),
        // more: the list may be cut. Only the API's total can say the list is whole (total <= rows);
        // without a number there it stays unknown, never whole. An answer without a list is a failed read, not none.
        select: (raw) => {
          const items: unknown = obj(raw)?.data;
          if (!Array.isArray(items)) throw new Error('subscriptions answer without a list');
          const total = num(obj(raw)?.total);
          return { items, more: total === null || total > items.length };
        },
      },
      runtime: {
        route: routes.runtime,
        input: (p: { id: string }) => ({ params: { id: p.id }, query: { runtime: true } }),
        select: (raw, p: { id: string }) => ({ [p.id]: obj(obj(obj(raw)?.data)?.runtime_info) ?? {} }),
      },
      usage: {
        route: routes.stats,
        input: (p: { id: string }) => ({ params: { id: p.id } }),
        select: (raw, p: { id: string }) => {
          const x = obj(obj(raw)?.data);
          if (!x) return { [p.id]: null };
          const mem = obj(x.memory);
          const root = obj(obj(x.disk)?.root);
          const diskUsed = num(root?.usage);
          const diskTotal = num(root?.total);
          return {
            [p.id]: {
              cpu: num(obj(x.cpu)?.usage_percent),
              mem: num(mem?.usage) !== null && num(mem?.total) !== null ? { used: gb(mem?.usage), total: gb(mem?.total) } : null,
              disk: num(root?.usage) !== null && num(root?.total) !== null ? { used: gb(root?.usage), total: gb(root?.total) } : null,
              diskBytes: diskUsed !== null && diskTotal !== null ? { used: diskUsed, total: diskTotal } : null,
              at: new Date().toISOString(),
              // The Overview's "Up for": a start time that is not a date is not said (never a guess).
              started: str(x.started_at) && !Number.isNaN(Date.parse(str(x.started_at))) ? str(x.started_at) : null,
              processes: num(x.processes),
            },
          };
        },
      },
      programs: {
        route: routes.programsOverview,
        // A computer whose server is not known has no target (targetOf throws): no read, as for desktops.
        input: (p: Subject) => (p.id && p.project && p.server ? { target: targetOf(p) } : {}),
        select: (raw, p: { id: string }) => {
          const out = { [p.id]: programsOf(raw) };
          programsWire.set(out, raw);
          return out;
        },
      },
      // The Desktop tab's switcher: only the desktop numbers (desktopsOf), never a session's commands or history.
      desktops: {
        route: routes.desktopSessions,
        // A computer whose server is not known has no target (targetOf throws): its input is empty and the read off.
        input: (p: Subject) => (p.id && p.project && p.server ? { target: targetOf(p) } : {}),
        select: (raw, p: { id: string }) => ({ [p.id]: desktopsRead(raw) }),
      },
      // The Desktop tab's environment picker: the environments the terminal program lists (desktopEnvsOf), or null.
      desktopEnvs: {
        route: routes.desktopEnvs,
        input: (p: Subject) => (p.id && p.project && p.server ? { target: targetOf(p) } : {}),
        select: (raw, p: { id: string }) => ({ [p.id]: desktopEnvsOf(raw) }),
      },
      // Never the raw answer: rulesFrom keeps no credential (passwords, tokens, JWT secrets stay out of the page).
      accessRules: {
        route: routes.accessRules,
        input: (p: { id: string }) => ({ params: { id: p.id } }),
        select: (raw, p: { id: string }) => ({ [p.id]: rulesFrom(raw) }),
      },
      myIp: { route: routes.myIp, select: (raw) => ipDetailsFrom(raw) },
      // Whether the computer's project has rules too, read fresh with the rules (the list row may be older).
      accessScope: {
        route: routes.runtime,
        input: (p: { id: string }) => ({ params: { id: p.id } }),
        select: (raw, p: { id: string }) => ({ [p.id]: projectRulesOf(str(obj(obj(raw)?.data)?.proxy_permissions_scope) || undefined) }),
      },
      // Whether the computer keeps a document of its own (proxy_permissions_computer_state): read on its own
      // key so the shapes accessScope's readers take stay as they are. An answer without the field is undefined.
      accessOwn: {
        route: routes.runtime,
        input: (p: { id: string }) => ({ params: { id: p.id } }),
        select: (raw, p: { id: string }) => ({ [p.id]: ownStateOf(obj(obj(raw)?.data)?.proxy_permissions_computer_state) }),
      },
      aliases: {
        route: routes.aliases,
        input: (p: { id: string }) => ({ query: { computer_id: p.id } }),
        // core's alias parse, the one every page reads aliases through.
        select: (raw, p: { id: string }) => ({ [p.id]: aliasRowsOf(raw) }),
      },
    },
    // Create, copy, rename, colour, realms and remove also read the top bar's computer list again once proved
    // (TOP_BAR): a new computer shows there without a visit to Home.
    // Rename, copy, remove and create file their locks under the realm they were sent in: a cross-realm
    // filing waits for core to read realm-filed holds across realms, since a stored realm-filed hold would be
    // invisible to it. The SSH key and alias locks are shared with Keys and Scripts and keep their scope;
    // setRealms is a base route (never realm-filed).
    changes: {
      rename: { route: routes.rename, input: (v: { id: string; name: string }) => ({ params: { id: v.id }, body: { name: v.name } }), reads: ['computers'], coreReads: TOP_BAR,
        // The identity names the sent name: only a list showing it proves the rename.
        lock: 'computer.rename', lockKey: (v: { id: string; name: string }) => ({ computer: v.id, name: v.name }),
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => listHas(identity, answers, (i) => ({ id: i.computer ?? '', name: i.name ?? '' })) },
      setColour: { route: routes.setColour, input: (v: { id: string; color: string }) => ({ params: { id: v.id }, body: { color: v.color } }), reads: ['computers'], coreReads: TOP_BAR,
        // The identity names the sent colour, sent as the API keeps it (#RRGGBB): only a list showing it proves the change.
        lock: 'computer.colour', lockKey: (v: { id: string; color: string }) => ({ computer: v.id, color: v.color }),
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => listHas(identity, answers, (i) => ({ id: i.computer ?? '', color: i.color ?? '' })) },
      setRealms: { route: routes.setRealms, input: (v: { id: string; realmIds: string[] }) => ({ params: { id: v.id }, body: { realm_ids: v.realmIds } }), reads: ['computers', 'accountComputers', 'importComputers'], coreReads: TOP_BAR,
        // The identity names the sent realm set (ids sorted): only a list showing exactly that set proves it. The
        // every-realm list is read too: a computer moved out of the realm in view drops from that realm's list, so
        // only the every-realm list can still show it. The Import drawer's copy (importComputers) is listed last so a
        // done move marks it stale too (a reopened drawer must not offer the old realms); proves reads answers[1] only.
        lock: 'computer.realms', lockKey: (v: { id: string; realmIds: string[] }) => ({ computer: v.id, realms: [...v.realmIds].sort() }),
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const i = (identity ?? {}) as { computer?: string; realms?: string[] };
          const everyRealm = (answers[1] ?? []).flatMap((a) => (a as { rows?: Computer[] } | null)?.rows ?? []);
          const row = [...rowsOf(answers), ...everyRealm].find((r) => r.id === i.computer && JSON.stringify([...(r.realm_ids ?? [])].sort()) === JSON.stringify(i.realms ?? null));
          return row ? 'applied' : undefined;
        } },
      sshKey: { route: routes.setSshKey, input: (v: { id: string; key: string | null }) => ({ params: { id: v.id }, body: { ssh_public_key: v.key } }), reads: ['computers'],
        // A removal sends null: the API clears the key only on null and refuses an empty string with a 400.
        // The identity is a short fingerprint of the sent key (never the key): only a list showing that key, or none after a removal, proves it.
        lock: 'computer.ssh_key', lockKey: (v: { id: string }) => ({ computer: v.id }),
        identity: (v: { id: string; key: string | null }) => ({ computer: v.id, key: keyPrint(v.key) }),
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const i = (identity ?? {}) as { computer?: string; key?: string };
          const row = rowsOf(answers).find((r) => r.id === i.computer);
          return row && keyPrint(row.ssh_public_key || null) === i.key ? 'applied' : undefined;
        } },
      // Who can open the computer (parts/AccessDrawer.tsx): one held write per computer, made against the version the
      // drawer read (If-Match: it applies at most once). The echoed document never reaches the page (select). Only a
      // fresh read of the rules proves it (access.logic.ts writeVerdict).
      access: { route: accessRoutes.set, input: (v: AccessWrite) => ({ params: { id: v.id }, body: v.body, ifMatch: `file:v${v.from}` }), reads: ['accessRules', 'accessScope'],
        select: () => null,
        lock: 'computer.access', lockKey: (v: AccessWrite) => ({ computer: v.id }),
        identity: (v: AccessWrite) => ({ computer: v.id, want: v.want.kind, ...(v.want.kind === 'myIp' ? { ip: v.want.ip } : {}), ...(v.want.kind === 'ips' ? { ips: [...v.want.ranges].sort() } : {}), from: v.from }),
        proves: writeVerdict },
      // One step of a people-or-keys change (access.picked.ts runSteps), under the same lock as a whole write: a
      // lost answer holds every access change of the computer until a fresh read proves it (stepVerdict). The
      // identity is the step's names only; a password or key rides only in the variables, which core never keeps.
      // "Use only the project's rules": a lost answer holds every access change of the computer until a fresh
      // read proves it; only "no document of its own" proves it (access.logic.ts clearVerdict, order-free).
      accessClear: { route: accessRoutes.clear, input: (v: ClearWrite) => ({ params: { id: v.id }, ifMatch: `file:v${v.from}` }), reads: ['accessRules', 'accessOwn', 'accessScope'],
        select: () => null,
        lock: 'computer.access', lockKey: (v: ClearWrite) => ({ computer: v.id }),
        identity: (v: ClearWrite) => ({ computer: v.id, from: v.from, clear: true }),
        proves: clearVerdict },
      accessPerson: { route: accessRoutes.person, ...stepChange((v) => ({ params: { id: v.id, groupName: v.step.op === 'group' ? v.step.group : '' }, body: { username: v.step.op === 'group' ? personName(v.step.group) : '', password: v.secret ?? '', salt: v.salt ?? '' } })) },
      accessKey: { route: accessRoutes.key, ...stepChange((v) => ({ params: { id: v.id, groupName: v.step.op === 'group' ? v.step.group : '' }, body: { param: KEY_PARAM, value: v.secret ?? '' } })) },
      accessGrant: { route: accessRoutes.grant, ...stepChange((v) => ({ params: { id: v.id, groupName: v.step.op === 'grant' ? v.step.group : '' }, body: { program: v.step.op === 'grant' ? v.step.program : '', access: true } })) },
      accessDeny: { route: accessRoutes.deny, ...stepChange(() => ({ body: { default: 'deny' } })) },
      accessDrop: { route: accessRoutes.drop, ...stepChange((v) => ({ params: { id: v.id, groupName: v.step.op === 'drop' ? v.step.group : '' } })) },
      copy: {
        route: routes.copy,
        input: (v: CopyVars) => ({
          params: { id: v.id }, body: { name: v.name, target_project_id: v.project, target_server_id: v.server },
        }),
        reads: ['computers'],
        coreReads: TOP_BAR,
        // The lock names the sent copy (source, name, project). The identity adds `before` and `realm` (CopyVars,
        // never sent) and `server` (the target server sent): the list proves it only by a new computer of that name
        // in that project, on that server (listMadeNew), never by a plain read, and never by the row a copy to a
        // taken name found there (the API answers that copy 409, so a lost 409 would otherwise read as made). A copy
        // sent in a realm is put in that realm only; from the base host it takes the source's realms (the API's
        // copy rule), so 'all' counts a row of any realm. The API puts the copy on
        // `target_server_id`.
        lock: 'computer.copy', lockKey: (v: CopyVars) => ({ computer: v.id, name: v.name, project: v.project }),
        identity: (v: CopyVars) => ({
          computer: v.id, name: v.name, project: v.project,
          ...(v.before ? { before: [...v.before] } : {}), ...(v.realm ? { realm: v.realm } : {}), ...sentServer(v.server),
        }),
        proves: listMadeNew,
      },
      remove: { route: routes.remove, input: (v: { id: string }) => ({ params: { id: v.id } }), reads: ['computers'], coreReads: TOP_BAR, lock: 'computer.remove', lockKey: (v: { id: string }) => ({ computer: v.id }),
        // Applied only when a fresh list no longer holds the row; a list that still holds it proves nothing.
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const id = (identity as { computer?: string } | null)?.computer;
          return id && answers[0] && answers[0].length > 0 && rowsOf(answers).length < LIST_ROWS && !rowsOf(answers).some((r) => r.id === id) ? 'applied' : undefined;
        } },
      // An expired computer deleted from its project's Computers tab (its server ended or was reinstalled): on the base host,
      // where that tab reads it. The same lock and identity as remove, so one computer's two deletes are one change. No
      // list proves it (the realm's list never shows an expired computer): the page proves it with computerGone.
      removeExpired: { route: routes.removeBase, input: (v: { id: string }) => ({ params: { id: v.id } }), reads: ['projectComputerList', 'computers'],
        lock: 'computer.remove', lockKey: (v: { id: string }) => ({ computer: v.id }) },
      create: {
        route: routes.create,
        input: (v: { project: string; body: Record<string, unknown> }) => ({ params: { pid: v.project }, body: v.body, scrub: scrubEnv }),
        // Only whether the answer names an SSH key ('none' | 'set'): a create that sent a key and is answered with
        // none made the computer without it (create-logic.ts keyNotInstalled). Nothing else of the answer is kept.
        select: (raw: unknown) => createdKey(raw),
        reads: ['computers'],
        coreReads: TOP_BAR,
        // The identity names the sent computer (never the environment), `before` (every id the page's list showed at
        // the press: pressBefore), `realm` (the realm it was sent under, 'all' for the base host) and
        // `server` (the body's server_id). The list proves it only by a new computer of that name in that project, in
        // that realm, on that server (listMadeNew).
        lock: 'computer.create', lockKey: (v: { project: string; body: Record<string, unknown> }) => ({ project: v.project, name: String(v.body.name ?? '') }),
        identity: (v: CreateVars) => ({
          project: v.project, name: String(v.body.name ?? ''),
          ...(v.before ? { before: [...v.before] } : {}), ...(v.realm ? { realm: v.realm } : {}), ...sentServer(v.body.server_id),
        }),
        proves: listMadeNew,
      },
      run: {
        route: routes.execute,
        // The folder is part of what is sent, never of the lock: one run per computer.
        input: (v: RunVars) => ({ target: targetOf(v), query: { ephemeral: true }, body: requestBody(v.command, v.cwd) }),
        select: (raw) => fromAnswer(raw) ?? undefined,
        reads: [],
        lock: 'computer.run', lockKey: (v: RunVars) => ({ computer: v.id }),
      },
      // Stop desktop (parts/Desktop.tsx): the display's stop, then its session's end. Neither is resent by itself; no
      // read proves either (a stopped display and an ended session look alike in the session list), so a lost answer
      // stays held until the person presses Stop again, which says it may have gone through first.
      displayStop: {
        route: routes.displayStop,
        input: (v: Subject & { n: number }) => ({ target: targetOf(v), params: { display: desktopDisplay(v.n) } }),
        reads: [],
        lock: 'computer.desktopStop', lockKey: (v: Subject & { n: number }) => ({ computer: v.id, desktop: v.n }),
      },
      desktopEnd: {
        route: routes.desktopEnd,
        input: (v: Subject & { n: number; incarnation: string }) => ({ target: targetOf(v), index: desktopDisplay(v.n), params: { n: desktopDisplay(v.n) }, query: { incarnation: v.incarnation } }),
        reads: ['desktops'],
        lock: 'computer.desktopEnd', lockKey: (v: Subject & { n: number }) => ({ computer: v.id, desktop: v.n }),
      },
      // Program actions share their locks with the Programs page (both build them with core's programOp).
      // A restart declares no reads: only its receipt proves it (parts/programOps.ts).
      programStart: { route: routes.programStart, ...progChange('start'), reads: ['programs'], proves: programProves('start', (a) => programsWire.get(a as object)) },
      programStop: { route: routes.programStop, ...progChange('stop'), reads: ['programs'], proves: programProves('stop', (a) => programsWire.get(a as object)) },
      programRestart: { route: routes.programRestart, ...progChange('restart') },
      programBoot: { route: routes.programBoot, ...progChange('boot'), reads: ['programs'], proves: programProves('boot', (a) => programsWire.get(a as object)) },
      aliasCreate: {
        route: routes.aliasCreate,
        input: (v: { id: string; port: number; name: string }) => ({ body: { computer_id: v.id, program: 'http', port: v.port, alias: v.name } }),
        // aliasList: Programs' copy of the list (a port's aliases) is read again too.
        reads: ['aliases'], coreReads: ALIAS_READS,
        lock: aliasLock.lock, lockKey: (v: { id: string; port: number; name: string }) => ({ computer: v.id, port: v.port, name: v.name }),
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const i = (identity ?? {}) as { name?: string; port?: number };
          return aliasesOf(answers).some((a) => a.name === i.name && a.port === i.port) ? 'applied' : undefined;
        },
      },
      aliasRemove: { route: routes.aliasRemove, input: (v: { id: string; alias: string }) => ({ params: { id: v.alias } }), reads: ['aliases'], coreReads: ALIAS_READS, lock: aliasLock.lock, lockKey: (v: { alias: string }) => aliasLock.key(v.alias),
        // Applied only when a fresh aliases read answered and no longer holds it.
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const id = (identity as { alias?: string } | null)?.alias;
          return id && (answers[0]?.length ?? 0) > 0 && !aliasesOf(answers).some((a) => a.id === id) ? 'applied' : undefined;
        } },
      // Edit an alias (name, or the port of an http/https alias): only what changed is sent. The lock is the alias's own,
      // shared with its remove, so one alias takes one change at a time. The identity names the alias and what was sent.
      aliasEdit: { route: routes.aliasEdit,
        input: (v: EditAliasVars) => ({ params: { id: v.alias }, body: { ...(v.name !== undefined ? { alias: v.name } : {}), ...(v.port !== undefined ? { port: v.port } : {}) } }),
        reads: ['aliases'], coreReads: ALIAS_READS, lock: aliasLock.lock, lockKey: (v: EditAliasVars) => aliasLock.key(v.alias),
        identity: (v: EditAliasVars) => ({ alias: v.alias, computer: v.id, edit: true, ...(v.name !== undefined ? { name: v.name } : {}), ...(v.port !== undefined ? { port: v.port } : {}) }),
        // Applied only when a fresh alias list holds this alias with every value that was sent; a list that still shows
        // the old values, or no longer holds the alias, proves nothing.
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const i = (identity ?? {}) as { alias?: string; name?: string; port?: number };
          const row = i.alias ? aliasesOf(answers).find((a) => a.id === i.alias) : undefined;
          if (!row || (i.name === undefined && i.port === undefined)) return undefined;
          return (i.name === undefined || row.name === i.name) && (i.port === undefined || row.port === i.port) ? 'applied' : undefined;
        } },
      redeem: { route: routes.redeem, input: (v: { code: string }) => ({ body: { code: v.code } }), reads: ['computers'], ...setupLocks.redeem,
        // This page shows the redeem form only with no computer: a list that now holds one proves the invite was used.
        proves: (_identity: unknown, answers: readonly (readonly unknown[])[]) => (rowsOf(answers).length > 0 ? 'applied' : undefined) },
      retrySetup: { route: routes.retrySetup, input: () => ({ body: {} }), reads: ['computers'], ...setupLocks.retry },
      // A project is the same project in every realm view: create and update file their locks across realms
      // (acrossRealms); remove stays realm-filed until core reads realm-filed holds across realms. Only this
      // page sends these locks. Create and update are each proved by a fresh projects list alone.
      projectCreate: { route: routes.projectCreate, input: (v: { name: string; color: string }) => ({ body: { alias: v.name, color: v.color } }), reads: ['projects'],
        lock: 'project.create', lockKey: (v: { name: string }) => ({ name: v.name }), acrossRealms: true,
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const name = (identity as { name?: string } | null)?.name;
          return name && projectsOf(answers).some((p) => p.name === name) ? 'applied' : undefined;
        } },
      projectUpdate: { route: routes.projectUpdate, input: (v: { id: string; name: string; color: string }) => ({ params: { pid: v.id }, body: { alias: v.name, color: v.color } }), reads: ['projects'],
        // The identity names what was sent: only a list showing that name and colour on that project proves it.
        lock: 'project.update', lockKey: (v: { id: string; name: string; color: string }) => ({ project: v.id, name: v.name, color: hex(v.color) }), acrossRealms: true,
        proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => {
          const i = (identity ?? {}) as { project?: string; name?: string; color?: string };
          return i.project && projectsOf(answers).some((p) => p.id === i.project && p.name === i.name && hex(p.color) === i.color) ? 'applied' : undefined;
        } },
      // A project's people changed: ONE held write per project. The three
      // writes share the lock project.member under the key {project}, so a lost answer of any of them holds every
      // people write of that project (core refuses the next send, READ_BACK_FIRST) whatever account it names: no
      // per-account key another spelling of the same account could slip past. Base host, so held in every realm view.
      // A row has no version, so a write whose answer was lost can still land after any read: no read proves one (no
      // proves), it stays held until the person's warned Dismiss. The identity adds what the band shows and what Check
      // again looks for (heldNow); it names no secret. The echo is never kept.
      memberAdd: { route: routes.memberAdd, input: (v: MemberAdd) => ({ params: { pid: v.pid }, body: { ...v.target, permission_level: v.level } }), reads: ['members'],
        select: () => null, lock: 'project.member', lockKey: memberLockKey, identity: (v: MemberAdd) => ({ project: v.pid, op: 'add', level: v.level, name: v.name, ...v.target }), acrossRealms: true },
      memberSet: { route: routes.memberSet, input: (v: MemberSet) => ({ params: { pid: v.pid, mid: v.mid }, body: { permission_level: v.level } }), reads: ['members'],
        select: () => null, lock: 'project.member', lockKey: memberLockKey, identity: (v: MemberSet) => ({ project: v.pid, op: 'set', level: v.level, name: v.name, mid: v.mid, account: v.account }), acrossRealms: true },
      memberRemove: { route: routes.memberRemove, input: (v: MemberRemove) => ({ params: { pid: v.pid, mid: v.mid } }), reads: ['members'],
        select: () => null, lock: 'project.member', lockKey: memberLockKey, identity: (v: MemberRemove) => ({ project: v.pid, op: 'remove', name: v.name, mid: v.mid, account: v.account }), acrossRealms: true },
      // A project's access rules changed: ONE held write per project (lock project.rules, key {project}), made
      // against the version the tab read (If-Match: it applies at most once). No project rules is the DELETE. Base host,
      // so held in every realm view. Only a fresh read of the rules proves it (projectPerms.logic.ts
      // projectWriteVerdict); the echoed document never reaches the page.
      projectRulesSet: { route: routes.projectRulesSet, input: (v: ProjectRulesWrite) => ({ params: { pid: v.pid }, body: v.body ?? {}, ifMatch: `file:v${v.from}` }), reads: ['projectRules'],
        select: () => null, lock: 'project.rules', lockKey: rulesLockKey, identity: rulesIdentity, proves: projectWriteVerdict, acrossRealms: true },
      projectRulesClear: { route: routes.projectRulesClear, input: (v: ProjectRulesWrite) => ({ params: { pid: v.pid }, ifMatch: `file:v${v.from}` }), reads: ['projectRules'],
        select: () => null, lock: 'project.rules', lockKey: rulesLockKey, identity: rulesIdentity, proves: projectWriteVerdict, acrossRealms: true },
      // No list proves a delete: the projects list is this realm's view, so a project missing from it may only be
      // out of view. The page proves it itself (projectGone: the base host's 404 for that project, then complete).
      projectRemove: { route: routes.projectRemove, input: (v: { id: string }) => ({ params: { pid: v.id } }), reads: ['projects'],
        lock: 'project.remove', lockKey: (v: { id: string }) => ({ project: v.id }) },
    },
};
const source = coreSource('computers', computersTable);

export function useComputers() {
  const q = source.useQuery<Computer[]>('computers');
  // A computer the list shows not running (stopped, restarting): every claim the Desktop tab keeps about its desktops
  // ends, whether that tab is open or not (a restart seen only here must not leave a stopped desktop).
  useEffect(() => {
    for (const c of q.data ?? []) if (bucket(c.status) !== 'running') forgetComputer(computerKey(c));
  }, [q.data]);
  return q;
}

/** The account's computers in every realm, read only while `enabled` (the import picker is open). */
export function useAccountComputers(enabled: boolean) {
  return source.useQuery<{ rows: Computer[]; complete: boolean }>('importComputers', undefined, { enabled });
}

/** `enabled` false reads only what is cached (a part mounted closed must not read the list again). */
export function useProjects(enabled = true) {
  return source.useQuery<Project[], void>('projects', undefined, { enabled });
}

/** The projects these ids name, one read each on the base host (at most MISSING_READS ids). */
export const MISSING_READS = 50;
/** A project's people. `enabled` false sends nothing (a shared-key session, or a row not shown). */
/** A people write. `name` is what the person typed or the row's name: shown in its held band, never an ID's
 *  value beyond what was typed. */
export interface MemberAdd { pid: string; target: AddTarget; level: Level; name: string }
/** `account`: the member's account id when the row named it (never sent; what Check again looks for). */
export interface MemberSet { pid: string; mid: string; level: Level; name: string; account?: string }
export interface MemberRemove { pid: string; mid: string; name: string; account?: string }
export type MemberVars = MemberAdd | MemberSet | MemberRemove;
/** One lock key per project: any held people write holds them all. */
function memberLockKey(v: MemberVars): { project: string } {
  return { project: v.pid };
}
/** A held people write's identity (data.ts memberAdd/Set/Remove `identity`): the project, the op, the name shown, and
 *  what the write named (an add's username or user_id; a row's id and account). */
export interface MemberHeldId { project: string; op: 'add' | 'set' | 'remove'; level?: Level; name: string; username?: string; user_id?: string; mid?: string; account?: string }
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
/** The held write's identity as the band reads it (unknown fields dropped). */
export function memberHeldOf(i: Record<string, unknown>): MemberHeldId {
  const op = i.op === 'set' || i.op === 'remove' ? i.op : 'add';
  const level = i.level === 'read' || i.level === 'edit' || i.level === 'delete' ? i.level : undefined;
  const h: MemberHeldId = { project: String(i.project ?? ''), op, name: String(i.name ?? '') };
  if (level) h.level = level;
  for (const k of ['username', 'user_id', 'mid', 'account'] as const) { const v = nonEmpty(i[k]); if (v) h[k] = v; }
  return h;
}
/** The variables that name a held people write again (for its Dismiss): they give the same lock key {project}. */
export function memberVarsOf(i: Record<string, unknown>): MemberVars {
  const h = memberHeldOf(i);
  const level = h.level ?? 'read';
  if (h.op !== 'add') return h.op === 'remove' ? { pid: h.project, mid: h.mid ?? '', name: h.name } : { pid: h.project, mid: h.mid ?? '', level, name: h.name };
  return { pid: h.project, target: h.user_id ? { user_id: h.user_id } : { username: h.username ?? h.name }, level, name: h.name };
}
export const useAddMember = () => source.useMutation<unknown, MemberAdd>('memberAdd');
export const useSetMember = () => source.useMutation<unknown, MemberSet>('memberSet');
export const useRemoveMember = () => source.useMutation<unknown, MemberRemove>('memberRemove');
/** The held people writes of a project in this realm view (lock project.member), re-read when core's changes move. */
export function useMemberHolds(pid: string | undefined, realm: string): MemberHeldId[] {
  const version = useChangesVersion();
  return useMemo(
    () => (pid ? heldChanges('project.member', { realm }).map((h) => memberHeldOf((h.identity ?? {}) as Record<string, unknown>)).filter((i) => i.project === pid) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: core's changes moved
    [pid, realm, version],
  );
}
// Check again of a held people write: the whole roster, page by page (100 rows, the API's page
// maximum) up to MEMBER_READ_MAX rows, each page a fresh read through core. Whole only when every page answered, the
// totals agree and the rows reach the total; a later page that fails or a list past the bound reads as cut. A read
// never frees the hold: it only says how the list reads now.
export const MEMBER_PAGE = 100;
export const MEMBER_READ_MAX = 1000;
const memberPageQ = defineQuery<unknown, unknown, { id: string; page: number }>(routes.members, {
  input: (p) => ({ params: { pid: p.id }, query: { page: p.page, limit: MEMBER_PAGE } }),
});
export type RosterRead = { kind: 'ok'; roster: Roster } | { kind: 'failed' };
export async function readRosterAll(id: string, owner?: string): Promise<RosterRead> {
  const members: Member[] = [];
  const seen = new Set<string>();
  let unknown = 0;
  let total: number | null = null;
  for (let page = 1; page <= MEMBER_READ_MAX / MEMBER_PAGE; page++) {
    const got = await memberPageQ.readFresh({ id, page }).catch(() => null);
    const r = got ? membersFrom(got.data, owner) : null;
    // The first page failing reads nothing; a later one leaves what was read, never whole (no total).
    if (!r) return page === 1 ? { kind: 'failed' } : { kind: 'ok', roster: { members, unknown, total: null } };
    if (page === 1) total = r.total;
    else if (r.total !== total) total = null; // the list moved between pages: not whole
    for (const m of r.members) {
      const k = m.id || 'a:' + m.accountId;
      if (seen.has(k)) continue;
      seen.add(k);
      members.push(m);
    }
    unknown += r.unknown;
    if (r.members.length + r.unknown < MEMBER_PAGE || (total !== null && members.length + unknown >= total)) break;
  }
  return { kind: 'ok', roster: { members, unknown, total } };
}
export function useMembers(p: { id: string; owner?: string } | undefined, enabled: boolean) {
  return source.useQuery<Roster, { id: string; owner?: string }>('members', { id: p?.id ?? '', ...(p?.owner ? { owner: p.owner } : {}) }, { enabled: enabled && !!p?.id });
}

/** The caller's place on each project (the actions a level allows): 'owner' or 'unknown' with no read. A project
 *  shared with the caller takes its level from its member list, the same query as the Permissions column (one read
 *  serves both): the first MISSING_READS such projects read it; the rest only watch it, so a row the page shows (its
 *  Permissions column reads it) gets its level too, and no read goes out for rows nobody shows. A read that failed, is
 *  paused offline or has not answered is 'unknown': today's actions. */
export function useMyLevels(projects: readonly { id: string; owner?: string }[] | undefined, uid: string | null | undefined, enabled: boolean): Map<string, Mine> {
  const shared = (enabled ? projects ?? [] : []).filter((p) => sharedWithMe(p, uid));
  const key = (p: { id: string; owner?: string }) => ({ id: p.id, ...(p.owner ? { owner: p.owner } : {}) });
  const read = source.useQueries<Roster, { id: string; owner?: string }>('members', shared.slice(0, MISSING_READS).map(key));
  const watched = source.useQueries<Roster, { id: string; owner?: string }>('members', shared.slice(MISSING_READS).map(key), { enabled: false });
  const qs = [...read, ...watched];
  const m = new Map<string, Mine>();
  for (const p of projects ?? []) m.set(p.id, myLevel(p, null, uid));
  shared.forEach((p, i) => {
    const q = qs[i];
    m.set(p.id, q && !q.isError && q.fetchStatus !== 'paused' ? myLevel(p, q.data, uid) : 'unknown');
  });
  return m;
}

export function useProjectsById(ids: readonly string[]) {
  return source.useQueries<Project, { id: string }>('projectOne', ids.slice(0, MISSING_READS).map((id) => ({ id })));
}

export function useRealms(): Realm[] | undefined {
  const v = useCoreRealms();
  return useMemo(() => v.rows?.map((r) => ({ id: r.id, name: 'text' in r.name ? r.name.text : r.name.kind, named: r.name.kind === 'alias', color: r.tint || 'blue', computers: r.computers })), [v.rows]);
}

/** The realm the top bar shows now ('all' or a realm id). */
export function useShownRealm(): string {
  return useCoreRealms().selected;
}

const HEX24 = /^[0-9a-f]{24}$/;

/** The realm a new computer (a create, a copy, one made from a snapshot) lands in: core sends it to a realm's API host,
 *  a token session's pinned realm (core/api.ts tokenRoute; a pin that is not a realm id is the base host), else the
 *  realm shown; undefined is the base host. That host adds its realm to the new computer (the API's own
 *  rule on a realm host). */
export function useHostRealm(): string | undefined {
  const { selected, pinned } = useCoreRealms();
  if (pinned !== null) return HEX24.test(pinned) ? pinned : undefined;
  return HEX24.test(selected) ? selected : undefined;
}

/** The realm a new computer's hold records (listMadeNew `realm`), read at the press: `hostRealm` (useHostRealm) when
 *  the page names a realm API domain, else 'all', as core then sends the change to the base host (hubApiBase), which
 *  adds no realm (a copy takes its source's realms there); 'all' too for the base host itself. */
export const pressRealm = (hostRealm: string | undefined): string => (hostRealm !== undefined && realmDomain() ? hostRealm : 'all');

export function useServers() {
  return source.useQuery<Server[]>('servers');
}

/** The servers' AI use, read only while the Servers cards show it. */
export function useServersAi(enabled: boolean) {
  return source.useQuery<ServersAi>('aiUsage', undefined, { enabled });
}

export function useSubscriptions() {
  return source.useQuery<{ items: Subscription[]; more: boolean }>('subscriptions');
}

/** What this session may do: core's live token check (an account session may do everything). */
export function useCaps(): Caps {
  const granted = [
    useCan('computers.actions.start') && 'computers.actions.start',
    useCan('computers.actions.stop') && 'computers.actions.stop',
    useCan('computers.actions.restart') && 'computers.actions.restart',
    useCan('computers.update') && 'computers.update',
    useCan('computers.delete') && 'computers.delete',
    useCan('account') && 'account',
    useCan('computers.features.snapshots') && 'computers.features.snapshots',
  ].filter((x): x is string => x !== false);
  const key = granted.join('|');
  return useMemo(() => (granted.length === 7 ? 'all' : new Set(granted)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The computer the top bar shows (core's target). */
export function useCurrentComputerId(): string | undefined {
  return useCurrentComputer()?.container.id;
}


/** Bots working on the computer. Not wired: no route exists, so on a live page the read fails with not_wired and `data` stays undefined (the widget shows no count). Fixtures answer only in dev, shots and tests. */
export function useBotsHere(): number | undefined {
  return source.useQuery<number>('botsHere').data;
}

// A running computer's listeners and program counts (GET /computers/:id?runtime=...).
export function useRuntime(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, unknown>, { id: string }>('runtime', { id: id ?? '' }, { enabled: enabled && !!id });
  const data = useMemo<RuntimeInfo | undefined>(() => (enabled && id && q.data ? classifyRuntime(q.data[id] as never) : undefined), [q.data, id, enabled]);
  return { ...q, data };
}

/** Usage is read on demand only: nothing is read until `enabled`. */
export function useUsage(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, Usage | null>, { id: string }>('usage', { id: id ?? '' }, { enabled: enabled && !!id });
  const data = enabled && id && q.data ? (q.data[id] ?? null) : undefined;
  return { ...q, data, isPending: enabled && q.isPending };
}

export function useAllUsage(enabled: boolean) {
  const q = source.useQuery<Record<string, Usage | null>>('usageAll', undefined, { enabled });
  return { ...q, data: enabled ? q.data : undefined };
}

export function usePrograms(c: { id: string; project_id: string; server_name?: string; server?: { name?: string } } | undefined, enabled: boolean) {
  const id = c?.id;
  const subject = c ? subjectOf(c as Parameters<typeof subjectOf>[0]) : { id: '', project: '', server: '' };
  const q = source.useQuery<Record<string, Program[]>, Subject>('programs', subject, { enabled: enabled && !!subject.id && !!subject.project && !!subject.server });
  return { ...q, data: enabled && id ? q.data?.[id] : undefined };
}

/** One session list read for the Desktop tab: the switcher's desktops (desktop 1 always), the desktops whose session
 *  is listed (null: not a list) and each one's session (incarnation, null when not named). */
interface DesktopsRead { all: number[]; sessions: number[] | null; incs: Record<number, string | null> }
function desktopsRead(raw: unknown): DesktopsRead {
  const sessions = desktopSessionsOf(raw);
  const incs: Record<number, string | null> = {};
  for (const d of sessions ?? []) {
    const sh = desktopShellOf(raw, d);
    incs[d] = sh?.listed ? sh.incarnation : null;
  }
  return { all: desktopsOf(raw), sessions, incs };
}

/** The desktops the computer's terminal program lists (desktop 1 always first), read only while the Desktop tab shows. */
export function useDesktops(c: { id: string; project_id: string; server_name?: string; server?: { name?: string } } | undefined, enabled: boolean) {
  const id = c?.id;
  const subject = c ? subjectOf(c as Parameters<typeof subjectOf>[0]) : { id: '', project: '', server: '' };
  const q = source.useQuery<Record<string, DesktopsRead>, Subject>('desktops', subject, { enabled: enabled && !!subject.id && !!subject.project && !!subject.server });
  const d = enabled && id ? q.data?.[id] : undefined;
  return { ...q, data: d?.all, sessions: d?.sessions ?? null, incs: d?.incs ?? {} };
}

/** The environments the computer's terminal program lists for a desktop (null: not a list), read only while the
 *  Desktop tab shows. A program without the route answers 404: the tab then offers DESKTOP_ENVS_FALLBACK. */
export function useDesktopEnvs(c: { id: string; project_id: string; server_name?: string; server?: { name?: string } } | undefined, enabled: boolean) {
  const id = c?.id;
  const subject = c ? subjectOf(c as Parameters<typeof subjectOf>[0]) : { id: '', project: '', server: '' };
  const q = source.useQuery<Record<string, DesktopEnv[] | null>, Subject>('desktopEnvs', subject, { enabled: enabled && !!subject.id && !!subject.project && !!subject.server });
  return { ...q, data: enabled && id && q.data ? (q.data[id] ?? null) : undefined };
}

const desktopShellQ = defineQuery<unknown, unknown, Subject>(routes.desktopSessions, { input: (p) => ({ target: targetOf(p) }) });
/** Desktop N's session as the terminal program lists it now: a read sent by this call, never a cached answer or one
 *  already out (an earlier read of this kind, such as a check started before the Stop answered, may have left before
 *  it: it is cancelled first, never joined). Only a network answer that landed after this call began counts
 *  (readFresh: a cancelled read would otherwise resolve with the cached answer); 'unread' otherwise. */
export async function readDesktopShell(s: Subject, n: number): Promise<DesktopShell | 'unread'> {
  try {
    await queryClient.cancelQueries({ queryKey: desktopShellQ.key(s), exact: true });
    const r = await desktopShellQ.readFresh(s);
    return r ? (desktopShellOf(r.data, n) ?? 'unread') : 'unread';
  } catch {
    return 'unread';
  }
}
/** The hold core keeps for a send of Stop desktop's `lock` on this desktop whose answer was lost (undefined: none). */
export function heldDesktopSend(lock: 'computer.desktopStop' | 'computer.desktopEnd', id: string, n: number): string | undefined {
  return heldChanges(lock).find((h) => {
    const i = h.identity as { computer?: unknown; desktop?: unknown } | null;
    return !!i && i.computer === id && i.desktop === n && h.target?.container.id === id;
  })?.hold;
}
/** Whether a send of Stop desktop's `lock` on this desktop is out now, in this tab or another (sendingChanges,
 *  attributed rows only: an unattributed row names no desktop). */
export function sendingDesktopSend(lock: 'computer.desktopStop' | 'computer.desktopEnd', id: string, n: number): boolean {
  return sendingChanges(lock).some((h) => {
    const i = h.identity as { computer?: unknown; desktop?: unknown } | null;
    return h.attributed && !!i && i.computer === id && i.desktop === n && h.target?.container.id === id;
  });
}
/** Stop desktop's two changes (parts/Desktop.tsx). */
export const useDisplayStop = () => source.useMutation<unknown, Subject & { n: number }>('displayStop');
export const useDesktopEnd = () => source.useMutation<unknown, Subject & { n: number; incarnation: string }>('desktopEnd');

/** The computer's access rules, read only while the access drawer is open; null when the answer is not a document. */
export function useAccessRules(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, AccessRules | null>, { id: string }>('accessRules', { id: id ?? '' }, { enabled: enabled && !!id });
  return { ...q, data: enabled && id && q.data ? (q.data[id] ?? null) : undefined };
}

/** A project's access rules, read only while enabled (never on a key session: projectPerms.logic.ts). `data` is
 *  this project's document; a refetch answers the keyed form (`x.data?.[id]`). */
/** A project's computers as its Computers tab shows them: the first 100 rows and the API's total. */
export function useProjectComputerList(p: { id: string } | undefined, enabled: boolean) {
  return source.useQuery<{ rows: ProjectComputer[]; total: number }, { id: string }>('projectComputerList', { id: p?.id ?? '' }, { enabled: enabled && !!p?.id });
}

export function useProjectRules(p: { id: string } | undefined, enabled: boolean) {
  const id = p?.id ?? '';
  const q = source.useQuery<Record<string, AccessRules>, { id: string }>('projectRules', { id }, { enabled: enabled && !!id });
  return { ...q, data: q.data?.[id] };
}

/** One project-rules write: the project, what was asked, the version it was made against and, for Only my IP
 *  or Private, the whole document (projectBodyFor). No project rules sends no body. */
export interface ProjectRulesWrite {
  pid: string;
  want: ProjectWant;
  from: number;
  body?: Record<string, unknown>;
}
// Declarations (hoisted): the change table above reads them when it is built.
function rulesLockKey(v: ProjectRulesWrite): { project: string } {
  return { project: v.pid };
}
function rulesIdentity(v: ProjectRulesWrite): Record<string, unknown> {
  return { project: v.pid, want: v.want.kind, ...(v.want.kind === 'myIp' ? { ip: v.want.ip } : {}), ...(v.want.kind === 'ips' ? { ips: [...v.want.ranges].sort() } : {}), from: v.from };
}
/** The variables that name a held project-rules write again (its Dismiss): they give the same lock key {project}. */
export const rulesVarsOf = (i: Record<string, unknown>): ProjectRulesWrite => ({ pid: String(i.project ?? ''), want: { kind: 'none' }, from: Number(i.from ?? 0) });
export const useSetProjectRules = () => source.useMutation<unknown, ProjectRulesWrite>('projectRulesSet');
export const useClearProjectRules = () => source.useMutation<unknown, ProjectRulesWrite>('projectRulesClear');

/** "Explain all my permissions" reads at most this many computers' rules (the snapshot names how many were left out). */
export const EXPLAIN_ALL_MAX = 20;

/** Several computers' access rules and project scopes (read only while enabled). */
export function useAccessMany(ids: readonly string[], enabled: boolean) {
  const params = ids.map((id) => ({ id }));
  return {
    rules: source.useQueries<Record<string, AccessRules | null>, { id: string }>('accessRules', params, { enabled }),
    scope: source.useQueries<Record<string, ProjectRules>, { id: string }>('accessScope', params, { enabled }),
  };
}

/** Re-reads the access rules and the project scope (the drawer opens on fresh answers, never on older ones). */
export const refreshAccess = () => source.invalidate(['accessRules', 'accessScope', 'accessOwn']);

/** Whether the computer's project has access rules, read fresh while the access drawer is open. */
export function useAccessScope(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, ProjectRules>, { id: string }>('accessScope', { id: id ?? '' }, { enabled: enabled && !!id });
  return { ...q, data: enabled && id && q.data ? (q.data[id] ?? 'unknown') : undefined };
}

/** Replaces the computer's access rules with one of the drawer's three documents (never resent: a lost answer is
 *  read back). */
export const useSetAccess = () => source.useMutation<unknown, AccessWrite>('access');

/** Whether the computer keeps rules of its own, read only while enabled. */
export function useAccessOwn(id: string | undefined, enabled: boolean) {
  const q = source.useQuery<Record<string, OwnState | undefined>, { id: string }>('accessOwn', { id: id ?? '' }, { enabled: enabled && !!id });
  return { ...q, data: enabled && id && q.data ? (q.data[id] ?? 'unknown') : undefined };
}

/** Removes the computer's own rules so it follows only its project's (never resent: a lost answer is read back). */
export const useClearAccess = () => source.useMutation<unknown, ClearWrite>('accessClear');

/** The five step changes of "Only people or keys I pick", by the step each sends (access.picked.ts stepKey). */
export function useAccessSteps() {
  return {
    accessPerson: source.useMutation<AccessRules | null, StepWrite>('accessPerson'),
    accessKey: source.useMutation<AccessRules | null, StepWrite>('accessKey'),
    accessGrant: source.useMutation<AccessRules | null, StepWrite>('accessGrant'),
    accessDeny: source.useMutation<AccessRules | null, StepWrite>('accessDeny'),
    accessDrop: source.useMutation<AccessRules | null, StepWrite>('accessDrop'),
  };
}

/** The caller's address as the Hoody API sees it, read only while "Only my IP" is picked. */
export function useMyIp(enabled: boolean) {
  return source.useQuery<IpDetails | null>('myIp', undefined, { enabled });
}

export function useAliases(id: string | undefined) {
  const q = source.useQuery<Record<string, Alias[]>, { id: string }>('aliases', { id: id ?? '' }, { enabled: !!id });
  return { ...q, data: id ? (q.data?.[id] ?? []) : undefined };
}

export type ZeroKind = 'provisioning' | 'empty' | 'unknown' | 'invite' | 'capacity' | 'mailbox' | 'expired' | 'reinstalled';
/** The zero state: what the account can do when it has no computer yet, from core's setup read.
 *  'provisioning' ("being prepared") only with positive evidence: this browser's computer create in the realm shown
 *  still out (sendingChanges, attributed rows only) or held with its outcome unknown (heldChanges, attributed rows
 *  only: a sender and an identity; `held` then, so the page offers the create's check in its drawer), or a server
 *  answer that says so (none today). A held row without them (an older record converted with metadata made from
 *  its scope) proves no create of this browser and the drawer cannot show it: 'unknown' (its lock still holds).
 *  A token session never reads the setup state (can('account') false): without evidence it is 'empty' (Create
 *  follows its caps). A failed setup read is 'unknown' even over an earlier answer still cached. 'empty': no computer and no such evidence (create offer; accountComputers for the import
 *  offer). 'unknown': the setup read failed: "we couldn't check", never "being prepared". undefined while the
 *  first read is out. `room` ('reinstalled' only): core's read of the server list (core reinstalledOffers says what
 *  it offers). `unclaimed`: the held creates that record no sender (core nobodysHeld), the way out of that
 *  'unknown': the person's warned Dismiss frees them (useCreate().dismissHeld), nothing else does. */
export function useZeroState(): { kind: ZeroKind | undefined; held: boolean; unclaimed: readonly HeldRow[]; accountComputers: boolean | null; room: SetupRoom | null; refetch: () => Promise<unknown>; isFetching: boolean } {
  const setup = useSetupState();
  const account = useCan('account');
  const realm = useShownRealm();
  useChangesVersion();
  const sending = sendingChanges('computer.create', { realm }).some((r) => r.attributed);
  const holds = sending ? [] : heldChanges('computer.create', { realm });
  const held = holds.some((h) => h.by !== undefined && h.identity !== null && h.identity !== undefined);
  const unclaimed = sending || held ? [] : nobodysHeld('computer.create', { realm });
  const d = setup.data;
  const kind: ZeroKind | undefined = sending || held ? 'provisioning'
    : holds.length > 0 ? 'unknown'
    : !account ? 'empty'
    : setup.isError ? 'unknown'
    : !d ? undefined
    : d.kind;
  return { kind, held, unclaimed, accountComputers: d?.kind === 'empty' ? (d.accountComputers ?? null) : null, room: d?.kind === 'reinstalled' ? (d.room ?? null) : null, refetch: setup.refetch, isFetching: setup.isFetching };
}

// ── changes: each resolves with a C9 outcome, never retries, never resends ──────────────

/** Core's one lifecycle change: its lock and its proof (the containers list shows the target state) are shared with every page. */
/** Whether this page sent a held change of a shared lock ('self'), another page did ('other'), or core cannot
 *  tell (undefined: recorded before core named senders). `key` is this page's change (its coreSource key). */
export const heldBy = (key: string, h: HeldChange): 'self' | 'other' | undefined => source.heldBy(key, h);
/** The shared lifecycle change, sent as this page (Home, Board and Bots mount it as theirs). */
export const useLifecycle = () => computerLifecycle.use({ page: 'computers' });
export const useRename = () => source.useMutation<unknown, { id: string; name: string }>('rename');
export const useSetColour = () => source.useMutation<unknown, { id: string; color: string }>('setColour');
export const useSetRealms = () => source.useMutation<unknown, { id: string; realmIds: string[] }>('setRealms');
const computerReadQ = defineQuery<unknown, unknown, { id: string }>(routes.read, { input: (p) => ({ params: { id: p.id } }) });
/** A computer's realms, read fresh on the base host (every realm): core's readFresh, a network answer that landed
 *  after the call began (one already out is joined only while no change went pending since). Null when the read
 *  did not answer, or its realm_ids is not a list of ids (never filtered into a smaller list that could pass as proof);
 *  a repeated id counts once. */
export async function readRealmIds(id: string): Promise<string[] | null> {
  const got = await computerReadQ.readFresh({ id }).catch(() => null);
  const r = obj(obj(got?.data)?.data)?.realm_ids;
  return Array.isArray(r) && r.every((x) => typeof x === 'string') ? [...new Set(r as string[])] : null;
}
export const useSetSshKey = () => source.useMutation<unknown, { id: string; key: string | null }>('sshKey');
export const useCreateProject = () => source.useMutation<unknown, { name: string; color: string }>('projectCreate');
export const useUpdateProject = () => source.useMutation<unknown, { id: string; name: string; color: string }>('projectUpdate');
export const useRemoveProject = () => source.useMutation<unknown, { id: string }>('projectRemove');

// Both delete reads (count and check) are bounded: they run one after another, so one that never answers must
// not hold up every later count or check. A read that timed out proves nothing (null).
export const PROJECT_READ_MS = 10_000;
const projectComputersQ = defineQuery<unknown, unknown, { id: string }>(routes.projectComputers, {
  input: (p) => ({ params: { pid: p.id }, query: { page: '1', limit: '1', include_expired: 'true', include_deleting: 'true' }, timeoutMs: PROJECT_READ_MS }),
});
// Counts run one after another: a fetch would join a count already in flight, whose request went out before the
// call (the count just before sending must be read after the press), so each waits for the one before it.
let counting: Promise<unknown> = Promise.resolve();
/** How many computers the project has, counted by the API account-wide (every realm; expired and deleting ones
 *  too: the API refuses the delete while any is there); null when the answer does not say. Reads only. */
export async function countProjectComputers(id: string): Promise<number | null> {
  try {
    const mine = counting.catch(() => undefined).then(() => projectComputersQ.fetch({ id }));
    counting = mine;
    const d = obj(obj(await mine)?.data);
    const total = num(obj(d?.pagination)?.total);
    return total !== null && total >= 0 ? total : null;
  } catch {
    return null;
  }
}
// The project's computers for a project-rules confirm (owner only: the API refuses members): the first
// 100 (the API's page maximum; the confirm counts only "the computers shown"), expired and deleting ones too.
const projectComputersListQ = defineQuery<unknown, unknown, { id: string }>(routes.projectComputers, {
  input: (p) => ({ params: { pid: p.id }, query: { page: '1', limit: '100', include_expired: 'true', include_deleting: 'true' }, timeoutMs: PROJECT_READ_MS }),
});
// Each press's list read is its own request: a fresh read joins one already out, which may have gone before this press
// (a closed drawer's), so each waits for the one before it, as projectGone's reads do.
let listing: Promise<unknown> = Promise.resolve();
/** The project's computers as the API lists them now, each with what says whether it keeps rules of its own
 *  (proxy_permissions_computer_state, else its scope: projectPerms.logic.ts ownOf); null when the read did not answer
 *  or the answer has no list (never "no computers"). A request sent by this call, after any earlier one ended. */
export async function readProjectComputers(id: string): Promise<{ proxy_permissions_scope?: string; proxy_permissions_computer_state?: string }[] | null> {
  const mine = listing.catch(() => undefined).then(() => projectComputersListQ.readFresh({ id }));
  listing = mine;
  const got = await mine.catch(() => null);
  const rows = obj(obj(got?.data)?.data)?.computers;
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => {
    const x = obj(r);
    const scope = str(x?.proxy_permissions_scope);
    const st = str(x?.proxy_permissions_computer_state);
    return { ...(scope ? { proxy_permissions_scope: scope } : {}), ...(st ? { proxy_permissions_computer_state: st } : {}) };
  });
}
const projectQ = defineQuery<unknown, unknown, { id: string }>(routes.project, { input: (p) => ({ params: { pid: p.id }, timeoutMs: PROJECT_READ_MS }) });
// Reads run one after another, as counts do: a fetch would join a read already in flight, which went out before
// this check began (before a later send it is asked about), so each waits for the one before it.
let reading: Promise<unknown> = Promise.resolve();
/** Whether the project is gone, read fresh on the base host (every realm): true only on its 404, false while it
 *  is there, null when the read did not answer (proves nothing). Reads only. */
export async function projectGone(id: string): Promise<boolean | null> {
  try {
    const mine = reading.catch(() => undefined).then(() => projectQ.fetch({ id }));
    reading = mine;
    await mine;
    return false;
  } catch (e) {
    return (e as { status?: unknown } | null)?.status === 404 ? true : null;
  }
}
// The same bounded, one-after-another reads as projectGone's, for a computer.
const computerGoneQ = defineQuery<unknown, unknown, { id: string }>(routes.read, { input: (p) => ({ params: { id: p.id }, timeoutMs: PROJECT_READ_MS }) });
let readingComputer: Promise<unknown> = Promise.resolve();
/** Whether the computer is gone, read fresh on the base host (every realm): true only on its 404, false while it is
 *  there, null when the read did not answer (proves nothing). Reads only. The proof of an expired delete. */
export async function computerGone(id: string): Promise<boolean | null> {
  try {
    const mine = readingComputer.catch(() => undefined).then(() => computerGoneQ.fetch({ id }));
    readingComputer = mine;
    await mine;
    return false;
  } catch (e) {
    return (e as { status?: unknown } | null)?.status === 404 ? true : null;
  }
}
/** A copy's variables: the source computer (`id`), the name, the target project and server (sent, and kept in
 *  the held change's identity as `server`), and, never sent, `before` (every id the page's list showed at the press:
 *  pressBefore) and `realm` (the realm it is sent under, 'all' for the base host), as a create's
 *  (CreateVars). */
export type CopyVars = { id: string; name: string; project: string; server: string; before?: readonly string[]; realm?: string };
export const useCopy = () => source.useMutation<unknown, CopyVars>('copy');
export const useRemove = () => source.useMutation<unknown, { id: string }>('remove');
export const useRemoveExpired = () => source.useMutation<unknown, { id: string }>('removeExpired');
/** A create's variables: the project, the body sent, `before`, every id the page's list showed at the press
 *  (pressBefore), and `realm`, the realm it is sent under ('all' for the base host). `before` and `realm` are
 *  never sent; they are kept in the held change's identity, the read-back's proof, with the body's `server_id` as
 *  `server`. */
export type CreateVars = { project: string; body: Record<string, unknown>; before?: readonly string[]; realm?: string };
export const useCreate = () => source.useMutation<unknown, CreateVars>('create');
/** One run: the command and the folder it runs in (absolute). */
export type RunVars = Subject & { command: string; cwd: string };
export const useRunCommand = () => source.useMutation<CommandResult, RunVars>('run');
type RestartReceipt = { success?: boolean; state?: string | null; outcome?: string | null };
/** A restart's receipt (the daemon's RestartAnswer): only `completed` with `restarted` applied; `completed` with
 *  `failed` stopped a target that did not start again; anything else proves nothing. */
export function restartVerdict(r: RestartReceipt | null | undefined): 'completed' | 'failed' | 'unknown' {
  if (!r || r.state !== 'completed') return 'unknown';
  return r.outcome === 'restarted' ? 'completed' : r.outcome === 'failed' ? 'failed' : 'unknown';
}
/** The key of a restart held under the shared lock (Programs or this tab sent it) for this program and computer:
 *  null when one is held without a key, undefined when none is held. */
export function heldRestartKey(v: Subject & { program: string; port?: number; range?: boolean }): string | null | undefined {
  const want = JSON.stringify(progOp('restart')(v).identity);
  const h = heldChanges(programLock.restart).find((c) => JSON.stringify(c.identity) === want && c.target?.container.id === v.id && c.target?.project.id === v.project);
  return h ? h.key : undefined;
}
const restartReceiptQ = defineQuery<RestartReceipt, RestartReceipt, { s: Subject; program: string; key: string }>(routes.programRestartReceipt, {
  input: (p) => ({ target: targetOf(p.s), params: { id: p.program }, query: { key: p.key } }),
});
/** Reads a restart's receipt on its own computer (reads only, never resends): 'completed' | 'failed' | 'unknown'. */
export async function readRestartReceipt(v: Subject & { program: string }, key: string): Promise<'completed' | 'failed' | 'unknown'> {
  try {
    return restartVerdict(await restartReceiptQ.fetch({ s: { id: v.id, project: v.project, server: v.server }, program: v.program, key }));
  } catch {
    return 'unknown';
  }
}
/** One hook per action (each its own route); `mutateAsync` picks by `act`. Every one is a single, never-resent request. */
export function useProgramAction() {
  const m = {
    start: source.useMutation<unknown, PV>('programStart'),
    stop: source.useMutation<unknown, PV>('programStop'),
    restart: source.useMutation<unknown, PV>('programRestart'),
    boot: source.useMutation<unknown, PV>('programBoot'),
  };
  return {
    mutateAsync: (v: PV & { act: keyof typeof m }) => m[v.act].mutateAsync(v),
    /** Reads the programs back (nothing is sent) for this action's held changes. A restart declares no read:
     *  only its receipt proves it, so this is false for it. */
    readBack: (a: keyof typeof m): Promise<boolean> => m[a].readBack(),
    /** The hold of the send of these variables held now (core's token for that one send), or undefined. */
    holdOf: (v: PV, a: keyof typeof m): Promise<string | undefined> => m[a].holdOf(v),
    /** Proven applied (a completed receipt): lock and key go, so the next press is a new request. `hold` is the
     *  send the proof concerns, captured before the receipt was read; a later send of it is left held. True when
     *  it freed that send. */
    complete: (v: PV, a: keyof typeof m, hold: string): Promise<boolean> => m[a].complete(v, hold),
    discard: (v: PV, a: keyof typeof m, hold: string): Promise<boolean> => m[a].discard(v, hold),
    /** The person's warned Dismiss of a held press ("may have gone through"): frees only the `hold` shown. */
    dismiss: (v: PV, a: keyof typeof m, hold: string): Promise<boolean> => m[a].dismiss(v, hold),
    receipt: readRestartReceipt,
    heldKey: heldRestartKey,
    heldBy: programHeldBy,
    /** Another page holds these variables' change: then a dismiss or settle here frees nothing (core). */
    heldByOther: (v: PV, a: keyof typeof m): Promise<unknown> => m[a].heldByOther(v),
  };
}
const PROGRAM_KEY: Readonly<Record<ProgramAct, string>> = { start: 'programStart', stop: 'programStop', restart: 'programRestart', boot: 'programBoot' };
/** Who sent a held program change (core's sender per action): 'self' this page, 'other' another page. One
 *  function for the page's life, so what is held is worked out again only when core's holds change. */
function programHeldBy(a: ProgramAct, h: HeldChange): 'self' | 'other' | undefined {
  return source.heldBy(PROGRAM_KEY[a], h);
}
export const useCreateAlias = () => source.useMutation<Alias, { id: string; port: number; name: string }>('aliasCreate');
export const useRemoveAlias = () => source.useMutation<unknown, { id: string; alias: string }>('aliasRemove');
/** An alias edit: `id` the computer, `alias` the alias id, then only what changes (`name`, `port`). */
export interface EditAliasVars { id: string; alias: string; name?: string; port?: number }
export const useEditAlias = () => source.useMutation<unknown, EditAliasVars>('aliasEdit');
export const useRedeem = () => source.useMutation<unknown, { code: string }>('redeem');
