// Pure rules of the keys page. No requests, no DOM, no
// storage: rows in, view models out; the New key form in, a POST /auth/tokens body (or field errors) out.
//
// Rights come from the server's catalogue (GET /auth/tokens/templates), never from a client mirror: the
// right list is every boolean leaf of the `full_access` template except `admin.*` and
// `resources.create_tokens`. Delegation (`resources.create_tokens`) is its own switch, not a right in the
// list. Without the catalogue Access reads "unknown", Choose rights and delegation are unavailable, and
// Full still works (it goes by template name).
import { parseAllowlist, stringOrEmpty as str } from "@core";
import type {
  Catalogue,
  CopyInput,
  Key,
  KeyAccess,
  KeyRow,
  KeyState,
  Managed,
  NewKeyForm,
  RawTemplate,
  RawToken,
  Tree,
} from "./types";

export const RID = /^[0-9a-f]{24}$/;
const DAY = 86400000;
const NAME_RE = /^[a-zA-Z0-9 _-]*$/;
export const NAME_MAX = 254;
const FULL = "full_access";

function ids(a: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(a)) return out;
  for (const v of a)
    if (RID.test(str(v)) && !out.includes(v as string)) out.push(v as string);
  return out;
}

/** A leaf is granted only when it is exactly true (default-deny, like the server's checkPermission). */
export function leafOf(tree: Tree | null | undefined, path: string): boolean {
  let node: unknown = tree;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return false;
    node = (node as Tree)[part];
  }
  return node === true;
}

// ── the catalogue ──────────────────────────────────────────────────────────────────────

function hasBilling(rights: readonly string[], tree: Tree | null): boolean {
  return rights.some((r) => r.startsWith("financial.") && leafOf(tree, r));
}

/** The server's rights and the named templates it offers as "Start from". Odd entries are skipped, never shown. */
export function catalogue(
  templates: readonly RawTemplate[] | null | undefined,
): Catalogue {
  let full: Tree | null = null;
  const rights: string[] = [];
  const list = Array.isArray(templates) ? templates : [];
  for (const t of list)
    if (
      t &&
      t.name === FULL &&
      t.permissions &&
      typeof t.permissions === "object"
    )
      full = t.permissions;
  (function walk(node: Tree, prefix: string) {
    for (const k of Object.keys(node)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (p === "admin" || p === "resources.create_tokens") continue;
      const v = node[k];
      if (typeof v === "boolean") rights.push(p);
      else if (v && typeof v === "object") walk(v, p);
    }
  })(full ?? {}, "");
  const named: Catalogue["templates"] = [];
  if (full) {
    for (const tp of list) {
      if (
        !tp ||
        tp.name === FULL ||
        typeof tp.name !== "string" ||
        !/^[a-z0-9_]{1,64}$/.test(tp.name)
      )
        continue;
      if (!tp.permissions || typeof tp.permissions !== "object") continue;
      named.push({
        name: tp.name,
        rights: rights.filter((r) => leafOf(tp.permissions, r)),
      });
    }
  }
  return { rights, full, billing: hasBilling(rights, full), templates: named };
}

/** {full, n, of, billing, tmpl?} or null (catalogue unknown). */
export function access(
  perms: Tree | undefined,
  cat: Catalogue | null,
): KeyAccess | null {
  if (!cat || !cat.rights.length) return null;
  const have = cat.rights.filter((r) => leafOf(perms, r));
  const out: KeyAccess = {
    full: have.length === cat.rights.length,
    n: have.length,
    of: cat.rights.length,
    billing: hasBilling(cat.rights, perms ?? null),
  };
  if (!out.full && have.length) {
    const tp = cat.templates.find(
      (t) =>
        t.rights.length === have.length &&
        t.rights.every((r) => have.includes(r)),
    );
    if (tp) out.tmpl = tp.name;
  }
  return out;
}

/** The Access filter value of a key: 'full', 'tmpl:<name>', 'N/M' or 'unknown'. */
export function accessLabel(k: Pick<Key, "access">): string {
  const a = k.access;
  return !a
    ? "unknown"
    : a.full
      ? "full"
      : a.tmpl
        ? `tmpl:${a.tmpl}`
        : `${a.n}/${a.of}`;
}

// ── a list row → the view model ───────────────────────────────────────────────────────

function canon(v: unknown): string {
  if (v === null || typeof v !== "object")
    return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}
const sorted = (a: unknown): string[] =>
  Array.isArray(a) ? a.map(String).sort() : [];

/** What a copy inherits from its source: realms, base-domain use, rights, IPs, end date, vault, events, delegation. */
function scopeOf(r: RawToken): string {
  return canon({
    realms: sorted(r.realm_ids),
    noRealm: r.allow_no_realm === true,
    perms: r.permissions ?? null,
    ips: sorted(r.ip_whitelist),
    ends: str(r.expires_at) || null,
    vault: r.vault_access === true,
    events: r.event_access === true,
    depth: r.delegation_depth ?? 0,
  });
}

/** A scope (scopeOf) without its end date: a copy may set its own Ends. canon() sorts the keys, so the first
 *  "ends" entry is the top-level one ("depth" sorts before it; the nested rights come after). */
export const scopeLessEnds = (scope: string): string =>
  scope.replace(/"ends":(?:null|"(?:[^"\\]|\\.)*"),?/, "");

/** A list row and a fresh read of the same key: may the row's copy still be sent? */
export function sameScope(
  a: Pick<Key, "scope"> | null | undefined,
  b: Pick<Key, "scope"> | null | undefined,
): boolean {
  return !!a && !!b && typeof a.scope === "string" && a.scope === b.scope;
}

/** The agent's own keys: deleting them asks with their own warning. */
export function managedKind(alias: string): Managed {
  if (alias.startsWith("hoody-agent auto")) return "boot";
  if (alias.startsWith("hoody-agent realm ")) return "realm";
  return "";
}

export function normToken(
  row: RawToken | null | undefined,
  cat: Catalogue | null,
  now: number,
): Key {
  const r = (row ?? {}) as RawToken;
  const realms = ids(r.realm_ids);
  const ends = str(r.expires_at) || null;
  const endsMs = ends ? Date.parse(ends) : NaN;
  const expired = !!ends && !Number.isNaN(endsMs) && endsMs <= now;
  const ips = (Array.isArray(r.ip_whitelist) ? r.ip_whitelist : []).filter(
    (p) => str(p) && p !== "*",
  );
  const state: KeyState = expired
    ? "expired"
    : r.is_enabled === false
      ? "paused"
      : "active";
  return {
    id: str(r.id),
    name: str(r.alias),
    prefix: str(r.prefix),
    realms,
    allRealms: realms.length === 0,
    noRealm: realms.length > 0 && r.allow_no_realm === true,
    access: access(r.permissions, cat),
    endsAt: ends,
    createdAt: str(r.created_at) || null,
    lastUsedAt: str(r.last_used_at) || null,
    lastUsedIp: str(r.last_used_ip) || null,
    madeBy: str(r.created_by_token_id) || null,
    state,
    enabled: r.is_enabled !== false,
    ips,
    vault: r.vault_access === true,
    events: r.event_access === true,
    depth: typeof r.delegation_depth === "number" ? r.delegation_depth : 0,
    delegates: leafOf(r.permissions, "resources.create_tokens"),
    managed: managedKind(str(r.alias)),
    perms:
      r.permissions && typeof r.permissions === "object" ? r.permissions : null,
    scope: scopeOf(r),
  };
}

/** A key works in realm `sel` when it names it or names no realm at all (All realms). */
export function worksIn(
  k: Pick<Key, "allRealms" | "realms">,
  sel: string,
): boolean {
  return k.allRealms || k.realms.includes(sel);
}

// ── selection handle: the id never goes in a URL whole ─────────────────────────────────

/** `<prefix>.<last six of the id>`: stable, unique enough, never the whole id. */
export function handleOf(k: Pick<Key, "id" | "prefix" | "name">): string {
  const base = (k.prefix || k.name || "key").replace(/[^A-Za-z0-9_-]/g, "");
  return `${base || "key"}.${k.id.slice(-6)}`;
}

export function findByHandle<T extends Pick<Key, "id" | "prefix" | "name">>(
  list: readonly T[],
  handle: string | undefined,
): T | undefined {
  if (!handle) return undefined;
  const dot = handle.lastIndexOf(".");
  if (dot < 1) return undefined;
  const tail = handle.slice(dot + 1);
  return list.find((k) => handleOf(k) === handle && k.id.endsWith(tail));
}

// ── the list as shown ──────────────────────────────────────────────────────────────────

export type EndsBucket = "never" | "expired" | "soon" | "later";

/** Ends filter value: never (no end date), expired, soon (within 30 days) or later. */
export function endsBucket(
  k: Pick<Key, "endsAt" | "state">,
  now: number,
): EndsBucket {
  if (!k.endsAt) return "never";
  if (k.state === "expired") return "expired";
  return Date.parse(k.endsAt) - now <= 30 * DAY ? "soon" : "later";
}

/** The search text of a key: name (with the agent badge word), prefix, allowed IPs. */
export function searchText(k: Key): string {
  const badge =
    k.managed === "boot"
      ? " autologin agent"
      : k.managed === "realm"
        ? " managed agent"
        : "";
  return `${k.name}${badge} ${k.prefix} ${k.ips.join(" ")}`.toLowerCase();
}

/** The distinct Access values a choice filter offers for these keys, sorted. */
export function accessChoices(keys: readonly Key[]): string[] {
  return [...new Set(keys.map(accessLabel))].sort();
}

export interface View {
  rows: KeyRow[];
  count: number;
  expired: number;
  /** The realm the list is narrowed to, or 'all'. */
  realm: string;
}

/**
 * The list as scoped to the realm. In realm mode only the keys that work there (/auth/tokens is base-only and
 * lists every key). An All realms key is shown in a realm but changed from All realms. Search and filters are
 * the data view's.
 */
export function view(keys: readonly Key[], sel: string | undefined): View {
  const realm = RID.test(sel ?? "") ? (sel as string) : "all";
  const rows: KeyRow[] = [];
  let expired = 0;
  for (const k of keys) {
    if (realm !== "all" && !worksIn(k, realm)) continue;
    rows.push({ key: k, editable: realm === "all" || !k.allRealms });
    if (k.state === "expired") expired++;
  }
  return { rows, count: rows.length, expired, realm };
}

/** Keys that work in the realm, before search and filters (the "of N" total). */
export function inRealmCount(
  keys: readonly Key[],
  sel: string | undefined,
): number {
  return RID.test(sel ?? "")
    ? keys.filter((k) => worksIn(k, sel as string)).length
    : keys.length;
}

// ── New key ────────────────────────────────────────────────────────────────────────────

/** The New key form, with the realm preselected from the shell's selection. */
export function newForm(sel: string | undefined): NewKeyForm {
  const realm = RID.test(sel ?? "") ? (sel as string) : null;
  return {
    name: "",
    worksIn: realm ? "only" : "all",
    realm,
    picked: realm ? [realm] : [],
    access: "full",
    rights: [],
    delegate: false,
    ends: "never",
    date: "",
    ips: "",
  };
}

function clone<T>(tree: T): T {
  return JSON.parse(JSON.stringify(tree)) as T;
}

function assign(node: Tree[string] | undefined, add: Tree): Tree {
  const out: Tree = node && typeof node === "object" ? node : {};
  for (const k of Object.keys(add)) out[k] = add[k] as boolean;
  return out;
}

export function treeOf(paths: readonly string[]): Tree {
  const tree: Tree = {};
  for (const p of paths) {
    const parts = p.split(".");
    let node = tree;
    for (const part of parts.slice(0, -1))
      node = (node[part] = (node[part] as Tree | undefined) ?? {}) as Tree;
    node[parts[parts.length - 1] as string] = true;
  }
  return tree;
}

export interface Body {
  alias?: string;
  realm_ids?: string[];
  allow_no_realm?: boolean;
  permission_template?: string;
  permissions?: Tree;
  vault_access?: boolean;
  event_access?: boolean;
  expires_at?: string | null;
  ip_whitelist?: string[];
}

export type FormResult<B> =
  | { body: B; errors?: undefined }
  | { errors: Record<string, string>; body?: undefined };

/** Midnight UTC of a YYYY-MM-DD that exists (February 31 does not), else NaN. Date.parse alone reads a bare year and rolls Feb 31 over; the text must have the shape and equal the ISO day it parses to. */
function realDay(text: string): number {
  // The shape first: Date.parse also reads expanded years ('+010000-01', '-000001-01') whose ISO slice equals the text.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return NaN;
  const ms = Date.parse(text);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text ? NaN : ms;
}

/** Ends: the shared piece of New key and Copy. */
function endsField(
  kind: string,
  date: string,
  now: number,
  errors: Record<string, string>,
): string | undefined {
  if (kind === "90d") return new Date(now + 90 * DAY).toISOString();
  if (kind === "1y") return new Date(now + 365 * DAY).toISOString();
  if (kind === "date") {
    const ms = realDay(str(date));
    if (Number.isNaN(ms)) errors.date = "bad";
    else if (ms <= now) errors.date = "past";
    else return new Date(ms).toISOString();
  }
  return undefined;
}

/** form → {body} or {errors: {field: code}}. Nothing secret goes in or out. */
export function toBody(
  form: NewKeyForm,
  cat: Catalogue | null,
  now: number,
): FormResult<Body> {
  const errors: Record<string, string> = {};
  const body: Body = {};
  const name = str(form.name).trim();
  if (!name) errors.name = "required";
  else if (name.length > NAME_MAX) errors.name = "long";
  else if (!NAME_RE.test(name)) errors.name = "chars";
  body.alias = name;

  if (form.worksIn === "only") {
    if (!RID.test(str(form.realm))) errors.realms = "none";
    else {
      body.realm_ids = [form.realm as string];
      body.allow_no_realm = false;
    }
  } else if (form.worksIn === "pick") {
    const picked = ids(form.picked);
    // No "no realm" box: the server makes any key with realms work only on those realms' hosts, so
    // allow_no_realm:true would buy nothing. Always false.
    if (!picked.length) errors.realms = "none";
    else {
      body.realm_ids = picked;
      body.allow_no_realm = false;
    }
    if (str(form.realmDraft).trim()) errors.realmDraft = "pending";
  } else if (form.worksIn === "all") body.allow_no_realm = true;
  else errors.realms = "none";

  if (form.access === "choose") {
    if (!cat || !cat.full) errors.rights = "unavailable";
    else {
      const chosen = cat.rights.filter((r) => form.rights.includes(r));
      if (!chosen.length) errors.rights = "none";
      else {
        const perms = treeOf(chosen);
        body.permissions = perms;
        body.vault_access = chosen.includes("resources.vault");
        body.event_access = chosen.includes("resources.events");
        if (form.delegate)
          perms.resources = assign(perms.resources, { create_tokens: true });
      }
    }
  } else if (form.delegate) {
    // Delegation needs a tree: the server sets create_tokens false under a template name. Full's own tree
    // from the catalogue, with Full's defaults (events on, vault off).
    if (!cat || !cat.full) errors.delegate = "unavailable";
    else {
      const perms = clone(cat.full);
      perms.resources = assign(perms.resources, {
        vault: false,
        events: true,
        create_tokens: true,
      });
      body.permissions = perms;
      body.event_access = true;
      body.vault_access = false;
    }
  } else {
    body.permission_template = FULL;
    // Defaults kept: events on, vault a deliberate opt-in (off).
    body.event_access = true;
    body.vault_access = false;
  }

  if (form.ends === "never") {
    /* "Never" omits expires_at: the create schema refuses an explicit null. */
  } else if (
    form.ends === "date" ||
    form.ends === "90d" ||
    form.ends === "1y"
  ) {
    const at = endsField(form.ends, form.date, now, errors);
    if (at) body.expires_at = at;
  } else errors.date = "bad";

  const list = parseAllowlist(form.ips);
  // A wrong entry first; a list of valid entries past the Hub's limit says so in its own words ("many").
  if (list.errors.length) errors.ips = "bad";
  else if (list.tooMany) errors.ips = "many";
  if (list.entries.length) body.ip_whitelist = list.entries;

  return Object.keys(errors).length ? { errors } : { body };
}

/**
 * Copy of a key (POST /auth/tokens/:id/copy: same rights, realms and IPs, a new secret). An empty name lets
 * the server name the copy; 'same' leaves expires_at out (the copy keeps the source's end date); 'never'
 * sends null (the copy schema takes it and it means no end date).
 */
export function copyBody(input: CopyInput, now: number): FormResult<Body> {
  const errors: Record<string, string> = {};
  const body: Body = {};
  const name = str(input.name).trim();
  if (name.length > NAME_MAX) errors.name = "long";
  else if (!NAME_RE.test(name)) errors.name = "chars";
  else if (name) body.alias = name;
  if (input.ends === "never") body.expires_at = null;
  else if (
    input.ends === "date" ||
    input.ends === "90d" ||
    input.ends === "1y"
  ) {
    const at = endsField(input.ends, input.date, now, errors);
    if (at) body.expires_at = at;
  } else if (input.ends !== "same") errors.date = "bad";
  return Object.keys(errors).length ? { errors } : { body };
}

// ── Edit a key (PUT /auth/tokens/:id) ──────────────────────────────────────────────────

/** Shares (Stop and share again: a share's create-time limits are not kept by the server) and the agent's own keys
 *  are never edited here. */
export function canEdit(k: Pick<Key, "name" | "managed">): boolean {
  return !k.managed && !k.name.startsWith("hoody share ");
}

/** The rights of a key the form can show: its catalogue leaves, vault and events as the key's own flags say. */
function grantedRights(k: Pick<Key, "perms" | "vault" | "events">, cat: Catalogue): string[] {
  return cat.rights.filter(
    (r) =>
      leafOf(k.perms, r) &&
      (r !== "resources.vault" || k.vault) &&
      (r !== "resources.events" || k.events),
  );
}

/** The Edit form of a key: what the key is now, in New key's fields. Full when it holds exactly Full's rights (events
 *  on, vault off); otherwise Choose rights with what it holds. Without a catalogue Access stays as it is (locked). */
export function editForm(
  k: Pick<Key, "name" | "realms" | "allRealms" | "perms" | "vault" | "events" | "delegates" | "endsAt" | "ips">,
  cat: Catalogue | null,
): NewKeyForm {
  const rights = cat ? grantedRights(k, cat) : [];
  const fullSet = cat ? cat.rights.filter((r) => r !== "resources.vault") : [];
  const full =
    !cat ||
    !cat.full ||
    (rights.length === fullSet.length && fullSet.every((r) => rights.includes(r)));
  return {
    name: k.name,
    worksIn: k.allRealms ? "all" : "pick",
    realm: null,
    picked: [...k.realms],
    access: full ? "full" : "choose",
    rights,
    delegate: k.delegates,
    ends: k.endsAt ? "date" : "never",
    date: k.endsAt ? k.endsAt.slice(0, 10) : "",
    ips: k.ips.join(", "),
  };
}

export type EditGroup = "name" | "realms" | "access" | "ends" | "ips";

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** The groups the person changed, compared with the key as it was opened (editForm). */
export function editChanges(
  before: NewKeyForm,
  after: NewKeyForm,
  cat: Catalogue | null,
): EditGroup[] {
  const out: EditGroup[] = [];
  if (str(after.name).trim() !== before.name.trim()) out.push("name");
  if (
    after.worksIn !== before.worksIn ||
    (after.worksIn === "pick" && !sameSet(ids(after.picked), before.picked))
  )
    out.push("realms");
  const chosen = (f: NewKeyForm) =>
    cat ? cat.rights.filter((r) => f.rights.includes(r)) : [];
  if (
    after.access !== before.access ||
    after.delegate !== before.delegate ||
    (after.access === "choose" && !sameSet(chosen(after), chosen(before)))
  )
    out.push("access");
  if (
    after.ends !== before.ends ||
    (after.ends === "date" && after.date !== before.date)
  )
    out.push("ends");
  if (after.ips.trim() !== before.ips.trim()) {
    const a = parseAllowlist(after.ips);
    const b = parseAllowlist(before.ips);
    if (a.errors.length || a.tooMany || !sameSet(a.entries, b.entries))
      out.push("ips");
  }
  return out;
}

/** The guarded fields (the server may ask for the 2FA code for any of them; a name alone never asks). */
export const guardedEdit = (groups: readonly EditGroup[]): boolean =>
  groups.some((g) => g !== "name");

/**
 * The Edit body: only the groups changed (editChanges), each whole, checked like New key. Unchanged groups are
 * neither checked nor sent (an expired end date may stay as it is). Full is sent as Full's tree (the update takes
 * no template name), with events on, vault off and delegation as ticked; "Never" sends null; no addresses send
 * "*" (anywhere). A realm-limited key cannot become an all-realms key (the server refuses: an empty list means
 * every realm). No change: no body.
 */
export function editBody(
  before: NewKeyForm,
  after: NewKeyForm,
  cat: Catalogue | null,
  now: number,
): FormResult<Body> & { groups: EditGroup[] } {
  const groups = editChanges(before, after, cat);
  const errors: Record<string, string> = {};
  const body: Body = {};
  if (groups.includes("name")) {
    const name = str(after.name).trim();
    if (!name) errors.name = "required";
    else if (name.length > NAME_MAX) errors.name = "long";
    else if (!NAME_RE.test(name)) errors.name = "chars";
    else body.alias = name;
  }
  // An id typed and not added is never dropped by the send, whatever else changed.
  if (after.worksIn === "pick" && str(after.realmDraft).trim()) errors.realmDraft = "pending";
  if (groups.includes("realms")) {
    if (after.worksIn !== "pick") errors.realms = "widen";
    else {
      const picked = ids(after.picked);
      if (!picked.length) errors.realms = "none";
      else {
        body.realm_ids = picked;
        body.allow_no_realm = false;
      }
    }
  }
  if (groups.includes("access")) {
    if (!cat || !cat.full) errors.rights = "unavailable";
    else if (after.access === "choose") {
      const chosen = cat.rights.filter((r) => after.rights.includes(r));
      if (!chosen.length) errors.rights = "none";
      else {
        const perms = treeOf(chosen);
        if (after.delegate)
          perms.resources = assign(perms.resources, { create_tokens: true });
        body.permissions = perms;
        body.vault_access = chosen.includes("resources.vault");
        body.event_access = chosen.includes("resources.events");
      }
    } else {
      const perms = clone(cat.full);
      // Never admin: it is no right of the catalogue's (catalogue() leaves it out).
      delete perms.admin;
      perms.resources = assign(perms.resources, {
        vault: false,
        events: true,
        create_tokens: after.delegate,
      });
      body.permissions = perms;
      body.event_access = true;
      body.vault_access = false;
    }
  }
  if (groups.includes("ends")) {
    if (after.ends === "never") body.expires_at = null;
    else if (after.ends === "date" || after.ends === "90d" || after.ends === "1y") {
      const at = endsField(after.ends, after.date, now, errors);
      // Whole seconds: the read-back compares the end exactly, and no database cuts a whole second.
      if (at) body.expires_at = new Date(Math.floor(Date.parse(at) / 1000) * 1000).toISOString();
    } else errors.date = "bad";
  }
  if (groups.includes("ips")) {
    const list = parseAllowlist(after.ips);
    if (list.errors.length) errors.ips = "bad";
    else if (list.tooMany) errors.ips = "many";
    else body.ip_whitelist = list.entries.length ? list.entries : ["*"];
  }
  return Object.keys(errors).length ? { errors, groups } : { body, groups };
}

/** Every true leaf of a tree, as dotted paths. */
function trueLeaves(tree: unknown, prefix = "", out: string[] = []): string[] {
  if (!tree || typeof tree !== "object") return out;
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v === true) out.push(p);
    else if (v && typeof v === "object") trueLeaves(v, p, out);
  }
  return out;
}
/** The address list as the server keeps and checks it: a bare IPv4 address is stored as its /32 range,
 *  and any list holding "*" lets every address in, whatever else it lists, as an empty list does. */
const ipSet = (a: unknown): string[] => {
  const list = (Array.isArray(a) ? a : []).map((x) => String(x).trim()).filter(Boolean);
  if (list.includes("*")) return [];
  return [...new Set(list.map((x) => (x.includes("/") ? x : `${x}/32`)))];
};
/** Keys of a body that a read can show; a body with none proves nothing. */
const EDIT_FIELDS = ["alias", "realm_ids", "allow_no_realm", "permissions", "vault_access", "event_access", "expires_at", "ip_whitelist"] as const;

/**
 * A fresh read of the key proves an edit that may have gone through only when every field sent reads as sent
 * (C9): the name, the realm list as a set, the rights as true leaves with the vault and events flags, the end date
 * exactly (the edit sends whole seconds, so a database that drops milliseconds still keeps it as sent; null: never),
 * the address list as a set (none, or any list holding "*", means anywhere, as the server's check reads it; a bare
 * address is its /32). Anything else, a missing row or an empty body included, proves
 * nothing.
 */
export function editProven(sent: Body | null | undefined, row: RawToken | null | undefined): boolean {
  if (!row || typeof row !== "object" || !sent) return false;
  if (!EDIT_FIELDS.some((f) => sent[f] !== undefined)) return false;
  if (sent.alias !== undefined && row.alias !== sent.alias) return false;
  if (sent.realm_ids !== undefined && !sameSet(ids(row.realm_ids), sent.realm_ids)) return false;
  if (sent.allow_no_realm !== undefined && (row.allow_no_realm === true) !== sent.allow_no_realm) return false;
  if (sent.permissions !== undefined && !sameSet(trueLeaves(row.permissions), trueLeaves(sent.permissions)))
    return false;
  if (sent.vault_access !== undefined && (row.vault_access === true) !== sent.vault_access) return false;
  if (sent.event_access !== undefined && (row.event_access === true) !== sent.event_access) return false;
  if (sent.expires_at !== undefined) {
    const got = str(row.expires_at) || null;
    if (sent.expires_at === null) {
      if (got !== null) return false;
    } else {
      const a = got ? Date.parse(got) : NaN;
      if (!Number.isFinite(a) || a !== Date.parse(sent.expires_at)) return false;
    }
  }
  if (sent.ip_whitelist !== undefined && !sameSet(ipSet(row.ip_whitelist), ipSet(sent.ip_whitelist)))
    return false;
  return true;
}

// ── realm rules the send enforces whatever the form says ──────────────────────────────

/** In a realm a key may be made only for exactly that realm, with no base-domain use. */
export function inRealmBody(body: Body, realm: string): boolean {
  const r = body.realm_ids;
  return (
    !!r && r.length === 1 && r[0] === realm && body.allow_no_realm === false
  );
}

/** In a realm only a key bound to exactly that realm is copied (the copy keeps the source's realms). */
export function copyableIn(
  k: Pick<Key, "realms" | "noRealm">,
  realm: string | undefined,
): boolean {
  if (!RID.test(realm ?? "")) return true;
  return k.realms.length === 1 && k.realms[0] === realm && !k.noRealm;
}

// ── unknown outcome of a mint ──────────────────────────────────────────────────────────

/**
 * After an unknown outcome: which keys appeared since the snapshot? Nothing is ever attributed: the token
 * routes take no idempotency key and echo nothing an operation could be matched on, so even a single new
 * namesake may be another tab's or another client's create. They are candidates, shown as "a key of this
 * name appeared", never as "your key", and never offered for Delete on that ground.
 */
export function candidates(
  before: readonly string[] | null,
  rows: readonly RawToken[],
  alias: string | null,
  cat: Catalogue | null,
  now: number,
): Key[] {
  const found: Key[] = [];
  for (const t of rows) {
    const isNew = before ? !before.includes(t.id) : false;
    const named = alias ? t.alias === alias : false;
    if (before ? isNew && (named || !alias) : named)
      found.push(normToken(t, cat, now));
  }
  return found;
}

// ── words the view picks (string-key tails) ───────────────────────────────────────────

const REFUSED = [
  "KEY_BUSY",
  "KEY_SENDING",
  "REALM_SCOPE",
  "CHANGE_FROM_ALL",
  "NO_SCRUB",
  "NO_KEY",
  "CHANGED",
  "NO_CHECK",
  "NOT_HERE",
  "NO_STORAGE",
  "HELD_OTHER",
] as const;
const ERRS = [
  "DUPLICATE_ALIAS",
  "AUTH_TOKEN_LIMIT_REACHED",
  "TOKEN_CEILING_EXCEEDED",
  "TOKEN_NOT_FOUND",
  "OTP_REQUIRED",
  // The 2FA lockout (429): too many wrong sign-in codes.
  "TWOFACTOR_RATE_LIMIT",
] as const;

export function refusedKey(code: string | undefined): string {
  return (REFUSED as readonly string[]).includes(code ?? "")
    ? (code as string)
    : "other";
}

/** A server code → its words; a mint's unworded failure says it was not made, not "did not change". */
export function errKey(code: string | undefined, mint: boolean): string {
  return (ERRS as readonly string[]).includes(code ?? "")
    ? (code as string)
    : mint
      ? "notMade"
      : "other";
}

/** Full's words: it excludes billing only when the catalogue says so. Unknown: billing included. */
export function fullHelpKey(
  cat: Catalogue | null,
): "nk.fullH" | "nk.fullBilling" {
  return cat && cat.full && !cat.billing ? "nk.fullH" : "nk.fullBilling";
}

export interface RightGroup {
  key: string;
  paths: string[];
}

/** The catalogue's rights by their first segment, in catalogue order. */
export function groups(rights: readonly string[]): RightGroup[] {
  const out: RightGroup[] = [];
  const at = new Map<string, RightGroup>();
  for (const p of rights) {
    const g = p.split(".")[0] as string;
    let grp = at.get(g);
    if (!grp) {
      grp = { key: g, paths: [] };
      at.set(g, grp);
      out.push(grp);
    }
    grp.paths.push(p);
  }
  return out;
}

// Rights that only show. From the API's read_only template plus the
// rights that only read by their own words. Left out on purpose, as Write: projects.read (it also accepts or rejects
// a pool invitation) and financial.billing.download_invoices (it also generates an invoice).
// A right that changes anything is never marked Read.
const READ_RIGHTS = new Set([
  "computers.read",
  "computers.actions.logs",
  "financial.wallet.read",
  "financial.billing.read",
  "resources.events",
  "resources.realms",
  "computers.features.env_values",
  "financial.server_rental.view_marketplace",
  "resources.read_account",
]);

/** A right's mark in a key's panel: one that only shows, or one that changes or acts. */
export function rightKind(path: string): "read" | "write" {
  return READ_RIGHTS.has(path) ? "read" : "write";
}

export interface HeldGroup extends RightGroup {
  /** How many rights the catalogue has in this area: all of them held is Full. */
  of: number;
}

/** A key's held rights by area, in catalogue order, each with its area's size. Areas it holds none of are left out. */
export function heldGroups(
  rights: readonly string[],
  held: readonly string[],
): HeldGroup[] {
  return groups(rights).flatMap((g) => {
    const paths = g.paths.filter((p) => held.includes(p));
    return paths.length ? [{ key: g.key, paths, of: g.paths.length }] : [];
  });
}

/** Tri-state of a group header: none, some or all of its rights ticked. */
export function groupState(
  paths: readonly string[],
  ticked: readonly string[],
): "none" | "some" | "all" {
  const n = paths.filter((p) => ticked.includes(p)).length;
  return n === 0 ? "none" : n === paths.length ? "all" : "some";
}

/** Tick or untick a whole group. */
export function toggleGroup(
  paths: readonly string[],
  ticked: readonly string[],
  on: boolean,
): string[] {
  const rest = ticked.filter((p) => !paths.includes(p));
  return on ? [...rest, ...paths] : rest;
}
