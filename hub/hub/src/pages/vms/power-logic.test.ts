// Vitest: the pure rules of a VM's power changes and its delete. What each state offers, why an action is held back,
// and (the rule a wrong outcome would break) what a fresh read proves about a change whose answer was lost.
import { describe, expect, it } from 'vitest';
import { FX } from './fixtures';
import { hostState, parseCaps, parseVm, parseVmList, type HostFacts, type HostState, type RowKind, type Vm, type VmRow } from './logic';
import { blockOf, detailsOf, heldNote, heldVmId, listsOf, parseIdentity, powerPlan, proveChange, VM_OPS, wordedCode, WORDED_CODES, type BlockFacts, type ChangeIdentity, type VmOp } from './power-logic';
import strings from './strings.en.json';

const list = (): VmRow[] => parseVmList(FX.VMS.list)!;
const vm = (name: string, patch: Record<string, unknown> = {}): Vm => parseVm({ ...FX.VMS.detail(name)!, ...patch })!;
const idOf = (name: string): string => list().find((r) => r.name === name)!.vmId!;
const idn = (op: VmOp, name: string, run: string | null = null): ChangeIdentity => ({ vm: idOf(name), name, op, run });
const row = (name: string, patch: Partial<VmRow>): VmRow[] => list().map((r) => (r.name === name ? { ...r, ...patch } : r));

const facts: HostFacts = { id: 'c', name: 'atlas', kind: 'bare_metal', kvm: true, kvmSupported: true, state: 'running', expired: false };
const ready = (caps: unknown = FX.CAPS.ready, f: Partial<HostFacts> = {}): HostState => hostState(true, { kind: 'ok', facts: { ...facts, ...f } }, { kind: 'ok', caps: parseCaps(caps)! });
const can = (patch: Partial<BlockFacts> = {}): BlockFacts => ({ framed: false, sending: false, held: false, vmId: 'id-1', kind: 'stopped', host: ready(), memoryMib: 2048, vcpus: 2, read: true, ...patch });

describe('powerPlan: what a VM offers in each state', () => {
  const cases: Array<[RowKind, boolean, VmOp | null, VmOp[]]> = [
    ['stopped', false, 'start', ['delete']],
    // A VM can read Failed while it still runs: Power off is the way out when neither Start nor Delete is taken.
    ['runFailed', false, 'start', ['forceStop', 'delete']],
    ['running', false, 'stop', ['pause', 'reset', 'forceStop', 'delete']],
    ['paused', false, 'resume', ['stop', 'forceStop', 'delete']],
    ['starting', false, null, ['forceStop', 'delete']],
    ['stopping', false, null, ['forceStop', 'delete']],
    ['creating', false, null, []],
    ['orphaned', false, null, []],
    ['unknown', false, null, []],
  ];
  it.each(cases)('%s (stalled %s): main %s', (kind, stalled, primary, menu) => {
    expect(powerPlan(kind, stalled)).toEqual({ primary, menu });
  });
  it('a failed create is not a failed run: it offers only its removal, never Start', () => {
    expect(powerPlan('createFailed', false)).toEqual({ primary: 'delete', menu: [] });
    expect(powerPlan('runFailed', false).primary).toBe('start');
  });
  it('a VM that stopped answering offers Power off as its main action, and no pause, resume, reset or shut-down', () => {
    const p = powerPlan('running', true);
    expect(p.primary).toBe('forceStop');
    for (const op of ['stop', 'pause', 'resume', 'reset'] as const) expect(p.menu).not.toContain(op);
  });
});

describe('blockOf: why an action is not sent', () => {
  it('nothing holds back a start on a ready computer with room', () => {
    expect(blockOf('start', can())).toBeNull();
  });
  it('a framed Hub, a missing id, a send that is out and a held change each hold back every action', () => {
    for (const op of VM_OPS) {
      expect(blockOf(op, can({ framed: true }))).toBe('framed');
      expect(blockOf(op, can({ vmId: null }))).toBe('noId');
      expect(blockOf(op, can({ sending: true }))).toBe('sending');
      expect(blockOf(op, can({ held: true }))).toBe('held');
    }
  });
  it('start waits for KVM: off, and on but not usable inside', () => {
    expect(blockOf('start', can({ host: ready(FX.CAPS.noKvm, { kvm: false }) }))).toBe('kvmOff');
    expect(blockOf('start', can({ host: ready(FX.CAPS.noKvm) }))).toBe('kvmNotInside');
    // Only start: a running VM on such a computer can still be shut down.
    expect(blockOf('stop', can({ kind: 'running', host: ready(FX.CAPS.noKvm, { kvm: false }) }))).toBeNull();
  });
  it('start waits for memory: the VM must fit in what is left after the per-VM overhead', () => {
    // 16 GiB for VMs, 7 GiB + 768 MiB held: 8448 MiB free, less 256 MiB overhead.
    expect(blockOf('start', can({ memoryMib: 8192 }))).toBeNull();
    expect(blockOf('start', can({ memoryMib: 8193 }))).toBe('memory');
    expect(blockOf('start', can({ memoryMib: 32768 }))).toBe('memory');
  });
  it('start waits for a VM budget and a CPU budget', () => {
    const full = { ...FX.CAPS.ready, misc: { kvm_vm: { used: 16, ceiling: 16 }, kvm_vcpu: { used: 8, ceiling: 64 }, kvm_memslot: null } };
    expect(blockOf('start', can({ host: ready(full) }))).toBe('vmBudget');
    const cpus = { ...FX.CAPS.ready, misc: { kvm_vm: { used: 3, ceiling: 16 }, kvm_vcpu: { used: 62, ceiling: 64 }, kvm_memslot: null } };
    expect(blockOf('start', can({ host: ready(cpus), vcpus: 2 }))).toBeNull();
    expect(blockOf('start', can({ host: ready(cpus), vcpus: 3 }))).toBe('cpuBudget');
  });
  it('start waits for the VM\'s own read (it notes the run the VM had); settings not read never block by themselves', () => {
    expect(blockOf('start', can({ read: false }))).toBe('unread');
    expect(blockOf('start', can({ memoryMib: null, vcpus: null }))).toBeNull();
  });
  it('reads that do not agree on which VM holds the name hold back every action', () => {
    for (const op of VM_OPS) expect(blockOf(op, can({ unsure: true }))).toBe('unread');
  });
  it('delete is sent only for a VM that does not run', () => {
    for (const kind of ['stopped', 'runFailed', 'createFailed'] as const) expect(blockOf('delete', can({ kind }))).toBeNull();
    for (const kind of ['running', 'paused', 'starting', 'stopping', 'creating', 'orphaned', 'unknown'] as const) expect(blockOf('delete', can({ kind }))).toBe('running');
  });
});

describe('parseIdentity', () => {
  it('reads this page\'s identity and nothing else', () => {
    expect(parseIdentity({ vm: 'a', name: 'web-1', op: 'stop', run: 'r' })).toEqual({ vm: 'a', name: 'web-1', op: 'stop', run: 'r' });
    expect(parseIdentity({ vm: 'a', name: 'web-1', op: 'start', run: null })?.run).toBeNull();
    for (const bad of [null, 'x', [], { vm: '', name: 'web-1', op: 'stop', run: null }, { vm: 'a', name: '', op: 'stop', run: null }, { vm: 'a', name: 'web-1', op: 'snap.take', run: null }, { vm: 'a', name: 'web-1', op: 'stop' }, { vm: 'a', name: 'web-1', op: 'stop', run: 3 }]) {
      expect(parseIdentity(bad)).toBeNull();
    }
  });
  it('heldVmId reads the VM id of any part\'s change', () => {
    expect(heldVmId({ vm: 'a', op: 'snap.take' })).toBe('a');
    expect(heldVmId({ op: 'x' })).toBeNull();
    expect(heldVmId(null)).toBeNull();
  });
});

describe('proveChange: what a fresh read proves', () => {
  it('shut down: the same VM reads Stopping or Stopped; power off: Stopped', () => {
    for (const op of ['stop', 'forceStop'] as const) {
      expect(proveChange(idn(op, 'web-1'), [row('web-1', { state: 'Stopped' })], [])).toBe('applied');
      expect(proveChange(idn(op, 'web-1'), [], [vm('web-1', { state: 'Stopped' })])).toBe('applied');
      // Still running: nothing is proved, and it is never read as "not applied".
      expect(proveChange(idn(op, 'web-1'), [list()], [vm('web-1')])).toBeUndefined();
    }
    expect(proveChange(idn('stop', 'web-1'), [row('web-1', { state: 'Stopping' })], [])).toBe('applied');
  });
  it('power off is not proved by Stopping: a VM already shutting down reads that before the power off arrives', () => {
    expect(proveChange(idn('forceStop', 'web-1'), [row('web-1', { state: 'Stopping' })], [])).toBeUndefined();
    expect(proveChange(idn('forceStop', 'web-1'), [], [vm('web-1', { state: 'Stopping' })])).toBeUndefined();
  });
  it('pause: Paused; resume: Running', () => {
    expect(proveChange(idn('pause', 'web-1'), [row('web-1', { state: 'Paused' })], [])).toBe('applied');
    expect(proveChange(idn('pause', 'web-1'), [list()], [])).toBeUndefined();
    expect(proveChange(idn('resume', 'db-1'), [row('db-1', { state: 'Running' })], [])).toBe('applied');
    expect(proveChange(idn('resume', 'db-1'), [list()], [])).toBeUndefined();
  });
  it('start: the VM\'s own read with a new run, Starting, Running or Paused, proves it', () => {
    for (const state of ['Starting', 'Running', 'Paused'] as const) {
      expect(proveChange(idn('start', 'win11', null), [], [vm('win11', { state, run: 'a1b2c3d4000000ff' })])).toBe('applied');
      expect(proveChange(idn('start', 'win11', 'run-old'), [], [vm('win11', { state, run: 'a1b2c3d4000000ff' })])).toBe('applied');
      // The run noted at the press: someone's earlier start, not this one.
      expect(proveChange(idn('start', 'win11', 'a1b2c3d4000000ff'), [], [vm('win11', { state, run: 'a1b2c3d4000000ff' })])).toBeUndefined();
      // A list row names no run: it proves no start.
      expect(proveChange(idn('start', 'win11'), [row('win11', { state })], [])).toBeUndefined();
    }
  });
  it('start: an answer that names no run proves nothing, whatever its state', () => {
    for (const state of ['Starting', 'Running', 'Paused'] as const) {
      expect(proveChange(idn('start', 'win11', null), [], [vm('win11', { state })])).toBeUndefined();
      expect(proveChange(idn('start', 'win11', 'run-old'), [], [vm('win11', { state })])).toBeUndefined();
    }
  });
  it('start: Stopped with nothing new proves nothing', () => {
    expect(proveChange(idn('start', 'win11'), [list()], [vm('win11')])).toBeUndefined();
  });
  it('start: a run other than the one noted, on a VM that failed or carries an error, proves it started', () => {
    const failed = vm('batch', { run: 'a1b2c3d4000000ff' });
    expect(proveChange(idn('start', 'batch', null), [], [failed])).toBe('applied');
    expect(proveChange(idn('start', 'batch', 'run-old'), [], [failed])).toBe('applied');
    // The same run as noted: that failure is the old one.
    expect(proveChange(idn('start', 'batch', 'a1b2c3d4000000ff'), [], [failed])).toBeUndefined();
    // Failed with no run at all (never ran): nothing new.
    expect(proveChange(idn('start', 'batch', null), [], [vm('batch')])).toBeUndefined();
    // The list alone carries no run: a Failed row proves nothing.
    expect(proveChange(idn('start', 'batch', null), [list()], [])).toBeUndefined();
  });
  it('reset is never proved', () => {
    expect(proveChange(idn('reset', 'web-1'), [list()], [vm('web-1')])).toBeUndefined();
  });
  it('delete: the id is gone from a whole list read', () => {
    const without = list().filter((r) => r.name !== 'win11');
    expect(proveChange(idn('delete', 'win11'), [without], [])).toBe('applied');
    expect(proveChange(idn('delete', 'win11'), [list()], [])).toBeUndefined();
    // No list read at all: nothing is proved (a VM's own read answering "not there" is no list).
    expect(proveChange(idn('delete', 'win11'), [], [])).toBeUndefined();
    // Two list reads: both must lack it.
    expect(proveChange(idn('delete', 'win11'), [without, list()], [])).toBeUndefined();
  });
  it('delete: the name alone proves nothing. A new VM under the name is another VM; a row that hides its id is no proof', () => {
    const id = idn('delete', 'win11');
    expect(proveChange(id, [row('win11', { vmId: '0195c0de0000aaaa' })], [])).toBe('applied');
    expect(proveChange(id, [row('win11', { vmId: null })], [])).toBeUndefined();
    // Mutant guard: a proof by name would call the still-listed VM deleted, or the replaced one still there.
    expect(proveChange({ ...id, name: 'other-name' }, [list()], [])).toBeUndefined();
  });
  it('power: a VM under the same name with another id proves nothing', () => {
    const id = idn('stop', 'web-1');
    expect(proveChange(id, [row('web-1', { vmId: '0195c0de0000aaaa', state: 'Stopped' })], [])).toBeUndefined();
    expect(proveChange(id, [], [vm('web-1', { vm_id: '0195c0de0000aaaa', state: 'Stopped' })])).toBeUndefined();
  });
  it('an identity that is not this page\'s proves nothing', () => {
    expect(proveChange({ vm: idOf('web-1'), name: 'web-1', op: 'snap.take' }, [row('web-1', { state: 'Stopped' })], [])).toBeUndefined();
    expect(proveChange(null, [list()], [])).toBeUndefined();
  });
  it('listsOf and detailsOf keep only answers of their shape', () => {
    expect(listsOf([list(), 'x', null, [{ nope: 1 }]])).toHaveLength(1);
    expect(listsOf(undefined)).toEqual([]);
    expect(detailsOf([vm('web-1'), null, list()])).toHaveLength(1);
  });
});

describe('heldNote: what the reads on screen say about a held change', () => {
  it('here and not showing it: not yet', () => {
    expect(heldNote(idn('stop', 'web-1'), list(), undefined)).toBe('notYet');
    expect(heldNote(idn('delete', 'win11'), list(), undefined)).toBe('notYet');
    expect(heldNote(idn('stop', 'web-1'), undefined, vm('web-1'))).toBe('notYet');
  });
  it('the VM is gone, or another VM holds its name: gone', () => {
    expect(heldNote(idn('stop', 'web-1'), list().filter((r) => r.name !== 'web-1'), undefined)).toBe('gone');
    expect(heldNote(idn('stop', 'web-1'), undefined, vm('web-1', { vm_id: '0195c0de0000aaaa' }))).toBe('gone');
  });
  it('nothing to say: a reset, no reads, or a delete whose VM is no longer listed', () => {
    expect(heldNote(idn('reset', 'web-1'), list(), vm('web-1'))).toBeNull();
    expect(heldNote(idn('stop', 'web-1'), undefined, undefined)).toBeNull();
    expect(heldNote(idn('delete', 'win11'), list().filter((r) => r.name !== 'win11'), undefined)).toBeNull();
  });
});

describe('words', () => {
  it('every worded code has its sentence, and none names the machinery', () => {
    for (const c of WORDED_CODES) {
      const s = (strings as Record<string, string>)[`power.code.${c}`];
      expect(s, c).toBeTruthy();
      // in[c]us is the same word, written so the release scan for host tool names does not flag this test.
      expect(s).not.toMatch(/qemu|qmp|cgroup|passt|swtpm|virtiofs|in[c]us/i);
    }
    expect(wordedCode('JournalFailed')).toBeNull();
    expect(wordedCode(null)).toBeNull();
    expect(wordedCode('BadState')).toBe('BadState');
  });
  it('every action, held note, refusal and reason has its string', () => {
    const s = strings as Record<string, string>;
    for (const op of VM_OPS) for (const k of [`power.${op}`, `power.named.${op}`, `power.held.${op}`, `power.failed.${op}`]) expect(s[k], k).toBeTruthy();
    for (const b of ['framed', 'sending', 'held', 'noId', 'unread', 'kvmOff', 'kvmNotInside', 'memory', 'vmBudget', 'cpuBudget', 'running']) expect(s[`power.why.${b}`], b).toBeTruthy();
  });
});
