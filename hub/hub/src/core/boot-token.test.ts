// boot-token.test.ts: agentBootToken's fences around the HubBootToken producer.
import { afterEach, describe, expect, it } from 'vitest';
import { agentBootToken, FIXTURE_BOOT_TOKEN, resetBootToken } from './boot-token';
import { capture, setIdentity } from './ctx';
import { bootFixtureCore } from './fixture-boot';
import { boot, OTHER, UID } from './test/env';

type G = { HubBootToken?: unknown };
const TOKEN = 'hdy_' + 'b'.repeat(40);
function producer(ensure: (uid: string) => Promise<unknown>): string[] {
  const asked: string[] = [];
  (globalThis as G).HubBootToken = { ensure: (u: string) => { asked.push(u); return ensure(u); } };
  return asked;
}
afterEach(() => { delete (globalThis as G).HubBootToken; resetBootToken(); });

describe('agentBootToken', () => {
  it("resolves the producer's token for the captured account (ok and degraded)", async () => {
    boot();
    const asked = producer(async () => ({ token: TOKEN, state: 'degraded', message: '' }));
    expect(await agentBootToken(capture())).toBe(TOKEN);
    expect(asked).toEqual([UID]);
  });
  it('a context that died before or after the answer: STALE, the token is never returned', async () => {
    boot();
    let release!: () => void;
    producer(() => new Promise((r) => { release = () => r({ token: TOKEN, state: 'ok' }); }));
    const ctx = capture();
    const p = agentBootToken(ctx).catch((e: unknown) => e);
    for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
    setIdentity({ id: OTHER, banned: false });
    release();
    expect(await p).toEqual({ code: 'STALE', stale: true });
    expect(await agentBootToken(ctx).catch((e: unknown) => e)).toEqual({ code: 'STALE', stale: true });
  });
  it('a failed or empty answer is BOOT_TOKEN_FAILED without message; skipped is NOT_ALLOWED', async () => {
    boot();
    producer(async () => { throw { token: '', state: 'failed', message: 'boom ' + TOKEN }; });
    const e = await agentBootToken(capture()).catch((x: unknown) => x);
    expect(e).toEqual({ code: 'BOOT_TOKEN_FAILED' });
    producer(async () => ({ token: '', state: 'ok' }));
    expect(await agentBootToken(capture()).catch((x: unknown) => x)).toEqual({ code: 'BOOT_TOKEN_FAILED' });
    producer(async () => ({ token: '', state: 'skipped' }));
    expect(await agentBootToken(capture()).catch((x: unknown) => x)).toEqual({ code: 'NOT_ALLOWED' });
  });
  it('without the producer it loads /auth/hub-boot-token.js once; a failed load is UNAVAILABLE', async () => {
    boot();
    const p = agentBootToken(capture()).catch((x: unknown) => x);
    const el = document.head.querySelector('script[src="/auth/hub-boot-token.js"]') as HTMLScriptElement | null;
    expect(el).not.toBeNull();
    el!.onerror?.(new Event('error'));
    expect(await p).toEqual({ code: 'UNAVAILABLE' });
    el!.remove();
  });
  it('fixture mode answers the fixture token, which is no credential', async () => {
    bootFixtureCore();
    expect(await agentBootToken(capture())).toBe(FIXTURE_BOOT_TOKEN);
  });
});
