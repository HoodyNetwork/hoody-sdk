// Page keys in the terminal. A page declares the same list as on the web, into the same store, matched by the same
// rule (pageShortcuts.pure.ts): single keys, chords and whileTyping included. Inside the terminal shell the shell
// keymap (src/term/shell/keymap.ts) runs them in the web's order (global keys first, then the page's); the shell
// claims the order with claimPageKeyOrder, exactly as the web's useGlobalKeys does. Outside a shell (a page or kit
// test drawn alone) the hook's own key handler runs them, as the web's standalone listener does.
// A key that belongs to an element (`within`: a Files pane's box) is judged by the focus here, the terminal's own
// part: no DOM listener on the element can scope it as the web's does.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type * as Web from './pageShortcuts';
import { useFocusControl, useKeys, type FocusControl } from '../term/prim';
import { hubKey } from '../term/shell/hubKey';
import {
  addPageShortcutList,
  findPageShortcut,
  pageShortcutGroups as groupsOf,
  pageShortcutId as idOf,
  pageShortcutKeys as keysOf,
  pageShortcutSignature,
  pageShortcutSnapshot,
  publishPageShortcuts,
  runPageShortcut as runById,
  subscribePageShortcuts,
  type PageShortcut,
} from './pageShortcuts.pure';

export type { PageShortcutMod, PageShortcut, PageShortcutRow, PageShortcutGroup } from './pageShortcuts';

let shellHandlers = 0;

/** Every mounted part's latest declarations: a key with `within` looks at the other parts' elements. */
const declared = new Set<{ readonly current: readonly PageShortcut[] }>();

type Drawn = Parameters<FocusControl['containsFocus']>[0];
/** The engine node behind a ref on a raw tag (the compat element's `__node()`), else null. */
function nodeOf(el: unknown): Drawn {
  const f = el && typeof el === 'object' ? (el as { __node?: unknown }).__node : undefined;
  return typeof f === 'function' ? ((f.call(el) as Drawn | undefined) ?? null) : null;
}

/** The list as the store reads it: a key with `within` whose element does not hold the focus is off while another
 *  part's element declaring the same key holds it (with two Files panes, the focused pane's Backspace goes up). With
 *  no element holding the focus every declaration stays on, so the first-mounted one has it, as before. */
function byFocus(list: readonly PageShortcut[], focus: FocusControl): readonly PageShortcut[] {
  if (!list.some((s) => s.within)) return list;
  const holds = (w: NonNullable<PageShortcut['within']>): boolean => focus.containsFocus(nodeOf(w.current));
  return list.map((s) => {
    if (!s.within || s.enabled === false || holds(s.within)) return s;
    const id = idOf(s);
    const other = [...declared].some((l) => l.current.some((o) => o.within && o.within !== s.within && o.enabled !== false && idOf(o) === id && holds(o.within)));
    return other ? { ...s, enabled: false } : s;
  });
}

export const pageShortcutId: typeof Web.pageShortcutId = (s) => idOf(s);
/** Mod is Ctrl in a terminal: the platform is never Apple's here. */
export const pageShortcutKeys: typeof Web.pageShortcutKeys = (s, apple = false) => keysOf(s, apple);
export const pageShortcutGroups: typeof Web.pageShortcutGroups = (list) => groupsOf(list);

/** The DOM event path of the web shell: no KeyboardEvent arrives in a terminal (the shell keymap calls the store). */
export const runPageKeys: typeof Web.runPageKeys = () => false;

/** For the terminal shell: while claimed, page keys run only through the shell keymap. */
export const claimPageKeyOrder: typeof Web.claimPageKeyOrder = () => {
  shellHandlers += 1;
  return () => { shellHandlers -= 1; };
};

export const usePageShortcuts: typeof Web.usePageShortcuts = (list) => {
  const latest = useRef(list);
  latest.current = list;
  const sig = pageShortcutSignature(list);
  // The store reads the list through the focus at each read (a key, the palette's run), so a focus move between two
  // parts needs no new render to move a `within` key.
  const focus = useFocusControl();
  const judged = useMemo(() => ({ get current() { return byFocus(latest.current, focus); } }), [focus]);
  useEffect(() => {
    declared.add(latest);
    const off = addPageShortcutList(judged);
    return () => { declared.delete(latest); off(); };
  }, [judged]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    publishPageShortcuts();
  }, [sig]);
  // Outside a shell: the page's keys still work (a single key the focused control declined, or a chord).
  useKeys((k) => {
    if (shellHandlers > 0) return false;
    const hit = findPageShortcut(hubKey(k), { typing: false, frame: false, controlKeeps: false });
    if (!hit) return false;
    hit.run();
    return true;
  });
};

export const useCurrentPageShortcuts: typeof Web.useCurrentPageShortcuts = () => useSyncExternalStore(subscribePageShortcuts, pageShortcutSnapshot, pageShortcutSnapshot);
export const usePageShortcutGroups: typeof Web.usePageShortcutGroups = () => {
  const list = useCurrentPageShortcuts();
  return useMemo(() => groupsOf(list), [list]);
};
export const runPageShortcut: typeof Web.runPageShortcut = (id) => runById(id);
