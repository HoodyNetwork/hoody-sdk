// The Talk session against fake ports: the real machine, runner, wire and SendQueue, nothing else.
import { SendQueue } from '@kit/voice/capture';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogRow, VoiceCheck } from '../data';
import type { PendingSaver } from './pending';
import { createTalkSession, HIDDEN_MAX_MS, type TalkEnv, type TalkOptions, type TalkSession, CONNECT_WAIT_MS, RESUME_WAIT_MS, CHECK_WAIT_MS } from './session';
import type { TalkLive } from './talkLive';

const READY: VoiceCheck = { ready: true, stt: null, tts: null };

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

interface FakeSock { query: Record<string, string>; target: unknown; realm: unknown; botId: string; handlers: Parameters<TalkLive['socket']>[1]; sent: (string | ArrayBuffer)[]; closed: number; texts(): Record<string, unknown>[] }

function world(over: Partial<TalkOptions> = {}, envOver: Partial<TalkEnv> = {}) {
  let t = 1000;
  const timers: { at: number; fn: () => void; off: boolean }[] = [];
  const socks: FakeSock[] = [];
  const stopped: unknown[] = [];
  const caps: { stream: unknown; onFrame: (p: Int16Array) => void; stopped: number }[] = [];
  const mics: unknown[] = [];
  let micAnswer: () => Promise<MediaStream | { refused: 'denied' | 'not_found' }> = async () => { const m = { id: mics.length } as unknown as MediaStream; mics.push(m); return m; };
  const eng = {
    ctx: {} as AudioContext,
    scheduler: { talkOpened: vi.fn(), talkClosed: vi.fn(), unplayedSeconds: vi.fn(() => 0) },
    blocked: vi.fn(() => false),
    resume: vi.fn(async () => true),
    onChange: vi.fn(() => () => undefined),
    setMarkSink: vi.fn(),
    start: vi.fn(() => true),
    audio: vi.fn((): 'ok' | 'damaged' | 'overflow' => 'ok'),
    end: vi.fn(() => 'ok'),
    clip: vi.fn(),
    flush: vi.fn(async (_o?: number) => [] as { out: number; played_to: number }[]),
  };
  const live: TalkLive = {
    captureRate: 16000,
    engine: async () => eng as never,
    openMic: (...a) => { calls.mic.push(a[0]); return micAnswer(); },
    capture: (_c, stream, onFrame) => {
      const h = { stream, onFrame, stopped: 0 };
      caps.push(h);
      return { rate: 48000, stop() { h.stopped++; } };
    },
    stopStream: (m) => { stopped.push(m); },
    echoOn: () => true,
    devices: async () => ({ inputs: [{ id: 'i', label: 'In' }], outputs: [{ id: 'o', label: 'Out' }] }),
    onDeviceChange: () => () => undefined,
    sinkSupported: () => false,
    setSink: vi.fn(async () => true),
    queue: (send) => new SendQueue(send),
    socket(o, handlers) {
      const s: FakeSock = { ...o, handlers, sent: [], closed: 0, texts() { return s.sent.filter((x): x is string => typeof x === 'string').map((x) => JSON.parse(x) as Record<string, unknown>); } };
      socks.push(s);
      return { gen: socks.length, send(d) { s.sent.push(d as string | ArrayBuffer); return true; }, close() { s.closed++; } };
    },
  };
  const calls = { mic: [] as unknown[], check: 0, cancel: [] as string[], turn: 0 };
  const visible = new Set<() => void>();
  const pagehide = new Set<() => void>();
  const wakes: { released: number }[] = [];
  const saved: unknown[][] = [];
  const saver: PendingSaver = { load: () => ({ s: 'ok', notes: [] }), save: (ids) => { saved.push([...ids]); return 'ok'; }, settle: () => 'ok' };
  const state = { hidden: false, phone: false };
  const env: TalkEnv = {
    now: () => t,
    timer(ms, fn) {
      const x = { at: t + ms, fn, off: false };
      timers.push(x);
      return () => { x.off = true; };
    },
    phone: () => state.phone,
    hidden: () => state.hidden,
    onVisibility(fn) { visible.add(fn); return () => visible.delete(fn); },
    onPageHide(fn) { pagehide.add(fn); return () => pagehide.delete(fn); },
    wakeLock: async () => { const w = { released: 0, release() { w.released++; } }; wakes.push(w); return w; },
    lock: { locks: null, channel: () => null, timer: () => () => undefined },
    ...envOver,
  };
  const api = {
    check: vi.fn(async () => { calls.check++; return READY; }),
    cancel: vi.fn(async (id: string) => { calls.cancel.push(id); return 'matched' as const; }),
    turn: vi.fn(async () => { calls.turn++; return { running: true, turnId: 'T1' } as { running: boolean; turnId?: string }; }),
  };
  const session: TalkSession = createTalkSession({ where: { computer: 'c1', realm: 'r1', bot: 'b1' }, botId: 'b1', target: { id: 'c1' } as never, realm: 'r1', load: async () => live, api, env, saver, ...over });
  return {
    session, live, eng, api, socks, stopped, caps, mics, calls, saved, state, wakes,
    setMic(f: typeof micAnswer) { micAnswer = f; },
    advance(ms: number) {
      t += ms;
      for (const x of [...timers]) if (!x.off && x.at <= t) { x.off = true; x.fn(); }
    },
    fireVisible() { for (const f of [...visible]) f(); },
    firePageHide() { for (const f of [...pagehide]) f(); },
    get phase() { return session.snapshot().voice.phase; },
    frame(f: Record<string, unknown>, i = socks.length - 1) { socks[i]!.handlers.onText!(JSON.stringify(f)); },
    outcome(o: Parameters<TalkLive['socket']>[1]['onOutcome'] extends (x: infer X) => void ? X : never, i = socks.length - 1) { socks[i]!.handlers.onOutcome(o); },
    last: () => socks[socks.length - 1]!,
    async goLive(vad = false) {
      session.press();
      await settle();
      this.frame({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad });
      await settle();
    },
  };
}
type W = ReturnType<typeof world>;
const pcm = () => new Int16Array(640);

describe('starting', () => {
  it('voice/check starts in the press itself; a ready press opens the socket on the captured Bot', async () => {
    const w = world();
    w.session.press();
    expect(w.api.check).toHaveBeenCalledTimes(1);
    expect(w.phase).toBe('starting');
    await settle();
    expect(w.phase).toBe('connecting');
    const s = w.last();
    expect(s.botId).toBe('b1');
    expect(s.realm).toBe('r1');
    expect(s.target).toEqual({ id: 'c1' });
    expect(s.query).toMatchObject({ mode: 'ptt', refuse: 'frame', require: 'stt,tts', in_rate: '16000', in_format: 'pcm16' });
    expect(s.query.takeover).toBeUndefined();
    expect(w.caps).toHaveLength(1);
  });
  it('play_lead is asked only when the agent lists it', async () => {
    const a = world();
    a.session.caps({ stopSpeech: false, textKey: false, playLead: true });
    await a.goLive();
    expect(a.last().query.play_lead).toBe('true');
    const b = world();
    await b.goLive();
    expect(b.last().query.play_lead).toBeUndefined();
  });
  it('a grant that settles after End stops only its own stream and starts nothing', async () => {
    const w = world();
    const late = deferred<MediaStream>();
    w.setMic(() => late.promise);
    w.session.press();
    await settle();
    w.session.end();
    expect(w.phase).toBe('off');
    const stream = { id: 'late' } as unknown as MediaStream;
    late.resolve(stream);
    await settle();
    expect(w.stopped).toEqual([stream]);
    expect(w.socks).toHaveLength(0);
    expect(w.caps).toHaveLength(0);
  });
  it('a grant already in while the check still waits stops at End, not when the check answers', async () => {
    const check = deferred<VoiceCheck>();
    const w = world({ api: { check: () => check.promise, cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    w.session.press();
    await settle();
    expect(w.mics).toHaveLength(1);
    expect(w.stopped).toEqual([]);
    w.session.end();
    expect(w.stopped).toEqual(w.mics);
    check.resolve(READY);
    await settle();
    expect(w.stopped).toEqual(w.mics);
    expect(w.socks).toHaveLength(0);
    expect(w.caps).toHaveLength(0);
  });
  it('a grant after End stops at once, while the check still waits', async () => {
    const check = deferred<VoiceCheck>();
    const w = world({ api: { check: () => check.promise, cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    const late = deferred<MediaStream>();
    w.setMic(() => late.promise);
    w.session.press();
    await settle();
    w.session.end();
    const stream = { id: 'late' } as unknown as MediaStream;
    late.resolve(stream);
    await settle();
    expect(w.stopped).toEqual([stream]);
  });
  it('a grant after dispose stops at once, and dispose stops one still waiting on the check', async () => {
    const check = deferred<VoiceCheck>();
    const api = { check: () => check.promise, cancel: async () => 'failed' as const, turn: async () => ({ running: false }) };
    const a = world({ api });
    const late = deferred<MediaStream>();
    a.setMic(() => late.promise);
    a.session.press();
    await settle();
    a.session.dispose();
    const stream = { id: 'late' } as unknown as MediaStream;
    late.resolve(stream);
    await settle();
    expect(a.stopped).toEqual([stream]);
    const b = world({ api });
    b.session.press();
    await settle();
    b.session.dispose();
    expect(b.stopped).toEqual(b.mics);
  });
  it('code that loads after dispose starts no microphone and no engine', async () => {
    const load = deferred<TalkLive>();
    const w = world({ load: () => load.promise });
    const engine = vi.spyOn(w.live, 'engine');
    w.session.press();
    w.session.dispose();
    load.resolve(w.live);
    await settle();
    expect(engine).not.toHaveBeenCalled();
    expect(w.calls.mic).toEqual([]);
    expect(w.eng.resume).not.toHaveBeenCalled();
    expect(w.eng.onChange).not.toHaveBeenCalled();
  });
  it('code that loads after End asks for no microphone and no engine', async () => {
    const load = deferred<TalkLive>();
    const w = world({ load: () => load.promise });
    const engine = vi.spyOn(w.live, 'engine');
    w.session.press();
    w.session.end();
    load.resolve(w.live);
    await settle();
    expect(w.calls.mic).toEqual([]);
    expect(engine).not.toHaveBeenCalled();
  });
  it('a late grant from an earlier press never stops the stream of the press that replaced it', async () => {
    const w = world();
    const late = deferred<MediaStream>();
    w.setMic(() => late.promise);
    w.session.press();
    await settle();
    w.session.end();
    const fresh = { id: 'fresh' } as unknown as MediaStream;
    w.setMic(async () => fresh);
    w.session.press();
    await settle();
    expect(w.phase).toBe('connecting');
    late.resolve({ id: 'late' } as unknown as MediaStream);
    await settle();
    expect(w.stopped).not.toContain(fresh);
    expect(w.caps[0]!.stopped).toBe(0);
    expect(w.phase).toBe('connecting');
  });
  it('a refused microphone says which, and stops nothing it never had', async () => {
    const denied = world();
    denied.setMic(async () => ({ refused: 'denied' }));
    denied.session.press();
    await settle();
    expect(denied.phase).toBe('denied');
    const none = world();
    none.setMic(async () => ({ refused: 'not_found' }));
    none.session.press();
    await settle();
    expect(none.phase).toBe('noDevice');
    expect(none.stopped).toEqual([]);
  });
  it('a check that says not ready stops the stream and keeps what it said', async () => {
    const check: VoiceCheck = { ready: false, stt: null, tts: null };
    const w = world({ api: { check: async () => check, cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    w.session.press();
    await settle();
    expect(w.phase).toBe('notReady');
    expect(w.session.snapshot().check).toBe(check);
    expect(w.stopped).toHaveLength(1);
    expect(w.socks).toHaveLength(0);
  });
  it('a check with no answer keeps the stream, and Try anyway connects without require', async () => {
    const w = world({ api: { check: async () => { throw new Error('x'); }, cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    w.session.press();
    await settle();
    expect(w.phase).toBe('checkUnknown');
    expect(w.stopped).toEqual([]);
    expect(w.socks).toHaveLength(0);
    w.session.tryAnyway();
    await settle();
    expect(w.phase).toBe('connecting');
    expect(w.last().query.require).toBeUndefined();
  });
  it('a new press stops the stream the last one kept, before its own grant answers', async () => {
    const w = world({ api: { check: async () => { throw new Error('x'); }, cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    w.session.press();
    await settle();
    expect(w.phase).toBe('checkUnknown');
    expect(w.stopped).toEqual([]);
    w.setMic(() => new Promise(() => undefined));
    w.session.press();
    expect(w.stopped).toHaveLength(1);
    expect(w.caps[0]!.stopped).toBe(1);
  });
  it('blocked sound keeps the stream; turning it on resumes in the gesture and starts again without leaking the old stream', async () => {
    const w = world();
    w.eng.blocked.mockReturnValue(true);
    w.session.press();
    await settle();
    expect(w.phase).toBe('playbackBlocked');
    expect(w.stopped).toEqual([]);
    w.eng.blocked.mockReturnValue(false);
    const resumes = w.eng.resume.mock.calls.length;
    w.session.enableSound();
    expect(w.eng.resume.mock.calls.length).toBe(resumes + 1);
    await settle();
    expect(w.phase).toBe('connecting');
    expect(w.stopped).toHaveLength(1);
    expect(w.caps[0]!.stopped).toBe(1);
  });
  it('hands-free is offered only on a desktop whose track reports echo cancellation', async () => {
    const a = world();
    await a.goLive();
    expect(a.session.snapshot().handsFree).toBe(true);
    const p = world();
    p.state.phone = true;
    await p.goLive();
    expect(p.session.snapshot().handsFree).toBe(false);
  });
  it('listens to the page only from the first press', async () => {
    const onVisibility = vi.fn(() => () => undefined);
    const w = world({}, { onVisibility });
    expect(onVisibility).not.toHaveBeenCalled();
    w.session.press();
    expect(onVisibility).toHaveBeenCalledTimes(1);
    await settle();
    w.session.end();
    w.session.press();
    expect(onVisibility).toHaveBeenCalledTimes(1);
  });
});

describe('sending', () => {
  let w: W;
  beforeEach(async () => { w = world(); await w.goLive(); });
  it('push to talk: nothing goes out until held; the press flushes playback first, then ptt.down, then audio with its seq', () => {
    w.caps[0]!.onFrame(pcm());
    expect(w.last().sent).toEqual([]);
    const flushes = w.eng.flush.mock.calls.length;
    w.session.pttDown();
    expect(w.eng.flush.mock.calls.length).toBe(flushes + 1);
    expect(w.last().texts().map((f) => f.type)).toEqual(['ptt.down']);
    w.caps[0]!.onFrame(pcm());
    const bin = w.last().sent[1] as ArrayBuffer;
    expect(new DataView(bin).getUint8(0)).toBe(0);
    expect(new DataView(bin).getUint32(1)).toBe(1);
  });
  it('ptt.up waits behind audio still queued, so last_seq never overtakes its audio', () => {
    w.session.pttDown();
    w.advance(300);
    w.caps[0]!.onFrame(pcm());
    w.caps[0]!.onFrame(pcm());
    w.caps[0]!.onFrame(pcm()); // past the budget: these wait
    w.session.pttUp();
    const order = () => w.last().sent.map((x) => (typeof x === 'string' ? (JSON.parse(x) as { type: string }).type : 'audio'));
    expect(order().filter((x) => x === 'ptt.up')).toEqual([]);
    w.advance(40);
    w.caps[0]!.onFrame(pcm());
    w.advance(40);
    w.caps[0]!.onFrame(pcm());
    w.advance(40);
    w.caps[0]!.onFrame(pcm());
    const got = order();
    expect(got).toContain('ptt.up');
    expect(got.lastIndexOf('audio')).toBeLessThan(got.indexOf('ptt.up'));
  });
  it('the next utterance never overtakes a ptt.up still waiting', () => {
    const order = () => w.last().sent.map((x) => (typeof x === 'string' ? (JSON.parse(x) as { type: string }).type : 'audio'));
    w.session.pttDown();
    w.advance(300);
    for (let i = 0; i < 3; i++) w.caps[0]!.onFrame(pcm());
    w.session.pttUp();
    expect(order()).not.toContain('ptt.up');
    w.session.pttDown();
    for (let i = 0; i < 2; i++) { w.caps[0]!.onFrame(pcm()); w.advance(40); }
    for (let i = 0; i < 6; i++) { w.caps[0]!.onFrame(pcm()); w.advance(40); }
    const got = order();
    const up = got.indexOf('ptt.up'), down = got.lastIndexOf('ptt.down');
    expect(up).toBeGreaterThan(-1);
    expect(down).toBeGreaterThan(up);
    expect(got.slice(up + 1, down)).toEqual([]);
    expect(got.indexOf('audio', up)).toBeGreaterThan(down);
  });
  it('a waiting ptt.up goes out with no capture to pump it', () => {
    const texts = () => w.last().texts().filter((f) => f.type === 'ptt.up');
    w.session.pttDown();
    w.advance(300);
    for (let i = 0; i < 3; i++) w.caps[0]!.onFrame(pcm());
    w.session.pttUp();
    expect(texts()).toEqual([]);
    for (let i = 0; i < 10; i++) w.advance(40);
    expect(texts()).toHaveLength(1);
  });
  it('a playback mark does not wait behind audio', () => {
    w.session.pttDown();
    w.advance(300);
    for (let i = 0; i < 3; i++) w.caps[0]!.onFrame(pcm());
    const sink = w.eng.setMarkSink.mock.calls[0]![0] as (m: { out: number; played_to: number }[]) => void;
    const before = w.last().sent.length;
    sink([{ out: 1, played_to: 10 }]);
    expect(w.last().sent.slice(before).map((x) => (typeof x === 'string' ? JSON.parse(x) as unknown : 'audio'))).toEqual([{ type: 'playback.mark', out: 1, played_to: 10 }]);
  });
  it('audio is dropped, never resent, after a loss', async () => {
    w.session.pttDown();
    w.advance(300);
    w.caps[0]!.onFrame(pcm());
    const first = w.last();
    const count = first.sent.length;
    w.outcome({ kind: 'unknown', code: 1006 });
    await settle();
    expect(w.phase).toBe('reconnecting');
    w.advance(1000);
    await settle();
    w.frame({ type: 'session', epoch: 2, conn: 'K2', in_rate: 16000, out_rate: 24000, vad: false });
    expect(w.socks).toHaveLength(2);
    expect(w.last().query.takeover).toBeUndefined();
    expect(first.sent).toHaveLength(count);
    expect(w.last().sent).toEqual([]);
  });
});

describe('reading', () => {
  let w: W;
  beforeEach(async () => { w = world(); await w.goLive(); });
  it('the new session flushes the old audio first: its outputs wait for the flush, at its out_rate', async () => {
    const x = world();
    const f = deferred<{ out: number; played_to: number }[]>();
    x.eng.flush.mockImplementationOnce(() => f.promise);
    x.session.press();
    await settle();
    x.frame({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad: false });
    expect(x.eng.scheduler.talkOpened).toHaveBeenCalledTimes(1);
    x.frame({ type: 'output.start', out: 1, reply_id: 'T', seg: 0, kind: 'reply' });
    expect(x.eng.start).not.toHaveBeenCalled();
    f.resolve([]);
    await settle();
    expect(x.eng.start).toHaveBeenCalledWith(1, 24000);
  });
  it('a frame the wire calls invalid ends the connection as a protocol failure', () => {
    w.frame({ type: 'session' });
    expect(w.phase).toBe('ended');
    expect(w.session.snapshot().voice.ended).toBe('protocol');
    expect(w.last().closed).toBe(1);
  });
  it('a frame from a newer agent is ignored', () => {
    w.frame({ type: 'brand.new', x: 1 });
    expect(w.phase).toBe('live');
    expect(w.last().closed).toBe(0);
  });
  it('a binary frame it cannot read ends the connection; audio is handed to the engine by out and offset', () => {
    const buf = new ArrayBuffer(13);
    const v = new DataView(buf);
    v.setUint8(0, 1); v.setUint32(1, 7); v.setUint32(5, 96);
    w.last().handlers.onBinary!(buf);
    expect(w.eng.audio).toHaveBeenCalledWith(7, 96, expect.any(Int16Array));
    w.last().handlers.onBinary!(new ArrayBuffer(3));
    expect(w.session.snapshot().voice.ended).toBe('protocol');
  });
  it('output.stop flushes up to its output and sends the marks it owes', async () => {
    w.eng.flush.mockImplementationOnce(async () => [{ out: 3, played_to: 40 }]);
    w.frame({ type: 'output.stop', upto_out: 3, reason: 'barge_in' });
    expect(w.eng.flush).toHaveBeenLastCalledWith(3);
    await settle();
    expect(w.last().texts()).toContainEqual({ type: 'playback.mark', out: 3, played_to: 40 });
  });
  it('an output that starts during a press\'s flush waits for it, or that flush would drop it', async () => {
    const flush = deferred<{ out: number; played_to: number }[]>();
    w.eng.flush.mockReturnValueOnce(flush.promise);
    w.session.pttDown();
    w.frame({ type: 'output.start', out: 3, reply_id: 'A', seg: 0, kind: 'reply' });
    expect(w.eng.start).not.toHaveBeenCalled();
    flush.resolve([{ out: 1, played_to: 5 }]);
    await settle();
    expect(w.eng.start).toHaveBeenCalledTimes(1);
    expect(w.last().texts()).toContainEqual({ type: 'playback.mark', out: 1, played_to: 5 });
  });
  it('a second flush drops what waited for the first: a stop stays stopped', async () => {
    w.session.caps({ stopSpeech: true, textKey: false, playLead: true });
    const one = deferred<{ out: number; played_to: number }[]>(), two = deferred<{ out: number; played_to: number }[]>();
    w.eng.flush.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
    const before = w.eng.flush.mock.calls.length;
    w.session.pttDown();
    w.frame({ type: 'reply.provisional', turn_id: 'A', seq: 1, text: 'x' });
    w.frame({ type: 'output.start', out: 3, reply_id: 'A', seg: 0, kind: 'reply' });
    w.session.stopSpeaking();
    expect(w.eng.flush.mock.calls.length).toBe(before + 2);
    one.resolve([]);
    two.resolve([]);
    await settle();
    expect(w.eng.start).not.toHaveBeenCalled();
    w.frame({ type: 'output.start', out: 4, reply_id: 'B', seg: 0, kind: 'reply' });
    expect(w.eng.start).toHaveBeenCalledTimes(1);
  });
  it('own_gate.pending reads the Bot view again', async () => {
    const onOwnGate = vi.fn();
    const x = world({ onOwnGate });
    await x.goLive();
    x.frame({ type: 'own_gate.pending', gate_id: 'g', generation: 1, kind: 'confirm', summary: 's' });
    expect(onOwnGate).toHaveBeenCalledTimes(1);
  });
  it('captions come from the frames', () => {
    w.frame({ type: 'transcript.partial', utt: 1, text: 'hi' });
    expect(w.session.snapshot().view.you).toEqual({ text: 'hi', final: false });
  });
  it('a gap in the audio shows as damaged until the next reply', () => {
    w.eng.audio.mockReturnValueOnce('damaged');
    const buf = new ArrayBuffer(11);
    new DataView(buf).setUint8(0, 1);
    w.frame({ type: 'output.start', out: 1, reply_id: 'A', seg: 0, kind: 'reply' });
    w.last().handlers.onBinary!(buf);
    expect(w.session.snapshot().damaged).toBe(true);
    w.frame({ type: 'output.start', out: 2, reply_id: 'A', seg: 1, kind: 'reply' });
    expect(w.session.snapshot().damaged).toBe(true);
    w.frame({ type: 'output.start', out: 3, reply_id: 'B', seg: 0, kind: 'reply' });
    expect(w.session.snapshot().damaged).toBe(false);
  });
});

describe('what a socket outcome means', () => {
  it('no slot before the session: the budget band, tracks stopped', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.outcome({ kind: 'budget' });
    expect(w.phase).toBe('budget');
    expect(w.stopped).toHaveLength(1);
  });
  it('a slot cut after the session opened is a lost connection, not a refusal', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.outcome({ kind: 'open', protocol: 'p' });
    w.frame({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad: false });
    w.outcome({ kind: 'budget' });
    expect(w.phase).toBe('reconnecting');
  });
  it('a voice_busy refusal is Take over, which connects with takeover=true', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.outcome({ kind: 'refused', code: 'voice_busy', status: 409, details: null, retryAfterMs: null });
    expect(w.phase).toBe('busyElsewhere');
    w.session.takeOver();
    await settle();
    expect(w.last().query.takeover).toBe('true');
  });
  it('Take over opens a new microphone, then connects, and speech reaches the new socket', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.frame({ type: 'refused', code: 'voice_busy', message: 'm' });
    w.outcome({ kind: 'closed', code: 4409 } as never);
    expect(w.phase).toBe('busyElsewhere');
    expect(w.stopped).toHaveLength(1);
    w.session.takeOver();
    await settle();
    expect(w.mics).toHaveLength(2);
    expect(w.caps).toHaveLength(2);
    expect(w.last().query.takeover).toBe('true');
    w.frame({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad: false });
    await settle();
    w.session.pttDown();
    w.advance(300);
    w.caps[1]!.onFrame(pcm());
    expect(w.last().sent.some((x) => typeof x !== 'string')).toBe(true);
  });
  it('a microphone refused at Take over says so and connects nothing; one granted after End stops', async () => {
    const busy = async (w: W) => {
      w.session.press();
      await settle();
      w.frame({ type: 'refused', code: 'voice_busy', message: 'm' });
      w.outcome({ kind: 'closed', code: 4409 } as never);
    };
    const a = world();
    await busy(a);
    const n = a.socks.length;
    a.setMic(async () => ({ refused: 'denied' }));
    a.session.takeOver();
    await settle();
    expect(a.phase).toBe('denied');
    expect(a.socks).toHaveLength(n);
    const b = world();
    await busy(b);
    const late = deferred<MediaStream>();
    b.setMic(() => late.promise);
    b.session.takeOver();
    await settle();
    b.session.end();
    const stream = { id: 'late' } as unknown as MediaStream;
    late.resolve(stream);
    await settle();
    expect(b.stopped).toContain(stream);
    expect(b.caps).toHaveLength(1);
  });
  it('another refusal keeps its code; not sent is could not connect', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.outcome({ kind: 'refused', code: 'nope', status: 400, details: null, retryAfterMs: 2000 });
    expect(w.phase).toBe('connectFailed');
    expect(w.session.snapshot().voice.refusal).toMatchObject({ code: 'nope', retryAfterSecs: 2 });
    const x = world();
    x.session.press();
    await settle();
    x.outcome({ kind: 'not_sent', code: 'X' });
    expect(x.phase).toBe('connectFailed');
  });
  it('a held tab lock reads as busy before any socket', async () => {
    const w = world({}, { lock: { locks: { request: ((_n: string, _o: unknown, cb: (l: unknown) => unknown) => cb(null)) as never } as never, channel: () => null, timer: () => () => undefined } });
    w.session.press();
    await settle();
    expect(w.socks).toHaveLength(0);
    expect(w.phase).toBe('busyElsewhere');
  });
  it('the lock is released when the socket ends, and another tab asking ends this Talk', async () => {
    let done: unknown = null;
    let asked: ((m: unknown) => void) | null = null;
    const w = world({}, {
      lock: {
        locks: { request: ((_n: string, _o: unknown, cb: (l: unknown) => unknown) => { done = cb({}); return done; }) as never } as never,
        channel: () => ({ post() { /* */ }, onMessage(f: (m: unknown) => void) { asked = f; return () => { asked = null; }; }, close() { /* */ } }),
        timer: () => () => undefined,
      },
    });
    const lockIs = () => Promise.race([
      Promise.resolve(done).then(() => 'released'),
      new Promise((r) => { setTimeout(() => r('held'), 50); }),
    ]);
    await w.goLive();
    expect(await lockIs()).toBe('held');
    asked!('end');
    expect(w.phase).toBe('ended');
    expect(w.session.snapshot().voice.ended).toBe('takenOver');
    expect(await lockIs()).toBe('released');
  });
  /** A lock as a browser has it: exclusive, and free only a task after the holder's promise settles. */
  const realLock = () => {
    let held = false;
    return {
      locks: { request: ((_n: string, o: { ifAvailable?: boolean }, cb: (l: unknown) => Promise<unknown>) => {
        if (held && o.ifAvailable) return Promise.resolve(cb(null));
        held = true;
        return Promise.resolve(cb({})).then((v) => new Promise((res) => { setTimeout(() => { held = false; res(v); }, 0); }));
      }) as never } as never,
      channel: () => null,
      timer: (ms: number, fn: () => void) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
    };
  };
  it('a mode change opens the new connection once its own lock is free, never reading as another tab', async () => {
    const w = world({}, { lock: realLock() });
    await w.goLive();
    w.session.mode('vad');
    await new Promise((r) => { setTimeout(r, 20); });
    await settle();
    expect(w.phase).toBe('connecting');
    expect(w.socks).toHaveLength(2);
    expect(w.last().query.takeover).toBeUndefined();
  });
  it('a press right after End waits for the lock too', async () => {
    const w = world({}, { lock: realLock() });
    await w.goLive();
    w.session.end();
    w.session.press();
    // The lock lands on a real timer: wait for it, bounded, instead of a fixed 20 ms that a loaded host can miss.
    await vi.waitFor(() => expect(w.socks).toHaveLength(2), { timeout: 5000, interval: 10 });
    await settle();
    expect(w.phase).toBe('connecting');
  });
  it('a dead context disposes the session', async () => {
    const w = world();
    await w.goLive();
    w.outcome({ kind: 'stale' });
    expect(w.phase).toBe('off');
    w.session.press();
    expect(w.phase).toBe('off');
  });
});

describe('Stop answer', () => {
  it('sends the captured turn only; a newer turn in the view is never cancelled', async () => {
    const w = world();
    await w.goLive();
    w.session.stopAnswer('T1');
    expect(w.last().texts()).toContainEqual({ type: 'output.cancel', reply_id: 'T1' });
    w.frame({ type: 'cancel.result', state: 'turn_continues', message_ids: [], reply_id: 'T1' });
    await settle();
    expect(w.calls.cancel).toEqual(['T1']);
    w.api.turn.mockResolvedValueOnce({ running: true, turnId: 'T2' });
    w.advance(2000);
    await settle();
    expect(w.calls.cancel).toEqual(['T1']);
    expect(w.session.snapshot().voice.stop?.outcome).toBe('stopped');
  });
  it('the view is read every 2 s while it stops, and no more after it resolved', async () => {
    const w = world();
    await w.goLive();
    w.session.stopAnswer('T1');
    w.advance(2000);
    await settle();
    expect(w.calls.turn).toBe(1);
    w.advance(2000);
    await settle();
    expect(w.calls.turn).toBe(2);
    w.frame({ type: 'reply.final', turn_id: 'T1', text: '', spoken: 'partial', reason: 'cancelled' });
    expect(w.session.snapshot().voice.stop?.outcome).toBe('stopped');
    w.advance(2000);
    await settle();
    expect(w.calls.turn).toBe(2);
  });
  it('a failed view read keeps waiting; 15 s without evidence says may not have stopped', async () => {
    const w = world();
    await w.goLive();
    w.api.turn.mockRejectedValue(new Error('x'));
    w.session.stopAnswer('T1');
    for (let i = 0; i < 8; i++) { w.advance(2000); await settle(); }
    expect(w.session.snapshot().voice.stop?.outcome).toBe('mayNotHaveStopped');
  });
});

describe('overflow', () => {
  const overflow = (w: W, reply: string) => {
    w.frame({ type: 'reply.provisional', turn_id: reply, seq: 1, text: 'x' });
    w.eng.audio.mockReturnValue('overflow');
    const buf = new ArrayBuffer(11);
    new DataView(buf).setUint8(0, 1);
    w.last().handlers.onBinary!(buf);
    w.last().handlers.onBinary!(buf);
  };
  const cancels = (w: W) => w.last().texts().filter((f) => f.type === 'output.cancel');
  it('with Stop speaking it stops speech only, once per reply, and says playback fell behind', async () => {
    const w = world();
    w.session.caps({ stopSpeech: true, textKey: false, playLead: true });
    await w.goLive();
    overflow(w, 'A');
    expect(cancels(w)).toEqual([{ type: 'output.cancel', reply_id: 'A', keep_turn: true }]);
    expect(w.session.snapshot().overflow).toBe('lead');
    await settle(); // the stop's flush answers
    const woke = vi.fn();
    w.session.subscribe(woke);
    const again = new ArrayBuffer(11);
    new DataView(again).setUint8(0, 1);
    w.last().handlers.onBinary!(again);
    expect(woke).not.toHaveBeenCalled();
    overflow(w, 'B');
    expect(cancels(w)).toHaveLength(2);
  });
  it('without it, an older agent, it stops the answer and says to update', async () => {
    const w = world();
    await w.goLive();
    overflow(w, 'A');
    expect(cancels(w)).toEqual([{ type: 'output.cancel', reply_id: 'A' }]);
    expect(w.session.snapshot().overflow).toBe('old');
    expect(w.session.snapshot().voice.stop?.turnId).toBe('A');
  });
});

describe('hidden', () => {
  it('hiding with a release still waiting sends it before the session ends', async () => {
    const w = world();
    await w.goLive();
    w.session.pttDown();
    w.advance(300);
    for (let i = 0; i < 3; i++) w.caps[0]!.onFrame(pcm());
    const s = w.last();
    const ups = () => s.texts().filter((f) => f.type === 'ptt.up');
    w.state.hidden = true;
    w.fireVisible();
    expect(w.phase).toBe('muted');
    expect(ups()).toEqual([]);
    w.advance(1000); // the first check, with it still waiting: one 1 s step, as a throttled tab gets
    expect(ups()).toHaveLength(1);
    w.advance(1000);
    expect(w.phase).toBe('off');
    expect(ups()).toHaveLength(1);
  });
  it('a phone ends at once', async () => {
    const w = world();
    w.state.phone = true;
    await w.goLive();
    w.state.hidden = true;
    w.fireVisible();
    expect(w.phase).toBe('off');
    expect(w.stopped).toHaveLength(1);
  });
  it('a desktop mutes, stops the track once muted, and ends when no reply plays', async () => {
    const w = world();
    await w.goLive();
    w.state.hidden = true;
    w.fireVisible();
    expect(w.phase).toBe('muted');
    expect(w.stopped).toHaveLength(1);
    w.advance(1000);
    expect(w.phase).toBe('off');
  });
  it('a reply still playing keeps the socket, at most 60 s', async () => {
    const w = world();
    await w.goLive();
    w.eng.scheduler.unplayedSeconds.mockReturnValue(5);
    w.state.hidden = true;
    w.fireVisible();
    for (let t = 0; t < HIDDEN_MAX_MS - 2000; t += 1000) w.advance(1000);
    expect(w.phase).toBe('muted');
    w.advance(1000);
    w.advance(1000);
    w.advance(1000);
    expect(w.phase).toBe('off');
  });
  it('back in view it stays muted; Unmute opens a new track first, on the chosen input', async () => {
    const w = world();
    await w.goLive();
    w.session.chooseInput('mic2');
    await settle();
    w.eng.scheduler.unplayedSeconds.mockReturnValue(5);
    w.state.hidden = true;
    w.fireVisible();
    w.state.hidden = false;
    w.fireVisible();
    w.advance(5000);
    expect(w.phase).toBe('muted');
    const before = w.calls.mic.length;
    w.session.unmute();
    expect(w.phase).toBe('muted');
    await settle();
    expect(w.calls.mic[before]).toEqual({ deviceId: 'mic2' });
    expect(w.phase).toBe('live');
    expect(w.caps[w.caps.length - 1]!.stopped).toBe(0);
  });
  it('a mode change after a hide opens a new track first; refused, it stays muted and unchanged', async () => {
    const hideAndBack = async (w: W) => {
      await w.goLive();
      w.frame({ type: 'reply.provisional', turn_id: 'A', seq: 1, text: 'x' });
      w.state.hidden = true;
      w.fireVisible();
      w.state.hidden = false;
      w.fireVisible();
      expect(w.phase).toBe('muted');
      expect(w.stopped).toHaveLength(1);
    };
    const a = world();
    await hideAndBack(a);
    a.session.mode('vad');
    await settle();
    expect(a.mics).toHaveLength(2);
    expect(a.caps).toHaveLength(2);
    expect(a.session.snapshot().voice.pendingSwitch?.mode ?? a.session.snapshot().voice.mode).toBe('vad');
    const b = world();
    await hideAndBack(b);
    b.setMic(async () => ({ refused: 'denied' }));
    b.session.mode('vad');
    await settle();
    expect(b.phase).toBe('muted');
    expect(b.session.snapshot().voice.mode).toBe('ptt');
    expect(b.session.snapshot().voice.pendingSwitch).toBeUndefined();
  });
  it('a track refused at Unmute stays muted', async () => {
    const w = world();
    await w.goLive();
    w.eng.scheduler.unplayedSeconds.mockReturnValue(5);
    w.state.hidden = true;
    w.fireVisible();
    w.state.hidden = false;
    w.fireVisible();
    w.setMic(async () => ({ refused: 'denied' }));
    w.session.unmute();
    await settle();
    expect(w.phase).toBe('muted');
  });
  it('hidden while connecting mutes as soon as it comes live', async () => {
    const w = world();
    w.session.press();
    await settle();
    w.state.hidden = true;
    w.fireVisible();
    w.frame({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad: false });
    expect(w.phase).toBe('muted');
  });
  it('hiding on a desktop stores what an End would store, and the session goes on', async () => {
    const w = world();
    await w.goLive();
    w.frame({ type: 'vad.start', utt: 4 });
    w.state.hidden = true;
    w.fireVisible();
    expect(w.phase).toBe('muted');
    expect(w.saved[w.saved.length - 1]).toEqual([{ conn: 'K', utt: 4, at: 1000 }]);
  });
  it('a save while hidden keeps what the hide stored, in flight or not', async () => {
    const saved: { utt: number }[][] = [];
    const saver: PendingSaver = { load: () => ({ s: 'ok', notes: [{ kind: 'maybeSent', conn: 'K', utt: 2, at: 5 }] }), save: (ids) => { saved.push([...ids]); return 'ok'; }, settle: () => 'ok' };
    const w = world({ saver });
    await w.goLive();
    w.frame({ type: 'vad.start', utt: 4 });
    w.state.hidden = true;
    w.fireVisible();
    expect(saved[saved.length - 1]!.map((x) => x.utt).sort()).toEqual([2, 4]);
    w.session.rows([{ seq: 7, kind: 'user', at: '', text: '', voice: { conn: 'K', utt: 2, origin: 'ptt', durationMs: 1 } } as never]);
    expect(saved[saved.length - 1]!.map((x) => x.utt)).toEqual([4]);
  });
  it('taken over while hidden, the save is the machine\'s own list: each identity once', async () => {
    const saved: { utt: number }[][] = [];
    const saver: PendingSaver = { load: () => ({ s: 'ok', notes: [] }), save: (ids) => { saved.push([...ids]); return 'ok'; }, settle: () => 'ok' };
    const w = world({ saver });
    await w.goLive();
    w.frame({ type: 'vad.start', utt: 4 });
    w.frame({ type: 'reply.provisional', turn_id: 'A', seq: 1, text: 'x' });
    w.state.hidden = true;
    w.fireVisible();
    w.frame({ type: 'takeover', by: 'other' });
    expect(w.session.snapshot().voice.ended).toBe('takenOver');
    expect(saved[saved.length - 1]!.map((x) => x.utt)).toEqual([4]);
  });
  it('a session after a hidden one ended changes mode with the track it has', async () => {
    const w = world();
    await w.goLive();
    w.state.hidden = true;
    w.fireVisible();
    w.advance(1000);
    expect(w.phase).toBe('off');
    w.state.hidden = false;
    w.fireVisible();
    await w.goLive();
    expect(w.mics).toHaveLength(2);
    w.session.mode('vad');
    await settle();
    expect(w.mics).toHaveLength(2);
    expect(w.session.snapshot().voice.pendingSwitch?.mode ?? w.session.snapshot().voice.mode).toBe('vad');
  });
  it('leaving the page stores what is unsettled', async () => {
    const w = world();
    await w.goLive();
    w.frame({ type: 'vad.start', utt: 4 });
    w.firePageHide();
    expect(w.phase).toBe('off');
    expect(w.saved[w.saved.length - 1]).toEqual([{ conn: 'K', utt: 4, at: 1000 }]);
  });
});

describe('notes', () => {
  const row = (conn: string, utt: number, seq: number) => ({ seq, kind: 'user', voice: { origin: 'ws', durationMs: 1, lang: null, conn, utt } }) as unknown as LogRow;
  it('a stored note comes back marked restored and settles only on a row naming its exact (conn, utt)', () => {
    const saved: unknown[][] = [];
    const saver: PendingSaver = { load: () => ({ s: 'ok', notes: [{ kind: 'maybeSent', conn: 'K', utt: 2, at: 5 }] }), save: (ids) => { saved.push([...ids]); return 'ok'; }, settle: () => 'ok' };
    const w = world({ saver });
    expect(w.session.snapshot().restored.has('K#2')).toBe(true);
    w.session.rows([row('K', 3, 9), row('L', 2, 8)]);
    expect(w.session.snapshot().voice.notes[0]).not.toHaveProperty('settled');
    expect(saved).toEqual([]);
    w.session.rows([row('K', 2, 7)]);
    expect(w.session.snapshot().voice.notes[0]).toMatchObject({ settled: { seq: 7 } });
    expect(saved).toEqual([[]]);
  });
  it('an unreadable store shows no notes', () => {
    const saver: PendingSaver = { load: () => ({ s: 'unreadable' }), save: () => 'ok', settle: () => 'ok' };
    expect(world({ saver }).session.snapshot().voice.notes).toEqual([]);
  });
});

describe('ending', () => {
  it('End stops the track, closes the socket, flushes the sound and frees the mark sink', async () => {
    const w = world();
    await w.goLive();
    const flushes = w.eng.flush.mock.calls.length;
    w.session.end();
    expect(w.phase).toBe('off');
    expect(w.stopped).toHaveLength(1);
    expect(w.last().closed).toBe(1);
    expect(w.eng.flush.mock.calls.length).toBe(flushes + 1);
    expect(w.eng.setMarkSink).toHaveBeenLastCalledWith(null);
    expect(w.eng.scheduler.talkClosed).toHaveBeenCalled();
  });
  it('dispose with an output open: playback flushed once, no frame sent, the notes stored on this Bot only', async () => {
    const a = world();
    await a.goLive();
    a.frame({ type: 'vad.start', utt: 1 });
    await settle();
    a.frame({ type: 'output.start', out: 1, reply_id: 'A', seg: 0, kind: 'reply' });
    const sent = a.last().sent.length;
    const flushes = a.eng.flush.mock.calls.length;
    a.session.dispose();
    expect(a.eng.flush.mock.calls.length).toBe(flushes + 1);
    expect(a.eng.start).toHaveBeenCalledTimes(1);
    expect(a.last().sent).toHaveLength(sent);
    expect(a.saved[a.saved.length - 1]).toEqual([{ conn: 'K', utt: 1, at: 1000 }]);
    expect(a.stopped).toHaveLength(1);
    a.session.dispose();
    expect(a.eng.flush.mock.calls.length).toBe(flushes + 1);
  });
  it('after dispose nothing reaches a port: a late frame, a press', async () => {
    const w = world();
    await w.goLive();
    const s = w.last();
    w.session.dispose();
    const flushes = w.eng.flush.mock.calls.length;
    s.handlers.onText!(JSON.stringify({ type: 'output.stop', upto_out: 1, reason: 'x' }));
    w.session.press();
    w.session.pttDown();
    await settle();
    expect(w.eng.flush.mock.calls.length).toBe(flushes);
    expect(w.socks).toHaveLength(1);
  });
  it('a connection that ends for good stops the sound; one that retries keeps it', async () => {
    const w = world();
    await w.goLive();
    const flushes = w.eng.flush.mock.calls.length;
    w.outcome({ kind: 'closed', code: 1000 } as never);
    expect(w.phase).toBe('ended');
    expect(w.eng.flush.mock.calls.length).toBe(flushes + 1);
    const r = world();
    await r.goLive();
    const f2 = r.eng.flush.mock.calls.length;
    r.outcome({ kind: 'closed', code: 1006 } as never);
    expect(r.phase).toBe('reconnecting');
    expect(r.eng.flush.mock.calls.length).toBe(f2);
  });
  it('a reconnect refused for good stops the sound too', async () => {
    const w = world();
    await w.goLive();
    w.outcome({ kind: 'closed', code: 1006 } as never);
    expect(w.phase).toBe('reconnecting');
    w.advance(60_000);
    await settle();
    expect(w.phase).toBe('connecting');
    const flushes = w.eng.flush.mock.calls.length;
    w.frame({ type: 'refused', code: 'voice_busy', message: 'm' });
    w.outcome({ kind: 'closed', code: 4409 } as never);
    expect(w.phase).toBe('busyElsewhere');
    expect(w.eng.flush.mock.calls.length).toBe(flushes + 1);
  });
  it('a wake lock from before a restart is let go, and the new one is the one End releases', async () => {
    const grants = [deferred<{ release(): void } | null>(), deferred<{ release(): void } | null>()];
    let asked = 0;
    const w = world({}, { wakeLock: () => grants[asked++]!.promise });
    await w.goLive();
    w.session.end();
    w.session.press();
    await settle();
    w.frame({ type: 'session', epoch: 2, conn: 'L', in_rate: 16000, out_rate: 24000, vad: false });
    await settle();
    expect(asked).toBe(2);
    const old = { release: vi.fn() }, now = { release: vi.fn() };
    grants[0]!.resolve(old);
    grants[1]!.resolve(now);
    await settle();
    expect(old.release).toHaveBeenCalledTimes(1);
    expect(now.release).not.toHaveBeenCalled();
    w.session.end();
    expect(now.release).toHaveBeenCalledTimes(1);
  });
  it('a wake lock is held only while live, and one granted after the end is let go', async () => {
    const w = world();
    await w.goLive();
    await settle();
    expect(w.wakes).toHaveLength(1);
    expect(w.wakes[0]!.released).toBe(0);
    w.session.end();
    expect(w.wakes[0]!.released).toBe(1);
    const late = deferred<{ release(): void } | null>();
    const x = world({}, { wakeLock: () => late.promise });
    await x.goLive();
    x.session.end();
    const got = { release: vi.fn() };
    late.resolve(got);
    await settle();
    expect(got.release).toHaveBeenCalledTimes(1);
  });
});

const lostAndBack = async (w: W, vad: boolean) => {
  w.outcome({ kind: 'unknown', code: 1006 });
  await settle();
  expect(w.phase).toBe('reconnecting');
  w.advance(1000);
  await settle();
  w.frame({ type: 'session', epoch: 2, conn: 'K2', in_rate: 16000, out_rate: 24000, vad });
  await settle();
};

describe('a new connection keeps what the person chose', () => {
  it('Mute survives a reconnect: hands-free sends nothing from the microphone', async () => {
    const w = world();
    await w.goLive(true);
    w.session.mute();
    w.advance(3000);
    await settle();
    expect(w.phase).toBe('muted');
    await lostAndBack(w, true);
    expect(['muting', 'muted']).toContain(w.phase);
    const loud = new Int16Array(640).fill(1000);
    w.caps[w.caps.length - 1]!.onFrame(loud);
    w.advance(40);
    const sent = w.last().sent.filter((x) => typeof x !== 'string') as ArrayBuffer[];
    expect(sent.length).toBeGreaterThan(0);
    for (const b of sent) expect(new Uint8Array(b).slice(-1280).every((v) => v === 0)).toBe(true);
    w.advance(3000);
    await settle();
    expect(w.phase).toBe('muted');
  });
  it('Unmute, then a reconnect, stays live', async () => {
    const w = world();
    await w.goLive(true);
    w.session.mute();
    w.advance(3000);
    await settle();
    w.session.unmute();
    await settle();
    expect(w.phase).toBe('live');
    await lostAndBack(w, true);
    expect(w.phase).toBe('live');
  });
  it('End, then a new Talk, is not muted by the old Mute', async () => {
    const w = world();
    await w.goLive();
    w.session.mute();
    await settle();
    w.session.end();
    await settle();
    await w.goLive();
    expect(w.phase).toBe('live');
  });
  it('a new press starts unmuted: an earlier Mute never carries into another Talk', async () => {
    const w = world();
    await w.goLive();
    w.session.mute();
    await settle();
    w.frame({ type: 'takeover', by: 'x' });
    await settle();
    expect(w.phase).toBe('ended');
    w.session.press();
    await settle();
    w.frame({ type: 'session', epoch: 2, conn: 'K2', in_rate: 16000, out_rate: 24000, vad: false });
    await settle();
    expect(w.phase).toBe('live');
  });
  it('a short hide mutes hands-free, and that Mute stands across a reconnect', async () => {
    const w = world();
    await w.goLive(true);
    w.state.hidden = true;
    w.fireVisible();
    await settle();
    w.state.hidden = false;
    w.fireVisible();
    w.advance(3000);
    await settle();
    expect(w.phase).toBe('muted');
    expect(w.stopped).toHaveLength(0);
    await lostAndBack(w, true);
    expect(['muting', 'muted']).toContain(w.phase);
    w.advance(3000);
    await settle();
    expect(w.phase).toBe('muted');
  });
  it('a hide stopped the track and the connection blipped: back as Muted, and Unmute opens a new microphone', async () => {
    const w = world();
    await w.goLive();
    w.state.hidden = true;
    w.fireVisible();
    await settle();
    expect(w.stopped.length).toBeGreaterThan(0);
    w.state.hidden = false;
    w.fireVisible();
    await settle();
    expect(w.phase).toBe('muted');
    await lostAndBack(w, false);
    expect(w.phase).toBe('muted');
    const mics = w.calls.mic.length;
    w.session.unmute();
    await settle();
    expect(w.calls.mic.length).toBe(mics + 1);
    expect(w.phase).toBe('live');
  });
});

describe('nothing waits forever with the microphone open', () => {
  it('a socket that never says session is lost after the deadline', async () => {
    const w = world();
    w.session.press();
    await settle();
    expect(w.phase).toBe('connecting');
    w.advance(CONNECT_WAIT_MS - 1);
    await settle();
    expect(w.phase).toBe('connecting');
    w.advance(1);
    await settle();
    expect(w.phase).toBe('connectFailed');
    expect(w.last().closed).toBe(1);
    expect(w.stopped.length).toBeGreaterThan(0);
  });
  it('the deadline ends once the session frame came', async () => {
    const w = world();
    await w.goLive();
    w.advance(CONNECT_WAIT_MS + 1);
    await settle();
    expect(w.phase).toBe('live');
  });
  it('a readiness check that never answers ends Starting at its deadline, as a check that failed', async () => {
    const w = world({ api: { check: () => new Promise<VoiceCheck>(() => undefined), cancel: async () => 'failed', turn: async () => ({ running: false }) } });
    w.session.press();
    await settle();
    expect(w.phase).toBe('starting');
    expect(w.mics).toHaveLength(1);
    w.advance(CHECK_WAIT_MS);
    await settle();
    expect(w.phase).not.toBe('starting');
    expect(w.session.snapshot().voice.phase).not.toBe('starting');
  });
  it('two input changes answered out of order: the one chosen last is the one in use', async () => {
    const w = world();
    await w.goLive();
    const a = deferred<MediaStream>(), b = deferred<MediaStream>();
    const sa = { id: 'A' } as unknown as MediaStream, sb = { id: 'B' } as unknown as MediaStream;
    w.setMic(() => (w.calls.mic[w.calls.mic.length - 1] as { deviceId: string }).deviceId === 'A' ? a.promise : b.promise);
    w.session.chooseInput('A');
    w.session.chooseInput('B');
    b.resolve(sb);
    await settle();
    a.resolve(sa);
    await settle();
    expect(w.caps[w.caps.length - 1]!.stream).toBe(sb);
    expect(w.stopped).toContain(sa);
  });
  it('an input pick still pending when the person picks again with no track (after a hide) never replaces the newer one', async () => {
    const w = world();
    await w.goLive();
    const a = deferred<MediaStream>();
    const sa = { id: 'A' } as unknown as MediaStream;
    w.setMic(() => a.promise);
    w.session.chooseInput('A');
    w.eng.scheduler.unplayedSeconds.mockReturnValue(5);
    w.state.hidden = true;
    w.fireVisible();
    w.state.hidden = false;
    w.fireVisible();
    w.advance(5000);
    expect(w.phase).toBe('muted');
    const sb = { id: 'B' } as unknown as MediaStream;
    w.setMic(async () => sb);
    w.session.chooseInput('B');
    w.session.unmute();
    await settle();
    expect(w.phase).toBe('live');
    a.resolve(sa);
    await settle();
    expect(w.caps[w.caps.length - 1]!.stream).toBe(sb);
    expect(w.stopped).toContain(sa);
  });
  it('a resume that never settles reads as blocked playback, not a start that never ends', async () => {
    const w = world();
    w.eng.resume.mockImplementation(() => new Promise(() => undefined));
    w.eng.blocked.mockReturnValue(true);
    w.session.press();
    await settle();
    expect(w.phase).toBe('starting');
    w.advance(RESUME_WAIT_MS);
    await settle();
    expect(w.phase).toBe('playbackBlocked');
  });
});
