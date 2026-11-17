// The Talk state machine of a Bot's voice connection, engine-free: a pure
// reducer `step(state, event, now)` that returns the next state and the effects the binding must run (open or close the
// socket, send a frame, send audio, stop the tracks, flush playback, cancel a turn, schedule a timer). No socket, audio
// device, timer or React lives here, so every transition is a unit test.
// What it promises:
//   - Generation fence: every async event names the generation it was started under. One from an older generation
//     changes nothing; a microphone grant that arrives late only stops its tracks.
//   - It is the only allocator of input seq numbers: captured audio comes in as an `audio` event and leaves as a
//     `sendAudio` effect with the next seq, or is dropped (push to talk released, muted). Audio is never resent.
//   - An utterance is "sent" only on transcript.final with its message_id. On a loss every utterance seen but
//     not settled becomes a "may have been sent" note, and audio sent while no utterance was seen open becomes one
//     "uncorrelated" note. A maybe-sent note settles only on a log row naming its exact (conn, utt); nothing else
//     (sender, text, time) counts. An uncorrelated note never settles.
//   - Mute ends what is open first: push to talk sends ptt.up (after one 20 ms zero frame when nothing was sent since
//     ptt.down); hands-free sends zeros in place of the microphone for at least 800 ms, until every vad.start seen has
//     its vad.end, at most 3 s, and commits an open utterance.
//   - Stop answer acts only on the turn captured at the press; a newer turn is never cancelled. It resolves only on
//     evidence that the captured turn ended, and says "may not have stopped" after 15 s without it.
//   - Every new session starts with seq 0 and no utterances; notes carry over.
import type { ClientFrame, ServerFrame } from './wire';
import { closeKind, encodeClientFrame } from './wire';

export type Mode = 'vad' | 'ptt';
export type Phase =
  | 'off'
  | 'starting'
  | 'notReady'
  | 'checkUnknown'
  | 'denied'
  | 'noDevice'
  | 'playbackBlocked'
  | 'connecting'
  | 'busyElsewhere'
  | 'budget'
  | 'connectFailed'
  | 'live'
  | 'muting'
  | 'muted'
  | 'reconnecting'
  | 'ended';
export type Mic = 'ptt-idle' | 'ptt-held' | 'latched' | 'vad';
export type EndReason = 'user' | 'takenOver' | 'closed' | 'lost' | 'protocol';

export type UttState = 'open' | 'awaiting' | 'settled';
export type UttOutcome =
  | { kind: 'sent'; messageId: string }
  | { kind: 'noSpeech' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'failed'; reason: string };
export interface Utt {
  state: UttState;
  outcome?: UttOutcome;
}

/** A spoken message whose fate is not known: settled only by a log row naming its exact (conn, utt). */
export interface MaybeSent {
  kind: 'maybeSent';
  conn: string;
  utt: number;
  at: number;
  settled?: { seq: number };
}
/** Audio was sent with no utterance seen open, then the connection was lost: it may have become a message. Never settles. */
export interface Uncorrelated {
  kind: 'uncorrelated';
  conn: string;
  at: number;
}
export type Note = MaybeSent | Uncorrelated;

export type StopOutcome = 'stopped' | 'alreadyFinished' | 'mayNotHaveStopped';
export interface Stop {
  /** Names this Stop answer: results of an earlier one (Bot view reads, cancelBotTurn answers) carry another id. */
  id: number;
  turnId: string;
  at: number;
  /** Which output.cancel of this connection the stop sent (1-based): its answer is that cancel.result. */
  cancelNo: number;
  /** output.cancel's answer, when it came. */
  result?: 'cancelled' | 'turn_continues' | 'not_active';
  /** cancelBotTurn was sent (and how many times: one resend is allowed). */
  turnCancels: number;
  outcome?: StopOutcome;
}

/** The agent capabilities the machine acts on (from the agent's capability list; both off until the binding says so). */
export interface VoiceCaps {
  /** bot_voice_stop_speech: output.cancel takes keep_turn (Stop speaking). */
  stopSpeech: boolean;
  /** bot_voice_text_key: text takes a key and is answered by one text.result. */
  textKey: boolean;
}

/** The reply open on this connection (reply.provisional or a reply output.start, until its reply.final). */
export interface OpenReply {
  turnId: string;
  /** Stop speaking was sent for it: its later text is not spoken. */
  speechStopped: boolean;
}

/**
 * A keyed typed message, by key. pending: sent on this connection, no text.result yet. posted, queued, dropped, refused,
 * unknown: the agent's text.result (unknown: read GET …/messages/by-key/{key} before sending again). dropped: the Bot took
 * the message, then dropped it before it was posted; it never will be, `reason` says why, and its key is spent (the same
 * words go again only under a new key). lost: the connection ended before the answer, so it may have arrived: read it by
 * its key as for unknown.
 */
export interface TextSend {
  state: 'pending' | 'posted' | 'queued' | 'dropped' | 'refused' | 'unknown' | 'lost';
  conn: string;
  at: number;
  messageId?: string;
  /** With dropped: why (read as plain text). */
  reason?: string;
  code?: string;
  message?: string;
}

export interface Refusal {
  code: string;
  message: string;
  retryAfterSecs?: number;
}

export interface VoiceState {
  phase: Phase;
  /** Fences async results: bumped on every start, end and new connection attempt. */
  gen: number;
  mode: Mode;
  speak: boolean;
  /** The connection (from its session frame), while one is up. */
  conn?: string;
  epoch?: number;
  mic: Mic;
  /** The last input seq sent on this connection (0: none). */
  seq: number;
  utts: Readonly<Record<number, Utt>>;
  /** Audio was sent since the last utterance was seen open (it is not tied to any utterance yet). */
  loose: boolean;
  /** Push to talk: when the press began, and whether audio went out since. */
  pttDownAt?: number;
  sentSinceDown: boolean;
  /** Muting: when the drain began, and the switch to make after it, if any. */
  drainAt?: number;
  pendingSwitch?: { mode: Mode; speak: boolean };
  reconnectTries: number;
  refusal?: Refusal;
  ended?: EndReason;
  stop?: Stop;
  /** The last Stop answer's id. */
  stops: number;
  /** output.cancel frames sent and cancel.result frames read on this connection: the agent answers each cancel once, in order. */
  cancelsSent: number;
  cancelsRead: number;
  notes: readonly Note[];
  caps: VoiceCaps;
  reply?: OpenReply;
  /** Replies of this connection that ended (their reply.final) or were followed by a newer one: never opened again. */
  pastReplies: readonly string[];
  /** Keyed typed messages, by key: at most TEXTS_CAP (settled ones leave first, oldest first). */
  texts: Readonly<Record<string, TextSend>>;
}

export type StartResult = 'ready' | 'notReady' | 'checkUnknown' | 'denied' | 'noDevice' | 'playbackBlocked';

export type VoiceEvent =
  /** The person pressed Talk (or Talk again / Try again). */
  | { type: 'press' }
  /** The press handler's three promises (resume, getUserMedia, voice/check) settled. */
  | { type: 'started'; gen: number; result: StartResult }
  | { type: 'tryAnyway' }
  | { type: 'takeOver' }
  /** The stream slot or the one-tab lock was refused before the socket opened. */
  | { type: 'slotRefused'; gen: number }
  | { type: 'frame'; gen: number; frame: ServerFrame }
  | { type: 'closed'; gen: number; code: number }
  /** One captured frame (20 to 200 ms) from the microphone. */
  | { type: 'audio'; gen: number; pcm: Int16Array }
  | { type: 'pttDown' }
  | { type: 'pttUp' }
  | { type: 'mute' }
  | { type: 'unmute' }
  | { type: 'switch'; mode: Mode; speak: boolean }
  /** A timer the machine asked for, or the binding's regular tick. */
  | { type: 'tick'; gen: number }
  | { type: 'stopAnswer'; turnId: string }
  /** The agent capabilities (bot_voice_stop_speech, bot_voice_text_key), whenever the binding reads them. */
  | { type: 'caps'; caps: VoiceCaps }
  /** Stop speaking: the open reply's speech stops, its turn goes on (only with bot_voice_stop_speech; see canStopSpeaking). */
  | { type: 'stopSpeaking' }
  /** A typed message under the caller's idempotency key (only with bot_voice_text_key; see canSendText). */
  | { type: 'sendText'; text: string; key: string }
  /** The Bot view during Stop answer (polled every 2 s). */
  | { type: 'botView'; stop: number; running: boolean; turnId?: string }
  | { type: 'turnCancelResult'; stop: number; result: 'matched' | 'notMatched' | 'failed' }
  /** A log row carrying the voice identity: settles a maybe-sent note naming it exactly. */
  | { type: 'logRow'; seq: number; conn: string; utt: number }
  | { type: 'end' }
  /** Navigation, a realm or account change, the page hidden: everything stops. */
  | { type: 'stale' };

export type Effect =
  | { type: 'open'; gen: number; mode: Mode; speak: boolean; takeover: boolean; require?: 'stt' | 'stt,tts' }
  | { type: 'close' }
  | { type: 'stopTracks' }
  | { type: 'send'; frame: ClientFrame }
  | { type: 'sendAudio'; seq: number; pcm: Int16Array }
  | { type: 'flushPlayback' }
  | { type: 'cancelTurn'; stop: number; turnId: string }
  | { type: 'timer'; gen: number; ms: number }
  | { type: 'persist' };

export const PTT_LATCH_MS = 250;
export const DRAIN_MIN_MS = 800;
export const DRAIN_MAX_MS = 3000;
export const RECONNECT_TRIES = 3;
export const STOP_CANCEL_WAIT_MS = 3000;
export const STOP_GIVE_UP_MS = 15000;
export const NOTES_CAP = 32;
export const NOTE_TTL_MS = 24 * 3600 * 1000;
export const TEXTS_CAP = 32;
export const PAST_REPLIES_CAP = 16;
const ZERO_FRAME_SAMPLES_16K = 320;
const U32_MAX = 0xffffffff; // 20 ms at the default 16 kHz input rate

export function initial(mode: Mode = 'ptt', speak = true): VoiceState {
  return { phase: 'off', gen: 0, mode, speak, mic: mode === 'vad' ? 'vad' : 'ptt-idle', seq: 0, utts: {}, loose: false, sentSinceDown: false, reconnectTries: 0, stops: 0, cancelsSent: 0, cancelsRead: 0, notes: [], caps: { stopSpeech: false, textKey: false }, pastReplies: [], texts: {} };
}

export interface Step {
  state: VoiceState;
  fx: Effect[];
}

const LIVE_PHASES: readonly Phase[] = ['live', 'muting', 'muted'];
const isLive = (s: VoiceState) => LIVE_PHASES.includes(s.phase);
const hasAsync = (e: VoiceEvent): e is Extract<VoiceEvent, { gen: number }> => 'gen' in e;

/** Fresh per-connection state: seq, utterances and ownership start again (notes and settings carry over). */
const freshConnection = (s: VoiceState): VoiceState => ({
  ...s,
  conn: undefined,
  epoch: undefined,
  seq: 0,
  utts: {},
  loose: false,
  pttDownAt: undefined,
  sentSinceDown: false,
  drainAt: undefined,
  mic: s.mode === 'vad' ? 'vad' : 'ptt-idle',
  stop: undefined,
  cancelsSent: 0,
  cancelsRead: 0,
  reply: undefined,
  pastReplies: [],
  texts: loseTexts(s.texts),
});

/** A reply frame of `turnId`: opens it unless it is open already or ended (a late frame of an earlier reply). The reply
 *  it follows is past from then on: its own late frames do not take the open place back. */
function openReply(s: VoiceState, turnId: string): VoiceState {
  if (!isLive(s) || s.reply?.turnId === turnId || s.pastReplies.includes(turnId)) return s;
  const pastReplies = s.reply ? pastWith(s.pastReplies, s.reply.turnId) : s.pastReplies;
  return { ...s, reply: { turnId, speechStopped: false }, pastReplies };
}
const pastWith = (past: readonly string[], turnId: string): readonly string[] =>
  past.includes(turnId) ? past : [...past, turnId].slice(-PAST_REPLIES_CAP);

/** A new connection: a keyed message still waiting for its answer becomes lost (it may have arrived). */
function loseTexts(texts: Readonly<Record<string, TextSend>>): Readonly<Record<string, TextSend>> {
  if (!Object.values(texts).some((t) => t.state === 'pending')) return texts;
  return Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, t.state === 'pending' ? { ...t, state: 'lost' as const } : t]));
}

/** At most TEXTS_CAP entries: settled ones go first, oldest first; a pending one is never dropped. */
function capTexts(texts: Record<string, TextSend>): Record<string, TextSend> {
  const keys = Object.keys(texts);
  if (keys.length <= TEXTS_CAP) return texts;
  const drop = keys.filter((k) => texts[k]!.state !== 'pending').sort((a, b) => texts[a]!.at - texts[b]!.at).slice(0, keys.length - TEXTS_CAP);
  const out = { ...texts };
  for (const k of drop) delete out[k];
  return out;
}

/** Stop speaking can be sent now: connected, speaking, the agent lists bot_voice_stop_speech, a reply is open and still spoken, and no Stop answer is running. */
export function canStopSpeaking(s: VoiceState): boolean {
  return isLive(s) && s.speak && s.caps.stopSpeech && s.reply !== undefined && !s.reply.speechStopped && !(s.stop && !s.stop.outcome);
}

/** A keyed typed message can be sent now: connected, the agent lists bot_voice_text_key, and fewer than TEXTS_CAP wait. */
export function canSendText(s: VoiceState): boolean {
  return isLive(s) && s.caps.textKey && s.conn !== undefined && Object.values(s.texts).filter((t) => t.state === 'pending').length < TEXTS_CAP;
}

/** What became of the keyed message sent under `key` (undefined: none sent, or dropped by the cap). */
export function textOf(s: VoiceState, key: string): TextSend | undefined {
  return Object.prototype.hasOwnProperty.call(s.texts, key) ? s.texts[key] : undefined;
}

/** At most NOTES_CAP notes: settled ones go first, then the oldest. */
function capNotes(notes: Note[]): Note[] {
  let out = notes;
  while (out.length > NOTES_CAP) {
    const i = out.findIndex((n) => n.kind === 'maybeSent' && n.settled);
    out = i >= 0 ? out.filter((_, j) => j !== i) : out.slice(1);
  }
  return out;
}

/** On a loss: every utterance seen but not settled, and loose audio, become notes. */
function lose(s: VoiceState, now: number): VoiceState {
  if (!s.conn) return s;
  const conn = s.conn;
  const notes: Note[] = [...s.notes];
  for (const [k, u] of Object.entries(s.utts)) if (u.state !== 'settled') notes.push({ kind: 'maybeSent', conn, utt: Number(k), at: now });
  if (s.loose) notes.push({ kind: 'uncorrelated', conn, at: now });
  return { ...s, notes: capNotes(notes) };
}

const openFx = (s: VoiceState, takeover: boolean, check = true): Effect => ({
  type: 'open',
  gen: s.gen,
  mode: s.mode,
  speak: s.speak,
  takeover,
  ...(check ? { require: s.speak ? ('stt,tts' as const) : ('stt' as const) } : {}),
});

const setUtt = (s: VoiceState, utt: number, u: Utt): VoiceState => ({ ...s, utts: { ...s.utts, [utt]: u } });
const uttOf = (s: VoiceState, utt: number): Utt | undefined => s.utts[utt];

function outcomeOf(f: Extract<ServerFrame, { type: 'transcript.final' }>): UttOutcome {
  if (f.message_id) return { kind: 'sent', messageId: f.message_id };
  if (f.no_speech !== undefined) return { kind: 'noSpeech' };
  if (f.rejected !== undefined) return { kind: 'rejected', reason: f.rejected };
  // A final with no message id and no named outcome is not proof of a message: it reads as failed, never as sent.
  return { kind: 'failed', reason: f.failed ?? 'unknown' };
}

/** Push to talk ends the open press: a zero frame first when nothing went out since ptt.down, then ptt.up. */
function pttRelease(s: VoiceState): Step {
  const fx: Effect[] = [];
  let seq = s.seq;
  if (!s.sentSinceDown && s.seq < U32_MAX) {
    seq += 1;
    fx.push({ type: 'sendAudio', seq, pcm: new Int16Array(ZERO_FRAME_SAMPLES_16K) });
  }
  fx.push({ type: 'send', frame: { type: 'ptt.up', last_seq: seq } });
  return { state: { ...s, seq, mic: 'ptt-idle', pttDownAt: undefined, sentSinceDown: false }, fx };
}

/** Muting is done when nothing more needs to drain: always at once in push to talk. */
function drainDone(s: VoiceState, now: number): boolean {
  if (s.drainAt === undefined) return true;
  const t = now - s.drainAt;
  if (t >= DRAIN_MAX_MS) return true;
  if (t < DRAIN_MIN_MS) return false;
  return !Object.values(s.utts).some((u) => u.state === 'open');
}

/** After the drain: muted, or (for a switch) close and reopen without taking over. */
function finishDrain(s: VoiceState, now: number): Step {
  const done: VoiceState = { ...s, drainAt: undefined };
  if (!s.pendingSwitch) return { state: { ...done, phase: 'muted' }, fx: [] };
  const next: VoiceState = { ...freshConnection(lose(done, now)), ...s.pendingSwitch, pendingSwitch: undefined, phase: 'connecting', gen: s.gen + 1, reconnectTries: 0 };
  next.mic = next.mode === 'vad' ? 'vad' : 'ptt-idle';
  return { state: next, fx: [{ type: 'close' }, openFx(next, false), { type: 'persist' }] };
}

function beginMute(s: VoiceState, now: number, pendingSwitch?: { mode: Mode; speak: boolean }): Step {
  if (s.mode === 'ptt') {
    // Push to talk drains nothing: end the open press, then muted (or the switch).
    const r = s.mic === 'ptt-held' || s.mic === 'latched' ? pttRelease(s) : { state: s, fx: [] };
    const d = finishDrain({ ...r.state, pendingSwitch }, now);
    return { state: d.state, fx: [...r.fx, ...d.fx] };
  }
  const fx: Effect[] = [];
  const open = Object.entries(s.utts).find(([, u]) => u.state === 'open');
  // An open utterance means audio went out on this connection (the agent opens one only on audio), so seq > 0 here.
  if (open && s.seq > 0) fx.push({ type: 'send', frame: { type: 'input.commit', utt: Number(open[0]), last_seq: s.seq } });
  fx.push({ type: 'timer', gen: s.gen, ms: DRAIN_MIN_MS }, { type: 'timer', gen: s.gen, ms: DRAIN_MAX_MS });
  return { state: { ...s, phase: 'muting', drainAt: now, pendingSwitch }, fx };
}

// ── Stop answer ─────────────────────────────────────────────────────────────────────────────────────────────────────

function resolveStop(s: VoiceState, outcome: StopOutcome): VoiceState {
  return s.stop && !s.stop.outcome ? { ...s, stop: { ...s.stop, outcome } } : s;
}
function cancelTurn(s: VoiceState): Step {
  if (!s.stop || s.stop.outcome || s.stop.turnCancels >= 2) return { state: s, fx: [] };
  return { state: { ...s, stop: { ...s.stop, turnCancels: s.stop.turnCancels + 1 } }, fx: [{ type: 'cancelTurn', stop: s.stop.id, turnId: s.stop.turnId }] };
}

/** Stop answer's deadlines: cancel by id after 3 s without an answer, give up after 15 s. */
function stopDeadlines(s: VoiceState, now: number): Step {
  if (!s.stop || s.stop.outcome) return { state: s, fx: [] };
  if (now - s.stop.at >= STOP_GIVE_UP_MS) return { state: resolveStop(s, 'mayNotHaveStopped'), fx: [] };
  if (!s.stop.result && s.stop.turnCancels === 0 && now - s.stop.at >= STOP_CANCEL_WAIT_MS) return cancelTurn(s);
  return { state: s, fx: [] };
}

// ── frames ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function onFrame(s: VoiceState, f: ServerFrame, now: number): Step {
  switch (f.type) {
    case 'session': {
      if (s.phase !== 'connecting') return { state: s, fx: [] };
      const mode: Mode = f.vad ? 'vad' : 'ptt';
      return { state: { ...freshConnection(s), mode, phase: 'live', conn: f.conn, epoch: f.epoch, reconnectTries: 0, refusal: undefined, mic: mode === 'vad' ? 'vad' : 'ptt-idle' }, fx: [] };
    }
    case 'refused':
      return { state: { ...s, refusal: { code: f.code, message: f.message, ...(f.retry_after_secs !== undefined ? { retryAfterSecs: f.retry_after_secs } : {}) } }, fx: [] };
    case 'takeover':
      // The connection ends here (its close is fenced out): a keyed message still waiting is lost, as on any end.
      return { state: { ...freshConnection(lose(s, now)), phase: 'ended', ended: 'takenOver', gen: s.gen + 1, reply: undefined, texts: loseTexts(s.texts) }, fx: [{ type: 'stopTracks' }, { type: 'close' }, { type: 'persist' }] };
    case 'vad.start': {
      if (!isLive(s)) return { state: s, fx: [] };
      const u = uttOf(s, f.utt);
      if (u?.state === 'settled') return { state: s, fx: [] };
      // The audio sent so far now belongs to this utterance.
      return { state: { ...setUtt(s, f.utt, { state: 'open' }), loose: false }, fx: [] };
    }
    case 'transcript.partial': {
      if (!isLive(s) || uttOf(s, f.utt)) return { state: s, fx: [] };
      return { state: { ...setUtt(s, f.utt, { state: 'open' }), loose: false }, fx: [] };
    }
    case 'vad.end':
    case 'busy': {
      if (!isLive(s) || uttOf(s, f.utt)?.state === 'settled') return { state: s, fx: [] };
      const next = setUtt(s, f.utt, { state: 'awaiting' });
      return s.phase === 'muting' && drainDone(next, now) ? finishDrain(next, now) : { state: next, fx: [] };
    }
    case 'transcript.final': {
      if (!isLive(s)) return { state: s, fx: [] };
      const next = setUtt(s, f.utt, { state: 'settled', outcome: outcomeOf(f) });
      return s.phase === 'muting' && drainDone(next, now) ? finishDrain(next, now) : { state: next, fx: [] };
    }
    case 'cancel.result': {
      // Only the answer to this stop's own output.cancel (counted in order on this connection, and naming its reply):
      // a late answer to an earlier stop, even of the same turn, is not this stop's.
      const read = s.cancelsRead + 1;
      const counted: VoiceState = { ...s, cancelsRead: read };
      if (!s.stop || s.stop.outcome || s.stop.result || read !== s.stop.cancelNo || f.reply_id !== s.stop.turnId) return { state: counted, fx: [] };
      const st: VoiceState = { ...counted, stop: { ...s.stop, result: f.state } };
      // turn_continues: the turn goes on, so cancel it by the captured id. not_active waits for the Bot view.
      return f.state === 'turn_continues' ? cancelTurn(st) : { state: st, fx: [] };
    }
    case 'reply.provisional':
      return { state: openReply(s, f.turn_id), fx: [] };
    case 'output.start':
      return { state: f.kind === 'reply' ? openReply(s, f.reply_id) : s, fx: [] };
    case 'text.result': {
      // Only a key this connection sent and that waits: an unknown, repeated or earlier connection's answer changes nothing.
      const t = textOf(s, f.key);
      if (!t || t.state !== 'pending' || t.conn !== s.conn) return { state: s, fx: [] };
      const done: TextSend = { state: f.state, conn: t.conn, at: t.at, ...(f.message_id !== undefined ? { messageId: f.message_id } : {}), ...(f.reason !== undefined ? { reason: f.reason } : {}), ...(f.code !== undefined ? { code: f.code } : {}), ...(f.message !== undefined ? { message: f.message } : {}) };
      return { state: { ...s, texts: { ...s.texts, [f.key]: done } }, fx: [] };
    }
    case 'reply.final': {
      // The reply it ends is no longer open (Stop speaking has nothing left to stop), and never opens again; a final of
      // another turn leaves the open reply as it is. Only a known turn (the open reply, or one already past) is recorded:
      // a final of an unknown turn (one older than the history keeps) records nothing, so late finals can never push the
      // most recent ended or superseded turns out of pastReplies.
      const known = s.reply?.turnId === f.turn_id || s.pastReplies.includes(f.turn_id);
      const ended: VoiceState = isLive(s) && known ? { ...s, pastReplies: pastWith(s.pastReplies, f.turn_id) } : s;
      const r: VoiceState = ended.reply?.turnId === f.turn_id ? { ...ended, reply: undefined } : ended;
      if (!r.stop || r.stop.outcome || f.turn_id !== r.stop.turnId) return { state: r, fx: [] };
      const stopped = f.reason === 'cancelled' || r.stop.result === 'cancelled';
      return { state: resolveStop(r, stopped ? 'stopped' : 'alreadyFinished'), fx: [] };
    }
    case 'error':
      // stale_utterance / no_utterance during a drain are no-ops; protocol and rate_limited are followed by a close.
      return { state: s, fx: [] };
    default:
      return { state: s, fx: [] };
  }
}

function onClosed(s: VoiceState, code: number, now: number): Step {
  const k = closeKind(code);
  if (s.phase === 'connecting') {
    const retrying = s.reconnectTries > 0;
    if (s.refusal) {
      const r = s.refusal;
      const phase: Phase = r.code === 'voice_busy' ? 'busyElsewhere' : r.code === 'speech_unavailable' ? 'notReady' : 'connectFailed';
      return { state: { ...s, phase, gen: s.gen + 1 }, fx: [{ type: 'stopTracks' }] };
    }
    if (retrying && s.reconnectTries < RECONNECT_TRIES) {
      return { state: { ...s, phase: 'reconnecting', gen: s.gen + 1 }, fx: [{ type: 'timer', gen: s.gen + 1, ms: 1000 * 2 ** s.reconnectTries }] };
    }
    return { state: { ...s, phase: retrying ? 'ended' : 'connectFailed', ...(retrying ? { ended: 'lost' as const } : {}), gen: s.gen + 1 }, fx: [{ type: 'stopTracks' }] };
  }
  if (!isLive(s)) return { state: s, fx: [] };
  const lost = lose(s, now);
  if (k.kind === 'going_away' || k.kind === 'internal' || k.kind === 'lost') {
    const tries = s.reconnectTries;
    if (tries < RECONNECT_TRIES) {
      const next: VoiceState = { ...freshConnection(lost), phase: 'reconnecting', gen: s.gen + 1, reconnectTries: tries };
      return { state: next, fx: [{ type: 'timer', gen: next.gen, ms: 1000 * 2 ** tries }, { type: 'persist' }] };
    }
    return { state: { ...freshConnection(lost), phase: 'ended', ended: 'lost', gen: s.gen + 1 }, fx: [{ type: 'stopTracks' }, { type: 'persist' }] };
  }
  const ended: EndReason = k.kind === 'normal' ? 'closed' : 'protocol';
  return { state: { ...freshConnection(lost), phase: 'ended', ended, gen: s.gen + 1 }, fx: [{ type: 'stopTracks' }, { type: 'persist' }] };
}

// ── the reducer ────────────────────────────────────────────────────────────────────────────────────────────────────

export function step(s: VoiceState, e: VoiceEvent, now: number): Step {
  if (hasAsync(e) && e.gen !== s.gen) {
    // A grant that settles after End, navigation or a newer start only stops its tracks.
    return { state: s, fx: e.type === 'started' && (e.result === 'ready' || e.result === 'checkUnknown' || e.result === 'notReady' || e.result === 'playbackBlocked') ? [{ type: 'stopTracks' }] : [] };
  }
  switch (e.type) {
    case 'press': {
      if (isLive(s) || s.phase === 'starting' || s.phase === 'connecting' || s.phase === 'reconnecting') return { state: s, fx: [] };
      return { state: { ...freshConnection(s), phase: 'starting', gen: s.gen + 1, refusal: undefined, ended: undefined, reconnectTries: 0 }, fx: [] };
    }
    case 'started': {
      if (s.phase !== 'starting') return { state: s, fx: [{ type: 'stopTracks' }] };
      if (e.result === 'ready') return { state: { ...s, phase: 'connecting' }, fx: [openFx(s, false)] };
      const keepsTracks = e.result === 'checkUnknown' || e.result === 'playbackBlocked';
      return { state: { ...s, phase: e.result }, fx: keepsTracks ? [] : [{ type: 'stopTracks' }] };
    }
    case 'tryAnyway':
      return s.phase === 'checkUnknown' ? { state: { ...s, phase: 'connecting' }, fx: [openFx(s, false, false)] } : { state: s, fx: [] };
    case 'takeOver': {
      // Only from a busy refusal, and only on the person's own press.
      if (s.phase !== 'busyElsewhere') return { state: s, fx: [] };
      const next: VoiceState = { ...s, phase: 'connecting', gen: s.gen + 1, refusal: undefined };
      return { state: next, fx: [openFx(next, true, false)] };
    }
    case 'slotRefused':
      return s.phase === 'connecting' ? { state: { ...s, phase: 'budget', gen: s.gen + 1 }, fx: [{ type: 'stopTracks' }] } : { state: s, fx: [] };
    case 'frame':
      return onFrame(s, e.frame, now);
    case 'closed':
      return onClosed(s, e.code, now);
    case 'audio': {
      if (!isLive(s) || s.phase === 'muted') return { state: s, fx: [] };
      if (s.mode === 'ptt' && s.mic === 'ptt-idle') return { state: s, fx: [] };
      // Muting in hands-free: zeros in place of the microphone, paced by it.
      const pcm = s.phase === 'muting' ? new Int16Array(e.pcm.length) : e.pcm;
      // The seq is a u32: past it nothing more can be sent on this connection (2^32 frames, years of audio).
      if (s.seq >= U32_MAX) return { state: s, fx: [] };
      const seq = s.seq + 1;
      const anyOpen = Object.values(s.utts).some((u) => u.state === 'open');
      return { state: { ...s, seq, sentSinceDown: true, loose: s.loose || !anyOpen }, fx: [{ type: 'sendAudio', seq, pcm }] };
    }
    case 'pttDown': {
      if (s.phase !== 'live' || s.mode !== 'ptt') return { state: s, fx: [] };
      if (s.mic === 'latched') return pttRelease(s);
      if (s.mic !== 'ptt-idle') return { state: s, fx: [] };
      return { state: { ...s, mic: 'ptt-held', pttDownAt: now, sentSinceDown: false }, fx: [{ type: 'flushPlayback' }, { type: 'send', frame: { type: 'ptt.down' } }] };
    }
    case 'pttUp': {
      if (s.phase !== 'live' || s.mic !== 'ptt-held') return { state: s, fx: [] };
      if (s.pttDownAt !== undefined && now - s.pttDownAt < PTT_LATCH_MS) return { state: { ...s, mic: 'latched' }, fx: [] };
      return pttRelease(s);
    }
    case 'mute':
      return s.phase === 'live' ? beginMute(s, now) : { state: s, fx: [] };
    case 'unmute':
      return s.phase === 'muted' ? { state: { ...s, phase: 'live', mic: s.mode === 'vad' ? 'vad' : 'ptt-idle' }, fx: [] } : { state: s, fx: [] };
    case 'switch': {
      if (e.mode === s.mode && e.speak === s.speak) return { state: s, fx: [] };
      if (s.phase === 'live') return beginMute(s, now, { mode: e.mode, speak: e.speak });
      if (s.phase === 'muted') return finishDrain({ ...s, pendingSwitch: { mode: e.mode, speak: e.speak } }, now);
      if (s.phase === 'off' || s.phase === 'ended') return { state: { ...s, mode: e.mode, speak: e.speak, mic: e.mode === 'vad' ? 'vad' : 'ptt-idle' }, fx: [] };
      return { state: s, fx: [] };
    }
    case 'tick': {
      if (s.phase === 'reconnecting') {
        const next: VoiceState = { ...s, phase: 'connecting', reconnectTries: s.reconnectTries + 1 };
        return { state: next, fx: [openFx(next, false, false)] };
      }
      // A tick serves every deadline that is due: Stop answer's first (a mute drain must not swallow it), then the drain.
      const stopped = stopDeadlines(s, now);
      if (stopped.state.phase === 'muting' && drainDone(stopped.state, now)) {
        const d = finishDrain(stopped.state, now);
        return { state: d.state, fx: [...stopped.fx, ...d.fx] };
      }
      return stopped;
    }
    case 'stopAnswer': {
      if (!isLive(s) || (s.stop && !s.stop.outcome)) return { state: s, fx: [] };
      const id = s.stops + 1;
      const cancelNo = s.cancelsSent + 1;
      return {
        state: { ...s, stops: id, cancelsSent: cancelNo, stop: { id, cancelNo, turnId: e.turnId, at: now, turnCancels: 0 } },
        fx: [
          { type: 'flushPlayback' },
          { type: 'send', frame: { type: 'output.cancel', reply_id: e.turnId } },
          { type: 'timer', gen: s.gen, ms: STOP_CANCEL_WAIT_MS },
          { type: 'timer', gen: s.gen, ms: STOP_GIVE_UP_MS },
        ],
      };
    }
    case 'caps':
      return { state: { ...s, caps: { stopSpeech: e.caps.stopSpeech === true, textKey: e.caps.textKey === true } }, fx: [] };
    case 'stopSpeaking': {
      // Speech only: never the Stop answer path (no captured turn, no cancelBotTurn). Counted as a cancel, so the
      // in-order cancel.result answers still pair with Stop answer's own.
      if (!canStopSpeaking(s) || !s.reply) return { state: s, fx: [] };
      return {
        state: { ...s, cancelsSent: s.cancelsSent + 1, reply: { ...s.reply, speechStopped: true } },
        fx: [{ type: 'flushPlayback' }, { type: 'send', frame: { type: 'output.cancel', reply_id: s.reply.turnId, keep_turn: true } }],
      };
    }
    case 'sendText': {
      // A key that waits for its answer is not sent again; a settled one may be (the agent answers the same key and text
      // with the first message again). At most TEXTS_CAP wait at once (canSendText): a settled entry is dropped to make
      // room, a pending one never. A frame the codec would refuse is not sent. A dropped message's key is spent: while
      // its entry is kept, the key is not sent again (the caller sends the words under a new key).
      const had = textOf(s, e.key)?.state;
      if (!canSendText(s) || !s.conn || had === 'pending' || had === 'dropped') return { state: s, fx: [] };
      const frame: ClientFrame = { type: 'text', text: e.text, key: e.key };
      try {
        encodeClientFrame(frame);
      } catch {
        return { state: s, fx: [] };
      }
      const texts = capTexts({ ...s.texts, [e.key]: { state: 'pending', conn: s.conn, at: now } });
      return { state: { ...s, texts }, fx: [{ type: 'send', frame }] };
    }
    case 'botView': {
      if (!s.stop || s.stop.outcome || e.stop !== s.stop.id) return { state: s, fx: [] };
      // A running turn the view does not name is no evidence either way: wait for the next read.
      if (e.running && e.turnId === undefined) return { state: s, fx: [] };
      const capturedRuns = e.running && e.turnId === s.stop.turnId;
      if (!capturedRuns) {
        // The captured turn is not running: it ended (stopped if anything was cancelled), or a newer one runs (never touched).
        const stopped = s.stop.result === 'cancelled' || s.stop.turnCancels > 0;
        return { state: resolveStop(s, stopped ? 'stopped' : 'alreadyFinished'), fx: [] };
      }
      // not_active while the captured turn still runs: cancel it by its id.
      return s.stop.result === 'not_active' && s.stop.turnCancels === 0 ? cancelTurn(s) : { state: s, fx: [] };
    }
    case 'turnCancelResult': {
      if (!s.stop || s.stop.outcome || e.stop !== s.stop.id) return { state: s, fx: [] };
      if (e.result === 'notMatched') return { state: resolveStop(s, 'alreadyFinished'), fx: [] };
      if (e.result === 'failed') return cancelTurn(s); // one resend of the same request (safe by contract)
      return { state: s, fx: [] }; // matched: resolution still waits for evidence the turn ended
    }
    case 'logRow': {
      const i = s.notes.findIndex((n) => n.kind === 'maybeSent' && !n.settled && n.conn === e.conn && n.utt === e.utt);
      if (i < 0) return { state: s, fx: [] };
      const notes = s.notes.map((n, j) => (j === i ? { ...(n as MaybeSent), settled: { seq: e.seq } } : n));
      return { state: { ...s, notes }, fx: [{ type: 'persist' }] };
    }
    case 'end': {
      if (s.phase === 'off') return { state: s, fx: [] };
      const lost = lose(s, now);
      return { state: { ...freshConnection(lost), phase: 'off', ended: undefined, gen: s.gen + 1, reconnectTries: 0 }, fx: [{ type: 'stopTracks' }, { type: 'close' }, { type: 'persist' }] };
    }
    case 'stale': {
      const lost = lose(s, now);
      return { state: { ...freshConnection(lost), phase: 'off', gen: s.gen + 1, reconnectTries: 0 }, fx: s.phase === 'off' ? [] : [{ type: 'stopTracks' }, { type: 'close' }, { type: 'persist' }] };
    }
  }
}

// ── persistence (per-account kit-io store; no audio, no text) ─────────────────────────────────────────────────────────

export interface PendingIdentity {
  conn: string;
  utt: number;
  at: number;
}

/** The unsettled maybe-sent identities to store: newest 32, none older than 24 h. */
export function pendingOf(s: VoiceState, now: number): PendingIdentity[] {
  return s.notes
    .filter((n): n is MaybeSent => n.kind === 'maybeSent' && !n.settled && now - n.at < NOTE_TTL_MS)
    .slice(-NOTES_CAP)
    .map((n) => ({ conn: n.conn, utt: n.utt, at: n.at }));
}

/** Notes back from the store after a reload: malformed or expired entries are dropped, the cap kept. */
export function restorePending(raw: unknown, now: number): MaybeSent[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.filter(
    (x): x is PendingIdentity =>
      typeof x === 'object' && x !== null && typeof (x as PendingIdentity).conn === 'string' && Number.isInteger((x as PendingIdentity).utt) &&
      typeof (x as PendingIdentity).at === 'number' && now - (x as PendingIdentity).at < NOTE_TTL_MS && (x as PendingIdentity).at <= now,
  );
  return ok.slice(-NOTES_CAP).map((x) => ({ kind: 'maybeSent', conn: x.conn, utt: x.utt, at: x.at }));
}
