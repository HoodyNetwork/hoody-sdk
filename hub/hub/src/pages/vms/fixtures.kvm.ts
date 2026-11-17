// Fake-API states of the KVM switch (kvm.ts) for hub:dev, hub:shots and tests: the computers list with every kind of
// computer the "KVM on computers" view tells apart, and the two changes the flow sends (the KVM switch and a stop or
// start), answering as the Hoody API does: KVM changes only while the computer is stopped.
//
// Each state keeps its computers in its own small store, so a change shows on the next list read. Tests call
// resetKvmFixtures() before each case. states() builds everything when fixtures.ts calls it (no work at import time).
import { answers, capture, computerLifecycleRoute, containersRoute, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { CAPS, FX, world } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;
const W = fixtureWorld;

/** The servers of the world as the Hoody API lists them here: n12 is rented bare metal that allows VMs, fra-7 a paid
 *  shared plan, ash-3 a free shared server. */
const SERVER: Readonly<Record<string, Row>> = {
  '5e0000000000000000000012': { is_free: false, paid_subserver: false, kvm_supported: true },
  '5e0000000000000000000007': { is_free: false, paid_subserver: true, kvm_supported: false },
  '5e0000000000000000000003': { is_free: true, paid_subserver: false, kvm_supported: false },
};

/** Every world computer with its server facts and KVM: atlas and granite on, cedar off (stopped). */
function baseRows(atlas: Row): Row[] {
  return W.computers.map((c) => {
    if (c.id === W.current.id) return { ...atlas };
    const server = { ...c.server, ...(SERVER[c.server.id] ?? {}) };
    return { ...c, server, kvm: c.name === 'granite' };
  });
}

/** How a state's KVM change answers. */
export type KvmAnswer =
  /** Applied (refused 409 OPERATION_STATE_CONFLICT unless the computer is stopped, as the API does). */
  | 'ok'
  /** The answer is lost; `applied` says whether the change reached the computer. */
  | { readonly lost: true; readonly applied: boolean }
  /** A refusal: status and code. */
  | { readonly status: number; readonly code: string };

const stores: Array<() => void> = [];
/** Puts every state's computers back as they started. */
export function resetKvmFixtures(): void { for (const r of stores) r(); }
const patchers: Array<(id: string, p: Row) => void> = [];
/** Changes a computer in every state's list, as another tab or the API would (tests: a computer that moved on while a
 *  dialog was open). */
export function changeKvmComputer(id: string, p: Row): void { for (const f of patchers) f(id, p); }
/** Every KVM change the states answered ({id, kvm}), in order. */
export const kvmLog: Array<{ id: string; kvm: unknown }> = [];
/** Every lifecycle change the states answered ({id, op}), in order. */
export const lifecycleLog: Array<{ id: string; op: string }> = [];

const idOf = (path: string): { id: string; op: string } | null => {
  const m = /\/computers\/([^/]+)\/([a-z-]+)$/.exec(path);
  return m ? { id: decodeURIComponent(m[1]!), op: m[2]! } : null;
};

/** The rules of one KVM state: its computers (atlas as given), the KVM change, the lifecycle changes, then the page's
 *  read rules for atlas (fixtures.ts world). */
function kvmWorld(atlas: Row, kvm: KvmAnswer, caps: FixtureAnswer = answers.ok(CAPS.ready)): FixtureRule[] {
  let rows = baseRows(atlas);
  stores.push(() => { rows = baseRows(atlas); });
  const patch = (id: string, p: Row) => { rows = rows.map((r) => (r.id === id ? { ...r, ...p } : r)); };
  patchers.push(patch);
  return [
    reply(containersRoute, () => {
      const r = capture().realm;
      const shown = rows.filter((c) => r === 'all' || (Array.isArray(c.realm_ids) && c.realm_ids.includes(r)));
      return { status: 200, body: { data: { computers: shown } } };
    }),
    reply(routes.kvmSet, (req: FixtureRequest): FixtureAnswer => {
      const at = idOf(req.path);
      const want = (req.body as { kvm?: unknown } | null)?.kvm;
      kvmLog.push({ id: at?.id ?? '', kvm: want });
      const row = rows.find((c) => c.id === at?.id);
      if (!row) return answers.refused(404, 'COMPUTER_NOT_FOUND');
      if (kvm === 'ok') {
        if (row.status !== 'stopped') return answers.refused(409, 'OPERATION_STATE_CONFLICT');
        patch(row.id as string, { kvm: want === true });
        return answers.ok({ statusCode: 200, data: { id: row.id, name: row.name, status: row.status, kvm: want === true } });
      }
      if ('lost' in kvm) {
        if (kvm.applied) patch(row.id as string, { kvm: want === true });
        return answers.lost();
      }
      return answers.refused(kvm.status, kvm.code);
    }),
    reply(computerLifecycleRoute, (req: FixtureRequest): FixtureAnswer => {
      const at = idOf(req.path);
      lifecycleLog.push({ id: at?.id ?? '', op: at?.op ?? '' });
      if (!at || !rows.some((c) => c.id === at.id)) return answers.refused(404, 'COMPUTER_NOT_FOUND');
      const status = at.op === 'stop' || at.op === 'force-stop' ? 'stopped' : at.op === 'start' || at.op === 'resume' || at.op === 'restart' ? 'running' : at.op === 'pause' ? 'paused' : null;
      if (status) patch(at.id, { status });
      return answers.ok({ statusCode: 200, data: { id: at.id, status } });
    }),
    ...world({ computer: atlas, caps }),
  ];
}

/** The KVM states (prefix kvm-), spread into fixtures.ts's states. */
export function states(): Record<string, FixtureRule[]> {
  const C = FX.COMPUTERS;
  return {
    // Every computer of the world: bare metal on and off, shared, starting, failed, paused. Open with ?view=kvm.
    'kvm-tab': kvmWorld(C.bareMetal, 'ok'),
    // atlas is stopped with KVM off: the switch turns it on at once, then Start computer is offered.
    'kvm-stopped': kvmWorld({ ...C.stopped, kvm: false }, 'ok', answers.lost()),
    // atlas runs with KVM off: the switch asks to stop it first.
    'kvm-running': kvmWorld(C.kvmOff, 'ok', answers.ok(CAPS.noKvm)),
    // atlas is stopped with KVM on: turning it off is confirmed first.
    'kvm-stopped-on': kvmWorld(C.stopped, 'ok', answers.lost()),
    // The KVM change's answer is lost (it did not arrive): held until a read proves it or the person stops tracking it.
    'kvm-lost': kvmWorld({ ...C.stopped, kvm: false }, { lost: true, applied: false }, answers.lost()),
    // The answer is lost and the change did arrive: Check again proves it.
    'kvm-lost-applied': kvmWorld({ ...C.stopped, kvm: false }, { lost: true, applied: true }, answers.lost()),
    // The API stopped the change between host steps: not known whether it applied.
    'kvm-timeout': kvmWorld({ ...C.stopped, kvm: false }, { status: 409, code: 'KVM_CHANGE_TIMED_OUT' }, answers.lost()),
    // The API refuses: the server cannot hand out KVM.
    'kvm-refused': kvmWorld({ ...C.stopped, kvm: false }, { status: 409, code: 'KVM_NOT_AVAILABLE' }, answers.lost()),
    // The API refuses with its general 403 (not the owner, a key without the KVM right, a rental that ended).
    'kvm-forbidden': kvmWorld({ ...C.stopped, kvm: false }, { status: 403, code: 'INSUFFICIENT_PERMISSIONS' }, answers.lost()),
    // Turning off answers the general 403 with no code (the owner no longer holds the server, or no right).
    'kvm-forbidden-off': kvmWorld(C.stopped, { status: 403, code: '' }, answers.lost()),
  };
}
