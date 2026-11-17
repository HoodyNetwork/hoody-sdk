// A lockout's wait (core/lockout.ts) read from a rejection as each client makes it. The web page's client keeps the
// whole answer body as `data`; the terminal's client (term/app/cli-client.ts) keeps the body's own `data`. One
// reader takes both, so the terminal shows the minutes too. A loopback server, the real terminal client: no real API.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The terminal client's own rejection of a 429 whose body names lockout_seconds: the wait is read (rounded up, capped at a day) | 'terminal rejection' |
// | 2 | The whole-body shape still reads, and wins when both are present; anything but a 429 with a positive finite number is undefined | 'both shapes' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cliHoodyClient, fetchWire } from '../term/app/cli-client';
import type { ClientCallControls } from '../term/host-types';
import { lockoutSeconds } from './lockout';

let srv: ReturnType<typeof Bun.serve>;
let API = '';
beforeAll(() => {
  srv = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (req) => {
    const p = new URL(req.url).pathname;
    if (p.endsWith('/locked')) return new Response(JSON.stringify({ statusCode: 429, error: 'TWOFACTOR_RATE_LIMIT', message: 'Too many failed attempts', data: { lockout_seconds: 899.2 } }), { status: 429 });
    if (p.endsWith('/plain')) return new Response(JSON.stringify({ statusCode: 429, error: 'RATE_LIMIT_EXCEEDED', message: 'slow down' }), { status: 429 });
    return new Response(JSON.stringify({ statusCode: 409, error: 'SOME_CODE', message: 'no', data: { lockout_seconds: 60 } }), { status: 409 });
  } });
  API = `http://127.0.0.1:${srv.port}`;
});
afterAll(() => { srv.stop(true); });

const controls = (): ClientCallControls => ({ session: { sid: 's1', generation: 1 }, signal: new AbortController().signal, beforeWire: () => true });
const refused = async (path: string): Promise<unknown> => {
  const c = cliHoodyClient({ identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1', source: 'login' }, apiOrigin: API, realmApiDomain: 'realms.example.invalid', currentSid: () => 's1', bearer: () => 'a-bearer', wire: fetchWire });
  return c.request('POST', path, { code: '123456' }, controls()).then(() => { throw new Error('answered'); }, (e: unknown) => e);
};

test('terminal rejection', async () => {
  const e = await refused('/users/auth/2fa/locked') as { status?: number; code?: string; data?: unknown };
  // The shape under test is the client's own: the body's `data`, not the body.
  expect(e.status).toBe(429);
  expect(e.data).toEqual({ lockout_seconds: 899.2 });
  expect(lockoutSeconds(e)).toBe(900);
  expect(lockoutSeconds(await refused('/users/auth/2fa/plain'))).toBeUndefined();
  expect(lockoutSeconds(await refused('/users/auth/2fa/other'))).toBeUndefined();
});

test('both shapes', () => {
  expect(lockoutSeconds({ status: 429, data: { statusCode: 429, data: { lockout_seconds: 61 } } })).toBe(61);
  expect(lockoutSeconds({ status: 429, data: { lockout_seconds: 5, data: { lockout_seconds: 61 } } })).toBe(61);
  expect(lockoutSeconds({ status: 429, data: { lockout_seconds: 1e9 } })).toBe(86400);
  // Plain digits as text read in the terminal's shape too.
  expect(lockoutSeconds({ status: 429, data: { lockout_seconds: '900' } })).toBe(900);
  for (const bad of [{ status: 429, data: { lockout_seconds: '15m' } }, { status: 429, data: { lockout_seconds: '-5' } }, { status: 429, data: { lockout_seconds: 0 } }, { status: 429, data: { lockout_seconds: Infinity } }, { status: 429, data: null }, { status: 401, data: { lockout_seconds: 900 } }, null]) {
    expect(lockoutSeconds(bad)).toBeUndefined();
  }
});
