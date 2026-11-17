// perf.term.ts: Performance mode in the terminal Hub. The terminal has no shadows, transitions or smooth scrolls, so
// script motion is always still (motionOff). The switch itself is kept: it is the same per-browser key the web reads
// (PERF_KEY), stored through the host env (the mount's session), so the menu and Settings show and change it as on the
// web, and a page that asks perfOn() gets the stored choice. No DOM attribute, no window listener: a change in this
// mount is told to its readers directly; another program changing the store is followed through onExternalChange.
import { useSyncExternalStore } from 'react';
import { hostEnv } from '../core/host-env';
import { useStrings } from './strings';
import { showToast } from './states/Toast';
import strings from './perf.strings.en.json';
import type * as Web from './perf';

export const PERF_KEY: typeof Web.PERF_KEY = 'hub_perf_v1';
export const PERF_ATTR: typeof Web.PERF_ATTR = 'data-hx-perf';

const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

export const perfOn: typeof Web.perfOn = () => {
  try { return hostEnv().local?.getItem(PERF_KEY) === '1'; } catch { return false; }
};

/** Nothing moves in a terminal: every glide and smooth scroll is instant. */
export const motionOff: typeof Web.motionOff = () => true;

export const setPerf: typeof Web.setPerf = (on) => {
  let kept = true;
  try {
    const s = hostEnv().local;
    if (!s) kept = false;
    else if (on) s.setItem(PERF_KEY, '1');
    else s.removeItem(PERF_KEY);
  } catch {
    kept = false;
  }
  notify();
  return kept;
};

function subscribe(l: () => void): () => void {
  listeners.add(l);
  // Another program sharing the store changed it: re-read (subscribed only while someone reads the switch).
  const off = hostEnv().onExternalChange((area, key) => { if (area === 'local' && (key === PERF_KEY || key === null)) l(); });
  return () => { listeners.delete(l); off(); };
}

export const usePerf: typeof Web.usePerf = () => {
  const t = useStrings(strings);
  const on = useSyncExternalStore(subscribe, perfOn, () => false);
  const set = (next: boolean) => {
    const undo = { label: t('perf.undo'), onAction: () => set(!next) };
    if (setPerf(next)) showToast({ title: t(next ? 'perf.on' : 'perf.off'), tone: 'ok', action: undo });
    else showToast({ title: t(next ? 'perf.on' : 'perf.off'), body: t('perf.notKept'), tone: 'warn', action: undo });
  };
  return { on, set };
};
