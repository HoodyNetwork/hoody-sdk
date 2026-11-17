// pickerFocus.web.ts: the browser part of the model pickers' focus moves (ModelBrowser, ModelChooser,
// ProviderDirectory). They give the focus to a control by its id, to the first button inside a box, and ask whether
// the focus fell to the page body. On the web that is the document; the terminal's sibling
// (pickerFocus.web.term.ts) answers the same questions from its focus scope, so the pickers themselves are shared.
import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';

export interface PickerFocus {
  /** The control that has the focus now is the one the picker knows as `id` (an opener it will come back to). The
   *  web finds controls by id in the document and keeps nothing; the terminal remembers the focused control. */
  mark(id: string | null | undefined): void;
  /** Focuses an element the picker holds a ref to (a view's heading, the row that follows one that left). */
  toEl(el: HTMLElement | null | undefined): void;
  /** Focuses the control with this id. False when there is none (the caller falls back, usually to its heading). */
  toId(id: string | null | undefined): boolean;
  /** Focuses the first control matching `selector` inside a box, given as the box or as its id. False when there is none. */
  toFirst(box: string | Element | null | undefined, selector: 'button' | 'button:not([disabled])' | 'input'): boolean;
  /** The focus fell to nothing (the page body): the focused control left. */
  fell(): boolean;
  /** `target` (an event's relatedTarget) is a node inside `root`. */
  holds(root: Element | null | undefined, target: unknown): boolean;
  /** Runs `fn` once the next frame is drawn (a control that is only there after the paint). */
  later(fn: () => void): void;
}

const WEB: PickerFocus = {
  mark: () => undefined,
  toEl: (el) => {
    el?.focus();
  },
  toId: (id) => {
    const el = id ? document.getElementById(id) : null;
    if (!el) return false;
    el.focus();
    return true;
  },
  toFirst: (box, selector) => {
    const el = (typeof box === 'string' ? document.getElementById(box) : box)?.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.focus();
    return true;
  },
  fell: () => !document.activeElement || document.activeElement === document.body,
  holds: (root, target) => target instanceof Node && !!root?.contains(target),
  later: (fn) => {
    requestAnimationFrame(() => fn());
  },
};

/** The picker's focus moves. `root` is the picker's own root element: the terminal looks ids up inside it (it has no
 *  document); the web does not need it. */
export function usePickerFocus(_root?: RefObject<Element | null>): PickerFocus {
  return WEB;
}

/** The focused control inside the browser root: with its list and the keys of the rows after its row, when it is in a
 *  row (a `[data-mc-row]` whose parent is the list); a control outside every row keeps no followers. */
interface Focused {
  el: Element;
  list: Element | null;
  next: string[];
}

/** A row's identity across renders: its provider, its spec, or its own or first control's id. */
function rowKey(row: Element): string | null {
  const r = row as HTMLElement;
  return r.dataset.provider ?? r.dataset.spec ?? (r.id || row.querySelector('[id]')?.id || null);
}

function focusedIn(el: Element, root: HTMLElement | null): Focused | null {
  if (!root?.contains(el)) return null;
  const row = el.closest('[data-mc-row]');
  const list = row?.parentElement;
  if (!row || !list || !root.contains(list)) return { el, list: null, next: [] };
  const rows = Array.from(list.children);
  const next = rows.slice(rows.indexOf(row) + 1).map(rowKey);
  return { el, list, next: next.filter((k): k is string => k !== null) };
}

/** The control of the first row after the one that left that is still in its list, or null (the list went too). */
function followerOf(was: Focused, root: HTMLElement | null): HTMLElement | null {
  const list = was.list;
  if (!list?.isConnected || !root?.contains(list)) return null;
  const rows = new Map<string, Element>();
  for (const c of Array.from(list.children)) {
    const k = rowKey(c);
    if (k !== null && !rows.has(k)) rows.set(k, c);
  }
  for (const k of was.next) {
    const row = rows.get(k);
    const control = row && (row.matches('[role="option"], button:not([disabled])') ? (row as HTMLElement) : row.querySelector<HTMLElement>('[role="option"], button:not([disabled])'));
    if (control) return control;
  }
  return null;
}

// Focus that falls to the page body because the focused control left (a row whose provider just became ready, a
// listbox that emptied, a view that lost its controls) moves to the first row that followed it in the same list and
// is still there, else to the view heading. The followers are read again on every commit while the
// control stays, so earlier rows changing never shift them. Focus that moved out of the browser, or to nothing,
// forgets it. The restore runs after the view-change, setup-close and listbox restores, which own the focus they move.
// (Web only: every line asks the DOM, and the terminal has its own way to know
// which row has the focus.) The caller puts the returned handlers on its root element, and calls this after its own
// focus restores.
export function useRowFocusKeeper(pf: PickerFocus, rootRef: RefObject<HTMLDivElement | null>, headingRef: RefObject<HTMLElement | null>): { onFocus: (e: FocusEvent<HTMLDivElement>) => void; onBlur: (e: FocusEvent<HTMLDivElement>) => void } {
  const focused = useRef<Focused | null>(null);
  const onRootFocus = (e: FocusEvent<HTMLDivElement>) => {
    focused.current = focusedIn(e.target, rootRef.current);
  };
  const onRootBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Removal keeps it (the control is gone, or going); a move out of the browser or to nothing forgets it.
    if (e.target.isConnected && !pf.holds(rootRef.current, e.relatedTarget)) focused.current = null;
  };
  useLayoutEffect(() => {
    const was = focused.current;
    if (!was) return;
    if (was.el.isConnected) {
      focused.current = focusedIn(was.el, rootRef.current);
      return;
    }
    focused.current = null;
    if (!pf.fell()) return;
    pf.toEl(followerOf(was, rootRef.current) ?? headingRef.current);
  });
  return { onFocus: onRootFocus, onBlur: onRootBlur };
}
