// Fake files-program answers for archives, spread into fixtures.ts's states. An archive's listing
// is made up from its name (one folder, two files, and a link the program would skip; a tar also lists its own top
// folder as an empty path, its folder without a trailing slash, and a name holding a direction override); an extract
// adds the new folder and its files to the live tree through `tree`, and its run to the running list and then the
// history, as the program does (the page reads neither for a result: they name no client attempt; a page that did
// would be wrong). Each mode acts out one case the page must say plainly:
//   ok           the folder is made; 201 with nothing replaced.
//   replaced     a folder of that name appeared between the Hub's read and the run: 201 with 2 files replaced.
//   gated        as replaced, but each answer waits until the test opens `extractGate` (a run still going while the
//                person moves on).
//   lost         the folder is made and the run completes; the answer is lost.
//   off          extract is off on the program: the history read and the send answer 403.
//   big          the archive is too big to list (400).
//   malformed    the folder is made and the run completes; the success answer has no extraction id.
//   otherDest    a success answer naming another folder.
//   failedChanged  a folder made in between; the run fails part-way and answers 422 naming 1 file added and 1 replaced.
//   contradicted   the run writes the folder, then the answer is a 422 that says success true beside an error.
//   capped       a success answer with 1500 extracted, 1200 of them replaced, and 1500 skipped; 1000 of each named.
import { answers, defineRoute, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { archiveListRoute, extractHistoryRoute, extractRoute } from './routes';

export type ArchiveMode = 'ok' | 'replaced' | 'gated' | 'lost' | 'off' | 'big' | 'malformed' | 'otherDest' | 'failedChanged' | 'contradicted' | 'capped';

/** What the rules need of the live tree. */
export interface ArchiveTree {
  readonly isFile: (path: string) => boolean;
  readonly exists: (path: string) => boolean;
  readonly addDir: (path: string) => void;
  readonly addFile: (path: string, size: number) => void;
}

// The program's running list (listApiActiveExtractions), which the page does not call.
const runningRoute = defineRoute({ method: 'GET', path: '/api/v1/extractions', scope: 'kit', kit: 'files', index: 1 });
type Row = { id: string; archive_path: string; dest_path: string; extracted_files: number; extracted_bytes: number; status: string; start_time: number; selective: boolean; selective_path: null };
const history: Row[] = [];
const running: Row[] = [];
let ids = 0;
/** Tests only: every extract that reached the fixtures, as `<archive> -> <dest>`. */
export const extractsSent: string[] = [];
let opened: () => void = () => {};
let gate: Promise<void> = Promise.resolve();
const shut = () => { gate = new Promise<void>((res) => { opened = res; }); };
/** Tests only (mode gated): open() lets every waiting answer go; close() makes the next ones wait again. */
export const extractGate = { open: () => opened(), close: shut };
export function resetArchives(): void { ids = 0; extractsSent.length = 0; history.length = 0; running.length = 0; shut(); }

const pathOf = (r: FixtureRequest): string => '/' + (r.path.split('?')[0] ?? '').split('/').slice(4).filter(Boolean).map(decodeURIComponent).join('/');
const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
const T0 = 1_761_200_000;

const listing = (path: string) => {
  const base = (path.slice(path.lastIndexOf('/') + 1).replace(/\.(tar\.(gz|bz2|xz)|zip|tar|tgz|tbz2?|txz)$/i, '')) || 'x';
  const format = /\.zip$/i.test(path) ? 'zip' : /\.(tar\.gz|tgz)$/i.test(path) ? 'tar.gz' : /\.(tar\.bz2|tbz2?)$/i.test(path) ? 'tar.bz2' : /\.(tar\.xz|txz)$/i.test(path) ? 'tar.xz' : 'tar';
  if (format === 'zip') {
    return {
      format, total_files: 4, total_size: 1_536, total_compressed_size: 900,
      entries: [
        { path: `${base}/`, is_dir: true, entry_type: 'directory', size: 0, modified_time: T0 },
        { path: `${base}/index.html`, is_dir: false, entry_type: 'file', size: 1_024, modified_time: T0 },
        { path: `${base}/README.md`, is_dir: false, entry_type: 'file', size: 512, modified_time: T0 },
        { path: `${base}/latest`, is_dir: false, entry_type: 'symlink', size: 0, modified_time: T0 },
      ],
    };
  }
  // A tar: its `./` top folder normalized to '', a folder header without a trailing slash, a fifo.
  return {
    format, total_files: 6, total_size: 1_536, total_compressed_size: null,
    entries: [
      { path: '', is_dir: true, entry_type: 'directory', size: 0, modified_time: T0 },
      { path: base, is_dir: true, entry_type: 'directory', size: 0, modified_time: T0 },
      { path: `${base}/index.html`, is_dir: false, entry_type: 'file', size: 1_024, modified_time: T0 },
      { path: `${base}/report\u202Efdp.exe`, is_dir: false, entry_type: 'file', size: 512, modified_time: T0 },
      { path: `${base}/latest`, is_dir: false, entry_type: 'symlink', size: 0, modified_time: T0 },
      { path: `${base}/pipe`, is_dir: false, entry_type: 'Fifo', size: 0, modified_time: T0 },
    ],
  };
};

export function archiveRules(tree: ArchiveTree, mode: ArchiveMode = 'ok'): FixtureRule[] {
  const list = (r: FixtureRequest): FixtureAnswer => {
    const p = pathOf(r);
    if (!tree.isFile(p)) return answers.refused(404, 'NOT_FOUND');
    if (mode === 'big') return answers.refused(400, 'ARCHIVE_TOO_LARGE');
    return answers.ok(listing(p));
  };
  const make = (dest: string, files: number) => {
    tree.addDir(dest);
    for (const n of ['index.html', 'README.md'].slice(0, files)) tree.addFile(`${dest}/${n}`, n === 'index.html' ? 1_024 : 512);
  };
  const extract = async (r: FixtureRequest): Promise<FixtureAnswer> => {
    const archive = pathOf(r);
    const name = String(r.query.dest ?? '');
    const dest = `${parentOf(archive)}/${name}`.replace(/^\/\//, '/');
    extractsSent.push(`${archive} -> ${dest}`);
    if (mode === 'off') return answers.refused(403, 'ACCESS_FORBIDDEN');
    if (!tree.isFile(archive)) return answers.refused(404, 'NOT_FOUND');
    const id = `x${++ids}`;
    const row: Row = { id, archive_path: archive, dest_path: dest, extracted_files: 0, extracted_bytes: 0, status: 'extracting', start_time: Math.floor(Date.now() / 1000), selective: false, selective_path: null };
    // As the program: the run leaves the running list, then its row is written to the history.
    const end = (status: string, files: number) => { running.splice(running.indexOf(row), 1); history.unshift({ ...row, status, extracted_files: files }); };
    running.push(row);
    if (mode === 'otherDest') { end('completed', 2); return { status: 201, body: { success: true, extracted_files: 2, extracted_bytes: 1_536, destination: `${parentOf(archive)}/elsewhere`, extraction_id: id, skipped: [], skipped_count: 0, replaced: [], replaced_count: 0 } }; }
    if (mode === 'failedChanged') {
      make(dest, 1);
      end('failed', 1);
      return { status: 422, body: { success: false, error: 'Corrupted archive', extraction_id: id, skipped: [], skipped_count: 0, replaced: [`${dest}/index.html`], replaced_count: 1, created: [`${dest}/README.md`], created_count: 1 } };
    }
    if (mode === 'contradicted') {
      make(dest, 2);
      end('failed', 2);
      return { status: 422, body: { success: true, error: 'Corrupted archive' } };
    }
    if (mode === 'gated') await gate;
    const replaced = mode === 'replaced' || mode === 'gated' ? [`${dest}/index.html`, `${dest}/README.md`] : [];
    make(dest, 2);
    end('completed', 2);
    if (mode === 'lost') return answers.lost();
    if (mode === 'capped') {
      const named = (n: number) => Array.from({ length: 1_000 }, (_, i) => `${dest}/f${i}.${n}`);
      return { status: 201, body: { success: true, extracted_files: 1_500, extracted_bytes: 1_536, destination: dest, extraction_id: id, skipped: named(1).map((p) => ({ path: p, reason: 'duplicate path in the archive' })), skipped_count: 1_500, replaced: named(2), replaced_count: 1_200 } };
    }
    const skipped = [{ path: 'latest', reason: 'symbolic link (links are not extracted)' }];
    const body = { success: true, extracted_files: 2, extracted_bytes: 1_536, destination: dest, extraction_id: id, skipped, skipped_count: 1, replaced, replaced_count: replaced.length };
    if (mode === 'malformed') { const { extraction_id: _drop, ...rest } = body; return { status: 201, body: rest }; }
    return { status: 201, body };
  };
  const hist = (): FixtureAnswer => (mode === 'off' ? answers.refused(403, 'ACCESS_FORBIDDEN') : answers.ok({ history: history.map((r) => ({ ...r })) }));
  const runs = (): FixtureAnswer => (mode === 'off' ? answers.refused(403, 'ACCESS_FORBIDDEN') : answers.ok({ extractions: running.map((r) => ({ ...r })) }));
  return [
    reply(archiveListRoute, list),
    reply(extractRoute, extract),
    reply(extractHistoryRoute, hist),
    reply(runningRoute, runs),
  ];
}
