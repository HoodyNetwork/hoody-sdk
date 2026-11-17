// Fixture states of a VM's power changes and its delete: a small VM program that keeps its VMs, so a
// change that applies shows on the next read. Each state says how the program answers a change:
//   power-ok            applies it and answers.
//   power-lost-applied  applies it; the answer never arrives (the page holds it until a read proves it).
//   power-lost          does not apply it; the answer never arrives (the page holds it; no read proves it).
//   power-refused       refuses it with a status that is a definite refusal.
//   power-reported      refuses a start with "not enough memory" under a status the page can only read as held.
//   power-replaced      applies nothing and loses the answer, and the VM is replaced under its name by a new one.
//   power-snap          applies changes, and serves the default snapshot lists too (a tab with a question to open).
//   power-nospec        applies changes; every VM's own read comes without its settings (the program leaves them out
//                       when it cannot read them at that moment).
//   power-two           applies changes, and granite is bare metal with KVM on too: two computers that each answer
//                       with the same VMs, ids included (as after a copied VM store). Shown with realm 'all'.
// changeLog lists every change request the program received, in order: a test proves by it what was sent, and that
// nothing was sent twice. resetPowerFixtures() puts every state's VMs back (tests call it before each case).
import { answers, capture, containersRoute, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { FX, requestLog, world } from './fixtures';
import { snapReads } from './fixtures.snap';
import type { VmOp } from './power-logic';
import { routes } from './routes';

type Row = Record<string, unknown>;
type How = 'ok' | 'lostApplied' | 'lost' | 'replaced' | { readonly status: number; readonly code: string };

/** Every change request received: the operation and the VM's name. */
export const changeLog: Array<{ op: VmOp; name: string }> = [];
const resets: Array<() => void> = [];
const swaps: Array<(name: string) => void> = [];
export function resetPowerFixtures(): void {
  for (const r of resets) r();
  down = null;
  listDown = false;
}
/** Replaces a VM under its name by a new one (a new id, stopped, never run), in every state: what happens when someone
 *  deletes a VM and makes another with its name while this page is open. */
export function replacePowerVm(name: string): void {
  for (const sw of swaps) sw(name);
}
/** Makes every state's own read of this VM go wrong while the list still lists it (null: none does): 'down' the read
 *  fails, 'gone' it answers "not there", 'other' it answers as another VM under the name. */
let down: string | null = null;
let downHow: 'down' | 'gone' | 'other' = 'down';
export function failPowerDetail(name: string | null, how: 'down' | 'gone' | 'other' = 'down'): void {
  down = name;
  downHow = how;
}
/** Makes every state's list read fail (true) or answer again (false), whatever rows the page kept from before. */
let listDown = false;
export function failPowerList(on: boolean): void {
  listDown = on;
}
const NEW_ID = '0195c0de0000ffff';

const vmError = (code: string, message: string) => ({ error: { code, message, retryable: false } });
const summary = (d: Row): Row => ({ name: d.name, vm_id: d.vm_id, phase: d.progress ? 'creating' : 'committed', state: d.state, ...(d.share ? { share: d.share } : {}) });
const NAME = /\/vms\/([a-z0-9][a-z0-9-]{0,62})(?:\/[a-z-]+)?$/;
const nameOf = (req: FixtureRequest): string => NAME.exec(req.path)?.[1] ?? '';

const ROUTE = { start: routes.vmStart, stop: routes.vmStop, forceStop: routes.vmForceStop, pause: routes.vmPause, resume: routes.vmResume, reset: routes.vmReset, delete: routes.vmDelete } as const;
const OPS = Object.keys(ROUTE) as VmOp[];

/** One state: the read rules of the default world, over VMs that the change rules move. */
function live(how: (op: VmOp) => How, shown: (d: Row) => Row = (d) => ({ ...d })): FixtureRule[] {
  let vms: Row[] = [];
  let runs = 0;
  const reset = () => { vms = FX.VMS.details.map((d) => ({ ...d })); runs = 0; };
  reset();
  resets.push(reset);
  const replace = (name: string) => { vms = vms.map((x) => (x.name === name ? { ...x, vm_id: NEW_ID, state: 'Stopped', run: undefined, monitor_stalled: undefined } : x)); };
  swaps.push(replace);
  const apply = (op: VmOp, v: Row): void => {
    if (op === 'delete') { vms = vms.filter((x) => x !== v); return; }
    if (op === 'reset') return;
    if (op === 'start') { runs += 1; v.run = `a1b2c3d4${String(runs).padStart(8, '0')}`; v.state = 'Running'; delete v.error; delete v.reason; return; }
    if (op === 'pause') { v.state = 'Paused'; return; }
    if (op === 'resume') { v.state = 'Running'; return; }
    v.state = 'Stopped';
    delete v.run;
    delete v.monitor_stalled;
  };
  const change = (op: VmOp) => (req: FixtureRequest): FixtureAnswer => {
    const name = nameOf(req);
    changeLog.push({ op, name });
    const v = vms.find((x) => x.name === name);
    if (!v) return { status: 404, body: vmError('NotFound', 'no such VM') };
    const h = how(op);
    if (h === 'ok') { apply(op, v); return op === 'delete' ? { status: 204 } : answers.ok({ ...v }); }
    if (h === 'lostApplied') { apply(op, v); return answers.lost(50); }
    if (h === 'lost') return answers.lost(50);
    if (h === 'replaced') {
      // Another VM now holds the name.
      replace(name);
      return answers.lost(50);
    }
    return { status: h.status, body: vmError(h.code, 'refused') };
  };
  return [
    ...OPS.map((op) => reply(ROUTE[op], change(op))),
    reply(routes.vms, (req) => {
      requestLog.push({ route: 'vms', path: req.path });
      return listDown ? { status: 500, body: vmError('StorageFailed', 'down') } : answers.ok(vms.map(summary));
    }),
    reply(routes.vm, (req) => {
      requestLog.push({ route: 'vm', path: req.path });
      const wrong = down !== null && nameOf(req) === down ? downHow : null;
      if (wrong === 'down') return { status: 500, body: vmError('StorageFailed', 'down') };
      if (wrong === 'gone') return { status: 404, body: vmError('NotFound', 'no such VM') };
      const d = vms.find((x) => x.name === nameOf(req));
      if (wrong === 'other' && d) return answers.ok({ ...d, vm_id: NEW_ID });
      return d ? answers.ok(shown(d)) : { status: 404, body: vmError('NotFound', 'no such VM') };
    }),
    ...world(),
  ];
}

/** GET /computers with atlas and granite both on bare metal with KVM on (taken before the default world's rule). */
function twoBareMetal(): FixtureRule {
  const bare = FX.COMPUTERS.bareMetal;
  return reply(containersRoute, () => {
    const r = capture().realm;
    const rows = fixtureWorld.computers.filter((c) => r === 'all' || c.realm_ids.includes(r)).map((c): Row =>
      c.id === bare.id ? bare : c.name === 'granite' ? { ...c, kvm: true, server: { ...c.server, is_free: false, paid_subserver: false, kvm_supported: true } } : { ...c });
    return { status: 200, body: { data: { computers: rows } } };
  });
}

export function states(): Record<string, FixtureRule[]> {
  return {
    'power-ok': live(() => 'ok'),
    'power-lost-applied': live(() => 'lostApplied'),
    'power-lost': live(() => 'lost'),
    'power-refused': live(() => ({ status: 409, code: 'BadState' })),
    'power-reported': live((op) => (op === 'start' ? { status: 507, code: 'MemoryExceedsCgroup' } : 'ok')),
    'power-replaced': live(() => 'replaced'),
    'power-snap': [...snapReads(), ...live(() => 'ok')],
    'power-nospec': live(() => 'ok', ({ spec: _spec, ...rest }) => rest),
    'power-two': [twoBareMetal(), ...live(() => 'ok')],
  };
}
