// The frame keeper: a still Board still gives the recorder a frame every half second, so keyframes (and viewer joins)
// keep coming. Fakes stand in for MediaStreamTrackProcessor / MediaStreamTrackGenerator / VideoFrame.
import { describe, expect, test } from 'vitest';
import { keepFrames, STILL_MS, type FrameEnv } from './frames';
import { FakeTrack, fakeStream, flush } from './test/fakes';

class FakeFrame {
  static open = 0;
  static twice = 0;          // close() calls on a frame already closed (the keeper swallows the throw, this counts it)
  static cloneBroken = false;
  closed = false;
  constructor(readonly timestamp: number, readonly from: FakeFrame | null = null) { FakeFrame.open++; }
  clone() { if (FakeFrame.cloneBroken) throw new Error('no clone'); return new FakeFrame(this.timestamp, this); }
  close() { if (this.closed) { FakeFrame.twice++; throw new Error('closed twice'); } this.closed = true; FakeFrame.open--; }
}

// How the fake generator takes a write: at once, held until released, or refused.
type WriteMode = 'take' | 'hold' | 'reject';

function rig(o: { apis?: boolean; write?: WriteMode; failAt?: 'stream' | 'writer' } = {}) {
  FakeFrame.open = 0; FakeFrame.twice = 0; FakeFrame.cloneBroken = false;
  let restampBroken = false;
  let feed!: ReadableStreamDefaultController<FakeFrame>;
  const written: FakeFrame[] = [];
  const held: Array<{ f: FakeFrame; release(): void; refuse(): void }> = [];
  let writerClosed = false, writerAborted = false, readerCancelled = false, mode: WriteMode = o.write ?? 'take';
  const timers = new Map<number, () => void>();
  let nextTimer = 1, clock = 0;
  const generators: Array<FakeTrack & { writable: WritableStream<FakeFrame> }> = [];
  const env: FrameEnv = o.apis === false ? {} : {
    MediaStreamTrackProcessor: class {
      readonly readable: ReadableStream<FakeFrame>;
      constructor(readonly init: { track: MediaStreamTrack }) {
        this.readable = new ReadableStream<FakeFrame>({ start(c) { feed = c; }, cancel() { readerCancelled = true; } });
      }
    } as unknown as FrameEnv['MediaStreamTrackProcessor'],
    MediaStreamTrackGenerator: class extends FakeTrack {
      readonly writable = new WritableStream<FakeFrame>({
        write(f) {
          written.push(f);
          if (mode === 'reject') return Promise.reject(new Error('refused'));
          if (mode === 'hold') return new Promise<void>((res, rej) => { held.push({ f, release: () => { f.close(); res(); }, refuse: () => rej(new Error('refused')) }); });
          f.close();
          return undefined;
        },
        close() { writerClosed = true; },
        abort() { writerAborted = true; },
      });
      constructor() { super('video'); generators.push(this as never); }
    } as unknown as FrameEnv['MediaStreamTrackGenerator'],
    VideoFrame: class extends FakeFrame {
      constructor(src: FakeFrame, init: { timestamp: number }) {
        if (src.closed) throw new Error('copy of a closed frame');
        if (restampBroken) throw new Error('no restamp');
        super(init.timestamp, src);
      }
    } as unknown as FrameEnv['VideoFrame'],
    MediaStream: class {
      constructor(readonly tracks: MediaStreamTrack[]) { if (o.failAt === 'stream') throw new Error('no stream'); }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
      getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
    } as unknown as FrameEnv['MediaStream'],
  };
  if (o.failAt === 'writer' && env.MediaStreamTrackGenerator) {
    // The generator is made, then its writer cannot be had (after the reader was acquired).
    const Base = env.MediaStreamTrackGenerator as unknown as new (i: { kind: 'video' }) => object;
    env.MediaStreamTrackGenerator = class extends Base {
      constructor(i: { kind: 'video' }) { super(i); Object.defineProperty(this, 'writable', { get() { throw new Error('no writer'); } }); }
    } as unknown as FrameEnv['MediaStreamTrackGenerator'];
  }
  env.setInterval = (fn: () => void) => { const id = nextTimer++; timers.set(id, fn); return id; };
  env.clearInterval = (id: unknown) => { timers.delete(id as number); };
  env.now = () => clock;
  const tick = async (ms: number) => { clock += ms; for (const fn of [...timers.values()]) fn(); await flush(); };
  // A frame the processor can no longer deliver (the keeper cancelled it) is closed by the browser.
  const frame = (ts: number) => { const f = new FakeFrame(ts); try { feed.enqueue(f); } catch { f.close(); } };
  return {
    env, written, held, generators, timers, tick, frame, end: () => feed.close(),
    writerEnded: () => writerClosed || writerAborted, writerAborted: () => writerAborted, writerClosed: () => writerClosed,
    readerCancelled: () => readerCancelled, setMode: (m: WriteMode) => { mode = m; },
    breakRestamp: () => { restampBroken = true; }, breakClone: () => { FakeFrame.cloneBroken = true; },
  };
}

describe('frame keeper', () => {
  test('a still source: after the last real frame a copy goes out every STILL_MS (half a second), with advancing timestamps', async () => {
    const r = rig();
    const s = fakeStream({ audio: true });
    const k = keepFrames(s.stream, r.env);
    expect(STILL_MS).toBe(500);
    expect(k.kept).toBe(true);
    expect(k.stream.getVideoTracks()[0]).toBe(r.generators[0]);
    expect(k.stream.getAudioTracks()[0]).toBe(s.audio);
    r.frame(1_000_000);
    await flush();
    expect(r.written.map((f) => f.timestamp)).toEqual([1_000_000]);
    await r.tick(STILL_MS);
    expect(r.written).toHaveLength(2);
    expect(r.written[1]!.timestamp).toBe(1_000_000 + STILL_MS * 1000);
    await r.tick(STILL_MS);
    await r.tick(STILL_MS);
    expect(r.written.map((f) => f.timestamp)).toEqual([1_000_000, 1_000_000 + STILL_MS * 1000, 1_000_000 + 2 * STILL_MS * 1000, 1_000_000 + 3 * STILL_MS * 1000]);
    k.stop();
  });

  test('a moving source: frames pass through one for one, no copies while frames keep coming', async () => {
    const r = rig();
    const k = keepFrames(fakeStream().stream, r.env);
    for (let i = 0; i < 5; i++) { r.frame(i * 66_000); await flush(); await r.tick(STILL_MS / 2); }
    expect(r.written.map((f) => f.timestamp)).toEqual([0, 66_000, 132_000, 198_000, 264_000]);
    k.stop();
  });

  test('no copy before the first real frame; copies are made from a frame still open (the fake throws otherwise)', async () => {
    const r = rig();
    const k = keepFrames(fakeStream().stream, r.env);
    await r.tick(STILL_MS); await r.tick(STILL_MS);
    expect(r.written).toHaveLength(0);
    r.frame(5); await flush(); await r.tick(STILL_MS); await r.tick(STILL_MS);
    expect(r.written).toHaveLength(3);
    expect(r.written.every((f) => f.closed)).toBe(true);
    k.stop();
  });

  test('a frame just before a tick defers the copy to the next tick (STILL_MS of stillness, not a tick)', async () => {
    const r = rig();
    const k = keepFrames(fakeStream().stream, r.env);
    r.frame(0); await flush();
    await r.tick(STILL_MS - 1);
    r.frame(66_000); await flush();
    await r.tick(1);
    expect(r.written).toHaveLength(2);
    await r.tick(STILL_MS);
    expect(r.written).toHaveLength(3);
    k.stop();
  });

  test('every frame is closed exactly once: stop closes the kept one, the timer goes, nothing more is written', async () => {
    const r = rig();
    const k = keepFrames(fakeStream().stream, r.env);
    r.frame(1); await flush(); r.frame(2); await flush(); await r.tick(STILL_MS);
    k.stop();
    await flush();
    expect(FakeFrame.open).toBe(0);
    expect(r.timers.size).toBe(0);
    expect(r.writerEnded()).toBe(true);
    expect({ aborted: r.writerAborted(), closed: r.writerClosed() }).toEqual({ aborted: true, closed: false }); // pending writes are aborted
    expect(r.readerCancelled()).toBe(true);
    expect(r.generators[0]!.stopped).toBe(true);
    expect(FakeFrame.twice).toBe(0);
    const n = r.written.length;
    await r.tick(STILL_MS);
    expect(r.written).toHaveLength(n);
    k.stop(); // twice is harmless
  });

  test('the source ending ends the keeper the same way', async () => {
    const r = rig();
    keepFrames(fakeStream().stream, r.env);
    r.frame(1); await flush();
    r.end(); await flush();
    expect(FakeFrame.open).toBe(0);
    expect(r.timers.size).toBe(0);
    expect(r.generators[0]!.stopped).toBe(true);
  });

  test('without the browser APIs the stream is recorded as it is', () => {
    const r = rig({ apis: false });
    const s = fakeStream();
    const k = keepFrames(s.stream, r.env);
    expect(k.kept).toBe(false);
    expect(k.stream).toBe(s.stream);
    k.stop();
  });

  test('a setup failure falls back to the stream as it is, and undoes what was set up', () => {
    for (const failAt of ['stream', 'writer'] as const) {
      const r = rig({ failAt });
      const s = fakeStream();
      const k = keepFrames(s.stream, r.env);
      expect(k.kept, failAt).toBe(false);
      expect(k.stream, failAt).toBe(s.stream);
      expect(r.generators[0]!.stopped, failAt).toBe(true);
      expect(r.readerCancelled(), failAt).toBe(true);
    }
  });

  test('time order: a late captured frame after a copy goes out restamped just after it', async () => {
    const r = rig();
    const k = keepFrames(fakeStream().stream, r.env);
    r.frame(1_000_000); await flush();
    await r.tick(STILL_MS);                                        // a copy at 1_000_000 + STILL_MS ms
    r.frame(1_000_000 + STILL_MS * 1000 - 10_000); await flush();  // captured before the copy, delivered after it
    r.frame(1_000_000 + STILL_MS * 1000 + 66_000); await flush();
    const ts = r.written.map((f) => f.timestamp);
    expect(ts).toEqual([1_000_000, 1_000_000 + STILL_MS * 1000, 1_000_000 + STILL_MS * 1000 + 1, 1_000_000 + STILL_MS * 1000 + 66_000]);
    for (let i = 1; i < ts.length; i++) expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
    k.stop();
    expect(FakeFrame.open).toBe(0);
  });

  test('a stalled generator: one write at a time, only the newest frame waits, no copies; stop drops the waiting one', async () => {
    const r = rig({ write: 'hold' });
    const k = keepFrames(fakeStream().stream, r.env);
    for (let i = 0; i < 40; i++) { r.frame(i * 66_000); await flush(); }
    await r.tick(STILL_MS); await r.tick(STILL_MS);
    expect(r.written).toHaveLength(1);              // the first write is still pending
    expect(FakeFrame.open).toBeLessThanOrEqual(3);  // in the write, waiting, the kept copy
    r.held[0]!.release(); await flush();
    expect(r.written.map((f) => f.timestamp)).toEqual([0, 39 * 66_000]); // the newest waited; the rest were dropped
    k.stop(); await flush();
    expect(FakeFrame.open).toBe(1);                 // only the frame inside the pending write, which the generator owns
    r.held[1]!.release(); await flush();
    expect(FakeFrame.open).toBe(0);
  });

  test('stop while a write is pending: the waiting frame is closed and never written; a late refusal of that write reports nothing', async () => {
    const r = rig({ write: 'hold' });
    let fails = 0;
    const k = keepFrames(fakeStream().stream, r.env, () => { fails++; });
    r.frame(0); await flush(); r.frame(66_000); await flush(); r.frame(132_000); await flush();
    expect(FakeFrame.open).toBe(3);   // in the write, waiting, the kept copy
    k.stop(); await flush();
    expect(FakeFrame.open).toBe(1);   // only the frame inside the pending write
    r.held[0]!.refuse(); await flush();
    expect(fails).toBe(0);
    expect(FakeFrame.open).toBe(0);
    expect(r.written.map((f) => f.timestamp)).toEqual([0]);
  });

  test('a refused write ends the keeper and reports it once, for a captured frame and for a copy', async () => {
    for (const at of ['frame', 'copy'] as const) {
      const r = rig();
      let fails = 0;
      keepFrames(fakeStream().stream, r.env, () => { fails++; });
      r.frame(1); await flush();
      r.setMode('reject');
      if (at === 'frame') { r.frame(2); await flush(); } else await r.tick(STILL_MS);
      expect(fails, at).toBe(1);
      expect(r.timers.size, at).toBe(0);
      expect(r.generators[0]!.stopped, at).toBe(true);
      expect(r.readerCancelled(), at).toBe(true);
      expect(FakeFrame.open, at).toBe(0);
      r.frame(3); await flush(); await r.tick(STILL_MS);
      expect(fails, at).toBe(1);
      expect(FakeFrame.open, at).toBe(0);
    }
  });

  test('a restamp or a copy that fails ends the keeper once, closing each frame it owned exactly once', async () => {
    for (const at of ['restamp', 'clone'] as const) {
      const r = rig();
      let fails = 0;
      keepFrames(fakeStream().stream, r.env, () => { fails++; });
      r.frame(1_000); await flush();
      if (at === 'restamp') r.breakRestamp(); else r.breakClone();
      r.frame(500); await flush();   // delivered late: it needs a restamp, then a kept copy
      expect(fails, at).toBe(1);
      expect(FakeFrame.twice, at).toBe(0);
      expect(FakeFrame.open, at).toBe(0);
      expect(r.written.map((f) => f.timestamp), at).toEqual([1_000]);
      expect(r.generators[0]!.stopped, at).toBe(true);
    }
  });
});
