// A conversation's live model and agent, and what it fixed when it started (Details → Session). One read of
// the conversation gives all of it; a change is one PATCH, sent once and decided only by reading the conversation
// back (C9). The change's own answer adds only what a read cannot show:
//   - the model's `persisted` (whether the chat's own record holds the switch) and `defaultChanged` (whether the agent
//     also rewrote the chat agent's default model);
//   - the agent's `deferred` (a parked gate made the agent discard the switch).
// A lost answer says nothing about any of them, so they stay null then.
// The model switch is session-only: it is sent with scope "session", so the agent file is left alone.
// The agent echoes the scope it applied. Only an echo of "agent" says the default was rewritten too; an echo of
// "session" says it was not; a missing or other echo proves neither, so it is unknown (null), never "changed".
// A 409 gate_parked / turn_in_flight is a definite refusal of a busy chat: nothing changed, and nothing is resent.
import type { Target } from '../ctx';
import { defineRoute, type CallInput, type Route } from '../routes';
import { call } from '../providers/call';
import { obj } from '../providers/catalogue';
import { isStale, isUnknown } from '../providers/api';
import type { Outcome, Settled } from '../providers/types';
import { claudeModelOf, claudeSpec } from './claude';
import { agentRoutes } from './routes';

export const liveRoutes = {
  // Synchronous: the agent answers what it applied (model, persisted), or why not.
  model: defineRoute<unknown, { model: string; scope: 'session' }>({ method: 'PATCH', path: '/sessions/:id/model', scope: 'agent', body: ['model', 'scope'], timeoutMs: 60000 }),
  agent: defineRoute<unknown, { agent: string }>({ method: 'PATCH', path: '/sessions/:id/agent', scope: 'agent', body: ['agent'] }),
} as const;

/** The refusals that mean the chat is busy (a turn runs, or a gate waits): change it when the reply ends. */
export const BUSY_CODES: readonly string[] = ['gate_parked', 'turn_in_flight'];

/** Agents the Hub never offers as a chat's agent: they are the product's own (their sessions start only there). */
export const PRODUCT_AGENTS: readonly string[] = ['bot', 'script-writer', 'github-installer'];
/** A product agent's display name, as a strings key of the page that shows it (Source.strings.en.json); others show their name. */
export const AGENT_LABELS: Readonly<Record<string, 'agent.githubInstaller'>> = { 'github-installer': 'agent.githubInstaller' };

export interface LiveApi {
  session(id: string): Promise<Settled<unknown>>;
  setModel(id: string, model: string): Promise<Settled<unknown>>;
  setAgent(id: string, agent: string): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function liveApi(target?: Target): LiveApi {
  const on = (input: CallInput): CallInput => (target ? { ...input, target } : input);
  const read = (route: Route, input: CallInput = {}) => call(route, on(input), false);
  const write = (route: Route, input: CallInput = {}) => call(route, on(input), true);
  return {
    session: (id) => read(agentRoutes.session, { params: { id } }),
    setModel: (id, model) => write(liveRoutes.model, { params: { id }, body: { model, scope: 'session' } }),
    setAgent: (id, agent) => write(liveRoutes.agent, { params: { id }, body: { agent } }),
  };
}

/** What the conversation fixed when it started. Each value is null when the agent did not report it. */
export interface Fixed {
  folder: string | null;
  backend: 'hoody' | 'claude_code';
  /** workspace | home | full, as the agent lists it. */
  dirScope: string | null;
  /** standard | orchestrator ('standard' when the agent omits it). */
  toolMode: string;
  /** The conversation's realm: 'global' or a 24-hex id. */
  realm: string | null;
}

export interface Live {
  id: string;
  /** The model as a picker spec (a catalogue spec, or claude-code/<id>); null when the agent did not say. */
  model: string | null;
  /** The chat agent; null on a record from before the field. */
  agent: string | null;
  /** A turn runs or a gate waits: no live change now. null: the agent did not say (a change may still be refused). */
  busy: boolean | null;
  /** No turn has been dispatched yet. */
  fresh: boolean;
  fixed: Fixed;
}

const REALM_RE = /^(global|[0-9a-f]{24})$/;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * The settled conversation read as Live, or null when it failed or is not this conversation's row. The agent's row
 * always carries its id (getSession requires it: both the listed row and a not-yet-listed live session's summary send
 * it), so a row without one, or with another, is not taken as this conversation.
 */
export function liveOf(id: string, s: Settled<unknown>): Live | null {
  if (!s.ok || !obj(s.body) || !obj(s.body.session)) return null;
  const row = s.body.session;
  if (row.id !== id) return null;
  const claude = row.backend_kind === 'acp' && row.delegated_agent === 'claude';
  let model: string | null = null;
  if (claude) {
    const spec = claudeSpec(typeof row.delegated_model === 'string' ? row.delegated_model : '');
    model = claudeModelOf(spec) === null ? null : spec;
  } else model = str(row.model);
  const state = typeof row.state === 'string' ? row.state : null;
  const busy = row.pending_gate === true || state === 'running' || state === 'parked' ? true : state === 'idle' ? false : null;
  const realm = typeof row.realm === 'string' && REALM_RE.test(row.realm) ? row.realm : null;
  return {
    id,
    model,
    agent: str(row.agent),
    busy,
    fresh: row.started === false,
    fixed: {
      folder: str(row.cwd),
      backend: claude ? 'claude_code' : 'hoody',
      dirScope: str(row.dir_scope),
      toolMode: str(row.tool_mode) ?? 'standard',
      realm,
    },
  };
}

/** Read the conversation. stale: the page moved on (drop the answer). */
export async function readLive(api: LiveApi, id: string): Promise<{ stale: boolean; live: Live | null; err: Settled<unknown> | null }> {
  const s = await api.session(id);
  if (isStale(s)) return { stale: true, live: null, err: null };
  const live = liveOf(id, s);
  return { stale: false, live, err: live ? null : s };
}

export type LiveChange = { field: 'model'; value: string } | { field: 'agent'; value: string };

/**
 * One change, sent once and not decided here:
 *   sent     answered: a read-back decides it; `persisted`, `defaultChanged` (model) and `deferred` (agent) are what
 *            the answer said;
 *   unknown  the answer was lost: only a read-back decides it, and `persisted` is not known;
 *   busy     the chat was busy (409 gate_parked / turn_in_flight): nothing changed;
 *   failed   any other definite refusal (nothing changed);
 *   stale    the page moved on.
 */
export type LiveSend =
  | { state: 'sent'; persisted: boolean | null; defaultChanged: boolean | null; deferred: boolean }
  | { state: 'unknown' }
  | { state: 'busy'; code: string }
  | { state: 'failed'; err: Outcome }
  | { state: 'stale' };

export async function sendLive(api: LiveApi, id: string, change: LiveChange, backend: Fixed['backend']): Promise<LiveSend> {
  let value = change.value;
  if (change.field === 'model' && backend === 'claude_code') {
    // A Claude Code chat takes the model id itself (its picker spec is claude-code/<id>); Claude's own default is
    // never a live switch (the agent refuses a blank model).
    const m = claudeModelOf(value);
    if (!m) return { state: 'failed', err: { kind: 'not_sent', code: 'bad_request', status: 0, retryAfter: null, details: {} } };
    value = m;
  }
  const r = change.field === 'model' ? await api.setModel(id, value) : await api.setAgent(id, value);
  if (isStale(r)) return { state: 'stale' };
  if (isUnknown(r)) return { state: 'unknown' };
  if (!r.ok) {
    if (BUSY_CODES.includes(r.err.code ?? '')) return { state: 'busy', code: r.err.code as string };
    return { state: 'failed', err: r.err };
  }
  const body = obj(r.body) ? r.body : {};
  // A Claude Code chat never touches an agent file; a native one did only when the agent applied scope "agent". An echo
  // of "session" says it did not; a missing or any other echo is not evidence either way.
  const defaultChanged = change.field !== 'model' || backend === 'claude_code' ? false
    : body.scope === 'session' ? false : body.scope === 'agent' ? true : null;
  return {
    state: 'sent',
    persisted: change.field === 'model' && typeof body.persisted === 'boolean' ? body.persisted : null,
    defaultChanged,
    deferred: change.field === 'agent' && body.deferred === true,
  };
}

/**
 * The agents a chat may switch to, from a caller's own listAgents read (the AI page reads them; core declares no second
 * GET /agents route, so page fixtures answer the one read): names without the product's own. null: unreadable.
 */
export function agentNamesOf(r: Settled<unknown>): string[] | null {
  if (!r.ok || !obj(r.body) || !Array.isArray(r.body.items)) return null;
  const out: string[] = [];
  for (const it of r.body.items) {
    if (!obj(it) || typeof it.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(it.name)) return null;
    if (PRODUCT_AGENTS.includes(it.name) || it.provenance === 'product-owned (read-only)') continue;
    out.push(it.name);
  }
  return out;
}
