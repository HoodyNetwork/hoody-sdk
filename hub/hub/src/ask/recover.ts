// recover.ts: what became of a Bot message whose answer was lost, read by its Idempotency-Key. The keyed sends of a chat
// (create, turn, follow-up, stop) are recovered by the journal (ask/journal/recover.ts `check`); a Bot message is not journaled, so its
// read lives here:
//   GET /bots/{id}/messages/by-key/{key}  ->  200 {message_id, state: queued|posted, turn_id?}, 404 message_not_found, 503 while a spoken
//   message is being accepted under the key.
// A read queues, posts and refreshes nothing. There is NO retire: a Bot message can always be read in the Bot's log, so a miss stays a
// miss ("missing" proves nothing: the key may have expired 24 hours after its message was accepted, or the message is still on its way).
// Nothing here sends a message.
import { api, defineRoute, type Ctx, type Target } from '@core';
import * as L from './logic';

export const botMessageByKey = defineRoute({ method: 'GET', path: '/bots/:id/messages/by-key/:key', scope: 'agent', realm: 'bot' });

export type BotMessageRead =
  /** The Bot remembers the message: its id, and the Bot turn it went out in when it was posted. */
  | { readonly t: 'found'; readonly id: string; readonly state: 'queued' | 'posted'; readonly turn?: string }
  /** The Bot remembers no message under the key. Proves nothing: read the Bot's log before sending it again. */
  | { readonly t: 'missing' }
  /** A spoken message is being accepted under the key right now: ask again. */
  | { readonly t: 'accepting' }
  /** Anything else (a refused or failed read, a shape that is not listed): nothing is concluded. */
  | { readonly t: 'unknown' };

export type KeyResult = { readonly ok: true; readonly b: unknown } | { readonly ok: false; readonly e: unknown };

const statusOf = (e: unknown): number => (L.isObj(e) && typeof e.status === 'number' ? e.status : 0);
const codeOf = (e: unknown): string => {
  if (!L.isObj(e)) return '';
  if (typeof e.code === 'string') return e.code;
  return L.isObj(e.data) && typeof e.data.code === 'string' ? e.data.code : '';
};

const waits = (e: unknown): boolean => {
  if (!L.isObj(e)) return false;
  const secs = typeof e.retryAfter === 'number' ? e.retryAfter : typeof e.retryAfterMs === 'number' ? e.retryAfterMs / 1000 : 0;
  return Number.isFinite(secs) && secs > 0;
};

/** An ordered allow-list; the default is `unknown`. A 404 counts as a miss only with the route's own code (a bare 404 is a hidden Bot). */
export function classifyBotMessage(r: KeyResult): BotMessageRead {
  if (!r.ok) {
    const status = statusOf(r.e), code = codeOf(r.e);
    if (status === 404 && code === 'message_not_found') return { t: 'missing' };
    // The 503 that means "ask again" is the route's own `service_unavailable` WITH its Retry-After (the route sets one only while a
    // spoken message is being accepted under the key). The same status and code without it is the Bot runtime not being configured, a gateway
    // fault or the like: nothing is concluded.
    if (status === 503 && code === 'service_unavailable' && waits(r.e)) return { t: 'accepting' };
    return { t: 'unknown' };
  }
  const b = r.b;
  if (!L.isObj(b) || !L.seg(b.message_id)) return { t: 'unknown' };
  if (b.state === 'queued') return { t: 'found', id: b.message_id, state: 'queued' };
  if (b.state === 'posted' && L.seg(b.turn_id)) return { t: 'found', id: b.message_id, state: 'posted', turn: b.turn_id };
  return { t: 'unknown' };
}

/** One read of a Bot message by the key it was posted with. Never rejects. `bot`: the Bot's id; `realm`: its realm. */
export async function readBotMessage(input: { target: Target; realm: string; bot: string; key: string; ctx?: Ctx }): Promise<BotMessageRead> {
  const { target, realm, bot, key, ctx } = input;
  if (!L.seg(bot) || !L.seg(key)) return { t: 'unknown' };
  let r: KeyResult;
  try { r = { ok: true, b: await api(botMessageByKey, { ...(ctx ? { ctx } : {}), target, realm, params: { id: bot, key }, recovers: true }) }; }
  catch (e) { r = { ok: false, e }; }
  return classifyBotMessage(r);
}
