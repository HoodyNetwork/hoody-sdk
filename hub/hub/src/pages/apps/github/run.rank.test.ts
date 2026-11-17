// The GitHub run follows its session on the stream budget as a visible stream: below Ask's dock and the open
// conversation, so a run in the background never takes a slot from a chat the person is in.
import { expect, it } from 'vitest';
import * as A from '@ask/io';
import type { AgentIO } from '@ask/io';
import { GitHubRun } from './run';
import { ACCT, bindCoreEnv, flush, holds, manual, scripted } from './testing';
import * as coreEnv from '@core/test/env';
import { resetAttempts } from '@core/attempts';

bindCoreEnv({ UID: coreEnv.UID, boot: coreEnv.boot, resetAttempts });

it('asks AgentIO.stream for rank visible', async () => {
  const store = holds();
  const m = manual();
  const s = scripted();
  const ranks: unknown[] = [];
  const io = A.shareDest(s.io, new Proxy(s.io, {
    get(t, name: string) {
      const v = (t as unknown as Record<string, unknown>)[name];
      return name === 'stream' ? (...a: unknown[]) => { ranks.push(a[4]); return (v as (...x: unknown[]) => unknown)(...a); } : v;
    },
  })) as AgentIO;
  const run = new GitHubRun(io, { computer: 'c1', account: ACCT, realm: 'all', admit: store.admit }, m.clock);
  expect(run.start({ owner: 'octo', name: 'demo' })).toBe(true);
  for (let i = 0; i < 12; i++) await flush();
  expect(s.streams()).toBe(1);
  expect(ranks).toEqual(['visible']);
});
