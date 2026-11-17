// The worker of secrets.ts responderScan: one fixtures module, loaded in this thread's own module graph, every
// responder called once; the needles go back, nothing else does (no text of an error: it may hold an answer).
import './netns-first'; // an entry like any other (netns.term.test.ts 'every entry'); a worker is already inside
import type { Needle } from './secrets';

declare const self: { onmessage: ((e: { data: { file: string } }) => void) | null; postMessage: (m: { ok: boolean; needles?: Needle[] }) => void };

self.onmessage = (e) => {
  void (async () => {
    try {
      const { responderScanHere } = await import('./secrets');
      self.postMessage({ ok: true, needles: await responderScanHere(e.data.file) });
    } catch { self.postMessage({ ok: false }); }
  })();
};
