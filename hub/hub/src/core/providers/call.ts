// The real ProvidersApi: every call is one declared route sent
// through core's api() (admission, realm rules, C9 outcomes, secret scrubbing). Never rejects: an answer is
// {ok, body} or {ok:false, err} with a normalised Outcome. Reads are always fresh (core keeps no cache here);
// a change is sent once.
import { api, outcomeOf } from '../api';
import type { Ctx, Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { GONE, type ProvidersApi } from './api';
import { catalogue as buildCatalogue, obj, probeSet } from './catalogue';
import { providerRoutes as routes } from './routes';
import type { AuthBody, Catalogue, Outcome, Settled } from './types';

function normalise(e: unknown, change: boolean): Outcome {
  const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const kind = outcomeOf(e, change);
  const d = obj(x.details) ? x.details : {};
  const details: Outcome['details'] = {};
  for (const k of ['field', 'reason', 'definition', 'job_id'] as const) if (typeof d[k] === 'string') details[k] = d[k] as string;
  return {
    kind,
    code: typeof x.code === 'string' ? x.code.toLowerCase() : '',
    status: typeof x.status === 'number' ? x.status : 0,
    retryAfter: typeof x.retryAfter === 'number' ? x.retryAfter : null,
    details,
  };
}

// Core keeps a secret call's code only when it is in the route's upper-case list, and the agent's codes are
// lower-case: on the key and sign-in routes the status alone names the refusal.
const SECRET_STATUS: Record<string, Record<number, string>> = {
  'PUT /providers/:pid/auth/api-key': { 422: 'api_key_refused', 409: 'definition_changed', 503: 'store_failed' },
  'POST /providers/openai/auth/oauth': { 409: 'oauth_in_progress', 503: 'store_failed' },
  'POST /providers/:pid/auth/oauth': { 409: 'oauth_in_progress', 503: 'store_failed' },
};

/** One declared route, settled. `change` marks a write: a lost answer is pending, never failed. */
export async function call<R>(route: Route<R, never> | Route, input: CallInput<never> | CallInput = {}, change = false): Promise<Settled<unknown>> {
  try {
    const body = await api(route as Route, input as CallInput);
    return { ok: true, body: body ?? {} };
  } catch (e) {
    const err = normalise(e, change);
    const by = SECRET_STATUS[`${(route as Route).method} ${(route as Route).path}`]?.[err.status];
    if (by && !err.code && err.kind === 'failed') err.code = by;
    return { ok: false, err: err.kind === 'stale' ? GONE : err };
  }
}

/** `target`: the computer every call of this Api goes to (default: the context's at each call). `bound`: a context
 *  every call is sent under (core's api() sends nothing once it is dead) and an abort signal for every call. */
export function providersApi(target?: Target, bound: { ctx?: Ctx; signal?: AbortSignal } = {}): ProvidersApi & Required<Pick<ProvidersApi, 'models'>> {
  const on = (input: CallInput): CallInput => ({
    ...input,
    ...(target ? { target } : {}),
    ...(bound.ctx ? { ctx: bound.ctx } : {}),
    ...(bound.signal ? { signal: bound.signal } : {}),
  });
  const read = (route: Route, input: CallInput = {}) => call(route, on(input), false);
  const write = (route: Route, input: CallInput = {}) => call(route, on(input), true);
  return {
    version: () => read(routes.version),
    providers: () => read(routes.providers),
    provider: (pid) => read(routes.provider, { params: { pid } }),
    auth: (pid) => read(routes.auth, { params: { pid } }),
    models: (query = {}) => read(routes.models, query.ready ? { query: { ready: true } } : {}),
    catalogue: async (wanted = []) => {
      const [p, m, r] = await Promise.all([read(routes.providers), read(routes.models), read(routes.models, { query: { ready: true } })]);
      if (!p.ok) return p as Settled<Catalogue>;
      if (!m.ok) return m as Settled<Catalogue>;
      const base = buildCatalogue({ providers: p.body, models: m.body, ready: r.ok ? r.body : undefined });
      // An agent that reports provider status proves a model ready only through the ready list: without it the
      // catalogue would read every model of a ready provider as ready, so the read fails instead.
      if (base.am1 && !r.ok) return r as Settled<Catalogue>;
      // An agent without provider status: probe at most 11 providers, the ones the page names first (probeSet).
      // The probes change the provider line only, never a model's readiness.
      const auth: Record<string, AuthBody> = {};
      if (!base.am1) {
        const ids = probeSet(base, wanted);
        await Promise.all(ids.map(async (id) => {
          const a = await read(routes.auth, { params: { pid: id } });
          if (a.ok && obj(a.body)) auth[id] = a.body as AuthBody;
        }));
      }
      return { ok: true, body: buildCatalogue({ providers: p.body, models: m.body, ready: r.ok ? r.body : undefined, auth }) };
    },
    oauthPoll: (job) => read(routes.oauthPoll, { params: { job } }),
    pkcePoll: (pid, job) => read(routes.pkcePoll, { params: { pid, job } }),

    keyPut: async (pid, body) => {
      const r = await write(routes.keyPut, { params: { pid }, body });
      body.api_key = '';
      return r;
    },
    keyDelete: (pid) => write(routes.keyDelete, { params: { pid } }),
    authTest: (pid) => write(routes.authTest, { params: { pid } }),
    authDefault: (which) => write(routes.authDefault, { params: { pid: 'openai' }, body: { default: which } }),
    oauthStart: (_another, idem) => write(routes.oauthStart, { body: { method: 'device_code' }, idem }),
    oauthCancel: (job) => write(routes.oauthCancel, { params: { job } }),
    signOut: () => write(routes.signOut),
    pkceStart: (pid, idem) => write(routes.pkceStart, { params: { pid }, body: {}, idem }),
    pkceCode: async (pid, job, body) => {
      try {
        return await write(routes.pkceCode, { params: { pid, job }, body });
      } finally {
        body.code = '';
      }
    },
    pkceCancel: (pid, job) => write(routes.pkceCancel, { params: { pid, job } }),
  };
}
