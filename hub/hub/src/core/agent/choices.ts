// The model rows of an agent conversation: the computer's catalogue (core providers) plus, when Claude Code can be
// offered there, a Claude Code group from the agent's own set. No words here: the caller passes them. Truth rules:
//   - readiness comes from the catalogue and the Claude Code state; 'unknown' is never shown as ready;
//   - ensembles appear only where the caller says they run (fusion), never on a Claude Code conversation;
//   - with nothing set the conversation runs the agent's default, and the Hub never writes a third-party default:
//     DEFAULT_SPEC is what a picker marks as recommended, not something sent on its own.
import { FREE, list, type Names } from '../providers/catalogue';
import { claudeMembersNeedingSetup } from '../providers/readiness';
import type { Catalogue, Model, Obj, Ready } from '../providers/types';
import { claudeSpec } from './claude';
import { CLAUDE, type ClaudeSet } from './types';

export const DEFAULT_SPEC = FREE;

/** One row as the kit's ModelPicker takes it; `reasoning` says the model takes an effort level. */
export interface AgentChoice {
  spec: string;
  label: string;
  providerId: string;
  providerLabel: string;
  ready: Ready;
  source: 'provider' | 'fusion' | 'claude_code';
  recommended?: boolean;
  reasoning: boolean;
}

export interface AgentNames extends Names {
  /** The Claude Code group's name ("Claude Code"). */
  claude: string;
  /** Claude Code's own default model ("Claude's default model"). */
  claudeDefault: string;
}

export interface ChoicesInput {
  /** null: the catalogue read failed or has not answered (no catalogue rows then). */
  cat: Catalogue | null;
  /** null: Claude Code is not offered (not read, or this place does not run it). */
  claude: ClaudeSet | null;
  names: AgentNames;
  /** Ensembles run here (a Hoody conversation that can run them). */
  fusion?: boolean;
  /** Claude Code models are offered here. */
  claudeCode?: boolean;
}

/** The catalogue marks the model as taking an effort level. */
export function reasoningOf(cat: Catalogue | null, spec: string): boolean {
  const raw = cat?.bySpec[spec] as unknown as Obj | undefined;
  return raw !== undefined && raw.reasoning === true;
}

const CLAUDE_READY: Record<ClaudeSet['state'], Ready> = { ready: 'ready', setup: 'needs_key', unknown: 'unknown', absent: 'unknown' };

/** Picker rows: the catalogue (ensembles only with fusion), then the Claude Code group when it is offered. */
export function agentChoices(i: ChoicesInput): AgentChoice[] {
  const out: AgentChoice[] = [];
  if (i.cat) {
    for (const m of list(i.cat, i.fusion ? 'bot' : 'default', null, i.names) as Model[]) {
      // An ensemble's Claude Code member that the Claude read shows needs setup or is gone (the catalogue
      // alone cannot tell, so list() leaves it to membership).
      const ready: Ready = m.source === 'fusion' && m.ready !== 'needs_key' && claudeMembersNeedingSetup(i.cat, i.claude, m.spec).length ? 'needs_key' : m.ready;
      out.push({ spec: m.spec, label: m.label, providerId: m.providerId, providerLabel: m.providerLabel, ready, source: m.source, recommended: m.recommended, reasoning: reasoningOf(i.cat, m.spec) });
    }
  }
  if (i.claudeCode && i.claude && i.claude.state !== 'absent') {
    const ready = CLAUDE_READY[i.claude.state];
    const row = (spec: string, label: string): AgentChoice => ({ spec, label, providerId: CLAUDE, providerLabel: i.names.claude, ready, source: 'claude_code', reasoning: i.claude!.efforts.length > 0 });
    out.push(row(claudeSpec(''), i.names.claudeDefault));
    for (const m of i.claude.models) out.push(row(claudeSpec(m.id), m.label));
  }
  return out;
}

/** Effort is offered for a model the catalogue marks as reasoning, or for Claude Code when the agent lists efforts. */
export function effortOffered(choice: AgentChoice | undefined): boolean {
  return choice !== undefined && choice.reasoning;
}
