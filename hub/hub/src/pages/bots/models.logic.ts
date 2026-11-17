// The Bot's models as data. Pure: no React, no reads.
// - Which model a Bot answers with: its own `model`, else the AI page's Bots pin (the bot agent's `model:` line), else the
//   bot agent's shipped model, Hoody Free. It never falls to the AI helper's model (the agent: productOwnedAgentSource).
// - Whether a saved Bot model still waits for its conversation to restart.
// - The three model jobs (the Bot, Hoody-model helpers, Claude Code helpers) with where each value comes from and when a
//   change applies.
// - The helper lists' options: the Bot computer's catalogue with its readiness, ready models only.
import { agent, providers } from '@core';
import type { BotView, ModelRow } from './data';
import strings from './strings.en.json';

type Evidence = providers.Evidence;
type Ready = providers.Ready | 'gone';

/** A spec's public name: a Hoody AI model by the public-name rule, any other by its id after the provider. */
export const specLabel = (spec: string): string =>
  spec === providers.FREE ? providers.FREE_NAME : providers.ownedByHoody(spec) ? providers.modelNameOf(spec, null, strings['model.anyName']) : spec.split('/').slice(1).join('/') || spec;

/** What the agents read says about the Bot's own agent: its model pin ('' with none). null/undefined: unread or failed. */
export interface BotAgentModel {
  botModel: string;
}

/** The model the Bot answers with and where it comes from; null when it follows the AI page and that cannot be read. */
export type ResolvedModel = { spec: string; source: 'own' | 'ai_page' } | null;

export function resolveBotModel(own: string, agents: BotAgentModel | null | undefined): ResolvedModel {
  if (own) return { spec: own, source: 'own' };
  if (!agents) return null;
  return { spec: agents.botModel || providers.FREE, source: 'ai_page' };
}

export interface LabelWords {
  /** A model the AI page gives: "<name> (AI page)". */
  aiPage: (name: string) => string;
  /** One it gives that cannot be read: "Bots default (AI page)". */
  unresolved: string;
}

/** The model chip's and the list cell's words: never blank. */
export function botModelLabel(own: string, agents: BotAgentModel | null | undefined, w: LabelWords): string {
  const r = resolveBotModel(own, agents);
  if (!r) return w.unresolved;
  return r.source === 'own' ? specLabel(r.spec) : w.aiPage(specLabel(r.spec));
}

/** The page's words for the label (strings.en.json). */
export const LABEL_WORDS: LabelWords = {
  aiPage: (name) => strings['model.fromAiPage'].replace('{{name}}', name),
  unresolved: strings['model.botsDefault'],
};

export type RestartState = 'running' | 'waits' | 'next' | 'cant_tell';

const norm = (spec: string): string => spec.trim().toLowerCase();

/**
 * Whether the running conversation already uses the resolved model: no session = the next conversation
 * starts with it; a session that has not said its model, or a model that cannot be resolved = can't tell.
 */
export function restartState(bot: { sessionId?: string | null; sessionModel: string | null }, resolved: ResolvedModel): RestartState {
  if (!bot.sessionId) return 'next';
  if (!bot.sessionModel || !resolved) return 'cant_tell';
  return norm(bot.sessionModel) === norm(resolved.spec) ? 'running' : 'waits';
}

/** A spec's readiness on the Bot's computer; no evidence or no spec proves nothing. */
const readyOf = (ev: Evidence | null, spec: string | null): Ready => (ev && spec ? providers.readinessOf(ev, spec) : 'unknown');

export interface ModelRole {
  job: 'bot' | 'hoody' | 'claude';
  /** What the Bot holds for this job ('' = it follows something else). */
  held: string;
  /** The model the job runs on, when the Hub can tell; null when another side decides (an agent, Claude Code) or it cannot be read. */
  spec: string | null;
  source: 'own' | 'ai_page' | 'agent' | 'claude_code';
  applies: 'after_reset' | 'next_session' | 'new_helpers';
  ready: Ready;
}

/** The Bot's model jobs: the Bot, Hoody-model helpers, and Claude Code helpers while Claude Code is allowed. */
export function modelRolesOf(bot: Pick<BotView, 'model' | 'sessionId' | 'sessionModel' | 'workers'>, agents: BotAgentModel | null | undefined, ev: Evidence | null): ModelRole[] {
  const r = resolveBotModel(bot.model, agents);
  const out: ModelRole[] = [
    { job: 'bot', held: bot.model, spec: r?.spec ?? null, source: r?.source ?? 'ai_page', applies: bot.sessionId ? 'after_reset' : 'next_session', ready: readyOf(ev, r?.spec ?? null) },
  ];
  const hm = bot.workers.options?.model ?? '';
  out.push({ job: 'hoody', held: hm, spec: hm || null, source: hm ? 'own' : 'agent', applies: 'new_helpers', ready: readyOf(ev, hm || null) });
  if (bot.workers.allowed.includes('acp')) {
    const cm = bot.workers.model;
    out.push({ job: 'claude', held: cm, spec: cm || null, source: cm ? 'own' : 'claude_code', applies: 'new_helpers', ready: readyOf(ev, cm ? `${agent.CLAUDE}/${cm}` : null) });
  }
  return out;
}

/** The page's words for a model with no other public name (model-adapters ModelNames). */
interface Names {
  free: string;
  any: string;
}

const fallbackRow = (spec: string, label: string, ready: ModelRow['ready'], heldOnly = false): ModelRow => ({
  spec,
  label,
  provider: spec.split('/')[0] ?? '',
  providerLabel: spec.split('/')[0] ?? '',
  source: 'provider',
  ready,
  computerDefault: false,
  reasoning: false,
  ...(heldOnly ? { heldOnly: true } : {}),
});

/**
 * The helper model and tier lists' options: the Bot computer's catalogue (the evidence the Model tab judges by), ready
 * models only, never an ensemble (the agent refuses one as a helper or tier model). The held models always stay, with
 * their readiness, marked heldOnly: one list feeds several fields, and each offers a held-only row only as its own value. With no trusted ready list (unread, failed, an agent that does not say), only the held model and Hoody
 * Free, as the chooser's own fallback: never a list of models that may need a key.
 */
export function helperOptions(ev: Evidence | null, held: string | readonly string[], names: Names): ModelRow[] {
  const helds = [...new Set(typeof held === 'string' ? [held] : held)].filter((h) => h !== '');
  const snap = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value : null;
  if (!snap || snap.ready !== 'ok' || !providers.readyTrusted(snap.cat)) {
    const out = [fallbackRow(providers.FREE, names.free, 'unknown')];
    for (const h of helds) if (h !== providers.FREE) out.push(fallbackRow(h, specLabel(h) || names.any, 'unknown', true));
    return out;
  }
  const cat = snap.cat;
  const rows = providers
    .list(cat, 'worker', null, { model: names.any, provider: names.any })
    .filter((m) => m.source !== 'fusion' && m.ready === 'ready')
    .map((m): ModelRow => ({
      spec: m.spec,
      label: m.label,
      provider: m.provider,
      providerLabel: m.providerLabel,
      source: 'provider',
      ready: 'ready',
      computerDefault: false,
      reasoning: (cat.bySpec[m.spec] as { reasoning?: unknown } | undefined)?.reasoning === true,
    }));
  for (const h of helds.reverse()) {
    if (rows.some((m) => m.spec === h)) continue;
    const r = readyOf(ev, h);
    rows.unshift(fallbackRow(h, providers.labelOf(h, cat) || specLabel(h), r === 'gone' ? 'unknown' : r, true));
  }
  return rows;
}
