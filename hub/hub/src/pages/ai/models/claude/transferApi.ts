// The Claude Code copy requests, declared once with core's defineRoute. Each copy is a preview (a
// POST that writes nothing and returns a single-use token) and an apply of that token. The apply goes to the computer the
// preview was read from (the token is that agent's), never to whichever computer the top bar shows by then. Both are sent
// through core's api() via providers.call: a 4xx is the agent's refusal before any write, a 5xx or a lost answer may have
// written (pending). `recovers`: the drawer shows its own next step (Preview again) for an unknown outcome, so core adds no
// notice of its own while the page lives. An apply goes with its copy's context (copyStore's copyCtx): the copy's toast
// is its notice whatever the page or realm by the answer, so core adds none then either.
import { defineRoute, providers, type Ctx, type Target } from '@core';
import type { Settled } from '../../types';
import type { Source } from './transfer';

const AGENT = 'claude';
const BASE = '/acp/agents/:agent';

export const transferRoutes = {
  loginPreview: defineRoute({ method: 'POST', path: `${BASE}/credential-imports`, scope: 'agent', realm: 'realm', body: ['source', 'target_computer'] }),
  loginApply: defineRoute({ method: 'POST', path: `${BASE}/credential-imports/apply`, scope: 'agent', realm: 'realm', body: ['preview_token', 'overwrite'] }),
  filesPreview: defineRoute({ method: 'POST', path: `${BASE}/file-syncs`, scope: 'agent', realm: 'realm', body: ['mode', 'path', 'source', 'target_computer'] }),
  filesApply: defineRoute({ method: 'POST', path: `${BASE}/file-syncs/apply`, scope: 'agent', realm: 'realm', body: ['preview_token', 'overwrite'] }),
} as const;

/** Where a copy is planned and applied: the agent's computer and the realm both computers must be in. */
export interface CopyAt { target: Target; realm: string }

const sourceOf = (s: Source) => (s.kind === 'host' ? { kind: 'host' } : { kind: 'computer', computer: s.id });
const send = (at: CopyAt, route: (typeof transferRoutes)[keyof typeof transferRoutes], body: Record<string, unknown>, ctx?: Ctx) =>
  providers.call(route, { target: at.target, realm: at.realm, params: { agent: AGENT }, body, recovers: true, ...(ctx ? { ctx } : {}) }, true);

export function previewLogin(at: CopyAt, source: Source, to: string): Promise<Settled<unknown>> {
  return send(at, transferRoutes.loginPreview, { source: sourceOf(source), target_computer: to });
}

export function applyLogin(at: CopyAt, token: string, overwrite: boolean, ctx: Ctx): Promise<Settled<unknown>> {
  return send(at, transferRoutes.loginApply, { preview_token: token, overwrite }, ctx);
}

export function previewFiles(at: CopyAt, source: Source, to: string, what: { mode: 'file' | 'dir'; path: string }): Promise<Settled<unknown>> {
  return send(at, transferRoutes.filesPreview, { mode: what.mode, path: what.path.trim(), source: sourceOf(source), target_computer: to });
}

export function applyFiles(at: CopyAt, token: string, overwrite: readonly string[], ctx: Ctx): Promise<Settled<unknown>> {
  return send(at, transferRoutes.filesApply, { preview_token: token, overwrite: [...overwrite] }, ctx);
}
