// dispose.ts: a wipe of an ended sign-out is not started after a dispose, and one already running is told at its
// clear that the session check now fails (the next mount's data is not its to clear).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as dispose from './dispose';
import type * as life from './lifecycle';
import type * as env from './test/env';

const hook = vi.hoisted(() => ({ run: null as null | (() => void) }));
vi.mock('./cryptStore', async (orig) => {
  const real = await orig<Record<string, unknown> & { clearSignOutPlaintext: () => boolean }>();
  return { ...real, clearSignOutPlaintext: () => { const h = hook.run; hook.run = null; h?.(); return real.clearSignOutPlaintext(); } };
});

// The setup files load core before this file's mock exists: a fresh module graph takes the mocked cryptStore.
type Dispose = typeof dispose; type Life = typeof life; type Env = typeof env;
let m: { dispose: Dispose; life: Life; env: Env };
beforeEach(async () => {
  vi.resetModules();
  m = { dispose: await import('./dispose'), life: await import('./lifecycle'), env: await import('./test/env') };
});
afterEach(() => { hook.run = null; });

function mount(navs: string[]): void {
  m.env.boot({ realm: m.env.R1 });
  m.life.configureLifecycle({ navigate: (u) => { navs.push(u); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
  m.life.initLive();
}

describe('a Remove-all-local-data wipe when the session is disposed', () => {
  it('already running: its session check at the clear says the session is another\'s', async () => {
    const navs: string[] = [];
    mount(navs);
    const gate = m.env.deferred();
    const seen: boolean[] = [];
    m.life.logout({ wipe: async (other) => { await gate.p; seen.push(other()); return true; } });
    await m.env.settle(30);
    await m.dispose.disposeCoreSession('term-quit');
    mount(navs);
    gate.res();
    await m.env.settle(30);
    expect(seen).toEqual([true]);
    expect(navs).toEqual([]);
  });
  it('not yet started when the dispose comes: it never runs', async () => {
    const navs: string[] = [];
    mount(navs);
    const wipe = vi.fn(async () => true);
    hook.run = () => { queueMicrotask(() => { m.life.resetLifecycle(); }); }; // a dispose queued ahead of the wipe's task, after finish() ran its checks
    m.life.logout({ wipe });
    await m.env.settle(30);
    expect(hook.run).toBeNull(); // the hook ran
    expect(wipe).not.toHaveBeenCalled();
  });
});
