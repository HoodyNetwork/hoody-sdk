// The ActionMenu's model: items, groups, the sections they render as, the reasons
// said once, keyboard-open focus and the footer section. Pure: shared by the web menu (Menu.tsx re-exports it) and the
// terminal menu (Menu.term.tsx).
import type { ReactElement } from 'react';
import { copyText } from '../data/Ids';
import type { IconName } from '../icons';

export interface MenuAction {
  id: string;
  label: string;
  icon?: IconName;
  /** A small picture in the lead place instead of an icon (a `MenuThumb`). */
  picture?: ReactElement;
  /** Keyboard hint shown at the end of the row. */
  shortcut?: string;
  tone?: 'default' | 'danger';
  isDisabled?: boolean;
  /** The item opens a dialog or drawer: its label ends with "…" (added when missing). */
  opens?: boolean;
  /** What it does, one short line under the label, enabled or not; a disabled item's `disabledReason` takes its place. */
  description?: string;
  /** Why it is disabled, one short line under the label ("Stop it first"). */
  disabledReason?: string;
  /** Copy this text instead of acting: the item confirms inline ("Copied"), then the menu closes. */
  copy?: string;
  /** An on/off choice: set it (true or false) to make the item a menuitemcheckbox; leave it out for a plain item. */
  checked?: boolean;
  /** Runs on choice; for a copy item, after a successful copy (pass `() => undefined` if nothing else happens). */
  onAction: () => void;
}

/** Run an item outside the menu (a row's single-key shortcut): copies for a copy item, then acts. */
export async function runMenuAction(i: MenuAction): Promise<boolean> {
  if (i.copy === undefined) {
    i.onAction();
    return true;
  }
  const ok = await copyText(i.copy);
  if (ok) i.onAction();
  return ok;
}

/** How long a copy item shows "Copied" before the menu closes, in ms. */
export const COPIED_MS = 1500;

/** Items; a `'-'` entry draws a separator. */
export type MenuEntry = MenuAction | '-';

export type PlainAction = Omit<MenuAction, 'checked'> & { checked?: never };
interface MenuGroupBase {
  id: string;
  /** Shown above the group in the one label shape; also its accessible name. */
  label?: string;
  /** The group's accessible name when it shows no label (required for a one-of group without one). */
  name?: string;
  /** The reason for every disabled item of the group that has none of its own, said once at its top. */
  note?: string;
}
/** A run of rows between rules that declares its kind; only a plain group may hold danger items. */
export type MenuGroup =
  | (MenuGroupBase & { select?: undefined; items: readonly PlainAction[] })
  | (MenuGroupBase & { select: 'one'; current: string | null; items: readonly (PlainAction & { tone?: 'default' })[] })
  | (MenuGroupBase & { select: 'many'; items: readonly (MenuAction & { checked: boolean; tone?: 'default' })[] });
/** What ActionMenu takes: legacy entries and groups, in order. */
export type MenuList = readonly (MenuEntry | MenuGroup)[];

const isGroup = (e: MenuEntry | MenuGroup): e is MenuGroup => e !== '-' && 'items' in e;

/** One rendered section (exported for tests). Ids are the menu's own: `line` and note ids are what aria-describedby names. */
export interface MenuSectionModel {
  key: string;
  label?: string;
  name?: string;
  select?: 'one' | 'many';
  current?: string | null;
  danger: boolean;
  /** A rule above it: the first section of each later group, and the first of the danger area. */
  rule: boolean;
  notes: { id: string; text: string; describes: readonly string[] }[];
  items: { action: MenuAction; line?: { id: string; text: string }; describedBy: readonly string[] }[];
}

interface Source {
  /** The section identity's parts: ['g', group id] or ['e', run of loose entries] (sectionKey makes the string). */
  key: readonly (string | number)[];
  label?: string;
  name?: string;
  select?: 'one' | 'many';
  current?: string | null;
  note?: string;
  items: readonly MenuAction[];
  legacy: boolean;
}
interface Resolved { action: MenuAction; reason?: { text: string; fromNote: boolean } }
interface Draft { key: readonly (string | number)[]; label?: string; name?: string; select?: 'one' | 'many'; current?: string | null; danger: boolean; lead: boolean; members: Resolved[] }

/** Runs of plain and checked items, in order (a legacy checked run gets its own selection section). */
function checkRuns<T>(xs: readonly T[], checked: (x: T) => boolean): T[][] {
  const runs: T[][] = [];
  for (const x of xs) {
    const last = runs[runs.length - 1];
    if (last?.[0] !== undefined && checked(last[0]) === checked(x)) last.push(x);
    else runs.push([x]);
  }
  return runs;
}
const isChecked = (r: Resolved) => r.action.checked !== undefined;

/** A section's key from its identity parts: distinct parts give distinct keys whatever the ids hold (a group 'files'
 *  with a danger item and a group 'files-danger' stay apart); menuSections then keeps it off every item id too, since
 *  sections and items share React Aria's key space. */
const sectionKey = (parts: readonly (string | number)[]) => JSON.stringify(parts);

/** Dev diagnostics already told, by menu (the menu's id) and kind: each kind said once per menu, whatever ids it names
 *  then, never in production. */
const told = new Set<string>();
function tell(menuId: string, kind: string, text: string) {
  if (!import.meta.env.DEV) return;
  const k = `${menuId}\n${kind}`;
  if (told.has(k)) return;
  if (told.size > 1000) told.clear();
  told.add(k);
  console.error(text);
}

/** The rendered sections, in four ordered steps: each item's reason is resolved in its own group; danger
 *  items move to the danger area with their reason and their group's label or name; a section shows a note for a reason
 *  it shares (its group's note, or one reason of two or more disabled items) and each item says the rest on its own line;
 *  then each item's description ids name only lines that are rendered. Recomputed on every render. */
export function menuSections(items: MenuList, menuId = 'menu'): MenuSectionModel[] {
  const sources: Source[] = [];
  let loose: MenuAction[] = [];
  const flush = () => {
    if (loose.length) sources.push({ key: ['e', sources.length], items: loose, legacy: true });
    loose = [];
  };
  for (const e of items) {
    if (e === '-') flush();
    else if (isGroup(e)) {
      flush();
      if (e.select === 'one' && e.label === undefined && e.name === undefined)
        tell(menuId, 'unnamed one-of', `ActionMenu: the one-of group '${e.id}' has no label or name, so its radio group is unnamed. Give it a label, or a name.`);
      sources.push({ key: ['g', e.id], label: e.label, name: e.name, select: e.select, current: e.select === 'one' ? e.current : undefined, note: e.note, items: e.items as readonly MenuAction[], legacy: false });
    } else loose.push(e);
  }
  flush();

  // 1. Each item's reason, in its source group.
  const missing: string[] = [];
  const resolve = (src: Source, a: MenuAction): Resolved => {
    if (!a.isDisabled) return { action: a };
    if (a.disabledReason) return { action: a, reason: { text: a.disabledReason, fromNote: false } };
    if (src.note) return { action: a, reason: { text: src.note, fromNote: true } };
    missing.push(a.id);
    return { action: a };
  };

  // 2. Regroup: danger items (from plain groups and legacy entries) to the danger area, one section per source group;
  // legacy danger items share one, split into homogeneous runs.
  const drafts: Draft[] = [];
  const dangerSlots: (Draft | Resolved[])[] = [];
  let looseDanger: Resolved[] | null = null;
  for (const src of sources) {
    const res = src.items.map((a) => resolve(src, a));
    const movable = src.select === undefined;
    const stay = movable ? res.filter((r) => r.action.tone !== 'danger') : res;
    const moved = movable ? res.filter((r) => r.action.tone === 'danger') : [];
    if (src.legacy) {
      checkRuns(stay, isChecked).forEach((run, ri) =>
        drafts.push({ key: [...src.key, ri], select: run[0] && isChecked(run[0]) ? 'many' : undefined, danger: false, lead: ri === 0, members: run }));
      if (moved.length) {
        if (!looseDanger) dangerSlots.push((looseDanger = []));
        looseDanger.push(...moved);
      }
    } else {
      if (stay.length) drafts.push({ key: src.key, label: src.label, name: src.name, select: src.select, current: src.current, danger: false, lead: true, members: stay });
      if (moved.length) dangerSlots.push({ key: [...src.key, 'danger'], label: src.label, name: src.name, danger: true, lead: false, members: moved });
    }
  }
  dangerSlots.forEach((slot, si) => {
    if (!Array.isArray(slot)) drafts.push({ ...slot, lead: si === 0 });
    else checkRuns(slot, isChecked).forEach((run, ri) =>
      drafts.push({ key: ['d', ri], select: run[0] && isChecked(run[0]) ? 'many' : undefined, danger: true, lead: si === 0 && ri === 0, members: run }));
  });

  // A dev diagnostic, never thrown: the item still renders disabled.
  if (missing.length) tell(menuId, 'missing reason', `ActionMenu: disabled item(s) without a reason: ${missing.join(', ')}. Give each a disabledReason, or its group a note.`);

  // Section keys, unique and never an item's id.
  const taken = new Set(drafts.flatMap((d) => d.members.map((m) => m.action.id)));
  const keys = drafts.map((d) => {
    let k = sectionKey(d.key);
    while (taken.has(k)) k += '#';
    taken.add(k);
    return k;
  });

  // 3 and 4. Notes per rendered section, then each item's line and description ids. Lines ('l') and notes ('n') never
  // share an id: their prefixes differ, an item id is one encoded token, and a note's index comes before its section key.
  const lineId = (a: MenuAction) => `${menuId}-l-${encodeURIComponent(a.id)}`;
  return drafts.map((d, di) => {
    const noteId = (k: number) => `${menuId}-n${k}-${encodeURIComponent(keys[di] ?? '')}`;
    // A group note shows where a disabled item of this section took it; in the danger area it counts like an own reason.
    const explicit = d.danger ? undefined : d.members.find((m) => m.reason?.fromNote)?.reason?.text;
    const count = new Map<string, number>();
    for (const m of d.members) if (m.reason && m.reason.text !== explicit) count.set(m.reason.text, (count.get(m.reason.text) ?? 0) + 1);
    const noteTexts = [...(explicit !== undefined ? [explicit] : []), ...[...count].filter(([, n]) => n > 1).map(([t]) => t)];
    const notes = noteTexts.map((text, k) => ({ id: noteId(k), text, describes: [] as string[] }));
    const sectionItems = d.members.map((m) => {
      const a = m.action;
      const note = m.reason ? notes.find((n) => n.text === m.reason?.text) : undefined;
      if (m.reason && !note) {
        const line = { id: lineId(a), text: m.reason.text };
        return { action: a, line, describedBy: [line.id] };
      }
      note?.describes.push(a.id);
      const line = a.description ? { id: lineId(a), text: a.description } : undefined;
      return { action: a, line, describedBy: [...(note ? [note.id] : []), ...(line ? [line.id] : [])] };
    });
    return {
      key: keys[di] ?? sectionKey(d.key),
      label: d.label,
      name: d.name,
      select: d.select,
      current: d.current,
      danger: d.danger,
      rule: d.lead && di > 0,
      notes,
      items: sectionItems,
    };
  });
}

/** The label as shown: "Rename…" for an item that opens a dialog or drawer. */
export function menuLabel(i: MenuAction): string {
  return i.opens && !i.label.endsWith('…') ? `${i.label}…` : i.label;
}

/** Keyboard-opened focus: the current item of the first one-of group, else the first enabled non-danger
 *  item, else the first item; a danger item only when nothing else exists. */
export function menuInitialKey(sections: readonly MenuSectionModel[]): string | undefined {
  // The FIRST one-of group decides: with no current there (null, or an id it does not hold), the fallback, never
  // a later group's current.
  const one = sections.find((x) => x.select === 'one');
  if (one?.current != null && one.items.some((i) => i.action.id === one.current)) return one.current;
  const all = sections.flatMap((x) => x.items.map((i) => i.action));
  return (all.find((a) => !a.isDisabled && a.tone !== 'danger') ?? all.find((a) => a.tone !== 'danger') ?? all[0])?.id;
}

/** The footer's section, drawn last: its key kept off every section key and item id, each item's line its
 *  disabled reason or its description. */
export function footerSection(footer: readonly (MenuAction | undefined)[] | undefined, sections: readonly MenuSectionModel[], menuId = 'menu'): MenuSectionModel | undefined {
  const acts = (footer ?? []).filter((a): a is MenuAction => a !== undefined);
  if (acts.length === 0) return undefined;
  // The section key shares React Aria's collection with every item key, the footer's own items included.
  const taken = new Set([...sections.flatMap((x) => [x.key, ...x.items.map((i) => i.action.id)]), ...acts.map((a) => a.id)]);
  let key = sectionKey(['f']);
  while (taken.has(key)) key += '#';
  const missing = acts.filter((a) => a.isDisabled && !a.disabledReason).map((a) => a.id);
  if (missing.length) tell(menuId, 'missing reason', `ActionMenu: disabled footer item(s) without a reason: ${missing.join(', ')}. Give each a disabledReason.`);
  const items = acts.map((a) => {
    const text = a.isDisabled ? a.disabledReason : a.description;
    const line = text ? { id: `${menuId}-l-${encodeURIComponent(a.id)}`, text } : undefined;
    return { action: a, line, describedBy: line ? [line.id] : [] };
  });
  // No rule: the footer draws its own hairline (MenuFooter's look).
  return { key, danger: false, rule: false, notes: [], items };
}

