// Core's one leave guard on a realm switch (realm.ts beginSwitch). While work runs from this tab the commit
// asks first, right after the probe, so work started during the probe counts too; Stay ends the switch like a cancel.
// With nothing running the switch commits as before, without asking.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gen, realm as selected, snapshot } from './ctx';
import { holdLeave, setLeaveAsker } from './leave';
import { beginSwitch, onRealmNotice, switchTo, type RealmNotice } from './realm';
import { boot, deferred, onFetch, R1, R2, settle } from './test/env';

const releases: Array<() => void> = [];
const offs: Array<() => void> = [];
afterEach(() => { while (releases.length) releases.pop()!(); while (offs.length) offs.pop()!(); });
const hold = () => releases.push(holdLeave('upload'));
function asker(answer: boolean) {
  const fn = vi.fn((_n: number) => Promise.resolve(answer));
  offs.push(setLeaveAsker(fn));
  return fn;
}
function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  offs.push(onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); }));
  return seen;
}

describe('realm switch: the leave guard before the commit', () => {
  it('nothing running: commits without asking', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    expect(await switchTo(R2)).toBe(true);
    expect(selected()).toBe(R2);
    expect(ask).not.toHaveBeenCalled();
  });

  it('running and Stay: no commit, no notice, the switch line clears', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const seen = notices();
    hold();
    const ask = asker(false);
    const g = gen();
    expect(await beginSwitch(R2).done).toBe(false);
    expect(ask).toHaveBeenCalledWith(1, expect.any(Function));
    expect([selected(), gen()]).toEqual([R1, g]);
    expect(snapshot().switching).toBeNull();
    expect(seen).toEqual([]);
  });

  it('running and Go on anyway: commits', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    hold();
    const ask = asker(true);
    expect(await switchTo(R2)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(selected()).toBe(R2);
  });

  it('work started while the probe runs is asked about too', async () => {
    boot({ realm: R1 });
    const slow = deferred();
    onFetch(async () => { await slow.p; return { status: 200, body: {} }; });
    const ask = asker(false);
    const op = beginSwitch(R2);
    await settle();
    hold();
    slow.res();
    expect(await op.done).toBe(false);
    expect(ask).toHaveBeenCalledWith(1, expect.any(Function));
    expect(selected()).toBe(R1);
  });

  it('a switch superseded while the question is open commits nothing for the old one', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    hold();
    let answer: (ok: boolean) => void = () => undefined;
    offs.push(setLeaveAsker(() => new Promise<boolean>((r) => { answer = r; })));
    const op = beginSwitch(R2);
    await settle();
    op.cancel();
    answer(true);
    expect(await op.done).toBe(false);
    expect(selected()).toBe(R1);
  });
});
