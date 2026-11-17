// Every request the VMs page may make, declared once. Nothing leaves the page except through a route declared here
// (core refuses anything else unsent).
//
// The VM program runs inside the computer and answers at its own address (program `vm`, number 1): a kit route, sent
// without credentials; the computer's access rules decide who gets in. It has no idempotency key, so no route takes one.
// Its error codes ride in `error.code`; core reads them for this program (errors carry `code`).
//   - A sent change whose answer is lost or a 5xx is pending (core's rule). The VM program answers some refusals made
//     before anything changed with a 5xx (not enough space, no screen number to give, a download that cannot start):
//     those read pending too, with their code kept, and a fresh read then shows nothing changed.
//   - inventory rejects with 409 BadState while the VM's guest agent has not reported: a calm state for its caller, and
//     never a read a change waits on.
//   - log answers 404 for a VM that exists but never ran (or whose helper did not run): an empty log, not a failure.
//   - consoleWrite sends one text body; core treats a text route as secret and rebuilds its rejections from safe fields,
//     keeping only the codes the route lists (the console write's own).
// kvmSet is the Hoody API's switch for a computer (PUT; the computer must be stopped). KVM_CHANGE_TIMED_OUT is raised
// between host steps, so the change may be half applied: pending, never a refusal.
import { defineRoute } from '@core';

const KIB = 1024;
const MIB = 1024 * KIB;
/** Snapshot create and restore copy whole disks and have no server deadline. */
const LONG_MS = 10 * 60_000;

const vm = { scope: 'kit', kit: 'vm', index: 1 } as const;
const P = '/api/v1/vm';

/** The fields a create may send (the VM program's CreateVmRequest). */
export const CREATE_BODY = [
  'name', 'source', 'memory_mib', 'vcpus', 'os', 'firmware', 'bus', 'display', 'cpu', 'agent', 'console', 'console_input', 'audio', 'share',
  'secure_boot', 'tpm', 'disk_bps', 'disk_iops', 'share_quota_bytes', 'ports', 'autostart', 'stop_grace_seconds',
] as const;

/** The fields an update may send (UpdateVmRequest; the VM must be stopped; disk_gib goes alone). */
export const UPDATE_BODY = [
  'memory_mib', 'vcpus', 'disk_gib', 'display', 'cdroms', 'autostart', 'disk_bps', 'disk_iops', 'share_quota_bytes', 'stop_grace_seconds', 'ports',
] as const;

export const routes = {
  // ── this computer ──
  caps: defineRoute({ ...vm, method: 'GET', path: `${P}/capabilities` }),
  templates: defineRoute({ ...vm, method: 'GET', path: `${P}/templates` }),
  // ── VMs ──
  vms: defineRoute({ ...vm, method: 'GET', path: `${P}/vms`, maxBytes: 4 * MIB }),
  vm: defineRoute({ ...vm, method: 'GET', path: `${P}/vms/:name` }),
  // Refused before anything is kept: the VM program could not check the screen number, and gives the name back.
  vmCreate: defineRoute({ ...vm, method: 'POST', path: `${P}/vms`, body: CREATE_BODY, refuses: ['DisplayUnavailable'] }),
  vmUpdate: defineRoute({ ...vm, method: 'PATCH', path: `${P}/vms/:name`, body: UPDATE_BODY }),
  vmDelete: defineRoute({ ...vm, method: 'DELETE', path: `${P}/vms/:name`, query: ['force'] }),
  // ── power (one route per verb; none takes a body but stop) ──
  // Refused before the start is taken: the VM's shared folder holds more than its limit.
  vmStart: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/start`, refuses: ['InsufficientSpace'] }),
  // Always sent with an empty object: the VM's own shut-down wait applies. Never null (the program refuses it).
  vmStop: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/stop`, body: ['grace_seconds'] }),
  vmForceStop: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/force-stop` }),
  vmPause: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/pause` }),
  vmResume: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/resume` }),
  vmReset: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/reset` }),
  vmKeys: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/keys`, body: ['keys', 'hold_ms'] }),
  // ── discs ──
  cdChange: defineRoute({ ...vm, method: 'PUT', path: `${P}/vms/:name/cdroms/:slot`, body: ['source'] }),
  cdEject: defineRoute({ ...vm, method: 'DELETE', path: `${P}/vms/:name/cdroms/:slot` }),
  // ── snapshots ──
  snaps: defineRoute({ ...vm, method: 'GET', path: `${P}/vms/:name/snapshots` }),
  snapCreate: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/snapshots`, body: ['label'], timeoutMs: LONG_MS }),
  snapDelete: defineRoute({ ...vm, method: 'DELETE', path: `${P}/vms/:name/snapshots/:label` }),
  snapRestore: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/snapshots/:label/restore`, timeoutMs: LONG_MS }),
  // ── images ──
  isos: defineRoute({ ...vm, method: 'GET', path: `${P}/isos` }),
  isoDelete: defineRoute({ ...vm, method: 'DELETE', path: `${P}/isos/:sha256` }),
  dlStart: defineRoute({ ...vm, method: 'POST', path: `${P}/isos/downloads`, body: ['url', 'sha256'] }),
  dls: defineRoute({ ...vm, method: 'GET', path: `${P}/isos/downloads` }),
  dlDelete: defineRoute({ ...vm, method: 'DELETE', path: `${P}/isos/downloads/:id` }),
  osinfo: defineRoute({ ...vm, method: 'GET', path: `${P}/osinfo`, query: ['arch'], maxBytes: 4 * MIB }),
  // ── inside the VM, logs ──
  inventory: defineRoute({ ...vm, method: 'GET', path: `${P}/vms/:name/agent/inventory` }),
  log: defineRoute({ ...vm, method: 'GET', path: `${P}/vms/:name/log`, query: ['source', 'tail'], maxBytes: 2 * MIB }),
  consoleWrite: defineRoute({ ...vm, method: 'POST', path: `${P}/vms/:name/console`, bodyText: true, codes: ['NameInvalid', 'SpecInvalid', 'NotFound', 'RequestBodyStalled', 'BadState', 'OperationInProgress', 'Orphaned', 'ConsoleDeliveryIndeterminate', 'StorageFailed', 'ConsoleUnavailable'] }),
  // ── the computer's KVM switch (Hoody API) ──
  kvmSet: defineRoute({ method: 'PUT', path: '/computers/:id/kvm', scope: 'realm', body: ['kvm'], unknownCodes: ['KVM_CHANGE_TIMED_OUT'] }),
} as const;

/** A console line's largest body, in bytes (the VM program's limit; the page checks it before sending). */
export const CONSOLE_WRITE_MAX_BYTES = 4096;
