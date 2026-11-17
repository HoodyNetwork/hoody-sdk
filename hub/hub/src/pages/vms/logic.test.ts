// The page's pure rules, read against the same wire answers the fixture states serve (fixtures.ts FX): every row of the
// page's state table, the parsers (one malformed case per field, and answers that contradict themselves), the row
// kinds, the error codes and the refresh pace.
import { describe, expect, it } from 'vitest';
import { FX } from './fixtures';
import {
  hostFactsOf, hostState, isVmName, kvmStand, memoryUse, parseCaps, parseVm, parseVmList, pollMs, POLL_AFTER_CHANGE_MS, POLL_FAST_MS, POLL_SLOW_MS, rowKind,
  serverKindOf, startBlock, vmCode, VM_CODES, wantsVmReads,
  type CapsRead, type FactsRead, type HostState,
} from './logic';

const { COMPUTERS, CAPS, VMS } = FX;
type Row = Record<string, unknown>;
const obj = (v: unknown): Row => v as Row;
/** The plan kind core's top bar reads off a row (commerce.planChip), written out: the test does not lean on core. */
const planKind = (row: Row): 'paid' | 'bare_metal' | 'free' | null => {
  const s = row.server as Row | undefined;
  return !s ? null : s.paid_subserver === true ? 'paid' : s.is_free === false ? 'bare_metal' : 'free';
};
const factsOf = (row: Row): FactsRead => {
  const f = hostFactsOf(row, row.status === 'running' ? 'running' : 'stopped', planKind(row));
  return f ? { kind: 'ok', facts: f } : { kind: 'unknown' };
};
const capsOf = (wire: unknown): CapsRead => ({ kind: 'ok', caps: parseCaps(wire)! });
const state = (row: Row, caps: CapsRead): HostState => hostState(true, factsOf(row), caps);

describe('every row of the state table, from the fixtures', () => {
  it('no computer picked: none, and the VM program is not asked', () => {
    expect(hostState(false, { kind: 'loading' }, { kind: 'idle' })).toEqual({ kind: 'none' });
    expect(wantsVmReads(false, factsOf(COMPUTERS.bareMetal))).toBe(false);
  });
  it('the row still being read: loading, nothing asked yet', () => {
    expect(hostState(true, { kind: 'loading' }, { kind: 'idle' })).toEqual({ kind: 'loading' });
    expect(wantsVmReads(true, { kind: 'loading' })).toBe(false);
  });
  it('a stopped computer: stopped, not asked', () => {
    expect(state(COMPUTERS.stopped, { kind: 'idle' })).toEqual({ kind: 'stopped' });
    expect(wantsVmReads(true, factsOf(COMPUTERS.stopped))).toBe(false);
  });
  it('an expired computer: expired (before stopped), not asked; a reinstalled host reads the same', () => {
    expect(state(COMPUTERS.expired, { kind: 'idle' })).toEqual({ kind: 'expired' });
    expect(wantsVmReads(true, factsOf(COMPUTERS.expired))).toBe(false);
    expect(state({ ...COMPUTERS.bareMetal, status: 'host_reinstalled' }, { kind: 'idle' })).toEqual({ kind: 'expired' });
  });
  it.each([['free', COMPUTERS.shared], ['paid', COMPUTERS.sharedPaid]])('a shared server (%s plan): shared, not asked', (_n, row) => {
    expect(state(row, { kind: 'idle' })).toEqual({ kind: 'shared' });
    expect(wantsVmReads(true, factsOf(row))).toBe(false);
  });
  it('a server kind that is not known is never shared: the VM program is asked and no kind is claimed', () => {
    const facts = factsOf(COMPUTERS.kindUnknown);
    expect(facts).toMatchObject({ kind: 'ok', facts: { kind: null, kvm: null, kvmSupported: null } });
    expect(wantsVmReads(true, facts)).toBe(true);
    const s = hostState(true, facts, capsOf(CAPS.ready));
    expect(s).toMatchObject({ kind: 'ready', kindKnown: false, kvm: 'on' });
    expect(serverKindOf(null)).toBeNull();
  });
  it('a row that cannot be read claims nothing: asked, kind not known', () => {
    expect(wantsVmReads(true, { kind: 'unknown' })).toBe(true);
    expect(hostState(true, { kind: 'unknown' }, capsOf(CAPS.noKvm))).toMatchObject({ kind: 'ready', kindKnown: false, kvm: 'unknown' });
    expect(hostFactsOf(null, 'running', null)).toBeNull();
    expect(hostFactsOf({ name: 'x' }, 'running', null)).toBeNull();
  });
  it('bare metal, KVM on, the program answers: ready with KVM on', () => {
    const s = state(COMPUTERS.bareMetal, capsOf(CAPS.ready));
    expect(s).toMatchObject({ kind: 'ready', kvm: 'on', kindKnown: true });
    expect(startBlock(s)).toBeNull();
  });
  it('bare metal, KVM off: ready, the list loads, and nothing can start', () => {
    const s = state(COMPUTERS.kvmOff, capsOf(CAPS.noKvm));
    expect(s).toMatchObject({ kind: 'ready', kvm: 'off' });
    expect(startBlock(s)).toBe('kvmOff');
    expect(wantsVmReads(true, factsOf(COMPUTERS.kvmOff))).toBe(true);
  });
  it('KVM on in the Hoody API and not usable inside: its own stand, and nothing can start', () => {
    const s = state(COMPUTERS.bareMetal, capsOf(CAPS.noKvm));
    expect(s).toMatchObject({ kind: 'ready', kvm: 'notInside' });
    expect(startBlock(s)).toBe('kvmNotInside');
  });
  it('the server says no, or was not checked: the support fact is false, or null (never false)', () => {
    expect(factsOf(COMPUTERS.serverNo)).toMatchObject({ facts: { kind: 'bare_metal', kvmSupported: false } });
    expect(factsOf(COMPUTERS.serverUnchecked)).toMatchObject({ facts: { kind: 'bare_metal', kvmSupported: null } });
  });
  it('the VM program does not answer: unreachable, whatever the cause; while it is asked: loading', () => {
    expect(state(COMPUTERS.bareMetal, { kind: 'failed' })).toEqual({ kind: 'unreachable' });
    expect(state(COMPUTERS.bareMetal, { kind: 'loading' })).toEqual({ kind: 'loading' });
    expect(startBlock({ kind: 'unreachable' })).toBeNull();
  });
  it('the VM program answers in a shape this Hub does not read: unreadable, never unreachable', () => {
    expect(state(COMPUTERS.bareMetal, { kind: 'unreadable' })).toEqual({ kind: 'unreadable' });
    expect(startBlock({ kind: 'unreadable' })).toBeNull();
  });
  it('no memory limit set: ready, with no ceiling and nothing memory refuses', () => {
    const s = state(COMPUTERS.bareMetal, capsOf(CAPS.noLimit));
    expect(s).toMatchObject({ kind: 'ready', kvm: 'on', caps: { memory: { ceilingBytes: null } } });
    expect(memoryUse(parseCaps(CAPS.noLimit)!)).toMatchObject({ ceilingBytes: null, freeForNewVmMib: null });
  });
  it('kvmStand: the switch off wins; on inside wins over a switch that is not known', () => {
    expect([kvmStand(false, true), kvmStand(null, true), kvmStand(true, true), kvmStand(true, false), kvmStand(null, false)]).toEqual(['off', 'on', 'on', 'notInside', 'unknown']);
  });
});

describe('parseCaps', () => {
  it('reads every fixture answer', () => {
    for (const [name, wire] of Object.entries(CAPS)) expect(parseCaps(wire), name).not.toBeNull();
    const c = parseCaps(CAPS.ready)!;
    expect(c).toMatchObject({ kvmPresent: true, portFloor: 1024, budgets: { vms: { used: 3, ceiling: 16 }, vcpus: { used: 8, ceiling: 64 }, memslots: null } });
    expect(c.memory.admitted.map((a) => a.name)).toEqual(['web-1', 'db-1', 'stuck']);
    expect(parseCaps(CAPS.idle)!.portFloor).toBeNull();
    expect(parseCaps(CAPS.unidentified)!.memory.admitted.at(-1)).toEqual({ name: null, unidentifiedRun: 'run-7f3a', bytes: 6 * 1024 ** 3, estimated: true });
  });
  const edit = (f: (c: Row) => void): unknown => { const c = structuredClone(CAPS.ready) as unknown as Row; f(c); return c; };
  it.each<[string, (c: Row) => void]>([
    ['kvm_present not a boolean', (c) => { c.kvm_present = 'yes'; }],
    ['port floor a string', (c) => { c.unprivileged_port_start = '1024'; }],
    ['port floor past 65535', (c) => { c.unprivileged_port_start = 70000; }],
    ['memory missing', (c) => { delete c.memory; }],
    ['ceiling negative', (c) => { obj(c.memory).ceiling_bytes = -1; }],
    ['ceiling a fraction', (c) => { obj(c.memory).ceiling_bytes = 1.5; }],
    ['admitted not a list', (c) => { obj(c.memory).admitted = {}; }],
    ['an admitted entry without bytes', (c) => { obj(c.memory).admitted = [{ name: 'web-1' }]; }],
    ['an admitted entry with both names', (c) => { obj(c.memory).admitted = [{ name: 'web-1', unidentified_run: 'r', admitted_bytes: 1 }]; }],
    ['an admitted entry with neither name', (c) => { obj(c.memory).admitted = [{ admitted_bytes: 1 }]; }],
    ['an admitted name that is no VM name', (c) => { obj(c.memory).admitted = [{ name: 'Web_1', admitted_bytes: 1 }]; }],
    ['a budget without a ceiling', (c) => { obj(c.misc).kvm_vm = { used: 1 }; }],
    ['a provisioning flag missing', (c) => { delete obj(c.provisioning).tpm; }],
    ['machine type not text', (c) => { obj(c.provisioning).machine_type = 7; }],
    ['free disk missing', (c) => { c.storage = {}; }],
  ])('refuses: %s', (_n, f) => { expect(parseCaps(edit(f))).toBeNull(); });
  it('refuses what is no object at all', () => {
    for (const bad of [null, undefined, 'x', 7, [], [CAPS.ready]]) expect(parseCaps(bad)).toBeNull();
  });
  it('memoryUse: what running VMs hold, and the largest VM that still starts (after its own overhead)', () => {
    const m = memoryUse(parseCaps(CAPS.ready)!);
    expect(m.usedBytes).toBe((7 * 1024 + 3 * 256) * 1024 * 1024);
    expect(m.freeForNewVmMib).toBe(16 * 1024 - 7 * 1024 - 3 * 256 - 256);
    expect(m.unidentified).toBe(false);
    expect(memoryUse(parseCaps(CAPS.unidentified)!)).toMatchObject({ unidentified: true });
    const full = structuredClone(CAPS.ready) as unknown as Row;
    obj(full.memory).ceiling_bytes = 100 * 1024 * 1024;
    expect(memoryUse(parseCaps(full)!).freeForNewVmMib).toBe(0);
  });
});

describe('parseVmList and rowKind', () => {
  const rows = parseVmList(VMS.list)!;
  const kindOfRow = (name: string) => rowKind(rows.find((r) => r.name === name)!);
  it('reads the fixture list, one row per VM', () => {
    expect(rows.map((r) => r.name)).toEqual(VMS.details.map((d) => d.name));
    expect(rows.find((r) => r.name === 'files-1')!.share).toEqual({ bytes: 12 * 1024 ** 3, quotaBytes: 10 * 1024 ** 3, overQuota: true, partial: false, sampledUnix: expect.any(Number) });
  });
  it('names each row by what can be done with it; a failed create is not a VM whose run failed', () => {
    expect(kindOfRow('import-1')).toBe('createFailed');
    expect(kindOfRow('batch')).toBe('runFailed');
    expect(Object.fromEntries(['web-1', 'win11', 'build', 'db-1', 'cache', 'old-api', 'ghost'].map((n) => [n, kindOfRow(n)]))).toEqual({
      'web-1': 'running', win11: 'stopped', build: 'creating', 'db-1': 'paused', cache: 'starting', 'old-api': 'stopping', ghost: 'orphaned',
    });
    expect(rowKind({ phase: 'committed', state: null })).toBe('unknown');
    expect(rowKind({ phase: 'creating', state: null })).toBe('creating');
  });
  const ok = { name: 'a', vm_id: '0195c0de00000001', phase: 'committed', state: 'Stopped' };
  it('an empty list is a list; a row without id or state is still a row', () => {
    expect(parseVmList([])).toEqual([]);
    expect(parseVmList([{ name: 'a', phase: 'committed' }])).toEqual([{ name: 'a', vmId: null, phase: 'committed', state: null, share: null }]);
  });
  it.each<[string, unknown]>([
    ['not a list', { vms: [ok] }],
    ['a row that is no object', [ok, 'b']],
    ['a name that is no VM name', [{ ...ok, name: 'A' }]],
    ['a name longer than 63', [{ ...ok, name: 'a'.repeat(64) }]],
    ['no phase', [{ name: 'a' }]],
    ['a phase it does not know', [{ ...ok, phase: 'done' }]],
    ['a state it does not know', [{ ...ok, state: 'Sleeping' }]],
    ['an id with a space', [{ ...ok, vm_id: 'a b' }]],
    ['an id that is not 16 hex digits', [{ ...ok, vm_id: '0195c0de-0000-7000-8000-000000000001' }]],
    ['an id of 15 digits', [{ ...ok, vm_id: '0195c0de0000001' }]],
    ['an id in capitals', [{ ...ok, vm_id: '0195C0DE00000001' }]],
    ['an id of zeros', [{ ...ok, vm_id: '0'.repeat(16) }]],
    ['an id that is a number', [{ ...ok, vm_id: 7 }]],
    ['a share without bytes', [{ ...ok, share: { partial: false, sampled_unix: 1, over_quota: false } }]],
    ['a share over a limit it does not have', [{ ...ok, share: { bytes: 1, partial: false, sampled_unix: 1, over_quota: true } }]],
    ['creating and Running at once', [{ ...ok, phase: 'creating', state: 'Running' }]],
    ['committed and Creating at once', [{ ...ok, state: 'Creating' }]],
    ['one name twice', [ok, { ...ok, vm_id: '0195c0de00000002' }]],
  ])('one unreadable row makes the list unreadable: %s', (_n, wire) => { expect(parseVmList(wire)).toBeNull(); });
});

describe('parseVm', () => {
  it('reads every fixture VM under its own name, and refuses it under another', () => {
    for (const d of VMS.details) {
      expect(parseVm(d, String(d.name)), String(d.name)).not.toBeNull();
      expect(parseVm(d, 'another')).toBeNull();
    }
  });
  it('a running VM: its settings, screen and ports', () => {
    const vm = parseVm(VMS.detail('web-1'))!;
    expect(vm).toMatchObject({ state: 'Running', run: 'a1b2c3d400000001', monitorStalled: false, fault: null, progress: null });
    expect(vm.spec).toMatchObject({ memoryMib: 2048, vcpus: 2, display: 7001, autostart: true, firmware: 'uefi', ports: [{ proto: 'tcp', host: 8080, guest: 80 }, { proto: 'tcp', host: 2222, guest: 22 }] });
  });
  it('a VM being created has progress and no settings; a failed create says why', () => {
    expect(parseVm(VMS.detail('build'))).toMatchObject({ state: 'Creating', spec: null, progress: { phase: 'importing', fault: null } });
    expect(parseVm(VMS.detail('import-1'))).toMatchObject({ state: 'Failed', spec: null, progress: { phase: 'failed', fault: { code: 'InsufficientSpace' } } });
  });
  it('a recorded problem shows in any state; a code this page does not know keeps its sentence', () => {
    expect(parseVm(VMS.detail('batch'))!.fault).toEqual({ code: 'MemoryExceedsCgroup', message: expect.any(String) });
    const odd = { ...VMS.detail('batch'), error: { error: { code: 'BrandNew', message: 'm' } } };
    expect(parseVm(odd)!.fault).toEqual({ code: null, message: 'm' });
  });
  it('a stalled VM and an orphaned one', () => {
    expect(parseVm(VMS.detail('stuck'))!.monitorStalled).toBe(true);
    expect(parseVm(VMS.detail('ghost'))).toMatchObject({ state: 'Orphaned', reason: expect.any(String) });
  });
  it('a stalled VM being stopped, or failed while it ran, is still an answer', () => {
    for (const state of ['Stopping', 'Failed']) {
      expect(parseVm({ ...VMS.detail('stuck'), state }), state).toMatchObject({ state, monitorStalled: true });
    }
  });
  it('display_url is never read', () => {
    const vm = parseVm({ ...VMS.detail('web-1'), display_url: 'https://elsewhere.example/' })!;
    expect(JSON.stringify(vm)).not.toContain('elsewhere');
  });
  const web = (): Row => structuredClone(VMS.detail('web-1')) as Row;
  const edit = (f: (v: Row) => void): unknown => { const v = web(); f(v); return v; };
  it.each<[string, (v: Row) => void]>([
    ['no name', (v) => { delete v.name; }],
    ['a state it does not know', (v) => { v.state = 'Sleeping'; }],
    ['no state', (v) => { delete v.state; }],
    ['a reason that is not text', (v) => { v.reason = 7; }],
    ['a run that is not text', (v) => { v.run = {}; }],
    ['memory as text', (v) => { obj(v.spec).memory_mib = '2048'; }],
    ['a firmware it does not know', (v) => { obj(v.spec).firmware = 'coreboot'; }],
    ['a flag missing from the settings', (v) => { delete obj(v.spec).tpm; }],
    ['a port of 0', (v) => { obj(v.spec).ports = [{ proto: 'tcp', host: 0, guest: 80 }]; }],
    ['a port past 65535', (v) => { obj(v.spec).ports = [{ proto: 'tcp', host: 8080, guest: 70000 }]; }],
    ['a protocol it does not know', (v) => { obj(v.spec).ports = [{ proto: 'sctp', host: 1, guest: 1 }]; }],
    ['seven disc slots', (v) => { obj(v.spec).cdroms = [null, null, null, null, null, null, null]; }],
    ['a disc that is a number', (v) => { obj(v.spec).cdroms = [7]; }],
    ['a display that is text', (v) => { obj(v.spec).display = '7001'; }],
    ['a display of 0', (v) => { obj(v.spec).display = 0; }],
    ['a display past 9999', (v) => { obj(v.spec).display = 10000; }],
    ['no memory', (v) => { obj(v.spec).memory_mib = 0; }],
    ['no CPU', (v) => { obj(v.spec).vcpus = 0; }],
    ['a sidecar kind it does not know', (v) => { v.sidecars = [{ kind: 'other', state: 'ready' }]; }],
    ['sidecars not a list', (v) => { v.sidecars = {}; }],
    ['stalled as text', (v) => { v.monitor_stalled = 'yes'; }],
    ['an empty run', (v) => { v.run = ''; }],
    ['a run that is not 16 hex digits', (v) => { v.run = 'run-0001'; }],
    ['a run of zeros', (v) => { v.run = '0'.repeat(16); }],
    ['an id that is not 16 hex digits', (v) => { v.vm_id = 'id-1'; }],
    ['an error without a message', (v) => { v.error = { error: { code: 'BadState' } }; }],
    ['progress with a phase it does not know', (v) => { v.progress = { phase: 'thinking', bytes_done: 0, bytes_total: 0 }; }],
    ['stalled while stopped', (v) => { v.state = 'Stopped'; v.monitor_stalled = true; }],
    ['still importing while Running', (v) => { v.progress = { phase: 'importing', bytes_done: 1, bytes_total: 2 }; }],
    ['a failed create with no reason', (v) => { v.progress = { phase: 'failed', bytes_done: 1, bytes_total: 2 }; }],
    ['a reason on a create that has not failed', (v) => { v.state = 'Creating'; v.progress = { phase: 'importing', bytes_done: 1, bytes_total: 2, error: { error: { code: 'BadState', message: 'm' } } }; }],
  ])('refuses: %s', (_n, f) => { expect(parseVm(edit(f))).toBeNull(); });
  it('a port without a protocol is tcp', () => {
    const v = web();
    obj(v.spec).ports = [{ host: 8080, guest: 80 }];
    expect(parseVm(v)!.spec!.ports).toEqual([{ proto: 'tcp', host: 8080, guest: 80 }]);
  });
});

describe('names and error codes', () => {
  it('a VM name: lower-case letters, digits and hyphens, a letter or digit first, 1 to 63', () => {
    for (const good of ['a', '0', 'web-1', 'a'.repeat(63), '9-9']) expect(isVmName(good), good).toBe(true);
    for (const bad of ['', '-a', 'A', 'a_b', 'a b', 'a.b', 'a/b', '..', 'a'.repeat(64), 7, null, undefined]) expect(isVmName(bad), String(bad)).toBe(false);
  });
  it('vmCode: the code on a rejection, else the one in its body, else null; never a code this page does not know', () => {
    expect(VM_CODES).toHaveLength(33);
    expect(vmCode({ code: 'BadState', status: 409 })).toBe('BadState');
    expect(vmCode({ code: null, data: { error: { code: 'InsufficientSpace', message: 'm' } } })).toBe('InsufficientSpace');
    expect(vmCode({ code: 'FORBIDDEN', data: { error: { code: 'NotFound' } } })).toBe('NotFound');
    for (const none of [null, undefined, 'BadState', {}, { code: 'badstate' }, { code: 'BAD_GATEWAY' }, { data: { error: 'BadState' } }, { data: { code: 'BadState' } }]) expect(vmCode(none)).toBeNull();
  });
});

describe('pollMs', () => {
  const rows = parseVmList(VMS.list)!;
  const still = rows.filter((r) => ['win11', 'web-1', 'db-1', 'batch', 'ghost'].includes(r.name));
  it('slow while nothing is changing, and with no rows at all', () => {
    expect(pollMs(still, null, 1_000_000)).toBe(POLL_SLOW_MS);
    expect(pollMs(null, null, 0)).toBe(POLL_SLOW_MS);
    expect(pollMs([], null, 0)).toBe(POLL_SLOW_MS);
  });
  it.each(['build', 'cache', 'old-api'])('fast while %s is being created, starting or stopping', (name) => {
    expect(pollMs([...still, rows.find((r) => r.name === name)!], null, 0)).toBe(POLL_FAST_MS);
  });
  it('a failed create is not moving', () => {
    expect(pollMs([rows.find((r) => r.name === 'import-1')!], null, 0)).toBe(POLL_SLOW_MS);
  });
  it("fast for a minute after the person's own change, then slow; a change in the future does not count", () => {
    expect(pollMs(still, 1000, 1000)).toBe(POLL_FAST_MS);
    expect(pollMs(still, 1000, 1000 + POLL_AFTER_CHANGE_MS - 1)).toBe(POLL_FAST_MS);
    expect(pollMs(still, 1000, 1000 + POLL_AFTER_CHANGE_MS)).toBe(POLL_SLOW_MS);
    expect(pollMs(still, 5000, 1000)).toBe(POLL_SLOW_MS);
  });
});
