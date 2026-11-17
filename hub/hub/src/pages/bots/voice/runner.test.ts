// runner.ts against fake ports: the machine's effects run in order, async results are fenced by generation and by the
// socket they came from, cancelTurn keeps its captured turn, port failures are contained, dispose ends everything.
import { describe, expect, it, vi } from 'vitest';
import { voiceInitial as initial, type VoiceState } from '@kit/pure';
import { createVoiceRunner, type ClientFrame, type ServerFrame, type VoiceOpen, type VoicePorts, type VoiceSocketEvents } from './runner';

type Sock = { o: VoiceOpen; on: VoiceSocketEvents; sent: ClientFrame[]; audio: number[]; closed: number };
function fakes(over: Partial<VoicePorts> = {}) {
  let t = 1_000_000;
  const socks: Sock[] = [];
  const timers: Array<{ ms: number; fn: () => void; live: boolean }> = [];
  const cancels: string[] = [];
  const persisted: unknown[] = [];
  const answers: Array<(r: 'matched' | 'notMatched' | 'failed') => void> = [];
  const ports: VoicePorts = {
    open: (o, on) => {
      const k: Sock = { o, on, sent: [], audio: [], closed: 0 };
      socks.push(k);
      return { send: (f) => void k.sent.push(f), sendAudio: (seq) => void k.audio.push(seq), close: () => void (k.closed += 1) };
    },
    stopTracks: vi.fn(),
    flushPlayback: vi.fn(),
    cancelTurn: (turnId) => {
      cancels.push(turnId);
      return new Promise((res) => answers.push(res));
    },
    timer: (ms, fn) => {
      // A timer that fired is no longer live, as a real one: only a pending one can be left behind.
      const x = { ms, fn: () => { x.live = false; fn(); }, live: true };
      timers.push(x);
      return () => void (x.live = false);
    },
    persist: (ids) => void persisted.push(ids),
    now: () => t,
    ...over,
  };
  return { ports, socks, timers, cancels, persisted, answers, advance: (ms: number) => void (t += ms), now: () => t };
}
const session = (conn = 'k1'): ServerFrame => ({ type: 'session', epoch: 1, conn, in_rate: 16000, out_rate: 24000, vad: false });
/** Press, the start promises ready, the socket's session frame: live on socket 0. */
function live(f: ReturnType<typeof fakes>, init: VoiceState = initial('ptt')) {
  const states: VoiceState[] = [];
  const r = createVoiceRunner(init, f.ports, (s) => states.push(s));
  r.dispatch({ type: 'press' });
  r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
  f.socks[0]!.on.frame(session());
  return { r, states };
}
const flush = () => new Promise<void>((res) => setTimeout(res, 0));

describe('the Talk effect runner', () => {
  it('opens the socket the machine asks for, and the socket\'s frames reach the machine', () => {
    const f = fakes();
    const { r, states } = live(f);
    expect(f.socks).toHaveLength(1);
    expect(f.socks[0]!.o).toEqual({ mode: 'ptt', speak: true, takeover: false, require: 'stt,tts' });
    expect(r.state().phase).toBe('live');
    expect(r.state().conn).toBe('k1');
    expect(states.at(-1)).toBe(r.state());
  });
  it('sends frames and audio on the socket it holds, in the machine\'s order', () => {
    const f = fakes();
    const { r } = live(f);
    r.dispatch({ type: 'pttDown' });
    f.advance(500);
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'pttUp' });
    expect(f.socks[0]!.sent.map((x) => x.type)).toEqual(['ptt.down', 'ptt.up']);
    expect(f.socks[0]!.audio).toEqual([1, 2]);
    expect(f.ports.flushPlayback).toHaveBeenCalledTimes(1);
  });
  it('a frame or close from a socket it replaced or closed never reaches the machine', () => {
    const f = fakes();
    const { r, states } = live(f);
    r.dispatch({ type: 'end' });
    expect(f.socks[0]!.closed).toBe(1);
    const before = r.state();
    const n = states.length;
    f.socks[0]!.on.frame(session('late'));
    f.socks[0]!.on.closed(1000);
    expect(r.state()).toBe(before);
    // Dropped before the machine: no step ran, so no state was reported.
    expect(states.length).toBe(n);
    // Talk again: a new socket; the old one's late frames still change nothing.
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    expect(f.socks).toHaveLength(2);
    const m = states.length;
    f.socks[0]!.on.frame(session('stale'));
    expect(states.length).toBe(m);
    expect(r.state().phase).toBe('connecting');
    f.socks[1]!.on.frame(session('k2'));
    expect(r.state().conn).toBe('k2');
    // The old socket's late close does not drop the one it holds now: sends still reach socket 1.
    f.socks[0]!.on.closed(1000);
    expect(r.state().phase).toBe('live');
    r.dispatch({ type: 'pttDown' });
    expect(f.socks[1]!.sent.map((x) => x.type)).toEqual(['ptt.down']);
  });
  it('a late start result of an earlier press only stops its tracks', () => {
    const f = fakes();
    const r = createVoiceRunner(initial('ptt'), f.ports);
    r.dispatch({ type: 'press' });
    const old = r.state().gen;
    r.dispatch({ type: 'end' });
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: old, result: 'ready' });
    expect(f.socks).toHaveLength(0);
    expect(f.ports.stopTracks).toHaveBeenCalled();
    expect(r.state().phase).toBe('starting');
  });
  it('Stop answer: cancelTurn sends the captured turn id, answers with its own Stop id, and resends once on failed', async () => {
    const f = fakes();
    const { r } = live(f);
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
    r.dispatch({ type: 'stopAnswer', turnId: 't1' });
    const stopId = r.state().stop!.id;
    // A newer turn opens; the 3 s deadline cancels by the captured id only.
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't2', seq: 1, text: 'Next' } });
    f.advance(3000);
    f.timers.filter((x) => x.ms === 3000)[0]!.fn();
    expect(f.cancels).toEqual(['t1']);
    f.answers[0]!('failed');
    await flush();
    expect(f.cancels).toEqual(['t1', 't1']);
    expect(r.state().stop!.id).toBe(stopId);
    f.answers[1]!('matched');
    await flush();
    expect(r.state().stop!.turnCancels).toBe(2);
    expect(f.cancels).toEqual(['t1', 't1']);
  });
  it('a cancelTurn port that throws or rejects answers failed', async () => {
    for (const bad of [() => { throw new Error('x'); }, () => Promise.reject(new Error('y'))]) {
      const calls: string[] = [];
      const f = fakes({ cancelTurn: (id) => (calls.push(id), (bad as () => Promise<never>)()) });
      const { r } = live(f);
      r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
      r.dispatch({ type: 'stopAnswer', turnId: 't1' });
      f.advance(3000);
      f.timers.filter((x) => x.ms === 3000)[0]!.fn();
      await flush();
      await flush();
      expect(calls).toEqual(['t1', 't1']);
    }
  });
  it('timers tick with the generation they were set under; a tick of an earlier generation changes nothing', () => {
    const f = fakes();
    const { r } = live(f);
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
    r.dispatch({ type: 'stopAnswer', turnId: 't1' });
    const giveUp = f.timers.find((x) => x.ms === 15000)!;
    r.dispatch({ type: 'end' });
    const after = r.state();
    f.advance(15000);
    giveUp.fn();
    expect(r.state()).toBe(after);
  });
  it('persist stores the machine\'s unsettled identities (pendingOf), never audio or text', () => {
    const f = fakes();
    const { r } = live(f);
    r.dispatch({ type: 'pttDown' });
    f.advance(500);
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'vad.start', utt: 1 } });
    f.socks[0]!.on.closed(1006);
    const ids = f.persisted.at(-1) as Array<Record<string, unknown>>;
    expect(ids).toEqual([{ conn: 'k1', utt: 1, at: expect.any(Number) }]);
  });
  it('an event raised while effects run waits for them: one event at a time, in order', () => {
    const order: string[] = [];
    const f = fakes();
    let runnerRef: ReturnType<typeof createVoiceRunner> | null = null;
    f.ports.open = (o, on) => {
      order.push('open');
      // The socket answers before open() returns.
      on.frame(session('sync'));
      order.push('open returned');
      return { send: () => void order.push('send'), sendAudio: () => {}, close: () => void order.push('close') };
    };
    runnerRef = createVoiceRunner(initial('ptt'), f.ports, (s) => order.push(`state:${s.phase}`));
    runnerRef.dispatch({ type: 'press' });
    runnerRef.dispatch({ type: 'started', gen: runnerRef.state().gen, result: 'ready' });
    expect(order).toEqual(['state:starting', 'state:connecting', 'open', 'open returned', 'state:live']);
    expect(runnerRef.state().conn).toBe('sync');
  });
  it('a socket that ends while opening is closed, and its end reaches the machine once', () => {
    const f = fakes();
    let closes = 0;
    f.ports.open = (o, on) => {
      on.closed(1006);
      on.closed(1006);
      return { send: () => {}, sendAudio: () => {}, close: () => void (closes += 1) };
    };
    const r = createVoiceRunner(initial('ptt'), f.ports);
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    expect(closes).toBe(1);
    expect(r.state().phase).toBe('connectFailed');
  });
  it('a port that throws never stops the runner; open throwing reads as a close', () => {
    const f = fakes({ stopTracks: () => { throw new Error('a'); }, flushPlayback: () => { throw new Error('b'); }, persist: () => { throw new Error('c'); } });
    f.ports.open = () => { throw new Error('no socket'); };
    const r = createVoiceRunner(initial('ptt'), f.ports);
    r.dispatch({ type: 'press' });
    expect(() => r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' })).not.toThrow();
    expect(r.state().phase).toBe('connectFailed');
    expect(() => r.dispatch({ type: 'end' })).not.toThrow();
  });
  it('an event the machine cannot step is dropped alone: the runner goes on with the next one', () => {
    const f = fakes();
    const { r } = live(f);
    const before = r.state();
    expect(() => r.dispatch({ type: 'frame', gen: before.gen, frame: null as never })).not.toThrow();
    expect(r.state()).toBe(before);
    r.dispatch({ type: 'pttDown' });
    expect(f.socks[0]!.sent.map((x) => x.type)).toEqual(['ptt.down']);
  });
  it('a slot refusal of the socket it holds reaches the machine; one of a replaced socket does not', () => {
    const f = fakes();
    const r = createVoiceRunner(initial('ptt'), f.ports);
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    f.socks[0]!.on.slotRefused();
    expect(r.state().phase).toBe('budget');
  });
  it('dispose stops everything: the stale step runs, timers are cleared, the socket closed, late answers dropped', async () => {
    const f = fakes();
    const { r } = live(f);
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
    r.dispatch({ type: 'stopAnswer', turnId: 't1' });
    f.advance(3000);
    f.timers.filter((x) => x.ms === 3000)[0]!.fn();
    r.dispose();
    expect(f.socks[0]!.closed).toBe(1);
    expect(f.timers.every((x) => !x.live)).toBe(true);
    const after = r.state();
    expect(after.phase).not.toBe('live');
    f.answers[0]!('failed');
    await flush();
    f.socks[0]!.on.frame(session('late'));
    r.dispatch({ type: 'press' });
    expect(r.state()).toBe(after);
    expect(f.cancels).toEqual(['t1']);
    expect(f.socks).toHaveLength(1);
  });
  // A live session holding one unsettled utterance (utt 1 of k1) and a pending timer.
  function holding(f: ReturnType<typeof fakes>) {
    const { r } = live(f);
    r.dispatch({ type: 'pttDown' });
    f.advance(500);
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'vad.start', utt: 1 } });
    // A Stop answer arms the 3 s timer; it is left pending.
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
    r.dispatch({ type: 'stopAnswer', turnId: 't1' });
    expect(f.timers.some((x) => x.live)).toBe(true);
    return r;
  }
  function expectShutDown(f: ReturnType<typeof fakes>) {
    expect(f.ports.stopTracks).toHaveBeenCalled();
    expect(f.persisted.at(-1)).toEqual([{ conn: 'k1', utt: 1, at: expect.any(Number) }]);
    expect(f.timers.every((x) => !x.live)).toBe(true);
    expect(f.socks[0]!.closed).toBe(1);
  }
  it('a clock that throws at dispose: the tracks still stop, the identities persist, timers clear, nothing throws', () => {
    const f = fakes();
    const r = holding(f);
    vi.mocked(f.ports.stopTracks).mockClear();
    f.ports.now = () => { throw new Error('clock'); };
    expect(() => r.dispose()).not.toThrow();
    expectShutDown(f);
    expect(r.state().phase).toBe('off');
  });
  it('a clock that works for stale and throws after: persist still stores with that reading, timers clear', () => {
    const f = fakes();
    const r = holding(f);
    vi.mocked(f.ports.stopTracks).mockClear();
    let reads = 0;
    const t0 = f.now();
    f.ports.now = () => { if (reads++ === 0) return t0; throw new Error('clock'); };
    expect(() => r.dispose()).not.toThrow();
    expectShutDown(f);
  });
  it('a stale step that cannot run still stops the tracks, and dispose does not throw', () => {
    const f = fakes();
    // The machine throws on this state for every event, stale included.
    const broken = createVoiceRunner(null as never, f.ports);
    expect(() => broken.dispose()).not.toThrow();
    expect(f.ports.stopTracks).toHaveBeenCalledTimes(1);
  });
  // `end` from live gives `off` with [stopTracks, close, persist]; `stale` on `off` has no effects of its own, so the
  // end's shutdown must run even when dispose comes first.
  it('dispose from onState on an end from live: the end still stops the tracks and stores the maybe-sent utterance', () => {
    const f = fakes();
    let r: ReturnType<typeof createVoiceRunner> | null = null;
    let armed = false;
    r = createVoiceRunner(initial('ptt'), f.ports, (s) => { if (armed && s.phase === 'off') r!.dispose(); });
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    f.socks[0]!.on.frame(session());
    r.dispatch({ type: 'pttDown' });
    f.advance(500);
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'vad.start', utt: 1 } });
    vi.mocked(f.ports.stopTracks).mockClear();
    const sent = f.socks[0]!.sent.length;
    armed = true;
    r.dispatch({ type: 'end' });
    expect(f.ports.stopTracks).toHaveBeenCalledTimes(1);
    expect(f.persisted.at(-1)).toEqual([{ conn: 'k1', utt: 1, at: expect.any(Number) }]);
    expect(f.socks[0]!.closed).toBe(1);
    r.dispatch({ type: 'pttDown' });
    expect(f.socks[0]!.sent).toHaveLength(sent);
    expect(f.socks).toHaveLength(1);
  });
  it('dispose inside the end\'s stopTracks: the end still closes and stores the maybe-sent utterance', () => {
    const f = fakes();
    const r = holding(f);
    const before = f.persisted.length;
    f.ports.stopTracks = vi.fn(() => r.dispose());
    r.dispatch({ type: 'end' });
    expect(f.ports.stopTracks).toHaveBeenCalledTimes(1);
    expect(f.persisted.length).toBeGreaterThan(before);
    expectShutDown(f);
  });
  it('dispose from onState on a log row while off: the settlement is still stored', () => {
    const f = fakes();
    let r: ReturnType<typeof createVoiceRunner> | null = null;
    let armed = false;
    r = createVoiceRunner(initial('ptt'), f.ports, () => { if (armed) r!.dispose(); });
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    f.socks[0]!.on.frame(session());
    r.dispatch({ type: 'pttDown' });
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'vad.start', utt: 1 } });
    r.dispatch({ type: 'end' });
    expect(f.persisted.at(-1)).toEqual([{ conn: 'k1', utt: 1, at: expect.any(Number) }]);
    armed = true;
    r.dispatch({ type: 'logRow', seq: 7, conn: 'k1', utt: 1 });
    expect(f.persisted.at(-1)).toEqual([]);
  });
  it('dispose from inside an effect still runs the stale step and then stops', () => {
    const f = fakes();
    let r: ReturnType<typeof createVoiceRunner> | null = null;
    f.ports.flushPlayback = () => r!.dispose();
    r = live(f).r;
    r.dispatch({ type: 'pttDown' });
    // pttDown's effects are [flushPlayback, send ptt.down]: the dispose inside the first stops the second.
    expect(f.socks[0]!.sent.map((x) => x.type)).not.toContain('ptt.down');
    expect(f.socks[0]!.closed).toBe(1);
    expect(r.state().phase).not.toBe('live');
    r.dispatch({ type: 'press' });
    expect(f.socks).toHaveLength(1);
  });
});
