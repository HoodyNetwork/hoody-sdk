// runner.stale.test.ts: dispose when the machine's own `stale` step throws. The real machine never
// throws on stale; this file swaps voiceStep for one that does, on request, so the runner's shutdown backstop is proven:
// the tracks stop, timers clear and the socket closes with no step to ask for them, and nothing overwrites the stored
// identities (only the machine knows a loss's unsettled ones; the live state's would be wrong).
import { describe, expect, it, vi } from 'vitest';
import type * as Pure from '@kit/pure';
import type { VoiceEvent, VoiceState } from '@kit/pure';

const boom = { on: false };
vi.mock('@kit/pure', async (orig) => {
  const real = await orig<typeof Pure>();
  return {
    ...real,
    voiceStep: (s: VoiceState, e: VoiceEvent, now: number) => {
      if (boom.on && e.type === 'stale') throw new Error('stale');
      return real.voiceStep(s, e, now);
    },
  };
});
const { voiceInitial: initial } = await import('@kit/pure');
const { createVoiceRunner } = await import('./runner');
type Ports = Parameters<typeof createVoiceRunner>[1];

describe('dispose when the stale step itself throws', () => {
  it('still stops the tracks, clears timers and closes the socket, and writes no persist', () => {
    let t = 1_000_000;
    const socks: Array<{ on: Parameters<Ports['open']>[1]; closed: number }> = [];
    const timers: Array<{ live: boolean }> = [];
    const persisted: unknown[] = [];
    const ports: Ports = {
      open: (_o, on) => {
        const k = { on, closed: 0 };
        socks.push(k);
        return { send: () => {}, sendAudio: () => {}, close: () => void (k.closed += 1) };
      },
      stopTracks: vi.fn(),
      flushPlayback: vi.fn(),
      cancelTurn: () => new Promise(() => {}),
      timer: () => {
        const x = { live: true };
        timers.push(x);
        return () => void (x.live = false);
      },
      persist: (ids) => void persisted.push(ids),
      now: () => t,
    };
    const r = createVoiceRunner(initial('ptt'), ports);
    r.dispatch({ type: 'press' });
    r.dispatch({ type: 'started', gen: r.state().gen, result: 'ready' });
    socks[0]!.on.frame({ type: 'session', epoch: 1, conn: 'k1', in_rate: 16000, out_rate: 24000, vad: false });
    r.dispatch({ type: 'pttDown' });
    t += 500;
    r.dispatch({ type: 'audio', gen: r.state().gen, pcm: new Int16Array(320) });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'vad.start', utt: 1 } });
    r.dispatch({ type: 'frame', gen: r.state().gen, frame: { type: 'reply.provisional', turn_id: 't1', seq: 1, text: 'Hi' } });
    r.dispatch({ type: 'stopAnswer', turnId: 't1' });
    expect(timers.some((x) => x.live)).toBe(true);
    vi.mocked(ports.stopTracks).mockClear();
    boom.on = true;
    const n = persisted.length;
    expect(() => r.dispose()).not.toThrow();
    expect(ports.stopTracks).toHaveBeenCalledTimes(1);
    expect(persisted.length).toBe(n);
    expect(timers.every((x) => !x.live)).toBe(true);
    expect(socks[0]!.closed).toBe(1);
  });
});
