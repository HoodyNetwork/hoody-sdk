// @vitest-environment node
// kit/voice/capture.ts: the decimator, 40 ms framing, real-time pacing, and a stall
// that drops old frames with their seq numbers spent.
import { describe, expect, it } from 'vitest';
import { CAPTURE_RATE, Decimator, FRAME_MS, FRAME_SAMPLES, Framer, MAX_RATE, SendQueue, STALE_MS } from './capture';

const tone = (hz: number, rate: number, n: number, from = 0) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * (from + i)) / rate));
const rms = (a: Float32Array, skip = 0) => { let s = 0; for (let i = skip; i < a.length; i++) s += a[i]! ** 2; return Math.sqrt(s / (a.length - skip)); };

describe('Decimator', () => {
  for (const rate of [48000, 44100, 16000]) {
    it(`keeps the output rate exact from ${rate} Hz, whatever the batch sizes`, () => {
      const d = new Decimator(rate);
      let n = 0;
      for (let i = 0; i < 100; i++) n += d.push(new Float32Array(37 + (i % 5) * 101)).length;
      const input = Array.from({ length: 100 }, (_, i) => 37 + (i % 5) * 101).reduce((a, b) => a + b, 0);
      expect(Math.abs(n - (input * CAPTURE_RATE) / rate)).toBeLessThan(40);
    });
  }

  it('passes speech-band audio and removes what would alias above 8 kHz', () => {
    const pass = new Decimator(48000).push(tone(1000, 48000, 48000));
    expect(rms(pass, 200)).toBeGreaterThan(0.33);
    const stop = new Decimator(48000).push(tone(12000, 48000, 48000));
    expect(rms(stop, 200)).toBeLessThan(0.02);
    const alias = new Decimator(44100).push(tone(15000, 44100, 44100));
    expect(rms(alias, 200)).toBeLessThan(0.02);
  });

  it('keeps DC at unity gain and refuses a non-finite rate', () => {
    const out = new Decimator(48000).push(new Float32Array(4800).fill(0.25));
    expect(out[out.length - 1]).toBeCloseTo(0.25, 3);
    for (const r of [0, NaN, Infinity, Number.MIN_VALUE, 999]) expect(() => new Decimator(r)).toThrow(RangeError);
    expect(() => new Decimator(48000, 999)).toThrow(RangeError);
    // A rate so large the read position cannot move would never finish a push.
    for (const r of [Number.MAX_VALUE, MAX_RATE + 1]) {
      expect(() => new Decimator(1000, r)).toThrow(RangeError);
      expect(() => new Decimator(r)).toThrow(RangeError);
    }
    // The highest accepted rates still move: a second of input gives about a second of output.
    const hi = new Decimator(MAX_RATE, 1000);
    expect(hi.push(new Float32Array(MAX_RATE)).length).toBeGreaterThan(990);
    expect(new Decimator(1000, MAX_RATE).push(new Float32Array(1000)).length).toBeGreaterThan(MAX_RATE - 10 * MAX_RATE / 1000);
  });

  it('upsamples an 8 kHz context to 16 kHz: exact rate, unity DC, speech passes', () => {
    const d = new Decimator(8000);
    let n = 0;
    for (let i = 0; i < 50; i++) n += d.push(new Float32Array(160)).length;
    expect(Math.abs(n - 16000)).toBeLessThan(40);
    const dc = new Decimator(8000).push(new Float32Array(800).fill(0.25));
    expect(dc[dc.length - 1]).toBeCloseTo(0.25, 3);
    expect(rms(new Decimator(8000).push(tone(1000, 8000, 8000)), 200)).toBeGreaterThan(0.33);
  });
});

describe('Framer', () => {
  it(`cuts ${FRAME_MS} ms Int16 frames and keeps the remainder for the next push`, () => {
    const f = new Framer();
    expect(f.push(new Float32Array(FRAME_SAMPLES - 1).fill(0.5))).toEqual([]);
    const frames = f.push(Float32Array.from([1, 2, -2, ...new Array(600).fill(-0.5)]));
    expect(frames).toHaveLength(1);
    expect(frames[0]![0]).toBe(16384);
    expect(frames[0]![FRAME_SAMPLES - 1]).toBe(32767);
    const next = f.push(new Float32Array(FRAME_SAMPLES - 2));
    expect(next).toHaveLength(1);
    // Out-of-range input clamps to the Int16 bounds instead of wrapping.
    expect([next[0]![0], next[0]![1], next[0]![2]]).toEqual([32767, -32768, -16383]);
    expect(FRAME_SAMPLES).toBe(640);
  });
});

describe('SendQueue', () => {
  it('sends in order, never faster than real time on average', () => {
    const sent: number[] = [];
    const q = new SendQueue((seq) => { sent.push(seq); return true; });
    for (let i = 1; i <= 10; i++) q.push(i, new Int16Array(FRAME_SAMPLES), 0);
    q.pump(0);
    expect(sent).toEqual([1]);
    q.pump(FRAME_MS);
    expect(sent).toEqual([1, 2]);
    q.pump(FRAME_MS * 2.5);
    expect(sent).toEqual([1, 2, 3]);
  });

  it(`a stall drops frames older than ${STALE_MS} ms; their seqs stay spent so the next frame carries the gap`, () => {
    const sent: number[] = [];
    let open = false;
    const q = new SendQueue((seq) => { if (!open) return false; sent.push(seq); return true; });
    for (let i = 1; i <= 8; i++) q.push(i, new Int16Array(FRAME_SAMPLES), (i - 1) * FRAME_MS);
    q.pump(7 * FRAME_MS);
    expect(sent).toEqual([]);
    open = true;
    q.pump(7 * FRAME_MS + 10);
    // Frames queued at 0..80 ms are older than 200 ms at 290 ms: 1, 2, 3 dropped.
    expect(q.dropped).toBe(3);
    expect(sent[0]).toBe(4);
  });

  it('backpressure keeps the frame queued', () => {
    let ok = false;
    const sent: number[] = [];
    const q = new SendQueue((seq) => { if (!ok) return false; sent.push(seq); return true; });
    q.push(1, new Int16Array(1), 0);
    q.pump(0);
    expect(q.size()).toBe(1);
    ok = true;
    q.pump(10);
    expect(sent).toEqual([1]);
  });
});
