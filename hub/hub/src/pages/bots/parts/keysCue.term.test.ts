import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../../../term/env/strict-globals';
import { cancelJob, focusAfterDialogs, keysCueFor } from './keysCue';

test('the cue works without a document: it is unacted until ended, then acted; focus moves are no-ops', () => {
  // Strict globals (test-preload) trap any read of document or window: running these calls clean is the proof.
  const seen = activeStrictGlobals()?.ledger().length ?? 0;
  const c = keysCueFor('k', null);
  expect(c.key).toBe('k');
  expect(c.acted()).toBe(false);
  c.end();
  expect(c.acted()).toBe(true);
  const job = { on: true, raf: 0 };
  expect(() => { focusAfterDialogs(() => null, c, job); cancelJob(job); }).not.toThrow();
  // and nothing here read a browser global (the ledger is process-wide: only this test's reads count)
  expect((activeStrictGlobals()?.ledger() ?? []).slice(seen).map((r) => r.name)).toEqual([]);
});
