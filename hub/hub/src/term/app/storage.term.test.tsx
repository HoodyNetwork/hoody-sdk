// Host storage per mount (env/session.ts): core's attempt holds (the record a key mint or money send keeps before it
// leaves) are durable within the mount (memory store + the mount's Web Locks twin), and nothing one mount stored is
// visible to the next.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A hold is admitted (stored, read back, confirmed) in a fixture mount; the Keys mint no longer refuses NO_STORAGE | 'a hold is durable in a mount' |
// | 2 | The lock manager takes both Web Locks forms: request(name, fn) and request(name, options, fn) | 'both lock forms' |
// | 3 | Five mounts in a row: each starts with empty stores and holds no lock of the last | 'five mounts leave nothing' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import { holdAttempt } from '@core';
import { hostEnv } from '../../core/host-env';
import { cryptIdleForTests } from '../../core/cryptStore';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';

setDefaultTimeout(30_000);

async function mounted<T>(fn: (s: TermSession) => Promise<T>): Promise<T> {
  const session = beginTermSession();
  const boot: TermBoot = fixtureBoot({ pageIds: ['keys'], page: 'keys', fx: null });
  try {
    await boot.start(session, () => {});
    return await fn(session);
  } finally {
    await boot.dispose('term-quit');
    session.end();
  }
}

type AnyRequest = (name: string, ...rest: unknown[]) => Promise<unknown>;

test('a hold is durable in a mount', async () => {
  await mounted(async () => {
    const got = await holdAttempt('key.create', { by: 'keys' });
    expect(got).toMatchObject({ ok: true });
    if (got.ok) got.hold.release();
  });
});

test('both lock forms', async () => {
  await mounted(async () => {
    const req = hostEnv().locks!.request as unknown as AnyRequest;
    expect(await req('hub-test-a', () => 1)).toBe(1);
    expect(await req('hub-test-b', { mode: 'shared' }, () => 2)).toBe(2);
  });
});

test('five mounts leave nothing', async () => {
  for (let i = 0; i < 5; i++) {
    await mounted(async (s) => {
      const { local } = s.stores();
      // Nothing of the last mount's hold (left held on purpose below) is in this mount's store.
      expect(local.getItem('hub.v3.changes') ?? '[]').not.toContain('key.create');
      const got = await holdAttempt('key.create', { by: 'keys' });
      expect(got).toMatchObject({ ok: true });
      // The hold is kept only in the store: no lock outlives the hold's own admission.
      // The account's encrypted store may still be busy in the background (its own lock, hoody-hub-crypt:<uid>, held
      // while it runs). Run after askdock.term (as the full run does) it was still held here on every mount and cleared
      // within a second. Only a lock left after the store settles is this hold's.
      await cryptIdleForTests();
      const snap = await hostEnv().locks!.query!();
      expect(snap.held ?? []).toEqual([]);
    });
  }
});
