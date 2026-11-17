// The access steps' hold hooks (split out of AccessPeople.tsx so the terminal build shares them; AccessPeople.tsx
// re-exports both).
import { useEffect, useMemo, useRef } from 'react';
import { heldBy, useAccessSteps } from '../data';
import { type Step, type StepIdentity, stepKey } from './access.picked';
import { useHeldChangeOf } from './runner';

const LOCK = 'computer.access';
const isStep = (i: Record<string, unknown>) => typeof i.op === 'string';

/** The computer's held access step (any of the five step changes), its Check again and its Dismiss: the band names
 *  exactly that send. Core proves a hold only in a change's read-back (a plain re-read of the rules does not), so
 *  Check again runs the held step's own change's read-back. */
export function useStepHold(computer: string) {
  const m = useAccessSteps();
  const pick = useMemo(() => (i: Record<string, unknown>) => i.computer === computer && isStep(i), [computer]);
  const h = useHeldChangeOf(LOCK, pick);
  const identity = (h?.identity ?? null) as StepIdentity | null;
  const key = identity ? stepKey(identity) : null;
  // A hold another page's declaration sent is that page's to settle (heldBy 'other'): no Dismiss here.
  const elsewhere = !!h && !!key && heldBy(key, h) === 'other';
  const dismiss = async (): Promise<boolean> => {
    if (!h || !identity || !key || !h.hold || elsewhere) return false;
    const { computer: id, from, ...step } = identity;
    return m[key].dismiss({ id, from, step: step as Step }, h.hold);
  };
  const check = async (): Promise<boolean> => (key ? m[key].readBack().catch(() => false) : false);
  // `hold`: the held send's own token; a question about one hold is never answered for another.
  return { held: identity, hold: h?.hold ?? null, elsewhere, check, dismissShown: dismiss };
}

/** True while mounted. Set again on every mount: StrictMode unmounts and remounts once in development, and a ref
 *  cleared only on unmount would then read "closed" for the whole life of the drawer. */
export function useMounted(): { readonly current: boolean } {
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return alive;
}
