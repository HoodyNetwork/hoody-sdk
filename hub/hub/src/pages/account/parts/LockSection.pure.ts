// The idle-lock choices' labels (split out of LockSection.tsx so the terminal build shares them; LockSection.tsx re-exports IDLE_LABEL).
import type { IdleMin } from '@core';

export const IDLE_LABEL: Record<IdleMin, 'lock.min1' | 'lock.min5' | 'lock.min15' | 'lock.min60'> = {
  1: 'lock.min1',
  5: 'lock.min5',
  15: 'lock.min15',
  60: 'lock.min60',
};
