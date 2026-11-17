// The hoody.voice.v1 frames of a Bot's voice WebSocket (agent getBotVoice), engine-free: no socket, no audio device,
// no React. What this file promises:
//   - Every client frame it builds is one the agent declares, with exactly the declared fields, and fits the agent's
//     bounds (64 KiB per text frame, 20 to 200 ms per audio frame, u32 numbers, a deny reason of at most 500
//     characters, no blank answer or text). A frame that would not fit is refused here (WireError), never sent cut.
//   - Every server frame it reads is checked against its declared fields: a known frame missing a required field, or
//     holding one of the wrong kind, reads as `invalid` (the caller treats the connection as broken), never as a
//     partly trusted frame. A frame type the agent added later reads as `unknown` and is ignored.
//   - The field tables below are held to the agent's published spec by wire.spec.test.ts: a frame or field the agent
//     adds, drops or changes fails that test, so this file cannot drift from the agent unnoticed.

export const VOICE_SUBPROTOCOL = 'hoody.voice.v1';
export const VOICE_RATES = [8000, 16000, 24000, 48000] as const;
export type VoiceRate = (typeof VOICE_RATES)[number];

/** The agent closes a connection whose text frame (JSON envelope included) is over 64 KiB (close 1009). */
export const MAX_TEXT_FRAME_BYTES = 64 * 1024;
/** An input frame holds 20 to 200 ms of audio; outside that the agent closes the connection (1008). */
export const INPUT_FRAME_MIN_MS = 20;
export const INPUT_FRAME_MAX_MS = 200;
/** protocol.MaxConfirmReasonChars: a longer deny reason is refused bad_request. */
export const MAX_DENY_REASON_CHARS = 500;
const U32_MAX = 0xffffffff;
const INPUT_TAG = 0x00;
const OUTPUT_TAG = 0x01;

export type WireErrorCode = 'missing' | 'bad_value' | 'bad_number' | 'bad_duration' | 'blank' | 'too_long' | 'too_big' | 'reason_without_deny';
/** A client frame this module will not build: it would be refused or close the connection. */
export interface WireError extends Error {
  readonly name: 'WireError';
  readonly code: WireErrorCode;
}
const wireError = (code: WireErrorCode, message: string): WireError => Object.assign(new Error(message), { name: 'WireError' as const, code });
export const isWireError = (e: unknown): e is WireError => e instanceof Error && e.name === 'WireError' && typeof (e as { code?: unknown }).code === 'string';

const isU32 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= U32_MAX;
const u32 = (n: number, what: string): number => {
  if (!isU32(n)) throw wireError('bad_number', `${what} must be a whole number from 0 to ${U32_MAX}`);
  return n;
};

// ── binary frames ──────────────────────────────────────────────────────────────────────────────────────────────────

/** input.audio: byte 0x00, the big-endian u32 seq, then 16-bit little-endian PCM (in_format pcm16) at `rate`. */
export function encodeInputAudio(seq: number, pcm: Int16Array, rate: VoiceRate): ArrayBuffer {
  u32(seq, 'seq');
  const ms = (pcm.length * 1000) / rate;
  if (ms < INPUT_FRAME_MIN_MS || ms > INPUT_FRAME_MAX_MS) {
    throw wireError('bad_duration', `an input frame holds ${INPUT_FRAME_MIN_MS} to ${INPUT_FRAME_MAX_MS} ms of audio (this one ${ms} ms)`);
  }
  const buf = new ArrayBuffer(5 + pcm.length * 2);
  const v = new DataView(buf);
  v.setUint8(0, INPUT_TAG);
  v.setUint32(1, seq, false);
  for (let i = 0; i < pcm.length; i++) v.setInt16(5 + i * 2, pcm[i] as number, true);
  return buf;
}

export interface OutputAudio {
  out: number;
  /** The sample offset of this audio into its output. */
  offset: number;
  pcm: Int16Array;
}

/**
 * output.audio: byte 0x01, big-endian u32 out, big-endian u32 offset, then 16-bit little-endian PCM at out_rate.
 * Anything else (another tag, a short header, an odd PCM length) is null: a broken frame, never partly played.
 */
export function decodeOutputAudio(data: ArrayBuffer): OutputAudio | null {
  if (data.byteLength < 9 || (data.byteLength - 9) % 2 !== 0) return null;
  const v = new DataView(data);
  if (v.getUint8(0) !== OUTPUT_TAG) return null;
  const n = (data.byteLength - 9) / 2;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = v.getInt16(9 + i * 2, true);
  return { out: v.getUint32(1, false), offset: v.getUint32(5, false), pcm };
}

// ── client JSON frames ────────────────────────────────────────────────────────────────────────────────────────────

export const GATE_DECISIONS = ['approve', 'deny', 'allow_session'] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];
export type ClientFrame =
  | { type: 'input.commit'; utt: number; last_seq: number }
  | { type: 'ptt.down' }
  | { type: 'ptt.up'; last_seq: number }
  /** keep_turn: stop speech only; the turn goes on (its answer is cancel.result turn_continues). */
  | { type: 'output.cancel'; reply_id?: string; keep_turn?: boolean }
  | { type: 'playback.mark'; out: number; played_to: number }
  | { type: 'own_gate.decide'; gate_id: string; generation: number; decision: GateDecision; reason?: string }
  | { type: 'own_gate.answer'; gate_id: string; generation: number; answer: string }
  /** key: an idempotency key (the Bot's message key set); the agent then answers with one text.result instead of error frames. */
  | { type: 'text'; text: string; key?: string }
  | { type: 'ping' };

type Kind = 'int' | 'str' | 'bool' | 'obj' | 'arr' | 'arr?' | 'boolstr';
interface FrameFields {
  req: Readonly<Record<string, Kind>>;
  opt: Readonly<Record<string, Kind>>;
}

/** The client frames and their fields, exactly as the agent declares them (wire.spec.test.ts holds it). */
export const CLIENT_FRAMES: Readonly<Record<ClientFrame['type'], FrameFields>> = {
  'input.commit': { req: { utt: 'int', last_seq: 'int' }, opt: {} },
  'ptt.down': { req: {}, opt: {} },
  'ptt.up': { req: { last_seq: 'int' }, opt: {} },
  'output.cancel': { req: {}, opt: { reply_id: 'str', keep_turn: 'bool' } },
  'playback.mark': { req: { out: 'int', played_to: 'int' }, opt: {} },
  'own_gate.decide': { req: { gate_id: 'str', generation: 'int', decision: 'str' }, opt: { reason: 'str' } },
  'own_gate.answer': { req: { gate_id: 'str', generation: 'int', answer: 'str' }, opt: {} },
  text: { req: { text: 'str' }, opt: { key: 'str' } },
  ping: { req: {}, opt: {} },
};

/** A message idempotency key as the agent takes it: 1-255 printable ASCII, no whitespace, not one of another door's (compat:, chan:). */
const messageKeyOk = (k: string): boolean => /^[\x21-\x7e]{1,255}$/.test(k) && !k.startsWith('compat:') && !k.startsWith('chan:');

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;
const chars = (s: string): number => [...s].length;

/** One client frame as the JSON text to send; refuses (WireError) what the agent would refuse or close on. */
export function encodeClientFrame(f: ClientFrame): string {
  const spec = CLIENT_FRAMES[f.type];
  const rec = f as unknown as Record<string, unknown>;
  for (const [k, kind] of Object.entries({ ...spec.req, ...spec.opt })) {
    const v = rec[k];
    if (v === undefined) {
      if (k in spec.req) throw wireError('missing', `${f.type} needs ${k}`);
      continue;
    }
    if (kind === 'int') u32(v as number, k);
    if (kind === 'str' && typeof v !== 'string') throw wireError('bad_value', `${k} must be text`);
    if (kind === 'bool' && typeof v !== 'boolean') throw wireError('bad_value', `${k} must be true or false`);
  }
  if (f.type === 'own_gate.decide') {
    if (!GATE_DECISIONS.includes(f.decision)) throw wireError('bad_value', 'decision must be approve, deny or allow_session');
    if (f.reason !== undefined && f.decision !== 'deny') throw wireError('reason_without_deny', 'a reason goes with deny only');
    if (f.reason !== undefined && chars(f.reason) > MAX_DENY_REASON_CHARS) throw wireError('too_long', `a reason holds at most ${MAX_DENY_REASON_CHARS} characters`);
  }
  if (f.type === 'own_gate.answer' && f.answer.trim() === '') throw wireError('blank', 'the answer is blank');
  if (f.type === 'text' && f.text.trim() === '') throw wireError('blank', 'the message is blank');
  if (f.type === 'text' && f.key !== undefined && !messageKeyOk(f.key)) throw wireError('bad_value', 'a key is 1 to 255 printable ASCII characters, no spaces, not starting with compat: or chan:');
  // Only the declared fields, in a fixed order: the agent's frames are closed (unknown fields are refused).
  const out: Record<string, unknown> = { type: f.type };
  for (const k of [...Object.keys(spec.req), ...Object.keys(spec.opt)]) if (rec[k] !== undefined) out[k] = rec[k];
  const json = JSON.stringify(out);
  if (utf8Bytes(json) > MAX_TEXT_FRAME_BYTES) throw wireError('too_big', `a frame holds at most ${MAX_TEXT_FRAME_BYTES} bytes`);
  return json;
}

// ── server JSON frames ────────────────────────────────────────────────────────────────────────────────────────────

/** The server frames and their fields, exactly as the agent declares them (wire.spec.test.ts holds it). */
export const SERVER_FRAMES = {
  session: { req: { epoch: 'int', conn: 'str', in_rate: 'int', out_rate: 'int', vad: 'bool' }, opt: { speak: 'bool', play_lead: 'bool' } },
  'vad.start': { req: { utt: 'int' }, opt: {} },
  'vad.end': { req: { utt: 'int' }, opt: {} },
  'transcript.partial': { req: { utt: 'int', text: 'str' }, opt: {} },
  'transcript.final': { req: { utt: 'int', text: 'str' }, opt: { message_id: 'str', no_speech: 'str', rejected: 'str', failed: 'str', error: 'obj' } },
  'reply.provisional': { req: { turn_id: 'str', seq: 'int', text: 'str' }, opt: {} },
  'reply.invalidate': { req: { turn_id: 'str', from_raw: 'int' }, opt: {} },
  'reply.final': { req: { turn_id: 'str', text: 'str', spoken: 'boolstr' }, opt: { reason: 'str', truncated: 'bool', own: 'bool', failure: 'str', error: 'obj' } },
  'reply.diverged': { req: { turn_id: 'str' }, opt: {} },
  'output.start': { req: { out: 'int', reply_id: 'str', seg: 'int', kind: 'str' }, opt: { ref: 'obj' } },
  'output.end': { req: { out: 'int', samples: 'int' }, opt: {} },
  'output.stop': { req: { upto_out: 'int', reason: 'str' }, opt: {} },
  'cancel.result': { req: { state: 'str', message_ids: 'arr' }, opt: { reply_id: 'str' } },
  'text.result': { req: { key: 'str', state: 'str' }, opt: { message_id: 'str', reason: 'str', code: 'str', message: 'str' } },
  'gate.announced': { req: { ref: 'obj', reply_id: 'str' }, opt: {} },
  'own_gate.pending': { req: { gate_id: 'str', generation: 'int', kind: 'str', summary: 'str' }, opt: { decisions: 'arr?', questions: 'arr?' } },
  'own_gate.resolved': { req: { gate_id: 'str', generation: 'int', outcome: 'str' }, opt: {} },
  busy: { req: { utt: 'int' }, opt: {} },
  error: { req: { code: 'str', message: 'str' }, opt: { error: 'obj' } },
  takeover: { req: { by: 'str' }, opt: {} },
  pong: { req: {}, opt: {} },
  refused: { req: { code: 'str', message: 'str' }, opt: { details: 'obj', retry_after_secs: 'int' } },
} as const satisfies Record<string, FrameFields>;

export type ServerFrameType = keyof typeof SERVER_FRAMES;

/** A voice error object (transcript.final, reply.final, error): what failed and whether trying again can help. */
export interface VoiceError {
  code: string;
  message: string;
  retryable: boolean;
  reason?: string;
  diag_id?: string;
  retry_after_secs?: number;
}

export type ServerFrame =
  | { type: 'session'; epoch: number; conn: string; in_rate: number; out_rate: number; vad: boolean; speak?: boolean; play_lead?: boolean }
  | { type: 'vad.start' | 'vad.end' | 'busy'; utt: number }
  | { type: 'transcript.partial'; utt: number; text: string }
  | { type: 'transcript.final'; utt: number; text: string; message_id?: string; no_speech?: string; rejected?: string; failed?: string; error?: VoiceError }
  | { type: 'reply.provisional'; turn_id: string; seq: number; text: string }
  | { type: 'reply.invalidate'; turn_id: string; from_raw: number }
  | { type: 'reply.final'; turn_id: string; text: string; spoken: boolean | 'partial' | 'unknown'; reason?: string; truncated?: boolean; own?: boolean; failure?: string; error?: VoiceError }
  | { type: 'reply.diverged'; turn_id: string }
  | { type: 'output.start'; out: number; reply_id: string; seg: number; kind: 'reply' | 'announcement'; ref?: Record<string, unknown> }
  | { type: 'output.end'; out: number; samples: number }
  | { type: 'output.stop'; upto_out: number; reason: string }
  | { type: 'cancel.result'; state: 'cancelled' | 'turn_continues' | 'not_active'; message_ids: string[]; reply_id?: string }
  /** The answer to a keyed text frame. refused: code says why (read as plain text: a newer code is still a refusal); unknown: read the message by its key before sending again;
   *  dropped: the message was taken, then dropped before it was posted, and never will be (reason says why, read as plain text: a newer reason is still a drop). */
  | { type: 'text.result'; key: string; state: 'posted' | 'queued' | 'dropped' | 'refused' | 'unknown'; message_id?: string; reason?: string; code?: string; message?: string }
  | { type: 'gate.announced'; ref: Record<string, unknown>; reply_id: string }
  | { type: 'own_gate.pending'; gate_id: string; generation: number; kind: 'confirm' | 'question'; summary: string; decisions?: string[] | null; questions?: Record<string, unknown>[] | null }
  | { type: 'own_gate.resolved'; gate_id: string; generation: number; outcome: string }
  | { type: 'error'; code: string; message: string; error?: VoiceError }
  | { type: 'takeover'; by: string }
  | { type: 'pong' }
  | { type: 'refused'; code: string; message: string; details?: Record<string, unknown>; retry_after_secs?: number };

/** What parseServerFrame gives for a text the caller must not act on. */
export type ServerFrameProblem = { type: 'invalid'; reason: string } | { type: 'unknown'; name: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fits = (v: unknown, kind: Kind): boolean => {
  switch (kind) {
    case 'int':
      return isU32(v);
    case 'str':
      return typeof v === 'string';
    case 'bool':
      return typeof v === 'boolean';
    case 'obj':
      return isObj(v);
    case 'arr':
      return Array.isArray(v);
    case 'arr?':
      return v === null || Array.isArray(v);
    case 'boolstr':
      return typeof v === 'boolean' || v === 'partial' || v === 'unknown';
  }
};

/** Enumerated string fields: a value outside the set makes the frame invalid (the agent never sends one). */
export const ENUMS: Partial<Record<ServerFrameType, Readonly<Record<string, readonly string[]>>>> = {
  'output.start': { kind: ['reply', 'announcement'] },
  'cancel.result': { state: ['cancelled', 'turn_continues', 'not_active'] },
  'text.result': { state: ['posted', 'queued', 'dropped', 'refused', 'unknown'] },
  'own_gate.pending': { kind: ['confirm', 'question'] },
};

const optStr = (v: unknown): boolean => v === undefined || typeof v === 'string';
const voiceErrorOk = (v: unknown): boolean =>
  isObj(v) && typeof v.code === 'string' && typeof v.message === 'string' && typeof v.retryable === 'boolean' &&
  optStr(v.reason) && optStr(v.diag_id) && (v.retry_after_secs === undefined || isU32(v.retry_after_secs));
const arrOf = (v: unknown, ok: (x: unknown) => boolean): boolean => v === undefined || v === null || (Array.isArray(v) && v.every(ok));

/** One server text frame: the typed frame, `invalid` (do not trust the connection) or `unknown` (a newer frame: ignore). */
export function parseServerFrame(raw: string): ServerFrame | ServerFrameProblem {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { type: 'invalid', reason: 'not JSON' };
  }
  if (!isObj(v) || typeof v.type !== 'string') return { type: 'invalid', reason: 'no frame type' };
  const name = v.type;
  if (!Object.prototype.hasOwnProperty.call(SERVER_FRAMES, name)) return { type: 'unknown', name };
  const t = name as ServerFrameType;
  const spec: FrameFields = SERVER_FRAMES[t];
  for (const [k, kind] of Object.entries(spec.req)) if (!fits(v[k], kind)) return { type: 'invalid', reason: `${t}.${k}` };
  for (const [k, kind] of Object.entries(spec.opt)) if (v[k] !== undefined && !fits(v[k], kind)) return { type: 'invalid', reason: `${t}.${k}` };
  for (const [k, allowed] of Object.entries(ENUMS[t] ?? {})) if (!allowed.includes(v[k] as string)) return { type: 'invalid', reason: `${t}.${k}` };
  if (v.error !== undefined && !voiceErrorOk(v.error)) return { type: 'invalid', reason: `${t}.error` };
  if (t === 'cancel.result' && !arrOf(v.message_ids, (x) => typeof x === 'string')) return { type: 'invalid', reason: `${t}.message_ids` };
  if (t === 'own_gate.pending' && !arrOf(v.decisions, (x) => typeof x === 'string')) return { type: 'invalid', reason: `${t}.decisions` };
  if (t === 'own_gate.pending' && !arrOf(v.questions, isObj)) return { type: 'invalid', reason: `${t}.questions` };
  // Only the declared fields travel on: an undeclared one never reaches the caller.
  const out: Record<string, unknown> = { type: t };
  for (const k of [...Object.keys(spec.req), ...Object.keys(spec.opt)]) if (v[k] !== undefined) out[k] = v[k];
  return out as unknown as ServerFrame;
}

// ── connection ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ConnectOptions {
  mode: 'vad' | 'ptt';
  inRate?: VoiceRate;
  outRate?: VoiceRate;
  /** Take over from the connection that holds the Bot's voice now (only on the person's own Take over). */
  takeover?: boolean;
  /** false: replies come as text only (no speech is made or billed). */
  speak?: boolean;
  /** Keep reply audio at most 8 s ahead of the marks (only when the agent lists bot_voice_play_lead). */
  playLead?: boolean;
  /** Check these speech settings before the upgrade. */
  require?: 'stt' | 'tts' | 'stt,tts';
}

/**
 * The connect query, declared parameters only. refuse=frame is always asked, so a refusal arrives as one `refused`
 * frame and a 4xxx close the browser can read, instead of a bare failed upgrade.
 */
export function connectQuery(o: ConnectOptions): Record<string, string> {
  const q: Record<string, string> = { mode: o.mode, in_format: 'pcm16', refuse: 'frame' };
  if (o.inRate !== undefined) q.in_rate = String(o.inRate);
  if (o.outRate !== undefined) q.out_rate = String(o.outRate);
  if (o.takeover) q.takeover = 'true';
  if (o.speak === false) q.speak = 'false';
  if (o.playLead) q.play_lead = 'true';
  if (o.require) q.require = o.require;
  return q;
}

export type CloseKind = 'normal' | 'going_away' | 'subprotocol' | 'policy' | 'too_big' | 'internal' | 'refused' | 'lost';
/** What a close code means (the agent's published close codes); 4000 + status is a refusal sent with refuse=frame. */
export function closeKind(code: number): { kind: CloseKind; status?: number } {
  if (code >= 4000 && code <= 4999) return { kind: 'refused', status: code - 4000 };
  switch (code) {
    case 1000:
      return { kind: 'normal' };
    case 1001:
      return { kind: 'going_away' };
    case 1002:
      return { kind: 'subprotocol' };
    case 1008:
      return { kind: 'policy' };
    case 1009:
      return { kind: 'too_big' };
    case 1011:
      return { kind: 'internal' };
    default:
      // 1006 (no close frame) and anything undeclared: the connection was lost without the agent saying why.
      return { kind: 'lost' };
  }
}
