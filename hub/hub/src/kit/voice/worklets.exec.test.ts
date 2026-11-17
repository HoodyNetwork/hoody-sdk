// @vitest-environment node
// The voice worklets run here against a stand-in AudioWorklet global whose port really transfers (structuredClone with
// a transfer list detaches the sender's buffer, as postMessage does): capture keeps posting full batches, playback
// reports what it rendered of each block and drops its queue on a flush.
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Port { onmessage: ((e: { data: unknown }) => void) | null; posted: unknown[]; postMessage(m: unknown, t?: Transferable[]): void }
type Proc = { port: Port; process(i: Float32Array[][], o?: Float32Array[][]): boolean };

async function load(file: 'capture' | 'playback', rate = 48000): Promise<Proc> {
  let ctor: (new () => Proc) | null = null;
  vi.resetModules();
  vi.stubGlobal('sampleRate', rate);
  vi.stubGlobal('registerProcessor', (_n: string, c: new () => Proc) => { ctor = c; });
  vi.stubGlobal('AudioWorkletProcessor', class {
    port: Port = { onmessage: null, posted: [], postMessage(m, t) { this.posted.push(structuredClone(m, { transfer: t ?? [] })); } };
  });
  if (file === 'capture') await import('../../core/voice-capture.worklet');
  else await import('../../core/voice-playback.worklet');
  return new ctor!();
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('capture worklet', () => {
  it('keeps posting full 20 ms batches after the first transfer (48 kHz)', async () => {
    const p = await load('capture');
    for (let q = 0; q < 30; q++) p.process([[new Float32Array(128).fill(q / 100)]]);
    const batches = p.port.posted as { type: string; data: Float32Array }[];
    expect(batches.map((b) => b.data.length)).toEqual([960, 960, 960, 960]);
    expect(batches[3]!.data[0]).toBeCloseTo(22 / 100, 6);
  });
});

describe('playback worklet', () => {
  it('reports cumulative frames per block, renders silence on underrun, and drops its queue on flush', async () => {
    const p = await load('playback');
    const send = (m: unknown, t: Transferable[] = []) => p.port.onmessage!({ data: structuredClone(m, { transfer: t }) });
    const a = new Float32Array(200).fill(0.5);
    send({ type: 'block', id: 7, data: a }, [a.buffer]);
    expect(a.length).toBe(0);
    const out = [new Float32Array(128)];
    p.process([], [out]);
    expect(p.port.posted).toEqual([{ type: 'played', id: 7, frames: 128 }]);
    p.process([], [out]);
    expect(out[0]!.slice(0, 72).every((v) => v === 0.5) && out[0]!.slice(72).every((v) => v === 0)).toBe(true);
    expect(p.port.posted.slice(1)).toEqual([{ type: 'played', id: 7, frames: 200 }, { type: 'need' }]);
    const b = new Float32Array(500).fill(0.25);
    send({ type: 'block', id: 8, data: b }, [b.buffer]);
    send({ type: 'flush', seq: 3 });
    p.process([], [out]);
    expect(p.port.posted.slice(3)).toEqual([{ type: 'flushed', seq: 3 }, { type: 'need' }]);
    expect(out[0]!.every((v) => v === 0)).toBe(true);
  });
});
