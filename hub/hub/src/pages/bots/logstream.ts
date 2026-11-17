// logstream.ts: the Bot log's stream as a waker.
//
// Contract:
//   - The agent's GET /bots/{id}/stream only wakes reads here: no frame's rows are shown from it. The log page (its rows,
//     seq cursor, older pages, the archive, a replay gap) stays the GET /bots/{id}/log read's alone.
//   - Every frame wakes one read of the log; a `state` frame (the Bot changed) wakes one read of the Bot view too. Reads
//     are coalesced per kind: at most one in flight and one more queued, however many frames arrive meanwhile.
//   - live(true) once the stream says it is open; live(false) whenever it is not (refused by the stream budget, cut,
//     failed, closed). The caller polls the log slowly while live and at its usual pace otherwise.
//   - A stream that ends without close() is opened again after 1, 2, 5, 10 s, then 10 s again; the count starts over
//     only after a connection stayed open for the longest delay (a frame does not reset it: the agent sends a state
//     frame on every open, so a stream cut right after it would reopen every second). A definite 4xx (not 408, 425 or
//     429) ends it for good: the caller's poll goes on. Each end also wakes one log read, so nothing written while it
//     was down waits for the next poll.
//   - close() closes the stream, cancels a pending reopen and a queued read, and reports nothing more.
import type { StreamState } from '@core';

export interface LogWakerDeps {
  /** Opens one stream connection; frames and states come back through the handlers. */
  open(h: { onEvent(name: string): void; onState(s: StreamState): void }): { close(): void };
  readLog(): Promise<unknown>;
  readView(): Promise<unknown>;
  onLive(live: boolean): void;
  delaysMs?: readonly number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  now?: () => number;
  clearTimer?: (t: unknown) => void;
}

export const LOG_WAKER_DELAYS: readonly number[] = [1000, 2000, 5000, 10000];

/** One read at a time: a wake while a read runs asks for exactly one more after it. stop() drops a queued read and every
 *  later wake (a read already running finishes). */
export function coalesced(read: () => Promise<unknown>): { wake(): void; stop(): void } {
  let running = false, again = false, stopped = false;
  const run = (): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    again = false;
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(read());
    } catch {
      p = Promise.resolve();
    }
    void p.catch(() => undefined).then(() => {
      running = false;
      if (again) run();
    });
  };
  return {
    wake: run,
    stop: () => {
      stopped = true;
      again = false;
    },
  };
}

const forGood = (s: StreamState): boolean =>
  s.state === 'error' && s.status >= 400 && s.status < 500 && s.status !== 408 && s.status !== 425 && s.status !== 429;

export function startLogWaker(d: LogWakerDeps): { close(): void } {
  const delays = d.delaysMs ?? LOG_WAKER_DELAYS;
  const setTimer = d.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = d.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const now = d.now ?? (() => Date.now());
  const logReads = coalesced(d.readLog), viewReads = coalesced(d.readView);
  const wakeLog = logReads.wake, wakeView = viewReads.wake;
  const steady = delays[delays.length - 1] ?? 10000;
  let closed = false, attempt = 0, live = false, timer: unknown = null, gen = 0;
  let conn: { close(): void } | null = null;
  const setLive = (v: boolean): void => {
    if (closed || v === live) return;
    live = v;
    d.onLive(v);
  };
  const connect = (): void => {
    timer = null;
    if (closed) return;
    const mine = ++gen;
    let ended = false, openedAt: number | null = null;
    const c = d.open({
      onEvent: (name) => {
        if (closed || ended || mine !== gen) return;
        wakeLog();
        if (name === 'state') wakeView();
      },
      onState: (s) => {
        if (closed || ended || mine !== gen) return;
        if (s.state === 'open') {
          openedAt = now();
          return setLive(true);
        }
        if (s.state === 'gap') {
          wakeLog();
          wakeView();
          return;
        }
        ended = true;
        conn = null;
        setLive(false);
        wakeLog();
        if (forGood(s)) return;
        if (openedAt !== null && now() - openedAt >= steady) attempt = 0;
        const ms = delays[Math.min(attempt, delays.length - 1)] ?? 10000;
        attempt += 1;
        timer = setTimer(connect, ms);
      },
    });
    if (!ended) conn = c;
  };
  connect();
  return {
    close() {
      if (closed) return;
      closed = true;
      logReads.stop();
      viewReads.stop();
      if (timer !== null) clearTimer(timer);
      timer = null;
      const c = conn;
      conn = null;
      c?.close();
    },
  };
}
