// Row actions of DataTable, pure: the one split of a row's actions, shared by the web table and its
// terminal sibling. DataTable.tsx re-exports everything here.
import type { MenuAction } from '../overlays/Menu';

/**
 * One row action, declared once and shown once (never twice in one row). `inline` draws it as a
 * labelled button (Start, Resume), `hover` as an icon button on row hover/focus, `rowOpen` makes it the row's own
 * open; the ⋯ menu lists the rest (`splitActions`). `key` runs it from the keyboard-active row.
 */
export interface RowAction extends MenuAction {
  /** Always visible as a labelled secondary button without a chip, in every presentation, at the row control size (the
   * kit Button's `sm`; `xs` in a compact table or a rail). The first inline action of a row is shown; keep it to the
   * one thing people do most. */
  inline?: boolean;
  /** The inline button's visible label (1 to 3 words) when `label` is long; `label` stays its accessible name and
   * the menu text and the button's tooltip, so it must contain `short` (WCAG 2.5.3, label in name: "Start" for
   * "Start cedar"). */
  short?: string;
  /** An icon button shown on row hover and focus with a fine pointer in table rows (up to two). Needs `icon`. */
  hover?: boolean;
  /** Single key on the keyboard-active row ('s'); shown as the menu item's shortcut. */
  key?: string;
  /** The row's own open: a row click, Enter on the focused row and, without hover (touch), the row's chevron run it.
   * Never drawn inline or listed in ⋯: the row is its affordance. At most one per row, and never with
   * `onRowAction` or in a table whose row click picks (a dev build throws). */
  rowOpen?: true;
}

/** Actions in menu order; '-' draws a separator in the ⋯ menu. */
export type RowActionEntry = RowAction | '-';

const isAction = (e: RowActionEntry): e is RowAction => e !== '-';

/** Where a row's actions are drawn: the presentation, the pointer ('coarse' also for a pointer that cannot hover), and
 * whether the row is hovered or holds focus. */
export interface RowActionState {
  presentation: 'table' | 'list' | 'cards';
  pointer: 'fine' | 'coarse';
  rowFocused: boolean;
  hovered: boolean;
}

/** A row's actions split once: its own open, the actions drawn in the row, and the ⋯ menu (everything else). */
export interface RowActionSplit {
  rowOpen?: RowAction;
  shown: RowAction[];
  menu: RowActionEntry[];
}

/**
 * The one split of a row's actions: the renderer draws `shown` and the ⋯ menu lists `menu`, both from
 * this call, so no action is ever drawn and listed at once, and none is lost. `shown` is the first inline action, then
 * up to two hover actions with an icon, which are drawn only in table rows, with a fine pointer, while the row is
 * hovered or holds focus. `rowOpen` is in neither. The menu has no leading, trailing or doubled separator.
 */
export function splitActions(entries: readonly RowActionEntry[], state: RowActionState): RowActionSplit {
  const real = entries.filter(isAction);
  const rowOpen = real.find((a) => a.rowOpen);
  const inline = real.find((a) => a.inline && !a.rowOpen);
  const hoverDrawn = state.presentation === 'table' && state.pointer === 'fine' && (state.rowFocused || state.hovered);
  const hover = hoverDrawn ? real.filter((a) => a.hover && a.icon && !a.inline && !a.rowOpen).slice(0, 2) : [];
  const shown = inline ? [inline, ...hover] : hover;
  const out = new Set<RowAction>(shown);
  if (rowOpen) out.add(rowOpen);
  const menu: RowActionEntry[] = [];
  for (const e of entries) {
    if (e === '-') {
      if (menu.length > 0 && menu[menu.length - 1] !== '-') menu.push(e);
    } else if (!out.has(e)) menu.push(e);
  }
  if (menu[menu.length - 1] === '-') menu.pop();
  return { rowOpen, shown, menu };
}
