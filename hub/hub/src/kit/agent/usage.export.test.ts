// The Usage tab, its store and its pure helpers are public kit exports (the Details panel imports them from '@kit').
import { describe, expect, it } from 'vitest';
import * as kit from '../index';

describe('kit exports for the Usage tab', () => {
  it('exports the component, the store and the pure helpers', () => {
    for (const name of ['UsageTab', 'createUsageStore', 'useUsageView', 'usagePageOf', 'requestsOf', 'groupTurns', 'byModel', 'sideOf', 'speechOf', 'cachePct', 'mergeRows', 'rollupOf'] as const) {
      expect(typeof kit[name], name).toBe('function');
    }
  });
});
