// Fake-API states of the Images view: the VM program's image store, its download jobs and its catalogue of systems,
// over the read rules of fixtures.ts.
//
// Each state serves a store that changes with what it answers: a delete that landed is gone from the next list, an
// added download is listed from then on, a cancelled one leaves the list. A state says, per change, whether the request
// reaches the VM program (`lands`) and what comes back (an answer, a refusal, or nothing). imageLog holds every change
// the states' rules received, for tests that prove what was (and was not) sent.
import { answers, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { COMPUTERS, world, type WorldSpec } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const PART = 8 * MIB;
const sha = (c: string) => c.repeat(64);
const job = (c: string) => c.repeat(32);
const vmError = (code: string, message: string, retryable = false) => ({ error: { code, message, retryable } });

/** The image store: one that says what it is, one known only by its volume name, one for another kind of machine, and
 *  one whose bytes are still arriving. */
export const IMAGES: Row[] = [
  { sha256: sha('a'), phase: 'ready', bytes: 3 * GIB + 412 * MIB, part_size: PART, modified_unix: 1_760_000_000, media: { volume_id: 'Debian 13.1.0 amd64 n', os: [{ id: 'http://debian.org/debian/13', name: 'Debian 13', arch: 'x86_64', live: false, installer: true }] } },
  { sha256: sha('b'), phase: 'ready', bytes: 6 * GIB + 120 * MIB, part_size: PART, modified_unix: 1_760_100_000, media: { volume_id: 'CCCOMA_X64FRE_EN-US_DV9', os: [] } },
  { sha256: sha('d'), phase: 'ready', bytes: 2 * GIB, part_size: PART, modified_unix: 1_760_200_000, media: { volume_id: 'Ubuntu-Server 24.04.1 LTS arm64', os: [{ id: 'http://ubuntu.com/ubuntu/24.04', name: 'Ubuntu 24.04', arch: 'aarch64', live: false, installer: true }] } },
  { sha256: sha('c'), phase: 'uploading', bytes: 1 * GIB, part_size: PART, modified_unix: 1_760_300_000, next_part: 128 },
];

/** One download in each state the program can report. */
export const DOWNLOADS: Row[] = [
  { id: job('1'), state: 'running', url: 'https://releases.ubuntu.com/24.04/ubuntu-24.04.1-live-server-amd64.iso', fetched_bytes: 988 * MIB, expected_bytes: 2600 * MIB },
  { id: job('2'), state: 'running', url: 'https://mirror.example.org/images/rescue.iso', fetched_bytes: 120 * MIB },
  { id: job('3'), state: 'verifying', url: 'https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.1.0-amd64-netinst.iso', fetched_bytes: 670 * MIB, expected_bytes: 670 * MIB },
  { id: job('4'), state: 'ready', url: 'https://cdimage.debian.org/debian-cd/13.1.0/amd64/iso-dvd/debian-13.1.0-amd64-DVD-1.iso', fetched_bytes: 3 * GIB + 412 * MIB, expected_bytes: 3 * GIB + 412 * MIB, sha256: sha('a'), verification: 'tofu' },
  { id: job('5'), state: 'failed', url: 'https://downloads.example.net/old/installer.iso', fetched_bytes: 0, error: 'the site answered 404 for this link' },
  { id: job('6'), state: 'interrupted', url: 'https://download.fedoraproject.org/pub/fedora/linux/releases/42/Everything/x86_64/iso/Fedora-Everything-netinst-x86_64-42-1.1.iso', fetched_bytes: 300 * MIB, expected_bytes: 870 * MIB },
];

const media = (url: string, patch: Row = {}): Row => ({ url, arch: 'x86_64', live: false, installer: true, identifiable: true, ...patch });
/** The catalogue of systems: two that can be picked, and one whose only image is for another kind of machine. */
export const CATALOGUE: Row = {
  arch: 'x86_64', available: true, status: 'healthy', unreadable: 0,
  entries: [
    { id: 'http://debian.org/debian/13', short_id: 'debian13', name: 'Debian 13', vendor: 'Debian Project', family: 'linux', media: [media('https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.1.0-amd64-netinst.iso', { variant: 'netinst' })] },
    { id: 'http://ubuntu.com/ubuntu/24.04', short_id: 'ubuntu24.04', name: 'Ubuntu 24.04', vendor: 'Canonical', family: 'linux', media: [media('https://releases.ubuntu.com/24.04/ubuntu-24.04.1-live-server-amd64.iso', { variant: 'server', live: true }), media('https://cdimage.ubuntu.com/releases/24.04/release/ubuntu-24.04.1-live-server-arm64.iso', { arch: 'aarch64', variant: 'server' })] },
    { id: 'http://fedoraproject.org/fedora/42', short_id: 'fedora42', name: 'Fedora 42', media: [media('https://download.fedoraproject.org/pub/fedora/linux/releases/42/Everything/aarch64/iso/Fedora-Everything-netinst-aarch64-42-1.1.iso', { arch: 'aarch64' })] },
  ],
};
/** A computer with no catalogue of systems. */
export const NO_CATALOGUE: Row = { arch: 'x86_64', available: false, status: 'absent', unreadable: 0, entries: [] };

export const FX_IMAGES = { IMAGES, DOWNLOADS, CATALOGUE, NO_CATALOGUE } as const;

/** Every change the states' rules received, in order. */
export const imageLog: Array<{ change: 'remove' | 'add' | 'stop'; path: string; body: unknown }> = [];
/** Every read of the image store the states' rules answered. */
export const imageReadLog: string[] = [];
/** The store of each state as its changes left it. */
const stores = new Map<string, { images: Row[]; downloads: Row[] }>();
/** Tests: forget what every state answered and what its changes did. */
export function resetImageFixtures(): void {
  imageLog.length = 0;
  imageReadLog.length = 0;
  stores.clear();
}

type Answer = FixtureAnswer | (() => FixtureAnswer | Promise<FixtureAnswer>);
const give = (a: Answer) => (typeof a === 'function' ? a() : a);
const never = () => new Promise<never>(() => undefined);

/** What one change does in a state: whether the request reaches the VM program, and what comes back (default: it
 *  lands and the program's own answer comes back). */
interface ChangeSpec { lands?: boolean; answer?: FixtureAnswer }

export interface ImagesSpec {
  images?: readonly Row[];
  downloads?: readonly Row[];
  /** GET /isos, /isos/downloads, /osinfo, when the read itself should fail or hang. */
  imagesRead?: Answer;
  downloadsRead?: Answer;
  catalogue?: Answer;
  remove?: ChangeSpec;
  add?: ChangeSpec;
  stop?: ChangeSpec;
}

/** The image rules of one state: the three reads over its store, and the three changes. */
export function imageRules(key: string, s: ImagesSpec = {}): FixtureRule[] {
  const store = () => {
    let st = stores.get(key);
    if (!st) stores.set(key, (st = { images: [...(s.images ?? IMAGES)], downloads: [...(s.downloads ?? DOWNLOADS)] }));
    return st;
  };
  const last = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  return [
    reply(routes.isos, () => { imageReadLog.push('images'); return give(s.imagesRead ?? (() => answers.ok(store().images))); }),
    reply(routes.dls, () => { imageReadLog.push('downloads'); return give(s.downloadsRead ?? (() => answers.ok(store().downloads))); }),
    reply(routes.osinfo, () => { imageReadLog.push('catalogue'); return give(s.catalogue ?? answers.ok(CATALOGUE)); }),
    reply(routes.isoDelete, (req) => {
      imageLog.push({ change: 'remove', path: req.path, body: req.body });
      const st = store();
      if (s.remove?.lands !== false) st.images = st.images.filter((i) => i.sha256 !== last(req.path));
      return s.remove?.answer ?? { status: 204 };
    }),
    reply(routes.dlStart, (req) => {
      imageLog.push({ change: 'add', path: req.path, body: req.body });
      const st = store();
      const body = (req.body ?? {}) as Row;
      const made: Row = { id: job('9'), state: 'running', url: body.url, fetched_bytes: 0 };
      if (s.add?.lands !== false) st.downloads = [made, ...st.downloads.filter((d) => d.id !== made.id)];
      return s.add?.answer ?? { status: 202, body: made };
    }),
    reply(routes.dlDelete, (req) => {
      imageLog.push({ change: 'stop', path: req.path, body: req.body });
      const st = store();
      // As the VM program does: a fetch at work is cancelled and stays listed; any other row is removed.
      if (s.stop?.lands !== false) {
        const id = last(req.path);
        st.downloads = st.downloads.flatMap((d) => (d.id !== id ? [d] : d.state === 'running' ? [{ ...d, state: 'cancelled' }] : []));
      }
      return s.stop?.answer ?? { status: 204 };
    }),
  ];
}

/** The image reads every state of the page can serve (the default store, never changed by a state of its own). */
export const imageReads = (): FixtureRule[] => imageRules('*');

const state = (key: string, s: ImagesSpec = {}, w: WorldSpec = {}): FixtureRule[] => [...imageRules(key, s), ...world(w)];
const lost = answers.lost();

/** The Images view's states (fixtures.ts spreads them into the page's). */
export function states(): Record<string, FixtureRule[]> {
  return {
    'images-many': state('images-many'),
    // Nothing kept, nothing fetched, no catalogue of systems on the computer.
    'images-empty': state('images-empty', { images: [], downloads: [], catalogue: answers.ok(NO_CATALOGUE) }),
    'images-loading': state('images-loading', { imagesRead: never, downloadsRead: never }),
    // The image list read fails while the downloads answer.
    'images-error': state('images-error', { imagesRead: { status: 500, body: vmError('StorageFailed', 'the image store could not be read') } }),
    // The catalogue of systems cannot be read: the link can still be typed.
    'images-no-catalogue-read': state('images-no-catalogue-read', { catalogue: { status: 500, body: vmError('StorageFailed', 'the catalogue could not be read') } }),
    // A delete that landed and whose answer never came: the next list proves it.
    'images-remove-lost': state('images-remove-lost', { remove: { answer: lost } }),
    // A delete whose answer never came and that never arrived: the list still holds the image.
    'images-remove-lost-kept': state('images-remove-lost-kept', { remove: { lands: false, answer: lost } }),
    // A VM has the image as a disc.
    'images-remove-refused': state('images-remove-refused', { remove: { lands: false, answer: { status: 409, body: vmError('BadState', 'image is attached to VM win11', true) } } }),
    // An added download whose answer never came (it is in the list all the same).
    'images-add-lost': state('images-add-lost', { add: { answer: lost } }),
    // The program reports it cannot fetch at all: a 503, so the outcome is held with that reason.
    'images-add-cannot-fetch': state('images-add-cannot-fetch', { add: { lands: false, answer: { status: 503, body: vmError('DownloadFailed', 'curl is not installed') } } }),
    'images-add-refused-link': state('images-add-refused-link', { add: { lands: false, answer: { status: 400, body: vmError('SpecInvalid', 'url resolves to a private address') } } }),
    'images-add-already': state('images-add-already', { add: { lands: false, answer: { status: 409, body: vmError('AlreadyExists', 'an image with this sha256 is already in the store') } } }),
    'images-add-busy': state('images-add-busy', { add: { lands: false, answer: { status: 409, body: vmError('OperationInProgress', 'too many downloads are running', true) } } }),
    // A cancel that landed and whose answer never came.
    'images-stop-lost': state('images-stop-lost', { stop: { answer: lost } }),
    // A clear that never arrived and whose answer never came: the row is still listed.
    'images-clear-lost-kept': state('images-clear-lost-kept', { downloads: [{ id: job('7'), state: 'cancelled', url: 'https://mirror.example.org/images/rescue.iso', fetched_bytes: 5 * MIB }], stop: { lands: false, answer: lost } }),
    // The download went on to be checked between the list read and the press.
    'images-stop-refused': state('images-stop-refused', { stop: { lands: false, answer: { status: 409, body: vmError('BadState', 'the download is being verified', true) } } }),
    // A shared server: the image store is never asked.
    'images-shared': state('images-shared', { imagesRead: lost, downloadsRead: lost, catalogue: lost }, { computer: COMPUTERS.shared, caps: lost, list: lost }),
  };
}

