// The shell's reaction to an account or realm switch (core tears down and re-reads everything under
// the new context): the page remounts clean (open drawers and hook state never carry over; core's
// change locks live in its module registry and survive), and overlays that could still hold the old
// context's text are reset. A computer change is not a switch.
import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { useCore } from '@core';

/** The shown account and realm, as one key. */
function useContextKey(): string {
  const core = useCore();
  return `${core.account ?? ''}\n${core.realm}`;
}

/** The page outlet, remounted on every account or realm switch. */
export function ContextOutlet({ children }: { children: ReactNode }) {
  return <Fragment key={useContextKey()}>{children}</Fragment>;
}

/** Runs `reset` whenever the shown account or realm changes; never on mount or a computer change. */
export function useOnContextSwitch(reset: () => void): void {
  const key = useContextKey();
  const last = useRef(key);
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    resetRef.current();
  }, [key]);
}
