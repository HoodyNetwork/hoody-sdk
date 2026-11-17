// Changing the model of an agent (Settings → Default model's helper and Bots rows, and an agent's own page). A change is
// "saved" only when the agent list, read back, shows the chosen model; a lost answer is "not confirmed".
import { isStale, isUnknown, type Api } from './api';
import { rows, str } from './logic';
import type { Outcome, RawAgent } from './types';

/** The two calls a model change makes: the change itself and the agents list read back. */
export type ModelApi = Pick<Api, 'agentModel' | 'agents'>;

export type PickResult = { state: 'saved' | 'not_confirmed' | 'stale' } | { state: 'failed'; err: Outcome };

/** Whether the agent list, read back, shows `agent` on `model`. */
const showsModel = (body: unknown, agent: string, model: string): boolean => {
  const row = rows<RawAgent>(body, 'agents').find((x) => x.name === agent);
  return !!row && str(row.model) && row.model === model;
};

export async function setModel(api: ModelApi, realm: string, agent: string, model: string, guard: { defaultAgent: string }): Promise<PickResult> {
  const r = await api.agentModel(realm, agent, model, guard);
  if (isStale(r)) return { state: 'stale' };
  if (!r.ok && !isUnknown(r)) return { state: 'failed', err: r.err };
  const back = await api.agents(realm);
  if (!back.ok) return { state: 'not_confirmed' };
  return showsModel(back.body, agent, model) ? { state: 'saved' } : { state: 'not_confirmed' };
}

/** "Check again": only reads the agent list back; it never sends the pick a second time. */
export async function confirmModel(api: ModelApi, realm: string, agent: string, model: string): Promise<PickResult> {
  const back = await api.agents(realm);
  if (isStale(back)) return { state: 'stale' };
  if (!back.ok) return { state: 'not_confirmed' };
  return showsModel(back.body, agent, model) ? { state: 'saved' } : { state: 'not_confirmed' };
}
