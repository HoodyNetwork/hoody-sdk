// One part of the location through the page hold (split out of nav.tsx so nav.tsx and nav.web.tsx share it without
// importing each other). Kit-internal: pages use nav's hooks.
import { type ParsedLocation, useRouterState } from '@tanstack/react-router';
import { useContext } from 'react';
import { PageNavHoldContext } from './navhold';

/** One part of the location: the live one while it is this page's, else the page's own last one (PageNavHold). */
export function useLocationPart<T>(select: (l: ParsedLocation) => T): T {
  const hold = useContext(PageNavHoldContext);
  // Selecting only the part keeps a re-render to changes of that part, as before. One selector: a page the person is
  // leaving selects its own last location, the same value, so the switch does not re-render it.
  return useRouterState({
    select: (s: { location: ParsedLocation }) => (hold && hold.location && !hold.owns(s.location.pathname) ? select(hold.location) : select(s.location)),
  } as never) as T;
}
