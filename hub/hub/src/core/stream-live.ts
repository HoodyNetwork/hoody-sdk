// stream-live.ts: kit-io's stream() behind the stream budget, for the callers that
// keep their own reconnect and cursor logic (Ask, the GitHub run follower, the Scripts writer's wait).
//
// Contract:
//   - budgetedStream(route, input, {key, rank?}) has stream()'s shape and meaning: one connection, never reconnected
//     here, the same onEvent / onState. It differs in one thing: the connection opens only when the budget gives this
//     browser a slot on the computer (core/stream-budget.ts), so the open is asynchronous.
//   - A caller never waits for a slot it was refused: when the budget has none for it (budget: the 8 are in use by
//     better streams; locks: another tab holds them), or cuts the stream later for a better one, the caller gets ONE
//     terminal state, `error {status: 0, code: 'budget' | 'locks'}` for a refusal and kit-io's own `closed` for a cut,
//     exactly where a failed or dropped connection would have said so. The caller then does what it does for a lost
//     stream (read state, retry with its own cursor and backoff). Nothing is reopened here: a reopen would carry the
//     old cursor.
//   - The terminal state is delivered on a microtask, never before budgetedStream() has returned (a refusal can be known
//     synchronously, and a caller that closes "its stream" from its handler must already hold the handle). The first
//     terminal state wins and is the caller's exactly as the stream or the budget produced it: the cleanup that
//     follows (ending the grant closes the connection, which reports `closed`) cannot replace it.
//   - After its terminal state (or close()) the watch is released at once, so the slot is free for the next stream.
//   - setRank(r) moves the stream's budget rank in place: no reconnect, the next budget decision
//     sees it. The rank it already has, or a stream ended or closed, sends nothing.
//   - A refusal by stream() itself (an undeclared route, a dead context) arrives the same way, as error {code: <refusal>}.
//   - One connection per call: the budget entry is named by (computer, 'session', key + a call counter), so two
//     callers on the same session never share a connection (and never lose frames to each other's handler).
//   - The computer is the budget's name of the target the request goes to: project id / container id.
import { capture, type Target } from './ctx';
import { stream, type StreamInput, type StreamState } from './kit-io';
import type { Route } from './routes';
import { streamBudget, type Rank, type StreamBudget, type Watch } from './stream-budget';

export interface LiveOptions {
  /** What the stream follows, unique within the computer for its kind (a session id with its realm). */
  key: string;
  /** Default `visible`. */
  rank?: Rank;
}

/** How the budget names a computer: the target the request goes to. */
export function streamComputer(t: Target | null | undefined): string {
  return t ? `${t.project.id}/${t.container.id}` : 'unknown';
}

let calls = 0;

/** A budgeted stream: `close()`, and `setRank(r)`, which moves the stream's budget rank in place (no reconnect). setRank to
 *  the rank it has, or after the stream ended or was closed, does nothing. */
export interface RankedStream { close(): void; setRank(r: Rank): void }

export function budgetedStream(route: Route, input: StreamInput, o: LiveOptions, budget: StreamBudget = streamBudget()): RankedStream {
  const ctx = input.ctx || capture(input.target);
  const computer = streamComputer(input.target || ctx.target);
  let finished = false, closedByCaller = false, w: Watch | null = null, rank: Rank = o.rank ?? 'visible';
  const finish = (s: StreamState) => {
    if (finished) return;
    finished = true;
    // The caller hears it after it holds the handle (and not at all when it closed the call meanwhile); then the slot goes back.
    queueMicrotask(() => {
      if (!closedByCaller && typeof input.onState === 'function') { try { input.onState(s); } catch { /* the caller's */ } }
      w?.release();
    });
  };
  const refusal = (code: string): StreamState => ({ state: 'error', status: 0, code, retryAfterMs: null, retryAfter: null });
  w = budget.watch({
    computer, key: `${o.key}#${++calls}`, kind: 'session', level: 'stream', rank,
    open(g) {
      const h = stream(route, {
        ...input, ctx,
        onState: (s) => {
          if (finished) return;
          if (s.state === 'open') g.live(true);
          if (s.state === 'error' || s.state === 'closed') { finish(s); g.ended(); return; }
          if (typeof input.onState === 'function') { try { input.onState(s); } catch { /* the caller's */ } }
        },
      });
      if (h.refused) { finish(refusal(h.refused)); g.ended(); return null; }
      return h;
    },
    onMode(m) {
      if (m.mode === 'degraded' && (m.why === 'budget' || m.why === 'locks')) finish(refusal(m.why));
    },
  });
  return {
    close() {
      closedByCaller = true;
      if (finished) return;
      finished = true;
      w?.release();
    },
    setRank(r) {
      if (finished || closedByCaller || r === rank) return;
      rank = r;
      w?.set('stream', r);
    },
  };
}
