// The table's drawn lines, pure: rows, group headers, group notes and expanded parts in drawing order (shared by the
// web DataTable and its terminal sibling; DataTable.tsx re-exports TableGroup).
import type { ReactNode } from 'react';

/** What the flattening needs of a row (a TanStack Row is one). */
export interface RowLike<T> {
  id: string;
  original: T;
}

/** A collapsible section of rows ("System programs"). */
export interface TableGroup {
  id: string;
  label: string;
  /** Extra content after the count: status chips and short actions. On an inline header it keeps the name's line at
   *  every width (the label gives way, ending in an ellipsis), so keep it short; a sentence goes in `text`. */
  extra?: ReactNode;
  /** A sentence about the group (its state, why it holds nothing), between the count and `extra`. On an inline header it
   *  wraps in its own column; on a narrow one (under 600px) it takes a line of its own under the name, `extra` keeping
   *  the name's line. A stacked header draws it on the second line, before `extra`. */
  text?: ReactNode;
  /** Put `extra` at the row's end instead, its end edge on the row actions' end edge. A
   * stacked header ignores it: its second line is already the full width. */
  extraEnd?: boolean;
  defaultCollapsed?: boolean;
  /** Draw the group row even with no rows (a computer whose rows could not be read; put the
   * note and its Try again in `note`). */
  showEmpty?: boolean;
  /** A note about this group alone (its read failed, its items are paused), with its one action: drawn as the group's
   * first row, right under its header, and hidden while the group is collapsed (a count chip in `extra` stays). A group
   * with a note is drawn even with no rows. A table's own `groups` only (a grouped view's groups carry none). Never name
   * the group again in it: the header above it does. It is drawn as an inset callout: either plain content (one calm
   * box around it all) or `flush` Bands as its direct children (each drawn as its own boxed callout); never the two
   * mixed. */
  note?: ReactNode;
  /** The group's whole count when its rows are paged (a grouped useDataView fills it); default: its rows here. */
  count?: number;
  /** The words drawn for the count after the label ("1 Bot", "No Bots"); default: the number. Part of the header
   * button's name, so it should still say the number. */
  countLabel?: ReactNode;
  /** The id of another group of the table this one sits under, one level only: a group
   *  whose parent has a parent of its own is drawn at the top level. A parent is drawn first, then its own rows, then
   *  each child in `groups` order with its rows; it is drawn while it or a child has something to draw, and its count
   *  (without `count`) is its own rows plus its children's counts. Closing a parent hides its children and every row
   *  under them; each child keeps its own open state. A child's header starts one indent in, its rows two. With
   *  `stickyGroups` the child in force sticks under its parent (inline headers: a stacked header's height varies, so
   *  stack nested groups only without stickyGroups). A table's own `groups` only (a grouped view draws runs). */
  parent?: string;
}

/** One drawn line of the table: a row, a group header, a group's note, or a row's expanded part. */
export type Item<T, R extends RowLike<T> = RowLike<T>> = { kind: 'row'; row: R; index: number; inGroup?: boolean; deep?: true } | { kind: 'group'; group: TableGroup; count: number; run?: number; depth?: 1 } | { kind: 'note'; group: TableGroup } | { kind: 'expanded'; row: R };
/** An item's identity: its React key, and its key in the virtualizer's size cache (a measured size follows the item when
 * items move: a row expanded, collapsed, sorted or regrouped). Each kind has its own prefix, so no row id (any string
 * getRowId returns) can name another item's slot. */
export function itemKey<T, R extends RowLike<T>>(item: Item<T, R>): string {
  if (item.kind === 'row') return `r:${item.row.id}`;
  if (item.kind === 'expanded') return `x:${item.row.id}`;
  if (item.kind === 'note') return `n:${item.group.id}`;
  return item.run !== undefined ? `gr:${JSON.stringify([item.group.id, item.run])}` : `g:${item.group.id}`;
}

/** Each group's parent (TableGroup.parent), kept only when it names another group of the table that has no valid
 *  parent itself (one level). None at all for a table whose groups name no parent: it takes none of the nested paths. */
export function groupParents(groups: readonly TableGroup[] | undefined): ReadonlyMap<string, string> | undefined {
  if (!groups?.some((g) => g.parent !== undefined)) return undefined;
  const byId = new Map(groups.map((g) => [g.id, g]));
  const named = (g: TableGroup) => (g.parent !== undefined && g.parent !== g.id ? byId.get(g.parent) : undefined);
  const out = new Map<string, string>();
  for (const g of groups) {
    const p = named(g);
    if (p && !named(p)) out.set(g.id, p.id);
  }
  return out.size > 0 ? out : undefined;
}

export interface FlattenInput<T, R extends RowLike<T> = RowLike<T>> {
  /** The rows to draw (the page's slice), in order. */
  rows: readonly R[];
  groupBy?: (row: T) => string | undefined;
  groups?: readonly TableGroup[];
  /** The view menu's "Group by" switch (true without one). */
  grouped: boolean;
  isCollapsed: (id: string) => boolean;
  expanded: ReadonlySet<string>;
  renderExpanded: boolean;
  /** A grouped view's groups (runs in the view's order), not the table's own. */
  viewGroups: boolean;
  parents?: ReadonlyMap<string, string>;
}

/** The table's lines in drawing order (rows under their groups, notes, expanded parts). */
export function flattenItems<T, R extends RowLike<T> = RowLike<T>>(o: FlattenInput<T, R>): Item<T, R>[] {
  const { rows, groupBy, groups, grouped, isCollapsed, expanded, renderExpanded, viewGroups, parents } = o;
  const out: Item<T, R>[] = [];
  const push = (r: R, index: number, inGroup = false, deep = false) => {
    out.push(deep ? { kind: 'row', row: r, index, inGroup, deep } : { kind: 'row', row: r, index, inGroup });
    if (renderExpanded && expanded.has(r.id)) out.push({ kind: 'expanded', row: r });
  };
  if (!groupBy || !groups?.length || !grouped) {
    rows.forEach((r, i) => push(r, i));
    return out;
  }
  // A grouped view's rows already come in group order (client mode orders them; a server answer keeps its own), so
  // its headers open each run of one group's rows where it starts: never a row moved. An answer that comes back to a
  // group draws its header again (a later run, same count and collapse). A run's key is the pair (id, run), never a
  // joined string another group id could spell.
  if (viewGroups) {
    let i = 0;
    let last: string | undefined;
    const runs = new Map<string, number>();
    for (const r of rows) {
      const id = groupBy(r.original) ?? '';
      if (id !== last) {
        last = id;
        const g = groups.find((x) => x.id === id) ?? { id, label: id };
        const run = runs.get(id) ?? 0;
        runs.set(id, run + 1);
        out.push({ kind: 'group', group: g, count: g.count ?? 0, run });
      }
      if (!isCollapsed(id)) push(r, i++, true);
    }
    return out;
  }
  const by = new Map<string, R[]>();
  const loose: R[] = [];
  for (const r of rows) {
    const g = groupBy(r.original);
    if (g === undefined) loose.push(r);
    else {
      const list = by.get(g);
      if (list) list.push(r);
      else by.set(g, [r]);
    }
  }
  let i = 0;
  for (const r of loose) push(r, i++);
  if (!parents) {
    for (const g of groups) {
      const members = by.get(g.id) ?? [];
      if (members.length === 0 && !g.showEmpty && !g.note) continue;
      out.push({ kind: 'group', group: g, count: g.count ?? members.length });
      if (isCollapsed(g.id)) continue;
      if (g.note) out.push({ kind: 'note', group: g });
      for (const r of members) push(r, i++, true);
    }
    return out;
  }
  // Nested (TableGroup.parent): each top-level group, its own rows, then its children with theirs.
  const drawn = (g: TableGroup) => (by.get(g.id)?.length ?? 0) > 0 || Boolean(g.showEmpty) || Boolean(g.note);
  for (const g of groups) {
    if (parents.has(g.id)) continue;
    const members = by.get(g.id) ?? [];
    const kids = groups.filter((c) => parents.get(c.id) === g.id && drawn(c));
    if (members.length === 0 && kids.length === 0 && !g.showEmpty && !g.note) continue;
    const count = g.count ?? members.length + kids.reduce((n, c) => n + (c.count ?? by.get(c.id)?.length ?? 0), 0);
    out.push({ kind: 'group', group: g, count });
    if (isCollapsed(g.id)) continue;
    if (g.note) out.push({ kind: 'note', group: g });
    for (const r of members) push(r, i++, true);
    for (const c of kids) {
      const rows = by.get(c.id) ?? [];
      out.push({ kind: 'group', group: c, count: c.count ?? rows.length, depth: 1 });
      if (isCollapsed(c.id)) continue;
      if (c.note) out.push({ kind: 'note', group: c });
      for (const r of rows) push(r, i++, true, true);
    }
  }
  return out;
}
