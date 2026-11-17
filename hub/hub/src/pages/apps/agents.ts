// Coding agents the launcher offers: each opens its own program in a terminal on the
// computer. Open asks the computer's "system" source (programs on $PATH) for the program name, keeps only the row
// of exactly that name (the source also lists longer names: claude-helper is another program), and opens that one
// candidate through the launcher's one send (useApps), so it holds and is held like the same program opened from
// Search. The list is a catalogue: each agent's own mark (kit icons, AGENT), its name, who makes
// it and Open; no command lines. An agent that is not installed links to its maker's install page, opened in a new tab:
//   - Claude Code: code.claude.com/docs/en/setup (Anthropic's setup page).
//   - Codex CLI: github.com/openai/codex (OpenAI's repository; its README installs it).
//   - Gemini CLI: github.com/google-gemini/gemini-cli (Google's repository; its README installs it).
//   - OpenCode: opencode.ai/docs (its own docs; install is their first section).
// The Hub never asks for, keeps or passes an agent's keys: each signs in inside its own terminal. The Hoody agent is
// not listed until a computer proves `hoody agent` runs from $PATH.
import type { IconName } from '@kit';
import type { Candidate, Item } from './logic';

/** What the launcher says of an agent's program before Open: installed only on a whole answer
 *  that holds the exact program, not installed only on a whole answer without it, checking while the read is out, and
 *  "couldn't check" for a failed, partial or warming answer, or one with any warning (it may not have looked
 *  everywhere). null: not asked. */
export type AgentBadge = 'installed' | 'missing' | 'checking' | 'unchecked';

/** The system source's answer for one agent, as its read holds it now. */
export interface AgentRead {
  data?: { rows: readonly Candidate[]; partial: boolean; warming: boolean; failed: boolean; warned?: boolean } | undefined;
  error?: unknown;
  isFetching?: boolean;
}

export function agentBadge(x: Agent, r: AgentRead | undefined): AgentBadge | null {
  if (!r) return null;
  if (r.isFetching) return 'checking';
  if (r.error) return 'unchecked';
  const d = r.data;
  if (!d) return null;
  if (d.failed) return 'unchecked';
  // A program the answer names is there, whole answer or not (Open launches it the same way); only a whole answer, no
  // part missing, warming or warned, says it is not.
  if (programOf(x, d.rows)) return 'installed';
  return d.partial || d.warming || d.warned ? 'unchecked' : 'missing';
}

export interface Agent {
  id: string;
  name: string;
  /** The program name opened on the computer. */
  exe: string;
  /** The agent's own mark (kit icons). */
  mark: IconName;
  /** Who makes it, in one short line. */
  about: 'agents.about.claude' | 'agents.about.codex' | 'agents.about.gemini' | 'agents.about.opencode';
  /** The maker's install page, opened in a new tab when the agent is not on the computer. */
  guide: string;
}

export const AGENTS: readonly Agent[] = [
  { id: 'claude', name: 'Claude Code', exe: 'claude', mark: 'claude', about: 'agents.about.claude', guide: 'https://code.claude.com/docs/en/setup' },
  { id: 'codex', name: 'Codex CLI', exe: 'codex', mark: 'openai', about: 'agents.about.codex', guide: 'https://github.com/openai/codex' },
  { id: 'gemini', name: 'Gemini CLI', exe: 'gemini', mark: 'gemini', about: 'agents.about.gemini', guide: 'https://github.com/google-gemini/gemini-cli' },
  { id: 'opencode', name: 'OpenCode', exe: 'opencode', mark: 'opencode', about: 'agents.about.opencode', guide: 'https://opencode.ai/docs' },
];

/** The agent a launch was opened for: only by the id its card stamped at Open, never by a name. */
export const agentById = (id: string | undefined): Agent | undefined => (id ? AGENTS.find((x) => x.id === id) : undefined);

/** The agent's own program in the system source's answer: the row of exactly its name, from that source. */
export const programOf = (x: Agent, rows: readonly Candidate[]): Candidate | undefined => rows.find((c) => c.provider === 'system' && c.title === x.exe);

/** The agent's program as an item the launcher opens in a terminal: that candidate (pick by its id, on the system
 *  source), named as the agent and stamped with it. */
export const agentItem = (x: Agent, c: Candidate): Item => ({
  type: 'row', name: x.name, id: c.candidateId, description: '', opensIn: 'terminal', by: 'server', provider: 'system', version: c.version, attr: '', path: c.path, sourceId: c.source, setId: c.setId, app: x.exe,
  shares: false, runnable: true, unsure: false, installed: true, also: [], ready: true, tier: 0, ord: 0, group: 0, detail: '', agent: x.id,
});
