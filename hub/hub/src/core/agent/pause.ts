// The agent's daemon-wide pause: GET and PUT /pause. Two declared routes and one
// settled Api. The pause is process-wide: the routes take no realm and no cwd (core's process-wide class), so the
// state is the computer's, not the realm's. Pausing holds each session at its next step; nothing is cancelled.
// Reads are always fresh. The PUT is idempotent by state (the agent answers the state already in force with the
// same gen), and it is sent once: a lost answer is pending, and GET /pause says what is in force.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';

export const pauseRoutes = {
  get: defineRoute({ method: 'GET', path: '/pause', scope: 'agent', timeoutMs: 20000 }),
  set: defineRoute<unknown, { paused: boolean }>({ method: 'PUT', path: '/pause', scope: 'agent', body: ['paused'] }),
} as const;

export interface PauseApi {
  get(): Promise<Settled<unknown>>;
  set(paused: boolean): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function pauseApi(target?: Target): PauseApi {
  const send = (route: Route, input: CallInput, change: boolean) => call(route, target ? { ...input, target } : input, change);
  return {
    get: () => send(pauseRoutes.get as Route, {}, false),
    set: (paused) => send(pauseRoutes.set as Route, { body: { paused } } as CallInput, true),
  };
}

/** The pause as the agent reports it: `paused`, when it began (Unix ms, 0 while running) and the generation, which
 *  grows by one on every change and orders states from different sources (a GET, a PUT answer, event.pause_state). */
export interface PauseState { paused: boolean; sinceMs: number; gen: number }

const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** {paused, since_ms, gen} as a state; null when any of the three is missing or of another type. */
export function pauseOf(x: unknown): PauseState | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const b = x as Record<string, unknown>;
  if (typeof b.paused !== 'boolean' || !nat(b.since_ms) || !nat(b.gen)) return null;
  return { paused: b.paused, sinceMs: b.since_ms, gen: b.gen };
}

const opt = (v: unknown): number | null => (v === undefined ? 0 : nat(v) ? v : null);

/** event.pause_state's payload {paused, since_ms?, gen}: the agent leaves since_ms out while running. */
export function pauseOfEvent(x: unknown): PauseState | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const b = x as Record<string, unknown>;
  const since = opt(b.since_ms);
  if (typeof b.paused !== 'boolean' || since === null || !nat(b.gen)) return null;
  return { paused: b.paused, sinceMs: since, gen: b.gen };
}

/** init_state's seed {paused, paused_since_ms?, pause_gen?}: both numbers are left out while they are 0. */
export function pauseOfInit(x: unknown): PauseState | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const b = x as Record<string, unknown>;
  const since = opt(b.paused_since_ms), gen = opt(b.pause_gen);
  if (typeof b.paused !== 'boolean' || since === null || gen === null) return null;
  return { paused: b.paused, sinceMs: since, gen };
}
