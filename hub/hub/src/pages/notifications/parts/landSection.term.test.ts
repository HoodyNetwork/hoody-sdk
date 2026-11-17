import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../../../term/env/strict-globals';
import { landOnSection } from './landSection';

test('landing on a section touches no DOM global in the terminal (no document there)', () => {
  // Strict globals (test-preload) trap any read of document or window: running these calls clean is the proof.
  const seen = activeStrictGlobals()?.ledger().length ?? 0;
  expect(() => landOnSection('kinds')).not.toThrow();
  // and nothing here read a browser global (the ledger is process-wide: only this test's reads count)
  expect((activeStrictGlobals()?.ledger() ?? []).slice(seen).map((r) => r.name)).toEqual([]);
});
