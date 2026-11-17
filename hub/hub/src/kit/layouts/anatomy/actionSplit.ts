// The ActionBar rule's logic, shared by the web ActionBar and its terminal sibling: what a bar draws and what its ⋯
// holds, and the refusal of a repeated id or label in one group (dev builds and tests).
import type { MenuAction, MenuList } from '../../overlays/Menu';
import { isLinkSpec, type AnyAction, type SectionActions } from './types';

/** The content width below which secondaries fold into ⋯ (`@container content (width < 600px)` in the kit CSS), measured on
 *  the same container. */
export const FOLD_BELOW = 600;

/** The most suggestions one row holds: past it, the list is a choice, not a row of shortcuts (a Select or a menu). */
export const SUGGESTIONS_MAX = 8;

export interface BarSplit {
  primary?: AnyAction;
  shown: readonly AnyAction[];
  menu: MenuList;
}

const toMenuItem = (a: Exclude<AnyAction, { href: string }>): MenuAction => ({
  id: a.id,
  // A menu item has one name: the fuller one when the action has it, so folding keeps its context.
  label: a.name ?? a.label,
  icon: a.icon,
  tone: a.tone,
  isDisabled: a.disabledReason !== undefined || a.busy === true,
  disabledReason: a.disabledReason,
  opens: a.opens === 'dialog',
  onAction: a.onPress,
});

/** What the bar draws and what its ⋯ holds, for a narrow or a wide content area. */
export function splitActions(actions: SectionActions, narrow: boolean): BarSplit {
  const secondary = actions.secondary ?? [];
  const shown: AnyAction[] = [];
  const folded: MenuAction[] = [];
  for (const a of secondary) {
    if (narrow && !isLinkSpec(a)) folded.push(toMenuItem(a));
    else shown.push(a);
  }
  const rest = actions.menu ?? [];
  const menu: MenuList = folded.length === 0 ? rest : rest.length === 0 ? folded : [...folded, '-', ...rest];
  return { primary: actions.primary, shown, menu };
}

/** Every id and label of a group, in order: a repeat is refused (dev builds and tests). */
export function assertDistinct(actions: SectionActions): void {
  assertDistinctList([actions.primary, ...(actions.secondary ?? [])], actions.menu ?? []);
}

export function assertDistinctList(list: readonly (AnyAction | undefined)[], menu: MenuList = []): void {
  const seen = new Map<string, string>();
  const note = (kind: string, value: string) => {
    const k = `${kind}\u0000${value}`;
    if (seen.has(k)) throw new Error(`ActionBar: the ${kind} "${value}" appears twice in one group of actions`);
    seen.set(k, value);
  };
  const walk = (items: MenuList) => {
    for (const e of items) {
      if (e === '-') continue;
      if ('items' in e) walk(e.items);
      else {
        note('id', e.id);
        note('label', e.label);
      }
    }
  };
  for (const a of list) {
    if (!a) continue;
    note('id', a.id);
    note('label', a.label);
  }
  walk(menu);
}

/** The focus-follow key of a row of actions: an action that turns disabled is a new element (a ReasonButton). */
export const actionShape = (list: readonly (AnyAction | undefined)[]): string =>
  list.map((a) => (a ? `${a.id}${isLinkSpec(a) || a.disabledReason === undefined ? '' : '!'}` : '')).join(' ');
