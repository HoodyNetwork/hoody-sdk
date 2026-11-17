// React Aria holds focus moves (a menu, popover or dialog taking focus as it opens) until every running CSS
// transition on the page has ended (runAfterTransition). When an element starts transitioning it adds a
// transitioncancel listener to that element, and in react-aria 3.53.1 that listener is added with { once: true }:
// when one element cancels several properties at once (a row's button losing its focus colours as a row menu opens,
// or an element removed mid-transition) only the first cancel is counted, the wait never ends, and focus stays on
// the page body. Upstream bug, fixed on react-spectrum main in 390f18208 (#10730, "runAfterTransition retains
// elements when multiple transitions are cancelled") by dropping { once: true }; not yet in a release.
// This does the same: a transitioncancel listener added with { once: true } while a transitionrun event is being
// dispatched (which is where React Aria adds it) is added without once. The element's own listener then hears
// every cancel, also after the element has left the page. Remove this file once react-aria ships that fix.

const installed = new WeakMap<Document, () => void>();
const held = new WeakMap<Document, Set<Event>>();

/** How many transitionrun events the fix still holds for this document (for tests: finished runs must not pile up). */
export function transitionRunsHeld(doc: Document = document): number {
  return held.get(doc)?.size ?? 0;
}

/** Install once per document, before the first render; returns the uninstall (for tests). Skipped when the
 *  browser has no TransitionEvent. */
export function installTransitionCancelFix(doc: Document = document): () => void {
  const win = doc.defaultView;
  const done = installed.get(doc);
  if (done) return done;
  if (!win || typeof win.TransitionEvent === 'undefined') return () => undefined;
  // Each transitionrun is tracked on its own: added in the window's capture phase (before React Aria's document
  // listener) and dropped in the window's bubble phase, after React Aria's listener has run. A run whose propagation
  // was stopped never reaches that bubble listener: once its dispatch has ended (the event's eventPhase is back to
  // NONE) it covers nothing, and it stays held only until the next run or a qualifying registration prunes it. So a run
  // nested inside another never ends the outer one (the outer's phase is not NONE yet), and stopped runs never pile up.
  // Not a microtask or a timer: a browser runs microtasks after each listener of a native event.
  const runs = new Set<Event>();
  held.set(doc, runs);
  const prune = () => {
    for (const e of runs) if (e.eventPhase === Event.NONE) runs.delete(e);
  };
  const inRun = () => {
    prune();
    return runs.size > 0;
  };
  const onRun = (e: Event) => {
    prune();
    runs.add(e);
  };
  const endRun = (e: Event) => {
    runs.delete(e);
  };
  win.addEventListener('transitionrun', onRun, true);
  win.addEventListener('transitionrun', endRun);
  const proto = win.Element.prototype;
  const own = Object.prototype.hasOwnProperty.call(proto, 'addEventListener');
  const prev = proto.addEventListener;
  proto.addEventListener = function (this: Element, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    // Nothing of the options is read unless this is a transitioncancel listener added during a run: everything else
    // goes to the browser untouched.
    if (type !== 'transitioncancel' || o === null || typeof o !== 'object' || !inRun()) return prev.call(this, type, fn, o);
    // The four standard members, each read once in the browser's own order (capture, once, passive, signal); the
    // browser is given this snapshot, never the object again. once is dropped; the others are passed on only when
    // given, so the browser's defaults stay. Members beyond these four (none are standard today) are not passed on.
    const { capture, once, passive, signal } = o;
    void once;
    const opts: AddEventListenerOptions = {};
    if (capture !== undefined) opts.capture = capture;
    if (passive !== undefined) opts.passive = passive;
    if (signal !== undefined) opts.signal = signal;
    return prev.call(this, type, fn, opts);
  };
  const uninstall = () => {
    win.removeEventListener('transitionrun', onRun, true);
    win.removeEventListener('transitionrun', endRun);
    runs.clear();
    held.delete(doc);
    if (own) proto.addEventListener = prev;
    else delete (proto as { addEventListener?: unknown }).addEventListener;
    installed.delete(doc);
  };
  installed.set(doc, uninstall);
  return uninstall;
}
