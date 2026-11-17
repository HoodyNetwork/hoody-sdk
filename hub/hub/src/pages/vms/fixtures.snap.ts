// Fake-API states of a VM's Snapshots tab: the VM program's snapshot lists and what it answers to take, restore and
// delete, over the read rules of fixtures.ts.
//
// Each state serves lists that change with what it answers: a snapshot that was taken is listed from then on, a
// deleted one is gone. A state says, per change, whether the request reaches the VM program (`lands`) and what comes
// back (an answer, a refusal, or nothing). snapLog holds every change the states' rules received, for tests that prove
// what was (and was not) sent.
import { answers, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { COMPUTERS, world, type WorldSpec } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;
const GIB = 1024 ** 3;
const vmError = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

/** The snapshots each VM holds: win11 (stopped) three, one of which can no longer be restored; web-1 (running) one. */
export const SNAPSHOTS: Readonly<Record<string, readonly Row[]>> = {
  win11: [
    { label: 'clean-install', created_unix: 1_760_000_000, disk_bytes: 64 * GIB, nvram_bytes: 540_672, tpm_bytes: 9_216, restorable: true },
    { label: 'before-drivers', created_unix: 1_760_400_000, disk_bytes: 64 * GIB, nvram_bytes: 540_672, tpm_bytes: 9_216, restorable: true },
    { label: 'old-layout', created_unix: 1_759_000_000, disk_bytes: 40 * GIB, restorable: false, blocked_reason: 'the snapshot holds no boot settings and this VM starts with UEFI' },
  ],
  'web-1': [{ label: 'v1', created_unix: 1_760_500_000, disk_bytes: 20 * GIB, nvram_bytes: 540_672, restorable: true }],
};

export const FX_SNAP = { SNAPSHOTS } as const;

/** Every change the states' rules received, in order. */
export const snapLog: Array<{ change: 'take' | 'restore' | 'remove'; vm: string; label: string }> = [];
/** Every list read and every change the states' rules received, in the order they arrived (`read:<vm>`, `<change>:<vm>:<label>`). */
export const snapOrder: string[] = [];
/** Tests: what a state's list of one VM holds from now on (as if another session changed it). */
export function setSnapRows(key: string, vm: string, rows: readonly Row[]): void {
  let st = stores.get(key);
  if (!st) stores.set(key, (st = new Map()));
  st.set(vm, [...rows]);
}
/** Tests: list reads that arrive from now on wait (each is logged when it arrives) until the returned release runs. */
export function holdSnapReads(): () => void {
  let open: () => void = () => undefined;
  const g = new Promise<void>((r) => { open = r; });
  readGate = g;
  return () => { if (readGate === g) readGate = null; open(); };
}
let readGate: Promise<void> | null = null;
/** Every snapshot list read the states' rules answered, by VM name. */
export const snapReadLog: string[] = [];
/** The lists of each state as its changes left them. */
const stores = new Map<string, Map<string, Row[]>>();
/** Tests: forget what every state answered and what its changes did. */
export function resetSnapFixtures(): void {
  snapLog.length = 0;
  snapReadLog.length = 0;
  snapOrder.length = 0;
  stores.clear();
  readGate = null;
}

type Answer = FixtureAnswer | (() => FixtureAnswer | Promise<FixtureAnswer>);
const give = (a: Answer) => (typeof a === 'function' ? a() : a);
const never = () => new Promise<never>(() => undefined);

/** What one change does in a state: whether the request reaches the VM program, and what comes back (default: it
 *  lands and the program's own answer comes back). */
interface ChangeSpec { lands?: boolean; answer?: FixtureAnswer; warnings?: readonly string[] }

export interface SnapSpec {
  snapshots?: Readonly<Record<string, readonly Row[]>>;
  /** GET /vms/:name/snapshots, when the read itself should fail or hang. */
  read?: Answer;
  take?: ChangeSpec;
  restore?: ChangeSpec;
  remove?: ChangeSpec;
}

/** The snapshot rules of one state: the list read over its store, and the three changes. */
export function snapRules(key: string, s: SnapSpec = {}): FixtureRule[] {
  const of = (vm: string): Row[] => {
    let st = stores.get(key);
    if (!st) stores.set(key, (st = new Map()));
    let rows = st.get(vm);
    if (!rows) st.set(vm, (rows = [...((s.snapshots ?? SNAPSHOTS)[vm] ?? [])]));
    return rows;
  };
  const put = (vm: string, rows: Row[]) => { of(vm); stores.get(key)?.set(vm, rows); };
  // .../vms/<name>/snapshots[/<label>[/restore]]
  const parts = (path: string): { vm: string; label: string } => {
    const m = /\/vms\/([^/]+)\/snapshots(?:\/([^/]+))?/.exec(path);
    return { vm: m?.[1] ?? '', label: m?.[2] ?? '' };
  };
  return [
    reply(routes.snaps, async (req) => {
      const { vm } = parts(req.path);
      snapReadLog.push(vm);
      snapOrder.push(`read:${vm}`);
      if (readGate) await readGate;
      return give(s.read ?? (() => answers.ok(of(vm))));
    }),
    reply(routes.snapCreate, (req) => {
      const { vm } = parts(req.path);
      const label = String(((req.body ?? {}) as Row).label ?? '');
      snapLog.push({ change: 'take', vm, label });
      snapOrder.push(`take:${vm}:${label}`);
      // The computer's own clock, as the VM program stamps it.
      const row: Row = { label, created_unix: Math.floor(Date.now() / 1000), disk_bytes: 64 * GIB, restorable: true };
      if (s.take?.lands !== false) put(vm, [...of(vm), row]);
      return s.take?.answer ?? { status: 201, body: { name: vm, label, disk_bytes: 64 * GIB, reflinked: true, ...(s.take?.warnings ? { warnings: s.take.warnings } : {}) } };
    }),
    reply(routes.snapRestore, (req) => {
      const { vm, label } = parts(req.path);
      snapLog.push({ change: 'restore', vm, label });
      snapOrder.push(`restore:${vm}:${label}`);
      return s.restore?.answer ?? { status: 200, body: { name: vm, label, generation: 3, disk_bytes: 64 * GIB } };
    }),
    reply(routes.snapDelete, (req) => {
      const { vm, label } = parts(req.path);
      snapLog.push({ change: 'remove', vm, label });
      snapOrder.push(`remove:${vm}:${label}`);
      if (s.remove?.lands !== false) put(vm, of(vm).filter((r) => r.label !== label));
      return s.remove?.answer ?? { status: 204 };
    }),
  ];
}

/** The snapshot reads every state of the page can serve (the default lists, never changed by a state of its own). */
export const snapReads = (): FixtureRule[] => snapRules('*');

const state = (key: string, s: SnapSpec = {}, w: WorldSpec = {}): FixtureRule[] => [...snapRules(key, s), ...world(w)];
const lost = answers.lost();

/** The Snapshots tab's states (fixtures.ts spreads them into the page's). */
export function states(): Record<string, FixtureRule[]> {
  return {
    'snap-many': state('snap-many'),
    'snap-empty': state('snap-empty', { snapshots: {} }),
    'snap-loading': state('snap-loading', { read: never }),
    'snap-error': state('snap-error', { read: { status: 500, body: vmError('StorageFailed', 'the snapshots could not be read') } }),
    // Taken, with things the VM program noticed on the way.
    'snap-take-warned': state('snap-take-warned', { take: { warnings: ['the disk was copied in full: this snapshot takes its whole size now'] } }),
    // A take that landed and whose answer never came: the next list proves it.
    'snap-take-lost': state('snap-take-lost', { take: { answer: lost } }),
    // A take whose answer never came and that never arrived: no list shows it.
    'snap-take-lost-nothing': state('snap-take-lost-nothing', { take: { lands: false, answer: lost } }),
    // Not enough free disk: the VM program answers 507, so the outcome is held with that reason.
    'snap-take-no-space': state('snap-take-no-space', { take: { lands: false, answer: { status: 507, body: vmError('InsufficientSpace', 'need 64 GiB, have 12 GiB') } } }),
    // Another session took that label first.
    'snap-take-refused': state('snap-take-refused', { take: { lands: false, answer: { status: 409, body: vmError('AlreadyExists', 'a snapshot with this label exists') } } }),
    // A restore whose answer never came: no read shows whether it happened.
    'snap-restore-lost': state('snap-restore-lost', { restore: { answer: lost } }),
    // The VM was started between the list read and the press.
    'snap-restore-refused': state('snap-restore-refused', { restore: { answer: { status: 409, body: vmError('BadState', 'the VM is not stopped') } } }),
    // A delete that landed and whose answer never came.
    'snap-remove-lost': state('snap-remove-lost', { remove: { answer: lost } }),
    'snap-remove-refused': state('snap-remove-refused', { remove: { lands: false, answer: { status: 409, body: vmError('OperationInProgress', 'an export of this snapshot is being prepared', true) } } }),
    // A shared server: the snapshots are never asked for.
    'snap-shared': state('snap-shared', { read: lost }, { computer: COMPUTERS.shared, caps: lost, list: lost }),
  };
}
