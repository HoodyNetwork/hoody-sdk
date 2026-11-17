// Where Knowledge → Instructions reads and writes, on core. It follows the top bar's computer and realm; under
// All realms the computer's own (aiRealm.ts), and with no one realm to tell nothing is read or written (instructions belong
// to one realm). The requests themselves are api.ts; the edit state edit.ts.
import { isRealmOrGlobal, useCurrentComputer, type Target } from '@core';
import { useMemo } from 'react';
import { useAiRealm } from '../../aiRealm';

/** Where the read and write go: the computer and one realm. */
export interface InstructionsAt { target: Target; realm: string }

/** The top bar's computer and the page's one realm; null when there is none (no computer, no one realm to tell). */
export function useInstructionsAt(): InstructionsAt | null {
  const target = useCurrentComputer();
  const { realm } = useAiRealm();
  return useMemo(() => (target && isRealmOrGlobal(realm) ? { target, realm } : null), [target, realm]);
}
