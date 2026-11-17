// Pure rules of the Tunnels page (no React, no I/O). The tunnel program's answers (GET /api/v1/tunnel/tunnels,
// /sessions, /bindings, /health) become the page's rows.
//
// Contract, in plain words:
//   - tunnelProgram(overview): what the daemon's program overview says about hoody-tunnel: 'running' (also starting
//     or restarting), 'stopped' (any other state: the program starts by itself when a laptop connects), or 'none'
//     (not listed). A body that is not the daemon's overview throws (the page says it cannot tell).
//   - parseTunnels / parseSessions / parseBindings / parseHealth read one answer each. A body without its list
//     throws (a read error, never "nothing connected"). Rows that do not check (no session id, a port outside
//     1..65535, a bind address that is not an IP) are dropped; lists are bounded.
//   - joinRows(): one row per binding, keyed by session + bind id (never the port alone: two PULL bindings can share
//     a port on different loopback addresses), grouped by session. A session that shares nothing gets one 'idle'
//     row. A listener whose session is not in the live list goes in the 'reconnecting' group. The orphan count is
//     shown only when no reconnecting row accounts for it.
//   - The connection address is masked on screen (maskIp); the page shows it in full only on request, and never in a
//     shared-access session.

/** The page's own words for a kit answer that does not read. */
export class Unreadable extends Error {
  constructor(what: string) {
    super('UNREADABLE: ' + what);
  }
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export const MAX_SESSIONS = 256;
export const MAX_BINDINGS = 2000;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// ── Addresses ───────────────────────────────────────────────────────────────────────

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const V6 = /^[0-9A-Fa-f:.]{2,45}$/;

/** The address when it is a plain IPv4 or IPv6 address (no zone, no port), else null. */
export function ipOf(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const m = V4.exec(s);
  if (m) return m.slice(1).every((x) => Number(x) <= 255) ? s : null;
  return V6.test(s) && s.includes(':') && (s.match(/::/g)?.length ?? 0) <= 1 ? s.toLowerCase() : null;
}

/** The IPv4 address of a socket address ("203.0.113.7:51234" or a bare address), or null: Hoody networks are IPv4 only. */
export function peerIp(addr: unknown): string | null {
  if (typeof addr !== 'string' || addr.length > 64) return null;
  const host = /^([^:]+)(?::\d{1,5})?$/.exec(addr)?.[1] ?? '';
  return V4.test(host) ? ipOf(host) : null;
}

/** The connection address as the page shows it: its IPv4 address, else the kit's own text (trimmed, 1-64 printable characters), else null. */
function peerOf(addr: unknown): string | null {
  const ip = peerIp(addr);
  if (ip !== null || typeof addr !== 'string') return ip;
  const t = addr.trim();
  return t !== '' && t.length <= 64 && !/\p{Cc}/u.test(t) ? t : null;
}

/** How the connection address shows until Show: 203.0.113.x, or "…" for text that is not an IPv4 address. */
export function maskIp(ip: string): string {
  const m = V4.exec(ip);
  return m ? `${m[1]}.${m[2]}.${m[3]}.x` : '…';
}

/** host:port, an IPv6 host in brackets. */
export function hostPort(host: string, port: number): string {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

/** The short form of a session id the page shows ("S-4f2a9c1e-…" → "4f2a9c…"). */
export function shortSession(id: string): string {
  const s = id.replace(/^S-/, '');
  return s.length > 6 ? `${s.slice(0, 6)}…` : s;
}

// ── The tunnel program in the daemon's overview ─────────────────────────────────────

export type ProgramGate = 'running' | 'stopped' | 'none' | 'unknown';

const UP = new Set(['running', 'starting', 'restarting', 'backoff']);
const DOWN = new Set(['stopped', 'stopping', 'exited', 'fatal', 'failed']);

/**
 * What the overview says about hoody-tunnel (see the contract). Throws on a body that is not the overview. `unknown`
 * when the daemon could not read the state (`states_known: false`, or a status it did not name): neither running nor
 * stopped, so nothing is read from the program and nothing is called empty. A known `unknown` with no process loaded is
 * a program the daemon has not loaded: stopped (core program-model's rule).
 */
export function tunnelProgram(overview: unknown): ProgramGate {
  const list = rec(overview).programs;
  if (!Array.isArray(list)) throw new Unreadable('overview');
  const p = list.map(rec).find((x) => x.name === 'hoody-tunnel');
  if (!p) return 'none';
  if (p.states_known === false) return 'unknown';
  const st = typeof p.status === 'string' ? p.status.toLowerCase() : '';
  if (UP.has(st)) return 'running';
  if (DOWN.has(st)) return 'stopped';
  if (st === 'unknown' && p.states_known === true && Array.isArray(p.instances) && p.instances.length === 0) return 'stopped';
  return 'unknown';
}

// ── The kit's answers ───────────────────────────────────────────────────────────────

export interface Bind {
  bindId: number;
  port: number;
  /** PULL only: the loopback address the listener bound. */
  addr: string | null;
}

export interface Session {
  id: string;
  /** The connection address: its IPv4 address, else the kit's text as it is, or null when the kit gave none. */
  peer: string | null;
  protocol: string;
  streams: number;
  expose: Bind[];
  pull: Bind[];
}

export interface Tunnels {
  sessions: Session[];
  orphans: number;
  /** The kit's whole session list was read (not cut at MAX_SESSIONS): a session missing from it is not there. */
  full: boolean;
}

function binds(v: unknown, pull: boolean): Bind[] {
  if (!Array.isArray(v)) return [];
  const out: Bind[] = [];
  const seen = new Set<number>();
  for (const b0 of v.slice(0, MAX_BINDINGS)) {
    const b = rec(b0);
    const bindId = int(b.bindId, 0, 0xffffffff);
    const port = int(b.computerPort, 1, 65535);
    if (bindId === null || port === null || seen.has(bindId)) continue;
    const addr = pull ? ipOf(b.bindAddr) : null;
    if (pull && b.bindAddr !== undefined && addr === null) continue;
    seen.add(bindId);
    out.push({ bindId, port, addr: pull ? (addr ?? '127.0.0.1') : null });
  }
  return out;
}

/** GET /api/v1/tunnel/tunnels. */
export function parseTunnels(raw: unknown): Tunnels {
  const o = rec(raw);
  if (!Array.isArray(o.sessions)) throw new Unreadable('tunnels');
  const sessions: Session[] = [];
  const seen = new Set<string>();
  for (const s0 of o.sessions.slice(0, MAX_SESSIONS)) {
    const s = rec(s0);
    const id = typeof s.sessionId === 'string' && SESSION_ID.test(s.sessionId) ? s.sessionId : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sessions.push({
      id,
      peer: peerOf(s.peerAddr),
      protocol: s.protocol === 'v1' || s.protocol === 'v2' ? s.protocol : '',
      streams: int(s.activeStreams, 0, 0xffffffff) ?? 0,
      expose: binds(s.exposeBindings, false),
      pull: binds(s.pullBindings, true),
    });
  }
  return { sessions, orphans: int(o.orphanedSessions, 0, 1e6) ?? 0, full: o.sessions.length <= MAX_SESSIONS };
}

/** GET /api/v1/tunnel/sessions: each live session's most streams at once. */
export function parseSessions(raw: unknown): Record<string, number> {
  const o = rec(raw);
  if (!Array.isArray(o.sessions)) throw new Unreadable('sessions');
  const out: Record<string, number> = {};
  for (const s0 of o.sessions.slice(0, MAX_SESSIONS)) {
    const s = rec(s0);
    const max = int(s.maxStreams, 1, 0xffffffff);
    if (typeof s.sessionId === 'string' && SESSION_ID.test(s.sessionId) && max !== null) out[s.sessionId] = max;
  }
  return out;
}

export interface Listener {
  sessionId: string;
  bindId: number;
  port: number;
  mode: 'expose' | 'pull';
  addr: string | null;
}

/** The listeners read, with every session named as an owner (also by an entry that did not check, so a session still
 *  holding a listener is never read as gone), and whether the kit's whole list was read. */
export interface Listeners {
  list: Listener[];
  owners: ReadonlySet<string>;
  full: boolean;
}

/** GET /api/v1/tunnel/bindings: every listener, also those held while a laptop reconnects. */
export function parseBindings(raw: unknown): Listeners {
  const o = rec(raw);
  if (!Array.isArray(o.bindings)) throw new Unreadable('bindings');
  const out: Listener[] = [];
  const owners = new Set<string>();
  for (const b0 of o.bindings.slice(0, MAX_BINDINGS)) {
    const b = rec(b0);
    if (typeof b.sessionId === 'string' && b.sessionId) owners.add(b.sessionId);
    const port = int(b.port, 1, 65535);
    const bindId = int(b.bindId, 0, 0xffffffff);
    const mode = b.mode === 'expose' || b.mode === 'pull' ? b.mode : null;
    if (port === null || bindId === null || !mode) continue;
    const sessionId = typeof b.sessionId === 'string' && SESSION_ID.test(b.sessionId) ? b.sessionId : '';
    const addr = mode === 'pull' ? ipOf(b.bindAddr) : null;
    if (mode === 'pull' && addr === null) continue;
    out.push({ sessionId, bindId, port, mode, addr });
  }
  return { list: out, owners, full: o.bindings.length <= MAX_BINDINGS };
}

/** GET /api/v1/tunnel/health: when the program started (ms), or null. */
export function parseHealth(raw: unknown): number | null {
  const started = rec(raw).started;
  if (typeof started !== 'string' || started.length > 40) return null;
  const t = Date.parse(started);
  return Number.isFinite(t) ? t : null;
}

// ── Rows ────────────────────────────────────────────────────────────────────────────

export type RowKind = 'expose' | 'pull' | 'idle';
export const RECONNECTING = 'reconnecting';

export interface TunnelRow {
  /** session + bind id ('idle' for a session that shares nothing); 'r~' first for a reconnecting listener. */
  id: string;
  kind: RowKind;
  sessionId: string;
  bindId: number | null;
  port: number | null;
  /** PULL: the loopback address bound. */
  addr: string | null;
  /** The listener's session is not in the live list (a laptop reconnecting, or a session closing). */
  reconnecting: boolean;
  /** The table group: the session id, or RECONNECTING. */
  group: string;
}

export interface SessionGroup {
  id: string;
  session: Session;
  /** Most streams at once, when the sessions read gave it. */
  maxStreams: number | null;
}

export interface Joined {
  rows: TunnelRow[];
  groups: SessionGroup[];
  /** Listeners waiting for their session (the reconnecting group). */
  reconnecting: number;
  /** Sessions the kit counts as reconnecting that no row accounts for (0: nothing to say). */
  orphanNote: number;
}

const rowId = (sessionId: string, bindId: number | 'idle', held = false) => `${held ? 'r~' : ''}${sessionId}~${bindId}`;

/** The rows and groups the page shows (see the contract). */
export function joinRows(t: Tunnels, maxStreams: Readonly<Record<string, number>> | null, listeners: readonly Listener[] | null): Joined {
  const sessions = t.sessions.slice().sort((a, b) => a.id.localeCompare(b.id));
  const rows: TunnelRow[] = [];
  const live = new Set(sessions.map((s) => s.id));
  for (const s of sessions) {
    const mine: TunnelRow[] = [
      ...s.expose.map((b) => ({ id: rowId(s.id, b.bindId), kind: 'expose' as const, sessionId: s.id, bindId: b.bindId, port: b.port, addr: null, reconnecting: false, group: s.id })),
      ...s.pull.map((b) => ({ id: rowId(s.id, b.bindId), kind: 'pull' as const, sessionId: s.id, bindId: b.bindId, port: b.port, addr: b.addr, reconnecting: false, group: s.id })),
    ];
    rows.push(...(mine.length ? mine : [{ id: rowId(s.id, 'idle'), kind: 'idle' as const, sessionId: s.id, bindId: null, port: null, addr: null, reconnecting: false, group: s.id }]));
  }
  let reconnecting = 0;
  const seen = new Set(rows.map((r) => r.id));
  for (const l of listeners ?? []) {
    if (l.sessionId && live.has(l.sessionId)) continue;
    // A listener of no known session (an older kit gave none) is still keyed by its bind id and address.
    const id = rowId(l.sessionId || `${l.mode}-${l.addr ?? ''}-${l.port}`, l.bindId, true);
    if (seen.has(id) || rows.length >= MAX_BINDINGS) continue;
    seen.add(id);
    rows.push({ id, kind: l.mode, sessionId: l.sessionId, bindId: l.bindId, port: l.port, addr: l.addr, reconnecting: true, group: RECONNECTING });
    reconnecting++;
  }
  const groups = sessions.map((s) => ({ id: s.id, session: s, maxStreams: maxStreams?.[s.id] ?? null }));
  return { rows: rows.slice(0, MAX_BINDINGS), groups, reconnecting, orphanNote: reconnecting === 0 ? t.orphans : 0 };
}

/** The row's port, for the list's sort (an idle row sorts last). */
export const portOf = (r: TunnelRow): number => r.port ?? 70000;

// ── The view's state ────────────────────────────────────────────────────────────────

export type ReadFail = 'forbidden' | 'failed';

/** A failed read's kind: 401/403 is Not allowed (the computer's access settings keep the Hub's reads out); anything
 *  else (5xx, timeout, a body that does not read) is a failed read. */
export function failOf(e: unknown): ReadFail {
  const st = rec(e).status;
  return st === 401 || st === 403 ? 'forbidden' : 'failed';
}

// ── The kept snapshot ───────────────────────────────────────────────────────────────

/** One of the three live reads: its parsed data, whether its latest answer was read and parsed, whether a read of it
 *  is still in flight, and when its data was read. */
export interface Read<T> {
  data: T | undefined;
  ok: boolean;
  fetching: boolean;
  at: number;
}

/** The last complete read of all three, with when it was read (the earliest of the three). */
export interface Snapshot {
  tunnels: Tunnels;
  sessions: Readonly<Record<string, number>>;
  bindings: Listeners;
  at: number;
}

/**
 * The snapshot to show: a new one only when all three reads have settled (none in flight) and their latest answers
 * were read and parsed, else the previous one, rows and time together. A refresh never mixes newer answers with an
 * older one still waiting or failed, and an answer that did not parse (the query keeps its old data but reports the
 * new answer's time) never makes old rows look recent. Unchanged answers read again move only the time.
 */
export function nextSnapshot(
  prev: Snapshot | null,
  t: Read<Tunnels>,
  s: Read<Readonly<Record<string, number>>>,
  b: Read<Listeners>,
): Snapshot | null {
  if (!t.ok || !s.ok || !b.ok || t.fetching || s.fetching || b.fetching || !t.data || !s.data || !b.data) return prev;
  const at = Math.min(t.at, s.at, b.at);
  if (prev && prev.tunnels === t.data && prev.sessions === s.data && prev.bindings === b.data) return at > prev.at ? { ...prev, at } : prev;
  return { tunnels: t.data, sessions: s.data, bindings: b.data, at };
}


// ── Disconnect ────────────────────────────────────────────────────────────────────

/** Whether a read still lists the session: as a live session, or as the owner of a listener. null: it cannot tell (a
 *  list was cut at its bound). */
export function stillListed(id: string, t: Tunnels, b: Listeners): boolean | null {
  if (t.sessions.some((s) => s.id === id) || b.owners.has(id)) return true;
  return t.full && b.full ? false : null;
}

const isTunnels = (v: unknown): v is Tunnels => !!v && typeof v === 'object' && Array.isArray((v as Tunnels).sessions) && typeof (v as Tunnels).full === 'boolean';
const isListeners = (v: unknown): v is Listeners =>
  !!v && typeof v === 'object' && Array.isArray((v as Listeners).list) && (v as Listeners).owners instanceof Set && typeof (v as Listeners).full === 'boolean';

/**
 * What a fresh read-back proves about a disconnect that may have gone through (core's `proves`; answers = the fresh
 * /tunnels and /bindings answers, as parsed): gone from both → 'applied'. Anything else → undefined, still held: a
 * session still listed proves nothing, since the kit closes it after answering (the close runs on
 * after the 202), so a lost answer may still be closing it. Never 'not_applied': only the person's warned Disconnect
 * again (a dismiss) frees such a hold.
 */
export function disconnectProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | 'not_applied' | undefined {
  const id = rec(identity).id;
  if (typeof id !== 'string' || !id) return undefined;
  const [ts, bs] = answers;
  if (!ts || !bs || ts.length !== 1 || bs.length !== 1) return undefined;
  const t = ts[0];
  const b = bs[0];
  if (!isTunnels(t) || !isListeners(b)) return undefined;
  return stillListed(id, t, b) === false ? 'applied' : undefined;
}

/** How long a session may stay listed after the kit accepted its disconnect before the page says so. */
export const STILL_MS = 30_000;

/** What the page remembers of one session's disconnect in this tab (a reload drops it: the live list is the truth). */
export type DisconnectMark =
  | { kind: 'closing'; at: number }
  | { kind: 'already'; at: number }
  | { kind: 'failed'; at: number; error: unknown; notSent: boolean };

export type DisconnectState = 'idle' | 'sending' | 'pending' | 'closing' | 'still' | 'already' | 'failed';

/** A session's disconnect state: a send in flight, then one that may have gone through (core's hold), then the mark. */
export function disconnectState(o: { sending: boolean; pending: boolean; mark: DisconnectMark | undefined; now: number }): DisconnectState {
  if (o.sending) return 'sending';
  if (o.pending) return 'pending';
  const m = o.mark;
  if (!m) return 'idle';
  if (m.kind === 'closing') return o.now - m.at >= STILL_MS ? 'still' : 'closing';
  return m.kind;
}

/**
 * Whether a snapshot read after the mark ends it. Disconnecting and a failure: once the session is no longer listed
 * (gone, nothing left to say). Already disconnected: any later read (the live list is the truth from there).
 */
export function markEnded(mark: DisconnectMark, snap: Snapshot, id: string): boolean {
  if (snap.at <= mark.at) return false;
  if (mark.kind === 'already') return true;
  return stillListed(id, snap.tunnels, snap.bindings) === false;
}
