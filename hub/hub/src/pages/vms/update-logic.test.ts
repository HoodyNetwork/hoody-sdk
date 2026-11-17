// Vitest: the rules of a VM's updates (Settings, Ports, Storage): which VMs may change, only changed fields sent, the
// program's bounds checked first, and what a fresh read proves (bound to the VM's own id, each field by its own rule).
import { describe, expect, it } from 'vitest';
import { FX } from './fixtures';
import { hasSpec, parseVm, type Vm, type VmReady } from './logic';
import {
  discProblem, discSlots, discsWith, editBlock, ejectProof, fieldsMatch, formOf, growProblem, liveDiscBlock, portsUpdate, proofOf, settingsBody,
  settingsProblems, type SettingsForm,
} from './update-logic';

const GIB = 1024 ** 3;
function vmOf(name: string, patch: (w: Record<string, unknown>) => void = () => undefined): VmReady {
  const wire = structuredClone(FX.VMS.detail(name)) as Record<string, unknown>;
  patch(wire);
  const vm = parseVm(wire, name);
  if (!vm || !hasSpec(vm)) throw new Error(`fixture ${name}`);
  return vm;
}
const win = () => vmOf('win11');
const web = () => vmOf('web-1');

describe('which VMs may change', () => {
  it('stopped and failed VMs may; running, paused, starting VMs say shut down first; creating and orphaned say why', () => {
    expect(editBlock(win())).toBeNull();
    expect(editBlock(vmOf('batch'))).toBeNull();
    expect(editBlock(web())).toBe('notStopped');
    expect(editBlock(vmOf('db-1'))).toBe('notStopped');
    expect(editBlock(vmOf('cache'))).toBe('notStopped');
    expect(editBlock({ ...win(), state: 'Orphaned' })).toBe('orphaned');
    expect(editBlock({ ...win(), progress: { phase: 'importing' } } as unknown as Vm)).toBe('creating');
    expect(editBlock({ ...win(), spec: null })).toBe('noSettings');
  });

  it('a disc changes in place only while running or paused, in a declared drive, never while stalled', () => {
    const live = vmOf('web-1', (w) => { (w.spec as Record<string, unknown>).cdroms = ['/isos/a.iso']; });
    expect(liveDiscBlock(live, 0)).toBeNull();
    expect(liveDiscBlock(live, 1)).toBe('emptyAtStart');
    // A drive emptied in this run keeps its drive: it may take a disc again (the program refuses one that has none).
    const emptied = vmOf('web-1', (w) => { (w.spec as Record<string, unknown>).cdroms = [null, '/isos/b.iso']; });
    expect(liveDiscBlock(emptied, 0)).toBeNull();
    expect(liveDiscBlock(win(), 0)).toBe('notRunning');
    expect(liveDiscBlock({ ...live, monitorStalled: true }, 0)).toBe('stalled');
  });

  it('six drives, five on sata', () => {
    expect(discSlots({ bus: 'virtio' })).toBe(6);
    expect(discSlots({ bus: 'sata' })).toBe(5);
  });
});

describe('only changed fields are sent', () => {
  const spec = win().spec;
  const f = formOf(spec);
  const edit = (p: Partial<SettingsForm>) => settingsBody(spec, { ...f, ...p });

  it('an untouched form sends nothing; each change sends its own key only', () => {
    expect(settingsBody(spec, f)).toEqual({});
    expect(edit({ vcpus: spec.vcpus + 2 })).toEqual({ vcpus: spec.vcpus + 2 });
    expect(edit({ memoryMib: 8192 })).toEqual({ memory_mib: 8192 });
    expect(edit({ autostart: !spec.autostart })).toEqual({ autostart: !spec.autostart });
  });

  it('a screen turned on asks for any free one ("auto"), off for none; emptied limits send null', () => {
    expect(edit({ screen: false })).toEqual({ display: null });
    const noScreen = { ...spec, display: null };
    expect(settingsBody(noScreen, { ...formOf(noScreen), screen: true })).toEqual({ display: 'auto' });
    const limited = { ...spec, diskBps: 1_048_576, diskIops: 100, stopGraceSeconds: 60 };
    expect(settingsBody(limited, { ...formOf(limited), diskBps: Number.NaN, diskIops: null, graceSeconds: Number.NaN })).toEqual({ disk_bps: null, disk_iops: null, stop_grace_seconds: null });
  });
});

describe('the program\'s bounds, checked before sending', () => {
  const spec = win().spec;
  const f = formOf(spec);
  const fields = (p: Partial<SettingsForm>, s = spec) => settingsProblems(s, { ...f, ...p }).map((x) => x.field);

  it('memory, CPUs, shut-down wait and the limits', () => {
    expect(fields({})).toEqual([]);
    expect(fields({ memoryMib: 0 })).toEqual(['memory']);
    expect(fields({ memoryMib: 1024 * 1024 + 1 })).toEqual(['memory']);
    expect(fields({ vcpus: 0 })).toEqual(['vcpus']);
    expect(fields({ vcpus: 4097 })).toEqual(['vcpus']);
    expect(fields({ graceSeconds: 4 })).toEqual(['grace']);
    expect(fields({ graceSeconds: 901 })).toEqual(['grace']);
    expect(fields({ graceSeconds: 5 })).toEqual([]);
    expect(fields({ graceSeconds: Number.NaN })).toEqual([]);
    expect(fields({ diskBps: 65_535 })).toEqual(['diskBps']);
    expect(fields({ diskBps: 65_536 })).toEqual([]);
    expect(fields({ diskIops: 7 })).toEqual(['diskIops']);
    expect(fields({ shareQuotaBytes: 0 })).toEqual(['shareQuota']);
  });

  it('a VM that plays sound keeps its screen', () => {
    const sound = { ...spec, audio: 'output' as const };
    expect(fields({ screen: false }, sound)).toEqual(['screen']);
    expect(fields({ screen: false })).toEqual([]);
  });

  it('a disk only grows, in whole GiB, up to the largest', () => {
    expect(growProblem(64 * GIB, 64)).toBe('notBigger');
    expect(growProblem(64 * GIB, 65)).toBeNull();
    expect(growProblem(64 * GIB, 65.5)).toBe('whole');
    expect(growProblem(64 * GIB, Number.NaN)).toBe('whole');
    expect(growProblem(64 * GIB, 16_385)).toBe('tooBig');
  });

  it('a disc is a whole path on the computer', () => {
    expect(discProblem('')).toBe('missing');
    expect(discProblem('isos/a.iso')).toBe('notAbsolute');
    expect(discProblem('/isos/a.iso')).toBeNull();
    expect(discProblem(`/${'a'.repeat(5000)}`)).toBe('tooLong');
  });

  it('a disc goes in its own drive; later drives keep their places; trailing empty drives are dropped', () => {
    expect(discsWith(['/a.iso', '/b.iso'], 0, null)).toEqual([null, '/b.iso']);
    expect(discsWith(['/a.iso', '/b.iso'], 1, null)).toEqual(['/a.iso']);
    expect(discsWith([], 2, '/c.iso')).toEqual([null, null, '/c.iso']);
  });
});

describe('what a fresh read proves', () => {
  // The fixture VM's own id: a fixture without one is a broken fixture, not a case.
  const winId = (): string => { const id = win().vmId; if (id === null) throw new Error('the win11 fixture has no vm_id'); return id; };
  const sent = (body: Parameters<typeof proofOf>[0]['body']) => ({ name: 'win11', vmId: winId(), body });

  it('the same VM showing every sent field proves it; a read without it proves nothing', () => {
    expect(proofOf(sent({ vcpus: 4 }), [vmOf('win11', (w) => { (w.spec as Record<string, unknown>).vcpus = 4; })])).toBe('applied');
    expect(proofOf(sent({ vcpus: 4, memory_mib: 8192 }), [vmOf('win11', (w) => { (w.spec as Record<string, unknown>).vcpus = 4; })])).toBeUndefined();
    expect(proofOf(sent({ vcpus: 4 }), [win()])).toBeUndefined();
    expect(proofOf(sent({ vcpus: 4 }), [])).toBeUndefined();
  });

  it('another VM under the same name proves nothing about the change: that VM is gone', () => {
    const other = vmOf('win11', (w) => { w.vm_id = 'f'.repeat(16); (w.spec as Record<string, unknown>).vcpus = 4; });
    expect(proofOf(sent({ vcpus: 4 }), [other])).toBe('gone');
  });

  it('a read of the name without a vm_id names no VM: unknown, never "gone"', () => {
    const noId = (f: (w: Record<string, unknown>) => void) => vmOf('win11', (w) => { delete (w as Record<string, unknown>).vm_id; f(w as Record<string, unknown>); });
    const read = noId((w) => { (w.spec as Record<string, unknown>).vcpus = 4; (w.spec as Record<string, unknown>).cdroms = []; });
    expect(read.vmId).toBeNull();
    expect(proofOf(sent({ vcpus: 4 }), [read])).toBeUndefined();
    expect(ejectProof({ name: 'win11', vmId: winId(), slot: 0 }, [read])).toBeUndefined();
  });

  it('each field by its own rule: no wait reads as the default, any screen number is "auto", ports in any order, a disk at least the size', () => {
    const s = win().spec;
    expect(fieldsMatch({ stop_grace_seconds: null }, { ...s, stopGraceSeconds: 30 })).toBe(true);
    expect(fieldsMatch({ stop_grace_seconds: null }, { ...s, stopGraceSeconds: 31 })).toBe(false);
    expect(fieldsMatch({ display: 'auto' }, { ...s, display: 7010 })).toBe(true);
    expect(fieldsMatch({ display: null }, { ...s, display: 7010 })).toBe(false);
    const ports = [{ proto: 'tcp' as const, host: 8080, guest: 80 }, { proto: 'udp' as const, host: 5353, guest: 53 }];
    expect(fieldsMatch(portsUpdate(ports), { ...s, ports: [ports[1]!, ports[0]!] })).toBe(true);
    expect(fieldsMatch({ ports: [] }, { ...s, ports })).toBe(false);
    expect(fieldsMatch({ disk_gib: 100 }, { ...s, diskBytes: 100 * GIB })).toBe(true);
    expect(fieldsMatch({ disk_gib: 100 }, { ...s, diskBytes: 64 * GIB })).toBe(false);
    expect(fieldsMatch({ cdroms: ['/a.iso', null] }, { ...s, cdroms: ['/a.iso'] })).toBe(true);
    // An empty body proves nothing.
    expect(fieldsMatch({}, s)).toBe(false);
  });

  it('an eject is proved by the same VM\'s drive reading empty', () => {
    const one = { name: 'win11', vmId: winId(), slot: 0 };
    expect(ejectProof(one, [win()])).toBeUndefined();
    expect(ejectProof(one, [vmOf('win11', (w) => { (w.spec as Record<string, unknown>).cdroms = [null, '/b.iso']; })])).toBe('applied');
    expect(ejectProof(one, [vmOf('win11', (w) => { w.vm_id = 'f'.repeat(16); (w.spec as Record<string, unknown>).cdroms = []; })])).toBe('gone');
  });
});
