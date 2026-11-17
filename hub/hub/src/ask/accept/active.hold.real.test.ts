// The same rule with the REAL engine and the FakeAgent: a pinned chat whose session the agent does not have is
// blocked as gone and makes zero attachment requests; a session it has is held once. The lease manager is the real one over a
// counting api (`acquire` is the POST /attachments).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { createLeaseManager } from '@kit/agent/lease';
import { engineActive, type ActiveDeps } from '../active';
import { scripts } from '../fake';
import { HANDLE, REALM, world, type World } from './env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

function counting() {
  const calls: string[] = [];
  const api: any = {
    acquire: async (id: string) => { calls.push('acquire ' + id); return { ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }; },
    renew: async () => ({ ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }),
    release: async (id: string, lease: string) => { calls.push('release ' + lease); return { ok: true, body: { status: 'ok', released: true } }; },
  };
  const mgr = createLeaseManager({ api: () => api, store: { read: () => undefined, write: () => undefined }, graceMs: 0 });
  const deps: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: mgr as any,
    pending: () => [], onPending: () => () => undefined,
    set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
  };
  return { calls, deps };
}
const host = () => ({ computer: 'atlas', realm: 'Personal' });

describe('the attachment hold on a real pinned engine', () => {
  it('a session the agent does not have: blocked as gone, zero attachment requests', async () => {
    w = world();
    const eng = w.pinned('sess-missing');
    eng.open();
    const { calls, deps } = counting();
    const src = engineActive({ current: () => eng, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: 'sess-missing' }, host, deps);
    src.subscribe(() => undefined);
    await w.flush(1500);
    expect(eng.getSnapshot().phase, 'the engine found the chat gone').toBe('blocked');
    expect(calls).toEqual([]);
    src.release();
  });

  it('a session the agent has: held once, after the engine read it', async () => {
    w = world({ script: [scripts.dashboard] });
    const dock = await w.dock();
    dock.send('Build a dashboard');
    await w.flush(500);
    const sid = dock.getSnapshot().conv.sid as string;
    const eng = w.pinned(sid);
    eng.open();
    const { calls, deps } = counting();
    const src = engineActive({ current: () => eng, release: () => undefined }, { computer: HANDLE, realm: REALM, sid }, host, deps);
    src.subscribe(() => undefined);
    await w.flush(1500);
    expect(eng.getSnapshot().phase).toBe('ready');
    expect(calls).toEqual(['acquire ' + sid]);
    src.release();
  });
});
