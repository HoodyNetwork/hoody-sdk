// Fake files-program answers for Download from a link, spread into ../fixtures.ts's states. A link download
// is recorded under the Hub's id and runs for one read of its record ('running': for ever), then completes and saves its file into the
// folder (through `save`, which ../fixtures.ts wires to its live tree; a taken name gets -1, -2 … as the program does).
// Modes act out the hard cases: an older program (no download_client_id), a lost answer (recorded or not), a busy
// computer (429 a few times), a busy folder (409 FILE_PATH_BUSY), a download that fails on the computer, a lost answer
// whose record shows only after the first read by id ('lostLate'), a completed download whose file is not there ('gone'),
// a lost answer, nothing recorded, whose resend is refused (409 FILE_PATH_BUSY: 'lostRefused').
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { downloadRoute, downloadsRoute, cancelRoute, linkRoute, versionRoute } from './routes';

export type LinkMode = 'ok' | 'old' | 'lost' | 'lostNone' | 'busy' | 'busyAlways' | 'pathBusy' | 'fails' | 'slow' | 'running' | 'lostLate' | 'gone' | 'lostRefused';
/** Saves a finished download's file; answers the name it was saved as. */
export type Save = (computer: string, folder: string, name: string, size: number) => string;

interface Rec { id: string; computer: string; folder: string; filename: string; status: 'downloading' | 'completed' | 'failed' | 'cancelled'; reads: number; saved?: string; hidden?: number }
const recs = new Map<string, Rec>();
/** Tests only: every link download request that reached the fixtures (`<id>` per send, resends included). */
export const linkSends: string[] = [];
/** Tests only: every cancel that reached the fixtures (`<id>`). */
export const linkCancels: string[] = [];
/** Tests only: the list of running downloads answers this many reads, then fails (Infinity: never fails). */
let listOk = Infinity;
export function failDownloadsListAfter(n: number): void { listOk = n; }
/** Tests only: the next Cancel is applied but its answer is lost. */
let cancelLost = false;
export function loseNextCancelAnswer(): void { cancelLost = true; }
/** Tests only: this many reads of a record by id fail (503). */
let recordFails = 0;
export function failRecordReads(n: number): void { recordFails = n; }
export function resetLinks(): void { recs.clear(); linkSends.length = 0; linkCancels.length = 0; listOk = Infinity; cancelLost = false; recordFails = 0; }

const SIZE = 52_428_800;
const folderOf = (r: FixtureRequest): string => '/' + (r.path.split('?')[0] ?? '').split('/').slice(4).filter(Boolean).map(decodeURIComponent).join('/');
const recordBody = (x: Rec) => {
  const done = Math.min(x.reads, 3) || 1;
  return {
    id: x.id, status: x.status, filename: x.saved ?? x.filename, directory: x.folder, file_path: `${x.folder}/${x.saved ?? x.filename}`,
    start_time: 1_761_200_000, ...(x.status === 'downloading' ? { current_size: (SIZE / 4) * done, expected_size: SIZE, progress_percentage: 25 * done } : {}),
    ...(x.status === 'completed' ? { file_size: SIZE, end_time: 1_761_200_090, sha256: 'ab'.repeat(32) } : {}),
    url: 'https://downloads.example/file?token=SECRET', error_message: x.status === 'failed' ? 'GET https://downloads.example/file?token=SECRET: 500' : null,
  };
};

export function linkRules(mode: LinkMode, save: Save): FixtureRule[] {
  const feature = mode === 'old' ? ['put_chmod'] : ['put_chmod', 'download_client_id', 'listing_manifest'];
  return [
    reply(versionRoute, () => answers.ok({ version: '1.9.0', features: feature })),
    reply(linkRoute, (r: FixtureRequest) => {
      const id = r.query.id ?? '';
      linkSends.push(id);
      if (mode === 'pathBusy' || (mode === 'lostRefused' && r.n > 1)) return answers.refused(409, 'FILE_PATH_BUSY');
      if (mode === 'lostRefused') return answers.lost();
      if (mode === 'busyAlways' || (mode === 'busy' && r.n <= 2)) return answers.refused(429, 'JOB_COUNT_LIMIT');
      if (recs.has(id)) return answers.refused(409, 'DOWNLOAD_ID_EXISTS');
      if (mode === 'lostNone') return answers.lost();
      recs.set(id, { id, computer: r.target?.container.id ?? '', folder: folderOf(r), filename: r.query.filename ?? 'download', status: 'downloading', reads: 0, ...(mode === 'lostLate' ? { hidden: 1 } : {}) });
      if (mode === 'lost' || mode === 'lostLate') return answers.lost();
      return { status: 202, body: { success: true, message: 'Download accepted', download_id: id, status: 'downloading' }, delayMs: mode === 'slow' ? 60_000 : undefined };
    }),
    reply(downloadRoute, (r: FixtureRequest) => {
      const id = decodeURIComponent((r.path.split('?')[0] ?? '').split('/').at(-1) ?? '');
      const x = recs.get(id);
      if (recordFails > 0) { recordFails -= 1; return answers.refused(503, 'UNAVAILABLE'); }
      if (!x) return answers.refused(404, 'NOT_FOUND');
      if (x.hidden) { x.hidden -= 1; return answers.refused(404, 'NOT_FOUND'); }
      x.reads += 1;
      if (x.status === 'downloading' && x.reads > 1 && mode !== 'running') {
        if (mode === 'fails') x.status = 'failed';
        else { x.status = 'completed'; if (mode !== 'gone') x.saved = save(x.computer, x.folder, x.filename, SIZE); }
      }
      return answers.ok(recordBody(x));
    }),
    reply(cancelRoute, (r: FixtureRequest) => {
      const id = decodeURIComponent((r.path.split('?')[0] ?? '').split('/').at(-1) ?? '');
      const x = recs.get(id);
      linkCancels.push(id);
      if (!x || x.status !== 'downloading') return answers.refused(404, 'NOT_FOUND');
      x.status = 'cancelled';
      if (cancelLost) { cancelLost = false; return answers.lost(); }
      return { status: 202, body: { success: true, message: 'Download cancelled', id } };
    }),
    reply(downloadsRoute, (r: FixtureRequest) => (listOk-- <= 0 ? answers.refused(503, 'UNAVAILABLE') : answers.ok({
      // As the program's list: running and completed downloads (failed and cancelled ones leave it).
      downloads: [...recs.values()].filter((x) => (x.status === 'downloading' || x.status === 'completed') && x.computer === r.target?.container.id).map(recordBody),
    }))),
  ];
}
