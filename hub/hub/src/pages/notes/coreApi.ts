// The real Api: every call is one declared route sent through core's api() to a computer's Notes. Reads are
// always fresh; the create is sent once and never resent (a lost answer is read back by the flow).
import { api, download, outcomeOf, save, type CallInput, type Route, type Target } from '@core';
import type { NotesApi, Settled } from './api';
import { MD_BYTES, RECENT, capsRefused, capsState, fileName, parseMe, parseRecent, retryDelay, stateOf } from './logic';
import { routes } from './routes';
import type { Computer, Loaded, NotesState, Rejection } from './types';

export const targetOf = (c: Computer): Target => ({ project: { id: c.projectId }, container: { id: c.id, ...(c.serverName ? { server_name: c.serverName } : {}) } });

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call(route: Route, input: CallInput, change = false): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    const k = outcomeOf(e, change);
    return { ok: false, err: { ...(e && typeof e === 'object' ? (e as Rejection) : {}), notSent: k === 'not_sent', pending: k === 'pending', stale: k === 'stale' } };
  }
}

/** A read; one busy answer with a short Retry-After is waited out once. */
async function read(route: Route, input: CallInput): Promise<Settled> {
  let r = await call(route, input);
  if (!r.ok && stateOf(r.err) === 'busy') {
    const d = retryDelay(r.err);
    if (d !== null) {
      await wait(d);
      r = await call(route, input);
    }
  }
  return r;
}

/** A refused read as the computer's state; null when the read was dropped. */
const failed = (s: NotesState): Loaded | null => (s === 'dropped' ? null : { state: s === 'ok' ? 'unexpected' : s });

export function coreApi(): NotesApi {
  return {
    async load(c): Promise<Loaded | null> {
      const target = targetOf(c);
      const caps = await read(routes.caps, { target });
      if (!caps.ok) {
        return failed(capsRefused(caps.err));
      }
      const cs = capsState(caps.body);
      if (cs !== 'ok') return { state: cs };
      const meR = await read(routes.me, { target });
      if (!meR.ok) {
        return failed(stateOf(meR.err));
      }
      const me = parseMe(meR.body);
      if (!me) return { state: 'unexpected' };
      const rec = await read(routes.recent, { target, params: { nb: me.notebookId }, query: { limit: RECENT } });
      if (!rec.ok) {
        return failed(stateOf(rec.err));
      }
      const recent = parseRecent(rec.body, me);
      return recent ? { state: 'ok', me, recent } : { state: 'unexpected' };
    },
    send: (c, nb, body) => call(routes.create, { target: targetOf(c), params: { nb }, body }, true),
    node: (c, nb, sent) => call(routes.node, { target: targetOf(c), params: { nb, id: sent.id } }),
    remove: (c, nb, id) => call(routes.remove, { target: targetOf(c), params: { nb, id } }, true),
    present: (c, nb, id) => call(routes.node, { target: targetOf(c), params: { nb, id } }),
    async download(c, nb, n) {
      try {
        const r = await download(routes.document, { target: targetOf(c), params: { nb, id: n.id }, query: { output: 'md' }, maxBytes: MD_BYTES });
        const s = save(fileName(n.title), r.parts, { maxBytes: MD_BYTES });
        return 'ok' in s ? 'saved' : 'failed';
      } catch (e) {
        const k = outcomeOf(e);
        if (k === 'stale') return 'dropped';
        return (e as Rejection)?.kind === 'too_large' ? 'tooBig' : 'failed';
      }
    },
  };
}
