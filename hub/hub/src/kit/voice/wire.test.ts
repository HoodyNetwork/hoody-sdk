// @vitest-environment node
// kit/voice/wire.ts: the hoody.voice.v1 codec. Binary frames byte for byte, the bounds the agent closes a connection on,
// and server frames that are never partly trusted.
import { describe, expect, it } from 'vitest';
import {
  MAX_TEXT_FRAME_BYTES,
  closeKind,
  connectQuery,
  decodeOutputAudio,
  encodeClientFrame,
  encodeInputAudio,
  isWireError,
  parseServerFrame,
} from './wire';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return isWireError(e) ? e.code : 'other';
  }
  return undefined;
};

describe('input.audio', () => {
  it('is 0x00, the seq big-endian, then little-endian PCM', () => {
    const pcm = new Int16Array(320); // 20 ms at 16 kHz
    pcm[0] = 1;
    pcm[1] = -2;
    pcm[319] = 0x1234;
    const b = new Uint8Array(encodeInputAudio(0x01020304, pcm, 16000));
    expect(b.length).toBe(5 + 640);
    expect([...b.slice(0, 7)]).toEqual([0x00, 0x01, 0x02, 0x03, 0x04, 0x01, 0x00]);
    expect([b[7], b[8]]).toEqual([0xfe, 0xff]);
    expect([b[5 + 638], b[5 + 639]]).toEqual([0x34, 0x12]);
  });

  it('holds 20 to 200 ms only, and a seq that fits u32', () => {
    expect(code(() => encodeInputAudio(1, new Int16Array(319), 16000))).toBe('bad_duration');
    expect(code(() => encodeInputAudio(1, new Int16Array(3201), 16000))).toBe('bad_duration');
    expect(code(() => encodeInputAudio(1, new Int16Array(3200), 16000))).toBeUndefined();
    expect(code(() => encodeInputAudio(1, new Int16Array(960), 48000))).toBeUndefined();
    for (const s of [-1, 1.5, 2 ** 32, Number.NaN]) expect(code(() => encodeInputAudio(s, new Int16Array(320), 16000))).toBe('bad_number');
    expect(code(() => encodeInputAudio(2 ** 32 - 1, new Int16Array(320), 16000))).toBeUndefined();
  });
});

describe('output.audio', () => {
  const frame = (tag: number, out: number, offset: number, body: number[]): ArrayBuffer => {
    const b = new Uint8Array(9 + body.length);
    const v = new DataView(b.buffer);
    v.setUint8(0, tag);
    v.setUint32(1, out, false);
    v.setUint32(5, offset, false);
    b.set(body, 9);
    return b.buffer;
  };

  it('reads out and offset big-endian and the PCM little-endian', () => {
    const a = decodeOutputAudio(frame(1, 7, 48000, [0x01, 0x00, 0xff, 0xff, 0x34, 0x12]));
    expect(a && { out: a.out, offset: a.offset, pcm: [...a.pcm] }).toEqual({ out: 7, offset: 48000, pcm: [1, -1, 0x1234] });
    expect(decodeOutputAudio(frame(1, 2 ** 32 - 1, 0, []))?.out).toBe(2 ** 32 - 1);
  });

  it('is null for another tag, a short header or an odd PCM length (never partly played)', () => {
    expect(decodeOutputAudio(frame(0, 1, 0, [0, 0]))).toBeNull();
    expect(decodeOutputAudio(frame(1, 1, 0, [0, 0, 0]))).toBeNull();
    expect(decodeOutputAudio(new Uint8Array([1, 0, 0, 0]).buffer)).toBeNull();
  });
});

describe('client frames', () => {
  it('carry only the declared fields, in a fixed order', () => {
    expect(encodeClientFrame({ type: 'ptt.up', last_seq: 9, extra: 1 } as never)).toBe('{"type":"ptt.up","last_seq":9}');
    expect(encodeClientFrame({ type: 'output.cancel' })).toBe('{"type":"output.cancel"}');
    expect(encodeClientFrame({ type: 'output.cancel', reply_id: 't1' })).toBe('{"type":"output.cancel","reply_id":"t1"}');
    expect(encodeClientFrame({ type: 'playback.mark', played_to: 480, out: 3 })).toBe('{"type":"playback.mark","out":3,"played_to":480}');
  });

  it('refuse what the agent refuses: bad numbers, blank text or answer, a reason without deny or over 500 characters', () => {
    expect(code(() => encodeClientFrame({ type: 'playback.mark', out: -1, played_to: 0 }))).toBe('bad_number');
    expect(code(() => encodeClientFrame({ type: 'ptt.up' } as never))).toBe('missing');
    expect(code(() => encodeClientFrame({ type: 'own_gate.decide', gate_id: 'g', generation: 1, decision: 'maybe' } as never))).toBe('bad_value');
    expect(code(() => encodeClientFrame({ type: 'text', text: 5 } as never))).toBe('bad_value');
    expect(code(() => encodeClientFrame({ type: 'output.cancel', reply_id: 7 } as never))).toBe('bad_value');
    expect(code(() => encodeClientFrame({ type: 'text', text: '  \n' }))).toBe('blank');
    expect(code(() => encodeClientFrame({ type: 'own_gate.answer', gate_id: 'g', generation: 1, answer: ' ' }))).toBe('blank');
    expect(code(() => encodeClientFrame({ type: 'own_gate.decide', gate_id: 'g', generation: 1, decision: 'approve', reason: 'x' }))).toBe('reason_without_deny');
    const ok = { type: 'own_gate.decide', gate_id: 'g', generation: 1, decision: 'deny' } as const;
    // Characters, not UTF-16 units: 500 emoji are 1000 units and still fit.
    expect(code(() => encodeClientFrame({ ...ok, reason: '😀'.repeat(500) }))).toBeUndefined();
    expect(code(() => encodeClientFrame({ ...ok, reason: 'x'.repeat(501) }))).toBe('too_long');
  });

  it('stop speech only with keep_turn (a boolean, sent only when given)', () => {
    expect(encodeClientFrame({ type: 'output.cancel', keep_turn: true, reply_id: 't1' })).toBe('{"type":"output.cancel","reply_id":"t1","keep_turn":true}');
    expect(encodeClientFrame({ type: 'output.cancel', keep_turn: false })).toBe('{"type":"output.cancel","keep_turn":false}');
    expect(code(() => encodeClientFrame({ type: 'output.cancel', keep_turn: 'yes' } as never))).toBe('bad_value');
    expect(code(() => encodeClientFrame({ type: 'output.cancel', keep_turn: 1 } as never))).toBe('bad_value');
  });

  it('carry a typed message\'s key only when it is one the agent takes (1-255 printable ASCII, no spaces, not another door\'s)', () => {
    expect(encodeClientFrame({ type: 'text', text: 'hi', key: 'k-1' })).toBe('{"type":"text","text":"hi","key":"k-1"}');
    expect(encodeClientFrame({ type: 'text', text: 'hi' })).toBe('{"type":"text","text":"hi"}');
    expect(code(() => encodeClientFrame({ type: 'text', text: 'hi', key: '!'.repeat(255) }))).toBeUndefined();
    expect(code(() => encodeClientFrame({ type: 'text', text: 'hi', key: '~' }))).toBeUndefined();
    for (const key of ['', 'a b', 'a\tb', 'é', '\x7f', 'x'.repeat(256), 'compat:1', 'chan:1']) {
      expect(code(() => encodeClientFrame({ type: 'text', text: 'hi', key })), JSON.stringify(key)).toBe('bad_value');
    }
    expect(code(() => encodeClientFrame({ type: 'text', text: 'hi', key: 7 } as never))).toBe('bad_value');
    // A key that only contains another door's prefix later is the person's own.
    expect(code(() => encodeClientFrame({ type: 'text', text: 'hi', key: 'my-compat:1' }))).toBeUndefined();
  });

  it('refuse a frame over 64 KiB as sent (escaping and multi-byte characters counted), never cut it', () => {
    const room = MAX_TEXT_FRAME_BYTES - '{"type":"text","text":""}'.length;
    expect(code(() => encodeClientFrame({ type: 'text', text: 'a'.repeat(room) }))).toBeUndefined();
    expect(code(() => encodeClientFrame({ type: 'text', text: 'a'.repeat(room + 1) }))).toBe('too_big');
    expect(code(() => encodeClientFrame({ type: 'text', text: '"'.repeat(room / 2 + 1) }))).toBe('too_big');
    expect(code(() => encodeClientFrame({ type: 'text', text: 'é'.repeat(room / 2 + 1) }))).toBe('too_big');
  });
});

describe('server frames', () => {
  const p = (o: unknown) => parseServerFrame(JSON.stringify(o));

  it('read a declared frame with only its declared fields', () => {
    expect(p({ type: 'session', epoch: 3, conn: 'c1', in_rate: 16000, out_rate: 24000, vad: false, play_lead: true, x: 1 })).toEqual({
      type: 'session', epoch: 3, conn: 'c1', in_rate: 16000, out_rate: 24000, vad: false, play_lead: true,
    });
    expect(p({ type: 'reply.final', turn_id: 't', text: 'hi', spoken: 'partial', reason: 'barge_in' })).toMatchObject({ spoken: 'partial' });
    expect(p({ type: 'cancel.result', state: 'not_active', message_ids: [] })).toEqual({ type: 'cancel.result', state: 'not_active', message_ids: [] });
    expect(p({ type: 'own_gate.pending', gate_id: 'g', generation: 2, kind: 'confirm', summary: 's', decisions: null })).toMatchObject({ decisions: null });
  });

  it('are invalid when a required field is missing or of the wrong kind (never partly trusted)', () => {
    expect(p({ type: 'vad.start' })).toEqual({ type: 'invalid', reason: 'vad.start.utt' });
    expect(p({ type: 'vad.start', utt: '1' })).toEqual({ type: 'invalid', reason: 'vad.start.utt' });
    expect(p({ type: 'output.end', out: 1, samples: -5 })).toEqual({ type: 'invalid', reason: 'output.end.samples' });
    expect(p({ type: 'reply.final', turn_id: 't', text: '', spoken: 'yes' })).toEqual({ type: 'invalid', reason: 'reply.final.spoken' });
    expect(p({ type: 'output.start', out: 1, reply_id: 'r', seg: 0, kind: 'song' })).toEqual({ type: 'invalid', reason: 'output.start.kind' });
    expect(p({ type: 'cancel.result', state: 'cancelled', message_ids: [1] })).toEqual({ type: 'invalid', reason: 'cancel.result.message_ids' });
    expect(p({ type: 'transcript.final', utt: 1, text: '', failed: 'submit', error: { code: 'x' } })).toEqual({ type: 'invalid', reason: 'transcript.final.error' });
    expect(p({ type: 'session', epoch: 1, conn: 'c', in_rate: 16000, out_rate: 24000, vad: true, speak: 'no' })).toEqual({ type: 'invalid', reason: 'session.speak' });
    const ve = { code: 'c', message: 'm', retryable: false };
    expect(p({ type: 'transcript.final', utt: 1, text: '', failed: 'x', error: { ...ve, retry_after_secs: 'soon' } })).toEqual({ type: 'invalid', reason: 'transcript.final.error' });
    expect(p({ type: 'error', code: 'x', message: 'm', error: { ...ve, diag_id: 3 } })).toEqual({ type: 'invalid', reason: 'error.error' });
    expect(p({ type: 'transcript.final', utt: 1, text: '', failed: 'x', error: { ...ve, reason: 'r', diag_id: 'd', retry_after_secs: 2 } })).toMatchObject({ error: { retry_after_secs: 2 } });
    expect(p({ type: 'own_gate.pending', gate_id: 'g', generation: 1, kind: 'confirm', summary: 's', decisions: [1] })).toEqual({ type: 'invalid', reason: 'own_gate.pending.decisions' });
    expect(p({ type: 'own_gate.pending', gate_id: 'g', generation: 1, kind: 'question', summary: 's', questions: ['q'] })).toEqual({ type: 'invalid', reason: 'own_gate.pending.questions' });
    expect(parseServerFrame('not json')).toEqual({ type: 'invalid', reason: 'not JSON' });
    expect(p([1])).toEqual({ type: 'invalid', reason: 'no frame type' });
  });

  it('read a keyed text frame\'s receipt: its state picks the branch, its code is plain text', () => {
    expect(p({ type: 'text.result', key: 'k', state: 'queued', message_id: 'm1' })).toEqual({ type: 'text.result', key: 'k', state: 'queued', message_id: 'm1' });
    expect(p({ type: 'text.result', key: 'k', state: 'refused', code: 'a_code_added_later', message: 'no' })).toEqual({
      type: 'text.result', key: 'k', state: 'refused', code: 'a_code_added_later', message: 'no',
    });
    expect(p({ type: 'text.result', key: 'k', state: 'unknown', extra: 1 })).toEqual({ type: 'text.result', key: 'k', state: 'unknown' });
    expect(p({ type: 'text.result', key: 'k', state: 'lost' })).toEqual({ type: 'invalid', reason: 'text.result.state' });
    // dropped carries why as plain text: a reason added later is still a drop, one that is not text is invalid.
    expect(p({ type: 'text.result', key: 'k', state: 'dropped', message_id: 'm1', reason: 'access_revoked' })).toEqual({ type: 'text.result', key: 'k', state: 'dropped', message_id: 'm1', reason: 'access_revoked' });
    expect(p({ type: 'text.result', key: 'k', state: 'dropped', reason: 'a_reason_added_later' })).toEqual({ type: 'text.result', key: 'k', state: 'dropped', reason: 'a_reason_added_later' });
    expect(p({ type: 'text.result', key: 'k', state: 'dropped', reason: 7 })).toEqual({ type: 'invalid', reason: 'text.result.reason' });
    expect(p({ type: 'text.result', state: 'posted' })).toEqual({ type: 'invalid', reason: 'text.result.key' });
    expect(p({ type: 'text.result', key: 'k', state: 'posted', message_id: 4 })).toEqual({ type: 'invalid', reason: 'text.result.message_id' });
  });

  it('a frame type the agent added later is unknown (ignored), not invalid', () => {
    expect(p({ type: 'speech.meter', level: 3 })).toEqual({ type: 'unknown', name: 'speech.meter' });
    // An inherited name is not a frame.
    expect(p({ type: 'toString' })).toEqual({ type: 'unknown', name: 'toString' });
  });
});

describe('connecting', () => {
  it('always asks refuse=frame and pcm16; sends takeover, speak=false and play_lead only when asked', () => {
    expect(connectQuery({ mode: 'ptt' })).toEqual({ mode: 'ptt', in_format: 'pcm16', refuse: 'frame' });
    expect(connectQuery({ mode: 'vad', inRate: 16000, outRate: 24000, takeover: true, speak: false, playLead: true, require: 'stt,tts' })).toEqual({
      mode: 'vad', in_format: 'pcm16', refuse: 'frame', in_rate: '16000', out_rate: '24000', takeover: 'true', speak: 'false', play_lead: 'true', require: 'stt,tts',
    });
    expect(connectQuery({ mode: 'ptt', takeover: false, speak: true, playLead: false })).toEqual({ mode: 'ptt', in_format: 'pcm16', refuse: 'frame' });
  });

  it('reads close codes: 4000 + status is a refusal, 1006 and undeclared codes are a loss', () => {
    expect(closeKind(4409)).toEqual({ kind: 'refused', status: 409 });
    expect(closeKind(4503)).toEqual({ kind: 'refused', status: 503 });
    expect(closeKind(1000).kind).toBe('normal');
    expect(closeKind(1008).kind).toBe('policy');
    expect(closeKind(1006).kind).toBe('lost');
    expect(closeKind(3000).kind).toBe('lost');
  });
});
