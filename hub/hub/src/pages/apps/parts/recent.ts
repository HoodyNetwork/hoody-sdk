// The recent list (hub_apps_recent_v2): the launches this account opened, handles and names only. Rows earlier
// releases wrote are still read here (the older computer spellings below). It is what lets a reload or another tab still Stop or Check an
// app, and what keeps C9 across them: a copy whose outcome is unknown stays listed and holds a second Open
// of its app (a launch reads the list again first). Only a Dismiss the user confirms, warned that
// opening again may start a second copy, takes it off.
//
// Stored: {v:2, rows:[{name, catalog_id?, app?, candidate?, asks_code?, opens_in, computer:{project, computer_id} (earlier releases wrote computer, and before that container, for the id; read, never written),
// terminal_id, incarnation, command_id, launch_tag, display, kind?, web?:{port, path}, started_at}],
// p?, left?, ack:[catalog_id]}. `left` (with command_id 0) is a terminal the core made and could not prove closed (its
// leftover, C9): no command runs in it, it is never read or stopped, and its Remove (the core's discard) is its only
// action. `p` marks a Files launch: a value this Hub does not know (a newer
// Hub's) is kept as UNKNOWN_P, still marked, so such a row never relaunches by its name. Never an access code, a setting's value or a command. Every read is checked; anything
// unreadable is an empty list. `candidate` (logic candidateOf: a search row's source and candidate id) is what
// holds an Open of the same program found under other words, or from a coding agent's card, across tabs and
// reloads; a row without it holds by name.
import { computerIdOf, heldAttempts, inRunHeld, partitioned, type HeldAttempt, type RunHandle } from '@core';
import { PURPOSES, SHARES, type Opens } from '../logic';

const RID = /^[0-9a-f]{24}$/;
const CATALOG_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const INCARNATION = /^[0-9a-f]{32}$/;
const LAUNCH_TAG = /^[0-9a-f]{16}$/;
/** logic candidateOf: a source, then the run kit's candidate id (data.ts keeps ids of at most 200 characters). */
const CANDIDATE = /^(?:nix|pkgx|appimage|oci|registry|system|other|):[\x21-\x7e]{1,200}$/;
// left: leftover terminals count apart from the 20 launches, so newer launches never push one out (C9).
const LIMITS = { recent: 20, left: 32, name: 80, query: 200, catalogRows: 64 } as const;
const OPENS_IN: Record<string, Opens> = { screen: 'screen', terminal: 'terminal', web: 'web' };
const RUN_OPENS_IN: Record<string, Opens> = { window: 'screen', terminal: 'terminal', web: 'web' };
const WIRE_OPENS_IN: Record<Opens, 'window' | 'terminal' | 'web'> = { screen: 'window', terminal: 'terminal', web: 'web' };
/** The marker kept for a stored purpose this Hub does not know: marked all the same (fails closed). */
const UNKNOWN_P = '?';

export interface StoredRow {
  computer: { project: string; computer_id: string };
  terminal_id: number;
  incarnation: string;
  command_id: number;
  launch_tag: string;
  display: number;
  name: string;
  opens_in: Opens;
  started_at: number;
  catalog_id?: string;
  kind?: 'oci' | 'app';
  app?: string;
  candidate?: string;
  asks_code?: true;
  web?: { port: number; path: string };
  p?: string;
  /** A leftover terminal (command_id 0): kept until the core's discard proves it closed. */
  left?: true;
}
export interface RecentDoc {
  v: 2;
  rows: StoredRow[];
  ack: string[];
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi;
function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}
// A launch terminal: the band, or the old band (15001-19999) of a launch made before, still listed and closed.
const inBand = (n: unknown): n is number => inRunHeld(n);
export const wireOpensIn = (o: Opens): 'window' | 'terminal' | 'web' => WIRE_OPENS_IN[o] ?? 'terminal';
const opensInOf = (w: unknown): Opens => (typeof w === 'string' && own(RUN_OPENS_IN, w) ? (RUN_OPENS_IN[w] as Opens) : 'terminal');

function normRow(r: unknown): StoredRow | null {
  if (!isObj(r) || !isObj(r.computer)) return null;
  // Stored as computer:{project, computer_id}; rows earlier releases wrote have computer or container for the id (computerIdOf).
  const p = r.computer.project, c = computerIdOf(r.computer);
  if (typeof p !== 'string' || typeof c !== 'string' || !RID.test(p) || !RID.test(c)) return null;
  if (r.left != null && r.left !== true) return null;
  const left = r.left === true;
  if (!inBand(r.terminal_id) || !(left ? r.command_id === 0 : int(r.command_id, 1, 65535)) || typeof r.incarnation !== 'string' || !INCARNATION.test(r.incarnation)) return null;
  if (typeof r.launch_tag !== 'string' || !LAUNCH_TAG.test(r.launch_tag) || r.display !== r.terminal_id) return null;
  const name = str(r.name, LIMITS.name);
  if (!name || !int(r.started_at, 0, 8.64e15)) return null;
  const out: StoredRow = {
    computer: { project: p, computer_id: c }, terminal_id: r.terminal_id, incarnation: r.incarnation, command_id: r.command_id as number, launch_tag: r.launch_tag, display: r.terminal_id,
    name, opens_in: typeof r.opens_in === 'string' && own(OPENS_IN, r.opens_in) ? (OPENS_IN[r.opens_in] as Opens) : 'terminal', started_at: r.started_at,
    ...(left ? { left: true as const } : {}),
  };
  if (r.catalog_id != null) {
    if (typeof r.catalog_id !== 'string' || !CATALOG_ID.test(r.catalog_id)) return null;
    out.catalog_id = r.catalog_id;
  }
  if (r.kind != null) {
    if (r.kind !== 'oci' && r.kind !== 'app') return null;
    out.kind = r.kind;
  }
  if (r.app != null) {
    const app = str(r.app, LIMITS.query);
    if (!app) return null;
    out.app = app;
  }
  // An identity that does not check is left out, never the row: the row still holds by its name (a dropped row would
  // let a second copy start over it).
  if (typeof r.candidate === 'string' && CANDIDATE.test(r.candidate)) out.candidate = r.candidate;
  if (r.asks_code != null) {
    if (r.asks_code !== true) return null;
    out.asks_code = true;
  }
  if (r.web != null) {
    if (!isObj(r.web) || !int(r.web.port, 1, 65535) || typeof r.web.path !== 'string' || !/^\/[\x21-\x7e]{0,199}$/.test(r.web.path)) return null;
    out.web = { port: r.web.port, path: r.web.path };
  }
  // Any present marker marks the row; an unknown one is kept as UNKNOWN_P, never dropped (a dropped marker would let
  // the row relaunch by its name, without its file).
  if (r.p != null) out.p = typeof r.p === 'string' && (PURPOSES as readonly string[]).includes(r.p) ? r.p : UNKNOWN_P;
  return out;
}

/** The row's identity: one launch on one computer. */
export const recentKey = (r: StoredRow): string => `${r.computer.computer_id}:${r.incarnation}:${r.command_id}`;
/** One launch exactly: its place and command plus its launch tag. Two rows with one recentKey and other tags are two
 *  launches (a reused terminal record, or a row rewritten under another tag): an Open-with hold matches only its own. */
export const owKey = (r: StoredRow): string => `${recentKey(r)}:${r.launch_tag}`;

/** An untrusted stored value → a clean document. */
export function readRecent(doc: unknown): RecentDoc {
  const out: RecentDoc = { v: 2, rows: [], ack: [] };
  if (!isObj(doc) || doc.v !== 2) return out;
  const seen = new Set<string>();
  if (Array.isArray(doc.rows)) {
    let plain = 0, left = 0;
    for (let i = 0; i < doc.rows.length && (plain < LIMITS.recent || left < LIMITS.left); i++) {
      const r = normRow(doc.rows[i]);
      if (!r || seen.has(recentKey(r)) || (r.left ? left >= LIMITS.left : plain >= LIMITS.recent)) continue;
      seen.add(recentKey(r));
      if (r.left) left++;
      else plain++;
      out.rows.push(r);
    }
  }
  if (Array.isArray(doc.ack)) {
    for (let j = 0; j < doc.ack.length && out.ack.length < LIMITS.catalogRows; j++) {
      const a = doc.ack[j];
      if (typeof a === 'string' && SHARES.includes(a) && !out.ack.includes(a)) out.ack.push(a);
    }
  }
  return out;
}

/** The document with row r first (replacing the same launch), capped. */
export function addRecent(doc: unknown, r: StoredRow): RecentDoc {
  const d = readRecent(doc), row = normRow(r);
  if (!row) return d;
  return readRecent({ v: 2, rows: [row, ...d.rows.filter((x) => recentKey(x) !== recentKey(row))], ack: d.ack });
}
export function removeRecent(doc: unknown, key: string): RecentDoc {
  const d = readRecent(doc);
  return readRecent({ v: 2, rows: d.rows.filter((x) => recentKey(x) !== key), ack: d.ack });
}
export function ackShares(doc: unknown, catalogId: string): RecentDoc {
  const d = readRecent(doc);
  return readRecent({ ...d, ack: d.ack.includes(catalogId) ? d.ack : [...d.ack, catalogId] });
}
/** Rows of one computer, newest first. */
export const recentFor = (doc: RecentDoc, project: string, computer: string): StoredRow[] => doc.rows.filter((r) => r.computer.project === project && r.computer.computer_id === computer);

/** The core's handle for a stored row, opens_in in the wire spelling. */
export function toHandle(r: StoredRow): RunHandle {
  return {
    v: 1, terminal_id: r.terminal_id, incarnation: r.incarnation, command_id: r.command_id, display: r.display, launch_tag: r.launch_tag, opens_in: wireOpensIn(r.opens_in), name: r.name,
    computer: { project: r.computer.project, computer_id: r.computer.computer_id }, ...(r.kind ? { kind: r.kind } : {}), ...(r.web ? { web: { port: r.web.port, path: r.web.path } } : {}),
  };
}
/** A stored row for a handle the core just admitted; null when the handle does not check. */
export function fromHandle(h: RunHandle, more: { name: string; catalogId?: string; app?: string; candidate?: string; asksCode?: boolean; p?: string; left?: boolean }, at: number): StoredRow | null {
  return normRow({
    name: more.name || h.name, catalog_id: more.catalogId, app: more.app, candidate: more.candidate, asks_code: more.asksCode ? true : undefined, p: more.p, opens_in: opensInOf(h.opens_in), computer: h.computer,
    terminal_id: h.terminal_id, incarnation: h.incarnation, command_id: h.command_id, launch_tag: h.launch_tag, display: h.display, kind: h.kind, web: h.web, started_at: at,
    left: more.left ? true : undefined,
  });
}
/** A core leftover (a terminal it could not prove closed) as a stored row: the launch's own row's names when it had
 *  one (`base`), else `more`. Null when it does not check (no launch tag or computer to file it under). */
export function leftRow(
  lo: { terminal_id: number; incarnation: string; launch_tag?: string; computer?: { project: string; computer_id: string } },
  base: StoredRow | undefined, more: { name: string; catalogId?: string; app?: string; candidate?: string; p?: string }, at: number,
): StoredRow | null {
  const names = base ? { name: base.name, catalogId: base.catalog_id, app: base.app, candidate: base.candidate, p: base.p } : more;
  const tag = lo.launch_tag ?? base?.launch_tag;
  const computer = lo.computer ?? base?.computer;
  if (!tag || !computer) return null;
  const h = { v: 1, terminal_id: lo.terminal_id, incarnation: lo.incarnation, command_id: 0, display: lo.terminal_id, launch_tag: tag, opens_in: wireOpensIn(base?.opens_in ?? 'terminal'), computer } as RunHandle;
  return fromHandle(h, { ...names, left: true }, base?.started_at ?? at);
}

// ── Open-with holds: the account's core holds of Files launches, as launch rows ──

/** The sender name of an Open-with hold (core attempts), and the start of its lock on a computer. */
export const OW_BY = 'apps:openwith';
export const owLockPrefix = (cid: string): string => `ow:${cid}:`;
/** A Files script launch's own identity as its row holds by (the run kit's candidate id is never it): the program
 *  word (a template id or the purpose) and the ledger subject. */
export const owCandidate = (word: string, subject: string): string => `other:ow-${word}-${subject}`;
const OW_WORD = /^[a-z0-9][a-z0-9-]{0,31}$/;
const OW_SUBJECT = /^[0-9a-f]{32}$/;

/** An Open-with hold's handle as a launch row (never saved to the recent list): its program name, its place and its
 *  expected tag. Holds without a whole handle and tag are not rows (they cannot be read). */
export function owRunOf(h: HeldAttempt, project: string, cid: string): StoredRow | null {
  if (h.by !== OW_BY || !h.lock.startsWith(owLockPrefix(cid))) return null;
  const m = h.meta as { p?: unknown; program?: unknown; word?: unknown; opens?: unknown; tag?: unknown; handle?: { terminal_id?: unknown; incarnation?: unknown; command_id?: unknown } } | null;
  if (!m || typeof m !== 'object' || !m.handle || typeof m.handle !== 'object') return null;
  // The launch's identity comes back with it, so a second press of the same file still finds this run.
  const subject = h.lock.slice(owLockPrefix(cid).length);
  const candidate = typeof m.word === 'string' && OW_WORD.test(m.word) && OW_SUBJECT.test(subject) ? owCandidate(m.word, subject) : undefined;
  return fromHandle(
    {
      v: 1, terminal_id: m.handle.terminal_id as number, incarnation: m.handle.incarnation as string, command_id: m.handle.command_id as number, display: m.handle.terminal_id as number,
      launch_tag: m.tag as string, opens_in: m.opens === 'screen' ? 'window' : 'terminal', computer: { project, computer_id: cid },
    } as RunHandle,
    { name: typeof m.program === 'string' ? m.program : '', p: typeof m.p === 'string' ? m.p : UNKNOWN_P, ...(candidate ? { candidate } : {}) },
    h.startedAt,
  );
}
/** The Open-with holds with a handle on one computer, as launch rows. */
export function owRunsOn(project: string, cid: string): StoredRow[] {
  const out: StoredRow[] = [];
  for (const h of heldAttempts()) {
    const r = owRunOf(h, project, cid);
    if (r) out.push(r);
  }
  return out;
}
// ── Storage: the shell's account-partitioned key; without the shell's helper the list lives in memory ──

let mem: RecentDoc = { v: 2, rows: [], ack: [] };
function box() {
  try {
    return partitioned('hub_apps_recent_v2', { scope: 'account', area: 'local', purge: true });
  } catch {
    return null;
  }
}
export function loadRecent(): RecentDoc {
  const b = box();
  let v: unknown = null;
  if (b) {
    try {
      v = b.get();
    } catch {
      v = null;
    }
  }
  // With the shell's storage, its answer is the list (null: no account shown, so nothing): memory is never
  // read across an account switch.
  return readRecent(b ? v : mem);
}
export function saveRecent(d: RecentDoc): void {
  mem = d;
  const b = box();
  if (!b) return;
  try {
    b.set(d);
  } catch {
    /* kept in memory for this view */
  }
}
