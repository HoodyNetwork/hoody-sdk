// Performance mode: one switch, per browser, that turns off every shadow, animation and transition. Its
// whole effect is one root attribute, data-hx-perf="on" on <html>: tokens.css empties the shadow and duration
// tokens under it and base.css stops every animation and transition under it (kit/perf.conformance.test.ts keeps all
// CSS inside the switch). fouc.js sets the attribute from the same key before the first paint, and takes ?perf=1 /
// ?perf=0 from any Hub address; this module follows it afterwards. Script-driven motion asks motionOff().
import { useSyncExternalStore } from 'react';
import { useStrings } from './strings';
import { showToast } from './states/Toast';
import strings from './perf.strings.en.json';

/** The per-browser key (core/registry, shared.js): "1" = on; absent = off. fouc.js reads the same key. */
export const PERF_KEY = 'hub_perf_v1';
export const PERF_ATTR = 'data-hx-perf';

const root = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.documentElement);

/** The switch as the page shows it now: the root attribute, set before the first paint. */
export function perfOn(): boolean {
  return root()?.getAttribute(PERF_ATTR) === 'on';
}

/** Script motion (smooth scrolls, glides) stays still under Performance mode or the system's reduced motion. */
export function motionOff(): boolean {
  if (perfOn()) return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function apply(on: boolean): void {
  const r = root();
  if (!r) return;
  if (on) r.setAttribute(PERF_ATTR, 'on');
  else r.removeAttribute(PERF_ATTR);
}

/**
 * Turns the switch on or off for this tab now, and remembers it in this browser. False when the browser refused to
 * remember it (the tab still follows the choice until it is reloaded).
 */
export function setPerf(on: boolean): boolean {
  apply(on);
  let kept = true;
  try {
    if (on) window.localStorage.setItem(PERF_KEY, '1');
    else window.localStorage.removeItem(PERF_KEY);
  } catch {
    kept = false;
  }
  notify();
  return kept;
}

// Another tab of this browser changed it: this one follows.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== PERF_KEY && e.key !== null) return;
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(PERF_KEY);
    } catch {
      return;
    }
    if ((v === '1') !== perfOn()) {
      apply(v === '1');
      notify();
    }
  });

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The switch and its one setter for the menu and Settings: each change says so in a toast. */
export function usePerf(): { on: boolean; set: (on: boolean) => void } {
  const t = useStrings(strings);
  const on = useSyncExternalStore(subscribe, perfOn, () => false);
  // Undo turns it back, with its own toast: the whole page changed, wherever the switch was pressed.
  const set = (next: boolean) => {
    const undo = { label: t('perf.undo'), onAction: () => set(!next) };
    if (setPerf(next)) showToast({ title: t(next ? 'perf.on' : 'perf.off'), tone: 'ok', action: undo });
    // The tab follows the choice; the browser would not remember it.
    else showToast({ title: t(next ? 'perf.on' : 'perf.off'), body: t('perf.notKept'), tone: 'warn', action: undo });
  };
  return { on, set };
}
