// The Files page's requests, declared once: folder listings from each computer's files program (kit 'files', port 1,
// the address Computers shows as Files): reads, then the changes (below).
// Each route takes the item as one multi-part path (core's `*parts`), which core writes and checks
// (core/files-path.ts encodePathParts): a first part the files program would read as a command (stat, copy, its
// health check ...) goes with its first letter as %XX right after /api/v1/files. A listing may be large: the byte
// bound is 16 MiB; past it core reads nothing.
import { defineRoute } from '@core';

const kit = { scope: 'kit', kit: 'files', index: 1 } as const;
export const LIST_BYTES = 16 * 1024 * 1024;

/** The computer's top folder `/`: the files program's listRootDirectory (GET /?json); the bare files path is no
 *  operation (404). routes.test.ts pins every route here to a documented operation. */
export const rootRoute = defineRoute({ method: 'GET', path: '/', ...kit, query: ['json'], maxBytes: LIST_BYTES });
/** Lists a folder below the top (at least one part). */
export const folderRoute = defineRoute({ method: 'GET', path: '/api/v1/files/*parts', ...kit, maxBytes: LIST_BYTES });

// ── The changes on one computer, and the reads that check them ────────────────────────────────
// A change is never at `/`, so these take at least one part. The files program takes no idempotency key: core's C9
// lock (held changes + read-back) keeps a change from being sent twice.
const AT = '/api/v1/files/*parts';
/** mkdirRoute: POST ?mkdir makes the folder (201 also when one is already there). */
export const mkdirRoute = defineRoute({ method: 'POST', path: AT, ...kit, query: ['mkdir'] });
/** renameRoute: PATCH {name} renames in the same folder. */
export const renameRoute = defineRoute({ method: 'PATCH', path: AT, ...kit, body: ['name'] });
/** deleteRoute: DELETE, recursive for a folder. A large one runs long, and a cut answer only loses the
 *  outcome (the delete goes on, on the computer), so it gets 6 h (the edge allows 24 h). */
export const DELETE_TIMEOUT_MS = 6 * 60 * 60 * 1000;
export const deleteRoute = defineRoute({ method: 'DELETE', path: AT, ...kit, timeoutMs: DELETE_TIMEOUT_MS });
/** realpathRoute: the resolved path (the kit's `realpath` alias segment), so a link is judged at its target. */
export const realpathRoute = defineRoute({ method: 'GET', path: '/api/v1/files/realpath/*parts', ...kit });
/** The computer's open storages and PC shares: no folder holding one is deleted. */
export const mountsRoute = defineRoute({ method: 'GET', path: '/api/v1/mounts', ...kit });

// ── Copy / Move to the other side on one computer, and the read that checks a copy ─────────────────
// The destination is a whole path in the query (the files program reads it form-decoded; core encodes it). Both run
// as long as their tree takes, and a cut answer only loses the outcome, so both get 6 h.
/** copyRoute: POST ?copy_to=<path> copies the item; create-only (409 DESTINATION_EXISTS when
 *  the name is taken). A folder copy that stopped after it had copied something answers 409 COPY_INCOMPLETE: that
 *  one may have gone through in part, never a refusal. */
export const copyRoute = defineRoute({ method: 'POST', path: AT, ...kit, query: ['copy_to'], timeoutMs: DELETE_TIMEOUT_MS, unknownCodes: ['COPY_INCOMPLETE'] });
/** moveRoute: POST ?move_to=<path>, one rename: refuses a taken name (409 DESTINATION_EXISTS) and another
 *  filesystem (409 FILE_MOVE_CROSSES_DEVICES) before it changes anything. */
export const moveRoute = defineRoute({ method: 'POST', path: AT, ...kit, query: ['move_to'], timeoutMs: DELETE_TIMEOUT_MS });
/** hashRoute: GET ?hash, the file's SHA-256 ({hash, algorithm}): a copy whose answer was lost is done when
 *  both files hash the same, read now. A big file takes as long as its bytes take to read. */
export const hashRoute = defineRoute({ method: 'GET', path: AT, ...kit, query: ['hash'], timeoutMs: DELETE_TIMEOUT_MS });

// ── Upload ───────────────────────────────────────────────────
/** putRoute: PUT the picked file as the file (putFile), only through core sendFile: one body,
 *  sent once by the transfer worker, If-None-Match: * (create only) and X-Expected-Length. A large file takes as long
 *  as its bytes take, and a cut answer only loses the outcome, so it gets 6 h. */
export const putRoute = defineRoute({ method: 'PUT', path: AT, ...kit, file: true, timeoutMs: DELETE_TIMEOUT_MS });

// ── look inside an archive, extract it into a new folder ─────────────────────────
/** archiveListRoute: GET ?preview, the archive listed whole ({format, total_files, total_size,
 *  entries}; no paging, 400 past 500 MB or 1 M entries). Bounded like a folder listing. */
export const archiveListRoute = defineRoute({ method: 'GET', path: AT, ...kit, query: ['preview'], maxBytes: LIST_BYTES });
/** extractRoute: POST ?extract&dest=<name>, the whole archive into a new folder beside it. It answers when
 *  the run ends and the run goes on if the answer is cut, so it gets 6 h like copy. The
 *  program merges into a folder that exists: the send reads the folder fresh first (data.ts). */
export const extractRoute = defineRoute({ method: 'POST', path: AT, ...kit, query: ['extract', 'dest'], timeoutMs: DELETE_TIMEOUT_MS });
/** Finished extractions (getExtractionHistory), read only for its status: 403 exactly where extract is off, the read
 *  that says so before anything is sent. */
export const extractHistoryRoute = defineRoute({ method: 'GET', path: '/', ...kit, query: ['extraction_history'] });
