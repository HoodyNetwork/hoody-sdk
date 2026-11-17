// Vitest: the Bot waiting alert (botAlert.ts). One alert per rise of the Bots waiting count within one account and
// realm; never on a first known count, a switch, or a count coming back from not known; fixed words. notifyAlert's own
// rules (on, away, passcode) are alert-lock.test.ts's: a spy here.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import strings from '../strings.en.json';
import { botWaitRose, useBotWaitingAlert } from './botAlert';

const world = vi.hoisted(() => ({ alerts: [] as unknown[][] }));
vi.mock('./alert', () => ({ notifyAlert: async (...a: unknown[]) => { world.alerts.push(a); return true; } }));

beforeEach(() => { world.alerts = []; });

describe('botWaitRose', () => {
  it('rises only above the last known count of the same scope', () => {
    expect(botWaitRose(null, 'a', 1)).toBe(false);
    expect(botWaitRose({ scope: 'a', count: 0 }, 'a', 1)).toBe(true);
    expect(botWaitRose({ scope: 'a', count: 1 }, 'a', 1)).toBe(false);
    expect(botWaitRose({ scope: 'a', count: 2 }, 'a', 1)).toBe(false);
    expect(botWaitRose({ scope: 'a', count: 0 }, 'b', 3)).toBe(false);
    expect(botWaitRose({ scope: 'a', count: undefined }, 'a', 3)).toBe(false);
    expect(botWaitRose({ scope: 'a', count: 1 }, 'a', undefined)).toBe(false);
  });
});

describe('useBotWaitingAlert', () => {
  const mount = (count: number | undefined, scope: string) =>
    renderHook(({ c, s }: { c: number | undefined; s: string }) => useBotWaitingAlert(c, s), { initialProps: { c: count, s: scope } });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const ALERT = ['bot', { title: strings['alert.botTitle'], body: strings['alert.botBody'], tag: 'waiting', to: '/bots' }];

  it('Bots already waiting at the first known count alert nothing; a rise alerts once', async () => {
    const h = mount(2, 'acct\u0000global');
    await flush();
    expect(world.alerts).toEqual([]);
    h.rerender({ c: 3, s: 'acct\u0000global' });
    await flush();
    expect(world.alerts).toEqual([ALERT]);
    h.rerender({ c: 3, s: 'acct\u0000global' });
    h.rerender({ c: 2, s: 'acct\u0000global' });
    await flush();
    expect(world.alerts).toHaveLength(1);
    h.rerender({ c: 3, s: 'acct\u0000global' });
    await flush();
    expect(world.alerts).toEqual([ALERT, ALERT]);
  });

  it('a count not known yet, then known, is a first count', async () => {
    const h = mount(undefined, 's');
    h.rerender({ c: 4, s: 's' });
    await flush();
    expect(world.alerts).toEqual([]);
  });

  it('a count that drops to not known and comes back higher alerts nothing', async () => {
    const h = mount(1, 's');
    h.rerender({ c: undefined, s: 's' });
    h.rerender({ c: 5, s: 's' });
    await flush();
    expect(world.alerts).toEqual([]);
  });

  it('a realm or account switch is a first count', async () => {
    const h = mount(0, 'acct\u0000global');
    h.rerender({ c: 2, s: 'acct\u0000a1b2c3d4e5f60718293a4b5c' });
    await flush();
    expect(world.alerts).toEqual([]);
  });
});
