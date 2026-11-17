// Vitest on core's real lock for a named link: the lock is the computer and the script's address, so a second
// name cannot be sent while the first is still out, in another mount or another tab, and one that may have gone through blocks every
// name until it is read back. Through core's real mutation with the page's own change spec; only the network is replaced.
import { aliasRoutes, defineMutation } from '@core';
import { reply, startFixtureMode } from '@core/transport';
import { boot, R1 } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { sourceTable } from './data';

type Spec = { lock: string; lockKey: (v: unknown) => unknown; identity: (v: unknown) => unknown; input: (v: unknown) => unknown };
const spec = (sourceTable.changes as unknown as Record<string, Spec>).aliasCreate!;
const make = () => defineMutation<{ compId: string; target: string; alias?: string }>(aliasRoutes.create, { input: spec.input as never, lock: spec.lock, lockKey: spec.lockKey as never, identity: spec.identity as never });

describe('a named link is locked by computer and address, never by name', () => {
  beforeEach(() => boot({ realm: R1 }));

  it('while the first name is still out, a second name (another mount, another tab) is refused unsent', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let sends = 0;
    startFixtureMode([reply(aliasRoutes.create, async () => { sends++; await held; return { body: { data: { id: 'x' } } }; })]);
    const first = make().run({ compId: 'c1', target: '/a', alias: 'name-one-aaa' });
    await new Promise((r) => setTimeout(r, 30));
    const second = await make().run({ compId: 'c1', target: '/a', alias: 'name-two-bbb' });
    expect(second.outcome).toBe('not_sent');
    expect(sends).toBe(1);
    release();
    expect((await first).outcome).toBe('done');
  });

  it('a first name that may have gone through blocks a second name until it is read back', async () => {
    let sends = 0;
    startFixtureMode([reply(aliasRoutes.create, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await make().run({ compId: 'c2', target: '/b', alias: 'name-one-aaa' })).outcome).toBe('pending');
    const second = await make().run({ compId: 'c2', target: '/b', alias: 'name-two-bbb' });
    expect(second.outcome).not.toBe('done');
    expect(sends).toBe(1);
  });

  it('another address or another computer is its own change', async () => {
    let sends = 0;
    startFixtureMode([reply(aliasRoutes.create, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await make().run({ compId: 'c3', target: '/a', alias: 'name-one-aaa' })).outcome).toBe('pending');
    expect((await make().run({ compId: 'c3', target: '/other', alias: 'name-two-bbb' })).outcome).toBe('pending');
    expect((await make().run({ compId: 'c4', target: '/a', alias: 'name-three-c' })).outcome).toBe('pending');
    expect(sends).toBe(3);
  });
});
