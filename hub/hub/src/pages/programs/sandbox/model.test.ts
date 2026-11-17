import { describe, expect, it } from 'vitest';
import { canonical, fingerprint, missingParts, needs, owesInbound, readHost, restricts, type SandboxBlock } from './block';
import { chipOf, isUnconfinedLine, readStatus } from './model';
import { hostSamples, statusSamples } from './samples';

const host = (k: keyof typeof hostSamples) => readHost(hostSamples[k]);
const st = (k: keyof typeof statusSamples) => readStatus(statusSamples[k]);
const chip = (k: keyof typeof statusSamples, o: { enabled?: boolean; host?: keyof typeof hostSamples | null } = {}) =>
  chipOf({ status: st(k), enabled: o.enabled ?? true, host: o.host === null ? null : host(o.host ?? 'ok') });

describe('readStatus', () => {
  it('reads every documented shape and refuses a malformed one', () => {
    for (const k of Object.keys(statusSamples) as (keyof typeof statusSamples)[]) {
      if (k === 'malformed') expect(st(k)).toBeNull();
      else expect(st(k)).not.toBeNull();
    }
    expect(readStatus({ ...statusSamples.set, rev: 'XYZ' })).toBeNull();
    expect(readStatus({ ...statusSamples.set, firewall: 'great' })).toBeNull();
    expect(readStatus({ ...statusSamples.set, success: false })).toBeNull();
    expect(readStatus(null)).toBeNull();
  });
  it('reads problems with a clean firewall as degraded (the daemon invariant)', () => {
    expect(st('brokenInvariant')?.firewall).toBe('degraded');
  });
});

describe('chipOf', () => {
  it('maps each status shape', () => {
    expect(chip('none')).toBe('none');
    expect(chip('set')).toBe('set');
    expect(chip('set', { enabled: false })).toBe('setDisabled');
    expect(chip('inactive')).toBe('inactive');
    expect(chip('drainingWithBlock')).toBe('draining');
    expect(chip('drainingCleared')).toBe('draining');
    for (const k of ['unconfinedCleared', 'tableMismatch', 'invalid', 'stateUnreadable', 'retirementPending', 'brokenInvariant'] as const) expect(chip(k)).toBe('problem');
    expect(chipOf({ status: null, enabled: true, host: host('ok') })).toBe('checking');
    expect(chip('malformed')).toBe('checking');
  });
  it('names a host that lacks a part the policy needs', () => {
    expect(chip('limitsOnly', { host: 'noBwrap' })).toBe('cantStart');
    expect(chip('limitsOnly', { host: 'noSystemdRun' })).toBe('cantStart');
    expect(chip('set', { host: 'noNft' })).toBe('cantStart');
    expect(chip('limitsOnly', { host: 'noNft' })).toBe('set');
    expect(chip('restricted', { host: 'oldLandlock' })).toBe('cantStart');
    expect(chip('set', { host: 'oldLandlock' })).toBe('set');
    expect(chip('tmpSized', { host: 'noTmpfsSize' })).toBe('cantStart');
  });
  it('keeps Policy set when the host was not checked (a launch without a part fails closed)', () => {
    expect(chip('set', { host: null })).toBe('set');
  });
  it('puts a problem above a missing part and above draining', () => {
    expect(chip('tableMismatch', { host: 'noBwrap' })).toBe('problem');
    expect(chipOf({ status: { ...st('drainingWithBlock')!, firewall: 'degraded', problems: ['x'] }, enabled: true, host: host('ok') })).toBe('problem');
  });
  it('puts a missing part above draining, and never raises a disabled program to Can\'t start', () => {
    expect(chip('drainingWithBlock', { host: 'noNft' })).toBe('cantStart');
    expect(chip('set', { enabled: false, host: 'noBwrap' })).toBe('setDisabled');
  });
  it('finds the UNCONFINED line', () => {
    expect(isUnconfinedLine(statusSamples.unconfinedCleared.problems[0])).toBe(true);
    expect(isUnconfinedLine('live table does not match')).toBe(false);
  });
});

describe('block rules', () => {
  it('restricts: the thirteen conditions, and the four no-ops', () => {
    const yes: SandboxBlock[] = [
      { filesystem: { read_only_root: true } }, { filesystem: { hidden: ['/root'] } }, { network: { mode: 'restricted' } }, { network: { mode: 'none' } },
      { network: { ingress_allow_from: ['1.2.3.0/24'] } }, { network: { ingress_rate_limit: '1/s' } }, { process: { max_memory: '16M' } },
      { process: { max_pids: 4 } }, { process: { max_open_files: 8 } }, { process: { private_tmp: true } }, { network: { udp: 'deny' } },
      { process: { max_cpu: '50%' } }, { process: { max_file_size: '1K' } }, { process: { tmp_size: '1M' } },
    ];
    for (const b of yes) expect(restricts(b)).toBe(true);
    const no: SandboxBlock[] = [
      {}, { filesystem: { writable: ['/x'] } }, { network: { bind_ports: [80] } }, { network: { connect_ports: [] } }, { network: { ingress_allow_platform: false } },
      { network: { mode: 'full', udp: 'allow' } }, { filesystem: { read_only_root: false, hidden: [] } }, { process: { private_tmp: false } },
    ];
    for (const b of no) expect(restricts(b)).toBe(false);
    expect(restricts(null)).toBe(false);
  });
  it('owesInbound and needs', () => {
    expect(owesInbound({ network: { ingress_allow_from: [] } })).toBe(false);
    expect(owesInbound({ network: { ingress_rate_limit: '5/m' } })).toBe(true);
    expect(needs({ network: { mode: 'restricted', ingress_rate_limit: '5/m' }, process: { tmp_size: '1M', private_tmp: true } })).toEqual(['bwrap', 'systemd_run', 'nft', 'landlock', 'tmpfs_size']);
    expect(needs({ network: { bind_ports: [80] } })).toEqual([]);
    expect(missingParts({ process: { max_pids: 8 } }, null)).toBeNull();
  });
  it('canonical sorts keys, drops nulls, keeps array order and spelling', () => {
    expect(canonical({ b: 1, a: [2, '3-4'], c: null })).toBe('{"a":[2,"3-4"],"b":1}');
    expect(fingerprint({ network: { mode: 'none' } })).toBe(fingerprint({ network: { mode: 'none', udp: null } as never }));
    expect(fingerprint({ filesystem: { hidden: ['/a', '/b'] } })).not.toBe(fingerprint({ filesystem: { hidden: ['/b', '/a'] } }));
    expect(fingerprint({ network: { bind_ports: [80] } })).not.toBe(fingerprint({ network: { bind_ports: ['80-80'] } }));
    expect(fingerprint(null)).not.toBe(fingerprint({}));
  });
});
