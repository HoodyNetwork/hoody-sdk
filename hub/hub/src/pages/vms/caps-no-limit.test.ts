// The capabilities answer of a bare-metal computer, byte for byte as its VM program writes it: no memory limit is set,
// which the program sends as the largest 64-bit number (18446744073709551615), or as null. The browser reads that number
// as 2^64, above what JavaScript holds exactly. Read the way the page reads it (JSON.parse, then parseCaps, then hostState),
// it is an answer with no memory limit: the page shows the VMs, never "cannot reach", and never a nonsense size.
import { describe, expect, it } from 'vitest';
import { memoryRoomMib } from './create-logic';
import { hostState, memoryUse, parseCaps, vmCode, type Caps, type FactsRead, type HostState } from './logic';
import { blockOf, type BlockFacts } from './power-logic';

const WIRE =
  '{"kvm_present":true,"fuse_present":true,"memory":{"ceiling_bytes":18446744073709551615,"admitted":[]},' +
  '"misc":{"kvm_vm":{"used":0,"ceiling":16},"kvm_vcpu":{"used":0,"ceiling":64},"kvm_memslot":null},"unprivileged_port_start":1024,' +
  '"provisioning":{"uefi":true,"virtio_win_iso":true,"templates":true,"tpm":true,"secure_boot":true,"file_sharing":true,"audio":false,' +
  '"machine_type":"pc-q35-9.2"},"storage":{"free_bytes":440234147840}}';

const UNKNOWN: FactsRead = { kind: 'unknown' };

describe('a VM program with no memory limit', () => {
  it('reads as an answer with no memory limit', () => {
    const wire = JSON.parse(WIRE) as Record<string, unknown>;
    expect(Number.isSafeInteger((wire.memory as { ceiling_bytes: number }).ceiling_bytes)).toBe(false);
    const caps = parseCaps(wire);
    expect(caps).not.toBeNull();
    expect(caps!.memory.ceilingBytes).toBeNull();
    expect(caps!.budgets.vms).toEqual({ used: 0, ceiling: 16 });
  });

  it('is a ready computer, never an unreachable one', () => {
    const caps = parseCaps(JSON.parse(WIRE));
    expect(caps).not.toBeNull();
    expect(hostState(true, UNKNOWN, { kind: 'ok', caps: caps! }).kind).toBe('ready');
  });

  it('names no size: no ceiling, and memory never stops a start', () => {
    const m = memoryUse(parseCaps(JSON.parse(WIRE))!);
    expect(m).toEqual({ usedBytes: 0, ceilingBytes: null, freeForNewVmMib: null, unidentified: false, holdsAll: false });
  });

  it('a run it cannot size holds all of it (the same largest number): read, and nothing more fits', () => {
    const w = JSON.parse(WIRE.replace('"admitted":[]', '"admitted":[{"unidentified_run":"0195c0de00000042","admitted_bytes":18446744073709551615,"estimated":true}]')) as unknown;
    const caps = parseCaps(w);
    expect(caps).not.toBeNull();
    expect(caps!.memory.admitted).toEqual([{ name: null, unidentifiedRun: '0195c0de00000042', bytes: null, estimated: true }]);
    expect(memoryUse(caps!)).toEqual({ usedBytes: 0, ceilingBytes: null, freeForNewVmMib: 0, unidentified: true, holdsAll: true });
    expect(hostState(true, UNKNOWN, { kind: 'ok', caps: caps! }).kind).toBe('ready');
  });

  it('reads any whole number from 2^53 up, and null, as no limit, and still refuses what is not a size', () => {
    const at = (ceiling: unknown) => {
      const w = JSON.parse(WIRE) as { memory: { ceiling_bytes: unknown } };
      w.memory.ceiling_bytes = ceiling;
      return parseCaps(w);
    };
    expect(at(2 ** 53)!.memory.ceilingBytes).toBeNull();
    expect(at(null)!.memory.ceilingBytes).toBeNull();
    expect(at(Number.MAX_SAFE_INTEGER)!.memory.ceilingBytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(at(16 * 1024 ** 3)!.memory.ceilingBytes).toBe(16 * 1024 ** 3);
    for (const bad of [-1, 1.5, Infinity, Number.NaN, '18446744073709551615', undefined, {}]) expect(at(bad), String(bad)).toBeNull();
  });
});

describe('a VM program that sends "no limit" as null', () => {
  const NULL_WIRE = WIRE.replace('18446744073709551615', 'null');
  const held = (bytes: string) =>
    JSON.parse(NULL_WIRE.replace('"admitted":[]', `"admitted":[{"unidentified_run":"0195c0de00000042","admitted_bytes":${bytes},"estimated":true}]`)) as unknown;

  it('reads the same as the largest number: no limit, a ready computer, no size', () => {
    const caps = parseCaps(JSON.parse(NULL_WIRE));
    expect(caps).not.toBeNull();
    expect(caps).toEqual(parseCaps(JSON.parse(WIRE)));
    expect(hostState(true, UNKNOWN, { kind: 'ok', caps: caps! }).kind).toBe('ready');
    expect(memoryUse(caps!)).toEqual({ usedBytes: 0, ceilingBytes: null, freeForNewVmMib: null, unidentified: false, holdsAll: false });
  });

  it('a run held at null holds all of it, the same as one held at the largest number', () => {
    const caps = parseCaps(held('null'));
    expect(caps).not.toBeNull();
    expect(caps).toEqual(parseCaps(held('18446744073709551615')));
    expect(caps!.memory.admitted[0]!.bytes).toBeNull();
    expect(memoryUse(caps!)).toEqual({ usedBytes: 0, ceilingBytes: null, freeForNewVmMib: 0, unidentified: true, holdsAll: true });
    expect(hostState(true, UNKNOWN, { kind: 'ok', caps: caps! }).kind).toBe('ready');
  });

  it('a run with no admitted_bytes at all is still not a reading', () => {
    const w = JSON.parse(NULL_WIRE.replace('"admitted":[]', '"admitted":[{"unidentified_run":"0195c0de00000042","estimated":true}]')) as unknown;
    expect(parseCaps(w)).toBeNull();
  });
});

describe('the places that read the memory limit, with null and with the largest number', () => {
  const NULL_WIRE = WIRE.replace('18446744073709551615', 'null');
  const withRun = (wire: string, bytes: string): Caps =>
    parseCaps(JSON.parse(wire.replace('"admitted":[]', `"admitted":[{"unidentified_run":"0195c0de00000042","admitted_bytes":${bytes},"estimated":true}]`)))!;
  const start = (caps: Caps, memoryMib: number) => {
    const host: HostState = { kind: 'ready', kvm: 'on', kindKnown: true, caps };
    const f: BlockFacts = { framed: false, sending: false, held: false, vmId: 'id-1', kind: 'stopped', host, memoryMib, vcpus: 2, read: true };
    return blockOf('start', f);
  };

  it.each([['the largest number', WIRE], ['null', NULL_WIRE]])('no limit (%s): New VM names no memory room, and memory never refuses a start', (_, wire) => {
    const caps = parseCaps(JSON.parse(wire))!;
    expect(memoryRoomMib(caps)).toBeNull();
    expect(start(caps, 512 * 1024)).toBeNull();
  });

  it.each([['the largest number', '18446744073709551615'], ['null', 'null']])('a run holding all of it (%s): no room, and a start is refused for memory', (_, bytes) => {
    for (const wire of [WIRE, NULL_WIRE]) {
      const caps = withRun(wire, bytes);
      expect(memoryRoomMib(caps)).toBe(0);
      expect(start(caps, 512)).toBe('memory');
    }
  });

  it('a start refused for memory on a computer with no limit still reads as that refusal', () => {
    for (const ceiling of [null, 2 ** 64]) {
      const refusal = { code: null, status: 507, data: { error: { code: 'MemoryExceedsCgroup', message: 'm', requested: 1024, ceiling, running_set: [{ unidentified_run: '0195c0de00000042', admitted_bytes: ceiling }] } } };
      expect(vmCode(refusal)).toBe('MemoryExceedsCgroup');
    }
  });
});
