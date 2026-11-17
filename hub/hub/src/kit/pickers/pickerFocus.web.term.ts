// The terminal sibling of pickerFocus.web.ts: the model pickers' focus moves without a document.
// - A kit Button passes its web `id` to the focus scope: `toId(id)` asks the scope for it (focusDomId), now or, for a
//   control of the view this commit shows, after this tick.
// - Another kit control (a listbox row) has no id to find. `mark(id)` remembers the control that has the focus when the
//   picker notes one it will come back to (it was just pressed, so it is the focused one), and `toId(id)` gives the
//   focus back to it while it is still drawn.
// - A raw element of the picker (a rows box) is looked up by id among the picker root's elements.
// - Anything else answers false: the picker then falls back as it does on the web when a control is gone (its heading).
// - A heading with tabIndex -1 takes the focus as on the web (focus() reaches it, Tab does not). An element that takes
//   none gives it to what Tab from it would reach (the first control after it), so the focus is never nowhere.
// - A move to "the first control inside a box" waits one tick: the picker asks from a layout effect, before the new
//   view has been laid out, and the focus scope orders controls by where they are drawn. The newest ask wins.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type * as Web from './pickerFocus.web';
import { useFocusControl, useFocusedNode, type BoxRenderable, type FocusId } from '@term/kit';

export type { PickerFocus } from './pickerFocus.web';

/** What a compat element answers (src/term/jsx/element.ts), as far as this file asks. */
interface TermEl {
  id: string;
  isConnected: boolean;
  parentElement: TermEl | null;
  nextElementSibling: TermEl | null;
  dataset: Record<string, string | undefined>;
  children: TermEl[];
  focus(): void;
  contains(other: unknown): boolean;
  querySelector(selector: string): TermEl | null;
  querySelectorAll(selector: string): TermEl[];
  __node(): BoxRenderable | null;
}
const termEl = (x: unknown): TermEl | null =>
  typeof x === 'object' && x !== null && (x as { __termElement?: unknown }).__termElement === true ? (x as TermEl) : null;

const byId = (root: TermEl | null, id: string): TermEl | null => {
  if (!root) return null;
  if (root.id === id) return root;
  return root.querySelectorAll('[id]').find((e) => e.id === id) ?? null;
};

/** When a deferred move is tried, in ms after the ask and then after each failed try. */
const TRIES = [0, 40, 120] as const;

/** One count for every picker on screen (a browser, its directory, a consent bar): a deferred move runs only while
 *  no later one was asked. */
let asked = 0;
/** The id toId could not find yet, and the ask count then: the toEl that follows at once tries it first. */
let owed: { id: string; at: number } | null = null;
/** Deferred moves still trying: a restore that owns the focus it moves is on its way (useRowFocusKeeper waits for none). */
let pending = 0;

export const usePickerFocus: typeof Web.usePickerFocus = (root) => {
  const focus = useFocusControl();
  const marks = useRef(new Map<string, FocusId>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return useMemo<Web.PickerFocus>(() => {
    const rootEl = () => termEl(root?.current);
    const firstIn = (el: TermEl | null): boolean => {
      const node = el?.__node() ?? null;
      return node ? focus.focusFirst(node, 'asked') : false;
    };
    /** Focuses the first control after `el` in the picker, in order. With `inOrder`, a box that is not laid out yet
     *  ends the walk (false: try again once it is) instead of being skipped for a later one. */
    const after = (el: TermEl, inOrder: boolean): boolean => {
      if (!el.isConnected) return true;
      const top = rootEl();
      for (let e: TermEl | null = el; e && e !== top; e = e.parentElement) {
        for (let s = e.nextElementSibling; s; s = s.nextElementSibling) {
          // Not laid out yet: the focus scope orders controls by where they are drawn, so "first" would be a guess.
          const n = s.__node();
          if (inOrder && (!n || n.width === 0 || n.height === 0)) return false;
          if (firstIn(s)) return true;
        }
      }
      return false;
    };
    /** Runs `move` after this tick, and again while it answers false (the new view is laid out a frame or two
     *  later), unless the picker went or something asked for the focus since. `last` runs when every try failed. */
    const defer = (move: () => boolean, last?: () => void): void => {
      const mine = ++asked;
      pending += 1;
      const go = (n: number): void => {
        setTimeout(() => {
          if (!alive.current || mine !== asked || move()) { pending -= 1; return; }
          if (n + 1 < TRIES.length) go(n + 1);
          else { pending -= 1; last?.(); }
        }, TRIES[n]);
      };
      go(0);
    };
    return {
      mark: (id) => {
        const at = focus.current();
        if (id && at !== null) marks.current.set(id, at);
      },
      toEl: (x) => {
        const el = termEl(x);
        if (!el) return;
        // The id asked for just before (`if (!pf.toId(id)) pf.toEl(heading)`) comes first once its control is drawn.
        const id = owed !== null && owed.at === asked ? owed.id : null;
        owed = null;
        const own = (): boolean => {
          el.focus();
          const node = el.__node();
          return node !== null && focus.containsFocus(node);
        };
        asked += 1;
        if (id === null && own()) return;
        // A control registers with the focus scope after this commit's layout effects: try once it has. An element that
        // still takes no focus gives it to the first control after it inside the picker, else the picker's first.
        defer(
          () => !el.isConnected || (id !== null && focus.focusDomId(id)) || own() || after(el, true),
          () => {
            if (el.isConnected && !after(el, false)) firstIn(rootEl());
          },
        );
      },
      toId: (id) => {
        if (!id) return false;
        // A kit control that passes its web id on (a Button), as document.getElementById(id).focus().
        if (focus.focusDomId(id)) {
          asked += 1;
          return true;
        }
        const marked = marks.current.get(id);
        if (marked !== undefined) {
          focus.restore(marked);
          if (focus.current() === marked) {
            asked += 1;
            return true;
          }
          marks.current.delete(id);
        }
        const el = byId(rootEl(), id);
        if (el) {
          asked += 1;
          el.focus();
          return true;
        }
        // Not drawn yet (a control of the view this commit shows registers after its layout effects): asked again after
        // this tick. The answer is false, so a caller's fallback (toEl) still runs and takes this id with it.
        defer(() => focus.focusDomId(id));
        owed = { id, at: asked };
        return false;
      },
      toFirst: (box) => {
        const el = typeof box === 'string' ? byId(rootEl(), box) : termEl(box);
        if (!el) return false;
        defer(() => !el.isConnected || firstIn(el));
        return true;
      },
      fell: () => focus.current() === null,
      holds: (within, target) => termEl(within)?.contains(target) ?? false,
      later: (fn) => {
        setTimeout(() => {
          if (alive.current) fn();
        }, 0);
      },
    };
  }, [focus, root]);
};

/** What had the focus inside the browser: its drawn node, and when it sits in a row (`[data-mc-row]`), the row, its
 *  list and the keys of the rows after it. */
interface Kept {
  node: BoxRenderable;
  row: TermEl | null;
  list: TermEl | null;
  next: string[];
}
const rowKey = (row: TermEl): string | null => row.dataset.provider ?? row.dataset.spec ?? (row.id || row.querySelector('[id]')?.id || null);
const gone = (k: Kept): boolean => (k.node as { isDestroyed?: boolean }).isDestroyed === true || (k.row !== null && !k.row.isConnected);

/** In the terminal a kit control's focus fires no focus event on the browser's root element, so the row that
 *  has the focus is read from the focus scope each time the focus moves (and its followers again on every commit).
 *  When that control leaves and nothing took the focus, it goes to the first control of the first following row still
 *  in the list, else to the view heading. A restore of the browser's own that is still on its way keeps the focus it
 *  moves. A row here is a row drawn from an element (a directory row or card); a control in no such row falls back
 *  to the heading. */
export const useRowFocusKeeper: typeof Web.useRowFocusKeeper = (pf, rootRef, headingRef) => {
  const focus = useFocusControl();
  const was = useRef<Kept | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const read = (node: BoxRenderable): Kept | null => {
    const top = termEl(rootRef.current);
    const topNode = top?.__node() ?? null;
    if (!top || !topNode) return null;
    const chain = new Set<unknown>();
    let inside = false;
    for (let n: { parent?: unknown } | null = node; n; n = (n.parent as { parent?: unknown } | null | undefined) ?? null) {
      if (n === (topNode as unknown)) {
        inside = true;
        break;
      }
      chain.add(n);
    }
    if (!inside) return null;
    // The innermost row around the control (the web's closest): the last one in reading order.
    let row: TermEl | null = null;
    for (const r of top.querySelectorAll('[data-mc-row]')) if (chain.has(r.__node())) row = r;
    const list = row?.parentElement ?? null;
    if (!row || !list) return { node, row: null, list: null, next: [] };
    const rows = list.children;
    const next = rows.slice(rows.indexOf(row) + 1).map(rowKey);
    return { node, row, list, next: next.filter((k): k is string => k !== null) };
  };
  const restore = (k: Kept): void => {
    if (!alive.current || focus.current() !== null || pending > 0) return;
    if (k.list?.isConnected) {
      const rows = new Map<string, TermEl>();
      for (const c of k.list.children) {
        const key = rowKey(c);
        if (key !== null && !rows.has(key)) rows.set(key, c);
      }
      for (const key of k.next) {
        const node = rows.get(key)?.__node() ?? null;
        if (node && focus.focusFirst(node, 'asked')) return;
      }
    }
    pf.toEl(headingRef.current);
  };
  useFocusedNode((node) => {
    if (node) {
      was.current = read(node);
      return;
    }
    const k = was.current;
    was.current = null;
    // Nothing has the focus: the control left (its row with it), or the focus was taken away on purpose (forgotten).
    // Asked after this tick: the focus scope is telling its listeners now, and a restore asked in this commit runs first.
    if (k && gone(k)) setTimeout(() => restore(k), 0);
  });
  useLayoutEffect(() => {
    const k = was.current;
    if (k && !gone(k)) was.current = read(k.node) ?? k;
  });
  return { onFocus: () => undefined, onBlur: () => undefined };
};
