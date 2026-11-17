// Marker provenance. In fixture and test builds every element a kit anatomy component marks with a
// data-hub-* attribute is registered in window.__hubAnatomy (a WeakSet), so the DOM judge can tell a kit marker from one
// a page forged. Production builds register nothing: __HUB_FIXTURES__ is false there and this folds away.

/** The data-hub-* markers the strict anatomy writes. */
export const ANATOMY_MARKERS = ['data-hub-h', 'data-hub-heading', 'data-hub-section', 'data-hub-state', 'data-hub-group', 'data-hub-item', 'data-hub-action-group'] as const;

type MarkHost = { __hubAnatomy?: WeakSet<Element> };

/** Registers a marked element (a ref callback); a no-op outside fixture and test builds. */
export function markElement(el: Element | null): void {
  if (!__HUB_FIXTURES__ || !el) return;
  const host = globalThis as MarkHost;
  (host.__hubAnatomy ??= new WeakSet()).add(el);
}

/** Whether the kit registered this element (fixture and test builds). */
export function isKitMarked(el: Element): boolean {
  return (globalThis as MarkHost).__hubAnatomy?.has(el) ?? false;
}
