// A conversation's settings over the computer's agent: one read (the conversation plus its approval policy) and one
// change per setting, each decided only by reading the conversation back (C9): the agent's answer to a live change
// says only that it was passed on, so "saved" needs the read-back to show the value. A change is sent once; a lost
// answer is "may have gone through" with Check again, never a resend.
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import { obj } from '../providers/catalogue';
import { isStale, isUnknown } from '../providers/api';
import type { Outcome, Settled } from '../providers/types';
import { approvalOf } from './approval';
import { claudeModelOf, claudeSetOf, claudeSpec } from './claude';
import { agentRoutes as routes } from './routes';
import { EFFORTS, VERBOSITY, type AgentModel, type ClaudeSet, type Effort, type Field, type SaveResult, type SessionSettings, type Verbosity } from './types';

/** What the settings need from a computer's agent. Every call settles and never rejects. */
export interface AgentApi {
  session(id: string): Promise<Settled<unknown>>;
  approval(id: string): Promise<Settled<unknown>>;
  setEffort(id: string, effort: Effort | ''): Promise<Settled<unknown>>;
  setVerbosity(id: string, level: Verbosity): Promise<Settled<unknown>>;
  setYolo(id: string, enabled: boolean): Promise<Settled<unknown>>;
  acp(): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function agentApi(target?: Target): AgentApi {
  const on = (input: CallInput): CallInput => (target ? { ...input, target } : input);
  const read = (route: Route, input: CallInput = {}) => call(route, on(input), false);
  const write = (route: Route, input: CallInput = {}) => call(route, on(input), true);
  return {
    session: (id) => read(routes.session, { params: { id } }),
    approval: (id) => read(routes.approval, { params: { id } }),
    setEffort: (id, effort) => write(routes.effort, { params: { id }, body: { effort } }),
    setVerbosity: (id, level) => write(routes.verbosity, { params: { id }, body: { level } }),
    setYolo: (id, enabled) => write(routes.yolo, { params: { id }, body: { enabled } }),
    acp: () => read(routes.acp),
  };
}

const oneOf = <T extends string>(set: readonly T[], v: unknown): T | null => (typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : null);

/**
 * The two settled reads as SessionSettings, or null when the conversation read failed. A value the agent did not
 * send stays null (effort and verbosity are reported only while the conversation is live).
 */
export function settingsOf(id: string, s: Settled<unknown>, a: Settled<unknown> | null): SessionSettings | null {
  if (!s.ok || !obj(s.body) || !obj(s.body.session)) return null;
  const row = s.body.session;
  // The agent's row always carries its id (as liveOf): a row without one, or with another, is not this conversation.
  if (row.id !== id) return null;
  const claude = row.backend_kind === 'acp' && row.delegated_agent === 'claude';
  // Only a live conversation reports its verbosity (and its effort when one is set). A dormant one's effort and
  // reply length stay unknown: delegated_effort is what a Claude Code conversation was configured with, never proof
  // of the effort it runs with now.
  const live = typeof row.verbosity === 'string' || typeof row.effort === 'string';
  let model: string | null = null;
  if (claude) {
    const spec = claudeSpec(typeof row.delegated_model === 'string' ? row.delegated_model : '');
    model = claudeModelOf(spec) === null ? null : spec;
  }
  else if (typeof row.model === 'string' && row.model) model = row.model;
  const effort = !live ? null : (oneOf(EFFORTS, row.effort) ?? (row.effort === undefined ? '' : null));
  return {
    id,
    fresh: row.started === false,
    backend: claude ? 'claude_code' : 'hoody',
    model,
    effort,
    verbosity: oneOf(VERBOSITY, row.verbosity),
    // The approval read through its one parser (a malformed or contradictory answer: unknown).
    yolo: a ? (approvalOf(a)?.yolo ?? null) : null,
  };
}

/** Read the conversation and its approval policy. null with stale: the page moved on. */
export async function readSettings(api: AgentApi, id: string): Promise<{ stale: boolean; settings: SessionSettings | null; err: Settled<unknown> | null }> {
  const [s, a] = await Promise.all([api.session(id), api.approval(id)]);
  if (isStale(s) || isStale(a)) return { stale: true, settings: null, err: null };
  const settings = settingsOf(id, s, a);
  return { stale: false, settings, err: settings ? null : s };
}

export type FieldValue = { field: 'effort'; value: Effort | '' } | { field: 'verbosity'; value: Verbosity } | { field: 'yolo'; value: boolean };

/** Check again: one read, nothing sent. */
export async function confirmField(api: AgentApi, id: string, change: FieldValue): Promise<SaveResult> {
  const back = await readSettings(api, id);
  if (back.stale) return { state: 'stale' };
  const now = back.settings;
  if (now && now[change.field as Field] === change.value) return { state: 'saved', settings: now };
  return { state: 'not_confirmed', settings: now };
}

/**
 * Send one change once, without deciding it: `sent` (answered, or lost: either way only a read-back decides),
 * `failed` (a definite refusal), `stale`. A caller that shows settings issues the read-back itself (useAgentSettings
 * fences each read by when it was issued).
 */
export async function sendField(api: AgentApi, id: string, change: FieldValue): Promise<{ state: 'sent' } | { state: 'failed'; err: Outcome } | { state: 'stale' }> {
  const r =
    change.field === 'effort' ? await api.setEffort(id, change.value)
      : change.field === 'verbosity' ? await api.setVerbosity(id, change.value)
        : await api.setYolo(id, change.value);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  return { state: 'sent' };
}

/** Send one change once, then decide it by reading the conversation back. */
export async function saveField(api: AgentApi, id: string, change: FieldValue): Promise<SaveResult> {
  const r = await sendField(api, id, change);
  return r.state === 'sent' ? confirmField(api, id, change) : r;
}

/** Claude Code on this computer (an agent without the routes reads absent). */
export async function readClaude(api: AgentApi): Promise<{ stale: boolean; set: ClaudeSet }> {
  const r = await api.acp();
  return { stale: isStale(r), set: claudeSetOf(r) };
}

/** The picker spec as an AgentModel; null for a spec that is neither a catalogue spec nor a Claude Code pick. */
export function modelOf(spec: string): AgentModel | null {
  const c = claudeModelOf(spec);
  if (c !== null) return { backend: 'claude_code', model: c };
  if (spec.startsWith('claude-code')) return null;
  return spec.includes('/') ? { backend: 'hoody', spec } : null;
}

/**
 * The create-body fields a new conversation needs for this model (POST /sessions, before the first turn; it applies
 * to that conversation only and never changes the agent's default). Claude Code runs as backend acp with the model,
 * or with none for Claude's default; the caller then sends no follow_realm_backend.
 */
export function createFields(m: AgentModel): { model?: string; backend?: 'acp'; delegated_agent?: 'claude' } {
  if (m.backend === 'claude_code') return m.model ? { backend: 'acp', delegated_agent: 'claude', model: m.model } : { backend: 'acp', delegated_agent: 'claude' };
  return { model: m.spec };
}

/**
 * Right after a create, before the first turn: read the new conversation, then send each draft value it does not
 * already show (the agent's own defaults, such as the computer's reply length, may differ from a draft's Normal),
 * once each, in order, each decided by its read-back. A failed read sends every draft value.
 */
export async function applyDraft(api: AgentApi, id: string, d: { effort: Effort | ''; verbosity: Verbosity; yolo: boolean }): Promise<Array<{ change: FieldValue; result: SaveResult }>> {
  const now = await readSettings(api, id);
  if (now.stale) return [];
  const want: FieldValue[] = [{ field: 'effort', value: d.effort }, { field: 'verbosity', value: d.verbosity }, { field: 'yolo', value: d.yolo }];
  const changes = want.filter((c) => !now.settings || now.settings[c.field] !== c.value);
  const out: Array<{ change: FieldValue; result: SaveResult }> = [];
  for (const change of changes) {
    const result = await saveField(api, id, change);
    out.push({ change, result });
    if (result.state === 'stale') break;
  }
  return out;
}
