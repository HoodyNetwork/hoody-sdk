// The page's audio engine: one AudioContext, one playback worklet and one Scheduler per
// page, shared by Talk, Read aloud and preview. Created on the first press (a user gesture, so the context may start);
// later presses reuse it. The worklets are same-origin chunks (a blob: worklet would be refused by script-src); they
// live in core beside upload.worker.ts, since they run only in the AudioWorklet global, never as page modules.
//   - Marks: while outputs are queued a 50 ms ticker collects the scheduler's due marks and hands Talk's to onMarks.
//   - Suspension: a context that is not running renders nothing, so the cursor and marks freeze by themselves;
//     `blocked` says so and listeners hear every change (Talk shows playbackBlocked).
//   - flush() waits for the worklet to drop its queue and report what it rendered (at most FLUSH_WAIT_MS; a suspended
//     context may not answer), then returns the marks owed at the true position.
import captureUrl from '@core/voice-capture.worklet.ts?worker&url';
import playbackUrl from '@core/voice-playback.worklet.ts?worker&url';
import { feed, Scheduler, type AudioResult, type EndResult, type Mark } from './scheduler';

export const CAPTURE_PROCESSOR = 'hoody-capture';
const PLAYBACK_PROCESSOR = 'hoody-playback';
const TICK_MS = 50;
const FLUSH_WAIT_MS = 300;

export interface VoiceEngine {
  readonly ctx: AudioContext;
  readonly scheduler: Scheduler;
  /** The context is not running: nothing plays and marks are frozen. */
  blocked(): boolean;
  /** Resumes the context (call from a user gesture); false when the browser keeps it suspended. */
  resume(): Promise<boolean>;
  onChange(fn: () => void): () => void;
  /** Talk's marks; one sink at a time (the open Talk session). */
  setMarkSink(fn: ((m: Mark[]) => void) | null): void;
  start(out: number, rate: number): boolean;
  audio(out: number, offset: number, pcm: Int16Array): AudioResult;
  end(out: number, samples: number): EndResult;
  clip(pcm: Int16Array, rate: number): number | null;
  flush(uptoOut?: number): Promise<Mark[]>;
}

let made: Promise<VoiceEngine> | null = null;

/**
 * The page's engine, created on first use. A failed creation is forgotten (its context closed), so the next press
 * tries again with nothing left behind.
 */
export function voiceEngine(): Promise<VoiceEngine> {
  if (!made) made = create().catch((e: unknown) => { made = null; throw e; });
  return made;
}

async function create(): Promise<VoiceEngine> {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  try {
    return await wire(ctx);
  } catch (e) {
    try { await ctx.close(); } catch { /* already closed */ }
    throw e;
  }
}

async function wire(ctx: AudioContext): Promise<VoiceEngine> {
  await Promise.all([ctx.audioWorklet.addModule(captureUrl), ctx.audioWorklet.addModule(playbackUrl)]);
  const node = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  node.connect(ctx.destination);
  const s = new Scheduler();
  const f = feed(s, node.port as unknown as Parameters<typeof feed>[1], ctx.sampleRate);
  const listeners = new Set<() => void>();
  let sink: ((m: Mark[]) => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const send = (m: Mark[]) => { if (m.length && sink) sink(m); };
  const tick = () => {
    send(s.marks(performance.now()));
    if (!s.unplayedSeconds() && !s.pendingBlocks() && timer !== null) { clearInterval(timer); timer = null; }
  };
  const arm = () => { if (timer === null) timer = setInterval(tick, TICK_MS); };
  ctx.onstatechange = () => { for (const fn of [...listeners]) fn(); };
  return {
    ctx,
    scheduler: s,
    blocked: () => ctx.state !== 'running',
    async resume() {
      try { await ctx.resume(); } catch { /* stays suspended */ }
      return ctx.state === 'running';
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMarkSink(fn) { sink = fn; },
    start(out, rate) { const ok = s.start(out, rate); if (ok) arm(); return ok; },
    audio(out, offset, pcm) { const r = s.audio(out, offset, pcm); f.poke(); arm(); return r; },
    end(out, samples) { const r = s.end(out, samples); f.poke(); arm(); return r; },
    clip(pcm, rate) { const id = s.clip(pcm, rate); if (id !== null) { f.poke(); arm(); } return id; },
    flush: (uptoOut) => f.flush(uptoOut, FLUSH_WAIT_MS),
  };
}
