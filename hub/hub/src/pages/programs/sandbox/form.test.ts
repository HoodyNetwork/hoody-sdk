import { describe, expect, it } from 'vitest';
import { canonical } from './block';
import { EMPTY_FORM, applyPreset, check, envReason, factsOf, fromBlock, literal, presetBlocked, toBlock, type Form } from './form';
import { programSamples, statusSamples } from './samples';

const codes = (f: Form, facts = factsOf(programSamples.plain)) => check(f, facts).map((p) => `${p.field}:${p.code}`);
const form = (o: Partial<Form>): Form => ({ ...EMPTY_FORM, ...o });

describe('fromBlock / toBlock', () => {
  it('round-trips a stored block, keeping spelling, order and presence', () => {
    const b = { filesystem: { read_only_root: true, writable: ['/b', '/a'] }, network: { mode: 'restricted', bind_ports: [80, '8000-8003', '9000-9000'], connect_ports: [443, 53] }, process: { max_pids: 64, max_cpu: '250%' } } as const;
    const { form: f, unsupported } = fromBlock(b as never);
    expect(unsupported).toEqual([]);
    expect(canonical(toBlock(f))).toBe(canonical(b));
  });
  it('keeps an explicit empty bind_ports and drops values that mean the default', () => {
    const { form: f } = fromBlock({ network: { bind_ports: [], udp: 'allow', mode: 'full', ingress_allow_platform: true }, filesystem: { read_only_root: false } } as never);
    expect(f.bindMode).toBe('list');
    expect(toBlock(f)).toEqual({ network: { bind_ports: [] } });
    expect(toBlock({ ...f, bindMode: 'program' })).toBeNull();
  });
  it('names stored fields the form cannot carry (a save would drop them)', () => {
    expect(fromBlock({ network: { mode: 'restricted', future_field: 1 } } as never).unsupported).toEqual(['network.future_field']);
    expect(fromBlock({ process: { max_pids: '8' } } as never).unsupported).toEqual(['process.max_pids']);
    expect(fromBlock({ network: { mode: 'weird' } } as never).unsupported).toEqual(['network.mode']);
    expect(fromBlock(statusSamples.set.configured as never).unsupported).toEqual([]);
  });
  it('sends a whole canonical block with no defaults', () => {
    expect(toBlock(form({ mode: 'none', udpDeny: true, maxMemory: ' 512M ' }))).toEqual({ network: { mode: 'none', udp: 'deny' }, process: { max_memory: '512M' } });
    expect(toBlock(EMPTY_FORM)).toBeNull();
  });
});

describe('presets', () => {
  const facts = factsOf(programSamples.plain);
  const noPorts = factsOf(programSamples.noPorts);
  it('No network is blocked for a program with ports', () => {
    expect(presetBlocked('noNetwork', facts)).toBe('hasPorts');
    expect(presetBlocked('noNetwork', noPorts)).toBeNull();
  });
  it('No outgoing TCP leaves bind_ports to the program when it declares ports, else asks for a list', () => {
    const a = applyPreset(EMPTY_FORM, 'noOutgoingTcp', facts);
    expect(toBlock(a)).toEqual({ network: { mode: 'restricted' } });
    expect(codes(a, facts)).toEqual([]);
    const b = applyPreset(EMPTY_FORM, 'noOutgoingTcp', noPorts);
    expect(b.bindMode).toBe('list');
    expect(codes(b, noPorts)).toContain('bindPorts:restrictedNeedsPorts');
  });
  it('limits and read-only fill the form', () => {
    expect(toBlock(applyPreset(EMPTY_FORM, 'limits', facts))).toEqual({ process: { max_memory: '512M', max_pids: 256, private_tmp: true } });
    expect(toBlock(applyPreset(EMPTY_FORM, 'readOnly', facts))).toEqual({ filesystem: { read_only_root: true } });
  });
});

describe('check', () => {
  it('passes a good form', () => {
    expect(codes(form({ readOnlyRoot: true, writable: '/hoody/storage/apps/web/data', maxMemory: '512M', maxPids: '256', maxCpu: '200%' }))).toEqual([]);
  });
  it('mirrors the bounds', () => {
    expect(codes(form({ maxMemory: '15M' }))).toContain('maxMemory:memory');
    expect(codes(form({ maxMemory: '16M' }))).toEqual([]);
    expect(codes(form({ maxMemory: '65G' }))).toContain('maxMemory:memory');
    expect(codes(form({ maxMemory: '536870912' }))).toEqual([]);
    expect(codes(form({ maxPids: '3' }))).toContain('maxPids:pids');
    expect(codes(form({ maxPids: '65537' }))).toContain('maxPids:pids');
    expect(codes(form({ maxOpenFiles: '7' }))).toContain('maxOpenFiles:files');
    expect(codes(form({ maxCpu: '0%' }))).toContain('maxCpu:cpu');
    expect(codes(form({ maxCpu: '102401%' }))).toContain('maxCpu:cpu');
    expect(codes(form({ maxCpu: '102400%' }))).toEqual([]);
    expect(codes(form({ maxFileSize: '1023' }))).toContain('maxFileSize:fileSize');
    expect(codes(form({ maxFileSize: '1024G' }))).toEqual([]);
    expect(codes(form({ privateTmp: true, tmpSize: '1023K' }))).toContain('tmpSize:tmpSize');
    expect(codes(form({ tmpSize: '64M' }))).toContain('tmpSize:tmpNeedsPrivate');
    expect(codes(form({ rate: '0/s' }))).toContain('rate:rate');
    expect(codes(form({ rate: '100000/m', bindMode: 'list', bindPorts: '8000' }))).toEqual([]);
  });
  it('mirrors presence rules', () => {
    expect(codes(form({ writable: '/x' }))).toContain('writable:writableNeedsRo');
    expect(codes(form({ connectPorts: '443' }))).toContain('connectPorts:connectNeedsRestricted');
    expect(codes(form({ mode: 'none', bindMode: 'list', bindPorts: '' }), factsOf(programSamples.noPorts))).toContain('bindPorts:noneBind');
    expect(codes(form({ mode: 'none' }))).toContain('mode:noneHasPorts');
    expect(codes(form({ mode: 'none' }), factsOf(programSamples.noPorts))).toEqual([]);
    expect(codes(form({ bindMode: 'list', bindPorts: '9000' }))).toContain('bindPorts:bindCovers');
    expect(codes(form({ bindMode: 'list', bindPorts: '7000-9000' }))).toEqual([]);
    expect(codes(form({ ingressFrom: '203.0.113.0/24' }), factsOf(programSamples.noPorts))).toContain('ingressFrom:inboundNeedsPorts');
    expect(codes(form({ ingressFrom: '203.0.113.0/024' }))).toContain('ingressFrom:cidr');
    expect(codes(form({ ingressFrom: Array.from({ length: 65 }, (_, i) => `10.0.${i}.0/24`).join(' ') }))).toContain('ingressFrom:cidrMany');
    expect(codes(form({ bindMode: 'list', bindPorts: '9-8' }))).toContain('bindPorts:port');
    expect(codes(form({ bindMode: 'list', bindPorts: '0' }))).toContain('bindPorts:port');
  });
  it('mirrors path rules', () => {
    expect(codes(form({ readOnlyRoot: true, writable: 'rel/path' }))).toContain('writable:pathAbsolute');
    expect(codes(form({ readOnlyRoot: true, writable: '/' }))).toContain('writable:pathRoot');
    expect(codes(form({ readOnlyRoot: true, writable: '/etc/app' }))).toContain('writable:protected');
    expect(codes(form({ readOnlyRoot: true, writable: '/var' }))).toContain('writable:protected');
    expect(codes(form({ readOnlyRoot: true, writable: '/hoody' }))).toContain('writable:protected');
    expect(codes(form({ readOnlyRoot: true, writable: '/a/../etc' }))).toContain('writable:pathTraversal');
    expect(codes(form({ hidden: '/hoody/storage/apps/other' }))).toContain('hidden:hiddenForbidden');
    expect(codes(form({ hidden: '/usr/local' }))).toContain('hidden:hiddenForbidden');
    expect(codes(form({ hidden: '/root' }))).toEqual([]);
    expect(codes(form({ hidden: '/srv' }), { ...factsOf(programSamples.plain)!, directory: '/srv/app' })).toContain('hidden:hiddenDirectory');
    expect(codes(form({ readOnlyRoot: true, writable: '/srv/data', hidden: '/srv' }))).toContain('hidden:hiddenWritable');
    expect(codes(form({ readOnlyRoot: true, writable: '/var/tmp/x', privateTmp: true }))).toContain('writable:privateTmpWritable');
    expect(codes(form({ privateTmp: true }), { ...factsOf(programSamples.plain)!, directory: '/tmp/app' })).toContain('program:privateTmpDirectory');
  });
  it('names program-level refusals without ever holding a value', () => {
    const facts = factsOf(programSamples.badEnv)!;
    expect(facts.env.map((e) => `${e.name}:${e.reason}`).sort()).toEqual(['API_TOKEN:value', 'HOODY_SANDBOX_TEST:reserved', 'LD_PRELOAD:loader', 'bad-name:name']);
    expect(JSON.stringify(facts)).not.toContain('FAKE');
    expect(JSON.stringify(facts)).not.toContain('/x.so');
    expect(codes(form({ maxPids: '8' }), facts)).toContain('program:env.value');
    expect(codes(form({ maxPids: '8' }), factsOf(programSamples.root))).toContain('program:root');
    expect(codes(form({ maxPids: '8' }), { ...factsOf(programSamples.plain)!, directory: '/run/user/1000/app' })).toContain('program:runUser');
  });
  it('env rules match the daemon', () => {
    expect(literal(':0')).toBe(true);
    expect(literal('/usr/bin:/bin')).toBe(true);
    for (const bad of ['a%b', 'a"b', "a'b", 'a\\b', 'a\tb', 'a\u0085b', 'a\u007fb']) expect(literal(bad)).toBe(false);
    expect(envReason('TMPDIR', '/tmp')).toBe('loader');
    expect(envReason('MALLOC_ARENA_MAX', '2')).toBe('loader');
    expect(envReason('9X', 'v')).toBe('name');
    expect(envReason('PATH', '/bin')).toBeNull();
  });
});
