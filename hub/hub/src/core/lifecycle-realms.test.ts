// lifecycle.ts bootLive: the realm list read at boot (GET /realms) is a promise the boot hands back and nobody has to
// await. When that read fails (a 404 or 500, no answer), the failure must not escape as an unhandled rejection: the
// page reported it as "pageerror: Object" on the standalone smoke, where the fake API answers 404.
import { afterEach, describe, expect, it } from 'vitest';
import { bootLive, configureLifecycle, initLive } from './lifecycle';
import { boot, onFetch, R1, settle } from './test/env';

const seen: unknown[] = [];
const onUnhandled = (r: unknown) => { seen.push(r); };
afterEach(() => { process.off('unhandledRejection', onUnhandled); seen.length = 0; });

describe('bootLive and a failed realm list', () => {
  for (const status of [404, 500]) {
    it(`GET /realms answering ${status} leaves no unhandled rejection; the boot is ready and the list still reports it`, async () => {
      process.on('unhandledRejection', onUnhandled);
      boot({ realm: R1 });
      configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      onFetch((c) => (/\/realms(\?|$)/.test(c.url) ? { status, body: { statusCode: status, error: 'NOT_FOUND' } } : { status: 200, body: { data: { id: 'u1', username: 'u' } } }));
      const r = await bootLive();
      expect(r.state).toBe('ready');
      await settle();
      await new Promise((res) => setTimeout(res, 20));
      expect(seen).toEqual([]);
      // A caller that does await it still learns the read failed.
      if (r.state === 'ready') await expect(r.realms).rejects.toBeTruthy();
    });
  }
});
