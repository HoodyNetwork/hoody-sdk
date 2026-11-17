// shell/switchOp.ts on the real core: the switch line's Cancel ends the switch the shell started, at once, and only
// while it is still core's pending switch.
import { describe, expect, it } from 'vitest';
import { gen, realm as selected, snapshot } from '@core/ctx';
import { beginSwitch, onRealmNotice, switchRevision, type RealmNotice } from '@core/shell';
import { boot, deferred, onFetch, R1, R2, settle } from '@core/test/env';
import { cancelSwitch, startSwitch } from './switchOp';

function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => {
    if (n.kind !== 'look') seen.push(n);
  });
  return seen;
}

function slowProbe() {
  const slow = deferred();
  onFetch(async () => {
    await slow.p;
    return { status: 200, body: {} };
  });
  return slow;
}

describe('startSwitch / cancelSwitch', () => {
  it('cancelSwitch ends the pending switch at once: done is false before the probe ends, nothing commits, no notice', async () => {
    boot({ realm: R1 });
    const seen = notices();
    const slow = slowProbe();
    const g = gen();
    const op = startSwitch(R2);
    expect(snapshot().switching).toBe(R2);
    let settled: boolean | undefined;
    void op.done.then((v) => (settled = v));
    expect(cancelSwitch()).toBe(true);
    expect(snapshot().switching).toBe(null);
    await settle();
    expect(settled).toBe(false);
    slow.res();
    await settle();
    expect([selected(), gen()]).toEqual([R1, g]);
    expect(seen).toEqual([]);
    // Only once.
    expect(cancelSwitch()).toBe(false);
  });

  it("the op's own cancel does the same", async () => {
    boot({ realm: R1 });
    const slow = slowProbe();
    const op = startSwitch(R2);
    op.cancel();
    expect(await op.done).toBe(false);
    slow.res();
    await settle();
    expect(selected()).toBe(R1);
  });

  it('a switch started outside the shell after it is never cancelled here', async () => {
    boot({ realm: R1 });
    const slow = slowProbe();
    const mine = startSwitch(R2);
    const other = beginSwitch('all');
    expect(cancelSwitch()).toBe(false);
    mine.cancel();
    expect(snapshot().switching).toBe('all');
    slow.res();
    expect(await other.done).toBe(true);
    expect(selected()).toBe('all');
  });

  it('a newer shell switch: the older one cancels nothing, cancelSwitch ends the newer one', async () => {
    boot({ realm: R1 });
    const slow = slowProbe();
    const older = startSwitch(R2);
    const newer = startSwitch('all');
    older.cancel();
    expect(snapshot().switching).toBe('all');
    expect(cancelSwitch()).toBe(true);
    expect(await newer.done).toBe(false);
    slow.res();
    await settle();
    expect(selected()).toBe(R1);
  });

  it('a switch core refuses while the shell has one pending leaves that one cancellable', async () => {
    boot({ realm: R1 });
    const slow = slowProbe();
    const op = startSwitch(R2);
    const refused = startSwitch('not-a-realm');
    expect(await refused.done).toBe(false);
    expect(cancelSwitch()).toBe(true);
    expect(snapshot().switching).toBe(null);
    expect(await op.done).toBe(false);
    slow.res();
    await settle();
    expect(selected()).toBe(R1);
  });

  it('nothing to cancel once the switch ended, or when core refused it', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const op = startSwitch(R2);
    expect(await op.done).toBe(true);
    const g = gen();
    expect(cancelSwitch()).toBe(false);
    expect([selected(), gen()]).toEqual([R2, g]);
    const r = switchRevision();
    const refused = startSwitch(R2);
    expect(switchRevision()).toBe(r);
    expect(await refused.done).toBe(false);
    expect(cancelSwitch()).toBe(false);
  });
});

// Only the realm probe waits; every other read answers at once. (slowProbe holds every read, which also ends a
// superseded probe early through the reads its newer switch makes, so it cannot show the gap these tests are for.)
function probeOnly() {
  const slow = deferred();
  onFetch(async (c) => {
    if (c.url.includes('/projects')) await slow.p;
    return { status: 200, body: { data: {} } };
  });
  return slow;
}

describe('a switch the shell started ends as soon as another takes over', () => {
  it('a newer shell switch: the older done is false at once, before its probe ends', async () => {
    boot({ realm: R1 });
    const slow = probeOnly();
    const older = startSwitch(R2);
    let olderDone: boolean | undefined;
    void older.done.then((v) => (olderDone = v));
    // The older probe is in flight (sent, unanswered) when the newer switch starts.
    await settle();
    expect(olderDone).toBeUndefined();
    const newer = startSwitch('all');
    await settle();
    expect(olderDone).toBe(false);
    expect(await newer.done).toBe(true);
    expect(selected()).toBe('all');
    slow.res();
    await settle();
    expect(selected()).toBe('all');
  });

  it('a switch started outside the shell: the same, and that switch is left alone', async () => {
    boot({ realm: R1 });
    const slow = probeOnly();
    const op = startSwitch(R2);
    let done: boolean | undefined;
    void op.done.then((v) => (done = v));
    await settle();
    expect(done).toBeUndefined();
    const outside = beginSwitch('all');
    await settle();
    expect(done).toBe(false);
    expect(await outside.done).toBe(true);
    expect(cancelSwitch()).toBe(false);
    slow.res();
    await settle();
    expect(selected()).toBe('all');
  });

  it('a refused start takes nothing over: the pending switch keeps waiting on its probe', async () => {
    boot({ realm: R1 });
    const slow = probeOnly();
    const op = startSwitch(R2);
    let done: boolean | undefined;
    void op.done.then((v) => (done = v));
    startSwitch('not-a-realm');
    await settle();
    expect(done).toBeUndefined();
    slow.res();
    await settle();
    expect(done).toBe(true);
    expect(selected()).toBe(R2);
  });
});
