// The agent's own "/" list for one chat: the route and its read. An agent from before the route answers it with
// an error (404) or another shape; either reads as failed, and the caller falls back. No capability gates it: the read itself
// is the proof, one small GET once the menu opens. Split from slashCommands.ts so tests can stand in for the read.
// Every built-in the agent lists is kept (the terminal's own ones too, `terminal`), with its category and argument
// shape; the menu decides what each does in the Hub (slashCommands.ts).
import { coreSource, defineRoute, type SourceTable, type Target } from '@core';
import type { ComposerProps } from '@kit';

type SlashCommand = NonNullable<ComposerProps['slash']>['items'][number];

/** Built-ins the host also gates by what the open chat can do now: the agent's /compact shows only while the host offers it. */
export const HOST_GATED = new Set(['compact']);

export const slashRoutes = {
  /** One chat's "/" list as the agent has it (hoody-agent listSessionSlashCommands): {items: [{name, description, kind,
   *  category, args, tui_only}], meta}; 404 when the chat is not live. */
  commands: defineRoute({ method: 'GET', path: '/sessions/:id/slash-commands', scope: 'agent', timeoutMs: 20000 }),
} as const;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const firstLine = (s: string) => (s.split('\n')[0] ?? '').trim();
const NAME_RE = /^[^\s/]+$/u;

/** A built-in's group as the agent files it (protocol SlashCommand.category); '' for one the Hub does not know. */
export type SlashCategory = 'conversation' | 'session' | 'automation' | '';
/** What may follow a built-in's name (protocol SlashCommand.args). */
export type SlashArgs = 'none' | 'optional' | 'required';
const CATEGORIES: readonly SlashCategory[] = ['conversation', 'session', 'automation'];
const ARGS: readonly SlashArgs[] = ['none', 'optional', 'required'];

/** One of the agent's built-ins. `terminal`: the agent runs it only in its terminal app (tui_only, or not said): sent from the
 *  Hub it would reach the model as plain text, so the Hub never sends it. */
export interface AgentBuiltin { name: string; description: string; category: SlashCategory; args: SlashArgs; terminal: boolean }

/** The agent's list, as the Hub reads it: every built-in (the terminal's own ones marked `terminal`) and every skill, each name
 *  once, in the agent's order; the first line of each description. Undefined for an answer of any other shape (the caller falls
 *  back). */
/** One of the agent's skills. `source` and `untrusted`: what an agent with them says about the copy in
 *  use: its root (bundled | project | user | config) and whether the agent holds it untrusted; absent from an older agent. */
export type AgentSkill = SlashCommand & { source?: string };

export function agentCommands(raw: unknown): { builtins: AgentBuiltin[]; skills: AgentSkill[] } | undefined {
  // Only the documented shape, {items: [...]}: a bare array (or anything else) is not the list, and the caller falls back.
  const items = obj(raw) && Array.isArray(raw.items) ? raw.items : null;
  if (!items) return undefined;
  const seen = new Set<string>();
  const builtins: AgentBuiltin[] = [];
  const skills: AgentSkill[] = [];
  for (const r of items) {
    if (!obj(r) || typeof r.name !== 'string' || !NAME_RE.test(r.name) || seen.has(r.name)) continue;
    if (r.kind !== 'builtin' && r.kind !== 'skill') continue;
    seen.add(r.name);
    const c: SlashCommand = { name: r.name, description: typeof r.description === 'string' ? firstLine(r.description) : '' };
    if (r.kind === 'skill') {
      // An agent that says where the copy comes from also says its trust (untrusted is sent only when true).
      const source = typeof r.source === 'string' && r.source ? r.source : undefined;
      skills.push({ ...c, ...(source ? { source } : {}), ...(source && r.untrusted === true ? { untrusted: true } : {}) });
      continue;
    }
    const category = (CATEGORIES as readonly unknown[]).includes(r.category) ? (r.category as SlashCategory) : '';
    const args = (ARGS as readonly unknown[]).includes(r.args) ? (r.args as SlashArgs) : 'optional';
    builtins.push({ ...c, category, args, terminal: r.tui_only !== false });
  }
  return { builtins, skills };
}

/** One chat: its computer, its own realm ('' = the context's) and its id. */
interface SlashChat { target: Target; realm: string; sid: string }

export const slashTable: SourceTable = {
  reads: {
    'slash.commands': {
      route: slashRoutes.commands,
      input: (p?: SlashChat) => (p ? { target: p.target, params: { id: p.sid }, ...(p.realm ? { realm: p.realm } : {}) } : {}),
      select: (raw) => agentCommands(raw) ?? null,
    },
  },
};
const slashSource = coreSource('ai', slashTable);

/** The agent's list for chat `sid` on `target` in `realm` (off unless `enabled`): read, failed (or another shape), or reading. */
export function useAgentSlash(target: Target | undefined, realm: string, sid: string, enabled: boolean): { k: 'ok'; builtins: AgentBuiltin[]; skills: AgentSkill[] } | { k: 'failed' } | { k: 'reading' } {
  const c = slashSource.useQuery<ReturnType<typeof agentCommands> | null, SlashChat | undefined>(
    'slash.commands', target && sid ? { target, realm, sid } : undefined, { enabled: enabled && !!target && sid !== '' },
  );
  if (c.status === 'success') return c.data ? { k: 'ok', ...c.data } : { k: 'failed' };
  return c.status === 'error' ? { k: 'failed' } : { k: 'reading' };
}
