// nav.web.term.tsx: the terminal answer to nav.web.tsx. The FAQ landing mark lives in the memory history's state
// object for the entry (exactly as on the web, where the memory part is the same); there is no browser entry to write
// as well, so no `window.history` is touched.
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useLocationPart } from './navPart';
import type * as Web from './nav.web';

type MarkedState = { __TSR_key?: string; key?: string; faqLanded?: string[] };
const keyOfState = (st: MarkedState | undefined): string => st?.__TSR_key ?? st?.key ?? '';

export const useLandedMark: typeof Web.useLandedMark = () => {
  const router = useRouter();
  const shown = useLocationPart((l) => l.state) as MarkedState | undefined;
  const stateOf = useCallback((): MarkedState | undefined => {
    const live = router.history.location.state as MarkedState | undefined;
    return keyOfState(live) === keyOfState(shown) ? live : shown;
  }, [router, shown]);
  const has = useCallback((hash: string) => stateOf()?.faqLanded?.includes(hash) === true, [stateOf]);
  const set = useCallback((hash: string) => {
    const st = stateOf();
    if (!st || !keyOfState(st) || st.faqLanded?.includes(hash)) return;
    st.faqLanded = [...(st.faqLanded ?? []), hash];
  }, [stateOf]);
  return { has, set };
};
