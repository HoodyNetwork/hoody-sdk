// Fake files-program answers for the Files page (hub:dev, hub:shots, tests, specs). Computers come from core's
// fixtureWorld (atlas running, cedar stopped, fjord paused in Personal). atlas has a small tree: a 120-photo folder
// for paging, an empty folder, names the Hub cannot open yet, a tree deeper than the routes reach, and a folder the
// program refuses. Every other running computer lists a short tree. A path the tree lacks answers 404.
import { answers, computerRuntimeRoute, containersRoute, defineFixtures, fixtureSession, fixtureWorld, reply, worldColours, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { copyRoute, deleteRoute, folderRoute, hashRoute, mkdirRoute, mountsRoute, moveRoute, putRoute, realpathRoute, renameRoute, rootRoute } from './routes';
import { findAsked, roRules } from './ro.fixtures';
import { linkRules, resetLinks, type LinkMode } from './link/fixtures';
import { storageRules } from './storage/fixtures';
import { archiveRules, resetArchives, type ArchiveMode } from './archive.fixtures';
import { shareRules } from './shares/fixtures';

const W = fixtureWorld;
const ATLAS = W.computers.find((c) => c.name === 'atlas')!;
const T0 = 1_761_200_000; // 2025-10-23, seconds

/** A folder: its folders, its files (name, bytes), and links and pipes/sockets the program lists by type. */
type Node = { dir: string[]; files?: [string, number][]; links?: string[]; special?: string[] };
const photos: [string, number][] = Array.from({ length: 120 }, (_, i) => [`photo-${String(i + 1).padStart(3, '0')}.jpg`, 180_000 + i * 7_919]);
const deep = ['srv', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
export const ATLAS_TREE: Record<string, Node> = {
  '/': { dir: ['bin', 'copy', 'etc', 'home', 'root', 'srv', 'tmp', 'usr', 'var'] },
  '/bin': { dir: [], files: [['bash', 1_265_648], ['ls', 151_344], ['cat', 44_016]] },
  '/usr': { dir: ['bin', 'lib', 'share'] },
  '/usr/bin': { dir: [], files: [['env', 43_976], ['node', 98_112_400]] },
  '/usr/lib': { dir: [] },
  '/usr/share': { dir: [] },
  '/home': { dir: ['ada'] },
  '/home/ada': { dir: ['projects', 'odd%dir', 'caf�'], files: [['notes.txt', 1_204], ['report.pdf', 482_113], ['bell\u0007.txt', 3], ['hosts-link', 220]] },
  '/home/ada/projects': { dir: ['site'], files: [['README.md', 2_048]] },
  '/home/ada/projects/site': { dir: [], files: [['deploy.sh', 812], ['config.yaml', 340]] },
  '/srv': { dir: ['media', 'a', 'app'] },
  '/srv/media': { dir: [], files: photos },
  '/srv/app': { dir: ['public'], files: [['server.js', 9_812], ['package.json', 612]] },
  '/tmp': { dir: [] },
  '/etc': { dir: ['nginx', 'ssh'], files: [['hostname', 6], ['hosts', 220]] },
  '/var': { dir: ['log', 'lib'] },
  '/var/log': { dir: [], files: [['syslog', 48_211]] },
  '/var/lib': { dir: [] },
  '/etc/nginx': { dir: [], files: [['nginx.conf', 2_656]] },
  '/etc/ssh': { dir: [], files: [['sshd_config', 3_223]] },
};
// /srv/a/…/g, eight parts deep, holds h: a ninth level the routes cannot open.
for (let i = 2; i <= deep.length; i++) ATLAS_TREE['/' + deep.slice(0, i).join('/')] = { dir: [i === deep.length ? 'h' : deep[i]!] };
// What the change routes work on: a copy of atlas's tree, put back by resetFiles() (tests call it before each).
const clone = (t: Record<string, Node>) => Object.fromEntries(Object.entries(t).map(([k, n]) => [k, { dir: [...n.dir], ...(n.files ? { files: n.files.map((f) => [...f] as [string, number]) } : {}), ...(n.links ? { links: [...n.links] } : {}), ...(n.special ? { special: [...n.special] } : {}) }]));
let live = clone(ATLAS_TREE);
/** The folder of the last create or rename whose answer was lost: state heldSlow keeps its re-read from answering. */
let lostIn: string | null = null;
/** realpath and storage-list answers so far (states realSlowAgain / mountsSlowAgain answer the first, hold the rest). */
let realAsked = 0;
let mountsAsked = 0;
/** Reads of /home/ada/projects/site on atlas so far (state siteSlowAgain answers the first, holds the rest). */
let siteAsked = 0;
export function resetFiles(): void { live = clone(ATLAS_TREE); listAsked.length = 0; byIdAsked.length = 0; seen.length = 0; lostIn = null; realAsked = 0; mountsAsked = 0; siteAsked = 0; contents.clear(); kept.clear(); failOnce = null; sentChanges.length = 0; uploadFaults.length = 0; hashOf.clear(); hashHold = null; failNext.clear(); failWhile.clear(); skipWhile.clear(); oldWhile.clear(); loseWhile.clear(); slowNext.clear(); transfers = 0; resetLinks(); resetArchives(); }
// A link under /home/ada resolves into /etc; atlas has one storage open at /srv/media.
const REAL: Record<string, string> = { '/home/ada/hosts-link': '/etc/hosts' };
const MOUNTS = { mounts: [{ id: 'mount_' + 'a1'.repeat(16), backend_id: 'b2'.repeat(8), mount_path: '/srv/media', label: 'Photos', status: 'mounted' }] };
const API_TREE: Record<string, Node> = { '/api': { dir: ['v1'] }, '/api/v1': { dir: [], files: [['readme.txt', 40]] } };
const OTHER_TREE: Record<string, Node> = { '/': { dir: ['home', 'srv', 'tmp'] }, '/home': { dir: [] }, '/srv': { dir: [] }, '/tmp': { dir: [] } };

const pathOf = (r: FixtureRequest): string => {
  const parts = (r.path.split('?')[0] ?? '').split('/').slice(4).filter(Boolean).map(decodeURIComponent);
  return '/' + parts.join('/');
};
// A moved item keeps its modified time (a rename does): kept here by its new path.
const kept = new Map<string, number>();
const at = (path: string, name: string) => (path === '/' ? '/' + name : path + '/' + name);
// Each entry carries its own type and the listing its `skipped` list (the program's listing_manifest).
const listing = (path: string, n: Node) => ({
  path, count: n.dir.length + (n.files?.length ?? 0) + (n.links?.length ?? 0) + (n.special?.length ?? 0), skipped: [] as unknown[],
  entries: [
    ...n.dir.map((name, i) => ({ name, is_dir: true, size: 0, modified: kept.get(at(path, name)) ?? T0 - i * 86_400, type: 'dir', mode: '755' })),
    ...(n.files ?? []).map(([name, size], i) => ({ name, is_dir: false, size, modified: kept.get(at(path, name)) ?? T0 - i * 3_600, type: 'file', mode: '644' })),
    // A link is `name` (pointing at notes.txt beside it, as written), or `name=>target` for another target as the
    // program shows it (an absolute one normalized from its serve root, one leading out as [external]).
    ...(n.links ?? []).map((l) => { const [name, target = 'notes.txt'] = l.split('=>'); return { name: name!, is_dir: false, size: 0, modified: T0, type: 'symlink', target }; }),
    ...(n.special ?? []).map((name) => ({ name, is_dir: false, size: 0, modified: T0, type: 'fifo' })),
  ],
});
/** The same listing as an older files program answers it: no types, no skipped list. */
const oldListing = (path: string, n: Node) => { const l = listing(path, n); return { path, count: l.count, entries: l.entries.map(({ name, is_dir, size, modified }) => ({ name, is_dir, size, modified })) }; };

// The top folder comes from listRootDirectory (GET /?json), which answers a DirectoryListing (the files program's openapi
// DirectoryListing / PathItem): paths with path_type, mtime in milliseconds, size = item count for a folder.
const rootListing = (n: Node) => ({
  kind: 'Index', href: '/', uri_prefix: '/', allow_upload: true, allow_delete: true, allow_search: true, allow_archive: true, allow_remote: false,
  auth: false, user: null, dir_exists: true, remote_mounts: null,
  paths: [
    ...n.dir.map((name, i) => ({ path_type: i === 1 ? 'SymlinkDir' : 'Dir', name, mtime: (T0 - i * 86_400) * 1000, size: 3 })),
    ...(n.files ?? []).map(([name, size], i) => ({ path_type: 'File', name, mtime: (T0 - i * 3_600) * 1000, size })),
  ],
});
type Answer = (r: FixtureRequest, path: string) => FixtureAnswer;
/** Tests only: every folder a fixture rule was asked for, as `<computer name>:<path>`. */
export const seen: string[] = [];
/** Tests only: a folder whose next listing on atlas fails (502), once. */
const failNext = new Set<string>();
export function failListingOnce(path: string): void { failNext.add(path); }
/** Tests only: every listing of this folder on atlas fails until the returned stop runs (a pane's own refetch cannot
 *  use the failure up before the read the test means). */
const failWhile = new Set<string>();
export function failListingWhile(path: string): () => void { failWhile.add(path); return () => { failWhile.delete(path); }; }
/** Tests only: while set, atlas's listings of this folder leave `name` out of their entries and name it
 *  in `skipped` (reason unreadable), as the program does for an entry it cannot stat, whether or not it is there. */
const skipWhile = new Map<string, string>();
export function skipInListingWhile(path: string, name: string): () => void { skipWhile.set(path, name); return () => { skipWhile.delete(path); }; }
/** Tests only: while set, atlas answers this folder as an older files program does (no skipped list,
 *  no entry types), while the rest of the tree answers as today. */
const oldWhile = new Set<string>();
export function oldListingWhile(path: string): () => void { oldWhile.add(path); return () => { oldWhile.delete(path); }; }
/** Tests only: while set, nothing answers a listing of this folder on atlas (the answer is lost). */
const loseWhile = new Set<string>();
export function loseListingWhile(path: string): () => void { loseWhile.add(path); return () => { loseWhile.delete(path); }; }
/** Tests only: a folder whose next listing on atlas takes a minute (or `ms`), once. */
const slowNext = new Map<string, number>();
export function slowListingOnce(path: string, ms = 60_000): void { slowNext.set(path, ms); }
const tree: Answer = (r, path) => {
  if (r.target?.container.id === ATLAS.id && (failNext.delete(path) || failWhile.has(path))) return answers.pending5xx(502);
  if (r.target?.container.id === ATLAS.id && loseWhile.has(path)) return answers.lost();
  const slowMs = r.target?.container.id === ATLAS.id ? slowNext.get(path) : undefined;
  if (slowMs !== undefined && slowNext.delete(path)) { const a = tree(r, path); return answers.slow(a.body, slowMs); }
  const t = r.target?.container.id === ATLAS.id ? live : OTHER_TREE;
  if (path === '/root') return answers.refused(403, 'ACCESS_FORBIDDEN');
  const n = t[path];
  if (!n) return answers.refused(404, 'NOT_FOUND');
  if (path === '/') return answers.ok(rootListing(n));
  if (r.target?.container.id === ATLAS.id && oldWhile.has(path)) return answers.ok(oldListing(path, n));
  const l = listing(path, n);
  const skip = r.target?.container.id === ATLAS.id ? skipWhile.get(path) : undefined;
  return answers.ok(skip === undefined ? l : { ...l, entries: l.entries.filter((e) => e.name !== skip), skipped: [{ name: skip, reason: 'unreadable', error: 'Permission denied (os error 13)' }] });
};
// Download from a link: a finished download's file lands in atlas's live tree under a free name (name-1.ext …).
const savedName = (n: Node, name: string): string => {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 0; ; i++) { const x = i ? `${stem}-${i}${ext}` : name; if (!has(n, x)) return x; }
};
const link = (mode: LinkMode) => linkRules(mode, (computer, folder, name, size) => {
  const n = computer === ATLAS.id ? live[folder] : undefined;
  if (!n) return name;
  const as = savedName(n, name);
  n.files = [...(n.files ?? []), [as, size]];
  return as;
});
// Previews and find over the same trees.
const ro = (o?: Parameters<typeof roRules>[1]) => roRules((r) => (r.target?.container.id === ATLAS.id ? ATLAS_TREE : OTHER_TREE), o);
const nameOf = (r: FixtureRequest) => W.computers.find((c) => c.id === r.target?.container.id)?.name ?? '?';
const folders = (fn: Answer): FixtureRule[] => [rootRoute, folderRoute].map((rt) => reply(rt, (r: FixtureRequest) => {
  seen.push(`${nameOf(r)}:${pathOf(r)}`);
  // The real top-folder op answers the HTML file manager unless asked ?json: no listing without it.
  if (rt === rootRoute && r.query.json !== '') return answers.refused(404, 'NOT_FOUND');
  return fn(r, pathOf(r));
}));

// The change routes, on atlas's live tree. Two names act out the hard cases: 'lost' applies the change and loses the
// answer (it may have gone through), 'busy' is refused before anything changes (409 FILE_PATH_BUSY).
const split = (path: string) => { const i = path.lastIndexOf('/'); return [path.slice(0, i) || '/', path.slice(i + 1)] as const; };
const has = (n: Node | undefined, name: string) => !!n && (n.dir.includes(name) || !!n.files?.some((f) => f[0] === name));
const drop = (n: Node, name: string) => { n.dir = n.dir.filter((x) => x !== name); if (n.files) n.files = n.files.filter((f) => f[0] !== name); };
/** Tests only: every change request that reached the fixtures, as `<kind>:<path>`. */
export const sentChanges: string[] = [];
const changes = (r: FixtureRequest, kind: 'mkdir' | 'rename' | 'delete'): FixtureAnswer => {
  sentChanges.push(`${kind}:${pathOf(r)}`);
  if (r.target?.container.id !== ATLAS.id) return answers.refused(403, 'FORBIDDEN');
  const path = pathOf(r);
  const [parent, name] = split(path);
  const n = live[parent];
  if (!n) return answers.refused(404, 'NOT_FOUND');
  const to = kind === 'rename' ? String((r.body as { name?: unknown } | undefined)?.name ?? '') : name;
  if (to === 'busy' || name === 'busy') return answers.refused(409, 'FILE_PATH_BUSY');
  if (kind === 'mkdir') {
    if (n.files?.some((f) => f[0] === name)) return answers.refused(409, 'PATH_CONFLICT');
    if (!n.dir.includes(name)) { n.dir.push(name); live[path] = { dir: [] }; }
    if (to === 'lost') { lostIn = parent; return answers.lost(); }
    return { status: 201, body: { message: 'Directory created' } };
  }
  if (!has(n, name)) return answers.refused(404, 'NOT_FOUND');
  if (kind === 'rename') {
    if (has(n, to)) return { status: 409, body: { error: 'A file with that name already exists' } };
    const file = n.files?.find((f) => f[0] === name);
    if (file) file[0] = to; else { n.dir = n.dir.map((x) => (x === name ? to : x)); live[parent === '/' ? '/' + to : parent + '/' + to] = live[path] ?? { dir: [] }; delete live[path]; }
    if (to === 'lost') { lostIn = parent; return answers.lost(); }
    return answers.ok({ message: 'Renamed' });
  }
  drop(n, name);
  for (const k of Object.keys(live)) if (k === path || k.startsWith(path + '/')) delete live[k];
  return name === 'lost' ? answers.lost() : answers.ok({ message: 'Deleted' });
};
// ── Copy and move on atlas's live tree, and the SHA-256 read ──────────────────────────────────────────
// A file's bytes are named by a content id: its path when it was first listed, carried along by a copy or a move.
const contents = new Map<string, string>();
const contentOf = (path: string) => contents.get(path) ?? `orig:${path}`;
const hex = (s: string) => { let h = 0x811c9dc5; let out = ''; for (let k = 0; k < 8; k++) { for (const ch of s + k) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0; out += h.toString(16).padStart(8, '0'); } return out; };
/** /srv/app acts as another filesystem: a move into or out of it is refused (409 FILE_MOVE_CROSSES_DEVICES). */
const OTHER_FS = '/srv/app';
const underFs = (p: string) => p === OTHER_FS || p.startsWith(OTHER_FS + '/');
/** ok: applied and answered; lost: applied, answer lost; none: NOT applied, answer lost; slow: answered after 60 s;
 *  becameFolder: a copied FILE had become a folder (22 entries the program cannot copy): copied whole, answered
 *  200 with them skipped; becameFolderCut: the same folder copy stopped part way (409 COPY_INCOMPLETE). */
type TransferMode = 'ok' | 'odd' | 'lost' | 'none' | 'slow' | 'becameFolder' | 'becameFolderCut' | 'folderCut' | 'folderCutLost' | 'secondLost' | 'firstSlow' | 'slowShort' | 'cutFirst' | 'cutFirstLost';
/** Copies and moves answered so far (state secondLost loses the second one's answer). */
let transfers = 0;
/** The destination folder of the last unapplied send: state transferNoneFlaky fails its next read once. */
let failOnce: string | null = null;
function subtree(from: string, to: string, move: boolean) {
  for (const k of Object.keys(live).filter((k) => k === from || k.startsWith(from + '/'))) {
    live[to + k.slice(from.length)] = clone({ x: live[k]! }).x!;
    if (move) delete live[k];
  }
  for (const [k, n] of Object.entries(live)) {
    if (!(k === to || k.startsWith(to + '/'))) continue;
    const was = from + k.slice(to.length);
    for (const [name] of n.files ?? []) { const fp = at(k, name); if (!contents.has(fp)) contents.set(fp, contentOf(at(was, name))); }
  }
  for (const [k, v] of [...contents]) if (k.startsWith(from + '/')) { contents.set(to + k.slice(from.length), v); if (move) contents.delete(k); }
}
const transferAnswer = (r: FixtureRequest, kind: 'copy' | 'move', m: TransferMode): FixtureAnswer => {
  // secondLost: the second copy or move is applied and its answer lost; every other one answers.
  // firstSlow: the first one answers after 1.5 s (a run can be stopped while it is out); the others answer at once.
  // cutFirst: the first copy is cut part way (409 COPY_INCOMPLETE), the others go; cutFirstLost: and
  // the second one's answer is lost (applied).
  const nth = m === 'secondLost' || m === 'firstSlow' || m === 'cutFirst' || m === 'cutFirstLost' ? ++transfers : 0;
  const mode: TransferMode = m === 'secondLost' ? (nth === 2 ? 'lost' : 'ok') : m === 'firstSlow' ? (nth === 1 ? 'slowShort' : 'ok')
    : m === 'cutFirst' ? (nth === 1 ? 'folderCut' : 'ok') : m === 'cutFirstLost' ? (nth === 1 ? 'folderCut' : nth === 2 ? 'lost' : 'ok') : m;
  const path = pathOf(r);
  const dest = String((kind === 'copy' ? r.query.copy_to : r.query.move_to) ?? '');
  sentChanges.push(`${kind}:${path}>${dest}`);
  if (r.target?.container.id !== ATLAS.id) return answers.refused(403, 'FORBIDDEN');
  const [parent, name] = split(path);
  const [dParent, dName] = split(dest);
  const n = live[parent];
  if (!n || !has(n, name)) return answers.refused(404, 'NOT_FOUND');
  if (dName === 'busy') return answers.refused(409, 'FILE_PATH_BUSY');
  const dn = live[dParent] ?? (live[dParent] = { dir: [] });
  if (has(dn, dName)) return answers.refused(409, 'DESTINATION_EXISTS');
  const isDir = n.dir.includes(name);
  if (isDir && (dest === path || dest.startsWith(path + '/'))) return answers.refused(400, 'INVALID_PARAMETER');
  if (kind === 'move' && underFs(path) !== underFs(dest)) return answers.refused(409, 'FILE_MOVE_CROSSES_DEVICES');
  if (mode === 'none') { failOnce = dParent; return answers.lost(); }
  if ((mode === 'becameFolder' || mode === 'becameFolderCut') && kind === 'copy' && !n.dir.includes(name)) {
    drop(n, name);
    n.dir.push(name);
    live[path] = { dir: [], files: [['a.txt', 1]] };
    dn.dir.push(dName);
    live[dest] = { dir: [], files: mode === 'becameFolder' ? [['a.txt', 1]] : [] };
    if (mode === 'becameFolderCut') return answers.refused(409, 'COPY_INCOMPLETE');
    const skipped = [{ path: `${dest}/pipe`, reason: 'not a regular file (fifo)' }, { path: `${dest}/out`, reason: 'outside the serve root' },
      ...Array.from({ length: 19 }, (_, k) => ({ path: `${dest}/odd-${k + 1}`, reason: 'permission denied' }))];
    // 22 left out, 21 listed (the program lists fewer than it counts once its list is full): 20 shown, "and 2 more".
    return answers.ok({ success: true, source: path, destination: dest, skipped_count: 22, skipped });
  }
  const file = n.files?.find((f) => f[0] === name);
  if (kind === 'move') {
    const was = listing(parent, n).entries.find((e) => e.name === name)?.modified;
    if (was !== undefined) kept.set(dest, was);
  }
  // A folder copy cut part way: the top folder and its first file only; COPY_INCOMPLETE, or the answer lost.
  if (isDir && kind === 'copy' && (mode === 'folderCut' || mode === 'folderCutLost')) {
    dn.dir.push(dName);
    const first = live[path]?.files?.[0];
    live[dest] = { dir: [], files: first ? [[...first] as [string, number]] : [] };
    if (first) contents.set(at(dest, first[0]), contentOf(at(path, first[0])));
    return mode === 'folderCut' ? answers.refused(409, 'COPY_INCOMPLETE') : answers.lost();
  }
  if (isDir) {
    dn.dir.push(dName);
    subtree(path, dest, kind === 'move');
    if (kind === 'move') n.dir = n.dir.filter((x) => x !== name);
    // A copy leaves pipes and sockets out and names them; links are copied as links.
    const left = kind === 'copy' ? Object.keys(live).filter((k) => k === dest || k.startsWith(dest + '/')).flatMap((k) => { const sp = live[k]!.special ?? []; delete live[k]!.special; return sp.map((x) => at(path + k.slice(dest.length), x)); }) : [];
    if (left.length) {
      const body = { success: true, source: path, destination: dest, skipped: left.map((p) => ({ path: p, reason: 'not a regular file (pipe, socket or device)' })), skipped_count: left.length };
      return mode === 'ok' ? answers.ok(body) : answers.lost();
    }
  } else if (file) {
    (dn.files ??= []).push([dName, file[1]]);
    contents.set(dest, contentOf(path));
    if (kind === 'move') { drop(n, name); contents.delete(path); }
  }
  const body = { success: true, source: path, destination: dest, ...(kind === 'copy' ? { skipped: [], skipped_count: 0 } : {}) };
  if (mode === 'slow') return answers.slow(body, 60_000);
  if (mode === 'slowShort') return answers.slow(body, 1_500);
  // odd: applied, and the success answer names another destination (it proves nothing about this copy).
  if (mode === 'odd') return answers.ok({ ...body, destination: `${dest}-other` });
  if (mode !== 'ok') return answers.lost();
  return answers.ok(body);
};
function hashAnswer(r: FixtureRequest): FixtureAnswer {
  const path = pathOf(r);
  const [parent, name] = split(path);
  const t = r.target?.container.id === ATLAS.id ? live : OTHER_TREE;
  const file = t[parent]?.files?.find((f) => f[0] === name);
  if (!file) return t[parent]?.dir.includes(name) ? answers.refused(400, 'BAD_REQUEST') : answers.refused(404, 'NOT_FOUND');
  return answers.ok({ hash: (t === live ? hashOf.get(path) : undefined) ?? hex(contentOf(path)), algorithm: 'sha256' });
}
/** Tests only: a cut folder copy that kept going finishes now: the rest of `from` lands in `to`. */
export function finishCopy(from: string, to: string): void { subtree(from, to, false); }
/** Tests only: an item of atlas's live tree is removed by someone else (its folder too, with everything under it). */
export function removeItem(path: string): void {
  const [parent, name] = split(path);
  drop(live[parent]!, name);
  for (const k of Object.keys(live)) if (k === path || k.startsWith(path + '/')) delete live[k];
}
/** Tests only: put a link and a pipe in a folder of atlas's live tree. */
export function addOdd(path: string, links: string[], special: string[]): void { const n = live[path]!; n.links = [...(n.links ?? []), ...links]; n.special = [...(n.special ?? []), ...special]; }
const transferRules = (mode: TransferMode, hashSlow = false): FixtureRule[] => [
  reply(copyRoute, (r: FixtureRequest) => transferAnswer(r, 'copy', mode)),
  reply(moveRoute, (r: FixtureRequest) => transferAnswer(r, 'move', mode)),
  reply(hashRoute, (r: FixtureRequest) => holding(r, () => (hashSlow ? answers.slow(hashAnswer(r).body, 60_000) : hashAnswer(r)))),
];
/** Tests only: while on, every SHA-256 read waits until the test answers it. release() answers
 *  every read open now except those `hang` names (they wait for answer(path)); a path `fail` names answers 502. Counted: `open`
 *  now, `total` asked, `asked` in order, `aborted` in order, `peakSince(i)` (a request its caller cancelled leaves `open`: transport.ts hands
 *  a fixture fetch its signal), and `peakOf(k)` the most open at once while the first k were asked (no k: all). */
interface HashHold { open: { path: string; go: () => void }[]; atAsk: number[]; asked: string[]; aborted: string[]; hang: (path: string) => boolean; fail: (path: string) => boolean }
let hashHold: HashHold | null = null;
export function holdHashReads(o: { hang?: (path: string) => boolean; fail?: (path: string) => boolean } = {}) {
  const n: HashHold = { open: [], atAsk: [], asked: [], aborted: [], hang: o.hang ?? (() => false), fail: o.fail ?? (() => false) };
  hashHold = n;
  return {
    open: () => n.open.length,
    total: () => n.asked.length,
    asked: (): readonly string[] => [...n.asked],
    aborted: (): readonly string[] => [...n.aborted],
    peakOf: (k?: number) => Math.max(0, ...n.atAsk.slice(0, k)),
    /** The most open at once while the reads from index `i` on were asked. */
    peakSince: (i: number) => Math.max(0, ...n.atAsk.slice(i)),
    release: () => { const now = n.open.filter((x) => !n.hang(x.path)); n.open = n.open.filter((x) => n.hang(x.path)); for (const x of now) x.go(); return now.length; },
    /** Answers the reads of `path` open now, even one `hang` names (a stalled read answering late). */
    answer: (path: string) => { const now = n.open.filter((x) => x.path === path); n.open = n.open.filter((x) => x.path !== path); for (const x of now) x.go(); return now.length; },
  };
}
function holding(r: FixtureRequest, answer: () => FixtureAnswer): FixtureAnswer | Promise<FixtureAnswer> {
  const n = hashHold;
  if (!n) return answer();
  const path = pathOf(r);
  n.asked.push(path);
  return new Promise((resolve) => {
    const entry = { path, go: () => resolve(n.fail(path) ? answers.pending5xx(502) : answer()) };
    n.open.push(entry);
    n.atAsk.push(n.open.length);
    // A cancelled request is not out any more: it leaves `open` (the transport then rejects it as aborted).
    r.signal?.addEventListener('abort', () => { const i = n.open.indexOf(entry); if (i >= 0) { n.open.splice(i, 1); n.aborted.push(path); entry.go(); } }, { once: true });
  });
}
/** Tests only: change a file's bytes (its content id), as another writer would. */
/** Tests only: a file appears at `path` (another writer), its folder's cached listing left as it was. */
export function addDir(path: string): void { const [p, n] = split(path); const d = live[p]; if (d && !has(d, n)) { (d.dir ??= []).push(n); live[path] ??= { dir: [] }; } }
export function addFile(path: string, size = 1): void { const [p, n] = split(path); const d = live[p]; if (d && !has(d, n)) (d.files ??= []).push([n, size]); }
export function rewriteFile(path: string): void { contents.set(path, `rewritten:${path}:${Math.random()}`); }
/** Tests only: a file of `size` bytes at `path` in atlas's live tree
 *  (new bytes, a new version); its folder is made bare when it is not there. */
export function putFile(path: string, size: number): void {
  const [parent, name] = split(path);
  const n = (live[parent] ??= { dir: [] });
  const f = n.files?.find((x) => x[0] === name);
  if (f) f[1] = size; else (n.files ??= []).push([name, size]);
  contents.set(path, `put:${path}:${size}:${Math.random()}`);
}
/** Tests only: whether atlas's live tree holds a file or folder at `path`. */
export function exists(path: string): boolean { const [parent, name] = split(path); return has(live[parent], name); }
// Archives on atlas's live tree. The listing seeds two archives beside notes.txt in the
// archive states only (the tree the other tests count stays as it is).
const isFile = (path: string) => { const [parent, name] = split(path); return !!live[parent]?.files?.some((f) => f[0] === name); };
const archiveTree = { isFile, exists, addDir: (p: string) => addDir(p), addFile: (p: string, size: number) => addFile(p, size) };
const archives = (mode: ArchiveMode) => archiveRules(archiveTree, mode);
const seedArchives = (r: FixtureRequest, p: string) => {
  if (r.target?.container.id === ATLAS.id && p === '/home/ada') { addFile('/home/ada/site.zip', 4_096); addFile('/home/ada/backup.tar.gz', 9_216); }
  return tree(r, p);
};
/** Tests only: a file's size in atlas's live tree (undefined: no file there). */
export function sizeOf(path: string): number | undefined { const [parent, name] = split(path); return live[parent]?.files?.find((f) => f[0] === name)?.[1]; }

// ── Uploads (a create-only PUT) on atlas's live tree ──────────────────────────────────────────────
/** Tests only: one-shot faults on the next upload whose path includes `match`: 'lost' writes it and loses
 *  the answer, 'none' loses it unwritten, 'error' answers 500 unwritten (outcome unknown), 'refused' 403
 *  ACCESS_FORBIDDEN, 'busy' 409 FILE_PATH_BUSY, 'taken' another writer puts the name first (412), 'slow' answers
 *  after `ms` (a minute by default; written); `before` runs first. */
export interface UploadFault { readonly match: string; readonly mode: 'lost' | 'none' | 'error' | 'refused' | 'busy' | 'taken' | 'slow'; readonly before?: () => void; /** slow: how long (default a minute). */ readonly ms?: number }
export const uploadFaults: UploadFault[] = [];
/** Tests only: the SHA-256 a file of atlas's live tree reads as (the page hashes real bytes; the
 *  fixtures' own content ids are not SHA-256 of anything). */
const hashOf = new Map<string, string>();
export function setHashOf(path: string, sha256: string): void { hashOf.set(path, sha256); }
function uploadAnswer(r: FixtureRequest): FixtureAnswer {
  const path = pathOf(r);
  sentChanges.push(`upload:${path}`);
  if (r.target?.container.id !== ATLAS.id) return answers.refused(403, 'FORBIDDEN');
  const i = uploadFaults.findIndex((f) => path.includes(f.match));
  const fault = i < 0 ? undefined : uploadFaults.splice(i, 1)[0];
  fault?.before?.();
  if (fault?.mode === 'none') return answers.lost();
  if (fault?.mode === 'error') return answers.refused(500, 'INTERNAL_ERROR');
  if (fault?.mode === 'refused') return answers.refused(403, 'ACCESS_FORBIDDEN');
  if (fault?.mode === 'busy') return answers.refused(409, 'FILE_PATH_BUSY');
  const [parent, name] = split(path);
  // As the change routes' names: lost.txt loses its answer unwritten (it may have gone through, and Check again finds
  // it is not there), busy.txt is refused before anything is written.
  if (!fault && name === 'lost.txt') return answers.lost();
  if (!fault && name === 'busy.txt') return answers.refused(409, 'FILE_PATH_BUSY');
  if (fault?.mode === 'taken') putFile(path, 1);
  const n = live[parent];
  if (!n) return answers.refused(404, 'NOT_FOUND');
  if (n.dir.includes(name)) return answers.refused(409, 'PATH_CONFLICT');
  // Create only (If-None-Match: *): a name already there is a failed precondition, nothing written.
  if (n.files?.some((f) => f[0] === name)) return answers.refused(412, 'PRECONDITION_FAILED');
  (n.files ??= []).push([name, r.body instanceof Blob ? r.body.size : 0]);
  contents.set(path, `upload:${path}`);
  const body = { success: true, path };
  if (fault?.mode === 'lost') return answers.lost();
  if (fault?.mode === 'slow') return { status: 201, body, delayMs: fault.ms ?? 60_000 };
  return { status: 201, body };
}

const changeRules: FixtureRule[] = [
  reply(putRoute, (r: FixtureRequest) => uploadAnswer(r)),
  reply(mkdirRoute, (r: FixtureRequest) => changes(r, 'mkdir')),
  reply(renameRoute, (r: FixtureRequest) => changes(r, 'rename')),
  reply(deleteRoute, (r: FixtureRequest) => changes(r, 'delete')),
  reply(realpathRoute, (r: FixtureRequest) => realAnswer(r)),
  reply(mountsRoute, (r: FixtureRequest) => mountsAnswer(r)),
];
function mountsAnswer(r: FixtureRequest) {
  mountsAsked += 1;
  return answers.ok(r.target?.container.id === ATLAS.id ? MOUNTS : { mounts: [] });
}
function realAnswer(r: FixtureRequest) {
  realAsked += 1;
  const p = '/' + pathOf(r).split('/').slice(2).join('/');
  return answers.ok({ path: p, real_path: REAL[p] ?? p });
}
// The planner's second opening: its realpath read never answers in time, while the first opening's answer is cached.
const realSlowAgain: FixtureRule[] = [
  reply(realpathRoute, (r: FixtureRequest) => (realAsked >= 1 ? answers.slow(realAnswer(r).body, 60_000) : realAnswer(r))),
];
const mountsSlowAgain = reply(mountsRoute, (r: FixtureRequest) => (mountsAsked >= 1 ? answers.slow(mountsAnswer(r).body, 60_000) : mountsAnswer(r)));

// A listing over the 16 MiB bound (core reads none of it).
let huge: string | null = null;
const hugeListing = () => {
  huge ??= 'x'.repeat(17 * 1024 * 1024);
  return { path: '/', count: 1, entries: [{ name: huge, is_dir: false, size: 1 }] };
};
// atlas without a server: no files address.
const noServer = reply(containersRoute, () => ({ status: 200, body: { data: { computers: W.computers.map((c) => (c.id === ATLAS.id ? { ...c, server_name: '', server: undefined } : c)) } } }));
// Every computer says it has no access rules (the shared world carries no such field, which reads as not known).
const openRules = reply(containersRoute, () => ({ status: 200, body: { data: { computers: W.computers.map((c) => ({ ...c, has_proxy_permissions: false, proxy_permissions_scope: 'none' })) } } }));
/** openRules with each computer's colour as the API keeps it (core worldColours; cedar's is not a hex colour). */
const colourRules = reply(containersRoute, () => ({ status: 200, body: { data: { computers: W.computers.map((c) => ({ ...c, has_proxy_permissions: false, proxy_permissions_scope: 'none', color: worldColours[c.name] })) } } }));
// atlas whose access rules the API could not check.
const rulesUnknown = reply(containersRoute, () => ({ status: 200, body: { data: { computers: W.computers.map((c) => (c.id === ATLAS.id ? { ...c, has_proxy_permissions: null, proxy_permissions_scope: 'unknown' } : c)) } } }));
// atlas with access rules set.
const withRules = reply(containersRoute, () => ({ status: 200, body: { data: { computers: W.computers.map((c) => (c.id === ATLAS.id ? { ...c, has_proxy_permissions: true, proxy_permissions_scope: 'computer' } : c)) } } }));

/** The ids GET /computers/:id was asked for, in order (byId rules; resetFiles() clears it). */
export const byIdAsked: string[] = [];
/** GET /computers/:id (byId.ts): a world computer by its exact id, as the list shows it, or 404.
 *  After `after` reads, `then` changes every answer: 'gone' answers 404, as for a computer deleted since; 'slow' holds it. */
const byIdRule = (after = Infinity, then: 'gone' | 'slow' = 'gone') => reply(computerRuntimeRoute, (r: FixtureRequest) => {
  const id = /\/computers\/([^/?]+)/.exec(r.path)?.[1] ?? '';
  byIdAsked.push(id);
  const late = byIdAsked.length > after;
  const c = late && then === 'gone' ? undefined : W.computers.find((x) => x.id === id);
  const body = c ? { data: { ...c, has_proxy_permissions: false, proxy_permissions_scope: 'none' } } : null;
  if (late && then === 'slow' && body) return answers.slow(body, 600_000);
  return body ? answers.ok(body) : answers.refused(404, 'NOT_FOUND');
});
const byId = byIdRule();

/** The realm's list read 100 a page, with `before` other computers ahead of the world's. `page2` replaces
 *  page 2's answer (slow, failed). */
/** The pages of GET /computers asked so far, in order (pagedList states; resetFiles() clears it). */
export const listAsked: number[] = [];
/** pagedList: `before` filler computers ahead of the world's. page2 replaces page 2's answer; badRefresh makes every read of
 *  page 1 after the first come back without a list (unreadable); shrinkLater makes every later read of pages 2 on answer as if the
 *  list now ended at page 2 (150 computers). */
function pagedList(before: number, o: { page2?: FixtureAnswer; badRefresh?: boolean; shrinkLater?: boolean } = {}): FixtureRule {
  const filler = Array.from({ length: before }, (_, i) => ({ ...ATLAS, id: `0f0f0f0f0f0f0f0f0f${i.toString(16).padStart(6, '0')}`, name: `box-${String(i + 1).padStart(4, '0')}` }));
  const all = [...filler, ...W.computers].map((c) => ({ ...c, has_proxy_permissions: false, proxy_permissions_scope: 'none' }));
  return reply(containersRoute, (req: FixtureRequest) => {
    const page = Number(req.query.page ?? 1);
    listAsked.push(page);
    if (page === 2 && o.page2) return o.page2;
    if (page === 1 && o.badRefresh && listAsked.filter((n) => n === 1).length > 1) return { status: 200, body: { data: {} } };
    const list = page > 1 && o.shrinkLater && listAsked.filter((n) => n === page).length > 1 ? all.slice(0, 150) : all;
    const rows = list.slice((page - 1) * 100, page * 100);
    return { status: 200, body: { data: { computers: rows, pagination: { total: list.length, page, limit: 100, totalPages: Math.ceil(list.length / 100) } } } };
  });
}

/** Every state answers the Shared folders lists with no share (the Storage tab's section and the delete plan read
 *  them). A state with share rules of its own keeps them: the first rule of a route answers. */
const withShares = <T extends Record<string, readonly FixtureRule[]>>(states: T): T =>
  Object.fromEntries(Object.entries(states).map(([name, rules]) => [name, [...rules, ...shareRules({ shares: [] })]])) as unknown as T;

export default defineFixtures({
  default: 'many',
  states: withShares({
    many: [openRules, byId, ...changeRules, ...transferRules('ok'), ...folders(tree), ...ro(), ...link('ok'), ...storageRules(), ...archives('ok')],
    /** /home/ada holds site.zip and backup.tar.gz; Look inside lists them, Extract here… makes a
     *  new folder (archive.fixtures.ts names each mode). */
    archive: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('ok')],
    archiveReplaced: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('replaced')],
    archiveGated: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('gated')],
    archiveLost: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('lost')],
    archiveOff: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('off')],
    archiveBig: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('big')],
    archiveMalformed: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('malformed')],
    archiveOtherDest: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('otherDest')],
    archiveFailedChanged: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('failedChanged')],
    archiveContradicted: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('contradicted')],
    archiveCapped: [openRules, ...changeRules, ...folders(seedArchives), ...ro(), ...archives('capped')],
    /** many, with each computer's colour: the pane pickers draw each computer's mark. */
    colours: [colourRules, ...changeRules, ...transferRules('ok'), ...folders(tree), ...ro(), ...link('ok'), ...storageRules()],
    /** Download from a link: an older files program (no download_client_id): the action is off. */
    linkOld: [openRules, ...changeRules, ...folders(tree), ...link('old')],
    /** A link download is recorded and its answer lost (it may have been accepted). */
    linkLost: [openRules, ...changeRules, ...folders(tree), ...link('lost')],
    // The computer list of the selected realm only (core's own list rule), as the API answers.
    linkLostScoped: [...changeRules, ...folders(tree), ...link('lost')],
    // A realm without computers, the link program still answering (a held download on a computer elsewhere).
    linkLostEmpty: [reply(containersRoute, answers.ok({ data: { computers: [] } })), ...changeRules, ...folders(tree), ...link('lost')],
    /** A link download's answer is lost and nothing was recorded. */
    linkLostNone: [openRules, ...changeRules, ...folders(tree), ...link('lostNone')],
    /** The computer runs too many downloads twice (429), then accepts. */
    linkBusy: [openRules, ...changeRules, ...folders(tree), ...link('busy')],
    /** The computer always runs too many downloads (429). */
    linkBusyAlways: [openRules, ...changeRules, ...folders(tree), ...link('busyAlways')],
    /** The folder is busy (409 FILE_PATH_BUSY): nothing starts. */
    linkPathBusy: [openRules, ...changeRules, ...folders(tree), ...link('pathBusy')],
    /** A link download is accepted, then fails on the computer. */
    linkFails: [openRules, ...changeRules, ...folders(tree), ...link('fails')],
    /** A link download that keeps running (its progress line and Cancel). */
    linkRunning: [openRules, ...changeRules, ...folders(tree), ...link('running')],
    /** A link download's answer is lost; its record reads only after one 404 (a resend meets DOWNLOAD_ID_EXISTS). */
    linkLostLate: [openRules, ...changeRules, ...folders(tree), ...link('lostLate')],
    /** A link download completes but its file is not in the folder. */
    linkGone: [openRules, ...changeRules, ...folders(tree), ...link('gone')],
    /** A link download's answer is lost (nothing recorded); its resend is refused with 409 FILE_PATH_BUSY. */
    linkLostRefused: [openRules, ...changeRules, ...folders(tree), ...link('lostRefused')],
    /** Every copy and move is applied and its answer lost (it may have gone through). */
    transferLost: [openRules, ...changeRules, ...transferRules('lost'), ...folders(tree)],
    /** Every copy and move is applied; its success answer names another destination (it proves nothing). */
    transferOdd: [openRules, ...changeRules, ...transferRules('odd'), ...folders(tree)],
    /** As transferLost, and SHA-256 reads never answer in time: a lost file copy stays held. */
    transferHeld: [openRules, ...changeRules, ...transferRules('lost', true), ...folders(tree)],
    /** The second copy or move is applied and its answer lost; the others answer (several items). */
    secondLost: [openRules, ...changeRules, ...transferRules('secondLost'), ...folders(tree)],
    /** Every realpath read fails (a gateway error): no move can be judged, so none is sent. */
    realFails: [openRules, reply(realpathRoute, answers.pending5xx(502)), ...changeRules, ...transferRules('ok'), ...folders(tree)],
    /** /home/ada/projects/site never answers in time: a walk of projects stays reading. */
    siteSlow: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => (p === '/home/ada/projects/site' && r.target?.container.id === ATLAS.id
      ? answers.slow(tree(r, p).body, 60_000)
      : tree(r, p)))],
    /** The first copy or move answers after 1.5 s, the others at once (several items: Stop after this one). */
    firstSlow: [openRules, ...changeRules, ...transferRules('firstSlow'), ...folders(tree)],
    /** Every copy and move takes a minute to answer (it is being sent). */
    transferSlow: [openRules, ...changeRules, ...transferRules('slow'), ...folders(tree)],
    /** Every copy and move is NOT applied and its answer lost: the read-back proves it was not made. */
    transferNone: [openRules, ...changeRules, ...transferRules('none'), ...folders(tree)],
    /** A file copied here had become a folder by the time the copy ran: copied whole, 22 items left out. */
    copyBecameFolder: [openRules, ...changeRules, ...transferRules('becameFolder'), ...folders(tree)],
    /** A folder copy stops part way (409 COPY_INCOMPLETE): its top folder and first file only. */
    folderCut: [openRules, ...changeRules, ...transferRules('folderCut'), ...folders(tree)],
    /** Copy the rest: the first copy is cut as folderCut; every later copy goes. */
    folderCutFirst: [openRules, ...changeRules, ...transferRules('cutFirst'), ...folders(tree)],
    /** As folderCutFirst, and the second copy (the first item of the rest) is applied with its answer lost. */
    folderCutFirstLost: [openRules, ...changeRules, ...transferRules('cutFirstLost'), ...folders(tree)],
    /** The same cut copy, and its answer lost. */
    folderCutLost: [openRules, ...changeRules, ...transferRules('folderCutLost'), ...folders(tree)],
    /** An older files program: its folder listings carry no entry types (a folder copy cannot be checked). */
    oldFiles: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => {
      const n = (r.target?.container.id === ATLAS.id ? live : OTHER_TREE)[p];
      return p !== '/' && n ? answers.ok(oldListing(p, n)) : tree(r, p);
    })],
    /** /home/ada/projects holds 2,001 files: too big to copy from the Hub in one go. */
    bigFolder: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => (p === '/home/ada/projects' && r.target?.container.id === ATLAS.id
      ? answers.ok(listing(p, { dir: ['site'], files: Array.from({ length: 2000 }, (_, i) => [`f${i}.txt`, 1] as [string, number]) }))
      : tree(r, p)))],
    /** /home/ada/projects/site answers its first read, then never in time (a reopened copy dialog must read it again). */
    siteSlowAgain: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => (p === '/home/ada/projects/site' && r.target?.container.id === ATLAS.id && siteAsked++ >= 1
      ? answers.slow(tree(r, p).body, 60_000)
      : tree(r, p)))],
    /** Every read of /home/ada/projects/site fails (a gateway error). */
    siteFails: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => (p === '/home/ada/projects/site' && r.target?.container.id === ATLAS.id
      ? answers.pending5xx(502)
      : tree(r, p)))],
    /** As copyBecameFolder, and the folder copy stopped part way (409 COPY_INCOMPLETE). */
    copyBecameFolderCut: [openRules, ...changeRules, ...transferRules('becameFolderCut'), ...folders(tree)],
    /** As transferNone, and the first re-read of the destination folder fails: it stays held until Check again. */
    transferNoneFlaky: [openRules, ...changeRules, ...transferRules('none'), ...folders((r, p) => {
      if (failOnce !== null && p === failOnce) { failOnce = null; return answers.pending5xx(502); }
      return tree(r, p);
    })],
    /** /tmp already holds a notes.txt: a copy of /home/ada/notes.txt there goes under the Keep-both name. */
    copyTaken: [openRules, ...changeRules, ...transferRules('ok'), ...folders((r, p) => {
      const t = live['/tmp']!;
      if (p === '/tmp' && !t.files?.some(([n]) => n === 'notes.txt')) t.files = [...(t.files ?? []), ['notes.txt', 980]];
      return tree(r, p);
    })],
    /** The delete planner's realpath answers once, then never in time (a reopened planner must not use the cache). */
    realSlowAgain: [openRules, ...realSlowAgain, ...changeRules, ...folders(tree)],
    /** The same for the storage list. */
    mountsSlowAgain: [openRules, mountsSlowAgain, ...changeRules, ...folders(tree)],
    /** Thumbnails answer something that is no picture. */
    thumbsBroken: [openRules, ...folders(tree), ...ro({ thumbs: 'broken' })],
    /** Thumbnails answer a picture (a 1×1 GIF): an image's preview shows it. */
    thumbsOn: [openRules, ...folders(tree), ...ro({ thumbs: 'on' })],
    /** Search is off on the files program (403). */
    /** atlas holds /api/v1, a path the files program's viewer reads as its own address: a file there downloads and
     *  previews, but does not open in the viewer or editor. */
    apiFolder: [openRules, ...folders((r, p) => (r.target?.container.id === ATLAS.id && API_TREE[p]
      ? answers.ok(listing(p, API_TREE[p]!))
      : tree(r, p))), ...roRules((r) => (r.target?.container.id === ATLAS.id ? { ...ATLAS_TREE, ...API_TREE } : OTHER_TREE))],
    findOff: [openRules, ...folders(tree), ...ro({ find: 'off' })],
    /** Search fails (a gateway error). */
    findDown: [openRules, ...folders(tree), ...ro({ find: 'down' })],
    /** Every folder read fails (a gateway error). */
    error: folders(() => answers.pending5xx(502)),
    /** Nothing answers a folder read. */
    unreachable: folders(() => answers.lost()),
    /** Folder reads never answer in time. */
    loading: folders((r, p) => answers.slow(tree(r, p).body, 60_000)),
    /** The proxy refuses the Hub (401). */
    access: folders(() => answers.refused(401, 'UNAUTHORIZED')),
    /** atlas has access rules and they refuse the Hub (403). */
    rules: [withRules, ...folders(() => answers.refused(403, 'FORBIDDEN'))],
    /** A token session that may read but not change (no computers.actions.exec). */
    tokenRead: [fixtureSession({ kind: 'token', caps: ['computers.read'] }), ...changeRules, ...folders(tree)],
    /** The open storages cannot be read: folder deletes are refused, file deletes typed. */
    /** A change's answer is lost and the folder's re-read never answers in time: the change stays held, its line in
     *  the band (the list keeps what it showed). */
    heldSlow: [openRules, ...changeRules, ...folders((r, p) => (lostIn !== null && p === lostIn ? answers.slow(tree(r, p).body, 60_000) : tree(r, p)))],
    mountsDown: [reply(mountsRoute, answers.refused(500, 'SERVER_ERROR')), ...changeRules, ...folders(tree)],
    /** The program answers with a page that is not JSON. */
    notJson: folders(() => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>proxy</html>' })),
    /** atlas's access rules are not known, and the folder is refused (403). */
    rulesUnknown: [rulesUnknown, ...folders(() => answers.refused(403, 'FORBIDDEN'))],
    /** A listing whose one entry cannot be read (is_dir is not a boolean). */
    badEntry: folders(() => answers.ok({ path: '/', count: 1, entries: [{ name: 'exists.txt', is_dir: 'false', size: 3 }] })),
    /** The top folder holds items the Hub cannot show (a pipe, an empty name): the rest shows, with a note. */
    rootOdd: [openRules, ...folders((r, p) => (p === '/' && r.target?.container.id === ATLAS.id
      ? answers.ok({ ...rootListing(ATLAS_TREE['/']!), paths: [...rootListing(ATLAS_TREE['/']!).paths, { path_type: 'Fifo', name: 'pipe', mtime: T0 * 1000, size: 0 }, { path_type: 'File', name: '', mtime: T0 * 1000, size: 0 }] })
      : tree(r, p)))],
    /** The top folder holds only an item the Hub cannot show. */
    rootHiddenOnly: [openRules, ...folders((r, p) => (p === '/' && r.target?.container.id === ATLAS.id
      ? answers.ok({ ...rootListing({ dir: [] }), paths: [{ path_type: 'Fifo', name: 'pipe', mtime: T0 * 1000, size: 0 }] })
      : tree(r, p)))],
    /** The program answers with something that is not a listing. */
    notListing: folders(() => answers.ok({ path: '/' })),
    /** The listing is bigger than the route reads. */
    tooBig: folders(() => answers.ok(hugeListing())),
    /** atlas has no files address yet. */
    noAddress: [noServer, ...folders(tree)],
    /** The realm has no computer. */
    none: [reply(containersRoute, answers.ok({ data: { computers: [] } })), ...folders(tree)],
    /** The computer list cannot be read. */
    listError: [reply(containersRoute, answers.refused(500, 'SERVER_ERROR')), ...folders(tree)],
    /** 140 other computers come first, so atlas and the rest are on page 2 of the list. */
    pages: [pagedList(140), ...folders(tree), ...ro()],
    /** As pages, with page 2 slow to answer: a link to a computer there is not known yet. */
    pagesSlow: [pagedList(140, { page2: { delayMs: 600_000 } }), ...folders(tree), ...ro()],
    /** As pages, with page 2 failing. */
    pagesFailed: [pagedList(140, { page2: { status: 500, body: { error: 'SERVER_ERROR' } } }), ...folders(tree), ...ro()],
    /** More computers than Files reads: atlas and the rest are past the last page Files reads. */
    pagesCapped: [pagedList(1_000), byId, ...folders(tree), ...ro()],
    /** As pagesCapped, with atlas deleted after its first read by id: every later GET /computers/:id answers 404. */
    pagesCappedGone: [pagedList(1_000), byIdRule(1), ...folders(tree), ...ro()],
    /** As pagesCapped, with every read by id after the first held unanswered. */
    pagesCappedSlow: [pagedList(1_000), byIdRule(1, 'slow'), ...folders(tree), ...ro()],
    /** As pagesCapped, with the first read by id already held unanswered. */
    pagesCappedHeld: [pagedList(1_000), byIdRule(0, 'slow'), ...folders(tree), ...ro()],
    /** Two computers named atlas whose ids end alike, so both have the handle atlas.00a1. */
    twins: [reply(containersRoute, () => ({ status: 200, body: { data: { computers: [...W.computers, { ...ATLAS, id: 'f' + ATLAS.id.slice(1) }].map((c) => ({ ...c, has_proxy_permissions: false, proxy_permissions_scope: 'none' })) } } })), ...folders(tree), ...ro()],
    /** atlas on page 3; every refresh of page 1 comes back unreadable (rows already shown stay, the list reads as failed). */
    pagesBadRefresh: [pagedList(210, { badRefresh: true }), ...folders(tree), ...ro()],
    /** As pagesBadRefresh, and the refreshed later pages now end the list at page 2 (atlas no longer on any page read): the rows
     *  shown stay until a whole readable walk replaces them. */
    pagesBadShrink: [pagedList(210, { badRefresh: true, shrinkLater: true }), ...folders(tree), ...ro()],
    /** As many, with storage shares between atlas and cedar, one in each state and one the other way
     *  (shares/fixtures.ts); every other state has none (withShares). */
    shares: [openRules, byId, ...changeRules, ...folders(tree), ...ro(), ...storageRules(), ...shareRules()],
    /** As shares, but the answer to every change of a share is lost unapplied: the change is held ("may have gone
     *  through") and Check again proves nothing. */
    sharesHeld: [openRules, byId, ...changeRules, ...folders(tree), ...ro(), ...storageRules(), ...shareRules({ create: 'lost', change: 'lost', stop: 'lost' })],
  }),
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  resetFiles();
  findAsked.n = 0;
}
