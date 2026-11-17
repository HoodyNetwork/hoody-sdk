// A chat's own requests: rename it and read it back. Declared routes and one settled
// Api, like stop.ts and usage.ts; the readers say only what the agent answered. A change is sent once: a lost answer is
// `unknown` (the caller reads the chat back, it never sends again and never calls it done). Close, delete
// and trim are here too.
import { defineRoute } from '../routes';
import { agentRoutes } from './routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';
import { isRealmOrGlobal } from '../realm-id';

export const sessionRoutes = {
  rename: defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/sessions/:id', scope: 'agent', body: ['name'] }),
  // Tears the live session down; the record stays (reopen is an attach). No `hard`: that is delete.
  close: defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/sessions/:id/close', scope: 'agent', body: [] }),
  // Hard delete: closes the live connection AND removes the record for good. `hard=true` is the whole point of the route.
  // readsStatus: only a 200 proves the record is gone, so the success status travels with the body (see only200).
  delete: defineRoute<unknown, Record<string, never>>({ method: 'DELETE', path: '/sessions/:id', scope: 'agent', query: ['hard'], timeoutMs: 40000, readsStatus: true }),
  // Keeps the history THROUGH `turn_idx` (0-based) and removes what follows, between turns only. The gateway waits up to 90 s for the
  // daemon's result, so this waits longer: an answer that was cut by OUR timeout would be a lost one for a trim that was still running.
  // readsStatus: only a 200 with the done body is proof (a 202 says pending whatever its body shows), so the status travels (see only200).
  // refuses: the daemon's 500 `trim_failed` is "could not save; nothing was trimmed", so on this route it is a
  // definite refusal, not the pending that every other 5xx on a change is (and the code is kept, which the generated catalogue lacks).
  // `refuses` holds at ANY status, so core also settles a 502 or 503 that names the code as a refusal; trimOf still demands status 500
  // as well, so only the exact 500 reads as 'nothing was removed' and any other status stays unknown (the dialog reads the chat back).
  trim: defineRoute<unknown, { turn_idx: number }>({ method: 'POST', path: '/sessions/:id/trim', scope: 'agent', body: ['turn_idx'], timeoutMs: 100000, readsStatus: true, refuses: ['trim_failed'] }),
  // The whole persisted conversation (no after_turn): the proof read after a trim whose answer was not a definite one. readsStatus:
  // only a 200 is the documented transcript, so the status travels with the body (see only200).
  transcript: defineRoute({ method: 'GET', path: '/sessions/:id/transcript', scope: 'agent', maxBytes: 16777216, readsStatus: true }),
  // The chat's loops, whole (limit 0 = no pagination): a close stops the running ones, and says how many.
  loops: defineRoute({ method: 'GET', path: '/sessions/:id/loops', scope: 'agent', query: ['limit'], timeoutMs: 20000 }),
} as const;

export interface SessionApi {
  /** `name` '' clears the title back to the automatic one. `realm`: the chat's own (default: the context's). */
  rename(id: string, name: string, realm?: string): Promise<Settled<unknown>>;
  /** The chat's summary, always fresh. */
  read(id: string, realm?: string): Promise<Settled<unknown>>;
  /** Closes the chat (a change). `realm`: the chat's own. */
  close(id: string, realm?: string): Promise<Settled<unknown>>;
  /** Deletes the chat and its record for good (a change; `hard=true`). `realm`: the chat's own. */
  delete(id: string, realm?: string): Promise<Settled<unknown>>;
  /** Keeps the chat through finished turn `turnIdx` (0-based) and removes what follows (a change). `realm`: the chat's own. */
  trim(id: string, turnIdx: number, realm?: string): Promise<Settled<unknown>>;
  /** The chat's whole persisted transcript, always fresh (a read): turnsOf counts its finished turns. */
  turns(id: string, realm?: string): Promise<Settled<unknown>>;
  /** The chat's loops, always fresh (a read). */
  loops(id: string, realm?: string): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function sessionApi(target?: Target): SessionApi {
  const input = (id: string, realm: string | undefined, body?: { name: string } | { turn_idx: number }, query?: Record<string, number | boolean>): CallInput =>
    ({ params: { id }, ...(realm ? { realm } : {}), ...(body ? { body } : {}), ...(query ? { query } : {}), ...(target ? { target } : {}) }) as CallInput;
  return {
    rename: (id, name, realm) => call(sessionRoutes.rename as Route, input(id, realm, { name }), true),
    read: (id, realm) => call(agentRoutes.session as Route, input(id, realm), false),
    close: (id, realm) => call(sessionRoutes.close as Route, input(id, realm), true),
    delete: async (id, realm) => only200(await call(sessionRoutes.delete as Route, input(id, realm, undefined, { hard: true }), true)),
    trim: async (id, turnIdx, realm) => only200(await call(sessionRoutes.trim as Route, input(id, realm, { turn_idx: turnIdx }), true)),
    turns: async (id, realm) => only200(await call(sessionRoutes.transcript as Route, input(id, realm), false)),
    loops: (id, realm) => call(sessionRoutes.loops as Route, input(id, realm, undefined, { limit: 0 }), false),
  };
}

/** The delete, trim and transcript routes read their success status (`{status, body}`). Only a 200 hands its body on; any other 2xx (a 202 says
 *  "accepted"/"pending", not "removed"/"cut") is handed on with no body, which deleteOf/trimOf read as unknown: the caller reads the chat back. */
function only200(r: Settled<unknown>): Settled<unknown> {
  if (!r.ok) return r;
  const a = r.body;
  return obj(a) && a.status === 200 ? { ok: true, body: a.body } : { ok: true, body: undefined };
}

export type RenameResult =
  | { k: 'done'; name: string }
  | { k: 'gone' }
  | { k: 'refused'; status: number; code: string }
  | { k: 'unknown' };

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The documented success shape is {status:'ok', name} (the stored title, '' = cleared). Anything else, a 200 included, is not
 *  proof of what was stored: it stays `unknown` (the caller reads the chat back), and the typed text is never filled in. */
export function renameOf(r: Settled<unknown>): RenameResult {
  if (r.ok) return obj(r.body) && r.body.status === 'ok' && typeof r.body.name === 'string' ? { k: 'done', name: r.body.name } : { k: 'unknown' };
  const e = r.err;
  // A lost answer, or a context that changed meanwhile: the request may have been applied.
  if (e.kind === 'pending' || e.kind === 'stale') return { k: 'unknown' };
  if (e.status === 404) return { k: 'gone' };
  return { k: 'refused', status: e.status, code: e.code };
}

/** The title of chat `sid` as the agent holds it: `name` '' when that chat is unnamed, `auto` when the agent made the title itself
 *  (`name_auto` true; absent or false: a person set it, or there is none); null when the read failed, names another chat, has no
 *  readable session, or says something that cannot be (a `name_auto` that is not a boolean, or true with no title): unknown,
 *  never empty. */
export function sessionTitleOf(r: Settled<unknown>, sid: string): { name: string; auto: boolean } | null {
  if (!r.ok || !obj(r.body) || !obj(r.body.session) || r.body.session.id !== sid) return null;
  const { name, name_auto: auto } = r.body.session;
  const n = name === undefined ? '' : name;
  if (typeof n !== 'string' || (auto !== undefined && typeof auto !== 'boolean') || (auto === true && n === '')) return null;
  return { name: n, auto: auto === true };
}

export type CloseResult =
  | { k: 'done' }
  | { k: 'notLive' }
  | { k: 'refused'; status: number; code: string }
  | { k: 'unknown' };

/** The documented success shape is {status:'ok'}. Any other 200 is not proof the chat was closed: unknown (the caller reads it
 *  back). A lost answer, a 5xx or a changed context are unknown too. A plain 404 is "session not live": the chat may be closed
 *  already or gone, so it is never read as deleted (the caller reads the chat to tell). Even `done` only says the gateway let go
 *  of its own connection: whether the chat is closed everywhere is what a read (closedOf) proves. */
export function closeOf(r: Settled<unknown>): CloseResult {
  if (r.ok) return obj(r.body) && r.body.status === 'ok' ? { k: 'done' } : { k: 'unknown' };
  const e = r.err;
  if (e.kind === 'pending' || e.kind === 'stale') return { k: 'unknown' };
  if (e.status === 404) return { k: 'notLive' };
  return { k: 'refused', status: e.status, code: e.code };
}

/** What a read of chat `sid` proves about its attachment, from every channel the answer has: the daemon summary's `attached` /
 *  `attached_clients` / `live` (omitted when false or zero) and the gateway's own top-level `attached` (its hub still holds the
 *  chat). 'closed' only when no channel says attached or live; 'open' when one does and none contradicts; 'gone' (404);
 *  'unknown' for a failed read, another chat's session, a flag or count that is not what the contract says, or channels that
 *  disagree. */
export function closedOf(r: Settled<unknown>, sid: string): 'closed' | 'open' | 'gone' | 'unknown' {
  if (!r.ok) return r.err.kind === 'failed' && r.err.status === 404 ? 'gone' : 'unknown';
  if (!obj(r.body) || !obj(r.body.session) || r.body.session.id !== sid) return 'unknown';
  const top = r.body.attached;
  const { attached, attached_clients: clients, live } = r.body.session;
  for (const f of [top, attached, live]) if (f !== undefined && typeof f !== 'boolean') return 'unknown';
  if (clients !== undefined && !(typeof clients === 'number' && Number.isInteger(clients) && clients >= 0)) return 'unknown';
  const n = typeof clients === 'number' ? clients : 0;
  const says = attached === true || top === true || live === true;
  const denies = attached === false || top === false || live === false;
  if (says && denies) return 'unknown';
  if (n > 0 && attached !== true) return 'unknown';
  return says ? 'open' : 'closed';
}

export type LoopsRead = { k: 'count'; n: number } | { k: 'unknown' };

const LIVE_LOOP = new Set(['running', 'paused', 'firing']);
const ENDED_LOOP = new Set(['expired', 'stopped', 'ended', 'error']);

/** How many loops closing the chat would stop: the ones still scheduled (running, paused, firing) of a COMPLETE page (the whole
 *  list was asked; a total that is not exactly the rows given, a row that is not an object with a known state, or a row that does
 *  not name THIS chat is unknown, never zero). Loops that already ended (expired, stopped, ended, error) are not counted: closing
 *  does not change them. */
export function loopsOf(r: Settled<unknown>, sid: string): LoopsRead {
  if (!r.ok || !obj(r.body) || !Array.isArray(r.body.items) || !obj(r.body.meta)) return { k: 'unknown' };
  const { items } = r.body;
  const total = r.body.meta.total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total !== items.length) return { k: 'unknown' };
  let n = 0;
  for (const it of items) {
    if (!obj(it) || typeof it.state !== 'string') return { k: 'unknown' };
    if (it.session_id !== sid) return { k: 'unknown' };
    if (LIVE_LOOP.has(it.state)) n++;
    else if (!ENDED_LOOP.has(it.state)) return { k: 'unknown' };
  }
  return { k: 'count', n };
}

export type DeleteResult =
  | { k: 'done' }
  | { k: 'live' }
  | { k: 'notFound' }
  | { k: 'refused'; status: number; code: string }
  | { k: 'unknown' };

/** The documented success is a 200 {status:'ok', hard:true} (`closed` only says whether a live connection was dropped on the way).
 *  Any other 200, a lost answer, a changed context and every 5xx the gateway does not declare as "nothing was deleted" are
 *  `unknown`: the caller reads the chat back (presentOf), it never sends again and never calls it done. 409 `session_live` is the
 *  definite "attached elsewhere, nothing deleted". A 5xx is unknown even where the route says "nothing deleted" (the 503s): the
 *  read-back says what is true, and a chat that is still there simply ends the attempt as "not deleted".
 *  A plain 404 is `notFound`: the chat is missing OR hidden from this caller (the gateway answers both alike), so it is never
 *  read as deleted and never as "was there". */
export function deleteOf(r: Settled<unknown>): DeleteResult {
  if (r.ok) return obj(r.body) && r.body.status === 'ok' && r.body.hard === true ? { k: 'done' } : { k: 'unknown' };
  const e = r.err;
  if (e.kind === 'pending' || e.kind === 'stale') return { k: 'unknown' };
  if (e.status === 404) return { k: 'notFound' };
  if (e.status === 409 && e.code === 'session_live') return { k: 'live' };
  if (e.status >= 500) return { k: 'unknown' };
  return { k: 'refused', status: e.status, code: e.code };
}

/** What a read of chat `sid` says about its existence: 'there' (the session is returned and names this chat), 'absent' (a plain
 *  404: missing or hidden from this caller, which the gateway does not tell apart), 'unknown' for anything else (a failed or
 *  lost read, another chat's session, a body that is not a session). */
export function presentOf(r: Settled<unknown>, sid: string): 'there' | 'absent' | 'unknown' {
  if (!r.ok) return r.err.kind === 'failed' && r.err.status === 404 ? 'absent' : 'unknown';
  return obj(r.body) && obj(r.body.session) && r.body.session.id === sid ? 'there' : 'unknown';
}

export type TrimResult =
  | { k: 'done' }
  | { k: 'notLive' }
  | { k: 'failed' }
  | { k: 'refused'; status: number; code: string }
  | { k: 'unknown' };

/** The documented success is 200 {status:'ok', outcome:'done'}; sessionApi.trim hands on a body only for a 200, so a 202 (or any other
 *  2xx) arrives with none. Everything else that was answered 2xx (202 {status:'pending'}, a
 *  missing or other outcome, a different shape) is NOT proof the history was cut: unknown, and the caller reads the chat back.
 *  A lost answer, a stale context and a 5xx other than 500 `trim_failed` are unknown too. Only 500 `trim_failed` is a definite
 *  failure ("not saved; nothing was trimmed"). 404 is "session not live" (the chat may be closed): never done, never "deleted". */
export function trimOf(r: Settled<unknown>): TrimResult {
  if (r.ok) return obj(r.body) && r.body.status === 'ok' && r.body.outcome === 'done' ? { k: 'done' } : { k: 'unknown' };
  const e = r.err;
  if (e.kind === 'pending' || e.kind === 'stale') return { k: 'unknown' };
  if (e.status === 404) return { k: 'notLive' };
  if (e.status === 500 && e.code === 'trim_failed') return { k: 'failed' };
  if (e.status >= 500) return { k: 'unknown' };
  return { k: 'refused', status: e.status, code: e.code };
}

export type TurnsRead = { k: 'count'; n: number } | { k: 'unknown' };

/** How many finished turns chat `sid` of realm `realm` has, from its WHOLE transcript (no skip cursor; sessionApi.turns hands on a
 *  body only for a 200): the response must name this chat and its realm, echo
 *  after_turn 0, and agree with itself (turns_total = turns_returned = the number of turn_boundaries; `messages` is an array; each
 *  boundary is the index of the last message emitted by then, -1 for none yet, never past the messages and never going back: the
 *  gateway repeats an index for a turn that emitted nothing, so equal neighbours are fine, a decrease is not). Anything else is
 *  unknown, never a count. A mid-turn tail is never counted. */
export function turnsOf(r: Settled<unknown>, sid: string, realm: string): TurnsRead {
  if (!r.ok || !obj(r.body) || r.body.session_id !== sid || r.body.after_turn !== 0) return { k: 'unknown' };
  // The chat's own realm, as the daemon writes it ('global' or a 24-hex id): a same-named chat of another realm is not this chat.
  if (!isRealmOrGlobal(realm) || r.body.realm !== realm) return { k: 'unknown' };
  const { turns_total: total, turns_returned: returned, turn_boundaries: bounds } = r.body;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || returned !== total) return { k: 'unknown' };
  if (!Array.isArray(bounds) || bounds.length !== total) return { k: 'unknown' };
  const msgs = r.body.messages;
  if (!Array.isArray(msgs)) return { k: 'unknown' };
  let prev = -1;
  for (const b of bounds) {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < prev || b >= msgs.length) return { k: 'unknown' };
    prev = b;
  }
  return { k: 'count', n: total };
}
