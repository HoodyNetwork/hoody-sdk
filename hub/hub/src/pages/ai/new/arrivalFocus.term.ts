// arrivalFocus.term: arriving at New chat puts focus in its composer, once per arrival (the web rule). A terminal has no
// coarse pointer, no title focus to wait for and no screen-reader live region: the composer takes focus on the next turn
// of the event loop after the arrival, whatever holds the focus then (nothing checks whether the person moved it in
// between), and `said` stays false.
import { useEffect, type MutableRefObject, type RefObject } from 'react';
import type * as Web from './arrivalFocus';

export const useArrivalFocus: typeof Web.useArrivalFocus = (arrival: MutableRefObject<string | null>, at: string, input: RefObject<HTMLTextAreaElement | null>) => {
  useEffect(() => {
    if (arrival.current === at) return;
    const id = setTimeout(() => {
      arrival.current = at;
      const el = input.current;
      if (el && !el.disabled) el.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [arrival, at, input]);
  return false;
};
