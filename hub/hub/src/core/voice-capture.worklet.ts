// core/voice-capture.worklet.ts: the Talk capture worklet (kit/voice/capture.ts). It lives in core, beside
// upload.worker.ts, because it runs only in the AudioWorklet global, loaded by URL, never as a page module. It posts
// the first input channel in ~20 ms batches to the main thread (capture.ts). It renders nothing (no outputs) and keeps
// no state beyond the batch being filled. Budget: <= 4 KB.
export {};
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; }

class HoodyCapture extends AudioWorkletProcessor {
  private buf: Float32Array;
  private n = 0;
  private live = true;
  constructor() {
    super();
    this.buf = new Float32Array(Math.max(128, Math.round(sampleRate / 50)));
    this.port.onmessage = (e: MessageEvent<{ type?: string }>) => { if (e.data?.type === 'stop') this.live = false; };
  }
  process(inputs: Float32Array[][]): boolean {
    if (!this.live) return false;
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const take = Math.min(ch.length - i, this.buf.length - this.n);
      this.buf.set(ch.subarray(i, i + take), this.n);
      this.n += take;
      i += take;
      if (this.n === this.buf.length) {
        // The transfer detaches data (its length reads 0 after): size the next batch before posting.
        const data = this.buf, len = data.length;
        this.buf = new Float32Array(len);
        this.n = 0;
        this.port.postMessage({ type: 'input', data }, [data.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('hoody-capture', HoodyCapture);
