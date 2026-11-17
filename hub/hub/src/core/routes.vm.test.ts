// The `vm` kit (the program that runs virtual machines inside a computer): a route declared for it goes to vm-1 on the
// computer, and its refusals name their code. hoody-vm answers an error as {error: {code, message, retryable}}: for this
// kit only, errorOf reads the code from that nested object. A code is a name for words and details; it never changes
// what a rejection means: a 5xx to a sent change stays pending and a 4xx stays a definite refusal. Only a code the route
// itself lists in refuses is a refusal before anything was applied (notApplied), as on an agent route.
import { describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { portAddress } from './hosts';
import { errorOf } from './kit';
import { defineRoute } from './routes';
import { boot, calls, onFetch, PROXY, R1, TARGET } from './test/env';

const res = (status: number) => new Response(null, { status });
const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);
const vmError = (code: unknown) => ({ error: { code, message: 'a sentence for people', retryable: false } });

describe("kit 'vm': declaration and address", () => {
  it("a 'vm' route goes to vm-1 on the computer", async () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'GET', path: '/api/v1/vm/capabilities', scope: 'kit', kit: 'vm', index: 1 });
    await api(r);
    expect(calls.map((c) => c.url)).toEqual([`https://p1-c1-vm-1.sv1.${PROXY}/api/v1/vm/capabilities`]);
    expect(calls[0]!.url).toBe(portAddress(TARGET.project, TARGET.container, 1, 'vm') + '/api/v1/vm/capabilities');
  });
  it('a kit name the table does not hold is still refused at declaration', () => {
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit: 'vms' as never, index: 1 })).toThrow(/ROUTE_INVALID: kit/);
  });
});

describe("errorOf for kit 'vm': the code is error.code", () => {
  const of = (status: number, body: unknown, shape: boolean | 'vm' = 'vm') => errorOf(res(status), JSON.stringify(body), shape);
  it('reads the nested code, on a 4xx and on a 5xx alike', () => {
    expect(of(409, vmError('BadState')).code).toBe('BadState');
    expect(of(507, vmError('InsufficientSpace')).code).toBe('InsufficientSpace');
  });
  it('never marks the code promoted, and data stays as sent', () => {
    const x = of(409, vmError('PortForwardConflict'));
    expect(x.promoted).toBeUndefined();
    expect(x.data).toEqual(vmError('PortForwardConflict'));
  });
  it('every other caller keeps its reading: an object under `error` names no code', () => {
    expect(of(409, vmError('BadState'), false).code).toBeNull();
    expect(of(409, vmError('BadState'), true).code).toBeNull();
  });
  it('no code from a nested code that is not a string, is empty or is longer than 64; nor from error as a list', () => {
    for (const bad of [7, '', 'X'.repeat(65), null, { code: 'BadState' }]) expect(of(409, vmError(bad)).code, JSON.stringify(bad)).toBeNull();
    expect(of(409, { error: ['BadState'] }).code).toBeNull();
    expect(errorOf(res(409), null, 'vm').code).toBeNull();
    expect(errorOf(res(409), 'nope', 'vm').code).toBeNull();
  });
  it('a top-level string code still reads when the body has no nested one', () => {
    expect(of(404, { code: 'NOT_FOUND' }).code).toBe('NOT_FOUND');
  });
});

describe("kit 'vm' through api(): the code names the refusal, the outcome rules do not move", () => {
  const read = defineRoute({ method: 'GET', path: '/api/v1/vm/vms/:name/agent/inventory', scope: 'kit', kit: 'vm', index: 1 });
  const change = defineRoute({ method: 'PATCH', path: '/api/v1/vm/vms/:name', scope: 'kit', kit: 'vm', index: 1, body: ['memory_mib'] });
  const terminal = defineRoute({ method: 'POST', path: '/api/v1/terminal/write', scope: 'kit', kit: 'terminal', index: 15001, body: ['input'] });
  it('a refused read carries the code and the body', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: vmError('BadState') }));
    const e = (await outcome(api(read, { params: { name: 'web-1' } }))) as HubError;
    expect(e).toMatchObject({ code: 'BadState', kind: 'refused', status: 409 });
    expect((e.data as { error: { code: string } }).error.code).toBe('BadState');
  });
  it('a 4xx to a change is a definite refusal with its code, never notApplied', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: vmError('OperationInProgress') }));
    const e = (await outcome(api(change, { params: { name: 'web-1' }, body: { memory_mib: 2048 } }))) as HubError;
    expect(e).toMatchObject({ code: 'OperationInProgress', kind: 'refused', status: 409 });
    expect(e.notApplied).toBeUndefined();
    expect(e.pending).toBeUndefined();
  });
  it('a 5xx to a change stays pending and keeps the code', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 507, body: vmError('InsufficientSpace') }));
    const e = (await outcome(api(change, { params: { name: 'web-1' }, body: { memory_mib: 2048 } }))) as HubError;
    expect(e).toMatchObject({ kind: 'pending', pending: true, status: 507, code: 'InsufficientSpace' });
  });
  it('another kit answering the same shape names no code', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: vmError('BadState') }));
    const e = (await outcome(api(terminal, { body: { input: 'ls' } }))) as HubError;
    expect(e.code ?? null).toBeNull();
    expect(e.kind).toBe('refused');
  });
});

describe("kit 'vm': a route's refuses codes are refusals before anything was applied", () => {
  const spec = { scope: 'kit', kit: 'vm', index: 1 } as const;
  const start = defineRoute({ ...spec, method: 'POST', path: '/api/v1/vm/vms/:name/start', refuses: ['InsufficientSpace'] });
  const create = defineRoute({ ...spec, method: 'POST', path: '/api/v1/vm/vms', body: ['name'], refuses: ['DisplayUnavailable'] });
  const plain = defineRoute({ ...spec, method: 'POST', path: '/api/v1/vm/vms/:name/stop' });
  const terminal = defineRoute({ method: 'POST', path: '/api/v1/terminal/write', scope: 'kit', kit: 'terminal', index: 15001, body: ['input'] });
  const send = async (status: number, body: unknown, call: () => Promise<unknown>) => {
    boot({ realm: R1 });
    onFetch(() => ({ status, body }));
    return (await outcome(call())) as HubError;
  };
  it.each([
    ['start, 507 InsufficientSpace', 507, 'InsufficientSpace', () => api(start, { params: { name: 'web-1' } })],
    ['create, 503 DisplayUnavailable', 503, 'DisplayUnavailable', () => api(create, { body: { name: 'web-1' } })],
  ] as const)('%s: a definite refusal, notApplied, never pending', async (_n, status, code, call) => {
    const e = await send(status, vmError(code), call);
    expect(e).toMatchObject({ status, code, notApplied: true });
    expect(e.kind).not.toBe('pending');
    expect(e.pending).toBeUndefined();
  });
  it.each([
    ['another code', vmError('StorageFailed')],
    ['a code another route lists', vmError('DisplayUnavailable')],
    ['no code', {}],
    ['the code at the top level only is still the listed one', null],
  ] as const)('start, 507 with %s: pending unless the listed code is named', async (name, body) => {
    if (body === null) {
      expect(await send(507, { code: 'InsufficientSpace' }, () => api(start, { params: { name: 'web-1' } }))).toMatchObject({ status: 507, notApplied: true });
      return;
    }
    const e = await send(507, body, () => api(start, { params: { name: 'web-1' } }));
    expect(e, name).toMatchObject({ kind: 'pending', pending: true, status: 507 });
    expect(e.notApplied).toBeUndefined();
  });
  it('create, 500 and 503 without the listed code stay pending', async () => {
    for (const [status, body] of [[500, vmError('StorageFailed')], [503, vmError('KvmUnavailable')], [503, {}]] as const) {
      const e = await send(status, body, () => api(create, { body: { name: 'web-1' } }));
      expect(e, String(status)).toMatchObject({ kind: 'pending', pending: true, status });
      expect(e.notApplied).toBeUndefined();
    }
  });
  it('a vm route that lists nothing keeps a 507 with that code pending', async () => {
    const e = await send(507, vmError('InsufficientSpace'), () => api(plain, { params: { name: 'web-1' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true, code: 'InsufficientSpace' });
    expect(e.notApplied).toBeUndefined();
  });
  it('another kit: the same body is pending, and it cannot declare refuses', async () => {
    const e = await send(507, vmError('InsufficientSpace'), () => api(terminal, { body: { input: 'x' } }));
    expect(e).toMatchObject({ kind: 'pending', pending: true });
    expect(e.notApplied).toBeUndefined();
    expect(() => defineRoute({ method: 'POST', path: '/api/v1/terminal/write', scope: 'kit', kit: 'terminal', index: 15001, refuses: ['InsufficientSpace'] })).toThrow(/ROUTE_INVALID: refuses/);
  });
  it('a vm route cannot be a tool envelope, and an empty or repeated list is refused', () => {
    expect(() => defineRoute({ ...spec, method: 'POST', path: '/x', refuses: ['A'], envelope: true })).toThrow(/ROUTE_INVALID: envelope/);
    expect(() => defineRoute({ ...spec, method: 'POST', path: '/x', refuses: [] })).toThrow(/ROUTE_INVALID: refuses/);
    expect(() => defineRoute({ ...spec, method: 'POST', path: '/x', refuses: ['A', 'A'] })).toThrow(/ROUTE_INVALID: refuses/);
  });
});
