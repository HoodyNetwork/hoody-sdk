// stream-resume.ts: a stream that comes back. kit-io's stream() never reconnects (its contract is unchanged); this wraps
// it for the callers that want to stay live.
//
// Contract:
//   - resumableStream(route, input): opens stream(route, ...) and, when it ends without being asked to, opens it again
//     with the cursor of the last frame: `since` = the last frame's id and `incarnation` = the last one seen (the agent
//     takes ?since as its Last-Event-ID alias, so no header is needed). The query key names are input.keys
//     (default since / incarnation; a tail with no incarnation passes {since: 'since_seq'}); input.from is the cursor a
//     page already holds.
//   - Backoff: 1, 2, 5, 10 s, then 10 s again (input.delaysMs). A 5xx/408/425/429 answer waits the longer of that and
//     its Retry-After (at most 60 s). The count starts over once a frame was delivered or a connection stayed open for
//     the last delay. A byte-budget cut and the hidden pause are not failures: the first reconnects at once, the
//     second waits for the page to be visible. The hidden pause is one clock across attempts: a page hidden for 60 s
//     stops trying even when every attempt failed in between.
//   - Ends for good (closed): the caller's close() or signal, a dead context (aborted, seen at any time, also while paused or waiting), 401/403 (denied), any other
//     4xx, a redirect or a non-SSE answer (failed, with status and code), a refusal on a later open (refused).
//   - Resync: the stream cannot say what it missed in two cases, and the caller then reads replay, transcript and
//     state itself. onResync('replay_gap') on a `lagged` frame with code replay_gap; onResync('incarnation') when a
//     frame names another incarnation than the cursor's. At most once per connection, before that frame is delivered.
//     After either, ids are not compared with the old cursor (the ring replays from its own start).
//   - Dedupe: inside one incarnation a frame whose numeric id is not above the last one is dropped.
//   - States: connecting, open, gap {frame_too_large} (kit-io's), reconnecting {attempt, inMs, cause, status?, code?}
//     (no live stream until the next open: the keep-alive lease rule reads this), paused {hidden}, closed {reason}.
//   - The incarnation is read from the first 512 characters of a frame's data (the agent's envelope and its
//     replay_boundary frame lead with it); a frame without one changes nothing.
import { alive, capture, onBump } from './ctx';
import { hostEnv } from './host-env';
import { stream, type StreamInput, type StreamState } from './kit-io';
import type { Route } from './routes';

const DELAYS = [1000, 2000, 5000, 10000] as const;
const RETRY_AFTER_CAP = 60000;
const HIDDEN_MS = 60000;
const INC = /"incarnation"\s*:\s*"([^"\\]{1,64})"/;

export type Resync = 'replay_gap' | 'incarnation';
export interface ResumeCursor { since: string | undefined; incarnation: string | undefined }
export type ResumeState =
  | { state: 'connecting' }
  | { state: 'open' }
  | { state: 'gap'; reason: 'frame_too_large' }
  | { state: 'reconnecting'; attempt: number; inMs: number; cause: 'network' | 'server' | 'status'; status?: number; code?: string | null }
  | { state: 'paused'; reason: 'hidden' }
  | { state: 'closed'; reason: 'aborted' | 'denied' | 'failed' | 'refused'; status?: number; code?: string | null };

export interface ResumeInput extends Omit<StreamInput, 'onEvent' | 'onState'> {
  onEvent: (name: string, data: string, id: string | undefined) => void;
  onState?: (s: ResumeState) => void;
  onResync?: (why: Resync, cursor: ResumeCursor) => void;
  /** The query keys that carry the cursor. */
  keys?: { since: string; incarnation?: string | null };
  /** The cursor the caller already holds. */
  from?: { since?: string; incarnation?: string };
  delaysMs?: readonly number[];
}

export interface Resumable { refused?: string; close: () => void; cursor: () => ResumeCursor }

const numeric = (s: string | undefined): number | null => (s !== undefined && /^\d{1,15}$/.test(s) ? Number(s) : null);

export function resumableStream(route: Route, input: ResumeInput): Resumable {
  const keys = { since: input.keys?.since ?? 'since', incarnation: input.keys && 'incarnation' in input.keys ? input.keys.incarnation ?? null : 'incarnation' };
  const delays = input.delaysMs && input.delaysMs.length ? input.delaysMs : DELAYS;
  const ctx = input.ctx || capture(input.target);
  let lastId: string | undefined = input.from?.since;
  let inc: string | undefined = input.from?.incarnation;
  let compare = true; // ids are compared with lastId; off after a gap until the next id
  let ended = false, attempt = 0, inner: { close: () => void } | null = null, wait: ReturnType<typeof setTimeout> | null = null;
  let openedAt = 0, resynced = false, lastErr: { status: number; code: string | null; retryAfterMs: number | null } | null = null;
  let paused = false, cur = 0, hideTimer: ReturnType<typeof setTimeout> | null = null, offBump: (() => void) | null = null, offVis: (() => void) | null = null;

  const state = (s: ResumeState) => { if (typeof input.onState === 'function') { try { input.onState(s); } catch { /* the caller's */ } } };
  function finish(s: Extract<ResumeState, { state: 'closed' }>) {
    if (ended) return;
    ended = true;
    teardown();
    const i = inner;
    inner = null;
    if (i) { try { i.close(); } catch { /* done */ } }
    state(s);
  }
  function teardown() {
    if (wait) clearTimeout(wait);
    wait = null;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (offVis) offVis();
    offVis = null;
    input.signal?.removeEventListener('abort', onAbort);
    if (offBump) offBump();
    offBump = null;
  }
  function onAbort() { finish({ state: 'closed', reason: 'aborted' }); }
  // The hidden clock runs across attempts: the inner stream's own timer restarts with every attempt, so a page whose
  // attempts keep failing would never reach it.
  function pause() {
    if (ended || paused) return;
    paused = true;
    cur++;
    if (wait) clearTimeout(wait);
    wait = null;
    const i = inner;
    inner = null;
    if (i) { try { i.close(); } catch { /* done */ } }
    state({ state: 'paused', reason: 'hidden' });
  }
  function reconnect() {
    const why = connect();
    if (why) finish({ state: 'closed', reason: why === 'STALE' || why === 'ABORTED' ? 'aborted' : 'refused', code: why });
  }
  function onVis() {
    if (ended) return;
    if (!hostEnv().visible()) {
      if (!hideTimer && !paused) hideTimer = setTimeout(() => { hideTimer = null; if (!hostEnv().visible()) pause(); }, HIDDEN_MS);
      return;
    }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (!paused) return;
    paused = false;
    reconnect();
  }

  function query(): Record<string, string | number | boolean | null | undefined> {
    const q: Record<string, string | number | boolean | null | undefined> = { ...(input.query || {}) };
    if (lastId !== undefined) q[keys.since] = lastId;
    if (keys.incarnation && inc !== undefined) q[keys.incarnation] = inc;
    return q;
  }
  function resync(why: Resync) {
    if (resynced) return;
    resynced = true;
    if (typeof input.onResync === 'function') { try { input.onResync(why, { since: lastId, incarnation: inc }); } catch { /* the caller's */ } }
  }
  function onEvent(name: string, data: string, id: string | undefined) {
    if (ended) return;
    attempt = 0;
    if (name === 'lagged') {
      let code = '';
      try { const d = JSON.parse(data) as { code?: unknown }; code = typeof d.code === 'string' ? d.code : ''; } catch { code = ''; }
      if (code === 'replay_gap') { resync('replay_gap'); compare = false; }
    } else {
      const m = INC.exec(data.length > 512 ? data.slice(0, 512) : data);
      if (m && keys.incarnation) {
        const next = m[1]!;
        if (inc !== undefined && inc !== next) { resync('incarnation'); compare = false; lastId = undefined; }
        inc = next;
      }
    }
    if (ended) return;
    if (id !== undefined) {
      const n = numeric(id), p = numeric(lastId);
      if (compare && n !== null && p !== null && n <= p) return;
      lastId = id;
      compare = true;
    }
    input.onEvent(name, data, id);
  }

  function backoff(cause: 'network' | 'server' | 'status') {
    if (ended) return;
    if (openedAt && Date.now() - openedAt >= (delays[delays.length - 1] as number)) attempt = 0;
    attempt++;
    let ms = delays[Math.min(attempt, delays.length) - 1] as number;
    const e = lastErr;
    if (cause === 'status' && e && e.retryAfterMs !== null) ms = Math.max(ms, Math.min(e.retryAfterMs, RETRY_AFTER_CAP));
    state({ state: 'reconnecting', attempt, inMs: ms, cause, ...(e && cause === 'status' ? { status: e.status, code: e.code } : {}) });
    if (ended || paused || wait) return; // the caller's state callback may have closed it
    wait = setTimeout(() => { wait = null; reconnect(); }, ms);
  }

  function onInner(s: StreamState, g: number) {
    if (ended || g !== cur) return;
    if (s.state === 'open') { openedAt = Date.now(); state({ state: 'open' }); return; }
    if (s.state === 'gap') { state(s); return; }
    if (s.state === 'error') { lastErr = { status: s.status, code: s.code, retryAfterMs: s.retryAfterMs }; return; }
    inner = null;
    const err = lastErr;
    switch (s.reason) {
      case 'aborted': return finish({ state: 'closed', reason: 'aborted' });
      case 'denied': return finish({ state: 'closed', reason: 'denied', ...(err ? { status: err.status, code: err.code } : {}) });
      case 'hidden':
        // the page's own hide timer normally pauses first; a throttled or reordered timer can end the inner stream while the page
        // is visible again, so the else branch is a backstop that reopens
        if (!hostEnv().visible()) pause(); else reconnect();
        return;
      case 'budget': return reconnect();
      default:
        if (err) {
          const retry = err.status >= 500 || err.status === 429 || err.status === 408 || err.status === 425;
          if (!retry) return finish({ state: 'closed', reason: 'failed', status: err.status, code: err.code });
          return backoff('status');
        }
        return backoff(s.reason === 'network' ? 'network' : 'server');
    }
  }

  function connect(): string | undefined {
    if (ended) return undefined;
    if (input.signal?.aborted) return 'ABORTED';
    lastErr = null; resynced = false; openedAt = 0;
    state({ state: 'connecting' });
    if (ended) return undefined; // the caller's state callback closed it
    const g = ++cur;
    const h = stream(route, { ...input, ctx, query: query(), onEvent, onState: (s) => onInner(s, g), signal: undefined });
    if (h.refused) { inner = null; return h.refused; }
    inner = h;
    return undefined;
  }

  const liveCtx = () => alive(ctx);
  offVis = hostEnv().onVisibilityChange(onVis);
  input.signal?.addEventListener('abort', onAbort);
  offBump = onBump(() => { if (!ended && !liveCtx()) finish({ state: 'closed', reason: 'aborted' }); });
  onVis();
  const why = typeof input.onEvent !== 'function' ? 'HANDLER_MISSING' : connect();
  if (why) { teardown(); ended = true; return { refused: why, close: () => {}, cursor: () => ({ since: lastId, incarnation: inc }) }; }
  return { close: onAbort, cursor: () => ({ since: lastId, incarnation: inc }) };
}
