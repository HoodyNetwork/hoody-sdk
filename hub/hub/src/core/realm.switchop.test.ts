// realm.ts switch operations: a caller can cancel the switch it
// started, and switchRevision tells a switch started elsewhere from load()'s own fallback. The first three tests are
// the original ones; the rest were added later.
import { describe, expect, it } from 'vitest';
import { bump, gen, realm as selected, snapshot } from './ctx';
import { suspend } from './lifecycle';
import { beginSwitch, endAccount, load, onRealmNotice, switching, switchRevision, switchTo, type RealmNotice } from './realm';
import * as shell from './shell';
import { boot, calls, deferred, onFetch, R1, R2, settle } from './test/env';

const R3 = 'ccccccccccccccccccccccc3';
function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
  return seen;
}
const realmsOf = (ids: string[]) => ({ status: 200, body: { data: { realm_ids: ids } } });
const aliasReply = (m: Record<string, string>) => ({ status: 200, body: { data: { value: JSON.stringify(m) } } });

describe('beginSwitch / switchRevision', () => {
  it('a cancelled pending switch never commits and gives no notice', async () => {
    boot({ realm: R1 });
    const seen = notices();
    const slow = deferred();
    onFetch(async () => { await slow.p; return { status: 200, body: {} }; });
    const g = gen();
    const op = beginSwitch(R2);
    await settle();
    op.cancel();
    slow.res();
    expect(await op.done).toBe(false);
    expect([selected(), gen()]).toEqual([R1, g]);
    expect(seen).toEqual([]);
  });
  it('cancel after a newer switch took over changes nothing for the newer one', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const old = beginSwitch(R2);
    const newer = switchTo('all');
    old.cancel();
    expect(await newer).toBe(true);
    expect(await old.done).toBe(false);
    expect(selected()).toBe('all');
  });
  it('the revision moves on every started switch and on endAccount, never on a refused one or on load()\'s fallback', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R2] } } } : { status: 200, body: {} }));
    const r0 = switchRevision();
    await switchTo(R1); // the realm shown: refused, nothing starts
    expect(switchRevision()).toBe(r0);
    await load(); // R1 gone: falls back to all
    expect(selected()).toBe('all');
    expect(switchRevision()).toBe(r0);
    await switchTo(R2);
    expect(switchRevision()).toBe(r0 + 1);
    endAccount('signout');
    expect(switchRevision()).toBe(r0 + 2);
  });

  it('cancel clears the switching state at once; a cancel after the switch ended changes nothing', async () => {
    boot({ realm: R1 });
    const slow = deferred();
    onFetch(async () => { await slow.p; return { status: 200, body: {} }; });
    const op = beginSwitch(R2);
    expect(switching()).toBe(R2);
    op.cancel();
    expect(switching()).toBe(null);
    slow.res();
    expect(await op.done).toBe(false);
    onFetch(() => ({ status: 200, body: {} }));
    const ok = beginSwitch(R2);
    expect(await ok.done).toBe(true);
    const g = gen();
    ok.cancel();
    expect([selected(), gen(), switching()]).toEqual([R2, g, null]);
  });
  it('a refused switch: done is false, cancel is harmless, the revision stays (an invalid id, an ended account)', async () => {
    boot({ realm: R1 });
    const r0 = switchRevision();
    const bad = beginSwitch('nope');
    bad.cancel();
    expect(await bad.done).toBe(false);
    endAccount('signout');
    const r1 = switchRevision();
    expect(r1).toBe(r0 + 1);
    expect(await beginSwitch(R2).done).toBe(false);
    expect(switchRevision()).toBe(r1);
    expect(endAccount('again')).toBe(false);
    expect(switchRevision()).toBe(r1); // endAccount runs once per page
  });
  it('the restored-selection fallback leaves the revision too', async () => {
    boot({ realm: R3 });
    onFetch((c) => (c.url.includes('/realms') ? realmsOf([R1]) : aliasReply({ [R3]: 'Three' })));
    const r0 = switchRevision();
    await load();
    expect([selected(), switchRevision()]).toEqual(['all', r0]);
  });
  it('a fallback a load deferred under a switch is decided when that switch is cancelled (once, afresh)', async () => {
    boot({ realm: R3 });
    const seen = notices();
    const slow = deferred();
    onFetch(async (c) => {
      if (c.url.includes('/realms')) return realmsOf([R1]);
      if (c.url.includes('/vault/keys/')) return aliasReply({ [R3]: 'Three' });
      await slow.p;
      return { status: 200, body: {} };
    });
    const op = beginSwitch(R1);
    await settle();
    await load(); // R3 restored, GET /realms omits it: deferred while the switch is pending
    expect(selected()).toBe(R3);
    const before = calls.filter((c) => c.url.includes('/realms')).length;
    op.cancel();
    for (let i = 0; i < 10; i++) await settle();
    expect([selected(), switching()]).toEqual(['all', null]);
    expect(seen).toEqual([{ kind: 'realm-gone', restored: true }]);
    expect(calls.filter((c) => c.url.includes('/realms')).length).toBe(before + 1);
    slow.res();
    expect(await op.done).toBe(false);
    expect(selected()).toBe('all');
  });
  it('shell exports beginSwitch and switchRevision', () => {
    expect(shell.beginSwitch).toBe(beginSwitch);
    expect(shell.switchRevision).toBe(switchRevision);
  });
});

describe('a switch whose generation ended under it', () => {
  for (const [name, end] of [['a suspension', () => suspend()], ['a plain bump', () => bump('late')]] as const) {
    for (const status of [200, 503]) {
      it(`${name} during a pending probe (${status}): the switch ends false, nothing stays switching, no notice, no commit`, async () => {
        boot({ realm: R1 });
        const seen = notices();
        const slow = deferred();
        onFetch(async (c) => {
          if (c.url.includes('/projects')) { await slow.p; return { status, body: {} }; }
          return { status: 200, body: { data: {} } };
        });
        const op = beginSwitch(R2);
        await settle();
        expect(snapshot().switching).toBe(R2);
        end();
        const g = gen();
        slow.res();
        expect(await op.done).toBe(false);
        expect([selected(), switching(), snapshot().switching, gen()]).toEqual([R1, null, null, g]);
        expect(seen.filter((n) => n.kind === 'switch-failed')).toEqual([]);
      });
    }
  }
  it('a stale probe ending never clears a newer switch', async () => {
    boot({ realm: R1 });
    const first = deferred(), second = deferred();
    let n = 0;
    onFetch(async (c) => {
      if (!c.url.includes('/projects')) return { status: 200, body: { data: {} } };
      if (n++ === 0) { await first.p; return { status: 200, body: {} }; }
      await second.p;
      return { status: 200, body: {} };
    });
    const a = beginSwitch(R2);
    await settle();
    bump('late');
    const b = beginSwitch(R3); // a realm, so it probes too
    await settle();
    first.res();
    expect(await a.done).toBe(false);
    expect(switching()).toBe(R3);
    second.res();
    expect(await b.done).toBe(true);
    expect([selected(), switching()]).toEqual([R3, null]);
  });
});
