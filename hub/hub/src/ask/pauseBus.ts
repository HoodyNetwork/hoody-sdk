// pauseBus.ts: event.pause_state from an open session's stream, handed to whoever shows the computer's pause.
// The pause is daemon-wide, so any open session of a computer carries the computer's state: the
// stream tee (data.ts liveIO.stream) publishes it here by container id, and the AI pane applies it to that computer's PauseStore
// (the store drops a state older than the one it holds, so a replayed, duplicate or late event changes nothing).
// Nothing here can throw into a stream: a payload that is not a pause state is dropped.
import { agent } from '@core';

type Listener = (s: agent.PauseState) => void;
/** One subscription. The set holds entries, not callbacks: the same callback subscribed twice is two subscriptions. */
interface Sub { readonly fn: Listener }
const listeners = new Map<string, Set<Sub>>();

/** Tells `fn` every pause state published for the computer `container`, until the returned unsubscribe. The unsubscribe removes
 *  this subscription only (idempotent: a second call does nothing, and never removes a later subscription of the same callback). */
export function subscribePause(container: string, fn: Listener): () => void {
  const sub: Sub = { fn };
  let set = listeners.get(container);
  if (!set) { set = new Set(); listeners.set(container, set); }
  set.add(sub);
  return () => {
    const cur = listeners.get(container);
    if (!cur) return;
    cur.delete(sub);
    if (cur.size === 0) listeners.delete(container);
  };
}

/** One stream frame (its unparsed data line): a pause_state event is published for `container`, anything else is ignored. */
export function publishPauseFrame(container: string, name: string, raw: string): void {
  if (name !== 'pause_state') return;
  try {
    const d: unknown = JSON.parse(raw);
    const ev = d && typeof d === 'object' && !Array.isArray(d) ? (d as { event?: unknown }).event : null;
    const data = ev && typeof ev === 'object' && !Array.isArray(ev) ? (ev as { data?: unknown }).data : null;
    const s = agent.pauseOfEvent(data);
    if (!s) return;
    for (const sub of [...(listeners.get(container) ?? [])]) { try { sub.fn(s); } catch { /* a listener's */ } }
  } catch { /* not JSON: not a pause state */ }
}

/** Tests only. */
export function resetPauseBusForTests(): void { listeners.clear(); }
/** Tests only: how many computers have a subscriber. */
export function pauseBusComputersForTests(): number { return listeners.size; }
