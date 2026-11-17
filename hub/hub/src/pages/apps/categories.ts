// What the launcher's starters are for. The run kit's catalogue has no category
// (hoody-run's catalogue entry), so the Hub keeps this table, keyed by catalog_id, in the spirit of agents.ts.
// An id the table does not know is "More apps", so a starter the run kit adds still shows. The table is
// pinned to the catalogue's ids (fixtures.ts starterIds, copied from the run kit's starter catalogue) by categories.test.ts, because
// the run kit has no `category` field. Pure: no DOM, no network.
import type { Item, Starter } from './logic';

/** The starter groups, in the order the launcher shows them; 'more' (an unknown id) is last. */
export const CATEGORIES = ['code', 'web', 'graphics', 'monitors', 'data', 'more'] as const;
export type Category = (typeof CATEGORIES)[number];

const TABLE: Readonly<Record<string, Exclude<Category, 'more'>>> = {
  firefox: 'web',
  miniserve: 'web',
  pcmanfm: 'web',
  mousepad: 'code',
  vscodium: 'code',
  gimp: 'graphics',
  htop: 'monitors',
  ncdu: 'monitors',
  btop: 'monitors',
  jupyterlab: 'data',
};

/** A starter's category by its catalog_id; an id the table does not know is 'more'. */
export function categoryOf(catalogId: string): Category {
  return Object.hasOwn(TABLE, catalogId) ? TABLE[catalogId]! : 'more';
}

/** The launcher's one Category filter (kit FilterChips, id `category`), in menu order. 'all' is the default. From GitHub
 *  is a mode of the panel, not an option here. */
export const CATEGORY_OPTIONS = ['all', 'installed', 'agents', ...CATEGORIES] as const;
export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

/** The starters in category groups: groups in CATEGORIES order, an empty group left out, and inside a group the
 *  catalogue's own order (`ord`, then the order given). Every starter is in exactly one group. */
export function groupStarters(starters: readonly Starter[]): { category: Category; starters: Starter[] }[] {
  const ordered = starters.map((s, i) => ({ s, i })).sort((a, b) => (a.s.ord ?? a.i) - (b.s.ord ?? b.i) || a.i - b.i);
  return CATEGORIES.map((category) => ({ category, starters: ordered.filter((x) => categoryOf(x.s.id) === category).map((x) => x.s) })).filter((g) => g.starters.length > 0);
}

/** Whether a result row stays under a Category option. "On this computer" keeps the system source only; "Coding agents"
 *  keeps the rows a coding agent's card made; a starter category keeps the starters of that category. */
export function categoryKeeps(option: CategoryOption, i: Pick<Item, 'type' | 'id' | 'provider' | 'agent'>): boolean {
  if (option === 'all') return true;
  if (option === 'installed') return i.type === 'row' && i.provider === 'system';
  if (option === 'agents') return i.agent !== undefined;
  return i.type === 'starter' && categoryOf(i.id) === option;
}
