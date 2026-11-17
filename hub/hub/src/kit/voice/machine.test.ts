// @vitest-environment node
// kit/voice/machine.ts: the Talk state machine: U1-U4, several pending utterances, a missed
// vad.start, no speech, persistence round-trip and expiry, the mute drain, Stop answer, reconnect, generation fence and
// late grants.
import { describe, expect, it } from 'vitest';
import {
  DRAIN_MAX_MS,
  DRAIN_MIN_MS,
  type Effect,
  type Mode,
  NOTE_TTL_MS,
  PAST_REPLIES_CAP,
  STOP_CANCEL_WAIT_MS,
  STOP_GIVE_UP_MS,
  TEXTS_CAP,
  type VoiceEvent,
  type VoiceState,
  canSendText,
  canStopSpeaking,
  initial,
  pendingOf,
  restorePending,
  step,
  textOf,
} from './machine';
import type { ServerFrame } from './wire';

/** Runs events in order; each event gets the clock `t` it names (default: the last one). */
class Run {
  s: VoiceState;
  fx: Effect[] = [];
  t = 0;
  constructor(mode: Mode = 'ptt') {
    this.s = initial(mode);
  }
  do(e: VoiceEvent | ((s: VoiceState) => VoiceEvent), at?: number): Effect[] {
    if (at !== undefined) this.t = at;
    const r = step(this.s, typeof e === 'function' ? e(this.s) : e, this.t);
    this.s = r.state;
    this.fx = r.fx;
    return r.fx;
  }
  frame(f: ServerFrame, at?: number) {
    return this.do((s) => ({ type: 'frame', gen: s.gen, frame: f }), at);
  }
  audio(n = 320, at?: number) {
    return this.do((s) => ({ type: 'audio', gen: s.gen, pcm: new Int16Array(n).fill(7) }), at);
  }
  closed(code: number, at?: number) {
    return this.do((s) => ({ type: 'closed', gen: s.gen, code }), at);
  }
  tick(at: number) {
    return this.do((s) => ({ type: 'tick', gen: s.gen }), at);
  }
  /** Off → live on a session frame. */
  live(mode: Mode = this.s.mode, conn = 'c1') {
    this.do({ type: 'press' });
    this.do((s) => ({ type: 'started', gen: s.gen, result: 'ready' }));
    this.frame({ type: 'session', epoch: 1, conn, in_rate: 16000, out_rate: 24000, vad: mode === 'vad' });
    expect(this.s.phase).toBe('live');
    return this;
  }
}
const sent = (fx: Effect[]) => fx.flatMap((f) => (f.type === 'send' ? [f.frame] : []));
const seqs = (fx: Effect[]) => fx.flatMap((f) => (f.type === 'sendAudio' ? [f.seq] : []));
const has = (fx: Effect[], type: Effect['type']) => fx.some((f) => f.type === type);

describe('start and the generation fence', () => {
  it('press → starting; ready opens the socket asking the speech check, with takeover false', () => {
    const r = new Run();
    r.do({ type: 'press' });
    expect(r.s.phase).toBe('starting');
    const fx = r.do((s) => ({ type: 'started', gen: s.gen, result: 'ready' }));
    expect(fx).toEqual([{ type: 'open', gen: r.s.gen, mode: 'ptt', speak: true, takeover: false, require: 'stt,tts' }]);
    expect(r.s.phase).toBe('connecting');
  });

  it('not ready, denied and no device stop the tracks; check unknown keeps them for Try anyway, which skips the check', () => {
    for (const result of ['notReady', 'denied', 'noDevice'] as const) {
      const r = new Run();
      r.do({ type: 'press' });
      expect(r.do((s) => ({ type: 'started', gen: s.gen, result }))).toEqual([{ type: 'stopTracks' }]);
      expect(r.s.phase).toBe(result);
    }
    const r = new Run();
    r.do({ type: 'press' });
    expect(r.do((s) => ({ type: 'started', gen: s.gen, result: 'checkUnknown' }))).toEqual([]);
    const fx = r.do({ type: 'tryAnyway' });
    expect(fx).toEqual([{ type: 'open', gen: r.s.gen, mode: 'ptt', speak: true, takeover: false }]);
  });

  it('a grant that settles after End only stops its tracks (late grant)', () => {
    const r = new Run();
    r.do({ type: 'press' });
    const old = r.s.gen;
    r.do({ type: 'end' });
    expect(r.do({ type: 'started', gen: old, result: 'ready' })).toEqual([{ type: 'stopTracks' }]);
    expect(r.s.phase).toBe('off');
  });

  it('frames and closes of an older connection change nothing', () => {
    const r = new Run().live();
    const old = r.s.gen;
    r.do({ type: 'end' });
    r.do({ type: 'press' });
    const before = r.s;
    expect(r.do({ type: 'frame', gen: old, frame: { type: 'vad.start', utt: 1 } })).toEqual([]);
    expect(r.do({ type: 'closed', gen: old, code: 1006 })).toEqual([]);
    expect(r.s).toBe(before);
  });

  it('a takeover leaves no connection behind: what it lost is stored once, also after a later end', () => {
    const r = new Run('vad').live('vad');
    r.frame({ type: 'vad.start', utt: 4 });
    r.frame({ type: 'takeover', by: 'x' });
    expect(r.s.phase).toBe('ended');
    expect(r.s.conn).toBeUndefined();
    const once = pendingOf(r.s, 1000);
    expect(once).toHaveLength(1);
    r.do({ type: 'end' });
    expect(pendingOf(r.s, 1000)).toEqual(once);
  });
  it('after a reconnect, the old connection\'s frames and close touch nothing on the new one', () => {
    const r = new Run('vad').live('vad');
    const old = r.s.gen;
    r.closed(1006, 0);
    r.tick(1000);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: true });
    const before = r.s;
    expect(r.do({ type: 'frame', gen: old, frame: { type: 'vad.start', utt: 1 } })).toEqual([]);
    expect(r.do({ type: 'frame', gen: old, frame: { type: 'takeover', by: 'x' } })).toEqual([]);
    expect(r.do({ type: 'closed', gen: old, code: 1006 })).toEqual([]);
    expect(r.do({ type: 'audio', gen: old, pcm: new Int16Array(320) })).toEqual([]);
    expect(r.s).toBe(before);
  });

  it('every new session starts with seq 0 and no utterances', () => {
    const r = new Run().live();
    r.do({ type: 'pttDown' }, 0);
    r.audio();
    r.frame({ type: 'vad.start', utt: 1 });
    r.closed(1006, 10);
    r.tick(1010);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: false });
    expect(r.s).toMatchObject({ phase: 'live', conn: 'c2', seq: 0, utts: {}, loose: false, reconnectTries: 0 });
    r.do({ type: 'pttDown' }, 2000);
    expect(seqs(r.audio())).toEqual([1]);
  });
});

describe('connect refusals', () => {
  const refuse = (code: string) => {
    const r = new Run();
    r.do({ type: 'press' });
    r.do((s) => ({ type: 'started', gen: s.gen, result: 'ready' }));
    r.frame({ type: 'refused', code, message: 'm', retry_after_secs: 5 });
    r.closed(4409);
    return r;
  };
  it('voice_busy → busy elsewhere, and only then Take over opens with takeover true', () => {
    const r = refuse('voice_busy');
    expect(r.s.phase).toBe('busyElsewhere');
    const fx = r.do({ type: 'takeOver' });
    expect(fx).toEqual([{ type: 'open', gen: r.s.gen, mode: 'ptt', speak: true, takeover: true }]);
    expect(new Run().do({ type: 'takeOver' })).toEqual([]);
  });
  it('speech_unavailable → not ready; any other refusal → connect failed with its retry-after', () => {
    expect(refuse('speech_unavailable').s.phase).toBe('notReady');
    const r = refuse('service_unavailable');
    expect(r.s.phase).toBe('connectFailed');
    expect(r.s.refusal).toEqual({ code: 'service_unavailable', message: 'm', retryAfterSecs: 5 });
  });
  it('a loss before any session frame is connect failed; a refused stream slot is budget', () => {
    const r = new Run();
    r.do({ type: 'press' });
    r.do((s) => ({ type: 'started', gen: s.gen, result: 'ready' }));
    r.closed(1006);
    expect(r.s.phase).toBe('connectFailed');
    const b = new Run();
    b.do({ type: 'press' });
    b.do((s) => ({ type: 'started', gen: s.gen, result: 'ready' }));
    b.do((s) => ({ type: 'slotRefused', gen: s.gen }));
    expect(b.s.phase).toBe('budget');
  });
});

describe('push to talk', () => {
  it('down flushes playback and sends ptt.down; audio only while held; up sends ptt.up with the last seq', () => {
    const r = new Run().live();
    expect(seqs(r.audio())).toEqual([]); // idle: dropped
    expect(r.do({ type: 'pttDown' }, 1000)).toEqual([{ type: 'flushPlayback' }, { type: 'send', frame: { type: 'ptt.down' } }]);
    expect(seqs(r.audio())).toEqual([1]);
    expect(seqs(r.audio())).toEqual([2]);
    expect(sent(r.do({ type: 'pttUp' }, 2000))).toEqual([{ type: 'ptt.up', last_seq: 2 }]);
    expect(seqs(r.audio())).toEqual([]);
  });

  it('a press under 250 ms latches; the next press releases', () => {
    const r = new Run().live();
    r.do({ type: 'pttDown' }, 1000);
    expect(r.do({ type: 'pttUp' }, 1100)).toEqual([]);
    expect(r.s.mic).toBe('latched');
    expect(seqs(r.audio())).toEqual([1]);
    expect(sent(r.do({ type: 'pttDown' }, 5000))).toEqual([{ type: 'ptt.up', last_seq: 1 }]);
    expect(r.s.mic).toBe('ptt-idle');
  });

  it('a release with nothing sent since ptt.down sends one 20 ms zero frame first', () => {
    const r = new Run().live();
    r.do({ type: 'pttDown' }, 1000);
    const fx = r.do({ type: 'pttUp' }, 2000);
    expect(fx[0]).toMatchObject({ type: 'sendAudio', seq: 1 });
    expect([...(fx[0] as { pcm: Int16Array }).pcm].every((x) => x === 0)).toBe(true);
    expect((fx[0] as { pcm: Int16Array }).pcm.length).toBe(320);
    expect(sent(fx)).toEqual([{ type: 'ptt.up', last_seq: 1 }]);
  });
});

describe('utterances', () => {
  it('sent only on transcript.final with its message id; several pending at once keep their own outcomes', () => {
    const r = new Run('vad').live('vad');
    r.audio();
    r.frame({ type: 'vad.start', utt: 1 });
    r.frame({ type: 'vad.end', utt: 1 });
    r.frame({ type: 'vad.start', utt: 2 });
    r.frame({ type: 'vad.end', utt: 2 });
    r.frame({ type: 'transcript.final', utt: 2, text: 'b', rejected: 'too_long' });
    expect(r.s.utts).toEqual({ 1: { state: 'awaiting' }, 2: { state: 'settled', outcome: { kind: 'rejected', reason: 'too_long' } } });
    r.frame({ type: 'transcript.final', utt: 1, text: 'a', message_id: 'm1' });
    expect(r.s.utts[1]).toEqual({ state: 'settled', outcome: { kind: 'sent', messageId: 'm1' } });
  });

  it('no speech settles as no speech; a final naming nothing reads as failed, never sent', () => {
    const r = new Run('vad').live('vad');
    r.frame({ type: 'vad.start', utt: 1 });
    r.frame({ type: 'transcript.final', utt: 1, text: '', no_speech: 'vad' });
    expect(r.s.utts[1]?.outcome).toEqual({ kind: 'noSpeech' });
    r.frame({ type: 'transcript.final', utt: 2, text: 'x' });
    expect(r.s.utts[2]?.outcome).toEqual({ kind: 'failed', reason: 'unknown' });
  });

  it('a loss turns every unsettled utterance into "may have been sent", keyed (conn, utt)', () => {
    const r = new Run('vad').live('vad');
    r.audio();
    r.frame({ type: 'vad.start', utt: 1 }); // open
    r.frame({ type: 'vad.start', utt: 2 });
    r.frame({ type: 'vad.end', utt: 2 }); // awaiting
    r.frame({ type: 'vad.start', utt: 3 });
    r.frame({ type: 'transcript.final', utt: 3, text: 'c', message_id: 'm3' }); // settled
    r.closed(1006, 50);
    expect(r.s.notes).toEqual([
      { kind: 'maybeSent', conn: 'c1', utt: 1, at: 50 },
      { kind: 'maybeSent', conn: 'c1', utt: 2, at: 50 },
    ]);
  });

  it('audio with no utterance seen (a missed vad.start) becomes one uncorrelated note that never settles', () => {
    const r = new Run('vad').live('vad');
    r.audio();
    r.audio();
    r.closed(1001, 9);
    expect(r.s.notes).toEqual([{ kind: 'uncorrelated', conn: 'c1', at: 9 }]);
    r.do({ type: 'logRow', seq: 4, conn: 'c1', utt: 1 });
    expect(r.s.notes).toEqual([{ kind: 'uncorrelated', conn: 'c1', at: 9 }]);
  });

  it('audio that a vad.start then claims is not loose', () => {
    const r = new Run('vad').live('vad');
    r.audio();
    r.frame({ type: 'vad.start', utt: 1 });
    r.frame({ type: 'transcript.final', utt: 1, text: 'a', message_id: 'm' });
    r.closed(1006);
    expect(r.s.notes).toEqual([]);
  });

  it('a maybe-sent note settles only on a log row naming its exact (conn, utt)', () => {
    const r = new Run('vad').live('vad');
    r.frame({ type: 'vad.start', utt: 1 });
    r.closed(1006, 1);
    expect(r.do({ type: 'logRow', seq: 9, conn: 'c2', utt: 1 })).toEqual([]);
    expect(r.do({ type: 'logRow', seq: 9, conn: 'c1', utt: 2 })).toEqual([]);
    expect(r.s.notes[0]).not.toHaveProperty('settled');
    expect(r.do({ type: 'logRow', seq: 9, conn: 'c1', utt: 1 })).toEqual([{ type: 'persist' }]);
    expect(r.s.notes[0]).toMatchObject({ settled: { seq: 9 } });
  });

  it('captured audio is never resent: seq only grows, and a reconnect starts a new connection, not a replay', () => {
    const r = new Run('vad').live('vad');
    const all = [...seqs(r.audio()), ...seqs(r.audio())];
    r.closed(1006);
    expect(r.fx.some((f) => f.type === 'sendAudio')).toBe(false);
    expect(all).toEqual([1, 2]);
  });
});

describe('persistence', () => {
  it('stores unsettled identities only (no text, no audio), newest 32, and restores them dropping malformed and expired ones', () => {
    const r = new Run('vad').live('vad');
    for (let u = 1; u <= 40; u++) r.frame({ type: 'vad.start', utt: u });
    r.closed(1006, 1000);
    const stored = pendingOf(r.s, 2000);
    expect(stored).toHaveLength(32);
    expect(stored[0]).toEqual({ conn: 'c1', utt: 9, at: 1000 });
    expect(Object.keys(stored[0] ?? {}).sort()).toEqual(['at', 'conn', 'utt']);
    const back = restorePending(JSON.parse(JSON.stringify([...stored, { conn: 'x' }, { conn: 'old', utt: 1, at: -NOTE_TTL_MS }, 'junk'])), 2000);
    expect(back).toHaveLength(32);
    expect(back.every((n) => n.kind === 'maybeSent' && n.conn === 'c1')).toBe(true);
    expect(restorePending('nope', 0)).toEqual([]);
    expect(pendingOf(r.s, 1000 + NOTE_TTL_MS)).toEqual([]);
  });
});

describe('mute', () => {
  it('push to talk: a held press ends with ptt.up, then muted at once; unmute is instant', () => {
    const r = new Run().live();
    r.do({ type: 'pttDown' }, 0);
    r.audio();
    expect(sent(r.do({ type: 'mute' }, 500))).toEqual([{ type: 'ptt.up', last_seq: 1 }]);
    expect(r.s.phase).toBe('muted');
    expect(seqs(r.audio())).toEqual([]);
    r.do({ type: 'unmute' });
    expect(r.s).toMatchObject({ phase: 'live', mic: 'ptt-idle' });
  });

  it('hands-free: zeros in place of the microphone, an open utterance committed, muted after 800 ms once every vad.start has its vad.end', () => {
    const r = new Run('vad').live('vad');
    r.audio(320, 0);
    r.frame({ type: 'vad.start', utt: 1 });
    const fx = r.do({ type: 'mute' }, 100);
    expect(sent(fx)).toEqual([{ type: 'input.commit', utt: 1, last_seq: 1 }]);
    expect(r.s.phase).toBe('muting');
    const z = r.audio(320, 200);
    expect([...(z[0] as { pcm: Int16Array }).pcm].every((x) => x === 0)).toBe(true);
    r.tick(100 + DRAIN_MIN_MS);
    expect(r.s.phase).toBe('muting'); // utt 1 still open
    r.frame({ type: 'error', code: 'stale_utterance', message: 'x' }); // a no-op
    r.frame({ type: 'vad.end', utt: 1 }, 100 + DRAIN_MIN_MS + 10);
    expect(r.s.phase).toBe('muted');
    expect(seqs(r.audio())).toEqual([]);
  });

  it('hands-free: a vad.start arriving during the drain ends in the drain; the drain stops at 3 s whatever is open', () => {
    const r = new Run('vad').live('vad');
    r.do({ type: 'mute' }, 0);
    r.tick(DRAIN_MIN_MS - 1);
    expect(r.s.phase).toBe('muting');
    r.frame({ type: 'vad.start', utt: 1 }, DRAIN_MIN_MS + 1);
    r.tick(DRAIN_MIN_MS + 100);
    expect(r.s.phase).toBe('muting');
    r.tick(DRAIN_MAX_MS);
    expect(r.s.phase).toBe('muted');
    expect(r.s.utts[1]).toEqual({ state: 'open' }); // its outcome still arrives normally
    r.frame({ type: 'transcript.final', utt: 1, text: 'x', message_id: 'm' });
    expect(r.s.utts[1]?.outcome).toEqual({ kind: 'sent', messageId: 'm' });
  });

  it('a mode switch runs the mute, then closes and reopens without taking over', () => {
    const r = new Run('vad').live('vad');
    r.do({ type: 'switch', mode: 'ptt', speak: false }, 0);
    expect(r.s.phase).toBe('muting');
    const fx = r.tick(DRAIN_MIN_MS);
    expect(fx[0]).toEqual({ type: 'close' });
    expect(fx[1]).toEqual({ type: 'open', gen: r.s.gen, mode: 'ptt', speak: false, takeover: false, require: 'stt' });
    expect(r.s).toMatchObject({ phase: 'connecting', mode: 'ptt', speak: false, seq: 0 });
  });
});

describe('Stop answer', () => {
  const stopping = () => {
    const r = new Run().live();
    const fx = r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    expect(fx.slice(0, 2)).toEqual([{ type: 'flushPlayback' }, { type: 'send', frame: { type: 'output.cancel', reply_id: 't1' } }]);
    return r;
  };

  it('cancelled + the captured turn\'s reply.final → stopped', () => {
    const r = stopping();
    r.frame({ type: 'cancel.result', reply_id: 't1', state: 'cancelled', message_ids: ['m'] });
    expect(r.s.stop?.outcome).toBeUndefined();
    r.frame({ type: 'reply.final', turn_id: 't1', text: 'x', spoken: 'partial', reason: 'cancelled' });
    expect(r.s.stop?.outcome).toBe('stopped');
  });

  it('turn_continues → cancel the captured turn by id; a failure is resent once, never more', () => {
    const r = stopping();
    expect(r.frame({ type: 'cancel.result', reply_id: 't1', state: 'turn_continues', message_ids: [] })).toEqual([{ type: 'cancelTurn', stop: 1, turnId: 't1' }]);
    expect(r.do({ type: 'turnCancelResult', stop: 1, result: 'failed' })).toEqual([{ type: 'cancelTurn', stop: 1, turnId: 't1' }]);
    expect(r.do({ type: 'turnCancelResult', stop: 1, result: 'failed' })).toEqual([]);
    r.do({ type: 'botView', stop: 1, running: false });
    expect(r.s.stop?.outcome).toBe('stopped');
  });

  it('no cancel.result within 3 s → cancel by id; not matched → already finished', () => {
    const r = stopping();
    expect(r.tick(STOP_CANCEL_WAIT_MS - 1)).toEqual([]);
    expect(r.tick(STOP_CANCEL_WAIT_MS)).toEqual([{ type: 'cancelTurn', stop: 1, turnId: 't1' }]);
    r.do({ type: 'turnCancelResult', stop: 1, result: 'notMatched' });
    expect(r.s.stop?.outcome).toBe('alreadyFinished');
  });

  it('not_active: the captured turn still running → cancel it; a newer turn running → never touched, already finished', () => {
    const a = stopping();
    a.frame({ type: 'cancel.result', reply_id: 't1', state: 'not_active', message_ids: [] });
    expect(a.do({ type: 'botView', stop: 1, running: true, turnId: 't1' })).toEqual([{ type: 'cancelTurn', stop: 1, turnId: 't1' }]);
    const b = stopping();
    b.frame({ type: 'cancel.result', reply_id: 't1', state: 'not_active', message_ids: [] });
    expect(b.do({ type: 'botView', stop: 1, running: true, turnId: 't2' })).toEqual([]);
    expect(b.s.stop?.outcome).toBe('alreadyFinished');
  });

  it('a reply.final of another turn is not evidence; without evidence for 15 s → may not have stopped', () => {
    const r = stopping();
    r.frame({ type: 'cancel.result', reply_id: 't1', state: 'cancelled', message_ids: [] });
    r.frame({ type: 'reply.final', turn_id: 't2', text: '', spoken: true });
    expect(r.s.stop?.outcome).toBeUndefined();
    r.tick(STOP_GIVE_UP_MS);
    expect(r.s.stop?.outcome).toBe('mayNotHaveStopped');
  });

  it('a completed final without cancelled → already finished', () => {
    const r = stopping();
    r.frame({ type: 'reply.final', turn_id: 't1', text: 'done', spoken: true });
    expect(r.s.stop?.outcome).toBe('alreadyFinished');
  });
});

describe('Stop answer: only its own evidence', () => {
  const stopping = () => {
    const r = new Run().live();
    const fx = r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    expect(fx.filter((f) => f.type === 'timer').map((f) => (f as { ms: number }).ms)).toEqual([STOP_CANCEL_WAIT_MS, STOP_GIVE_UP_MS]);
    return r;
  };

  it('results of an earlier Stop answer touch nothing on the next one', () => {
    const r = stopping();
    r.do({ type: 'botView', stop: 1, running: false });
    expect(r.s.stop?.outcome).toBe('alreadyFinished');
    r.do({ type: 'stopAnswer', turnId: 't2' }, 100);
    expect(r.s.stop?.id).toBe(2);
    expect(r.do({ type: 'botView', stop: 1, running: false })).toEqual([]);
    expect(r.do({ type: 'turnCancelResult', stop: 1, result: 'failed' })).toEqual([]);
    expect(r.do({ type: 'turnCancelResult', stop: 1, result: 'notMatched' })).toEqual([]);
    expect(r.s.stop).toMatchObject({ id: 2, turnId: 't2', turnCancels: 0 });
    expect(r.s.stop?.outcome).toBeUndefined();
  });

  it('a cancel.result naming another reply, or none, is not this stop\'s', () => {
    const r = stopping();
    expect(r.frame({ type: 'cancel.result', reply_id: 't0', state: 'turn_continues', message_ids: [] })).toEqual([]);
    expect(r.frame({ type: 'cancel.result', state: 'turn_continues', message_ids: [] })).toEqual([]);
    expect(r.s.stop?.result).toBeUndefined();
  });

  it('a running turn the view does not name is no evidence', () => {
    const r = stopping();
    r.frame({ type: 'cancel.result', reply_id: 't1', state: 'not_active', message_ids: [] });
    expect(r.do({ type: 'botView', stop: 1, running: true })).toEqual([]);
    expect(r.s.stop?.outcome).toBeUndefined();
  });
});

describe('Stop answer and mute together', () => {
  it('a mute drain does not swallow Stop\'s 3 s and 15 s deadlines', () => {
    const r = new Run('vad').live('vad');
    r.audio(320, 0);
    r.frame({ type: 'vad.start', utt: 1 });
    r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    r.do({ type: 'mute' }, 2500); // drain until 5.5 s at most, utt 1 stays open
    expect(r.tick(STOP_CANCEL_WAIT_MS)).toEqual([{ type: 'cancelTurn', stop: 1, turnId: 't1' }]);
    expect(r.s.phase).toBe('muting');
    r.tick(2500 + DRAIN_MAX_MS);
    expect(r.s.phase).toBe('muted');
    r.tick(STOP_GIVE_UP_MS);
    expect(r.s.stop?.outcome).toBe('mayNotHaveStopped');
  });

  it('a tick that ends the drain and passes Stop\'s give-up does both', () => {
    const r = new Run('vad').live('vad');
    r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    r.do({ type: 'mute' }, STOP_GIVE_UP_MS - DRAIN_MIN_MS);
    r.tick(STOP_GIVE_UP_MS);
    expect(r.s.phase).toBe('muted');
    expect(r.s.stop?.outcome).toBe('mayNotHaveStopped');
  });

  it('a late cancel.result of an earlier Stop of the same turn is not the next Stop\'s', () => {
    const r = new Run().live();
    r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    r.do({ type: 'botView', stop: 1, running: true, turnId: 't9' }); // resolved before its cancel.result came
    expect(r.s.stop?.outcome).toBe('alreadyFinished');
    r.do({ type: 'stopAnswer', turnId: 't1' }, 100);
    expect(r.frame({ type: 'cancel.result', reply_id: 't1', state: 'turn_continues', message_ids: [] })).toEqual([]); // stop 1's answer
    expect(r.s.stop).toMatchObject({ id: 2, turnCancels: 0 });
    expect(r.s.stop?.result).toBeUndefined();
    expect(r.frame({ type: 'cancel.result', reply_id: 't1', state: 'turn_continues', message_ids: [] })).toEqual([{ type: 'cancelTurn', stop: 2, turnId: 't1' }]);
  });
});

describe('bounds', () => {
  it('hands-free mute asks for its 3 s deadline up front, so an utterance that never ends cannot hold it open', () => {
    const r = new Run('vad').live('vad');
    r.audio(320, 0);
    r.frame({ type: 'vad.start', utt: 1 });
    const fx = r.do({ type: 'mute' }, 0);
    expect(fx.filter((f) => f.type === 'timer').map((f) => (f as { ms: number }).ms)).toEqual([DRAIN_MIN_MS, DRAIN_MAX_MS]);
    r.tick(DRAIN_MIN_MS);
    r.tick(DRAIN_MAX_MS);
    expect(r.s.phase).toBe('muted');
  });

  it('the seq never passes u32: audio past it is dropped, a release sends ptt.up with the last seq and no zero frame', () => {
    const r = new Run().live();
    r.do({ type: 'pttDown' }, 0);
    r.s = { ...r.s, seq: 0xffffffff - 1 };
    expect(seqs(r.audio())).toEqual([0xffffffff]);
    expect(seqs(r.audio())).toEqual([]);
    r.s = { ...r.s, sentSinceDown: false };
    const fx = r.do({ type: 'pttUp' }, 1000);
    expect(seqs(fx)).toEqual([]);
    expect(sent(fx)).toEqual([{ type: 'ptt.up', last_seq: 0xffffffff }]);
  });

  it('past 32 notes, settled ones go before unsettled ones, even older unsettled ones', () => {
    const r = new Run('vad').live('vad');
    r.frame({ type: 'vad.start', utt: 1 });
    r.frame({ type: 'vad.start', utt: 2 });
    r.closed(1006, 1);
    r.do({ type: 'logRow', seq: 1, conn: 'c1', utt: 2 }); // c1/1 unsettled (oldest), c1/2 settled
    r.tick(1000);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: true });
    for (let u = 1; u <= 31; u++) r.frame({ type: 'vad.start', utt: u });
    r.closed(1006, 2);
    expect(r.s.notes).toHaveLength(32);
    expect(r.s.notes[0]).toEqual({ kind: 'maybeSent', conn: 'c1', utt: 1, at: 1 });
    expect(r.s.notes.some((n) => n.kind === 'maybeSent' && n.settled)).toBe(false);
  });
});

describe('connection loss and the end', () => {
  it('1001/1011/1006 reconnect up to 3 times at 1, 2 and 4 s without taking over, then ended lost', () => {
    const r = new Run().live();
    expect(r.closed(1011)).toContainEqual({ type: 'timer', gen: r.s.gen, ms: 1000 });
    expect(r.s.phase).toBe('reconnecting');
    expect(r.tick(1000)).toEqual([{ type: 'open', gen: r.s.gen, mode: 'ptt', speak: true, takeover: false }]);
    expect(r.closed(1006)).toEqual([{ type: 'timer', gen: r.s.gen, ms: 2000 }]);
    r.tick(3000);
    expect(r.closed(1006)).toEqual([{ type: 'timer', gen: r.s.gen, ms: 4000 }]);
    r.tick(7000);
    expect(r.closed(1006)).toEqual([{ type: 'stopTracks' }]);
    expect(r.s).toMatchObject({ phase: 'ended', ended: 'lost' });
  });

  it('takeover → ended taken over (no reconnect); 1000 → ended closed; 1008 → ended protocol', () => {
    const a = new Run().live();
    a.frame({ type: 'takeover', by: 'c9' });
    expect(a.s).toMatchObject({ phase: 'ended', ended: 'takenOver' });
    expect(has(a.fx, 'stopTracks')).toBe(true);
    expect(a.closed(1000)).toEqual([]);
    const b = new Run().live();
    b.closed(1000);
    expect(b.s.ended).toBe('closed');
    const c = new Run().live();
    c.closed(1008);
    expect(c.s.ended).toBe('protocol');
  });

  it('End and stale stop the tracks, close, persist pending notes, and go off', () => {
    for (const type of ['end', 'stale'] as const) {
      const r = new Run('vad').live('vad');
      r.frame({ type: 'vad.start', utt: 1 });
      expect(r.do({ type }, 5)).toEqual([{ type: 'stopTracks' }, { type: 'close' }, { type: 'persist' }]);
      expect(r.s.phase).toBe('off');
      expect(r.s.notes).toEqual([{ kind: 'maybeSent', conn: 'c1', utt: 1, at: 5 }]);
    }
  });
});

describe('Stop speaking (bot_voice_stop_speech)', () => {
  const caps = { type: 'caps', caps: { stopSpeech: true, textKey: false } } as const;
  const speaking = (withCaps = true) => {
    const r = new Run().live();
    if (withCaps) r.do(caps);
    r.frame({ type: 'output.start', out: 1, reply_id: 't1', seg: 0, kind: 'reply' });
    return r;
  };

  it('stops the open reply\'s speech only: one playback flush and output.cancel with keep_turn, never the Stop answer path', () => {
    const r = speaking();
    expect(canStopSpeaking(r.s)).toBe(true);
    const fx = r.do({ type: 'stopSpeaking' });
    expect(fx).toEqual([{ type: 'flushPlayback' }, { type: 'send', frame: { type: 'output.cancel', reply_id: 't1', keep_turn: true } }]);
    expect(fx.filter((f) => f.type === 'flushPlayback')).toHaveLength(1);
    expect(r.s.stop).toBeUndefined();
    expect(has(fx, 'cancelTurn') || has(fx, 'timer')).toBe(false);
    // Its answer (turn_continues) cancels nothing, and the turn's reply.final ends the reply as usual.
    expect(r.frame({ type: 'cancel.result', reply_id: 't1', state: 'turn_continues', message_ids: [] })).toEqual([]);
    expect(r.s.reply?.speechStopped).toBe(true);
    r.frame({ type: 'reply.final', turn_id: 't1', text: 'all of it', spoken: 'partial' });
    expect(r.s.reply).toBeUndefined();
    expect(canStopSpeaking(r.s)).toBe(false);
  });

  it('is refused without the capability, without an open reply, once sent for the reply, and while not speaking', () => {
    const none = speaking(false);
    expect(canStopSpeaking(none.s)).toBe(false);
    expect(none.do({ type: 'stopSpeaking' })).toEqual([]);
    const idle = new Run().live();
    idle.do(caps);
    expect(idle.do({ type: 'stopSpeaking' })).toEqual([]);
    const twice = speaking();
    twice.do({ type: 'stopSpeaking' });
    expect(twice.do({ type: 'stopSpeaking' })).toEqual([]);
    // The same reply's later frames do not open it again; a new turn's reply does.
    twice.frame({ type: 'reply.provisional', turn_id: 't1', seq: 2, text: 'more' });
    expect(canStopSpeaking(twice.s)).toBe(false);
    twice.frame({ type: 'reply.provisional', turn_id: 't2', seq: 1, text: 'next' });
    expect(canStopSpeaking(twice.s)).toBe(true);
    const quiet = new Run();
    quiet.s = { ...quiet.s, speak: false };
    quiet.live();
    quiet.do(caps);
    quiet.frame({ type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'x' });
    expect(canStopSpeaking(quiet.s)).toBe(false);
    // An announcement is not a reply.
    const ann = new Run().live();
    ann.do(caps);
    ann.frame({ type: 'output.start', out: 1, reply_id: 'a1', seg: 0, kind: 'announcement' });
    expect(canStopSpeaking(ann.s)).toBe(false);
  });

  it('is refused while a Stop answer runs, and counts as a cancel so Stop answer still reads its own cancel.result', () => {
    const r = speaking();
    r.do({ type: 'stopSpeaking' }, 0);
    r.do({ type: 'stopAnswer', turnId: 't1' }, 1);
    expect(r.s.stop?.cancelNo).toBe(2);
    expect(canStopSpeaking(r.s)).toBe(false);
    // The first answer is Stop speaking's (turn_continues): it must not make the Stop cancel the turn.
    expect(r.frame({ type: 'cancel.result', reply_id: 't1', state: 'turn_continues', message_ids: [] })).toEqual([]);
    expect(r.s.stop?.result).toBeUndefined();
    r.frame({ type: 'cancel.result', reply_id: 't1', state: 'cancelled', message_ids: ['m'] });
    expect(r.s.stop?.result).toBe('cancelled');
  });

  it('is refused while a Stop answer runs on a reply still spoken (Stop answer already flushes and cancels it)', () => {
    const r = speaking();
    r.do({ type: 'stopAnswer', turnId: 't1' }, 0);
    expect(r.s.reply?.speechStopped).toBe(false);
    expect(canStopSpeaking(r.s)).toBe(false);
    expect(r.do({ type: 'stopSpeaking' })).toEqual([]);
    expect(r.s.cancelsSent).toBe(1);
  });

  it('a late frame of a reply that ended, or that a newer one followed, never takes the open place back', () => {
    const r = speaking();
    r.do({ type: 'stopSpeaking' });
    r.frame({ type: 'reply.final', turn_id: 't1', text: 'x', spoken: 'partial' });
    r.frame({ type: 'output.start', out: 2, reply_id: 't2', seg: 0, kind: 'reply' });
    // Late frames of t1: a provisional and an output start.
    r.frame({ type: 'reply.provisional', turn_id: 't1', seq: 9, text: 'late' });
    r.frame({ type: 'output.start', out: 3, reply_id: 't1', seg: 1, kind: 'reply' });
    expect(r.s.reply).toEqual({ turnId: 't2', speechStopped: false });
    expect(sent(r.do({ type: 'stopSpeaking' }))).toEqual([{ type: 'output.cancel', reply_id: 't2', keep_turn: true }]);
    // A final of another turn leaves the open reply; the open one's final closes it.
    const o = speaking();
    o.frame({ type: 'reply.provisional', turn_id: 't2', seq: 1, text: 'next' });
    o.frame({ type: 'reply.final', turn_id: 't9', text: '', spoken: false });
    expect(o.s.reply?.turnId).toBe('t2');
    // t1 was followed by t2: its late frame does not reopen it.
    o.frame({ type: 'reply.provisional', turn_id: 't1', seq: 3, text: 'late' });
    expect(o.s.reply?.turnId).toBe('t2');
    o.frame({ type: 'reply.final', turn_id: 't2', text: 'done', spoken: true });
    expect(o.s.reply).toBeUndefined();
    expect(canStopSpeaking(o.s)).toBe(false);
  });

  it('late finals of turns older than the history never push a recent ended turn out', () => {
    const r = speaking();
    // t1 .. t17, each superseding the one before; then Stop speaking on t17 and its final.
    for (let n = 2; n <= 17; n++) r.frame({ type: 'reply.provisional', turn_id: `t${n}`, seq: 1, text: 'x' });
    expect(r.do({ type: 'stopSpeaking' })).not.toEqual([]);
    r.frame({ type: 'reply.final', turn_id: 't17', text: 'x', spoken: 'partial' });
    expect(r.s.pastReplies).toHaveLength(PAST_REPLIES_CAP);
    // Late finals of t1 .. t16: t1 is no longer kept, so its final records nothing and evicts nothing.
    const before = r.s.pastReplies;
    for (let n = 1; n <= 16; n++) r.frame({ type: 'reply.final', turn_id: `t${n}`, text: 'x', spoken: true });
    expect(r.s.pastReplies).toEqual(before);
    expect(r.s.pastReplies).toContain('t17');
    // A late provisional or output start of t17 does not reopen it: Stop speaking stays off, no second cancel.
    r.frame({ type: 'reply.provisional', turn_id: 't17', seq: 9, text: 'late' });
    r.frame({ type: 'output.start', out: 9, reply_id: 't17', seg: 2, kind: 'reply' });
    expect(r.s.reply).toBeUndefined();
    expect(canStopSpeaking(r.s)).toBe(false);
    expect(r.do({ type: 'stopSpeaking' })).toEqual([]);
  });

  it('a final of an unknown turn while a reply is open leaves that reply open, Stop speaking included', () => {
    const r = speaking();
    const past = r.s.pastReplies;
    r.frame({ type: 'reply.final', turn_id: 'never-seen', text: '', spoken: false });
    expect(r.s.reply).toEqual({ turnId: 't1', speechStopped: false });
    expect(r.s.pastReplies).toEqual(past);
    expect(canStopSpeaking(r.s)).toBe(true);
    expect(sent(r.do({ type: 'stopSpeaking' }))).toEqual([{ type: 'output.cancel', reply_id: 't1', keep_turn: true }]);
  });

  it('a new connection has no open reply; the capability carries over', () => {
    const r = speaking();
    r.closed(1006, 1);
    r.tick(1001);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: false });
    expect(r.s.reply).toBeUndefined();
    expect(r.s.caps.stopSpeech).toBe(true);
    expect(canStopSpeaking(r.s)).toBe(false);
  });
});

describe('keyed typed messages (bot_voice_text_key)', () => {
  const keyed = () => {
    const r = new Run().live();
    r.do({ type: 'caps', caps: { stopSpeech: false, textKey: true } });
    return r;
  };

  it('sends text with its key once, pending until its text.result, which settles it exactly once', () => {
    const r = keyed();
    expect(canSendText(r.s)).toBe(true);
    expect(sent(r.do({ type: 'sendText', text: 'hello', key: 'k1' }, 3))).toEqual([{ type: 'text', text: 'hello', key: 'k1' }]);
    expect(textOf(r.s, 'k1')).toEqual({ state: 'pending', conn: 'c1', at: 3 });
    // While it waits, the same key is not sent again.
    expect(r.do({ type: 'sendText', text: 'hello', key: 'k1' })).toEqual([]);
    r.frame({ type: 'text.result', key: 'k1', state: 'queued', message_id: 'm1' });
    expect(textOf(r.s, 'k1')).toEqual({ state: 'queued', conn: 'c1', at: 3, messageId: 'm1' });
    // A repeated answer, or one for a key never sent, changes nothing (never a throw).
    const before = r.s;
    r.frame({ type: 'text.result', key: 'k1', state: 'refused', code: 'busy' });
    r.frame({ type: 'text.result', key: 'nope', state: 'posted' });
    r.frame({ type: 'text.result', key: 'toString', state: 'posted' });
    expect(r.s).toBe(before);
  });

  it('a refused, unknown or lost one may be sent again under its key (the agent answers the same key and text with the first message)', () => {
    const r = keyed();
    r.do({ type: 'sendText', text: 'hi', key: 'k1' });
    r.frame({ type: 'text.result', key: 'k1', state: 'refused', code: 'busy', message: 'too much is waiting' });
    expect(textOf(r.s, 'k1')).toMatchObject({ state: 'refused', code: 'busy', message: 'too much is waiting' });
    expect(sent(r.do({ type: 'sendText', text: 'hi', key: 'k1' }))).toEqual([{ type: 'text', text: 'hi', key: 'k1' }]);
    expect(textOf(r.s, 'k1')?.state).toBe('pending');
    r.frame({ type: 'text.result', key: 'k1', state: 'unknown', message: 'read it by its key' });
    expect(sent(r.do({ type: 'sendText', text: 'hi', key: 'k1' }))).toEqual([{ type: 'text', text: 'hi', key: 'k1' }]);
    // Lost on a reconnect, then sent again on the new connection.
    r.closed(1006, 5);
    r.tick(1005);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: false });
    expect(textOf(r.s, 'k1')?.state).toBe('lost');
    expect(sent(r.do({ type: 'sendText', text: 'hi', key: 'k1' }, 6))).toEqual([{ type: 'text', text: 'hi', key: 'k1' }]);
    expect(textOf(r.s, 'k1')).toEqual({ state: 'pending', conn: 'c2', at: 6 });
  });

  it('a dropped one keeps its reason and is never posted or sent again under its key; new words under a new key go', () => {
    const r = keyed();
    r.do({ type: 'sendText', text: 'hi', key: 'k1' }, 2);
    r.frame({ type: 'text.result', key: 'k1', state: 'dropped', message_id: 'm1', reason: 'key_conflict', message: 'not delivered' });
    expect(textOf(r.s, 'k1')).toEqual({ state: 'dropped', conn: 'c1', at: 2, messageId: 'm1', reason: 'key_conflict', message: 'not delivered' });
    // Its key is spent: nothing goes out under it again, and a later answer for it changes nothing.
    expect(r.do({ type: 'sendText', text: 'hi', key: 'k1' })).toEqual([]);
    r.frame({ type: 'text.result', key: 'k1', state: 'posted', message_id: 'm1' });
    expect(textOf(r.s, 'k1')?.state).toBe('dropped');
    expect(sent(r.do({ type: 'sendText', text: 'hi', key: 'k2' }, 4))).toEqual([{ type: 'text', text: 'hi', key: 'k2' }]);
    // A reconnect leaves a dropped one as it is (only a waiting key is lost).
    r.closed(1006, 5);
    expect(textOf(r.s, 'k1')?.state).toBe('dropped');
  });

  it('a takeover ends the connection: a key still waiting is lost, a settled one stays', () => {
    const r = keyed();
    r.do({ type: 'sendText', text: 'a', key: 'wait' }, 1);
    r.do({ type: 'sendText', text: 'b', key: 'done' }, 2);
    r.frame({ type: 'text.result', key: 'done', state: 'posted', message_id: 'm2' });
    r.frame({ type: 'takeover', by: 'other tab' });
    expect(r.s.phase).toBe('ended');
    expect(textOf(r.s, 'wait')).toEqual({ state: 'lost', conn: 'c1', at: 1 });
    expect(textOf(r.s, 'done')?.state).toBe('posted');
    expect(r.s.reply).toBeUndefined();
  });

  it('at most TEXTS_CAP wait at once: one more distinct key is refused until an answer makes room', () => {
    const r = keyed();
    for (let i = 0; i < TEXTS_CAP; i++) r.do({ type: 'sendText', text: 't', key: `p${i}` }, i);
    expect(canSendText(r.s)).toBe(false);
    expect(r.do({ type: 'sendText', text: 't', key: 'one-more' })).toEqual([]);
    expect(Object.keys(r.s.texts)).toHaveLength(TEXTS_CAP);
    r.frame({ type: 'text.result', key: 'p0', state: 'posted', message_id: 'm0' });
    expect(canSendText(r.s)).toBe(true);
    expect(sent(r.do({ type: 'sendText', text: 't', key: 'one-more' }, 99))).toHaveLength(1);
    expect(Object.keys(r.s.texts)).toHaveLength(TEXTS_CAP);
    expect(textOf(r.s, 'p0')).toBeUndefined();
  });

  it('is refused without the capability, while not connected, and for a frame the codec refuses', () => {
    const r = new Run().live();
    expect(canSendText(r.s)).toBe(false);
    expect(r.do({ type: 'sendText', text: 'hi', key: 'k1' })).toEqual([]);
    const k = keyed();
    for (const bad of [{ text: '   ', key: 'k' }, { text: 'hi', key: 'has space' }, { text: 'hi', key: 'compat:x' }, { text: 'x'.repeat(70000), key: 'k' }]) {
      expect(k.do({ type: 'sendText', ...bad })).toEqual([]);
    }
    expect(k.s.texts).toEqual({});
    k.do({ type: 'end' });
    expect(canSendText(k.s)).toBe(false);
    expect(k.do({ type: 'sendText', text: 'hi', key: 'k1' })).toEqual([]);
  });

  it('a connection that ends turns a waiting key into lost (it may have arrived); its answer on a new connection is not taken', () => {
    const r = keyed();
    r.do({ type: 'sendText', text: 'hi', key: 'k1' }, 1);
    r.closed(1006, 2);
    expect(textOf(r.s, 'k1')).toEqual({ state: 'lost', conn: 'c1', at: 1 });
    r.tick(1002);
    r.frame({ type: 'session', epoch: 2, conn: 'c2', in_rate: 16000, out_rate: 24000, vad: false });
    r.frame({ type: 'text.result', key: 'k1', state: 'posted', message_id: 'm1' });
    expect(textOf(r.s, 'k1')?.state).toBe('lost');
  });

  it('keeps at most TEXTS_CAP keys: settled ones leave first, oldest first, never a pending one', () => {
    const r = keyed();
    r.do({ type: 'sendText', text: 'first', key: 'p0' }, 0);
    for (let i = 1; i < TEXTS_CAP; i++) {
      r.do({ type: 'sendText', text: 't', key: `k${i}` }, i);
      r.frame({ type: 'text.result', key: `k${i}`, state: 'posted', message_id: `m${i}` });
    }
    r.do({ type: 'sendText', text: 't', key: 'new' }, 100);
    expect(Object.keys(r.s.texts)).toHaveLength(TEXTS_CAP);
    expect(textOf(r.s, 'p0')?.state).toBe('pending');
    expect(textOf(r.s, 'k1')).toBeUndefined();
    expect(textOf(r.s, 'new')?.state).toBe('pending');
  });
});
