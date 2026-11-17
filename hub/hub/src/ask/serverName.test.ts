// Every request of the AI page goes to the SERVER the computer runs on (`container.server_name`, the host label
// core/hosts.ts builds the agent's address from), never to the computer's display name. The AI page used to put the display name
// there (`sunny-red-lemur`), so the agent's host was wrong. Here the real registry builds its engines, pinned engines, fork
// recovery and starters over a `liveIO` that records the target it is given; the address that target makes is asserted, and an
// unknown server makes no address at all (nothing is sent, never a guessed host).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __targets?: unknown[] };
      (g.__targets ??= []).push(t);
      return real.withFixtureDest(new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'] }, realClock), t.container.id);
    },
  };
});

import './data';
import { buildPortUrl, computerHandle, type Target } from '@core';
import { setProxyDomain } from '../core/hosts';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { resetStartersForTests, starterOf, type StartDeps } from './active';
import { targetOf, type Slot } from './engine';
import type * as Reg from './registry';
import { ACCOUNT, REALM, slot as BASE, world, type World } from './accept/env';

const DISPLAY = 'sunny-red-lemur';
const SERVER = 'node-amber';
const OTHER_SERVER = 'node-orca';
const AT = { project: BASE.project, id: BASE.computer, name: DISPLAY };
const HANDLE = computerHandle({ id: BASE.computer, name: DISPLAY });
const REF = { computer: HANDLE, realm: REALM, sid: 'sess-1' };
const SLOT: Slot = { ...BASE, name: DISPLAY };

let w: World | null = null;
const targets = () => ((globalThis as { __targets?: Array<Target> }).__targets ??= []);
const last = () => targets().at(-1)!;
/** The address the agent of `t` is reached at ('' when its host is not known). */
const agentAddr = (t: Target) => buildPortUrl(t.project, t.container, 'agent', 1);
const reg = async (): Promise<typeof Reg> => import('./registry');

beforeEach(() => { resetApproversForTests(); resetStartersForTests(); setProxyDomain('hoody.test'); (globalThis as { __targets?: unknown[] }).__targets = []; });
afterEach(async () => {
  (await reg()).resetRegistryForTests();
  resetStartersForTests();
  setProxyDomain(null);
  w?.dispose();
  w = null;
  resetApproversForTests();
});

const goesToServer = (t: Target, server = SERVER) => {
  const a = agentAddr(t);
  expect(a, 'an address was made').not.toBe('');
  expect(a).toContain('.' + server + '.');
  expect(a, 'the display name is never a host').not.toContain(DISPLAY);
};
const goesNowhere = (t: Target) => {
  expect(t.container.server_name, 'no server known: none named').toBeUndefined();
  expect(agentAddr(t), 'no address: nothing can be sent').toBe('');
  expect(JSON.stringify(t)).not.toContain(DISPLAY);
};

describe('the dock engine', () => {
  it('reaches its computer through the server, and its approver lease names the server too', async () => {
    w = world();
    const R = await reg();
    const eng = R.engineFor({ ...SLOT, server: SERVER }, { project: { id: SLOT.project }, container: { id: SLOT.computer, server_name: SERVER } } as unknown as Target);
    goesToServer(last());
    goesToServer((eng as any).leaseRef(REALM, null).target);
  });

  it('with no server known, makes no address (the display name is never put there)', async () => {
    w = world();
    const R = await reg();
    const eng = R.engineFor(SLOT, { project: { id: SLOT.project }, container: { id: SLOT.computer } } as unknown as Target);
    goesNowhere(last());
    goesNowhere((eng as any).leaseRef(REALM, null).target);
  });

  it('a server that becomes known replaces the engine made without one: the next request goes to the server', async () => {
    w = world();
    const R = await reg();
    const bare = { project: { id: SLOT.project }, container: { id: SLOT.computer } } as unknown as Target;
    const first = R.engineFor(SLOT, bare);
    goesNowhere(last());
    const known = R.engineFor({ ...SLOT, server: SERVER }, { project: { id: SLOT.project }, container: { id: SLOT.computer, server_name: SERVER } } as unknown as Target);
    expect(known, 'a new engine, built on the server').not.toBe(first);
    goesToServer(last());
    expect(R.engineFor({ ...SLOT, server: SERVER }, last()), 'and it is then the one engine of the slot').toBe(known);
  });
});

describe('a busy engine keeps its server', () => {
  it('the dock engine with something on its way is not ended for a server change; once settled it moves', async () => {
    w = world();
    const R = await reg();
    const on = (s: string) => ({ project: { id: SLOT.project }, container: { id: SLOT.computer, server_name: s } }) as unknown as Target;
    const first = R.engineFor({ ...SLOT, server: SERVER }, on(SERVER));
    const busy = vi.spyOn(first, 'inFlight').mockReturnValue(true);
    expect(R.engineFor({ ...SLOT, server: OTHER_SERVER }, on(OTHER_SERVER)), 'a send on its way keeps its engine').toBe(first);
    expect(first.getSnapshot().phase).not.toBe('ended');
    busy.mockReturnValue(false);
    const moved = R.engineFor({ ...SLOT, server: OTHER_SERVER }, on(OTHER_SERVER));
    expect(moved).not.toBe(first);
    goesToServer(last(), OTHER_SERVER);
  });

  it('a pinned engine with something on its way is not replaced for a server change; a later open moves it', async () => {
    w = world();
    const R = await reg();
    const a = R.openRef(ACCOUNT, REF, { ...AT, server: SERVER })!;
    const first = a.current();
    const busy = vi.spyOn(first, 'inFlight').mockReturnValue(true);
    const b = R.openRef(ACCOUNT, REF, { ...AT, server: OTHER_SERVER })!;
    expect(b.current(), 'a send on its way keeps its engine').toBe(first);
    expect(first.getSnapshot().phase).not.toBe('ended');
    busy.mockReturnValue(false);
    const c = R.openRef(ACCOUNT, REF, { ...AT, server: OTHER_SERVER })!;
    expect(c.current()).not.toBe(first);
    goesToServer(last(), OTHER_SERVER);
    a.release(); b.release(); c.release();
  });
});

describe('a conversation pinned by its reference', () => {
  it('reaches the computer through the server the page shows', async () => {
    w = world();
    const R = await reg();
    const h = R.openRef(ACCOUNT, REF, { ...AT, server: SERVER });
    expect(h).not.toBeNull();
    goesToServer(last());
    h!.release();
  });

  it('with no server known, makes no address', async () => {
    w = world();
    const R = await reg();
    const h = R.openRef(ACCOUNT, REF, AT);
    expect(h).not.toBeNull();
    goesNowhere(last());
    h!.release();
  });

  it('a restored reference gets its server only from the shell directory when the page does not show the computer', async () => {
    w = world();
    const R = await reg();
    R.setComputerDirectory({ resolve: (h) => (h === HANDLE ? { ...AT, server: SERVER } : null), handleOf: () => HANDLE });
    const h = R.openRef(ACCOUNT, REF);
    expect(h, 'the directory names the computer').not.toBeNull();
    goesToServer(last());
    h!.release();
  });

  it('a server that becomes known opens the conversation again on the server (the hold made without one is let go first)', async () => {
    w = world();
    const R = await reg();
    const a = R.openRef(ACCOUNT, REF, AT)!;
    goesNowhere(last());
    a.release();
    const b = R.openRef(ACCOUNT, REF, { ...AT, server: SERVER })!;
    goesToServer(last());
    b.release();
  });

  it('a hold still open when the server becomes known moves to an engine on the server, in place: one engine, the holders told', async () => {
    w = world();
    const R = await reg();
    const a = R.openRef(ACCOUNT, REF, AT)!;
    const before = a.current();
    goesNowhere(last());
    let swaps = 0;
    a.onSwap(() => { swaps++; });
    const b = R.openRef(ACCOUNT, REF, { ...AT, server: SERVER })!;
    goesToServer(last());
    expect(b.current(), 'one engine for the conversation').toBe(a.current());
    expect(a.current(), 'the engine made without a server is replaced').not.toBe(before);
    expect(before.getSnapshot().phase, 'and ended').toBe('ended');
    expect(swaps, 'the holders were told').toBe(1);
    const c = R.openRef(ACCOUNT, REF, AT)!;
    expect(c.current(), 'a caller that does not know the server never gives it up').toBe(a.current());
    a.release(); b.release(); c.release();
  });

  it('another server is another host (a computer moved between servers is never sent to the old one)', async () => {
    w = world();
    const R = await reg();
    const a = R.openRef(ACCOUNT, REF, { ...AT, server: SERVER })!;
    goesToServer(last());
    a.release();
    const b = R.openRef(ACCOUNT, REF, { ...AT, server: OTHER_SERVER })!;
    goesToServer(last(), OTHER_SERVER);
    b.release();
  });
});

describe('the fork recovery of a computer', () => {
  it('reads through the server the page shows; with none known it has no address', async () => {
    w = world();
    const R = await reg();
    expect(R.forkRecoveryFor(ACCOUNT, { computer: HANDLE, realm: REALM }, { ...AT, server: SERVER })).not.toBeNull();
    goesToServer(last());
    R.resetRegistryForTests();
    (globalThis as { __targets?: unknown[] }).__targets = [];
    expect(R.forkRecoveryFor(ACCOUNT, { computer: HANDLE, realm: REALM }, AT)).not.toBeNull();
    goesNowhere(last());
  });

  it('the shared connection made without a server is not kept once the server is known', async () => {
    w = world();
    const R = await reg();
    R.forkRecoveryFor(ACCOUNT, { computer: HANDLE, realm: REALM }, AT);
    goesNowhere(last());
    R.forkRecoveryFor(ACCOUNT, { computer: HANDLE, realm: REALM }, { ...AT, server: SERVER });
    goesToServer(last());
  });
});

describe('a new chat start', () => {
  const rig = (R: typeof Reg) => {
    const seen: Array<{ slot: Slot; target: Target }> = [];
    const deps: StartDeps = {
      engine: (s, t) => { seen.push({ slot: s, target: t }); return R.engineFor(s, t); },
      onEngines: R.subscribeAll,
      onPending: () => () => undefined,
    };
    return { seen, deps };
  };

  it('builds the place on the server: its slot and its target', async () => {
    w = world();
    const R = await reg();
    const { seen, deps } = rig(R);
    const s = starterOf(ACCOUNT, { computer: { ...AT, server: SERVER }, realm: REALM }, deps);
    expect(s).not.toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    for (const x of seen) { expect(x.slot.server).toBe(SERVER); goesToServer(x.target); }
    goesToServer(last());
    s!.release();
  });

  it('a place made with no server is not kept once the server is known', async () => {
    w = world();
    const R = await reg();
    const { seen, deps } = rig(R);
    const a = starterOf(ACCOUNT, { computer: AT, realm: REALM }, deps)!;
    goesNowhere(seen.at(-1)!.target);
    a.release();
    const n = seen.length;
    const b = starterOf(ACCOUNT, { computer: { ...AT, server: SERVER }, realm: REALM }, deps)!;
    expect(seen.length).toBeGreaterThan(n);
    goesToServer(seen.at(-1)!.target);
    expect(seen.at(-1)!.slot.server).toBe(SERVER);
    b.release();
  });

  it('a place still held when the server becomes known also moves to it', async () => {
    w = world();
    const R = await reg();
    const { seen, deps } = rig(R);
    const a = starterOf(ACCOUNT, { computer: AT, realm: REALM }, deps)!;
    goesNowhere(seen.at(-1)!.target);
    const b = starterOf(ACCOUNT, { computer: { ...AT, server: SERVER }, realm: REALM }, deps)!;
    goesToServer(seen.at(-1)!.target);
    a.release();
    b.release();
  });
});

describe('the activity read of a computer', () => {
  it('a slot read before the server was known takes the server once a caller names it', async () => {
    w = world();
    const R = await reg();
    const off0 = R.activitySource(SLOT, targetOf(SLOT.project, SLOT.computer)).subscribe(() => {});
    await vi.waitFor(() => expect(targets().length).toBeGreaterThan(0));
    goesNowhere(targets()[0]!);
    off0();
    const off1 = R.activitySource({ ...SLOT, server: SERVER }, targetOf(SLOT.project, SLOT.computer, SERVER)).subscribe(() => {});
    await vi.waitFor(() => expect(targets().some((t) => t.container.server_name === SERVER)).toBe(true));
    goesToServer(targets().find((t) => t.container.server_name === SERVER)!);
    off1();
  });
});
