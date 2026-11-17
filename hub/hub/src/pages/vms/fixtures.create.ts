// Fake-API states of "New VM": what the VM program answers to a create, over the read rules of fixtures.ts.
//
// Each state serves the image store and a VM list that changes with the create it answers: an accepted create is
// listed as being created from then on, so a read after it proves it; a lost one may or may not be. createLog holds
// every create body sent, for tests that prove what was (and was not) sent.
import { answers, capture, containersRoute, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { CAPS, FX, VMS, world, type WorldSpec } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;
const GIB = 1024 ** 3;
const sha = (c: string) => c.repeat(64);

/** The image store: two ready images (one says what it is, one only its volume name), one still being uploaded and one
 *  made for another kind of machine. */
export const IMAGES: Row[] = [
  { sha256: sha('a'), phase: 'ready', bytes: 3 * GIB, part_size: 8 * 1024 * 1024, modified_unix: 1_760_000_000, media: { volume_id: 'Debian 13.1.0 amd64', os: [{ id: 'http://debian.org/debian/13', name: 'Debian 13', live: false, installer: true }] } },
  { sha256: sha('b'), phase: 'ready', bytes: 6 * GIB, part_size: 8 * 1024 * 1024, modified_unix: 1_760_000_100, media: { volume_id: 'CCCOMA_X64FRE_EN-US_DV9', os: [] } },
  { sha256: sha('c'), phase: 'uploading', bytes: 1 * GIB, part_size: 8 * 1024 * 1024, modified_unix: 1_760_000_200, next_part: 128 },
  { sha256: sha('d'), phase: 'ready', bytes: 2 * GIB, part_size: 8 * 1024 * 1024, modified_unix: 1_760_000_300, media: { volume_id: 'Debian 13.1.0 arm64', os: [{ id: 'http://debian.org/debian/13', name: 'Debian 13 (ARM)', arch: 'aarch64', live: false, installer: true }] } },
];

/** Every create body the states' rules received, in order. */
export const createLog: unknown[] = [];
/** VMs made by creates the states accepted (per state, by name): listed from then on. */
const made = new Map<string, Row[]>();
/** Whether the VM program lists the rows a state keeps out of its first lists (CreateSpec.hidden). */
let revealed = false;
/** Tests: the VM program lists the state's held-back rows from now on, while the page still shows its earlier list. */
export function revealHiddenVms(): void { revealed = true; }
/** Tests: forget every create a state answered. */
export function resetCreateFixtures(): void {
  createLog.length = 0;
  made.clear();
  revealed = false;
}

function vmError(code: string, message: string) { return { error: { code, message, retryable: false } }; }
const summary = (d: Row): Row => ({ name: d.name, vm_id: d.vm_id, phase: d.progress ? 'creating' : 'committed', state: d.state });
const newId = (n: number) => `0195c0de${String(900 + n).padStart(8, '0')}`;

interface CreateSpec extends WorldSpec {
  /** What the create answers after the VM program took it (`lands` true) or without it having arrived. */
  answer: (req: FixtureRequest, row: Row) => FixtureAnswer;
  /** The request reached the VM program: the VM is listed from then on (`failed`: as a create that failed for lack
   *  of disk, which is how the VM program reports it: never as the answer to the create itself). */
  lands: boolean | 'failed';
  images?: FixtureAnswer;
  /** What the VM list answers instead of the VMs. */
  list?: FixtureAnswer;
  /** Rows the VM program holds that the page's list does not show yet: listed only after revealHiddenVms(). */
  hidden?: Row[];
  /** What the VM list answers from revealHiddenVms() on, instead of the VMs. */
  listAfterReveal?: FixtureAnswer;
}

function state(key: string, s: CreateSpec): FixtureRule[] {
  const base = s.vms ?? VMS.details;
  const held = (): Row[] => [...base, ...(revealed ? s.hidden ?? [] : [])];
  const all = (): Row[] => [...held().filter((b) => !(made.get(key) ?? []).some((m) => m.name === b.name)), ...(made.get(key) ?? [])];
  return [
    reply(routes.isos, () => s.images ?? answers.ok(IMAGES)),
    reply(routes.vmCreate, (req) => {
      createLog.push(req.body);
      const body = (req.body ?? {}) as Row;
      const mine = made.get(key) ?? [];
      const row: Row = { name: body.name, vm_id: newId(mine.length + 1), state: 'Creating', seq: 1, progress: { phase: 'importing', bytes_done: 1 * GIB, bytes_total: 20 * GIB } };
      if (s.lands === 'failed') made.set(key, [...mine, failedRow(String(row.name), String(row.vm_id))]);
      else if (s.lands) made.set(key, [...mine, row]);
      return s.answer(req, row);
    }),
    // The list and each VM as they stand now (a create that landed is in them).
    reply(routes.vms, () => (revealed && s.listAfterReveal) || s.list || answers.ok(all().map(summary))),
    reply(routes.vm, (req) => {
      const d = all().find((v) => req.path.endsWith(`/vms/${String(v.name)}`));
      return d ? answers.ok(d) : { status: 404, body: vmError('NotFound', 'no such VM') };
    }),
    ...world(s),
  ];
}

/** The computers list with granite on a bare-metal server with KVM on too, so either computer shown offers New VM. */
function twoComputers(): FixtureRule {
  const bare = FX.COMPUTERS.bareMetal;
  return reply(containersRoute, () => {
    const r = capture().realm;
    const rows = fixtureWorld.computers.filter((c) => r === 'all' || c.realm_ids.includes(r)).map((c): Row =>
      c.id === bare.id ? bare : c.name === 'granite' ? { ...c, kvm: true, server: { ...c.server, is_free: false, paid_subserver: false, kvm_supported: true } } : { ...c });
    return { status: 200, body: { data: { computers: rows } } };
  });
}
const failedRow = (name: string, vmId: string): Row => ({ name, vm_id: vmId, state: 'Failed', progress: { phase: 'failed', bytes_done: 0, bytes_total: 20 * GIB, error: vmError('InsufficientSpace', 'the disk needs 20 GiB and 12 GiB is free') } });

function accepted(_req: FixtureRequest, row: Row): FixtureAnswer { return { status: 202, body: { name: row.name, vm_id: row.vm_id, state: 'Creating', display: 7004 } }; }

// A function declaration, and nothing above it runs at import: fixtures.ts calls it while this file may still be loading.
export function states(): Record<string, FixtureRule[]> { return {
  // The create is accepted: the VM is being made.
  'create-ok': state('create-ok', { answer: accepted, lands: true }),
  // The answer is lost after the VM program took the request: a later list shows the VM.
  'create-lost': state('create-lost', { answer: () => answers.lost(), lands: true }),
  // The answer is lost and the request never arrived: no list ever shows the VM.
  'create-lost-nothing': state('create-lost-nothing', { answer: () => answers.lost(), lands: false }),
  // Not enough free disk: the create is accepted, then listed as one that failed.
  'create-no-space': state('create-no-space', { answer: accepted, lands: 'failed' }),
  // The same with the answer lost: a later list shows the failed create under a new id.
  'create-lost-failed': state('create-lost-failed', { answer: () => answers.lost(), lands: 'failed' }),
  // The VM list cannot be read while the form is open.
  'create-list-error': state('create-list-error', { answer: accepted, lands: true, list: { status: 500, body: vmError('StorageFailed', 'the VM list could not be read') } }),
  // A definite refusal: the name was taken in the meantime.
  'create-refused': state('create-refused', { answer: () => ({ status: 409, body: vmError('AlreadyExists', 'a VM named this exists') }), lands: false }),
  // A computer without UEFI, Secure Boot, TPM, the driver disc or templates.
  'create-bare': state('create-bare', { answer: accepted, lands: true, caps: answers.ok(CAPS.bare) }),
  // The image store cannot be read.
  'create-images-error': state('create-images-error', { answer: accepted, lands: true, images: { status: 500, body: vmError('StorageFailed', 'the image store could not be read') } }),
  // The answer is lost and the request never arrived; the program also holds an earlier failed create of again-1 that
  // the page's list does not show yet (revealHiddenVms): a read after the send lists that earlier row, under its old id.
  'create-stale-failed': state('create-stale-failed', { answer: () => answers.lost(), lands: false, hidden: [failedRow('again-1', '0195c0de00000777')] }),
  // The program holds a VM named taken-1 that the page's list does not show yet (revealHiddenVms).
  'create-stale-taken': state('create-stale-taken', { answer: () => answers.lost(), lands: true, hidden: [{ name: 'taken-1', vm_id: '0195c0de00000778', state: 'Stopped' }] }),
  // The program holds a failed create of taken-2 listed without an id, which the page's list does not show yet
  // (revealHiddenVms). A failed create leaves its name free, so only the missing id stops the send.
  'create-stale-noid': state('create-stale-noid', { answer: accepted, lands: true, hidden: [{ name: 'taken-2', state: 'Failed', progress: { phase: 'failed', bytes_done: 0, bytes_total: 20 * GIB } }] }),
  // The VM list answers while the form is filled in and fails from revealHiddenVms() on.
  'create-stale-unread': state('create-stale-unread', { answer: accepted, lands: true, listAfterReveal: { status: 500, body: vmError('StorageFailed', 'the VM list could not be read') } }),
  // Two computers (shown with realm 'all'); a lost create whose create then failed, as create-lost-failed.
  'create-two': [twoComputers(), ...state('create-two', { answer: () => answers.lost(), lands: 'failed' })],
  // No VM yet and an empty image store.
  'create-first': state('create-first', { answer: accepted, lands: true, vms: [], caps: answers.ok(CAPS.idle), images: answers.ok([]) }),
}; }
