// gates.ts: the session's parked approvals and questions. A gate
// belongs to the session, not to a turn: this book is fed by every gate frame whatever turn it names (or none),
// and by GET /state snapshots ordered against those frames by their {incarnation, seq} watermark. Turns, the
// stored record and the history never add or remove a card; only this book does.
//
// Rules (each from the agent's own evidence):
//   - a decision names ref {id, generation} (the frame envelope's gate, or /state's pending_gate_ref,
//     pending_lead_gate_refs, pending_helper_gate_refs); /state's pending_gate.generation is the lease's, never used;
//   - a gate /state describes without its ref is kept as "addressing": shown, not answerable, read again;
//   - several lead gates can be parked at once (parallel lanes), and helpers' gates outlive the lead turn;
//   - only positive evidence removes a gate: its gate_resolved, the agent_done of the turn it belongs to, or a
//     snapshot provably not older than what showed it; a missing field or a failed read removes nothing;
//   - snapshots reach this book in the order they were taken: the engine applies one only when it was requested
//     after the last applied snapshot (or decision answer) arrived, so a later snapshot is newer in content too. A
//     snapshot's watermark is read before its content (contract), so it orders it against frames only one way: a
//     frame at or below it is in the snapshot; a frame above it may or may not be;
//   - a new incarnation retires every gate of the old one (their ids are refused); a later snapshot or the
//     replayed frames bring the parked ones back under their new ids.
import * as L from './logic';
import type { Gate } from './logic';

type Rec = Record<string, unknown>;
const INC = /^[A-Za-z0-9._:-]{1,128}$/;

export interface SGate {
  /** The addressable id, or 'd:<kind>:<dnum>' for a gate /state shows before its ref is published. */
  key: string;
  gate: Gate;
  /** The helper that parked it (answered in the Agent), or null for the lead's own. */
  helper: string | null;
  addressing: boolean;
  src: 'event' | 'state';
  /** The seq of its opening event, or the watermark of the snapshot that showed it (null: not comparable). A
   *  snapshot's watermark is only a lower bound of the gate's opening seq. */
  at: number | null;
  /** The turn it belongs to as the agent named it (the frame's turn_id, or the snapshot's current_turn_id for a
   *  lead gate), or null when not named. */
  turn: string | null;
}
export interface Book {
  inc: string | null;
  /** Incarnations left behind (the last 32): a read or a frame naming one answers about another history and is dropped. */
  retired: string[];
  /** Moves at every incarnation change this page sees: a read begun before it may name an incarnation this page never
   *  saw (it cannot be told older from newer), so it is read again. */
  epoch: number;
  /** The highest seq applied (the stream cursor of the session). */
  seq: number;
  list: SGate[];
  /** "kind:dnum@seq": gates an event at that seq resolved (a snapshot at or after it is not contradicted). */
  closed: string[];
  /** "id#generation": gates a decision answer settled here (applied, or refused as gone). A late opening frame of
   *  one is not shown again; a snapshot taken after the answer that still holds it shows it (the answer was read
   *  wrong), and older snapshots never reach the book (see above). */
  closedRefs: string[];
}
export interface Resolved { g: SGate; outcome: string; requestId: string }

export function emptyBook(): Book {
  return { inc: null, retired: [], epoch: 0, seq: 0, list: [], closed: [], closedRefs: [] };
}
function copy(b: Book): Book {
  return { ...b, retired: b.retired.slice(), list: b.list.slice(), closed: b.closed.slice(), closedRefs: b.closedRefs.slice() };
}
function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
function num(v: unknown): number | null { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null; }
function kindOf(v: unknown): 'confirm' | 'question' | null { return v === 'confirm' || v === 'question' ? v : null; }
function dnumOf(kind: string, d: Rec): number | null { return num(kind === 'confirm' ? d.gate_id : d.question_id); }

function markClosed(b: Book, kind: string, dnum: number | null, seq: number | null): void {
  if (dnum === null) return;
  const k = kind + ':' + dnum + (seq !== null ? '@' + seq : '');
  if (!b.closed.includes(k)) { b.closed.push(k); if (b.closed.length > 128) b.closed.shift(); }
}
/** Closed by an event newer than the watermark (any closing event when there is no watermark). */
function closedAfter(b: Book, kind: string, dnum: number | null, wm: number | null): boolean {
  if (dnum === null) return false;
  const base = kind + ':' + dnum;
  for (const c of b.closed) {
    if (c === base) return true;
    if (c.startsWith(base + '@') && (wm === null || parseInt(c.slice(base.length + 1), 10) > wm)) return true;
  }
  return false;
}
function retire(b: Book, inc: string): void {
  if (b.inc && !b.retired.includes(b.inc)) { b.retired.push(b.inc); if (b.retired.length > 32) b.retired.shift(); }
  b.inc = inc; b.epoch++; b.seq = 0; b.list = []; b.closed = []; b.closedRefs = [];
}
function sameDnum(g: SGate, kind: string, dnum: number | null): boolean {
  return dnum !== null && g.gate.kind === kind && g.gate.dnum === dnum;
}

export interface FrameOut {
  book: Book; resolved: Resolved[]; changed: boolean; newInc: boolean; unreadable: boolean;
  /** A turn ended and a gate a snapshot showed may have been its (the snapshot named no turn, or another): read again. */
  recheck: boolean;
}

/** One stream envelope (live or caught up). Frames of any turn, or of none, count. */
export function onEnvelope(b0: Book, env: unknown): FrameOut {
  const out: FrameOut = { book: b0, resolved: [], changed: false, newInc: false, unreadable: false, recheck: false };
  if (!L.isObj(env) || num(env.seq) === null || (env.seq as number) < 1 || !L.isObj(env.event)) return out;
  const ev = env.event as Rec, type = str(ev.type), d: Rec = L.isObj(ev.data) ? ev.data : {};
  const inc = str(env.incarnation);
  if (inc && !INC.test(inc)) return out;
  if (inc && b0.retired.includes(inc)) return out;
  const b = copy(b0);
  if (inc && b.inc && inc !== b.inc) { retire(b, inc); out.newInc = true; out.changed = true; }
  else if (inc && !b.inc) { b.inc = inc; b.epoch++; }
  const seq = env.seq as number;
  if (seq <= b.seq) { out.book = b; return out; }
  b.seq = seq;
  out.book = b;
  if (type === 'event.confirm_request' || type === 'event.user_question') {
    const kind = type === 'event.confirm_request' ? 'confirm' : 'question';
    const g = L.gateOf(env.gate, kind, d);
    if (g.invalid) { out.unreadable = true; return out; }   // no addressable identity: a read says what is parked
    // Only a close after it opened, or a decision answer for this very gate, keeps it off.
    if (closedAfter(b, kind, g.dnum, seq) || b.closedRefs.includes(g.id + '#' + g.generation)) return out;
    const helper = str(d.helper_id) || null;
    b.list = b.list.filter((x) => !(x.addressing && sameDnum(x, kind, g.dnum) && x.helper === helper));
    const i = b.list.findIndex((x) => x.key === g.id);
    const sg: SGate = { key: g.id, gate: g, helper, addressing: false, src: 'event', at: seq, turn: str(env.turn_id) || null };
    if (i < 0) b.list.push(sg);
    else if ((b.list[i] as SGate).gate.generation !== g.generation || (b.list[i] as SGate).src === 'state') b.list[i] = sg;
    out.changed = true;
    return out;
  }
  if (type === 'event.gate_resolved') {
    const kind = str(d.kind), dnum = dnumOf(kind, d), ref = L.isObj(env.gate) ? str(env.gate.id) : '';
    const helper = str(d.helper_id) || null;
    markClosed(b, kind, dnum, seq);
    const gone = b.list.filter((x) => (ref ? x.key === ref : false) || (sameDnum(x, kind, dnum) && x.helper === helper));
    if (gone.length) {
      b.list = b.list.filter((x) => !gone.includes(x));
      for (const g of gone) out.resolved.push({ g, outcome: str(d.outcome), requestId: str(d.request_id) });
      out.changed = true;
    }
    return out;
  }
  if (type === 'event.agent_done') {
    // A turn ended. A lead gate whose opening frame came before it was that turn's or an earlier one's (one turn
    // runs at a time, and an earlier turn's end already took its gates). A gate a snapshot showed goes only when the
    // snapshot named this turn: its watermark is no opening seq (it may have parked after this end), so otherwise
    // it stays and is read again. Helpers' gates can outlive the turn.
    const tid = str(env.turn_id);
    const gone: SGate[] = [];
    for (const x of b.list) {
      if (x.helper || x.at === null || x.at >= seq) continue;
      if (x.src === 'event' || (x.turn && tid && x.turn === tid)) gone.push(x);
      else out.recheck = true;
    }
    if (gone.length) {
      b.list = b.list.filter((x) => !gone.includes(x));
      for (const g of gone) { markClosed(b, g.gate.kind, g.gate.dnum, seq); out.resolved.push({ g, outcome: 'ended', requestId: '' }); }
      out.changed = true;
    }
  }
  return out;
}

/** A gate the person's decision provably settled or a refusal named gone: off the screen, and its late opening
 *  frame stays off (ref: the gate's id and generation, for a gate this book no longer holds). */
export function close(b0: Book, key: string, ref?: { id: string; generation: number }): Book {
  const b = copy(b0);
  const g = b.list.find((x) => x.key === key);
  const r = g && !g.addressing ? g.gate.id + '#' + g.gate.generation : ref ? ref.id + '#' + ref.generation : '';
  if (r && !b.closedRefs.includes(r)) { b.closedRefs.push(r); if (b.closedRefs.length > 128) b.closedRefs.shift(); }
  if (g) b.list = b.list.filter((x) => x !== g);
  return b;
}

export interface StateOut {
  book: Book;
  /** The snapshot was of a history left behind, or unreadable: read again. */
  stale: boolean;
  /** A gate is shown without its address (or a pairing was ambiguous): read again soon. */
  addressing: boolean;
  dormant: boolean;
  newInc: boolean;
  /** The watermark, when it is comparable with this book's frames. */
  wm: number | null;
  removed: SGate[];
}

interface Seen { kind: 'confirm' | 'question'; dnum: number | null; helper: string | null; ref: Rec | null; desc: Rec }

/** Pairs the daemon's descriptions with the addressable refs. Refs are published only for gates the daemon still
 *  reports, so the lists can differ in length: a description pairs with a ref only when it is provably that gate
 *  (equal length lists in the same order, or a unique match on type, tool, cause and helper). */
function pairs(descs: Rec[], refs: Rec[], helpers: boolean): Seen[] {
  const out: Seen[] = [];
  const sig = (x: Rec) => [str(x.type), str(x.tool_name), str(x.gate_cause), helpers ? str(x.helper_id) : ''].join('|');
  const sameLen = descs.length === refs.length && descs.every((d, i) => str(d.type) === str((refs[i] as Rec).type));
  const used = new Set<number>();
  for (let i = 0; i < descs.length; i++) {
    const d = descs[i] as Rec, kind = kindOf(d.type);
    if (!kind) continue;
    let ref: Rec | null = null;
    if (sameLen) ref = refs[i] as Rec;
    else {
      const m = refs.map((r, j) => [r, j] as const).filter(([r, j]) => !used.has(j) && sig(r) === sig(d));
      const same = descs.filter((x) => sig(x) === sig(d)).length;
      if (m.length === 1 && same === 1) { ref = m[0]![0]; used.add(m[0]![1]); }
    }
    out.push({ kind, dnum: dnumOf(kind, d), helper: helpers ? str(d.helper_id) || null : null, ref, desc: d });
  }
  return out;
}

/** One GET /state body. */
export function onState(b0: Book, body: unknown): StateOut {
  const out: StateOut = { book: b0, stale: true, addressing: false, dormant: false, newInc: false, wm: null, removed: [] };
  if (!L.isObj(body)) return out;
  const b = copy(b0);
  if (body.live === false) {
    // A dormant record: nothing can be parked; no watermark.
    out.removed = b.list.slice();
    b.list = [];
    out.book = b; out.stale = false; out.dormant = true;
    return out;
  }
  const sinc = str(body.incarnation);
  if (sinc && (!INC.test(sinc) || b.retired.includes(sinc))) return out;
  if (sinc && b.inc && sinc !== b.inc) { out.removed = b.list.slice(); retire(b, sinc); out.newInc = true; }
  else if (sinc && !b.inc) { b.inc = sinc; b.epoch++; }
  const wm = num(body.seq) !== null && sinc && sinc === b.inc ? (body.seq as number) : null;
  if (out.newInc && wm !== null) b.seq = wm;
  out.wm = wm;
  out.stale = false;
  // What the snapshot holds.
  const leadDescs = Array.isArray(body.pending_lead_gates) ? (body.pending_lead_gates as unknown[]).filter(L.isObj) : L.isObj(body.pending_gate) ? [body.pending_gate as Rec] : [];
  const leadRefs = Array.isArray(body.pending_lead_gate_refs) ? (body.pending_lead_gate_refs as unknown[]).filter(L.isObj) : L.isObj(body.pending_gate_ref) ? [body.pending_gate_ref as Rec] : [];
  const helpDescs = Array.isArray(body.pending_helper_gates) ? (body.pending_helper_gates as unknown[]).filter(L.isObj) : [];
  const helpRefs = Array.isArray(body.pending_helper_gate_refs) ? (body.pending_helper_gate_refs as unknown[]).filter(L.isObj) : [];
  const seen: Seen[] = [...pairs(leadDescs, leadRefs, false), ...pairs(helpDescs, helpRefs, true)];
  const cur = str(body.current_turn_id) || null;
  const keep = new Set<SGate>();
  for (const s of seen) {
    if (closedAfter(b, s.kind, s.dnum, wm)) continue;
    if (s.ref) {
      const g = L.gateOf(s.ref, s.kind, s.desc);
      if (g.invalid) { out.addressing = true; continue; }
      // Taken after a decision answer here closed it, and still parked: the answer was read wrong; it shows.
      b.closedRefs = b.closedRefs.filter((r) => r !== g.id + '#' + g.generation);
      const have = b.list.find((x) => x.key === g.id && x.gate.generation === g.generation);
      if (have) {
        const up = have.src === 'state' && wm !== null && (have.at === null || wm > have.at) ? { ...have, at: wm } : have;
        if (up !== have) b.list = b.list.map((x) => (x === have ? up : x));
        keep.add(up);
      } else {
        const sg: SGate = { key: g.id, gate: g, helper: s.helper, addressing: false, src: 'state', at: wm, turn: s.helper ? null : cur };
        b.list = b.list.filter((x) => !(x.addressing && sameDnum(x, s.kind, s.dnum) && x.helper === s.helper));
        b.list.push(sg);
        keep.add(sg);
      }
      continue;
    }
    // Described without its ref: the gate it names is parked. A gate already held with that number stays as it
    // is; otherwise it shows as being addressed, and a read follows.
    const held = b.list.find((x) => !x.addressing && sameDnum(x, s.kind, s.dnum) && x.helper === s.helper);
    if (held) { keep.add(held); continue; }
    out.addressing = true;
    const key = 'd:' + s.kind + ':' + (s.dnum ?? '?') + (s.helper ? ':' + s.helper : '');
    const g = L.gateOf({ id: 'pending', generation: 0 }, s.kind, s.desc);
    g.id = ''; g.generation = -1;
    const have = b.list.find((x) => x.key === key);
    if (have) { const up = { ...have, gate: g }; b.list = b.list.map((x) => (x === have ? up : x)); keep.add(up); }
    else { const sg: SGate = { key, gate: g, helper: s.helper, addressing: true, src: 'state', at: wm, turn: s.helper ? null : cur }; b.list.push(sg); keep.add(sg); }
  }
  // What the snapshot does not hold is gone only when the snapshot is provably not older than what showed it: a
  // frame at or below its watermark, or any earlier snapshot (they arrive here in order, see above).
  const removed: SGate[] = [];
  b.list = b.list.filter((x) => {
    if (keep.has(x)) return true;
    const gone = x.addressing || x.src === 'state' ? true : wm !== null && x.at !== null && wm >= x.at;
    if (gone) removed.push(x);
    return !gone;
  });
  out.removed.push(...removed);
  out.book = b;
  return out;
}

/** The book's stream cursor, when it knows its incarnation. */
export function cursorOf(b: Book): L.Cursor | null {
  return b.inc ? { since: b.seq, incarnation: b.inc } : null;
}
