// The transcript cache in a terminal: an auth purge (sign-out, account change, teardown) clears the store without ever
// reading indexedDB (the terminal keeps no transcript cache). Run under the strict preload: a read of the global records
// a trap, which this test names.
import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../term/env/strict-globals';
import { hostEnv } from '../core/host-env';

test('an auth purge with no browser page reads no indexedDB', async () => {
  const strict = activeStrictGlobals();
  expect(strict).not.toBeNull();
  expect(hostEnv().browserPage).toBe(false);
  const before = strict!.ledger().length;
  await import('./transcriptCache');
  const { runAuthPurge } = await import('../core/realm');
  runAuthPurge(undefined, 'signout');
  await new Promise((r) => setTimeout(r, 0));
  expect(strict!.ledger().slice(before).map((r) => r.name + '\n' + r.stack.split('\n').slice(0, 5).join('\n'))).toEqual([]);
}, 120_000);
