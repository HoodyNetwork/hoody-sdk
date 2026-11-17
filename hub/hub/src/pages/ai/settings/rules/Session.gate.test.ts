// The settings session's create transport (liveApi.create, over core's real api()) is behind the same gate as
// every other create: against a gateway that does not bind a session to its computer nothing is sent; against protocol 3 with
// computer_binding it is sent once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, calls, onFetch, TARGET, R1 } from '@core/test/env';
import { liveApi } from './Session';

const on = (name: string) => ({ name, supported: true, available: true });
const V3 = { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map(on) };
const path = (c: { url: string }) => new URL(c.url).pathname.replace('/api/v1/agent', '');
const creates = () => calls.filter((c) => c.method === 'POST' && path(c) === '/sessions');
const at = { target: TARGET, realm: R1 } as never;
const body = { agent: 'chat', realm: R1, computer: TARGET.container.id };
beforeEach(() => { boot({ realm: R1 }); calls.length = 0; });
afterEach(() => { calls.length = 0; });
const serve = (version: { status: number; body?: unknown }) => { onFetch((c) => (c.method === 'GET' && path(c) === '/version' ? version : c.method === 'POST' && path(c) === '/sessions' ? { status: 201, body: { session_id: 's1' } } : { status: 404, body: {} })); }

describe('liveApi.create (the settings session)', () => {
  for (const [name, version] of [
    ['protocol 2', { status: 200, body: { ...V3, session_protocol_version: 2 } }],
    ['no computer_binding', { status: 200, body: { ...V3, capabilities: V3.capabilities.filter((c) => c.name !== 'computer_binding') } }],
    ['an unreadable version', { status: 503, body: {} }],
  ] as const) {
    it(`${name}: nothing is sent and the create is pending`, async () => {
      serve(version);
      await expect(liveApi.create(at, body as never, 'hx-' + 'b'.repeat(32))).rejects.toMatchObject({ pending: true });
      expect(creates()).toHaveLength(0);
    });
  }
  it('protocol 3 with computer_binding: the create is sent once under its key', async () => {
    serve({ status: 200, body: V3 });
    await liveApi.create(at, body as never, 'hx-' + 'b'.repeat(32));
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.headers['idempotency-key']).toBe('hx-' + 'b'.repeat(32));
  });
});
