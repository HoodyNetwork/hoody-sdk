// The live mount's own membership table.
//
// A request to a computer may leave only when the computer is IN this table: a row filled from an answer of THIS
// session's own computer reads (the computer list, a project's computer list, one computer), for this account, in the
// selected realm (the pinned realm of an access key; any realm in "All realms"), naming a non-empty server equal to the
// one in the request's address. Unknown is a refusal. core/routing.ts `routingAllows` (true while it knows nothing)
// stays an additional check, never the authority.
//
//   - Only `answer()` writes rows, and only from a membership read this table issued a generation for (`begin()`).
//     Never a cache, never a page's state.
//   - Any successful answer naming a computer replaces that computer's row at once, unless a later-issued read already
//     wrote it (a late answer never overwrites a newer one).
//   - A computer absent from a COMPLETE enumeration of a scope (every page of the same query, all answered after the
//     last clear) is removed when its row is older than that enumeration.
//   - A failed read clears what it covered: a list, every row of its scope; one computer, that row.
//   - `clear()` (a realm switch; the caller makes a new table for another account or session) drops every row, and
//     every answer to a read issued before it is ignored.
//   - Every change calls `onChange` once (the policy generation bumps).
// Pure state: nothing here sends, stores or reads a clock.

/** 24 hex, any case: the API's object ids. */
const ID = /^[0-9a-fA-F]{24}$/;
const REALM = /^[0-9a-f]{24}$/;
/** A server routing name as it sits in a computer address label. */
const SERVER = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface MemberRow {
  readonly computer: string;
  readonly project: string;
  /** The routing server, '' when the answer withheld it. */
  readonly server: string;
  readonly realms: readonly string[];
  /** The generation of the read that wrote it. */
  readonly gen: number;
}

/** What one membership read covers. `realm` null: the whole account; `project` null: every project. */
export interface ListScope { readonly realm: string | null; readonly project: string | null }
export type MemberCall =
  | { readonly kind: 'list'; readonly scope: ListScope; readonly page: number; readonly enumeration: string }
  | { readonly kind: 'one'; readonly computer: string; readonly realm: string | null };

const API = '/api/v1';
/**
 * Which membership read a Hoody-leg GET is, from its wire URL, or null (not a membership read: it writes nothing).
 * The origin is the API origin (account-wide, or `realm_id` in the query) or `https://<realm>.<realmApiDomain>` (that
 * realm). Paths: `/computers`, `/projects/<id>/computers`, `/computers/<id>`.
 */
export function membershipCallOf(method: string, url: string, places: { apiOrigin: string; realmApiDomain: string }): MemberCall | null {
  if (String(method).toUpperCase() !== 'GET') return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.username || u.password || u.hash) return null;
  let hostRealm: string | null = null;
  if (u.origin !== places.apiOrigin) {
    const m = /^https:\/\/([0-9a-f]{24})\.(.+)$/.exec(u.origin);
    if (!m || m[2] !== places.realmApiDomain) return null;
    hostRealm = m[1]!;
  }
  const q = u.searchParams;
  for (const k of new Set(q.keys())) if (q.getAll(k).length !== 1) return null;
  const qRealm = q.get('realm_id');
  if (qRealm !== null && (!REALM.test(qRealm) || (hostRealm !== null && qRealm !== hostRealm))) return null;
  const realm = hostRealm ?? qRealm;
  const path = u.pathname.replace(/\/$/, '');
  if (!path.startsWith(API + '/')) return null;
  const rest = path.slice(API.length);
  const one = /^\/computers\/([0-9a-fA-F]{24})$/.exec(rest);
  if (one) return { kind: 'one', computer: one[1]!.toLowerCase(), realm };
  const proj = /^\/projects\/([0-9a-fA-F]{24})\/computers$/.exec(rest);
  if (rest !== '/computers' && !proj) return null;
  const pageText = q.get('page');
  const page = pageText === null ? 1 : /^[1-9][0-9]{0,5}$/.test(pageText) ? Number(pageText) : NaN;
  if (!Number.isSafeInteger(page)) return null;
  const scope: ListScope = { realm, project: proj ? proj[1]!.toLowerCase() : null };
  // One enumeration = the same scope and the same query except the page.
  const rest2 = [...q.entries()].filter(([k]) => k !== 'page' && k !== 'realm_id').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { kind: 'list', scope, page, enumeration: JSON.stringify([scope.realm, scope.project, rest2]) };
}

/** A computer row of an answer, or null when it does not name a computer and its project. */
export function memberRowOf(raw: unknown, gen: number): MemberRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { id?: unknown; project_id?: unknown; server_name?: unknown; realm_ids?: unknown };
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.project_id !== 'string' || !ID.test(r.project_id)) return null;
  // As core/hosts.ts routingNode: a server that is not a string is withheld; one that cannot be an address label too.
  const server = typeof r.server_name === 'string' && SERVER.test(r.server_name) ? r.server_name : '';
  const realms = Array.isArray(r.realm_ids) && r.realm_ids.every((x) => typeof x === 'string' && REALM.test(x)) ? [...(r.realm_ids as string[])] : null;
  // A realm list that cannot be read puts the computer in no realm: only "All realms" may reach it.
  return Object.freeze({ computer: r.id.toLowerCase(), project: r.project_id.toLowerCase(), server, realms: Object.freeze(realms ?? []), gen });
}

/** Why a target is not in the table ('ok' when it is). */
export type MemberVerdict = 'ok' | 'unknown' | 'withheld' | 'other-account' | 'other-realm' | 'other-project' | 'other-server';
export interface MemberTarget { readonly account: string; readonly project: string; readonly computer: string; readonly server: string | null | undefined }
/** The realm selection: one realm, or null for "All realms"; `pin` is an access key's realm, else null. */
export interface MemberSelection { readonly realm: string | null; readonly pin: string | null }

interface Page { readonly gen: number; readonly ids: ReadonlySet<string>; readonly totalPages: number }

export class MembershipTable {
  private issued = 0;
  /** Reads issued at or below this generation are ignored (they left before the last clear). */
  private floor = 0;
  private readonly rows = new Map<string, MemberRow>();
  private readonly runs = new Map<string, Map<number, Page>>();

  /** `account`: the session's account; a table is never shared across accounts or sessions. */
  constructor(readonly account: string, private readonly onChange: () => void = () => {}) {}

  /** A membership read is about to leave: its generation (pass it back with the answer). */
  begin(): number { return ++this.issued; }

  /** The rows, for tests and diagnostics. */
  snapshot(): MemberRow[] { return [...this.rows.values()]; }

  /** Drops every row and ignores the answers of every read issued so far (a realm switch). */
  clear(): void {
    this.floor = this.issued;
    this.runs.clear();
    if (!this.rows.size) return;
    this.rows.clear();
    this.onChange();
  }

  /**
   * The answer of a membership read issued at `gen`: `ok` false for anything but a successful answer (an HTTP error,
   * a lost answer, a body that cannot be read).
   */
  answer(call: MemberCall, gen: number, ok: boolean, body: unknown): void {
    if (!Number.isSafeInteger(gen) || gen <= this.floor || gen > this.issued) return;
    let changed = false;
    const drop = (id: string): void => { if (this.rows.delete(id)) changed = true; };
    const put = (row: MemberRow): void => {
      const cur = this.rows.get(row.computer);
      if (cur && cur.gen > row.gen) return;
      if (!cur || !sameRow(cur, row)) changed = true;
      this.rows.set(row.computer, row);
    };
    const data = ok && body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
    if (call.kind === 'one') {
      const row = memberRowOf(data, gen);
      if (row && row.computer === call.computer) put(row);
      else { const cur = this.rows.get(call.computer); if (cur && cur.gen < gen) drop(call.computer); }
    } else {
      const list = data && typeof data === 'object' ? (data as { computers?: unknown }).computers : undefined;
      if (!Array.isArray(list)) {
        // A failed list read: every row of its scope goes, and its enumeration starts again.
        this.runs.delete(call.enumeration);
        for (const r of [...this.rows.values()]) if (inScope(r, call.scope) && r.gen < gen) drop(r.computer);
      } else {
        const ids = new Set<string>();
        for (const raw of list) {
          const row = memberRowOf(raw, gen);
          if (!row) continue;
          ids.add(row.computer);
          put(row);
        }
        const totalPages = pagesOf((data as { pagination?: unknown }).pagination, call.page);
        const run = this.runs.get(call.enumeration) ?? new Map<number, Page>();
        run.set(call.page, { gen, ids, totalPages });
        this.runs.set(call.enumeration, run);
        const done = complete(run);
        if (done) {
          this.runs.delete(call.enumeration);
          for (const r of [...this.rows.values()]) if (inScope(r, call.scope) && r.gen < done.gen && !done.ids.has(r.computer)) drop(r.computer);
        }
      }
    }
    if (changed) this.onChange();
  }

  /** Whether `target` is in the table under `sel` (see the header). */
  verdict(target: MemberTarget, sel: MemberSelection): MemberVerdict {
    if (target.account !== this.account) return 'other-account';
    const row = this.rows.get(String(target.computer).toLowerCase());
    if (!row) return 'unknown';
    if (row.server === '') return 'withheld';
    if (row.project !== String(target.project).toLowerCase()) return 'other-project';
    if (sel.realm !== null && !row.realms.includes(sel.realm)) return 'other-realm';
    if (sel.pin !== null && !row.realms.includes(sel.pin)) return 'other-realm';
    if (!target.server || target.server !== row.server) return 'other-server';
    return 'ok';
  }
}

const sameRow = (a: MemberRow, b: MemberRow): boolean => a.project === b.project && a.server === b.server && a.realms.join() === b.realms.join();
const inScope = (r: MemberRow, s: ListScope): boolean => (s.realm === null || r.realms.includes(s.realm)) && (s.project === null || r.project === s.project);
/** The page count an answer states (totalPages, else total / limit). */
function pagesOf(p: unknown, page: number): number {
  const o = p && typeof p === 'object' ? (p as { totalPages?: unknown; total?: unknown; limit?: unknown }) : null;
  if (o && Number.isSafeInteger(o.totalPages) && (o.totalPages as number) >= 0) return Math.max(1, o.totalPages as number);
  if (o && Number.isSafeInteger(o.total) && Number.isSafeInteger(o.limit) && (o.limit as number) > 0) return Math.max(1, Math.ceil((o.total as number) / (o.limit as number)));
  // No page count: a first page is the whole list (removal only ever refuses more); a later page is never complete.
  return page === 1 ? 1 : Infinity;
}
/** Every page 1..N of one enumeration, all stating the same N: their union and the OLDEST page's generation. */
function complete(run: ReadonlyMap<number, Page>): { gen: number; ids: Set<string> } | null {
  const first = run.get(1);
  if (!first || !Number.isFinite(first.totalPages)) return null;
  const n = first.totalPages;
  const ids = new Set<string>();
  let gen = Infinity;
  for (let p = 1; p <= n; p++) {
    const pg = run.get(p);
    if (!pg || pg.totalPages !== n) return null;
    for (const id of pg.ids) ids.add(id);
    gen = Math.min(gen, pg.gen);
  }
  return { gen, ids };
}

/** Admission row 3 for a computer request: the table decides; `routingAllows` (core) may only refuse more. */
export function destinationVerdict(table: MembershipTable, target: MemberTarget, sel: MemberSelection, routingAllows: (computer: string, server: string | null | undefined) => boolean): { ok: true } | { ok: false; code: 'TERM_DESTINATION'; why: Exclude<MemberVerdict, 'ok'> | 'routing' } {
  const v = table.verdict(target, sel);
  if (v !== 'ok') return { ok: false, code: 'TERM_DESTINATION', why: v };
  return routingAllows(target.computer, target.server) ? { ok: true } : { ok: false, code: 'TERM_DESTINATION', why: 'routing' };
}
