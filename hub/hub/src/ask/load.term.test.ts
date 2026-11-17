// src/ask and kit/agent read no browser global when they load (the shell imports src/ask at start, and a strict-globals trap
// during a mount ends it): every host read goes through hostEnv() at first use. Run under the strict preload, which fails a test
// whose trap ledger is not empty at teardown; the explicit ledger check names the global and its stack here.
import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../term/env/strict-globals';

test('importing src/ask and the agent kit touches no browser global', async () => {
  const strict = activeStrictGlobals();
  expect(strict).not.toBeNull();
  const before = strict?.ledger().length ?? 0;
  await import('./index');
  await import('./registry');
  await import('../kit/agent/lease-live');
  await import('../kit/agent/approver-live');
  await import('../kit/agent/pause');
  await import('./welcome');
  await import('./active');
  // Let the host env resolve and the held registrations (storage, visibility) attach.
  await new Promise((r) => setTimeout(r, 0));
  const rows = strict ? strict.ledger().slice(before) : [];
  expect(rows.map((r) => r.name + '\n' + r.stack.split('\n').slice(0, 4).join('\n'))).toEqual([]);
}, 120_000);
