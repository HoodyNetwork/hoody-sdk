// socket.ts: one WebSocket to a computer's agent through a declared ws route.
//
// Contract:
//   - openSocket(route, input, handlers) → a handle {gen, send, close}. Only a ws route (routes.ts) that this file names
//     in SOCKETS is served; its entry fixes the subprotocol and whether refuse=frame is sent. Nothing else picks either.
//   - Admission is kit.ts admit's, reused: the host comes from the captured target only, `realm=` follows the route's realm
//     kind (agentRealm), only declared query keys go out (buildSocketRequest), the leg sets no header (the proxy cookie rides
//     along as a WebSocket's credentials do). admit gives an https: URL only; it goes out as wss:. A route with refuse=frame
//     always sends refuse=frame (a caller's other value refuses ROUTE_QUERY), so the agent's refusals are readable.
//   - Refused unsent (outcome not_sent {code}): an undeclared or non-ws route, a build or admission refusal, a framed page
//     (FRAMED_ACTION_REFUSED), a dead context (STALE), a transport without a socket leg (NO_SOCKET), a leg that throws
//     (SOCKET_REFUSED).
//   - A stream-budget slot (kind bot-voice, rank voice; stream-budget.ts) is taken BEFORE the socket opens: the leg is
//     called only from the budget's open(). A budget that has no slot for it reports degraded budget / locks: the outcome
//     is `budget` / `locks`, terminal (nothing was sent; the owner decides whether to try again). A slot cut later for a
//     better stream closes the socket with outcome `budget`.
//   - Outcomes, in order: `open {protocol}` at the first `session` text frame (the agent took the connection), then one
//     terminal outcome:
//       refused {code, status, details, retryAfterMs}: a `refused` text frame before `session` (refuse=frame); status is
//         the close code minus 4000 when that close is 4400..4599, else 0.
//       closed {code, reason}: a close after `session` other than 1006.
//       unknown {code}: a 1006 (a refused frame before it included), or a close before `session` without a refused frame (the agent may have acted).
//       stale: the context died after the call (the socket, if any, is closed).
//     Every other outcome is terminal too (not_sent, budget, locks). Terminal outcomes arrive on a microtask, never before
//     openSocket() returned; then the slot is freed. Nothing is ever retried here: retryAfterMs (from retry_after_secs, at
//     most a day, else null) is reported only.
//   - Frames pass through raw: text frames to onText as strings, binary frames to onBinary as ArrayBuffers. Only the frames
//     before `session` are read, and only for their `type` (session or refused); a refused frame is not passed on.
//   - Every call has its own generation (gen): the leg's events reach the handlers only while that call is live (no
//     terminal outcome, no close()); later ones are dropped. A dead context found at any event ends the call as `stale`.
//   - close(code?, reason?) by the owner closes the socket, releases the slot's watch at once (the budget frees the lock
//     as its release settles) and delivers nothing more.
import { alive, capture, onBump, type Ctx, type Target } from './ctx';
import { admit, agentRealm } from './kit';
import { buildSocketRequest, defineRoute, isDeclared, type Route } from './routes';
import { isFramed } from './session';
import { isPlainRecord } from './shape';
import { streamBudget, type StreamBudget } from './stream-budget';
import { streamComputer } from './stream-live';
import { transport, type SocketLike } from './transport';

/** GET /bots/{id}/voice (agent getBotVoice): the Bot's voice WebSocket, subprotocol hoody.voice.v1. The query keys are the
 *  published ones; refuse is always frame. */
export const botVoiceRoute = defineRoute({
  method: 'GET', path: '/bots/:id/voice', scope: 'agent', realm: 'bot', ws: true,
  query: ['in_rate', 'out_rate', 'in_format', 'mode', 'voice', 'language', 'speak_wakes', 'takeover', 'speak', 'refuse', 'play_lead', 'require'],
});

interface SocketRule { readonly protocol: string; readonly refuseFrame: boolean }
const SOCKETS = new Map<Route, SocketRule>([[botVoiceRoute, Object.freeze({ protocol: 'hoody.voice.v1', refuseFrame: true })]]);

export type SocketOutcome =
  | { kind: 'not_sent'; code: string }
  | { kind: 'budget' }
  | { kind: 'locks' }
  | { kind: 'open'; protocol: string }
  | { kind: 'refused'; code: string | null; status: number; details: Record<string, unknown> | null; retryAfterMs: number | null }
  | { kind: 'closed'; code: number; reason: string }
  | { kind: 'unknown'; code: number }
  | { kind: 'stale' };

export interface SocketHandlers {
  onOutcome(o: SocketOutcome): void;
  onText?(text: string): void;
  onBinary?(data: ArrayBuffer): void;
}

export interface SocketInput {
  params?: Readonly<Record<string, string | number>>;
  query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /** The context the socket belongs to (default: captured now). */
  ctx?: Ctx;
  /** The computer (default: the context's). */
  target?: Target | null;
  /** The realm to send (default: the context's realm, or the token pin). */
  realm?: string;
  guardCtx?: unknown;
}

export interface HubSocket {
  readonly gen: number;
  /** Hands one frame to the socket; false when it is not open or the call ended. */
  send(data: string | ArrayBuffer | ArrayBufferView<ArrayBuffer>): boolean;
  close(code?: number, reason?: string): void;
}

const REFUSED_MAX = 65536;
const RETRY_MAX_SECS = 86400;
let gens = 0;
const live = new Set<{ alive: () => boolean; stale: () => void }>();
onBump(() => { for (const e of [...live]) if (!e.alive()) e.stale(); });

function refusedFrame(text: string): { code: string | null; details: Record<string, unknown> | null; retryAfterMs: number | null } | 'session' | null {
  if (text.length > REFUSED_MAX || text.charAt(0) !== '{') return null;
  let d: unknown;
  try { d = JSON.parse(text); } catch { return null; }
  if (!isPlainRecord(d)) return null;
  if (d.type === 'session') return 'session';
  if (d.type !== 'refused') return null;
  const c = d.code, ra = d.retry_after_secs;
  return {
    code: typeof c === 'string' && c.length <= 64 ? c : null,
    details: isPlainRecord(d.details) ? d.details : null,
    retryAfterMs: typeof ra === 'number' && Number.isFinite(ra) && ra >= 0 && ra <= RETRY_MAX_SECS ? Math.round(ra * 1000) : null,
  };
}

/** One WebSocket through a declared ws route (see the contract). */
export function openSocket(route: Route, input: SocketInput, handlers: SocketHandlers, budget: StreamBudget = streamBudget()): HubSocket {
  const gen = ++gens;
  const ctx = input.ctx || capture(input.target);
  let done = false, closedByOwner = false, sock: SocketLike | null = null, sockOpen = false, session = false;
  let refusal: { code: string | null; details: Record<string, unknown> | null; retryAfterMs: number | null } | null = null;
  let w: { release(): void } | null = null;
  const entry = { alive: () => alive(ctx), stale: () => finish({ kind: 'stale' }) };
  const call = <A extends unknown[]>(fn: ((...a: A) => void) | undefined, ...a: A) => {
    if (typeof fn === 'function') { try { fn.apply(handlers, a); } catch { /* the caller's */ } }
  };
  function finish(o: SocketOutcome) {
    if (done) return;
    done = true;
    live.delete(entry);
    const s = sock;
    sock = null;
    if (s) { try { s.close(1000); } catch { /* closed already */ } }
    queueMicrotask(() => {
      if (!closedByOwner) call(handlers.onOutcome, o);
      w?.release();
    });
  }
  const handle: HubSocket = {
    gen,
    send(d) {
      if (done || !sock || !sockOpen) return false;
      if (!alive(ctx)) { finish({ kind: 'stale' }); return false; }
      try { return sock.send(d) === true; } catch { return false; }
    },
    close(code = 1000, reason = '') {
      if (done) { closedByOwner = true; return; }
      closedByOwner = true;
      done = true;
      live.delete(entry);
      const s = sock;
      sock = null;
      if (s) { try { s.close(code, reason); } catch { /* closed already */ } }
      w?.release();
    },
  };
  const rule = isDeclared(route) && route.ws ? SOCKETS.get(route) : undefined;
  const refuse = (code: string): HubSocket => { finish({ kind: 'not_sent', code }); return handle; };
  if (!rule) return refuse('ROUTE_NOT_ALLOWED');
  const q = input.query ?? {};
  if (rule.refuseFrame && q.refuse !== undefined && q.refuse !== null && q.refuse !== 'frame') return refuse('ROUTE_QUERY');
  const built = buildSocketRequest(route, { params: input.params, query: rule.refuseFrame ? { ...q, refuse: 'frame' } : q });
  if ('refused' in built) return refuse(built.refused);
  const target = input.target || ctx.target;
  const plan = admit(route, built, { target, realm: agentRealm(route, input.realm, ctx), guardCtx: input.guardCtx });
  if ('refused' in plan) return refuse(plan.refused);
  if (isFramed()) return refuse('FRAMED_ACTION_REFUSED');
  if (!alive(ctx)) return refuse('STALE');
  if (plan.url.indexOf('https://') !== 0) return refuse('NO_AGENT_URL');
  const leg = transport();
  if (typeof leg.socket !== 'function') return refuse('NO_SOCKET');
  const url = 'wss://' + plan.url.slice('https://'.length);
  live.add(entry);
  w = budget.watch({
    computer: streamComputer(plan.meta.target), key: `${built.path}#${gen}`, kind: 'bot-voice', level: 'stream', rank: 'voice',
    open() {
      if (done) return null;
      if (!alive(ctx)) { finish({ kind: 'stale' }); return null; }
      const mine = () => !done && alive(ctx);
      try {
        const s = (leg.socket as NonNullable<typeof leg.socket>)(url, [rule.protocol], plan.meta, {
          open() {
            if (!done && !alive(ctx)) { finish({ kind: 'stale' }); return; }
            if (mine()) sockOpen = true;
          },
          message(d) {
            if (done) return;
            if (!alive(ctx)) { finish({ kind: 'stale' }); return; }
            if (typeof d !== 'string') { call(handlers.onBinary, d); return; }
            if (!session) {
              if (refusal) return;
              const r = refusedFrame(d);
              if (r === 'session') { session = true; call(handlers.onOutcome, { kind: 'open', protocol: rule.protocol }); }
              else if (r) { refusal = r; return; }
            }
            if (mine()) call(handlers.onText, d);
          },
          close(code, reason) {
            if (done) return;
            sock = null;
            if (!alive(ctx)) { finish({ kind: 'stale' }); return; }
            // A 1006 is unknown even after a refused frame: the contract's one rule for an abnormal close.
            if (code === 1006) finish({ kind: 'unknown', code });
            else if (refusal) finish({ kind: 'refused', code: refusal.code, status: code >= 4400 && code <= 4599 ? code - 4000 : 0, details: refusal.details, retryAfterMs: refusal.retryAfterMs });
            else if (!session) finish({ kind: 'unknown', code });
            else finish({ kind: 'closed', code, reason: typeof reason === 'string' ? reason : '' });
          },
        });
        // A leg that ended the call while opening (a synchronous close) leaves nothing held.
        if (done) { try { s.close(1000); } catch { /* closed already */ } } else sock = s;
      } catch {
        finish({ kind: 'not_sent', code: 'SOCKET_REFUSED' });
        return null;
      }
      return { close: () => finish({ kind: 'budget' }) };
    },
    onMode(m) {
      if (!sock && m.mode === 'degraded' && (m.why === 'budget' || m.why === 'locks')) finish({ kind: m.why });
    },
  });
  return handle;
}
