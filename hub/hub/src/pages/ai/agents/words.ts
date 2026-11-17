// Words of the Agents index and overview: one place, so the list and the overview never say two things.
import type { StringKey, Translate } from '@kit';
import { OTHER, toolsWord, whereOf, type AgentRow, type Where } from './logic';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;
type Key = StringKey<typeof strings>;

const GROUPS: Record<string, Key> = {
  core: 'group.core', coding: 'group.coding', yours: 'group.yours', diagnostics: 'group.diagnostics', memory: 'group.memory',
  editors: 'group.editors', todo: 'group.todo', automation: 'group.automation', system: 'group.system',
};
/** A group's heading: Hoody's labels in words, any other label as the agent file writes it. */
export function groupWord(t: T, group: string): string {
  if (group === OTHER) return t('group.other');
  const k = GROUPS[group];
  return k ? t(k) : group;
}

const WHERE_WORD: Record<Where, Key> = { yours: 'prov.user', project: 'prov.project', modified: 'prov.userShipped', bundled: 'prov.embedded', builtin: 'prov.owned' };
const WHERE_TIP: Record<Where, Key> = { yours: 'prov.tip.user', project: 'prov.tip.project', modified: 'prov.tip.userShipped', bundled: 'prov.tip.embedded', builtin: 'prov.tip.owned' };
/** A place in words ("Yours", "Shipped copy"). */
export function whereWord(t: T, w: Where): string {
  return t(WHERE_WORD[w]);
}
/** What a place means, in a sentence for the Where tag's tip. */
export function whereTip(t: T, w: Where): string {
  return t(WHERE_TIP[w]);
}
export function provenanceWord(t: T, r: AgentRow): string {
  const w = whereOf(r);
  return w ? whereWord(t, w) : t('prov.unknown');
}

/** The tool list in words ("4 tools", "Every tool", "Hoody's default tools", "No tools"). */
export function toolsLong(t: T, r: AgentRow): string {
  const w = toolsWord(r);
  if (w.kind === 'count') return t('tools.count', { count: w.count });
  return t(w.kind === 'every' ? 'tools.every' : w.kind === 'default' ? 'tools.default' : 'tools.none');
}
/** The list cell's tool list: a count, "All tools", "Default tools" or "No tools" (the long forms are the overview's). */
export function toolsCell(t: T, r: AgentRow): string {
  const w = toolsWord(r);
  if (w.kind === 'count') return t('tools.count', { count: w.count });
  return t(w.kind === 'every' ? 'tools.cell.every' : w.kind === 'default' ? 'tools.cell.default' : 'tools.none');
}
/** What a non-count cell word means (the cell is an InfoTip term); null for a count, which says itself. */
export function toolsCellTip(t: T, r: AgentRow): string | null {
  const w = toolsWord(r);
  if (w.kind === 'count') return null;
  return t(w.kind === 'every' ? 'tools.tip.every' : w.kind === 'default' ? 'tools.tip.default' : 'tools.tip.none');
}
