import { hostUnderFamily, stringOrEmpty as str } from '@core';
import { nameIn, type FreshFolder } from '../logic';

// Download from a link: the pure rules. No React, no I/O.
//
// Contract, in plain words:
//   - linkProblem(raw, programDomain): why a pasted link is refused before anything is sent, or null. Only an
//     absolute http(s) link with a host goes ('scheme'). A link to a Hoody computer's own programs (its host is under
//     the platform's program domain or its `computers`/`containers` twin) is refused ('computer'): copies between computers have their own way, and this
//     keeps cross-realm copies out. No program domain known refuses too ('unknown'): the link cannot be told
//     apart from a computer's. Nothing here keeps or shows the link.
//   - defaultName(raw): the name the Hub sends as `filename` unless the person edits it: the link's last path part,
//     decoded, else 'download' (the program's own fallback would use the host). A part that is not a
//     usable name (empty, '.', '..', a slash or backslash, a control character, over 255 characters) gives 'download'.
//   - recordOf(raw): a download record (GET /api/v1/downloads/{id}, or a row of GET /api/v1/downloads) as the page
//     uses it: id, status, file name, folder, sizes, progress, times. Never its `url` or `error_message` (they quote
//     the link and the program's text). null when it is not a record (no id, an unknown status).
//   - hasLinkFeature(raw): GET /api/v1/version lists `download_client_id`: the program takes the Hub's id.
//   - verdictOf(err): what a refused or lost send means, from core's rejection: 'accepted' never comes from here;
//     'arrived' (409 DOWNLOAD_ID_EXISTS: a download with this id exists, so the send reached the computer), 'busy'
//     (429 JOB_COUNT_LIMIT: nothing recorded, resent with the same id after a wait), 'refused' (a refusal made
//     before any effect: unsent by core, 400, 403, 404, 409 FILE_PATH_BUSY, 413), or 'unknown' (anything else, no
//     answer included: it may have gone through). "Refusals prove nothing changed only by code and phase".
//   - savedStateOf(listed, name): a completed download, its folder read now: done when the folder shows the file,
//     missing when a whole listing does not (or a folder has the name), unchecked when the read failed or the listing
//     is not whole (it leaves entries out, or is the top folder's).
//   - Retention: a download's id is remembered 7 days on the computer; the Hub never resends a hold older than
//     RESEND_MAX_MS (6 days), and says so.
export type LinkProblem = 'scheme' | 'computer' | 'unknown';

export function linkProblem(raw: string, programDomain: string): LinkProblem | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'scheme'; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return 'scheme';
  const d = programDomain.trim().toLowerCase().replace(/\.+$/, '');
  if (!d) return 'unknown';
  // The program domain or its family twin (`computers.x` and `containers.x`): a link on either family is a computer's.
  return hostUnderFamily(u.hostname, d) ? 'computer' : null;
}

const BAD_NAME = /[/\\\u0000-\u001f\u007f]/;
/** A name the program can save as given: not empty, not '.' or '..', no slash, backslash or control character. */
export const usableName = (n: string): boolean => n.length > 0 && n.length <= 255 && n !== '.' && n !== '..' && n.trim() === n && !BAD_NAME.test(n);

export function defaultName(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'download'; }
  const last = u.pathname.split('/').filter(Boolean).at(-1) ?? '';
  let name = '';
  try { name = decodeURIComponent(last); } catch { name = last; }
  return usableName(name) ? name : 'download';
}

export type LinkStatus = 'downloading' | 'completed' | 'failed' | 'cancelled';
export interface LinkRecord {
  readonly id: string;
  readonly status: LinkStatus;
  /** The name the download created (or asked for, when it created none). */
  readonly filename: string;
  /** The folder it downloads into, as the program names it. */
  readonly directory: string;
  readonly fileSize: number | null;
  readonly current: number | null;
  readonly expected: number | null;
  readonly percent: number | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

const STATUSES: ReadonlySet<string> = new Set(['downloading', 'completed', 'failed', 'cancelled']);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function recordOf(raw: unknown): LinkRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  // A row of GET /api/v1/downloads may carry no status, or 'starting': it is running.
  const status = r.status === undefined || r.status === 'starting' ? 'downloading' : str(r.status);
  if (!id || !STATUSES.has(status)) return null;
  const pct = num(r.progress_percentage);
  return {
    id, status: status as LinkStatus, filename: str(r.filename), directory: str(r.directory),
    fileSize: num(r.file_size), current: num(r.current_size), expected: num(r.expected_size),
    percent: pct === null ? null : Math.min(100, pct),
    startedAt: num(r.start_time), endedAt: num(r.end_time),
  };
}

/** The rows of GET /api/v1/downloads; a body without its list is not an answer (throws, read as an error). */
export function recordsOf(raw: unknown): readonly LinkRecord[] {
  const rows = raw && typeof raw === 'object' ? (raw as { downloads?: unknown }).downloads : undefined;
  if (!Array.isArray(rows)) throw new Error('NOT_A_LIST');
  return rows.map(recordOf).filter((x): x is LinkRecord => x !== null);
}

export function hasLinkFeature(raw: unknown): boolean {
  const f = raw && typeof raw === 'object' ? (raw as { features?: unknown }).features : undefined;
  return Array.isArray(f) && f.includes('download_client_id');
}

export type SendVerdict = 'arrived' | 'busy' | 'refused' | 'unknown';
/** Answers that refuse before any effect, on a first send. */
const REFUSED_STATUS: ReadonlySet<number> = new Set([400, 403, 404, 413]);

export function verdictOf(err: unknown): SendVerdict {
  const e = (err && typeof err === 'object' ? err : {}) as { kind?: unknown; status?: unknown; code?: unknown };
  if (e.kind === 'not_sent') return 'refused';
  if (e.kind === 'pending' || e.kind === 'stale') return 'unknown';
  const status = typeof e.status === 'number' ? e.status : 0;
  const code = typeof e.code === 'string' ? e.code : '';
  if (status === 409 && code === 'DOWNLOAD_ID_EXISTS') return 'arrived';
  if (status === 429) return 'busy';
  if (REFUSED_STATUS.has(status)) return 'refused';
  if (status === 409 && code === 'FILE_PATH_BUSY') return 'refused';
  return 'unknown';
}

/** The program keeps a download's id 7 days; the Hub resends a held one only within 6. */
export const RESEND_MAX_MS = 6 * 24 * 60 * 60 * 1000;
/** The download's own limit on the computer (12 h): the Hub asks for all of it. */
export const LINK_TIMEOUT_S = 12 * 60 * 60;
/** 429 resends: same id, after these waits; then the person is told. */
export const BUSY_WAITS_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000, 60_000];

export function savedStateOf(listed: FreshFolder | 'failed', name: string): 'done' | 'missing' | 'unchecked' {
  if (listed === 'failed') return 'unchecked';
  const e = nameIn(listed, name);
  return e === 'unknown' ? 'unchecked' : e === 'absent' || e.dir ? 'missing' : 'done';
}
