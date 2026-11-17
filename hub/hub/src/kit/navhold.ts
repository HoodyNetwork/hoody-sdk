// The shell's page hold (split out of nav.tsx so kit/overlays can read it without nav's router hooks): what a page kept
// loaded behind another one reads in place of the live location, and whether it is hidden right now. nav.tsx re-exports
// all of it.
import type { ParsedLocation } from '@tanstack/react-router';
import { createContext, useCallback, useContext } from 'react';

/**
 * Set by the shell around each page it draws (useKeepPage keeps one loaded while another page shows). A page reads the
 * live location while that location is its own (`owns`: the page is shown, the path is its path or below it, and the
 * host drew it for the route's current visit), else its own last one (`location`): so leaving, while kept hidden behind
 * another page, and left and come back to before the next page drew, a re-render never sees a location that is not its
 * own. Its navigations are dropped while it is kept hidden (`hidden()`, read when one is made), so it never moves the
 * person off the page they are on.
 */
export interface PageNavHold {
  location: ParsedLocation | null;
  owns: (pathname: string) => boolean;
  hidden: () => boolean;
}
export const PageNavHoldContext = createContext<PageNavHold | null>(null);

/** Whether the shell keeps this page hidden right now (PageNavHold.hidden), as a reader. Read in an effect cleanup it
 *  tells a page kept loaded hiding (its state stays, it shows again as it was) from the page unloading: true only for
 *  the hide. Outside the shell, always false. */
export function useHiddenNow(): () => boolean {
  const hold = useContext(PageNavHoldContext);
  return useCallback(() => !!hold?.hidden(), [hold]);
}
