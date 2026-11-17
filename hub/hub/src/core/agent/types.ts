// Types of an agent conversation's settings (model, effort, reply length, auto-approve), shared by Ask, the AI page,
// the Bots page and the kit's AgentSettings. The value sets below are the ones the agent's session routes accept;
// the Claude Code models and efforts are never listed here: they come from the computer's agent (claude.ts).
import type { Outcome } from '../providers/types';

/** Hoody's own agent (any catalogue model), or Claude Code running the conversation. */
export type Backend = 'hoody' | 'claude_code';

/** PATCH /sessions/{id}/effort: the levels it takes ('' = the model's own default). */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** PATCH /sessions/{id}/verbosity: the levels it takes. */
export const VERBOSITY = ['normal', 'concise', 'terse', 'minimal'] as const;
export type Verbosity = (typeof VERBOSITY)[number];

/** A Claude Code pick as a picker spec: `claude-code` is Claude's default model, `claude-code/<id>` one model. */
export const CLAUDE = 'claude-code';

export type AgentModel = { backend: 'hoody'; spec: string } | { backend: 'claude_code'; model: string };

/** The Claude Code models and efforts the computer's agent accepts, and whether Claude Code can run there. */
export interface ClaudeSet {
  /** ready: on and startable; setup: present but off or not set up (the AI page sets it up); unknown: can't tell;
   *  absent: this agent has no Claude Code. */
  state: 'ready' | 'setup' | 'unknown' | 'absent';
  /** Empty on an agent that does not report its set: only Claude's default model is offered then. */
  models: Array<{ id: string; label: string }>;
  /** Empty on an agent that does not report its set: no effort choice then. */
  efforts: Effort[];
}

/** One conversation's settings as the agent reports them. null: the agent did not say (not live, or no read). */
export interface SessionSettings {
  id: string;
  /** No turn has been dispatched yet: the model can still be chosen (it rides the create). */
  fresh: boolean;
  backend: Backend;
  /** The model as a picker spec: a catalogue spec, or `claude-code[/<id>]`. null when the agent did not say. */
  model: string | null;
  /** '' = the model's own default. */
  effort: Effort | '' | null;
  verbosity: Verbosity | null;
  yolo: boolean | null;
}

export type Field = 'effort' | 'verbosity' | 'yolo';

/**
 * A change's outcome, decided only by reading the conversation back (never by the change's own answer):
 *   saved          the read-back shows the new value;
 *   not_confirmed  the change may have gone through, or not: offer Check again, never a resend;
 *   failed         the agent refused it (nothing changed);
 *   stale          the page moved on while it ran; end quietly.
 */
export type SaveResult =
  | { state: 'saved'; settings: SessionSettings }
  | { state: 'not_confirmed'; settings: SessionSettings | null }
  | { state: 'failed'; err: Outcome }
  | { state: 'stale' };
