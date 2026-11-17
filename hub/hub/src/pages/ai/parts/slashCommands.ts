// The AI page's "/" menu commands: what the agent reports, never a Hub list. An open chat reads its own list
// (GET /sessions/{id}/slash-commands: the agent's built-ins and the skills it published to that chat). With no chat yet (New
// chat), or when that read fails (an agent from before the route answers 404), the skills come from GET /skills as the chat's
// folder sees them and the built-ins from the host (/compact while the open chat can compact). An untrusted skill is offered
// with its mark: the agent decides what it runs, the Hub blocks nothing.
//
// The menu is grouped. The built-ins come first under the agent's own categories (Conversation, Session,
// Automation), then the skills: Your skills, then Hoody platform. A skill is listed under Hoody platform only when the /skills
// read proves the copy in use comes from the bundled root (or the agent's own list says so, once it names each skill's source); anything not proved (no read yet, a failed read or refresh, a copy
// from any other root) is listed under Your skills. The same read gives an open chat's skills their "Not trusted" mark. Nothing the agent
// lists is hidden: a built-in the agent runs only in its terminal app is listed too, and picking it says so in the chat (a host
// note) and sends nothing. With no agent list on an open chat (the 404
// fallback), the agent's /clear, /skills, /hooks and /memory are offered too: the agent ran them long before the route.
//
// The host can carry out a built-in itself (`runs`, by name): /clear asks first (it cannot be undone) and then sends
// "/clear"; /memory consolidate and /memory wipe are never sent (the agent refuses them here) and point to the Memory page.
import { useCallback, useMemo, useState } from 'react';
import { useStrings, type ComposerProps, type StringKey } from '@kit';
import { useSkillsIn, type SkillsIn } from '../knowledge/skills/data';
import type { SkillList } from '../knowledge/skills/logic';
import { HOST_GATED, firstLine, useAgentSlash, type AgentBuiltin, type SlashCategory } from './slashData';
import strings from './Conversation.strings.en.json';

type Slash = NonNullable<ComposerProps['slash']>;
export type SlashCommand = Slash['items'][number];

/** Where a chat's list is read: its folder (the /skills read) and, for an open chat, its id (the agent's own list). */
export interface SlashAt extends SkillsIn { sid?: string }

/** The skills a "/" can call: the ones on (the copy a name resolves to; off, shadowed and broken ones are not), each name once,
 *  by name; the first line of each description. `bundled`: the copy in use is from the bundled root. */
export function skillCommands(list: SkillList | undefined): (SlashCommand & { bundled?: true })[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: (SlashCommand & { bundled?: true })[] = [];
  for (const r of list.items) {
    if (r.state !== 'on' || !r.name || seen.has(r.name)) continue;
    seen.add(r.name);
    out.push({
      name: r.name, description: firstLine(r.description),
      ...(r.trust === 'untrusted' || r.trust === 'changed' ? { untrusted: true } : {}), ...(r.root === 'bundled' ? { bundled: true } : {}),
    });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The agent's daemon commands an open chat is offered when the agent's list cannot be read, in the agent's order. */
export const FALLBACK_BUILTINS: readonly AgentBuiltin[] = [
  { name: 'clear', description: '', category: 'conversation', args: 'none', terminal: false },
  { name: 'skills', description: '', category: 'session', args: 'none', terminal: false },
  { name: 'hooks', description: '', category: 'session', args: 'optional', terminal: false },
  { name: 'memory', description: '', category: 'session', args: 'optional', terminal: false },
];

type S = typeof strings;
type Key = StringKey<S>;
const GROUP: Record<Exclude<SlashCategory, ''>, Key> = { conversation: 'slash.group.conversation', session: 'slash.group.session', automation: 'slash.group.automation' };
const CATEGORY_RANK: Record<SlashCategory, number> = { conversation: 0, session: 1, automation: 2, '': 3 };
/** What may follow a sent built-in's name, as the Hub writes it: by name where the agent's own help names it, else by shape. */
const HINT: Partial<Record<string, Key>> = { compact: 'slash.hint.compact', hooks: 'slash.hint.hooks', memory: 'slash.hint.memory', fork: 'slash.hint.fork', trim: 'slash.hint.trim', copy: 'slash.hint.copy' };
/** A Hub description for a fallback built-in (the agent's list, when read, carries its own). */
const DESC: Partial<Record<string, Key>> = { clear: 'slash.desc.clear', skills: 'slash.desc.skills', hooks: 'slash.desc.hooks', memory: 'slash.desc.memory' };

export interface MenuInput {
  builtins: readonly AgentBuiltin[];
  /** The skills offered: the agent's own list (open chat) or the /skills read's. */
  skills: readonly (SlashCommand & { bundled?: true; source?: string })[];
  /** The /skills read, for the agent's list: the copy in use per name gives its mark and its root. */
  join: SkillList | undefined;
  /** A built-in the agent runs only in its terminal app was picked or sent: the host says so. Absent: no host to say it. */
  terminalOnly?: (name: string) => void;
  /** The host's own way to carry out a built-in, by name (SlashCommand.run): it beats the terminal-only note. */
  runs?: HostRuns;
}
/** A built-in the host carries out itself, by name (SlashCommand.run: answer false to send the text as typed). */
export type HostRuns = Readonly<Partial<Record<string, (args: string) => boolean | void>>>;

/** The menu's items: built-ins first, grouped in the agent's category order (its own order inside each group), then Your skills
 *  and Hoody platform. A skill named as a built-in is listed once, as the built-in. */
export function menuOf(m: MenuInput, t: (k: Key) => string): SlashCommand[] {
  const out: SlashCommand[] = [];
  const builtins = m.builtins
    .map((b, i) => ({ b, i }))
    .sort((x, y) => CATEGORY_RANK[x.b.category] - CATEGORY_RANK[y.b.category] || x.i - y.i)
    .map((x) => x.b);
  for (const b of builtins) {
    const group = t(b.category ? GROUP[b.category] : 'slash.group.other');
    const description = b.description || (DESC[b.name] ? t(DESC[b.name]!) : '');
    const run = m.runs?.[b.name];
    if (b.terminal && !run) {
      // Never sent: the agent would read it as plain text. With no host to say why, it is not offered.
      const say = m.terminalOnly;
      if (!say) continue;
      out.push({ name: b.name, description, group, opens: t('slash.terminalOnly'), run: () => { say(b.name); } });
      continue;
    }
    const hint = HINT[b.name] ? t(HINT[b.name]!) : b.args === 'required' ? t('slash.hint.required') : b.args === 'optional' ? t('slash.hint.optional') : '';
    out.push({ name: b.name, description, group, ...(hint ? { hint } : {}), ...(run ? { run } : {}) });
  }
  const taken = new Set(out.map((c) => c.name));
  const used = new Map(skillCommands(m.join).map((c) => [c.name, c]));
  const mine: SlashCommand[] = [];
  const hoody: SlashCommand[] = [];
  for (const s of m.skills) {
    if (taken.has(s.name)) continue;
    taken.add(s.name);
    // An agent that names the copy's source answers both itself; an older one is read through the /skills join.
    const seen = s.source === undefined ? used.get(s.name) : undefined;
    const untrusted = s.untrusted === true || seen?.untrusted === true;
    const bundled = s.source === undefined ? s.bundled === true || seen?.bundled === true : s.source === 'bundled';
    const c: SlashCommand = { name: s.name, description: s.description, hint: t('slash.hint.skill'), ...(untrusted ? { untrusted: true } : {}) };
    (bundled ? hoody : mine).push({ ...c, group: t(bundled ? 'slash.group.hoody' : 'slash.group.skills') });
  }
  return out.concat(mine, hoody);
}

/** The host's runs the menu does not list yet (its list still being read, or an agent that does not list them) as hidden
 *  commands: a typed "/memory wipe" or "/clear" is the host's from the first keystroke, never text for the agent.
 *  A listed item of the same name without a run (a skill named "exit") stays listed and does not take the host's command away. */
export function withHostRuns(items: SlashCommand[], runs: HostRuns | undefined): SlashCommand[] {
  if (!runs) return items;
  const have = new Set(items.filter((c) => c.run).map((c) => c.name));
  const more: SlashCommand[] = [];
  for (const [name, run] of Object.entries(runs)) if (run && !have.has(name)) more.push({ name, description: '', hidden: true, run });
  return more.length ? items.concat(more) : items;
}

/** The menu for a chat at `at` (null: nothing to read, only the built-ins), the built-ins first. Nothing is read until the menu
 *  has opened in this composer (then kept fresh as any read). `builtins`: the host's own (the fallback list; a host-gated agent
 *  built-in such as /compact shows only when it is here too). `terminalOnly`: how the host says a terminal-only built-in does not
 *  run here (absent: those are not offered). `runs`: the built-ins the host carries out itself (MenuInput.runs). */
export function useSlashCommands(at: SlashAt | null, builtins: readonly SlashCommand[], terminalOnly?: (name: string) => void, runs?: HostRuns): Slash {
  const t = useStrings(strings);
  const [asked, setAsked] = useState(false);
  const open = useCallback(() => setAsked(true), []);
  const sid = at?.sid || '';
  // The agent's own list: an open chat only, after the menu opened.
  const chat = asked && !!at && sid !== '';
  const own = useAgentSlash(at?.target, at?.realm ?? '', sid, chat);
  const fromAgent = chat && own.k === 'ok' ? own : undefined;
  // The /skills read: the skills themselves with no chat id (New chat) or when the agent's list failed (an agent without the
  // route included); beside the agent's list, only for each skill's root and mark.
  const agentFailed = own.k === 'failed';
  const fallback = !sid || agentFailed;
  const q = useSkillsIn(asked ? at : null);
  const list = asked && at ? q.data : undefined;
  const reading = at !== null && !fromAgent && (!asked || !fallback || q.isPending);
  const failed = at !== null && asked && fallback && q.isError && !list;
  return useMemo(() => {
    const host = builtins.map((b): AgentBuiltin => ({ name: b.name, description: b.description, category: 'conversation', args: 'optional', terminal: false }));
    if (fromAgent) {
      const mine = fromAgent.builtins.filter((b) => !HOST_GATED.has(b.name) || builtins.some((h) => h.name === b.name));
      // A join whose last read failed is not believed (its cached rows may name an old root or trust): unproved, Your skills.
      const join = q.isError ? undefined : list;
      const items = menuOf({ builtins: mine, skills: fromAgent.skills, join, ...(terminalOnly ? { terminalOnly } : {}), ...(runs ? { runs } : {}) }, t);
      return { items: withHostRuns(items, runs), open, reading: false, failed: false };
    }
    // No agent list: the host's built-ins, and on an open chat the agent's long-standing daemon commands.
    const all = sid && agentFailed ? host.concat(FALLBACK_BUILTINS.filter((b) => !host.some((h) => h.name === b.name))) : host;
    const items = menuOf({ builtins: all, skills: skillCommands(fallback ? list : undefined), join: undefined, ...(terminalOnly ? { terminalOnly } : {}), ...(runs ? { runs } : {}) }, t);
    return { items: withHostRuns(items, runs), open, reading, failed };
  }, [fromAgent, list, q.isError, builtins, reading, failed, open, sid, agentFailed, fallback, terminalOnly, runs, t]);
}
