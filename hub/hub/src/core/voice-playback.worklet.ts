// core/voice-playback.worklet.ts: the page's playback worklet (kit/voice/scheduler.ts, audio.ts). It lives in core,
// beside upload.worker.ts, because it runs only in the AudioWorklet global, loaded by URL, never as a page module. It
// plays the blocks scheduler.ts hands over, in order, and reports how many frames of each it rendered (`played`,
// cumulative per block, once per render quantum that advanced). An empty queue renders silence that is never reported
// (underrun silence is not playback). `flush` drops every block and answers `flushed` after a final report, so the
// scheduler marks only what was rendered. Budget: <= 4 KB.
export {};
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; }

interface B { id: number; data: Float32Array; at: number }
type In = { type: 'block'; id: number; data: Float32Array } | { type: 'flush'; seq: number };

class HoodyPlayback extends AudioWorkletProcessor {
  private q: B[] = [];
  private needed = false;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<In>) => {
      const m = e.data;
      if (m?.type === 'block' && m.data instanceof Float32Array && m.data.length) { this.q.push({ id: m.id, data: m.data, at: 0 }); this.needed = false; }
      else if (m?.type === 'flush') { this.q = []; this.port.postMessage({ type: 'flushed', seq: m.seq }); }
    };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out?.length) return true;
    const len = out[0]!.length;
    let w = 0;
    while (w < len && this.q.length) {
      const b = this.q[0]!;
      const take = Math.min(len - w, b.data.length - b.at);
      for (const ch of out) ch.set(b.data.subarray(b.at, b.at + take), w);
      b.at += take;
      w += take;
      this.port.postMessage({ type: 'played', id: b.id, frames: b.at });
      if (b.at === b.data.length) this.q.shift();
    }
    for (const ch of out) ch.fill(0, w);
    if (!this.q.length && !this.needed) { this.needed = true; this.port.postMessage({ type: 'need' }); }
    return true;
  }
}
registerProcessor('hoody-playback', HoodyPlayback);
