// build.ts without flock(1) on PATH builds unlocked instead of failing.
import { expect, test } from 'bun:test';
import { LOCK_BUSY, lockOutcome } from './build-lock';

test('no flock on PATH: build without the lock, and say so', () => {
  // what spawnSync returns when the command is not on PATH
  const r = { error: Object.assign(new Error('spawnSync flock ENOENT'), { code: 'ENOENT' }), status: null };
  const o = lockOutcome(r, '/x/.build-lock', 600);
  expect(o.kind).toBe('unlocked');
  expect(o.message).toContain('flock is not on PATH');
});

test('lock busy: exit with flock\'s busy code and a message', () => {
  expect(lockOutcome({ status: LOCK_BUSY }, '/x/.build-lock', 600)).toEqual({ kind: 'exit', code: LOCK_BUSY, message: 'hub:build: another build holds /x/.build-lock; gave up after 10 min' });
});

test('locked child ran: its exit code', () => {
  expect(lockOutcome({ status: 0 }, '/x/.build-lock', 600)).toEqual({ kind: 'exit', code: 0 });
  expect(lockOutcome({ status: 2 }, '/x/.build-lock', 600)).toEqual({ kind: 'exit', code: 2 });
  expect(lockOutcome({ status: null }, '/x/.build-lock', 600)).toEqual({ kind: 'exit', code: 1 });
});
