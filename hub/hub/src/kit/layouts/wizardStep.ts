// A wizard's current step, kept in the URL (Layouts.tsx and its terminal sibling share it).
import { useEffect } from 'react';
import { useSearchParam } from '../nav';

/** One step of a wizard (re-exported by Layouts as WizardStep). */
export interface WizardStep {
  id: string;
  label: string;
}

export interface WizardStepOptions {
  /** The search parameter that holds the step id (default 'step'). */
  param?: string;
  /** The furthest step index the person may be on now; a deep link past it is clamped there (replace, never push). */
  reachable?: number;
  /** Whether what decides `reachable` is known (an async restoration finished); nothing is clamped before. Default true. */
  ready?: boolean;
}

/** The current wizard step index, kept in the URL (?step=<id>) so Back walks the steps. A deep link past `reachable`
 *  shows the reachable step and replaces the URL with it, once `ready`; before that the link's step is returned as is. */
export function useWizardStep(steps: readonly WizardStep[], opts: string | WizardStepOptions = 'step'): [number, (index: number) => void] {
  const o = typeof opts === 'string' ? { param: opts } : opts;
  const [value, set] = useSearchParam(o.param ?? 'step');
  const found = steps.findIndex((x) => x.id === value);
  const asked = found < 0 ? 0 : found;
  const ready = o.ready ?? true;
  const limit = o.reachable === undefined ? steps.length - 1 : Math.max(0, Math.min(o.reachable, steps.length - 1));
  const clamped = ready && asked > limit;
  const index = clamped ? limit : asked;
  const to = (i: number) => (i <= 0 ? undefined : steps[Math.min(i, steps.length - 1)]?.id);
  const target = to(index);
  useEffect(() => {
    if (clamped) set(target, { replace: true });
  }, [clamped, target, set]);
  return [index, (i: number) => set(to(i))];
}

