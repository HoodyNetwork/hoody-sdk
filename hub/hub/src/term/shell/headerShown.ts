// Whether a page header is on screen, for the top bar: it names the page whenever no header is visible (none mounted,
// or the page scrolled its header out of view) and hides the name only while a header is visible. Never both, never
// neither. Each mounted header reports its own visibility; a header that has not been placed yet counts as visible
// (the first frame does not flash the name and take it away again).
import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';

const visible = new Map<symbol, boolean>();
const subs = new Set<() => void>();
const tell = (): void => { for (const f of subs) f(); };
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
const read = (): boolean => { for (const v of visible.values()) if (v) return true; return false; };

interface Node {
  y: number; height: number;
  isDestroyed?: boolean;
  parent?: Node | null;
  viewport?: Node;
  onLifecyclePass?: (() => void) | null;
}

/** The nearest enclosing scroll box (it has a viewport), or null when the node is not inside one. */
function scrollOf(n: Node): Node | null {
  for (let p = n.parent ?? null; p; p = p.parent ?? null) if (p.viewport) return p;
  return null;
}

/** Whether the node's first row lies inside its scroll box's viewport (no scroll box: always). */
export function rowInView(n: Node, scroll: Node | null): boolean {
  const vp = scroll?.viewport;
  if (!vp) return true;
  return n.y >= vp.y && n.y < vp.y + vp.height;
}

/** Runs `pass` after the node's lifecycle pass; returns the remove. One hook per node holds every pass, so headers
 *  that unmount in any order leave at most that one hook behind (unhooked when it is still the chain's top, as
 *  centre.ts does), never a growing chain. */
const hooks = new WeakMap<Node, Set<() => void>>();
function chain(n: Node, pass: () => void): () => void {
  let passes = hooks.get(n);
  if (!passes) {
    const set = new Set<() => void>();
    const before = n.onLifecyclePass ?? null;
    const mine = (): void => {
      before?.();
      for (const f of set) f();
      if (set.size === 0 && hooks.get(n) === set && !n.isDestroyed && n.onLifecyclePass === mine) {
        n.onLifecyclePass = before;
        hooks.delete(n);
      }
    };
    n.onLifecyclePass = mine;
    hooks.set(n, set);
    passes = set;
  }
  passes.add(pass);
  const own = passes;
  return () => { own.delete(pass); };
}

/** A page header reports itself while mounted; `node` is its first row's renderable. Judged after each layout of the
 *  enclosing scroll box (which draws every frame, where a culled header out of view may not). */
export function useReportPageHeader(node: RefObject<unknown>): void {
  useLayoutEffect(() => {
    const id = Symbol('page-header');
    visible.set(id, true);
    tell();
    const n = node.current as Node | null;
    const scroll = n ? scrollOf(n) : null;
    const pass = (): void => {
      if (!n || n.isDestroyed || !visible.has(id)) return;
      const now = rowInView(n, scroll);
      if (visible.get(id) !== now) { visible.set(id, now); queueMicrotask(tell); }
    };
    const unhook = n ? chain(scroll ?? n, pass) : undefined;
    return () => { unhook?.(); visible.delete(id); tell(); };
  }, [node]);
}

export const usePageHeaderShown = (): boolean => useSyncExternalStore(subscribe, read, read);
