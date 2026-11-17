// Vitest: the port rules of the Ports tab, as the VM program checks them: the floor (and its fallback
// 1024 when the computer did not report one), the range, one (protocol, port on the computer) per list, at most 128,
// the conflict refusal read from the answer's own body, and a web link for tcp only.
import { describe, expect, it } from 'vitest';
import { checkPorts, conflictOf, conflictRow, draftsOf, hasWebLink, portFloor, portsToSend, PORTS_MAX, samePorts, suggestedHost, type PortDraft } from './ports-logic';

const row = (guest: number, host: number, proto: 'tcp' | 'udp' = 'tcp'): PortDraft => ({ proto, guest, host });

describe('the floor', () => {
  it('a reported floor is used and confirmed; none reported falls back to 1024, not confirmed', () => {
    expect(portFloor(2000)).toEqual({ floor: 2000, confirmed: true });
    expect(portFloor(null)).toEqual({ floor: 1024, confirmed: false });
    // A reported 0 (every port allowed) still starts at 1.
    expect(portFloor(0)).toEqual({ floor: 1, confirmed: true });
  });

  it('a port below the floor is refused on the computer side only', () => {
    expect(checkPorts([row(80, 1023)], 1024).rows).toEqual([{ index: 0, field: 'host', problem: 'belowFloor' }]);
    expect(checkPorts([row(80, 1024)], 1024).rows).toEqual([]);
    expect(checkPorts([row(22, 2222)], 1024).rows).toEqual([]);
  });

  it('the suggested port on the computer is the VM port only when it may be taken there', () => {
    expect(suggestedHost(8080, 1024)).toBe(8080);
    expect(Number.isNaN(suggestedHost(80, 1024))).toBe(true);
    expect(Number.isNaN(suggestedHost(70000, 1024))).toBe(true);
  });
});

describe('each row', () => {
  it('empty, out of range and not whole ports are refused on their own field', () => {
    expect(checkPorts([row(Number.NaN, Number.NaN)], 1024).rows).toEqual([
      { index: 0, field: 'guest', problem: 'missing' },
      { index: 0, field: 'host', problem: 'missing' },
    ]);
    expect(checkPorts([row(0, 65536)], 1024).rows).toEqual([
      { index: 0, field: 'guest', problem: 'range' },
      { index: 0, field: 'host', problem: 'range' },
    ]);
    expect(checkPorts([row(80.5, 8080)], 1024).rows).toEqual([{ index: 0, field: 'guest', problem: 'range' }]);
  });

  it('the same protocol and port on the computer twice is refused on the later row; tcp and udp may share a port', () => {
    expect(checkPorts([row(80, 8080), row(81, 8080)], 1024).rows).toEqual([{ index: 1, field: 'host', problem: 'duplicate' }]);
    expect(checkPorts([row(53, 5353, 'tcp'), row(53, 5353, 'udp')], 1024).rows).toEqual([]);
    // The same VM port twice is fine: the program keys on the computer side.
    expect(checkPorts([row(80, 8080), row(80, 8081)], 1024).rows).toEqual([]);
  });

  it(`at most ${PORTS_MAX} ports; nothing is sent while any rule fails`, () => {
    const many = Array.from({ length: PORTS_MAX + 1 }, (_, i) => row(80, 2000 + i));
    expect(checkPorts(many, 1024).tooMany).toBe(true);
    expect(portsToSend(many, 1024)).toBeNull();
    expect(portsToSend(many.slice(0, PORTS_MAX), 1024)).toHaveLength(PORTS_MAX);
    expect(portsToSend([row(80, 8080), row(Number.NaN, 8081)], 1024)).toBeNull();
    expect(portsToSend([], 1024)).toEqual([]);
  });
});

describe('lists', () => {
  it('the same forwards in another order are the same list; a changed guest port is not', () => {
    const a = [{ proto: 'tcp' as const, host: 8080, guest: 80 }, { proto: 'tcp' as const, host: 2222, guest: 22 }];
    expect(samePorts(a, [a[1]!, a[0]!])).toBe(true);
    expect(samePorts(a, [a[0]!, { ...a[1]!, guest: 23 }])).toBe(false);
    expect(samePorts(a, a.slice(0, 1))).toBe(false);
    expect(draftsOf(a)).toEqual([row(80, 8080), row(22, 2222)]);
  });

  it('a web link for tcp only', () => {
    expect(hasWebLink({ proto: 'tcp' })).toBe(true);
    expect(hasWebLink({ proto: 'udp' })).toBe(false);
  });
});

describe('the conflict refusal', () => {
  const err = (e: Record<string, unknown>) => ({ status: 409, code: 'PortForwardConflict', data: { error: { code: 'PortForwardConflict', message: 'x', ...e } } });

  it('names the protocol, the port and the VM holding it, and points at its row', () => {
    const c = conflictOf(err({ proto: 'tcp', host_port: 8080, holder: 'web-1' }));
    expect(c).toEqual({ proto: 'tcp', host: 8080, holder: 'web-1' });
    expect(conflictRow([row(22, 2222), row(80, 8080, 'udp'), row(80, 8080)], c!)).toBe(2);
  });

  it('anything not exactly that shape is no conflict (never a guessed row or name)', () => {
    expect(conflictOf(err({ proto: 'sctp', host_port: 8080, holder: 'web-1' }))).toBeNull();
    expect(conflictOf(err({ proto: 'tcp', host_port: 0, holder: 'web-1' }))).toBeNull();
    expect(conflictOf(err({ proto: 'tcp', host_port: 8080, holder: '<b>x</b>' }))).toBeNull();
    expect(conflictOf({ status: 409, data: { error: { code: 'BadState', proto: 'tcp', host_port: 8080, holder: 'web-1' } } })).toBeNull();
    expect(conflictOf(null)).toBeNull();
  });
});
