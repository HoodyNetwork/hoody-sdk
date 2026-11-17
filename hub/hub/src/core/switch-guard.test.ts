// Unsaved work a page registers asks before a user-started realm switch (core realm.ts → askLeave),
// though nothing runs. A guard answering null asks nothing; an unregistered one is never read; a throwing one names nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLeave, setLeaveAsker } from './leave';
import { switchTo } from './realm';
import { lossesCovered, noteLossesConfirmed, registerSwitchGuard, switchLosses } from './switch-guard';
import { boot, onFetch, R1, R2 } from './test/env';
import { realm as selected } from './ctx';

const offs: Array<() => void> = [];
afterEach(() => { while (offs.length) offs.pop()!(); });
// As the shell's dialog does: Go on anyway records the sentences it showed (switch-guard.ts lossesCovered).
function asker(answer: boolean) {
  const fn = vi.fn((_n: number) => { if (answer) noteLossesConfirmed(switchLosses()); return Promise.resolve(answer); });
  offs.push(setLeaveAsker(fn));
  return fn;
}
const guard = (fn: () => string | null) => { const off = registerSwitchGuard(fn); offs.push(off); return off; };

describe('switch guards: what a switch or a sign-out would lose', () => {
  it('a dirty draft asks before the realm switch commits; Stay keeps the realm', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    guard(() => 'Leave New script? Your changes here aren\'t kept: what you typed.');
    expect(await switchTo(R2)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(selected()).toBe(R1);
  });

  it('a dirty draft and Go on anyway: the switch commits', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(true);
    guard(() => 'lost');
    expect(await switchTo(R2)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(selected()).toBe(R2);
  });

  it('a guard answering null (or blank) asks nothing', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    const ask = asker(false);
    guard(() => null);
    guard(() => '  ');
    expect(switchLosses()).toEqual([]);
    expect(await askLeave()).toBe(true);
    expect(await switchTo(R2)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('an unregistered guard (its page unmounted) is never read again; unregistering twice changes nothing', async () => {
    boot({ realm: R1 });
    const ask = asker(false);
    const read = vi.fn(() => 'lost');
    const off = registerSwitchGuard(read);
    const other = guard(() => 'other');
    expect(switchLosses()).toEqual(['lost', 'other']);
    off();
    off();
    read.mockClear();
    expect(switchLosses()).toEqual(['other']);
    other();
    expect(await askLeave()).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it('a guard that throws names nothing and blocks nothing', async () => {
    boot({ realm: R1 });
    const ask = asker(false);
    guard(() => { throw new Error('page fault'); });
    expect(switchLosses()).toEqual([]);
    expect(await askLeave()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('a loss named after the press, before the switch commits: asked again; Stay then keeps the realm', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    let later: string | null = null;
    guard(() => 'first');
    guard(() => later);
    let n = 0;
    const ask = vi.fn((_c: number) => {
      n += 1;
      if (n > 1) return Promise.resolve(false);
      noteLossesConfirmed(switchLosses());
      // Named in the same turn as the answer, after the press: not on the question the person confirmed.
      return Promise.resolve(true).then((ok) => { later = 'second'; return ok; });
    });
    offs.push(setLeaveAsker(ask));
    expect(await switchTo(R2)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(selected()).toBe(R1);
  });

  it('a true answer that recorded nothing covers no loss: the switch asks again rather than committing', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {} }));
    guard(() => 'lost');
    let n = 0;
    offs.push(setLeaveAsker(() => Promise.resolve(++n === 1)));
    expect(await switchTo(R2)).toBe(false);
    expect(n).toBe(2);
    expect(selected()).toBe(R1);
  });

  it('what an earlier question confirmed covers nothing in the next one', async () => {
    boot({ realm: R1 });
    noteLossesConfirmed(['lost']);
    expect(await askLeave()).toBe(true);
    guard(() => 'lost');
    expect(lossesCovered()).toBe(false);
  });

  it('a guard unregistered by an earlier guard during a read is not read', () => {
    const later = vi.fn(() => 'later');
    let offLater: () => void = () => undefined;
    guard(() => { offLater(); return 'first'; });
    offLater = registerSwitchGuard(later);
    expect(switchLosses()).toEqual(['first']);
    expect(later).not.toHaveBeenCalled();
  });

  it('a caller that no longer wants the answer gets Stay first, losses or not', async () => {
    boot({ realm: R1 });
    const ask = asker(true);
    guard(() => 'lost');
    expect(await askLeave(() => false)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});
