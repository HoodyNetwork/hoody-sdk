// useKeyshortcuts: sets aria-keyshortcuts on a kit control whose React Aria element drops the prop.
import { type Ref, type RefCallback, useCallback } from 'react';

/**
 * A control's keyboard shortcut for assistive tech (aria-keyshortcuts, e.g. 'Control+K'). React Aria's Button filters
 * its DOM props (ids, labels, global attributes and data-* only), so an aria-keyshortcuts prop never reaches the
 * element: this ref callback sets it on the rendered element, and removes it when `keys` is empty. Pass the
 * element's other ref too (`other`); it gets the element as before, and a callback ref's returned cleanup is kept.
 */
export function useKeyshortcuts<T extends Element>(keys: string | undefined, other?: Ref<T>): RefCallback<T> {
  return useCallback(
    (el: T | null) => {
      if (el) {
        if (keys) el.setAttribute('aria-keyshortcuts', keys);
        else el.removeAttribute('aria-keyshortcuts');
      }
      // A React 19 callback ref may return its cleanup: handed back, React calls it on detach instead of other(null).
      if (typeof other === 'function') return other(el);
      if (other) (other as { current: T | null }).current = el;
    },
    [keys, other],
  );
}
