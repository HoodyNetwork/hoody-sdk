// The demo boot is its own path: the live entry never reaches it, it takes only a marked demo client, and the mark
// and the proxy domain are the ones the host's demo client and the recorder use.
import { afterEach, expect, test } from 'bun:test';
import path from 'node:path';
import { reaches } from '../../../scripts/term/static-imports';
import { DEMO_CLIENT as CLIENT_MARK, DEMO_CONTEXT, demoClient } from '../../../scripts/term/build/demo-client';
import { DEMO_DOMAIN } from '../../../scripts/term/build/demo-source';
import { DEMO_CLIENT, DEMO_PROXY_DOMAIN, DEMO_TINTS, demoBoot, isDemoClient } from './boot.demo';
import { PALETTE, list as realmList } from '../../core/realm';
import { realm as selectedRealm } from '../../core/ctx';
import { clearLiveGate, directChange, liveEarlyRefusal, liveGateInstalled, setLiveGate, type LiveGate } from '../../core/live-gate';
import { programRoutes } from '../../core/programs';
import { beginTermSession } from '../env/session';
import { demoMounted } from './demo-flag';
import { mountDemoHub } from '../entry.demo';
import { mountTerminalHub } from '../entry.live';
import type { HoodyClient } from '../host-types';

const at = (f: string): string => path.join(import.meta.dir, f);

test('the live entry and the live boot never reach the demo boot or the demo entry', () => {
  for (const from of ['../entry.live.ts', '../entry.ts', 'boot.live.ts']) for (const to of ['boot.demo.ts', '../entry.demo.ts']) expect(reaches(at(from), at(to)), `${from} -> ${to}`).toBeNull();
});

test('the mark and the proxy domain are the host client\'s and the recorder\'s', () => {
  expect<symbol>(DEMO_CLIENT).toBe(CLIENT_MARK);
  expect(DEMO_PROXY_DOMAIN).toBe(DEMO_DOMAIN);
  expect(DEMO_PROXY_DOMAIN.endsWith('.invalid')).toBe(true);
  expect(isDemoClient(demoClient() as unknown as HoodyClient)).toBe(true);
});

test('a client without the mark is refused before anything starts, and the shell line stays off', async () => {
  const real = { identity: { kind: 'account', uid: 'u', sid: 's' }, realmApiDomain: 'x.invalid', request: async () => ({}), fetch: async () => new Response('') } as unknown as HoodyClient;
  expect(isDemoClient(real)).toBe(false);
  await expect(mountDemoHub({ client: real } as never)).rejects.toThrow('TERM_DEMO_CLIENT_REQUIRED');
  await expect(demoBoot(real, { profile: 'demo', realmId: 'f'.repeat(24) }, () => '/').start({ live: () => true } as never, () => {})).rejects.toThrow('TERM_DEMO_CLIENT_REQUIRED');
  expect(demoMounted()).toBe(false);
});

test('the sample realms get marks that differ from each other', () => {
  expect(new Set(DEMO_TINTS).size).toBe(DEMO_TINTS.length);
  for (const t of DEMO_TINTS) expect(PALETTE).toContain(t);
  expect(DEMO_TINTS.length).toBe(PALETTE.length);
});

test('the live mount refuses the demo client before anything starts (it would open as a real session)', async () => {
  await expect(mountTerminalHub({ client: demoClient() } as never)).rejects.toThrow('TERM_DEMO_CLIENT_LIVE');
});

// A session or boot a failing assertion left open is ended here (every later file would fail TERM_SESSION_ACTIVE).
const opened: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const end of opened.splice(0).reverse()) await Promise.resolve(end()).catch(() => {}); });

test('a fresh demo opens on the recorded realm, the one its sample data is in (never on "all realms")', async () => {
  const session = beginTermSession();
  opened.push(() => { session.end(); });
  const boot = demoBoot(demoClient() as unknown as HoodyClient, { ...DEMO_CONTEXT }, () => '/');
  opened.push(() => boot.dispose('term-abort'));
  await boot.start(session, () => {});
  expect(realmList()).toContain(DEMO_CONTEXT.realmId);
  expect(selectedRealm()).toBe(DEMO_CONTEXT.realmId);
});

/** A gate the demo did not install: it refuses every direct change and every send to a computer. */
const OTHER_GATE: LiveGate = {
  direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true, code: 'OTHER_GATE' })),
  early: () => ({ code: 'OTHER_GATE' }),
};

test('the demo makes no payment, as the live terminal: its gate is in while it runs and goes with it', async () => {
  const session = beginTermSession();
  opened.push(() => { session.end(); });
  const boot = demoBoot(demoClient() as unknown as HoodyClient, { ...DEMO_CONTEXT }, () => '/');
  expect(liveGateInstalled()).toBe(false);
  try {
    await boot.start(session, () => {});
    // What the checkout and Add funds read (pages/billing/parts/moneyHandoff.term.tsx): the hand-off, no Confirm.
    expect(liveGateInstalled()).toBe(true);
  } finally {
    await boot.dispose('term-abort');
  }
  expect(liveGateInstalled()).toBe(false);
});

test('the demo\'s own gate answers while it runs: changes pass through unbound, no send to a computer is refused early', async () => {
  const session = beginTermSession();
  opened.push(() => { session.end(); });
  opened.push(() => { setLiveGate(null); });
  const boot = demoBoot(demoClient() as unknown as HoodyClient, { ...DEMO_CONTEXT }, () => '/');
  // A gate left in the slot (as by a mount that never removed its own): the answers below are the demo's own gate's,
  // never that one's (and never only the no-gate path's, which gives the same answers).
  setLiveGate(OTHER_GATE);
  try {
    await boot.start(session, () => {});
    // A direct change runs with no record bound (the demo client then refuses it unsent).
    await expect(directChange('realm-alias-write', null, async (bind) => (bind === undefined ? 'ran' : 'bound'))).resolves.toBe('ran');
    // Nothing is refused early, a change to a computer included: the demo client refuses it unsent itself.
    expect(liveEarlyRefusal(programRoutes.start)).toBeNull();
    expect(liveEarlyRefusal(programRoutes.overview)).toBeNull();
  } finally {
    await boot.dispose('term-abort');
  }
  // Its own gate goes with it (the left one was replaced at the start).
  expect(liveGateInstalled()).toBe(false);
});

test('a demo mount\'s dispose leaves a gate it did not install (a later mount\'s)', async () => {
  const session = beginTermSession();
  opened.push(() => { session.end(); });
  opened.push(() => { setLiveGate(null); });
  const boot = demoBoot(demoClient() as unknown as HoodyClient, { ...DEMO_CONTEXT }, () => '/');
  try {
    await boot.start(session, () => {});
    // Another gate went in after this one: a test that ends the session itself frees the slot at once, and the next
    // mount's boot can install its gate before this boot's dispose runs.
    setLiveGate(OTHER_GATE);
  } finally {
    await boot.dispose('term-abort');
  }
  expect(liveGateInstalled()).toBe(true);
  expect(liveEarlyRefusal(programRoutes.start)).toEqual({ code: 'OTHER_GATE' });
});

test('clearLiveGate takes a gate out only while it is the installed one', () => {
  opened.push(() => { setLiveGate(null); });
  const mine: LiveGate = { direct: (_site, _place, send) => send(undefined) };
  setLiveGate(OTHER_GATE);
  clearLiveGate(mine);
  expect(liveGateInstalled()).toBe(true);
  clearLiveGate(OTHER_GATE);
  expect(liveGateInstalled()).toBe(false);
});

test('the demo mount refuses a store, whatever it holds: the sample account is never written to disk', async () => {
  for (const store of [{ dir: '/home/someone/.hoody/hub/abc' }, {}, null, false]) {
    await expect(mountDemoHub({ client: demoClient(), context: { ...DEMO_CONTEXT }, store } as never)).rejects.toThrow('TERM_DEMO_NO_STORE');
  }
  expect(demoMounted()).toBe(false);
});
