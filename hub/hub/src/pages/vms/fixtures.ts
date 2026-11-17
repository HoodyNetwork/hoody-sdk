// Fake-API states of the VMs page for hub:dev, hub:shots, tests and specs: core-format rules over the routes routes.ts
// declares. The computer is the fixture world's current one (atlas); each state says what kind of server it is on,
// whether KVM is on, and what the VM program inside it answers.
//
// A state is built by world(): the computer's row in the Hoody API list, the VM program's capabilities, its VM list and
// each VM's detail. FX holds the wire answers themselves, so tests read the same bytes the states serve.
import { answers, capture, containersRoute, defineFixtures, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { routes } from './routes';
import { resetCreateFixtures, states as createStates } from './fixtures.create';
import { imageRules, resetImageFixtures, states as imagesStates } from './fixtures.images';
import { kvmLog, lifecycleLog, resetKvmFixtures, states as kvmStates } from './fixtures.kvm';
import { logRule, resetLogFixtures, states as logsStates } from './fixtures.logs';
import { resetScreenFixtures, states as screenStates } from './fixtures.screen';
import { resetSnapFixtures, snapRules, states as snapStates } from './fixtures.snap';
import { changeLog as powerLog, resetPowerFixtures, states as powerStates } from './fixtures.power';
import { resetChangeFixtures, states as portsStates } from './fixtures.ports';
import { resetSettingsFixtures, states as settingsStates } from './fixtures.settings';
import { states as storageStates } from './fixtures.storage';

const W = fixtureWorld;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const NOW_UNIX = Math.floor(W.now / 1000);

// ── the computer's row (GET /computers) ──────────────────────────────────────────────

type Row = Record<string, unknown>;
const atlas = W.current;
/** atlas as the Hoody API lists it: on a rented bare-metal server that allows VMs, with KVM on. */
const bareMetal: Row = { ...atlas, kvm: true, server: { ...atlas.server, is_free: false, paid_subserver: false, kvm_supported: true } };
const row = (patch: Row, server?: Row): Row => ({ ...bareMetal, ...patch, ...(server ? { server: { ...(bareMetal.server as Row), ...server } } : {}) });

export const COMPUTERS = {
  bareMetal,
  kvmOff: row({ kvm: false }),
  /** The server says it cannot run VMs. */
  serverNo: row({ kvm: false }, { kvm_supported: false }),
  /** The server's support was not checked lately. */
  serverUnchecked: row({ kvm: false }, { kvm_supported: null }),
  /** A free shared server. */
  shared: row({ kvm: false }, { is_free: true, kvm_supported: false }),
  /** A paid plan on a shared server. */
  sharedPaid: row({ kvm: false }, { is_free: false, paid_subserver: true, kvm_supported: false }),
  /** The row carries no server: what kind of server this is cannot be told. */
  kindUnknown: (() => { const { server: _server, kvm: _kvm, ...rest } = bareMetal; return rest as Row; })(),
  stopped: row({ status: 'stopped' }),
  expired: row({ status: 'stopped', server_expired: true }),
} as const;

/** GET /computers: the world's computers of the shown realm, with atlas as this state has it. */
const computersRule = (atlasRow: Row): FixtureRule =>
  reply(containersRoute, () => {
    const r = capture().realm;
    const rows = W.computers.filter((c) => r === 'all' || c.realm_ids.includes(r)).map((c) => (c.id === atlas.id ? atlasRow : c));
    return { status: 200, body: { data: { computers: rows } } };
  });

// ── the VM program's answers ─────────────────────────────────────────────────────────

const provisioning = { uefi: true, virtio_win_iso: true, templates: true, machine_type: 'pc-q35-9.2', tpm: true, secure_boot: true, file_sharing: true, audio: false };

/** Capabilities: 16 GiB for VMs, three VMs holding memory (their own plus 256 MiB each). */
const caps = {
  kvm_present: true, fuse_present: true, unprivileged_port_start: 1024,
  memory: {
    ceiling_bytes: 16 * GIB,
    admitted: [
      { name: 'web-1', admitted_bytes: 2 * GIB + 256 * MIB },
      { name: 'db-1', admitted_bytes: 4 * GIB + 256 * MIB },
      { name: 'stuck', admitted_bytes: 1 * GIB + 256 * MIB },
    ],
  },
  misc: { kvm_vm: { used: 3, ceiling: 16 }, kvm_vcpu: { used: 8, ceiling: 64 }, kvm_memslot: null },
  provisioning, storage: { free_bytes: 410 * GIB },
};

/** The capabilities answer of a bare-metal computer, as the VM program writes it: no memory limit is set, which it sends
 *  as the largest 64-bit number (more than JavaScript holds exactly); KVM budgets set, nothing running. */
export const NO_LIMIT_WIRE =
  '{"kvm_present":true,"fuse_present":true,"memory":{"ceiling_bytes":18446744073709551615,"admitted":[]},' +
  '"misc":{"kvm_vm":{"used":0,"ceiling":16},"kvm_vcpu":{"used":0,"ceiling":64},"kvm_memslot":null},"unprivileged_port_start":1024,' +
  '"provisioning":{"uefi":true,"virtio_win_iso":true,"templates":true,"tpm":true,"secure_boot":true,"file_sharing":true,"audio":false,' +
  '"machine_type":"pc-q35-9.2"},"storage":{"free_bytes":440234147840}}';

export const CAPS = {
  ready: caps,
  /** No memory limit (NO_LIMIT_WIRE, read the way the browser reads it). */
  noLimit: JSON.parse(NO_LIMIT_WIRE) as Record<string, unknown>,
  /** KVM is not usable inside the computer (off, or on and not there). */
  noKvm: { ...caps, kvm_present: false, memory: { ceiling_bytes: 16 * GIB, admitted: [] }, misc: { kvm_vm: null, kvm_vcpu: null, kvm_memslot: null } },
  /** Nothing running, no budgets, a port floor the computer did not report. */
  idle: { ...caps, unprivileged_port_start: null, memory: { ceiling_bytes: 16 * GIB, admitted: [] }, misc: { kvm_vm: null, kvm_vcpu: null, kvm_memslot: null } },
  /** A run the program cannot match to a VM holds memory. */
  unidentified: { ...caps, memory: { ceiling_bytes: 16 * GIB, admitted: [...caps.memory.admitted, { unidentified_run: 'run-7f3a', admitted_bytes: 6 * GIB, estimated: true }] } },
  /** No UEFI, Secure Boot, TPM, driver disc or templates on this computer. */
  bare: { ...caps, provisioning: { ...provisioning, uefi: false, secure_boot: false, tpm: false, virtio_win_iso: false, templates: false, file_sharing: false } },
} as const;

const vmError = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });
const id = (n: number) => `0195c0de${String(n).padStart(8, '0')}`;

const spec = (patch: Row = {}): Row => ({
  memory_mib: 2048, vcpus: 2, disk_bytes: 20 * GIB, firmware: 'uefi', bus: 'virtio', display_adapter: 'virtio-vga', cpu: 'westmere', tpm: false,
  file_sharing: false, agent: true, console: true, console_input: true, audio: 'none', machine_type: 'pc-q35-9.2', autostart: false, cdroms: [], ...patch,
});
const windows = spec({ memory_mib: 4096, disk_bytes: 64 * GIB, firmware: 'uefi-secure-boot', tpm: true, display: 7002, cdroms: ['/var/lib/hoody-vm/isos/win11.iso', '/usr/share/virtio-win/virtio-win.iso'] });

/** One VM in each state the program can report, then enough stopped ones for a second table page. Each entry is the
 *  detail answer (GET /vms/:name); the list answer is cut from it. */
const details: Row[] = [
  { name: 'web-1', vm_id: id(1), state: 'Running', run: 'a1b2c3d400000001', seq: 41, spec: spec({ display: 7001, autostart: true, ports: [{ proto: 'tcp', host: 8080, guest: 80 }, { proto: 'tcp', host: 2222, guest: 22 }] }), sidecars: [{ kind: 'passt', state: 'ready' }] },
  { name: 'win11', vm_id: id(2), state: 'Stopped', seq: 12, spec: windows },
  { name: 'build', vm_id: id(3), state: 'Creating', seq: 2, progress: { phase: 'importing', bytes_done: 8 * GIB, bytes_total: 20 * GIB } },
  { name: 'db-1', vm_id: id(4), state: 'Paused', run: 'a1b2c3d400000004', seq: 30, spec: spec({ memory_mib: 4096, vcpus: 4, disk_bytes: 100 * GIB, ports: [{ proto: 'tcp', host: 5432, guest: 5432 }] }), sidecars: [{ kind: 'passt', state: 'ready' }] },
  { name: 'cache', vm_id: id(5), state: 'Starting', run: 'a1b2c3d400000005', seq: 7, spec: spec({ memory_mib: 1024, vcpus: 1 }) },
  { name: 'old-api', vm_id: id(6), state: 'Stopping', run: 'a1b2c3d400000006', seq: 19, spec: spec() },
  {
    name: 'batch', vm_id: id(7), state: 'Failed', seq: 9, spec: spec({ memory_mib: 32768, vcpus: 8 }), reason: 'not enough memory in this computer',
    error: vmError('MemoryExceedsCgroup', 'the VM needs 33024 MiB and 9472 MiB is left'),
  },
  {
    name: 'import-1', vm_id: id(8), state: 'Failed',
    progress: { phase: 'failed', bytes_done: 3 * GIB, bytes_total: 40 * GIB, error: vmError('InsufficientSpace', 'the disk needs 40 GiB and 12 GiB is free') },
  },
  { name: 'ghost', vm_id: id(9), state: 'Orphaned', seq: 3, spec: spec(), reason: 'a process is still using this VM\'s disk and cannot be matched to a run' },
  { name: 'stuck', vm_id: id(10), state: 'Running', run: 'a1b2c3d400000010', seq: 55, monitor_stalled: true, spec: spec({ memory_mib: 1024, vcpus: 1, display: 7003 }) },
  {
    name: 'files-1', vm_id: id(11), state: 'Stopped', seq: 4, spec: spec({ file_sharing: true, share_quota_bytes: 10 * GIB }),
    share: { bytes: 12 * GIB, partial: false, sampled_unix: NOW_UNIX - 120, quota_bytes: 10 * GIB, over_quota: true },
  },
  ...Array.from({ length: 6 }, (_, i): Row => ({ name: `lab-${String(i + 1).padStart(2, '0')}`, vm_id: id(20 + i), state: 'Stopped', seq: 1, spec: spec({ memory_mib: 1024, vcpus: 1, disk_bytes: 10 * GIB }) })),
];

/** A failed create is listed as phase `creating`, state `Failed`; a VM still being created as `creating`, `Creating`. */
const summary = (d: Row): Row => ({
  name: d.name, vm_id: d.vm_id, phase: d.progress ? 'creating' : 'committed', state: d.state, ...(d.share ? { share: d.share } : {}),
});

export const VMS = {
  details,
  list: details.map(summary),
  detail: (name: string): Row | undefined => details.find((d) => d.name === name),
} as const;

/** FX: the wire answers the states serve, for tests that read them through the page's parsers. */
export const FX = { COMPUTERS, CAPS, VMS } as const;

// ── states ───────────────────────────────────────────────────────────────────────────

type Answer = FixtureAnswer | (() => FixtureAnswer | Promise<FixtureAnswer>);
const never = () => new Promise<never>(() => undefined);
const notFound: FixtureAnswer = { status: 404, body: vmError('NotFound', 'no such VM') };

export interface WorldSpec {
  /** atlas's row in the Hoody API list (default: bare metal, KVM on). */
  computer?: Row;
  /** GET /capabilities (default: CAPS.ready). */
  caps?: Answer;
  /** The VMs inside, as detail answers (default: VMS.details). */
  vms?: readonly Row[];
  /** GET /vms, when the list itself should fail or hang. */
  list?: Answer;
}

/** Every request a state's VM program rules answered, in order: tests read it to prove what was (and was not) asked. */
export const requestLog: Array<{ route: 'caps' | 'templates' | 'vms' | 'vm'; path: string }> = [];
/** A new terminal session starts (app/fixtures.ts resetFixtureServers): this fake VM program forgets what the last
 *  session asked and changed, in every fixture file of the page. On the web a session is a page load. */
export function resetFixtureServer(): void {
  requestLog.length = 0;
  kvmLog.length = 0;
  lifecycleLog.length = 0;
  powerLog.length = 0;
  resetKvmFixtures();
  resetCreateFixtures();
  resetScreenFixtures();
  resetLogFixtures();
  resetImageFixtures();
  resetSnapFixtures();
  resetPowerFixtures();
  resetChangeFixtures();
  resetSettingsFixtures();
}
const logged = (route: (typeof requestLog)[number]['route'], a: Answer | ((req: FixtureRequest) => FixtureAnswer)) =>
  (req: FixtureRequest): FixtureAnswer | Promise<FixtureAnswer> => {
    requestLog.push({ route, path: req.path });
    return typeof a === 'function' ? a(req) : a;
  };

/** The read rules of one state: the computer's row, capabilities, templates, the VM list and each VM's detail. A state
 *  that adds a change puts its own rules before these (core takes the first rule that matches). */
export function world(s: WorldSpec = {}): FixtureRule[] {
  const vms = s.vms ?? details;
  return [
    computersRule(s.computer ?? bareMetal),
    reply(routes.caps, logged('caps', s.caps ?? answers.ok(CAPS.ready))),
    reply(routes.templates, logged('templates', answers.ok([{ id: 'debian-13', disk_bytes: 4 * GIB }, { id: 'ubuntu-24-04', disk_bytes: 5 * GIB }]))),
    reply(routes.vms, logged('vms', s.list ?? answers.ok(vms.map(summary)))),
    reply(routes.vm, logged('vm', (req) => {
      const d = vms.find((v) => req.path.endsWith(`/vms/${String(v.name)}`));
      return d ? answers.ok(d) : notFound;
    })),
    // The image, snapshot and log rules over their defaults, so every state answers those reads. The two makers are
    // function declarations, so they are callable whichever of these files loads first.
    ...imageRules('*'), ...snapRules('*'), logRule(),
  ];
}

export default defineFixtures({
  default: 'many',
  states: {
    // Bare metal, KVM on, one VM in each state.
    many: world(),
    // Three VMs.
    few: world({ vms: details.slice(0, 3) }),
    // The VM program answers and holds no VM.
    empty: world({ vms: [], caps: answers.ok(CAPS.idle) }),
    loading: world({ caps: never, list: never }),
    // The VM list read fails while the program answers its capabilities.
    error: world({ list: { status: 500, body: vmError('StorageFailed', 'the VM store could not be read') } }),
    // A shared server (free plan): VMs cannot run here and the VM program is never asked.
    shared: world({ computer: COMPUTERS.shared, caps: answers.lost(), list: answers.lost() }),
    'shared-paid': world({ computer: COMPUTERS.sharedPaid, caps: answers.lost(), list: answers.lost() }),
    // The computer's row names no server: nothing is claimed about its kind, and the VM program is asked.
    'kind-not-known': world({ computer: COMPUTERS.kindUnknown }),
    // Bare metal with KVM off: VMs list and can be made; none can start.
    'kvm-off': world({ computer: COMPUTERS.kvmOff, caps: answers.ok(CAPS.noKvm), vms: details.filter((d) => d.state === 'Stopped') }),
    // KVM is on in the Hoody API and not usable inside the computer.
    'kvm-not-inside': world({ caps: answers.ok(CAPS.noKvm), vms: details.filter((d) => d.state === 'Stopped') }),
    'server-no': world({ computer: COMPUTERS.serverNo, caps: answers.ok(CAPS.noKvm), vms: [] }),
    'server-unchecked': world({ computer: COMPUTERS.serverUnchecked, caps: answers.ok(CAPS.noKvm), vms: [] }),
    // The VM program does not answer at all.
    unreachable: world({ caps: answers.lost(), list: answers.lost() }),
    // Bare metal with no memory limit set: the VM program sends it as the largest 64-bit number.
    'no-memory-limit': world({ caps: answers.ok(CAPS.noLimit), vms: details.filter((d) => d.state === 'Stopped') }),
    // The VM program answers, in a shape this Hub does not read (no provisioning or storage block).
    unreadable: world({ caps: answers.ok({ kvm_present: true, fuse_present: true, memory: { ceiling_bytes: 16 * GIB, admitted: [] }, misc: {} }), list: answers.lost() }),
    // The computer's access rules refuse the page.
    blocked: world({ caps: { status: 403, body: {} }, list: { status: 403, body: {} } }),
    'computer-stopped': world({ computer: COMPUTERS.stopped, caps: answers.lost(), list: answers.lost() }),
    'computer-expired': world({ computer: COMPUTERS.expired, caps: answers.lost(), list: answers.lost() }),
    // A run the VM program cannot match to a VM holds memory.
    // The list answers once, with a VM that is starting, and fails from then on (requestLog says which read this is).
    'list-fails-later': world({ list: () => (requestLog.filter((r) => r.route === 'vms').length <= 1 ? answers.ok(details.filter((d) => d.name === 'cache').map(summary)) : { status: 500, body: vmError('StorageFailed', 'the VM store could not be read') }) }),
    'unidentified-run': world({ caps: answers.ok(CAPS.unidentified) }),
    // A computer without UEFI, Secure Boot, TPM, the driver disc or templates.
    'bare-provisioning': world({ caps: answers.ok(CAPS.bare) }),
    ...kvmStates(),
    ...createStates(),
    ...screenStates(),
    ...logsStates(),
    ...imagesStates(),
    ...snapStates(),
    ...powerStates(),
    ...portsStates(),
    ...settingsStates(),
    ...storageStates(),
  },
});
