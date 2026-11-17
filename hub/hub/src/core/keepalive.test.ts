// CallInput.keepalive: an agent or kit request asks fetch to let it outlive the page; without the flag the
// request is exactly what it was.
import { afterEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { attachRoutes, attachApi } from './agent/attach';
import { installTransport, type Transport } from './transport';
import { boot, R1, TARGET } from './test/env';

let inits: RequestInit[] = [];
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(_url, init) {
    inits.push(init);
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  },
};
function page() { boot({ realm: R1 }); inits = []; installTransport(tr); }
afterEach(() => installTransport(null));

describe('keepalive', () => {
  it('api() with keepalive:true sends the request with fetch keepalive', async () => {
    page();
    await api(attachRoutes.release, { params: { id: 's1', lease_id: 'L1' }, target: TARGET, realm: R1, keepalive: true });
    expect(inits[0]!.keepalive).toBe(true);
    expect(inits[0]!.method).toBe('DELETE');
  });
  it('without the flag, or with anything but true, the request carries no keepalive at all', async () => {
    page();
    await api(attachRoutes.release, { params: { id: 's1', lease_id: 'L1' }, target: TARGET, realm: R1 });
    await api(attachRoutes.release, { params: { id: 's1', lease_id: 'L1' }, target: TARGET, realm: R1, keepalive: false });
    await api(attachRoutes.release, { params: { id: 's1', lease_id: 'L1' }, target: TARGET, realm: R1, keepalive: 'yes' as never });
    expect(inits.map((i) => 'keepalive' in i)).toEqual([false, false, false]);
  });
  it('the lease release of attachApi carries it only when asked', async () => {
    page();
    await attachApi(TARGET).release('s1', 'L1', R1);
    await attachApi(TARGET).release('s1', 'L1', R1, true);
    await attachApi(TARGET).renew('s1', 'L1', R1);
    expect(inits.map((i) => i.keepalive)).toEqual([undefined, true, undefined]);
  });
});
