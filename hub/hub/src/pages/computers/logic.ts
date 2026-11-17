// Pure rules of the computers page: states and
// their allowed actions, the access padlock, id masking, handles for the URL, listeners and
// server rows. No React, no I/O.
import { formatPercent, formatStorage } from '@kit';
import type { Computer, Project, Server, Usage } from './types';

export type Bucket = 'running' | 'stopped' | 'paused' | 'failed' | 'starting' | 'gone' | 'reinstalled' | 'attention';
export type Op = 'start' | 'stop' | 'restart' | 'resume';

/** The state words of the API folded into the few the page draws. */
export function bucket(status: string | undefined): Bucket {
  const s = String(status ?? '').toLowerCase();
  if (s === 'running' || s === 'stopped' || s === 'paused' || s === 'failed') return s;
  if (/^(creating|copying|claiming|starting|provisioning|restarting|pending)$/.test(s)) return 'starting';
  if (s === 'deleting' || s === 'deleted') return 'gone';
  // The server it ran on was reinstalled: its files are gone and nothing can run it again (only Delete is left).
  if (s === 'host_reinstalled') return 'reinstalled';
  return 'attention';
}

const OPS: Partial<Record<Bucket, readonly Op[]>> = { running: ['restart', 'stop'], stopped: ['start'], paused: ['resume'], failed: ['restart'] };

export function opsFor(status: string | undefined): readonly Op[] {
  return OPS[bucket(status)] ?? [];
}

/** The capability each action needs; Resume is a start. */
export const CAPS = {
  start: 'computers.actions.start',
  resume: 'computers.actions.start',
  stop: 'computers.actions.stop',
  restart: 'computers.actions.restart',
  rename: 'computers.update',
  colour: 'computers.update',
  delete: 'computers.delete',
  realms: 'account',
  sshKey: 'account',
  copy: 'account',
  create: 'account',
  // POST /computers/:id/snapshots also needs computers.update (core/routePerms.ts): the menu checks both.
  snapshot: 'computers.features.snapshots',
} as const;
export type Action = keyof typeof CAPS;

export type Caps = ReadonlySet<string> | 'all';

export function allows(caps: Caps, action: Action): boolean {
  return caps === 'all' || caps.has(CAPS[action]);
}

/** The lifecycle ops the caller may press on a row. An expired row (server_expired: its server's rental ended) has none:
 *  the API answers 409 COMPUTER_EXPIRED to every lifecycle call on it, whatever its status says. */
export function allowedOps(c: { status?: string; server_expired?: boolean } | undefined, caps: Caps): Op[] {
  if (!c || c.server_expired === true) return [];
  return opsFor(c.status).filter((op) => allows(caps, op));
}

export type Access = { state: 'set'; scope: 'computer' | 'project' | 'both' | 'unknown' } | { state: 'open' } | { state: 'unchecked' } | { state: 'unknown' };

/** Who can open the computer's programs, from fields the list row already carries. 'set' says rules exist, never that they are enough.
 *  A known scope wins; then 'unchecked': the API says it couldn't check (scope 'unknown', or has_proxy_permissions null with no
 *  known scope), so it is never shown as open; then the boolean alone. */
export function access(c: Pick<Computer, 'has_proxy_permissions' | 'proxy_permissions_scope'>): Access {
  const sc = c.proxy_permissions_scope;
  if (sc === 'computer' || sc === 'project' || sc === 'both') return { state: 'set', scope: sc };
  if (sc === 'none') return { state: 'open' };
  if (sc === 'unknown' || c.has_proxy_permissions === null) return { state: 'unchecked' };
  if (typeof c.has_proxy_permissions === 'boolean') return c.has_proxy_permissions ? { state: 'set', scope: 'unknown' } : { state: 'open' };
  return { state: 'unknown' };
}

/** The same masking inside a URL: every 24-hex run is masked (core's maskAddress, which the kit's AddressField shows). */
export { maskAddress as maskUrl } from '@core';

// A computer's own colour lives in core (the Board, the shell and the kit draw it too); re-exported so Computers keeps
// its imports.
export { computerColor } from '@core';

const REALM_PALETTE: ReadonlySet<string> = new Set(['red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink']);
/** A realm's palette name, or null when it is not one (only these names reach a style). */
export function realmColor(v: string | undefined): string | null {
  return typeof v === 'string' && REALM_PALETTE.has(v) ? v : null;
}

// The alias name rules moved to core (shared with Scripts): re-exported here so Computers keeps its imports.
export { ALIAS_RE, aliasProblem, suggestAliasName, validAlias } from '@core';

/** The host an alias answers on (the target of a custom domain's CNAME), from its https address; null when unusable. */
export function aliasHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.hostname : null;
  } catch {
    return null;
  }
}

export const NAME_RE = /^[A-Za-z0-9_-]{3,100}$/;
export function validName(v: string): boolean {
  return NAME_RE.test(v);
}

/** Rename accepts 1 to 100 characters after trimming. */
export function cleanRename(v: string): string | null {
  const t = v.trim();
  return t.length >= 1 && t.length <= 100 ? t : null;
}

// ── URL handles: the selection in the URL is never a full id ───────────────────────────

/** `name.abcd`: the name and the last four hex of the id. Names hold no dot. */
export function handleOf(c: Pick<Computer, 'id' | 'name'>): string {
  return `${c.name}.${c.id.slice(-4)}`;
}

/** The listed computer a handle names. The name in a handle goes out of date with a rename (this tab's, another
 *  tab's, a kept link), the id's last four never do: a handle no computer has exactly names the one listed computer
 *  whose id ends with its four-character tail. Two computers with that tail name neither (never a guess). */
export function findByHandle(list: readonly Computer[], handle: string | undefined): Computer | undefined {
  if (!handle) return undefined;
  const dot = handle.lastIndexOf('.');
  if (dot < 1) return list.find((c) => c.name === handle);
  const name = handle.slice(0, dot);
  const tail = handle.slice(dot + 1);
  const exact = list.find((c) => c.name === name && c.id.endsWith(tail));
  if (exact || tail.length !== 4) return exact;
  const byTail = list.filter((c) => c.id.endsWith(tail));
  return byTail.length === 1 ? byTail[0] : undefined;
}

// ── list: search, filters, counts ──────────────────────────────────────────────────────

export function stateGroup(status: string | undefined): 'running' | 'stopped' | 'problems' | 'starting' {
  const b = bucket(status);
  if (b === 'running') return 'running';
  if (b === 'stopped' || b === 'paused') return 'stopped';
  if (b === 'starting') return 'starting';
  return 'problems';
}

export function serverKey(c: Computer): string {
  return String(c.server_id ?? c.server?.id ?? c.server_name ?? c.server?.name ?? '');
}

export function serverLabel(c: Computer): { name: string; place: string; cc?: string } {
  const sv = c.server ?? {};
  const out: { name: string; place: string; cc?: string } = {
    name: String(sv.name ?? c.server_name ?? ''),
    place: String(sv.city || sv.country_name || ''),
  };
  if (typeof sv.country === 'string' && /^[A-Za-z]{2}$/.test(sv.country)) out.cc = sv.country.toUpperCase();
  return out;
}

/** The summary strip's split of a list: every computer is in exactly one part, so the parts add up to the list's
 *  length. Paused counts with stopped (as the state filter groups it); `other` is what is neither running, stopped,
 *  failed nor starting (being deleted, its server reinstalled, a state the page does not know). */
export function stripParts(list: readonly Computer[]): { running: number; stopped: number; failed: number; starting: number; other: number } {
  const n = { running: 0, stopped: 0, failed: 0, starting: 0, other: 0 };
  for (const c of list) {
    const b = bucket(c.status);
    if (b === 'running') n.running++;
    else if (b === 'stopped' || b === 'paused') n.stopped++;
    else if (b === 'failed') n.failed++;
    else if (b === 'starting') n.starting++;
    else n.other++;
  }
  return n;
}

/** The split in words: running, stopped and failed always; starting and other only when there are some. */
export function stripSplit(list: readonly Computer[], t: (k: 'strip.split' | 'strip.starting' | 'strip.other', v: Record<string, string | number>) => string): string {
  const n = stripParts(list);
  return [t('strip.split', { running: n.running, stopped: n.stopped, failed: n.failed }), n.starting > 0 ? t('strip.starting', { count: n.starting }) : null, n.other > 0 ? t('strip.other', { count: n.other }) : null].filter(Boolean).join(' · ');
}

export function sizeParts(c: Computer): { cores: number | null; ramGb: number | null } {
  const sp = c.server?.specs;
  return { cores: typeof sp?.cpu_cores === 'number' ? sp.cpu_cores : null, ramGb: typeof sp?.ram_gb === 'number' ? sp.ram_gb : null };
}

/** "8 cores · 16 GB RAM", either part left out when the computer does not say (never "0 GB"); sizes by formatStorage. */
export function sizeText(sz: { cores: number | null; ramGb: number | null }, t: (k: 'size.cores' | 'size.ram', v: Record<string, string | number>) => string): string {
  return [sz.cores !== null ? t('size.cores', { count: sz.cores }) : null, sz.ramGb !== null ? t('size.ram', { size: formatStorage(sz.ramGb) }) : null].filter(Boolean).join(' · ');
}

export function projectName(projects: readonly Project[] | undefined, id: string): string {
  return projects?.find((p) => p.id === id)?.name ?? '';
}

export function serverFull(s: Pick<Server, 'cap'>): boolean {
  return !!s.cap && s.cap.max > 0 && s.cap.used >= s.cap.max;
}

/** Servers a new computer may land on: active and with room. */
export function offered(servers: readonly Server[] | undefined): Server[] {
  return (servers ?? []).filter((x) => (x.status === 'active' || !x.status) && !serverFull(x));
}

// ── program links of a computer ────────────────────────────────────────────────────────

export const PROGRAMS = ['agent', 'terminal', 'screen', 'files', 'browser'] as const;
export type ProgramLink = (typeof PROGRAMS)[number];
/** The slug each program has in a port URL. */
export const SLUG: Record<ProgramLink, string> = { agent: 'agent', terminal: 'terminal', screen: 'display', files: 'files', browser: 'browser' };

const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
export function sshHost(c: Pick<Computer, 'ssh_hostname'>): string {
  return typeof c.ssh_hostname === 'string' && HOST_RE.test(c.ssh_hostname) ? c.ssh_hostname : '';
}

export function hasSshKey(c: Pick<Computer, 'ssh_public_key'>): boolean {
  return typeof c.ssh_public_key === 'string' && c.ssh_public_key !== '';
}

// ── listeners: core's classifyRuntime (with the read, in core/computerRuntime.ts) ──────

export { classifyRuntime } from '@core';

// ── servers ────────────────────────────────────────────────────────────────────────────

export type SubKey =
  | 'stProvisioning' | 'stActive' | 'stWiping' | 'stEnded' | 'stFailed' | 'stStuck' | 'stOther'
  | 'stStoppingOff' | 'stStopping' | 'stPastDue' | 'stResuming' | 'stResumeFailed' | 'stHeld' | 'stHeldNoDate';

export const SUB_STATE_KEY: Record<string, SubKey> = {
  provisioning: 'stProvisioning',
  active: 'stActive',
  wiping: 'stWiping',
  terminated: 'stEnded',
  host_wiped: 'stEnded',
  delivery_failed: 'stFailed',
  change_stuck: 'stStuck',
};

export type SubTone = 'ok' | 'warn' | 'danger' | 'neutral';

/** A subscription's state key, tone and whether Pay now is due. */
export function subView(sub: { state: string; auto_renew?: boolean; delete_at?: string | null; active_operation_id?: string | null }): { key: SubKey; tone: SubTone; pay: boolean } {
  const op = !!sub.active_operation_id;
  if (sub.state === 'past_due') return { key: op ? (sub.auto_renew === false ? 'stStoppingOff' : 'stStopping') : 'stPastDue', tone: 'warn', pay: !op };
  if (sub.state === 'held') {
    const paid = sub.delete_at === null;
    return { key: paid ? (op ? 'stResuming' : 'stResumeFailed') : sub.delete_at ? 'stHeld' : 'stHeldNoDate', tone: 'danger', pay: !paid };
  }
  return { key: SUB_STATE_KEY[sub.state] ?? 'stOther', tone: sub.state === 'active' ? 'ok' : 'neutral', pay: false };
}

// ── what a computer can be used for (the Overview's cards) ────────────────────────────

export const USES = ['terminal', 'screen', 'files', 'browser', 'agent', 'site', 'ssh'] as const;
export type UseId = (typeof USES)[number];
export type UseState = 'ready' | 'start' | 'key';

/** Whether a use is ready, needs the computer started, or needs an SSH key. */
export function readinessOf(use: UseId, c: Pick<Computer, 'status' | 'ssh_hostname' | 'ssh_public_key'>): UseState {
  if (use === 'ssh') return sshHost(c) && hasSshKey(c) ? 'ready' : 'key';
  return bucket(c.status) === 'running' ? 'ready' : 'start';
}

// ── usage numbers ─────────────────────────────────────────────────────────────────────

export function pct(v: { used: number; total: number } | null | undefined): number | null {
  return v && v.total > 0 ? Math.round((v.used / v.total) * 100) : null;
}

/** A percentage as shown everywhere on this page: the kit's formatPercent (the caller adds the %). */
export const pctText = formatPercent;

/** "1.2 GB of 6 GB", "900 GB of 1.95 TB": each side in its own unit (formatStorage); a negative reading is 0. */
export function usageOfText(v: { used: number; total: number }, t: (k: 'usage.of', v: Record<string, string>) => string): string {
  const one = (n: number) => formatStorage(Number.isFinite(n) ? Math.max(0, n) : n);
  return t('usage.of', { used: one(v.used), total: one(v.total) });
}

export type UsageId = 'cpu' | 'mem' | 'disk';
/** The three readings of a usage sample, each with its rounded text: the list column and the Overview tiles draw these. */
export function usageReadings(u: Pick<Usage, 'cpu' | 'mem' | 'disk'>): { id: UsageId; v: number | null; text: string | null }[] {
  const of = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v);
  // Unrounded, so memory and disk round exactly as CPU does (pctText is the only rounding).
  const ratio = (v: { used: number; total: number } | null) => (v && v.total > 0 ? of((v.used / v.total) * 100) : null);
  return [
    { id: 'cpu', v: of(u.cpu) },
    { id: 'mem', v: ratio(u.mem) },
    { id: 'disk', v: ratio(u.disk) },
  ].map((r) => ({ id: r.id as UsageId, v: r.v, text: r.v === null ? null : pctText(r.v) }));
}

// ── programs of a computer (the Programs tab) ─────────────────────────────────────────

export const PROGRAM_ATTENTION: ReadonlySet<string> = new Set(['failed', 'restarting', 'unknown']);

/** What a program can do from its state. A port-range program starts, and restarts after failing, per port
 *  only (the daemon needs the port), so the whole-program Start and failed Restart are not offered. */
export function programCan(state: string, range = false): { start: boolean; stop: boolean; restart: boolean } {
  const startable = !range && (state === 'stopped' || state === 'idle' || state === 'failed');
  const stoppable = state === 'running' || state === 'starting' || state === 'restarting';
  return { start: startable, stop: stoppable, restart: state === 'running' || (!range && state === 'failed') };
}

/** `3d 2h`, `5h 12m`, `42s`: how long a program has been up. */
export function uptimeParts(seconds: number): { d: number; h: number; m: number; s: number } {
  return { d: Math.floor(seconds / 86400), h: Math.floor((seconds % 86400) / 3600), m: Math.floor((seconds % 3600) / 60), s: seconds % 60 };
}

/** The ids of the listed computers' projects that the realm's projects list lacks (empty while either is loading). */
export function missingProjectIds(realmList: readonly Project[] | undefined, computers: readonly Computer[] | undefined): string[] {
  if (!realmList || !computers) return [];
  const have = new Set(realmList.map((p) => p.id));
  return [...new Set(computers.map((c) => c.project_id).filter((id) => id && !have.has(id)))];
}

/** The projects this realm view shows: its own list, then each listed computer's project that list lacks, as read by
 *  id. Such a project is outside when its own realms leave out the shown realm (`realm`; undefined in All realms,
 *  where nothing is outside); one that names the realm was only past the list's page. A project not read (yet) stays
 *  out (the computer still shows its id). Every such project is read only: a rename or delete is proved by the
 *  realm's list, which does not hold it. Undefined while the realm's list is loading. */
export function projectsInView(realmList: readonly Project[] | undefined, found: readonly Project[] | undefined, computers: readonly Computer[] | undefined, realm?: string): Project[] | undefined {
  if (!realmList) return undefined;
  const missing = new Set(missingProjectIds(realmList, computers));
  const extra = (found ?? []).filter((p) => missing.has(p.id)).map((p) => ({ ...p, outside: realm !== undefined && !(p.realm_ids ?? []).includes(realm), readOnly: true }));
  return extra.length > 0 ? [...realmList, ...extra] : [...realmList];
}

// ── Overview: what the computer row says, as the Overview shows it ─────────────────────────────────────────────

/** What kind of server the computer runs on, from its row: a free slice, a paid slice of a shared host, or a whole
 *  machine. Null when the row does not say (both flags absent), never a guess. */
export function serverKindOf(c: Pick<Computer, 'server'>): 'free' | 'slice' | 'metal' | null {
  const sv = c.server;
  if (sv?.is_free === true) return 'free';
  if (sv?.paid_subserver === true) return 'slice';
  if (sv?.is_free === false && sv.paid_subserver === false) return 'metal';
  return null;
}

/** The computer's disk limit in GB, when its server says one. */
export function diskGbOf(c: Pick<Computer, 'server'>): number | null {
  const d = c.server?.specs?.disk_gb;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null;
}

/** A valid ISO date, else null (an unreadable date is never shown). */
export function dateOf(v: unknown): Date | null {
  if (typeof v !== 'string' || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Nov 5, 2026": the one date format of the Overview. */
export function dayText(d: Date): string {
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Seconds since `started` at `now`; null when the date is unreadable or in the future. */
export function secondsSince(started: string | null | undefined, now: number): number | null {
  const d = dateOf(started);
  if (!d) return null;
  const s = Math.floor((now - d.getTime()) / 1000);
  return s >= 0 ? s : null;
}
