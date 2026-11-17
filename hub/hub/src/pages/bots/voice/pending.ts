// pending.ts: the spoken messages whose fate is not known, kept across a reload, so the
// Activity tab can say "Couldn't confirm this spoken message" until a log row names the same (conn, utt) or 24 h pass.
//
// Only identities are stored: {realm, bot, conn, utt, at}. Never audio, never text, never a sender or a time shown to
// anyone. One kit-io entry per account and computer (hub_voice_pending_v1, area local, purged at sign-out); the realm and
// the Bot ride inside each row, so one computer's Bots in every realm share the entry. Bounds: the newest NOTES_CAP rows
// per entry, none older than NOTE_TTL_MS, at most PENDING_MAX_BYTES stored (oldest go first). A row dated in the future
// (a clock that moved back) is kept by every write, up to NOTE_TTL_MS ahead, and a reload leaves it out until the
// clock passes it. Two tabs of one Bot share its rows: a save removes only the rows its own caller held (`prev`).
// Every browser failure is caught: a store that cannot be read says so ('unreadable'), and nothing is written then.
import { isPlainRecord, partitioned, type Partitioned, type StoreUpdate } from '@core';
import { VOICE_NOTE_TTL_MS as NOTE_TTL_MS, VOICE_NOTES_CAP as NOTES_CAP, voiceRestorePending as restorePending, type MaybeSent, type PendingIdentity } from '@kit/pure';

export const PENDING_KEY = 'hub_voice_pending_v1';
/** The stored entry's size bound (UTF-8 bytes of its JSON; every stored field is ASCII). */
export const PENDING_MAX_BYTES = 4096;

/** Where a Talk session runs: the computer (the store part), the Bot's realm and the Bot. */
export interface VoiceWhere {
  computer: string;
  realm: string;
  bot: string;
}
interface Row {
  realm: string;
  bot: string;
  conn: string;
  utt: number;
  at: number;
}

// Ids as stored: kit-io's part rule for the computer; the same short ASCII shape for realm, Bot and connection.
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const CONN = /^[\x21-\x7e]{1,128}$/;

function box(): Partitioned | null {
  try {
    return partitioned(PENDING_KEY, { scope: 'account+computer', area: 'local', purge: true });
  } catch {
    return null;
  }
}
const whereOk = (w: VoiceWhere): boolean => ID.test(w.computer) && ID.test(w.realm) && ID.test(w.bot);
/** What every stored row must be: not expired, and at most NOTE_TTL_MS ahead (a clock that moved back drops no one's
 * rows). What a reload may show is the machine's rule (restorePending): a row dated in the future waits until it is due. */
const usable = (at: number, now: number): boolean => Number.isFinite(at) && now - at < NOTE_TTL_MS && at - now <= NOTE_TTL_MS;

function rowOf(x: unknown, now: number): Row | null {
  if (!isPlainRecord(x)) return null;
  const { realm, bot, conn, utt, at } = x;
  if (typeof realm !== 'string' || !ID.test(realm) || typeof bot !== 'string' || !ID.test(bot)) return null;
  if (typeof conn !== 'string' || !CONN.test(conn) || !Number.isSafeInteger(utt) || (utt as number) < 0) return null;
  if (typeof at !== 'number' || !usable(at, now)) return null;
  // Exactly these five fields: anything else a row carried is not kept.
  return { realm, bot, conn, utt: utt as number, at };
}
/** The usable rows of a stored value, oldest first: anything malformed or expired is dropped. */
function rowsOf(v: unknown, now: number): Row[] {
  if (!isPlainRecord(v) || v.v !== 1 || !Array.isArray(v.rows)) return [];
  const out: Row[] = [];
  for (const x of v.rows.slice(-4 * NOTES_CAP)) {
    const r = rowOf(x, now);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.at - b.at);
}
const bytes = (v: unknown): number => JSON.stringify(v).length;
/** The newest rows that fit both bounds. */
function bounded(rows: Row[]): Row[] {
  let keep = rows.slice(-NOTES_CAP);
  while (keep.length && bytes({ v: 1, rows: keep }) > PENDING_MAX_BYTES) keep = keep.slice(1);
  return keep;
}
const mine = (w: VoiceWhere) => (r: Row) => r.realm === w.realm && r.bot === w.bot;
const keyOf = (r: { conn: string; utt: number }): string => `${r.conn}\n${r.utt}`;

export type PendingRead = { s: 'ok'; notes: MaybeSent[] } | { s: 'unreadable' };

/** The maybe-sent notes stored for this Bot, after a reload. */
export function loadPending(w: VoiceWhere, now: number): PendingRead {
  const b = box();
  if (!b || !whereOk(w)) return { s: 'unreadable' };
  let t: ReturnType<Partitioned['readTri']>;
  try {
    t = b.readTri(w.computer);
  } catch {
    return { s: 'unreadable' };
  }
  if (t.s === 'unreadable') return { s: 'unreadable' };
  if (t.s === 'missing') return { s: 'ok', notes: [] };
  const ids: PendingIdentity[] = rowsOf(t.v, now).filter(mine(w)).map((r) => ({ conn: r.conn, utt: r.utt, at: r.at }));
  return { s: 'ok', notes: restorePending(ids, now) };
}

/**
 * Store this Bot's unsettled identities (the machine's pendingOf). `prev` is what this caller last loaded or saved: of
 * this Bot's stored rows, only those in `prev` and no longer in `ids` go (the caller settled or dropped them), and each
 * of `ids` replaces its own stored row. Every other row stays (another tab's on the same Bot, other Bots'), within the
 * bounds. 'nostore': no usable store or a bad identity; nothing was written.
 */
export function savePending(w: VoiceWhere, ids: readonly PendingIdentity[], prev: readonly PendingIdentity[], now: number): StoreUpdate | 'nostore' {
  const b = box();
  if (!b || !whereOk(w)) return 'nostore';
  const add: Row[] = [];
  for (const i of ids) {
    const r = rowOf({ realm: w.realm, bot: w.bot, conn: i.conn, utt: i.utt, at: i.at }, now);
    if (r) add.push(r);
  }
  const gone = new Set(prev.map(keyOf));
  for (const i of ids) gone.add(keyOf(i));
  return write(b, w.computer, (cur) => [...cur.filter((r) => !(mine(w)(r) && gone.has(keyOf(r)))), ...add], now);
}

/** A log row named this exact (conn, utt) for this Bot: its stored row goes. Nothing else settles one. */
export function settlePending(w: VoiceWhere, conn: string, utt: number, now: number): StoreUpdate | 'nostore' {
  const b = box();
  if (!b || !whereOk(w)) return 'nostore';
  return write(b, w.computer, (cur) => cur.filter((r) => !(mine(w)(r) && r.conn === conn && r.utt === utt)), now);
}

function write(b: Partitioned, part: string, fn: (cur: Row[]) => Row[], now: number): StoreUpdate {
  try {
    return b.update(
      (cur) => {
        // A later layout of this entry (v > 1, written by a newer Hub) is left as it is: this code cannot keep its rows.
        if (cur.s === 'ok' && isPlainRecord(cur.v) && typeof cur.v.v === 'number' && cur.v.v > 1) return null;
        const before = cur.s === 'ok' ? rowsOf(cur.v, now) : [];
        const next = bounded(fn(before).sort((x, y) => x.at - y.at));
        if (!next.length) return cur.s === 'ok' ? { remove: true } : null;
        return { set: { v: 1, rows: next } };
      },
      { part },
    );
  } catch {
    return 'failed';
  }
}

/** One Talk session's store of maybe-sent identities for one Bot: the `prev` savePending needs, kept right here. */
export interface PendingSaver {
  /** loadPending, and what it returned becomes what this saver holds. */
  load(now: number): PendingRead;
  /** savePending with what this saver holds; then it holds `ids` (a failed write keeps both, so a later save still
   * removes what it held). An identity this saver settled is left out of `ids`, written or owed: never written back. */
  save(ids: readonly PendingIdentity[], now: number): StoreUpdate | 'nostore';
  /** settlePending; the identity is no longer held. A settle that could not be written is owed: the next save that works
   * removes its row, held or not, and a later load does not show it again. */
  settle(conn: string, utt: number, now: number): StoreUpdate | 'nostore';
}

/**
 * The saver a runner's persist port uses, bound at creation to its computer, realm and Bot (a Bot switch makes a new
 * one). It holds only identities it loaded or saved itself: a future-dated row a load left out is not held, so this
 * saver never removes it.
 */
export function createPendingSaver(w: VoiceWhere): PendingSaver {
  const at: VoiceWhere = { computer: w.computer, realm: w.realm, bot: w.bot };
  let held: PendingIdentity[] = [];
  let owed: PendingIdentity[] = [];
  /** Every identity this saver was told to settle: a log row named it, so no save of it is right any more. */
  const settled = new Set<string>();
  const isOwed = (k: { conn: string; utt: number }): boolean => owed.some((i) => i.conn === k.conn && i.utt === k.utt);
  const copy = (ids: readonly PendingIdentity[]): PendingIdentity[] => ids.map((i) => ({ conn: i.conn, utt: i.utt, at: i.at }));
  return {
    load(now) {
      const r = loadPending(at, now);
      if (r.s !== 'ok') return r;
      const notes = r.notes.filter((n) => !isOwed(n));
      held = notes.map((n) => ({ conn: n.conn, utt: n.utt, at: n.at }));
      return { s: 'ok', notes };
    },
    save(ids, now) {
      // A settled identity (its settle written or owed) is never written back, or its note would show again at a load.
      const keep = ids.filter((i) => !settled.has(keyOf(i)));
      const r = savePending(at, keep, [...held, ...owed], now);
      if (r === 'ok' || r === 'same') {
        held = copy(keep);
        owed = [];
      } else {
        const keys = new Set(held.map(keyOf));
        held = [...held, ...copy(keep).filter((i) => !keys.has(keyOf(i)))];
      }
      return r;
    },
    settle(conn, utt, now) {
      settled.add(keyOf({ conn, utt }));
      const r = settlePending(at, conn, utt, now);
      if (r === 'ok' || r === 'same') {
        held = held.filter((i) => !(i.conn === conn && i.utt === utt));
        owed = owed.filter((i) => !(i.conn === conn && i.utt === utt));
      } else if (!isOwed({ conn, utt })) owed = [...owed, { conn, utt, at: now }];
      return r;
    },
  };
}
