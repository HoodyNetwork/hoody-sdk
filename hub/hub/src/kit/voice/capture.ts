// Microphone capture for Talk: the device's audio is decimated to 16 kHz mono, cut into
// 40 ms Int16 frames and handed to the voice machine, which allocates each frame's seq (machine.ts is the only seq
// allocator). Frames then leave through SendQueue, never faster than real time; a frame waiting longer than 200 ms is
// dropped with its seq already spent, so the server sees the hole as frame_loss instead of late audio.
// Decimator, Framer and SendQueue are pure; startCapture() is the thin binding to the capture worklet.

export const CAPTURE_RATE = 16000;
export const FRAME_MS = 40;
export const FRAME_SAMPLES = (CAPTURE_RATE * FRAME_MS) / 1000;
export const STALE_MS = 200;

/** Kernel half-width in output samples: the filter spans 2 * TAPS_OUT output periods whatever the input rate. */
const TAPS_OUT = 8;
/** The lowest rate either side accepts: below it the step is unusable (a near-zero rate would never advance). */
const MIN_RATE = 1000;
/** Above this the read position of a push may not move (a step lost under the position's own precision): refused. */
export const MAX_RATE = 768000;

/**
 * Windowed-sinc (Blackman) low-pass + fractional resampling from `inRate` to `outRate`. Below the output rate (an
 * 8 kHz context) the same kernel interpolates: its cutoff then sits at 0.9 of the input's own Nyquist.
 */
export class Decimator {
  private readonly step: number;
  private readonly half: number;
  private readonly kernel: (x: number) => number;
  private hist: Float32Array = new Float32Array(0);
  /** The next output position, in input samples, relative to the start of `hist`. */
  private pos = 0;
  constructor(inRate: number, readonly outRate: number = CAPTURE_RATE) {
    if (!(inRate >= MIN_RATE && inRate <= MAX_RATE) || !(outRate >= MIN_RATE && outRate <= MAX_RATE)) throw new RangeError('rate');
    this.step = inRate / outRate;
    const half = (this.half = Math.max(8, Math.ceil(TAPS_OUT * this.step)));
    const fc = Math.min(1, outRate / inRate) * 0.9;
    this.kernel = (x: number) => {
      if (Math.abs(x) >= half) return 0;
      const s = x === 0 ? 1 : Math.sin(Math.PI * fc * x) / (Math.PI * fc * x);
      const w = 0.42 + 0.5 * Math.cos((Math.PI * x) / half) + 0.08 * Math.cos((2 * Math.PI * x) / half);
      return fc * s * w;
    };
    this.pos = half;
    this.hist = new Float32Array(half);
  }

  /** Feeds input samples (-1..1); returns the output samples now computable. */
  push(input: Float32Array): Float32Array {
    const buf = new Float32Array(this.hist.length + input.length);
    buf.set(this.hist);
    buf.set(input, this.hist.length);
    const out: number[] = [];
    while (this.pos + this.half < buf.length) {
      const c = Math.floor(this.pos), frac = this.pos - c;
      let acc = 0, wsum = 0;
      for (let k = c - this.half + 1; k <= c + this.half; k++) {
        const w = this.kernel(k - c - frac);
        acc += w * buf[k]!;
        wsum += w;
      }
      out.push(wsum ? acc / wsum : 0);
      this.pos += this.step;
    }
    const keepFrom = Math.max(0, Math.floor(this.pos) - this.half);
    this.hist = buf.slice(keepFrom);
    this.pos -= keepFrom;
    return Float32Array.from(out);
  }
}

/** Cuts a sample stream into FRAME_SAMPLES-long Int16 frames. */
export class Framer {
  private cur = new Int16Array(FRAME_SAMPLES);
  private n = 0;
  push(samples: Float32Array): Int16Array[] {
    const frames: Int16Array[] = [];
    for (let i = 0; i < samples.length; i++) {
      const v = Math.round(samples[i]! * 32767);
      this.cur[this.n++] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      if (this.n === FRAME_SAMPLES) {
        frames.push(this.cur);
        this.cur = new Int16Array(FRAME_SAMPLES);
        this.n = 0;
      }
    }
    return frames;
  }
  reset(): void { this.n = 0; }
}

export interface QueuedFrame { seq: number; pcm: Int16Array; at: number }

/**
 * Real-time pacing for the machine's sendAudio effects. `send` returns false while the socket cannot take more
 * (backpressure); the frame then waits. A frame queued longer than STALE_MS is dropped (its seq stays spent).
 * At most one frame leaves per FRAME_MS of wall time on average, so a stalled socket never bursts its backlog.
 */
export class SendQueue {
  private q: QueuedFrame[] = [];
  private budget = 1;
  private last: number | null = null;
  dropped = 0;
  constructor(private readonly send: (seq: number, pcm: Int16Array) => boolean) {}

  push(seq: number, pcm: Int16Array, at: number): void { this.q.push({ seq, pcm, at }); }

  /** Call on every capture tick (and when the socket drains); `now` in ms. */
  pump(now: number): void {
    if (this.last !== null) this.budget = Math.min(2, this.budget + (now - this.last) / FRAME_MS);
    this.last = now;
    while (this.q.length && now - this.q[0]!.at > STALE_MS) { this.q.shift(); this.dropped++; }
    while (this.q.length && this.budget >= 1) {
      const f = this.q[0]!;
      if (!this.send(f.seq, f.pcm)) break;
      this.q.shift();
      this.budget -= 1;
    }
  }

  size(): number { return this.q.length; }
  clear(): void { this.q = []; }
}

// ---- the binding to the capture worklet ----

export type FromCaptureWorklet = { type: 'input'; data: Float32Array };

export interface CaptureHandle {
  stop(): void;
  /** The device's own sample rate. */
  rate: number;
}

/**
 * Runs `stream` through the capture worklet (registered under `processor`) and calls `onFrame` with each 40 ms frame.
 * The caller feeds each frame to the voice machine and the resulting sendAudio effect to a SendQueue.
 */
export function startCapture(ctx: AudioContext, stream: MediaStream, processor: string, onFrame: (pcm: Int16Array) => void): CaptureHandle {
  // Everything that can throw on its own runs before any node exists; a node that fails is undone before rethrowing.
  const dec = new Decimator(ctx.sampleRate), framer = new Framer();
  const src = ctx.createMediaStreamSource(stream);
  let node: AudioWorkletNode;
  try {
    node = new AudioWorkletNode(ctx, processor, { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
  } catch (e) {
    try { src.disconnect(); } catch { /* never connected */ }
    throw e;
  }
  let live = true;
  node.port.onmessage = (e: MessageEvent<FromCaptureWorklet>) => {
    if (!live || e.data?.type !== 'input' || !(e.data.data instanceof Float32Array)) return;
    for (const f of framer.push(dec.push(e.data.data))) onFrame(f);
  };
  src.connect(node);
  return {
    rate: ctx.sampleRate,
    stop() {
      if (!live) return;
      live = false;
      node.port.onmessage = null;
      try { src.disconnect(); node.disconnect(); } catch { /* already gone */ }
      node.port.postMessage({ type: 'stop' });
    },
  };
}
