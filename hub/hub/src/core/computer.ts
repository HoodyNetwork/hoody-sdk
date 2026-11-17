// computer.ts: the current computer, the one the top bar shows and every computer-scoped page acts on.
//
// Contract, in plain words:
//   - The choice is this browser's, per account: the id is remembered under hub_active_computer:<account>
//     (removed at sign-out). Choosing sends nothing, so there is no request outcome: it moves the core target
//     (setTarget; queries keyed by the computer read again) and remembers the id. chooseComputer answers false
//     when the browser refused to remember it (the choice still holds for this page).
//   - chooseNoComputer(): the person chose none. It clears the target and remembers the choice as NO_COMPUTER
//     ('*', never a computer id), so no list answer picks one for them until they choose a computer again.
//   - computerChoiceRev(): moves on every choice a person makes (chooseComputer without `auto`, chooseNoComputer),
//     never on the shell's own picks ({ auto: true }) or a drop. A flow that acts later for the person (a new
//     computer selected once its create is proved) captures it at the press and acts only while it is unchanged,
//     so a person's pick in between (X, then All computers, ending where it started) always wins.
//   - noComputerChosen(): the remembered choice is NO_COMPUTER (the person chose All computers).
//   - dropComputer(): a target the selected realm's list does not hold is dropped, not forgotten. It clears the
//     target and keeps the remembered choice, so the next list answer picks again (the remembered computer when
//     that list holds it). No bump, no notice: the target change alone re-keys computer-scoped reads.
//   - pickComputer(list): the one pick rule, applied at every list answer before a view reads it. The list is
//     the selected realm's rows (filterRows). The remembered computer while the list still has it, even stopped;
//     else the first running one; else the first starting one (a new account's first computer); else the first
//     that needs attention (failed), so its owner lands on "did not start" with Retry. Stopped and paused
//     computers are never picked on their own: with nothing else the answer is null ("Pick a computer").
//     A remembered NO_COMPUTER answers null whatever the list holds.
//   - useCurrentComputer(): the core target (null when none).
//   - noteComputerRows(account, rows): a current, successful read of the account's computers (the shell's list). Its rows
//     are the routing evidence (routing.ts), and the current target follows its own row's routing node: a row naming
//     another server moves the target to it, a row withholding it leaves the target with no server (no address, nothing
//     sent), a row naming it again gives it back. No choice moves (computerChoiceRev, the remembered id) and nothing else
//     of the target changes; a read that does not hold the target's row changes nothing.
//   - containerRowOf(raw, realms): one computer as every list of computers shows it
//     (ContainerTable), or null when raw is not a computer row (no non-empty string id and name). Only it builds a
//     ContainerRowView (a brand on the type), so a list cannot show a hand-made row. It shows only what the answer
//     carries: anything it cannot prove is 'unknown' (state, realms, image, region) or absent (color, project, sshHost,
//     createdAt). A missing or non-string status is 'unknown', never 'stopped'. realm_ids absent or not a list of realm
//     ids is 'unknown'; [] is proven none. A realm's name and colour come from core's realm list when it holds the
//     realm, else its short id and the default colour (the realm list itself may still be loading: null). createdAt
//     is kept only for an ISO 8601 date-time whose calendar fields are real (2026-02-30 is absent, never March 2).
//     Field names are the published ones: the image is computer_image (read by imageWords; there is no `image` on
//     the wire) and the project is project_alias (null when the project is outside the realm: absent here).
//   - imageWords(raw): an image name as people read it. A known distribution (debian, ubuntu, alpine, fedora, rocky,
//     alma, arch, centos; image-server spellings such as rockylinux, almalinux, archlinux, centos-stream, an `images:` remote
//     prefix, and the API's `debian-13` shorthand) with a numeric version (13, 24.04, 3.20) reads "Debian 13"; a bare
//     name reads "Debian". Anything else, a known name with a part that is not such a version included (a codename,
//     a custom alias such as `debian-13backup` or `debian/13/custom-x`), is the raw string with no distro: the
//     distro is named, and its mark shown, only when the whole name is proved. Not a non-empty string = undefined
//     (not known). `raw` is always the string as given, for a tooltip.
import { snapshot, subscribe, setTarget, type Target } from './ctx';
import { routingNode } from './hosts';
import { noteRoutingRows } from './routing';
import { localSetting } from './prefs';
import { displayName, filterRows, tint } from './realm';
import { isRealmId } from './realm-id';
import type { RealmRow } from './realms';
import { defineRoute } from './routes';
import { useSyncExternalStore } from 'react';

export interface ComputerRow {
  readonly id: string;
  readonly project_id?: string;
  readonly status?: unknown;
  readonly server_name?: string;
  readonly realm_ids?: readonly string[];
}

export type ComputerState = 'running' | 'stopped' | 'starting' | 'attention';

/** How a computer is addressed in a URL and a link: its name and the last four characters of its id, never the
 *  full id (the Computers page's handle; Home, Guide and Bots link with it). */
export function computerHandle(c: { id: string; name: string }): string {
  return `${c.name}.${c.id.slice(-4)}`;
}

/** Where a computer's page is in the Hub, by its handle (name.last4): the one builder, so kit parts and pages/computers/links.ts agree. */
export const computerHref = (handle: string): string => `/computers?sel=${encodeURIComponent(handle)}`;

/** A computer's status in four buckets (paused counts as stopped). */
export function computerState(s: unknown): ComputerState {
  const v = String(s || '').toLowerCase();
  if (v === 'running') return 'running';
  if (v === 'stopped' || v === 'paused') return 'stopped';
  return /^(starting|creating|provisioning|restarting|pending)$/.test(v) ? 'starting' : 'attention';
}

let remembered: ReturnType<typeof localSetting> | null = null;
function slot() { return remembered || (remembered = localSetting('hub_active_computer:{uid}', { account: true })); }

/** What chooseNoComputer remembers: never a computer id (ids are not '*'). */
const NO_COMPUTER = '*';

/** The remembered computer id of the shown account, or null (none remembered, or none chosen). */
export function rememberedComputerId(): string | null {
  const v = slot().get();
  return v === NO_COMPUTER ? null : v;
}

/** One realm a computer is in, as a list shows it: its name (alias, else short id) and colour. */
export interface RealmRef { readonly id: string; readonly name: string; readonly color?: string }
declare const containerRowBrand: unique symbol;
/** One computer as a list shows it; built only by containerRowOf (see the contract). The full id is never shown:
 *  handle is computerHandle(), and the id is for IdChip and routing only. */
export type ContainerRowView = {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly color?: string;
  /** Every realm the computer is in; [] = proven none. */
  readonly realms: readonly RealmRef[] | 'unknown';
  readonly state: ComputerState | 'unknown';
  /** The image as people read it (imageWords): words, and the distro when one is known. */
  readonly image?: { readonly label: string; readonly distro?: DistroId } | 'unknown';
  /** flag: ISO country code. */
  readonly region?: { readonly flag?: string; readonly city?: string; readonly server?: string } | 'unknown';
  readonly project?: string;
  readonly sshHost?: string;
  /** created_at, as epoch milliseconds. */
  readonly createdAt?: number;
  readonly [containerRowBrand]: true;
};

/** The distributions core names; each has a kit mark of the same name (kit/icons.tsx DISTRO). */
export type DistroId = 'debian' | 'ubuntu' | 'alpine' | 'fedora' | 'rocky' | 'alma' | 'arch' | 'centos';
export interface ImageWords {
  readonly label: string;
  readonly distro?: DistroId;
  /** The image string as the answer gave it. */
  readonly raw: string;
}

const DISTROS: Readonly<Record<string, readonly [DistroId, string]>> = Object.freeze(Object.assign(Object.create(null) as Record<string, readonly [DistroId, string]>, {
  debian: ['debian', 'Debian'], ubuntu: ['ubuntu', 'Ubuntu'], alpine: ['alpine', 'Alpine'], alpinelinux: ['alpine', 'Alpine'],
  fedora: ['fedora', 'Fedora'], rocky: ['rocky', 'Rocky Linux'], rockylinux: ['rocky', 'Rocky Linux'], alma: ['alma', 'AlmaLinux'],
  almalinux: ['alma', 'AlmaLinux'], arch: ['arch', 'Arch Linux'], archlinux: ['arch', 'Arch Linux'], centos: ['centos', 'CentOS'],
  'centos-stream': ['centos', 'CentOS Stream'],
}));
// A version: one to three dot-separated numbers (13, 24.04, 3.20, 41). An image variant after it (default, cloud) is
// not part of the name people read; any other third part leaves the name unproved.
const VERSION = /^\d{1,4}(?:\.\d{1,4}){0,2}$/;
const VARIANT = new Set(['default', 'cloud']);

/** An image name as people read it, or undefined when raw is not a non-empty string (see the contract). */
export function imageWords(raw: unknown): ImageWords | undefined {
  if (typeof raw !== 'string') return undefined;
  const given = raw.trim();
  if (given === '') return undefined;
  const name = given.toLowerCase().replace(/^images:/, '');
  let parts = name.split('/');
  if (parts.length === 1) {
    // The API's own shorthand: `debian-13` is debian/13. A name that is itself a key (centos-stream) is not split.
    const m = /^([a-z]+)-(\d.*)$/.exec(name);
    if (m && !(name in DISTROS)) parts = [m[1]!, m[2]!];
  }
  const hit = DISTROS[parts[0]!];
  if (hit) {
    const [distro, word] = hit;
    const [, version, variant, ...rest] = parts;
    if (parts.length === 1) return Object.freeze({ label: word, distro, raw });
    if (version !== undefined && VERSION.test(version) && rest.length === 0 && (variant === undefined || VARIANT.has(variant))) {
      return Object.freeze({ label: `${word} ${version}`, distro, raw });
    }
  }
  return Object.freeze({ label: given, raw });
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

// Date.parse rolls an impossible calendar date over (2026-02-30 reads as March 2), so the fields are checked first.
const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function isoTime(v: unknown): number | undefined {
  const m = typeof v === 'string' ? ISO_TIME.exec(v) : null;
  if (!m) return undefined;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((x) => Number(x ?? '0')) as [number, number, number, number, number, number];
  const u = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  if (u.getUTCFullYear() !== y || u.getUTCMonth() !== mo - 1 || u.getUTCDate() !== d || u.getUTCHours() !== h || u.getUTCMinutes() !== mi || u.getUTCSeconds() !== sec) return undefined;
  const t = Date.parse(v as string);
  return Number.isFinite(t) ? t : undefined;
}

function realmRefs(ids: unknown, realms: readonly RealmRow[] | null): readonly RealmRef[] | 'unknown' {
  if (!Array.isArray(ids)) return 'unknown';
  // Indexed, not every(): every() skips the holes of a sparse array.
  for (let i = 0; i < ids.length; i++) if (!isRealmId(ids[i])) return 'unknown';
  return Object.freeze([...new Set(ids as string[])].map((id): RealmRef => {
    const row = realms?.find((r) => r.id === id);
    const n = row ? row.name : displayName(id);
    const name = 'text' in n ? n.text : id.slice(-4);
    const color = (row ? row.tint : tint(id)) || undefined;
    return Object.freeze(color ? { id, name, color } : { id, name });
  }));
}

function imageOf(v: unknown): ContainerRowView['image'] {
  const w = imageWords(v);
  if (!w) return 'unknown';
  return Object.freeze(w.distro ? { label: w.label, distro: w.distro } : { label: w.label });
}

/** One computer as a list shows it, or null when raw is not a computer row (see the contract). */
export function containerRowOf(raw: unknown, realms: readonly RealmRow[] | null): ContainerRowView | null {
  const r = rec(raw);
  const id = str(r?.id), name = str(r?.name);
  if (!r || !id || !name) return null;
  const server = rec(r.server);
  const city = str(server?.city), flag = str(server?.country), host = str(server?.name) ?? str(r.server_name);
  const created = isoTime(r.created_at);
  const out: Record<string, unknown> = {
    id, name, handle: computerHandle({ id, name }),
    realms: realmRefs(r.realm_ids, realms),
    state: typeof r.status === 'string' && r.status !== '' ? computerState(r.status) : 'unknown',
    image: imageOf(r.computer_image),
    region: city || flag || host ? Object.freeze({ ...(flag ? { flag } : {}), ...(city ? { city } : {}), ...(host ? { server: host } : {}) }) : 'unknown',
  };
  const color = str(r.color), project = str(r.project_alias), ssh = str(r.ssh_hostname);
  if (color) out.color = color;
  if (project) out.project = project;
  if (ssh) out.sshHost = ssh;
  if (created !== undefined) out.createdAt = created;
  return Object.freeze(out) as unknown as ContainerRowView;
}

const DEFAULT_ORDER: readonly ComputerState[] = ['running', 'starting', 'attention'];

/** The computer to show from a list answer (see the contract), or null. */
export function pickComputer<T extends ComputerRow>(rows: readonly T[], o: { realm?: string; remembered?: string | null } = {}): T | null {
  const list = o.realm === undefined ? filterRows(rows) : filterRows(rows, o.realm);
  const want = o.remembered === undefined ? slot().get() : o.remembered;
  if (want === NO_COMPUTER) return null;
  if (want) { const hit = list.find((c) => c.id === want); if (hit) return hit; }
  for (const k of DEFAULT_ORDER) { const first = list.find((c) => computerState(c.status) === k); if (first) return first; }
  return null;
}

// The person's choices so far (see the contract): a module counter, never stored.
let choiceRev = 0;
/** Moves on every choice a person makes (see the contract). */
export function computerChoiceRev(): number { return choiceRev; }
/** The person chose no computer (All computers) and core remembers it. */
export function noComputerChosen(): boolean { return slot().get() === NO_COMPUTER; }

/** Shows this computer everywhere and remembers it (see the contract). `auto`: a pick core or the shell made, not the
 *  person's (computerChoiceRev does not move). */
export function chooseComputer(c: ComputerRow, o?: { auto?: true }): boolean {
  if (!c || typeof c.id !== 'string' || !c.id) return false;
  if (!o?.auto) choiceRev += 1;
  const t: Target = { project: { id: String(c.project_id ?? '') }, container: c.server_name !== undefined ? { id: c.id, server_name: c.server_name } : { id: c.id } };
  setTarget(t);
  return slot().set(c.id);
}

/** Shows no computer and remembers that choice (see the contract). False when the browser refused to remember it
 *  (the choice still holds for this page). */
export function chooseNoComputer(): boolean {
  choiceRev += 1;
  setTarget(null);
  return slot().set(NO_COMPUTER);
}

/** Clears the target and keeps the remembered choice (see the contract). */
export function dropComputer(): void {
  setTarget(null);
}

/** A current, successful read of `account`'s computers (see the contract). */
export function noteComputerRows(account: string | null | undefined, rows: readonly unknown[]): void {
  if (!account) return;
  noteRoutingRows(account, rows);
  const s = snapshot();
  const t = s.target;
  if (!t || s.account !== account) return;
  const row = rows.find((r): r is { id: string; server_name?: unknown } => !!r && typeof r === 'object' && (r as { id?: unknown }).id === t.container.id);
  if (!row) return;
  const node = routingNode(row);
  if (node === (t.container.server_name ?? '')) return;
  setTarget({ project: { id: t.project.id }, container: node ? { id: t.container.id, server_name: node } : { id: t.container.id } });
}

const targetOf = () => snapshot().target;
/** The computer every computer-scoped page acts on, or null. */
export function useCurrentComputer(): Target | null {
  return useSyncExternalStore(subscribe, targetOf, targetOf);
}

/** The remembered computer forgotten (session disposal, dispose.ts; tests). */
export function resetComputer(): void { remembered = null; }

/** GET /computers under the selected realm: the top bar's and pages' computer list (core's fixtures answer it from fixtureWorld)
 *  and setup's expired/deleting check. One route object per endpoint: fixture rules match by route object. */
export const containersRoute = defineRoute<{ data?: { computers?: unknown[] } }>({ method: 'GET', path: '/computers', scope: 'realm', query: ['page', 'limit', 'include_expired', 'include_deleting'] });
