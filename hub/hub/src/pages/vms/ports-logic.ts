// Pure rules of a VM's ports (the Ports tab and its editor): no React, no I/O.
//
// The VM program's own rules, checked before anything is sent:
//   - a port forward is {proto: tcp | udp, host: 1-65535, guest: 1-65535}; at most 128 per VM;
//   - `host` (the port on the computer) is at or above the computer's lowest unprivileged port; when the computer did
//     not report it, the documented fallback 1024 applies and the page says it is not confirmed;
//   - the same (protocol, port on the computer) twice in one list is refused;
//   - the list replaces the VM's whole list (it is not merged); an empty list clears every forward;
//   - a port another VM already declares (running or not) is known only from the refusal, PortForwardConflict, which
//     names the protocol, the port and the VM holding it.
// A web link is offered for a tcp forward only: the computer's http-<port> address answers when the VM serves HTTP
// there. udp has no link.
import type { VmPort } from './logic';

export const PORTS_MAX = 128;
export const PORT_MIN = 1;
export const PORT_MAX = 65535;
/** The lowest port a VM may take when the computer did not report its own. */
export const PORT_FLOOR_FALLBACK = 1024;

/** The lowest port a VM may take on the computer, and whether the computer reported it. */
export function portFloor(reported: number | null): { floor: number; confirmed: boolean } {
  return reported === null ? { floor: PORT_FLOOR_FALLBACK, confirmed: false } : { floor: Math.max(PORT_MIN, reported), confirmed: true };
}

/** One row of the editor as typed: the two ports may still be empty (NaN). */
export interface PortDraft {
  readonly proto: 'tcp' | 'udp';
  readonly guest: number;
  readonly host: number;
}

export type PortProblem = 'missing' | 'range' | 'belowFloor' | 'duplicate';
export interface PortRowProblem { readonly index: number; readonly field: 'guest' | 'host'; readonly problem: PortProblem }

const whole = (n: number) => Number.isSafeInteger(n);
const inRange = (n: number) => whole(n) && n >= PORT_MIN && n <= PORT_MAX;

/** The port on the computer a new row starts with: the VM's port when the VM may take it there, else empty. */
export function suggestedHost(guest: number, floor: number): number {
  return inRange(guest) && guest >= floor ? guest : Number.NaN;
}

/** Every problem of the list, row by row (in row order), and whether the list itself is too long. */
export function checkPorts(rows: readonly PortDraft[], floor: number): { rows: PortRowProblem[]; tooMany: boolean } {
  const out: PortRowProblem[] = [];
  const seen = new Map<string, number>();
  rows.forEach((r, index) => {
    if (!Number.isFinite(r.guest)) out.push({ index, field: 'guest', problem: 'missing' });
    else if (!inRange(r.guest)) out.push({ index, field: 'guest', problem: 'range' });
    if (!Number.isFinite(r.host)) out.push({ index, field: 'host', problem: 'missing' });
    else if (!inRange(r.host)) out.push({ index, field: 'host', problem: 'range' });
    else if (r.host < floor) out.push({ index, field: 'host', problem: 'belowFloor' });
    else {
      const key = `${r.proto}/${r.host}`;
      if (seen.has(key)) out.push({ index, field: 'host', problem: 'duplicate' });
      else seen.set(key, index);
    }
  });
  return { rows: out, tooMany: rows.length > PORTS_MAX };
}

/** The list to send, or null while any row has a problem. */
export function portsToSend(rows: readonly PortDraft[], floor: number): VmPort[] | null {
  const c = checkPorts(rows, floor);
  if (c.tooMany || c.rows.length > 0) return null;
  return rows.map((r) => ({ proto: r.proto, host: r.host, guest: r.guest }));
}

/** The wire form of a list (`proto` always written, so the program reads exactly what the page meant). */
export const portsBody = (ports: readonly VmPort[]) => ports.map((p) => ({ proto: p.proto, host: p.host, guest: p.guest }));

const key = (p: VmPort) => `${p.proto}/${p.host}/${p.guest}`;
/** Two lists hold the same forwards, whatever their order. */
export function samePorts(a: readonly VmPort[], b: readonly VmPort[]): boolean {
  if (a.length !== b.length) return false;
  const x = a.map(key).sort(), y = b.map(key).sort();
  return x.every((k, i) => k === y[i]);
}

/** The editor's rows for a VM's current list. */
export const draftsOf = (ports: readonly VmPort[]): PortDraft[] => ports.map((p) => ({ proto: p.proto, guest: p.guest, host: p.host }));

/** A web link is drawn for a tcp forward only. */
export const hasWebLink = (p: Pick<VmPort, 'proto'>) => p.proto === 'tcp';

/** The refusal PortForwardConflict as the program details it: the protocol, the port and the VM that holds it. */
export interface PortConflict { readonly proto: 'tcp' | 'udp'; readonly host: number; readonly holder: string }
const VM_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The conflict a rejection carries, or null. Read from the answer's own body (`data.error`), every field checked. */
export function conflictOf(e: unknown): PortConflict | null {
  const r = e !== null && typeof e === 'object' ? (e as Record<string, unknown>) : null;
  const data = r && r.data !== null && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : null;
  const err = data && data.error !== null && typeof data.error === 'object' ? (data.error as Record<string, unknown>) : null;
  if (!err || err.code !== 'PortForwardConflict') return null;
  const proto = err.proto === 'tcp' || err.proto === 'udp' ? err.proto : null;
  const host = typeof err.host_port === 'number' && inRange(err.host_port) ? err.host_port : null;
  const holder = typeof err.holder === 'string' && VM_NAME.test(err.holder) ? err.holder : null;
  return proto && host !== null && holder ? { proto, host, holder } : null;
}

/** The editor row a conflict points at (the first row with that protocol and port on the computer), or -1. */
export const conflictRow = (rows: readonly PortDraft[], c: PortConflict) => rows.findIndex((r) => r.proto === c.proto && r.host === c.host);
