// The browser-history part of nav.tsx (split out so the rest of nav is shared with the terminal build): the FAQ landing
// mark writes the browser's own history entry. nav.tsx re-exports it.
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useLocationPart } from './navPart';

type MarkedState = { __TSR_key?: string; key?: string; faqLanded?: string[] };
const keyOfState = (st: MarkedState | undefined): string => st?.__TSR_key ?? st?.key ?? '';

/**
 * The FAQ landings this history entry has had (the hashes), kept in the entry's own history state: the mark lives exactly as
 * long as the entry and is found again by Back, a reload or a remount, with no count to cap and nothing to evict. Written
 * into the history's state object for the entry (the memory history keeps that very object) and, in a browser, into the
 * browser's entry by the prototype's `replaceState`, which the router's wrapper does not see: the router is told nothing,
 * so it neither reloads nor restores a scroll over the landing. A page the person is leaving (the page hold's last
 * location) reads its own copy and writes only that. '' keys (a history that gives none) have no entry to mark: callers
 * keep their own record then.
 */
export function useLandedMark(): { has: (hash: string) => boolean; set: (hash: string) => void } {
  const router = useRouter();
  const shown = useLocationPart((l) => l.state) as MarkedState | undefined;
  const stateOf = useCallback((): MarkedState | undefined => {
    const live = router.history.location.state as MarkedState | undefined;
    return keyOfState(live) === keyOfState(shown) ? live : shown;
  }, [router, shown]);
  const has = useCallback((hash: string) => stateOf()?.faqLanded?.includes(hash) === true, [stateOf]);
  const set = useCallback(
    (hash: string) => {
      const st = stateOf();
      if (!st || !keyOfState(st) || st.faqLanded?.includes(hash)) return;
      const next = [...(st.faqLanded ?? []), hash];
      st.faqLanded = next;
      if (typeof window === 'undefined' || st !== (router.history.location.state as MarkedState | undefined)) return;
      const ws = window.history.state as MarkedState | null;
      if (ws && keyOfState(ws) === keyOfState(st)) History.prototype.replaceState.call(window.history, { ...ws, faqLanded: next }, '');
    },
    [router, stateOf],
  );
  return { has, set };
}
