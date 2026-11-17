// The VMs page's routes: every one the page may send is declared, goes to the VM program on the computer (program `vm`,
// number 1) under /api/v1/vm, and carries exactly the query and body keys the program takes.
import { api, portAddress, type HubError } from '@core';
import { describe, expect, it } from 'vitest';
import { boot, calls, onFetch, R1, TARGET } from '@core/test/env';
import { CREATE_BODY, UPDATE_BODY, routes } from './routes';

const VM_HOST = () => portAddress(TARGET.project, TARGET.container, 1, 'vm');
const kit = Object.entries(routes).filter(([k]) => k !== 'kvmSet');

describe('VM program routes', () => {
  it('declares the planned routes (29 of the VM program, and the KVM switch of the Hoody API), each once', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'caps', 'cdChange', 'cdEject', 'consoleWrite', 'dlDelete', 'dlStart', 'dls', 'inventory', 'isoDelete', 'isos', 'kvmSet', 'log', 'osinfo',
      'snapCreate', 'snapDelete', 'snapRestore', 'snaps', 'templates', 'vm', 'vmCreate', 'vmDelete', 'vmForceStop', 'vmKeys', 'vmPause',
      'vmReset', 'vmResume', 'vmStart', 'vmStop', 'vmUpdate', 'vms',
    ]);
    expect(new Set(Object.values(routes).map((r) => r.id)).size).toBe(Object.keys(routes).length);
  });
  it('every VM route is a kit route of program vm, number 1, under /api/v1/vm, with no idempotency key', () => {
    for (const [name, r] of kit) {
      expect([name, r.scope, r.kit, r.index], name).toEqual([name, 'kit', 'vm', 1]);
      expect(r.path.startsWith('/api/v1/vm/'), name).toBe(true);
      expect(r.idem, name).toBeUndefined();
      expect(r.unknownCodes, name).toBeNull();
    }
  });
  it('refuses lists exactly the codes the VM program answers before any effect: two routes, one code each', () => {
    expect(Object.fromEntries(kit.filter(([, r]) => r.refuses).map(([k, r]) => [k, r.refuses]))).toEqual({ vmCreate: ['DisplayUnavailable'], vmStart: ['InsufficientSpace'] });
  });
  it('only the console line is a secret route (a text body)', () => {
    expect(kit.filter(([, r]) => r.secret).map(([k]) => k)).toEqual(['consoleWrite']);
    expect(routes.consoleWrite.bodyText).toBe(true);
  });
  it('query and body keys are the program\'s', () => {
    expect(routes.vmCreate.body).toEqual([...CREATE_BODY]);
    expect(routes.vmUpdate.body).toEqual([...UPDATE_BODY]);
    expect(routes.vmDelete.query).toEqual(['force']);
    expect(routes.vmStop.body).toEqual(['grace_seconds']);
    expect(routes.vmKeys.body).toEqual(['keys', 'hold_ms']);
    expect(routes.cdChange.body).toEqual(['source']);
    expect(routes.snapCreate.body).toEqual(['label']);
    expect(routes.dlStart.body).toEqual(['url', 'sha256']);
    expect(routes.osinfo.query).toEqual(['arch']);
    expect(routes.log.query).toEqual(['source', 'tail']);
    for (const k of ['vmStart', 'vmForceStop', 'vmPause', 'vmResume', 'vmReset', 'snapRestore'] as const) expect(routes[k].body, k).toBeNull();
  });
  it('snapshot create and restore wait ten minutes; the log read takes up to 2 MiB', () => {
    expect(routes.snapCreate.timeoutMs).toBe(600_000);
    expect(routes.snapRestore.timeoutMs).toBe(600_000);
    expect(routes.log.maxBytes).toBe(2 * 1024 * 1024);
  });
  it('a read goes to the computer\'s vm-1 address', async () => {
    boot({ realm: R1 });
    await api(routes.vm, { params: { name: 'web-1' } });
    expect(calls.map((c) => c.url)).toEqual([VM_HOST() + '/api/v1/vm/vms/web-1']);
  });
  it('a stop sends an empty object, and a key the program does not take is refused unsent', async () => {
    boot({ realm: R1 });
    await api(routes.vmStop, { params: { name: 'web-1' }, body: {} });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({});
    const e = await api(routes.vmUpdate, { params: { name: 'web-1' }, body: { name: 'other' } as never }).then(() => null, (x: HubError) => x);
    expect(e).toMatchObject({ kind: 'not_sent', code: 'ROUTE_BODY' });
    expect(calls).toHaveLength(1);
  });
  it('a VM name that is not one path segment never leaves', async () => {
    boot({ realm: R1 });
    for (const name of ['', '..', 'a/b', 'a%2Fb']) {
      const e = await api(routes.vm, { params: { name } }).then(() => null, (x: HubError) => x);
      expect(e, name).toMatchObject({ kind: 'not_sent', code: 'ROUTE_PARAMS' });
    }
    expect(calls).toHaveLength(0);
  });
  it('a refusal carries the VM program\'s code', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: { code: 'BadState', message: 'the VM is running', retryable: true } } }));
    const e = await api(routes.vmUpdate, { params: { name: 'web-1' }, body: { vcpus: 4 } }).then(() => null, (x: HubError) => x);
    expect(e).toMatchObject({ kind: 'refused', status: 409, code: 'BadState' });
  });
});

describe('the KVM switch route', () => {
  it('is the Hoody API\'s PUT on the realm host, body kvm only', () => {
    expect([routes.kvmSet.method, routes.kvmSet.path, routes.kvmSet.scope]).toEqual(['PUT', '/computers/:id/kvm', 'realm']);
    expect(routes.kvmSet.body).toEqual(['kvm']);
  });
  it('a timed-out change is pending, never a refusal; a state conflict is a refusal', async () => {
    expect(routes.kvmSet.unknownCodes).toEqual(['KVM_CHANGE_TIMED_OUT']);
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'KVM_CHANGE_TIMED_OUT' } }));
    const p = await api(routes.kvmSet, { params: { id: 'c1' }, body: { kvm: true } }).then(() => null, (x: HubError) => x);
    expect(p).toMatchObject({ kind: 'pending', pending: true });
    onFetch(() => ({ status: 409, body: { error: 'OPERATION_STATE_CONFLICT' } }));
    const r = await api(routes.kvmSet, { params: { id: 'c1' }, body: { kvm: true } }).then(() => null, (x: HubError) => x);
    expect(r?.pending).toBeUndefined();
    expect(r).toMatchObject({ status: 409, code: 'OPERATION_STATE_CONFLICT' });
  });
});
