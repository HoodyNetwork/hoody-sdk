// C9: the changes that may have gone through stay locked under the lock and key the table declares: a second
// press (new name, new command, another remount) sends nothing; another computer or project is not held.
import { bootFixtureCore, useLockedChange } from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { computersTable, subjectOf } from './data';

const unknown = () => Promise.reject({ kind: 'pending' });
const A = { id: 'a'.repeat(24), project_id: 'p'.repeat(24), server_name: 'n12' };
const B = { id: 'b'.repeat(24), project_id: 'p'.repeat(24), server_name: 'n12' };

type Vars = Record<string, unknown>;

async function posts(change: string, first: Vars, again: Vars, other: Vars) {
  const ch = computersTable.changes![change]!;
  expect(ch.lock, `${change} declares a lock`).toBeTruthy();
  let sent = 0;
  const run = () => { sent += 1; return unknown(); };
  const opts = { lockKey: ch.lockKey as (v: unknown) => unknown };
  const one = renderHook(() => useLockedChange<Vars, unknown>(run, [], ch.lock!, opts));
  await act(() => one.result.current.run(first));
  one.unmount();
  const two = renderHook(() => useLockedChange<Vars, unknown>(run, [], ch.lock!, opts));
  const r = await act(() => two.result.current.run(again));
  expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  expect(sent).toBe(1);
  await act(() => two.result.current.run(other));
  expect(sent).toBe(2);
}

describe('computers: an unknown change is not sent again', () => {
  beforeEach(() => bootFixtureCore({ rules: [] }));
  it('create: the same sent name sends nothing; another project is free (a new name is held by the drawer, held.test)', () =>
    posts('create', { project: 'P1', body: { name: 'one' } }, { project: 'P1', body: { name: 'one' } }, { project: 'P2', body: { name: 'one' } }));
  it('run: another command on the same computer sends nothing, and the lock never holds the command', async () => {
    await posts('run', { ...subjectOf(A), command: 'ls' }, { ...subjectOf(A), command: 'ls -la' }, { ...subjectOf(B), command: 'ls' });
    const key = JSON.stringify(computersTable.changes!.run!.lockKey!({ ...subjectOf(A), command: 'secret-token' } as never));
    expect(key).not.toContain('secret-token');
  });
  it('copy: the same sent copy sends nothing', () =>
    posts('copy', { id: A.id, name: 'x', project: 'p1', server: 's1' }, { id: A.id, name: 'x', project: 'p1', server: 's2' }, { id: B.id, name: 'x', project: 'p1', server: 's1' }));
  it('ssh key: another key on the same computer sends nothing, and no key material is in the identity', async () => {
    await posts('sshKey', { id: A.id, key: 'ssh-ed25519 AAAA one' }, { id: A.id, key: 'ssh-ed25519 BBBB two' }, { id: B.id, key: 'ssh-ed25519 AAAA one' });
    expect(computersTable.changes!.sshKey!.lock).toBe('computer.ssh_key');
    expect(JSON.stringify(computersTable.changes!.sshKey!.lockKey!({ id: A.id, key: 'AAAAsecret' } as never))).not.toContain('AAAAsecret');
  });
  it('rename: the same sent name sends nothing (another name is held by the dialog, held.test)', () =>
    posts('rename', { id: A.id, name: 'one' }, { id: A.id, name: 'one' }, { id: B.id, name: 'one' }));
  it('realms: the same sent set sends nothing (a changed set is held by the drawer)', () =>
    posts('setRealms', { id: A.id, realmIds: ['r1'] }, { id: A.id, realmIds: ['r1'] }, { id: B.id, realmIds: ['r1'] }));
  it('remove: a second delete of the same computer sends nothing', () =>
    posts('remove', { id: A.id }, { id: A.id }, { id: B.id }));
  it('setup retry and invite redeem use the account-wide setup locks', () => {
    expect(computersTable.changes!.retrySetup!.lock).toBe('setup.retry');
    expect(computersTable.changes!.redeem!.lock).toBe('invite.redeem');
  });
  // The account has one setup-retry minute, taken through core's claimRetryMinute (core's retrySetup, Home's retry).
  // This page shows no retry, so it must not offer a send that skips that minute.
  it('offers no setup retry of its own, which would skip the account retry minute', async () => {
    expect(Object.keys(await import('./data'))).not.toContain('useRetrySetup');
  });
});
