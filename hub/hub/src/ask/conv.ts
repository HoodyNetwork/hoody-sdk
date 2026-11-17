// conv.ts: the Ask conversation as data. One conversation is one agent session; each turn is
// one logic.ts AskState (the per-turn reducer), and a follow-up that reaches a running turn
// splits it into chunks. Everything here is pure: the engine (engine.ts) owns the network and the clock and calls
// these functions; the components draw `blocks()`.
//
// Rules:
//   - typed text lives in memory only (UserMsg.text); the store holds references (putConv: session, keys, phase);
//   - a send whose outcome is unknown keeps its key and text, and Check status repeats exactly that (C9);
//   - only the text after a turn's last tool call is its reply; earlier text is a Note row in the trail.
import { parseAskMessage } from '@kit/ask';
import type { Img, TextFile } from './attach';
import { addEdit, editOf, settleEdit, turnFiles } from './edits';
import * as L from './logic';
import type { AskRecord, AskState, AskStore, Step } from './logic';

export type SendState = 'sending' | 'unknown' | 'queued' | 'sent' | 'notSent' | 'refused' | 'superseded';
/** How a message is sent: the session's first turn (create, then turns), a turn on an idle session, or a command
 *  read by a running turn at its next step. */
export type Via = 'create' | 'turn' | 'command';

export interface UserMsg {
  id: string;
  text: string;
  at: number;
  key: string;
  via: Via;
  state: SendState;
  turnId: string | null;
  commandId: string | null;
  /** A strings key: why it was not sent (refused/notSent). */
  reason: string;
  /** Images and text files sent with it, in memory only: a retry sends these same bytes. */
  imgs?: Img[];
  files?: TextFile[];
  /** Pictures the agent's record holds for this message (a reopened chat): never bytes, only what names them there. */
  pics?: HistPic[];
  /** A row a reload left whose turn request carried files (the record's wf): its key never takes retyped text. */
  lostFiles?: true;
  /** Sent with "Auto-approve this reply" (`?policy=auto_approve` on its turn). Fixed when its key is born and kept with it:
   *  every request under that key carries it, and a row that cannot go as a turn is not sent at all. In memory only. */
  auto?: true;
  /** A queued follow-up the person pressed Edit or Remove on (in memory only). `sending`: the request to take it back is on its way.
   *  `unknown`: its answer was lost; only a read (Check status) can tell. `taken`: the agent already had it, so it was not taken back.
   *  `off`: this agent cannot take this message back. `closed`: the chat ended first. Absent: Edit and Remove are on offer. */
  wd?: 'sending' | 'unknown' | 'taken' | 'off' | 'closed';
}

/** A follow-up committed into a running turn: the turn's steps from `step` and segments from `seg` follow it. */
/** Where a follow-up joined its turn: after `step` steps and `seg` reply segments, and (`dec`) after that many decided cards. */
export interface Mark { user: string; step: number; seg: number; dec?: number }
/** A decided card, folded to one line where it was decided (after `step` steps of its turn). An answered question: `text` is its
 *  question, `answer` the listed option sent, `typed` an answer the person wrote (never kept: it may hold a secret), `more` how many
 *  further questions the card asked. */
export interface Decided { step: number; kind: 'once' | 'session' | 'deny' | 'answered' | 'declined' | 'elsewhere'; tool: string; text: string; answer?: string; typed?: true; more?: number }

export interface TurnBlock {
  s: AskState;
  /** The messages of this turn, in order: its prompt first, then follow-ups that reached it. */
  users: string[];
  /** Started without its prompt (another client's or a command's turn, an adopted one): `users` holds only follow-ups. */
  noPrompt?: true;
  marks: Mark[];
  decided: Decided[];
  startedAt: number | null;
  endedAt: number | null;
  /** Rebuilt from the transcript: no outcome line, no live state. */
  history: boolean;
  /** History only: this turn's 0-based index in the transcript's turn_boundaries (what fork and trim take), set only when the turn's own
   *  boundary lies inside it (a transcript whose turns and boundaries disagree names no turn). */
  idx?: number;
  /** With `idx`: the boundary (the message index that ends the turn) the page read for it, which a fork re-reads at press. */
  pin?: number;
  /** History only: the agent's summary of the conversation before this turn (it compacted its context and keeps the summary
   *  in place of the earlier messages). Drawn above the turn as a note, never as a message of the person's. */
  summary?: string;
  /** History only, the last turn: the record says its turn failed, but the agent's turn list could not confirm that
   *  this is that turn (its two reads disagreed, or one failed). Neither failed nor done is shown: Check again. */
  unsure?: true;
}

export interface Conv {
  sid: string | null;
  users: Record<string, UserMsg>;
  turns: TurnBlock[];
  /** The conversation was read back with no turn to carry the note, and its last turn's outcome could not be told
   *  (see TurnBlock.unsure): the note shows on its own. */
  unsure?: true;
  /** Messages not attached to a turn yet (sending, unknown, queued, refused), in send order. */
  loose: string[];
  /** Some earlier steps are no longer available (the replay did not reach the turn's start). */
  gapTop: boolean;
}

export function emptyConv(sid: string | null = null): Conv {
  return { sid, users: {}, turns: [], loose: [], gapTop: false };
}

export function current(c: Conv): TurnBlock | null {
  return c.turns.length ? (c.turns[c.turns.length - 1] as TurnBlock) : null;
}

/** A turn still runs (it has not reached its receipt's terminal state). */
export function running(t: TurnBlock | null): boolean {
  return !!t && !t.history && !t.s.terminal;
}

/** Which call a new message takes now. */
export function routeFor(c: Conv): Via {
  if (!c.sid) return 'create';
  const t = current(c);
  return running(t) && !!t?.s.turnId && !t.s.done && !t.s.discarded ? 'command' : 'turn';
}

/** Another message may be sent now: nothing of ours is still in flight or of unknown outcome, loose or the
 *  prompt of a turn the agent has not named yet. A text-less unknown row (a reload lost its text) does not hold
 *  Send: for a first message or turn the next message is its retyped text, under its key (engine send); a
 *  follow-up row never takes new text (it is read back by its command id, or dismissed). */
export function canSendMore(c: Conv): boolean {
  return sendHeldBy(c) === null;
}

/** What holds the next message back: an earlier one still going out (`sending`), or one that may have reached the agent and
 *  needs its Check again (`unknown`, which wins: it never settles by waiting); null when nothing does (canSendMore). */
export function sendHeldBy(c: Conv): 'sending' | 'unknown' | null {
  const heldBy = (id: string): 'sending' | 'unknown' | null => {
    const u = c.users[id];
    return !u ? null : u.state === 'sending' ? 'sending' : u.state === 'unknown' && !!u.text ? 'unknown' : null;
  };
  const t = current(c);
  const ids = [...c.loose, ...(t && running(t) && !t.s.turnId ? t.users : [])];
  let held: 'sending' | 'unknown' | null = null;
  for (const id of ids) {
    const h = heldBy(id);
    if (h === 'unknown') return 'unknown';
    if (h) held = h;
  }
  return held;
}

// ---- turns ----

/** Starts a turn for message `user` (null for a turn another client or a command started). */
export function addTurn(c: Conv, o: { turnId?: string | null; user?: string | null; loose?: boolean; now: number }): Conv {
  const prev = current(c);
  const s = prev ? L.nextTurn(prev.s, { turnId: o.turnId, loose: o.loose }) : L.initial({ turnId: o.turnId, loose: o.loose });
  const users = o.user ? [o.user] : [];
  const t: TurnBlock = { s, users, marks: [], decided: [], startedAt: o.now, endedAt: null, history: false, ...(o.user ? {} : { noPrompt: true as const }) };
  return { ...c, turns: [...c.turns, t], loose: o.user ? c.loose.filter((x) => x !== o.user) : c.loose };
}

/** Applies a reducer action to the current turn. */
export function onTurn(c: Conv, a: L.Action, now?: number): Conv {
  const t = current(c);
  if (!t || t.history) return c;
  const s = L.reduce(t.s, a);
  if (s === t.s) return c;
  const nt: TurnBlock = { ...t, s };
  if (s.terminal && !t.s.terminal) nt.endedAt = now ?? null;
  return { ...c, turns: [...c.turns.slice(0, -1), nt] };
}

export function patchUser(c: Conv, id: string, p: Partial<UserMsg>): Conv {
  const u = c.users[id];
  if (!u) return c;
  return { ...c, users: { ...c.users, [id]: { ...u, ...p } } };
}

export function addUser(c: Conv, u: UserMsg): Conv {
  return { ...c, users: { ...c.users, [u.id]: u }, loose: [...c.loose, u.id] };
}

/** A follow-up reached the running turn (receipt how next_step, or event.command_committed): it is attached
 *  where the turn stands now. */
export function commitIntoTurn(c: Conv, id: string): Conv {
  const t = current(c);
  if (!t || !c.users[id] || t.users.includes(id)) return c;
  const s = L.reduce(t.s, { type: 'split' });
  // A card decided before the follow-up reached the turn (a message queued while an approval waited reaches it only once the
  // approval is answered) stays above it: the decision is the earlier turn's, never an answer to the message.
  const mark: Mark = { user: id, step: s.stepsTotal, seg: s.segs.length - 1, dec: t.decided.length };
  const nt: TurnBlock = { ...t, s, users: [...t.users, id], marks: [...t.marks, mark] };
  return { ...patchUser({ ...c, turns: [...c.turns.slice(0, -1), nt] }, id, { state: 'sent', turnId: t.s.turnId }), loose: c.loose.filter((x) => x !== id) };
}

export function addDecided(c: Conv, d: Omit<Decided, 'step'>): Conv {
  const t = current(c);
  if (!t) return c;
  const nt: TurnBlock = { ...t, decided: [...t.decided, { ...d, step: t.s.stepsTotal }] };
  return { ...c, turns: [...c.turns.slice(0, -1), nt] };
}

/** The frame's command fields, for event.command_committed / event.command_settled (the reducer ignores them). */
export function commandFrame(name: string, data: unknown): { kind: 'committed' | 'settled'; ids: string[]; turnId: string; how: string; state: string; reason: string } | null {
  if (name !== 'command_committed' && name !== 'command_settled') return null;
  if (!L.isObj(data) || !L.isObj(data.event) || data.event.type !== 'event.' + name) return null;
  const d = L.isObj(data.event.data) ? data.event.data : {};
  const ids = Array.isArray(d.command_ids) ? (d.command_ids as unknown[]).filter((x): x is string => L.seg(x)) : [];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return { kind: name === 'command_committed' ? 'committed' : 'settled', ids, turnId: L.seg(d.turn_id) ? d.turn_id : '', how: str(d.how), state: str(d.state), reason: str(d.reason) };
}

// ---- history (GET /sessions/{id}/transcript) ----

const PATH_KEYS = ['path', 'file_path', 'filepath', 'file', 'dir', 'directory'];
function summaryOf(name: string, input: unknown): string {
  if (!L.isObj(input)) return '';
  if (typeof input.command === 'string' && /bash|shell|exec/i.test(name)) return '$ ' + input.command;
  for (const k of PATH_KEYS) if (typeof input[k] === 'string') return input[k] as string;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.url === 'string') return input.url;
  return '';
}

/** How the agent's compaction summary starts: it stores the summary as a user message carrying this fixed first line (its
 *  only mark), followed by the summary. Matched exactly, at the start of the message only. The
 *  agent never answers its summary: a message with these words that got an answer is one a person typed, and stays theirs. */
export const COMPACTION_SUMMARY_PREFIX = '[Summary of earlier conversation, compacted to save context]\n\n';

/**
 * The conversation's finished turns from its transcript, oldest first. A message with a user text block starts a
 * user entry; assistant text goes into the reply segments, a tool_use is a step (closing the segment before it),
 * and a tool_result settles its step. `liveTail`: the messages after the last turn boundary (a turn still running)
 * are left out, because the replay rebuilds that turn.
 */
/** `lastFailed`: the agent's own record of the conversation's last turn says it failed (the record's phase, from its
 *  receipt). Only then does the last transcript turn's close marker read as that failure; a reply that merely ends in
 *  marker text (on any other turn, or a last turn that did not fail) is kept as it was said.
 *  `failCode`: the error code the agent's turn list names for that failed turn. The transcript names no turn, so a trim
 *  between the reads can leave an older failed turn last: a close marker with another code is not that turn's, and
 *  the last turn reads unsure (`unsure` in the result), never failed. An empty code binds nothing: the agent leaves it
 *  empty for an ordinary request failure whose marker still names a code, so any marker reads as before.
 *  `strictCode`: the failure was not this browser's own turn (a cold open), so nothing but the code ties the marker to it:
 *  a marker reads as the failure only when `failCode` names that same code; with an empty code any marker reads unsure. */
export function historyFrom(body: unknown, o: { liveTail: boolean; idOf: (i: number) => string; at: number; lastFailed?: boolean | 'unsure'; failCode?: string; strictCode?: boolean }): { users: UserMsg[]; turns: TurnBlock[]; unsure?: true } {
  const ms = L.isObj(body) && Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  const bounds = L.isObj(body) && Array.isArray(body.turn_boundaries) ? (body.turn_boundaries as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x)) : [];
  const lastEnd = bounds.reduce((m, b) => Math.max(m, b), -1);
  const users: UserMsg[] = [];
  const turns: TurnBlock[] = [];
  const starts: number[] = [];
  let t: TurnBlock | null = null;
  let tStart = 0;
  // The compaction summary waiting for the turn it is drawn above (the next one that starts).
  let summary: string | null = null;
  // The last message read as the summary, until the next message shows it was one (see COMPACTION_SUMMARY_PREFIX).
  let pend: { i: number; blocks: Record<string, unknown>[]; said: string; before: string | null; t: TurnBlock | null } | null = null;
  // A message of the person's at index i: a new turn, or a follow-up inside the current one.
  const person = (i: number, blocks: Record<string, unknown>[], said: string): void => {
    const raw = withoutCommandHeader(said);
    for (const b of blocks) if (b.kind === 'tool_result' && t) settle(t.s, b);
    const { text, pics } = historyPics(raw, blocks);
    if (!text && !pics.length) return;
    const u: UserMsg = { id: o.idOf(users.length), text, at: o.at, key: '', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...(pics.length ? { pics } : {}) };
    users.push(u);
    if (t && bounds.length && !bounds.some((b) => b >= tStart && b < i)) {
      // a follow-up inside the same turn
      const cur: TurnBlock = t;
      const s = L.reduce(cur.s, { type: 'split' });
      t = { ...cur, s, users: [...cur.users, u.id], marks: [...cur.marks, { user: u.id, step: s.stepsTotal, seg: s.segs.length - 1 }] };
      turns[turns.length - 1] = t;
    } else {
      const s = L.initial();
      s.terminal = { state: 'completed', code: '', retryAt: null, effects: false };
      t = { s, users: [u.id], marks: [], decided: [], startedAt: null, endedAt: null, history: true, ...(summary ? { summary } : {}) };
      summary = null;
      tStart = i;
      starts.push(i);
      turns.push(t);
    }
  };
  const end = o.liveTail ? lastEnd + 1 : ms.length;
  for (let i = 0; i < end && i < ms.length; i++) {
    const m = ms[i];
    if (!L.isObj(m) || !Array.isArray(m.blocks)) continue;
    const blocks = (m.blocks as unknown[]).filter(L.isObj);
    if (m.role === 'user') {
      const said = blocks.filter((b) => b.kind === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n');
      // The agent's summary of what it compacted: not a message of the person's, and no turn of its own; the next turn starts fresh.
      // Held until the next message shows whose it is: an answer right after it means a person typed these words.
      if (said.startsWith(COMPACTION_SUMMARY_PREFIX)) {
        pend = { i, blocks, said, before: summary, t };
        const sum = said.slice(COMPACTION_SUMMARY_PREFIX.length).trim();
        if (sum) summary = summary ? summary + '\n\n' + sum : sum;
        t = null;
        continue;
      }
      pend = null;
      person(i, blocks, said);
      continue;
    }
    // The agent answered the "summary": it was the person's message with those words, drawn as theirs (the answer joins its turn).
    if (m.role === 'assistant' && pend) { const p = pend; pend = null; summary = p.before; t = p.t; person(p.i, p.blocks, p.said); }
    if (m.role !== 'assistant' || !t) continue;
    for (const b of blocks) {
      if (b.kind === 'text' && typeof b.text === 'string') {
        const s = t.s;
        s.segs[s.segs.length - 1] += b.text;
        s.replyLen += b.text.length;
      } else if (b.kind === 'tool_use') {
        const s = t.s, name = typeof b.tool_name === 'string' ? b.tool_name : '';
        if (s.segs[s.segs.length - 1] !== '') s.segs.push('');
        const id = typeof b.tool_id === 'string' ? b.tool_id : '';
        s.steps.push({ id, name, summary: summaryOf(name, b.input), ok: null, n: s.stepsTotal, seg: s.segs.length - 1 });
        s.stepsTotal++;
        const e = editOf(id, name, b.input);
        if (e) addEdit(s, e);
        if (s.steps.length > 200) s.steps.shift();
      } else if (b.kind === 'tool_result') settle(t.s, b);
    }
  }
  // A summary with no message after it is drawn on its own (a turn with no prompt and nothing else: no index, no outcome).
  if (summary) {
    const s = L.initial();
    s.terminal = { state: 'completed', code: '', retryAt: null, effects: false };
    turns.push({ s, users: [], noPrompt: true, marks: [], decided: [], startedAt: null, endedAt: null, history: true, summary });
  }
  // The turn index fork and trim take is the turn's place among the boundaries: named only for a turn whose own boundary lies inside it.
  // (Boundaries are ascending; a turn is the messages from its first user text to the next turn's.)
  const sorted = bounds.every((b, i) => i === 0 || b >= (bounds[i - 1] as number));
  if (sorted) {
    turns.forEach((tb, i) => {
      const b = bounds[i];
      if (b !== undefined && b >= (starts[i] as number) && (i + 1 >= starts.length || b < (starts[i + 1] as number))) { tb.idx = i; tb.pin = b; }
    });
  }
  // The last turn, known failed, ends with the daemon's close marker: it reads as the failed outcome it was live.
  const ht = o.lastFailed === true && !o.liveTail ? turns[turns.length - 1] : undefined;
  if (ht) {
    const s = ht.s, last = s.segs.length - 1, f = failedClose(s.segs[last] ?? '');
    if (f.code && (o.failCode || o.strictCode) && f.code !== o.failCode) { ht.unsure = true; return { users, turns, unsure: true }; }
    if (f.code) { s.segs[last] = f.text; s.terminal = { state: 'failed', code: f.code, retryAt: null, effects: false }; }
  }
  const hu = o.lastFailed === 'unsure' && !o.liveTail ? turns[turns.length - 1] : undefined;
  if (hu) hu.unsure = true;
  return { users, turns };
}
function settle(s: AskState, b: Record<string, unknown>): void {
  if (typeof b.tool_id === 'string') settleEdit(s, b.tool_id, L.resultOf(b));
  for (let i = s.steps.length - 1; i >= 0; i--) {
    const st = s.steps[i] as Step;
    if (st.id && st.id === b.tool_id) { s.steps[i] = { ...st, ...L.resultOf(b), ...L.picsOf(st.name, b) }; return; }
  }
}

// ---- what the column draws ----

export interface TrailRow { k: 'step'; step: Step }
export interface NoteRow { k: 'note'; text: string }
export type Row = TrailRow | NoteRow;

export type Block =
  | { k: 'user'; key: string; msg: UserMsg }
  | { k: 'trail'; key: string; rows: Row[]; total: number; shown: number; live: Step | null; failed: boolean; unknown: boolean; done: boolean; ms: number | null }
  | { k: 'reply'; key: string; text: string; streaming: boolean; cut: boolean; cost: number | null; at: number | null; final: boolean; turn?: number;
      /** The final chunk of a finished turn only: how many files the turn's edit tools changed (or may have), a count, never the list. */
      files?: number }
  | { k: 'decided'; key: string; d: Decided }
  | { k: 'outcome'; key: string; state: L.Terminal['state']; code: string; retryAt: string | null; effects: boolean; retry: string | null }
  | { k: 'error'; key: string; code: string; retryAt: string | null }
  | { k: 'unsure'; key: string }
  /** The running turn's Stop got no answer and the turn never showed it ended (AskState.stopUnsure): may have gone through, Check again. */
  | { k: 'stopUnsure'; key: string }
  /** Hooks held a step: the trust card, once, after the last turn with such a step. */
  | { k: 'hooks'; key: string }
  /** The agent's summary of the conversation before this turn (TurnBlock.summary). */
  | { k: 'summary'; key: string; text: string };

export const SHOW_STEPS = 5;

/**
 * The column, top to bottom. `expanded` names trails the person opened (by key) and `all` the ones showing every
 * step. now: the clock for a running turn's duration.
 */
export function blocks(c: Conv, now: number): Block[] {
  const out: Block[] = [];
  let heldTurn = -1;
  c.turns.forEach((t, ti) => { if (t.s.steps.some((x) => x.held)) heldTurn = ti; });
  c.turns.forEach((t, ti) => {
    if (t.summary) out.push({ k: 'summary', key: 'c' + ti, text: t.summary });
    const live = running(t);
    // The first chunk opens with the turn's prompt. A turn started without it (noPrompt: a chat opened while another client's turn
    // runs) holds only follow-ups in `users`, and each of those is drawn at its own mark: never a second time as the prompt.
    const cuts = [{ user: t.noPrompt ? '' : (t.users[0] ?? ''), step: 0, seg: 0 }, ...t.marks];
    cuts.forEach((m, ci) => {
      const next = cuts[ci + 1];
      const lastChunk = !next;
      const u = m.user ? c.users[m.user] : undefined;
      if (u) out.push({ k: 'user', key: 'u' + u.id, msg: u });
      const stepEnd = next ? next.step : Number.MAX_SAFE_INTEGER;
      const segEnd = next ? next.seg : t.s.segs.length;
      const steps = t.s.steps.filter((x) => x.n >= m.step && x.n < stepEnd);
      const total = (next ? next.step : t.s.stepsTotal) - m.step;
      const replyIdx = segEnd - 1;
      const rows: Row[] = [];
      let noteAt = m.seg;
      const pushNotes = (upTo: number) => {
        for (; noteAt < upTo && noteAt < replyIdx; noteAt++) {
          const text = (t.s.segs[noteAt] ?? '').trim();
          if (text) rows.push({ k: 'note', text });
        }
      };
      for (const st of steps) { pushNotes(st.seg); rows.push({ k: 'step', step: st }); }
      if (total > 0 || rows.length) {
        const liveStep = live && lastChunk ? [...steps].reverse().find((x) => x.ok === null) ?? null : null;
        const first = steps.find((x) => x.at !== undefined), last = [...steps].reverse().find((x) => x.end !== undefined || x.at !== undefined);
        const span = lastChunk && t.startedAt !== null ? (t.endedAt ?? (live ? now : null)) : null;
        const ms = span !== null && t.startedAt !== null ? span - t.startedAt : first && last ? (last.end ?? last.at ?? 0) - (first.at ?? 0) : null;
        out.push({ k: 'trail', key: 't' + ti + ':' + ci, rows, total, shown: steps.length, live: liveStep, failed: steps.some((x) => x.ok === false && !x.unknown), unknown: steps.some((x) => !!x.unknown), done: !live || !lastChunk, ms });
      }
      // A decided card belongs to the chunk it was decided in: by the count of cards decided before each mark when the mark keeps it
      // (a card decided at the very step a follow-up joined is above it), else by its step.
      t.decided.forEach((d, di) => {
        const from = m.dec !== undefined ? di >= m.dec : d.step >= m.step;
        const to = !next ? true : next.dec !== undefined ? di < next.dec : d.step < stepEnd;
        if (from && to) out.push({ k: 'decided', key: 'd' + ti + ':' + d.step + ':' + d.kind, d });
      });
      const raw = replyIdx >= m.seg ? t.s.segs[replyIdx] ?? '' : '';
      const text = lastChunk && (t.s.terminal?.state === 'failed' || !!t.s.error?.code) ? failedClose(raw).text : raw;
      const streaming = live && lastChunk;
      if (text || streaming) {
        out.push({ k: 'reply', key: 'r' + ti + ':' + ci, text, streaming, cut: lastChunk && t.s.cut, cost: lastChunk ? t.s.cost : null, at: lastChunk ? t.endedAt : null, final: lastChunk && !live, ...(lastChunk && !live && t.history && t.idx !== undefined ? { turn: t.idx } : {}), ...(lastChunk && !live && turnFiles(t.s) > 0 ? { files: turnFiles(t.s) } : {}) });
      }
    });
    // A transcript turn has an outcome only when it failed (its close marker); it is never retried from history.
    if (t.s.terminal && (!t.history || t.s.terminal.state === 'failed')) {
      const tm = t.s.terminal;
      if (tm.state !== 'completed') {
        const first = t.users[0] ? c.users[t.users[0]] : undefined;
        out.push({ k: 'outcome', key: 'o' + ti, state: tm.state, code: tm.code, retryAt: tm.retryAt ?? t.s.error?.retryAt ?? null, effects: tm.effects, retry: tm.state === 'failed' && first && !t.history ? first.id : null });
      }
    } else if (live && t.s.error && t.s.error.code) {
      out.push({ k: 'error', key: 'e' + ti, code: t.s.error.code, retryAt: t.s.error.retryAt });
    }
    if (t.history && t.unsure) out.push({ k: 'unsure', key: 'q' + ti });
    if (live && t.s.stopUnsure) out.push({ k: 'stopUnsure', key: 's' + ti });
    if (ti === heldTurn) out.push({ k: 'hooks', key: 'h' + ti });
  });
  if (c.unsure && !c.turns.length) out.push({ k: 'unsure', key: 'q' });
  for (const id of c.loose) {
    const u = c.users[id];
    if (u) out.push({ k: 'user', key: 'u' + u.id, msg: u });
  }
  return out;
}

/** One turn this viewer saw run, for Details > Usage (ConvSnapshot.usage). */
export interface UsageEntry {
  key: string; turn: number; asked: string;
  /** The turn started without its prompt (TurnBlock.noPrompt): its blank question is known, not missing. */
  promptless?: true;
  responses: readonly L.ResponseCounts[];
  /** mergeUsage's own: the turn's responses as the separate runs the views saw (`responses` is them in order), never shown. */
  runs?: readonly (readonly L.ResponseCounts[])[];
}
/**
 * The turns whose foreground responses the stream reported (AskState.responses), in order: one entry per turn, read from the turn and
 * never from its blocks, so a turn whose last chunk has no reply text (and so no reply block) keeps its responses, and each turn is
 * named by its own prompt (one that drew no block never names the next turn; a turn started without its prompt is named by none,
 * never by a follow-up). `key`: the agent's turn id (t:<id>), which follow-ups and transcript rebuilds keep; a turn without one (a
 * loose turn not named yet) is keyed by its prompt row (p:<row>), else its place (i:<index>). `turn`: the 1-based place among the
 * turns shown; `asked`: '' when the prompt is not shown. A turn with none (read from history, every count unreadable) is not listed.
 */
export function usageTurns(c: Conv): UsageEntry[] {
  const out: UsageEntry[] = [];
  c.turns.forEach((t, ti) => {
    if (t.s.responses.length === 0) return;
    const prompt = !t.noPrompt && t.users[0] ? c.users[t.users[0]] : undefined;
    const key = t.s.turnId ? 't:' + t.s.turnId : t.users[0] && !t.noPrompt ? 'p:' + t.users[0] : 'i:' + ti;
    out.push({ key, turn: ti + 1, asked: prompt?.text ?? '', ...(t.noPrompt ? { promptless: true as const } : {}), responses: t.s.responses });
  });
  return out;
}
/**
 * `kept` (what an earlier view of the same session listed, or several views' merged lists) brought up to date with `now` (C.usageTurns of
 * the view shown), so a conversation rebuilt from its transcript, whose turns carry no counts, keeps what this viewer saw stream. Kept
 * order first; new turns follow in order. A turn in both:
 * - responses: `now`'s run joined to the kept runs (addRun);
 * - question: the kept one when it is known (shown, or known blank because the turn started without its prompt), else the shown one,
 *   since a reopened turn's is read from the transcript's tail, which may be a follow-up;
 * - place: its current one.
 */
/** Entries as Snapshot.usage shows them: mergeUsage's runs left out. */
export function shownUsage(list: readonly UsageEntry[]): UsageEntry[] {
  return list.map(({ runs: _runs, ...e }) => e);
}
export function mergeUsage(kept: readonly UsageEntry[], now: readonly UsageEntry[]): UsageEntry[] {
  const at = new Map(now.map((e) => [e.key, e]));
  const entry = (k: UsageEntry, runs: readonly (readonly L.ResponseCounts[])[], o: { turn: number; asked: string; promptless?: true }): UsageEntry => ({
    key: k.key, turn: o.turn, asked: o.asked, ...(o.promptless ? { promptless: true as const } : {}), responses: runs.flat(), runs,
  });
  const out = kept.map((k): UsageEntry => {
    const n = at.get(k.key);
    const runs = k.runs ?? [k.responses];
    if (!n) return k.runs ? k : entry(k, runs, k);
    const known = k.asked !== '' || !!k.promptless;
    return entry(k, addRun(runs, n.responses), { ...(known ? k : n), turn: n.turn });
  });
  const had = new Set(kept.map((e) => e.key));
  for (const e of now) if (!had.has(e.key)) out.push(entry(e, e.responses.length ? [e.responses] : [], e));
  return out;
}
const sameCounts = (a: L.ResponseCounts, b: L.ResponseCounts) => a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite;
/**
 * `y` laid on `x`, both one contiguous run of a turn's responses in order: at the first place of `x` where every response both hold
 * has the same four counts, with what runs past `x` added; null when there is no such place.
 */
function lay(x: readonly L.ResponseCounts[], y: readonly L.ResponseCounts[]): readonly L.ResponseCounts[] | null {
  for (let o = 0; o < x.length; o++) {
    const n = Math.min(y.length, x.length - o);
    let ok = true;
    for (let i = 0; i < n && ok; i++) ok = sameCounts(x[o + i]!, y[i]!);
    if (ok) return n === y.length ? x : x.concat(y.slice(n));
  }
  return null;
}
/**
 * One view's run of a turn's responses (contiguous, in order: a replay may start past the first ones and a live view adds at the end;
 * the frames carry no request id) joined to the runs kept for the turn, which share no response: the run absorbs every kept run it
 * overlaps (laid one on the other either way), again until none is left, and takes the place of the first it absorbed; a run that
 * overlaps none is added after them. So views that saw separate parts (one behind another, or each after a gap) keep each response
 * once, and one that reads them again adds nothing. Two responses of one turn with the same four counts, one in each of two runs that
 * meet there, are taken for one: without a request id they cannot be told apart.
 */
function addRun(runs: readonly (readonly L.ResponseCounts[])[], run: readonly L.ResponseCounts[]): readonly (readonly L.ResponseCounts[])[] {
  if (!run.length) return runs;
  let cur = run, first = -1, left = runs.map((r, i) => ({ r, i })), joined = true;
  while (joined) {
    joined = false;
    const rest: typeof left = [];
    for (const x of left) {
      const j = lay(x.r, cur) ?? lay(cur, x.r);
      if (j) { cur = j; joined = true; if (first < 0 || x.i < first) first = x.i; } else rest.push(x);
    }
    left = rest;
  }
  const out = left.map((x) => x.r);
  const at = first < 0 ? out.length : left.filter((x) => x.i < first).length;
  out.splice(at, 0, cur);
  return out;
}

/** The status line, or null at rest. */
export type Status = 'working' | 'waiting' | 'stopping' | 'reconnecting' | 'lost' | null;
export function statusOf(c: Conv, conn: { lost: boolean; reconnecting: boolean }): Status {
  const t = current(c);
  if (!running(t)) return null;
  if (conn.lost) return 'lost';
  if (conn.reconnecting) return 'reconnecting';
  const ph = L.phase((t as TurnBlock).s);
  return ph === 'waiting' ? 'waiting' : ph === 'stopping' ? 'stopping' : 'working';
}

/** A title for Recent: the first message (an action's message: its one-line request), cut to 48 code points. */
export function titleOf(text: string): string {
  const one = (parseAskMessage(text).title ?? text).replace(/\s+/g, ' ').trim();
  const cps = Array.from(one);
  return cps.length > 48 ? cps.slice(0, 47).join('') + '…' : one;
}

// ---- the store: references only (hub_ask_v1) ----
// A computer may hold several conversations (Recent); the first record of a slot (account, project, computer,
// realm) is its current conversation. Records are matched by their create key k1. Saving a record keeps its place;
// only `promote` (open from Recent) and a new conversation move it to the front. At most MAX_RECS per account:
// the oldest finished ones go first.

function cloneStore(store: AskStore | null): AskStore {
  const out: AskStore = { v: 1, a: {} };
  const src = store && store.a ? store.a : {};
  for (const k in src) if (L.own(src, k)) out.a[k] = (src[k] as AskRecord[]).slice();
  return out;
}
const LIVE: Readonly<Record<string, 1>> = { opening: 1, sending: 1, working: 1, waiting: 1, stopping: 1, finishing: 1, unknown: 1 };
export function isLivePhase(ph: string): boolean { return L.own(LIVE, ph); }

/** A Recent row's state. A send whose outcome is unknown is its own state: never Running, Failed or Done (C9). */
export type RowState = 'Waiting' | 'Unknown' | 'Running' | 'Failed' | 'Stopped' | 'Interrupted' | 'Gone' | 'Done';
export function rowState(ph: string): RowState {
  if (ph === 'waiting') return 'Waiting';
  if (ph === 'unknown') return 'Unknown';
  if (isLivePhase(ph)) return 'Running';
  if (ph === 'failed') return 'Failed';
  if (ph === 'cancelled') return 'Stopped';
  if (ph === 'interrupted') return 'Interrupted';
  if (ph === 'gone') return 'Gone';
  return 'Done';
}

/** The phase Recent shows for a stored conversation: its turn's own, except that a turn that ended while a message
 *  after it is still unsettled (a queued or maybe-sent follow-up, a pending turn key, one another tab's newer key
 *  replaced) reads as unknown until fresh proof or Dismiss settles it (C9: never Done over an unsettled message). */
export function recentPhase(rec: Pick<AskRecord, 'ph' | 'k3' | 'w' | 'kw'> & Partial<Pick<AskRecord, 't' | 'u'>>): string {
  if (isLivePhase(rec.ph) || rec.ph === 'gone') return rec.ph;
  // A turn whose failure the turn list could not confirm reads unknown too.
  return rec.k3?.length || rec.w || rec.kw?.length || (!!rec.u && rec.u === rec.t) ? 'unknown' : rec.ph;
}

function bound(list: AskRecord[]): AskRecord[] {
  const out = list.slice();
  while (out.length > L.MAX_RECS) {
    let i = out.length - 1;
    while (i > 0 && isLivePhase((out[i] as AskRecord).ph)) i--;
    out.splice(i > 0 ? i : out.length - 1, 1);
  }
  return out;
}

export const validAccount = (account: string): boolean => /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/.test(account);
/** Whether putConv would take this record for this account (a valid record, a valid account). */
export const validPut = (account: string, rec: AskRecord): boolean => validAccount(account) && L.validRec(rec) !== null;
/** The store with rec saved in place (a new record goes first). Null for an invalid record or account. */
export function putConv(store: AskStore | null, account: string, rec: AskRecord, o: { front?: boolean } = {}): AskStore | null {
  const r = L.validRec(rec);
  if (!r || !validAccount(account)) return null;
  const out = cloneStore(store);
  const list = out.a[account] || [];
  const i = list.findIndex((x) => x.k1 === r.k1 && x.p === r.p && x.c === r.c && x.r === r.r);
  if (i >= 0 && !o.front) list[i] = r;
  else { if (i >= 0) list.splice(i, 1); list.unshift(r); }
  out.a[account] = bound(list);
  return out;
}

/** The store without the record of create key k1 in that slot (null when nothing changed). */
export function dropConv(store: AskStore | null, account: string, slot: { p: string; c: string; r: string }, k1: string): AskStore | null {
  const out = cloneStore(store);
  const list = out.a[account];
  if (!list) return null;
  const next = list.filter((x) => !(x.p === slot.p && x.c === slot.c && x.r === slot.r && x.k1 === k1));
  if (next.length === list.length) return null;
  if (next.length) out.a[account] = next; else delete out.a[account];
  return out;
}

// ---- the dock store takes per-key operations, never a snapshot ----
/** One change to the dock's record list. `put`: save this record (identity = k1 + p + c + r); `drop`: remove that record's reference. */
export type DockOp =
  | { k: 'put'; rec: AskRecord; front?: boolean }
  | { k: 'drop'; p: string; c: string; r: string; k1: string };
/** A dock store's answer: kept, not kept, or refused by the capacity rule (every other record is live, unknown or holds evidence). */
export type DockAnswer = boolean | 'recentFull';
type Identity = Pick<AskRecord, 'k1' | 'p' | 'c' | 'r'>;
/** The one identity of a dock record (putConv, overlayOp, the journal's extras and the engine's ops all match on it). */
export const sameRec = (a: Identity, b: Identity): boolean => a.k1 === b.k1 && a.p === b.p && a.c === b.c && a.r === b.r;
export const idKey = (r: Identity): string => JSON.stringify([r.k1, r.p, r.c, r.r]);
/** The op applied to an in-memory store (stores without a journal): the same result putConv / dropConv give. Null: nothing to write. */
export function applyOp(store: AskStore | null, account: string, op: DockOp): AskStore | null {
  return op.k === 'put' ? putConv(store, account, op.rec, { front: op.front }) : dropConv(store, account, op, op.k1);
}
/** The op shown on a list (display only, no capacity rule and no evidence merge): a put replaces in place, moves to the front with
 *  `front`, or inserts at the front; a drop removes. */
export function overlayOp(list: readonly AskRecord[], op: DockOp): AskRecord[] {
  const out = list.slice();
  if (op.k === 'drop') return out.filter((x) => !sameRec(x, op));
  const r = L.validRec(op.rec);
  if (!r) return out;
  const i = out.findIndex((x) => sameRec(x, r));
  if (i >= 0 && !op.front) out[i] = r;
  else { if (i >= 0) out.splice(i, 1); out.unshift(r); }
  return out;
}

/** The slot's conversations, current first. */
export function convsFor(store: AskStore | null, account: string, slot: { p: string; c: string; r: string }): AskRecord[] {
  const list = store && L.own(store.a, account) ? (store.a[account] as AskRecord[]) : [];
  // A fork whose create has no session yet is not a conversation: the page shows it by its own row (fork.ts), never as an empty chat.
  return list.filter((x) => x.p === slot.p && x.c === slot.c && x.r === slot.r && !(x.fk && !x.s));
}

/** Records of this account whose conversation waits on a card (the "needs you" dot). */
export function waitingRecs(store: AskStore | null, account: string): AskRecord[] {
  const list = store && L.own(store.a, account) ? (store.a[account] as AskRecord[]) : [];
  return list.filter((x) => x.ph === 'waiting' && !!x.s);
}

/**
 * A reply without the daemon's closing marker. A turn that did not complete ends its history with one text chunk
 * such as "[response interrupted: cancelled by the user]" (daemon sendTurnClose); the column already says
 * "Stopped" from the turn's outcome, so the marker is never shown.
 */
export function withoutCloseMarker(text: string): string {
  return text.replace(/\s*\[response interrupted: [^\]\n]{1,80}\]\s*$/, '');
}

// A failed turn's close marker, exactly as the daemon writes it (its turn close, and the delegated
// rejection close): the marker alone, or after the partial reply and a blank line. Matched only on a turn known to
// have failed: live, by its outcome or error frame; in a transcript, only the last turn when the agent's record says
// that turn failed. Any other reply keeps its text.
const FAILED_MARK = /(?:^|\n\n)\[response failed: ([a-z0-9_.-]{1,64})\]\s*$/;
/** text without a failed turn's close marker, and the code the marker named ('' when there was none). */
export function failedClose(text: string): { text: string; code: string } {
  const m = FAILED_MARK.exec(text);
  return m ? { text: text.slice(0, m.index), code: m[1] as string } : { text, code: '' };
}

/**
 * A transcript user message without the daemon's command header. A message sent through /commands is stored as
 * "[Message from the user while you were working, sent <time> — …]\n<text>" (or "[Message from …, sent <time>]")
 * for the model; the column shows only what the person wrote.
 */
/** One picture of a message in the agent's record: its id there (absent when the agent cannot serve it), its type and size,
 *  and the file's name when the message's own text names it. */
export interface HistPic { id: string | null; name: string; media?: string; bytes?: number }

const PIC_LINE = /^\[Image: ([^\]\n]{1,200})\]$/;
const PIC_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PIC_BLOCKS_MAX = 16;
/** A user message's pictures, from its image blocks (an agent that keeps none sends none, and then nothing here changes). The
 *  agent writes one "[Image: name]" line per attached picture at the top of the message's text, but none for a picture placed
 *  inside the text (a terminal client's "[Image #1]"), and its record does not say which block was which. So the leading lines
 *  are names only when there are exactly as many as image blocks (then they pair in order, and are dropped from the text with
 *  the blank line after them); with any other count the pictures have no names and the text stays as the agent gave it. A
 *  line the person typed themselves is never taken, since without image blocks no line is. */
export function historyPics(text: string, blocks: readonly Record<string, unknown>[]): { text: string; pics: HistPic[] } {
  const imgs = blocks.filter((b) => b.kind === 'image').slice(0, PIC_BLOCKS_MAX);
  if (!imgs.length) return { text, pics: [] };
  const lines = text.split('\n'), lead: string[] = [];
  for (const l of lines) {
    const m = PIC_LINE.exec(l);
    if (!m) break;
    lead.push(m[1] as string);
  }
  const named = lead.length === imgs.length && blocks.filter((b) => b.kind === 'image').length === imgs.length;
  let rest = lines.slice(lead.length);
  if (named && rest.length && rest[0] === '') rest = rest.slice(1);
  const pics = imgs.map((b, i): HistPic => {
    const id = typeof b.image_id === 'string' && /^[0-9a-f]{64}$/.test(b.image_id) ? b.image_id : null;
    const media = typeof b.media_type === 'string' && PIC_MEDIA.has(b.media_type) ? b.media_type : undefined;
    const bytes = typeof b.bytes === 'number' && Number.isSafeInteger(b.bytes) && b.bytes > 0 ? b.bytes : undefined;
    return { id: id && media ? id : null, name: named ? lead[i] as string : '', ...(media ? { media } : {}), ...(bytes !== undefined ? { bytes } : {}) };
  });
  return { text: named ? rest.join('\n') : text, pics };
}

export function withoutCommandHeader(text: string): string {
  return text.replace(/^\[Message from [^\]\n]{1,60}?(?: while you were working)?, sent [^\]\n]{1,120}\]\n/, '');
}
