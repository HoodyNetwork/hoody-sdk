// useTrip.ts: the AI page receives a model chooser's trip (?handoff=<id>).
import { handoff, type Handoff } from '@core';
import { useEffect, useRef, useState } from 'react';

export interface TripInput {
  /** The `handoff` search param of this render. */
  param: string | undefined;
  /** The page's first load of the computer shown (reads still running). */
  firstLoad: boolean;
  /** The page's context key (computer and realm): a trip taken here ends when it changes. */
  ctx: string;
  /** The shell's computer (core's raw id), which the trip names. */
  shown: string | null;
  /** Removes search params with one replace. */
  drop: (names: string[]) => void;
}

/**
 * The trip this page shows, or null. A trip is taken only once the page has loaded, and only when stored for this
 * account, realm and the computer shown, and not expired; otherwise the page opens plainly and the param goes.
 * A trip taken here ends for good when another computer is chosen or the realm changes, even while that computer
 * loads: its param goes at once and this page does not take that trip again (switching back stays plain).
 * StrictMode's second run of the effect keeps a trip already taken.
 */
export function useTrip({ param, firstLoad, ctx, shown, drop }: TripInput): Handoff | null {
  const [trip, setTrip] = useState<Handoff | null>(null);
  const taken = useRef<{ id: string; computer: string; ctx: string } | null>(null);
  const ended = useRef(new Set<string>());
  useEffect(() => {
    const was = taken.current;
    if (was && (was.computer !== shown || was.ctx !== ctx)) {
      ended.current.add(was.id);
      taken.current = null;
      setTrip(null);
      if (param === was.id) drop(['handoff']);
      return;
    }
    if (!param) {
      taken.current = null;
      setTrip(null);
      return;
    }
    if (ended.current.has(param)) {
      setTrip(null);
      drop(['handoff']);
      return;
    }
    if (was && was.id === param) return;
    if (firstLoad) {
      setTrip(null);
      return;
    }
    const h = handoff.receiveHandoff(shown, param);
    taken.current = h ? { id: h.id, computer: h.target.computer, ctx } : null;
    setTrip(h);
    if (!h) drop(['handoff']);
  }, [param, firstLoad, ctx, shown, drop]);
  return trip;
}
