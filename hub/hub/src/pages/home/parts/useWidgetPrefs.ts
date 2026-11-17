// Home's widget order, hidden list and flags: one per-account preference ('hub_home_v1', removed at
// sign-out, registered in core). The logic (parse, arrange, move) is in logic.ts. Each change is a function of the
// stored value (core usePrefUpdate): one another tab beat is applied again on top of that tab's layout, not lost.
import { usePrefUpdate } from '@core';
import { useCallback } from 'react';
import { arrange, DEFAULT_PREFS, moveKey, parsePrefs, setHidden, type Arrangeable, type PrefFlag } from '../logic';
import { moveKeyTo } from '../widgets';

export function useWidgetPrefs() {
  const { value: prefs, update, status } = usePrefUpdate('hub_home_v1', parsePrefs);
  const hide = useCallback((key: string) => update((p) => setHidden(p, key, true)), [update]);
  const show = useCallback((key: string) => update((p) => setHidden(p, key, false)), [update]);
  // The order is worked out from the stored value inside the change, so a move applied again on top of another tab's
  // layout moves the key within that tab's order, not this render's.
  const move = useCallback(
    (widgets: readonly Arrangeable[], key: string, delta: -1 | 1) =>
      update((p) => ({ ...p, order: moveKey(arrange(widgets, p).all.map((w) => w.key), key, delta) })),
    [update],
  );
  // A drag drops a card at a place: the same order the buttons reach one place at a time.
  const moveTo = useCallback(
    (widgets: readonly Arrangeable[], key: string, to: number) => update((p) => ({ ...p, order: moveKeyTo(arrange(widgets, p).all.map((w) => w.key), key, to) })),
    [update],
  );
  const reset = useCallback(() => update((p) => ({ ...p, order: [], hidden: [] })), [update]);
  const setFlag = useCallback((flag: PrefFlag) => update((p) => (p[flag] ? p : { ...p, [flag]: true })), [update]);
  return { prefs, status, hide, show, move, moveTo, reset, setFlag, defaults: DEFAULT_PREFS };
}
