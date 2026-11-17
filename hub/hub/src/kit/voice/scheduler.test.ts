// @vitest-environment node
// kit/voice/scheduler.ts: the page's playback scheduler: 44.1/48 kHz devices against
// 24 kHz, played_to never past what was received, the final mark equals samples only when whole, a damaged output's
// marks stop at the gap, both bounds and overflow, clip admission under 10 s, suspension, flushes, and the feed binding.
import { describe, expect, it } from 'vitest';
import {
  BOUND_NO_LEAD_S,
  BOUND_PLAY_LEAD_S,
  CLIP_ADMIT_S,
  CLIP_MAX_S,
  MARK_EVERY_MS,
  COALESCE_MAX,
  MAX_GAPS,
  MAX_OUTPUTS,
  RATE_MAX,
  RATE_MIN,
  type FromWorklet,
  type Mark,
  type PlaybackPort,
  type ToWorklet,
  Scheduler,
  feed,
} from './scheduler';

const R = 24000;
const ramp = (n: number, from = 0) => Int16Array.from({ length: n }, (_, i) => ((from + i) % 2000) - 1000);

/** Renders everything handed over, block by block, `perTick` frames at a time; returns the marks seen. */
function drain(s: Scheduler, device: number, opts: { perTick?: number; ticks?: number; now?: { t: number } } = {}): Mark[] {
  const perTick = opts.perTick ?? 128, clock = opts.now ?? { t: 0 };
  const marks: Mark[] = [];
  for (let i = 0; i < (opts.ticks ?? 100000); i++) {
    const b = s.pull(perTick, device);
    if (!b) break;
    s.played(b.id, b.data.length);
    clock.t += (b.data.length / device) * 1000;
    marks.push(...s.marks(clock.t));
  }
  marks.push(...s.marks(clock.t + MARK_EVERY_MS));
  return marks;
}

function talk(): Scheduler {
  const s = new Scheduler();
  s.talkOpened();
  return s;
}

describe('resampling to the device rate', () => {
  for (const device of [44100, 48000, 24000, 16000]) {
    it(`plays a 24 kHz output whole on a ${device} Hz device and marks samples exactly`, () => {
      const s = talk();
      s.start(1, R);
      expect(s.audio(1, 0, ramp(4800))).toBe('ok');
      expect(s.audio(1, 4800, ramp(2400, 4800))).toBe('ok');
      s.end(1, 7200);
      const marks = drain(s, device);
      expect(marks.at(-1)).toEqual({ out: 1, played_to: 7200 });
      // Monotone and never past what was received.
      for (let i = 1; i < marks.length; i++) expect(marks[i]!.played_to).toBeGreaterThan(marks[i - 1]!.played_to);
      expect(s.unplayedSeconds()).toBe(0);
    });
  }

  it('interpolates between source samples (a 2x device repeats the midpoint)', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, Int16Array.from([0, 1000, 2000, 3000]));
    s.end(1, 4);
    const b = s.pull(64, 48000)!;
    expect(Array.from(b.data, (v) => Math.round(v * 32768))).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3000]);
  });

  it('holds back the last received sample of an open output (its next neighbour is not here yet)', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(10));
    const b = s.pull(1000, R)!;
    expect(b.data.length).toBe(9);
    s.played(b.id, 9);
    expect(s.marks(1000)).toEqual([{ out: 1, played_to: 9 }]);
    expect(s.pull(1000, R)).toBeNull();
    s.audio(1, 10, ramp(10, 10));
    s.end(1, 20);
    expect(drain(s, R).at(-1)).toEqual({ out: 1, played_to: 20 });
  });
});

describe('played_to', () => {
  it('counts only frames the device rendered, never what was handed over', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(2400));
    s.end(1, 2400);
    const b = s.pull(2400, 48000)!;
    expect(s.marks(1000)).toEqual([]);
    s.played(b.id, 1000);
    expect(s.marks(2000)).toEqual([{ out: 1, played_to: 500 }]);
  });

  it('excludes underrun silence: nothing reported, nothing marked, and the time does not count', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(240));
    const marks = drain(s, R);
    const last = marks.at(-1)!.played_to;
    expect(last).toBe(239);
    // Time passes with no audio: no new mark.
    expect(s.marks(1e9)).toEqual([]);
  });

  it('never exceeds received samples on any tick (random chunking, 44.1 kHz)', () => {
    const s = talk();
    s.start(1, R);
    let recv = 0, t = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 200; k++) {
      const n = 1 + Math.floor(rnd() * 900);
      s.audio(1, recv, ramp(n, recv));
      recv += n;
      for (let j = 0; j < 3; j++) {
        const b = s.pull(1 + Math.floor(rnd() * 300), 44100);
        if (!b) break;
        s.played(b.id, Math.floor(rnd() * (b.data.length + 1)));
        s.played(b.id, b.data.length);
      }
      t += 300;
      for (const m of s.marks(t)) expect(m.played_to).toBeLessThanOrEqual(recv);
    }
  });

  it('marks every 250 ms while advancing, not on every report', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(R * 2));
    const at: number[] = [];
    let t = 0;
    for (;;) {
      const b = s.pull(240, R);
      if (!b) break;
      s.played(b.id, 240);
      t += 10;
      for (const _ of s.marks(t)) at.push(t);
    }
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(MARK_EVERY_MS);
    expect(at.length).toBeGreaterThan(5);
  });
});

describe('a damaged output', () => {
  it('plays audio after a gap but never marks past the gap start', () => {
    const s = talk();
    s.start(1, R);
    expect(s.audio(1, 0, ramp(1000))).toBe('ok');
    expect(s.audio(1, 1500, ramp(1000, 1500))).toBe('damaged');
    s.end(1, 2500);
    const marks = drain(s, 48000);
    expect(marks.at(-1)).toEqual({ out: 1, played_to: 1000 });
    expect(s.unplayedSeconds()).toBe(0);
  });

  it('drops overlapping audio whole', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(1000));
    expect(s.audio(1, 500, ramp(1000))).toBe('overlap');
    s.end(1, 1000);
    expect(drain(s, R).at(-1)).toEqual({ out: 1, played_to: 1000 });
  });

  it('a missing tail (end past what was received) never gets a final mark of samples', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(1000));
    s.end(1, 3000);
    expect(drain(s, R).at(-1)).toEqual({ out: 1, played_to: 1000 });
  });

  it('refuses audio for an unknown or ended output', () => {
    const s = talk();
    expect(s.audio(9, 0, ramp(10))).toBe('unknown');
    s.start(1, R);
    s.end(1, 0);
    expect(s.audio(1, 0, ramp(10))).toBe('unknown');
  });
});

describe('bounds and overflow', () => {
  it(`refuses audio past ${BOUND_NO_LEAD_S} s without play lead and ${BOUND_PLAY_LEAD_S} s with it`, () => {
    for (const [lead, bound] of [[false, BOUND_NO_LEAD_S], [true, BOUND_PLAY_LEAD_S]] as const) {
      const s = talk();
      s.setPlayLead(lead);
      s.start(1, R);
      let off = 0;
      for (let i = 0; i < bound; i++) { expect(s.audio(1, off, ramp(R))).toBe('ok'); off += R; }
      expect(s.audio(1, off, ramp(1))).toBe('overflow');
      // The refused audio was dropped, never queued and never marked.
      expect(s.unplayedSeconds()).toBe(bound);
      s.end(1, off + 1);
      expect(drain(s, R).at(-1)).toEqual({ out: 1, played_to: off });
    }
  });

  it('the bound spans every queued output', () => {
    const s = talk();
    s.setPlayLead(true);
    s.start(1, R);
    s.start(2, R);
    s.audio(1, 0, ramp(R * 7));
    expect(s.audio(2, 0, ramp(R * 6))).toBe('overflow');
    expect(s.audio(2, 0, ramp(R * 5))).toBe('ok');
  });

  it('playing makes room again', () => {
    const s = talk();
    s.setPlayLead(true);
    s.start(1, R);
    s.audio(1, 0, ramp(R * 12));
    expect(s.audio(1, R * 12, ramp(R))).toBe('overflow');
    const b = s.pull(R * 2, R)!;
    s.played(b.id, R * 2);
    expect(s.audio(1, R * 12, ramp(R))).toBe('ok');
  });
});

describe('outputs in order', () => {
  it('starts the next output only once the previous one was wholly handed over', () => {
    const s = talk();
    s.start(1, R);
    s.start(2, R);
    s.audio(2, 0, ramp(100));
    s.audio(1, 0, ramp(100));
    const b1 = s.pull(1000, R)!;
    expect(b1.out).toBe(1);
    expect(s.pull(1000, R)).toBeNull();
    s.end(1, 100);
    const tail = s.pull(1000, R)!;
    expect(tail.out).toBe(1);
    expect(s.pull(1000, R)!.out).toBe(2);
  });
});

describe('clips', () => {
  it(`admits a clip only while unplayed audio is under ${CLIP_ADMIT_S} s and none waits undecoded-to-play`, () => {
    const s = new Scheduler();
    expect(s.clip(ramp(R * 9), R)).not.toBeNull();
    expect(s.admitClip()).toBe(false);
    const b = s.pull(R, R)!;
    s.played(b.id, R);
    // The first clip is playing (none waits), but 8 s are unplayed: admitted once more.
    expect(s.admitClip()).toBe(true);
    expect(s.clip(ramp(R * 3), R)).not.toBeNull();
    expect(s.admitClip()).toBe(false);
  });

  it(`refuses a clip at ${CLIP_ADMIT_S} s unplayed even when no clip waits to start`, () => {
    const s = new Scheduler();
    expect(s.clip(ramp(R * 9), R)).not.toBeNull();
    const b = s.pull(R / 2, R)!;
    s.played(b.id, R / 2);
    expect(s.clip(ramp(R * 2), R)).not.toBeNull();
    // Hand over the rest of the first clip and the start of the second: both are playing, 10.5 s unplayed.
    expect(s.pull(R * 10, R)!.out).toBe(b.out);
    expect(s.pull(100, R)!.out).not.toBe(b.out);
    expect(s.unplayedSeconds()).toBeCloseTo(10.5, 6);
    expect(s.admitClip()).toBe(false);
  });

  it(`refuses a clip over ${CLIP_MAX_S} s, an empty clip and every clip during Talk`, () => {
    const s = new Scheduler();
    expect(s.clip(ramp(R * CLIP_MAX_S + 1), R)).toBeNull();
    expect(s.clip(new Int16Array(0), R)).toBeNull();
    s.talkOpened();
    expect(s.clip(ramp(100), R)).toBeNull();
    s.talkClosed();
    expect(s.clip(ramp(100), R)).not.toBeNull();
  });

  it('opening Talk flushes clips; clips send no marks', () => {
    const s = new Scheduler();
    s.clip(ramp(1000), 22050);
    expect(drain(s, 48000, { ticks: 2 })).toEqual([]);
    expect(s.talkOpened()).toBe(true);
    expect(s.clipActive()).toBe(false);
    expect(s.pull(100, 48000)).toBeNull();
  });

  it('Talk outputs are refused while no Talk session is open', () => {
    const s = new Scheduler();
    s.start(1, R);
    expect(s.audio(1, 0, ramp(10))).toBe('unknown');
  });
});

describe('suspension', () => {
  it('a device that renders nothing freezes the cursor and marks', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(R));
    const b = s.pull(480, R)!;
    s.played(b.id, 100);
    expect(s.marks(1000)).toEqual([{ out: 1, played_to: 100 }]);
    // Suspended: no reports for any length of time.
    expect(s.marks(1e9)).toEqual([]);
    expect(s.marks(2e9)).toEqual([]);
  });
});

describe('flush', () => {
  it('output.stop flushes outputs up to upto_out with a last mark at the true position, keeping later ones', () => {
    const s = talk();
    s.start(1, R);
    s.start(2, R);
    s.audio(1, 0, ramp(R));
    s.audio(2, 0, ramp(R));
    s.end(1, R);
    const b = s.pull(4800, R)!;
    s.played(b.id, 1234);
    expect(s.flush(1)).toEqual([{ out: 1, played_to: 1234 }]);
    expect(s.pull(100, R)!.out).toBe(2);
  });

  it('a flush keeps nothing of a damaged output past its gap and owes no mark already sent', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(100));
    s.audio(1, 200, ramp(100, 200));
    s.end(1, 300);
    drain(s, R);
    expect(s.flush()).toEqual([]);
  });

  it('kept outputs are handed over again from what was rendered', () => {
    const s = talk();
    s.start(1, R);
    s.start(2, R);
    s.audio(1, 0, ramp(10));
    s.end(1, 10);
    s.audio(2, 0, ramp(1000));
    s.end(2, 1000);
    drain(s, R, { ticks: 1 });
    const b2 = s.pull(500, R)!;
    expect(b2.out).toBe(2);
    s.played(b2.id, 100);
    s.flush(1);
    const again = s.pull(500, R)!;
    expect(again.cursor0).toBe(100);
  });
});

describe('feed (the worklet binding)', () => {
  function port() {
    const sent: ToWorklet[] = [];
    const p: PlaybackPort & { sent: ToWorklet[]; reply(m: FromWorklet): void } = {
      sent,
      onmessage: null,
      // A real port: the transfer list detaches the sender's buffers (the scheduler must not read them after).
      postMessage(m, transfer) { sent.push(structuredClone(m, { transfer: transfer ?? [] })); },
      reply(m) { p.onmessage!({ data: m }); },
    };
    return p;
  }

  it('keeps at most the device lead handed over and refills on reports', () => {
    const s = talk(), p = port();
    const f = feed(s, p, 48000);
    s.start(1, R);
    s.audio(1, 0, ramp(R * 2));
    f.poke();
    const frames = () => p.sent.filter((m) => m.type === 'block').reduce((n, m) => n + (m as { data: Float32Array }).data.length, 0);
    const first = frames();
    expect(first).toBeGreaterThanOrEqual(48000 * 0.12);
    expect(first).toBeLessThan(48000 * 0.17);
    const b = p.sent.find((m) => m.type === 'block') as { id: number; data: Float32Array };
    p.reply({ type: 'played', id: b.id, frames: 1920 });
    expect(frames()).toBeGreaterThan(first);
  });

  it('never holds more than the 120 ms device lead outstanding, even after partial reports', () => {
    const s = talk(), p = port();
    const f = feed(s, p, 48000);
    s.start(1, R);
    s.audio(1, 0, ramp(R * 4));
    f.poke();
    const done = new Map<number, number>();
    const outstanding = () => p.sent.filter((m) => m.type === 'block').reduce((n, m) => n + (m as { data: Float32Array }).data.length - (done.get((m as { id: number }).id) ?? 0), 0);
    for (let k = 0; k < 40; k++) {
      expect(outstanding()).toBeLessThanOrEqual(48000 * 0.12);
      const b = p.sent.find((m) => m.type === 'block' && (done.get((m as { id: number }).id) ?? 0) < (m as { data: Float32Array }).data.length) as { id: number; data: Float32Array };
      const n = Math.min(b.data.length, (done.get(b.id) ?? 0) + 1000);
      done.set(b.id, n);
      p.reply({ type: 'played', id: b.id, frames: n });
    }
  });

  it('flush waits for the worklet, hands nothing over meanwhile, and returns the marks owed', async () => {
    const s = talk(), p = port();
    const f = feed(s, p, R);
    s.start(1, R);
    s.audio(1, 0, ramp(R));
    f.poke();
    const b = p.sent.find((m) => m.type === 'block') as { id: number };
    const pending = f.flush(undefined, 10000);
    const fl = p.sent.at(-1) as { type: 'flush'; seq: number };
    expect(fl.type).toBe('flush');
    p.reply({ type: 'played', id: b.id, frames: 500 });
    expect(p.sent.at(-1)).toBe(fl);
    p.reply({ type: 'flushed', seq: fl.seq });
    expect(await pending).toEqual([{ out: 1, played_to: 500 }]);
  });

  it('a flush the worklet never answers settles after its wait', async () => {
    const s = talk(), p = port();
    const f = feed(s, p, R);
    s.start(1, R);
    s.audio(1, 0, ramp(R));
    f.poke();
    expect(await f.flush(undefined, 5)).toEqual([]);
  });

  it('marks what the device rendered after the block was transferred (24 kHz on 48 kHz: 128 frames = 64 samples)', () => {
    const s = talk(), p = port();
    s.start(1, R);
    s.audio(1, 0, ramp(R));
    const f = feed(s, p, 48000);
    f.poke();
    const b = p.sent.find((m) => m.type === 'block') as { id: number; data: Float32Array };
    expect(b.data.length).toBeGreaterThan(128);
    p.reply({ type: 'played', id: b.id, frames: 128 });
    expect(s.marks(1e9)).toEqual([{ out: 1, played_to: 64 }]);
  });
});

describe('memory and output bounds', () => {
  it('a 120 s stream that keeps playing holds no more than its unplayed audio', () => {
    const s = talk();
    s.start(1, R);
    let peak = 0;
    for (let i = 0; i < 120 * 25; i++) {
      expect(s.audio(1, i * 960, ramp(960, i * 960))).toBe('ok');
      for (let b = s.pull(4096, 48000); b; b = s.pull(4096, 48000)) s.played(b.id, b.frames);
      peak = Math.max(peak, s.heldSamples());
    }
    // One coalesced chunk still playing (at most COALESCE_MAX) plus the packet that just arrived.
    expect(peak).toBeLessThanOrEqual(COALESCE_MAX + 960);
  });

  it('one-sample packets coalesce: 9600 of them hold 2 chunks, 20k hold ceil(20000/4800), playback sample-exact', () => {
    const s = talk();
    s.start(1, R);
    for (let i = 0; i < 9600; i++) expect(s.audio(1, i, ramp(1, i))).toBe('ok');
    expect(s.heldChunks()).toBeLessThanOrEqual(2);
    for (let i = 9600; i < 20000; i++) expect(s.audio(1, i, ramp(1, i))).toBe('ok');
    expect(s.heldChunks()).toBeLessThanOrEqual(Math.ceil(20000 / COALESCE_MAX));
    expect(s.heldSamples()).toBe(20000);
    const got: number[] = [];
    for (let b = s.pull(4096, R); b; b = s.pull(4096, R)) { got.push(...Array.from(b.data, (v) => Math.round(v * 32768))); s.played(b.id, b.frames); }
    expect(got).toEqual(Array.from(ramp(19999)));
  });

  it('admission work is linear: 20k packets across gaps visit at most 2 chunks each to count unplayed audio', () => {
    const s = talk();
    s.start(1, R);
    s.start(2, R);
    for (let g = 0; g < MAX_GAPS; g++) s.audio(2, g * 2 + 1, ramp(1));
    const before = s.scanCount();
    for (let i = 0; i < 20000; i++) s.audio(1, i, ramp(1, i));
    // Two outputs per admission, each stopping at its first chunk not behind `played`: 2 visits, never a rescan.
    expect(s.scanCount() - before).toBeLessThanOrEqual(2 * 20000);
  });

  it('the running totals match a recount and held chunks stay bounded (random packets, gaps, reports)', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let run = 0; run < 200; run++) {
      const s = talk(), device = [24000, 44100, 48000, 16000][run % 4]!;
      s.start(1, R);
      const got: { at: number; n: number }[] = [];
      let next = 0, gaps = 0, rendered = 0;
      for (let k = 0; k < 200; k++) {
        const n = 1 + rnd(k % 7 === 0 ? 3000 : 40), at = next + (gaps < MAX_GAPS && rnd(9) === 0 ? (gaps++, 1 + rnd(50)) : 0);
        const r = s.audio(1, at, ramp(n, at));
        if (r === 'overflow') break;
        got.push({ at, n });
        next = at + n;
        const b = s.pull(1 + rnd(2000), device);
        if (b) { const f = rnd(3) ? b.frames : rnd(b.frames + 1); s.played(b.id, f); rendered = Math.max(rendered, b.cursor0); }
        // A recount over every packet received, against what the scheduler says it still owes.
        const played = (s as unknown as { outs: { played: number }[] }).outs[0]!.played;
        let owed = 0;
        for (const p of got) owed += Math.max(0, p.at + p.n - Math.max(p.at, played));
        expect(s.unplayedSeconds(), `run ${run} packet ${k}`).toBeCloseTo(owed / R, 9);
        expect(s.heldChunks()).toBeLessThanOrEqual(gaps + 2 + Math.ceil(owed / COALESCE_MAX) + 1);
      }
      expect(rendered).toBeGreaterThanOrEqual(0);
    }
  });

  it(`takes at most ${MAX_GAPS} gaps per output; the next is overflow`, () => {
    const s = talk();
    s.start(1, R);
    for (let g = 0; g < MAX_GAPS; g++) expect(s.audio(1, g * 2 + 1, ramp(1))).toBe('damaged');
    expect(s.audio(1, MAX_GAPS * 2 + 1, ramp(1))).toBe('overflow');
    expect(s.audio(1, MAX_GAPS * 2, ramp(1))).toBe('ok');
    expect(s.heldChunks()).toBe(MAX_GAPS);
  });

  it('a gap past the cap is refused exactly as the duration cap is: overflow, nothing queued, the output unchanged', () => {
    const refuse = (cause: 'gaps' | 'duration') => {
      const s = talk();
      s.start(1, R);
      if (cause === 'gaps') for (let g = 0; g < MAX_GAPS; g++) s.audio(1, g * 2 + 1, ramp(1));
      else s.audio(1, 0, ramp(R * BOUND_NO_LEAD_S - 10));
      const held = s.heldSamples(), unplayed = s.unplayedSeconds(), chunks = s.heldChunks();
      const r = cause === 'gaps' ? s.audio(1, 10 ** 6, ramp(1)) : s.audio(1, R * BOUND_NO_LEAD_S - 10, ramp(R));
      expect([s.heldSamples(), s.unplayedSeconds(), s.heldChunks()]).toEqual([held, unplayed, chunks]);
      // Contiguous audio is still taken afterwards: the refusal changed no state the caller must undo.
      return { r, after: s.audio(1, cause === 'gaps' ? MAX_GAPS * 2 : R * BOUND_NO_LEAD_S - 10, ramp(1)) };
    };
    expect(refuse('gaps')).toEqual({ r: 'overflow', after: 'ok' });
    expect(refuse('duration')).toEqual({ r: 'overflow', after: 'ok' });
  });

  it('owns its audio: a caller reusing its buffer changes nothing queued', () => {
    const s = talk();
    s.start(1, R);
    const buf = ramp(100);
    s.audio(1, 0, buf);
    buf.fill(0);
    s.end(1, 100);
    const b = s.pull(4096, R)!;
    expect(Math.round(b.data[50]! * 32768)).toBe(ramp(100)[50]);
  });

  it(`queues at most ${MAX_OUTPUTS} outputs; empty unfinished ones count`, () => {
    const s = talk();
    for (let i = 1; i <= MAX_OUTPUTS; i++) expect(s.start(i, R)).toBe(true);
    expect(s.start(MAX_OUTPUTS + 1, R)).toBe(false);
  });
});

describe('input checks', () => {
  it('refuses non-integer, out-of-range and non-finite numbers before any state changes', () => {
    const s = talk();
    for (const rate of [0, RATE_MIN - 1, RATE_MAX + 1, 0xffffffff, 24000.5, NaN, Infinity]) expect(s.start(1, rate), String(rate)).toBe(false);
    for (const out of [-1, 1.5, NaN]) expect(s.start(out, R)).toBe(false);
    expect(s.start(1, R)).toBe(true);
    for (const off of [NaN, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) expect(s.audio(1, off, ramp(10)), String(off)).toBe('invalid');
    expect(Number.isFinite(s.unplayedSeconds())).toBe(true);
    expect(s.audio(1, 0, ramp(R * (BOUND_NO_LEAD_S + 1)))).toBe('overflow');
    expect(s.end(1, NaN)).toBe('invalid');
    expect(s.end(1, -5)).toBe('invalid');
    expect(s.clip(ramp(100), 0xffffffff)).toBeNull();
    expect(s.pull(128, 0xffffffff)).toBeNull();
  });
});

describe('a contradictory output.end', () => {
  it('is reported, plays everything received, and never marks past the declared samples', () => {
    const s = talk();
    s.start(1, R);
    s.audio(1, 0, ramp(4800));
    expect(s.end(1, 100)).toBe('contradicts');
    let frames = 0;
    const marks: Mark[] = [];
    for (let b = s.pull(960, R); b; b = s.pull(960, R)) {
      frames += b.frames;
      s.played(b.id, b.frames);
      marks.push(...s.marks(1e9 + frames));
    }
    expect(frames).toBe(4800);
    expect(marks.at(-1)).toEqual({ out: 1, played_to: 100 });
    expect(marks.every((m) => m.played_to <= 100)).toBe(true);
  });
});

describe('downsampling across a gap', () => {
  it('a run that ends between device frames never jumps the audio after the gap (24 kHz on 8 kHz)', () => {
    const s = talk();
    for (let out = 1; out <= MAX_OUTPUTS; out++) {
      expect(s.start(out, R)).toBe(true);
      s.audio(out, 0, ramp(1));
      expect(s.audio(out, 2, ramp(1, 2))).toBe('damaged');
      s.end(out, 3);
      let src = 0;
      for (let b = s.pull(128, 8000); b; b = s.pull(128, 8000)) { src = Math.max(src, b.srcEnd); s.played(b.id, b.frames); }
      expect(src, `out ${out}`).toBe(3);
      s.marks(1e9 * out);
    }
    // Every output finished and left: none holds a slot.
    expect(s.start(MAX_OUTPUTS + 1, R)).toBe(true);
  });
});

describe('a gap learned after playback moved on', () => {
  it('plays the audio after the gap even when an open run was already pulled past it (48 kHz on 8 kHz)', () => {
    const s = talk();
    s.start(1, 48000);
    s.audio(1, 0, ramp(2));
    const first = s.pull(128, 8000)!;
    s.played(first.id, first.frames);
    // The open run's frame stepped six samples; the gap and the audio after it arrive only now.
    expect(s.audio(1, 3, ramp(1, 3))).toBe('damaged');
    s.end(1, 4);
    let src = 0;
    for (let b = s.pull(128, 8000); b; b = s.pull(128, 8000)) { src = Math.max(src, b.srcEnd); s.played(b.id, b.frames); }
    expect(src).toBe(4);
  });

  /** Pulls and fully reports every block; the highest source end handed over. */
  const play = (s: Scheduler) => {
    let src = 0;
    for (let b = s.pull(128, 8000); b; b = s.pull(128, 8000)) { src = Math.max(src, b.srcEnd); s.played(b.id, b.frames); }
    return src;
  };

  it('a contiguous tail after an open run was pulled past it still finishes the output', () => {
    const s = talk();
    s.start(1, 48000);
    s.audio(1, 0, ramp(2));
    const a = s.pull(128, 8000)!;
    s.played(a.id, a.frames);
    expect(s.audio(1, 2, ramp(4, 2))).toBe('ok');
    s.end(1, 6);
    play(s);
    expect(s.marks(1e9).at(-1)?.played_to).toBe(6);
    expect(s.heldSamples()).toBe(0);
    expect(s.start(2, 48000)).toBe(true);
  });

  for (const inFlight of [false, true]) {
    it(`the output does not finish before the audio after the gap plays (earlier block ${inFlight ? 'still in flight' : 'reported'})`, () => {
      const s = talk();
      s.start(1, 48000);
      s.audio(1, 0, ramp(2));
      const a = s.pull(128, 8000)!;
      if (!inFlight) s.played(a.id, a.frames);
      expect(s.audio(1, 3, ramp(1, 3))).toBe('damaged');
      s.end(1, 4);
      if (inFlight) s.played(a.id, a.frames);
      s.marks(1e9);
      expect(s.heldSamples()).toBe(1);
      expect(play(s)).toBe(4);
      expect(s.heldSamples()).toBe(0);
    });
  }

  for (const inFlight of [false, true]) {
    it(`a flush keeping the output replays the audio after a gap learned after the pull (earlier block ${inFlight ? 'still in flight' : 'reported'})`, () => {
      const s = talk();
      s.start(1, 24000);
      s.start(2, 48000);
      s.end(1, 0);
      s.audio(2, 0, ramp(2));
      const a = s.pull(128, 8000)!;
      if (!inFlight) s.played(a.id, a.frames);
      expect(s.audio(2, 3, ramp(1, 3))).toBe('damaged');
      s.end(2, 4);
      if (inFlight) s.played(a.id, a.frames);
      const b = s.pull(128, 8000)!;
      expect(b.srcEnd).toBe(4);
      s.flush(1);
      expect(play(s)).toBe(4);
      expect(s.heldSamples()).toBe(0);
    });
  }
});

describe('a partial flush at a fractional rate', () => {
  it('hands a kept output over again from its exact rendered position (24 kHz on 44.1 kHz)', () => {
    const s = talk();
    s.start(1, R);
    s.start(2, R);
    s.audio(1, 0, ramp(10));
    s.end(1, 10);
    s.audio(2, 0, ramp(4000));
    let b2 = s.pull(1024, 44100)!;
    for (; b2.out === 1; b2 = s.pull(1024, 44100)!) s.played(b2.id, b2.frames);
    expect(b2.out).toBe(2);
    s.played(b2.id, 128);
    s.flush(1);
    const again = s.pull(512, 44100)!;
    expect(again.out).toBe(2);
    expect(again.cursor0).toBeCloseTo((128 * R) / 44100, 6);
    expect(again.cursor0).not.toBe(69);
  });
});
