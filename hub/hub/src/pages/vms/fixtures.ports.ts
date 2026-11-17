// Fake-API states of the Ports tab (and the shared change rules the Settings and Storage states use): the VM program's
// answers to an update of a VM, over a copy of the fixture VMs that the update changes, so a fresh read shows what was
// saved. Built inside functions, every helper a function declaration: fixtures.ts imports this file for its states, and
// may run them before this file's own lines have run.
import { answers, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { FX, world } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;

export function vmError(code: string, message: string, extra: Row = {}) { return { error: { code, message, retryable: false, ...extra } }; }

/** Every change request these states answered (route, path, body as sent), for tests. */
export const changeLog: { route: 'update' | 'swap' | 'eject'; path: string; body: unknown }[] = [];
/** Each state's VMs, with what it held before any request (taken at the first reset). */
const made: { vms: Row[]; start: Row[] | null }[] = [];

/** A fresh copy of the fixture VMs: a state's changes never reach another state. */
export function freshVms(): Row[] {
  const vms = structuredClone(FX.VMS.details) as Row[];
  made.push({ vms, start: null });
  return vms;
}

/** Tests: every state's VMs back to what they held before any request, and an empty change log. */
export function resetChangeFixtures(): void {
  changeLog.length = 0;
  for (const m of made) {
    if (m.start === null) m.start = structuredClone(m.vms);
    else m.vms.splice(0, m.vms.length, ...(structuredClone(m.start) as Row[]));
  }
}

/** The VM name a request's path names. */
export function nameIn(path: string): string { return decodeURIComponent(path.split('/vms/')[1]?.split('/')[0] ?? ''); }

/** Writes an update body into a VM's settings, as the VM program stores it. */
export function applyUpdate(spec: Row, body: Row): void {
  const nullable = ['stop_grace_seconds', 'disk_bps', 'disk_iops', 'share_quota_bytes'] as const;
  for (const k of ['memory_mib', 'vcpus', 'autostart', 'cdroms'] as const) if (k in body) spec[k] = body[k];
  for (const k of nullable) if (k in body) { if (body[k] === null) delete spec[k]; else spec[k] = body[k]; }
  if ('display' in body) { if (body.display === null) delete spec.display; else if (typeof spec.display !== 'number') spec.display = 7010; }
  if ('ports' in body) spec.ports = body.ports;
  if (typeof body.disk_gib === 'number') spec.disk_bytes = body.disk_gib * 1024 ** 3;
}

type Answer = FixtureAnswer | ((req: FixtureRequest, vm: Row | undefined) => FixtureAnswer);

/** The update rule over `vms`: `answer` decides (default: the change is made and the program says so). */
export function updateRule(vms: Row[], answer?: Answer): FixtureRule {
  return reply(routes.vmUpdate, (req) => {
    changeLog.push({ route: 'update', path: req.path, body: structuredClone(req.body ?? null) });
    const vm = vms.find((v) => v.name === nameIn(req.path));
    if (answer) return typeof answer === 'function' ? answer(req, vm) : answer;
    if (!vm || !vm.spec) return { status: 404, body: vmError('NotFound', 'no such VM') };
    if (vm.state !== 'Stopped' && vm.state !== 'Failed') return { status: 409, body: vmError('BadState', 'the VM is not stopped') };
    applyUpdate(vm.spec as Row, (req.body ?? {}) as Row);
    return answers.ok({ name: vm.name, vm_id: vm.vm_id, spec: vm.spec });
  });
}

/** A change whose answer never comes back, made or not as `made` says (the next read shows it). */
export function lostUpdate(vms: Row[], made: boolean): FixtureRule {
  return updateRule(vms, (req, vm) => {
    if (made && vm?.spec) applyUpdate(vm.spec as Row, (req.body ?? {}) as Row);
    return answers.lost();
  });
}

/** The Ports tab's states. Open them at `/win11?tab=ports` (stopped) or `/web-1?tab=ports` (running). */
export function states(): Record<string, FixtureRule[]> {
  const saved = freshVms(), conflict = freshVms(), pending = freshVms(), madePending = freshVms(), busy = freshVms();
  return {
    // Saving works: the next read shows the new list.
    'ports-saved': [updateRule(saved), ...world({ vms: saved })],
    // Another VM declares the port on the computer: refused, the row says which VM.
    'ports-conflict': [
      updateRule(conflict, { status: 409, body: vmError('PortForwardConflict', 'host tcp/8080 is already forwarded by vm \'web-1\'', { proto: 'tcp', host_port: 8080, holder: 'web-1' }) }),
      ...world({ vms: conflict }),
    ],
    // Another change of the VM is under way: a definite refusal, said in the page's words in the editor's footer.
    'ports-busy': [updateRule(busy, { status: 409, body: vmError('OperationInProgress', 'operation in progress') }), ...world({ vms: busy })],
    // The answer is lost and nothing changed: held until the person stops tracking it.
    'ports-held': [lostUpdate(pending, false), ...world({ vms: pending })],
    // The answer is lost and the change was made: Check again proves it.
    'ports-held-made': [lostUpdate(madePending, true), ...world({ vms: madePending })],
  };
}
