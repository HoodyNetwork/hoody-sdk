// What the pipe's ?progress events say about this broadcast (pure).
//
// Contract, in plain words:
//   - The events are the pipe's: `state` {state, hasSender, activeReceivers, live?}, `progress` {activeReceivers,
//     elapsed (s), live?} and `done` {state, reason?, transferId}. Anything else, or unparsable data, changes nothing.
//   - live: a `state` of `streaming` with live:true, or any live `progress`. Before that the stream is not shown
//     as live, whatever the upload does.
//   - viewers: the pipe's activeReceivers while the event stream is open; null while it is not (closed, retrying),
//     never 0 for "unknown". since: when streaming began, from the pipe's own elapsed when it gives one.
//   - done: only a `done` for this broadcast's transfer id ends it (with the pipe's reason); another transfer's is
//     ignored.
export interface LiveStatus {
  readonly live: boolean;
  readonly viewers: number | null;
  readonly since: number | null;
  readonly done: { readonly failed: boolean; readonly reason: string } | null;
}

export const initialStatus: LiveStatus = Object.freeze({ live: false, viewers: null, since: null, done: null });

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

export function onProgressEvent(s: LiveStatus, name: string, data: string, transferId: string, now: number): LiveStatus {
  let d: Record<string, unknown> | null;
  try { d = obj(JSON.parse(data)); } catch { d = null; }
  if (!d || s.done) return s;
  if (name === 'done') {
    if (d.transferId !== transferId) return s;
    return { ...s, live: false, done: { failed: d.state !== 'complete', reason: typeof d.reason === 'string' ? d.reason.slice(0, 200) : '' } };
  }
  const viewers = count(d.activeReceivers);
  if (name === 'state') {
    const live = d.state === 'streaming' && d.live === true;
    return { ...s, live: s.live || live, viewers: viewers ?? s.viewers, since: live && s.since === null ? now : s.since };
  }
  if (name === 'progress' && d.live === true) {
    const el = typeof d.elapsed === 'number' && Number.isFinite(d.elapsed) && d.elapsed >= 0 ? d.elapsed : null;
    return { ...s, live: true, viewers: viewers ?? s.viewers, since: el !== null ? now - el * 1000 : s.since ?? now };
  }
  return s;
}

/** The event stream closed or is retrying: the viewer count is unknown until it is open again. */
export const viewersUnknown = (s: LiveStatus): LiveStatus => (s.viewers === null ? s : { ...s, viewers: null });
