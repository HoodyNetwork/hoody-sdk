// Check status for a first message whose create answer was lost, from a REAL engine snapshot (not a hand-made one): the
// snapshot names the CREATE key while the record has no session, and the Check door of engineActive reads that identity (key AND
// kind), never the row's turn key or the row id. Over the real journal on the production-faithful storage and the FakeAgent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { engineActive, type ActiveDeps } from '../active';
import * as C from '../conv';
import type { Beat } from '../fake';
import { HANDLE, REALM, storedEntries, users, world, type World } from './env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const long: Beat[] = [{ k: 'text', text: 'Working' }, { k: 'hold' }];
const rows = (e: any) => users(e.getSnapshot(), C) as C.UserMsg[];
const deps = (): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({}), state: () => ({ k: 'none' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
});

describe('a create whose answer was lost (a real engine snapshot)', () => {
  it('names the create key while the record has no session; the row keeps its own turn key', async () => {
    w = world({ script: [long], createLost: true });
    const dock = await w.dock();
    dock.send('Build a dashboard');
    await w.flush(500);
    const sn = dock.getSnapshot();
    expect(rows(dock).at(-1)!.state).toBe('unknown');
    expect(dock.activation().ref?.sid ?? null, 'no session is known').toBeNull();
    expect(sn.createKey, 'the snapshot names the create key').toBe(dock.record!.k1);
    expect(rows(dock).at(-1)!.key, 'the row keeps its turn key, which is not the create key').not.toBe(sn.createKey);
    expect(storedEntries(w.fs).some((e: any) => e.kind === 'create' && e.k === sn.createKey), 'the journal files the create under that key').toBe(true);
  });

  it('the Check door finds the row by (create key, kind create) and by nothing else', async () => {
    w = world({ script: [long], createLost: true });
    const dock = await w.dock();
    dock.send('Build a dashboard');
    await w.flush(500);
    const sn = dock.getSnapshot();
    const row = rows(dock).at(-1)!;
    const src = engineActive({ current: () => dock, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: '' }, () => ({ computer: 'atlas', realm: 'Personal' }), deps());
    // Not the row: its turn key or its id under kind create, the create key under kind turn - none is this request.
    for (const p of [{ key: row.key, kind: 'create' }, { key: row.id, kind: 'create' }, { key: sn.createKey!, kind: 'turn' }, { key: sn.createKey!, kind: 'message' }] as const) {
      expect(await src.check(p), JSON.stringify(p)).toEqual({ k: 'refused', code: 'nothing_to_check' });
    }
    const out = await src.check({ key: sn.createKey!, kind: 'create' });
    expect(out.k, 'the create request is the row: Check reads it (done or still unknown), it is not refused').not.toBe('refused');
    src.release();
  });

  it('a Check that spans the transition to the session it finds: one read of the key, no second create, no retire, the create key gone, the answer unknown', async () => {
    w = world({ script: [long], createLost: true });
    const dock = await w.dock();
    dock.send('Build a dashboard');
    await w.flush(500);
    const createKey = dock.getSnapshot().createKey!;
    expect(createKey, 'the snapshot names the create key before the Check').toBe(dock.record!.k1);
    expect(dock.activation().ref?.sid ?? null, 'no session is known before the Check').toBeNull();
    const src = engineActive({ current: () => dock, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: '' }, () => ({ computer: 'atlas', realm: 'Personal' }), deps());
    const logged = (name: string): number => w!.agent.log.filter((x: any) => x[0] === name).length;
    const [creates, gets, retires] = [logged('create'), logged('createKeyGet'), logged('createKeyRetire')];
    const out = await src.check({ key: createKey, kind: 'create' });
    await w.flush(500);
    expect(out, 'the row that carried the create key is gone with the transition: nothing but unknown can be said').toEqual({ k: 'unknown' });
    expect(logged('createKeyGet') - gets, 'the engine read the key once').toBe(1);
    expect(logged('create') - creates, 'no second create was sent').toBe(0);
    expect(logged('createKeyRetire') - retires, 'the key was not retired').toBe(0);
    expect(dock.activation().ref?.sid, 'the read found the session the lost create made').toBe('sess-1');
    expect(dock.getSnapshot().createKey, 'the snapshot no longer names a create key').toBeUndefined();
    expect(storedEntries(w.fs).some((e: any) => e.k === createKey), 'the journal holds no entry for it any more').toBe(false);
    expect(await src.check({ key: createKey, kind: 'create' }), 'asked again, there is nothing to check').toEqual({ k: 'refused', code: 'nothing_to_check' });
    expect(logged('createKeyGet') - gets, 'and that second Check read nothing').toBe(1);
    src.release();
  });
});
