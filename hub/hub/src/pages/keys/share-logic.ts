// Pure rules of "Share this realm". A share is a realm-bound API key
// with a reviewed preset, made by the owner and sent by hand. Nothing here signs anyone in.
//
// The alias ledger: every alias sent from this page for an account and realm, kept until the account changes.
// A nonce is never sent twice. A mint whose outcome is unknown is reconciled by its full alias against GET
// /auth/tokens: found -> its text is lost (Stop it); absent from a complete list -> nothing was made; a
// truncated list or a failed read settles nothing, and Create stays off until a complete read does.
import { attemptFor, capsOf, heldAttempts, minimumHeld, parseAllowlist } from "@core";
import type { Catalogue, RawToken, Tree } from "./types";

export const SHARE_RE = /^[0-9a-f]{24}$/;
export const TOKEN_RE = /^hdy_[0-9a-f]{24}_[0-9a-f]{48}$/;
export const PREFIX = "hoody share ";
export const DAYS = [1, 7, 30] as const;
export type Days = (typeof DAYS)[number];
export const DEFAULT_DAYS: Days = 7;
const DAY = 86400000;
const HOUR = 3600000;

/**
 * The v1 authority of a share (before rights were chosen): this realm's computers and projects, and start, stop and
 * restart. Kept only as the reference "Start and stop" is measured against (equal to it, since projects.read is in the base).
 */
export const SHARE_PRESET: Tree = Object.freeze({
  computers: Object.freeze({
    read: true,
    actions: Object.freeze({ start: true, stop: true, restart: true }),
  }),
  projects: Object.freeze({ read: true }),
}) as unknown as Tree;

/** 12 characters of [a-z0-9] from crypto.getRandomValues; rejection sampling keeps them uniform. */
export function nonce(rand?: (n: number) => Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes =
    rand ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  let out = "";
  while (out.length < 12) {
    const b = bytes(16);
    for (let i = 0; i < b.length && out.length < 12; i++) {
      const v = b[i] as number;
      if (v < 252) out += alphabet.charAt(v % 36);
    }
  }
  return out;
}

export interface ShareBody {
  alias: string;
  permissions: Tree;
  realm_ids: string[];
  allow_no_realm: false;
  vault_access: false;
  event_access: false;
  deny_reauthorization: true;
  expires_at: string;
  ip_whitelist?: string[];
}

/** The furthest end date a share may take, in days (the API requires an end date for a share: never "never"). */
export const SHARE_MAX_DAYS = 365;
export const WHO_MAX = 40;
const WHO_RE = /^[a-zA-Z0-9 _-]*$/;

/** The full alias of a share: the page's prefix and nonce, then the optional name. */
export function shareAlias(base: string, who: string): string {
  const w = who.trim();
  return w ? `${base} ${w}` : base;
}

const WHO_OF = /^hoody share [a-z0-9]{12} (.+)$/;
/** The name a share was made for, from its alias; null when none. */
export function whoOf(alias: unknown): string | null {
  const m = typeof alias === "string" ? WHO_OF.exec(alias) : null;
  return m?.[1]?.trim() || null;
}

/** A future ISO date, else null. */
export function future(v: unknown, now: number): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT/.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) && ms > now ? new Date(ms).toISOString() : null;
}

/** Shared now: the shares made by this page's alias scheme that reach this realm, live or paused (a paused share can
 *  be resumed, so it is still shared), and not ended. Listing is not conformance: a share that reaches several
 *  realms, any realm, or no realm, or has no end, is listed too, with Stop only (shareConforms decides the rest). */
export function isShareRow(
  r: RawToken | null | undefined,
  realm: string,
  now: number,
): r is RawToken {
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.id === "string" &&
    typeof r.alias === "string" &&
    r.alias.startsWith(PREFIX) &&
    // An unreadable realm list or an empty one (every realm) reaches this realm too.
    (!Array.isArray(r.realm_ids) || r.realm_ids.length === 0 || r.realm_ids.includes(realm)) &&
    typeof r.is_enabled === "boolean" &&
    // Ended only by a past end; a share with no (readable) end is still live.
    !ended(r.expires_at, now)
  );
}

/** True only for an end that reads as a date at or before now. */
function ended(v: unknown, now: number): boolean {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t <= now;
}

export interface ShareListRow {
  id: string;
  made: string;
  ends: string | null;
  /** Made, but its text never reached this page: it can only be stopped. */
  lost: boolean;
  /** Who it was made for (Advanced), from its alias; null when none. */
  who: string | null;
  /** Paused: listed, and resumed only when it conforms. */
  paused: boolean;
  /** This page manages it (shareConforms): Edit details, Change what they can do, Pause and Resume. Otherwise Stop
   *  only. */
  conforms: boolean;
  /** It holds the sign-in minimum (core/token.ts minimumHeld). A share without it can't be opened at all (a share
   *  made before projects.read joined the base); it says so, and it can only be stopped and made again. */
  opens: boolean;
  /** What it can do, as the starting point its rights match (Custom otherwise); null when it does not conform. */
  can: ShareStart | null;
  /** The row as listed: what a details edit opens with. */
  raw: RawToken;
}

export function shareRows(
  rows: readonly RawToken[],
  realm: string,
  ledger: readonly LedgerEntry[],
  now: number,
): ShareListRow[] {
  return rows
    .filter((r) => isShareRow(r, realm, now))
    .map((r) => ({
      id: r.id,
      made: typeof r.created_at === "string" ? r.created_at : "",
      ends: future(r.expires_at, now),
      lost: ledger.some((x) => x.state === "lost" && x.id === r.id),
      who: whoOf(r.alias),
      paused: r.is_enabled === false,
      conforms: shareConforms(r, now),
      opens: minimumHeld(capsOf({ perms: (r.permissions ?? {}) as Record<string, unknown>, eventAccess: false, vaultAccess: false })),
      can: shareConforms(r, now) ? startOf(heldOffered(r) ?? []) : null,
      raw: r,
    }))
    .sort((a, b) => (a.made < b.made ? 1 : a.made > b.made ? -1 : 0));
}

/** The UTC date and time as "YYYY-MM-DD hh:mm UTC". */
export function utc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export interface TextParts {
  head: string;
  /** Where to open it; null when this Hub has no Hoody address to name (the line is left out). */
  how: string | null;
  realm: string;
  /** "They can: …", in the same words as the review. */
  can?: string;
  token: string;
  ends: string | null;
}

export function shareText(p: TextParts): string {
  const lines = [p.head, ...(p.how ? [p.how] : []), p.realm, ...(p.can ? [p.can] : []), p.token];
  if (p.ends) lines.push(p.ends);
  return lines.join("\n");
}

/** The sign-in link: the login page's shared-access sign-in with the token and the realm in the fragment,
 *  which browsers never send to a server. The login page clears the fragment before anything else runs, fills in the
 *  form and leaves the confirm to the person: opening the link signs no one in by itself. The realm goes in only when
 *  it is one realm's id. */
export function shareLink(origin: string, token: string, realm: string): string {
  const frag = new URLSearchParams({ token });
  if (/^[0-9a-f]{24}$/.test(realm)) frag.set("realm", realm);
  return `${origin}/auth/login?signin=token#${frag.toString()}`;
}

/** The prompt for an agent: who it is for, the realm's API URL, the token line (the token, or a placeholder
 *  when the person left it out), the end date. Words come from the page's strings. */
export interface PromptParts {
  head: string;
  /** "You can: …", in the same words as the review. */
  can?: string;
  api: string;
  auth: string;
  ends: string | null;
}

export function sharePrompt(p: PromptParts): string {
  const lines = [p.head, ...(p.can ? [p.can] : []), p.api, p.auth];
  if (p.ends) lines.push(p.ends);
  return lines.join("\n");
}

export interface Taken {
  token: string | null;
  id: string | null;
  expires: unknown;
}

/** The token, then the metadata kept: an id that could be (or hold) a token is no id, so no URL ever carries it. */
export function take(raw: unknown): Taken {
  const root =
    raw && typeof raw === "object" ? (raw as { data?: unknown }) : {};
  const d = (root.data && typeof root.data === "object" ? root.data : {}) as {
    token?: unknown;
    id?: unknown;
    expires_at?: unknown;
  };
  const tok = typeof d.token === "string" ? d.token : null;
  const id = d.id;
  return {
    token: tok && TOKEN_RE.test(tok) ? tok : null,
    id: typeof id === "string" && id && !id.includes("hdy_") ? id : null,
    expires: d.expires_at,
  };
}

/** A date more than one hour before the requested one is flagged: the server shortened it. */
export function shortened(expiresAt: string | null, asked: number): boolean {
  return !!expiresAt && Date.parse(expiresAt) < asked - HOUR;
}

// ── the alias ledger ───────────────────────────────────────────────────────────────────

export type LedgerState = "out" | "unknown" | "lost" | "made" | "none" | "gone";

export interface LedgerEntry {
  alias: string;
  state: LedgerState;
  id: string | null;
  /** Core's hold of this create (holdAttempt): while it is out or unknown, every tab sees it and none sends again. */
  hold?: string;
  /** Known only from core's hold (another tab sent it, or this one before a reload). */
  adopted?: true;
}

/** Core's sender name and lock for a share create in a realm (a realm id or "global"; never a secret). */
export const SHARE_BY = "keys";
export const shareLock = (realm: string): string => `keys.share.${realm}`;

export type LedgerStatus =
  | { state: "lostSecret"; id: string | null }
  | { state: "cantCheck" | "notSent" | "notFound" };

const any = (
  ledger: readonly LedgerEntry[],
  st: LedgerState,
): LedgerEntry | undefined => ledger.find((x) => x.state === st);

/** One create at a time: blocked while any mint is out or unresolved, or made with its text lost and not stopped. */
export function blocked(
  ledger: readonly LedgerEntry[],
  busy: boolean,
): boolean {
  return (
    busy ||
    !!(any(ledger, "out") || any(ledger, "unknown") || any(ledger, "lost"))
  );
}

export function status(ledger: readonly LedgerEntry[]): LedgerStatus {
  const lost = any(ledger, "lost");
  if (lost) return { state: "lostSecret", id: lost.id };
  if (any(ledger, "unknown")) return { state: "cantCheck" };
  if (any(ledger, "out")) return { state: "notSent" };
  return { state: "notFound" };
}

export function freshAlias(
  ledger: readonly LedgerEntry[],
  rand?: (n: number) => Uint8Array,
  who = "",
): string {
  // Unique as the full alias the ledger keeps (with who it is for), not only as its prefix and nonce.
  let a: string;
  do a = PREFIX + nonce(rand);
  while (ledger.some((x) => x.alias === shareAlias(a, who)));
  return a;
}

/**
 * A list read settles what it can prove about the ledger, and only what it could see: entries already unknown
 * or lost when it was sent and still so when it answers (`was` is the states at send time). A row with an
 * unresolved alias makes it lost (with that id); a complete list where a lost share's id is absent or expired makes it
 * gone (a paused share is still there: it can be resumed). A list WITHOUT an unresolved alias proves nothing, complete or not: the create may still
 * be in work on the server, and a create is no idempotent write (only the person's warned dismissUnknown() ends
 * it then). A truncated list settles no absence.
 */
export function settle(
  ledger: LedgerEntry[],
  was: readonly LedgerState[],
  rows: readonly RawToken[],
  truncated: boolean,
  now: number,
): void {
  ledger.forEach((x, i) => {
    if (x.state !== was[i]) return;
    // A lost share with no id is matched by its alias, and never concluded gone from an id it does not have.
    const byId = x.state === "lost" && x.id !== null;
    const row = rows.find(
      (r) => r && (byId ? r.id === x.id : r.alias === x.alias),
    );
    if (
      x.state === "lost" &&
      x.id === null &&
      row &&
      typeof row.id === "string"
    )
      x.id = row.id;
    if (x.state === "unknown") {
      if (row && typeof row.id === "string") {
        // The alias is a fresh nonce sent once: a row with it is this create. Core's hold is freed.
        x.state = "lost";
        x.id = row.id;
        if (x.hold) attemptFor(x.hold, SHARE_BY)?.release();
      }
    } else if (
      x.state === "lost" &&
      !truncated &&
      (x.id !== null || row !== undefined) &&
      // A paused row, or one with no end, is still there (as the list shows it): only a missing or ended row is gone.
      !(row && !ended(row.expires_at, now))
    )
      x.state = "gone";
  });
}

/** The unresolved creates a warned Dismiss would end, by their alias (a fresh nonce per create): taken when the
 *  warning opens, so its confirm ends only those. */
export function unknownAliases(ledger: readonly LedgerEntry[]): string[] {
  return ledger.filter((x) => x.state === "unknown").map((x) => x.alias);
}

/** The person's warned Dismiss: the unresolved creates it was shown (`shown`, from unknownAliases when the warning
 *  opened) are forgotten, so Create is offered again; one may still have been made (it is listed under Shared like
 *  any live share, where it can be stopped). A create that became unresolved after the warning opened is never
 *  ended by it. True when every shown create was still unresolved and has been ended; false when one moved meanwhile
 *  (settled, or freed by another tab), and the person is told so. */
export function dismissUnknown(
  ledger: LedgerEntry[],
  shown: readonly string[],
): boolean {
  const asked = new Set(shown);
  const ended = new Set<string>();
  for (const x of ledger) {
    if (x.state !== "unknown" || !asked.has(x.alias)) continue;
    if (x.hold) attemptFor(x.hold, SHARE_BY)?.dismiss(true);
    x.state = "none";
    ended.add(x.alias);
  }
  return [...asked].every((a) => ended.has(a));
}

/**
 * The ledger follows core's holds for its realm: a create another tab sent (or this one before a reload) joins as
 * unknown (out while its request is still out), and an unresolved create whose hold another tab freed (its Check
 * found it, or its warned Dismiss) leaves the unresolved states: that tab settled it.
 */
function syncHolds(ledger: LedgerEntry[], realm: string): void {
  let held: ReturnType<typeof heldAttempts>;
  try {
    held = heldAttempts(shareLock(realm)).filter((h) => h.by === SHARE_BY);
  } catch {
    return;
  }
  for (const h of held) {
    const alias = (h.meta as { alias?: unknown } | null)?.alias;
    if (typeof alias !== "string") continue;
    const x = ledger.find((e) => e.alias === alias);
    if (!x)
      ledger.push({
        alias,
        state: h.inFlight ? "out" : "unknown",
        id: null,
        hold: h.id,
        adopted: true,
      });
    else if (x.adopted && (x.state === "out" || x.state === "unknown"))
      x.state = h.inFlight ? "out" : "unknown";
  }
  for (const x of ledger)
    if (
      x.hold &&
      (x.state === "out" || x.state === "unknown") &&
      !held.some((h) => h.id === x.hold)
    )
      x.state = "none";
}

// One ledger per account and realm, dropped when the account changes. What blocks a second create lives in core
// (holdAttempt, synced in by ledgerFor): it survives a reload, every tab sees it and an account round trip keeps it.
const ledgers = new Map<string, LedgerEntry[]>();
let ledgerAccount: string | null | undefined;

export function ledgerFor(
  account: string | null,
  realm: string,
): LedgerEntry[] {
  if (ledgerAccount !== account) {
    ledgers.clear();
    ledgerAccount = account;
  }
  const k = `${account ?? ""}|${realm}`;
  let l = ledgers.get(k);
  if (!l) {
    l = [];
    ledgers.set(k, l);
  }
  syncHolds(l, realm);
  return l;
}

/** Tests only. */
export function resetLedgers(): void {
  ledgers.clear();
  ledgerAccount = undefined;
}

/**
 * The Shared access table's column layout. Stop is the row's one action, so it is the list row's status (line 1,
 * right): where the first column, Stop and one more cannot all fit, the table becomes the two-line list instead of
 * dropping Stop (at 390 px the table would shed Stop first, the rightmost priority-1 column). When a share ends is
 * never dropped or cut: Ends is priority 1, so it is the "one more" the list switch counts, and a
 * table too narrow for its whole date becomes the list. Across all realms the realm says which share it is: it is
 * line 1 of a list row (line 2 clips what does not fit) and priority 1 in the table, so a share is never shown for
 * stopping without its realm; Made (priority 2) and Can give way first. The switch counts Made (the first column),
 * Stop and Ends; once Made is dropped the table needs Ends, Realm and Stop, the same room only while Made's and
 * Realm's floors are equal (both the default 120; pinned by pages/keys/table.fit.test.tsx). A list row's line 2 is
 * one clipped line, so there it holds only when the share ends (Made and Ends together clip Ends at 320 px); Made
 * stays a table column. Ends carries its column name there (kit listLabel): a bare date on a phone does not say what
 * it is.
 */
export function shareColumns(bound: boolean) {
  const action = { width: "260px", priority: 1 as const, list: "status" as const };
  // What it can do is a table column only: never list meta, so it never hides Ends or Paused on a phone.
  const can = { priority: 3 as const, list: false as const };
  return bound
    ? {
        made: { priority: 1 as const, list: "primary" as const },
        ends: { priority: 1 as const, list: "meta" as const, listLabel: true },
        can,
        action,
      }
    : {
        made: { priority: 2 as const, list: false as const },
        ends: { priority: 1 as const, list: "meta" as const, listLabel: true },
        realm: { priority: 1 as const, list: "primary" as const },
        can,
        action,
      };
}

// ── the rights a share holds ─────────────────────────
//
// Three reviewed literals decide what a share can ever hold: SHARE_BASE (always), SHARE_OFFER (what a person may
// tick) and SHARE_NEVER (what no share holds, with the reason shown once). The server catalogue only narrows the
// offer; a new server right shows nowhere until a person adds it here. effectiveRights() is the one selection the
// picker, the review, the share text and the body all read, so what is shown is what is sent.

/** What a right's consequence is, shown as tags beside its line. */
export type ShareTag = "money" | "undo" | "secrets" | "outlast" | "account";
export type ShareArea = "computers" | "inside" | "features" | "projects" | "network";

export interface OfferedRight {
  right: string;
  area: ShareArea;
  /** Rights it cannot work without, ticked with it (the server checks them too, or the page needs them to be usable). */
  needs: readonly string[];
  tags: readonly ShareTag[];
}

/**
 * Every share can see this realm's computers and projects; shown ticked and locked. Both are the sign-in minimum:
 * the API's token sign-in page refuses a key without them (public/auth/token-login.js MIN_LEAVES) and a
 * session without them is invalid (core/token.ts minimumHeld), so a share without either could never be opened.
 */
export const SHARE_BASE: readonly string[] = Object.freeze(["computers.read", "projects.read"]);
const BASE_AREA: Readonly<Record<string, ShareArea>> = Object.freeze({ "computers.read": "computers", "projects.read": "projects" });
/** Until the API change that keeps a realm-limited key to its own projects is in place,
 *  projects.read also shows account-wide invitations and members. */
const BASE_TAGS: Readonly<Record<string, readonly ShareTag[]>> = Object.freeze({ "projects.read": Object.freeze(["account"] as ShareTag[]) });

const offer = (area: ShareArea, right: string, needs: string[] = [], tags: ShareTag[] = []): OfferedRight =>
  Object.freeze({ right, area, needs: Object.freeze(needs), tags: Object.freeze(tags) });

/**
 * What a person may add, in the order the page shows it. Each line was checked against the server for a key held to
 * one realm: computers.actions.exec gates the workspace claim, which is full access with a
 * shell; projects.delete refuses when anything it would remove is outside the
 * realm. The project rights need projects.read (a project can't be
 * picked unseen): the base always holds it, and a catalogue without it still offers none of them.
 */
export const SHARE_OFFER: readonly OfferedRight[] = Object.freeze([
  offer("computers", "computers.actions.start"),
  offer("computers", "computers.actions.stop"),
  offer("computers", "computers.actions.restart"),
  offer("computers", "computers.actions.logs", [], ["secrets"]),
  offer("computers", "computers.update"),
  offer("computers", "computers.create", [], ["money"]),
  offer("computers", "computers.delete", [], ["undo"]),
  offer("inside", "computers.actions.exec", [], ["secrets", "outlast"]),
  offer("inside", "resources.ssh_keys", ["computers.update"], ["secrets", "outlast"]),
  offer("inside", "computers.features.env_values", [], ["secrets"]),
  offer("features", "computers.features.snapshots", ["computers.update"], ["undo"]),
  offer("features", "computers.features.networking", ["computers.update"]),
  offer("features", "computers.features.kvm", ["computers.update"]),
  offer("features", "computers.features.ai", ["computers.update"], ["money"]),
  offer("features", "computers.features.hoody_kit", ["computers.create"], ["money"]),
  offer("projects", "projects.create", ["projects.read"]),
  offer("projects", "projects.update", ["projects.read"]),
  offer("projects", "projects.delete", ["projects.read"], ["undo"]),
  offer("network", "resources.firewalls"),
  offer("network", "resources.proxy_aliases", [], ["secrets", "outlast"]),
  offer("network", "resources.storage_shares", [], ["outlast"]),
  offer("network", "resources.bot_urls", [], ["outlast"]),
]);

export type NeverReason = "staff" | "keys" | "history" | "account" | "realms" | "members" | "money";

/** What no share holds: a right here, or anything under it. */
export const SHARE_NEVER: readonly { right: string; reason: NeverReason }[] = Object.freeze(
  (
    [
      ["admin", "staff"],
      ["resources.create_tokens", "keys"],
      ["resources.vault", "keys"],
      ["vault_access", "keys"],
      ["resources.events", "history"],
      ["event_access", "history"],
      ["resources.read_account", "account"],
      ["resources.realms", "realms"],
      ["resources.auth_token_public_profile", "realms"],
      ["projects.members", "members"],
      ["financial", "money"],
    ] as const
  ).map(([right, reason]) => Object.freeze({ right, reason })),
);

/** Why no share holds a right (it or a parent is in SHARE_NEVER), else null. */
export function neverReason(right: string): NeverReason | null {
  return SHARE_NEVER.find((n) => right === n.right || right.startsWith(`${n.right}.`))?.reason ?? null;
}

const OFFER_BY = new Map(SHARE_OFFER.map((o) => [o.right, o]));
/** The area a base or offered right is shown under; undefined for any other right. */
export const areaOf = (right: string): ShareArea | undefined => BASE_AREA[right] ?? OFFER_BY.get(right)?.area;
/** The tags of a base or offered right; none for any other right. */
export const tagsOf = (right: string): readonly ShareTag[] => BASE_TAGS[right] ?? OFFER_BY.get(right)?.tags ?? [];
const ORDER = [...SHARE_BASE, ...SHARE_OFFER.map((o) => o.right)];
const inOrder = (set: ReadonlySet<string>): string[] => ORDER.filter((r) => set.has(r));

export type ShareStart = "see" | "act" | "work" | "all" | "custom";
/** The starting points: literals, usable even when the catalogue failed to load. */
export const SHARE_STARTS: Readonly<Record<Exclude<ShareStart, "custom">, readonly string[]>> = Object.freeze({
  see: Object.freeze([]),
  act: Object.freeze(["computers.actions.start", "computers.actions.stop", "computers.actions.restart"]),
  work: Object.freeze([
    "computers.actions.start",
    "computers.actions.stop",
    "computers.actions.restart",
    "computers.actions.logs",
    "computers.update",
    "computers.actions.exec",
    "computers.features.snapshots",
  ]),
  /** All permissions: the base and every offered right, for the one realm. Never in START_RIGHTS. */
  all: Object.freeze(SHARE_OFFER.map((o) => o.right)),
});
/** The rights offered without a catalogue: the reviewed literals of See only, Start and stop and Work on computers.
 *  "all" stays out, so a failed catalogue read never offers every right (it greys out instead). */
const START_RIGHTS = new Set([...SHARE_STARTS.see, ...SHARE_STARTS.act, ...SHARE_STARTS.work]);
const OFFER_CAT: Catalogue = { rights: [...SHARE_BASE, ...SHARE_OFFER.map((o) => o.right)], full: null, billing: false, templates: [] };

/** Every right a share's (transitive) prerequisites. */
function needsOf(right: string, seen = new Set<string>()): Set<string> {
  for (const n of OFFER_BY.get(right)?.needs ?? [])
    if (!seen.has(n)) {
      seen.add(n);
      needsOf(n, seen);
    }
  return seen;
}

/**
 * The rights a person may tick now: offered, in the catalogue, and with every prerequisite in it too. Without a
 * catalogue (it failed to load) only the starting points' rights, which are reviewed literals.
 */
export function availableRights(cat: Catalogue | null): string[] {
  const inCat = (r: string) => (cat ? cat.rights.includes(r) : START_RIGHTS.has(r));
  return SHARE_OFFER.map((o) => o.right).filter((r) => inCat(r) && [...needsOf(r)].every(inCat));
}

/**
 * The one selection: the base, plus each ticked right that is available, plus what those need. A ticked right whose
 * prerequisite is unavailable is dropped, never kept by adding the prerequisite back. In the page's order.
 */
export function effectiveRights(ticked: readonly string[], cat: Catalogue | null): string[] {
  const avail = new Set(availableRights(cat));
  const out = new Set<string>(SHARE_BASE);
  for (const r of ticked)
    if (avail.has(r)) {
      out.add(r);
      for (const n of needsOf(r)) out.add(n);
    }
  return inOrder(out);
}

/**
 * The ticks after a person ticks or unticks one right: ticking adds what it needs; unticking also drops whatever
 * needs it. The base is never ticked or unticked, and an unavailable right is never added.
 */
export function toggleRight(ticked: readonly string[], right: string, on: boolean, cat: Catalogue | null): string[] {
  const set = new Set(ticked.filter((r) => OFFER_BY.has(r)));
  if (!OFFER_BY.has(right)) return inOrder(set);
  if (on) {
    if (!availableRights(cat).includes(right)) return inOrder(set);
    set.add(right);
    for (const n of needsOf(right)) if (OFFER_BY.has(n)) set.add(n);
  } else {
    set.delete(right);
    for (const r of [...set]) if (needsOf(r).has(right)) set.delete(r);
  }
  return inOrder(set);
}

/** Which starting point a selection is exactly (closed over every offered right), else custom. */
export function startOf(ticked: readonly string[]): ShareStart {
  const have = new Set(effectiveRights(ticked, OFFER_CAT));
  for (const [k, v] of Object.entries(SHARE_STARTS) as [Exclude<ShareStart, "custom">, readonly string[]][]) {
    const want = new Set([...SHARE_BASE, ...v]);
    if (want.size === have.size && [...want].every((r) => have.has(r))) return k;
  }
  return "custom";
}

/** A tree of the given dotted paths, all true. */
function treeOfPaths(paths: readonly string[]): Tree {
  const root: Tree = {};
  for (const p of paths) {
    const parts = p.split(".");
    let node = root;
    parts.forEach((k, i) => {
      if (i === parts.length - 1) node[k] = true;
      else node = (node[k] = (node[k] as Tree | undefined) ?? {}) as Tree;
    });
  }
  return root;
}

/** A share's limits: the end (a day count, or an instant picked in the viewer's time), addresses, who it is for. */
export interface ShareLimits {
  /** 1, 7 or 30 days from now; null: the picked instant `at`. */
  days: Days | null;
  /** Epoch ms from the date-and-time field (the viewer's local time); null while empty or invalid. */
  at: number | null;
  ips: string;
  who: string;
}
export type ShareLimitProblem = "date" | "timePast" | "dateFar" | "ips" | "ipsMany" | "ipsNone" | "who";

/** The end every share date obeys, for create, details edits and conformance alike. */
const endProblem = (at: number | null, now: number): ShareLimitProblem | null =>
  at === null || !Number.isFinite(at) ? "date" : at <= now ? "timePast" : at > now + SHARE_MAX_DAYS * DAY ? "dateFar" : null;

const ipsProblem = (ips: string): ShareLimitProblem | null => {
  const list = parseAllowlist(ips);
  if (list.errors.length) return "ips";
  // Every entry is fine but there are more than the Hub takes: its own words, not "use IPv4 addresses".
  if (list.tooMany) return "ipsMany";
  // Text with no address in it (only commas) would send no list, so the share would work from anywhere.
  return ips.trim() && !list.entries.length ? "ipsNone" : null;
};

const whoOk = (who: string) => who.trim().length <= WHO_MAX && WHO_RE.test(who.trim());

/** Whole seconds: the read-back compares the end exactly, and no database cuts a whole second. Every check reads
 *  this cut instant, the one that is sent, so an end less than a second away is never sent as now. */
const wholeSeconds = (ms: number) => Math.floor(ms / 1000) * 1000;

const endOf = (l: ShareLimits, now: number): number | null => {
  const ms = l.days === null ? l.at : (DAYS as readonly number[]).includes(l.days) ? now + l.days * DAY : null;
  return ms === null || !Number.isFinite(ms) ? null : wholeSeconds(ms);
};

/** The first problem per limit; an empty object means every limit can be sent. */
export function shareLimitsProblems(l: ShareLimits, now: number): Partial<Record<"ends" | "ips" | "who", ShareLimitProblem>> {
  const out: Partial<Record<"ends" | "ips" | "who", ShareLimitProblem>> = {};
  const end = endProblem(endOf(l, now), now);
  if (end) out.ends = end;
  const ips = ipsProblem(l.ips);
  if (ips) out.ips = ips;
  if (!whoOk(l.who)) out.who = "who";
  return out;
}

/**
 * The create body: exactly the effective rights for one realm, the fixed flags, the end and the address list. null
 * when a limit has a problem: nothing is sent. It takes the catalogue so it cannot be built around effectiveRights.
 */
export function shareBodyV3(
  alias: string,
  realm: string,
  ticked: readonly string[],
  cat: Catalogue | null,
  limits: ShareLimits,
  now: number,
): ShareBody | null {
  if (Object.keys(shareLimitsProblems(limits, now)).length) return null;
  const end = endOf(limits, now) as number;
  const body: ShareBody = {
    alias,
    permissions: treeOfPaths(effectiveRights(ticked, cat)),
    realm_ids: [realm],
    allow_no_realm: false,
    vault_access: false,
    event_access: false,
    deny_reauthorization: true,
    expires_at: new Date(end).toISOString(),
  };
  const ips = parseAllowlist(limits.ips).entries;
  if (ips.length) body.ip_whitelist = ips;
  return body;
}

/** Every leaf of a stored tree as [path, value]; null when any value is not a boolean or a tree. */
function readLeaves(tree: unknown, prefix = "", out: Array<[string, boolean]> = []): Array<[string, boolean]> | null {
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) return null;
  for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "boolean") out.push([p, v]);
    else if (!readLeaves(v, p, out)) return null;
  }
  return out;
}

/** The offered rights a stored share holds (the base left out), or null when its permissions can't be read. */
export function heldOffered(r: RawToken): string[] | null {
  const all = readLeaves(r.permissions);
  return all ? inOrder(new Set(all.filter(([p, v]) => v && OFFER_BY.has(p)).map(([p]) => p))) : null;
}

/**
 * A stored share this page can manage: made by its alias scheme, readable rights that are all base or offered with
 * the base held and every prerequisite held, exactly one realm, no base-domain use, no vault or events, and a real
 * end in the future no further than create allows. Anything missing or else fails; such a row can only be stopped.
 */
export function shareConforms(r: RawToken | null | undefined, now: number): boolean {
  if (!r || typeof r !== "object" || typeof r.id !== "string") return false;
  if (typeof r.alias !== "string" || !/^hoody share [a-z0-9]{12}( |$)/.test(r.alias)) return false;
  const all = readLeaves(r.permissions);
  if (!all) return false;
  const held = new Set(all.filter(([, v]) => v).map(([p]) => p));
  if (!SHARE_BASE.every((b) => held.has(b))) return false;
  for (const p of held) {
    if (!SHARE_BASE.includes(p) && !OFFER_BY.has(p)) return false;
    for (const n of needsOf(p)) if (!held.has(n)) return false;
  }
  if (!Array.isArray(r.realm_ids) || r.realm_ids.length !== 1 || !SHARE_RE.test(String(r.realm_ids[0]))) return false;
  if (r.allow_no_realm !== false || r.vault_access !== false || r.event_access !== false) return false;
  if (r.ip_whitelist !== undefined && r.ip_whitelist !== null)
    if (!Array.isArray(r.ip_whitelist) || !r.ip_whitelist.every((x) => typeof x === "string")) return false;
  if (typeof r.expires_at !== "string" || !/^\d{4}-\d\d-\d\dT/.test(r.expires_at)) return false;
  return endProblem(Date.parse(r.expires_at), now) === null;
}

export type CantLine = "act" | "delete" | "secrets" | "money" | "never" | "keyEnds";

/**
 * "They can't", from the consequences of the effective set, never a promise it breaks: each line only when no held
 * right does that thing. Then always the Never sentence and the fixed sentence that the key stops working when the
 * share ends or is stopped while saved program addresses may keep working (never a line about keeping access).
 */
export function cantList(effective: readonly string[]): CantLine[] {
  const held = effective.filter((r) => OFFER_BY.has(r));
  const tagged = (t: ShareTag) => held.some((r) => tagsOf(r).includes(t));
  const out: CantLine[] = [];
  if (!held.length) out.push("act");
  if (!held.includes("computers.delete") && !held.includes("projects.delete")) out.push("delete");
  if (!tagged("secrets")) out.push("secrets");
  if (!tagged("money")) out.push("money");
  out.push("never", "keyEnds");
  return out;
}

/** A replacement share's starting form (Change what they can do): the old share's offered rights, its end while
 *  that end is still one a share may have, its addresses and who it is for. */
export function replaceStart(r: RawToken, now = Date.now()): { ticked: string[]; at: number | null; ips: string; who: string } {
  const end = typeof r.expires_at === "string" ? wholeSeconds(Date.parse(r.expires_at)) : NaN;
  const ips = Array.isArray(r.ip_whitelist) ? r.ip_whitelist.filter((x) => typeof x === "string" && x !== "*") : [];
  return {
    ticked: heldOffered(r) ?? [],
    at: Number.isFinite(end) && endProblem(end, now) === null ? end : null,
    ips: ips.join(", "),
    who: whoOf(r.alias) ?? "",
  };
}

/** What a replacement share adds and leaves out, in the page's order. */
export function rightsDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const a = new Set(after);
  const b = new Set(before);
  return { added: inOrder(new Set(after.filter((r) => !b.has(r)))), removed: inOrder(new Set(before.filter((r) => !a.has(r)))) };
}

/** Two address lists as the server checks them: a bare address is its /32, and "*" or none lets every address in. */
function sameAddresses(a: unknown, b: readonly string[]): boolean {
  const norm = (x: unknown) => {
    const l = (Array.isArray(x) ? x : []).map((v) => String(v).trim()).filter(Boolean);
    return l.includes("*") ? [] : [...new Set(l.map((v) => (v.includes("/") ? v : `${v}/32`)))].sort();
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export type ShareField = "who" | "ends" | "ips";
export interface ShareFieldBody {
  alias?: string;
  expires_at?: string;
  ip_whitelist?: string[];
}

/**
 * A details edit sends one field, changed and valid, and nothing else: never the rights, the realm, a flag or a
 * cleared end. The name keeps the alias's prefix and nonce. No change or a problem: null, nothing is sent.
 */
export function shareFieldEditBody(
  field: ShareField,
  before: RawToken,
  after: { who?: string; at?: number | null; ips?: string },
  now: number,
): ShareFieldBody | null {
  if (field === "who") {
    const m = typeof before.alias === "string" ? /^(hoody share [a-z0-9]{12})( .*)?$/.exec(before.alias) : null;
    const who = (after.who ?? "").trim();
    if (!m?.[1] || !whoOk(who)) return null;
    const alias = shareAlias(m[1], who);
    return alias === before.alias ? null : { alias };
  }
  if (field === "ends") {
    const at = after.at ?? null;
    const cut = at === null || !Number.isFinite(at) ? null : wholeSeconds(at);
    if (endProblem(cut, now)) return null;
    const iso = new Date(cut as number).toISOString();
    return typeof before.expires_at === "string" && Date.parse(before.expires_at) === Date.parse(iso) ? null : { expires_at: iso };
  }
  const ips = after.ips ?? "";
  if (ipsProblem(ips)) return null;
  const list = parseAllowlist(ips).entries;
  const sent = list.length ? list : ["*"];
  return sameAddresses(before.ip_whitelist, sent) ? null : { ip_whitelist: sent };
}
